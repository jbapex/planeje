-- Operational repair only; preserves history and official task fields.
BEGIN;

-- Owner consultations have independent origins; only execution followups are unique per task.
DROP INDEX public.atlas_team_one_active_task;
CREATE UNIQUE INDEX atlas_team_one_active_task ON public.atlas_team_threads(owner_id,task_id)
 WHERE task_id IS NOT NULL AND state<>'closed' AND (origin_job_id IS NULL OR management_kind='followup');

CREATE OR REPLACE FUNCTION private.atlas_manager_open(p_finding uuid,p_owner_only boolean DEFAULT false) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE f public.atlas_event_findings;account uuid;thread uuid;kind text;body text;title text;source text;current_thread public.atlas_team_threads;signature text;candidate uuid;
BEGIN
 SELECT * INTO f FROM public.atlas_event_findings WHERE id=p_finding FOR UPDATE;
 IF NOT coalesce(private.atlas_manager_live(f.owner_id),false) OR NOT EXISTS(SELECT 1 FROM public.atlas_event_config WHERE owner_id=f.owner_id AND f.client_id=ANY(client_ids))
 OR private.atlas_event_client(f.conversation_id) IS DISTINCT FROM f.client_id OR f.route='none' OR f.state IN('closed','no_action') THEN RETURN NULL;END IF;
 signature:=md5(jsonb_build_object('summary',f.summary,'intent',f.intent,'task_id',f.task_id)::text);
 IF f.thread_id IS NOT NULL THEN
  SELECT * INTO current_thread FROM public.atlas_team_threads WHERE id=f.thread_id FOR UPDATE;
  IF current_thread.management_kind IS NULL THEN RETURN f.thread_id;END IF;
  -- Upgrade an unchanged legacy signature without sending another question.
  IF current_thread.management_data->'finding_versions'->>f.id::text=md5(jsonb_build_object('summary',f.summary,'question',f.question,'intent',f.intent,'task_id',f.task_id)::text)
  OR NOT coalesce(current_thread.management_data->'finding_schemas','{}') ? f.id::text AND f.intent<>'cancellation' AND current_thread.task_id IS NOT DISTINCT FROM f.task_id
  AND EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(current_thread.management_data->'findings','[]')) item WHERE item->>'id'=f.id::text AND item->>'summary'=f.summary) THEN
   current_thread.management_data:=current_thread.management_data||jsonb_build_object('finding_versions',coalesce(current_thread.management_data->'finding_versions','{}')||jsonb_build_object(f.id::text,signature),'finding_schemas',coalesce(current_thread.management_data->'finding_schemas','{}')||jsonb_build_object(f.id::text,2));
   UPDATE public.atlas_team_threads SET management_data=current_thread.management_data WHERE id=current_thread.id;
  END IF;
  IF current_thread.state<>'closed' THEN
   IF current_thread.management_data->'finding_versions'->>f.id::text IS DISTINCT FROM signature THEN
    IF current_thread.management_kind='owner_context' AND coalesce((current_thread.management_data->>'needs_account')::boolean,false) THEN
     UPDATE public.atlas_team_threads SET management_data=jsonb_set(management_data,'{finding_versions}',coalesce(management_data->'finding_versions','{}')||jsonb_build_object(f.id::text,signature)),revision=revision+1,updated_at=now() WHERE id=current_thread.id;
    ELSIF NOT p_owner_only AND current_thread.state NOT IN('needs_owner','delivery_review') AND private.atlas_manager_work(now(),f.owner_id,current_thread.account_person_id)<=now() THEN
     UPDATE public.atlas_team_threads SET current_person_id=account_person_id,state='awaiting_reply',next_review_at=private.atlas_manager_work(now()+interval '1 hour',owner_id,account_person_id),management_data=management_data||jsonb_build_object('finding_versions',coalesce(management_data->'finding_versions','{}')||jsonb_build_object(f.id::text,signature),'finding_schemas',coalesce(management_data->'finding_schemas','{}')||jsonb_build_object(f.id::text,2),'findings',(SELECT coalesce(jsonb_agg(CASE WHEN item->>'id'=f.id::text THEN jsonb_build_object('id',f.id,'title',f.title,'summary',f.summary) ELSE item END),'[]') FROM jsonb_array_elements(coalesce(management_data->'findings','[]')) item)),revision=revision+1,updated_at=now() WHERE id=current_thread.id;
     INSERT INTO public.atlas_team_messages(thread_id,role,content) VALUES(current_thread.id,'atlas','O cliente trouxe mais um ponto sobre isso: '||left(f.summary,1600)||' Muda alguma coisa no trabalho que estamos acompanhando?');
    ELSE RETURN f.thread_id;END IF;
   END IF;
   UPDATE public.atlas_event_findings SET state='account_contacted' WHERE id=f.id;RETURN f.thread_id;
  END IF;
  UPDATE public.atlas_event_findings SET thread_id=NULL,state='observed',revision=revision+1 WHERE id=f.id RETURNING * INTO f;
 END IF;
 account:=private.atlas_manager_account(f.owner_id,f.client_id);
 kind:=CASE WHEN account IS NULL OR f.intent='cancellation' THEN 'owner_context' ELSE 'intake' END;
 IF p_owner_only AND kind<>'owner_context' THEN RETURN NULL;END IF;
 IF NOT p_owner_only AND private.atlas_manager_work(now(),f.owner_id,coalesce(account,f.owner_id))>now() THEN RETURN NULL;END IF;
 account:=CASE WHEN kind='owner_context' THEN f.owner_id ELSE account END;
 candidate:=f.task_id;
 IF kind='owner_context' AND private.atlas_manager_account(f.owner_id,f.client_id) IS NULL THEN candidate:=NULL;END IF;
 IF EXISTS(SELECT 1 FROM public.tarefas x JOIN public.task_statuses s ON s.value=x.status AND s.is_terminal WHERE x.id=candidate) THEN candidate:=NULL;END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('atlas-manager:'||f.owner_id::text||f.client_id::text,0));
 SELECT t.id INTO thread FROM public.atlas_team_threads t WHERE t.owner_id=f.owner_id AND t.client_id=f.client_id AND t.task_id IS NOT DISTINCT FROM candidate AND t.management_kind=kind AND t.state<>'closed' FOR UPDATE;
 SELECT c.empresa INTO title FROM public.clientes c WHERE c.id=f.client_id AND c.etapa='closed';
 SELECT coalesce(string_agg(left(m->>'body',1000),E'\n' ORDER BY m->>'created_at'),'') INTO source
 FROM public.atlas_event_jobs j CROSS JOIN LATERAL jsonb_array_elements(j.input->'messages') m WHERE j.id=f.job_id AND f.sources ? (m->>'id');
 IF source='' THEN RETURN NULL;END IF;
 IF thread IS NULL THEN
  body:=CASE WHEN kind='owner_context' AND private.atlas_manager_account(f.owner_id,f.client_id) IS NULL THEN
   'Preciso de você num ponto da '||title||': quem cuida dessa conta por aqui? Me fala o nome ou escolhe abaixo. Vou guardar e seguir com essa pessoa no expediente.'
   WHEN kind='owner_context' THEN 'Preciso da sua ajuda com uma decisão da '||title||'. '||left(f.summary,1500)
   ELSE 'Oi, '||(SELECT split_part(full_name,' ',1) FROM public.profiles WHERE id=account)||'! Aqui é o Atlas. Chegou um pedido da '||title||': '||left(f.summary,1500)||E'\nConsegue me contar o que precisamos fazer e quem pode cuidar disso? Se já tiver tarefa aberta para esse pedido, me fala qual é para seguirmos nela.' END;
  INSERT INTO public.atlas_team_threads(owner_id,client_id,task_id,account_person_id,current_person_id,title,shared_context,source_key,next_review_at,management_kind,management_data)
  VALUES(f.owner_id,f.client_id,candidate,account,account,left('['||title||'] Alinhar pedidos recebidos',200),jsonb_build_object('text',left(source,3500),'label','Pedido identificado no grupo; esclarecer antes da tarefa','at',now()),'manager-finding:'||f.id||':'||kind||':'||f.revision,private.atlas_manager_work(now()+interval '1 hour',f.owner_id,account),kind,jsonb_build_object('finding_ids',jsonb_build_array(f.id),'finding_versions',jsonb_build_object(f.id::text,signature),'finding_schemas',jsonb_build_object(f.id::text,2),'findings',jsonb_build_array(jsonb_build_object('id',f.id,'title',f.title,'summary',f.summary)),'needs_account',private.atlas_manager_account(f.owner_id,f.client_id) IS NULL)) RETURNING id INTO thread;
  INSERT INTO public.atlas_team_messages(thread_id,role,content) VALUES(thread,'atlas',body);
 ELSE
  UPDATE public.atlas_team_threads SET management_data=management_data||jsonb_build_object('finding_ids',coalesce(management_data->'finding_ids','[]')||jsonb_build_array(f.id),'finding_versions',coalesce(management_data->'finding_versions','{}')||jsonb_build_object(f.id::text,signature),'finding_schemas',coalesce(management_data->'finding_schemas','{}')||jsonb_build_object(f.id::text,2),'findings',coalesce(management_data->'findings','[]')||jsonb_build_array(jsonb_build_object('id',f.id,'title',f.title,'summary',f.summary))),revision=revision+1,updated_at=now() WHERE id=thread;
  IF kind<>'owner_context' OR private.atlas_manager_account(f.owner_id,f.client_id) IS NOT NULL THEN INSERT INTO public.atlas_team_messages(thread_id,role,content) VALUES(thread,'atlas','Tem mais um pedido desse cliente para vermos por aqui: '||left(f.summary,1500));END IF;
 END IF;
 UPDATE public.atlas_event_findings SET thread_id=thread,account_id=account,state='account_contacted',revision=revision+1,updated_at=now() WHERE id=f.id;
 RETURN thread;
END $$;

-- A name authorizes a question only when the account unambiguously wrote it.
CREATE FUNCTION private.atlas_manager_named_executor(p_text text,p_owner uuid) RETURNS uuid
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 WITH words AS(SELECT btrim(regexp_replace(translate(lower(p_text),'áàâãäéèêëíìîïóòôõöúùûüç','aaaaaeeeeiiiiooooouuuuc'),'[^[:alnum:]_]+',' ','g')) body),
 candidates AS(SELECT p.id FROM public.profiles p CROSS JOIN words w WHERE p.status='active' AND p.role IN('admin','superadmin','colaborador') AND p.id<>p_owner
 AND p_text NOT LIKE '%?%' AND w.body !~ '(^| )(nao|talvez|acho|duvida)( |$)'
 AND char_length(split_part(p.full_name,' ',1))>=3
 AND position(' '||translate(lower(split_part(p.full_name,' ',1)),'áàâãäéèêëíìîïóòôõöúùûüç','aaaaaeeeeiiiiooooouuuuc')||' ' IN ' '||w.body||' ')>0
 AND (w.body IN(translate(lower(p.full_name),'áàâãäéèêëíìîïóòôõöúùûüç','aaaaaeeeeiiiiooooouuuuc'),translate(lower(split_part(p.full_name,' ',1)),'áàâãäéèêëíìîïóòôõöúùûüç','aaaaaeeeeiiiiooooouuuuc')) OR w.body ~ '(^| )(e|sera|ser|cuida|responsavel|define|defina|prefiro|pode)( |$)'))
 SELECT CASE WHEN count(*)=1 THEN min(id::text)::uuid END FROM candidates;
$$;
REVOKE ALL ON FUNCTION private.atlas_manager_named_executor(text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.atlas_manager_named_executor(text,uuid) TO service_role;

-- Boolean membership proof avoids recursively selecting RLS-protected threads.
CREATE FUNCTION private.atlas_followup_contact(p_thread uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.atlas_team_threads t
 JOIN public.atlas_team_requests r ON r.id=nullif(t.management_data->>'contact_request_id','')::uuid AND r.thread_id=t.id AND r.actor_id=t.account_person_id AND r.state='completed' AND r.applied
 JOIN public.tarefas x ON x.id=t.task_id AND x.client_id=t.client_id
 JOIN public.clientes cl ON cl.id=t.client_id AND cl.etapa='closed'
 JOIN public.profiles p ON p.id=t.current_person_id AND p.status='active' AND p.role IN('admin','superadmin','colaborador')
 JOIN public.atlas_event_config cfg ON cfg.owner_id=t.owner_id AND t.client_id=ANY(cfg.client_ids)
 WHERE t.id=p_thread AND t.management_kind='followup' AND private.atlas_manager_live(t.owner_id)
 AND t.account_person_id=private.atlas_manager_account(t.owner_id,t.client_id)
 AND r.result->>'contact_person_id'=t.current_person_id::text
 AND r.result->'contact_assignee_ids'=to_jsonb(x.assignee_ids)
 AND (auth.uid() IN(t.owner_id,t.account_person_id,t.current_person_id) OR auth.role()='service_role'));
$$;
REVOKE ALL ON FUNCTION private.atlas_followup_contact(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.atlas_followup_contact(uuid) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION private.atlas_consult_current(p_thread uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.atlas_team_threads t JOIN public.atlas_jobs j ON j.id=t.origin_job_id
 JOIN public.atlas_conversations c ON c.id=j.conversation_id AND c.owner_id=j.owner_id
 JOIN public.clientes cl ON cl.id=t.client_id AND cl.etapa='closed'
 JOIN public.profiles p ON p.id=t.current_person_id AND p.status='active' AND p.role IN('admin','superadmin','colaborador')
 JOIN public.atlas_event_config cfg ON cfg.owner_id=j.owner_id AND t.client_id=ANY(cfg.client_ids)
 WHERE t.id=p_thread AND j.owner_id=t.owner_id AND j.status IN('running','waiting_team','completed')
 AND (j.client_id IS NULL OR j.client_id=t.client_id) AND (c.client_id IS NULL OR c.client_id=t.client_id)
 AND (t.task_id IS NULL OR EXISTS(SELECT 1 FROM public.tarefas x WHERE x.id=t.task_id AND x.client_id=t.client_id))
 AND (EXISTS(SELECT 1 FROM auth.sessions WHERE id=j.source_session_id AND user_id=j.owner_id) OR t.management_kind='followup' AND t.management_data->>'consult_organized'='true')
 AND private.atlas_manager_live(t.owner_id)
 AND t.account_person_id=coalesce(private.atlas_manager_account(t.owner_id,t.client_id),t.current_person_id)
 AND (t.management_data->>'recipient_basis'='account' AND t.current_person_id=private.atlas_manager_account(t.owner_id,t.client_id)
  OR t.management_kind='followup' AND t.management_data->>'consult_organized'='true' AND private.atlas_followup_contact(t.id)
  OR t.management_data->>'recipient_basis'='explicit'
  OR t.current_person_id=private.atlas_manager_account(t.owner_id,t.client_id)
  OR t.management_data->>'recipient_basis'='assignee' AND EXISTS(SELECT 1 FROM public.tarefas x WHERE x.id=t.task_id AND x.client_id=t.client_id AND t.current_person_id=ANY(x.assignee_ids))));
$$;
REVOKE ALL ON FUNCTION private.atlas_consult_current(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.atlas_consult_current(uuid) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION private.atlas_team_member(t public.atlas_team_threads) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT private.atlas_team_human() AND CASE WHEN t.origin_job_id IS NOT NULL THEN
  auth.uid()=t.owner_id OR private.atlas_consult_current(t.id) AND auth.uid() IN(t.current_person_id,t.account_person_id)
 ELSE auth.uid() IN(t.owner_id,t.account_person_id) OR EXISTS(SELECT 1 FROM public.tarefas x WHERE x.id=t.task_id AND x.client_id=t.client_id AND auth.uid()=ANY(x.assignee_ids))
 OR (auth.uid()=t.current_person_id AND private.atlas_followup_contact(t.id)) END;
$$;

CREATE FUNCTION private.atlas_team_merge_usage(p_before jsonb,p_next jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT coalesce(p_next,'{}')||jsonb_build_object(
 'total_tokens',coalesce((p_before->>'total_tokens')::bigint,0)+coalesce((p_next->>'total_tokens')::bigint,0),
 'prompt_tokens',coalesce((p_before->>'prompt_tokens')::bigint,0)+coalesce((p_next->>'prompt_tokens')::bigint,0),
 'completion_tokens',coalesce((p_before->>'completion_tokens')::bigint,0)+coalesce((p_next->>'completion_tokens')::bigint,0));
$$;
REVOKE ALL ON FUNCTION private.atlas_team_merge_usage(jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.atlas_team_merge_usage(jsonb,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.atlas_manager_reconcile() RETURNS integer
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE own uuid;task public.tarefas;account uuid;recipient uuid;people uuid[];thread uuid;source text;body text;opened integer:=0;horizon date;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'Acesso exclusivo do worker.' USING ERRCODE='42501';END IF;
 SELECT owner_id INTO own FROM public.atlas_settings WHERE id='atlas' AND enabled;
 IF own IS NULL OR NOT coalesce(private.atlas_manager_live(own),false) OR private.atlas_manager_work(now(),own,own)>now() THEN RETURN 0;END IF;
 horizon:=(private.atlas_manager_work(now()+interval '1 day',own,own) AT TIME ZONE 'America/Sao_Paulo')::date;
 FOR task IN SELECT x.* FROM public.tarefas x JOIN public.atlas_event_config cfg ON cfg.owner_id=own AND x.client_id=ANY(cfg.client_ids)
 JOIN public.clientes c ON c.id=x.client_id AND c.etapa='closed' LEFT JOIN public.task_statuses s ON s.value=x.status
 WHERE NOT coalesce(s.is_terminal,false) AND (x.due_date IS NULL OR x.due_date<=horizon OR x.stage_due_at<(horizon+1)::timestamp AT TIME ZONE 'America/Sao_Paulo')
 ORDER BY x.due_date NULLS FIRST,x.created_at,x.id LOOP
  PERFORM pg_advisory_xact_lock(hashtextextended('atlas-manager-followup:'||own::text||task.id::text,0));
  IF EXISTS(SELECT 1 FROM public.atlas_team_threads WHERE owner_id=own AND task_id=task.id AND state<>'closed' AND (origin_job_id IS NULL OR management_kind='followup')) THEN CONTINUE;END IF;
  account:=private.atlas_manager_account(own,task.client_id);thread:=NULL;
  IF account IS NULL THEN
   IF EXISTS(SELECT 1 FROM public.atlas_team_threads WHERE owner_id=own AND client_id=task.client_id AND management_kind='owner_context' AND state<>'closed') THEN CONTINUE;END IF;
   INSERT INTO public.atlas_team_threads(owner_id,client_id,account_person_id,current_person_id,title,shared_context,source_key,management_kind,management_data,next_review_at)
   VALUES(own,task.client_id,own,own,'Quem cuida desta conta?',jsonb_build_object('label','Conta interna ausente','text','Definir o responsável interno para acompanhar as tarefas existentes.'),'manager-missing-account:'||task.client_id,'owner_context','{"needs_account":true}',private.atlas_manager_work(now()+interval '1 hour',own,own)) ON CONFLICT DO NOTHING RETURNING id INTO thread;
   IF thread IS NOT NULL THEN INSERT INTO public.atlas_team_messages(thread_id,role,content) VALUES(thread,'atlas','Preciso confirmar quem cuida desta conta por aqui. Me fala o nome ou escolhe a pessoa para eu acompanhar as tarefas com ela.');opened:=opened+1;END IF;
   CONTINUE;
  END IF;
  SELECT array_agg(p.id ORDER BY p.id) INTO people FROM public.profiles p WHERE p.id=ANY(task.assignee_ids) AND p.id<>own AND p.status='active' AND p.role IN('admin','superadmin','colaborador');
  recipient:=CASE WHEN cardinality(people)=1 THEN people[1] ELSE account END;
  IF private.atlas_manager_work(now(),own,recipient)>now() THEN CONTINUE;END IF;
  source:='manager-task:'||task.id||':'||(now() AT TIME ZONE 'America/Sao_Paulo')::date;
  body:='Oi, '||(SELECT split_part(full_name,' ',1) FROM public.profiles WHERE id=recipient)||'! Aqui é o Atlas. Como está a tarefa '||task.title||'? '||
   CASE WHEN cardinality(people)=1 THEN 'Me conta o que já foi feito, se tem algum impedimento e quando podemos conferir. Se já entregou ou postou, manda o link ou a evidência para a conta revisar.' ELSE 'Preciso confirmar quem cuida da etapa atual entre os responsáveis cadastrados e o que falta para entregar.' END||
   E'\nPrazo registrado: '||coalesce(to_char(task.due_date,'DD/MM/YYYY'),'sem prazo')||'.';
  INSERT INTO public.atlas_team_threads(owner_id,client_id,task_id,account_person_id,current_person_id,title,shared_context,source_key,management_kind,management_data,next_review_at)
  VALUES(own,task.client_id,task.id,account,recipient,left(task.title,200),jsonb_build_object('label','Acompanhamento de tarefa existente','text',left(task.description,1500),'at',now()),source,'followup',jsonb_build_object('origin','existing_task','task_basis',md5(to_jsonb(task)::text)),private.atlas_manager_work(now()+interval '1 hour',own,recipient)) ON CONFLICT(owner_id,source_key) DO NOTHING RETURNING id INTO thread;
  IF thread IS NOT NULL THEN INSERT INTO public.atlas_team_messages(thread_id,role,content) VALUES(thread,'atlas',left(body,4000));opened:=opened+1;END IF;
 END LOOP;
 RETURN opened;
END $$;
REVOKE ALL ON FUNCTION public.atlas_manager_reconcile() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.atlas_manager_reconcile() TO service_role;

CREATE OR REPLACE FUNCTION private.atlas_team_create(p_client uuid,p_task uuid,p_account uuid,p_source text,p_context jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE t public.tarefas; thread uuid; title text; existing public.atlas_team_threads;
BEGIN
 IF NOT private.atlas_demand_owner() OR NOT EXISTS(SELECT 1 FROM public.atlas_team_config WHERE owner_id=auth.uid() AND enabled) THEN RAISE EXCEPTION 'Piloto indisponível.' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('atlas-team-start:'||auth.uid()::text||p_task::text,0));
 SELECT * INTO t FROM public.tarefas WHERE id=p_task AND client_id=p_client FOR SHARE;
 IF t.id IS NULL OR NOT EXISTS(SELECT 1 FROM public.clientes WHERE id=p_client AND etapa='closed') OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_account AND status='active' AND role IN('admin','superadmin','colaborador')) THEN RAISE EXCEPTION 'Cliente, tarefa ou responsável indisponível.'; END IF;
 IF p_source IS NULL OR char_length(p_source) NOT BETWEEN 1 AND 500 OR p_context IS NULL OR jsonb_typeof(p_context)<>'object' OR octet_length(p_context::text)>10000 THEN RAISE EXCEPTION 'Fonte acima do limite.'; END IF;
 SELECT id INTO thread FROM public.atlas_team_threads WHERE owner_id=auth.uid() AND source_key=p_source;
 IF thread IS NOT NULL THEN
  SELECT * INTO existing FROM public.atlas_team_threads WHERE id=thread;
  IF existing.client_id<>p_client OR existing.task_id IS DISTINCT FROM p_task OR existing.account_person_id<>p_account THEN RAISE EXCEPTION 'Identificador usado por outro acompanhamento.'; END IF;
  RETURN thread;
 END IF;
 SELECT * INTO existing FROM public.atlas_team_threads WHERE owner_id=auth.uid() AND task_id=p_task AND state<>'closed' AND (origin_job_id IS NULL OR management_kind='followup') FOR UPDATE;
 IF existing.id IS NOT NULL THEN
  IF existing.account_person_id<>p_account THEN RAISE EXCEPTION 'Esta tarefa já tem acompanhamento com outro responsável da conta. Abra o assunto existente.'; END IF;
  RETURN existing.id;
 END IF;
 IF EXISTS(SELECT 1 FROM public.task_statuses WHERE value=t.status AND is_terminal) THEN RAISE EXCEPTION 'Escolha uma tarefa em aberto.'; END IF;
 PERFORM public.atlas_task_followup_watch(t.id,md5(to_jsonb(t)::text));
 title:=left(t.title,200);
 INSERT INTO public.atlas_team_threads(owner_id,client_id,task_id,account_person_id,current_person_id,title,shared_context,source_key,next_review_at)
 VALUES(auth.uid(),p_client,p_task,p_account,p_account,title,p_context,p_source,now()+interval '1 hour') RETURNING id INTO thread;
 INSERT INTO public.atlas_team_messages(thread_id,role,content) VALUES(thread,'atlas','Oi! Preciso de você para conferir: '||title||'. '||CASE WHEN nullif(btrim(p_context->>'text'),'') IS NOT NULL THEN 'Orientação para alinharmos: '||left(btrim(p_context->>'text'),2000)||'. ' ELSE '' END||'O que já foi apurado e quem está conduzindo? Vamos combinar o próximo retorno.');
 RETURN thread;
END $$;

CREATE OR REPLACE FUNCTION private.atlas_manager_finish(p_id uuid,p_result jsonb,p_usage jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE t public.atlas_team_threads;r public.atlas_team_requests;actor uuid;kind text;selected uuid;task public.tarefas;v_title text;body text;review timestamptz;expected timestamptz;due date;initial text;tasktype text;days integer;existing uuid;name text;owner_thread uuid;parent uuid;resume boolean:=false;basis text;tasks_basis text;question_override text;contact uuid;contact_assignees uuid[];
BEGIN
 SELECT * INTO r FROM public.atlas_team_requests WHERE id=p_id;
 SELECT * INTO t FROM public.atlas_team_threads WHERE id=r.thread_id FOR UPDATE;
 SELECT * INTO r FROM public.atlas_team_requests WHERE id=p_id FOR UPDATE;
 IF r.state='completed' AND r.applied THEN RETURN jsonb_build_object('saved',true,'replayed',true,'task_id',t.task_id);END IF;
 IF r.state='completed' AND NOT r.applied AND t.management_data->>'pending_request_id'=r.id::text THEN resume:=true;p_result:=r.result;p_usage:='{}';END IF;
 IF r.id IS NULL OR r.state<>'processing' AND NOT resume OR t.management_kind IS NULL OR NOT coalesce(private.atlas_manager_live(t.owner_id),false) OR t.revision<>r.thread_revision
 OR NOT EXISTS(SELECT 1 FROM auth.sessions WHERE id=r.session_id AND user_id=r.actor_id)
 OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=r.actor_id AND status='active' AND role IN('admin','superadmin','colaborador'))
 OR r.actor_id NOT IN(t.owner_id,t.current_person_id) THEN RAISE EXCEPTION 'Sessão, política ou conversa mudou.' USING ERRCODE='42501';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.atlas_event_config WHERE owner_id=t.owner_id AND t.client_id=ANY(client_ids)) OR NOT EXISTS(SELECT 1 FROM public.clientes WHERE id=t.client_id AND etapa='closed') THEN RAISE EXCEPTION 'Cliente fora da carteira autorizada.';END IF;
 IF t.origin_job_id IS NOT NULL AND NOT private.atlas_consult_current(t.id) THEN RAISE EXCEPTION 'A origem da consulta mudou.' USING ERRCODE='42501';END IF;
 kind:=p_result->>'decision';actor:=r.actor_id;
 IF t.management_kind='followup' AND kind='ready' THEN kind:='progress';END IF;
 SELECT md5(to_jsonb(c)::text) INTO basis FROM public.clientes c WHERE c.id=t.client_id;
 SELECT md5(coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id),'[]')::text) INTO tasks_basis FROM public.tarefas x WHERE x.client_id=t.client_id;
 IF resume AND r.result->>'client_basis' IS DISTINCT FROM basis THEN kind:='ask';p_result:=jsonb_set(p_result,'{reply}','"O cadastro mudou antes da programação. Vamos conferir o escopo novamente antes de criar a tarefa."');END IF;
 IF resume AND r.result->>'tasks_basis' IS DISTINCT FROM tasks_basis THEN kind:='ask';p_result:=jsonb_set(p_result,'{reply}','"A fila mudou enquanto esse pedido aguardava. Vamos conferir se já tem uma tarefa cuidando disso?"');END IF;
 IF kind IS NULL OR kind NOT IN('ask','ready','progress','blocked','delivered','owner_needed','owner_answered','resolved') OR char_length(coalesce(p_result->>'reply','')) NOT BETWEEN 1 AND 4000 OR char_length(coalesce(p_result->>'summary','')) NOT BETWEEN 1 AND 2000 THEN RAISE EXCEPTION 'Resposta incompleta.';END IF;
 selected:=nullif(p_result->>'executor_id','')::uuid;
 IF selected IS NOT NULL AND (selected=t.owner_id OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=selected AND status='active' AND role IN('admin','superadmin','colaborador'))) THEN RAISE EXCEPTION 'Executor indisponível.';END IF;
 expected:=nullif(p_result->>'expected_at','')::timestamptz;
 IF expected IS NOT NULL AND (expected<now()-interval '5 minutes' OR expected>now()+interval '90 days') THEN RAISE EXCEPTION 'Previsão inválida.';END IF;
 IF nullif(p_result->>'evidence_url','') IS NOT NULL AND (p_result->>'evidence_url' !~ '^https?://' OR NOT EXISTS(SELECT 1 FROM public.atlas_team_messages WHERE id=r.message_id AND position(p_result->>'evidence_url' IN content)>0)) THEN RAISE EXCEPTION 'Evidência não veio da resposta.';END IF;
 review:=private.atlas_manager_work(coalesce(nullif(p_result->>'review_at','')::timestamptz,now()+interval '1 hour'),t.owner_id,t.current_person_id);
 IF review<=now() OR review>now()+interval '90 days' THEN RAISE EXCEPTION 'Revisão inválida.';END IF;
 IF kind='delivered' AND nullif(p_result->>'evidence_url','') IS NULL AND NOT EXISTS(SELECT 1 FROM public.tarefas x JOIN public.task_statuses s ON s.value=x.status AND s.is_terminal WHERE x.id=t.task_id AND x.client_id=t.client_id) THEN kind:='ask';END IF;
 IF kind='ready' THEN
  IF t.management_kind<>'intake' OR actor<>t.account_person_id OR private.atlas_manager_account(t.owner_id,t.client_id) IS DISTINCT FROM actor OR coalesce((t.management_data->>'needs_account')::boolean,false) THEN RAISE EXCEPTION 'Alinhe primeiro com o responsável da conta.';END IF;
  IF p_result->>'scope_status' IS DISTINCT FROM 'within_scope' THEN kind:='owner_needed';
  ELSIF nullif(p_result->>'existing_task_id','') IS NULL AND NOT EXISTS(SELECT 1 FROM public.atlas_manager_policy WHERE owner_id=t.owner_id AND create_after_clarification) THEN kind:='owner_needed';p_result:=jsonb_set(p_result,'{reply}','"O trabalho foi alinhado com a conta. A criação automática está desligada: revise o repasse nas Demandas deste cliente para criar a tarefa."');
  ELSIF selected IS NULL OR char_length(btrim(coalesce(p_result->>'task_title',''))) NOT BETWEEN 1 AND 180 OR char_length(btrim(coalesce(p_result->>'task_description',''))) NOT BETWEEN 10 AND 6000 THEN kind:='ask';
  ELSE
   existing:=nullif(p_result->>'existing_task_id','')::uuid;
   IF t.origin_job_id IS NOT NULL THEN
    IF jsonb_typeof(p_result->'finding_ids') IS DISTINCT FROM 'array' OR jsonb_array_length(p_result->'finding_ids')=0 OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(p_result->'finding_ids') a(id) WHERE NOT coalesce(t.management_data->'demand_ids','[]') ? a.id OR NOT EXISTS(SELECT 1 FROM public.atlas_demands d WHERE d.id::text=a.id AND d.owner_id=t.owner_id AND d.client_id=t.client_id AND d.proposal->>'thread_id'=t.id::text AND d.proposal->>'job_id'=t.origin_job_id::text AND d.state IN('proposed','draft') AND d.updated_at<=r.created_at)) THEN RAISE EXCEPTION 'Selecione somente demandas desta ordem do dono.';END IF;
   ELSE
   IF jsonb_typeof(p_result->'finding_ids') IS DISTINCT FROM 'array' OR jsonb_array_length(p_result->'finding_ids')=0 OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(p_result->'finding_ids') a(id) WHERE NOT coalesce(t.management_data->'finding_ids','[]') ? a.id) THEN RAISE EXCEPTION 'Selecione somente pedidos deste alinhamento.';END IF;
   IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(p_result->'finding_ids') a(id) WHERE NOT EXISTS(SELECT 1 FROM public.atlas_event_findings f WHERE f.id::text=a.id AND f.owner_id=t.owner_id AND f.client_id=t.client_id AND f.thread_id=t.id AND f.state NOT IN('closed','no_action') AND f.updated_at<=r.created_at AND private.atlas_event_client(f.conversation_id)=t.client_id)) THEN RAISE EXCEPTION 'O pedido ou o vínculo do grupo mudou. Refaça o alinhamento antes de criar a tarefa.';END IF;
   END IF;
   IF t.task_id IS NOT NULL AND existing IS DISTINCT FROM t.task_id THEN kind:='ask';
   ELSIF existing IS NOT NULL THEN
    SELECT * INTO task FROM public.tarefas WHERE id=existing AND client_id=t.client_id FOR SHARE;
    IF task.id IS NULL OR EXISTS(SELECT 1 FROM public.task_statuses WHERE value=task.status AND is_terminal) THEN RAISE EXCEPTION 'Tarefa existente indisponível.';END IF;
    -- Linking never transfers an existing task or alters its official deadline.
    IF NOT selected=ANY(task.assignee_ids) THEN kind:='ask';question_override:='Essa tarefa está com outra pessoa. Vamos conferir com quem cuida da conta como seguir?';END IF;
    IF EXISTS(SELECT 1 FROM public.atlas_team_threads x WHERE x.owner_id=t.owner_id AND x.task_id=task.id AND x.id<>t.id AND x.state<>'closed' AND (x.origin_job_id IS NULL OR x.management_kind='followup')) THEN kind:='ask';question_override:='Já estou acompanhando essa tarefa em outra conversa. Vamos seguir por lá para não cobrar duas vezes.';END IF;
   ELSE
    tasktype:=p_result->>'task_type';
    IF tasktype IS NULL OR tasktype NOT IN('interno','paid_traffic','video','arte','carrossel','social_media','post') THEN RAISE EXCEPTION 'Tipo inválido.';END IF;
    SELECT empresa INTO name FROM public.clientes WHERE id=t.client_id;
    v_title:=private.atlas_demand_task_title(name,p_result->>'task_title');
    PERFORM pg_advisory_xact_lock(hashtextextended('atlas-manager-task:'||t.owner_id::text||t.client_id::text,0));
    SELECT * INTO task FROM public.tarefas x WHERE x.client_id=t.client_id AND lower(btrim(x.title))=lower(btrim(v_title)) AND NOT EXISTS(SELECT 1 FROM public.task_statuses WHERE value=x.status AND is_terminal) LIMIT 1 FOR SHARE;
    IF task.id IS NOT NULL THEN kind:='ask';question_override:='Achei uma tarefa aberta com esse título: '||task.title||'. É esse mesmo trabalho? Assim seguimos nela.';
    ELSE
     days:=CASE WHEN tasktype='interno' THEN coalesce((SELECT inquiry_days FROM public.atlas_demand_planning_settings WHERE owner_id=t.owner_id),1) ELSE coalesce((SELECT production_days FROM public.atlas_demand_planning_settings WHERE owner_id=t.owner_id),3) END;
     due:=(now() AT TIME ZONE 'America/Sao_Paulo')::date;
     WHILE days>0 LOOP due:=due+1;IF extract(isodow FROM due)<6 THEN days:=days-1;END IF;END LOOP;
     IF expected IS NOT NULL THEN due:=(expected AT TIME ZONE 'America/Sao_Paulo')::date;END IF;
     WHILE extract(isodow FROM due)>5 LOOP due:=due+1;END LOOP;
     SELECT value INTO initial FROM public.task_statuses WHERE is_initial AND NOT is_terminal ORDER BY sort_order,value LIMIT 1;
     IF initial IS NULL THEN RAISE EXCEPTION 'Etapa inicial indisponível.';END IF;
     -- Automatic execution is deferred outside the recipient's business hours.
     IF private.atlas_manager_work(now(),t.owner_id,selected)>now() THEN kind:='queued';
     ELSE
      INSERT INTO public.tarefas(title,description,status,client_id,owner_id,type,priority,due_date,assignee_ids,status_history)
      VALUES(v_title,left(p_result->>'task_description',6000)||E'\n\nOrigem: alinhamento interno com Atlas. Conversa '||t.id||'. Relato da conta; não comprova execução.',initial,t.client_id,t.owner_id,tasktype,'medium',due,ARRAY[selected],jsonb_build_array(jsonb_build_object('status',initial,'assignee_ids',ARRAY[selected],'user_id',actor,'timestamp',now(),'source','atlas_after_account_clarification','thread_id',t.id,'request_id',r.id))) RETURNING * INTO task;
      IF task.assignee_ids IS DISTINCT FROM ARRAY[selected] OR task.due_date IS DISTINCT FROM due THEN RAISE EXCEPTION 'Fluxo alteraria o repasse; verifique a configuração.';END IF;
     END IF;
    END IF;
   END IF;
  END IF;
 END IF;
 body:=coalesce(question_override,p_result->>'reply');
 IF NOT resume AND t.management_data->>'pending_request_id' IS NOT NULL THEN
  UPDATE public.atlas_team_requests SET applied=true,result=result||jsonb_build_object('superseded_by',r.id) WHERE id=(t.management_data->>'pending_request_id')::uuid AND id<>r.id AND NOT applied;
  UPDATE public.atlas_team_threads SET management_data=management_data-'pending_request_id' WHERE id=t.id;
 END IF;
 IF kind='queued' THEN
  UPDATE public.atlas_team_threads SET state='waiting_review',next_review_at=private.atlas_manager_work(now(),t.owner_id,selected),management_data=jsonb_set(management_data,'{pending_request_id}',to_jsonb(r.id::text)),summary=p_result->>'summary',revision=revision+1,updated_at=now() WHERE id=t.id;
  body:='Fechado. Vou organizar a tarefa no começo do próximo expediente. Ela ainda não foi criada; antes de passar para a equipe, confiro se algo mudou.';
 ELSIF kind='ready' AND task.id IS NOT NULL THEN
  UPDATE public.atlas_team_threads SET task_id=task.id,title=task.title,management_kind='followup',management_data=CASE WHEN origin_job_id IS NOT NULL THEN management_data||'{"consult_organized":true,"recipient_basis":"assignee"}' ELSE management_data END,current_person_id=selected,state='awaiting_reply',next_review_at=private.atlas_manager_work(now()+interval '1 hour',t.owner_id,selected),summary=p_result->>'summary',revision=revision+1,updated_at=now() WHERE id=t.id;
  UPDATE public.atlas_event_findings SET task_id=task.id,revision=revision+1,updated_at=now() WHERE thread_id=t.id AND p_result->'finding_ids' ? id::text;
  IF t.origin_job_id IS NOT NULL THEN UPDATE public.atlas_demands SET task_id=task.id,state='linked',revision=revision+1,updated_at=now() WHERE owner_id=t.owner_id AND client_id=t.client_id AND p_result->'finding_ids' ? id::text AND proposal->>'thread_id'=t.id::text;END IF;
  UPDATE public.atlas_demands d SET task_id=task.id,state='linked',proposal=jsonb_build_object('source','atlas_after_account_clarification','thread_id',t.id,'request_id',r.id),revision=d.revision+1,updated_at=now() FROM public.atlas_event_findings f WHERE f.thread_id=t.id AND f.demand_id=d.id AND p_result->'finding_ids' ? f.id::text AND d.state<>'archived';
  UPDATE public.atlas_event_findings SET thread_id=NULL,state='observed',revision=revision+1,updated_at=now() WHERE thread_id=t.id AND NOT p_result->'finding_ids' ? id::text;
  body:='Tarefa '||CASE WHEN existing IS NOT NULL THEN 'existente vinculada' ELSE 'criada' END||': '||task.title||'. '||(SELECT split_part(full_name,' ',1) FROM public.profiles WHERE id=selected)||', consegue cuidar disso para nós? '||left(task.description,1600)||E'\nMe avisa se está tudo claro ou se falta alguma coisa para começar. Prazo da tarefa: '||coalesce(to_char(task.due_date,'DD/MM/YYYY'),'não cadastrado')||'.';
 ELSIF kind='owner_answered' THEN
  IF actor<>t.owner_id OR t.management_kind<>'owner_context' OR coalesce((t.management_data->>'needs_account')::boolean,false) THEN RAISE EXCEPTION 'Informação exclusiva do dono.';END IF;
  parent:=nullif(t.management_data->>'parent_thread','')::uuid;
  IF parent IS NOT NULL THEN
   UPDATE public.atlas_team_threads SET state='awaiting_reply',current_person_id=account_person_id,next_review_at=private.atlas_manager_work(now()+interval '1 hour',owner_id,account_person_id),management_data=jsonb_set(management_data,'{owner_direction}',jsonb_build_object('summary',p_result->>'summary','request_id',r.id,'at',now())),revision=revision+1,updated_at=now() WHERE id=parent AND owner_id=t.owner_id AND client_id=t.client_id AND state<>'closed';
   IF NOT FOUND THEN RAISE EXCEPTION 'Assunto de origem indisponível.';END IF;
   INSERT INTO public.atlas_team_messages(thread_id,role,content) VALUES(parent,'atlas','O Josias passou a orientação: '||(p_result->>'summary')||' Com isso, falta alguma coisa para seguirmos?');
  END IF;
  UPDATE public.atlas_team_threads SET state='closed',next_review_at=NULL,summary=p_result->>'summary',revision=revision+1,updated_at=now() WHERE id=t.id;
  INSERT INTO public.atlas_memories(owner_id,client_id,content,source,source_quote,topic)
  SELECT t.owner_id,t.client_id,left(p_result->>'summary',4000),'user_confirmation',left(m.content,2000),'direcao_operacional' FROM public.atlas_team_messages m WHERE m.id=r.message_id;
  body:='Fechado, guardei essa orientação. '||CASE WHEN parent IS NOT NULL THEN 'Vou seguir com quem cuida da conta. Sua conversa comigo fica por aqui.' ELSE 'Vou usar isso nos próximos passos desse cliente.' END;
 ELSIF kind='owner_needed' AND t.management_kind<>'owner_context' THEN
  INSERT INTO public.atlas_team_threads(owner_id,client_id,account_person_id,current_person_id,title,shared_context,source_key,state,management_kind,management_data)
  VALUES(t.owner_id,t.client_id,t.owner_id,t.owner_id,left('Decisão: '||t.title,200),jsonb_build_object('text',p_result->>'summary','label','Decisão que falta ao acompanhamento interno','at',now()),'manager-decision:'||r.id,'needs_owner','owner_context',jsonb_build_object('needs_account',false,'parent_thread',t.id)) RETURNING id INTO owner_thread;
  INSERT INTO public.atlas_team_messages(thread_id,role,content) VALUES(owner_thread,'atlas',left(p_result->>'reply',4000));
  UPDATE public.atlas_team_threads SET state='waiting_review',next_review_at=NULL,summary=p_result->>'summary',revision=revision+1,updated_at=now() WHERE id=t.id;
  body:='Esse ponto depende de uma decisão do Josias. Já levei a dúvida para ele; quando responder, seguimos por aqui.';
 ELSIF kind IN('owner_needed','delivered') THEN
  UPDATE public.atlas_team_threads SET state=CASE WHEN kind='delivered' THEN 'delivery_review' ELSE 'needs_owner' END,current_person_id=CASE WHEN kind='delivered' THEN account_person_id ELSE owner_id END,next_review_at=NULL,summary=p_result->>'summary',evidence_url=nullif(p_result->>'evidence_url',''),revision=revision+1,updated_at=now() WHERE id=t.id;
 ELSIF kind='resolved' THEN
  UPDATE public.atlas_team_threads SET state='closed',next_review_at=NULL,summary=p_result->>'summary',revision=revision+1,updated_at=now() WHERE id=t.id;
 ELSE
  IF kind IN('progress','blocked') AND selected IS NOT NULL AND selected<>t.current_person_id THEN
   IF t.management_kind<>'followup' OR actor<>t.account_person_id OR private.atlas_manager_account(t.owner_id,t.client_id) IS DISTINCT FROM actor
   OR NOT EXISTS(SELECT 1 FROM public.atlas_team_messages m WHERE m.thread_id=t.id AND m.role='human' AND m.actor_id=actor AND m.created_at<=r.created_at AND private.atlas_manager_named_executor(m.content,t.owner_id)=selected)
   OR NOT EXISTS(SELECT 1 FROM public.tarefas x WHERE x.id=t.task_id AND x.client_id=t.client_id)
   THEN RAISE EXCEPTION 'A conta precisa identificar a pessoa nesta conversa.' USING ERRCODE='42501';END IF;
   contact:=selected;SELECT x.assignee_ids INTO contact_assignees FROM public.tarefas x WHERE x.id=t.task_id AND x.client_id=t.client_id;
   UPDATE public.atlas_team_threads SET current_person_id=selected,state='awaiting_reply',next_review_at=private.atlas_manager_work(review,owner_id,selected),expected_at=expected,summary=p_result->>'summary',management_data=management_data||jsonb_build_object('contact_request_id',r.id,'contact_person_id',selected),revision=revision+1,reminder_day=NULL,reminders_today=0,updated_at=now() WHERE id=t.id;
   body:='Quem cuida da conta explicou: '||(p_result->>'summary')||' Como está esse trabalho agora? Me conta para eu acompanhar daqui.';
  ELSE
   UPDATE public.atlas_team_threads SET state=CASE WHEN kind='ask' THEN 'awaiting_reply' ELSE 'waiting_review' END,next_review_at=review,expected_at=expected,summary=p_result->>'summary',revision=revision+1,reminder_day=NULL,reminders_today=0,updated_at=now() WHERE id=t.id;
  END IF;
 END IF;
 INSERT INTO public.atlas_team_messages(thread_id,role,content) VALUES(t.id,'atlas',body);
 UPDATE public.atlas_team_requests SET state='completed',applied=kind<>'queued',thread_revision=(SELECT revision FROM public.atlas_team_threads WHERE id=t.id),result=p_result||jsonb_build_object('applied_decision',kind,'task_id',task.id,'client_basis',basis,'tasks_basis',tasks_basis,'contact_person_id',contact,'contact_assignee_ids',contact_assignees,'attempt',coalesce((r.result->>'attempt')::integer,1),'attempted_at',coalesce(r.result->>'attempted_at',r.created_at::text)),usage=private.atlas_team_merge_usage(usage,p_usage) WHERE id=r.id;
 RETURN jsonb_build_object('saved',true,'decision',kind,'task_id',task.id);
END $$;


CREATE OR REPLACE FUNCTION public.atlas_team_worker_snapshot() RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('thread',to_jsonb(t),
 'task_exists',EXISTS(SELECT 1 FROM public.tarefas x WHERE x.id=t.task_id AND x.client_id=t.client_id),
 'task_terminal',EXISTS(SELECT 1 FROM public.tarefas x JOIN public.task_statuses s ON s.value=x.status AND s.is_terminal WHERE x.id=t.task_id AND x.client_id=t.client_id),
 'recipient_active',p.status='active' AND p.role IN('admin','superadmin','colaborador'),
 'account_active',EXISTS(SELECT 1 FROM public.profiles a WHERE a.id=t.account_person_id AND a.status='active' AND a.role IN('admin','superadmin','colaborador') AND private.atlas_manager_account(t.owner_id,t.client_id)=a.id),
 'recipient_valid',CASE WHEN t.origin_job_id IS NOT NULL THEN private.atlas_consult_current(t.id) ELSE t.current_person_id IN(t.owner_id,t.account_person_id) OR EXISTS(SELECT 1 FROM public.tarefas x WHERE x.id=t.task_id AND x.client_id=t.client_id AND t.current_person_id=ANY(x.assignee_ids)) OR private.atlas_followup_contact(t.id) END,
 'hours',coalesce((SELECT jsonb_build_object('start_time',h.start_time,'end_time',h.end_time) FROM public.atlas_team_hours h WHERE h.owner_id=t.owner_id AND h.person_id=t.current_person_id),'{}'))),'[]')
 FROM public.atlas_team_threads t JOIN public.atlas_team_config c ON c.owner_id=t.owner_id AND c.enabled LEFT JOIN public.profiles p ON p.id=t.current_person_id
 WHERE t.state IN('awaiting_reply','waiting_review') AND NOT EXISTS(SELECT 1 FROM public.atlas_team_requests r WHERE r.thread_id=t.id AND r.state='processing' AND coalesce(nullif(r.result->>'attempted_at','')::timestamptz,r.created_at)>now()-interval '2 minutes');
$$;

CREATE OR REPLACE FUNCTION private.atlas_team_reserve(p_thread uuid,p_id uuid,p_text text,p_revision integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE t public.atlas_team_threads;r public.atlas_team_requests; msg uuid;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('atlas-team:'||auth.uid()::text,0));
 t:=private.atlas_team_assert(p_thread);
 IF NOT EXISTS(SELECT 1 FROM public.atlas_team_config WHERE owner_id=t.owner_id AND enabled) THEN RAISE EXCEPTION 'Acompanhamento pausado.'; END IF;
 SELECT * INTO r FROM public.atlas_team_requests WHERE id=p_id;
 IF r.id IS NOT NULL THEN
  IF r.actor_id<>auth.uid() OR r.thread_id<>p_thread OR NOT EXISTS(SELECT 1 FROM public.atlas_team_messages WHERE id=r.message_id AND content=btrim(p_text)) THEN RAISE EXCEPTION 'Identificador já utilizado.'; END IF;
  IF r.state='failed' THEN
   IF auth.uid() NOT IN(t.owner_id,t.current_person_id) OR t.state IN('delivery_review','closed') OR t.revision<>p_revision THEN RAISE EXCEPTION 'Atualize o acompanhamento antes de retomar.' USING ERRCODE='40001';END IF;
   IF coalesce((r.result->>'attempt')::integer,1)>=3 THEN RETURN jsonb_build_object('claimed',false,'state','failed','error','Esta resposta já teve três tentativas. O texto foi preservado; confira o acompanhamento antes de seguir.');END IF;
   IF EXISTS(SELECT 1 FROM public.atlas_team_requests WHERE thread_id=t.id AND state='processing' AND coalesce(nullif(result->>'attempted_at','')::timestamptz,created_at)>now()-interval '2 minutes') THEN RAISE EXCEPTION 'Aguarde a resposta em andamento.';END IF;
   IF (SELECT coalesce(sum(coalesce((result->>'attempt')::integer,1)),0) FROM public.atlas_team_requests WHERE actor_id=auth.uid() AND (coalesce(nullif(result->>'attempted_at','')::timestamptz,created_at) AT TIME ZONE 'America/Sao_Paulo')::date=(now() AT TIME ZONE 'America/Sao_Paulo')::date)>=20 THEN RAISE EXCEPTION 'Limite diário de respostas atingido.';END IF;
   UPDATE public.atlas_team_requests SET state='processing',session_id=(auth.jwt()->>'session_id')::uuid,thread_revision=t.revision,result=jsonb_build_object('attempt',coalesce((r.result->>'attempt')::integer,1)+1,'attempted_at',now()) WHERE id=r.id;
   RETURN jsonb_build_object('claimed',true,'state','processing','revision',t.revision);
  END IF;
  RETURN jsonb_build_object('claimed',false,'state',r.state,'result',r.result);
 END IF;
 IF auth.uid() NOT IN(t.owner_id,t.current_person_id) OR t.state IN('delivery_review','closed') THEN RAISE EXCEPTION 'Aguarde sua vez ou a revisão da entrega.'; END IF;
 IF t.revision<>p_revision THEN RAISE EXCEPTION 'A conversa mudou. Atualize antes de responder.' USING ERRCODE='40001'; END IF;
 IF char_length(btrim(p_text)) NOT BETWEEN 1 AND 4000 THEN RAISE EXCEPTION 'Escreva uma mensagem de até 4.000 caracteres.'; END IF;
 IF EXISTS(SELECT 1 FROM public.atlas_team_requests WHERE thread_id=t.id AND state='processing' AND coalesce(nullif(result->>'attempted_at','')::timestamptz,created_at)>now()-interval '2 minutes') THEN RAISE EXCEPTION 'Aguarde a resposta em andamento.'; END IF;
 UPDATE public.atlas_team_requests SET state='failed' WHERE thread_id=t.id AND state='processing';
 IF (SELECT coalesce(sum(coalesce((result->>'attempt')::integer,1)),0) FROM public.atlas_team_requests WHERE actor_id=auth.uid() AND (coalesce(nullif(result->>'attempted_at','')::timestamptz,created_at) AT TIME ZONE 'America/Sao_Paulo')::date=(now() AT TIME ZONE 'America/Sao_Paulo')::date)>=20 THEN RAISE EXCEPTION 'Limite de 20 respostas de IA por pessoa/dia no piloto.'; END IF;
 INSERT INTO public.atlas_team_messages(thread_id,role,actor_id,content) VALUES(t.id,'human',auth.uid(),btrim(p_text)) RETURNING id INTO msg;
 UPDATE public.atlas_team_threads SET revision=revision+1,updated_at=now() WHERE id=t.id RETURNING * INTO t;
 INSERT INTO public.atlas_team_requests(id,thread_id,actor_id,session_id,message_id,thread_revision) VALUES(p_id,t.id,auth.uid(),(auth.jwt()->>'session_id')::uuid,msg,t.revision);
 RETURN jsonb_build_object('claimed',true,'state','processing','revision',t.revision);
END $$;

CREATE OR REPLACE FUNCTION private.atlas_team_finish(p_id uuid,p_result jsonb,p_usage jsonb,p_error boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.atlas_team_requests;t public.atlas_team_threads; msg uuid; target uuid;
BEGIN
 SELECT * INTO r FROM public.atlas_team_requests WHERE id=p_id;
 SELECT * INTO t FROM public.atlas_team_threads WHERE id=r.thread_id FOR UPDATE;
 SELECT * INTO r FROM public.atlas_team_requests WHERE id=p_id FOR UPDATE;
 IF r.id IS NULL OR r.state<>'processing' THEN RETURN jsonb_build_object('saved',false); END IF;
 IF NOT EXISTS(SELECT 1 FROM public.atlas_team_config WHERE owner_id=t.owner_id AND enabled) OR r.actor_id NOT IN(t.owner_id,t.account_person_id) AND NOT EXISTS(SELECT 1 FROM public.tarefas x WHERE x.id=t.task_id AND x.client_id=t.client_id AND r.actor_id=ANY(x.assignee_ids)) AND NOT (r.actor_id=t.current_person_id AND private.atlas_followup_contact(t.id)) THEN RAISE EXCEPTION 'Participação não está mais ativa.' USING ERRCODE='42501'; END IF;
 IF p_error THEN
  UPDATE public.atlas_team_requests SET state='failed',usage=private.atlas_team_merge_usage(usage,p_usage),
  result=jsonb_build_object('attempt',coalesce((r.result->>'attempt')::integer,1),'attempted_at',coalesce(r.result->>'attempted_at',r.created_at::text),
  'error_code',CASE WHEN p_result->>'error_code' ~ '^[A-Z_]{1,64}$' THEN p_result->>'error_code' ELSE 'REPLY_FAILED' END,
  'error_stage',CASE WHEN p_result->>'error_stage' IN('context','model','validate','revalidate','save') THEN p_result->>'error_stage' ELSE 'unknown' END) WHERE id=r.id;
  RETURN jsonb_build_object('saved',false);
 END IF;
 IF NOT EXISTS(SELECT 1 FROM auth.sessions WHERE id=r.session_id AND user_id=r.actor_id) OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=r.actor_id AND status='active' AND role IN('admin','superadmin','colaborador')) OR t.revision<>r.thread_revision OR t.current_person_id<>r.actor_id AND t.owner_id<>r.actor_id THEN RAISE EXCEPTION 'Sessão ou conversa mudou.' USING ERRCODE='42501'; END IF;
 IF char_length(p_result->>'reply') NOT BETWEEN 1 AND 4000 OR p_result->>'update_kind' NOT IN('clarify','received','progress','blocked','needs_owner','delivered') OR char_length(p_result->>'summary')>2000 THEN RAISE EXCEPTION 'Resposta inválida.'; END IF;
 target:=nullif(p_result->>'next_person_id','')::uuid;
 IF target IS NOT NULL AND target NOT IN(t.account_person_id,t.owner_id) AND NOT EXISTS(SELECT 1 FROM public.tarefas x WHERE x.id=t.task_id AND x.client_id=t.client_id AND target=ANY(x.assignee_ids)) THEN RAISE EXCEPTION 'Destinatário fora do acompanhamento.'; END IF;
 IF nullif(p_result->>'evidence_url','') IS NOT NULL AND (p_result->>'evidence_url' !~ '^https?://' OR char_length(p_result->>'evidence_url')>2000) THEN RAISE EXCEPTION 'Link inválido.'; END IF;
 INSERT INTO public.atlas_team_messages(thread_id,role,content,proposal) VALUES(t.id,'atlas',p_result->>'reply',p_result||jsonb_build_object('request_id',r.id)) RETURNING id INTO msg;
 UPDATE public.atlas_team_requests SET state='completed',result=p_result||jsonb_build_object('attempt',coalesce((r.result->>'attempt')::integer,1),'attempted_at',coalesce(r.result->>'attempted_at',r.created_at::text)),usage=private.atlas_team_merge_usage(usage,p_usage) WHERE id=r.id;
 UPDATE public.atlas_team_threads SET revision=revision+1,updated_at=now() WHERE id=t.id;
 RETURN jsonb_build_object('saved',true,'message_id',msg);
END $$;

CREATE OR REPLACE FUNCTION public.atlas_team_worker_apply(p_thread uuid,p_revision integer,p_plan jsonb) RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE t public.atlas_team_threads;
BEGIN
 SELECT * INTO t FROM public.atlas_team_threads WHERE id=p_thread FOR UPDATE;
 IF t.revision<>p_revision OR t.state NOT IN('awaiting_reply','waiting_review') OR NOT EXISTS(SELECT 1 FROM public.atlas_team_config WHERE owner_id=t.owner_id AND enabled) THEN RETURN false;END IF;
 IF t.management_kind IS NOT NULL AND NOT private.atlas_manager_live(t.owner_id) THEN RETURN false;END IF;
 IF p_plan->>'kind'='account_review' THEN
  IF t.management_kind<>'followup' OR t.account_person_id IS DISTINCT FROM private.atlas_manager_account(t.owner_id,t.client_id)
  OR NOT EXISTS(SELECT 1 FROM public.tarefas x WHERE x.id=t.task_id AND x.client_id=t.client_id) THEN RETURN false;END IF;
  UPDATE public.atlas_team_threads SET current_person_id=account_person_id,state='awaiting_reply',next_review_at=private.atlas_manager_work(now()+interval '1 hour',owner_id,account_person_id),management_data=management_data-ARRAY['contact_request_id','contact_person_id'],revision=revision+1,reminder_day=NULL,reminders_today=0,updated_at=now() WHERE id=t.id;
  INSERT INTO public.atlas_team_messages(thread_id,role,content) VALUES(t.id,'atlas','A atribuição dessa tarefa mudou. Quem cuida da conta consegue confirmar com quem devemos acompanhar a etapa atual?');
  RETURN true;
 END IF;
 INSERT INTO public.atlas_team_messages(thread_id,role,content) VALUES(t.id,'atlas',left(p_plan->>'text',4000));
 IF p_plan->>'kind' IN('unavailable','delivery_review') THEN
  UPDATE public.atlas_team_threads SET state=CASE WHEN p_plan->>'kind'='delivery_review' THEN 'delivery_review' ELSE 'needs_owner' END,current_person_id=CASE WHEN p_plan->>'kind'='delivery_review' AND management_kind IS NOT NULL THEN account_person_id ELSE owner_id END,next_review_at=NULL,revision=revision+1,updated_at=now() WHERE id=t.id;RETURN true;
 END IF;
 UPDATE public.atlas_team_threads SET state='awaiting_reply',next_review_at=(p_plan->>'next_review_at')::timestamptz,reminder_day=(p_plan->>'reminder_day')::date,reminders_today=(p_plan->>'reminders_today')::integer,revision=revision+1,updated_at=now() WHERE id=t.id;
 RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.atlas_team_context(p_thread uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE t public.atlas_team_threads; result jsonb;
BEGIN
 SELECT * INTO t FROM public.atlas_team_threads WHERE id=p_thread;
 IF t.id IS NULL THEN RAISE EXCEPTION 'Conversa indisponível.' USING ERRCODE='42501'; END IF;
 SELECT jsonb_build_object('thread',to_jsonb(t),'client_name',c.empresa,'actor_id',auth.uid(),'is_owner',auth.uid()=t.owner_id,
 'messages',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.created_at,x.id),'[]') FROM(SELECT * FROM public.atlas_team_messages m WHERE m.thread_id=t.id ORDER BY m.created_at DESC,m.id DESC LIMIT 40)x),
 'people',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.full_name,'hours',coalesce((SELECT jsonb_build_object('start_time',h.start_time,'end_time',h.end_time) FROM public.atlas_team_hours h WHERE h.owner_id=t.owner_id AND h.person_id=p.id),'{"start_time":"08:00","end_time":"17:00"}'::jsonb))),'[]') FROM public.profiles p WHERE p.status='active' AND (p.id IN(t.owner_id,t.account_person_id) OR EXISTS(SELECT 1 FROM public.tarefas x WHERE x.id=t.task_id AND x.client_id=t.client_id AND p.id=ANY(x.assignee_ids)))),
 'task',(SELECT jsonb_build_object('id',x.id,'title',x.title,'description',left(x.description,2400),'status',s.label,'terminal',coalesce(s.is_terminal,false),'due_date',x.due_date,'assignee_ids',x.assignee_ids,'production_delivered_at',x.production_delivered_at) FROM public.tarefas x LEFT JOIN public.task_statuses s ON s.value=x.status WHERE x.id=t.task_id AND x.client_id=t.client_id),
 'hours',coalesce((SELECT jsonb_build_object('start_time',h.start_time,'end_time',h.end_time) FROM public.atlas_team_hours h WHERE h.owner_id=t.owner_id AND h.person_id=auth.uid()),'{"start_time":"08:00","end_time":"17:00"}'::jsonb),
 'last_request',(SELECT jsonb_build_object('id',r.id,'message_id',r.message_id,'message',m.content,'state',r.state,'attempt',coalesce((r.result->>'attempt')::integer,1),'error_code',r.result->>'error_code') FROM public.atlas_team_requests r JOIN public.atlas_team_messages m ON m.id=r.message_id AND m.thread_id=t.id WHERE r.thread_id=t.id AND r.actor_id=auth.uid() ORDER BY coalesce(nullif(r.result->>'attempted_at','')::timestamptz,r.created_at) DESC,r.id DESC LIMIT 1),
 'queried_at',now()) INTO result FROM public.clientes c WHERE c.id=t.client_id;
 RETURN result;
END $$;

NOTIFY pgrst,'reload schema';
COMMIT;

-- Local candidate only. No transport or historical customer-data backfill.
BEGIN;

ALTER TABLE public.atlas_memories ADD COLUMN team_shared boolean NOT NULL DEFAULT false,
 ADD COLUMN team_shared_at timestamptz,
 ADD CONSTRAINT atlas_memory_team_scope CHECK(NOT team_shared OR client_id IS NOT NULL);

-- A narrow owner RPC is needed because memory content and permissions cannot be
-- exposed as a general authenticated UPDATE capability.
CREATE FUNCTION private.atlas_memory_team_scope(p_memory uuid,p_shared boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.atlas_memories;
BEGIN
 IF NOT private.atlas_demand_owner() OR NOT private.atlas_team_human() OR p_shared IS NULL THEN
  RAISE EXCEPTION 'Somente o dono pode autorizar conhecimento operacional.' USING ERRCODE='42501';END IF;
 SELECT * INTO m FROM public.atlas_memories WHERE id=p_memory AND owner_id=auth.uid() AND state='active' FOR UPDATE;
 IF m.id IS NULL OR m.client_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.clientes WHERE id=m.client_id AND etapa='closed') THEN
  RAISE EXCEPTION 'Selecione uma memória ativa deste cliente.' USING ERRCODE='42501';END IF;
 UPDATE public.atlas_memories SET team_shared=p_shared,team_shared_at=now() WHERE id=m.id RETURNING * INTO m;
 RETURN to_jsonb(m);
END $$;
CREATE FUNCTION public.atlas_memory_team_scope(p_memory uuid,p_shared boolean) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.atlas_memory_team_scope(p_memory,p_shared) $$;
REVOKE ALL ON FUNCTION private.atlas_memory_team_scope(uuid,boolean),public.atlas_memory_team_scope(uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.atlas_memory_team_scope(uuid,boolean),public.atlas_memory_team_scope(uuid,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION private.atlas_manager_knowledge(p_request uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.atlas_team_requests;t public.atlas_team_threads;
BEGIN
 SELECT * INTO r FROM public.atlas_team_requests WHERE id=p_request;
 SELECT * INTO t FROM public.atlas_team_threads WHERE id=r.thread_id;
 IF r.id IS NULL OR r.state<>'processing' OR NOT coalesce(private.atlas_manager_live(t.owner_id),false)
 OR NOT EXISTS(SELECT 1 FROM auth.sessions WHERE id=r.session_id AND user_id=r.actor_id)
 OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=r.actor_id AND status='active' AND role IN('admin','superadmin','colaborador'))
 OR r.actor_id NOT IN(t.owner_id,t.current_person_id) THEN
  RAISE EXCEPTION 'Contexto não autorizado.' USING ERRCODE='42501';END IF;
 RETURN (SELECT coalesce(jsonb_agg(to_jsonb(brief) ORDER BY brief.at DESC,brief.id),'[]') FROM (
  SELECT x.id::text AS id,x.result->>'summary' AS content,s.title AS subject,x.created_at AS at,1 AS version
  FROM public.atlas_team_threads s JOIN public.atlas_team_requests x ON x.thread_id=s.id AND x.actor_id=s.owner_id AND x.applied AND x.result->>'applied_decision'='owner_answered'
  WHERE s.owner_id=t.owner_id AND s.client_id=t.client_id AND s.management_kind='owner_context'
  UNION ALL
  SELECT m.id::text,m.content,m.topic,coalesce(m.team_shared_at,m.created_at),m.version
  FROM public.atlas_memories m WHERE m.owner_id=t.owner_id AND m.client_id=t.client_id AND m.state='active' AND m.team_shared
  ORDER BY at DESC,id LIMIT 50) brief);
END $$;

CREATE FUNCTION public.atlas_manager_reconcile() RETURNS integer
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
  IF EXISTS(SELECT 1 FROM public.atlas_team_threads WHERE owner_id=own AND task_id=task.id AND state<>'closed') THEN CONTINUE;END IF;
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

ALTER TABLE public.atlas_jobs DROP CONSTRAINT atlas_jobs_status_check,
 ADD CONSTRAINT atlas_jobs_status_check CHECK(status IN('queued','running','waiting_team','completed','failed','cancelled')),
 ADD COLUMN source_session_id uuid DEFAULT nullif(auth.jwt()->>'session_id','')::uuid REFERENCES auth.sessions(id) ON DELETE SET NULL;
CREATE POLICY atlas_job_source_session ON public.atlas_jobs AS RESTRICTIVE FOR INSERT TO authenticated
 WITH CHECK(source_session_id=nullif(auth.jwt()->>'session_id','')::uuid AND private.planeje_live_session() AND auth.jwt()->>'planeje_server_delegate' IS NULL);
ALTER TABLE public.atlas_team_threads DROP CONSTRAINT atlas_team_threads_management_kind_check,
 ADD CONSTRAINT atlas_team_threads_management_kind_check CHECK(management_kind IN('intake','owner_context','followup','consultation')),
 ADD COLUMN origin_job_id uuid REFERENCES public.atlas_jobs(id) ON DELETE RESTRICT;
CREATE INDEX atlas_team_origin_job ON public.atlas_team_threads(origin_job_id) WHERE origin_job_id IS NOT NULL;
DROP INDEX public.atlas_manager_one_intake;
CREATE UNIQUE INDEX atlas_manager_one_intake ON public.atlas_team_threads(owner_id,client_id,coalesce(task_id,'00000000-0000-0000-0000-000000000000'::uuid),management_kind,coalesce(management_data->>'parent_thread',''),coalesce(origin_job_id::text,''))
 WHERE management_kind IN('intake','owner_context') AND state<>'closed';
-- Existing completed scans stay acknowledged; new completions recover projection/continuation together.
ALTER TABLE public.atlas_event_jobs ADD COLUMN continuation_checked boolean NOT NULL DEFAULT true;
ALTER TABLE public.atlas_event_jobs ALTER COLUMN continuation_checked SET DEFAULT false;

-- Boolean permission helper: staff cannot read the owner's private job/session.
CREATE FUNCTION private.atlas_consult_current(p_thread uuid) RETURNS boolean
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
 ELSE auth.uid() IN(t.owner_id,t.account_person_id) OR EXISTS(SELECT 1 FROM public.tarefas x WHERE x.id=t.task_id AND x.client_id=t.client_id AND auth.uid()=ANY(x.assignee_ids)) END;
$$;

CREATE FUNCTION public.atlas_manager_consult(p_job uuid,p_lease uuid,p_client uuid,p_task uuid,p_question text,p_person uuid DEFAULT NULL,p_mode text DEFAULT 'consult') RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE j public.atlas_jobs;r public.atlas_runs;task public.tarefas;person public.profiles;account uuid;recipient uuid;people uuid[];basis text;thread uuid;source text;body text;at_work timestamptz;reused boolean:=false;demand uuid;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'Acesso exclusivo do worker.' USING ERRCODE='42501';END IF;
 SELECT * INTO j FROM public.atlas_jobs WHERE id=p_job FOR UPDATE;
 SELECT * INTO r FROM public.atlas_runs WHERE id=j.origin_run_id;
 IF j.id IS NULL OR j.status<>'running' OR j.lease_token IS DISTINCT FROM p_lease OR j.lease_until<=now()
 OR NOT coalesce(private.atlas_manager_live(j.owner_id),false)
 OR NOT EXISTS(SELECT 1 FROM auth.sessions WHERE id=j.source_session_id AND user_id=j.owner_id)
 OR NOT EXISTS(SELECT 1 FROM public.atlas_event_config WHERE owner_id=j.owner_id AND p_client=ANY(client_ids))
 OR NOT EXISTS(SELECT 1 FROM public.clientes WHERE id=p_client AND etapa='closed')
 OR j.client_id IS NOT NULL AND j.client_id<>p_client
 OR r.request_client_id IS NOT NULL AND r.request_client_id<>p_client
 OR EXISTS(SELECT 1 FROM public.atlas_conversations WHERE id=j.conversation_id AND client_id IS NOT NULL AND client_id<>p_client) THEN
  RAISE EXCEPTION 'Sessão, política ou cliente da consulta mudou.' USING ERRCODE='42501';END IF;
 IF p_question IS NULL OR char_length(btrim(p_question)) NOT BETWEEN 10 AND 1200 OR p_question ~* '(senha|password|api.?key|token)[[:space:]]*[:=]|sk-[a-zA-Z0-9_-]{12,}|eyJ[a-zA-Z0-9_-]{30,}' THEN
  RAISE EXCEPTION 'Envie apenas a pergunta operacional, sem conteúdo privado.' USING ERRCODE='22023';END IF;
 IF char_length(btrim(r.request_message))>=10 AND position(lower(btrim(r.request_message)) IN lower(p_question))>0
 OR EXISTS(SELECT 1 FROM public.atlas_memories m WHERE m.owner_id=j.owner_id AND (m.state<>'active' OR NOT m.team_shared OR m.client_id IS DISTINCT FROM p_client) AND char_length(btrim(m.content))>=20 AND position(lower(btrim(m.content)) IN lower(p_question))>0) THEN
  RAISE EXCEPTION 'A pergunta não pode copiar a conversa ou memória privada do dono.' USING ERRCODE='22023';END IF;
 IF p_mode IS NULL OR p_mode NOT IN('consult','organize') THEN RAISE EXCEPTION 'Modo de consulta inválido.' USING ERRCODE='22023';END IF;
 IF p_mode='organize' AND r.request_message !~* '^[[:space:]]*(atlas[, ]*)?(quero|preciso|vamos|pode|crie|criar|organize|organizar|faça|fazer|registre|registrar|combinei|combinamos|defini|aprovado)' THEN
  RETURN jsonb_build_object('available',false,'requires_owner',true,'reason','A mensagem de origem não confirma uma ordem ou combinado. Esclareça a intenção antes de organizar execução.');END IF;
 IF p_task IS NOT NULL THEN
  SELECT * INTO task FROM public.tarefas WHERE id=p_task AND client_id=p_client;
  IF task.id IS NULL THEN RAISE EXCEPTION 'Tarefa fora do cliente.' USING ERRCODE='42501';END IF;
 END IF;
 account:=private.atlas_manager_account(j.owner_id,p_client);
 SELECT array_agg(p.id ORDER BY p.id) INTO people FROM public.profiles p WHERE p.id=ANY(task.assignee_ids) AND p.id<>j.owner_id AND p.status='active' AND p.role IN('admin','superadmin','colaborador');
 recipient:=CASE WHEN p_mode='organize' THEN account ELSE coalesce(p_person,CASE WHEN cardinality(people)=1 THEN people[1] ELSE account END) END;
 IF recipient IS NULL THEN RETURN jsonb_build_object('available',false,'requires_owner',true,'reason','Falta confirmar quem cuida desta conta. Não chamei ninguém.');END IF;
 SELECT * INTO person FROM public.profiles WHERE id=recipient AND id<>j.owner_id AND status='active' AND role IN('admin','superadmin','colaborador');
 basis:=CASE WHEN recipient=ANY(people) THEN 'assignee' WHEN recipient=account THEN 'account' ELSE 'explicit' END;
 IF person.id IS NULL OR basis='explicit' AND NOT (
  position(lower(person.full_name) IN lower(r.request_message))>0 OR
  length(split_part(person.full_name,' ',1))>=3 AND
  position(' '||lower(split_part(person.full_name,' ',1))||' ' IN ' '||regexp_replace(lower(r.request_message),'[^[:alnum:]]+',' ','g')||' ')>0 AND
  (SELECT count(*) FROM public.profiles p WHERE p.status='active' AND p.role IN('admin','superadmin','colaborador') AND lower(split_part(p.full_name,' ',1))=lower(split_part(person.full_name,' ',1)))=1
 ) THEN RAISE EXCEPTION 'Pessoa sem vínculo ou indicação explícita do dono.' USING ERRCODE='42501';END IF;
 source:='manager-consult:'||j.id||':'||md5(p_client::text||coalesce(p_task::text,'')||recipient::text||p_mode);
 SELECT id INTO thread FROM public.atlas_team_threads WHERE owner_id=j.owner_id AND source_key=source;
 reused:=thread IS NOT NULL;
 at_work:=private.atlas_manager_work(now(),j.owner_id,recipient);
 body:='Oi, '||split_part(person.full_name,' ',1)||'! Aqui é o Atlas. '||CASE WHEN p_mode='organize' THEN 'O dono trouxe um combinado para organizarmos. Preciso alinhar a ação e o executor, usando uma tarefa existente quando houver: ' ELSE 'Preciso confirmar um ponto da '||(SELECT empresa FROM public.clientes WHERE id=p_client)||': ' END||btrim(p_question);
 IF thread IS NULL THEN
  INSERT INTO public.atlas_team_threads(owner_id,client_id,task_id,account_person_id,current_person_id,title,shared_context,source_key,state,next_review_at,management_kind,management_data,origin_job_id)
  VALUES(j.owner_id,p_client,p_task,coalesce(account,recipient),recipient,left('Consulta: '||coalesce(task.title,(SELECT empresa FROM public.clientes WHERE id=p_client)),200),jsonb_build_object('label','Informação operacional solicitada pelo dono','text',btrim(p_question),'at',now()),source,
   CASE WHEN at_work>now() THEN 'waiting_review' ELSE 'awaiting_reply' END,private.atlas_manager_work(at_work+interval '1 hour',j.owner_id,recipient),CASE WHEN p_mode='organize' THEN 'intake' ELSE 'consultation' END,jsonb_build_object('recipient_basis',basis,'dispatch_pending',at_work>now(),'question',body,'scheduled_at',at_work),j.id) RETURNING id INTO thread;
  IF p_mode='organize' THEN
   INSERT INTO public.atlas_demands(owner_id,client_id,request_id,title,context,state,proposal)
   VALUES(j.owner_id,p_client,md5(source)::uuid,left('['||(SELECT empresa FROM public.clientes WHERE id=p_client)||'] '||btrim(p_question),180),btrim(p_question),'proposed',jsonb_build_object('source','atlas_owner_intake','thread_id',thread,'job_id',j.id)) RETURNING id INTO demand;
   UPDATE public.atlas_team_threads SET management_data=management_data||jsonb_build_object('demand_ids',jsonb_build_array(demand),'findings',jsonb_build_array(jsonb_build_object('id',demand,'title',left(btrim(p_question),180),'summary',btrim(p_question)))) WHERE id=thread;
  END IF;
  IF at_work<=now() THEN INSERT INTO public.atlas_team_messages(thread_id,role,content) VALUES(thread,'atlas',body);END IF;
 END IF;
 RETURN jsonb_build_object('available',true,'thread_id',thread,'recipient',person.full_name,'state',CASE WHEN at_work>now() THEN 'scheduled' ELSE 'awaiting_reply' END,'scheduled_at',at_work,'reused',reused);
END $$;
REVOKE ALL ON FUNCTION public.atlas_manager_consult(uuid,uuid,uuid,uuid,text,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.atlas_manager_consult(uuid,uuid,uuid,uuid,text,uuid,text) TO service_role;

CREATE FUNCTION public.atlas_manager_sync_consults() RETURNS integer
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE t public.atlas_team_threads;j public.atlas_jobs;item record;v_body text;pending integer;invalid boolean;changed integer:=0;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'Acesso exclusivo do worker.' USING ERRCODE='42501';END IF;
 -- Job before thread is the same lock order used by consult/finish.
 FOR j IN SELECT x.* FROM public.atlas_jobs x WHERE EXISTS(SELECT 1 FROM public.atlas_team_threads th WHERE th.origin_job_id=x.id AND (x.status='waiting_team' OR th.state<>'closed')) ORDER BY x.id FOR UPDATE SKIP LOCKED LOOP
 FOR t IN SELECT * FROM public.atlas_team_threads WHERE origin_job_id=j.id AND state<>'closed' ORDER BY id FOR UPDATE LOOP
  IF NOT private.atlas_consult_current(t.id) THEN
   UPDATE public.atlas_team_threads SET state='closed',next_review_at=NULL,revision=revision+1,updated_at=now(),management_data=management_data||'{"consult_invalid":true}' WHERE id=t.id;
   IF j.status='cancelled' THEN UPDATE public.atlas_demands SET state='archived',revision=revision+1,updated_at=now() WHERE owner_id=j.owner_id AND proposal->>'job_id'=j.id::text AND task_id IS NULL AND state<>'archived';END IF;
  ELSIF coalesce((t.management_data->>'dispatch_pending')::boolean,false) AND private.atlas_manager_work(now(),t.owner_id,t.current_person_id)<=now() THEN
   INSERT INTO public.atlas_team_messages(thread_id,role,content) VALUES(t.id,'atlas',t.management_data->>'question');
   UPDATE public.atlas_team_threads SET state='awaiting_reply',next_review_at=private.atlas_manager_work(now()+interval '1 hour',owner_id,current_person_id),management_data=management_data||'{"dispatch_pending":false}',revision=revision+1,updated_at=now() WHERE id=t.id;
  END IF;
 END LOOP;
  IF j.status<>'waiting_team' THEN CONTINUE;END IF;
  v_body:='';pending:=0;invalid:=false;
  FOR item IN SELECT th.*,p.full_name,answer.result AS answer,answer.created_at AS answered_at FROM public.atlas_team_threads th
   LEFT JOIN LATERAL(SELECT r.result,r.created_at,r.actor_id FROM public.atlas_team_requests r WHERE r.thread_id=th.id AND r.state='completed' AND r.applied ORDER BY r.created_at DESC,r.id DESC LIMIT 1) answer ON true
   LEFT JOIN public.profiles p ON p.id=answer.actor_id
   WHERE th.origin_job_id=j.id ORDER BY th.created_at,th.id LOOP
   IF item.management_data->>'consult_invalid'='true' OR NOT private.atlas_consult_current(item.id) THEN invalid:=true;v_body:=v_body||E'\nUma consulta foi interrompida porque a autorização, o cadastro ou o responsável mudou.';
   ELSIF item.management_kind='followup' AND item.management_data->>'consult_organized'='true' AND item.task_id IS NOT NULL THEN
    v_body:=v_body||E'\nTarefa organizada no Planeje: '||(SELECT title FROM public.tarefas WHERE id=item.task_id)||'. O Atlas acompanha o executor e a conferência da entrega. Isso ainda não comprova execução.';
   ELSIF item.state='closed' AND item.answer->>'applied_decision'='resolved' THEN
    v_body:=v_body||E'\n'||item.full_name||' informou em '||to_char(item.answered_at AT TIME ZONE 'America/Sao_Paulo','DD/MM HH24:MI')||': '||left(item.answer->>'summary',2000)||coalesce(E'\nEvidência informada: '||nullif(item.answer->>'evidence_url',''),'');
   ELSE pending:=pending+1;v_body:=v_body||E'\n'||CASE WHEN item.management_data->>'dispatch_pending'='true' THEN 'Pergunta agendada para '||(SELECT full_name FROM public.profiles WHERE id=item.current_person_id)||' em '||to_char((item.management_data->>'scheduled_at')::timestamptz AT TIME ZONE 'America/Sao_Paulo','DD/MM HH24:MI') ELSE 'Aguardando resposta de '||(SELECT full_name FROM public.profiles WHERE id=item.current_person_id) END||'.';
   END IF;
  END LOOP;
  IF invalid THEN v_body:=v_body||E'\nConfira o contexto antes de retomar.';ELSIF pending=0 THEN v_body:=v_body||E'\nRetorno relatado pela equipe; publicação e conteúdo não foram verificados automaticamente.';END IF;
  IF pending=0 OR invalid THEN
   UPDATE public.atlas_jobs SET status=CASE WHEN invalid THEN 'failed' ELSE 'completed' END,result=left(btrim(v_body),20000),error=CASE WHEN invalid THEN 'A autorização ou o contexto da consulta mudou.' ELSE NULL END,finished_at=now() WHERE id=j.id;
   UPDATE public.atlas_inbox SET body=left(btrim(v_body),1200),severity=CASE WHEN invalid THEN 'attention' ELSE 'info' END,state='open',read_at=NULL,updated_at=now() WHERE job_id=j.id;
   UPDATE public.atlas_conversations SET updated_at=now() WHERE id=j.conversation_id AND owner_id=j.owner_id;
   changed:=changed+1;
  ELSIF j.result IS DISTINCT FROM btrim(v_body) THEN UPDATE public.atlas_jobs SET result=left(btrim(v_body),20000) WHERE id=j.id;END IF;
 END LOOP;
 RETURN changed;
END $$;
REVOKE ALL ON FUNCTION public.atlas_manager_sync_consults() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.atlas_manager_sync_consults() TO service_role;

ALTER FUNCTION public.atlas_worker_finish(uuid,uuid,text,text,text,jsonb,jsonb) SET SCHEMA private;
ALTER FUNCTION private.atlas_worker_finish(uuid,uuid,text,text,text,jsonb,jsonb) RENAME TO atlas_worker_finish_analysis;
REVOKE ALL ON FUNCTION private.atlas_worker_finish_analysis(uuid,uuid,text,text,text,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.atlas_worker_finish_analysis(uuid,uuid,text,text,text,jsonb,jsonb) TO service_role;
CREATE FUNCTION public.atlas_worker_finish(p_job_id uuid,p_lease uuid,p_status text,p_result text,p_error text,p_steps jsonb,p_usage jsonb) RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF NOT private.atlas_worker_finish_analysis(p_job_id,p_lease,p_status,p_result,p_error,p_steps,p_usage) THEN RETURN false;END IF;
 IF EXISTS(SELECT 1 FROM public.atlas_team_threads WHERE origin_job_id=p_job_id) THEN
  -- The internal question is durable even if the model fails after sending it.
  UPDATE public.atlas_jobs j SET status='waiting_team',finished_at=NULL,error=NULL,
   steps=j.steps||coalesce((SELECT jsonb_agg(jsonb_build_object('kind','internal_question','status','pending','thread_id',th.id,'summary','Pergunta interna registrada.')) FROM public.atlas_team_threads th WHERE th.origin_job_id=j.id AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(j.steps) s WHERE s->>'thread_id'=th.id::text)),'[]'::jsonb)
   WHERE j.id=p_job_id;
  PERFORM public.atlas_manager_sync_consults();
  UPDATE public.atlas_inbox i SET body=left(j.result,1200),severity='info',updated_at=now() FROM public.atlas_jobs j WHERE i.job_id=j.id AND j.id=p_job_id AND j.status='waiting_team';
 END IF;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.atlas_worker_finish(uuid,uuid,text,text,text,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.atlas_worker_finish(uuid,uuid,text,text,text,jsonb,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.atlas_team_worker_snapshot() RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('thread',to_jsonb(t),
 'task_exists',EXISTS(SELECT 1 FROM public.tarefas x WHERE x.id=t.task_id AND x.client_id=t.client_id),
 'task_terminal',EXISTS(SELECT 1 FROM public.tarefas x JOIN public.task_statuses s ON s.value=x.status AND s.is_terminal WHERE x.id=t.task_id AND x.client_id=t.client_id),
 'recipient_active',p.status='active' AND p.role IN('admin','superadmin','colaborador'),
 'recipient_valid',CASE WHEN t.origin_job_id IS NOT NULL THEN private.atlas_consult_current(t.id) ELSE t.current_person_id IN(t.owner_id,t.account_person_id) OR EXISTS(SELECT 1 FROM public.tarefas x WHERE x.id=t.task_id AND x.client_id=t.client_id AND t.current_person_id=ANY(x.assignee_ids)) END,
 'hours',coalesce((SELECT jsonb_build_object('start_time',h.start_time,'end_time',h.end_time) FROM public.atlas_team_hours h WHERE h.owner_id=t.owner_id AND h.person_id=t.current_person_id),'{}'))),'[]')
 FROM public.atlas_team_threads t JOIN public.atlas_team_config c ON c.owner_id=t.owner_id AND c.enabled LEFT JOIN public.profiles p ON p.id=t.current_person_id
 WHERE t.state IN('awaiting_reply','waiting_review') AND NOT EXISTS(SELECT 1 FROM public.atlas_team_requests r WHERE r.thread_id=t.id AND r.state='processing' AND r.created_at>now()-interval '2 minutes');
$$;

CREATE OR REPLACE FUNCTION private.atlas_manager_finish(p_id uuid,p_result jsonb,p_usage jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE t public.atlas_team_threads;r public.atlas_team_requests;actor uuid;kind text;selected uuid;task public.tarefas;v_title text;body text;review timestamptz;expected timestamptz;due date;initial text;tasktype text;days integer;existing uuid;name text;owner_thread uuid;parent uuid;resume boolean:=false;basis text;tasks_basis text;question_override text;
BEGIN
 SELECT * INTO r FROM public.atlas_team_requests WHERE id=p_id;
 SELECT * INTO t FROM public.atlas_team_threads WHERE id=r.thread_id FOR UPDATE;
 SELECT * INTO r FROM public.atlas_team_requests WHERE id=p_id FOR UPDATE;
 IF r.state='completed' AND r.applied THEN RETURN jsonb_build_object('saved',true,'replayed',true,'task_id',t.task_id);END IF;
 IF r.state='completed' AND NOT r.applied AND t.management_data->>'pending_request_id'=r.id::text THEN resume:=true;p_result:=r.result;p_usage:=r.usage;END IF;
 IF r.id IS NULL OR r.state<>'processing' AND NOT resume OR t.management_kind IS NULL OR NOT coalesce(private.atlas_manager_live(t.owner_id),false) OR t.revision<>r.thread_revision
 OR NOT EXISTS(SELECT 1 FROM auth.sessions WHERE id=r.session_id AND user_id=r.actor_id)
 OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=r.actor_id AND status='active' AND role IN('admin','superadmin','colaborador'))
 OR r.actor_id NOT IN(t.owner_id,t.current_person_id) THEN RAISE EXCEPTION 'Sessão, política ou conversa mudou.' USING ERRCODE='42501';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.atlas_event_config WHERE owner_id=t.owner_id AND t.client_id=ANY(client_ids)) OR NOT EXISTS(SELECT 1 FROM public.clientes WHERE id=t.client_id AND etapa='closed') THEN RAISE EXCEPTION 'Cliente fora da carteira autorizada.';END IF;
 IF t.origin_job_id IS NOT NULL AND NOT private.atlas_consult_current(t.id) THEN RAISE EXCEPTION 'A origem da consulta mudou.' USING ERRCODE='42501';END IF;
 kind:=p_result->>'decision';actor:=r.actor_id;
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
    IF EXISTS(SELECT 1 FROM public.atlas_team_threads x WHERE x.owner_id=t.owner_id AND x.task_id=task.id AND x.id<>t.id AND x.state<>'closed') THEN kind:='ask';question_override:='Já estou acompanhando essa tarefa em outra conversa. Vamos seguir por lá para não cobrar duas vezes.';END IF;
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
   IF actor<>t.account_person_id OR NOT EXISTS(SELECT 1 FROM public.tarefas x WHERE x.id=t.task_id AND x.client_id=t.client_id AND selected=ANY(x.assignee_ids)) THEN RAISE EXCEPTION 'A confirmação deve ir a um responsável já vinculado à tarefa.';END IF;
   UPDATE public.atlas_team_threads SET current_person_id=selected,state='awaiting_reply',next_review_at=private.atlas_manager_work(review,owner_id,selected),expected_at=expected,summary=p_result->>'summary',revision=revision+1,reminder_day=NULL,reminders_today=0,updated_at=now() WHERE id=t.id;
   body:='Quem cuida da conta explicou: '||(p_result->>'summary')||' Como está esse trabalho agora? Me conta para eu acompanhar daqui.';
  ELSE
   UPDATE public.atlas_team_threads SET state=CASE WHEN kind='ask' THEN 'awaiting_reply' ELSE 'waiting_review' END,next_review_at=review,expected_at=expected,summary=p_result->>'summary',revision=revision+1,reminder_day=NULL,reminders_today=0,updated_at=now() WHERE id=t.id;
  END IF;
 END IF;
 INSERT INTO public.atlas_team_messages(thread_id,role,content) VALUES(t.id,'atlas',body);
 UPDATE public.atlas_team_requests SET state='completed',applied=kind<>'queued',thread_revision=(SELECT revision FROM public.atlas_team_threads WHERE id=t.id),result=p_result||jsonb_build_object('applied_decision',kind,'task_id',task.id,'client_basis',basis,'tasks_basis',tasks_basis),usage=p_usage WHERE id=r.id;
 RETURN jsonb_build_object('saved',true,'decision',kind,'task_id',task.id);
END $$;

NOTIFY pgrst,'reload schema';
COMMIT;

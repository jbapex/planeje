BEGIN;

-- A late consultation must not undo a human review or an unresolved owner decision.
CREATE FUNCTION private.atlas_manager_preserve_return_pause() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF NEW.management_data->'owner_contact_return' IS DISTINCT FROM OLD.management_data->'owner_contact_return'
 AND NEW.management_data ? 'owner_contact_return'
 AND (OLD.state IN('closed','needs_owner','delivery_review') OR EXISTS(SELECT 1 FROM public.atlas_team_threads d
 WHERE d.owner_id=OLD.owner_id AND d.client_id=OLD.client_id AND d.management_data->>'parent_thread'=OLD.id::text AND d.state<>'closed')) THEN
  NEW.state:=OLD.state;NEW.current_person_id:=OLD.current_person_id;NEW.next_review_at:=OLD.next_review_at;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.atlas_manager_preserve_return_pause() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER atlas_manager_preserve_return_pause BEFORE UPDATE OF management_data ON public.atlas_team_threads
 FOR EACH ROW EXECUTE FUNCTION private.atlas_manager_preserve_return_pause();

-- Only newly applied replies schedule work; publication never replays old answers.
CREATE FUNCTION private.atlas_manager_answer_continuation() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE child public.atlas_team_threads;parent public.atlas_team_threads;receipt jsonb;
BEGIN
 IF NEW.state<>'completed' OR NOT NEW.applied OR OLD.state='completed' AND OLD.applied THEN RETURN NEW;END IF;
 SELECT * INTO child FROM public.atlas_team_threads WHERE id=NEW.thread_id;
 receipt:=jsonb_build_object('kind','team_reply','request_id',NEW.id,'thread_id',child.id,'actor_id',NEW.actor_id,'at',now(),'summary',left(NEW.result->>'summary',2000),'decision',NEW.result->>'applied_decision','state','pending');
 IF child.management_kind='consultation' AND child.management_data ? 'owner_contact_request_id' AND child.state='closed' THEN
  SELECT t.* INTO parent FROM public.atlas_team_threads t JOIN public.atlas_team_requests r ON r.thread_id=t.id
   WHERE r.id=(child.management_data->>'owner_contact_request_id')::uuid AND t.owner_id=child.owner_id AND t.client_id=child.client_id
   AND t.management_data->'owner_contact_return'->>'thread_id'=child.id::text FOR UPDATE OF t;
  IF parent.id IS NOT NULL AND parent.state='waiting_review' AND parent.next_review_at IS NULL
   AND NOT EXISTS(SELECT 1 FROM public.atlas_team_threads d WHERE d.owner_id=parent.owner_id AND d.client_id=parent.client_id AND d.management_data->>'parent_thread'=parent.id::text AND d.state<>'closed') THEN
   UPDATE public.atlas_team_threads SET management_data=management_data||jsonb_build_object('continuation',receipt),
    next_review_at=private.atlas_manager_work(now(),owner_id,current_person_id),revision=revision+1,updated_at=now() WHERE id=parent.id;
  END IF;
 END IF;
 IF child.origin_job_id IS NOT NULL AND (child.state='closed' OR child.management_data->>'consult_organized'='true') THEN
  UPDATE public.atlas_team_threads SET management_data=management_data||jsonb_build_object('central_continuation',receipt),updated_at=now() WHERE id=child.id;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.atlas_manager_answer_continuation() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER atlas_manager_answer_continuation AFTER UPDATE OF state,applied ON public.atlas_team_requests
 FOR EACH ROW EXECUTE FUNCTION private.atlas_manager_answer_continuation();

-- A task picked by a human is new operational information, not a finished delivery.
CREATE FUNCTION private.atlas_manager_task_reference_continuation() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE t public.atlas_team_threads;task public.tarefas;
BEGIN
 IF NEW.role<>'human' OR NOT coalesce(NEW.proposal ? 'selected_task_id',false) THEN RETURN NEW;END IF;
 SELECT * INTO t FROM public.atlas_team_threads WHERE id=NEW.thread_id;
 IF t.origin_job_id IS NULL OR t.management_kind='owner_context' THEN RETURN NEW;END IF;
 SELECT * INTO task FROM public.tarefas WHERE id=(NEW.proposal->>'selected_task_id')::uuid AND client_id=t.client_id;
 IF task.id IS NULL OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(t.management_data->'task_references','[]')) ref WHERE ref->>'task_id'=task.id::text)
 THEN RETURN NEW;END IF;
 UPDATE public.atlas_team_threads SET management_data=management_data||jsonb_build_object('central_continuation',jsonb_build_object(
  'kind','task_reference','message_id',NEW.id,'actor_id',NEW.actor_id,'at',NEW.created_at,'summary','A conta indicou a tarefa: '||left(task.title,180)||'. A entrega ainda precisa ser conferida.',
  'task_id',task.id,'decision','task_reference','state','pending')),updated_at=now() WHERE id=t.id;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.atlas_manager_task_reference_continuation() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER atlas_manager_task_reference_continuation AFTER INSERT ON public.atlas_team_messages
 FOR EACH ROW EXECUTE FUNCTION private.atlas_manager_task_reference_continuation();

CREATE FUNCTION public.atlas_manager_continue(p_thread uuid,p_revision integer,p_request uuid,p_task_version text) RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE t public.atlas_team_threads;record jsonb;target uuid;executors uuid[];review timestamptz;next_state text;account uuid;human_review timestamptz;due timestamptz;consultation public.atlas_team_threads;continuation jsonb;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'Acesso exclusivo do worker.' USING ERRCODE='42501';END IF;
 SELECT * INTO t FROM public.atlas_team_threads WHERE id=p_thread FOR UPDATE;
 IF t.id IS NULL OR t.revision<>p_revision OR t.state<>'waiting_review' OR t.management_data->'continuation'->>'state' IS DISTINCT FROM 'pending'
 OR t.management_data->'continuation'->>'request_id' IS DISTINCT FROM p_request::text OR t.next_review_at IS NULL OR t.next_review_at>now()
 OR NOT private.atlas_manager_live(t.owner_id) OR t.account_person_id IS DISTINCT FROM private.atlas_manager_account(t.owner_id,t.client_id)
 OR NOT EXISTS(SELECT 1 FROM public.atlas_team_config WHERE owner_id=t.owner_id AND enabled)
 OR NOT EXISTS(SELECT 1 FROM public.atlas_event_config WHERE owner_id=t.owner_id AND t.client_id=ANY(client_ids))
 OR NOT EXISTS(SELECT 1 FROM public.clientes WHERE id=t.client_id AND etapa='closed')
 OR EXISTS(SELECT 1 FROM public.atlas_team_threads d WHERE d.owner_id=t.owner_id AND d.client_id=t.client_id AND d.management_data->>'parent_thread'=t.id::text AND d.state<>'closed')
 OR NOT private.atlas_owner_contact_current((t.management_data->'continuation'->>'thread_id')::uuid)
 THEN RETURN false;END IF;
 record:=private.atlas_task_record(t.id);
 IF record->>'source_version' IS DISTINCT FROM p_task_version THEN RETURN false;END IF;
 SELECT * INTO consultation FROM public.atlas_team_threads WHERE id=(t.management_data->'continuation'->>'thread_id')::uuid FOR UPDATE;
 account:=private.atlas_manager_account(t.owner_id,t.client_id);
 target:=account;next_state:='waiting_review';
 IF t.task_id IS NULL OR record IS NULL THEN next_state:='needs_owner';target:=t.owner_id;
 ELSIF coalesce((record->>'terminal')::boolean,false) OR coalesce((record->>'publication_ready')::boolean,false) THEN next_state:='delivery_review';
 ELSE
  SELECT array_agg(p.id ORDER BY p.id) INTO executors FROM public.profiles p
   WHERE p.id IN(SELECT jsonb_array_elements_text(record->'assignee_ids')::uuid) AND p.status='active' AND p.role IN('admin','superadmin','colaborador');
  IF cardinality(executors)=1 THEN target:=executors[1];END IF;
 END IF;
 IF target IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=target AND status='active' AND role IN('admin','superadmin','colaborador')) THEN target:=t.owner_id;next_state:='needs_owner';END IF;
 IF next_state='waiting_review' THEN
  human_review:=coalesce(nullif(consultation.management_data->>'explicit_review_at','')::timestamptz,nullif(t.management_data->>'explicit_review_at','')::timestamptz);
  SELECT min(at) INTO due FROM (SELECT stage_due_at AS at FROM public.tarefas WHERE id=t.task_id AND stage_due_at>now()
   UNION ALL SELECT due_date::timestamp AT TIME ZONE 'America/Sao_Paulo' FROM public.tarefas WHERE id=t.task_id AND due_date>(now() AT TIME ZONE 'America/Sao_Paulo')::date
   UNION ALL SELECT post_date::timestamp AT TIME ZONE 'America/Sao_Paulo' FROM public.tarefas WHERE id=t.task_id AND post_date>(now() AT TIME ZONE 'America/Sao_Paulo')::date) deadlines;
  review:=private.atlas_manager_work(CASE WHEN human_review>now() THEN human_review ELSE coalesce(CASE WHEN consultation.expected_at>now() THEN consultation.expected_at END,due,now()+interval '1 hour') END,t.owner_id,target);
 END IF;
 continuation:=(t.management_data->'continuation')||jsonb_build_object('state','applied','applied_at',now(),'task_source_version',p_task_version);
 IF t.current_person_id=t.owner_id AND t.task_id IS NOT NULL AND next_state<>'needs_owner' THEN
  -- Keep the owner's history private; the operational-only consultation becomes the canonical followup.
  UPDATE public.atlas_team_threads SET task_id=NULL,origin_job_id=NULL,source_key='owner-continuation:'||id::text,
   management_kind='owner_context',state='waiting_review',next_review_at=NULL,
   management_data=management_data||jsonb_build_object('continuation',continuation,'parent_thread',consultation.id,'linked_task_id',t.task_id,'linked_followup_thread_id',consultation.id,
    'continuation_origin_job_id',t.origin_job_id,'followup_linked',true,'needs_account',false,
    'dialogue',coalesce(management_data->'dialogue','{}')||jsonb_build_object('waiting_on','none','next_action','Acompanhar a execução vinculada','missing_field',NULL)),
   revision=revision+1,updated_at=now() WHERE id=t.id;
  UPDATE public.atlas_team_threads SET source_key=t.source_key,origin_job_id=t.origin_job_id,management_kind='followup',
   current_person_id=target,state=next_state,next_review_at=review,
   management_data=(management_data-'owner_contact_request_id'-'dispatch_pending')||jsonb_build_object('consult_organized',t.origin_job_id IS NOT NULL,'recipient_basis','assignee',
    'continuation_source',jsonb_build_object('owner_thread_id',t.id,'request_id',p_request,'at',now()),
    'dialogue',coalesce(management_data->'dialogue','{}')||jsonb_build_object('waiting_on',CASE WHEN next_state='delivery_review' THEN 'self' ELSE 'team' END,'next_action',CASE WHEN next_state='delivery_review' THEN 'Conferir a entrega registrada' ELSE 'Acompanhar a etapa oficial e os prazos registrados' END,'missing_field',NULL))
    ||CASE WHEN human_review>now() THEN jsonb_build_object('explicit_review_at',human_review) ELSE '{}'::jsonb END,
   revision=revision+1,updated_at=now() WHERE id=consultation.id;
  RETURN true;
 END IF;
 UPDATE public.atlas_team_threads SET current_person_id=target,state=next_state,next_review_at=review,
  management_data=jsonb_set(management_data,'{continuation}',(management_data->'continuation')||jsonb_build_object('state','applied','applied_at',now(),'task_source_version',p_task_version))||jsonb_build_object('continuation_task_context',jsonb_build_object('status',record->>'status','assignee_ids',record->'assignee_ids','source_version',record->>'source_version')),
  revision=revision+1,updated_at=now() WHERE id=t.id;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.atlas_manager_continue(uuid,integer,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.atlas_manager_continue(uuid,integer,uuid,text) TO service_role;

-- Continuation is private under the job's existing owner-only RLS and queue lease.
ALTER TABLE public.atlas_jobs ADD COLUMN continuation jsonb NOT NULL DEFAULT '{}';
COMMENT ON COLUMN public.atlas_jobs.continuation IS 'New attributed operational returns; same objective and conversation, never proof of delivery.';
CREATE FUNCTION private.atlas_job_continuation_initial() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF NEW.continuation<>'{}'::jsonb THEN RAISE EXCEPTION 'Retorno operacional só pode vir de uma resposta registrada.' USING ERRCODE='42501';END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.atlas_job_continuation_initial() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER atlas_job_continuation_initial BEFORE INSERT ON public.atlas_jobs
 FOR EACH ROW EXECUTE FUNCTION private.atlas_job_continuation_initial();


CREATE OR REPLACE FUNCTION private.atlas_consult_current(p_thread uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.atlas_team_threads t JOIN public.atlas_jobs j ON j.id=t.origin_job_id
 JOIN public.atlas_conversations c ON c.id=j.conversation_id AND c.owner_id=j.owner_id
 JOIN public.clientes cl ON cl.id=t.client_id AND cl.etapa='closed'
 JOIN public.profiles p ON p.id=t.current_person_id AND p.status='active' AND p.role IN('admin','superadmin','colaborador')
 JOIN public.atlas_event_config cfg ON cfg.owner_id=j.owner_id AND t.client_id=ANY(cfg.client_ids)
 WHERE t.id=p_thread AND j.owner_id=t.owner_id AND j.status IN('queued','running','waiting_team','completed')
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

CREATE OR REPLACE FUNCTION public.atlas_manager_sync_consults() RETURNS integer
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE t public.atlas_team_threads;j public.atlas_jobs;item record;v_body text;pending integer;invalid boolean;changed integer:=0;returns jsonb;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'Acesso exclusivo do worker.' USING ERRCODE='42501';END IF;
 -- Job before thread is the same lock order used by consult/finish.
 FOR j IN SELECT x.* FROM public.atlas_jobs x WHERE EXISTS(SELECT 1 FROM public.atlas_team_threads th WHERE th.origin_job_id=x.id AND (x.status='waiting_team' OR th.state<>'closed' OR th.management_data->'central_continuation'->>'state'='pending')) ORDER BY x.id FOR UPDATE SKIP LOCKED LOOP
 FOR t IN SELECT * FROM public.atlas_team_threads WHERE origin_job_id=j.id AND state<>'closed' ORDER BY id FOR UPDATE LOOP
  IF NOT private.atlas_consult_current(t.id) THEN
   UPDATE public.atlas_team_threads SET state='closed',next_review_at=NULL,revision=revision+1,updated_at=now(),management_data=management_data||'{"consult_invalid":true}' WHERE id=t.id;
   IF j.status='cancelled' THEN UPDATE public.atlas_demands SET state='archived',revision=revision+1,updated_at=now() WHERE owner_id=j.owner_id AND proposal->>'job_id'=j.id::text AND task_id IS NULL AND state<>'archived';END IF;
  ELSIF coalesce((t.management_data->>'dispatch_pending')::boolean,false) AND private.atlas_manager_work(now(),t.owner_id,t.current_person_id)<=now() THEN
   INSERT INTO public.atlas_team_messages(thread_id,role,content) VALUES(t.id,'atlas',t.management_data->>'question');
   UPDATE public.atlas_team_threads SET state='awaiting_reply',next_review_at=private.atlas_manager_work(now()+interval '1 hour',owner_id,current_person_id),management_data=management_data||'{"dispatch_pending":false}',revision=revision+1,updated_at=now() WHERE id=t.id;
  END IF;
 END LOOP;
  IF j.status NOT IN('waiting_team','completed') THEN CONTINUE;END IF;
  IF j.status='completed' AND NOT EXISTS(SELECT 1 FROM public.atlas_team_threads th WHERE th.origin_job_id=j.id AND th.management_data->'central_continuation'->>'state'='pending') THEN CONTINUE;END IF;
  v_body:='';pending:=0;invalid:=false;
  FOR item IN SELECT th.*,p.full_name,answer.result AS answer,answer.created_at AS answered_at FROM public.atlas_team_threads th
   LEFT JOIN LATERAL(SELECT r.result,r.created_at,r.actor_id FROM public.atlas_team_requests r WHERE r.thread_id=th.id AND r.state='completed' AND r.applied ORDER BY r.created_at DESC,r.id DESC LIMIT 1) answer ON true
   LEFT JOIN public.profiles p ON p.id=answer.actor_id
   WHERE th.origin_job_id=j.id ORDER BY th.created_at,th.id LOOP
   IF item.management_data->>'consult_invalid'='true' OR NOT private.atlas_consult_current(item.id) THEN invalid:=true;v_body:=v_body||E'\nUma consulta foi interrompida porque a autorização, o cadastro ou o responsável mudou.';
   ELSIF item.state='closed' AND jsonb_array_length(coalesce(item.management_data->'task_references','[]'))>0 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(item.management_data->'task_references') ref WHERE NOT EXISTS(SELECT 1 FROM public.tarefas x WHERE x.id=(ref->>'task_id')::uuid AND x.client_id=item.client_id)) THEN
    v_body:=v_body||E'\nA conta indicou tarefa(s) já existente(s) no Planeje: '||(SELECT string_agg(DISTINCT x.title,', ') FROM jsonb_array_elements(item.management_data->'task_references') ref JOIN public.tarefas x ON x.id=(ref->>'task_id')::uuid AND x.client_id=item.client_id)||'. O vínculo foi registrado; a execução continua no acompanhamento da tarefa e ainda não foi comprovada.';
   ELSIF item.management_kind='followup' AND item.management_data->>'consult_organized'='true' AND item.task_id IS NOT NULL THEN
    v_body:=v_body||E'\nTarefa organizada no Planeje: '||(SELECT title FROM public.tarefas WHERE id=item.task_id)||'. O Atlas acompanha o executor e a conferência da entrega. Isso ainda não comprova execução.';
   ELSIF item.state='closed' AND item.answer->>'applied_decision'='resolved' THEN
    v_body:=v_body||E'\n'||item.full_name||' informou em '||to_char(item.answered_at AT TIME ZONE 'America/Sao_Paulo','DD/MM HH24:MI')||': '||left(item.answer->>'summary',2000)||coalesce(E'\nEvidência informada: '||nullif(item.answer->>'evidence_url',''),'');
   ELSE pending:=pending+1;v_body:=v_body||E'\n'||CASE WHEN item.management_data->>'dispatch_pending'='true' THEN 'Pergunta agendada para '||(SELECT full_name FROM public.profiles WHERE id=item.current_person_id)||' em '||to_char((item.management_data->>'scheduled_at')::timestamptz AT TIME ZONE 'America/Sao_Paulo','DD/MM HH24:MI') ELSE 'Aguardando resposta de '||(SELECT full_name FROM public.profiles WHERE id=item.current_person_id) END||'.';
   END IF;
  END LOOP;
  IF invalid THEN v_body:=v_body||E'\nConfira o contexto antes de retomar.';ELSIF pending=0 THEN v_body:=v_body||E'\nRetorno relatado pela equipe; publicação e conteúdo não foram verificados automaticamente.';END IF;
  SELECT coalesce(jsonb_agg(value),'[]') INTO returns FROM (
   SELECT (th.management_data->'central_continuation')||jsonb_build_object('client_id',th.client_id,
    'task_id',coalesce(th.task_id,(th.management_data->'central_continuation'->>'task_id')::uuid),
    'execution_pending',th.management_data->'central_continuation'->>'kind'='task_reference' OR th.state<>'closed','delivery_verified',false) AS value
   FROM public.atlas_team_threads th
   LEFT JOIN public.atlas_team_requests r ON r.id=(th.management_data->'central_continuation'->>'request_id')::uuid AND r.thread_id=th.id
   LEFT JOIN public.atlas_team_messages m ON m.id=(th.management_data->'central_continuation'->>'message_id')::uuid AND m.thread_id=th.id
   WHERE th.origin_job_id=j.id AND th.management_data->'central_continuation'->>'state'='pending'
   AND (r.state='completed' AND r.applied AND r.actor_id=(th.management_data->'central_continuation'->>'actor_id')::uuid
    OR th.management_data->'central_continuation'->>'kind'='task_reference' AND m.role='human' AND m.actor_id=(th.management_data->'central_continuation'->>'actor_id')::uuid
     AND m.proposal->>'selected_task_id'=th.management_data->'central_continuation'->>'task_id'
     AND EXISTS(SELECT 1 FROM public.tarefas x WHERE x.id=(m.proposal->>'selected_task_id')::uuid AND x.client_id=th.client_id))
   AND private.atlas_consult_current(th.id) ORDER BY coalesce(r.created_at,m.created_at) DESC,th.id DESC LIMIT 80
  ) received;
  IF (SELECT count(*) FROM public.atlas_team_threads th WHERE th.origin_job_id=j.id AND th.management_data->'central_continuation'->>'state'='pending')<>jsonb_array_length(returns) THEN
   invalid:=true;v_body:=v_body||E'\nA fonte de um retorno mudou. Confira os registros antes de retomar a investigação.';
  END IF;
  IF NOT invalid AND pending=0 AND jsonb_array_length(returns)>0 AND private.atlas_source_session_exists(j.owner_id,j.source_session_id) THEN
   -- Reset attempt per new human return, not per stale worker retry; preserve usage/history.
   UPDATE public.atlas_jobs SET status='queued',attempt=0,lease_token=NULL,lease_until=NULL,finished_at=NULL,error=NULL,
    result=left(btrim(v_body)||E'\nRetorno recebido. Vou conferir as fontes atuais e continuar este mesmo assunto.',20000),
    continuation=jsonb_build_object('reason','team_reply','received_at',now(),'round',coalesce((continuation->>'round')::integer,0)+1,'returns',returns),
    steps=steps||jsonb_build_array(jsonb_build_object('kind','continuation','status','queued','at',now(),'summary','Retorno operacional recebido; investigação retomada no mesmo assunto.'))
   WHERE id=j.id;
   UPDATE public.atlas_team_threads SET management_data=jsonb_set(management_data,'{central_continuation,state}','"queued"')
    WHERE origin_job_id=j.id AND management_data->'central_continuation'->>'state'='pending' AND EXISTS(SELECT 1 FROM jsonb_array_elements(returns) ret WHERE ret->>'thread_id'=atlas_team_threads.id::text);
   UPDATE public.atlas_inbox SET body='A equipe trouxe informação nova. O Atlas vai conferir as fontes e continuar o mesmo assunto.',severity='info',state='open',read_at=NULL,updated_at=now() WHERE job_id=j.id;
   UPDATE public.atlas_conversations SET updated_at=now() WHERE id=j.conversation_id AND owner_id=j.owner_id;
   changed:=changed+1;CONTINUE;
  END IF;
  IF pending=0 OR invalid THEN
   UPDATE public.atlas_jobs SET status=CASE WHEN invalid THEN 'failed' ELSE 'completed' END,result=left(btrim(v_body),20000),error=CASE WHEN invalid THEN 'A autorização ou o contexto da consulta mudou.' ELSE NULL END,finished_at=now() WHERE id=j.id;
   UPDATE public.atlas_inbox SET body=left(btrim(v_body),1200),severity=CASE WHEN invalid THEN 'attention' ELSE 'info' END,state='open',read_at=NULL,updated_at=now() WHERE job_id=j.id;
   UPDATE public.atlas_conversations SET updated_at=now() WHERE id=j.conversation_id AND owner_id=j.owner_id;
   changed:=changed+1;
  ELSIF j.result IS DISTINCT FROM btrim(v_body) THEN UPDATE public.atlas_jobs SET result=left(btrim(v_body),20000) WHERE id=j.id;END IF;
 END LOOP;
 RETURN changed;
END $$;

CREATE OR REPLACE FUNCTION public.atlas_worker_finish(p_job_id uuid,p_lease uuid,p_status text,p_result text,p_error text,p_steps jsonb,p_usage jsonb) RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF NOT private.atlas_worker_finish_analysis(p_job_id,p_lease,p_status,p_result,p_error,p_steps,p_usage) THEN RETURN false;END IF;
 IF EXISTS(SELECT 1 FROM public.atlas_team_threads WHERE origin_job_id=p_job_id AND (management_data->'central_continuation'->>'state'='pending' OR state<>'closed' AND management_data->'central_continuation'->>'state' IS DISTINCT FROM 'queued')) THEN
  -- The internal question is durable even if the model fails after sending it.
  UPDATE public.atlas_jobs j SET status='waiting_team',finished_at=NULL,error=NULL,
   steps=j.steps||coalesce((SELECT jsonb_agg(jsonb_build_object('kind','internal_question','status','pending','thread_id',th.id,'summary','Pergunta interna registrada.')) FROM public.atlas_team_threads th WHERE th.origin_job_id=j.id AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(j.steps) s WHERE s->>'thread_id'=th.id::text)),'[]'::jsonb)
   WHERE j.id=p_job_id;
  PERFORM public.atlas_manager_sync_consults();
  UPDATE public.atlas_inbox i SET body=left(j.result,1200),severity='info',updated_at=now() FROM public.atlas_jobs j WHERE i.job_id=j.id AND j.id=p_job_id AND j.status='waiting_team';
 END IF;
 RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.atlas_manager_consult(p_job uuid,p_lease uuid,p_client uuid,p_task uuid,p_question text,p_person uuid DEFAULT NULL,p_mode text DEFAULT 'consult') RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE j public.atlas_jobs;r public.atlas_runs;task public.tarefas;person public.profiles;account uuid;recipient uuid;people uuid[];basis text;thread uuid;source text;body text;at_work timestamptz;reused boolean:=false;demand uuid;answered public.atlas_team_threads;answer public.atlas_team_requests;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'Acesso exclusivo do worker.' USING ERRCODE='42501';END IF;
 SELECT * INTO j FROM public.atlas_jobs WHERE id=p_job FOR UPDATE;
 SELECT * INTO r FROM public.atlas_runs WHERE id=j.origin_run_id;
 IF j.id IS NULL OR j.status<>'running' OR j.lease_token IS DISTINCT FROM p_lease OR j.lease_until<=now()
 OR NOT coalesce(private.atlas_manager_live(j.owner_id),false)
 OR NOT private.atlas_source_session_exists(j.owner_id,j.source_session_id)
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
 IF reused THEN
  SELECT * INTO answered FROM public.atlas_team_threads WHERE id=thread;
  IF NOT private.atlas_consult_current(thread) THEN RETURN jsonb_build_object('available',false,'requires_owner',true,'reason','O contexto desta consulta mudou; consulte os registros atuais antes de encaminhar outra pergunta.');END IF;
  IF answered.state='closed' THEN
   SELECT * INTO answer FROM public.atlas_team_requests WHERE thread_id=thread AND state='completed' AND applied ORDER BY created_at DESC,id DESC LIMIT 1;
   RETURN jsonb_build_object('available',true,'thread_id',thread,'recipient',person.full_name,'state','answered','reused',true,'delivery_verified',false,
    'answer_summary',coalesce(answer.result->>'summary',answered.summary),'answer_source',jsonb_build_object('kind',CASE WHEN answer.id IS NULL THEN 'task_reference' ELSE 'team_reply' END,'thread_id',thread,'request_id',answer.id,'actor_id',answer.actor_id,'at',coalesce(answer.created_at,answered.updated_at)));
  END IF;
 END IF;
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

NOTIFY pgrst,'reload schema';
COMMIT;

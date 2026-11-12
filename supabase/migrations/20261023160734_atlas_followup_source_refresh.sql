BEGIN;

CREATE FUNCTION private.atlas_record_time(p_value text) RETURNS timestamptz
LANGUAGE plpgsql STABLE STRICT SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF p_value !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T.*(Z|[+-][0-9]{2}:[0-9]{2})$' THEN RETURN NULL;END IF;
 RETURN p_value::timestamptz;
EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION private.atlas_record_time(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.atlas_record_time(text) TO authenticated,service_role;

CREATE FUNCTION private.atlas_record_publication_ready(p_task jsonb) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF jsonb_typeof(p_task->'planned_channels') IS DISTINCT FROM 'array' OR jsonb_typeof(p_task->'publications') IS DISTINCT FROM 'array' THEN RETURN false;END IF;
 IF jsonb_array_length(p_task->'planned_channels')=0 THEN RETURN false;END IF;
 RETURN coalesce((lower(coalesce(p_task->>'status_value','')) IN('agendar','agendado','publicado','publicação','publicacao','youtube')
   OR lower(coalesce(p_task->>'status','')) IN('agendar','agendado','publicado','publicação','publicacao','youtube'))
  AND lower(coalesce(p_task->>'status_value','')) NOT IN('alteração','alteracao','changes','rework')
  AND lower(coalesce(p_task->>'status','')) NOT IN('alteração','alteracao','changes','rework')
  AND (p_task->'coverage'->>'publications_total')::integer=jsonb_array_length(p_task->'publications')
  AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_task->'publications') pub WHERE pub->>'status' NOT IN('published','cancelled'))
  AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_task->'planned_channels') channel
   WHERE jsonb_typeof(channel)<>'string' OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_task->'publications') pub
    WHERE pub->>'channel'=channel#>>'{}' AND pub->>'status'='published' AND pub->>'after_last_rework'='true')),false);
END $$;
REVOKE ALL ON FUNCTION private.atlas_record_publication_ready(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.atlas_record_publication_ready(jsonb) TO authenticated,service_role;

-- Extend the existing, RLS-scoped task reader; never expose the client row.
CREATE OR REPLACE FUNCTION private.atlas_task_record(p_thread uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 WITH record AS (
 SELECT (
  SELECT jsonb_object_agg(key,value) FROM jsonb_each(to_jsonb(x)) WHERE key=ANY(ARRAY[
   'id','title','type','priority','due_date','post_date','project_id','client_id','assignee_ids',
   'briefing_payload','briefing_estado','briefing_completo','briefing_legado','briefing_validado_em',
   'stage_execution_history','operational_function_id','demand_type','demand_origin','sla_days',
   'customer_promised_date','review_round','reschedule_reason','planned_channels',
   'workflow_template_id','workflow_stage_key','production_delivered_at','production_delivery_attachment_id',
   'stage_started_at','stage_due_at','recording_scheduled_on'])
 )||jsonb_build_object(
  'description',left(coalesce(x.description,''),12000),'status_value',x.status,'status',coalesce(s.label,x.status),'terminal',coalesce(s.is_terminal,false),
  'assignees',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.full_name,'status',p.status) ORDER BY p.id),'[]') FROM public.profiles p WHERE p.id=ANY(x.assignee_ids)),
  'status_history',(SELECT coalesce(jsonb_agg(entry ORDER BY ord),'[]') FROM (SELECT entry,ord FROM jsonb_array_elements(CASE WHEN jsonb_typeof(x.status_history)='array' THEN x.status_history ELSE '[]' END) WITH ORDINALITY a(entry,ord) ORDER BY ord DESC LIMIT 30) h),
  'comments',(SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.at,c.id),'[]') FROM (SELECT tc.id,tc.user_id,p.full_name author,tc.created_at at,left(tc.content,3000) body,length(tc.content)>3000 body_truncated FROM public.task_comments tc LEFT JOIN public.profiles p ON p.id=tc.user_id WHERE tc.task_id=x.id ORDER BY tc.created_at DESC,tc.id DESC LIMIT 30) c),
  'justifications',(SELECT coalesce(jsonb_agg(to_jsonb(j) ORDER BY j.created_at,j.id),'[]') FROM (SELECT j.id,j.created_by,p.full_name author,j.deadline_kind,j.due_on,j.workflow_stage_key,j.reason_code,left(j.details,2000) details,length(j.details)>2000 details_truncated,j.created_at FROM public.task_delay_justifications j LEFT JOIN public.profiles p ON p.id=j.created_by WHERE j.task_id=x.id ORDER BY j.created_at DESC,j.id DESC LIMIT 10) j),
  'attachments',(SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.created_at,a.id),'[]') FROM (SELECT a.id,a.name,a.url,a.provider,a.mime_type,a.created_at FROM public.task_attachments a WHERE a.task_id=x.id ORDER BY a.created_at DESC,a.id DESC LIMIT 20) a),
  'publications',(SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.updated_at,p.id),'[]') FROM (SELECT p.id,p.channel,p.status,p.assignee_id,p.scheduled_for,p.scheduled_at,p.published_on,p.evidence_url,p.meta_post_id,p.destination,p.updated_at,
   (NOT coalesce(cycle.bad,false) AND (cycle.at IS NULL OR
    p.published_on>=(cycle.at AT TIME ZONE 'America/Sao_Paulo')::date AND
    (p.created_at>=cycle.at OR EXISTS(SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p.history)='array' THEN p.history ELSE '[]' END) event
     WHERE event->>'to_status'='published' AND event->>'from_status' IS DISTINCT FROM 'published' AND private.atlas_record_time(event->>'at')>=cycle.at)))) after_last_rework
   FROM public.task_channel_publications p WHERE p.task_id=x.id ORDER BY p.updated_at DESC,p.id DESC LIMIT 20) p),
  'traffic',CASE WHEN x.type='paid_traffic' THEN (
   SELECT coalesce(jsonb_object_agg(key,value),'{}') FROM jsonb_each(CASE WHEN jsonb_typeof(c.meta_resumo)='object' THEN c.meta_resumo ELSE '{}' END)
   WHERE key=ANY(ARRAY['period','syncedAt','activeCount','permError','rateLimited'])
  )||jsonb_build_object('has_error',nullif(c.meta_resumo->>'errorMessage','') IS NOT NULL,'running',(
   SELECT coalesce(jsonb_agg(value),'[]') FROM (
    SELECT jsonb_build_object('id',entry->>'id','name',left(entry->>'name',180)) value
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(c.meta_resumo->'running')='array' THEN c.meta_resumo->'running' ELSE '[]' END) entry
    WHERE jsonb_typeof(entry)='object' LIMIT 8
   ) r)) ELSE NULL END,
  'coverage',jsonb_build_object('comments_total',(SELECT count(*) FROM public.task_comments c WHERE c.task_id=x.id),
   'justifications_total',(SELECT count(*) FROM public.task_delay_justifications j WHERE j.task_id=x.id),
   'attachments_total',(SELECT count(*) FROM public.task_attachments a WHERE a.task_id=x.id),
   'publications_total',(SELECT count(*) FROM public.task_channel_publications p WHERE p.task_id=x.id),
   'status_history_total',CASE WHEN jsonb_typeof(x.status_history)='array' THEN jsonb_array_length(x.status_history) ELSE 0 END,
   'description_length',length(coalesce(x.description,'')),'attachment_content_read',false)
 ) value
 FROM public.atlas_team_threads t JOIN public.tarefas x ON x.id=t.task_id AND x.client_id=t.client_id JOIN public.clientes c ON c.id=t.client_id LEFT JOIN public.task_statuses s ON s.value=x.status
 CROSS JOIN LATERAL(SELECT max(private.atlas_record_time(h->>'timestamp')) at,bool_or(private.atlas_record_time(h->>'timestamp') IS NULL) bad
  FROM jsonb_array_elements(CASE WHEN jsonb_typeof(x.status_history)='array' THEN x.status_history ELSE '[]' END) h
  WHERE lower(h->>'status') IN('alteração','alteracao','changes','rework') OR EXISTS(
   SELECT 1 FROM public.task_statuses hs WHERE hs.value=h->>'status' AND lower(hs.label) IN('alteração','alteracao','changes','rework'))) cycle
 WHERE t.id=p_thread
 ), checked AS (SELECT value||jsonb_build_object('publication_ready',private.atlas_record_publication_ready(value)) value FROM record)
 SELECT value||jsonb_build_object('source_version',md5(value::text)) FROM checked;
$$;
REVOKE ALL ON FUNCTION private.atlas_task_record(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.atlas_task_record(uuid) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.atlas_team_worker_snapshot() RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('thread',to_jsonb(t),
 'task',private.atlas_task_record(t.id),
 'has_messages',EXISTS(SELECT 1 FROM public.atlas_team_messages m WHERE m.thread_id=t.id),
 'last_human_observation',(SELECT jsonb_build_object('revision',r.thread_revision,'task_stage',r.result->'task_stage') FROM public.atlas_team_requests r
  WHERE r.thread_id=t.id AND r.state='completed' AND r.applied AND coalesce(r.result->>'resume_blocked','false')<>'true'
  ORDER BY r.thread_revision DESC,r.created_at DESC,r.id DESC LIMIT 1),
 'task_exists',EXISTS(SELECT 1 FROM public.tarefas x WHERE x.id=t.task_id AND x.client_id=t.client_id),
 'task_terminal',EXISTS(SELECT 1 FROM public.tarefas x JOIN public.task_statuses s ON s.value=x.status AND s.is_terminal WHERE x.id=t.task_id AND x.client_id=t.client_id),
 'recipient_active',p.status='active' AND p.role IN('admin','superadmin','colaborador'),
 'account_active',EXISTS(SELECT 1 FROM public.profiles a WHERE a.id=t.account_person_id AND a.status='active' AND a.role IN('admin','superadmin','colaborador') AND private.atlas_manager_account(t.owner_id,t.client_id)=a.id),
 'recipient_valid',CASE WHEN t.origin_job_id IS NOT NULL THEN private.atlas_consult_current(t.id) ELSE t.current_person_id IN(t.owner_id,t.account_person_id) OR EXISTS(SELECT 1 FROM public.tarefas x WHERE x.id=t.task_id AND x.client_id=t.client_id AND t.current_person_id=ANY(x.assignee_ids)) OR private.atlas_followup_contact(t.id) END,
 'hours',coalesce((SELECT jsonb_build_object('start_time',h.start_time,'end_time',h.end_time) FROM public.atlas_team_hours h WHERE h.owner_id=t.owner_id AND h.person_id=t.current_person_id),'{}'))),'[]')
 FROM public.atlas_team_threads t JOIN public.atlas_team_config c ON c.owner_id=t.owner_id AND c.enabled LEFT JOIN public.profiles p ON p.id=t.current_person_id
 WHERE (t.state IN('awaiting_reply','waiting_review') OR t.management_kind='followup' AND t.state IN('delivery_review','needs_owner'))
 AND (t.management_kind IS DISTINCT FROM 'followup' OR EXISTS(SELECT 1 FROM public.atlas_event_config e JOIN public.clientes cl ON cl.id=t.client_id AND cl.etapa='closed' WHERE e.owner_id=t.owner_id AND t.client_id=ANY(e.client_ids)))
 AND NOT EXISTS(SELECT 1 FROM public.atlas_team_requests r WHERE r.thread_id=t.id AND r.state='processing' AND coalesce(nullif(r.result->>'attempted_at','')::timestamptz,r.created_at)>now()-interval '2 minutes');
$$;


CREATE OR REPLACE FUNCTION public.atlas_team_worker_apply(p_thread uuid,p_revision integer,p_plan jsonb) RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE t public.atlas_team_threads; task jsonb; next_state text; target uuid; account_ok boolean; ready boolean; review timestamptz; executors uuid[];
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'Acesso exclusivo do worker.' USING ERRCODE='42501';END IF;
 SELECT * INTO t FROM public.atlas_team_threads WHERE id=p_thread FOR UPDATE;
 IF t.id IS NULL OR t.revision<>p_revision OR NOT EXISTS(SELECT 1 FROM public.atlas_team_config WHERE owner_id=t.owner_id AND enabled) THEN RETURN false;END IF;
 IF t.management_kind IS NOT NULL AND NOT private.atlas_manager_live(t.owner_id) THEN RETURN false;END IF;
 IF t.management_kind='followup' AND (NOT EXISTS(SELECT 1 FROM public.atlas_event_config WHERE owner_id=t.owner_id AND t.client_id=ANY(client_ids))
 OR NOT EXISTS(SELECT 1 FROM public.clientes WHERE id=t.client_id AND etapa='closed')) THEN RETURN false;END IF;
 IF p_plan ? 'task_source_version' THEN
  PERFORM 1 FROM public.tarefas WHERE id=t.task_id AND client_id=t.client_id FOR SHARE;
  IF NOT FOUND THEN RETURN false;END IF;
  task:=private.atlas_task_record(t.id);
  IF task->>'source_version' IS DISTINCT FROM p_plan->>'task_source_version' THEN RETURN false;END IF;
 END IF;
 IF p_plan->>'kind'='refresh' THEN
  IF t.management_kind IS DISTINCT FROM 'followup' OR t.state NOT IN('awaiting_reply','waiting_review','delivery_review','needs_owner')
  OR t.management_data ? 'pending_request_id'
  OR NOT EXISTS(SELECT 1 FROM public.atlas_event_config WHERE owner_id=t.owner_id AND t.client_id=ANY(client_ids))
  OR NOT EXISTS(SELECT 1 FROM public.clientes WHERE id=t.client_id AND etapa='closed')
  OR EXISTS(SELECT 1 FROM public.atlas_team_requests r WHERE r.thread_id=t.id AND r.state='processing' AND coalesce(nullif(r.result->>'attempted_at','')::timestamptz,r.created_at)>now()-interval '2 minutes') THEN RETURN false;END IF;
  PERFORM 1 FROM public.tarefas WHERE id=t.task_id AND client_id=t.client_id FOR SHARE;
  IF NOT FOUND THEN RETURN false;END IF;
  task:=private.atlas_task_record(t.id);
  IF task->>'source_version' IS DISTINCT FROM p_plan->>'task_source_version'
  OR t.management_data->'task_observation'->>'source_version'=task->>'source_version' AND t.state=p_plan->>'state' THEN RETURN false;END IF;
  next_state:=p_plan->>'state';target:=t.current_person_id;
  IF next_state IS NULL OR next_state NOT IN('awaiting_reply','waiting_review','delivery_review','needs_owner')
  OR coalesce(p_plan->>'meaningful_version','') !~ '^[0-9a-f]{64}$'
  OR char_length(coalesce(p_plan->>'summary','')) NOT BETWEEN 1 AND 2000
  OR p_plan->>'text' IS NULL OR char_length(p_plan->>'text')>4000
  OR next_state<>t.state AND nullif(btrim(p_plan->>'text'),'') IS NULL THEN RETURN false;END IF;
  IF t.state='waiting_review' AND t.next_review_at IS NULL AND next_state<>t.state THEN RETURN false;END IF;
  account_ok:=EXISTS(SELECT 1 FROM public.profiles a WHERE a.id=t.account_person_id AND a.status='active' AND a.role IN('admin','superadmin','colaborador') AND private.atlas_manager_account(t.owner_id,t.client_id)=a.id);
  ready:=coalesce((task->>'terminal')::boolean,false);
  ready:=ready OR coalesce((task->>'publication_ready')::boolean,false);
  IF next_state='delivery_review' THEN
   IF NOT account_ok OR NOT ready AND t.state<>'delivery_review' THEN RETURN false;END IF;
   target:=t.account_person_id;
  ELSIF next_state='needs_owner' AND next_state<>t.state THEN
   IF account_ok OR NOT ready AND t.state<>'delivery_review' THEN RETURN false;END IF;
   target:=t.owner_id;
  ELSIF next_state<>t.state THEN
   IF t.state<>'delivery_review' OR ready OR next_state<>'awaiting_reply' THEN RETURN false;END IF;
   SELECT array_agg(p.id ORDER BY p.id) INTO executors FROM public.profiles p
   WHERE p.id IN(SELECT jsonb_array_elements_text(task->'assignee_ids')::uuid) AND p.status='active' AND p.role IN('admin','superadmin','colaborador');
   target:=CASE WHEN cardinality(executors)=1 THEN executors[1] WHEN account_ok THEN t.account_person_id ELSE t.owner_id END;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=target AND status='active' AND role IN('admin','superadmin','colaborador'))
  OR private.atlas_manager_work(now(),t.owner_id,target)>now() THEN RETURN false;END IF;
  IF next_state IN('awaiting_reply','waiting_review') THEN
   review:=(p_plan->>'next_review_at')::timestamptz;
   IF next_state='waiting_review' AND t.state='waiting_review' AND t.next_review_at IS NULL THEN
    IF review IS NOT NULL THEN RETURN false;END IF;
   ELSE
    IF review IS NULL OR review<=now() OR review>now()+interval '90 days' THEN RETURN false;END IF;
    review:=private.atlas_manager_work(review,t.owner_id,target);
   END IF;
  END IF;
  IF nullif(btrim(p_plan->>'text'),'') IS NOT NULL THEN
   INSERT INTO public.atlas_team_messages(thread_id,role,content) VALUES(t.id,'atlas',p_plan->>'text');
  END IF;
  UPDATE public.atlas_team_threads SET state=next_state,current_person_id=target,next_review_at=review,
   summary=p_plan->>'summary',management_data=management_data||jsonb_build_object('task_observation',jsonb_build_object('source_version',task->>'source_version','meaningful_version',p_plan->>'meaningful_version','at',now(),'review_ready',ready,'revision',t.revision+1,
    'task_stage',jsonb_build_object('status',coalesce(task->>'status_value',task->>'status'),'assignee_ids',task->'assignee_ids','timestamp',task->'status_history'->-1->'timestamp'))),
   reminder_day=CASE WHEN next_state<>t.state THEN NULL ELSE reminder_day END,
   reminders_today=CASE WHEN next_state<>t.state THEN 0 ELSE reminders_today END,
   revision=revision+1,updated_at=now() WHERE id=t.id;
  RETURN true;
 END IF;
 IF t.state NOT IN('awaiting_reply','waiting_review') THEN RETURN false;END IF;
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
REVOKE ALL ON FUNCTION public.atlas_team_worker_apply(uuid,integer,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.atlas_team_worker_apply(uuid,integer,jsonb) TO service_role;

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
  INSERT INTO public.atlas_team_threads(owner_id,client_id,task_id,account_person_id,current_person_id,title,shared_context,source_key,management_kind,management_data,next_review_at)
  VALUES(own,task.client_id,task.id,account,recipient,left(task.title,200),jsonb_build_object('label','Acompanhamento de tarefa existente','text',left(task.description,1500),'at',now()),source,'followup',jsonb_build_object('origin','existing_task','task_basis',md5(to_jsonb(task)::text)),private.atlas_manager_work(now()+interval '1 hour',own,recipient)) ON CONFLICT(owner_id,source_key) DO NOTHING RETURNING id INTO thread;
  -- The worker reads the complete task sources before the first contact.
  IF thread IS NOT NULL THEN opened:=opened+1;END IF;
 END LOOP;
 RETURN opened;
END $$;
REVOKE ALL ON FUNCTION public.atlas_manager_reconcile() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.atlas_manager_reconcile() TO service_role;


COMMIT;

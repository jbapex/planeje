BEGIN;

-- Scoped conversations and durable requests; no task execution fields are reassigned.

CREATE FUNCTION private.atlas_team_recipient(p_thread uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.atlas_team_threads t WHERE t.id=p_thread
 AND (auth.uid() IN(t.owner_id,t.current_person_id) OR auth.role()='service_role')
 AND CASE WHEN t.origin_job_id IS NOT NULL THEN private.atlas_consult_current(t.id)
 WHEN t.management_kind='owner_context' THEN t.current_person_id=t.owner_id
 WHEN t.management_kind='intake' THEN t.current_person_id=t.account_person_id AND t.account_person_id=private.atlas_manager_account(t.owner_id,t.client_id)
 ELSE EXISTS(SELECT 1 FROM public.tarefas x WHERE x.id=t.task_id AND x.client_id=t.client_id AND (
 t.current_person_id=ANY(x.assignee_ids) OR t.current_person_id=t.account_person_id AND (t.management_kind IS NULL OR t.account_person_id=private.atlas_manager_account(t.owner_id,t.client_id))
 OR private.atlas_followup_contact(t.id))) END);
$$;
REVOKE ALL ON FUNCTION private.atlas_team_recipient(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.atlas_team_recipient(uuid) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION private.atlas_team_member(t public.atlas_team_threads) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT private.atlas_team_human() AND (
 (auth.uid()=t.owner_id AND EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.status='active' AND p.role='superadmin'))
 OR auth.uid()=t.current_person_id AND private.atlas_team_recipient(t.id));
$$;

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
  'attachments',(SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.created_at,a.id),'[]') FROM (SELECT a.id,a.name,a.url,a.provider,a.mime_type,a.publication_id,a.source_url,a.created_at,
   (NOT coalesce(cycle.bad,false) AND (cycle.at IS NULL OR a.created_at>=cycle.at)) after_last_rework FROM public.task_attachments a WHERE a.task_id=x.id ORDER BY a.created_at DESC,a.id DESC LIMIT 20) a),
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

CREATE OR REPLACE FUNCTION private.atlas_team_context_for(p_thread uuid,p_actor uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE t public.atlas_team_threads; result jsonb; parent public.atlas_team_threads;record_thread uuid;
BEGIN
 SELECT * INTO t FROM public.atlas_team_threads WHERE id=p_thread;
 IF t.id IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=p_actor AND p.status='active' AND (p.id=t.current_person_id AND private.atlas_team_recipient(t.id) AND p.role IN('admin','superadmin','colaborador') OR p.id=t.owner_id AND p.role='superadmin')) THEN RAISE EXCEPTION 'Conversa indisponível.' USING ERRCODE='42501'; END IF;
 record_thread:=t.id;
 IF t.management_kind='owner_context' AND t.task_id IS NULL AND t.management_data->>'parent_thread' ~ '^[0-9a-f-]{36}$' THEN
  SELECT * INTO parent FROM public.atlas_team_threads p WHERE p.id=(t.management_data->>'parent_thread')::uuid AND p.owner_id=t.owner_id AND p.client_id=t.client_id;
  IF parent.id IS NOT NULL THEN record_thread:=parent.id;END IF;
 END IF;
 SELECT jsonb_build_object('thread',to_jsonb(t),'client_name',c.empresa,'actor_id',p_actor,'is_owner',p_actor=t.owner_id,
 'messages',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.created_at,x.id),'[]') FROM(SELECT * FROM public.atlas_team_messages m WHERE m.thread_id=t.id ORDER BY m.created_at DESC,m.id DESC LIMIT 40)x),
 'people',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.full_name,'hours',coalesce((SELECT jsonb_build_object('start_time',h.start_time,'end_time',h.end_time) FROM public.atlas_team_hours h WHERE h.owner_id=t.owner_id AND h.person_id=p.id),'{"start_time":"08:00","end_time":"17:00"}'::jsonb))),'[]') FROM public.profiles p WHERE p.status='active' AND (p.id IN(t.owner_id,t.account_person_id) OR EXISTS(SELECT 1 FROM public.tarefas x WHERE x.id=t.task_id AND x.client_id=t.client_id AND p.id=ANY(x.assignee_ids)))),
 'task',private.atlas_task_record(record_thread),
 'task_lookup',CASE WHEN coalesce(t.task_id,parent.task_id) IS NULL THEN CASE WHEN t.management_kind IN('followup','owner_context') AND t.management_data ? 'parent_thread' OR t.management_kind='followup' THEN 'unlinked' ELSE 'not_required' END WHEN EXISTS(SELECT 1 FROM public.tarefas x WHERE x.id=coalesce(t.task_id,parent.task_id) AND x.client_id=t.client_id) THEN 'found' ELSE 'missing' END,
 'last_observed_stage',(SELECT r.result->'task_stage' FROM public.atlas_team_requests r WHERE r.thread_id=t.id AND r.state='completed' AND r.applied AND coalesce(r.result->>'resume_blocked','false')<>'true' AND jsonb_typeof(r.result->'task_stage')='object' ORDER BY r.thread_revision DESC,r.created_at DESC,r.id DESC LIMIT 1),
 'hours',coalesce((SELECT jsonb_build_object('start_time',h.start_time,'end_time',h.end_time) FROM public.atlas_team_hours h WHERE h.owner_id=t.owner_id AND h.person_id=p_actor),'{"start_time":"08:00","end_time":"17:00"}'::jsonb),
 'last_request',(SELECT jsonb_build_object('id',r.id,'message_id',r.message_id,'message',m.content,'state',r.state,'attempt',coalesce((r.result->>'attempt')::integer,1),'error_code',r.result->>'error_code') FROM public.atlas_team_requests r JOIN public.atlas_team_messages m ON m.id=r.message_id AND m.thread_id=t.id WHERE r.thread_id=t.id AND r.actor_id=p_actor ORDER BY coalesce(nullif(r.result->>'attempted_at','')::timestamptz,r.created_at) DESC,r.id DESC LIMIT 1),
 'reply_pending',EXISTS(SELECT 1 FROM public.atlas_team_requests q WHERE q.thread_id=t.id AND (q.state='queued' OR q.state='processing' AND coalesce(q.lease_until,q.created_at+interval '2 minutes')>now())),'queried_at',now()) INTO result FROM public.clientes c WHERE c.id=t.client_id;
 RETURN result||jsonb_build_object('group_alerts',private.atlas_team_group_alerts(t.id,p_actor));
END $$;

REVOKE ALL ON FUNCTION private.atlas_team_context_for(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.atlas_team_context(p_thread uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE t public.atlas_team_threads;
BEGIN
 SELECT * INTO t FROM public.atlas_team_threads WHERE id=p_thread;
 IF t.id IS NULL OR NOT private.atlas_team_member(t) THEN RAISE EXCEPTION 'Conversa indisponível.' USING ERRCODE='42501';END IF;
 RETURN private.atlas_team_context_for(p_thread,auth.uid());
END $$;

CREATE OR REPLACE FUNCTION public.atlas_team_list() RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY updated_at DESC,id DESC),'[]') FROM (
 SELECT t.*,c.empresa client_name,p.full_name person_name,
 (SELECT max(m.created_at) FROM public.atlas_team_messages m WHERE m.thread_id=t.id AND m.role='atlas') last_atlas_at,
 (SELECT r.read_at FROM public.atlas_team_reads r WHERE r.thread_id=t.id AND r.person_id=auth.uid()) read_at
 FROM public.atlas_team_threads t JOIN public.clientes c ON c.id=t.client_id JOIN public.profiles p ON p.id=t.current_person_id
 WHERE t.state<>'closed')x;
$$;
CREATE FUNCTION public.atlas_team_list_page(p_before_at timestamptz DEFAULT NULL,p_before_id uuid DEFAULT NULL,p_limit integer DEFAULT 50) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE rows jsonb;more boolean;last_row jsonb;
BEGIN
 IF (p_before_at IS NULL)<>(p_before_id IS NULL) OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Página inválida.';END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY updated_at DESC,id DESC),'[]') INTO rows FROM (
 SELECT t.*,c.empresa client_name,p.full_name person_name,
 (SELECT max(m.created_at) FROM public.atlas_team_messages m WHERE m.thread_id=t.id AND m.role='atlas') last_atlas_at,
 (SELECT r.read_at FROM public.atlas_team_reads r WHERE r.thread_id=t.id AND r.person_id=auth.uid()) read_at
 FROM public.atlas_team_threads t JOIN public.clientes c ON c.id=t.client_id JOIN public.profiles p ON p.id=t.current_person_id
 WHERE t.state<>'closed' AND (p_before_at IS NULL OR (t.updated_at,t.id)<(p_before_at,p_before_id))
 ORDER BY t.updated_at DESC,t.id DESC LIMIT p_limit+1)x;
 more:=jsonb_array_length(rows)>p_limit;
 IF more THEN rows:=rows-p_limit;END IF;
 last_row:=rows->-1;
 RETURN jsonb_build_object('items',rows,'complete',NOT more,'next',CASE WHEN more THEN jsonb_build_object('at',last_row->>'updated_at','id',last_row->>'id') END);
END $$;
REVOKE ALL ON FUNCTION public.atlas_team_list_page(timestamptz,uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.atlas_team_list_page(timestamptz,uuid,integer) TO authenticated;

ALTER TABLE public.atlas_team_requests ADD COLUMN lease uuid,ADD COLUMN lease_until timestamptz;
ALTER TABLE public.atlas_team_requests DROP CONSTRAINT atlas_team_requests_state_check;
ALTER TABLE public.atlas_team_requests ADD CONSTRAINT atlas_team_requests_state_check CHECK(state IN('queued','processing','completed','failed'));
CREATE INDEX atlas_team_pending_requests ON public.atlas_team_requests(created_at,id) WHERE state='queued';

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
   IF EXISTS(SELECT 1 FROM public.atlas_team_requests WHERE thread_id=t.id AND (state='queued' OR state='processing' AND coalesce(lease_until,coalesce(nullif(result->>'attempted_at','')::timestamptz,created_at)+interval '2 minutes')>now())) THEN RAISE EXCEPTION 'Aguarde a resposta em andamento.';END IF;
   IF (SELECT coalesce(sum(coalesce((result->>'attempt')::integer,1)),0) FROM public.atlas_team_requests WHERE actor_id=auth.uid() AND (coalesce(nullif(result->>'attempted_at','')::timestamptz,created_at) AT TIME ZONE 'America/Sao_Paulo')::date=(now() AT TIME ZONE 'America/Sao_Paulo')::date)>=20 THEN RAISE EXCEPTION 'Limite diário de respostas atingido.';END IF;
   UPDATE public.atlas_team_requests SET state='processing',lease=NULL,lease_until=NULL,session_id=(auth.jwt()->>'session_id')::uuid,thread_revision=t.revision,result=jsonb_build_object('attempt',coalesce((r.result->>'attempt')::integer,1)+1,'attempted_at',now()) WHERE id=r.id;
   RETURN jsonb_build_object('claimed',true,'state','processing','revision',t.revision);
  END IF;
  RETURN jsonb_build_object('claimed',false,'state',r.state,'result',r.result);
 END IF;
 IF auth.uid() NOT IN(t.owner_id,t.current_person_id) OR t.state IN('delivery_review','closed') THEN RAISE EXCEPTION 'Aguarde sua vez ou a revisão da entrega.'; END IF;
 IF t.revision<>p_revision THEN RAISE EXCEPTION 'A conversa mudou. Atualize antes de responder.' USING ERRCODE='40001'; END IF;
 IF char_length(btrim(p_text)) NOT BETWEEN 1 AND 4000 THEN RAISE EXCEPTION 'Escreva uma mensagem de até 4.000 caracteres.'; END IF;
 IF EXISTS(SELECT 1 FROM public.atlas_team_requests WHERE thread_id=t.id AND (state='queued' OR state='processing' AND coalesce(lease_until,coalesce(nullif(result->>'attempted_at','')::timestamptz,created_at)+interval '2 minutes')>now())) THEN RAISE EXCEPTION 'Aguarde a resposta em andamento.'; END IF;
 UPDATE public.atlas_team_requests SET state='failed' WHERE thread_id=t.id AND state='processing';
 IF (SELECT coalesce(sum(coalesce((result->>'attempt')::integer,1)),0) FROM public.atlas_team_requests WHERE actor_id=auth.uid() AND (coalesce(nullif(result->>'attempted_at','')::timestamptz,created_at) AT TIME ZONE 'America/Sao_Paulo')::date=(now() AT TIME ZONE 'America/Sao_Paulo')::date)>=20 THEN RAISE EXCEPTION 'Limite de 20 respostas de IA por pessoa/dia no piloto.'; END IF;
 INSERT INTO public.atlas_team_messages(thread_id,role,actor_id,content) VALUES(t.id,'human',auth.uid(),btrim(p_text)) RETURNING id INTO msg;
 UPDATE public.atlas_team_threads SET revision=revision+1,updated_at=now() WHERE id=t.id RETURNING * INTO t;
 INSERT INTO public.atlas_team_requests(id,thread_id,actor_id,session_id,message_id,thread_revision) VALUES(p_id,t.id,auth.uid(),(auth.jwt()->>'session_id')::uuid,msg,t.revision);
 RETURN jsonb_build_object('claimed',true,'state','processing','revision',t.revision);
END $$;

CREATE FUNCTION public.atlas_team_enqueue(p_thread uuid,p_id uuid,p_text text,p_revision integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE reserved jsonb;r public.atlas_team_requests;
BEGIN
 reserved:=private.atlas_team_reserve(p_thread,p_id,p_text,p_revision);
 IF (reserved->>'claimed')::boolean THEN
  UPDATE public.atlas_team_requests SET state='queued',lease=NULL,lease_until=NULL WHERE id=p_id;
 END IF;
 SELECT * INTO r FROM public.atlas_team_requests WHERE id=p_id AND actor_id=auth.uid() AND thread_id=p_thread;
 RETURN reserved||jsonb_build_object('state',r.state,'request_id',r.id,'message_id',r.message_id);
END $$;
REVOKE ALL ON FUNCTION public.atlas_team_enqueue(uuid,uuid,text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.atlas_team_enqueue(uuid,uuid,text,integer) TO authenticated;
CREATE FUNCTION public.atlas_team_claim() RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE r public.atlas_team_requests;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'Worker exclusivo.' USING ERRCODE='42501';END IF;
 UPDATE public.atlas_team_requests SET state='failed',result=coalesce(result,'{}')||'{"error_code":"WORKER_LEASE_EXPIRED"}' WHERE state='processing' AND coalesce(lease_until,coalesce(nullif(result->>'attempted_at','')::timestamptz,created_at)+interval '2 minutes')<now();
 SELECT * INTO r FROM public.atlas_team_requests WHERE state='queued' ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT 1;
 IF r.id IS NULL THEN RETURN NULL;END IF;
 UPDATE public.atlas_team_requests SET state='processing',lease=gen_random_uuid(),lease_until=now()+interval '3 minutes' WHERE id=r.id RETURNING * INTO r;
 RETURN jsonb_build_object('id',r.id,'thread_id',r.thread_id,'revision',r.thread_revision,'lease',r.lease,
 'message',(SELECT content FROM public.atlas_team_messages WHERE id=r.message_id));
END $$;
CREATE FUNCTION private.atlas_team_request_context(p_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.atlas_team_requests;t public.atlas_team_threads;context jsonb;
BEGIN
 SELECT * INTO r FROM public.atlas_team_requests WHERE id=p_id;
 SELECT * INTO t FROM public.atlas_team_threads WHERE id=r.thread_id;
 IF r.id IS NULL OR r.state<>'processing' OR r.lease IS NULL OR r.lease_until<=now() OR t.revision<>r.thread_revision
 OR NOT EXISTS(SELECT 1 FROM auth.sessions WHERE id=r.session_id AND user_id=r.actor_id)
 OR NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=r.actor_id AND p.status='active' AND p.role IN('admin','superadmin','colaborador'))
 OR r.actor_id NOT IN(t.owner_id,t.current_person_id) OR r.actor_id<>t.owner_id AND NOT private.atlas_team_recipient(t.id) OR NOT EXISTS(SELECT 1 FROM public.atlas_team_config WHERE owner_id=t.owner_id AND enabled)
 OR t.management_kind IS NOT NULL AND (NOT private.atlas_manager_live(t.owner_id) OR NOT EXISTS(SELECT 1 FROM public.atlas_event_config WHERE owner_id=t.owner_id AND t.client_id=ANY(client_ids)))
 OR NOT EXISTS(SELECT 1 FROM public.clientes WHERE id=t.client_id AND etapa='closed') THEN RAISE EXCEPTION 'Sessão ou acompanhamento mudou.' USING ERRCODE='42501';END IF;
 IF t.origin_job_id IS NOT NULL AND NOT private.atlas_consult_current(t.id) THEN RAISE EXCEPTION 'Consulta de origem mudou.' USING ERRCODE='42501';END IF;
 context:=private.atlas_team_context_for(t.id,r.actor_id);
 IF t.management_kind IS NOT NULL THEN
  context:=context||jsonb_build_object('management',true,
  'people',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',full_name,'hours','{"start_time":"08:00","end_time":"17:00"}'::jsonb)),'[]') FROM public.profiles WHERE status='active' AND role IN('admin','superadmin','colaborador')),
  'tasks',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',x.id,'title',x.title,'description',left(x.description,1500),'assignee_ids',x.assignee_ids,'due_date',x.due_date,'terminal',coalesce(s.is_terminal,false)) ORDER BY x.created_at DESC),'[]') FROM public.tarefas x LEFT JOIN public.task_statuses s ON s.value=x.status WHERE x.client_id=t.client_id),
  'scope',(SELECT jsonb_build_object('tipo_servico',tipo_servico,'tipo_contrato',tipo_contrato,'entregaveis',entregaveis-ARRAY['whatsapp_grupo'],'objetivo',objetivo_meta,'owner_direction',t.management_data->'owner_direction') FROM public.clientes WHERE id=t.client_id));
 END IF;
 RETURN context;
END $$;
CREATE FUNCTION public.atlas_team_request_context(p_id uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.atlas_team_request_context(p_id); $$;
CREATE FUNCTION public.atlas_team_fail(p_id uuid,p_lease uuid,p_code text,p_usage jsonb DEFAULT '{}'::jsonb) RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'Worker exclusivo.' USING ERRCODE='42501';END IF;
 UPDATE public.atlas_team_requests SET state='failed',usage=private.atlas_team_merge_usage(usage,p_usage),result=coalesce(result,'{}')||jsonb_build_object('error_code',CASE WHEN p_code ~ '^[A-Z_]{1,64}$' THEN p_code ELSE 'QUEUED_REPLY_FAILED' END)
 WHERE id=p_id AND state='processing' AND lease=p_lease;
 RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION public.atlas_team_claim(),private.atlas_team_request_context(uuid),public.atlas_team_request_context(uuid),public.atlas_team_fail(uuid,uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.atlas_team_claim(),private.atlas_team_request_context(uuid),public.atlas_team_request_context(uuid),public.atlas_team_fail(uuid,uuid,text,jsonb) TO service_role;

CREATE FUNCTION private.atlas_dialogue_checked(value jsonb) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
BEGIN
 IF value IS NULL OR value='null'::jsonb THEN RETURN NULL;END IF;
 IF jsonb_typeof(value)<>'object' OR octet_length(value::text)>12000
 OR jsonb_typeof(value->'waiting_on') IS DISTINCT FROM 'string' OR value->>'waiting_on' NOT IN('self','client','team','owner','none')
 OR char_length(coalesce(value->>'next_action','')) NOT BETWEEN 1 AND 400
 OR jsonb_typeof(coalesce(value->'answered','{}'))<>'object' THEN RAISE EXCEPTION 'Combinado de conversa inválido.';END IF;
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(coalesce(value->'answered','{}')) k WHERE k NOT IN('action','approval','executor','date','evidence')) THEN RAISE EXCEPTION 'Campo de memória operacional inválido.';END IF;
 RETURN value;
END $$;
REVOKE ALL ON FUNCTION private.atlas_dialogue_checked(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.atlas_dialogue_checked(jsonb) TO service_role;

CREATE OR REPLACE FUNCTION private.atlas_manager_finish(p_id uuid,p_result jsonb,p_usage jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE t public.atlas_team_threads;r public.atlas_team_requests;actor uuid;kind text;selected uuid;task public.tarefas;v_title text;body text;review timestamptz;expected timestamptz;due date;initial text;tasktype text;days integer;existing uuid;name text;owner_thread uuid;parent uuid;resume boolean:=false;basis text;tasks_basis text;question_override text;contact uuid;contact_assignees uuid[];ref jsonb;record jsonb;entry jsonb;record_url text;dialogue jsonb;
BEGIN
 SELECT * INTO r FROM public.atlas_team_requests WHERE id=p_id;
 SELECT * INTO t FROM public.atlas_team_threads WHERE id=r.thread_id FOR UPDATE;
 SELECT * INTO r FROM public.atlas_team_requests WHERE id=p_id FOR UPDATE;
 IF r.state='completed' AND r.applied THEN RETURN jsonb_build_object('saved',true,'replayed',true,'task_id',t.task_id);END IF;
 IF r.state='completed' AND NOT r.applied AND t.management_data->>'pending_request_id'=r.id::text THEN resume:=true;p_result:=r.result;p_usage:='{}';END IF;
 IF r.id IS NULL OR r.state<>'processing' AND NOT resume OR t.management_kind IS NULL OR NOT coalesce(private.atlas_manager_live(t.owner_id),false) OR t.revision<>r.thread_revision
 OR NOT EXISTS(SELECT 1 FROM auth.sessions WHERE id=r.session_id AND user_id=r.actor_id)
 OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=r.actor_id AND status='active' AND role IN('admin','superadmin','colaborador'))
 OR r.actor_id NOT IN(t.owner_id,t.current_person_id) OR r.actor_id<>t.owner_id AND NOT private.atlas_team_recipient(t.id) THEN RAISE EXCEPTION 'Sessão, política ou conversa mudou.' USING ERRCODE='42501';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.atlas_event_config WHERE owner_id=t.owner_id AND t.client_id=ANY(client_ids)) OR NOT EXISTS(SELECT 1 FROM public.clientes WHERE id=t.client_id AND etapa='closed') THEN RAISE EXCEPTION 'Cliente fora da carteira autorizada.';END IF;
 IF t.origin_job_id IS NOT NULL AND NOT private.atlas_consult_current(t.id) THEN RAISE EXCEPTION 'A origem da consulta mudou.' USING ERRCODE='42501';END IF;
 IF nullif(p_result->>'task_context_version','') IS NOT NULL AND p_result->>'task_context_version' IS DISTINCT FROM (private.atlas_team_context_for(t.id,r.actor_id)->'task'->>'source_version') THEN RAISE EXCEPTION 'Os registros da tarefa mudaram durante a análise.' USING ERRCODE='40001';END IF;
 IF NOT resume AND r.lease IS NOT NULL AND (r.lease::text IS DISTINCT FROM p_result->>'worker_lease' OR r.lease_until<=now()) THEN RAISE EXCEPTION 'Lease da resposta mudou.' USING ERRCODE='40001';END IF;
 IF r.lease IS NOT NULL AND p_result->>'task_context_version' IS DISTINCT FROM (private.atlas_team_context_for(t.id,r.actor_id)->'task'->>'source_version') THEN RAISE EXCEPTION 'Registros da tarefa mudaram.' USING ERRCODE='40001';END IF;
 dialogue:=private.atlas_dialogue_checked(p_result->'dialogue');
 ref:=p_result->'evidence_ref';
 IF ref IS NOT NULL AND ref<>'null'::jsonb THEN
  record:=private.atlas_team_context_for(t.id,r.actor_id)->'task';
  IF p_result->>'task_context_version' IS DISTINCT FROM record->>'source_version' OR record IS NULL THEN RAISE EXCEPTION 'Registros de evidência mudaram.' USING ERRCODE='40001';END IF;
  IF ref->>'kind'='task_attachment' THEN
   SELECT a INTO entry FROM jsonb_array_elements(record->'attachments') a WHERE a->>'id'=ref->>'id' AND a->>'after_last_rework'='true';
   record_url:=entry->>'url';
  ELSIF ref->>'kind'='task_publication' THEN
   SELECT a INTO entry FROM jsonb_array_elements(record->'publications') a WHERE a->>'id'=ref->>'id' AND a->>'status'='published' AND a->>'after_last_rework'='true';
   record_url:=entry->>'evidence_url';
  END IF;
  IF record_url IS NULL OR record_url !~ '^https?://[^/@[:space:]]+(/|$)' OR char_length(record_url)>2000 OR p_result->>'evidence_url' IS DISTINCT FROM record_url THEN RAISE EXCEPTION 'Evidência fora da tarefa/rodada autorizada.';END IF;
 END IF;
 kind:=p_result->>'decision';actor:=r.actor_id;
 IF t.management_kind='followup' AND kind='ready' THEN kind:='progress';END IF;
 SELECT md5(to_jsonb(c)::text) INTO basis FROM public.clientes c WHERE c.id=t.client_id;
 SELECT md5(coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id),'[]')::text) INTO tasks_basis FROM public.tarefas x WHERE x.client_id=t.client_id;
 IF resume AND r.result->>'client_basis' IS DISTINCT FROM basis THEN kind:='ask';p_result:=jsonb_set(p_result,'{reply}','"O cadastro mudou antes da programação. Vamos conferir o escopo novamente antes de criar a tarefa."');END IF;
 IF resume AND t.management_kind='intake' AND r.result->>'tasks_basis' IS DISTINCT FROM tasks_basis THEN kind:='ask';p_result:=jsonb_set(p_result,'{reply}','"A fila mudou enquanto esse pedido aguardava. Vamos conferir se já tem uma tarefa cuidando disso?"');END IF;
 IF kind IS NULL OR kind NOT IN('ask','ready','progress','blocked','delivered','owner_needed','owner_answered','resolved') OR char_length(coalesce(p_result->>'reply','')) NOT BETWEEN 1 AND 4000 OR char_length(coalesce(p_result->>'summary','')) NOT BETWEEN 1 AND 2000 THEN RAISE EXCEPTION 'Resposta incompleta.';END IF;
 selected:=nullif(p_result->>'executor_id','')::uuid;
 IF selected IS NOT NULL AND (selected=t.owner_id OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=selected AND status='active' AND role IN('admin','superadmin','colaborador'))) THEN RAISE EXCEPTION 'Executor indisponível.';END IF;
 expected:=nullif(p_result->>'expected_at','')::timestamptz;
 IF expected IS NOT NULL AND (expected<now()-interval '5 minutes' AND NOT (resume AND t.management_kind='followup') OR expected>now()+interval '90 days') THEN RAISE EXCEPTION 'Previsão inválida.';END IF;
 IF nullif(p_result->>'evidence_url','') IS NOT NULL AND (p_result->>'evidence_url' !~ '^https?://' OR record_url IS NULL AND NOT EXISTS(SELECT 1 FROM public.atlas_team_messages WHERE id=r.message_id AND position(p_result->>'evidence_url' IN content)>0)) THEN RAISE EXCEPTION 'Evidência não veio da resposta.';END IF;
 review:=coalesce(nullif(p_result->>'review_at','')::timestamptz,now()+interval '1 hour');
 IF resume AND t.management_kind='followup' AND review<=now() THEN review:=now()+interval '1 hour';p_result:=jsonb_set(p_result,'{review_at}',to_jsonb(review));END IF;
 review:=private.atlas_manager_work(review,t.owner_id,t.current_person_id);
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
  body:='Tarefa '||CASE WHEN existing IS NOT NULL THEN 'vinculada' ELSE 'criada' END||': '||left(task.title,100)||'. '||(SELECT left(split_part(full_name,' ',1),20) FROM public.profiles WHERE id=selected)||', consegue seguir com essa etapa? Prazo: '||coalesce(to_char(task.due_date,'DD/MM/YYYY'),'a combinar')||'. Detalhes no contexto.';
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
   IF NOT (t.management_kind='followup' AND EXISTS(SELECT 1 FROM public.tarefas x WHERE x.id=t.task_id AND x.client_id=t.client_id AND cardinality(x.assignee_ids)=1 AND selected=ANY(x.assignee_ids))) AND (t.management_kind<>'followup' OR actor<>t.account_person_id OR private.atlas_manager_account(t.owner_id,t.client_id) IS DISTINCT FROM actor
   OR NOT EXISTS(SELECT 1 FROM public.atlas_team_messages m WHERE m.thread_id=t.id AND m.role='human' AND m.actor_id=actor AND m.created_at<=r.created_at AND private.atlas_manager_named_executor(m.content,t.owner_id)=selected)
   OR NOT EXISTS(SELECT 1 FROM public.tarefas x WHERE x.id=t.task_id AND x.client_id=t.client_id))
   THEN RAISE EXCEPTION 'A conta precisa identificar a pessoa nesta conversa.' USING ERRCODE='42501';END IF;
   IF private.atlas_manager_work(now(),t.owner_id,selected)>now() THEN
    kind:='queued';
    UPDATE public.atlas_team_threads SET state='waiting_review',next_review_at=private.atlas_manager_work(now(),owner_id,selected),summary=p_result->>'summary',management_data=jsonb_set(management_data,'{pending_request_id}',to_jsonb(r.id::text)),revision=revision+1,updated_at=now() WHERE id=t.id;
    body:='Fechado. Vou seguir com o responsável dessa etapa no próximo expediente. Ainda não chamei a pessoa; confiro os registros antes de continuar.';
   ELSE
    contact:=selected;SELECT x.assignee_ids INTO contact_assignees FROM public.tarefas x WHERE x.id=t.task_id AND x.client_id=t.client_id;
    UPDATE public.atlas_team_threads SET current_person_id=selected,state='awaiting_reply',next_review_at=private.atlas_manager_work(review,owner_id,selected),expected_at=expected,summary=p_result->>'summary',management_data=(management_data-'pending_request_id')||jsonb_build_object('contact_request_id',r.id,'contact_person_id',selected),revision=revision+1,reminder_day=NULL,reminders_today=0,updated_at=now() WHERE id=t.id;
    body:=CASE WHEN actor=t.account_person_id THEN 'Quem cuida da conta explicou: ' ELSE 'A tarefa está atribuída a você e a etapa foi atualizada: ' END||left(coalesce(dialogue->>'next_action',p_result->>'summary'),220)||'. Os ajustes e as fontes estão no contexto deste assunto.';
   END IF;
  ELSE
   UPDATE public.atlas_team_threads SET state=CASE WHEN kind='ask' THEN 'awaiting_reply' ELSE 'waiting_review' END,next_review_at=review,expected_at=expected,summary=p_result->>'summary',revision=revision+1,reminder_day=NULL,reminders_today=0,updated_at=now() WHERE id=t.id;
  END IF;
 END IF;
 IF dialogue IS NOT NULL THEN
  IF EXISTS(SELECT 1 FROM public.atlas_team_threads WHERE id=t.id AND current_person_id IS DISTINCT FROM t.current_person_id AND state='awaiting_reply') THEN dialogue:=jsonb_set(dialogue,'{waiting_on}','"self"');END IF;
  UPDATE public.atlas_team_threads SET management_data=jsonb_set(management_data,'{dialogue}',dialogue) WHERE id=t.id;
 END IF;
 IF kind='resolved' AND body ~* '(exclu|apag)' THEN body:='Fechei este acompanhamento. Nenhuma tarefa foi excluída por essa ação.';END IF;
 INSERT INTO public.atlas_team_messages(thread_id,role,content) VALUES(t.id,'atlas',body);
 UPDATE public.atlas_team_requests SET state='completed',applied=kind<>'queued',thread_revision=(SELECT revision FROM public.atlas_team_threads WHERE id=t.id),result=p_result||jsonb_build_object('applied_decision',kind,'task_id',task.id,'client_basis',basis,'tasks_basis',tasks_basis,'contact_person_id',contact,'contact_assignee_ids',contact_assignees,'attempt',coalesce((r.result->>'attempt')::integer,1),'attempted_at',coalesce(r.result->>'attempted_at',r.created_at::text)),usage=private.atlas_team_merge_usage(usage,p_usage) WHERE id=r.id;
 RETURN jsonb_build_object('saved',true,'decision',kind,'task_id',task.id);
END $$;

CREATE OR REPLACE FUNCTION private.atlas_team_finish(p_id uuid,p_result jsonb,p_usage jsonb,p_error boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.atlas_team_requests;t public.atlas_team_threads; msg uuid; target uuid;
BEGIN
 SELECT * INTO r FROM public.atlas_team_requests WHERE id=p_id;
 SELECT * INTO t FROM public.atlas_team_threads WHERE id=r.thread_id FOR UPDATE;
 SELECT * INTO r FROM public.atlas_team_requests WHERE id=p_id FOR UPDATE;
 IF r.id IS NULL OR r.state<>'processing' THEN RETURN jsonb_build_object('saved',false); END IF;
 IF NOT EXISTS(SELECT 1 FROM public.atlas_team_config WHERE owner_id=t.owner_id AND enabled) OR r.actor_id NOT IN(t.owner_id,t.account_person_id) AND NOT EXISTS(SELECT 1 FROM public.tarefas x WHERE x.id=t.task_id AND x.client_id=t.client_id AND r.actor_id=ANY(x.assignee_ids)) AND NOT (r.actor_id=t.current_person_id AND private.atlas_followup_contact(t.id)) THEN RAISE EXCEPTION 'Participação não está mais ativa.' USING ERRCODE='42501'; END IF;
 IF r.lease IS NOT NULL AND (r.lease::text IS DISTINCT FROM p_result->>'worker_lease' OR r.lease_until<=now()) THEN RAISE EXCEPTION 'Lease da resposta mudou.' USING ERRCODE='40001';END IF;
 IF r.actor_id<>t.owner_id AND NOT private.atlas_team_recipient(t.id) THEN RAISE EXCEPTION 'Destinatário mudou.' USING ERRCODE='42501';END IF;
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
 AND NOT EXISTS(SELECT 1 FROM public.atlas_team_requests r WHERE r.thread_id=t.id AND (r.state='queued' OR r.state='processing' AND coalesce(r.lease_until,coalesce(nullif(r.result->>'attempted_at','')::timestamptz,r.created_at)+interval '2 minutes')>now()));
$$;

CREATE OR REPLACE FUNCTION public.atlas_team_worker_apply(p_thread uuid,p_revision integer,p_plan jsonb) RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE t public.atlas_team_threads; task jsonb; next_state text; target uuid; account_ok boolean; ready boolean; review timestamptz; executors uuid[];
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'Acesso exclusivo do worker.' USING ERRCODE='42501';END IF;
 SELECT * INTO t FROM public.atlas_team_threads WHERE id=p_thread FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.atlas_team_requests q WHERE q.thread_id=p_thread AND (q.state='queued' OR q.state='processing' AND coalesce(q.lease_until,q.created_at+interval '2 minutes')>now())) THEN RETURN false;END IF;
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
 IF p_plan ? 'dialogue_reminded_key' THEN
  IF p_plan->>'dialogue_reminded_key' !~ '^[0-9a-f]{64}$' OR t.management_data->>'dialogue_reminded_key'=p_plan->>'dialogue_reminded_key' THEN RETURN false;END IF;
  UPDATE public.atlas_team_threads SET management_data=management_data||jsonb_build_object('dialogue_reminded_key',p_plan->>'dialogue_reminded_key','attention_since',now()) WHERE id=t.id;
 END IF;
 INSERT INTO public.atlas_team_messages(thread_id,role,content) VALUES(t.id,'atlas',left(p_plan->>'text',4000));
 IF p_plan->>'kind' IN('unavailable','delivery_review') THEN
  UPDATE public.atlas_team_threads SET state=CASE WHEN p_plan->>'kind'='delivery_review' THEN 'delivery_review' ELSE 'needs_owner' END,current_person_id=CASE WHEN p_plan->>'kind'='delivery_review' AND management_kind IS NOT NULL THEN account_person_id ELSE owner_id END,next_review_at=NULL,revision=revision+1,updated_at=now() WHERE id=t.id;RETURN true;
 END IF;
 UPDATE public.atlas_team_threads SET state='awaiting_reply',next_review_at=(p_plan->>'next_review_at')::timestamptz,reminder_day=(p_plan->>'reminder_day')::date,reminders_today=(p_plan->>'reminders_today')::integer,revision=revision+1,updated_at=now() WHERE id=t.id;
 RETURN true;
END $$;

CREATE FUNCTION public.atlas_manager_request_account(p_id uuid,p_lease uuid,p_person uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE t public.atlas_team_threads;previous public.atlas_memories;r public.atlas_team_requests;p_revision integer;
BEGIN
 SELECT * INTO r FROM public.atlas_team_requests WHERE id=p_id;
 SELECT * INTO t FROM public.atlas_team_threads WHERE id=r.thread_id FOR UPDATE;
 SELECT * INTO r FROM public.atlas_team_requests WHERE id=p_id FOR UPDATE;
 PERFORM private.atlas_team_request_context(p_id);
 IF r.lease IS DISTINCT FROM p_lease THEN RAISE EXCEPTION 'Lease mudou.' USING ERRCODE='40001';END IF;
 p_revision:=r.thread_revision;
 IF r.actor_id<>t.owner_id OR t.management_kind<>'owner_context' OR NOT coalesce((t.management_data->>'needs_account')::boolean,false) OR t.revision<>p_revision OR NOT private.atlas_manager_live(t.owner_id)
 OR p_person=t.owner_id OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_person AND status='active' AND role IN('admin','superadmin','colaborador')) THEN RAISE EXCEPTION 'Responsável indisponível ou conversa alterada.' USING ERRCODE='42501';END IF;
 IF t.state='closed' AND EXISTS(SELECT 1 FROM public.atlas_manager_accounts WHERE owner_id=t.owner_id AND client_id=t.client_id AND person_id=p_person) THEN RETURN '{"ok":true,"replayed":true}';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('atlas-manager-account:'||t.owner_id::text||t.client_id::text,0));
 SELECT * INTO previous FROM public.atlas_memories WHERE owner_id=t.owner_id AND client_id=t.client_id AND topic='gestao_conta' AND state='active' ORDER BY version DESC,created_at DESC LIMIT 1 FOR UPDATE;
 INSERT INTO public.atlas_manager_accounts(owner_id,client_id,person_id,updated_by) VALUES(t.owner_id,t.client_id,p_person,r.actor_id)
 ON CONFLICT(owner_id,client_id) DO UPDATE SET person_id=excluded.person_id,updated_by=excluded.updated_by,updated_at=now();
 UPDATE public.atlas_memories SET state='replaced' WHERE owner_id=t.owner_id AND client_id=t.client_id AND topic='gestao_conta' AND state='active';
 INSERT INTO public.atlas_memories(owner_id,client_id,content,source,source_quote,topic,version,replaces_id)
 SELECT t.owner_id,t.client_id,'Responsável interno para esclarecimentos operacionais: '||full_name||' ('||p_person||'). Definido pelo dono no robô.','user_confirmation','Seleção explícita do dono na conversa '||t.id,'gestao_conta',coalesce(previous.version,0)+1,previous.id FROM public.profiles WHERE id=p_person;
 INSERT INTO public.atlas_team_messages(thread_id,role,content) VALUES(t.id,'atlas','Fechado, guardei quem cuida dessa conta. No expediente, sigo com essa pessoa e acompanho os próximos passos por aqui.');
 UPDATE public.atlas_team_threads SET state='closed',next_review_at=NULL,management_data=management_data||jsonb_build_object('defined_account_id',p_person),revision=revision+1,updated_at=now() WHERE id=t.id;
 UPDATE public.atlas_team_threads SET account_person_id=p_person,current_person_id=CASE WHEN current_person_id=account_person_id THEN p_person ELSE current_person_id END,revision=revision+1,updated_at=now() WHERE owner_id=t.owner_id AND client_id=t.client_id AND management_kind IN('intake','followup') AND state<>'closed' AND account_person_id<>p_person;
 UPDATE public.atlas_team_requests SET state='completed',applied=true,result=jsonb_build_object('reply','Fechado, guardei quem cuida dessa conta.','decision','account_defined','person_id',p_person),usage='{}' WHERE thread_id=t.id AND actor_id=r.actor_id AND session_id=r.session_id AND state='processing' AND thread_revision=t.revision;
 UPDATE public.atlas_event_findings SET thread_id=NULL,account_id=NULL,state='observed',revision=revision+1,updated_at=now() WHERE thread_id=t.id AND state NOT IN('closed','no_action') AND route<>'none';
 INSERT INTO public.atlas_event_signals(owner_id,client_id,kind,source_id,source_version) VALUES(t.owner_id,t.client_id,'manager_account',t.id::text,p_person::text);
 RETURN '{"ok":true}';
END $$;

REVOKE ALL ON FUNCTION public.atlas_manager_request_account(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.atlas_manager_request_account(uuid,uuid,uuid) TO service_role;

ALTER TABLE public.atlas_event_findings ADD COLUMN followup_thread_id uuid REFERENCES public.atlas_team_threads(id),ADD COLUMN followup_applied_at timestamptz;
CREATE FUNCTION public.atlas_manager_waiting_context(p_owner uuid,p_client uuid,p_conversation uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',t.id,'task_id',t.task_id,'revision',t.revision,
 'task_context_version',private.atlas_task_record(t.id)->>'source_version','waiting_on','client','next_action',t.management_data->'dialogue'->>'next_action') ORDER BY t.id),'[]')
 FROM public.atlas_team_threads t WHERE t.owner_id=p_owner AND t.client_id=p_client AND private.atlas_event_client(p_conversation)=p_client
 AND private.atlas_manager_live(p_owner) AND EXISTS(SELECT 1 FROM public.atlas_event_config WHERE owner_id=p_owner AND enabled AND mode='assist' AND p_client=ANY(client_ids))
 AND private.atlas_team_recipient(t.id) AND t.management_kind='followup' AND t.state IN('awaiting_reply','waiting_review') AND t.management_data->'dialogue'->>'waiting_on'='client'
 AND EXISTS(SELECT 1 FROM public.tarefas x LEFT JOIN public.task_statuses s ON s.value=x.status WHERE x.id=t.task_id AND x.client_id=p_client AND NOT coalesce(s.is_terminal,false))
 AND NOT EXISTS(SELECT 1 FROM public.atlas_team_requests r WHERE r.thread_id=t.id AND (r.state='queued' OR r.state='processing' AND coalesce(r.lease_until,r.created_at+interval '2 minutes')>now()));
$$;
REVOKE ALL ON FUNCTION public.atlas_manager_waiting_context(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.atlas_manager_waiting_context(uuid,uuid,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.atlas_event_publish(p_job uuid) RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE j public.atlas_event_jobs;item jsonb;old public.atlas_event_findings;total integer:=0;task uuid;followup uuid;
BEGIN
 SELECT * INTO j FROM public.atlas_event_jobs WHERE id=p_job AND state='completed' FOR UPDATE;
 IF j.published_at IS NOT NULL THEN RETURN 0;END IF;
 IF j.id IS NULL OR NOT private.atlas_event_enabled(j.owner_id) OR private.atlas_event_client(j.conversation_id) IS DISTINCT FROM j.client_id OR NOT EXISTS(SELECT 1 FROM public.atlas_event_config c JOIN public.profiles p ON p.id=c.owner_id WHERE c.owner_id=j.owner_id AND c.enabled AND j.client_id=ANY(c.client_ids) AND p.status='active' AND p.role IN('admin','superadmin')) THEN RAISE EXCEPTION 'Fonte atual indisponível.';END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(j.result->'items') LOOP
  task:=nullif(item->>'task_id','')::uuid;
  followup:=nullif(item->>'followup_thread_id','')::uuid;
  IF followup IS NOT NULL AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(j.input->'waiting_threads') w JOIN public.atlas_team_threads t ON t.id::text=w->>'id'
   WHERE t.id=followup AND t.owner_id=j.owner_id AND t.client_id=j.client_id AND t.task_id=task AND w->>'task_id'=task::text AND t.revision=(w->>'revision')::integer AND t.management_data->'dialogue'->>'waiting_on'='client' AND item->>'intent'='approval') THEN RAISE EXCEPTION 'Acompanhamento de retorno mudou.' USING ERRCODE='40001';END IF;
  IF task IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.tarefas WHERE id=task AND client_id=j.client_id) THEN RAISE EXCEPTION 'Tarefa fora do cliente atual.';END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(item->'sources') x WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(j.input->'messages') m WHERE m->>'id'=x.value)) THEN RAISE EXCEPTION 'Fonte fora do contexto.';END IF;
  SELECT * INTO old FROM public.atlas_event_findings WHERE owner_id=j.owner_id AND conversation_id=j.conversation_id AND request_key=item->>'request_key' FOR UPDATE;
  IF old.job_id=j.id THEN CONTINUE;END IF;
  IF item->>'route' NOT IN('account','owner','review','none') OR char_length(item->>'title') NOT BETWEEN 1 AND 200 OR char_length(item->>'summary') NOT BETWEEN 1 AND 5000 THEN RAISE EXCEPTION 'Assunto inválido.';END IF;
  INSERT INTO public.atlas_event_findings(owner_id,client_id,conversation_id,job_id,request_key,intent,title,summary,task_id,route,question,sources,versions,state,followup_thread_id)
   VALUES(j.owner_id,j.client_id,j.conversation_id,j.id,item->>'request_key',item->>'intent',item->>'title',item->>'summary',task,item->>'route',item->>'question',item->'sources',jsonb_build_array(jsonb_build_object('job_id',j.id,'result',item,'at',now())),CASE WHEN item->>'route'='none' THEN 'no_action' ELSE 'observed' END,followup)
   ON CONFLICT(owner_id,conversation_id,request_key) DO UPDATE SET followup_thread_id=excluded.followup_thread_id,followup_applied_at=NULL,job_id=excluded.job_id,intent=excluded.intent,title=excluded.title,summary=excluded.summary,task_id=excluded.task_id,route=excluded.route,question=excluded.question,sources=excluded.sources,versions=public.atlas_event_findings.versions||excluded.versions,state=CASE WHEN public.atlas_event_findings.thread_id IS NOT NULL THEN 'update_for_review' ELSE excluded.state END,revision=public.atlas_event_findings.revision+1,updated_at=now();
  total:=total+1;
 END LOOP;
 UPDATE public.atlas_event_jobs SET published_at=now() WHERE id=j.id;
 RETURN total;
END $$;

CREATE FUNCTION public.atlas_manager_apply_event(p_finding uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE f public.atlas_event_findings;t public.atlas_team_threads;j public.atlas_event_jobs;w jsonb;m jsonb;body text;d jsonb;has_new boolean:=false;internal_source boolean;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'Worker exclusivo.' USING ERRCODE='42501';END IF;
 SELECT * INTO f FROM public.atlas_event_findings WHERE id=p_finding FOR UPDATE;
 IF f.followup_thread_id IS NULL THEN RETURN NULL;END IF;
 IF f.followup_applied_at IS NOT NULL THEN RETURN f.followup_thread_id;END IF;
 SELECT * INTO t FROM public.atlas_team_threads WHERE id=f.followup_thread_id FOR UPDATE;
 SELECT * INTO j FROM public.atlas_event_jobs WHERE id=f.job_id AND state='completed';
 SELECT a INTO w FROM jsonb_array_elements(j.input->'waiting_threads') a WHERE a->>'id'=t.id::text;
 IF t.id IS NULL OR j.id IS NULL OR w IS NULL OR t.owner_id<>f.owner_id OR t.client_id<>f.client_id OR j.client_id<>f.client_id OR j.owner_id<>f.owner_id OR j.conversation_id<>f.conversation_id
 OR f.intent<>'approval' OR f.state NOT IN('observed','update_for_review') OR t.task_id IS DISTINCT FROM f.task_id
 OR t.revision IS DISTINCT FROM (w->>'revision')::integer OR t.state NOT IN('awaiting_reply','waiting_review') OR t.management_data->'dialogue'->>'waiting_on' IS DISTINCT FROM 'client'
 OR NOT private.atlas_team_recipient(t.id) OR NOT private.atlas_manager_live(t.owner_id) OR private.atlas_event_client(f.conversation_id) IS DISTINCT FROM t.client_id
 OR NOT EXISTS(SELECT 1 FROM public.atlas_event_config WHERE owner_id=t.owner_id AND enabled AND mode='assist' AND t.client_id=ANY(client_ids))
 OR private.atlas_manager_work(now(),t.owner_id,t.current_person_id)>now()
 OR coalesce((j.input->'coverage'->>'partial')::boolean,true)
 OR NOT EXISTS(SELECT 1 FROM public.atendimento_conversas g WHERE g.id=f.conversation_id AND g.last_message_at IS NOT DISTINCT FROM (j.input->'conversation'->>'last_message_at')::timestamptz)
 OR EXISTS(SELECT 1 FROM public.atlas_team_requests r WHERE r.thread_id=t.id AND (r.state='queued' OR r.state='processing' AND coalesce(r.lease_until,r.created_at+interval '2 minutes')>now())) THEN RETURN NULL;END IF;
 PERFORM 1 FROM public.tarefas WHERE id=t.task_id AND client_id=t.client_id FOR SHARE;
 IF NOT FOUND OR private.atlas_task_record(t.id)->>'source_version' IS DISTINCT FROM w->>'task_context_version' THEN RETURN NULL;END IF;
 IF NOT EXISTS(SELECT 1 FROM public.tarefas x LEFT JOIN public.task_statuses s ON s.value=x.status WHERE x.id=t.task_id AND NOT coalesce(s.is_terminal,false)) THEN RETURN NULL;END IF;
 -- Revalidate every cited source; at least one must be a new external approval.
 FOR m IN SELECT a FROM jsonb_array_elements(j.input->'messages') a WHERE f.sources ? (a->>'id') LOOP
  body:=NULL;internal_source:=false;
  IF m->>'id' LIKE 'in:%' AND m->>'direction'='received' THEN
   SELECT CASE WHEN lower(i.type) IN('ptt','audio','audiomessage','voice','myaudio','voicemessage','voice_message') THEN tr.transcript ELSE i.body END,
   EXISTS(SELECT 1 FROM public.atendimento_grupo_remetente_interno p JOIN public.atendimento_conversas g ON g.id=i.conversation_id WHERE p.cliente_id=g.cliente_id AND p.profile_id IS NOT NULL AND (p.sender_jid=i.sender_jid OR p.phone=i.phone)) INTO body,internal_source
   FROM public.cliente_whatsapp_inbox i LEFT JOIN public.atlas_audio_transcripts tr ON tr.inbox_id=i.id AND tr.owner_id=t.owner_id AND tr.conversation_id=f.conversation_id AND tr.status='completed'
   WHERE 'in:'||i.id=m->>'id' AND i.conversation_id=f.conversation_id AND i.media_purged_at IS NULL;
  ELSIF m->>'id' LIKE 'out:%' AND m->>'direction'='sent' THEN
   SELECT s.body INTO body FROM public.cliente_whatsapp_sent s WHERE 'out:'||s.id=m->>'id' AND s.conversation_id=f.conversation_id;
  END IF;
  IF body IS NULL OR body IS DISTINCT FROM m->>'body' THEN RETURN NULL;END IF;
  IF j.input->'new_ids' ? (m->>'id') AND m->>'direction'='received' AND m->>'author_role' IS DISTINCT FROM 'team' AND NOT coalesce(internal_source,true) AND char_length(btrim(body))>=8 THEN has_new:=true;END IF;
 END LOOP;
 IF NOT has_new THEN RETURN NULL;END IF;
 d:=t.management_data->'dialogue';
 d:=d||jsonb_build_object('waiting_on','self','missing_field','progress','next_action','Retomar a etapa após a aprovação registrada','last_event_at',now());
 d:=jsonb_set(d,'{answered,approval}',jsonb_build_object('value',left(f.summary,1000),'finding_id',f.id,'at',now()));
 UPDATE public.atlas_team_threads SET management_data=(management_data-ARRAY['dialogue_reminded_key','attention_since'])||jsonb_build_object('dialogue',d),summary=left(f.summary,2000),
 state='awaiting_reply',next_review_at=private.atlas_manager_work(now()+interval '1 day',owner_id,current_person_id),revision=revision+1,updated_at=now() WHERE id=t.id;
 INSERT INTO public.atlas_team_messages(thread_id,role,content) VALUES(t.id,'atlas','A aprovação do cliente chegou para esta etapa. Consegue seguir com o próximo passo? As fontes estão no contexto do assunto.');
 UPDATE public.atlas_event_findings SET thread_id=t.id,state='account_contacted',followup_applied_at=now(),updated_at=now() WHERE id=f.id;
 RETURN t.id;
END $$;
REVOKE ALL ON FUNCTION public.atlas_manager_apply_event(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.atlas_manager_apply_event(uuid) TO service_role;

CREATE FUNCTION private.atlas_team_group_alerts(p_thread uuid,p_actor uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',g.id,'name',g.display_name,'since',g.awaiting_response_since,
 'version',md5(jsonb_build_array(g.last_message_at,g.awaiting_response_since,g.cliente_id,g.chat_jid,g.status)::text)) ORDER BY g.awaiting_response_since,g.id),'[]')
 FROM public.atlas_team_threads t JOIN public.atendimento_conversas g ON private.atlas_event_client(g.id)=t.client_id
 WHERE t.id=p_thread AND (p_actor=t.owner_id OR p_actor=private.atlas_manager_account(t.owner_id,t.client_id)) AND g.awaiting_response_since IS NOT NULL AND g.status IS DISTINCT FROM 'resolvido';
$$;
REVOKE ALL ON FUNCTION private.atlas_team_group_alerts(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.atlas_team_answered_group(p_thread uuid,p_revision integer,p_conversation uuid,p_version text,p_note text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE t public.atlas_team_threads;g public.atendimento_conversas;v text;
BEGIN
 SELECT * INTO t FROM public.atlas_team_threads WHERE id=p_thread FOR UPDATE;
 IF t.id IS NULL OR NOT private.atlas_team_member(t) OR (auth.uid() IS DISTINCT FROM t.owner_id AND auth.uid() IS DISTINCT FROM private.atlas_manager_account(t.owner_id,t.client_id)) OR t.revision<>p_revision THEN RAISE EXCEPTION 'Conversa ou destinatário mudou.' USING ERRCODE='42501';END IF;
 IF EXISTS(SELECT 1 FROM public.atlas_team_requests r WHERE r.thread_id=t.id AND (r.state='queued' OR r.state='processing' AND coalesce(r.lease_until,r.created_at+interval '2 minutes')>now())) THEN RAISE EXCEPTION 'Aguarde a resposta em andamento.' USING ERRCODE='40001';END IF;
 IF char_length(btrim(coalesce(p_note,''))) NOT BETWEEN 10 AND 2000 THEN RAISE EXCEPTION 'Explique onde e como o cliente foi respondido.';END IF;
 SELECT * INTO g FROM public.atendimento_conversas WHERE id=p_conversation FOR UPDATE;
 IF g.id IS NULL OR private.atlas_event_client(g.id) IS DISTINCT FROM t.client_id THEN RAISE EXCEPTION 'Grupo fora deste cliente.' USING ERRCODE='42501';END IF;
 v:=md5(jsonb_build_array(g.last_message_at,g.awaiting_response_since,g.cliente_id,g.chat_jid,g.status)::text);
 IF v IS DISTINCT FROM p_version OR g.awaiting_response_since IS NULL OR g.status='resolvido' THEN RAISE EXCEPTION 'O grupo recebeu uma atualização. Confira a última mensagem antes de resolver o aviso.' USING ERRCODE='40001';END IF;
 UPDATE public.atendimento_conversas SET status='resolvido',awaiting_response_since=NULL,
 group_ai_analysis=CASE WHEN group_ai_analysis IS NULL THEN NULL ELSE jsonb_set(group_ai_analysis,'{needs_agency_response}','false',true) END,
 resolved_at=now(),resolved_by=auth.uid(),updated_at=now() WHERE id=g.id;
 UPDATE public.pendencias_caixa SET estado='resolvida',resolution_kind='respondido',resolved_at=now(),resolved_by=auth.uid(),updated_at=now()
 WHERE conversation_id=g.id AND origem='conversa' AND resolved_at IS NULL;
 INSERT INTO public.atlas_team_messages(thread_id,role,actor_id,content,proposal) VALUES(t.id,'human',auth.uid(),
 'Informei que o cliente já foi respondido: '||btrim(p_note),jsonb_build_object('action','answered_group','conversation_id',g.id,'source_version',v,'basis','human_report'));
 INSERT INTO public.atlas_team_messages(thread_id,role,content) VALUES(t.id,'atlas','Registrei sua justificativa e resolvi o aviso de grupo sem resposta. As tarefas continuam com a etapa que está registrada nelas.');
 UPDATE public.atlas_team_threads SET management_data=management_data||jsonb_build_object('answered_group',jsonb_build_object('conversation_id',g.id,'actor_id',auth.uid(),'at',now(),'basis','human_report')),
 revision=revision+1,updated_at=now() WHERE id=t.id;
 RETURN jsonb_build_object('ok',true,'conversation_id',g.id,'basis','human_report');
END $$;
REVOKE ALL ON FUNCTION public.atlas_team_answered_group(uuid,integer,uuid,text,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.atlas_team_answered_group(uuid,integer,uuid,text,text) TO authenticated;

NOTIFY pgrst,'reload schema';
COMMIT;

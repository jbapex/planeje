BEGIN;

-- Keep one execution followup per task; owner information queries have independent origins.
DROP INDEX public.atlas_team_one_active_task;
CREATE UNIQUE INDEX atlas_team_one_active_task ON public.atlas_team_threads(owner_id,task_id)
 WHERE task_id IS NOT NULL AND state<>'closed' AND (origin_job_id IS NULL OR management_kind='followup')
 AND (management_kind IS DISTINCT FROM 'consultation' OR NOT management_data ? 'owner_contact_request_id');

CREATE FUNCTION private.atlas_manager_owner_contact(p_text text,p_owner uuid) RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE body text;clause text;parts text[];name text;person uuid;candidate uuid;matches integer;directives integer:=0;
BEGIN
 body:=translate(lower(p_text),'áàâãäéèêëíìîïóòôõöúùûüç','aaaaaeeeeiiiiooooouuuuc');
 IF body ~ '(^|[[:space:]])(se|caso)[[:space:]]+(precisar|puder|for)([^[:alnum:]_]|$)' THEN RETURN NULL;END IF;
 FOR clause IN SELECT regexp_split_to_table(body,E'[,;.!?\\n]') LOOP
  IF clause ~ '(^|[[:space:]])(nao|nunca|nem|talvez)([[:space:]]|$)' THEN
   IF clause ~ '(^|[[:space:]])(confirme|confirma|consulte|consulta|pergunte|pergunta|verifique|verifica|confira|fale|fala)([[:space:]]|$)' THEN RETURN NULL;END IF;
   CONTINUE;
  END IF;
  parts:=regexp_match(clause,'^[[:space:]]*(por favor[[:space:]]+)?(confirme|confirma|consulte|consulta|pergunte|pergunta|verifique|verifica|confira|fale|fala)[[:space:]]+(com|a|ao|para)[[:space:]]+(a[[:space:]]+|o[[:space:]]+)?(.+?)[[:space:]]*$');
  IF parts IS NULL THEN CONTINUE;END IF;
  name:=btrim(regexp_replace(parts[5],'[[:space:]]+(por favor|por mim)$',''));
  SELECT count(*),min(p.id::text)::uuid INTO matches,candidate FROM public.profiles p
  WHERE p.id<>p_owner AND p.status='active' AND p.role IN('admin','superadmin','colaborador')
  AND name IN(translate(lower(btrim(p.full_name)),'áàâãäéèêëíìîïóòôõöúùûüç','aaaaaeeeeiiiiooooouuuuc'),translate(lower(split_part(btrim(p.full_name),' ',1)),'áàâãäéèêëíìîïóòôõöúùûüç','aaaaaeeeeiiiiooooouuuuc'));
  IF matches<>1 THEN RETURN NULL;END IF;
  directives:=directives+1;person:=candidate;
 END LOOP;
 RETURN CASE WHEN directives=1 THEN person END;
END $$;
REVOKE ALL ON FUNCTION private.atlas_manager_owner_contact(text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.atlas_manager_owner_contact(text,uuid) TO service_role;

-- A separate conversation shares only the operational question, never the owner's history.
CREATE FUNCTION private.atlas_owner_contact_current(p_thread uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.atlas_team_threads t
 JOIN public.atlas_team_requests r ON r.id=nullif(t.management_data->>'owner_contact_request_id','')::uuid AND r.state='completed' AND r.applied
 JOIN public.atlas_team_threads parent ON parent.id=r.thread_id AND parent.owner_id=t.owner_id AND parent.client_id=t.client_id AND r.actor_id=parent.owner_id
 JOIN public.clientes cl ON cl.id=t.client_id AND cl.etapa='closed'
 JOIN public.profiles p ON p.id=t.current_person_id AND p.status='active' AND p.role IN('admin','superadmin','colaborador')
 JOIN public.profiles owner ON owner.id=t.owner_id AND owner.status='active' AND owner.role='superadmin'
 JOIN public.atlas_event_config cfg ON cfg.owner_id=t.owner_id AND t.client_id=ANY(cfg.client_ids)
 WHERE t.id=p_thread AND t.management_kind='consultation' AND t.origin_job_id IS NULL AND private.atlas_manager_live(t.owner_id)
 AND parent.state<>'closed' AND (parent.management_data->>'owner_contact_thread_id'=t.id::text OR t.state='closed' AND parent.management_data->'owner_contact_return'->>'thread_id'=t.id::text)
 AND parent.task_id IS NOT DISTINCT FROM t.task_id AND parent.account_person_id=t.account_person_id
 AND (parent.origin_job_id IS NULL OR private.atlas_consult_current(parent.id))
 AND t.account_person_id=private.atlas_manager_account(t.owner_id,t.client_id)
 AND (t.task_id IS NULL OR EXISTS(SELECT 1 FROM public.tarefas x WHERE x.id=t.task_id AND x.client_id=t.client_id))
 AND r.result->>'owner_contact_thread_id'=t.id::text AND r.result->>'owner_contact_person_id'=t.current_person_id::text
 AND EXISTS(SELECT 1 FROM auth.sessions s WHERE s.id=r.session_id AND s.user_id=t.owner_id)
 AND (auth.uid() IN(t.owner_id,t.current_person_id) OR auth.role()='service_role'));
$$;
REVOKE ALL ON FUNCTION private.atlas_owner_contact_current(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.atlas_owner_contact_current(uuid) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION private.atlas_team_recipient(p_thread uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.atlas_team_threads t WHERE t.id=p_thread
 AND (auth.uid() IN(t.owner_id,t.current_person_id) OR auth.role()='service_role')
 AND CASE WHEN t.origin_job_id IS NOT NULL THEN private.atlas_consult_current(t.id)
 WHEN t.management_kind='consultation' AND t.management_data ? 'owner_contact_request_id' THEN private.atlas_owner_contact_current(t.id) AND coalesce(t.management_data->>'dispatch_pending','false')='false'
 WHEN t.management_kind='owner_context' THEN t.current_person_id=t.owner_id
 WHEN t.management_kind='intake' THEN t.current_person_id=t.account_person_id AND t.account_person_id=private.atlas_manager_account(t.owner_id,t.client_id)
 ELSE EXISTS(SELECT 1 FROM public.tarefas x WHERE x.id=t.task_id AND x.client_id=t.client_id AND (
 t.current_person_id=ANY(x.assignee_ids) OR t.current_person_id=t.account_person_id AND (t.management_kind IS NULL OR t.account_person_id=private.atlas_manager_account(t.owner_id,t.client_id))
 OR private.atlas_followup_contact(t.id))) END);
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
 'people',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.full_name,'hours',coalesce((SELECT jsonb_build_object('start_time',h.start_time,'end_time',h.end_time) FROM public.atlas_team_hours h WHERE h.owner_id=t.owner_id AND h.person_id=p.id),'{"start_time":"08:00","end_time":"17:00"}'::jsonb))),'[]') FROM public.profiles p WHERE p.status='active' AND p.role IN('admin','superadmin','colaborador') AND (p_actor=t.owner_id OR p.id IN(t.owner_id,t.account_person_id,t.current_person_id) OR EXISTS(SELECT 1 FROM public.tarefas x WHERE x.id=t.task_id AND x.client_id=t.client_id AND p.id=ANY(x.assignee_ids)))),
 'task',private.atlas_task_record(record_thread),
 'task_lookup',CASE WHEN coalesce(t.task_id,parent.task_id) IS NULL THEN CASE WHEN t.management_kind IN('followup','owner_context') AND t.management_data ? 'parent_thread' OR t.management_kind='followup' THEN 'unlinked' ELSE 'not_required' END WHEN EXISTS(SELECT 1 FROM public.tarefas x WHERE x.id=coalesce(t.task_id,parent.task_id) AND x.client_id=t.client_id) THEN 'found' ELSE 'missing' END,
 'last_observed_stage',(SELECT r.result->'task_stage' FROM public.atlas_team_requests r WHERE r.thread_id=t.id AND r.state='completed' AND r.applied AND coalesce(r.result->>'resume_blocked','false')<>'true' AND jsonb_typeof(r.result->'task_stage')='object' ORDER BY r.thread_revision DESC,r.created_at DESC,r.id DESC LIMIT 1),
 'hours',coalesce((SELECT jsonb_build_object('start_time',h.start_time,'end_time',h.end_time) FROM public.atlas_team_hours h WHERE h.owner_id=t.owner_id AND h.person_id=p_actor),'{"start_time":"08:00","end_time":"17:00"}'::jsonb),
 'last_request',(SELECT jsonb_build_object('id',r.id,'message_id',r.message_id,'message',m.content,'state',r.state,'attempt',coalesce((r.result->>'attempt')::integer,1),'error_code',r.result->>'error_code') FROM public.atlas_team_requests r JOIN public.atlas_team_messages m ON m.id=r.message_id AND m.thread_id=t.id WHERE r.thread_id=t.id AND r.actor_id=p_actor ORDER BY coalesce(nullif(r.result->>'attempted_at','')::timestamptz,r.created_at) DESC,r.id DESC LIMIT 1),
 'reply_pending',EXISTS(SELECT 1 FROM public.atlas_team_requests q WHERE q.thread_id=t.id AND (q.state='queued' OR q.state='processing' AND coalesce(q.lease_until,q.created_at+interval '2 minutes')>now())),'queried_at',now()) INTO result FROM public.clientes c WHERE c.id=t.client_id;
 RETURN result||jsonb_build_object('group_alerts',private.atlas_team_group_alerts(t.id,p_actor));
END $$;
CREATE OR REPLACE FUNCTION private.atlas_manager_finish(p_id uuid,p_result jsonb,p_usage jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE t public.atlas_team_threads;r public.atlas_team_requests;actor uuid;kind text;selected uuid;task public.tarefas;v_title text;body text;review timestamptz;expected timestamptz;due date;initial text;tasktype text;days integer;existing uuid;name text;owner_thread uuid;parent uuid;resume boolean:=false;basis text;tasks_basis text;question_override text;contact uuid;contact_assignees uuid[];ref jsonb;record jsonb;entry jsonb;record_url text;dialogue jsonb;owner_contact uuid;contact_thread uuid;at_work timestamptz;question text;origin public.atlas_team_threads;
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
 IF t.management_kind='followup' AND actor=t.owner_id THEN
  SELECT private.atlas_manager_owner_contact(m.content,t.owner_id) INTO owner_contact FROM public.atlas_team_messages m WHERE m.id=r.message_id AND m.thread_id=t.id AND m.actor_id=actor;
  IF owner_contact IS NOT NULL THEN
   IF selected IS NOT NULL AND selected<>owner_contact THEN RAISE EXCEPTION 'A pessoa indicada não corresponde ao pedido do dono.' USING ERRCODE='42501';END IF;
   IF t.account_person_id IS DISTINCT FROM private.atlas_manager_account(t.owner_id,t.client_id)
   OR t.task_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.tarefas x WHERE x.id=t.task_id AND x.client_id=t.client_id) THEN RAISE EXCEPTION 'O vínculo do assunto mudou.' USING ERRCODE='42501';END IF;
   selected:=owner_contact;kind:='progress';
  END IF;
 END IF;
 IF t.management_data ? 'owner_contact_request_id' THEN
  IF NOT private.atlas_owner_contact_current(t.id) THEN RAISE EXCEPTION 'A origem da consulta mudou.' USING ERRCODE='42501';END IF;
  selected:=NULL;
  IF kind IN('owner_needed','blocked') THEN kind:='resolved';END IF;
 END IF;
 IF actor=t.owner_id AND kind='owner_needed' AND t.management_kind<>'owner_context' THEN
  selected:=NULL;kind:='progress';p_result:=jsonb_set(p_result,'{reply}',to_jsonb(CASE WHEN t.management_kind='followup' AND t.task_id IS NULL THEN 'Não localizei a tarefa vinculada. ' ELSE '' END||'Você está falando comigo como dono. Vou seguir a partir do contexto que trouxe.'));
  IF dialogue IS NOT NULL THEN dialogue:=jsonb_set(dialogue,'{waiting_on}','"self"');END IF;
 END IF;
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
    IF EXISTS(SELECT 1 FROM public.atlas_team_threads x WHERE x.owner_id=t.owner_id AND x.task_id=task.id AND x.id<>t.id AND x.state<>'closed' AND (x.origin_job_id IS NULL OR x.management_kind='followup') AND (x.management_kind IS DISTINCT FROM 'consultation' OR NOT x.management_data ? 'owner_contact_request_id')) THEN kind:='ask';question_override:='Já estou acompanhando essa tarefa em outra conversa. Vamos seguir por lá para não cobrar duas vezes.';END IF;
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
 ELSIF owner_contact IS NOT NULL THEN
  at_work:=private.atlas_manager_work(now(),t.owner_id,selected);
  question:='Você confirma a situação deste assunto e se ele deve continuar ou ser encerrado? Referência: '||left(t.title,180)||'.'||CASE WHEN t.task_id IS NULL THEN ' Não localizei a tarefa vinculada; o título é apenas a referência anterior do acompanhamento.' ELSE ' A consulta não altera a tarefa oficial.' END;
  INSERT INTO public.atlas_team_threads(owner_id,client_id,task_id,account_person_id,current_person_id,title,shared_context,source_key,state,next_review_at,management_kind,management_data)
  VALUES(t.owner_id,t.client_id,t.task_id,t.account_person_id,selected,left('Consulta: '||t.title,200),jsonb_build_object('label','Consulta operacional solicitada pelo dono','text',question,'at',now()),'owner-contact:'||r.id,
   CASE WHEN at_work>now() THEN 'waiting_review' ELSE 'awaiting_reply' END,CASE WHEN at_work>now() THEN at_work ELSE private.atlas_manager_work(now()+interval '1 hour',t.owner_id,selected) END,'consultation',
   jsonb_build_object('owner_contact_request_id',r.id,'dispatch_pending',at_work>now(),'scheduled_at',at_work,'question',question)) RETURNING id INTO contact_thread;
  IF at_work<=now() THEN INSERT INTO public.atlas_team_messages(thread_id,role,content) VALUES(contact_thread,'atlas',question);END IF;
  UPDATE public.atlas_team_threads SET state='waiting_review',next_review_at=NULL,summary=p_result->>'summary',management_data=management_data||jsonb_build_object('owner_contact_thread_id',contact_thread),revision=revision+1,updated_at=now() WHERE id=t.id;
  p_result:=p_result||jsonb_build_object('owner_contact_thread_id',contact_thread,'owner_contact_person_id',selected);
  IF dialogue IS NOT NULL THEN dialogue:=dialogue||jsonb_build_object('waiting_on','team','next_action','Aguardar retorno da consulta operacional');END IF;
  body:=CASE WHEN t.task_id IS NULL THEN 'Não localizei a tarefa vinculada. ' ELSE '' END||CASE WHEN at_work>now() THEN 'Agendei a consulta com ' ELSE 'Registrei a consulta para ' END||(SELECT full_name FROM public.profiles WHERE id=selected)||CASE WHEN at_work>now() THEN ' no próximo expediente. Ainda não enviei a pergunta.' ELSE '. Assim que houver resposta, trago o relato por aqui.' END;
 ELSIF kind='resolved' AND t.management_data ? 'owner_contact_request_id' THEN
  SELECT parent.* INTO origin FROM public.atlas_team_threads parent JOIN public.atlas_team_requests source ON source.thread_id=parent.id WHERE source.id=(t.management_data->>'owner_contact_request_id')::uuid AND parent.owner_id=t.owner_id AND parent.client_id=t.client_id AND parent.management_data->>'owner_contact_thread_id'=t.id::text FOR UPDATE OF parent;
  IF origin.id IS NULL THEN RAISE EXCEPTION 'Assunto de origem indisponível.' USING ERRCODE='42501';END IF;
  body:='Retorno de '||(SELECT full_name FROM public.profiles WHERE id=actor)||' (relato recebido em '||to_char(now() AT TIME ZONE 'America/Sao_Paulo','DD/MM/YYYY HH24:MI')||'): '||(p_result->>'summary');
  INSERT INTO public.atlas_team_messages(thread_id,role,content) VALUES(origin.id,'atlas',body);
  UPDATE public.atlas_team_threads SET summary=left(body,2000),management_data=(management_data-'owner_contact_thread_id')||jsonb_build_object('owner_contact_return',jsonb_build_object('thread_id',t.id,'actor_id',actor,'at',now(),'summary',p_result->>'summary')),state='waiting_review',next_review_at=NULL,revision=revision+1,updated_at=now() WHERE id=origin.id;
  UPDATE public.atlas_team_threads SET management_data=jsonb_set(management_data,'{dialogue}',coalesce(management_data->'dialogue','{}')||jsonb_build_object('waiting_on','none','next_action','Conferir o relato recebido','missing_field',NULL)) WHERE id=origin.id;
  UPDATE public.atlas_team_threads SET state='closed',next_review_at=NULL,summary=p_result->>'summary',revision=revision+1,updated_at=now() WHERE id=t.id;
  body:='Registrei seu relato e trouxe o retorno à conversa que originou esta consulta.';
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
   UPDATE public.atlas_team_threads SET state=CASE WHEN kind='ask' THEN 'awaiting_reply' ELSE 'waiting_review' END,next_review_at=CASE WHEN actor=t.owner_id AND t.management_kind='followup' AND t.task_id IS NULL THEN NULL ELSE review END,expected_at=expected,summary=p_result->>'summary',revision=revision+1,reminder_day=NULL,reminders_today=0,updated_at=now() WHERE id=t.id;
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
 'recipient_valid',CASE WHEN t.management_data ? 'owner_contact_request_id' THEN private.atlas_owner_contact_current(t.id) WHEN t.origin_job_id IS NOT NULL THEN private.atlas_consult_current(t.id) ELSE t.current_person_id IN(t.owner_id,t.account_person_id) OR EXISTS(SELECT 1 FROM public.tarefas x WHERE x.id=t.task_id AND x.client_id=t.client_id AND t.current_person_id=ANY(x.assignee_ids)) OR private.atlas_followup_contact(t.id) END,
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
 IF t.management_data ? 'owner_contact_request_id' AND NOT private.atlas_owner_contact_current(t.id) THEN RETURN false;END IF;
 IF p_plan->>'kind'='owner_contact_dispatch' THEN
  IF t.management_kind<>'consultation' OR t.state<>'waiting_review' OR NOT t.management_data ? 'owner_contact_request_id' OR t.management_data->>'dispatch_pending' IS DISTINCT FROM 'true'
  OR (t.management_data->>'scheduled_at')::timestamptz>now() OR private.atlas_manager_work(now(),t.owner_id,t.current_person_id)>now() THEN RETURN false;END IF;
  INSERT INTO public.atlas_team_messages(thread_id,role,content) VALUES(t.id,'atlas',t.management_data->>'question');
  UPDATE public.atlas_team_threads SET state='awaiting_reply',next_review_at=private.atlas_manager_work(now()+interval '1 hour',owner_id,current_person_id),management_data=management_data||'{"dispatch_pending":false}',revision=revision+1,updated_at=now() WHERE id=t.id;
  RETURN true;
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

-- Information queries do not stand in for official task execution.
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
  IF EXISTS(SELECT 1 FROM public.atlas_team_threads WHERE owner_id=own AND task_id=task.id AND state<>'closed' AND (origin_job_id IS NULL OR management_kind='followup') AND (management_kind IS DISTINCT FROM 'consultation' OR NOT management_data ? 'owner_contact_request_id')) THEN CONTINUE;END IF;
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
 SELECT * INTO existing FROM public.atlas_team_threads WHERE owner_id=auth.uid() AND task_id=p_task AND state<>'closed' AND (origin_job_id IS NULL OR management_kind='followup') AND (management_kind IS DISTINCT FROM 'consultation' OR NOT management_data ? 'owner_contact_request_id') FOR UPDATE;
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

COMMIT;

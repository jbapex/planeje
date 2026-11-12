BEGIN;

-- The visible conversation and its exact client/task remain the access boundary.
CREATE FUNCTION private.atlas_task_record(p_thread uuid) RETURNS jsonb
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
  'publications',(SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.updated_at,p.id),'[]') FROM (SELECT p.id,p.channel,p.status,p.assignee_id,p.scheduled_for,p.published_on,p.evidence_url,p.updated_at FROM public.task_channel_publications p WHERE p.task_id=x.id ORDER BY p.updated_at DESC,p.id DESC LIMIT 20) p),
  'coverage',jsonb_build_object('comments_total',(SELECT count(*) FROM public.task_comments c WHERE c.task_id=x.id),
   'justifications_total',(SELECT count(*) FROM public.task_delay_justifications j WHERE j.task_id=x.id),
   'attachments_total',(SELECT count(*) FROM public.task_attachments a WHERE a.task_id=x.id),
   'publications_total',(SELECT count(*) FROM public.task_channel_publications p WHERE p.task_id=x.id),
   'status_history_total',CASE WHEN jsonb_typeof(x.status_history)='array' THEN jsonb_array_length(x.status_history) ELSE 0 END,
   'description_length',length(coalesce(x.description,'')),'attachment_content_read',false)
 ) value
 FROM public.atlas_team_threads t JOIN public.tarefas x ON x.id=t.task_id AND x.client_id=t.client_id LEFT JOIN public.task_statuses s ON s.value=x.status
 WHERE t.id=p_thread
 ) SELECT value||jsonb_build_object('source_version',md5(value::text)) FROM record;
$$;
REVOKE ALL ON FUNCTION private.atlas_task_record(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.atlas_task_record(uuid) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.atlas_team_context(p_thread uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE t public.atlas_team_threads; result jsonb;
BEGIN
 SELECT * INTO t FROM public.atlas_team_threads WHERE id=p_thread;
 IF t.id IS NULL THEN RAISE EXCEPTION 'Conversa indisponível.' USING ERRCODE='42501'; END IF;
 SELECT jsonb_build_object('thread',to_jsonb(t),'client_name',c.empresa,'actor_id',auth.uid(),'is_owner',auth.uid()=t.owner_id,
 'messages',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.created_at,x.id),'[]') FROM(SELECT * FROM public.atlas_team_messages m WHERE m.thread_id=t.id ORDER BY m.created_at DESC,m.id DESC LIMIT 40)x),
 'people',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.full_name,'hours',coalesce((SELECT jsonb_build_object('start_time',h.start_time,'end_time',h.end_time) FROM public.atlas_team_hours h WHERE h.owner_id=t.owner_id AND h.person_id=p.id),'{"start_time":"08:00","end_time":"17:00"}'::jsonb))),'[]') FROM public.profiles p WHERE p.status='active' AND (p.id IN(t.owner_id,t.account_person_id) OR EXISTS(SELECT 1 FROM public.tarefas x WHERE x.id=t.task_id AND x.client_id=t.client_id AND p.id=ANY(x.assignee_ids)))),
 'task',private.atlas_task_record(t.id),
 'last_observed_stage',(SELECT r.result->'task_stage' FROM public.atlas_team_requests r WHERE r.thread_id=t.id AND r.state='completed' AND r.applied AND coalesce(r.result->>'resume_blocked','false')<>'true' AND jsonb_typeof(r.result->'task_stage')='object' ORDER BY r.thread_revision DESC,r.created_at DESC,r.id DESC LIMIT 1),
 'hours',coalesce((SELECT jsonb_build_object('start_time',h.start_time,'end_time',h.end_time) FROM public.atlas_team_hours h WHERE h.owner_id=t.owner_id AND h.person_id=auth.uid()),'{"start_time":"08:00","end_time":"17:00"}'::jsonb),
 'last_request',(SELECT jsonb_build_object('id',r.id,'message_id',r.message_id,'message',m.content,'state',r.state,'attempt',coalesce((r.result->>'attempt')::integer,1),'error_code',r.result->>'error_code') FROM public.atlas_team_requests r JOIN public.atlas_team_messages m ON m.id=r.message_id AND m.thread_id=t.id WHERE r.thread_id=t.id AND r.actor_id=auth.uid() ORDER BY coalesce(nullif(r.result->>'attempted_at','')::timestamptz,r.created_at) DESC,r.id DESC LIMIT 1),
 'queried_at',now()) INTO result FROM public.clientes c WHERE c.id=t.client_id;
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.atlas_team_worker_snapshot() RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('thread',to_jsonb(t),
 'task',private.atlas_task_record(t.id),
 'task_exists',EXISTS(SELECT 1 FROM public.tarefas x WHERE x.id=t.task_id AND x.client_id=t.client_id),
 'task_terminal',EXISTS(SELECT 1 FROM public.tarefas x JOIN public.task_statuses s ON s.value=x.status AND s.is_terminal WHERE x.id=t.task_id AND x.client_id=t.client_id),
 'recipient_active',p.status='active' AND p.role IN('admin','superadmin','colaborador'),
 'account_active',EXISTS(SELECT 1 FROM public.profiles a WHERE a.id=t.account_person_id AND a.status='active' AND a.role IN('admin','superadmin','colaborador') AND private.atlas_manager_account(t.owner_id,t.client_id)=a.id),
 'recipient_valid',CASE WHEN t.origin_job_id IS NOT NULL THEN private.atlas_consult_current(t.id) ELSE t.current_person_id IN(t.owner_id,t.account_person_id) OR EXISTS(SELECT 1 FROM public.tarefas x WHERE x.id=t.task_id AND x.client_id=t.client_id AND t.current_person_id=ANY(x.assignee_ids)) OR private.atlas_followup_contact(t.id) END,
 'hours',coalesce((SELECT jsonb_build_object('start_time',h.start_time,'end_time',h.end_time) FROM public.atlas_team_hours h WHERE h.owner_id=t.owner_id AND h.person_id=t.current_person_id),'{}'))),'[]')
 FROM public.atlas_team_threads t JOIN public.atlas_team_config c ON c.owner_id=t.owner_id AND c.enabled LEFT JOIN public.profiles p ON p.id=t.current_person_id
 WHERE t.state IN('awaiting_reply','waiting_review') AND NOT EXISTS(SELECT 1 FROM public.atlas_team_requests r WHERE r.thread_id=t.id AND r.state='processing' AND coalesce(nullif(r.result->>'attempted_at','')::timestamptz,r.created_at)>now()-interval '2 minutes');
$$;

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
 IF nullif(p_result->>'task_context_version','') IS NOT NULL AND p_result->>'task_context_version' IS DISTINCT FROM (private.atlas_task_record(t.id)->>'source_version') THEN RAISE EXCEPTION 'Os registros da tarefa mudaram durante a análise.' USING ERRCODE='40001';END IF;
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
 IF nullif(p_result->>'evidence_url','') IS NOT NULL AND (p_result->>'evidence_url' !~ '^https?://' OR NOT EXISTS(SELECT 1 FROM public.atlas_team_messages WHERE id=r.message_id AND position(p_result->>'evidence_url' IN content)>0)) THEN RAISE EXCEPTION 'Evidência não veio da resposta.';END IF;
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
    body:=CASE WHEN actor=t.account_person_id THEN 'Quem cuida da conta explicou: ' ELSE 'A tarefa está atribuída a você e a etapa foi atualizada: ' END||(p_result->>'summary')||' Como está esse trabalho agora? Me conta para eu acompanhar daqui.';
   END IF;
  ELSE
   UPDATE public.atlas_team_threads SET state=CASE WHEN kind='ask' THEN 'awaiting_reply' ELSE 'waiting_review' END,next_review_at=review,expected_at=expected,summary=p_result->>'summary',revision=revision+1,reminder_day=NULL,reminders_today=0,updated_at=now() WHERE id=t.id;
  END IF;
 END IF;
 INSERT INTO public.atlas_team_messages(thread_id,role,content) VALUES(t.id,'atlas',body);
 UPDATE public.atlas_team_requests SET state='completed',applied=kind<>'queued',thread_revision=(SELECT revision FROM public.atlas_team_threads WHERE id=t.id),result=p_result||jsonb_build_object('applied_decision',kind,'task_id',task.id,'client_basis',basis,'tasks_basis',tasks_basis,'contact_person_id',contact,'contact_assignee_ids',contact_assignees,'attempt',coalesce((r.result->>'attempt')::integer,1),'attempted_at',coalesce(r.result->>'attempted_at',r.created_at::text)),usage=private.atlas_team_merge_usage(usage,p_usage) WHERE id=r.id;
 RETURN jsonb_build_object('saved',true,'decision',kind,'task_id',task.id);
END $$;

NOTIFY pgrst,'reload schema';
COMMIT;

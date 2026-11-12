BEGIN;

ALTER TABLE public.atlas_team_messages ADD COLUMN images jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(images)='array' AND jsonb_array_length(images)<=2);

-- Paths identify the conversation and uploader; no public or external image URLs.
CREATE FUNCTION private.atlas_chat_image_access(p_name text,p_write boolean DEFAULT false) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE parts text[];t public.atlas_team_threads;
BEGIN
 IF NOT private.atlas_team_human() OR p_name IS NULL OR p_name !~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}/[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}/[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}/[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}\.(png|jpg|jpeg|webp)$' THEN RETURN false;END IF;
 parts:=string_to_array(p_name,'/');
 SELECT * INTO t FROM public.atlas_team_threads WHERE id=parts[1]::uuid;
 IF t.id IS NULL OR NOT private.atlas_team_member(t) THEN RETURN false;END IF;
 IF p_write THEN RETURN parts[2]=auth.uid()::text AND t.state NOT IN('closed','delivery_review') AND auth.uid() IN(t.owner_id,t.current_person_id);END IF;
 RETURN parts[2]=auth.uid()::text OR EXISTS(SELECT 1 FROM public.atlas_team_messages m WHERE m.thread_id=t.id AND m.images @> jsonb_build_array(jsonb_build_object('path',p_name)));
END $$;
REVOKE ALL ON FUNCTION private.atlas_chat_image_access(text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.atlas_chat_image_access(text,boolean) TO authenticated,service_role;
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types) VALUES('atlas-chat-images','atlas-chat-images',false,5242880,ARRAY['image/png','image/jpeg','image/webp']);
CREATE POLICY atlas_chat_image_read ON storage.objects FOR SELECT TO authenticated USING(bucket_id='atlas-chat-images' AND private.atlas_chat_image_access(name));
CREATE POLICY atlas_chat_image_read_guard ON storage.objects AS RESTRICTIVE FOR SELECT TO authenticated USING(bucket_id<>'atlas-chat-images' OR private.atlas_chat_image_access(name));
CREATE POLICY atlas_chat_image_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='atlas-chat-images' AND private.atlas_chat_image_access(name,true));
CREATE POLICY atlas_chat_image_insert_guard ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(bucket_id<>'atlas-chat-images' OR private.atlas_chat_image_access(name,true));
CREATE POLICY atlas_chat_image_no_update ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated USING(bucket_id<>'atlas-chat-images') WITH CHECK(bucket_id<>'atlas-chat-images');
CREATE POLICY atlas_chat_image_no_delete ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated USING(bucket_id<>'atlas-chat-images');

CREATE FUNCTION public.atlas_team_enqueue_images(p_thread uuid,p_id uuid,p_text text,p_revision integer,p_images jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE t public.atlas_team_threads;r public.atlas_team_requests;image jsonb;receipt jsonb;msg public.atlas_team_messages;
BEGIN
 t:=private.atlas_team_assert(p_thread);
 IF p_images IS NULL OR jsonb_typeof(p_images)<>'array' OR jsonb_array_length(p_images)>2 THEN RAISE EXCEPTION 'Envie até duas imagens.';END IF;
 IF (SELECT count(DISTINCT value->>'path') FROM jsonb_array_elements(p_images))<>jsonb_array_length(p_images) THEN RAISE EXCEPTION 'Não repita a mesma imagem.';END IF;
 FOR image IN SELECT value FROM jsonb_array_elements(p_images) LOOP
  IF jsonb_typeof(image)<>'object' OR image-ARRAY['path','name','mime','size']<>'{}'::jsonb OR image->>'path' IS NULL OR image->>'mime' IS NULL OR image->>'size' IS NULL OR image->>'name' IS NULL
   OR char_length(image->>'name') NOT BETWEEN 1 AND 120 OR image->>'mime' NOT IN('image/png','image/jpeg','image/webp') OR jsonb_typeof(image->'size')<>'number' OR image->>'size' !~ '^[0-9]{1,8}$' THEN RAISE EXCEPTION 'Imagem inválida.';END IF;
  IF split_part(image->>'path','/',1)<>t.id::text OR NOT private.atlas_chat_image_access(image->>'path',true) OR split_part(image->>'path','/',3)<>p_id::text OR (image->>'size')::bigint NOT BETWEEN 1 AND 5242880 THEN RAISE EXCEPTION 'Imagem fora deste envio.' USING ERRCODE='42501';END IF;
  IF NOT EXISTS(SELECT 1 FROM storage.objects o WHERE o.bucket_id='atlas-chat-images' AND o.name=image->>'path' AND o.metadata->>'mimetype'=image->>'mime' AND o.metadata->>'size'=image->>'size') THEN RAISE EXCEPTION 'A imagem ainda não terminou de enviar.';END IF;
 END LOOP;
 SELECT * INTO r FROM public.atlas_team_requests WHERE id=p_id;
 IF r.id IS NOT NULL THEN
  SELECT * INTO msg FROM public.atlas_team_messages WHERE id=r.message_id;
  IF r.actor_id<>auth.uid() OR r.thread_id<>t.id OR msg.images<>p_images THEN RAISE EXCEPTION 'Este envio já contém outra mensagem ou imagem.';END IF;
 END IF;
 IF (r.id IS NULL OR r.state='failed') AND p_revision IS DISTINCT FROM t.revision THEN RAISE EXCEPTION 'A conversa mudou. Confira antes de enviar.' USING ERRCODE='40001';END IF;
 receipt:=public.atlas_team_enqueue(p_thread,p_id,CASE WHEN nullif(btrim(p_text),'') IS NULL AND jsonb_array_length(p_images)>0 THEN 'Enviei imagens para você analisar.' ELSE p_text END,p_revision);
 IF r.id IS NULL THEN
  UPDATE public.atlas_team_messages SET images=p_images WHERE id=(receipt->>'message_id')::uuid AND thread_id=t.id AND actor_id=auth.uid();
 END IF;
 RETURN receipt;
END $$;
REVOKE ALL ON FUNCTION public.atlas_team_enqueue_images(uuid,uuid,text,integer,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.atlas_team_enqueue_images(uuid,uuid,text,integer,jsonb) TO authenticated;

CREATE FUNCTION public.atlas_team_link_task(p_thread uuid,p_task uuid,p_revision integer,p_id uuid,p_source uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE t public.atlas_team_threads;x public.tarefas;canonical public.atlas_team_threads;m public.atlas_team_messages;person uuid;account uuid;target uuid;at_work timestamptz;source_id uuid;source_ids uuid[];f public.atlas_event_findings;d public.atlas_demands;remaining integer;
BEGIN
 t:=private.atlas_team_assert(p_thread);
 SELECT * INTO m FROM public.atlas_team_messages WHERE id=p_id;
 IF m.id IS NOT NULL THEN
  IF m.thread_id<>t.id OR m.actor_id<>auth.uid() OR m.proposal->>'selected_task_id' IS DISTINCT FROM p_task::text OR m.proposal->>'requested_source_id' IS DISTINCT FROM p_source::text THEN RAISE EXCEPTION 'Identificador usado em outro vínculo.';END IF;
  RETURN jsonb_build_object('thread_id',t.id,'task_id',p_task,'linked_thread_id',m.proposal->>'linked_thread_id','replayed',true);
 END IF;
 IF t.revision IS DISTINCT FROM p_revision THEN RAISE EXCEPTION 'A conversa mudou. Confira antes de vincular.' USING ERRCODE='40001';END IF;
 IF t.state IN('closed','delivery_review') OR NOT coalesce(private.atlas_manager_live(t.owner_id),false) OR NOT EXISTS(SELECT 1 FROM public.atlas_event_config WHERE owner_id=t.owner_id AND t.client_id=ANY(client_ids)) OR NOT EXISTS(SELECT 1 FROM public.clientes WHERE id=t.client_id AND etapa='closed') THEN RAISE EXCEPTION 'Acompanhamento indisponível.' USING ERRCODE='42501';END IF;
 IF t.origin_job_id IS NOT NULL AND NOT private.atlas_consult_current(t.id) THEN RAISE EXCEPTION 'A fonte do pedido mudou.' USING ERRCODE='42501';END IF;
 IF coalesce(t.task_id,nullif(t.management_data->>'linked_task_id','')::uuid) IS NOT NULL AND coalesce(t.task_id,nullif(t.management_data->>'linked_task_id','')::uuid)<>p_task THEN RAISE EXCEPTION 'Já existe outra tarefa vinculada. Confira a referência atual.';END IF;
 IF EXISTS(SELECT 1 FROM public.atlas_team_requests WHERE thread_id=t.id AND state IN('queued','processing')) THEN RAISE EXCEPTION 'Aguarde a resposta antes de vincular.';END IF;
 IF t.origin_job_id IS NOT NULL THEN
  SELECT array_agg(id ORDER BY id) INTO source_ids FROM public.atlas_demands WHERE owner_id=t.owner_id AND client_id=t.client_id AND proposal->>'thread_id'=t.id::text AND proposal->>'job_id'=t.origin_job_id::text AND state IN('draft','proposed');
 ELSE
  SELECT array_agg(id ORDER BY id) INTO source_ids FROM public.atlas_event_findings WHERE thread_id=t.id AND owner_id=t.owner_id AND client_id=t.client_id AND state NOT IN('closed','no_action');
 END IF;
 IF p_source IS NOT NULL AND NOT coalesce(p_source=ANY(source_ids),false) THEN RAISE EXCEPTION 'Pedido fora deste alinhamento.' USING ERRCODE='42501';END IF;
 IF p_source IS NULL AND cardinality(source_ids)>1 THEN RAISE EXCEPTION 'Escolha qual pedido se refere a esta tarefa.';END IF;
 source_id:=coalesce(p_source,source_ids[1]);
 IF t.origin_job_id IS NOT NULL AND source_id IS NOT NULL THEN
  SELECT * INTO d FROM public.atlas_demands WHERE id=source_id FOR UPDATE;
  IF d.owner_id IS DISTINCT FROM t.owner_id OR d.client_id IS DISTINCT FROM t.client_id OR d.proposal->>'thread_id' IS DISTINCT FROM t.id::text OR d.proposal->>'job_id' IS DISTINCT FROM t.origin_job_id::text OR d.state NOT IN('draft','proposed') THEN RAISE EXCEPTION 'A demanda mudou durante a escolha.' USING ERRCODE='40001';END IF;
 END IF;
 IF t.origin_job_id IS NULL AND source_id IS NOT NULL THEN
  SELECT * INTO f FROM public.atlas_event_findings WHERE id=source_id FOR UPDATE;
  IF f.thread_id IS DISTINCT FROM t.id OR f.owner_id IS DISTINCT FROM t.owner_id OR f.client_id IS DISTINCT FROM t.client_id OR f.state IN('closed','no_action') OR private.atlas_event_client(f.conversation_id) IS DISTINCT FROM t.client_id THEN RAISE EXCEPTION 'O pedido ou o vínculo do grupo mudou.' USING ERRCODE='42501';END IF;
 END IF;
 SELECT * INTO x FROM public.tarefas WHERE id=p_task AND client_id=t.client_id FOR SHARE;
 IF x.id IS NULL THEN RAISE EXCEPTION 'Tarefa de outro cliente ou indisponível.' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('atlas-manager-followup:'||t.owner_id::text||x.id::text,0));
 SELECT * INTO canonical FROM public.atlas_team_threads WHERE owner_id=t.owner_id AND task_id=x.id AND state<>'closed' AND management_kind='followup' ORDER BY created_at,id LIMIT 1 FOR UPDATE;
 account:=private.atlas_manager_account(t.owner_id,t.client_id);
 IF t.management_kind='intake' AND t.account_person_id IS DISTINCT FROM account THEN RAISE EXCEPTION 'O responsável da conta mudou. Atualize o alinhamento.' USING ERRCODE='42501';END IF;
 IF account IS NULL THEN RAISE EXCEPTION 'Defina quem cuida desta conta antes de acompanhar.';END IF;
 SELECT p.id INTO person FROM public.profiles p WHERE p.id=ANY(x.assignee_ids) AND p.status='active' AND p.role IN('admin','superadmin','colaborador') AND cardinality(x.assignee_ids)=1;
 person:=coalesce(person,account);
 IF t.management_kind<>'owner_context' AND coalesce(cardinality(source_ids),0)<=1 AND t.current_person_id=person AND canonical.id IS NULL AND NOT EXISTS(SELECT 1 FROM public.task_statuses WHERE value=x.status AND is_terminal) THEN
  target:=t.id;
  UPDATE public.atlas_team_threads SET task_id=x.id,management_kind='followup',management_data=CASE WHEN origin_job_id IS NOT NULL THEN management_data||'{"consult_organized":true,"recipient_basis":"assignee"}' ELSE management_data END,title=left(x.title,200),state=CASE WHEN t.state='needs_owner' THEN t.state ELSE 'waiting_review' END,next_review_at=CASE WHEN t.state='needs_owner' OR t.state='waiting_review' AND t.next_review_at IS NULL OR t.management_data->>'explicit_review_at'=(to_jsonb(t.next_review_at)#>>'{}') OR t.expected_at>now() OR coalesce(t.management_data#>>'{dialogue,expected_on}','')>=(now() AT TIME ZONE 'America/Sao_Paulo')::date::text THEN t.next_review_at ELSE private.atlas_manager_work(now()+interval '1 hour',t.owner_id,person) END WHERE id=t.id;
 ELSIF canonical.id IS NOT NULL THEN target:=canonical.id;
 ELSIF t.management_kind<>'owner_context' AND NOT EXISTS(SELECT 1 FROM public.task_statuses WHERE value=x.status AND is_terminal) THEN
  at_work:=private.atlas_manager_work(now()+interval '1 hour',t.owner_id,person);
  INSERT INTO public.atlas_team_threads(owner_id,client_id,task_id,account_person_id,current_person_id,title,shared_context,source_key,state,next_review_at,management_kind)
  VALUES(t.owner_id,t.client_id,x.id,account,person,left(x.title,200),jsonb_build_object('label','Tarefa indicada no chat','text','Acompanhar os registros da tarefa selecionada.'),'chat-task:'||p_id,'waiting_review',at_work,'followup') RETURNING id INTO target;
 END IF;
 UPDATE public.atlas_team_threads SET management_data=management_data||jsonb_build_object('task_references',coalesce(management_data->'task_references','[]')||jsonb_build_array(jsonb_build_object('source_id',source_id,'task_id',x.id,'linked_thread_id',target))) WHERE id=t.id;
 IF t.management_kind='owner_context' THEN
  -- Choosing a task does not answer the owner's pending decision or share its chat.
  UPDATE public.atlas_team_threads SET management_data=management_data||jsonb_build_object('linked_thread_id',target,'linked_task_id',x.id) WHERE id=t.id;
 ELSE
  IF f.id IS NOT NULL THEN
   UPDATE public.atlas_event_findings SET task_id=x.id,thread_id=coalesce(target,t.id),state='account_contacted',revision=revision+1,updated_at=now() WHERE id=f.id;
   UPDATE public.atlas_demands SET task_id=x.id,state='linked',revision=revision+1,updated_at=now() WHERE id=f.demand_id AND owner_id=t.owner_id AND client_id=t.client_id AND state<>'archived';
  ELSIF source_id IS NOT NULL THEN
   UPDATE public.atlas_demands SET task_id=x.id,state='linked',revision=revision+1,updated_at=now() WHERE id=source_id AND owner_id=t.owner_id AND client_id=t.client_id;
  END IF;
  remaining:=greatest(coalesce(cardinality(source_ids),0)-CASE WHEN source_id IS NULL THEN 0 ELSE 1 END,0);
  IF target IS DISTINCT FROM t.id THEN
   UPDATE public.atlas_team_threads SET state=CASE WHEN remaining>0 THEN state ELSE 'closed' END,next_review_at=CASE WHEN remaining>0 THEN next_review_at ELSE NULL END,
    management_data=(management_data||CASE WHEN remaining=0 THEN jsonb_build_object('linked_thread_id',target,'linked_task_id',x.id) ELSE '{}'::jsonb END)
     ||jsonb_build_object('finding_ids',coalesce((SELECT jsonb_agg(v) FROM jsonb_array_elements(coalesce(management_data->'finding_ids','[]'))v WHERE v#>>'{}' IS DISTINCT FROM source_id::text),'[]'::jsonb),
       'findings',coalesce((SELECT jsonb_agg(v) FROM jsonb_array_elements(coalesce(management_data->'findings','[]'))v WHERE v->>'id' IS DISTINCT FROM source_id::text),'[]'::jsonb),
       'demand_ids',coalesce((SELECT jsonb_agg(v) FROM jsonb_array_elements(coalesce(management_data->'demand_ids','[]'))v WHERE v#>>'{}' IS DISTINCT FROM source_id::text),'[]'::jsonb)) WHERE id=t.id;
  END IF;
  IF source_id IS NOT NULL AND target IS NOT NULL THEN
   UPDATE public.atlas_team_threads SET management_data=management_data||jsonb_build_object('finding_ids',CASE WHEN f.id IS NULL THEN coalesce(management_data->'finding_ids','[]') WHEN coalesce(management_data->'finding_ids','[]') ? f.id::text THEN coalesce(management_data->'finding_ids','[]') ELSE coalesce(management_data->'finding_ids','[]')||jsonb_build_array(f.id) END,
    'unanswered_request_id',source_id,'findings',CASE WHEN EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(management_data->'findings','[]'))v WHERE v->>'id'=source_id::text) THEN management_data->'findings' ELSE coalesce(management_data->'findings','[]')||jsonb_build_array(jsonb_build_object('id',source_id,'title',coalesce(f.title,d.title),'summary',coalesce(f.summary,d.title))) END,
    'finding_versions',coalesce(management_data->'finding_versions','{}')||CASE WHEN f.id IS NOT NULL THEN jsonb_build_object(f.id::text,md5(jsonb_build_object('summary',f.summary,'intent',f.intent,'task_id',x.id)::text)) ELSE '{}'::jsonb END,
    'finding_schemas',coalesce(management_data->'finding_schemas','{}')||CASE WHEN f.id IS NOT NULL THEN jsonb_build_object(f.id::text,2) ELSE '{}'::jsonb END),next_review_at=CASE WHEN state IN('awaiting_reply','waiting_review') AND next_review_at IS NOT NULL AND management_data->>'explicit_review_at' IS DISTINCT FROM (to_jsonb(next_review_at)#>>'{}') AND (expected_at IS NULL OR expected_at<=now()) AND coalesce(management_data#>>'{dialogue,expected_on}','')<(now() AT TIME ZONE 'America/Sao_Paulo')::date::text THEN least(next_review_at,private.atlas_manager_work(now(),owner_id,current_person_id)) ELSE next_review_at END,revision=revision+CASE WHEN id<>t.id THEN 1 ELSE 0 END,updated_at=now() WHERE id=target;
  END IF;
 END IF;
 UPDATE public.atlas_team_threads SET revision=greatest(revision,t.revision)+1,updated_at=now() WHERE id=t.id;
 INSERT INTO public.atlas_team_messages(id,thread_id,role,actor_id,content,proposal) VALUES(p_id,t.id,'human',auth.uid(),'Este pedido'||CASE WHEN f.id IS NOT NULL THEN ' ('||left(f.title,120)||')' ELSE '' END||' se refere à tarefa: '||left(x.title,180),jsonb_build_object('selected_task_id',x.id,'requested_source_id',p_source,'selected_source_id',source_id,'linked_thread_id',target));
 INSERT INTO public.atlas_team_messages(thread_id,role,content) VALUES(t.id,'atlas','Fechado, registrei essa tarefa como referência. '||CASE WHEN t.management_kind='owner_context' THEN 'A decisão que estávamos discutindo continua pendente.' WHEN target=t.id THEN 'Vou acompanhar os prazos e os registros dela por aqui.' WHEN canonical.id IS NOT NULL AND canonical.management_data->>'explicit_review_at'=(to_jsonb(canonical.next_review_at)#>>'{}') THEN 'Ela tem uma revisão combinada; esse pedido entra nessa revisão.' WHEN canonical.id IS NOT NULL AND (canonical.state IN('needs_owner','delivery_review') OR canonical.state='waiting_review' AND canonical.next_review_at IS NULL) THEN 'Essa tarefa aguarda uma decisão ou revisão anterior. O novo pedido ficou registrado nesse acompanhamento.' WHEN target IS NOT NULL THEN 'A execução segue no acompanhamento dessa tarefa, sem cobrar duas vezes.' ELSE 'Ela consta concluída. Uma nova alteração precisa de um novo esclarecimento.' END);
 RETURN jsonb_build_object('thread_id',t.id,'task_id',x.id,'linked_thread_id',target,'replayed',false);
END $$;
REVOKE ALL ON FUNCTION public.atlas_team_link_task(uuid,uuid,integer,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.atlas_team_link_task(uuid,uuid,integer,uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION private.atlas_manager_finish(p_id uuid,p_result jsonb,p_usage jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE t public.atlas_team_threads;r public.atlas_team_requests;actor uuid;kind text;selected uuid;task public.tarefas;v_title text;body text;review timestamptz;expected timestamptz;due date;initial text;tasktype text;days integer;existing uuid;name text;owner_thread uuid;parent uuid;resume boolean:=false;basis text;tasks_basis text;question_override text;contact uuid;contact_assignees uuid[];ref jsonb;record jsonb;entry jsonb;record_url text;dialogue jsonb;owner_contact uuid;contact_thread uuid;at_work timestamptz;question text;origin public.atlas_team_threads;contact_plan jsonb;owner_clarification boolean:=false;
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
  SELECT private.atlas_owner_contact_directive(m.content,t.owner_id) INTO contact_plan FROM public.atlas_team_messages m WHERE m.id=r.message_id AND m.thread_id=t.id AND m.actor_id=actor;
  owner_contact:=(contact_plan->>'person_id')::uuid;
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
  owner_clarification:=t.management_kind='followup' AND t.task_id IS NULL;
  selected:=NULL;kind:=CASE WHEN owner_clarification THEN 'ask' ELSE 'progress' END;
  p_result:=jsonb_set(p_result,'{reply}',to_jsonb(CASE WHEN owner_clarification THEN 'Não localizei a tarefa vinculada. Me diga quem da equipe deve confirmar este assunto.' ELSE 'Recebi esse contexto. Nenhuma consulta à equipe foi enviada a partir desta mensagem.' END));
  IF dialogue IS NOT NULL THEN dialogue:=dialogue||jsonb_build_object('waiting_on',CASE WHEN owner_clarification THEN 'owner' ELSE 'self' END);END IF;
 END IF;
 IF actor=t.owner_id AND t.management_kind='followup' AND t.task_id IS NULL AND kind='ask' THEN
  owner_clarification:=true;
  IF dialogue IS NOT NULL THEN dialogue:=dialogue||jsonb_build_object('waiting_on','owner');END IF;
 END IF;
 IF EXISTS(SELECT 1 FROM public.atlas_team_messages WHERE id=r.message_id AND content='Enviei imagens para você analisar.' AND jsonb_array_length(images)>0) THEN kind:='ask';selected:=NULL;p_result:=p_result||jsonb_build_object('executor_id',NULL,'expected_at',NULL,'review_at',NULL);END IF;
 expected:=nullif(p_result->>'expected_at','')::timestamptz;
 IF expected IS NOT NULL AND (expected<now()-interval '5 minutes' AND NOT (resume AND t.management_kind='followup') OR expected>now()+interval '90 days') THEN RAISE EXCEPTION 'Previsão inválida.';END IF;
 IF nullif(p_result->>'evidence_url','') IS NOT NULL AND (p_result->>'evidence_url' !~ '^https?://' OR record_url IS NULL AND NOT EXISTS(SELECT 1 FROM public.atlas_team_messages WHERE id=r.message_id AND position(p_result->>'evidence_url' IN content)>0)) THEN RAISE EXCEPTION 'Evidência não veio da resposta.';END IF;
 review:=coalesce(nullif(p_result->>'review_at','')::timestamptz,now()+interval '1 hour');
 IF resume AND t.management_kind='followup' AND review<=now() THEN review:=now()+interval '1 hour';p_result:=jsonb_set(p_result,'{review_at}',to_jsonb(review));END IF;
 review:=private.atlas_manager_work(review,t.owner_id,t.current_person_id);
 IF review<=now() OR review>now()+interval '90 days' THEN RAISE EXCEPTION 'Revisão inválida.';END IF;
 IF kind='delivered' AND nullif(p_result->>'evidence_url','') IS NULL AND NOT EXISTS(SELECT 1 FROM public.tarefas x JOIN public.task_statuses s ON s.value=x.status AND s.is_terminal WHERE x.id=t.task_id AND x.client_id=t.client_id) THEN kind:='ask';END IF;
 IF coalesce(p_result->>'information_only','false')='true' THEN
  IF NOT EXISTS(SELECT 1 FROM public.atlas_team_messages WHERE id=r.message_id AND lower(btrim(content)) ~ '^(me contextualiz|contextualiz|me explic|me resum|qual (é |e )?o contexto|o que (aconteceu|está acontecendo|esta acontecendo)|por que voc)') THEN RAISE EXCEPTION 'Pedido de contexto não identificado.';END IF;
  -- An informational answer preserves only the still-current deferred action.
  UPDATE public.atlas_team_requests SET thread_revision=t.revision+1 WHERE id=nullif(t.management_data->>'pending_request_id','')::uuid AND thread_id=t.id AND state='completed' AND NOT applied AND thread_revision=t.revision-1;
  INSERT INTO public.atlas_team_messages(thread_id,role,content) VALUES(t.id,'atlas',left(p_result->>'reply',4000));
  UPDATE public.atlas_team_threads SET revision=revision+1,updated_at=now() WHERE id=t.id;
  UPDATE public.atlas_team_requests SET state='completed',applied=true,result=p_result||jsonb_build_object('applied_decision','information_only'),thread_revision=t.revision+1,usage=private.atlas_team_merge_usage(usage,p_usage) WHERE id=r.id;
  RETURN jsonb_build_object('saved',true,'decision','information_only');
 END IF;
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
  question:=CASE WHEN contact_plan->>'colleague_id' IS NOT NULL THEN 'Você pode conferir a situação deste assunto com '||(SELECT full_name FROM public.profiles WHERE id=(contact_plan->>'colleague_id')::uuid)||' e me contar o próximo passo?'
   WHEN contact_plan->>'topic' IS NOT NULL THEN 'Pode conferir este ponto: '||(contact_plan->>'topic')||'?'
   ELSE 'Você pode conferir o andamento deste assunto e me contar o próximo passo?' END;
  question:=question||' Referência: '||left(t.title,180)||'.'||CASE WHEN t.task_id IS NULL THEN ' Não localizei a tarefa vinculada; o título é apenas a referência anterior do acompanhamento.' ELSE ' A consulta não altera a tarefa oficial.' END;
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
  INSERT INTO public.atlas_memories(owner_id,client_id,content,source,source_quote,topic,source_request_id,team_shared,team_shared_at)
  SELECT t.owner_id,t.client_id,left(p_result->>'summary',4000),'user_confirmation',left(m.content,2000),'direcao_operacional',r.id,true,now() FROM public.atlas_team_messages m WHERE m.id=r.message_id;
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
   UPDATE public.atlas_team_threads SET current_person_id=CASE WHEN owner_clarification THEN owner_id ELSE current_person_id END,state=CASE WHEN kind='ask' THEN 'awaiting_reply' ELSE 'waiting_review' END,next_review_at=CASE WHEN actor=t.owner_id AND t.management_kind='followup' AND t.task_id IS NULL THEN NULL ELSE review END,expected_at=expected,summary=p_result->>'summary',revision=revision+1,reminder_day=NULL,reminders_today=0,updated_at=now() WHERE id=t.id;
  END IF;
 END IF;
 IF dialogue IS NOT NULL THEN
  IF EXISTS(SELECT 1 FROM public.atlas_team_threads WHERE id=t.id AND current_person_id IS DISTINCT FROM t.current_person_id AND state='awaiting_reply') THEN dialogue:=jsonb_set(dialogue,'{waiting_on}','"self"');END IF;
  UPDATE public.atlas_team_threads SET management_data=jsonb_set(management_data,'{dialogue}',dialogue) WHERE id=t.id;
 END IF;
 IF p_result->>'explicit_review_at'=p_result->>'review_at' AND EXISTS(SELECT 1 FROM public.atlas_team_messages WHERE id=r.message_id AND content ~* '(revis|retorn|volto|confer)' AND content ~* '\m(hoje|amanh[ãa])\M.*[0-9]') THEN UPDATE public.atlas_team_threads SET management_data=management_data||jsonb_build_object('explicit_review_at',review) WHERE id=t.id;END IF;
 IF kind='blocked' OR kind IN('progress','ready','resolved','delivered') THEN UPDATE public.atlas_team_threads SET management_data=(management_data-'unanswered_request_id')||jsonb_build_object('reported_blocked',kind='blocked') WHERE id=t.id;END IF;
 IF kind='resolved' AND body ~* '(exclu|apag)' THEN body:='Fechei este acompanhamento. Nenhuma tarefa foi excluída por essa ação.';END IF;
 INSERT INTO public.atlas_team_messages(thread_id,role,content) VALUES(t.id,'atlas',body);
 UPDATE public.atlas_team_requests SET state='completed',applied=kind<>'queued',thread_revision=(SELECT revision FROM public.atlas_team_threads WHERE id=t.id),result=p_result||jsonb_build_object('applied_decision',kind,'task_id',task.id,'client_basis',basis,'tasks_basis',tasks_basis,'contact_person_id',contact,'contact_assignee_ids',contact_assignees,'attempt',coalesce((r.result->>'attempt')::integer,1),'attempted_at',coalesce(r.result->>'attempted_at',r.created_at::text)),usage=private.atlas_team_merge_usage(usage,p_usage) WHERE id=r.id;
 RETURN jsonb_build_object('saved',true,'decision',kind,'task_id',task.id);
END $$;


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
 FROM public.atlas_team_threads t JOIN public.tarefas x ON x.id=coalesce(t.task_id,nullif(t.management_data->>'linked_task_id','')::uuid) AND x.client_id=t.client_id JOIN public.clientes c ON c.id=t.client_id LEFT JOIN public.task_statuses s ON s.value=x.status
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
  IF parent.id IS NOT NULL AND NOT t.management_data ? 'linked_task_id' THEN record_thread:=parent.id;END IF;
 END IF;
 SELECT jsonb_build_object('thread',to_jsonb(t),'client_name',c.empresa,'actor_id',p_actor,'is_owner',p_actor=t.owner_id,
 'messages',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.created_at,x.id),'[]') FROM(SELECT * FROM public.atlas_team_messages m WHERE m.thread_id=t.id ORDER BY m.created_at DESC,m.id DESC LIMIT 40)x),
 'people',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.full_name,'hours',coalesce((SELECT jsonb_build_object('start_time',h.start_time,'end_time',h.end_time) FROM public.atlas_team_hours h WHERE h.owner_id=t.owner_id AND h.person_id=p.id),'{"start_time":"08:00","end_time":"17:00"}'::jsonb))),'[]') FROM public.profiles p WHERE p.status='active' AND p.role IN('admin','superadmin','colaborador') AND (p_actor=t.owner_id OR p.id IN(t.owner_id,t.account_person_id,t.current_person_id) OR EXISTS(SELECT 1 FROM public.tarefas x WHERE x.id=t.task_id AND x.client_id=t.client_id AND p.id=ANY(x.assignee_ids)))),
 'task',private.atlas_task_record(record_thread),
 'task_lookup',CASE WHEN coalesce(t.task_id,nullif(t.management_data->>'linked_task_id','')::uuid,parent.task_id) IS NULL THEN CASE WHEN t.management_kind IN('followup','owner_context') AND t.management_data ? 'parent_thread' OR t.management_kind='followup' THEN 'unlinked' ELSE 'not_required' END WHEN EXISTS(SELECT 1 FROM public.tarefas x WHERE x.id=coalesce(t.task_id,nullif(t.management_data->>'linked_task_id','')::uuid,parent.task_id) AND x.client_id=t.client_id) THEN 'found' ELSE 'missing' END,
 'last_observed_stage',(SELECT r.result->'task_stage' FROM public.atlas_team_requests r WHERE r.thread_id=t.id AND r.state='completed' AND r.applied AND coalesce(r.result->>'resume_blocked','false')<>'true' AND jsonb_typeof(r.result->'task_stage')='object' ORDER BY r.thread_revision DESC,r.created_at DESC,r.id DESC LIMIT 1),
 'hours',coalesce((SELECT jsonb_build_object('start_time',h.start_time,'end_time',h.end_time) FROM public.atlas_team_hours h WHERE h.owner_id=t.owner_id AND h.person_id=p_actor),'{"start_time":"08:00","end_time":"17:00"}'::jsonb),
 'last_request',(SELECT jsonb_build_object('id',r.id,'message_id',r.message_id,'message',m.content,'state',r.state,'attempt',coalesce((r.result->>'attempt')::integer,1),'error_code',r.result->>'error_code') FROM public.atlas_team_requests r JOIN public.atlas_team_messages m ON m.id=r.message_id AND m.thread_id=t.id WHERE r.thread_id=t.id AND r.actor_id=p_actor ORDER BY coalesce(nullif(r.result->>'attempted_at','')::timestamptz,r.created_at) DESC,r.id DESC LIMIT 1),
 'reply_pending',EXISTS(SELECT 1 FROM public.atlas_team_requests q WHERE q.thread_id=t.id AND (q.state='queued' OR q.state='processing' AND coalesce(q.lease_until,q.created_at+interval '2 minutes')>now())),'queried_at',now()) INTO result FROM public.clientes c WHERE c.id=t.client_id;
 RETURN result||jsonb_build_object('link_sources',CASE WHEN t.origin_job_id IS NOT NULL THEN (SELECT coalesce(jsonb_agg(jsonb_build_object('id',d.id,'title',d.title) ORDER BY d.created_at,d.id),'[]') FROM public.atlas_demands d WHERE d.owner_id=t.owner_id AND d.client_id=t.client_id AND d.proposal->>'thread_id'=t.id::text AND d.proposal->>'job_id'=t.origin_job_id::text AND d.state IN('draft','proposed')) ELSE (SELECT coalesce(jsonb_agg(jsonb_build_object('id',f.id,'title',f.title) ORDER BY f.created_at,f.id),'[]') FROM public.atlas_event_findings f WHERE f.owner_id=t.owner_id AND f.client_id=t.client_id AND f.thread_id=t.id AND f.state NOT IN('closed','no_action')) END,'group_alerts',private.atlas_team_group_alerts(t.id,p_actor),
 'analysis_status',jsonb_build_object('waiting_budget',EXISTS(SELECT 1 FROM public.atlas_event_jobs j WHERE j.owner_id=t.owner_id AND j.client_id=t.client_id AND j.state='budget_wait'),'last_completed_at',(SELECT max(j.finished_at) FROM public.atlas_event_jobs j WHERE j.owner_id=t.owner_id AND j.client_id=t.client_id AND j.state='completed')),
 'origin_context',CASE WHEN t.management_kind='owner_context' AND p_actor=t.owner_id AND parent.id IS NOT NULL THEN jsonb_build_object('summary',parent.summary,'messages',(SELECT coalesce(jsonb_agg(z),'[]') FROM(SELECT m.content,m.created_at,p.full_name author FROM public.atlas_team_messages m LEFT JOIN public.profiles p ON p.id=m.actor_id WHERE m.thread_id=parent.id AND m.role='human' ORDER BY m.created_at DESC LIMIT 2)z)) ELSE NULL END);

END $$;
CREATE OR REPLACE FUNCTION private.atlas_team_action(p_thread uuid,p_action text,p_revision integer,p_data jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE t public.atlas_team_threads;r public.atlas_team_requests; target uuid; review timestamptz; expected timestamptz; kind text; body text;
BEGIN
 t:=private.atlas_team_assert(p_thread);
 IF p_action='read' THEN INSERT INTO public.atlas_team_reads(thread_id,person_id) VALUES(t.id,auth.uid()) ON CONFLICT(thread_id,person_id) DO UPDATE SET read_at=now(); RETURN '{"ok":true}'; END IF;
 IF p_action='confirm' AND EXISTS(SELECT 1 FROM public.atlas_team_requests WHERE id=(p_data->>'request_id')::uuid AND thread_id=t.id AND actor_id=auth.uid() AND applied) THEN RETURN '{"ok":true,"replayed":true}'; END IF;
 IF t.revision IS DISTINCT FROM p_revision THEN RAISE EXCEPTION 'A conversa mudou. Atualize antes de confirmar.' USING ERRCODE='40001'; END IF;
 IF p_action='review_delivery' THEN
  IF auth.uid()<>t.owner_id OR t.state<>'delivery_review' THEN RAISE EXCEPTION 'Revisão exclusiva do dono.' USING ERRCODE='42501'; END IF;
  IF NOT coalesce((p_data->>'confirmed')::boolean,false) OR char_length(btrim(coalesce(p_data->>'note','')))=0 THEN RAISE EXCEPTION 'Registre o que conferiu antes de revisar.'; END IF;
  UPDATE public.atlas_team_threads SET state=CASE WHEN (p_data->>'accepted')::boolean THEN 'closed' ELSE 'awaiting_reply' END,current_person_id=CASE WHEN (p_data->>'accepted')::boolean THEN current_person_id ELSE account_person_id END,next_review_at=CASE WHEN (p_data->>'accepted')::boolean THEN NULL ELSE now()+interval '1 hour' END,revision=revision+1,updated_at=now() WHERE id=t.id;
  INSERT INTO public.atlas_team_messages(thread_id,role,actor_id,content) VALUES(t.id,'human',auth.uid(),'Revisão do dono: '||left(p_data->>'note',2000));
  RETURN '{"ok":true,"task_unchanged":true}';
 END IF;
 IF auth.uid() NOT IN(t.owner_id,t.current_person_id) THEN RAISE EXCEPTION 'Ação indisponível para esta pessoa.' USING ERRCODE='42501'; END IF;
 IF p_action='snooze' THEN
  review:=(p_data->>'review_at')::timestamptz;
  IF review IS NULL OR review<=now() OR review>now()+interval '7 days' THEN RAISE EXCEPTION 'Adiamento inválido.'; END IF;
  UPDATE public.atlas_team_threads SET next_review_at=review,management_data=management_data||jsonb_build_object('explicit_review_at',review),revision=revision+1,updated_at=now() WHERE id=t.id;
  INSERT INTO public.atlas_team_reads(thread_id,person_id) VALUES(t.id,auth.uid()) ON CONFLICT(thread_id,person_id) DO UPDATE SET read_at=now();
  RETURN '{"ok":true}';
 END IF;
 IF p_action<>'confirm' THEN RAISE EXCEPTION 'Ação inválida.'; END IF;
 SELECT * INTO r FROM public.atlas_team_requests WHERE id=(p_data->>'request_id')::uuid AND thread_id=t.id AND actor_id=auth.uid() FOR UPDATE;
 IF r.applied THEN RETURN '{"ok":true,"replayed":true}'; END IF;
 IF r.id IS NULL OR r.state<>'completed' OR NOT EXISTS(SELECT 1 FROM public.atlas_team_messages m WHERE m.thread_id=t.id AND m.proposal->>'request_id'=r.id::text AND m.id=(SELECT id FROM public.atlas_team_messages WHERE thread_id=t.id ORDER BY created_at DESC,id DESC LIMIT 1)) THEN RAISE EXCEPTION 'Sugestão desatualizada.'; END IF;
 kind:=r.result->>'update_kind';
 IF kind='clarify' THEN RAISE EXCEPTION 'Responda à pergunta antes de combinar a revisão.'; END IF;
 target:=coalesce(nullif(r.result->>'next_person_id','')::uuid,t.current_person_id);
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=target AND status='active' AND role IN('superadmin','admin','colaborador')) OR target NOT IN(t.account_person_id,t.owner_id) AND NOT EXISTS(SELECT 1 FROM public.tarefas x WHERE x.id=t.task_id AND x.client_id=t.client_id AND target=ANY(x.assignee_ids)) THEN RAISE EXCEPTION 'Destinatário indisponível.'; END IF;
 review:=coalesce(nullif(p_data->>'review_at','')::timestamptz,nullif(r.result->>'review_at','')::timestamptz);
 expected:=nullif(r.result->>'expected_at','')::timestamptz;
 IF review IS NULL AND kind NOT IN('needs_owner','delivered') THEN RAISE EXCEPTION 'Combine uma data para revisar o andamento.'; END IF;
 IF review IS NOT NULL AND (review<=now() OR review>now()+interval '90 days') THEN RAISE EXCEPTION 'Revisão deve estar no futuro, em até 90 dias.'; END IF;
 IF review IS NOT NULL AND (extract(isodow FROM review AT TIME ZONE 'America/Sao_Paulo')>5 OR (review AT TIME ZONE 'America/Sao_Paulo')::time NOT BETWEEN coalesce((SELECT start_time FROM public.atlas_team_hours WHERE owner_id=t.owner_id AND person_id=target),'08:00'::time) AND coalesce((SELECT end_time-interval '1 second' FROM public.atlas_team_hours WHERE owner_id=t.owner_id AND person_id=target),'16:59:59'::time)) THEN RAISE EXCEPTION 'Escolha a revisão dentro do expediente do responsável.'; END IF;
 IF EXISTS(SELECT 1 FROM public.tarefas x WHERE x.id=t.task_id AND x.client_id=t.client_id AND auth.uid()=ANY(x.assignee_ids)) AND EXISTS(SELECT 1 FROM public.atlas_demands d WHERE d.task_id=t.task_id AND d.state='linked') THEN
  PERFORM public.atlas_task_followup_update(t.task_id,kind,left(coalesce(r.result->>'summary','Atualização confirmada na conversa.')||CASE WHEN review IS NOT NULL THEN E'\nRevisão de acompanhamento: '||to_char(review AT TIME ZONE 'America/Sao_Paulo','DD/MM HH24:MI') ELSE '' END||CASE WHEN nullif(r.result->>'evidence_url','') IS NOT NULL THEN E'\nEvidência informada: '||(r.result->>'evidence_url') ELSE '' END,4000),r.id,NULL);
 END IF;
 UPDATE public.atlas_team_requests SET applied=true WHERE id=r.id;
 UPDATE public.atlas_team_threads SET current_person_id=CASE WHEN kind IN('needs_owner','delivered') THEN owner_id ELSE target END,state=CASE kind WHEN 'needs_owner' THEN 'needs_owner' WHEN 'delivered' THEN 'delivery_review' ELSE CASE WHEN target<>current_person_id THEN 'awaiting_reply' ELSE 'waiting_review' END END,next_review_at=CASE WHEN kind IN('needs_owner','delivered') THEN NULL ELSE review END,expected_at=expected,summary=r.result->>'summary',evidence_url=nullif(r.result->>'evidence_url',''),revision=revision+1,reminder_day=NULL,reminders_today=0,updated_at=now() WHERE id=t.id;
 body:=CASE WHEN kind='delivered' THEN 'Entrega informada. O dono vai conferir a evidência; a tarefa não foi concluída automaticamente.' WHEN kind='needs_owner' THEN 'Decisão encaminhada ao dono neste acompanhamento.' WHEN target<>t.current_person_id THEN 'Oi! O responsável pela conta pediu sua confirmação. '||coalesce(r.result->>'summary','')||' Você consegue confirmar o andamento e combinar o próximo retorno?' ELSE 'Combinado registrado. Vou voltar na revisão: '||to_char(review AT TIME ZONE 'America/Sao_Paulo','DD/MM HH24:MI')||'. O prazo oficial da tarefa permanece igual.' END;
 INSERT INTO public.atlas_team_messages(thread_id,role,content) VALUES(t.id,'atlas',body);
 RETURN jsonb_build_object('ok',true,'review_at',review,'task_unchanged',true);
END $$;

CREATE OR REPLACE FUNCTION public.atlas_manager_context(p_thread uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE t public.atlas_team_threads;result jsonb;
BEGIN
 SELECT * INTO t FROM public.atlas_team_threads WHERE id=p_thread;
 IF t.id IS NULL OR t.management_kind IS NULL THEN RETURN NULL;END IF;
 result:=public.atlas_team_context(p_thread);
 RETURN result||jsonb_build_object('management',true,
 'people',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',full_name,'hours','{"start_time":"08:00","end_time":"17:00"}'::jsonb)),'[]') FROM public.profiles WHERE status='active' AND role IN('admin','superadmin','colaborador')),
 'tasks',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',x.id,'title',x.title,'description',left(x.description,1500),'assignee_ids',x.assignee_ids,'status',coalesce(s.label,x.status),'due_date',x.due_date,'post_date',x.post_date,'terminal',coalesce(s.is_terminal,false)) ORDER BY x.created_at DESC),'[]') FROM public.tarefas x LEFT JOIN public.task_statuses s ON s.value=x.status WHERE x.client_id=t.client_id),
 'scope',(SELECT jsonb_build_object('tipo_servico',tipo_servico,'tipo_contrato',tipo_contrato,'entregaveis',entregaveis-ARRAY['whatsapp_grupo'],'objetivo',objetivo_meta,'owner_direction',t.management_data->'owner_direction') FROM public.clientes WHERE id=t.client_id));
END $$;

CREATE OR REPLACE FUNCTION private.atlas_team_request_context(p_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
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
  'tasks',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',x.id,'title',x.title,'description',left(x.description,1500),'assignee_ids',x.assignee_ids,'status',coalesce(s.label,x.status),'due_date',x.due_date,'post_date',x.post_date,'terminal',coalesce(s.is_terminal,false)) ORDER BY x.created_at DESC),'[]') FROM public.tarefas x LEFT JOIN public.task_statuses s ON s.value=x.status WHERE x.client_id=t.client_id),
  'scope',(SELECT jsonb_build_object('tipo_servico',tipo_servico,'tipo_contrato',tipo_contrato,'entregaveis',entregaveis-ARRAY['whatsapp_grupo'],'objetivo',objetivo_meta,'owner_direction',t.management_data->'owner_direction') FROM public.clientes WHERE id=t.client_id));
 END IF;
 RETURN context;
END $$;
CREATE OR REPLACE FUNCTION public.atlas_manager_sync_consults() RETURNS integer
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
  IF pending=0 OR invalid THEN
   UPDATE public.atlas_jobs SET status=CASE WHEN invalid THEN 'failed' ELSE 'completed' END,result=left(btrim(v_body),20000),error=CASE WHEN invalid THEN 'A autorização ou o contexto da consulta mudou.' ELSE NULL END,finished_at=now() WHERE id=j.id;
   UPDATE public.atlas_inbox SET body=left(btrim(v_body),1200),severity=CASE WHEN invalid THEN 'attention' ELSE 'info' END,state='open',read_at=NULL,updated_at=now() WHERE job_id=j.id;
   UPDATE public.atlas_conversations SET updated_at=now() WHERE id=j.conversation_id AND owner_id=j.owner_id;
   changed:=changed+1;
  ELSIF j.result IS DISTINCT FROM btrim(v_body) THEN UPDATE public.atlas_jobs SET result=left(btrim(v_body),20000) WHERE id=j.id;END IF;
 END LOOP;
 RETURN changed;
END $$;
COMMIT;

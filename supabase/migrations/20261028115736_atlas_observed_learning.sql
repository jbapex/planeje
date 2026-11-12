BEGIN;

ALTER TABLE public.atlas_memories
 ADD COLUMN learning_kind text NOT NULL DEFAULT 'rule' CHECK(learning_kind IN('fact','pattern','rule')),
 ADD COLUMN evidence jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(evidence)='array' AND jsonb_array_length(evidence)<=4),
 ADD COLUMN source_job_id uuid REFERENCES public.atlas_event_jobs(id) ON DELETE RESTRICT,
 ADD COLUMN source_request_id uuid REFERENCES public.atlas_team_requests(id) ON DELETE RESTRICT,
 ADD COLUMN learning_key text;
ALTER TABLE public.atlas_memories DROP CONSTRAINT atlas_memories_source_check;
ALTER TABLE public.atlas_memories ADD CONSTRAINT atlas_memories_source_check
 CHECK(source IN('user_confirmation','conversation','brainstorm','observation'));
ALTER TABLE public.atlas_memories ADD CONSTRAINT atlas_observed_source
 CHECK(source<>'observation' OR source_job_id IS NOT NULL AND client_id IS NOT NULL AND learning_kind IN('fact','pattern') AND jsonb_array_length(evidence)>=1);
-- Terminal records retain their key: a retry cannot resurrect revoked knowledge.
CREATE UNIQUE INDEX atlas_observed_dedupe ON public.atlas_memories(owner_id,learning_key) WHERE learning_key IS NOT NULL;

-- Link only unambiguous exact historical copies; state and content remain untouched.
WITH matches AS (
 SELECT m.id,r.id request_id,count(*) OVER(PARTITION BY m.id) copies,count(*) OVER(PARTITION BY r.id) memories
 FROM public.atlas_memories m JOIN public.atlas_team_threads t ON t.owner_id=m.owner_id AND t.client_id=m.client_id AND t.management_kind='owner_context'
 JOIN public.atlas_team_requests r ON r.thread_id=t.id AND r.actor_id=t.owner_id AND r.applied AND r.result->>'applied_decision'='owner_answered'
 JOIN public.atlas_team_messages message ON message.id=r.message_id
 WHERE m.topic='direcao_operacional' AND m.source='user_confirmation' AND m.source_run_id IS NULL
 AND m.content=left(r.result->>'summary',4000) AND m.source_quote=left(message.content,2000)
)
UPDATE public.atlas_memories m SET source_request_id=x.request_id
FROM matches x WHERE m.id=x.id AND x.copies=1 AND x.memories=1;

CREATE FUNCTION private.atlas_learning_guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.source='observation' AND auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Aprendizado observado é exclusivo do worker.' USING ERRCODE='42501';END IF;
 ELSIF NEW.learning_kind IS DISTINCT FROM OLD.learning_kind OR NEW.evidence IS DISTINCT FROM OLD.evidence
 OR NEW.source_job_id IS DISTINCT FROM OLD.source_job_id OR NEW.source_request_id IS DISTINCT FROM OLD.source_request_id OR NEW.learning_key IS DISTINCT FROM OLD.learning_key THEN
  RAISE EXCEPTION 'A correção exige uma nova versão da memória.' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.atlas_learning_guard() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER atlas_learning_guard BEFORE INSERT OR UPDATE ON public.atlas_memories FOR EACH ROW EXECUTE FUNCTION private.atlas_learning_guard();

CREATE OR REPLACE FUNCTION public.atlas_save_memory(p_content text,p_client_id uuid,p_confirmed boolean,p_replaces_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE previous public.atlas_memories;saved public.atlas_memories;v integer:=1;
BEGIN
 IF NOT public.atlas_is_owner() THEN RAISE EXCEPTION 'ATLAS_FORBIDDEN' USING ERRCODE='42501';END IF;
 IF p_confirmed IS DISTINCT FROM true OR p_content IS NULL OR char_length(btrim(p_content)) NOT BETWEEN 1 AND 4000 THEN RAISE EXCEPTION 'ATLAS_MEMORY_CONFIRM_REQUIRED' USING ERRCODE='22023';END IF;
 IF p_client_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.clientes WHERE id=p_client_id) THEN RAISE EXCEPTION 'ATLAS_CLIENT_FORBIDDEN' USING ERRCODE='42501';END IF;
 IF p_replaces_id IS NOT NULL THEN
  SELECT * INTO previous FROM public.atlas_memories WHERE id=p_replaces_id AND owner_id=auth.uid() FOR UPDATE;
  IF NOT FOUND OR previous.state<>'active' OR previous.client_id IS DISTINCT FROM p_client_id THEN RAISE EXCEPTION 'ATLAS_MEMORY_CONFLICT' USING ERRCODE='22023';END IF;
  UPDATE public.atlas_memories SET state='replaced' WHERE id=previous.id;v:=previous.version+1;
 END IF;
 INSERT INTO public.atlas_memories(owner_id,client_id,content,version,replaces_id,learning_kind,source_quote)
 VALUES(auth.uid(),p_client_id,btrim(p_content),v,p_replaces_id,coalesce(previous.learning_kind,'rule'),btrim(p_content)) RETURNING * INTO saved;
 RETURN to_jsonb(saved);
END $$;

CREATE OR REPLACE FUNCTION private.atlas_manager_knowledge(p_request uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.atlas_team_requests;t public.atlas_team_threads;
BEGIN
 SELECT * INTO r FROM public.atlas_team_requests WHERE id=p_request;
 SELECT * INTO t FROM public.atlas_team_threads WHERE id=r.thread_id;
 IF r.id IS NULL OR r.state<>'processing' OR NOT coalesce(private.atlas_manager_live(t.owner_id),false)
 OR NOT EXISTS(SELECT 1 FROM auth.sessions WHERE id=r.session_id AND user_id=r.actor_id)
 OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=r.actor_id AND status='active' AND role IN('admin','superadmin','colaborador'))
 OR r.actor_id NOT IN(t.owner_id,t.current_person_id) THEN RAISE EXCEPTION 'Contexto não autorizado.' USING ERRCODE='42501';END IF;
 RETURN (SELECT coalesce(jsonb_agg(to_jsonb(brief) ORDER BY brief.at DESC,brief.id),'[]') FROM (
  SELECT m.id::text,m.content,m.topic subject,coalesce(m.team_shared_at,m.created_at) at,m.version,m.learning_kind,
   CASE WHEN r.actor_id=t.owner_id THEN m.evidence ELSE (
    SELECT coalesce(jsonb_agg((SELECT jsonb_object_agg(k,v) FROM jsonb_each(e) AS part(k,v)
     WHERE k IN('source_id','source_kind','at','author_id','author_name','source_version','task_id'))),'[]')
    FROM jsonb_array_elements(m.evidence) e) END evidence,
   CASE WHEN r.actor_id=t.owner_id THEN m.source_quote ELSE NULL END source_quote,m.source_request_id
  FROM public.atlas_memories m WHERE m.owner_id=t.owner_id AND m.client_id=t.client_id AND m.state='active' AND m.team_shared
  ORDER BY coalesce(m.team_shared_at,m.created_at) DESC,m.id LIMIT 50) brief);
END $$;

CREATE FUNCTION public.atlas_event_learn(p_job uuid) RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE j public.atlas_event_jobs;item jsonb;ev jsonb;snapshot jsonb;raw jsonb;task_raw jsonb;task_snapshot jsonb;body text;at_time timestamptz;author uuid;author_name text;ids uuid[];source_id text;source_kind text;source_uuid uuid;key text;saved integer:=0;added integer;refs jsonb;task_client uuid;source_phone text;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Worker exclusivo.' USING ERRCODE='42501';END IF;
 SELECT * INTO j FROM public.atlas_event_jobs WHERE id=p_job FOR UPDATE;
 PERFORM 1 FROM public.atlas_settings WHERE owner_id=j.owner_id FOR SHARE;
 PERFORM 1 FROM public.atlas_event_config WHERE owner_id=j.owner_id FOR SHARE;
 PERFORM 1 FROM public.clientes WHERE id=j.client_id FOR SHARE;
 PERFORM 1 FROM public.atendimento_conversas WHERE id=j.conversation_id FOR SHARE;
 IF j.id IS NULL OR j.state<>'completed' OR NOT coalesce(private.atlas_event_enabled(j.owner_id),false)
 OR NOT EXISTS(SELECT 1 FROM public.atlas_event_config WHERE owner_id=j.owner_id AND j.client_id=ANY(client_ids))
 OR private.atlas_event_client(j.conversation_id) IS DISTINCT FROM j.client_id THEN RAISE EXCEPTION 'Fonte fora do cliente autorizado.' USING ERRCODE='42501';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.atlas_settings WHERE id='atlas' AND owner_id=j.owner_id AND auto_memory) THEN RETURN 0;END IF;
 IF jsonb_typeof(coalesce(j.result->'learnings','[]'))<>'array' OR jsonb_array_length(coalesce(j.result->'learnings','[]'))>3 THEN RAISE EXCEPTION 'Aprendizado fora do limite.';END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(coalesce(j.result->'learnings','[]')) LOOP
  IF jsonb_typeof(item)<>'object' OR item->>'learning_kind' IS NULL OR item->>'learning_kind' NOT IN('fact','pattern') OR item->>'topic' IS NULL OR item->>'topic' NOT IN('preference','workflow','communication')
  OR EXISTS(SELECT 1 FROM jsonb_object_keys(item) k WHERE k NOT IN('learning_kind','content','topic','evidence')) OR jsonb_typeof(item->'content') IS DISTINCT FROM 'string'
  OR char_length(btrim(coalesce(item->>'content',''))) NOT BETWEEN 8 AND 1500
  OR jsonb_typeof(item->'evidence') IS DISTINCT FROM 'array' OR jsonb_array_length(item->'evidence') NOT BETWEEN 1 AND 4
  OR (item->>'content') ~* '(\m(hoje|amanhã|amanha|pendente|responsável atual|responsavel atual|prazo atual)\M|\m(senha|password|token|api.?key)[[:space:]]*[:=]|\msk-[a-z0-9_-]{12,}|\meyJ[a-z0-9_-]{30,})' THEN RAISE EXCEPTION 'Somente observações duráveis podem ser aprendidas automaticamente.';END IF;
  SELECT jsonb_agg(value->>'source_id' ORDER BY value->>'source_id') INTO refs FROM jsonb_array_elements(item->'evidence');
  IF (SELECT count(DISTINCT value->>'source_id') FROM jsonb_array_elements(item->'evidence'))<>jsonb_array_length(item->'evidence')
  OR item->>'learning_kind'='pattern' AND jsonb_array_length(item->'evidence')<2 THEN RAISE EXCEPTION 'Padrão exige fontes distintas.';END IF;
  IF item->>'learning_kind'='fact' AND (jsonb_array_length(item->'evidence')<>1 OR btrim(item->>'content') IS DISTINCT FROM btrim(item->'evidence'->0->>'quote')) THEN RAISE EXCEPTION 'O fato deve preservar a declaração literal.';END IF;
  FOR ev IN SELECT value FROM jsonb_array_elements(item->'evidence') LOOP
   IF jsonb_typeof(ev)<>'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(ev) k WHERE k NOT IN('source_id','source_kind','at','author_id','author_name','quote','source_version','task_id')) THEN RAISE EXCEPTION 'Metadados de fonte inválidos.';END IF;
   source_id:=ev->>'source_id';source_kind:=ev->>'source_kind';source_uuid:=split_part(source_id,':',2)::uuid;
   raw:=NULL;snapshot:=NULL;author:=NULL;author_name:=NULL;body:=NULL;at_time:=NULL;
   IF source_id LIKE 'comment:%' AND source_kind='task_comment' THEN
    SELECT to_jsonb(c),x.client_id,to_jsonb(x) INTO raw,task_client,task_raw FROM public.task_comments c JOIN public.tarefas x ON x.id=c.task_id WHERE c.id=source_uuid FOR SHARE OF c,x;
    IF task_client IS DISTINCT FROM j.client_id THEN RAISE EXCEPTION 'Comentário fora do cliente.';END IF;
    SELECT value INTO snapshot FROM jsonb_array_elements(j.input->'comments') WHERE value->>'id'=source_uuid::text AND value->>'task_id'=raw->>'task_id';
    SELECT value INTO task_snapshot FROM jsonb_array_elements(j.input->'tasks') WHERE value->>'id'=raw->>'task_id' AND value->>'client_id'=j.client_id::text;
    IF task_snapshot IS NULL OR NOT task_raw @> (task_snapshot-'terminal') OR ev->>'task_id' IS DISTINCT FROM raw->>'task_id' THEN RAISE EXCEPTION 'Tarefa do comentário mudou.';END IF;
    body:=raw->>'content';author:=(raw->>'user_id')::uuid;at_time:=(raw->>'created_at')::timestamptz;
    SELECT coalesce(nullif(full_name,''),'Autor do registro') INTO author_name FROM public.profiles WHERE id=author;
    IF snapshot->>'content' IS DISTINCT FROM body OR (snapshot->>'user_id')::uuid IS DISTINCT FROM author THEN RAISE EXCEPTION 'Comentário mudou.';END IF;
   ELSIF source_kind='group_message' AND source_id LIKE 'in:%' THEN
    SELECT to_jsonb(i) INTO raw FROM public.cliente_whatsapp_inbox i WHERE i.id=source_uuid AND i.conversation_id=j.conversation_id FOR SHARE;
    IF raw->>'media_purged_at' IS NOT NULL THEN RAISE EXCEPTION 'Fonte removida.';END IF;
    body:=raw->>'body';at_time:=(raw->>'created_at')::timestamptz;author_name:=coalesce(nullif(raw->>'sender_name',''),'Autor do registro');
    IF lower(raw->>'type') IN('ptt','audio','audiomessage','voice','myaudio','voicemessage','voice_message') THEN
     SELECT transcript INTO body FROM public.atlas_audio_transcripts WHERE inbox_id=source_uuid AND conversation_id=j.conversation_id AND owner_id=j.owner_id AND status='completed' FOR SHARE;
    END IF;
    source_phone:=regexp_replace(coalesce(raw->>'phone',''),'\D','','g');
    IF source_phone='' AND lower(raw->>'sender_jid') ~ '^[0-9]+(:[0-9]+)?@(s\.whatsapp\.net|c\.us)$' THEN source_phone:=split_part(split_part(raw->>'sender_jid','@',1),':',1);END IF;
    SELECT array_agg(DISTINCT p.id) INTO ids FROM public.atendimento_grupo_remetente_interno r JOIN public.profiles p ON p.id=r.profile_id AND p.status='active' AND p.role IN('admin','superadmin','colaborador')
    WHERE (r.cliente_id IS NULL OR r.cliente_id=(SELECT cliente_id FROM public.atendimento_conversas WHERE id=j.conversation_id))
    AND (nullif(raw->>'sender_jid','') IS NOT NULL AND lower(btrim(r.sender_jid))=lower(btrim(raw->>'sender_jid'))
     OR char_length(source_phone) BETWEEN 10 AND 15 AND regexp_replace(r.phone,'\D','','g')=source_phone);
    author:=CASE WHEN cardinality(ids)=1 THEN ids[1] ELSE NULL END;
    SELECT value INTO snapshot FROM jsonb_array_elements(j.input->'messages') WHERE value->>'id'=source_id;
    IF snapshot->>'body' IS DISTINCT FROM body OR (snapshot->>'actor_id')::uuid IS DISTINCT FROM author THEN RAISE EXCEPTION 'Mensagem mudou.';END IF;
   ELSIF source_kind='group_message' AND source_id LIKE 'out:%' THEN
    SELECT to_jsonb(s) INTO raw FROM public.cliente_whatsapp_sent s WHERE s.id=source_uuid AND s.conversation_id=j.conversation_id FOR SHARE;
    body:=raw->>'body';at_time:=(raw->>'created_at')::timestamptz;author:=(raw->>'sent_by')::uuid;author_name:='Equipe';
    SELECT value INTO snapshot FROM jsonb_array_elements(j.input->'messages') WHERE value->>'id'=source_id;
    IF snapshot->>'body' IS DISTINCT FROM body OR (snapshot->>'actor_id')::uuid IS DISTINCT FROM author THEN RAISE EXCEPTION 'Mensagem enviada mudou.';END IF;
   ELSE RAISE EXCEPTION 'Tipo de fonte inválido.';END IF;
   IF raw IS NULL OR snapshot IS NULL OR body IS NULL OR at_time IS NULL OR (snapshot->>'created_at')::timestamptz IS DISTINCT FROM at_time
   OR ev->>'source_version' IS DISTINCT FROM md5(body) OR (ev->>'at')::timestamptz IS DISTINCT FROM at_time
   OR (ev->>'author_id')::uuid IS DISTINCT FROM author OR ev->>'author_name' IS DISTINCT FROM author_name
   OR char_length(btrim(coalesce(ev->>'quote',''))) NOT BETWEEN 8 AND 1500 OR strpos(body,ev->>'quote')=0
   OR (ev->>'quote') ~* '(\m(senha|password|token|api.?key)[[:space:]]*[:=]|\msk-[a-z0-9_-]{12,}|\meyJ[a-z0-9_-]{30,})' THEN RAISE EXCEPTION 'Fonte, autor, data, trecho ou versão inválidos.';END IF;
  END LOOP;
  key:=md5(refs::text);
  INSERT INTO public.atlas_memories(owner_id,client_id,content,source,topic,learning_kind,evidence,source_job_id,learning_key)
  VALUES(j.owner_id,j.client_id,btrim(item->>'content'),'observation',item->>'topic',item->>'learning_kind',item->'evidence',j.id,key)
  ON CONFLICT(owner_id,learning_key) WHERE learning_key IS NOT NULL DO NOTHING;
  GET DIAGNOSTICS added=ROW_COUNT;saved:=saved+added;
 END LOOP;
 RETURN saved;
END $$;
REVOKE ALL ON FUNCTION public.atlas_event_learn(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.atlas_event_learn(uuid) TO service_role;
-- The legacy demand reader also preserves the distinction between observations and rules.
CREATE OR REPLACE FUNCTION public.atlas_demand_context(p_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE d public.atlas_demands; result jsonb;
BEGIN
 IF NOT private.atlas_demand_owner() THEN RAISE EXCEPTION 'Acesso negado.' USING ERRCODE='42501'; END IF;
 SELECT * INTO d FROM public.atlas_demands WHERE id=p_id;
 IF d.id IS NULL THEN RAISE EXCEPTION 'Demanda não encontrada.' USING ERRCODE='42501'; END IF;
 SELECT jsonb_build_object('demand',to_jsonb(d),'client',(SELECT jsonb_build_object('id',c.id,'name',c.empresa,'labels',c.etiquetas,'service',c.tipo_servico,'objective',c.objetivo_meta,'scope',c.produtos_servicos,'about',c.sobre_empresa) FROM public.clientes c WHERE c.id=d.client_id),
 'team',(SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') FROM (SELECT id,full_name,role FROM public.profiles WHERE status='active' AND role IN ('superadmin','admin','colaborador') ORDER BY full_name LIMIT 100) x),
 'functions',(SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') FROM (SELECT id,name,assignee_ids FROM public.task_operational_functions WHERE is_active LIMIT 100) x),
 'traffic_owner',(SELECT primary_assignee_id FROM public.traffic_client_ops WHERE client_id=d.client_id),
 'tasks',(SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') FROM (SELECT t.id,t.title,left(t.description,2400) AS description,t.status,t.due_date,t.assignee_ids,t.project_id,md5(to_jsonb(t)::text) AS task_hash FROM public.tarefas t LEFT JOIN public.task_statuses s ON s.value=t.status WHERE t.client_id=d.client_id AND NOT coalesce(s.is_terminal,false) ORDER BY t.created_at DESC LIMIT 50) x),
 'projects',(SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') FROM (SELECT id,name,status FROM public.projetos WHERE client_id=d.client_id ORDER BY created_at DESC LIMIT 20) x),
 'memories',(SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') FROM (SELECT id,left(content,3000) AS content,source,version,created_at,learning_kind,evidence,source_quote FROM public.atlas_memories WHERE client_id=d.client_id AND state='active' ORDER BY created_at DESC LIMIT 20) x),
 'documents',(SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') FROM (SELECT id,title,left(content->>'text_content',4000) AS text,jsonb_build_object('kind',record_meta->'kind','state',record_meta->'state','agreed',record_meta->'agreed','next_steps',record_meta->'next_steps') AS record_meta,revision FROM public.client_documents WHERE client_id=d.client_id AND apexia_access AND archived_at IS NULL ORDER BY updated_at DESC LIMIT 10) x),
 'meetings',(SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') FROM (SELECT id,titulo,marcada_para FROM public.cliente_reunioes WHERE cliente_id=d.client_id ORDER BY marcada_para DESC LIMIT 10) x),
 'coverage',jsonb_build_object('active_tasks_limit',50,'memories_limit',20,'documents_limit',10,'attachments_read',false,'whatsapp_read',false,'queried_at',now())) INTO result;
 RETURN result||jsonb_build_object('basis_hash',md5((result-'demand'-'coverage')::text));
END $$;
-- Conversational corrections preserve the observed type, as explicit UI corrections do.
CREATE OR REPLACE FUNCTION public.atlas_learn(p_run_id uuid,p_content text,p_quote text,p_topic text,p_replaces_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE r public.atlas_runs; m public.atlas_memories; old public.atlas_memories; v integer:=1;
BEGIN
 IF NOT public.atlas_is_owner() THEN RAISE EXCEPTION 'ATLAS_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF NOT (SELECT auto_memory FROM public.atlas_settings WHERE id='atlas') THEN RETURN NULL; END IF;
 SELECT * INTO r FROM public.atlas_runs WHERE id=p_run_id AND owner_id=auth.uid();
 IF NOT FOUND OR char_length(btrim(p_content)) NOT BETWEEN 1 AND 1500 OR char_length(btrim(p_quote)) NOT BETWEEN 8 AND 1500
   OR strpos(lower(r.request_message),lower(btrim(p_quote)))=0 THEN RAISE EXCEPTION 'ATLAS_MEMORY_SOURCE_INVALID'; END IF;
 SELECT * INTO m FROM public.atlas_memories WHERE owner_id=auth.uid() AND source_run_id=r.id AND content=btrim(p_content);
 IF FOUND THEN RETURN to_jsonb(m); END IF;
 IF p_replaces_id IS NOT NULL THEN
   SELECT * INTO old FROM public.atlas_memories WHERE id=p_replaces_id AND owner_id=auth.uid() AND state='active' AND client_id IS NOT DISTINCT FROM r.request_client_id FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'ATLAS_MEMORY_CONFLICT'; END IF;
   UPDATE public.atlas_memories SET state='replaced' WHERE id=old.id; v:=old.version+1;
 END IF;
 INSERT INTO public.atlas_memories(owner_id,client_id,content,source,source_run_id,source_quote,topic,version,replaces_id,learning_kind)
 VALUES(auth.uid(),r.request_client_id,btrim(p_content),'conversation',r.id,btrim(p_quote),left(coalesce(p_topic,'geral'),80),v,p_replaces_id,coalesce(old.learning_kind,'rule')) RETURNING * INTO m;
 RETURN to_jsonb(m);
END $$;
REVOKE ALL ON FUNCTION public.atlas_demand_context(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.atlas_demand_context(uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;

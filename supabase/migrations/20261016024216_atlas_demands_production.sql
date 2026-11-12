-- Production-only rollout of client records, Atlas intake, approved planning and team follow-up.
-- Deliberately excludes all consulting project/funnel changes and all test data.
BEGIN;
ALTER TABLE public.client_documents ADD COLUMN record_meta jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(record_meta)='object'), ADD COLUMN revision integer NOT NULL DEFAULT 0, ADD COLUMN archived_at timestamptz;
CREATE FUNCTION private.cs_client_access(p_client uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT coalesce(private.planeje_staff_role() IN ('superadmin','admin','colaborador'),false)
 AND EXISTS(SELECT 1 FROM public.clientes WHERE id=p_client);
$$;
REVOKE ALL ON FUNCTION private.cs_client_access(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.cs_client_access(uuid) TO authenticated,service_role;
CREATE POLICY cs_documents_team ON public.client_documents AS RESTRICTIVE FOR ALL TO authenticated
 USING(private.cs_client_access(client_id)) WITH CHECK(private.cs_client_access(client_id));

CREATE TABLE public.client_document_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), document_id uuid NOT NULL REFERENCES public.client_documents(id) ON DELETE RESTRICT,
 client_id uuid NOT NULL REFERENCES public.clientes(id), revision integer NOT NULL, title text, content jsonb, record_meta jsonb,
 saved_by uuid, saved_at timestamptz NOT NULL DEFAULT now(), UNIQUE(document_id,revision)
);

CREATE INDEX cs_document_versions_client ON public.client_document_versions(client_id);
ALTER TABLE public.client_document_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY cs_document_versions_read ON public.client_document_versions FOR SELECT TO authenticated USING(private.cs_client_access(client_id));
REVOKE ALL ON public.client_document_versions FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.client_document_versions TO authenticated;
GRANT ALL ON public.client_document_versions TO service_role;
CREATE FUNCTION private.cs_document_guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE r jsonb; v_project uuid; v_meeting uuid;
BEGIN
 IF TG_OP='UPDATE' AND NEW.client_id IS DISTINCT FROM OLD.client_id THEN RAISE EXCEPTION 'O cliente do documento não pode ser trocado.'; END IF;
 -- Ordinary documents keep their original editing and deletion behavior.
 IF NEW.record_meta='{}'::jsonb THEN
  IF TG_OP='UPDATE' AND OLD.record_meta<>'{}'::jsonb THEN RAISE EXCEPTION 'Preserve os dados do histórico; arquive o registro para retirá-lo da lista.'; END IF;
  RETURN NEW;
 END IF;
 IF coalesce(NEW.record_meta->>'kind','note') NOT IN ('note','meeting','presentation','report','scope') OR coalesce(NEW.record_meta->>'state','draft') NOT IN ('draft','presented','sent','approved') THEN RAISE EXCEPTION 'Tipo ou situação do documento inválido.'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_each(NEW.record_meta) WHERE key IN ('kind','state','date','project_id','meeting_id','participants','agreed','out_scope','next_steps') AND jsonb_typeof(value) NOT IN ('string','null')) THEN RAISE EXCEPTION 'Campos do documento devem ser texto.'; END IF;
 v_project:=nullif(NEW.record_meta->>'project_id','')::uuid;
 v_meeting:=nullif(NEW.record_meta->>'meeting_id','')::uuid;
 IF v_project IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.projetos WHERE id=v_project AND client_id=NEW.client_id) THEN RAISE EXCEPTION 'Projeto de outro cliente ou indisponível.'; END IF;
 IF v_meeting IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.cliente_reunioes WHERE id=v_meeting AND cliente_id=NEW.client_id) THEN RAISE EXCEPTION 'Reunião de outro cliente ou indisponível.'; END IF;
 IF jsonb_typeof(coalesce(NEW.record_meta->'attachments','[]'))<>'array' THEN RAISE EXCEPTION 'Anexos inválidos.'; END IF;
 FOR r IN SELECT value FROM jsonb_array_elements(coalesce(NEW.record_meta->'attachments','[]')) LOOP
  IF jsonb_typeof(r)<>'object' OR EXISTS(SELECT 1 FROM jsonb_each(r) WHERE key IN ('name','path','url','id') AND jsonb_typeof(value)<>'string') THEN RAISE EXCEPTION 'Arquivo inválido.'; END IF;
  IF r->>'path' IS NOT NULL AND split_part(r->>'path','/',1)<>NEW.id::text THEN RAISE EXCEPTION 'Arquivo de outro documento.'; END IF;
  IF r->>'url' IS NOT NULL AND (r->>'url' !~* '^https?://[^/[:space:]]+' OR r->>'url' ~* '^https?://[^/]*@') THEN RAISE EXCEPTION 'Link de arquivo inválido.'; END IF;
 END LOOP;
 IF coalesce(NEW.record_meta->>'state','draft')<>'draft' AND nullif(NEW.record_meta->>'date','') IS NULL THEN RAISE EXCEPTION 'Informe a data deste registro.'; END IF;
 IF nullif(NEW.record_meta->>'date','') IS NOT NULL THEN PERFORM (NEW.record_meta->>'date')::date; END IF;
 NEW.revision:=CASE WHEN TG_OP='INSERT' THEN 1 ELSE OLD.revision+1 END;
 NEW.updated_at:=clock_timestamp();
 RETURN NEW;
END;
$$;
CREATE TRIGGER cs_document_guard BEFORE INSERT OR UPDATE ON public.client_documents FOR EACH ROW EXECUTE FUNCTION private.cs_document_guard();

CREATE FUNCTION private.cs_document_snapshot() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NEW.record_meta='{}'::jsonb THEN RETURN NEW; END IF;
 IF auth.uid() IS NULL OR NOT private.cs_client_access(NEW.client_id) THEN RAISE EXCEPTION 'Acesso negado ao histórico.' USING ERRCODE='42501'; END IF;
 IF TG_OP='UPDATE' THEN
  INSERT INTO public.client_document_versions(document_id,client_id,revision,title,content,record_meta,saved_by,saved_at)
  VALUES(OLD.id,OLD.client_id,OLD.revision,OLD.title,OLD.content,OLD.record_meta,auth.uid(),coalesce(OLD.updated_at,now())) ON CONFLICT DO NOTHING;
 END IF;
 INSERT INTO public.client_document_versions(document_id,client_id,revision,title,content,record_meta,saved_by)
 VALUES(NEW.id,NEW.client_id,NEW.revision,NEW.title,NEW.content,NEW.record_meta,auth.uid());
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.cs_document_snapshot() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER cs_document_snapshot AFTER INSERT OR UPDATE ON public.client_documents FOR EACH ROW EXECUTE FUNCTION private.cs_document_snapshot();

CREATE FUNCTION public.cs_save_document(p_id uuid,p_revision integer,p_data jsonb) RETURNS public.client_documents
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE v public.client_documents;
BEGIN
 SELECT * INTO v FROM public.client_documents WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR NOT private.cs_client_access(v.client_id) THEN RAISE EXCEPTION 'Documento indisponível.' USING ERRCODE='42501'; END IF;
 IF p_revision IS NULL OR v.revision<>p_revision THEN RAISE EXCEPTION 'Este documento mudou em outra sessão. Reabra antes de salvar.' USING ERRCODE='PT409'; END IF;
 UPDATE public.client_documents SET title=p_data->>'title',content=coalesce(p_data->'content','{}'),record_meta=coalesce(p_data->'record_meta','{}'),apexia_access=coalesce((p_data->>'apexia_access')::boolean,false),archived_at=(p_data->>'archived_at')::timestamptz WHERE id=p_id RETURNING * INTO v;
 RETURN v;
END;
$$;
REVOKE ALL ON FUNCTION public.cs_save_document(uuid,integer,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cs_save_document(uuid,integer,jsonb) TO authenticated;

INSERT INTO storage.buckets(id,name,public,file_size_limit) VALUES('client-records','client-records',false,52428800);
CREATE FUNCTION private.cs_file_access(p_path text) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.client_documents d WHERE d.id::text=split_part(p_path,'/',1) AND private.cs_client_access(d.client_id));
$$;
REVOKE ALL ON FUNCTION private.cs_file_access(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.cs_file_access(text) TO authenticated,service_role;
CREATE POLICY cs_files_read ON storage.objects FOR SELECT TO authenticated USING(bucket_id='client-records' AND private.cs_file_access(name));
CREATE POLICY cs_files_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='client-records' AND private.cs_file_access(name));
CREATE POLICY cs_files_immutable ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated USING(bucket_id<>'client-records') WITH CHECK(bucket_id<>'client-records');
CREATE POLICY cs_files_keep_history ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated USING(bucket_id<>'client-records');
-- Immutable file paths keep old versions recoverable. No replacement or deletion grant.


REVOKE ALL ON FUNCTION private.cs_document_guard() FROM PUBLIC,anon,authenticated;

-- Derived from validated pilot: 20261015174034_atlas_demand_workflow.sql
-- Intake and approval only. Tasks remains the execution source.

CREATE FUNCTION private.atlas_demand_owner() RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT public.atlas_is_owner() AND private.planeje_live_session()
 AND auth.jwt()->>'session_id' IS NOT NULL AND auth.jwt()->>'planeje_server_delegate' IS NULL;
$$;
REVOKE ALL ON FUNCTION private.atlas_demand_owner() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.atlas_demand_owner() TO authenticated,service_role;

CREATE TABLE public.atlas_demands (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid NOT NULL REFERENCES public.profiles(id),
 client_id uuid NOT NULL REFERENCES public.clientes(id), request_id uuid NOT NULL,
 title text NOT NULL CHECK(char_length(btrim(title)) BETWEEN 1 AND 180),
 context text NOT NULL CHECK(char_length(btrim(context)) BETWEEN 1 AND 12000),
 source_url text CHECK(source_url IS NULL OR (char_length(source_url)<=2000 AND source_url ~ '^https?://')),
 state text NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','proposed','needs_direction','linked','archived')),
 proposal jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(proposal)='object'),
 analysis text, owner_question text, revision integer NOT NULL DEFAULT 0,
 task_id uuid, approved_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(owner_id,request_id), CHECK((state='linked')=(task_id IS NOT NULL))
);
CREATE INDEX atlas_demands_client ON public.atlas_demands(owner_id,client_id,updated_at DESC);
CREATE TABLE public.atlas_demand_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), demand_id uuid NOT NULL REFERENCES public.atlas_demands(id),
 actor_id uuid, kind text NOT NULL, body text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX atlas_demand_events_parent ON public.atlas_demand_events(demand_id,created_at);
CREATE TABLE public.atlas_demand_ai_requests (
 request_id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES public.profiles(id), demand_id uuid,
 kind text NOT NULL CHECK(kind IN ('analysis','dictation')), state text NOT NULL DEFAULT 'processing' CHECK(state IN ('processing','completed','failed')),
 result jsonb, usage jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL DEFAULT now()+interval '1 day'
);
ALTER TABLE public.atlas_demands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atlas_demand_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atlas_demand_ai_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.atlas_demands,public.atlas_demand_events,public.atlas_demand_ai_requests FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.atlas_demands,public.atlas_demand_events,public.atlas_demand_ai_requests TO service_role;
GRANT SELECT ON public.atlas_demands,public.atlas_demand_events TO authenticated;
CREATE POLICY atlas_demands_read ON public.atlas_demands FOR SELECT TO authenticated USING(owner_id=(SELECT auth.uid()) AND (SELECT private.atlas_demand_owner()));
CREATE POLICY atlas_demand_events_read ON public.atlas_demand_events FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.atlas_demands d WHERE d.id=demand_id));

CREATE FUNCTION public.atlas_demand_access() RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$ SELECT private.atlas_demand_owner(); $$;

-- Definer is required to protect approval fields from direct table updates. Every
-- branch checks the active human owner; external senders and model output cannot call it.
CREATE FUNCTION private.atlas_demand_mutate(p_action text,p_data jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d public.atlas_demands; t public.tarefas; v_actor uuid:=auth.uid(); v_id uuid; v_client uuid;
 v_title text; v_text text; v_url text; v_assignee uuid; v_project uuid; v_mode text; v_initial text; v_type text; v_mem jsonb; v_context jsonb;
BEGIN
 IF NOT private.atlas_demand_owner() THEN RAISE EXCEPTION 'Acesso exclusivo do dono em uma sessão ativa.' USING ERRCODE='42501'; END IF;
 IF p_data IS NULL OR jsonb_typeof(p_data)<>'object' THEN RAISE EXCEPTION 'Pedido inválido.'; END IF;
 IF p_action='create' THEN
   v_client:=(p_data->>'client_id')::uuid; v_title:=btrim(p_data->>'title'); v_text:=btrim(p_data->>'context'); v_url:=nullif(btrim(p_data->>'source_url'),'');
   IF NOT EXISTS(SELECT 1 FROM public.clientes WHERE id=v_client AND etapa='closed') THEN RAISE EXCEPTION 'Cliente fora da carteira atual.'; END IF;
   IF coalesce(char_length(v_title),0) NOT BETWEEN 1 AND 180 OR coalesce(char_length(v_text),0) NOT BETWEEN 1 AND 12000 THEN RAISE EXCEPTION 'Informe assunto e contexto nos limites indicados.'; END IF;
   IF p_data->>'request_id' IS NULL THEN RAISE EXCEPTION 'Identificador do pedido ausente.'; END IF;
   INSERT INTO public.atlas_demands(owner_id,client_id,request_id,title,context,source_url)
    VALUES(v_actor,v_client,(p_data->>'request_id')::uuid,v_title,v_text,v_url) ON CONFLICT(owner_id,request_id) DO NOTHING RETURNING * INTO d;
   IF d.id IS NULL THEN SELECT * INTO d FROM public.atlas_demands WHERE owner_id=v_actor AND request_id=(p_data->>'request_id')::uuid;
    IF d.client_id<>v_client OR d.title<>v_title OR d.context<>v_text OR d.source_url IS DISTINCT FROM v_url THEN RAISE EXCEPTION 'Esse identificador já foi usado para outra demanda.'; END IF;
    RETURN jsonb_build_object('demand',to_jsonb(d),'replayed',true);
   END IF;
   INSERT INTO public.atlas_demand_events(demand_id,actor_id,kind,body) VALUES(d.id,v_actor,'created','Demanda registrada. Ainda não há tarefa ou repasse.');
   RETURN jsonb_build_object('demand',to_jsonb(d),'replayed',false);
 END IF;
 SELECT * INTO d FROM public.atlas_demands WHERE id=(p_data->>'id')::uuid AND owner_id=v_actor FOR UPDATE;
 IF d.id IS NULL THEN RAISE EXCEPTION 'Demanda não encontrada.' USING ERRCODE='42501'; END IF;
 IF p_action='approve' AND d.state='linked' THEN
   SELECT * INTO t FROM public.tarefas WHERE id=d.task_id;
   RETURN jsonb_build_object('demand',to_jsonb(d),'task',CASE WHEN t.id IS NULL THEN NULL ELSE to_jsonb(t) END,'replayed',true);
 END IF;
 IF d.revision IS DISTINCT FROM (p_data->>'revision')::integer THEN RAISE EXCEPTION 'Os dados mudaram. Atualize e revise novamente.' USING ERRCODE='PT409'; END IF;
 IF d.state IN ('linked','archived') THEN RAISE EXCEPTION 'Esta demanda já foi encaminhada ou arquivada.'; END IF;
 IF p_action='direction' THEN
   v_text:=btrim(p_data->>'answer');
   IF coalesce(char_length(v_text),0) NOT BETWEEN 1 AND 3000 THEN RAISE EXCEPTION 'Responda em até 3.000 caracteres.'; END IF;
   v_mem:=public.atlas_save_memory('[Direção do cliente — confirmada pelo dono] '||v_text,d.client_id,true,NULL);
   UPDATE public.atlas_demands SET context=left(context||E'\n\nDireção adicional confirmada pelo dono: '||v_text,12000),state='draft',proposal='{}',owner_question=NULL,analysis=NULL,revision=revision+1,updated_at=now() WHERE id=d.id RETURNING * INTO d;
   INSERT INTO public.atlas_demand_events(demand_id,actor_id,kind,body) VALUES(d.id,v_actor,'direction',v_text);
   RETURN jsonb_build_object('demand',to_jsonb(d),'memory_id',v_mem->>'id');
 END IF;
 IF p_action='archive' THEN
   UPDATE public.atlas_demands SET state='archived',revision=revision+1,updated_at=now() WHERE id=d.id RETURNING * INTO d;
   INSERT INTO public.atlas_demand_events(demand_id,actor_id,kind,body) VALUES(d.id,v_actor,'archived','Arquivada pelo dono; histórico preservado.');
   RETURN jsonb_build_object('demand',to_jsonb(d));
 END IF;
 IF p_action='prepare_manual' THEN
   v_context:=public.atlas_demand_context(d.id);
   UPDATE public.atlas_demands SET state='proposed',owner_question=NULL,analysis='Proposta preparada manualmente pelo dono, sem chamada de IA.',
    proposal=jsonb_build_object('source','owner_manual','context_hash',v_context->>'basis_hash','task',jsonb_build_object('title',d.title,'description',left(d.context,8000),'assignee_id',NULL,'existing_task_id',NULL,'project_id',NULL,'due_date',NULL,'type','interno')),revision=revision+1,updated_at=now()
   WHERE id=d.id RETURNING * INTO d;
   INSERT INTO public.atlas_demand_events(demand_id,actor_id,kind,body) VALUES(d.id,v_actor,'manual_proposal','Dono preparou o repasse para revisão; nenhuma tarefa criada ainda.');
   RETURN jsonb_build_object('demand',to_jsonb(d));
 END IF;
 IF p_action<>'approve' OR (p_data->>'confirmed')::boolean IS DISTINCT FROM true OR d.state<>'proposed' THEN RAISE EXCEPTION 'Confira a proposta e confirme a aprovação.'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.clientes WHERE id=d.client_id AND etapa='closed') THEN RAISE EXCEPTION 'Cliente fora da carteira atual.'; END IF;
 v_context:=public.atlas_demand_context(d.id);
 IF d.proposal->>'context_hash' IS DISTINCT FROM v_context->>'basis_hash' THEN RAISE EXCEPTION 'O contexto do cliente mudou. Peça nova análise antes de aprovar.' USING ERRCODE='PT409'; END IF;
 v_mode:=p_data->>'mode'; v_text:=btrim(p_data->>'description'); v_title:=btrim(p_data->>'title');
 IF coalesce(char_length(v_text),0) NOT BETWEEN 1 AND 8000 THEN RAISE EXCEPTION 'Informe as orientações do repasse.'; END IF;
 IF v_mode IN ('link','reassign') THEN
   SELECT * INTO t FROM public.tarefas WHERE id=(p_data->>'task_id')::uuid AND client_id=d.client_id FOR UPDATE;
   IF t.id IS NULL THEN RAISE EXCEPTION 'Tarefa fora deste cliente.'; END IF;
   IF md5(to_jsonb(t)::text) IS DISTINCT FROM p_data->>'task_hash' THEN RAISE EXCEPTION 'A tarefa mudou. Confira seus dados antes de vincular.' USING ERRCODE='PT409'; END IF;
   IF EXISTS(SELECT 1 FROM public.task_statuses WHERE value=t.status AND is_terminal) THEN RAISE EXCEPTION 'Escolha uma tarefa em aberto.'; END IF;
   IF v_mode='reassign' THEN
     v_assignee:=(p_data->>'assignee_id')::uuid;
     IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=v_assignee AND status='active' AND role IN ('superadmin','admin','colaborador')) THEN RAISE EXCEPTION 'Responsável indisponível.'; END IF;
     UPDATE public.tarefas SET assignee_ids=ARRAY[v_assignee],status_history=coalesce(status_history,'[]')||jsonb_build_array(jsonb_build_object('status',t.status,'assignee_ids',ARRAY[v_assignee],'user_id',v_actor,'timestamp',now(),'source','atlas_approved_transfer','demand_id',d.id)) WHERE id=t.id RETURNING * INTO t;
   ELSIF coalesce(array_length(t.assignee_ids,1),0)=0 THEN RAISE EXCEPTION 'A tarefa precisa de responsável. Use Transferir tarefa existente.'; END IF;
 ELSIF v_mode='new' THEN
   IF coalesce(char_length(v_title),0) NOT BETWEEN 1 AND 180 THEN RAISE EXCEPTION 'Informe o título da tarefa.'; END IF;
   v_assignee:=(p_data->>'assignee_id')::uuid; v_project:=nullif(p_data->>'project_id','')::uuid; v_type:=coalesce(p_data->>'type','interno');
   IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=v_assignee AND status='active' AND role IN ('superadmin','admin','colaborador')) THEN RAISE EXCEPTION 'Responsável indisponível.'; END IF;
   IF v_project IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.projetos WHERE id=v_project AND client_id=d.client_id) THEN RAISE EXCEPTION 'Projeto de outro cliente.'; END IF;
   IF v_type NOT IN ('interno','paid_traffic','onboarding','video','arte','carrossel','social_media','post') THEN RAISE EXCEPTION 'Tipo de tarefa inválido.'; END IF;
   PERFORM pg_advisory_xact_lock(hashtextextended(d.client_id::text||lower(v_title),0));
   IF EXISTS(SELECT 1 FROM public.tarefas x LEFT JOIN public.task_statuses s ON s.value=x.status WHERE x.client_id=d.client_id AND lower(btrim(x.title))=lower(v_title) AND NOT coalesce(s.is_terminal,false)) THEN RAISE EXCEPTION 'Já existe tarefa aberta com esse título. Revise ou vincule a existente.'; END IF;
   SELECT value INTO v_initial FROM public.task_statuses WHERE is_initial AND NOT is_terminal ORDER BY sort_order,id LIMIT 1;
   IF v_initial IS NULL THEN RAISE EXCEPTION 'Status inicial não configurado.'; END IF;
   INSERT INTO public.tarefas(title,description,status,client_id,project_id,owner_id,type,priority,due_date,assignee_ids,status_history)
    VALUES(v_title,v_text,v_initial,d.client_id,v_project,v_actor,v_type,'medium',nullif(p_data->>'due_date','')::date,ARRAY[v_assignee],jsonb_build_array(jsonb_build_object('status',v_initial,'assignee_ids',ARRAY[v_assignee],'user_id',v_actor,'timestamp',now(),'source','atlas_approved_demand','demand_id',d.id))) RETURNING * INTO t;
 ELSE RAISE EXCEPTION 'Escolha criar, vincular ou transferir uma tarefa.';
 END IF;
 INSERT INTO public.task_comments(task_id,user_id,content,pendencia_caixa,origem) VALUES(t.id,v_actor,'Repasse aprovado pelo dono no Atlas: '||v_text,true,'gestor');
 UPDATE public.atlas_demands SET state='linked',task_id=t.id,approved_at=now(),revision=revision+1,updated_at=now() WHERE id=d.id RETURNING * INTO d;
 INSERT INTO public.atlas_demand_events(demand_id,actor_id,kind,body) VALUES(d.id,v_actor,'approved',CASE v_mode WHEN 'new' THEN 'Tarefa criada e encaminhada após aprovação.' WHEN 'reassign' THEN 'Transferência aprovada; histórico da tarefa preservado.' ELSE 'Tarefa existente vinculada; repasse registrado.' END);
 RETURN jsonb_build_object('demand',to_jsonb(d),'task',to_jsonb(t),'created',v_mode='new','replayed',false);
END $$;
CREATE FUNCTION public.atlas_demand_action(p_action text,p_data jsonb) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.atlas_demand_mutate(p_action,p_data); $$;

CREATE FUNCTION public.atlas_demand_context(p_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
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
 'memories',(SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') FROM (SELECT id,left(content,3000) AS content,source,version,created_at FROM public.atlas_memories WHERE client_id=d.client_id AND state='active' ORDER BY created_at DESC LIMIT 20) x),
 'documents',(SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') FROM (SELECT id,title,left(content->>'text_content',4000) AS text,jsonb_build_object('kind',record_meta->'kind','state',record_meta->'state','agreed',record_meta->'agreed','next_steps',record_meta->'next_steps') AS record_meta,revision FROM public.client_documents WHERE client_id=d.client_id AND apexia_access AND archived_at IS NULL ORDER BY updated_at DESC LIMIT 10) x),
 'meetings',(SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') FROM (SELECT id,titulo,marcada_para FROM public.cliente_reunioes WHERE cliente_id=d.client_id ORDER BY marcada_para DESC LIMIT 10) x),
 'coverage',jsonb_build_object('active_tasks_limit',50,'memories_limit',20,'documents_limit',10,'attachments_read',false,'whatsapp_read',false,'queried_at',now())) INTO result;
 RETURN result||jsonb_build_object('basis_hash',md5((result-'demand'-'coverage')::text));
END $$;

CREATE FUNCTION public.atlas_demand_ai_reserve(p_request uuid,p_owner uuid,p_demand uuid,p_kind text) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE r public.atlas_demand_ai_requests; quota integer;
BEGIN
 IF p_kind NOT IN ('analysis','dictation') OR NOT EXISTS(SELECT 1 FROM public.atlas_settings s JOIN public.profiles p ON p.id=s.owner_id WHERE s.id='atlas' AND s.enabled AND s.owner_id=p_owner AND p.status='active') THEN RAISE EXCEPTION 'Configuração do Atlas indisponível.'; END IF;
 UPDATE public.atlas_demand_ai_requests SET result=NULL WHERE expires_at<now() AND result IS NOT NULL;
 DELETE FROM public.atlas_demand_ai_requests WHERE created_at<now()-interval '7 days';
 PERFORM pg_advisory_xact_lock(hashtextextended(p_owner::text||p_kind,0));
 SELECT * INTO r FROM public.atlas_demand_ai_requests WHERE request_id=p_request;
 IF r.request_id IS NOT NULL THEN
  IF r.owner_id<>p_owner OR r.kind<>p_kind OR r.demand_id IS DISTINCT FROM p_demand THEN RAISE EXCEPTION 'Identificador utilizado por outro pedido.'; END IF;
  RETURN to_jsonb(r)||jsonb_build_object('claimed',false);
 END IF;
 IF p_kind='analysis' AND NOT EXISTS(SELECT 1 FROM public.atlas_demands WHERE id=p_demand AND owner_id=p_owner AND state IN ('draft','proposed','needs_direction')) THEN RAISE EXCEPTION 'Demanda não disponível para análise.'; END IF;
 SELECT count(*) INTO quota FROM public.atlas_demand_ai_requests WHERE owner_id=p_owner AND kind=p_kind AND (created_at AT TIME ZONE 'America/Sao_Paulo')::date=(now() AT TIME ZONE 'America/Sao_Paulo')::date;
 IF quota >= (CASE p_kind WHEN 'analysis' THEN 20 ELSE 40 END) THEN RAISE EXCEPTION 'Limite diário de análises sob pedido atingido.' USING ERRCODE='54000'; END IF;
 INSERT INTO public.atlas_demand_ai_requests(request_id,owner_id,demand_id,kind) VALUES(p_request,p_owner,p_demand,p_kind) RETURNING * INTO r;
 RETURN to_jsonb(r)||jsonb_build_object('claimed',true);
END $$;
CREATE FUNCTION public.atlas_demand_ai_finish(p_request uuid,p_revision integer,p_result jsonb,p_usage jsonb,p_success boolean) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE r public.atlas_demand_ai_requests; d public.atlas_demands;
BEGIN
 SELECT * INTO r FROM public.atlas_demand_ai_requests WHERE request_id=p_request FOR UPDATE;
 IF r.request_id IS NULL THEN RAISE EXCEPTION 'Reserva ausente.'; END IF;
 IF r.state<>'processing' THEN RETURN to_jsonb(r); END IF;
 IF p_success AND r.kind='analysis' THEN
   UPDATE public.atlas_demands SET analysis=left(p_result->>'summary',6000),owner_question=nullif(p_result->>'owner_question',''),
    proposal=p_result,state=CASE WHEN coalesce(p_result->>'owner_question','')<>'' THEN 'needs_direction' ELSE 'proposed' END,revision=revision+1,updated_at=now()
   WHERE id=r.demand_id AND owner_id=r.owner_id AND revision=p_revision AND state IN ('draft','proposed','needs_direction') RETURNING * INTO d;
   IF d.id IS NULL THEN RAISE EXCEPTION 'A demanda mudou durante a análise. Atualize antes de tentar novamente.' USING ERRCODE='PT409'; END IF;
   INSERT INTO public.atlas_demand_events(demand_id,kind,body) VALUES(d.id,'analysis',left(p_result->>'summary',6000));
 END IF;
 UPDATE public.atlas_demand_ai_requests SET state=CASE WHEN p_success THEN 'completed' ELSE 'failed' END,result=p_result,usage=coalesce(p_usage,'{}') WHERE request_id=p_request RETURNING * INTO r;
 RETURN to_jsonb(r);
END $$;
REVOKE ALL ON FUNCTION public.atlas_demand_ai_reserve(uuid,uuid,uuid,text),public.atlas_demand_ai_finish(uuid,integer,jsonb,jsonb,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.atlas_demand_ai_reserve(uuid,uuid,uuid,text),public.atlas_demand_ai_finish(uuid,integer,jsonb,jsonb,boolean) TO service_role;

-- Shared execution is read through tasks, never through the owner's private intake.
CREATE FUNCTION private.atlas_demand_team_queue() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT private.planeje_live_session() OR auth.jwt()->>'planeje_server_delegate' IS NOT NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND status='active' AND role IN ('superadmin','admin','colaborador')) THEN RAISE EXCEPTION 'Sessão da equipe necessária.' USING ERRCODE='42501'; END IF;
 RETURN (SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') FROM (SELECT DISTINCT ON (t.id) t.id,t.title,t.description,t.status,t.due_date,t.client_id,c.empresa AS client_name,d.id AS demand_id,(SELECT coalesce(jsonb_agg(jsonb_build_object('id',tc.id,'body',tc.content,'author',p.full_name,'user_id',tc.user_id,'at',tc.created_at) ORDER BY tc.created_at),'[]') FROM public.task_comments tc LEFT JOIN public.profiles p ON p.id=tc.user_id WHERE tc.task_id=t.id) AS comments FROM public.atlas_demands d JOIN public.tarefas t ON t.id=d.task_id JOIN public.clientes c ON c.id=t.client_id WHERE d.state='linked' AND auth.uid()=ANY(t.assignee_ids) ORDER BY t.id,d.approved_at DESC LIMIT 200) x);
END $$;
CREATE FUNCTION public.atlas_demand_team_queue() RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$ SELECT private.atlas_demand_team_queue(); $$;
CREATE FUNCTION private.atlas_demand_team_reply(p_task uuid,p_text text,p_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE comment_id uuid;
BEGIN
 IF NOT private.planeje_live_session() OR auth.jwt()->>'planeje_server_delegate' IS NOT NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND status='active' AND role IN ('superadmin','admin','colaborador')) THEN RAISE EXCEPTION 'Sessão ativa necessária.' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.tarefas t JOIN public.atlas_demands d ON d.task_id=t.id WHERE t.id=p_task AND auth.uid()=ANY(t.assignee_ids)) THEN RAISE EXCEPTION 'Tarefa não atribuída a você.' USING ERRCODE='42501'; END IF;
 IF char_length(btrim(coalesce(p_text,''))) NOT BETWEEN 1 AND 4000 THEN RAISE EXCEPTION 'Responda em até 4.000 caracteres.'; END IF;
 INSERT INTO public.task_comments(id,task_id,user_id,content,origem) VALUES(p_id,p_task,auth.uid(),btrim(p_text),'comentario') ON CONFLICT(id) DO NOTHING RETURNING id INTO comment_id;
 IF comment_id IS NULL AND NOT EXISTS(SELECT 1 FROM public.task_comments WHERE id=p_id AND task_id=p_task AND user_id=auth.uid() AND content=btrim(p_text)) THEN RAISE EXCEPTION 'Identificador da resposta já utilizado.'; END IF;
 RETURN jsonb_build_object('ok',true,'comment_id',p_id);
END $$;
CREATE FUNCTION public.atlas_demand_team_reply(p_task uuid,p_text text,p_id uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.atlas_demand_team_reply(p_task,p_text,p_id); $$;

DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) args FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','private') AND p.proname IN ('atlas_demand_access','atlas_demand_mutate','atlas_demand_action','atlas_demand_context','atlas_demand_team_queue','atlas_demand_team_reply') LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION %I.%I(%s) FROM PUBLIC,anon',f.nspname,f.proname,f.args);
 EXECUTE format('GRANT EXECUTE ON FUNCTION %I.%I(%s) TO authenticated,service_role',f.nspname,f.proname,f.args);
 END LOOP;
END $$;
NOTIFY pgrst,'reload schema';

-- Derived from validated pilot: 20261015234747_atlas_demand_client_task_title.sql
-- New Atlas tasks use the canonical client name. Existing linked tasks retain
-- their title, dates and assignees. No table/permission changes or data backfill.

CREATE FUNCTION private.atlas_demand_task_title(p_client_name text,p_title text)
RETURNS text LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE v_name text:=btrim(coalesce(p_client_name,'')); v_title text:=btrim(coalesce(p_title,'')); v_prefix text;
BEGIN
 IF v_name='' THEN RAISE EXCEPTION 'Cliente indisponível para definir o título.' USING ERRCODE='22023'; END IF;
 v_prefix:='['||v_name||']';
 WHILE lower(left(v_title,char_length(v_prefix)))=lower(v_prefix) LOOP
   v_title:=btrim(substr(v_title,char_length(v_prefix)+1));
 END LOOP;
 IF v_title='' THEN RAISE EXCEPTION 'Informe a ação da tarefa após o nome do cliente.' USING ERRCODE='22023'; END IF;
 v_title:=v_prefix||' '||v_title;
 IF char_length(v_title)>180 THEN RAISE EXCEPTION 'O título completo, incluindo o cliente, deve ter até 180 caracteres.' USING ERRCODE='22023'; END IF;
 RETURN v_title;
END $$;
REVOKE ALL ON FUNCTION private.atlas_demand_task_title(text,text) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.atlas_demand_mutate(p_action text,p_data jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d public.atlas_demands; t public.tarefas; v_actor uuid:=auth.uid(); v_id uuid; v_client uuid;
 v_title text; v_text text; v_url text; v_assignee uuid; v_project uuid; v_mode text; v_initial text; v_type text; v_mem jsonb; v_context jsonb;
BEGIN
 IF NOT private.atlas_demand_owner() THEN RAISE EXCEPTION 'Acesso exclusivo do dono em uma sessão ativa.' USING ERRCODE='42501'; END IF;
 IF p_data IS NULL OR jsonb_typeof(p_data)<>'object' THEN RAISE EXCEPTION 'Pedido inválido.'; END IF;
 IF p_action='create' THEN
   v_client:=(p_data->>'client_id')::uuid; v_title:=btrim(p_data->>'title'); v_text:=btrim(p_data->>'context'); v_url:=nullif(btrim(p_data->>'source_url'),'');
   IF NOT EXISTS(SELECT 1 FROM public.clientes WHERE id=v_client AND etapa='closed') THEN RAISE EXCEPTION 'Cliente fora da carteira atual.'; END IF;
   IF coalesce(char_length(v_title),0) NOT BETWEEN 1 AND 180 OR coalesce(char_length(v_text),0) NOT BETWEEN 1 AND 12000 THEN RAISE EXCEPTION 'Informe assunto e contexto nos limites indicados.'; END IF;
   IF p_data->>'request_id' IS NULL THEN RAISE EXCEPTION 'Identificador do pedido ausente.'; END IF;
   INSERT INTO public.atlas_demands(owner_id,client_id,request_id,title,context,source_url)
    VALUES(v_actor,v_client,(p_data->>'request_id')::uuid,v_title,v_text,v_url) ON CONFLICT(owner_id,request_id) DO NOTHING RETURNING * INTO d;
   IF d.id IS NULL THEN SELECT * INTO d FROM public.atlas_demands WHERE owner_id=v_actor AND request_id=(p_data->>'request_id')::uuid;
    IF d.client_id<>v_client OR d.title<>v_title OR d.context<>v_text OR d.source_url IS DISTINCT FROM v_url THEN RAISE EXCEPTION 'Esse identificador já foi usado para outra demanda.'; END IF;
    RETURN jsonb_build_object('demand',to_jsonb(d),'replayed',true);
   END IF;
   INSERT INTO public.atlas_demand_events(demand_id,actor_id,kind,body) VALUES(d.id,v_actor,'created','Demanda registrada. Ainda não há tarefa ou repasse.');
   RETURN jsonb_build_object('demand',to_jsonb(d),'replayed',false);
 END IF;
 SELECT * INTO d FROM public.atlas_demands WHERE id=(p_data->>'id')::uuid AND owner_id=v_actor FOR UPDATE;
 IF d.id IS NULL THEN RAISE EXCEPTION 'Demanda não encontrada.' USING ERRCODE='42501'; END IF;
 IF p_action='approve' AND d.state='linked' THEN
   SELECT * INTO t FROM public.tarefas WHERE id=d.task_id;
   RETURN jsonb_build_object('demand',to_jsonb(d),'task',CASE WHEN t.id IS NULL THEN NULL ELSE to_jsonb(t) END,'replayed',true);
 END IF;
 IF d.revision IS DISTINCT FROM (p_data->>'revision')::integer THEN RAISE EXCEPTION 'Os dados mudaram. Atualize e revise novamente.' USING ERRCODE='PT409'; END IF;
 IF d.state IN ('linked','archived') THEN RAISE EXCEPTION 'Esta demanda já foi encaminhada ou arquivada.'; END IF;
 IF p_action='direction' THEN
   v_text:=btrim(p_data->>'answer');
   IF coalesce(char_length(v_text),0) NOT BETWEEN 1 AND 3000 THEN RAISE EXCEPTION 'Responda em até 3.000 caracteres.'; END IF;
   v_mem:=public.atlas_save_memory('[Direção do cliente — confirmada pelo dono] '||v_text,d.client_id,true,NULL);
   UPDATE public.atlas_demands SET context=left(context||E'\n\nDireção adicional confirmada pelo dono: '||v_text,12000),state='draft',proposal='{}',owner_question=NULL,analysis=NULL,revision=revision+1,updated_at=now() WHERE id=d.id RETURNING * INTO d;
   INSERT INTO public.atlas_demand_events(demand_id,actor_id,kind,body) VALUES(d.id,v_actor,'direction',v_text);
   RETURN jsonb_build_object('demand',to_jsonb(d),'memory_id',v_mem->>'id');
 END IF;
 IF p_action='archive' THEN
   UPDATE public.atlas_demands SET state='archived',revision=revision+1,updated_at=now() WHERE id=d.id RETURNING * INTO d;
   INSERT INTO public.atlas_demand_events(demand_id,actor_id,kind,body) VALUES(d.id,v_actor,'archived','Arquivada pelo dono; histórico preservado.');
   RETURN jsonb_build_object('demand',to_jsonb(d));
 END IF;
 IF p_action='prepare_manual' THEN
   v_context:=public.atlas_demand_context(d.id);
   UPDATE public.atlas_demands SET state='proposed',owner_question=NULL,analysis='Proposta preparada manualmente pelo dono, sem chamada de IA.',
    proposal=jsonb_build_object('source','owner_manual','context_hash',v_context->>'basis_hash','task',jsonb_build_object('title',private.atlas_demand_task_title(v_context->'client'->>'name',d.title),'description',left(d.context,8000),'assignee_id',NULL,'existing_task_id',NULL,'project_id',NULL,'due_date',NULL,'type','interno')),revision=revision+1,updated_at=now()
   WHERE id=d.id RETURNING * INTO d;
   INSERT INTO public.atlas_demand_events(demand_id,actor_id,kind,body) VALUES(d.id,v_actor,'manual_proposal','Dono preparou o repasse para revisão; nenhuma tarefa criada ainda.');
   RETURN jsonb_build_object('demand',to_jsonb(d));
 END IF;
 IF p_action<>'approve' OR (p_data->>'confirmed')::boolean IS DISTINCT FROM true OR d.state<>'proposed' THEN RAISE EXCEPTION 'Confira a proposta e confirme a aprovação.'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.clientes WHERE id=d.client_id AND etapa='closed') THEN RAISE EXCEPTION 'Cliente fora da carteira atual.'; END IF;
 v_context:=public.atlas_demand_context(d.id);
 IF d.proposal->>'context_hash' IS DISTINCT FROM v_context->>'basis_hash' THEN RAISE EXCEPTION 'O contexto do cliente mudou. Peça nova análise antes de aprovar.' USING ERRCODE='PT409'; END IF;
 v_mode:=p_data->>'mode'; v_text:=btrim(p_data->>'description'); v_title:=btrim(p_data->>'title');
 IF coalesce(char_length(v_text),0) NOT BETWEEN 1 AND 8000 THEN RAISE EXCEPTION 'Informe as orientações do repasse.'; END IF;
 IF v_mode IN ('link','reassign') THEN
   SELECT * INTO t FROM public.tarefas WHERE id=(p_data->>'task_id')::uuid AND client_id=d.client_id FOR UPDATE;
   IF t.id IS NULL THEN RAISE EXCEPTION 'Tarefa fora deste cliente.'; END IF;
   IF md5(to_jsonb(t)::text) IS DISTINCT FROM p_data->>'task_hash' THEN RAISE EXCEPTION 'A tarefa mudou. Confira seus dados antes de vincular.' USING ERRCODE='PT409'; END IF;
   IF EXISTS(SELECT 1 FROM public.task_statuses WHERE value=t.status AND is_terminal) THEN RAISE EXCEPTION 'Escolha uma tarefa em aberto.'; END IF;
   IF v_mode='reassign' THEN
     v_assignee:=(p_data->>'assignee_id')::uuid;
     IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=v_assignee AND status='active' AND role IN ('superadmin','admin','colaborador')) THEN RAISE EXCEPTION 'Responsável indisponível.'; END IF;
     UPDATE public.tarefas SET assignee_ids=ARRAY[v_assignee],status_history=coalesce(status_history,'[]')||jsonb_build_array(jsonb_build_object('status',t.status,'assignee_ids',ARRAY[v_assignee],'user_id',v_actor,'timestamp',now(),'source','atlas_approved_transfer','demand_id',d.id)) WHERE id=t.id RETURNING * INTO t;
   ELSIF coalesce(array_length(t.assignee_ids,1),0)=0 THEN RAISE EXCEPTION 'A tarefa precisa de responsável. Use Transferir tarefa existente.'; END IF;
 ELSIF v_mode='new' THEN
   v_title:=private.atlas_demand_task_title(v_context->'client'->>'name',v_title);
   IF coalesce(char_length(v_title),0) NOT BETWEEN 1 AND 180 THEN RAISE EXCEPTION 'Informe o título da tarefa.'; END IF;
   v_assignee:=(p_data->>'assignee_id')::uuid; v_project:=nullif(p_data->>'project_id','')::uuid; v_type:=coalesce(p_data->>'type','interno');
   IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=v_assignee AND status='active' AND role IN ('superadmin','admin','colaborador')) THEN RAISE EXCEPTION 'Responsável indisponível.'; END IF;
   IF v_project IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.projetos WHERE id=v_project AND client_id=d.client_id) THEN RAISE EXCEPTION 'Projeto de outro cliente.'; END IF;
   IF v_type NOT IN ('interno','paid_traffic','onboarding','video','arte','carrossel','social_media','post') THEN RAISE EXCEPTION 'Tipo de tarefa inválido.'; END IF;
   PERFORM pg_advisory_xact_lock(hashtextextended(d.client_id::text||lower(v_title),0));
   IF EXISTS(SELECT 1 FROM public.tarefas x LEFT JOIN public.task_statuses s ON s.value=x.status WHERE x.client_id=d.client_id AND lower(btrim(x.title)) IN (lower(v_title),lower(substr(v_title,char_length(v_context->'client'->>'name')+4))) AND NOT coalesce(s.is_terminal,false)) THEN RAISE EXCEPTION 'Já existe tarefa aberta com esse título. Revise ou vincule a existente.'; END IF;
   SELECT value INTO v_initial FROM public.task_statuses WHERE is_initial AND NOT is_terminal ORDER BY sort_order,id LIMIT 1;
   IF v_initial IS NULL THEN RAISE EXCEPTION 'Status inicial não configurado.'; END IF;
   INSERT INTO public.tarefas(title,description,status,client_id,project_id,owner_id,type,priority,due_date,assignee_ids,status_history)
    VALUES(v_title,v_text,v_initial,d.client_id,v_project,v_actor,v_type,'medium',nullif(p_data->>'due_date','')::date,ARRAY[v_assignee],jsonb_build_array(jsonb_build_object('status',v_initial,'assignee_ids',ARRAY[v_assignee],'user_id',v_actor,'timestamp',now(),'source','atlas_approved_demand','demand_id',d.id))) RETURNING * INTO t;
 ELSE RAISE EXCEPTION 'Escolha criar, vincular ou transferir uma tarefa.';
 END IF;
 INSERT INTO public.task_comments(task_id,user_id,content,pendencia_caixa,origem) VALUES(t.id,v_actor,'Repasse aprovado pelo dono no Atlas: '||v_text,true,'gestor');
 UPDATE public.atlas_demands SET state='linked',task_id=t.id,approved_at=now(),revision=revision+1,updated_at=now() WHERE id=d.id RETURNING * INTO d;
 INSERT INTO public.atlas_demand_events(demand_id,actor_id,kind,body) VALUES(d.id,v_actor,'approved',CASE v_mode WHEN 'new' THEN 'Tarefa criada e encaminhada após aprovação.' WHEN 'reassign' THEN 'Transferência aprovada; histórico da tarefa preservado.' ELSE 'Tarefa existente vinculada; repasse registrado.' END);
 RETURN jsonb_build_object('demand',to_jsonb(d),'task',to_jsonb(t),'created',v_mode='new','replayed',false);
END $$;

NOTIFY pgrst,'reload schema';

-- Derived from validated pilot: 20261016000249_atlas_demand_schedule_suggestions.sql
-- Owner-only planning inputs and editable defaults. Suggestions never write tasks.

CREATE TABLE public.atlas_demand_planning_settings (
 owner_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
 inquiry_days integer NOT NULL DEFAULT 1 CHECK(inquiry_days BETWEEN 0 AND 365),
 production_days integer NOT NULL DEFAULT 3 CHECK(production_days BETWEEN 0 AND 365),
 revision integer NOT NULL DEFAULT 0 CHECK(revision>=0), updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.atlas_demand_planning_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.atlas_demand_planning_settings FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.atlas_demand_planning_settings TO authenticated;
GRANT ALL ON public.atlas_demand_planning_settings TO service_role;
CREATE POLICY atlas_demand_planning_read ON public.atlas_demand_planning_settings FOR SELECT TO authenticated USING(owner_id=auth.uid() AND private.atlas_demand_owner());

CREATE FUNCTION private.atlas_demand_planning_save(p_inquiry integer,p_production integer,p_revision integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s public.atlas_demand_planning_settings;
BEGIN
 IF NOT private.atlas_demand_owner() THEN RAISE EXCEPTION 'Apenas o dono em uma sessão ativa pode alterar as regras.' USING ERRCODE='42501'; END IF;
 IF p_inquiry IS NULL OR p_production IS NULL OR p_inquiry NOT BETWEEN 0 AND 365 OR p_production NOT BETWEEN 0 AND 365 THEN RAISE EXCEPTION 'Use de 0 a 365 dias úteis.' USING ERRCODE='22023'; END IF;
 INSERT INTO public.atlas_demand_planning_settings(owner_id) VALUES(auth.uid()) ON CONFLICT DO NOTHING;
 SELECT * INTO s FROM public.atlas_demand_planning_settings WHERE owner_id=auth.uid() FOR UPDATE;
 IF s.revision IS DISTINCT FROM p_revision THEN RAISE EXCEPTION 'As regras mudaram. Atualize antes de salvar.' USING ERRCODE='PT409'; END IF;
 UPDATE public.atlas_demand_planning_settings SET inquiry_days=p_inquiry,production_days=p_production,revision=revision+1,updated_at=now() WHERE owner_id=auth.uid() RETURNING * INTO s;
 RETURN to_jsonb(s);
END $$;
CREATE FUNCTION public.atlas_demand_planning_save(p_inquiry integer,p_production integer,p_revision integer) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.atlas_demand_planning_save(p_inquiry,p_production,p_revision); $$;
REVOKE ALL ON FUNCTION private.atlas_demand_planning_save(integer,integer,integer),public.atlas_demand_planning_save(integer,integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.atlas_demand_planning_save(integer,integer,integer),public.atlas_demand_planning_save(integer,integer,integer) TO authenticated,service_role;

CREATE FUNCTION public.atlas_demand_schedule_context(p_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE result jsonb; c jsonb; today date:=(now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
 IF NOT private.atlas_demand_owner() THEN RAISE EXCEPTION 'Consulta exclusiva do dono em uma sessão ativa.' USING ERRCODE='42501'; END IF;
 c:=public.atlas_demand_context(p_id);
 SELECT jsonb_build_object(
 'local_today',today,'timezone','America/Sao_Paulo','demand_revision',c->'demand'->'revision','client_basis_hash',c->'basis_hash','traffic_owner',c->'traffic_owner',
 'team',c->'team',
 'settings',coalesce((SELECT jsonb_build_object('inquiry_days',inquiry_days,'production_days',production_days,'revision',revision) FROM public.atlas_demand_planning_settings WHERE owner_id=auth.uid()),jsonb_build_object('inquiry_days',1,'production_days',3,'revision',0)),
 'functions',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'assignee_ids',assignee_ids) ORDER BY id),'[]') FROM public.task_operational_functions WHERE is_active),
 'workflows',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'task_types',task_types,'stages',stages) ORDER BY created_at,id),'[]') FROM public.task_workflow_templates WHERE is_active),
 'workloads',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY person_id),'[]') FROM (SELECT p.id AS person_id,count(t.id) AS open_tasks,count(t.id) FILTER(WHERE t.due_date<today) AS overdue_tasks,count(t.id) FILTER(WHERE t.due_date>=today AND t.due_date<=today+7) AS due_soon,count(t.id) FILTER(WHERE t.due_date IS NULL) AS without_due FROM public.profiles p LEFT JOIN public.tarefas t ON p.id=ANY(t.assignee_ids) AND NOT EXISTS(SELECT 1 FROM public.task_statuses s WHERE s.value=t.status AND s.is_terminal) WHERE p.status='active' AND p.role IN ('admin','superadmin','colaborador') GROUP BY p.id) x),
 'capacities',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY operational_function_id,week_start),'[]') FROM (SELECT cap.operational_function_id,cap.week_start,cap.task_limit,(SELECT count(*) FROM public.tarefas t WHERE t.operational_function_id=cap.operational_function_id AND t.due_date>=cap.week_start AND t.due_date<cap.week_start+7) AS scheduled_tasks FROM public.task_function_capacities cap WHERE cap.week_start>=date_trunc('week',today::timestamp)::date AND cap.week_start<today+371) x)
 ) INTO result;
 RETURN result||jsonb_build_object('basis_hash',md5(result::text));
END $$;
REVOKE ALL ON FUNCTION public.atlas_demand_schedule_context(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.atlas_demand_schedule_context(uuid) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION private.atlas_demand_mutate(p_action text,p_data jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d public.atlas_demands; t public.tarefas; v_actor uuid:=auth.uid(); v_id uuid; v_client uuid;
 v_title text; v_text text; v_url text; v_assignee uuid; v_project uuid; v_mode text; v_initial text; v_type text; v_mem jsonb; v_context jsonb; v_schedule jsonb; v_function uuid; v_expected uuid[];
BEGIN
 IF NOT private.atlas_demand_owner() THEN RAISE EXCEPTION 'Acesso exclusivo do dono em uma sessão ativa.' USING ERRCODE='42501'; END IF;
 IF p_data IS NULL OR jsonb_typeof(p_data)<>'object' THEN RAISE EXCEPTION 'Pedido inválido.'; END IF;
 IF p_action='create' THEN
   v_client:=(p_data->>'client_id')::uuid; v_title:=btrim(p_data->>'title'); v_text:=btrim(p_data->>'context'); v_url:=nullif(btrim(p_data->>'source_url'),'');
   IF NOT EXISTS(SELECT 1 FROM public.clientes WHERE id=v_client AND etapa='closed') THEN RAISE EXCEPTION 'Cliente fora da carteira atual.'; END IF;
   IF coalesce(char_length(v_title),0) NOT BETWEEN 1 AND 180 OR coalesce(char_length(v_text),0) NOT BETWEEN 1 AND 12000 THEN RAISE EXCEPTION 'Informe assunto e contexto nos limites indicados.'; END IF;
   IF p_data->>'request_id' IS NULL THEN RAISE EXCEPTION 'Identificador do pedido ausente.'; END IF;
   INSERT INTO public.atlas_demands(owner_id,client_id,request_id,title,context,source_url)
    VALUES(v_actor,v_client,(p_data->>'request_id')::uuid,v_title,v_text,v_url) ON CONFLICT(owner_id,request_id) DO NOTHING RETURNING * INTO d;
   IF d.id IS NULL THEN SELECT * INTO d FROM public.atlas_demands WHERE owner_id=v_actor AND request_id=(p_data->>'request_id')::uuid;
    IF d.client_id<>v_client OR d.title<>v_title OR d.context<>v_text OR d.source_url IS DISTINCT FROM v_url THEN RAISE EXCEPTION 'Esse identificador já foi usado para outra demanda.'; END IF;
    RETURN jsonb_build_object('demand',to_jsonb(d),'replayed',true);
   END IF;
   INSERT INTO public.atlas_demand_events(demand_id,actor_id,kind,body) VALUES(d.id,v_actor,'created','Demanda registrada. Ainda não há tarefa ou repasse.');
   RETURN jsonb_build_object('demand',to_jsonb(d),'replayed',false);
 END IF;
 SELECT * INTO d FROM public.atlas_demands WHERE id=(p_data->>'id')::uuid AND owner_id=v_actor FOR UPDATE;
 IF d.id IS NULL THEN RAISE EXCEPTION 'Demanda não encontrada.' USING ERRCODE='42501'; END IF;
 IF p_action='approve' AND d.state='linked' THEN
   SELECT * INTO t FROM public.tarefas WHERE id=d.task_id;
   RETURN jsonb_build_object('demand',to_jsonb(d),'task',CASE WHEN t.id IS NULL THEN NULL ELSE to_jsonb(t) END,'replayed',true);
 END IF;
 IF d.revision IS DISTINCT FROM (p_data->>'revision')::integer THEN RAISE EXCEPTION 'Os dados mudaram. Atualize e revise novamente.' USING ERRCODE='PT409'; END IF;
 IF d.state IN ('linked','archived') THEN RAISE EXCEPTION 'Esta demanda já foi encaminhada ou arquivada.'; END IF;
 IF p_action='direction' THEN
   v_text:=btrim(p_data->>'answer');
   IF coalesce(char_length(v_text),0) NOT BETWEEN 1 AND 3000 THEN RAISE EXCEPTION 'Responda em até 3.000 caracteres.'; END IF;
   v_mem:=public.atlas_save_memory('[Direção do cliente — confirmada pelo dono] '||v_text,d.client_id,true,NULL);
   UPDATE public.atlas_demands SET context=left(context||E'\n\nDireção adicional confirmada pelo dono: '||v_text,12000),state='draft',proposal='{}',owner_question=NULL,analysis=NULL,revision=revision+1,updated_at=now() WHERE id=d.id RETURNING * INTO d;
   INSERT INTO public.atlas_demand_events(demand_id,actor_id,kind,body) VALUES(d.id,v_actor,'direction',v_text);
   RETURN jsonb_build_object('demand',to_jsonb(d),'memory_id',v_mem->>'id');
 END IF;
 IF p_action='archive' THEN
   UPDATE public.atlas_demands SET state='archived',revision=revision+1,updated_at=now() WHERE id=d.id RETURNING * INTO d;
   INSERT INTO public.atlas_demand_events(demand_id,actor_id,kind,body) VALUES(d.id,v_actor,'archived','Arquivada pelo dono; histórico preservado.');
   RETURN jsonb_build_object('demand',to_jsonb(d));
 END IF;
 IF p_action='prepare_manual' THEN
   v_context:=public.atlas_demand_context(d.id);
   UPDATE public.atlas_demands SET state='proposed',owner_question=NULL,analysis='Proposta preparada manualmente pelo dono, sem chamada de IA.',
    proposal=jsonb_build_object('source','owner_manual','context_hash',v_context->>'basis_hash','task',jsonb_build_object('title',private.atlas_demand_task_title(v_context->'client'->>'name',d.title),'description',left(d.context,8000),'assignee_id',NULL,'existing_task_id',NULL,'project_id',NULL,'due_date',NULL,'type','interno')),revision=revision+1,updated_at=now()
   WHERE id=d.id RETURNING * INTO d;
   INSERT INTO public.atlas_demand_events(demand_id,actor_id,kind,body) VALUES(d.id,v_actor,'manual_proposal','Dono preparou o repasse para revisão; nenhuma tarefa criada ainda.');
   RETURN jsonb_build_object('demand',to_jsonb(d));
 END IF;
 IF p_action<>'approve' OR (p_data->>'confirmed')::boolean IS DISTINCT FROM true OR d.state<>'proposed' THEN RAISE EXCEPTION 'Confira a proposta e confirme a aprovação.'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.clientes WHERE id=d.client_id AND etapa='closed') THEN RAISE EXCEPTION 'Cliente fora da carteira atual.'; END IF;
 v_context:=public.atlas_demand_context(d.id);
 IF d.proposal->>'context_hash' IS DISTINCT FROM v_context->>'basis_hash' THEN RAISE EXCEPTION 'O contexto do cliente mudou. Peça nova análise antes de aprovar.' USING ERRCODE='PT409'; END IF;
 v_mode:=p_data->>'mode'; v_text:=btrim(p_data->>'description'); v_title:=btrim(p_data->>'title');
 IF coalesce(char_length(v_text),0) NOT BETWEEN 1 AND 8000 THEN RAISE EXCEPTION 'Informe as orientações do repasse.'; END IF;
 IF v_mode IN ('link','reassign') THEN
   SELECT * INTO t FROM public.tarefas WHERE id=(p_data->>'task_id')::uuid AND client_id=d.client_id FOR UPDATE;
   IF t.id IS NULL THEN RAISE EXCEPTION 'Tarefa fora deste cliente.'; END IF;
   IF md5(to_jsonb(t)::text) IS DISTINCT FROM p_data->>'task_hash' THEN RAISE EXCEPTION 'A tarefa mudou. Confira seus dados antes de vincular.' USING ERRCODE='PT409'; END IF;
   IF EXISTS(SELECT 1 FROM public.task_statuses WHERE value=t.status AND is_terminal) THEN RAISE EXCEPTION 'Escolha uma tarefa em aberto.'; END IF;
   IF v_mode='reassign' THEN
     v_assignee:=(p_data->>'assignee_id')::uuid;
     IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=v_assignee AND status='active' AND role IN ('superadmin','admin','colaborador')) THEN RAISE EXCEPTION 'Responsável indisponível.'; END IF;
     UPDATE public.tarefas SET assignee_ids=ARRAY[v_assignee],status_history=coalesce(status_history,'[]')||jsonb_build_array(jsonb_build_object('status',t.status,'assignee_ids',ARRAY[v_assignee],'user_id',v_actor,'timestamp',now(),'source','atlas_approved_transfer','demand_id',d.id)) WHERE id=t.id RETURNING * INTO t;
   ELSIF coalesce(array_length(t.assignee_ids,1),0)=0 THEN RAISE EXCEPTION 'A tarefa precisa de responsável. Use Transferir tarefa existente.'; END IF;
 ELSIF v_mode='new' THEN
   IF nullif(p_data->>'schedule_hash','') IS NOT NULL THEN
     v_schedule:=public.atlas_demand_schedule_context(d.id);
     IF v_schedule->>'basis_hash' IS DISTINCT FROM p_data->>'schedule_hash' THEN RAISE EXCEPTION 'A fila, as regras ou o cadastro mudaram. Recalcule as sugestões antes de aprovar.' USING ERRCODE='PT409'; END IF;
   END IF;
   v_title:=private.atlas_demand_task_title(v_context->'client'->>'name',v_title);
   IF coalesce(char_length(v_title),0) NOT BETWEEN 1 AND 180 THEN RAISE EXCEPTION 'Informe o título da tarefa.'; END IF;
   v_assignee:=(p_data->>'assignee_id')::uuid; v_project:=nullif(p_data->>'project_id','')::uuid; v_type:=coalesce(p_data->>'type','interno');
   IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=v_assignee AND status='active' AND role IN ('superadmin','admin','colaborador')) THEN RAISE EXCEPTION 'Responsável indisponível.'; END IF;
   v_expected:=ARRAY[v_assignee];
   IF v_schedule IS NOT NULL AND jsonb_typeof(p_data->'expected_assignee_ids')='array' THEN
     SELECT array_agg(DISTINCT value::uuid ORDER BY value::uuid) INTO v_expected FROM jsonb_array_elements_text(p_data->'expected_assignee_ids');
     IF coalesce(cardinality(v_expected),0)=0 OR NOT v_assignee=ANY(v_expected) OR EXISTS(SELECT 1 FROM unnest(v_expected) u(id) WHERE NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=u.id AND status='active' AND role IN ('superadmin','admin','colaborador'))) THEN RAISE EXCEPTION 'Confira os responsáveis antes de aprovar.' USING ERRCODE='22023'; END IF;
   END IF;
   v_function:=nullif(p_data->>'operational_function_id','')::uuid;
   IF v_function IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.task_operational_functions WHERE id=v_function AND is_active AND v_assignee=ANY(assignee_ids)) THEN RAISE EXCEPTION 'A função ou o responsável mudou. Recalcule antes de aprovar.' USING ERRCODE='PT409'; END IF;
   IF v_project IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.projetos WHERE id=v_project AND client_id=d.client_id) THEN RAISE EXCEPTION 'Projeto de outro cliente.'; END IF;
   IF v_type NOT IN ('interno','paid_traffic','onboarding','video','arte','carrossel','social_media','post') THEN RAISE EXCEPTION 'Tipo de tarefa inválido.'; END IF;
   PERFORM pg_advisory_xact_lock(hashtextextended(d.client_id::text||lower(v_title),0));
   IF EXISTS(SELECT 1 FROM public.tarefas x LEFT JOIN public.task_statuses s ON s.value=x.status WHERE x.client_id=d.client_id AND lower(btrim(x.title)) IN (lower(v_title),lower(substr(v_title,char_length(v_context->'client'->>'name')+4))) AND NOT coalesce(s.is_terminal,false)) THEN RAISE EXCEPTION 'Já existe tarefa aberta com esse título. Revise ou vincule a existente.'; END IF;
   SELECT value INTO v_initial FROM public.task_statuses WHERE is_initial AND NOT is_terminal ORDER BY sort_order,id LIMIT 1;
   IF v_initial IS NULL THEN RAISE EXCEPTION 'Status inicial não configurado.'; END IF;
   INSERT INTO public.tarefas(title,description,status,client_id,project_id,owner_id,type,priority,due_date,assignee_ids,operational_function_id,status_history)
    VALUES(v_title,v_text,v_initial,d.client_id,v_project,v_actor,v_type,'medium',nullif(p_data->>'due_date','')::date,v_expected,v_function,jsonb_build_array(jsonb_build_object('status',v_initial,'assignee_ids',v_expected,'user_id',v_actor,'timestamp',now(),'source','atlas_approved_demand','demand_id',d.id))) RETURNING * INTO t;
   IF v_schedule IS NOT NULL AND ((SELECT array_agg(id ORDER BY id) FROM unnest(t.assignee_ids) u(id)) IS DISTINCT FROM (SELECT array_agg(id ORDER BY id) FROM unnest(v_expected) u(id)) OR t.due_date IS DISTINCT FROM nullif(p_data->>'due_date','')::date) THEN RAISE EXCEPTION 'O fluxo alteraria os responsáveis ou o prazo revisados. Confira a configuração antes de aprovar.' USING ERRCODE='PT409'; END IF;
 ELSE RAISE EXCEPTION 'Escolha criar, vincular ou transferir uma tarefa.';
 END IF;
 INSERT INTO public.task_comments(task_id,user_id,content,pendencia_caixa,origem) VALUES(t.id,v_actor,'Repasse aprovado pelo dono no Atlas: '||v_text,true,'gestor');
 UPDATE public.atlas_demands SET state='linked',task_id=t.id,approved_at=now(),revision=revision+1,updated_at=now() WHERE id=d.id RETURNING * INTO d;
 INSERT INTO public.atlas_demand_events(demand_id,actor_id,kind,body) VALUES(d.id,v_actor,'approved',CASE v_mode WHEN 'new' THEN 'Tarefa criada e encaminhada após aprovação.' WHEN 'reassign' THEN 'Transferência aprovada; histórico da tarefa preservado.' ELSE 'Tarefa existente vinculada; repasse registrado.' END);
 RETURN jsonb_build_object('demand',to_jsonb(d),'task',to_jsonb(t),'created',v_mode='new','replayed',false);
END $$;

NOTIFY pgrst,'reload schema';

-- Derived from validated pilot: 20261016005611_atlas_task_followup.sql
-- Structured execution updates share the canonical task comment. No task mutation.

CREATE INDEX IF NOT EXISTS atlas_demands_task ON public.atlas_demands(task_id) WHERE task_id IS NOT NULL;
CREATE TABLE public.atlas_task_updates (
 id uuid PRIMARY KEY, task_id uuid NOT NULL REFERENCES public.tarefas(id) ON DELETE CASCADE,
 comment_id uuid NOT NULL UNIQUE REFERENCES public.task_comments(id) ON DELETE CASCADE,
 actor_id uuid NOT NULL REFERENCES public.profiles(id),
 kind text NOT NULL CHECK(kind IN ('received','progress','blocked','needs_owner','delivered','owner_reply')),
 reply_to uuid REFERENCES public.atlas_task_updates(id), created_at timestamptz NOT NULL DEFAULT now(),
 CHECK((kind='owner_reply')=(reply_to IS NOT NULL))
);
CREATE INDEX atlas_task_updates_task ON public.atlas_task_updates(task_id,created_at,id);
CREATE UNIQUE INDEX atlas_task_updates_one_reply ON public.atlas_task_updates(reply_to) WHERE reply_to IS NOT NULL;
ALTER TABLE public.atlas_task_updates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.atlas_task_updates FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.atlas_task_updates TO authenticated;
GRANT ALL ON public.atlas_task_updates TO service_role;

CREATE FUNCTION private.atlas_followup_access(p_task uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT auth.uid() IS NOT NULL AND private.planeje_live_session()
 AND auth.jwt()->>'planeje_server_delegate' IS NULL
 AND EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND status='active' AND role IN ('superadmin','admin','colaborador'))
 AND EXISTS(SELECT 1 FROM public.tarefas t WHERE t.id=p_task AND (private.atlas_demand_owner() OR auth.uid()=ANY(t.assignee_ids)));
$$;
CREATE POLICY atlas_task_updates_read ON public.atlas_task_updates FOR SELECT TO authenticated USING(private.atlas_followup_access(task_id));

CREATE FUNCTION private.atlas_followup_context(p_task uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE t public.tarefas; v_owner uuid; v_manager boolean;
BEGIN
 IF NOT private.atlas_followup_access(p_task) THEN RAISE EXCEPTION 'Tarefa indisponível para esta sessão.' USING ERRCODE='42501'; END IF;
 SELECT * INTO t FROM public.tarefas WHERE id=p_task;
 v_manager:=private.atlas_demand_owner();
 SELECT owner_id INTO v_owner FROM public.atlas_demands WHERE task_id=p_task AND state='linked' ORDER BY created_at,id LIMIT 1;
 RETURN jsonb_build_object('manager',v_manager,'watching',v_owner IS NOT NULL,'owner_id',v_owner,
 'task',jsonb_build_object('id',t.id,'client_id',t.client_id,'title',t.title,'status',t.status,'due_date',t.due_date,'assignee_ids',t.assignee_ids,'task_hash',md5(to_jsonb(t)::text)),
 'status',(SELECT jsonb_build_object('value',s.value,'label',s.label,'is_terminal',s.is_terminal) FROM public.task_statuses s WHERE s.value=t.status),
 'people',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'full_name',p.full_name)),'[]') FROM public.profiles p WHERE p.id=ANY(t.assignee_ids) OR p.id=v_owner),
 'updates',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',u.id,'task_id',u.task_id,'actor_id',u.actor_id,'kind',u.kind,'reply_to',u.reply_to,'comment_id',u.comment_id,'created_at',u.created_at,'content',c.content,'author',p.full_name) ORDER BY u.created_at,u.id),'[]') FROM public.atlas_task_updates u JOIN public.task_comments c ON c.id=u.comment_id LEFT JOIN public.profiles p ON p.id=u.actor_id WHERE u.task_id=p_task),
 'queried_at',now());
END $$;
CREATE FUNCTION public.atlas_task_followup_context(p_task uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$ SELECT private.atlas_followup_context(p_task); $$;

CREATE FUNCTION private.atlas_followup_watch(p_task uuid,p_hash text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE t public.tarefas; d public.atlas_demands;
BEGIN
 IF NOT private.atlas_demand_owner() OR NOT private.atlas_followup_access(p_task) THEN RAISE EXCEPTION 'Acompanhamento exclusivo do dono em sessão ativa.' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text||p_task::text,0));
 SELECT * INTO d FROM public.atlas_demands WHERE owner_id=auth.uid() AND task_id=p_task AND state='linked' ORDER BY created_at,id LIMIT 1;
 IF d.id IS NOT NULL THEN RETURN jsonb_build_object('demand',to_jsonb(d),'replayed',true); END IF;
 SELECT * INTO t FROM public.tarefas WHERE id=p_task FOR SHARE;
 IF md5(to_jsonb(t)::text) IS DISTINCT FROM p_hash THEN RAISE EXCEPTION 'A tarefa mudou. Atualize antes de acompanhar.' USING ERRCODE='PT409'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.clientes WHERE id=t.client_id AND etapa='closed') THEN RAISE EXCEPTION 'Cliente fora da carteira atual.'; END IF;
 INSERT INTO public.atlas_demands(owner_id,client_id,request_id,title,context,state,task_id,proposal)
 VALUES(auth.uid(),t.client_id,gen_random_uuid(),left(t.title,180),coalesce(nullif(left(btrim(t.description),12000),''),'Acompanhar o andamento registrado na tarefa existente.'),'linked',t.id,jsonb_build_object('source','existing_task_watch')) RETURNING * INTO d;
 INSERT INTO public.atlas_demand_events(demand_id,actor_id,kind,body) VALUES(d.id,auth.uid(),'tracking_started','Acompanhamento da tarefa existente iniciado pelo dono. Responsáveis, prazo e execução preservados.');
 RETURN jsonb_build_object('demand',to_jsonb(d),'replayed',false);
END $$;
CREATE FUNCTION public.atlas_task_followup_watch(p_task uuid,p_hash text) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.atlas_followup_watch(p_task,p_hash); $$;

CREATE FUNCTION private.atlas_followup_update(p_task uuid,p_kind text,p_text text,p_id uuid,p_reply_to uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE t public.tarefas; old public.atlas_task_updates; target public.atlas_task_updates; v_text text:=btrim(p_text); v_label text; v_content text;
BEGIN
 IF NOT private.atlas_followup_access(p_task) THEN RAISE EXCEPTION 'Tarefa indisponível para esta sessão.' USING ERRCODE='42501'; END IF;
 IF p_id IS NULL OR coalesce(char_length(v_text),0) NOT BETWEEN 1 AND 4000 THEN RAISE EXCEPTION 'Informe a atualização em até 4.000 caracteres.'; END IF;
 IF p_kind IS NULL OR p_kind NOT IN ('received','progress','blocked','needs_owner','delivered','owner_reply') THEN RAISE EXCEPTION 'Tipo de atualização inválido.'; END IF;
 v_label:=CASE p_kind WHEN 'received' THEN 'Recebimento confirmado' WHEN 'progress' THEN 'Andamento' WHEN 'blocked' THEN 'Impedimento' WHEN 'needs_owner' THEN 'Decisão do dono' WHEN 'delivered' THEN 'Entrega para revisão' ELSE 'Resposta do dono' END;
 v_content:='[Atlas · '||v_label||'] '||v_text;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_task::text,0));
 SELECT * INTO old FROM public.atlas_task_updates WHERE id=p_id;
 IF old.id IS NOT NULL THEN
   IF old.task_id<>p_task OR old.actor_id<>auth.uid() OR old.kind<>p_kind OR old.reply_to IS DISTINCT FROM p_reply_to OR NOT EXISTS(SELECT 1 FROM public.task_comments WHERE id=old.comment_id AND content=v_content) THEN RAISE EXCEPTION 'Identificador utilizado por outra atualização.'; END IF;
   RETURN jsonb_build_object('ok',true,'comment_id',old.comment_id,'replayed',true);
 END IF;
 SELECT * INTO t FROM public.tarefas WHERE id=p_task FOR SHARE;
 IF NOT EXISTS(SELECT 1 FROM public.atlas_demands WHERE task_id=p_task AND state='linked') THEN RAISE EXCEPTION 'O dono precisa iniciar o acompanhamento desta tarefa.' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM public.task_statuses WHERE value=t.status AND is_terminal) THEN RAISE EXCEPTION 'Tarefa concluída. Consulte o histórico na tarefa.' USING ERRCODE='PT409'; END IF;
 IF p_kind='owner_reply' THEN
   IF NOT private.atlas_demand_owner() OR NOT EXISTS(SELECT 1 FROM public.atlas_demands WHERE task_id=p_task AND state='linked' AND owner_id=auth.uid()) THEN RAISE EXCEPTION 'Resposta exclusiva do dono.' USING ERRCODE='42501'; END IF;
   SELECT * INTO target FROM public.atlas_task_updates WHERE id=p_reply_to AND task_id=p_task AND kind IN ('needs_owner','blocked','delivered') FOR UPDATE;
   IF target.id IS NULL OR NOT target.actor_id=ANY(t.assignee_ids) THEN RAISE EXCEPTION 'Pedido não pertence à equipe atual desta tarefa.' USING ERRCODE='PT409'; END IF;
   IF EXISTS(SELECT 1 FROM public.atlas_task_updates u WHERE u.reply_to=target.id OR (u.task_id=p_task AND u.actor_id=target.actor_id AND u.kind<>'owner_reply' AND (u.created_at,u.id)>(target.created_at,target.id))) THEN RAISE EXCEPTION 'A equipe já atualizou esse pedido ou ele já foi respondido. Atualize a tela.' USING ERRCODE='PT409'; END IF;
 ELSE
   IF p_reply_to IS NOT NULL OR NOT auth.uid()=ANY(t.assignee_ids) THEN RAISE EXCEPTION 'Atualização exclusiva dos responsáveis atuais.' USING ERRCODE='42501'; END IF;
 END IF;
 INSERT INTO public.task_comments(id,task_id,user_id,content,origem,pendencia_caixa) VALUES(p_id,p_task,auth.uid(),v_content,'comentario',true);
 INSERT INTO public.atlas_task_updates(id,task_id,comment_id,actor_id,kind,reply_to) VALUES(p_id,p_task,p_id,auth.uid(),p_kind,p_reply_to);
 RETURN jsonb_build_object('ok',true,'comment_id',p_id,'replayed',false);
END $$;
CREATE FUNCTION public.atlas_task_followup_update(p_task uuid,p_kind text,p_text text,p_id uuid,p_reply_to uuid DEFAULT NULL) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.atlas_followup_update(p_task,p_kind,p_text,p_id,p_reply_to); $$;

-- Same team queue, with the current assignees needed to avoid reading an ex-assignee's update as current work.
CREATE OR REPLACE FUNCTION private.atlas_demand_team_queue() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT private.planeje_live_session() OR auth.jwt()->>'planeje_server_delegate' IS NOT NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND status='active' AND role IN ('superadmin','admin','colaborador')) THEN RAISE EXCEPTION 'Sessão da equipe necessária.' USING ERRCODE='42501'; END IF;
 RETURN (SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') FROM (SELECT DISTINCT ON (t.id) t.id,t.title,t.description,t.status,t.due_date,t.client_id,t.assignee_ids,c.empresa AS client_name,d.id AS demand_id,d.owner_id,
 (SELECT coalesce(jsonb_agg(jsonb_build_object('id',tc.id,'body',tc.content,'author',p.full_name,'user_id',tc.user_id,'at',tc.created_at) ORDER BY tc.created_at,tc.id),'[]') FROM public.task_comments tc LEFT JOIN public.profiles p ON p.id=tc.user_id WHERE tc.task_id=t.id) AS comments
 FROM public.atlas_demands d JOIN public.tarefas t ON t.id=d.task_id JOIN public.clientes c ON c.id=t.client_id
 WHERE d.state='linked' AND auth.uid()=ANY(t.assignee_ids) ORDER BY t.id,d.created_at DESC LIMIT 200) x);
END $$;

DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) args FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('private','public') AND p.proname IN ('atlas_followup_access','atlas_followup_context','atlas_followup_watch','atlas_followup_update','atlas_task_followup_context','atlas_task_followup_watch','atlas_task_followup_update') LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION %I.%I(%s) FROM PUBLIC,anon',f.nspname,f.proname,f.args);
 EXECUTE format('GRANT EXECUTE ON FUNCTION %I.%I(%s) TO authenticated,service_role',f.nspname,f.proname,f.args);
 END LOOP;
END $$;
NOTIFY pgrst,'reload schema';

ALTER TABLE public.atlas_office_state ADD COLUMN followup_checked_at timestamptz, ADD COLUMN followup_error text;
NOTIFY pgrst,'reload schema';
COMMIT;

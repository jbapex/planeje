BEGIN;

-- Only metadata is exposed. File bodies remain in a separate private Storage bucket.
CREATE TABLE planeje_private.atlas_attachment_manifests (
  owner_id uuid NOT NULL REFERENCES public.profiles(id),
  request_id uuid NOT NULL,
  client_id uuid REFERENCES public.clientes(id),
  requested_conversation_id uuid REFERENCES public.atlas_conversations(id),
  files jsonb NOT NULL,
  run_id uuid UNIQUE REFERENCES public.atlas_runs(id),
  conversation_id uuid REFERENCES public.atlas_conversations(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(owner_id,request_id)
);
REVOKE ALL ON planeje_private.atlas_attachment_manifests FROM PUBLIC,anon,authenticated,service_role;
ALTER TABLE planeje_private.atlas_attachment_manifests ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.atlas_executor_attachments (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES public.profiles(id),
  request_id uuid NOT NULL,
  client_id uuid REFERENCES public.clientes(id),
  conversation_id uuid REFERENCES public.atlas_conversations(id),
  run_id uuid REFERENCES public.atlas_runs(id),
  position integer NOT NULL CHECK(position BETWEEN 1 AND 4),
  path text NOT NULL UNIQUE,
  name text NOT NULL CHECK(length(name) BETWEEN 1 AND 120),
  mime text NOT NULL,
  size integer NOT NULL CHECK(size>0 AND size<=5242880),
  sha256 text NOT NULL CHECK(sha256~'^[a-f0-9]{64}$'),
  state text NOT NULL DEFAULT 'staged' CHECK(state IN('staged','uploaded')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(owner_id,request_id) REFERENCES planeje_private.atlas_attachment_manifests(owner_id,request_id),
  UNIQUE(owner_id,request_id,position)
);
CREATE INDEX atlas_executor_attachment_history ON public.atlas_executor_attachments(owner_id,conversation_id,created_at,id);
ALTER TABLE public.atlas_executor_attachments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.atlas_executor_attachments FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.atlas_executor_attachments TO authenticated;

CREATE FUNCTION private.atlas_squad_attachment_visible(p_owner uuid,p_client uuid) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
  RETURN p_owner=private.atlas_executor_user() AND private.atlas_squad_client_access(p_client);
EXCEPTION WHEN insufficient_privilege THEN RETURN false;
END $$;
REVOKE ALL ON FUNCTION private.atlas_squad_attachment_visible(uuid,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION private.atlas_squad_attachment_visible(uuid,uuid) TO authenticated;
CREATE POLICY atlas_executor_attachment_read ON public.atlas_executor_attachments FOR SELECT TO authenticated
USING(owner_id=(SELECT auth.uid()) AND private.atlas_squad_attachment_visible(owner_id,client_id));

CREATE FUNCTION public.atlas_executor_attachment_stage(p_request uuid,p_client uuid,p_conversation uuid,p_files jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=private.atlas_executor_user();manifest planeje_private.atlas_attachment_manifests;f jsonb;ordinal integer:=0;total bigint:=0;bytes integer;extension text;attachment uuid;seen uuid[]:='{}';answer jsonb;
BEGIN
  IF p_request IS NULL OR NOT private.atlas_squad_client_access(p_client) THEN RAISE insufficient_privilege USING MESSAGE='Marca não autorizada para anexos.'; END IF;
  IF p_files IS NULL OR jsonb_typeof(p_files)<>'array' OR jsonb_array_length(p_files) NOT BETWEEN 1 AND 4 OR octet_length(p_files::text)>12000 THEN
    RAISE invalid_parameter_value USING MESSAGE='Envie de um a quatro anexos válidos.';
  END IF;
  IF p_conversation IS NOT NULL AND NOT EXISTS(SELECT 1 FROM planeje_private.atlas_squad_conversations c WHERE c.conversation_id=p_conversation AND c.owner_id=actor AND c.client_id IS NOT DISTINCT FROM p_client) THEN
    RAISE insufficient_privilege USING MESSAGE='A conversa e a marca dos anexos devem ser exatas.';
  END IF;
  FOR f IN SELECT * FROM jsonb_array_elements(p_files) LOOP
    IF jsonb_typeof(f)<>'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(f) k WHERE k NOT IN('id','name','mime','size','sha256'))
      OR coalesce(f->>'id','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      OR jsonb_typeof(f->'name') IS DISTINCT FROM 'string' OR length(btrim(f->>'name')) NOT BETWEEN 1 AND 120
      OR f->>'name' ~ '[[:cntrl:]/\\]' OR f->>'name' IS DISTINCT FROM btrim(f->>'name')
      OR jsonb_typeof(f->'size') IS DISTINCT FROM 'number' OR coalesce(f->>'size','') !~ '^[1-9][0-9]{0,6}$'
      OR coalesce(f->>'sha256','') !~ '^[a-f0-9]{64}$'
    THEN RAISE invalid_parameter_value USING MESSAGE='Metadados do anexo inválidos.'; END IF;
    attachment:=(f->>'id')::uuid;bytes:=(f->>'size')::integer;
    IF attachment=ANY(seen) THEN RAISE invalid_parameter_value USING MESSAGE='Anexo duplicado.'; END IF;
    seen:=array_append(seen,attachment);total:=total+bytes;
    extension:=CASE f->>'mime' WHEN 'application/pdf' THEN 'pdf' WHEN 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' THEN 'docx'
      WHEN 'text/plain' THEN 'txt' WHEN 'text/markdown' THEN 'md' WHEN 'text/csv' THEN 'csv' WHEN 'image/png' THEN 'png' WHEN 'image/jpeg' THEN 'jpg' WHEN 'image/webp' THEN 'webp' ELSE NULL END;
    IF extension IS NULL OR lower(f->>'name') !~ (CASE WHEN extension='jpg' THEN '\.(jpg|jpeg)$' ELSE '\.'||extension||'$' END)
      OR bytes>(CASE WHEN extension IN('docx','txt','md','csv') THEN 524288 ELSE 5242880 END) OR total>10485760
    THEN RAISE invalid_parameter_value USING MESSAGE='Formato ou tamanho de anexo inválido.'; END IF;
  END LOOP;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor::text||p_request::text,0));
  SELECT * INTO manifest FROM planeje_private.atlas_attachment_manifests m WHERE m.owner_id=actor AND m.request_id=p_request FOR UPDATE;
  IF FOUND THEN
    IF manifest.client_id IS DISTINCT FROM p_client OR manifest.requested_conversation_id IS DISTINCT FROM p_conversation OR manifest.files IS DISTINCT FROM p_files THEN
      RAISE serialization_failure USING MESSAGE='O manifesto, a marca ou a conversa deste pedido foram alterados.';
    END IF;
  ELSE
    IF EXISTS(SELECT 1 FROM public.atlas_runs r WHERE r.owner_id=actor AND r.request_id=p_request) THEN
      RAISE serialization_failure USING MESSAGE='Um pedido iniciado não pode receber novos anexos.';
    END IF;
    INSERT INTO planeje_private.atlas_attachment_manifests(owner_id,request_id,client_id,requested_conversation_id,files) VALUES(actor,p_request,p_client,p_conversation,p_files);
    FOR f IN SELECT * FROM jsonb_array_elements(p_files) LOOP
      ordinal:=ordinal+1;
      extension:=CASE f->>'mime' WHEN 'application/pdf' THEN 'pdf' WHEN 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' THEN 'docx' WHEN 'text/plain' THEN 'txt' WHEN 'text/markdown' THEN 'md' WHEN 'text/csv' THEN 'csv' WHEN 'image/png' THEN 'png' WHEN 'image/jpeg' THEN 'jpg' WHEN 'image/webp' THEN 'webp' END;
      INSERT INTO public.atlas_executor_attachments(id,owner_id,request_id,client_id,position,path,name,mime,size,sha256)
      VALUES((f->>'id')::uuid,actor,p_request,p_client,ordinal,actor::text||'/'||p_request::text||'/'||(f->>'id')||'.'||extension,f->>'name',f->>'mime',(f->>'size')::integer,f->>'sha256');
    END LOOP;
  END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.position),'[]') INTO answer FROM public.atlas_executor_attachments a WHERE a.owner_id=actor AND a.request_id=p_request;
  RETURN answer;
END $$;
REVOKE ALL ON FUNCTION public.atlas_executor_attachment_stage(uuid,uuid,uuid,jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.atlas_executor_attachment_stage(uuid,uuid,uuid,jsonb) TO authenticated;

CREATE FUNCTION private.atlas_squad_bind_attachments(p_run uuid,p_request uuid,p_conversation uuid,p_client uuid,p_attachment_ids uuid[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=private.atlas_executor_user();m planeje_private.atlas_attachment_manifests;actual uuid[];r public.atlas_runs;a public.atlas_executor_attachments;
BEGIN
  IF NOT private.atlas_squad_client_access(p_client) OR p_attachment_ids IS NULL OR cardinality(p_attachment_ids)>4 OR cardinality(p_attachment_ids)<>(SELECT count(DISTINCT x) FROM unnest(p_attachment_ids) x) THEN
    RAISE invalid_parameter_value USING MESSAGE='Identidades dos anexos inválidas.';
  END IF;
  SELECT * INTO r FROM public.atlas_runs WHERE id=p_run AND owner_id=actor FOR UPDATE;
  IF r.id IS NULL OR r.request_id IS DISTINCT FROM p_request OR r.conversation_id IS DISTINCT FROM p_conversation OR r.request_client_id IS DISTINCT FROM p_client
    OR r.source_session_id IS DISTINCT FROM nullif(auth.jwt()->>'session_id','')::uuid
    OR NOT EXISTS(SELECT 1 FROM planeje_private.atlas_squad_runs s WHERE s.run_id=p_run AND s.owner_id=actor AND s.conversation_id=p_conversation AND s.client_id IS NOT DISTINCT FROM p_client)
  THEN RAISE insufficient_privilege USING MESSAGE='Os anexos pertencem à execução e à sessão originais.'; END IF;
  SELECT * INTO m FROM planeje_private.atlas_attachment_manifests WHERE owner_id=actor AND request_id=p_request FOR UPDATE;
  IF NOT FOUND THEN
    IF cardinality(p_attachment_ids)=0 THEN RETURN; END IF;
    RAISE invalid_parameter_value USING MESSAGE='Prepare os anexos antes de iniciar o pedido.';
  END IF;
  SELECT array_agg(id ORDER BY position) INTO actual FROM public.atlas_executor_attachments WHERE owner_id=actor AND request_id=p_request;
  IF actual IS DISTINCT FROM p_attachment_ids OR m.client_id IS DISTINCT FROM p_client OR m.requested_conversation_id IS DISTINCT FROM r.request_conversation_id
    OR m.run_id IS NOT NULL AND (m.run_id IS DISTINCT FROM p_run OR m.conversation_id IS DISTINCT FROM p_conversation)
  THEN RAISE serialization_failure USING MESSAGE='O manifesto de anexos deste pedido foi alterado.'; END IF;
  IF m.run_id IS NOT NULL THEN RETURN; END IF;
  FOR a IN SELECT * FROM public.atlas_executor_attachments WHERE owner_id=actor AND request_id=p_request ORDER BY position FOR UPDATE LOOP
    IF NOT EXISTS(SELECT 1 FROM storage.objects o WHERE o.bucket_id='atlas-executor-attachments' AND o.name=a.path
      AND o.metadata->>'mimetype'=a.mime AND o.metadata->>'size'=a.size::text)
    THEN RAISE invalid_parameter_value USING MESSAGE='Conclua o upload privado de cada anexo antes de iniciar.'; END IF;
  END LOOP;
  UPDATE planeje_private.atlas_attachment_manifests SET run_id=p_run,conversation_id=p_conversation WHERE owner_id=actor AND request_id=p_request;
  UPDATE public.atlas_executor_attachments SET run_id=p_run,conversation_id=p_conversation,state='uploaded' WHERE owner_id=actor AND request_id=p_request;
END $$;
REVOKE ALL ON FUNCTION private.atlas_squad_bind_attachments(uuid,uuid,uuid,uuid,uuid[]) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.atlas_executor_attachment_context(p_run uuid,p_conversation uuid,p_client uuid,p_attachment_ids uuid[] DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=private.atlas_executor_user();r public.atlas_runs;selected_request uuid;answer jsonb;expected integer;
BEGIN
  SELECT * INTO r FROM public.atlas_runs WHERE id=p_run AND owner_id=actor;
  IF r.id IS NULL OR r.conversation_id IS DISTINCT FROM p_conversation OR r.request_client_id IS DISTINCT FROM p_client
    OR r.source_session_id IS DISTINCT FROM nullif(auth.jwt()->>'session_id','')::uuid OR NOT private.atlas_squad_client_access(p_client)
    OR NOT EXISTS(SELECT 1 FROM planeje_private.atlas_squad_runs s WHERE s.run_id=p_run AND s.owner_id=actor AND s.conversation_id=p_conversation AND s.client_id IS NOT DISTINCT FROM p_client)
    OR p_attachment_ids IS NULL OR cardinality(p_attachment_ids)>4 OR cardinality(p_attachment_ids)<>(SELECT count(DISTINCT x) FROM unnest(p_attachment_ids) x)
  THEN RAISE insufficient_privilege USING MESSAGE='A conversa, a marca e a sessão dos anexos devem ser exatas.'; END IF;
  IF cardinality(p_attachment_ids)>0 THEN
    SELECT jsonb_agg(to_jsonb(a) ORDER BY array_position(p_attachment_ids,a.id)),count(*) INTO answer,expected
    FROM public.atlas_executor_attachments a WHERE a.id=ANY(p_attachment_ids) AND a.owner_id=actor AND a.conversation_id=p_conversation AND a.client_id IS NOT DISTINCT FROM p_client AND a.state='uploaded';
    IF expected<>cardinality(p_attachment_ids) THEN RAISE insufficient_privilege USING MESSAGE='Anexo não pertence a esta conversa e marca.'; END IF;
  ELSE
    -- Continue with the latest persisted attachment set, never another client or Office.
    SELECT a.request_id INTO selected_request FROM public.atlas_executor_attachments a JOIN public.atlas_runs origin ON origin.id=a.run_id
    WHERE a.owner_id=actor AND a.conversation_id=p_conversation AND a.client_id IS NOT DISTINCT FROM p_client AND a.state='uploaded' AND origin.created_at<=r.created_at
    ORDER BY origin.created_at DESC,a.position LIMIT 1;
    SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.position),'[]') INTO answer FROM public.atlas_executor_attachments a
    WHERE a.owner_id=actor AND a.request_id=selected_request AND a.conversation_id=p_conversation AND a.client_id IS NOT DISTINCT FROM p_client AND a.state='uploaded';
  END IF;
  RETURN coalesce(answer,'[]');
END $$;
REVOKE ALL ON FUNCTION public.atlas_executor_attachment_context(uuid,uuid,uuid,uuid[]) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.atlas_executor_attachment_context(uuid,uuid,uuid,uuid[]) TO authenticated;

INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES('atlas-executor-attachments','atlas-executor-attachments',false,5242880,ARRAY['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','text/plain','text/markdown','text/csv','image/png','image/jpeg','image/webp']);

CREATE FUNCTION private.atlas_squad_attachment_storage(p_name text,p_write boolean DEFAULT false) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid;a public.atlas_executor_attachments;
BEGIN
  actor:=private.atlas_executor_user();
  SELECT * INTO a FROM public.atlas_executor_attachments WHERE path=p_name AND owner_id=actor;
  RETURN a.id IS NOT NULL AND private.atlas_squad_client_access(a.client_id) AND (NOT p_write OR a.state='staged' AND a.run_id IS NULL);
EXCEPTION WHEN insufficient_privilege THEN RETURN false;
END $$;
REVOKE ALL ON FUNCTION private.atlas_squad_attachment_storage(text,boolean) FROM PUBLIC,service_role;
GRANT EXECUTE ON FUNCTION private.atlas_squad_attachment_storage(text,boolean) TO anon,authenticated;
CREATE POLICY atlas_executor_attachment_object_read ON storage.objects FOR SELECT TO authenticated
USING(bucket_id='atlas-executor-attachments' AND private.atlas_squad_attachment_storage(name,false));
CREATE POLICY atlas_executor_attachment_object_insert ON storage.objects FOR INSERT TO authenticated
WITH CHECK(bucket_id='atlas-executor-attachments' AND private.atlas_squad_attachment_storage(name,true));
CREATE POLICY atlas_executor_attachment_object_read_guard ON storage.objects AS RESTRICTIVE FOR SELECT TO anon,authenticated
USING(bucket_id<>'atlas-executor-attachments' OR private.atlas_squad_attachment_storage(name,false));
CREATE POLICY atlas_executor_attachment_object_insert_guard ON storage.objects AS RESTRICTIVE FOR INSERT TO anon,authenticated
WITH CHECK(bucket_id<>'atlas-executor-attachments' OR private.atlas_squad_attachment_storage(name,true));
CREATE POLICY atlas_executor_attachment_object_no_update ON storage.objects AS RESTRICTIVE FOR UPDATE TO anon,authenticated
USING(bucket_id<>'atlas-executor-attachments') WITH CHECK(bucket_id<>'atlas-executor-attachments');
CREATE POLICY atlas_executor_attachment_object_no_delete ON storage.objects AS RESTRICTIVE FOR DELETE TO anon,authenticated
USING(bucket_id<>'atlas-executor-attachments');

COMMIT;

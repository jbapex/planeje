-- Atlas personal workspace. Local candidate only: do not apply without deployment scope.
-- Owner is provisioned deliberately by the operator using an existing profiles UUID.
-- No name/email inference, browser enrollment, automatic enablement or legacy ACL changes.
BEGIN;

CREATE TABLE public.atlas_settings (
  id text PRIMARY KEY CHECK (id = 'atlas'),
  owner_id uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (NOT enabled OR owner_id IS NOT NULL)
);
INSERT INTO public.atlas_settings (id) VALUES ('atlas');
ALTER TABLE public.atlas_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.atlas_settings FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.atlas_settings TO authenticated;
GRANT ALL ON public.atlas_settings TO service_role;
CREATE POLICY atlas_settings_owner_read ON public.atlas_settings FOR SELECT TO authenticated
  USING (owner_id = (SELECT auth.uid()));

-- Invoker privileges: reading settings respects its owner-only policy; no SECURITY DEFINER.
CREATE FUNCTION public.atlas_is_owner() RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.atlas_settings s
    JOIN public.profiles p ON p.id = s.owner_id
    WHERE s.id = 'atlas' AND s.enabled AND s.owner_id = auth.uid()
      AND p.status = 'active' AND p.role IN ('superadmin', 'admin', 'colaborador')
  );
$$;
REVOKE ALL ON FUNCTION public.atlas_is_owner() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.atlas_is_owner() TO authenticated, service_role;

CREATE TABLE public.atlas_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  client_id uuid REFERENCES public.clientes(id) ON DELETE RESTRICT,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, owner_id)
);
CREATE TABLE public.atlas_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  conversation_id uuid,
  request_conversation_id uuid,
  request_client_id uuid,
  request_message text NOT NULL CHECK (char_length(request_message) BETWEEN 1 AND 12000),
  status text NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'failed')),
  steps jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(steps) = 'array'),
  usage jsonb NOT NULL DEFAULT '{}'::jsonb,
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  FOREIGN KEY (conversation_id, owner_id) REFERENCES public.atlas_conversations(id, owner_id) ON DELETE CASCADE,
  UNIQUE (owner_id, request_id),
  UNIQUE (id, conversation_id, owner_id)
);
CREATE UNIQUE INDEX atlas_one_processing_conversation ON public.atlas_runs (conversation_id)
  WHERE status = 'processing' AND conversation_id IS NOT NULL;
CREATE INDEX atlas_runs_owner_created ON public.atlas_runs (owner_id, created_at DESC);
CREATE TABLE public.atlas_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL,
  run_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 20000),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (conversation_id, owner_id) REFERENCES public.atlas_conversations(id, owner_id) ON DELETE CASCADE,
  FOREIGN KEY (run_id, conversation_id, owner_id) REFERENCES public.atlas_runs(id, conversation_id, owner_id) ON DELETE CASCADE,
  UNIQUE (run_id, role)
);
CREATE INDEX atlas_messages_conversation_created ON public.atlas_messages (conversation_id, created_at);
CREATE INDEX atlas_conversations_owner_updated ON public.atlas_conversations (owner_id, updated_at DESC);

CREATE TABLE public.atlas_memories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  client_id uuid REFERENCES public.clientes(id) ON DELETE RESTRICT,
  content text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 4000),
  source text NOT NULL DEFAULT 'user_confirmation' CHECK (source = 'user_confirmation'),
  state text NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'replaced', 'revoked')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  replaces_id uuid REFERENCES public.atlas_memories(id) ON DELETE RESTRICT,
  confirmed_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX atlas_memories_owner_scope ON public.atlas_memories (owner_id, client_id, state);

DO $$
DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['atlas_conversations', 'atlas_runs', 'atlas_messages', 'atlas_memories'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', tbl);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON public.%I TO authenticated', tbl);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', tbl);
    EXECUTE format('CREATE POLICY atlas_owner_select ON public.%I FOR SELECT TO authenticated USING (owner_id = (SELECT auth.uid()) AND (SELECT public.atlas_is_owner()))', tbl);
    EXECUTE format('CREATE POLICY atlas_owner_insert ON public.%I FOR INSERT TO authenticated WITH CHECK (owner_id = (SELECT auth.uid()) AND (SELECT public.atlas_is_owner()))', tbl);
    EXECUTE format('CREATE POLICY atlas_owner_update ON public.%I FOR UPDATE TO authenticated USING (owner_id = (SELECT auth.uid()) AND (SELECT public.atlas_is_owner())) WITH CHECK (owner_id = (SELECT auth.uid()) AND (SELECT public.atlas_is_owner()))', tbl);
  END LOOP;
END $$;

-- Prevent callers from rewriting scope/identity/history through direct Data API updates.
CREATE FUNCTION public.atlas_record_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF NEW.owner_id IS DISTINCT FROM OLD.owner_id OR NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'ATLAS_IMMUTABLE_OWNER' USING ERRCODE = '42501';
  END IF;
  IF TG_TABLE_NAME = 'atlas_conversations' THEN
    IF NEW.client_id IS DISTINCT FROM OLD.client_id THEN
      RAISE EXCEPTION 'ATLAS_IMMUTABLE_SCOPE' USING ERRCODE = '42501';
    END IF;
  ELSIF TG_TABLE_NAME = 'atlas_memories' THEN
    IF NEW.client_id IS DISTINCT FROM OLD.client_id OR NEW.content IS DISTINCT FROM OLD.content
      OR NEW.version IS DISTINCT FROM OLD.version OR NEW.replaces_id IS DISTINCT FROM OLD.replaces_id
      OR NEW.source IS DISTINCT FROM OLD.source OR NEW.confirmed_at IS DISTINCT FROM OLD.confirmed_at THEN
      RAISE EXCEPTION 'ATLAS_MEMORY_NEW_VERSION_REQUIRED' USING ERRCODE = '42501';
    END IF;
    IF OLD.state <> 'active' AND NEW.state IS DISTINCT FROM OLD.state THEN
      RAISE EXCEPTION 'ATLAS_MEMORY_TERMINAL' USING ERRCODE = '42501';
    END IF;
  ELSIF TG_TABLE_NAME = 'atlas_runs' THEN
    IF NEW.request_id IS DISTINCT FROM OLD.request_id OR NEW.request_message IS DISTINCT FROM OLD.request_message
      OR NEW.request_client_id IS DISTINCT FROM OLD.request_client_id
      OR NEW.request_conversation_id IS DISTINCT FROM OLD.request_conversation_id
      OR (OLD.conversation_id IS NOT NULL AND NEW.conversation_id IS DISTINCT FROM OLD.conversation_id)
      OR (OLD.status <> 'processing' AND NEW IS DISTINCT FROM OLD) THEN
      RAISE EXCEPTION 'ATLAS_IMMUTABLE_REQUEST' USING ERRCODE = '42501';
    END IF;
  ELSIF TG_TABLE_NAME = 'atlas_messages' AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'ATLAS_IMMUTABLE_MESSAGE' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.atlas_record_guard() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER atlas_conversation_guard BEFORE UPDATE ON public.atlas_conversations FOR EACH ROW EXECUTE FUNCTION public.atlas_record_guard();
CREATE TRIGGER atlas_run_guard BEFORE UPDATE ON public.atlas_runs FOR EACH ROW EXECUTE FUNCTION public.atlas_record_guard();
CREATE TRIGGER atlas_message_guard BEFORE UPDATE ON public.atlas_messages FOR EACH ROW EXECUTE FUNCTION public.atlas_record_guard();
CREATE TRIGGER atlas_memory_guard BEFORE UPDATE ON public.atlas_memories FOR EACH ROW EXECUTE FUNCTION public.atlas_record_guard();

CREATE FUNCTION public.atlas_claim_run(p_request_id uuid, p_conversation_id uuid, p_client_id uuid, p_message text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE r public.atlas_runs; c public.atlas_conversations; claimed boolean;
BEGIN
  IF NOT public.atlas_is_owner() THEN RAISE EXCEPTION 'ATLAS_FORBIDDEN' USING ERRCODE = '42501'; END IF;
  IF p_request_id IS NULL OR p_message IS NULL OR char_length(btrim(p_message)) NOT BETWEEN 1 AND 12000 THEN
    RAISE EXCEPTION 'ATLAS_INVALID_INPUT' USING ERRCODE = '22023';
  END IF;
  IF p_client_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.clientes WHERE id = p_client_id) THEN
    RAISE EXCEPTION 'ATLAS_CLIENT_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.atlas_runs(owner_id, request_id, request_conversation_id, request_client_id, request_message)
    VALUES(auth.uid(), p_request_id, p_conversation_id, p_client_id, btrim(p_message))
    ON CONFLICT (owner_id, request_id) DO NOTHING RETURNING * INTO r;
  claimed := FOUND;
  IF NOT claimed THEN
    SELECT * INTO STRICT r FROM public.atlas_runs WHERE owner_id = auth.uid() AND request_id = p_request_id;
    IF r.request_conversation_id IS DISTINCT FROM p_conversation_id OR r.request_client_id IS DISTINCT FROM p_client_id
      OR r.request_message IS DISTINCT FROM btrim(p_message) THEN
      RAISE EXCEPTION 'ATLAS_REQUEST_CONFLICT' USING ERRCODE = '22023';
    END IF;
    RETURN jsonb_build_object('claimed', false, 'run', to_jsonb(r));
  END IF;
  IF p_conversation_id IS NULL THEN
    INSERT INTO public.atlas_conversations(owner_id, client_id, title)
      VALUES (auth.uid(), p_client_id, left(btrim(p_message), 100)) RETURNING * INTO c;
  ELSE
    SELECT * INTO c FROM public.atlas_conversations WHERE id = p_conversation_id AND owner_id = auth.uid() FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'ATLAS_CONVERSATION_FORBIDDEN' USING ERRCODE = '42501'; END IF;
    IF c.client_id IS DISTINCT FROM p_client_id THEN RAISE EXCEPTION 'ATLAS_SCOPE_CONFLICT' USING ERRCODE = '22023'; END IF;
    IF EXISTS (SELECT 1 FROM public.atlas_runs WHERE conversation_id = c.id AND status = 'processing') THEN
      RAISE EXCEPTION 'ATLAS_CONVERSATION_BUSY' USING ERRCODE = '55000';
    END IF;
  END IF;
  UPDATE public.atlas_runs SET conversation_id = c.id WHERE id = r.id RETURNING * INTO r;
  INSERT INTO public.atlas_messages(owner_id, conversation_id, run_id, role, content)
    VALUES (auth.uid(), c.id, r.id, 'user', btrim(p_message));
  UPDATE public.atlas_conversations SET updated_at = now() WHERE id = c.id;
  RETURN jsonb_build_object('claimed', true, 'run', to_jsonb(r));
END;
$$;

CREATE FUNCTION public.atlas_finish_run(p_run_id uuid, p_status text, p_content text, p_steps jsonb, p_usage jsonb, p_error text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE r public.atlas_runs;
BEGIN
  IF NOT public.atlas_is_owner() THEN RAISE EXCEPTION 'ATLAS_FORBIDDEN' USING ERRCODE = '42501'; END IF;
  IF p_status IS NULL OR p_status NOT IN ('completed', 'failed') THEN RAISE EXCEPTION 'ATLAS_INVALID_STATUS'; END IF;
  SELECT * INTO r FROM public.atlas_runs WHERE id = p_run_id AND owner_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ATLAS_RUN_FORBIDDEN' USING ERRCODE = '42501'; END IF;
  IF r.status <> 'processing' THEN RETURN to_jsonb(r); END IF;
  IF p_status = 'completed' THEN
    IF p_content IS NULL OR char_length(btrim(p_content)) NOT BETWEEN 1 AND 20000 THEN RAISE EXCEPTION 'ATLAS_INVALID_REPLY'; END IF;
    INSERT INTO public.atlas_messages(owner_id, conversation_id, run_id, role, content)
      VALUES(auth.uid(), r.conversation_id, r.id, 'assistant', p_content);
  END IF;
  UPDATE public.atlas_runs SET status = p_status, steps = COALESCE(p_steps, r.steps), usage = COALESCE(p_usage, r.usage),
    result = CASE WHEN p_status = 'completed' THEN jsonb_build_object('content', p_content) ELSE '{}'::jsonb END,
    error = CASE WHEN p_status = 'failed' THEN left(COALESCE(p_error, 'Consulta não concluída.'), 500) ELSE NULL END,
    updated_at = now(), finished_at = now() WHERE id = r.id RETURNING * INTO r;
  UPDATE public.atlas_conversations SET updated_at = now() WHERE id = r.conversation_id;
  RETURN to_jsonb(r);
END;
$$;

CREATE FUNCTION public.atlas_save_memory(p_content text, p_client_id uuid, p_confirmed boolean, p_replaces_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE previous public.atlas_memories; saved public.atlas_memories; v integer := 1;
BEGIN
  IF NOT public.atlas_is_owner() THEN RAISE EXCEPTION 'ATLAS_FORBIDDEN' USING ERRCODE = '42501'; END IF;
  IF p_confirmed IS DISTINCT FROM true OR p_content IS NULL OR char_length(btrim(p_content)) NOT BETWEEN 1 AND 4000 THEN
    RAISE EXCEPTION 'ATLAS_MEMORY_CONFIRM_REQUIRED' USING ERRCODE = '22023';
  END IF;
  IF p_client_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.clientes WHERE id = p_client_id) THEN
    RAISE EXCEPTION 'ATLAS_CLIENT_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  IF p_replaces_id IS NOT NULL THEN
    SELECT * INTO previous FROM public.atlas_memories WHERE id = p_replaces_id AND owner_id = auth.uid() FOR UPDATE;
    IF NOT FOUND OR previous.state <> 'active' OR previous.client_id IS DISTINCT FROM p_client_id THEN
      RAISE EXCEPTION 'ATLAS_MEMORY_CONFLICT' USING ERRCODE = '22023';
    END IF;
    UPDATE public.atlas_memories SET state = 'replaced' WHERE id = previous.id;
    v := previous.version + 1;
  END IF;
  INSERT INTO public.atlas_memories(owner_id, client_id, content, version, replaces_id)
    VALUES(auth.uid(), p_client_id, btrim(p_content), v, p_replaces_id) RETURNING * INTO saved;
  RETURN to_jsonb(saved);
END;
$$;

REVOKE ALL ON FUNCTION public.atlas_claim_run(uuid, uuid, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.atlas_finish_run(uuid, text, text, jsonb, jsonb, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.atlas_save_memory(text, uuid, boolean, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.atlas_claim_run(uuid, uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.atlas_finish_run(uuid, text, text, jsonb, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.atlas_save_memory(text, uuid, boolean, uuid) TO authenticated;

COMMENT ON TABLE public.atlas_settings IS 'Atlas pessoal: dono UUID configurado no servidor; nasce desligado e sem inscrição pelo navegador.';
COMMENT ON TABLE public.atlas_memories IS 'Memórias privadas confirmadas; correção cria versão por RPC transacional. Sem embeddings.';
COMMENT ON TABLE public.atlas_runs IS 'Consulta e rascunho com deduplicação request_id. Não executa tarefas nem envia mensagens externas.';
COMMIT;

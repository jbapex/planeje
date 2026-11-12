BEGIN;

CREATE TABLE public.cs_ia_churn (
  id uuid PRIMARY KEY,
  client_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  closed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  reason text NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 1000 AND reason ~ '[^[:space:]]')
);

CREATE INDEX cs_ia_churn_client_idx ON public.cs_ia_churn (client_id);
ALTER TABLE public.cs_ia_churn ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.cs_ia_churn FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.cs_ia_churn TO authenticated;

CREATE POLICY cs_ia_churn_read ON public.cs_ia_churn FOR SELECT TO authenticated
  USING ((SELECT private.cs_ia_role()) IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.clientes c
    WHERE c.id = cs_ia_churn.client_id AND private.cs_ia_client_scope(c.responsavel::text)
  ));

CREATE TABLE private.cs_ia_churn_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id xid8 NOT NULL DEFAULT pg_current_xact_id(),
  actor_id uuid NOT NULL,
  client_id uuid NOT NULL,
  reason text NOT NULL,
  UNIQUE (transaction_id, actor_id, client_id)
);
REVOKE ALL ON TABLE private.cs_ia_churn_intents FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION private.cs_ia_prepare_churn(p_client_id uuid, p_reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  event_id uuid;
  reason text := regexp_replace(coalesce(p_reason, ''), '^[[:space:]]+|[[:space:]]+$', '', 'g');
BEGIN
  IF NOT coalesce(private.cs_ia_role() IN ('admin', 'superadmin'), false) THEN
    RAISE EXCEPTION 'Acesso não autorizado.' USING ERRCODE = '42501';
  END IF;
  IF char_length(reason) NOT BETWEEN 1 AND 1000 THEN
    RAISE EXCEPTION 'Informe um motivo de até 1.000 caracteres.' USING ERRCODE = '22023';
  END IF;
  IF p_client_id IS NULL THEN
    RAISE EXCEPTION 'O cliente não está ativo ou não pode ser alterado.';
  END IF;

  INSERT INTO private.cs_ia_churn_intents (actor_id, client_id, reason)
    VALUES (auth.uid(), p_client_id, reason) RETURNING id INTO event_id;
  RETURN event_id;
END;
$$;

REVOKE ALL ON FUNCTION private.cs_ia_prepare_churn(uuid, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.cs_ia_prepare_churn(uuid, text) TO authenticated;

-- A escrita privilegiada apenas registra a transição que o UPDATE já autorizou por RLS.
CREATE FUNCTION private.cs_ia_capture_churn()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  request private.cs_ia_churn_intents%ROWTYPE;
BEGIN
  DELETE FROM private.cs_ia_churn_intents
    WHERE transaction_id = pg_current_xact_id_if_assigned() AND actor_id = auth.uid() AND client_id = NEW.id
    RETURNING * INTO request;
  IF FOUND AND coalesce(private.cs_ia_role() IN ('admin', 'superadmin'), false)
    AND private.cs_ia_client_scope(OLD.responsavel::text) THEN
    INSERT INTO public.cs_ia_churn (id, client_id, reason) VALUES (request.id, NEW.id, request.reason);
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION private.cs_ia_capture_churn() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER cs_ia_capture_churn AFTER UPDATE OF etapa ON public.clientes
  FOR EACH ROW WHEN (OLD.etapa = 'closed' AND NEW.etapa = 'lost') EXECUTE FUNCTION private.cs_ia_capture_churn();

CREATE FUNCTION private.cs_ia_discard_churn_intent()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  DELETE FROM private.cs_ia_churn_intents WHERE id = NEW.id;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION private.cs_ia_discard_churn_intent() FROM PUBLIC, anon, authenticated, service_role;
CREATE CONSTRAINT TRIGGER cs_ia_discard_churn_intent AFTER INSERT ON private.cs_ia_churn_intents
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION private.cs_ia_discard_churn_intent();

CREATE FUNCTION public.cs_ia_close_relationship(p_client_id uuid, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  event_id uuid;
  result jsonb;
BEGIN
  event_id := private.cs_ia_prepare_churn(p_client_id, p_reason);
  UPDATE public.clientes c SET etapa = 'lost'
    WHERE c.id = p_client_id AND c.etapa = 'closed' AND private.cs_ia_client_scope(c.responsavel::text);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'O cliente não está ativo ou não pode ser alterado.';
  END IF;

  SELECT to_jsonb(e) INTO STRICT result FROM public.cs_ia_churn e WHERE e.id = event_id AND e.client_id = p_client_id;
  RETURN result;
END;
$$;

CREATE FUNCTION public.cs_ia_churn_list()
RETURNS TABLE (id uuid, client_id uuid, client_name text, closed_at timestamptz, reason text, current_stage text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT e.id, e.client_id, c.empresa::text, e.closed_at, e.reason, c.etapa::text
  FROM public.cs_ia_churn e JOIN public.clientes c ON c.id = e.client_id
  ORDER BY e.closed_at DESC, e.id DESC;
$$;

REVOKE ALL ON FUNCTION public.cs_ia_close_relationship(uuid, text), public.cs_ia_churn_list()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cs_ia_close_relationship(uuid, text), public.cs_ia_churn_list() TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;

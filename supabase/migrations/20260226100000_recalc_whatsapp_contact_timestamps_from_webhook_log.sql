-- =====================================================
-- Corrige first_seen_at / last_message_at dos contatos existentes
-- a partir do log de webhooks (min = primeira mensagem, max = última).
-- Também expõe função RPC para reexecutar por cliente.
-- =====================================================

UPDATE public.cliente_whatsapp_contact c
SET
  first_seen_at = LEAST(c.first_seen_at, s.first_ts),
  last_message_at = GREATEST(c.last_message_at, s.last_ts),
  updated_at = now()
FROM (
  SELECT
    cliente_id,
    from_jid,
    min(created_at) AS first_ts,
    max(created_at) AS last_ts
  FROM public.cliente_whatsapp_webhook_log
  WHERE from_jid IS NOT NULL
    AND btrim(from_jid) <> ''
    AND btrim(from_jid) <> 'unknown'
  GROUP BY cliente_id, from_jid
) s
WHERE c.cliente_id = s.cliente_id
  AND c.from_jid = s.from_jid;

CREATE OR REPLACE FUNCTION public.recalc_whatsapp_contact_timestamps_from_webhook_log(p_cliente_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n integer;
  cid uuid;
  r text;
BEGIN
  SELECT p.role INTO r FROM public.profiles p WHERE p.id = auth.uid();
  IF r IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  IF r IN ('superadmin', 'admin', 'colaborador') THEN
    IF p_cliente_id IS NULL THEN
      RAISE EXCEPTION 'Informe o cliente (cliente_id)';
    END IF;
    cid := p_cliente_id;
  ELSIF r = 'cliente' THEN
    SELECT p.cliente_id INTO cid FROM public.profiles p WHERE p.id = auth.uid();
    IF cid IS NULL THEN
      RAISE EXCEPTION 'Cliente não vinculado ao perfil';
    END IF;
    IF cid IS DISTINCT FROM p_cliente_id THEN
      RAISE EXCEPTION 'Acesso negado';
    END IF;
  ELSE
    RAISE EXCEPTION 'Sem permissão';
  END IF;

  WITH stats AS (
    SELECT
      w.cliente_id,
      w.from_jid,
      min(w.created_at) AS first_ts,
      max(w.created_at) AS last_ts
    FROM public.cliente_whatsapp_webhook_log w
    WHERE w.cliente_id = cid
      AND w.from_jid IS NOT NULL
      AND btrim(w.from_jid) <> ''
      AND btrim(w.from_jid) <> 'unknown'
    GROUP BY w.cliente_id, w.from_jid
  )
  UPDATE public.cliente_whatsapp_contact c
  SET
    first_seen_at = LEAST(c.first_seen_at, s.first_ts),
    last_message_at = GREATEST(c.last_message_at, s.last_ts),
    updated_at = now()
  FROM stats s
  WHERE c.cliente_id = s.cliente_id
    AND c.from_jid = s.from_jid
    AND c.cliente_id = cid;

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN COALESCE(n, 0);
END;
$$;

COMMENT ON FUNCTION public.recalc_whatsapp_contact_timestamps_from_webhook_log(uuid) IS
  'Recalcula primeira/última mensagem dos contatos a partir do log (LEAST/GREATEST). Um cliente_id por chamada.';

REVOKE ALL ON FUNCTION public.recalc_whatsapp_contact_timestamps_from_webhook_log(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.recalc_whatsapp_contact_timestamps_from_webhook_log(uuid) TO authenticated;

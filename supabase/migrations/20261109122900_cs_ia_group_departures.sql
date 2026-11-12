BEGIN;

CREATE TABLE private.cs_ia_group_departures (
  client_id uuid PRIMARY KEY REFERENCES public.clientes(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.atendimento_conversas(id) ON DELETE CASCADE,
  wa_client_id uuid NOT NULL,
  channel_id uuid NOT NULL REFERENCES public.cliente_whatsapp_config(id) ON DELETE CASCADE,
  group_jid text NOT NULL,
  departed_at timestamptz NOT NULL CHECK (isfinite(departed_at))
);

ALTER TABLE private.cs_ia_group_departures ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.cs_ia_group_departures FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE private.cs_ia_group_departures TO authenticated;

CREATE POLICY cs_ia_group_departures_current ON private.cs_ia_group_departures FOR SELECT TO authenticated
  USING (departed_at BETWEEN now() - interval '168 hours' AND now()
    AND EXISTS (SELECT 1 FROM public.cs_ia_group_source(client_id, conversation_id) g
      WHERE g.cliente_id = wa_client_id AND g.whatsapp_config_id = channel_id AND g.chat_jid = group_jid)
    AND EXISTS (SELECT 1 FROM public.cliente_whatsapp_config cfg
      WHERE cfg.id = channel_id AND cfg.cliente_id = wa_client_id AND cfg.provider = 'uazapi' AND cfg.archived_at IS NULL)
    AND NOT EXISTS (SELECT 1 FROM public.cliente_whatsapp_grupo l
      WHERE l.cliente_id = cs_ia_group_departures.client_id AND l.updated_at > departed_at));

CREATE FUNCTION public.cs_ia_capture_group_departure(p_wa_client_id uuid, p_channel_id uuid,
  p_channel_revision timestamptz, p_group_jid text, p_departed_at timestamptz)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  source_id uuid;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' OR auth.uid() IS NOT NULL THEN
    RAISE insufficient_privilege USING MESSAGE = 'Captura exclusiva do webhook.';
  END IF;
  IF p_group_jid IS NULL OR p_group_jid !~ '^[a-z0-9-]{1,196}@g[.]us$'
    OR p_departed_at IS NULL OR p_departed_at NOT BETWEEN now() - interval '168 hours' AND now() THEN
    RETURN false;
  END IF;
  PERFORM 1 FROM public.cliente_whatsapp_config cfg
  WHERE cfg.id = p_channel_id AND cfg.cliente_id = p_wa_client_id AND cfg.updated_at = p_channel_revision
    AND cfg.provider = 'uazapi' AND cfg.archived_at IS NULL FOR SHARE;
  IF NOT FOUND THEN RETURN false; END IF;

  SELECT g.id INTO source_id FROM public.atendimento_conversas g
  WHERE g.cliente_id = p_wa_client_id AND g.whatsapp_config_id = p_channel_id AND g.chat_jid = p_group_jid
    AND g.is_group AND NOT g.bloqueada AND g.archived_at IS NULL;
  IF NOT FOUND THEN RETURN false; END IF;

  WITH candidates AS (
    SELECT c.id, l.updated_at AS linked_at, count(*) OVER () AS claims
    FROM public.clientes c LEFT JOIN public.cliente_whatsapp_grupo l ON l.cliente_id = c.id
    CROSS JOIN LATERAL private.cs_ia_group(c.id) g
    WHERE c.etapa = 'closed' AND (l.conversation_id = source_id OR (l.cliente_id IS NULL
      AND public.central_trafego_try_uuid(c.entregaveis->'whatsapp_grupo'->>'conversation_id') = source_id))
      AND g.conversation_id = source_id AND g.wa_client_id = p_wa_client_id
      AND g.channel_id = p_channel_id AND g.group_jid = p_group_jid
  )
  INSERT INTO private.cs_ia_group_departures AS previous (client_id, conversation_id, wa_client_id, channel_id, group_jid, departed_at)
  SELECT id, source_id, p_wa_client_id, p_channel_id, p_group_jid, p_departed_at FROM candidates
  WHERE claims = 1 AND (linked_at IS NULL OR linked_at <= p_departed_at)
  ON CONFLICT (client_id) DO UPDATE SET conversation_id = EXCLUDED.conversation_id, wa_client_id = EXCLUDED.wa_client_id,
    channel_id = EXCLUDED.channel_id, group_jid = EXCLUDED.group_jid, departed_at = EXCLUDED.departed_at
  WHERE previous.departed_at < EXCLUDED.departed_at;
  RETURN FOUND;
END;
$$;

CREATE FUNCTION public.cs_ia_radar_snapshot()
RETURNS TABLE(client_id uuid, client_name text, owner_id uuid, owner_name text, manual_status text,
  group_status text, conversation_id uuid, group_jid text, group_name text, wa_client_id uuid,
  last_activity_at timestamptz, awaiting_since timestamptz, wait_minutes integer,
  score integer, health text, signal text, factors jsonb, score_delta integer, channel_id uuid, group_departure_at timestamptz)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT r.*, d.departed_at FROM public.cs_ia_radar() r
  LEFT JOIN private.cs_ia_group_departures d ON d.client_id = r.client_id AND d.conversation_id = r.conversation_id
    AND d.wa_client_id = r.wa_client_id AND d.channel_id = r.channel_id AND d.group_jid = r.group_jid;
$$;

REVOKE ALL ON FUNCTION public.cs_ia_capture_group_departure(uuid, uuid, timestamptz, text, timestamptz),
  public.cs_ia_radar_snapshot() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cs_ia_capture_group_departure(uuid, uuid, timestamptz, text, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.cs_ia_radar_snapshot() TO authenticated;

COMMIT;

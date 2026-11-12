BEGIN;

CREATE OR REPLACE FUNCTION private.cs_ia_radar_at(p_now timestamptz)
RETURNS TABLE(client_id uuid, client_name text, owner_id uuid, owner_name text, manual_status text,
  group_status text, conversation_id uuid, group_jid text, group_name text, wa_client_id uuid,
  last_activity_at timestamptz, awaiting_since timestamptz, wait_minutes integer,
  score integer, health text, signal text, factors jsonb, score_delta integer, channel_id uuid)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  WITH inputs AS (
    SELECT c.id AS client_id, c.empresa::text AS client_name, p.id AS owner_id, p.full_name::text AS owner_name,
      r.manual_status, g.group_status, g.conversation_id, g.group_jid, g.group_name, g.wa_client_id, g.channel_id,
      activity.last_activity_at, activity.awaiting_since, following.starts_at,
      private.cs_ia_wait_minutes(activity.awaiting_since, p_now, s.start_hour, s.end_hour, s.weekends) AS wait_minutes,
      s.healthy_min, s.result_min, s.attention_min, s.score_drop, s.quiet_days, s.critical_quiet_days,
      (s.end_hour - s.start_hour) * 60 AS shift_minutes, (p_now AT TIME ZONE 'America/Sao_Paulo')::date AS day
    FROM public.cs_ia_settings s CROSS JOIN public.clientes c
    CROSS JOIN LATERAL private.cs_ia_group(c.id) g
    CROSS JOIN LATERAL private.cs_ia_channel_state(g.channel_id, g.wa_client_id) following
    CROSS JOIN LATERAL (
      SELECT CASE WHEN isfinite(g.last_activity_at) AND g.last_activity_at BETWEEN following.starts_at AND p_now
                    THEN g.last_activity_at END AS last_activity_at,
        CASE WHEN isfinite(g.awaiting_since) AND g.awaiting_since BETWEEN following.starts_at AND p_now
             THEN g.awaiting_since END AS awaiting_since
    ) activity
    LEFT JOIN public.cs_ia_relationships r ON r.client_id = c.id
    LEFT JOIN public.profiles p ON p.id::text = c.responsavel::text
      AND p.status = 'active' AND p.role IN ('admin', 'superadmin', 'colaborador')
      AND (SELECT private.cs_ia_owner_visible())
    WHERE s.id = 1 AND c.etapa = 'closed'
  ), scored AS (
    SELECT i.*, elapsed.quiet, rollup.score, rollup.factors
    FROM inputs i CROSS JOIN LATERAL (
      SELECT i.day - (i.last_activity_at AT TIME ZONE 'America/Sao_Paulo')::date AS quiet
    ) elapsed CROSS JOIN LATERAL (
      SELECT round(sum(parts.score * parts.weight)::numeric / sum(parts.weight))::integer AS score,
        coalesce(jsonb_agg(jsonb_build_object('key', parts.key, 'label', parts.label, 'score', parts.score,
          'weight', round(100 * parts.weight::numeric / parts.total, 2)) ORDER BY parts.position), '[]'::jsonb) AS factors
      FROM (
        SELECT f.*, sum(f.weight) OVER () AS total
        FROM (VALUES
          (1, 'atendimento', 'Espera no expediente', 60,
            CASE WHEN i.wait_minutes IS NOT NULL THEN greatest(0, 100 - floor(i.wait_minutes * 100::numeric / i.shift_minutes))::integer
              WHEN i.last_activity_at IS NOT NULL THEN 100 END),
          (2, 'atividade', 'Atividade do grupo', 30,
            CASE WHEN elapsed.quiet IS NOT NULL THEN greatest(0, 100 - floor(elapsed.quiet * 100::numeric / i.critical_quiet_days))::integer END),
          (3, 'manual', 'Status manual', 10,
            CASE i.manual_status WHEN 'saudavel' THEN 100 WHEN 'resultado' THEN 65 WHEN 'atencao' THEN 45 WHEN 'critico' THEN 15 END)
        ) f(position, key, label, weight, score)
        WHERE f.score IS NOT NULL
      ) parts
    ) rollup
  ), classified AS (
    SELECT s.*, CASE WHEN s.score IS NULL THEN 'sem_leitura' WHEN s.score >= s.healthy_min THEN 'saudavel'
      WHEN s.score >= s.result_min THEN 'resultado' WHEN s.score >= s.attention_min THEN 'atencao' ELSE 'critico' END AS health,
      s.score - prior.score AS delta
    FROM scored s LEFT JOIN public.cs_ia_daily prior ON prior.client_id = s.client_id AND prior.operational_date = s.day - 7
      AND prior.captured_at >= s.starts_at
      AND prior.conversation_id IS NOT DISTINCT FROM s.conversation_id AND prior.whatsapp_config_id IS NOT DISTINCT FROM s.channel_id
      AND prior.wa_client_id IS NOT DISTINCT FROM s.wa_client_id AND prior.group_jid IS NOT DISTINCT FROM s.group_jid
  )
  SELECT c.client_id, c.client_name, c.owner_id, c.owner_name, c.manual_status, c.group_status,
    c.conversation_id, c.group_jid, c.group_name, c.wa_client_id, c.last_activity_at, c.awaiting_since, c.wait_minutes,
    c.score, c.health, CASE
      WHEN c.health = 'critico' OR c.quiet >= c.critical_quiet_days THEN 'critico'
      WHEN c.awaiting_since IS NOT NULL THEN 'resposta_pendente'
      WHEN c.quiet >= c.quiet_days THEN 'inatividade'
      WHEN c.delta < -c.score_drop THEN 'queda'
      WHEN c.health = 'atencao' THEN 'atencao'
      WHEN c.group_status = 'unlinked' THEN 'sem_grupo'
      WHEN c.group_status = 'unavailable' OR c.score IS NULL THEN 'sem_dados'
      ELSE 'em_dia' END, c.factors, c.delta, c.channel_id
  FROM classified c;
$$;

CREATE OR REPLACE FUNCTION private.cs_ia_capture_radar(p_now timestamptz)
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  local_time timestamp := p_now AT TIME ZONE 'America/Sao_Paulo';
  inserted integer;
BEGIN
  IF NOT private.cs_ia_worker() OR extract(hour FROM local_time) IS DISTINCT FROM 9::numeric THEN RETURN 0; END IF;
  PERFORM 1 FROM public.cs_ia_settings WHERE id = 1 AND radar_enabled FOR SHARE;
  IF NOT FOUND THEN RETURN 0; END IF;

  INSERT INTO public.cs_ia_daily (client_id, conversation_id, wa_client_id, group_jid, whatsapp_config_id,
    operational_date, captured_at, score, health, signal, factors)
  SELECT r.client_id, r.conversation_id, r.wa_client_id, r.group_jid, r.channel_id,
    local_time::date, p_now, r.score, r.health, r.signal, r.factors
  FROM private.cs_ia_radar_at(p_now) r
  CROSS JOIN LATERAL private.cs_ia_channel_state(r.channel_id, r.wa_client_id) following
  WHERE p_now >= following.starts_at
  ON CONFLICT (client_id, operational_date) DO NOTHING;
  GET DIAGNOSTICS inserted = ROW_COUNT;
  RETURN inserted;
END;
$$;

CREATE OR REPLACE FUNCTION public.cs_ia_capture_group_departure(p_wa_client_id uuid, p_channel_id uuid,
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

  IF NOT EXISTS (SELECT 1 FROM private.cs_ia_channel_state(p_channel_id, p_wa_client_id) following
    WHERE p_departed_at >= following.starts_at) THEN RETURN false; END IF;

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

CREATE POLICY cs_ia_group_departures_following ON private.cs_ia_group_departures AS RESTRICTIVE FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM private.cs_ia_channel_state(channel_id, wa_client_id) following
    WHERE departed_at >= following.starts_at));

DROP FUNCTION public.cs_ia_connection_summary();
DROP FUNCTION public.cs_ia_radar_snapshot();

CREATE FUNCTION public.cs_ia_radar_snapshot()
RETURNS TABLE(client_id uuid, client_name text, owner_id uuid, owner_name text, manual_status text,
  group_status text, conversation_id uuid, group_jid text, group_name text, wa_client_id uuid,
  last_activity_at timestamptz, awaiting_since timestamptz, wait_minutes integer,
  score integer, health text, signal text, factors jsonb, score_delta integer, channel_id uuid, group_departure_at timestamptz,
  channel_following boolean, channel_following_since timestamptz)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT r.*, d.departed_at, following.starts_at IS NOT NULL,
    CASE WHEN isfinite(following.starts_at) THEN following.starts_at END
  FROM public.cs_ia_radar() r
  CROSS JOIN LATERAL private.cs_ia_channel_state(r.channel_id, r.wa_client_id) following
  LEFT JOIN private.cs_ia_group_departures d ON d.client_id = r.client_id AND d.conversation_id = r.conversation_id
    AND d.wa_client_id = r.wa_client_id AND d.channel_id = r.channel_id AND d.group_jid = r.group_jid;
$$;

CREATE FUNCTION public.cs_ia_connection_summary()
RETURNS TABLE(id uuid, name text, instance_status text, linked_clients integer, following boolean, version text, can_configure boolean)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  WITH linked AS (
    SELECT r.channel_id, r.wa_client_id, count(*)::integer AS client_count
    FROM public.cs_ia_radar_snapshot() r
    WHERE r.group_status = 'linked'
    GROUP BY r.channel_id, r.wa_client_id
  )
  SELECT cfg.id, coalesce(nullif(btrim(cfg.name::text), ''), 'Canal sem nome'),
    CASE lower(cfg.instance_status::text)
      WHEN 'connected' THEN 'connected'
      WHEN 'connecting' THEN 'connecting'
      WHEN 'disconnected' THEN 'disconnected'
      ELSE 'unknown'
    END,
    coalesce(l.client_count, 0), state.starts_at IS NOT NULL,
    CASE WHEN manageable.id IS NOT NULL THEN state.version END, manageable.id IS NOT NULL
  FROM public.cliente_whatsapp_config cfg
  LEFT JOIN linked l ON l.channel_id = cfg.id AND l.wa_client_id = cfg.cliente_id
  LEFT JOIN public.cs_ia_group_registration_channels() manageable
    ON manageable.id = cfg.id AND manageable.wa_client_id = cfg.cliente_id
  CROSS JOIN LATERAL private.cs_ia_channel_state(cfg.id, cfg.cliente_id) state
  WHERE cfg.archived_at IS NULL AND (l.channel_id IS NOT NULL OR manageable.id IS NOT NULL);
$$;

REVOKE ALL ON FUNCTION public.cs_ia_radar_snapshot(), public.cs_ia_connection_summary()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cs_ia_radar_snapshot(), public.cs_ia_connection_summary(),
  public.cs_ia_set_channel_following(uuid, boolean, text) TO authenticated;
NOTIFY pgrst, 'reload schema';

COMMIT;

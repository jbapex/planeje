BEGIN;

CREATE INDEX cs_ia_reading_jobs_latest_completed ON private.cs_ia_reading_jobs
  (client_id, revision, source_at DESC, finished_at DESC, id DESC) WHERE state = 'completed';

CREATE FUNCTION private.cs_ia_conversation_factor(p_client_id uuid, p_now timestamptz)
RETURNS TABLE(score integer, evidence jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT least(
      CASE job.result->>'tone' WHEN 'positive' THEN 100 WHEN 'neutral' THEN 75 WHEN 'mixed' THEN 55 WHEN 'negative' THEN 35 END,
      CASE WHEN job.result->>'cancellation' = 'true' THEN 15 WHEN job.result->>'complaint' = 'true' THEN 45
        WHEN job.result->>'unresolved' = 'true' THEN 55 END
    ),
    jsonb_build_object('source_at', job.source_at, 'tone', job.result->'tone',
      'complaint', job.result->'complaint', 'unresolved', job.result->'unresolved', 'cancellation', job.result->'cancellation')
  FROM private.cs_ia_reading_config config
  CROSS JOIN LATERAL (
    SELECT j.source_at, j.result FROM private.cs_ia_reading_jobs j
    WHERE j.client_id = config.client_id AND j.revision = config.revision AND j.state = 'completed'
      AND j.source_at BETWEEN greatest(config.enabled_at, p_now - interval '168 hours') AND p_now
      AND j.finished_at <= p_now
    ORDER BY j.source_at DESC, j.finished_at DESC, j.id DESC LIMIT 1
  ) job
  WHERE config.client_id = p_client_id AND private.cs_ia_reading_current(config)
    AND (
      private.cs_ia_client_exists(p_client_id)
      -- Dentro de SECURITY DEFINER, current_user é o dono da função, inclusive para chamadas autenticadas.
      OR (private.cs_ia_worker() AND coalesce(nullif(current_setting('role'), 'none'), session_user::text) = current_user::text)
    );
$$;

REVOKE ALL ON FUNCTION private.cs_ia_conversation_factor(uuid, timestamptz) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.cs_ia_conversation_factor(uuid, timestamptz) TO authenticated;

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
    ) elapsed
    LEFT JOIN LATERAL private.cs_ia_conversation_factor(i.client_id, p_now) reading ON i.group_status = 'linked'
    CROSS JOIN LATERAL (
      SELECT round(sum(parts.score * parts.weight)::numeric / sum(parts.weight))::integer AS score,
        coalesce(jsonb_agg(jsonb_build_object('key', parts.key, 'label', parts.label, 'score', parts.score,
          'weight', round(100 * parts.weight::numeric / parts.total, 2)) ||
          CASE WHEN parts.key = 'conversas' THEN jsonb_build_object('reading', reading.evidence) ELSE '{}'::jsonb END
          ORDER BY parts.position), '[]'::jsonb) AS factors
      FROM (
        SELECT f.*, sum(f.weight) OVER () AS total
        FROM (VALUES
          (1, 'atendimento', 'Espera no expediente', 60,
            CASE WHEN i.wait_minutes IS NOT NULL THEN greatest(0, 100 - floor(i.wait_minutes * 100::numeric / i.shift_minutes))::integer
              WHEN i.last_activity_at IS NOT NULL THEN 100 END),
          (2, 'atividade', 'Atividade do grupo', 30,
            CASE WHEN elapsed.quiet IS NOT NULL THEN greatest(0, 100 - floor(elapsed.quiet * 100::numeric / i.critical_quiet_days))::integer END),
          (3, 'manual', 'Status manual', 10,
            CASE i.manual_status WHEN 'saudavel' THEN 100 WHEN 'resultado' THEN 65 WHEN 'atencao' THEN 45 WHEN 'critico' THEN 15 END),
          (4, 'conversas', 'Conversas', 30, reading.score)
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
      AND (prior.factors @> '[{"key":"conversas"}]') = (s.factors @> '[{"key":"conversas"}]')
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

COMMIT;

BEGIN;

CREATE FUNCTION public.cs_ia_team_response_times(p_days integer)
RETURNS TABLE (profile_id uuid, response_count bigint, median_minutes double precision)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' SET TimeZone = 'UTC' AS $$
  WITH period AS (
    SELECT now() AS until, now() - make_interval(days => p_days) AS since, private.cs_ia_role() AS role
    WHERE p_days IN (7, 30)
  ), bindings AS MATERIALIZED (
    SELECT c.id AS client_id, g.conversation_id, g.wa_client_id, g.channel_id, g.group_jid
    FROM period p CROSS JOIN public.clientes c CROSS JOIN LATERAL private.cs_ia_group(c.id) g
    WHERE p.role IS NOT NULL AND c.etapa = 'closed' AND g.group_status = 'linked'
  ), sources AS (
    SELECT DISTINCT conversation_id, wa_client_id, channel_id FROM bindings
  ), requests AS (
    SELECT g.conversation_id, coalesce(i.msg_timestamp, i.created_at) AS requested_at
    FROM sources g CROSS JOIN period p
    CROSS JOIN LATERAL (
      SELECT DISTINCT ON (l.inbox_message_id) l.inbox_message_id, l.needs_response, l.sender_role
      FROM public.atendimento_grupo_analise_log l
      WHERE l.conversation_id = g.conversation_id AND l.cliente_id = g.wa_client_id
        AND l.created_at BETWEEN p.since AND p.until AND l.inbox_message_id IS NOT NULL
      ORDER BY l.inbox_message_id, l.created_at DESC, l.id DESC
    ) analysis
    JOIN public.cliente_whatsapp_inbox i ON i.id = analysis.inbox_message_id
      AND (i.conversation_id, i.cliente_id, i.whatsapp_config_id) = (g.conversation_id, g.wa_client_id, g.channel_id)
    WHERE analysis.needs_response AND analysis.sender_role = 'cliente'
      AND coalesce(i.msg_timestamp, i.created_at) BETWEEN p.since AND p.until
      AND NOT EXISTS (
        SELECT 1 FROM bindings b JOIN private.cs_ia_group_team_marks m
          ON (m.client_id, m.conversation_id, m.wa_client_id, m.channel_id, m.group_jid)
            = (b.client_id, b.conversation_id, b.wa_client_id, b.channel_id, b.group_jid)
        WHERE b.conversation_id = g.conversation_id AND m.sender_jid = private.cs_ia_sender_jid(i.sender_jid)
      )
  ), sent_window AS MATERIALIZED (
    SELECT g.conversation_id, g.wa_client_id, g.channel_id, nullif(s.message_id, '') AS message_id,
      s.created_at, s.sent_by, s.sender_kind
    FROM sources g JOIN (SELECT conversation_id, min(requested_at) AS first_request FROM requests GROUP BY conversation_id) q
      USING (conversation_id)
    CROSS JOIN period p JOIN public.cliente_whatsapp_sent s
      ON (s.conversation_id, s.cliente_id, s.whatsapp_config_id) = (g.conversation_id, g.wa_client_id, g.channel_id)
      AND s.created_at BETWEEN q.first_request AND p.until
  ), message_keys AS (
    SELECT DISTINCT conversation_id, wa_client_id, channel_id, message_id FROM sent_window WHERE message_id IS NOT NULL
  ), sends AS (
    -- O webhook e o editor podem gravar a mesma mensagem em horários diferentes.
    SELECT k.conversation_id, min(s.created_at) AS sent_at,
      CASE WHEN count(DISTINCT s.sent_by) = 1 AND NOT coalesce(bool_or(s.sender_kind = 'automation'), false)
        THEN min(s.sent_by::text)::uuid END AS author
    FROM message_keys k CROSS JOIN period p JOIN public.cliente_whatsapp_sent s
      ON (s.cliente_id, s.message_id) = (k.wa_client_id, k.message_id)
      AND (s.conversation_id, s.whatsapp_config_id) = (k.conversation_id, k.channel_id) AND s.created_at <= p.until
    GROUP BY k.conversation_id, k.message_id, p.since HAVING min(s.created_at) >= p.since
    UNION ALL
    SELECT conversation_id, created_at, CASE WHEN sender_kind IS DISTINCT FROM 'automation' THEN sent_by END
    FROM sent_window WHERE message_id IS NULL
  ), timeline AS (
    SELECT conversation_id, requested_at AS event_at, false AS outgoing, NULL::uuid AS author FROM requests
    UNION ALL
    SELECT conversation_id, sent_at, true,
      CASE WHEN count(author) = count(*) AND count(DISTINCT author) = 1 THEN min(author::text)::uuid END
    FROM sends GROUP BY conversation_id, sent_at
  ), cycles AS (
    -- Em ordem reversa, cada envio encerra a espera das mensagens recebidas que o antecedem.
    SELECT *, count(*) FILTER (WHERE outgoing) OVER (
      PARTITION BY conversation_id ORDER BY event_at DESC, outgoing DESC ROWS UNBOUNDED PRECEDING
    ) AS cycle FROM timeline
  ), pairs AS (
    SELECT min(event_at) FILTER (WHERE NOT outgoing) AS requested_at,
      min(event_at) FILTER (WHERE outgoing) AS sent_at, min(author::text)::uuid AS author
    FROM cycles GROUP BY conversation_id, cycle
    HAVING count(author) = 1 AND bool_or(NOT outgoing)
  ), samples AS (
    SELECT author.id, private.cs_ia_wait_minutes(p.requested_at, p.sent_at, cfg.start_hour, cfg.end_hour, cfg.weekends) AS minutes
    FROM pairs p CROSS JOIN period scope CROSS JOIN public.cs_ia_settings cfg
    JOIN public.profiles author ON author.id = p.author AND author.status = 'active'
      AND author.role IN ('admin', 'superadmin', 'colaborador')
    WHERE cfg.id = 1 AND (scope.role IN ('admin', 'superadmin') OR author.id = auth.uid())
  )
  SELECT id, count(*), percentile_cont(0.5) WITHIN GROUP (ORDER BY minutes)
  FROM samples WHERE minutes IS NOT NULL GROUP BY id;
$$;

REVOKE ALL ON FUNCTION public.cs_ia_team_response_times(integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cs_ia_team_response_times(integer) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;

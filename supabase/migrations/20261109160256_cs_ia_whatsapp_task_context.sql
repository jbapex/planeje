BEGIN;

ALTER TABLE private.cs_ia_reading_config ADD COLUMN task_context_since timestamptz;

CREATE OR REPLACE FUNCTION private.cs_ia_clear_task_creation_on_reading_change()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NOT NEW.enabled OR (NEW.owner_id, NEW.conversation_id, NEW.wa_client_id, NEW.channel_id, NEW.group_jid)
    IS DISTINCT FROM (OLD.owner_id, OLD.conversation_id, OLD.wa_client_id, OLD.channel_id, OLD.group_jid) THEN
    NEW.task_create_since := NULL;
    NEW.task_context_since := NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION private.cs_ia_task_rule_since(p_client uuid, p_contextual boolean)
RETURNS timestamptz LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT greatest(rule.consent_at, c.enabled_at, s.task_automation_since)
  FROM private.cs_ia_reading_config c CROSS JOIN public.cs_ia_settings s
  CROSS JOIN LATERAL (SELECT CASE WHEN p_contextual THEN c.task_context_since ELSE c.task_create_since END AS consent_at) rule
  WHERE c.client_id = p_client AND c.enabled AND rule.consent_at IS NOT NULL AND s.id = 1
    AND s.task_board_enabled AND s.task_automation_enabled
    AND private.cs_ia_user_task_module(c.owner_id, 'tasks') AND private.cs_ia_user_task_module(c.owner_id, 'assistant');
$$;

CREATE OR REPLACE FUNCTION private.cs_ia_task_creation_since(p_client uuid)
RETURNS timestamptz LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT private.cs_ia_task_rule_since(p_client, false);
$$;

CREATE FUNCTION private.cs_ia_task_auto_options(p_client uuid, p_conversation uuid, p_enabled boolean, p_contextual boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  movement jsonb;
  consent private.cs_ia_reading_config;
  can_configure boolean;
  can_revoke boolean;
  consent_at timestamptz;
BEGIN
  IF p_enabled IS NOT NULL THEN
    IF NOT coalesce(private.atlas_demand_owner() AND private.cs_ia_role() IN ('admin','superadmin')
      AND private.cs_ia_client_exists(p_client) AND private.cs_ia_user_task_module(auth.uid(), 'tasks'), false) THEN
      RAISE insufficient_privilege USING MESSAGE = 'Somente o titular autorizado do Atlas pode alterar esta regra.';
    END IF;
    PERFORM 1 FROM public.cs_ia_settings WHERE id = 1 FOR SHARE;
    SELECT * INTO consent FROM private.cs_ia_reading_config WHERE client_id = p_client FOR UPDATE NOWAIT;
  ELSE
    SELECT * INTO consent FROM private.cs_ia_reading_config WHERE client_id = p_client;
  END IF;
  movement := private.cs_ia_task_move_options(p_client, p_conversation, NULL);
  can_configure := coalesce((movement->>'can_configure')::boolean, false);
  consent_at := CASE WHEN p_contextual THEN consent.task_context_since ELSE consent.task_create_since END;
  can_revoke := coalesce(consent_at IS NOT NULL AND consent.owner_id = auth.uid()
    AND consent.conversation_id = p_conversation AND private.atlas_demand_owner(), false);
  IF p_enabled IS NOT NULL THEN
    IF NOT can_configure AND (p_enabled OR NOT can_revoke) THEN
      RAISE insufficient_privilege USING MESSAGE = 'Habilite a leitura do grupo e a automação de Tarefas para configurar a regra.';
    END IF;
    consent_at := CASE WHEN p_enabled THEN coalesce(consent_at, clock_timestamp()) END;
    UPDATE private.cs_ia_reading_config
      SET task_create_since = CASE WHEN p_contextual THEN task_create_since ELSE consent_at END,
        task_context_since = CASE WHEN p_contextual THEN consent_at ELSE task_context_since END
      WHERE client_id = p_client RETURNING * INTO consent;
    can_revoke := p_enabled;
  END IF;
  RETURN jsonb_build_object(
    'enabled', consent.conversation_id IS NOT DISTINCT FROM p_conversation AND consent_at IS NOT NULL
      AND private.cs_ia_reading_current(consent) AND private.cs_ia_task_rule_since(p_client, p_contextual) IS NOT NULL,
    'can_configure', can_configure, 'can_revoke', can_revoke,
    'global_paused', coalesce((movement->>'global_paused')::boolean, false));
EXCEPTION WHEN lock_not_available THEN
  RAISE serialization_failure USING MESSAGE = 'A leitura está em uso. Atualize a regra e tente novamente.';
END;
$$;

CREATE OR REPLACE FUNCTION private.cs_ia_task_creation_options(p_client uuid, p_conversation uuid, p_enabled boolean)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT private.cs_ia_task_auto_options(p_client, p_conversation, p_enabled, false);
$$;

CREATE FUNCTION private.cs_ia_task_context_options(p_client uuid, p_conversation uuid, p_enabled boolean)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT private.cs_ia_task_auto_options(p_client, p_conversation, p_enabled, true);
$$;

CREATE FUNCTION public.cs_ia_task_context_options(p_client_id uuid, p_conversation_id uuid, p_enabled boolean DEFAULT NULL)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT private.cs_ia_task_context_options(p_client_id, p_conversation_id, p_enabled);
$$;

CREATE FUNCTION private.cs_ia_task_message_actor(p_consent private.cs_ia_reading_config, p_sender text, p_at timestamptz)
RETURNS uuid LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE actor uuid;
BEGIN
  SELECT (array_agg(DISTINCT identity.id))[1] INTO actor
  FROM (
    SELECT p.id, greatest(r.created_at, r.updated_at) AS known_since
    FROM public.atendimento_grupo_remetente_interno r
    JOIN public.profiles p ON p.id = r.profile_id AND p.status = 'active' AND p.role IN ('admin', 'superadmin', 'colaborador')
    JOIN auth.users u ON u.id = p.id AND (u.banned_until IS NULL OR u.banned_until <= now())
    WHERE (r.cliente_id IS NULL OR r.cliente_id = p_consent.wa_client_id)
      AND private.cs_ia_sender_jid(r.sender_jid) = private.cs_ia_sender_jid(p_sender)
    FOR SHARE OF r NOWAIT
  ) identity
  HAVING count(DISTINCT identity.id) = 1 AND bool_or(identity.known_since <= p_at);
  RETURN actor;
EXCEPTION WHEN lock_not_available THEN RETURN NULL;
END;
$$;

CREATE FUNCTION private.cs_ia_apply_task_start(p_consent private.cs_ia_reading_config, actor uuid, p_task_id uuid,
  p_title text, p_at timestamptz, p_origin text)
RETURNS void LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  task public.tarefas;
  saved public.tarefas;
  rule_count integer;
  steps jsonb;
BEGIN
  PERFORM 1 FROM public.profiles p JOIN auth.users u ON u.id = p.id
  WHERE p.id = actor AND p.status = 'active' AND p.role IN ('admin','superadmin','colaborador')
    AND (u.banned_until IS NULL OR u.banned_until <= now()) FOR SHARE OF p, u NOWAIT;
  IF NOT FOUND THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM (VALUES ('tasks'), ('clients'), ('atendimento')) m(name)
    WHERE NOT private.cs_ia_user_task_module(actor, m.name)) THEN RETURN; END IF;
  IF EXISTS (
    SELECT 1 FROM public.profiles p CROSS JOIN public.clientes c
    WHERE p.id = actor AND (p.role = 'colaborador' OR p_origin = 'cs_ia_whatsapp_context' AND p.role = 'admin')
      AND c.id = p_consent.client_id
      AND (c.responsavel::text IS DISTINCT FROM actor::text AND EXISTS (SELECT 1 FROM public.user_module_access a
        WHERE a.user_id = actor AND a.module_name::text = 'clients' AND a.access_level::text = 'responsible')
        OR EXISTS (SELECT 1 FROM public.atendimento_usuario_acesso a WHERE a.user_id = actor AND a.cliente_id = p_consent.wa_client_id)
        AND NOT EXISTS (SELECT 1 FROM public.atendimento_usuario_acesso a
          JOIN public.atendimento_conversas g ON g.id = p_consent.conversation_id
          WHERE a.user_id = actor AND a.cliente_id = p_consent.wa_client_id
            AND (a.whatsapp_config_id = p_consent.channel_id OR a.fila_id = coalesce(g.fila_id, (
              SELECT fc.fila_id FROM public.atendimento_fila_canais fc WHERE fc.whatsapp_config_id = g.whatsapp_config_id LIMIT 1)))))
  ) THEN RETURN; END IF;

  SELECT * INTO task FROM public.tarefas WHERE id = p_task_id FOR UPDATE NOWAIT;
  -- shortcut: apenas a transição interna todo → in_progress; outras etapas exigem revisão no editor.
  IF NOT FOUND OR task.client_id IS DISTINCT FROM p_consent.client_id OR lower(btrim(task.title)) IS DISTINCT FROM lower(p_title)
    OR task.type IS DISTINCT FROM 'interno' OR task.status IS DISTINCT FROM 'todo' OR task.workflow_template_id IS NOT NULL
    OR task.due_date IS NULL OR NOT coalesce(actor = ANY(task.assignee_ids), false) OR task.created_at > p_at
    OR (task.status_history IS NOT NULL AND jsonb_typeof(task.status_history) IS DISTINCT FROM 'array') THEN RETURN; END IF;
  IF coalesce((task.status_history->-1->>'timestamp')::timestamptz, '-infinity') > p_at
    OR coalesce((task.stage_execution_history->-1->>'at')::timestamptz, '-infinity') > p_at THEN RETURN; END IF;

  IF (SELECT count(*) FROM (SELECT 1 FROM public.task_statuses WHERE value IN ('todo', 'in_progress')
    AND is_terminal = false FOR SHARE NOWAIT) statuses) <> 2 THEN RETURN; END IF;
  LOCK TABLE public.task_automations, public.workflow_rules IN SHARE MODE NOWAIT;
  IF EXISTS (SELECT 1 FROM public.task_automations a WHERE a.is_active AND a.trigger_type = 'status_change'
    AND private.cs_ia_task_trigger_may_match(to_jsonb(a.trigger_config)->'from_status', 'todo')
    AND private.cs_ia_task_trigger_may_match(to_jsonb(a.trigger_config)->'to_status', 'in_progress')) THEN RETURN; END IF;

  SELECT count(*), (array_agg(to_jsonb(w.required_subtasks)))[1] INTO rule_count, steps FROM public.workflow_rules w
    WHERE w.task_type = task.type AND w.status_value = 'in_progress';
  IF rule_count > 1 OR (steps IS NOT NULL AND jsonb_typeof(steps) <> 'array') THEN RETURN; END IF;
  PERFORM 1 FROM public.task_subtasks WHERE task_id = task.id FOR SHARE NOWAIT;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(coalesce(steps, '[]'::jsonb)) step
    LEFT JOIN LATERAL (SELECT s.is_completed, s.content FROM public.task_subtasks s
      WHERE s.task_id = task.id AND s.title = step->>'title' ORDER BY s.created_at, s.id LIMIT 1) actual ON true
    WHERE CASE WHEN step->>'type' = 'text' THEN coalesce(actual.content, '') !~ '[^[:space:]]'
      ELSE actual.is_completed IS DISTINCT FROM true END
  ) THEN RETURN; END IF;

  BEGIN
    UPDATE public.tarefas SET status = 'in_progress',
      status_history = coalesce(task.status_history, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
        'status', 'in_progress', 'user_id', actor, 'assignee_ids', task.assignee_ids, 'timestamp', now(), 'source', p_origin))
    WHERE id = task.id RETURNING * INTO saved;
    IF p_origin = 'cs_ia_whatsapp_context' AND (
      (saved.status, saved.assignee_ids, saved.due_date, saved.client_id, saved.owner_id, saved.type, saved.title)
      IS DISTINCT FROM ('in_progress', task.assignee_ids, task.due_date, task.client_id, task.owner_id, task.type, task.title)
      OR saved.status_history->-1->>'source' IS DISTINCT FROM p_origin) THEN
      RAISE EXCEPTION 'O fluxo oficial alterou os dados da movimentação.';
    END IF;
  EXCEPTION WHEN check_violation OR raise_exception THEN
    -- A leitura de saúde pode concluir mesmo quando o fluxo oficial recusa a movimentação.
    RETURN;
  END;
EXCEPTION WHEN lock_not_available OR invalid_datetime_format OR datetime_field_overflow THEN RETURN;
END;
$$;

CREATE OR REPLACE FUNCTION private.cs_ia_start_task_from_message(p_consent private.cs_ia_reading_config,
  p_message_id uuid, p_sender text, p_title text, p_at timestamptz)
RETURNS void LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  actor uuid;
  candidates uuid[];
BEGIN
  INSERT INTO private.cs_ia_task_move_messages (message_id, client_id) VALUES (p_message_id, p_consent.client_id)
  ON CONFLICT DO NOTHING;
  IF NOT FOUND THEN RETURN; END IF;

  actor := private.cs_ia_task_message_actor(p_consent, p_sender, p_at);
  IF actor IS NULL THEN RETURN; END IF;

  SELECT array_agg(id) INTO candidates FROM (
    SELECT t.id FROM public.tarefas t LEFT JOIN public.task_statuses s ON s.value = t.status
    WHERE t.client_id = p_consent.client_id AND lower(btrim(t.title)) = lower(p_title)
      AND t.created_at <= p_at AND s.is_terminal IS DISTINCT FROM true
    LIMIT 2
  ) matches;
  IF cardinality(candidates) IS DISTINCT FROM 1 THEN RETURN; END IF;

  PERFORM private.cs_ia_apply_task_start(p_consent, actor, candidates[1], p_title, p_at, 'cs_ia_whatsapp');
END;
$$;

CREATE FUNCTION private.cs_ia_task_context_evidence(p_consent private.cs_ia_reading_config,
  p_latest uuid, p_source_at timestamptz, p_since timestamptz)
RETURNS TABLE(person_id uuid, evidence_at timestamptz)
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  received public.cliente_whatsapp_inbox;
  sent public.cliente_whatsapp_sent;
  body text;
BEGIN
  IF p_latest IS NULL OR p_since IS NULL OR p_source_at <= p_since THEN RETURN; END IF;
  SELECT * INTO received FROM public.cliente_whatsapp_inbox i
  WHERE i.id = p_latest AND i.created_at = p_source_at
    AND (i.conversation_id, i.cliente_id, i.whatsapp_config_id) =
      (p_consent.conversation_id, p_consent.wa_client_id, p_consent.channel_id)
    AND i.msg_timestamp > p_since AND i.msg_timestamp <= p_source_at AND i.media_purged_at IS NULL
    AND lower(btrim(i.type)) IN ('text', 'chat', 'conversation', 'extendedtextmessage') FOR SHARE NOWAIT;
  IF FOUND THEN
    evidence_at := received.msg_timestamp;
    person_id := private.cs_ia_task_message_actor(p_consent, received.sender_jid, evidence_at);
    body := btrim(received.body);
  ELSE
    SELECT * INTO sent FROM public.cliente_whatsapp_sent s
    WHERE s.id = p_latest AND s.created_at = p_source_at AND s.sender_kind = 'human' AND s.sent_by IS NOT NULL
      AND (s.conversation_id, s.cliente_id, s.whatsapp_config_id) =
        (p_consent.conversation_id, p_consent.wa_client_id, p_consent.channel_id) FOR SHARE NOWAIT;
    IF NOT FOUND THEN RETURN; END IF;
    evidence_at := sent.created_at;
    person_id := sent.sent_by;
    body := btrim(sent.body);
  END IF;
  IF person_id IS NOT NULL AND octet_length(body) BETWEEN 1 AND 720 AND left(body, 1) <> '['
    AND body !~* '^(iniciei|comecei)[[:blank:]]*:' AND body !~* '(mensagem foi apagada|apagada para todos)' THEN
    RETURN NEXT;
  END IF;
EXCEPTION WHEN lock_not_available THEN RETURN;
END;
$$;

CREATE FUNCTION private.cs_ia_task_context_candidates(p_client uuid, p_latest uuid, p_source_at timestamptz)
RETURNS TABLE(task_id uuid, message_id uuid, kind text, task_title text, person_id uuid, evidence_at timestamptz)
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  consent private.cs_ia_reading_config;
  since timestamptz;
BEGIN
  since := private.cs_ia_task_rule_since(p_client, true);
  IF since IS NULL OR p_source_at <= since THEN RETURN; END IF;
  SELECT * INTO consent FROM private.cs_ia_reading_config WHERE client_id = p_client;
  RETURN QUERY
  WITH window_ids AS MATERIALIZED (
    SELECT w.id, w.direction FROM (
      (SELECT i.id, i.created_at, 'in'::text AS direction FROM public.cliente_whatsapp_inbox i
        WHERE (i.conversation_id, i.cliente_id, i.whatsapp_config_id) = (consent.conversation_id, consent.wa_client_id, consent.channel_id)
          AND i.created_at >= consent.enabled_at ORDER BY i.created_at DESC, i.id DESC LIMIT 40)
      UNION ALL
      (SELECT s.id, s.created_at, 'out'::text AS direction FROM public.cliente_whatsapp_sent s
        WHERE (s.conversation_id, s.cliente_id, s.whatsapp_config_id) = (consent.conversation_id, consent.wa_client_id, consent.channel_id)
          AND s.created_at >= consent.enabled_at ORDER BY s.created_at DESC, s.id DESC LIMIT 40)
    ) w ORDER BY w.created_at DESC, w.id DESC, w.direction DESC LIMIT 40
  )
  SELECT t.id, r.message_id, r.kind, t.title::text, e.person_id, e.evidence_at
  FROM private.cs_ia_task_context_evidence(consent, p_latest, p_source_at, since) e
  JOIN private.cs_ia_task_creations r ON (r.client_id, r.conversation_id) = (consent.client_id, consent.conversation_id)
  JOIN public.tarefas t ON t.id = r.task_id AND t.client_id = consent.client_id
  JOIN window_ids w ON w.id = r.message_id AND w.direction = 'in'
  JOIN public.cliente_whatsapp_inbox i ON i.id = r.message_id AND i.media_purged_at IS NULL
  WHERE t.status = 'todo' AND t.type = 'interno' AND t.created_at <= e.evidence_at AND e.person_id = ANY(t.assignee_ids)
    AND lower(btrim(i.type)) IN ('text', 'chat', 'conversation', 'extendedtextmessage')
    AND octet_length(btrim(i.body)) BETWEEN 1 AND 720 AND i.created_at < p_source_at
  ORDER BY r.kind, t.id LIMIT 3;
END;
$$;

CREATE FUNCTION private.cs_ia_start_task_from_context(p_job private.cs_ia_reading_jobs, p_task_id uuid)
RETURNS void LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  consent private.cs_ia_reading_config;
  source record;
  match record;
BEGIN
  PERFORM 1 FROM public.cs_ia_settings WHERE id = 1 AND task_board_enabled AND task_automation_enabled FOR SHARE;
  IF NOT FOUND OR NOT private.cs_ia_reading_fresh(p_job) THEN RETURN; END IF;
  SELECT * INTO consent FROM private.cs_ia_reading_config WHERE client_id = p_job.client_id AND revision = p_job.revision;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT * INTO source FROM private.cs_ia_reading_source(consent);
  IF source.fingerprint IS DISTINCT FROM p_job.fingerprint THEN RETURN; END IF;
  SELECT * INTO match FROM private.cs_ia_task_context_candidates(consent.client_id, source.latest_message_id, p_job.source_at)
  WHERE task_id = p_task_id;
  IF NOT FOUND THEN RETURN; END IF;
  PERFORM 1 FROM public.clientes c JOIN public.atendimento_conversas g ON g.id = consent.conversation_id
    WHERE c.id = consent.client_id AND c.etapa = 'closed' FOR SHARE OF c,g NOWAIT;
  IF NOT FOUND OR NOT private.cs_ia_reading_fresh(p_job) THEN RETURN; END IF;

  INSERT INTO private.cs_ia_task_move_messages (message_id, client_id) VALUES (source.latest_message_id, consent.client_id)
  ON CONFLICT DO NOTHING;
  IF NOT FOUND THEN RETURN; END IF;
  PERFORM private.cs_ia_apply_task_start(consent, match.person_id, p_task_id, match.task_title, match.evidence_at, 'cs_ia_whatsapp_context');
EXCEPTION WHEN lock_not_available THEN RETURN;
END;
$$;

CREATE OR REPLACE FUNCTION private.cs_ia_claim_reading(p_owner uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  candidate record;
  job private.cs_ia_reading_jobs;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' OR auth.uid() IS NOT NULL THEN
    RAISE insufficient_privilege USING MESSAGE = 'Worker exclusivo.';
  END IF;

  SELECT config.*, source.source_at, source.fingerprint, source.team_message_ids, source.latest_message_id INTO candidate
  FROM private.cs_ia_reading_config config
  CROSS JOIN LATERAL private.cs_ia_reading_source(config) source
  LEFT JOIN private.cs_ia_reading_jobs previous ON previous.client_id = config.client_id
    AND previous.revision = config.revision AND previous.fingerprint = source.fingerprint
  WHERE config.owner_id = p_owner AND config.enabled AND private.cs_ia_reading_current(config)
    AND source.source_at <= now() - interval '1 hour'
    AND (previous.id IS NULL OR (previous.charged_estimate IS NULL AND previous.attempts < 3 AND (
      previous.state = 'budget_wait' AND previous.ready_at <= now()
      OR previous.state = 'processing' AND previous.lease_until <= now()
    )))
  ORDER BY source.source_at, config.client_id LIMIT 1 FOR UPDATE OF config SKIP LOCKED;
  IF NOT FOUND THEN RETURN NULL; END IF;

  INSERT INTO private.cs_ia_reading_jobs AS previous (client_id, revision, fingerprint, source_at, lease, lease_until)
    VALUES (candidate.client_id, candidate.revision, candidate.fingerprint, candidate.source_at,
      gen_random_uuid(), now() + interval '3 minutes')
  ON CONFLICT (client_id, revision, fingerprint) DO UPDATE SET
    state = 'processing', lease = excluded.lease, lease_until = excluded.lease_until, attempts = previous.attempts + 1
  WHERE previous.charged_estimate IS NULL AND previous.attempts < 3 AND (
    previous.state = 'budget_wait' AND previous.ready_at <= now()
    OR previous.state = 'processing' AND previous.lease_until <= now()
  )
  RETURNING * INTO job;
  IF NOT FOUND THEN RETURN NULL; END IF;

  RETURN jsonb_build_object('id', job.id, 'lease', job.lease, 'client_id', candidate.client_id,
    'conversation_id', candidate.conversation_id, 'wa_client_id', candidate.wa_client_id,
    'channel_id', candidate.channel_id, 'source_at', job.source_at, 'enabled_at', candidate.enabled_at,
    'include_audio', candidate.include_audio, 'team_message_ids', candidate.team_message_ids,
    'latest_message_id', candidate.latest_message_id,
    'allow_followup', coalesce(private.cs_ia_task_creation_since(candidate.client_id) < job.source_at, false),
    'context_candidates', coalesce((SELECT jsonb_agg(jsonb_build_object('task_id', t.task_id, 'message_id', t.message_id)
      ORDER BY t.kind, t.task_id)
      FROM private.cs_ia_task_context_candidates(candidate.client_id, candidate.latest_message_id, job.source_at) t), '[]'::jsonb));
END;
$$;

CREATE OR REPLACE FUNCTION private.cs_ia_finish_reading(p_job uuid, p_lease uuid, p_result jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  job private.cs_ia_reading_jobs;
  next_state text := 'failed';
  message_count integer;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' OR auth.uid() IS NOT NULL THEN
    RAISE insufficient_privilege USING MESSAGE = 'Worker exclusivo.';
  END IF;
  SELECT * INTO job FROM private.cs_ia_reading_jobs
    WHERE id = p_job AND state = 'processing' AND lease = p_lease AND lease_until > now() FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF NOT private.cs_ia_reading_fresh(job) THEN RETURN false; END IF;

  IF p_result IS NOT NULL THEN
    IF jsonb_typeof(p_result) IS DISTINCT FROM 'object' THEN RETURN false; END IF;
    IF (SELECT count(*) FROM jsonb_object_keys(p_result - 'awaiting_client_reply' - 'followup_kind' - 'start_task_id')) <> 6
      OR coalesce(p_result->>'tone', '') NOT IN ('positive', 'neutral', 'negative', 'mixed', 'unknown')
      OR jsonb_typeof(p_result->'complaint') IS DISTINCT FROM 'boolean'
      OR jsonb_typeof(p_result->'unresolved') IS DISTINCT FROM 'boolean'
      OR jsonb_typeof(p_result->'cancellation') IS DISTINCT FROM 'boolean'
      OR (p_result ? 'awaiting_client_reply' AND jsonb_typeof(p_result->'awaiting_client_reply') IS DISTINCT FROM 'boolean')
      OR (p_result ? 'followup_kind' AND p_result->'followup_kind' <> 'null'::jsonb
        AND coalesce(p_result->>'followup_kind', '') NOT IN ('request', 'complaint', 'commitment'))
      OR (p_result ? 'start_task_id' AND (public.central_trafego_try_uuid(p_result->>'start_task_id') IS NULL
        OR p_result->>'followup_kind' IS NOT NULL))
      OR jsonb_typeof(p_result->'message_count') IS DISTINCT FROM 'number'
      OR jsonb_typeof(p_result->'audio_missing') IS DISTINCT FROM 'number'
      OR p_result->>'message_count' !~ '^([0-9]|[1-3][0-9]|40)$'
      OR p_result->>'audio_missing' !~ '^([0-9]|[1-3][0-9]|40)$' THEN
      RETURN false;
    END IF;
    message_count := (p_result->>'message_count')::integer;
    IF message_count = 0 THEN
      IF p_result->>'tone' <> 'unknown' OR p_result->>'complaint' = 'true'
        OR p_result->>'unresolved' = 'true' OR p_result->>'cancellation' = 'true' OR p_result->>'awaiting_client_reply' = 'true' THEN
        RETURN false;
      END IF;
      next_state := 'no_text';
    ELSIF job.charged_estimate IS NOT NULL THEN
      next_state := 'completed';
    ELSE
      RETURN false;
    END IF;
  END IF;

  UPDATE private.cs_ia_reading_jobs SET state = next_state, result = p_result, finished_at = now(),
    lease = NULL, lease_until = NULL WHERE id = job.id;
  IF next_state = 'completed' AND p_result->>'cancellation' = 'false'
    AND ((p_result->>'followup_kind' = 'complaint' AND p_result->>'complaint' = 'true') OR
         (p_result->>'followup_kind' IN ('request', 'commitment') AND p_result->>'unresolved' = 'true')) THEN
    PERFORM private.cs_ia_create_task_from_reading(job, p_result->>'followup_kind');
  END IF;
  IF next_state = 'completed' AND p_result->>'cancellation' = 'false' AND p_result ? 'start_task_id' THEN
    PERFORM private.cs_ia_start_task_from_context(job, public.central_trafego_try_uuid(p_result->>'start_task_id'));
  END IF;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION private.cs_ia_task_rule_since(uuid,boolean),
  private.cs_ia_task_auto_options(uuid,uuid,boolean,boolean), private.cs_ia_task_context_options(uuid,uuid,boolean),
  public.cs_ia_task_context_options(uuid,uuid,boolean),
  private.cs_ia_task_message_actor(private.cs_ia_reading_config,text,timestamptz),
  private.cs_ia_apply_task_start(private.cs_ia_reading_config,uuid,uuid,text,timestamptz,text),
  private.cs_ia_task_context_evidence(private.cs_ia_reading_config,uuid,timestamptz,timestamptz),
  private.cs_ia_task_context_candidates(uuid,uuid,timestamptz),
  private.cs_ia_start_task_from_context(private.cs_ia_reading_jobs,uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.cs_ia_task_context_options(uuid,uuid,boolean),
  public.cs_ia_task_context_options(uuid,uuid,boolean) TO authenticated;
NOTIFY pgrst, 'reload schema';

COMMIT;

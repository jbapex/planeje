BEGIN;

ALTER TABLE private.cs_ia_reading_config ADD COLUMN task_create_since timestamptz;

CREATE TABLE private.cs_ia_task_creations (
  message_id uuid PRIMARY KEY,
  client_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL,
  task_id uuid UNIQUE REFERENCES public.tarefas(id) ON DELETE SET NULL,
  kind text NOT NULL CHECK (kind IN ('request', 'complaint', 'commitment'))
);

ALTER TABLE private.cs_ia_task_creations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.cs_ia_task_creations FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT (task_id) ON private.cs_ia_task_creations TO authenticated;

CREATE POLICY cs_ia_task_creations_read ON private.cs_ia_task_creations FOR SELECT TO authenticated
USING (private.cs_ia_client_exists(client_id) AND EXISTS (
  SELECT 1 FROM public.tarefas t WHERE t.id = cs_ia_task_creations.task_id AND t.client_id = cs_ia_task_creations.client_id
    AND (private.gestor_ia_escopo_tarefas() = 'all' OR
      (private.gestor_ia_escopo_tarefas() = 'responsible' AND auth.uid() = ANY(t.assignee_ids)))
));

CREATE FUNCTION public.cs_ia_task_origins(p_task_ids uuid[])
RETURNS TABLE(task_id uuid, origin text) LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT a.task_id, 'atlas'::text FROM public.cs_ia_atlas_task_origins(p_task_ids) a
  UNION ALL
  SELECT c.task_id, 'cs_whatsapp' FROM private.cs_ia_task_creations c
  WHERE cardinality(p_task_ids) BETWEEN 1 AND 200 AND c.task_id = ANY(p_task_ids);
$$;

CREATE FUNCTION private.cs_ia_clear_task_creation_on_reading_change()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NOT NEW.enabled OR (NEW.owner_id, NEW.conversation_id, NEW.wa_client_id, NEW.channel_id, NEW.group_jid)
    IS DISTINCT FROM (OLD.owner_id, OLD.conversation_id, OLD.wa_client_id, OLD.channel_id, OLD.group_jid) THEN
    NEW.task_create_since := NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER cs_ia_clear_task_creation_on_reading_change BEFORE UPDATE ON private.cs_ia_reading_config
  FOR EACH ROW EXECUTE FUNCTION private.cs_ia_clear_task_creation_on_reading_change();

CREATE FUNCTION private.cs_ia_task_creation_since(p_client uuid)
RETURNS timestamptz LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT greatest(c.task_create_since, c.enabled_at, s.task_automation_since)
  FROM private.cs_ia_reading_config c CROSS JOIN public.cs_ia_settings s
  WHERE c.client_id = p_client AND c.enabled AND c.task_create_since IS NOT NULL AND s.id = 1
    AND s.task_board_enabled AND s.task_automation_enabled
    AND private.cs_ia_user_task_module(c.owner_id, 'tasks') AND private.cs_ia_user_task_module(c.owner_id, 'assistant');
$$;

CREATE FUNCTION private.cs_ia_task_creation_options(p_client uuid, p_conversation uuid, p_enabled boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  movement jsonb;
  consent private.cs_ia_reading_config;
  can_configure boolean;
  can_revoke boolean;
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
  can_revoke := coalesce(consent.task_create_since IS NOT NULL AND consent.owner_id = auth.uid()
    AND consent.conversation_id = p_conversation AND private.atlas_demand_owner(), false);
  IF p_enabled IS NOT NULL THEN
    IF NOT can_configure AND (p_enabled OR NOT can_revoke) THEN
      RAISE insufficient_privilege USING MESSAGE = 'Habilite a leitura do grupo e a automação de Tarefas para configurar a criação.';
    END IF;
    UPDATE private.cs_ia_reading_config
      SET task_create_since = CASE WHEN p_enabled THEN coalesce(task_create_since, clock_timestamp()) END
      WHERE client_id = p_client RETURNING * INTO consent;
    can_revoke := p_enabled;
  END IF;
  RETURN jsonb_build_object(
    'enabled', consent.conversation_id IS NOT DISTINCT FROM p_conversation AND consent.task_create_since IS NOT NULL
      AND private.cs_ia_reading_current(consent) AND private.cs_ia_task_creation_since(p_client) IS NOT NULL,
    'can_configure', can_configure, 'can_revoke', can_revoke,
    'global_paused', coalesce((movement->>'global_paused')::boolean, false));
EXCEPTION WHEN lock_not_available THEN
  RAISE serialization_failure USING MESSAGE = 'A leitura está em uso. Atualize a regra e tente novamente.';
END;
$$;

CREATE FUNCTION public.cs_ia_task_creation_options(p_client_id uuid, p_conversation_id uuid, p_enabled boolean DEFAULT NULL)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT private.cs_ia_task_creation_options(p_client_id, p_conversation_id, p_enabled);
$$;

CREATE FUNCTION private.cs_ia_create_task_from_reading(p_job private.cs_ia_reading_jobs, p_kind text)
RETURNS void LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  consent private.cs_ia_reading_config;
  source record;
  person uuid;
  account_name text;
  followup_title text;
  initial text;
  due date := (now() AT TIME ZONE 'America/Sao_Paulo')::date + 1;
  eligible_since timestamptz;
  task public.tarefas;
BEGIN
  PERFORM 1 FROM public.cs_ia_settings WHERE id = 1 AND task_board_enabled AND task_automation_enabled FOR SHARE;
  IF NOT FOUND THEN RETURN; END IF;
  eligible_since := private.cs_ia_task_creation_since(p_job.client_id);
  IF eligible_since IS NULL OR p_job.source_at <= eligible_since THEN RETURN; END IF;

  SELECT * INTO consent FROM private.cs_ia_reading_config WHERE client_id = p_job.client_id AND revision = p_job.revision;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT * INTO source FROM private.cs_ia_reading_source(consent);
  IF source.latest_message_id IS NULL OR source.fingerprint IS DISTINCT FROM p_job.fingerprint
    OR source.latest_message_id = ANY(source.team_message_ids) THEN RETURN; END IF;
  PERFORM 1 FROM public.cliente_whatsapp_inbox i
  WHERE i.id = source.latest_message_id AND i.created_at = p_job.source_at
    AND (i.conversation_id, i.cliente_id, i.whatsapp_config_id) = (consent.conversation_id, consent.wa_client_id, consent.channel_id)
    AND i.msg_timestamp > eligible_since AND i.msg_timestamp <= p_job.source_at AND i.media_purged_at IS NULL
    AND lower(btrim(i.type)) IN ('text', 'chat', 'conversation', 'extendedtextmessage')
    AND octet_length(btrim(i.body)) BETWEEN 1 AND 720 AND left(btrim(i.body), 1) <> '['
    AND private.cs_ia_sender_jid(i.sender_jid) IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.atendimento_grupo_remetente_interno a
      WHERE (a.cliente_id IS NULL OR a.cliente_id = consent.wa_client_id)
        AND private.cs_ia_sender_jid(a.sender_jid) = private.cs_ia_sender_jid(i.sender_jid)
    ) FOR SHARE;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT p.id, c.empresa::text INTO person, account_name
  FROM public.clientes c JOIN public.profiles p ON p.id::text = c.responsavel::text
  JOIN auth.users u ON u.id = p.id
  JOIN public.atendimento_conversas g ON g.id = consent.conversation_id
  WHERE c.id = consent.client_id AND c.etapa = 'closed' AND p.status = 'active'
    AND p.role IN ('admin','superadmin','colaborador') AND (u.banned_until IS NULL OR u.banned_until <= now())
    AND NOT EXISTS (SELECT 1 FROM (VALUES ('clients'), ('atendimento'), ('tasks')) m(name)
      WHERE NOT private.cs_ia_user_task_module(p.id, m.name))
    AND (p.role = 'superadmin' OR NOT EXISTS (
      SELECT 1 FROM public.atendimento_usuario_acesso a WHERE a.user_id = p.id AND a.cliente_id = g.cliente_id
    ) OR EXISTS (
      SELECT 1 FROM public.atendimento_usuario_acesso a WHERE a.user_id = p.id AND a.cliente_id = g.cliente_id
        AND (a.whatsapp_config_id = g.whatsapp_config_id OR a.fila_id = coalesce(g.fila_id, (
          SELECT f.fila_id FROM public.atendimento_fila_canais f WHERE f.whatsapp_config_id = g.whatsapp_config_id LIMIT 1
        )))
    )) FOR SHARE OF c, p, u, g NOWAIT;
  IF NOT FOUND OR nullif(btrim(account_name), '') IS NULL THEN RETURN; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('atlas-manager-task:' || consent.owner_id::text || consent.client_id::text, 0));
  IF EXISTS (SELECT 1 FROM private.cs_ia_task_creations WHERE message_id = source.latest_message_id) THEN RETURN; END IF;
  followup_title := private.atlas_demand_task_title(left(account_name, 112), CASE p_kind
    WHEN 'request' THEN 'Responder solicitação no WhatsApp'
    WHEN 'complaint' THEN 'Conferir reclamação no WhatsApp'
    WHEN 'commitment' THEN 'Conferir combinado no WhatsApp'
  END);
  IF EXISTS (
    SELECT 1 FROM public.tarefas t
    LEFT JOIN public.task_statuses s ON s.value = t.status
    LEFT JOIN private.cs_ia_task_creations c ON c.task_id = t.id
    WHERE t.client_id = consent.client_id AND s.is_terminal IS DISTINCT FROM true
      AND (lower(btrim(t.title)) = lower(btrim(followup_title)) OR (c.conversation_id = consent.conversation_id AND c.kind = p_kind))
  ) THEN RETURN; END IF;

  SELECT value INTO initial FROM public.task_statuses WHERE is_initial AND NOT is_terminal ORDER BY sort_order, value LIMIT 1 FOR SHARE;
  IF initial IS NULL THEN RETURN; END IF;
  LOCK TABLE public.task_automations, public.workflow_rules IN SHARE MODE NOWAIT;
  IF EXISTS (SELECT 1 FROM public.task_automations WHERE is_active AND trigger_type = 'task_created')
    OR EXISTS (SELECT 1 FROM public.workflow_rules WHERE task_type = 'interno' AND status_value = initial
      AND coalesce(to_jsonb(required_subtasks), '[]'::jsonb) <> '[]'::jsonb) THEN RETURN; END IF;

  IF NOT private.cs_ia_reading_fresh(p_job) THEN RETURN; END IF;
  WHILE extract(isodow FROM due) > 5 LOOP due := due + 1; END LOOP;
  INSERT INTO public.tarefas (title, description, status, client_id, owner_id, type, priority, due_date, assignee_ids, status_history)
  VALUES (followup_title, 'Acompanhe a pendência identificada na leitura do WhatsApp. Abra Conversas na ficha de CS e confira o grupo antes de agir.',
    initial, consent.client_id, consent.owner_id, 'interno', 'medium', due, ARRAY[person],
    jsonb_build_array(jsonb_build_object('status', initial, 'assignee_ids', ARRAY[person], 'user_id', consent.owner_id,
      'timestamp', now(), 'source', 'cs_ia_whatsapp_creation')))
  RETURNING * INTO task;
  IF (task.status, task.client_id, task.owner_id, task.type, task.due_date, task.assignee_ids) IS DISTINCT FROM
    (initial, consent.client_id, consent.owner_id, 'interno', due, ARRAY[person]) THEN
    RAISE EXCEPTION 'O fluxo oficial alterou os dados da tarefa.';
  END IF;
  INSERT INTO private.cs_ia_task_creations (message_id, client_id, conversation_id, task_id, kind)
  VALUES (source.latest_message_id, consent.client_id, consent.conversation_id, task.id, p_kind);
EXCEPTION WHEN lock_not_available OR check_violation OR not_null_violation OR foreign_key_violation OR unique_violation OR raise_exception THEN
  RETURN;
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
    'allow_followup', coalesce(private.cs_ia_task_creation_since(candidate.client_id) < job.source_at, false));
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
    IF (SELECT count(*) FROM jsonb_object_keys(p_result - 'awaiting_client_reply' - 'followup_kind')) <> 6
      OR coalesce(p_result->>'tone', '') NOT IN ('positive', 'neutral', 'negative', 'mixed', 'unknown')
      OR jsonb_typeof(p_result->'complaint') IS DISTINCT FROM 'boolean'
      OR jsonb_typeof(p_result->'unresolved') IS DISTINCT FROM 'boolean'
      OR jsonb_typeof(p_result->'cancellation') IS DISTINCT FROM 'boolean'
      OR (p_result ? 'awaiting_client_reply' AND jsonb_typeof(p_result->'awaiting_client_reply') IS DISTINCT FROM 'boolean')
      OR (p_result ? 'followup_kind' AND p_result->'followup_kind' <> 'null'::jsonb
        AND coalesce(p_result->>'followup_kind', '') NOT IN ('request', 'complaint', 'commitment'))
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
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION private.cs_ia_clear_task_creation_on_reading_change(),
  private.cs_ia_task_creation_since(uuid), private.cs_ia_create_task_from_reading(private.cs_ia_reading_jobs,text),
  private.cs_ia_task_creation_options(uuid,uuid,boolean), public.cs_ia_task_creation_options(uuid,uuid,boolean),
  public.cs_ia_task_origins(uuid[]) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.cs_ia_task_creation_options(uuid,uuid,boolean),
  public.cs_ia_task_creation_options(uuid,uuid,boolean), public.cs_ia_task_origins(uuid[]) TO authenticated;
NOTIFY pgrst, 'reload schema';

COMMIT;

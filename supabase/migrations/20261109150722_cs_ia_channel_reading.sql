BEGIN;

CREATE FUNCTION private.cs_ia_sync_channel_readings()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  UPDATE private.cs_ia_reading_config
  SET revision = NEW.revision,
    enabled_at = coalesce(NEW.starts_at, enabled_at),
    transcribe_audio_since = CASE WHEN transcribe_audio_since IS NOT NULL THEN coalesce(NEW.starts_at, transcribe_audio_since) END,
    task_moves_revision = CASE WHEN task_moves_revision = revision AND task_moves_since IS NOT NULL THEN NEW.revision END,
    task_moves_since = CASE WHEN task_moves_revision = revision AND task_moves_since IS NOT NULL
      THEN coalesce(NEW.starts_at, task_moves_since) END
  WHERE channel_id = NEW.channel_id AND wa_client_id = NEW.wa_client_id AND enabled;
  RETURN NULL;
END;
$$;

CREATE TRIGGER cs_ia_sync_channel_readings AFTER INSERT OR UPDATE ON private.cs_ia_channel_following
  FOR EACH ROW EXECUTE FUNCTION private.cs_ia_sync_channel_readings();
REVOKE ALL ON FUNCTION private.cs_ia_sync_channel_readings() FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.cs_ia_reading_owner_scope(p_owner uuid, p_conversation uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.atlas_settings s
    JOIN public.profiles p ON p.id = s.owner_id
    JOIN auth.users u ON u.id = p.id
    JOIN public.atendimento_conversas c ON c.id = p_conversation
    CROSS JOIN LATERAL private.cs_ia_channel_state(c.whatsapp_config_id, c.cliente_id) following
    WHERE following.starts_at IS NOT NULL AND s.id = 'atlas' AND s.owner_id = p_owner AND s.enabled
      AND p.status = 'active' AND p.role IN ('admin', 'superadmin')
      AND (u.banned_until IS NULL OR u.banned_until <= now())
      AND NOT EXISTS (
        SELECT 1 FROM (VALUES ('clients'), ('atendimento')) m(name)
        WHERE NOT coalesce(
          (SELECT v.is_enabled FROM public.user_module_permissions v WHERE v.user_id = p_owner AND v.module_name::text = m.name),
          (SELECT v.is_enabled FROM public.module_settings v WHERE v.module_name::text = m.name), true
        )
      )
      AND (
        p.role = 'superadmin' OR NOT EXISTS (
          SELECT 1 FROM public.atendimento_usuario_acesso a WHERE a.user_id = p_owner AND a.cliente_id = c.cliente_id
        ) OR EXISTS (
          SELECT 1 FROM public.atendimento_usuario_acesso a WHERE a.user_id = p_owner AND a.cliente_id = c.cliente_id
            AND (a.whatsapp_config_id = c.whatsapp_config_id OR a.fila_id = coalesce(c.fila_id, (
              SELECT fc.fila_id FROM public.atendimento_fila_canais fc WHERE fc.whatsapp_config_id = c.whatsapp_config_id LIMIT 1
            )))
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION private.cs_ia_reading_state(p_client_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  config private.cs_ia_reading_config;
  job private.cs_ia_reading_jobs;
  group_id uuid;
  channel_paused boolean;
  source_time timestamptz;
  source_fingerprint text;
  allowed boolean := coalesce(private.cs_ia_role() IN ('admin', 'superadmin') AND private.atlas_demand_owner(), false);
  status text := 'unavailable';
  enabled boolean := false;
  can_configure boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO config FROM private.cs_ia_reading_config WHERE client_id = p_client_id;
  can_configure := allowed AND coalesce(config.enabled AND config.owner_id = auth.uid(), false);

  IF private.cs_ia_client_exists(p_client_id) THEN
    SELECT g.conversation_id, following.starts_at IS NULL INTO group_id, channel_paused
    FROM private.cs_ia_reading_group(p_client_id) g
    CROSS JOIN LATERAL private.cs_ia_channel_state(g.channel_id, g.wa_client_id) following;
    IF group_id IS NOT NULL THEN
      can_configure := (allowed AND NOT channel_paused) OR can_configure;
      status := CASE WHEN channel_paused THEN 'channel_paused' ELSE 'disabled' END;
      IF private.cs_ia_reading_current(config) THEN
        enabled := true;
        status := 'waiting';
        SELECT source_at, fingerprint INTO source_time, source_fingerprint FROM private.cs_ia_reading_source(config);
        SELECT * INTO job FROM private.cs_ia_reading_jobs
          WHERE client_id = p_client_id AND revision = config.revision AND fingerprint = source_fingerprint;
        IF FOUND THEN
          status := CASE
            WHEN job.state = 'processing' AND job.lease_until <= now() THEN
              CASE WHEN job.charged_estimate IS NOT NULL OR job.attempts >= 3 THEN 'failed' ELSE 'waiting' END
            ELSE job.state
          END;
        END IF;
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'enabled', enabled,
    'include_audio', enabled AND config.include_audio,
    'transcribe_new_audio', enabled AND config.transcribe_audio_since IS NOT NULL,
    'can_configure', can_configure,
    'can_pause', allowed AND coalesce(config.enabled AND config.owner_id = auth.uid(), false),
    'status', status,
    'conversation_id', group_id,
    'wa_client_id', CASE WHEN enabled THEN config.wa_client_id END,
    'channel_id', CASE WHEN enabled THEN config.channel_id END,
    'group_jid', CASE WHEN enabled THEN config.group_jid END,
    'source_at', source_time,
    'finished_at', job.finished_at,
    'tone', job.result->'tone',
    'complaint', job.result->'complaint',
    'unresolved', job.result->'unresolved',
    'cancellation', job.result->'cancellation',
    'awaiting_client_reply', job.result->'awaiting_client_reply',
    'message_count', job.result->'message_count',
    'audio_missing', job.result->'audio_missing'
  );
END;
$$;

CREATE OR REPLACE FUNCTION private.cs_ia_set_reading(p_client_id uuid, p_enabled boolean, p_include_audio boolean,
  p_conversation_id uuid, p_transcribe_audio boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  group_source record;
  consent private.cs_ia_reading_config;
BEGIN
  IF auth.uid() IS NULL OR private.atlas_demand_owner() IS DISTINCT FROM true THEN
    RAISE insufficient_privilege USING MESSAGE = 'Titular autorizado do Atlas necessário.';
  END IF;
  IF p_enabled IS NULL OR p_include_audio IS NULL THEN
    RAISE invalid_parameter_value USING MESSAGE = 'Confirme as opções da leitura.';
  END IF;
  IF p_transcribe_audio AND NOT (p_enabled AND p_include_audio) THEN
    RAISE invalid_parameter_value USING MESSAGE = 'Ative a leitura e a inclusão de áudio para transcrever novos áudios.';
  END IF;

  IF NOT p_enabled THEN
    SELECT * INTO consent FROM private.cs_ia_reading_config
      WHERE client_id = p_client_id AND owner_id = auth.uid() FOR UPDATE;
    IF NOT FOUND THEN RETURN; END IF;
    IF (p_conversation_id IS NOT NULL AND p_conversation_id <> consent.conversation_id)
      OR (p_conversation_id IS NULL AND EXISTS (SELECT 1 FROM private.cs_ia_reading_group(p_client_id))) THEN
      RAISE invalid_parameter_value USING MESSAGE = 'O grupo da leitura mudou. Atualize a ficha e confirme o grupo.';
    END IF;
    UPDATE private.cs_ia_reading_config SET enabled = false, revision = gen_random_uuid(), include_audio = false, transcribe_audio_since = NULL
      WHERE client_id = consent.client_id AND enabled;
    RETURN;
  END IF;
  IF coalesce(private.cs_ia_role(), '') NOT IN ('admin', 'superadmin')
    OR NOT private.cs_ia_client_exists(p_client_id) THEN
    RAISE insufficient_privilege USING MESSAGE = 'Sem acesso à configuração de leitura do cliente.';
  END IF;
  SELECT * INTO group_source FROM private.cs_ia_reading_group(p_client_id);
  IF NOT FOUND THEN RAISE insufficient_privilege USING MESSAGE = 'Fonte do cliente indisponível para leitura.'; END IF;
  PERFORM 1 FROM public.cliente_whatsapp_config cfg
    WHERE cfg.id = group_source.channel_id AND cfg.cliente_id = group_source.wa_client_id
    FOR SHARE;
  IF NOT private.cs_ia_reading_owner_scope(auth.uid(), group_source.conversation_id) THEN
    RAISE insufficient_privilege USING MESSAGE = 'Fonte do cliente indisponível para leitura.';
  END IF;
  IF p_conversation_id IS DISTINCT FROM group_source.conversation_id THEN
    RAISE invalid_parameter_value USING MESSAGE = 'O grupo da leitura mudou. Atualize a ficha e confirme o grupo.';
  END IF;

  INSERT INTO private.cs_ia_reading_config AS c
    (client_id, owner_id, conversation_id, wa_client_id, channel_id, group_jid, include_audio, transcribe_audio_since)
    VALUES (p_client_id, auth.uid(), group_source.conversation_id, group_source.wa_client_id,
      group_source.channel_id, group_source.group_jid, p_include_audio, CASE WHEN p_transcribe_audio THEN clock_timestamp() END)
  ON CONFLICT (client_id) DO UPDATE SET
    owner_id = excluded.owner_id, conversation_id = excluded.conversation_id, wa_client_id = excluded.wa_client_id,
    channel_id = excluded.channel_id, group_jid = excluded.group_jid, enabled = true,
    revision = excluded.revision, include_audio = excluded.include_audio,
    transcribe_audio_since = CASE WHEN excluded.include_audio AND p_transcribe_audio IS DISTINCT FROM false THEN
      CASE WHEN c.enabled AND (c.owner_id, c.conversation_id, c.wa_client_id, c.channel_id, c.group_jid) =
        (excluded.owner_id, excluded.conversation_id, excluded.wa_client_id, excluded.channel_id, excluded.group_jid)
        THEN coalesce(c.transcribe_audio_since, excluded.transcribe_audio_since) ELSE excluded.transcribe_audio_since END
    END,
    enabled_at = CASE WHEN c.enabled AND
      (c.owner_id, c.conversation_id, c.wa_client_id, c.channel_id, c.group_jid) =
      (excluded.owner_id, excluded.conversation_id, excluded.wa_client_id, excluded.channel_id, excluded.group_jid)
      THEN c.enabled_at ELSE excluded.enabled_at END
  WHERE NOT c.enabled OR
    (c.owner_id, c.conversation_id, c.wa_client_id, c.channel_id, c.group_jid, c.include_audio) IS DISTINCT FROM
    (excluded.owner_id, excluded.conversation_id, excluded.wa_client_id, excluded.channel_id, excluded.group_jid, excluded.include_audio)
    OR (c.transcribe_audio_since IS NOT NULL) <> p_transcribe_audio;
END;
$$;

CREATE OR REPLACE FUNCTION private.cs_ia_reading_fresh(p_job private.cs_ia_reading_jobs)
RETURNS boolean LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  PERFORM 1 FROM private.cs_ia_reading_config
  WHERE client_id = p_job.client_id AND revision = p_job.revision FOR SHARE NOWAIT;
  IF NOT FOUND THEN RETURN false; END IF;

  RETURN EXISTS (
    SELECT 1 FROM private.cs_ia_reading_config config
    CROSS JOIN LATERAL private.cs_ia_reading_source(config) source
    WHERE config.client_id = p_job.client_id AND config.revision = p_job.revision
      AND private.cs_ia_reading_current(config) AND source.fingerprint = p_job.fingerprint
      AND source.source_at <= now() - interval '1 hour'
  );
EXCEPTION WHEN lock_not_available THEN RETURN false;
END;
$$;

COMMIT;

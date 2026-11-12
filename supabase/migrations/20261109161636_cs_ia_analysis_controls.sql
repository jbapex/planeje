BEGIN;

-- A fila de leitura pode atualizar tarefas. O controle de análise tem sua própria linha de bloqueio.
CREATE TABLE public.cs_ia_analysis_settings (
  id integer PRIMARY KEY CHECK (id = 1),
  reading_enabled boolean NOT NULL DEFAULT true,
  transcription_enabled boolean NOT NULL DEFAULT true,
  version uuid NOT NULL DEFAULT gen_random_uuid()
);

INSERT INTO public.cs_ia_analysis_settings (id) VALUES (1);
ALTER TABLE public.cs_ia_analysis_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cs_ia_analysis_settings FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.cs_ia_analysis_settings TO authenticated;
GRANT UPDATE (reading_enabled, transcription_enabled) ON public.cs_ia_analysis_settings TO authenticated;

CREATE POLICY cs_ia_analysis_settings_read ON public.cs_ia_analysis_settings FOR SELECT TO authenticated
  USING ((SELECT private.cs_ia_role()) IS NOT NULL);
CREATE POLICY cs_ia_analysis_settings_update ON public.cs_ia_analysis_settings FOR UPDATE TO authenticated
  USING ((SELECT private.cs_ia_role()) IN ('admin', 'superadmin'))
  WITH CHECK ((SELECT private.cs_ia_role()) IN ('admin', 'superadmin'));

CREATE FUNCTION private.cs_ia_sync_analysis_controls()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  reading_changed boolean := NEW.reading_enabled <> OLD.reading_enabled;
  audio_changed boolean := NEW.transcription_enabled <> OLD.transcription_enabled;
  changed_at timestamptz := clock_timestamp();
BEGIN
  IF NOT (reading_changed OR audio_changed) THEN RETURN NEW; END IF;
  NEW.version := gen_random_uuid();

  UPDATE private.cs_ia_reading_config
  SET revision = CASE WHEN reading_changed THEN NEW.version ELSE revision END,
    enabled_at = CASE WHEN reading_changed AND NEW.reading_enabled THEN changed_at ELSE enabled_at END,
    transcribe_audio_since = CASE WHEN audio_changed AND transcribe_audio_since IS NOT NULL THEN changed_at
      ELSE transcribe_audio_since END,
    task_moves_revision = CASE WHEN reading_changed AND task_moves_revision = revision THEN NEW.version
      ELSE task_moves_revision END,
    task_moves_since = CASE WHEN reading_changed AND NEW.reading_enabled AND task_moves_revision = revision
      THEN greatest(task_moves_since, changed_at) ELSE task_moves_since END
  WHERE enabled AND (reading_changed OR (audio_changed AND transcribe_audio_since IS NOT NULL));
  RETURN NEW;
END;
$$;

CREATE TRIGGER cs_ia_sync_analysis_controls BEFORE UPDATE OF reading_enabled, transcription_enabled
  ON public.cs_ia_analysis_settings FOR EACH ROW EXECUTE FUNCTION private.cs_ia_sync_analysis_controls();

CREATE FUNCTION private.cs_ia_reading_source_current(p_config private.cs_ia_reading_config)
RETURNS boolean LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT p_config.enabled AND private.cs_ia_reading_owner_scope(p_config.owner_id, p_config.conversation_id)
    AND EXISTS (
      SELECT 1 FROM private.cs_ia_reading_group(p_config.client_id) g
      WHERE (g.conversation_id, g.wa_client_id, g.channel_id, g.group_jid)
        = (p_config.conversation_id, p_config.wa_client_id, p_config.channel_id, p_config.group_jid)
    );
$$;

CREATE OR REPLACE FUNCTION private.cs_ia_reading_current(p_config private.cs_ia_reading_config)
RETURNS boolean LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT (SELECT reading_enabled FROM public.cs_ia_analysis_settings WHERE id = 1)
    AND private.cs_ia_reading_source_current(p_config);
$$;

CREATE OR REPLACE FUNCTION private.cs_ia_reading_state(p_client_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  config private.cs_ia_reading_config;
  job private.cs_ia_reading_jobs;
  group_id uuid;
  channel_paused boolean;
  global_settings public.cs_ia_analysis_settings;
  source_enabled boolean := false;
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
      SELECT * INTO global_settings FROM public.cs_ia_analysis_settings WHERE id = 1;
      status := CASE WHEN channel_paused THEN 'channel_paused'
        WHEN NOT global_settings.reading_enabled THEN 'global_paused' ELSE 'disabled' END;
      source_enabled := coalesce(private.cs_ia_reading_source_current(config), false);
      IF source_enabled AND global_settings.reading_enabled THEN
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
    'include_audio', source_enabled AND config.include_audio,
    'transcribe_new_audio', source_enabled AND config.transcribe_audio_since IS NOT NULL,
    'transcription_paused', source_enabled AND config.transcribe_audio_since IS NOT NULL
      AND NOT global_settings.transcription_enabled,
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

CREATE OR REPLACE FUNCTION private.cs_ia_audio_current(p_job public.atlas_audio_transcripts)
RETURNS boolean LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT (SELECT transcription_enabled FROM public.cs_ia_analysis_settings WHERE id = 1)
    AND EXISTS (
    SELECT 1 FROM private.cs_ia_reading_config c
    JOIN public.cliente_whatsapp_inbox i ON i.id = p_job.inbox_id
    WHERE c.client_id = p_job.cs_client_id AND c.owner_id = p_job.owner_id
      AND c.transcribe_audio_since = p_job.cs_audio_since
      AND c.conversation_id = p_job.conversation_id
      AND (i.conversation_id, i.cliente_id, i.whatsapp_config_id) = (c.conversation_id, c.wa_client_id, c.channel_id)
      AND i.is_group AND i.media_purged_at IS NULL
      AND lower(i.type) IN ('audio','ptt','myaudio','voice','voicemessage','voice_message','audiomessage')
      AND i.created_at > greatest(c.transcribe_audio_since, now() - interval '24 hours')
      AND i.msg_timestamp > c.transcribe_audio_since AND i.msg_timestamp <= now()
      AND private.cs_ia_reading_source_current(c)
  );
$$;

CREATE OR REPLACE FUNCTION private.cs_ia_claim_audio(p_owner uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  job public.atlas_audio_transcripts;
  candidate record;
  today date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' OR auth.uid() IS NOT NULL THEN
    RAISE insufficient_privilege USING MESSAGE = 'Worker exclusivo.';
  END IF;

  IF NOT (SELECT transcription_enabled FROM public.cs_ia_analysis_settings WHERE id = 1) THEN RETURN NULL; END IF;

  -- Serializa a reserva diária do titular, inclusive entre instâncias do worker.
  PERFORM 1 FROM public.atlas_settings s WHERE s.id = 'atlas' AND s.enabled AND s.owner_id = p_owner FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;

  UPDATE public.atlas_audio_transcripts
    SET status = 'unavailable', error_code = 'AUDIO_LEASE_LOST', lease_token = NULL, lease_until = NULL, finished_at = now()
    WHERE owner_id = p_owner AND cs_client_id IS NOT NULL AND status = 'processing' AND lease_until <= now();
  IF EXISTS (SELECT 1 FROM private.cs_ia_audio_budget WHERE owner_id = p_owner AND usage_day = today AND reserved = 5) THEN
    RETURN NULL;
  END IF;

  SELECT c.client_id, c.conversation_id, c.transcribe_audio_since, next_audio.id INTO candidate
  FROM private.cs_ia_reading_config c
  CROSS JOIN LATERAL (
    SELECT i.id, i.created_at FROM public.cliente_whatsapp_inbox i
    WHERE (i.conversation_id, i.cliente_id, i.whatsapp_config_id) = (c.conversation_id, c.wa_client_id, c.channel_id)
      AND i.is_group AND i.media_purged_at IS NULL
      AND lower(i.type) IN ('audio','ptt','myaudio','voice','voicemessage','voice_message','audiomessage')
      AND i.created_at > greatest(c.transcribe_audio_since, now() - interval '24 hours')
      AND i.msg_timestamp > c.transcribe_audio_since AND i.msg_timestamp <= now()
      AND NOT EXISTS (SELECT 1 FROM public.atlas_audio_transcripts t WHERE t.inbox_id = i.id)
    ORDER BY i.created_at, i.id LIMIT 1
  ) next_audio
  WHERE c.owner_id = p_owner AND c.transcribe_audio_since IS NOT NULL AND private.cs_ia_reading_source_current(c)
  ORDER BY next_audio.created_at, next_audio.id LIMIT 1 FOR SHARE OF c SKIP LOCKED;
  IF NOT FOUND THEN RETURN NULL; END IF;

  INSERT INTO public.atlas_audio_transcripts
    (inbox_id, owner_id, conversation_id, cs_client_id, cs_audio_since, status, attempt, lease_token, lease_until)
  VALUES (candidate.id, p_owner, candidate.conversation_id, candidate.client_id, candidate.transcribe_audio_since,
    'processing', 1, gen_random_uuid(), now() + interval '3 minutes')
  ON CONFLICT (inbox_id) DO NOTHING RETURNING * INTO job;
  IF NOT FOUND THEN RETURN NULL; END IF;

  INSERT INTO private.cs_ia_audio_budget AS budget (owner_id, usage_day, reserved) VALUES (p_owner, today, 1)
  ON CONFLICT (owner_id, usage_day) DO UPDATE SET reserved = budget.reserved + 1;
  RETURN jsonb_build_object('inbox_id', job.inbox_id, 'owner_id', job.owner_id, 'conversation_id', job.conversation_id,
    'cs_client_id', job.cs_client_id, 'lease_token', job.lease_token);
END;
$$;

CREATE OR REPLACE FUNCTION private.cs_ia_audio_can_process(p_inbox_id uuid, p_lease uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' OR auth.uid() IS NOT NULL THEN RETURN false; END IF;
  PERFORM 1 FROM public.atlas_audio_transcripts t
    JOIN private.cs_ia_reading_config c ON c.client_id = t.cs_client_id
      AND c.transcribe_audio_since = t.cs_audio_since
    WHERE t.inbox_id = p_inbox_id AND t.lease_token = p_lease AND t.lease_until > now() AND t.status = 'processing'
      AND private.cs_ia_audio_current(t)
    FOR SHARE OF c NOWAIT;
  RETURN FOUND;
EXCEPTION WHEN lock_not_available THEN RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION private.cs_ia_sync_analysis_controls(),
  private.cs_ia_reading_source_current(private.cs_ia_reading_config) FROM PUBLIC, anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;

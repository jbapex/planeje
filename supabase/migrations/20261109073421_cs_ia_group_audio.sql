BEGIN;

ALTER TABLE public.atlas_audio_transcripts
  ADD COLUMN cs_client_id uuid,
  ADD COLUMN cs_audio_since timestamptz,
  ADD CHECK ((cs_client_id IS NULL) = (cs_audio_since IS NULL));

CREATE TABLE private.cs_ia_audio_budget (
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  usage_day date NOT NULL,
  reserved smallint NOT NULL CHECK (reserved BETWEEN 1 AND 5),
  PRIMARY KEY (owner_id, usage_day)
);
ALTER TABLE private.cs_ia_audio_budget ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.cs_ia_audio_budget FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION private.cs_ia_audio_current(p_job public.atlas_audio_transcripts)
RETURNS boolean LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM private.cs_ia_reading_config c
    JOIN public.cliente_whatsapp_inbox i ON i.id = p_job.inbox_id
    WHERE c.client_id = p_job.cs_client_id AND c.owner_id = p_job.owner_id
      AND c.transcribe_audio_since = p_job.cs_audio_since
      AND c.conversation_id = p_job.conversation_id
      AND (i.conversation_id, i.cliente_id, i.whatsapp_config_id) = (c.conversation_id, c.wa_client_id, c.channel_id)
      AND i.is_group AND i.media_purged_at IS NULL
      AND lower(i.type) IN ('audio','ptt','myaudio','voice','voicemessage','voice_message','audiomessage')
      AND i.created_at > greatest(c.transcribe_audio_since, c.enabled_at, now() - interval '24 hours')
      AND i.msg_timestamp > c.transcribe_audio_since AND i.msg_timestamp <= now()
      AND private.cs_ia_reading_current(c)
  );
$$;

CREATE FUNCTION private.cs_ia_claim_audio(p_owner uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  job public.atlas_audio_transcripts;
  candidate record;
  today date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' OR auth.uid() IS NOT NULL THEN
    RAISE insufficient_privilege USING MESSAGE = 'Worker exclusivo.';
  END IF;

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
      AND i.created_at > greatest(c.transcribe_audio_since, c.enabled_at, now() - interval '24 hours')
      AND i.msg_timestamp > c.transcribe_audio_since AND i.msg_timestamp <= now()
      AND NOT EXISTS (SELECT 1 FROM public.atlas_audio_transcripts t WHERE t.inbox_id = i.id)
    ORDER BY i.created_at, i.id LIMIT 1
  ) next_audio
  WHERE c.owner_id = p_owner AND c.transcribe_audio_since IS NOT NULL AND private.cs_ia_reading_current(c)
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

CREATE FUNCTION private.cs_ia_audio_can_process(p_inbox_id uuid, p_lease uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' OR auth.uid() IS NOT NULL THEN RETURN false; END IF;
  PERFORM 1 FROM public.atlas_audio_transcripts t
    JOIN private.cs_ia_reading_config c ON c.client_id = t.cs_client_id
    WHERE t.inbox_id = p_inbox_id AND t.lease_token = p_lease AND t.lease_until > now() AND t.status = 'processing'
      AND private.cs_ia_audio_current(t)
    FOR SHARE OF c NOWAIT;
  RETURN FOUND;
EXCEPTION WHEN lock_not_available THEN RETURN false;
END;
$$;

CREATE FUNCTION public.cs_ia_audio_claim(p_owner uuid)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT private.cs_ia_claim_audio(p_owner);
$$;

CREATE FUNCTION public.cs_ia_audio_can_process(p_inbox_id uuid, p_lease uuid)
RETURNS boolean LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT private.cs_ia_audio_can_process(p_inbox_id, p_lease);
$$;

REVOKE ALL ON FUNCTION private.cs_ia_audio_current(public.atlas_audio_transcripts), private.cs_ia_claim_audio(uuid),
  private.cs_ia_audio_can_process(uuid,uuid), public.cs_ia_audio_claim(uuid), public.cs_ia_audio_can_process(uuid,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.cs_ia_claim_audio(uuid), private.cs_ia_audio_can_process(uuid,uuid),
  public.cs_ia_audio_claim(uuid), public.cs_ia_audio_can_process(uuid,uuid) TO service_role;

-- O worker legado continua com sua fila, política de origem e tentativas.
CREATE OR REPLACE FUNCTION public.atlas_audio_claim() RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE j public.atlas_audio_transcripts; own uuid;
BEGIN
 IF auth.role()<>'service_role' THEN RAISE EXCEPTION 'ATLAS_WORKER_ONLY' USING ERRCODE='42501'; END IF;
 SELECT s.owner_id INTO own FROM public.atlas_settings s JOIN public.profiles p ON p.id=s.owner_id
 WHERE s.id='atlas' AND s.enabled AND s.transcribe_group_audio AND p.status='active' AND p.role IN ('admin','superadmin','colaborador');
 IF own IS NULL THEN RETURN NULL; END IF;
 UPDATE public.atlas_audio_transcripts t SET status='unavailable',error_code='SOURCE_UNAVAILABLE',lease_token=NULL,lease_until=NULL,finished_at=now()
 WHERE t.owner_id=own AND t.cs_client_id IS NULL AND t.status IN ('queued','processing','failed') AND NOT EXISTS(
   SELECT 1 FROM public.cliente_whatsapp_inbox i JOIN public.atendimento_conversas c ON c.id=i.conversation_id
   WHERE i.id=t.inbox_id AND c.id=t.conversation_id AND i.cliente_id=c.cliente_id AND i.is_group AND c.is_group AND NOT c.bloqueada AND c.archived_at IS NULL
   AND i.media_purged_at IS NULL AND i.created_at>now()-interval '35 days');
 UPDATE public.atlas_audio_transcripts SET status='unavailable',error_code='RETRY_LIMIT',lease_token=NULL,lease_until=NULL,finished_at=now()
 WHERE owner_id=own AND cs_client_id IS NULL AND attempt>=3 AND status IN ('processing','failed') AND coalesce(lease_until,retry_at)<now();
 SELECT t.* INTO j FROM public.atlas_audio_transcripts t JOIN public.cliente_whatsapp_inbox i ON i.id=t.inbox_id
 JOIN public.atendimento_conversas c ON c.id=t.conversation_id
 WHERE t.owner_id=own AND t.cs_client_id IS NULL AND t.attempt<3
 AND (t.status IN ('queued','failed') AND t.retry_at<=now() OR t.status='processing' AND t.lease_until<now())
 AND i.conversation_id=c.id AND i.is_group AND c.is_group AND NOT c.bloqueada AND c.archived_at IS NULL
 AND i.media_purged_at IS NULL AND i.created_at>now()-interval '35 days'
 ORDER BY t.created_at FOR UPDATE OF t SKIP LOCKED LIMIT 1;
 IF NOT FOUND THEN RETURN NULL; END IF;
 UPDATE public.atlas_audio_transcripts SET status='processing',attempt=attempt+1,lease_token=gen_random_uuid(),lease_until=now()+interval '3 minutes'
 WHERE inbox_id=j.inbox_id RETURNING * INTO j;
 RETURN to_jsonb(j);
END $$;

CREATE OR REPLACE FUNCTION public.atlas_audio_finish(p_inbox_id uuid,p_lease uuid,p_text text DEFAULT NULL,p_model text DEFAULT NULL,p_hash text DEFAULT NULL,p_usage jsonb DEFAULT '{}',p_error text DEFAULT NULL,p_permanent boolean DEFAULT false) RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE j public.atlas_audio_transcripts;
BEGIN
 IF auth.role()<>'service_role' THEN RAISE EXCEPTION 'ATLAS_WORKER_ONLY' USING ERRCODE='42501'; END IF;
 SELECT * INTO j FROM public.atlas_audio_transcripts WHERE inbox_id=p_inbox_id AND status='processing' AND lease_token=p_lease AND lease_until>now() FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 IF j.cs_client_id IS NOT NULL THEN
   IF NOT private.cs_ia_audio_can_process(p_inbox_id,p_lease) THEN RETURN false; END IF;
 ELSE
   IF NOT EXISTS(SELECT 1 FROM public.atlas_settings s JOIN public.profiles p ON p.id=s.owner_id WHERE s.id='atlas' AND s.enabled AND s.transcribe_group_audio AND s.owner_id=j.owner_id AND p.status='active') THEN RETURN false; END IF;
   IF NOT EXISTS(SELECT 1 FROM public.cliente_whatsapp_inbox i JOIN public.atendimento_conversas c ON c.id=i.conversation_id WHERE i.id=j.inbox_id AND c.id=j.conversation_id AND c.is_group AND NOT c.bloqueada AND c.archived_at IS NULL) THEN RETURN false; END IF;
 END IF;
 IF p_error IS NULL AND char_length(coalesce(btrim(p_text),'')) NOT BETWEEN 1 AND 30000 THEN RAISE EXCEPTION 'ATLAS_EMPTY_TRANSCRIPT'; END IF;
 UPDATE public.atlas_audio_transcripts SET status=CASE WHEN p_error IS NULL THEN 'completed'
   WHEN p_permanent OR attempt>=3 OR cs_client_id IS NOT NULL THEN 'unavailable' ELSE 'failed' END,
 transcript=CASE WHEN p_error IS NULL THEN btrim(p_text) END, model=p_model,audio_hash=p_hash,usage=coalesce(p_usage,'{}'),error_code=left(p_error,80),
 retry_at=now()+interval '5 minutes',lease_token=NULL,lease_until=NULL,finished_at=now() WHERE inbox_id=j.inbox_id;
 RETURN true;
END $$;

NOTIFY pgrst, 'reload schema';
COMMIT;

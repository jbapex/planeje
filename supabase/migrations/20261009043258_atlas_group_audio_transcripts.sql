-- Private, source-linked transcripts for the Atlas owner. No WhatsApp sends.
BEGIN;
ALTER TABLE public.atlas_settings ADD COLUMN transcribe_group_audio boolean NOT NULL DEFAULT false;
ALTER TABLE public.atlas_settings ADD COLUMN audio_since timestamptz NOT NULL DEFAULT now();
CREATE TABLE public.atlas_audio_transcripts (
  inbox_id uuid PRIMARY KEY REFERENCES public.cliente_whatsapp_inbox(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES public.profiles(id),
  conversation_id uuid NOT NULL REFERENCES public.atendimento_conversas(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','processing','completed','failed','unavailable')),
  transcript text, model text, audio_hash text, usage jsonb NOT NULL DEFAULT '{}', error_code text,
  attempt integer NOT NULL DEFAULT 0, lease_token uuid, lease_until timestamptz,
  retry_at timestamptz NOT NULL DEFAULT now(), created_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz,
  CHECK ((status='completed') = (transcript IS NOT NULL)),
  CHECK (transcript IS NULL OR char_length(btrim(transcript)) BETWEEN 1 AND 30000)
);
CREATE INDEX atlas_audio_queue ON public.atlas_audio_transcripts(retry_at,created_at) WHERE status IN ('queued','processing','failed');
CREATE INDEX atlas_audio_conversation ON public.atlas_audio_transcripts(owner_id,conversation_id);
ALTER TABLE public.atlas_audio_transcripts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.atlas_audio_transcripts FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.atlas_audio_transcripts TO authenticated;
GRANT ALL ON public.atlas_audio_transcripts TO service_role;
CREATE POLICY atlas_audio_private_read ON public.atlas_audio_transcripts FOR SELECT TO authenticated USING (
 owner_id=(SELECT auth.uid()) AND (SELECT public.atlas_is_owner())
 AND EXISTS(SELECT 1 FROM public.cliente_whatsapp_inbox i JOIN public.atendimento_conversas c ON c.id=i.conversation_id
 WHERE i.id=inbox_id AND c.id=atlas_audio_transcripts.conversation_id AND c.is_group AND NOT c.bloqueada AND c.archived_at IS NULL)
);
-- Only the server worker supplies group IDs, after reading agency groups under the owner's RLS.
CREATE FUNCTION public.atlas_audio_enqueue(p_conversation_ids uuid[]) RETURNS integer
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE own uuid; since_at timestamptz; total integer;
BEGIN
 IF auth.role()<>'service_role' THEN RAISE EXCEPTION 'ATLAS_WORKER_ONLY' USING ERRCODE='42501'; END IF;
 SELECT s.owner_id,greatest(s.audio_since,now()-interval '35 days') INTO own,since_at FROM public.atlas_settings s JOIN public.profiles p ON p.id=s.owner_id
 WHERE s.id='atlas' AND s.enabled AND s.transcribe_group_audio AND p.status='active' AND p.role IN ('admin','superadmin','colaborador');
 IF own IS NULL THEN RETURN 0; END IF;
 INSERT INTO public.atlas_audio_transcripts(inbox_id,owner_id,conversation_id)
 SELECT i.id,own,c.id FROM public.cliente_whatsapp_inbox i JOIN public.atendimento_conversas c ON c.id=i.conversation_id
 WHERE c.id=ANY(p_conversation_ids) AND c.is_group AND NOT c.bloqueada AND c.archived_at IS NULL
 AND i.is_group AND i.cliente_id=c.cliente_id AND i.media_purged_at IS NULL AND i.created_at>=since_at
 AND lower(i.type) IN ('audio','ptt','myaudio','voice','voicemessage','voice_message','audiomessage')
 AND NOT EXISTS(SELECT 1 FROM public.atlas_audio_transcripts t WHERE t.inbox_id=i.id)
 ORDER BY i.created_at LIMIT 30 ON CONFLICT(inbox_id) DO NOTHING;
 GET DIAGNOSTICS total=ROW_COUNT; RETURN total;
END $$;
CREATE FUNCTION public.atlas_audio_claim() RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE j public.atlas_audio_transcripts; own uuid;
BEGIN
 IF auth.role()<>'service_role' THEN RAISE EXCEPTION 'ATLAS_WORKER_ONLY' USING ERRCODE='42501'; END IF;
 SELECT s.owner_id INTO own FROM public.atlas_settings s JOIN public.profiles p ON p.id=s.owner_id
 WHERE s.id='atlas' AND s.enabled AND s.transcribe_group_audio AND p.status='active' AND p.role IN ('admin','superadmin','colaborador');
 IF own IS NULL THEN RETURN NULL; END IF;
 -- Expired/deleted/blocked sources must not remain queued forever.
 UPDATE public.atlas_audio_transcripts t SET status='unavailable',error_code='SOURCE_UNAVAILABLE',lease_token=NULL,lease_until=NULL,finished_at=now()
 WHERE t.owner_id=own AND t.status IN ('queued','processing','failed') AND NOT EXISTS(
   SELECT 1 FROM public.cliente_whatsapp_inbox i JOIN public.atendimento_conversas c ON c.id=i.conversation_id
   WHERE i.id=t.inbox_id AND c.id=t.conversation_id AND i.cliente_id=c.cliente_id AND i.is_group AND c.is_group AND NOT c.bloqueada AND c.archived_at IS NULL
   AND i.media_purged_at IS NULL AND i.created_at>now()-interval '35 days');
 -- A crash on the final attempt must not leave an eternal 'processing' label.
 UPDATE public.atlas_audio_transcripts SET status='unavailable',error_code='RETRY_LIMIT',lease_token=NULL,lease_until=NULL,finished_at=now()
 WHERE owner_id=own AND attempt>=3 AND status IN ('processing','failed') AND coalesce(lease_until,retry_at)<now();
 SELECT t.* INTO j FROM public.atlas_audio_transcripts t JOIN public.cliente_whatsapp_inbox i ON i.id=t.inbox_id
 JOIN public.atendimento_conversas c ON c.id=t.conversation_id
 WHERE t.owner_id=own AND t.attempt<3 AND (t.status IN ('queued','failed') AND t.retry_at<=now() OR t.status='processing' AND t.lease_until<now())
 AND i.conversation_id=c.id AND i.is_group AND c.is_group AND NOT c.bloqueada AND c.archived_at IS NULL
 AND i.media_purged_at IS NULL AND i.created_at>now()-interval '35 days'
 ORDER BY t.created_at FOR UPDATE OF t SKIP LOCKED LIMIT 1;
 IF NOT FOUND THEN RETURN NULL; END IF;
 UPDATE public.atlas_audio_transcripts SET status='processing',attempt=attempt+1,lease_token=gen_random_uuid(),lease_until=now()+interval '3 minutes'
 WHERE inbox_id=j.inbox_id RETURNING * INTO j;
 RETURN to_jsonb(j);
END $$;
CREATE FUNCTION public.atlas_audio_finish(p_inbox_id uuid,p_lease uuid,p_text text DEFAULT NULL,p_model text DEFAULT NULL,p_hash text DEFAULT NULL,p_usage jsonb DEFAULT '{}',p_error text DEFAULT NULL,p_permanent boolean DEFAULT false) RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE j public.atlas_audio_transcripts;
BEGIN
 IF auth.role()<>'service_role' THEN RAISE EXCEPTION 'ATLAS_WORKER_ONLY' USING ERRCODE='42501'; END IF;
 SELECT * INTO j FROM public.atlas_audio_transcripts WHERE inbox_id=p_inbox_id AND status='processing' AND lease_token=p_lease AND lease_until>now() FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.atlas_settings s JOIN public.profiles p ON p.id=s.owner_id WHERE s.id='atlas' AND s.enabled AND s.transcribe_group_audio AND s.owner_id=j.owner_id AND p.status='active') THEN RETURN false; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.cliente_whatsapp_inbox i JOIN public.atendimento_conversas c ON c.id=i.conversation_id WHERE i.id=j.inbox_id AND c.id=j.conversation_id AND c.is_group AND NOT c.bloqueada AND c.archived_at IS NULL) THEN RETURN false; END IF;
 IF p_error IS NULL AND char_length(coalesce(btrim(p_text),'')) NOT BETWEEN 1 AND 30000 THEN RAISE EXCEPTION 'ATLAS_EMPTY_TRANSCRIPT'; END IF;
 UPDATE public.atlas_audio_transcripts SET status=CASE WHEN p_error IS NULL THEN 'completed' WHEN p_permanent OR attempt>=3 THEN 'unavailable' ELSE 'failed' END,
 transcript=CASE WHEN p_error IS NULL THEN btrim(p_text) END, model=p_model,audio_hash=p_hash,usage=coalesce(p_usage,'{}'),error_code=left(p_error,80),
 retry_at=now()+interval '5 minutes',lease_token=NULL,lease_until=NULL,finished_at=now() WHERE inbox_id=j.inbox_id;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.atlas_audio_enqueue(uuid[]),public.atlas_audio_claim(),public.atlas_audio_finish(uuid,uuid,text,text,text,jsonb,text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.atlas_audio_enqueue(uuid[]),public.atlas_audio_claim(),public.atlas_audio_finish(uuid,uuid,text,text,text,jsonb,text,boolean) TO service_role;
COMMIT;

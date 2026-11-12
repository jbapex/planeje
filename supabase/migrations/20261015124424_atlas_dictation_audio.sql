BEGIN;
CREATE TABLE public.atlas_dictations (
 id uuid PRIMARY KEY,owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 question_id uuid REFERENCES public.atlas_office_questions(id) ON DELETE CASCADE,
 content_hash text NOT NULL CHECK(content_hash ~ '^[a-f0-9]{64}$'),
 size_bytes integer NOT NULL CHECK(size_bytes BETWEEN 1 AND 6291456),
 seconds integer NOT NULL CHECK(seconds BETWEEN 1 AND 120),
 state text NOT NULL DEFAULT 'processing' CHECK(state IN ('processing','completed','failed','expired')),
 transcript text CHECK(char_length(transcript)<=12000),error_code text,
 created_at timestamptz NOT NULL DEFAULT now(),finished_at timestamptz,
 lease_until timestamptz NOT NULL DEFAULT now()+interval '180 seconds'
);
CREATE INDEX atlas_dictations_owner_created ON public.atlas_dictations(owner_id,created_at);
ALTER TABLE public.atlas_dictations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.atlas_dictations FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.atlas_dictations TO authenticated;
GRANT ALL ON public.atlas_dictations TO service_role;
CREATE POLICY atlas_dictations_human_read ON public.atlas_dictations FOR SELECT TO authenticated
 USING(owner_id=(SELECT auth.uid()) AND (SELECT public.atlas_is_owner()) AND (SELECT private.planeje_live_session())
 AND auth.jwt()->>'planeje_server_delegate' IS NULL AND auth.jwt()->>'session_id' IS NOT NULL);

CREATE FUNCTION public.atlas_dictation_reserve(p_owner_id uuid,p_id uuid,p_question_id uuid,p_hash text,p_size integer,p_seconds integer) RETURNS jsonb
 LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
 DECLARE old public.atlas_dictations;start_day timestamptz;
 BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.atlas_settings a JOIN public.profiles p ON p.id=a.owner_id WHERE a.id='atlas' AND a.enabled AND a.owner_id=p_owner_id AND p.status='active') THEN RAISE EXCEPTION 'DICTATION_FORBIDDEN';END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_owner_id::text,15124424));
  UPDATE public.atlas_dictations SET state='expired',transcript=NULL WHERE owner_id=p_owner_id AND state='completed' AND created_at<now()-interval '24 hours';
  UPDATE public.atlas_dictations SET state='failed',error_code='TIMEOUT' WHERE owner_id=p_owner_id AND state='processing' AND lease_until<now();
  DELETE FROM public.atlas_dictations WHERE owner_id=p_owner_id AND created_at<now()-interval '7 days';
  SELECT * INTO old FROM public.atlas_dictations WHERE id=p_id;
  IF old.id IS NOT NULL THEN
   IF old.owner_id<>p_owner_id OR old.content_hash<>p_hash OR old.question_id IS DISTINCT FROM p_question_id THEN RAISE EXCEPTION 'DICTATION_REQUEST_CHANGED';END IF;
   RETURN jsonb_build_object('state',old.state,'transcript',old.transcript,'fresh',false);
  END IF;
  IF p_question_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.atlas_office_questions WHERE id=p_question_id AND owner_id=p_owner_id AND state='open') THEN RAISE EXCEPTION 'DICTATION_QUESTION_CHANGED';END IF;
  start_day:=date_trunc('day',now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo';
  IF (SELECT count(*) FROM public.atlas_dictations WHERE owner_id=p_owner_id AND created_at>=start_day)>=40 THEN RETURN jsonb_build_object('state','limited','fresh',false);END IF;
  INSERT INTO public.atlas_dictations(id,owner_id,question_id,content_hash,size_bytes,seconds) VALUES(p_id,p_owner_id,p_question_id,p_hash,p_size,p_seconds);
  RETURN jsonb_build_object('state','processing','fresh',true);
 END $$;
REVOKE ALL ON FUNCTION public.atlas_dictation_reserve(uuid,uuid,uuid,text,integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.atlas_dictation_reserve(uuid,uuid,uuid,text,integer,integer) TO service_role;
COMMIT;

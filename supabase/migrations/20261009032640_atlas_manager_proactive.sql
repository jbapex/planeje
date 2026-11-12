BEGIN;
ALTER TABLE public.atlas_jobs ALTER COLUMN origin_run_id DROP NOT NULL;
ALTER TABLE public.atlas_jobs ADD COLUMN auto_key text;
ALTER TABLE public.atlas_jobs ADD CONSTRAINT atlas_job_origin CHECK ((origin_run_id IS NOT NULL) <> (auto_key IS NOT NULL));
CREATE UNIQUE INDEX atlas_auto_job_key ON public.atlas_jobs(owner_id,auto_key) WHERE auto_key IS NOT NULL;
CREATE FUNCTION public.atlas_enqueue_proactive(p_key text,p_title text,p_task text,p_client_id uuid DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE own uuid; conversation uuid; job uuid;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'ATLAS_WORKER_ONLY' USING ERRCODE='42501'; END IF;
 SELECT s.owner_id INTO own FROM public.atlas_settings s JOIN public.profiles p ON p.id=s.owner_id
 WHERE s.id='atlas' AND s.enabled AND s.monitor_enabled AND p.status='active' AND p.role IN ('admin','superadmin','colaborador');
 IF own IS NULL OR char_length(p_key) NOT BETWEEN 1 AND 150 THEN RETURN NULL; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('atlas-auto:'||own::text,0));
 SELECT id INTO job FROM public.atlas_jobs WHERE owner_id=own AND auto_key=p_key;
 IF FOUND THEN RETURN job; END IF;
 IF (SELECT count(*) FROM public.atlas_jobs WHERE owner_id=own AND status IN ('queued','running'))>=2 THEN RETURN NULL; END IF;
 INSERT INTO public.atlas_conversations(owner_id,client_id,title) VALUES(own,p_client_id,left(p_title,100)) RETURNING id INTO conversation;
 INSERT INTO public.atlas_jobs(owner_id,conversation_id,client_id,auto_key,title,task) VALUES(own,conversation,p_client_id,p_key,p_title,p_task) RETURNING id INTO job;
 RETURN job;
END $$;
REVOKE ALL ON FUNCTION public.atlas_enqueue_proactive(text,text,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.atlas_enqueue_proactive(text,text,text,uuid) TO service_role;
COMMIT;

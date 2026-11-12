-- Atlas manager: private knowledge, durable analytical missions and personal inbox.
-- Operational execution remains in tarefas. No external transport is enabled here.
BEGIN;
ALTER TABLE public.atlas_settings ADD COLUMN auto_memory boolean NOT NULL DEFAULT true;
ALTER TABLE public.atlas_settings ADD COLUMN monitor_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE public.atlas_memories DROP CONSTRAINT atlas_memories_source_check;
ALTER TABLE public.atlas_memories ADD CONSTRAINT atlas_memories_source_check CHECK (source IN ('user_confirmation','conversation','brainstorm'));
ALTER TABLE public.atlas_memories ADD COLUMN source_run_id uuid REFERENCES public.atlas_runs(id) ON DELETE RESTRICT;
ALTER TABLE public.atlas_memories ADD COLUMN source_quote text;
ALTER TABLE public.atlas_memories ADD COLUMN topic text NOT NULL DEFAULT 'geral';
ALTER TABLE public.atlas_memories ADD COLUMN pinned boolean NOT NULL DEFAULT false;
ALTER TABLE public.atlas_memories ADD COLUMN search_vector tsvector GENERATED ALWAYS AS (to_tsvector('portuguese', content)) STORED;
CREATE INDEX atlas_memory_search ON public.atlas_memories USING gin(search_vector) WHERE state = 'active';
CREATE UNIQUE INDEX atlas_memory_source_dedupe ON public.atlas_memories(owner_id,source_run_id,md5(content)) WHERE source_run_id IS NOT NULL;

CREATE TABLE public.atlas_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.profiles(id),
  conversation_id uuid NOT NULL,
  origin_run_id uuid NOT NULL UNIQUE REFERENCES public.atlas_runs(id),
  client_id uuid REFERENCES public.clientes(id),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 140),
  task text NOT NULL CHECK (char_length(task) BETWEEN 1 AND 12000),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','completed','failed','cancelled')),
  steps jsonb NOT NULL DEFAULT '[]', usage jsonb NOT NULL DEFAULT '{}', result text, error text,
  attempt integer NOT NULL DEFAULT 0, lease_token uuid, lease_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), started_at timestamptz, finished_at timestamptz,
  FOREIGN KEY (conversation_id,owner_id) REFERENCES public.atlas_conversations(id,owner_id)
);
CREATE INDEX atlas_jobs_queue ON public.atlas_jobs(created_at) WHERE status IN ('queued','running');
CREATE INDEX atlas_jobs_owner_conversation ON public.atlas_jobs(owner_id,conversation_id,created_at DESC);
CREATE TABLE public.atlas_inbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid NOT NULL REFERENCES public.profiles(id),
  source_key text NOT NULL, kind text NOT NULL CHECK(kind IN ('mission','atendimento','trafego','planejamento','sistema')),
  title text NOT NULL, body text NOT NULL, severity text NOT NULL DEFAULT 'info' CHECK(severity IN ('info','attention','critical')),
  client_id uuid REFERENCES public.clientes(id), conversation_id uuid REFERENCES public.atlas_conversations(id),
  job_id uuid REFERENCES public.atlas_jobs(id), evidence jsonb NOT NULL DEFAULT '{}',
  state text NOT NULL DEFAULT 'open' CHECK(state IN ('open','resolved','archived')),
  read_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(owner_id,source_key)
);
CREATE INDEX atlas_inbox_owner_state ON public.atlas_inbox(owner_id,state,updated_at DESC);
CREATE TABLE public.atlas_worker_state (
  id text PRIMARY KEY CHECK(id='atlas'), owner_id uuid NOT NULL REFERENCES public.profiles(id),
  heartbeat_at timestamptz NOT NULL, last_scan_at timestamptz, scan_summary jsonb NOT NULL DEFAULT '{}'
);
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['atlas_jobs','atlas_inbox','atlas_worker_state'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
    EXECUTE format('CREATE POLICY atlas_private_read ON public.%I FOR SELECT TO authenticated USING(owner_id=(SELECT auth.uid()) AND (SELECT public.atlas_is_owner()))',t);
  END LOOP;
END $$;
-- Caller can enqueue, but cannot impersonate a worker or manufacture a completed result.
GRANT INSERT ON public.atlas_jobs TO authenticated;
CREATE POLICY atlas_job_enqueue ON public.atlas_jobs FOR INSERT TO authenticated WITH CHECK (
 owner_id=(SELECT auth.uid()) AND (SELECT public.atlas_is_owner()) AND status='queued'
 AND result IS NULL AND error IS NULL AND attempt=0 AND lease_token IS NULL AND lease_until IS NULL
 AND started_at IS NULL AND finished_at IS NULL AND steps='[]'::jsonb AND usage='{}'::jsonb
 AND EXISTS(SELECT 1 FROM public.atlas_runs r WHERE r.id=origin_run_id AND r.owner_id=auth.uid()
   AND r.conversation_id=atlas_jobs.conversation_id AND (r.request_client_id IS NULL OR r.request_client_id=atlas_jobs.client_id))
 AND (client_id IS NULL OR EXISTS(SELECT 1 FROM public.clientes c WHERE c.id=client_id))
);
GRANT UPDATE(read_at,state) ON public.atlas_inbox TO authenticated;
CREATE POLICY atlas_inbox_read_mark ON public.atlas_inbox FOR UPDATE TO authenticated USING(owner_id=(SELECT auth.uid()) AND (SELECT public.atlas_is_owner())) WITH CHECK(owner_id=(SELECT auth.uid()) AND (SELECT public.atlas_is_owner()));

CREATE FUNCTION public.atlas_recall(p_query text,p_client_id uuid DEFAULT NULL) RETURNS SETOF public.atlas_memories
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT m.* FROM public.atlas_memories m
 WHERE owner_id=auth.uid() AND state='active' AND (client_id IS NULL OR client_id=p_client_id)
 ORDER BY pinned DESC, ts_rank(search_vector,websearch_to_tsquery('portuguese',array_to_string(tsvector_to_array(to_tsvector('portuguese',left(p_query,1000))),' OR '))) DESC, created_at DESC LIMIT 20;
$$;
CREATE FUNCTION public.atlas_learn(p_run_id uuid,p_content text,p_quote text,p_topic text,p_replaces_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE r public.atlas_runs; m public.atlas_memories; old public.atlas_memories; v integer:=1;
BEGIN
 IF NOT public.atlas_is_owner() THEN RAISE EXCEPTION 'ATLAS_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF NOT (SELECT auto_memory FROM public.atlas_settings WHERE id='atlas') THEN RETURN NULL; END IF;
 SELECT * INTO r FROM public.atlas_runs WHERE id=p_run_id AND owner_id=auth.uid();
 IF NOT FOUND OR char_length(btrim(p_content)) NOT BETWEEN 1 AND 1500 OR char_length(btrim(p_quote)) NOT BETWEEN 8 AND 1500
   OR strpos(lower(r.request_message),lower(btrim(p_quote)))=0 THEN RAISE EXCEPTION 'ATLAS_MEMORY_SOURCE_INVALID'; END IF;
 SELECT * INTO m FROM public.atlas_memories WHERE owner_id=auth.uid() AND source_run_id=r.id AND content=btrim(p_content);
 IF FOUND THEN RETURN to_jsonb(m); END IF;
 IF p_replaces_id IS NOT NULL THEN
   SELECT * INTO old FROM public.atlas_memories WHERE id=p_replaces_id AND owner_id=auth.uid() AND state='active' AND client_id IS NOT DISTINCT FROM r.request_client_id FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'ATLAS_MEMORY_CONFLICT'; END IF;
   UPDATE public.atlas_memories SET state='replaced' WHERE id=old.id; v:=old.version+1;
 END IF;
 INSERT INTO public.atlas_memories(owner_id,client_id,content,source,source_run_id,source_quote,topic,version,replaces_id)
 VALUES(auth.uid(),r.request_client_id,btrim(p_content),'conversation',r.id,btrim(p_quote),left(coalesce(p_topic,'geral'),80),v,p_replaces_id) RETURNING * INTO m;
 RETURN to_jsonb(m);
END $$;
CREATE FUNCTION public.atlas_worker_claim() RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE j public.atlas_jobs; own uuid;
BEGIN
 IF auth.role()<>'service_role' THEN RAISE EXCEPTION 'ATLAS_WORKER_ONLY' USING ERRCODE='42501'; END IF;
 SELECT s.owner_id INTO own FROM public.atlas_settings s JOIN public.profiles p ON p.id=s.owner_id
 WHERE s.id='atlas' AND s.enabled AND p.status='active' AND p.role IN ('admin','superadmin','colaborador');
 IF own IS NULL THEN RETURN NULL; END IF;
 -- A reclaimed mission gets a new lease; the old worker can no longer publish.
 SELECT * INTO j FROM public.atlas_jobs WHERE owner_id=own AND (status='queued' OR (status='running' AND lease_until<now()))
 ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1;
 IF NOT FOUND THEN RETURN NULL; END IF;
 UPDATE public.atlas_jobs SET status='running',attempt=attempt+1,lease_token=gen_random_uuid(),lease_until=now()+interval '4 minutes',started_at=coalesce(started_at,now()) WHERE id=j.id RETURNING * INTO j;
 RETURN to_jsonb(j);
END $$;
CREATE FUNCTION public.atlas_worker_finish(p_job_id uuid,p_lease uuid,p_status text,p_result text,p_error text,p_steps jsonb,p_usage jsonb) RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE j public.atlas_jobs;
BEGIN
 IF auth.role()<>'service_role' THEN RAISE EXCEPTION 'ATLAS_WORKER_ONLY' USING ERRCODE='42501'; END IF;
 IF p_status NOT IN ('completed','failed') THEN RAISE EXCEPTION 'ATLAS_INVALID_STATUS'; END IF;
 SELECT * INTO j FROM public.atlas_jobs WHERE id=p_job_id AND status='running' AND lease_token=p_lease AND lease_until>now() FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.atlas_settings s JOIN public.profiles p ON p.id=s.owner_id WHERE s.id='atlas' AND s.enabled AND s.owner_id=j.owner_id AND p.status='active') THEN RETURN false; END IF;
 IF p_status='completed' AND char_length(coalesce(btrim(p_result),'')) NOT BETWEEN 1 AND 20000 THEN RAISE EXCEPTION 'ATLAS_INVALID_REPLY'; END IF;
 UPDATE public.atlas_jobs SET status=p_status,result=p_result,error=p_error,steps=p_steps,usage=p_usage,finished_at=now(),lease_until=NULL WHERE id=j.id;
 INSERT INTO public.atlas_inbox(owner_id,source_key,kind,title,body,conversation_id,client_id,job_id,severity)
 VALUES(j.owner_id,'mission:'||j.id,'mission',j.title,left(coalesce(p_result,p_error,'Missão interrompida'),1200),j.conversation_id,j.client_id,j.id,CASE WHEN p_status='failed' THEN 'attention' ELSE 'info' END)
 ON CONFLICT(owner_id,source_key) DO NOTHING;
 UPDATE public.atlas_conversations SET updated_at=now() WHERE id=j.conversation_id;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.atlas_recall(text,uuid), public.atlas_learn(uuid,text,text,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.atlas_recall(text,uuid), public.atlas_learn(uuid,text,text,text,uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.atlas_worker_claim(),public.atlas_worker_finish(uuid,uuid,text,text,text,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.atlas_worker_claim(),public.atlas_worker_finish(uuid,uuid,text,text,text,jsonb,jsonb) TO service_role;
COMMENT ON TABLE public.atlas_jobs IS 'Missões analíticas privadas, com lease e resultado durável; não substituem Tarefas.';
COMMIT;

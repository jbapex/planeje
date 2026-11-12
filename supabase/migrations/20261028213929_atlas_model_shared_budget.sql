-- Model calls made by central specialists and operational investigation share the existing cap.
BEGIN;
ALTER TABLE public.atlas_jobs ADD COLUMN ready_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.atlas_team_requests ADD COLUMN ready_at timestamptz NOT NULL DEFAULT now();
CREATE TABLE private.atlas_model_calls(
 id uuid PRIMARY KEY,owner_id uuid NOT NULL REFERENCES public.profiles(id),
 request_id uuid REFERENCES public.atlas_team_requests(id),job_id uuid REFERENCES public.atlas_jobs(id),lease uuid NOT NULL,
 estimate integer NOT NULL CHECK(estimate BETWEEN 1 AND 1000000),usage_day date NOT NULL,
 state text NOT NULL DEFAULT 'reserved' CHECK(state IN('reserved','finished','expired')),
 expires_at timestamptz NOT NULL,actual_tokens integer,usage jsonb,created_at timestamptz NOT NULL DEFAULT now(),finished_at timestamptz,
 CHECK((request_id IS NOT NULL)<>(job_id IS NOT NULL))
);
CREATE INDEX atlas_model_calls_expiring ON private.atlas_model_calls(owner_id,expires_at) WHERE state='reserved';
ALTER TABLE private.atlas_model_calls ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.atlas_model_calls FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON private.atlas_model_calls TO service_role;

CREATE FUNCTION private.atlas_model_scope(p_request uuid,p_job uuid,p_lease uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE own uuid;r public.atlas_team_requests;j public.atlas_jobs;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'Worker exclusivo.' USING ERRCODE='42501';END IF;
 IF (p_request IS NULL)=(p_job IS NULL) THEN
  RAISE EXCEPTION 'Reserva de modelo sem origem única válida.' USING ERRCODE='22023';END IF;
 IF p_request IS NOT NULL THEN
  SELECT * INTO r FROM public.atlas_team_requests WHERE id=p_request FOR UPDATE;
  PERFORM private.atlas_team_request_context(p_request);
  SELECT owner_id INTO own FROM public.atlas_team_threads WHERE id=r.thread_id;
  IF r.id IS NULL OR r.state<>'processing' OR p_lease IS NULL OR r.lease IS DISTINCT FROM p_lease OR r.lease_until IS NULL OR r.lease_until<=now() THEN
   RAISE EXCEPTION 'Reserva operacional perdeu a concessão atual.' USING ERRCODE='42501';END IF;
 ELSE
  SELECT * INTO j FROM public.atlas_jobs WHERE id=p_job FOR UPDATE;
  own:=j.owner_id;
  IF j.id IS NULL OR j.status<>'running' OR p_lease IS NULL OR j.lease_token IS DISTINCT FROM p_lease OR j.lease_until IS NULL OR j.lease_until<=now()
   OR NOT private.atlas_source_session_exists(j.owner_id,j.source_session_id) THEN
   RAISE EXCEPTION 'Reserva central perdeu a missão ou sessão atual.' USING ERRCODE='42501';END IF;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.atlas_settings a JOIN public.profiles p ON p.id=a.owner_id
  WHERE a.id='atlas' AND a.owner_id=own AND a.enabled AND p.status='active' AND p.role IN('admin','superadmin')) THEN
  RAISE EXCEPTION 'Gestor atual indisponível.' USING ERRCODE='42501';END IF;
 RETURN own;
END $$;
REVOKE ALL ON FUNCTION private.atlas_model_scope(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.atlas_model_scope(uuid,uuid,uuid) TO service_role;

CREATE FUNCTION public.atlas_model_reserve(p_call uuid,p_estimate integer,p_request uuid DEFAULT NULL,p_job uuid DEFAULT NULL,p_lease uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE own uuid;c public.atlas_event_config;s public.atlas_office_state;
 existing private.atlas_model_calls;expired integer;pending_office integer;day date:=(now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'Worker exclusivo.' USING ERRCODE='42501';END IF;
 IF p_call IS NULL OR p_estimate IS NULL OR p_estimate NOT BETWEEN 1 AND 1000000 THEN
  RAISE EXCEPTION 'Estimativa de modelo inválida.' USING ERRCODE='22023';END IF;
 own:=private.atlas_model_scope(p_request,p_job,p_lease);
 -- The same owner lock is used by event claims; pending calls cannot race above the shared cap.
 SELECT * INTO c FROM public.atlas_event_config WHERE owner_id=own FOR UPDATE;
 IF c.owner_id IS NULL THEN RETURN jsonb_build_object('reserved',false,'reason','budget_unavailable');END IF;
 SELECT * INTO existing FROM private.atlas_model_calls WHERE id=p_call;
 IF existing.id IS NOT NULL THEN RETURN jsonb_build_object('reserved',false,'reason','call_already_recorded');END IF;
 IF c.usage_day IS DISTINCT FROM day THEN
  UPDATE public.atlas_event_config SET usage_day=day,used_tokens=0,model_calls=0,legacy_tokens=0,legacy_model_calls=0
   WHERE owner_id=own RETURNING * INTO c;
 END IF;
 SELECT * INTO s FROM public.atlas_office_state WHERE owner_id=own FOR SHARE;
 UPDATE public.atlas_event_config SET legacy_tokens=CASE WHEN s.usage_day=day THEN s.tokens_today ELSE 0 END,
  legacy_model_calls=CASE WHEN s.usage_day=day THEN s.calls_today ELSE 0 END WHERE owner_id=own RETURNING * INTO c;
 SELECT coalesce(sum(estimate),0) INTO expired FROM private.atlas_model_calls WHERE owner_id=own AND state='reserved' AND expires_at<=now();
 IF expired>0 THEN
  UPDATE private.atlas_model_calls SET state='expired',actual_tokens=estimate,finished_at=now() WHERE owner_id=own AND state='reserved' AND expires_at<=now();
  UPDATE public.atlas_event_config SET used_tokens=used_tokens+expired,reserved_tokens=greatest(0,reserved_tokens-expired) WHERE owner_id=own RETURNING * INTO c;
 END IF;
 pending_office:=CASE WHEN s.analysis_reservation IS NOT NULL THEN s.reservation_tokens ELSE 0 END;
 IF c.used_tokens::bigint+c.reserved_tokens+c.legacy_tokens+pending_office+p_estimate>c.max_tokens_per_day THEN
  RETURN jsonb_build_object('reserved',false,'reason','daily_budget');END IF;
 INSERT INTO private.atlas_model_calls(id,owner_id,request_id,job_id,lease,estimate,usage_day,expires_at)
 VALUES(p_call,own,p_request,p_job,p_lease,p_estimate,day,now()+interval '3 minutes');
 UPDATE public.atlas_event_config SET reserved_tokens=reserved_tokens+p_estimate,model_calls=model_calls+1 WHERE owner_id=own;
 RETURN jsonb_build_object('reserved',true,'call_id',p_call);
END $$;
CREATE FUNCTION public.atlas_model_defer(p_lease uuid,p_usage jsonb DEFAULT '{}',p_request uuid DEFAULT NULL,p_job uuid DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE own uuid;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'Worker exclusivo.' USING ERRCODE='42501';END IF;
 IF (p_request IS NULL)=(p_job IS NULL) OR p_usage IS NOT NULL AND jsonb_typeof(p_usage)<>'object' THEN
  RAISE EXCEPTION 'Espera de orçamento sem origem única válida.' USING ERRCODE='22023';END IF;
 IF p_request IS NOT NULL THEN
  PERFORM 1 FROM public.atlas_team_requests WHERE id=p_request AND state='processing' FOR UPDATE;
 ELSE
  PERFORM 1 FROM public.atlas_jobs WHERE id=p_job AND status='running' FOR UPDATE;
 END IF;
 IF NOT FOUND THEN RETURN false;END IF;
 own:=private.atlas_model_scope(p_request,p_job,p_lease);
 IF p_request IS NOT NULL THEN
  UPDATE public.atlas_team_requests SET state='queued',lease=NULL,lease_until=NULL,ready_at=now()+interval '15 minutes',
   result=coalesce(result,'{}')||jsonb_build_object('error_code','MANAGER_BUDGET_WAIT'),
   usage=private.atlas_team_merge_usage(usage,coalesce(p_usage,'{}')) WHERE id=p_request;
 ELSE
  UPDATE public.atlas_jobs SET status='queued',lease_token=NULL,lease_until=NULL,finished_at=NULL,
   ready_at=now()+interval '15 minutes',error='Aguardando teto diário de análises do Atlas.',attempt=greatest(0,attempt-1),
   usage=CASE WHEN coalesce(p_usage,'{}')='{}'::jsonb THEN usage ELSE p_usage END WHERE id=p_job;
 END IF;
 RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.atlas_team_claim() RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE r public.atlas_team_requests;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'Worker exclusivo.' USING ERRCODE='42501';END IF;
 UPDATE public.atlas_team_requests SET state='failed',result=coalesce(result,'{}')||'{"error_code":"WORKER_LEASE_EXPIRED"}' WHERE state='processing' AND coalesce(lease_until,coalesce(nullif(result->>'attempted_at','')::timestamptz,created_at)+interval '2 minutes')<now();
 SELECT * INTO r FROM public.atlas_team_requests WHERE state='queued' AND ready_at<=now() ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT 1;
 IF r.id IS NULL THEN RETURN NULL;END IF;
 UPDATE public.atlas_team_requests SET state='processing',lease=gen_random_uuid(),lease_until=now()+interval '3 minutes' WHERE id=r.id RETURNING * INTO r;
 RETURN jsonb_build_object('id',r.id,'thread_id',r.thread_id,'revision',r.thread_revision,'lease',r.lease,
 'message',(SELECT content FROM public.atlas_team_messages WHERE id=r.message_id));
END $$;

CREATE OR REPLACE FUNCTION public.atlas_worker_claim() RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE j public.atlas_jobs;own uuid;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'ATLAS_WORKER_ONLY' USING ERRCODE='42501';END IF;
 SELECT s.owner_id INTO own FROM public.atlas_settings s JOIN public.profiles p ON p.id=s.owner_id
 WHERE s.id='atlas' AND s.enabled AND p.status='active' AND p.role IN('admin','superadmin','colaborador');
 IF own IS NULL THEN RETURN NULL;END IF;
 SELECT * INTO j FROM public.atlas_jobs WHERE owner_id=own AND ready_at<=now() AND (status='queued' OR status='running' AND lease_until<now())
 ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1;
 IF NOT FOUND THEN RETURN NULL;END IF;
 UPDATE public.atlas_jobs SET status='running',attempt=attempt+1,lease_token=gen_random_uuid(),lease_until=now()+interval '4 minutes',started_at=coalesce(started_at,now()) WHERE id=j.id RETURNING * INTO j;
 RETURN to_jsonb(j);
END $$;

CREATE FUNCTION public.atlas_model_finish(p_call uuid,p_usage jsonb DEFAULT NULL) RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE call private.atlas_model_calls;own uuid;tokens integer;day date:=(now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'Worker exclusivo.' USING ERRCODE='42501';END IF;
 SELECT owner_id INTO own FROM private.atlas_model_calls WHERE id=p_call;
 IF own IS NULL THEN RETURN false;END IF;
 PERFORM 1 FROM public.atlas_event_config WHERE owner_id=own FOR UPDATE;
 SELECT * INTO call FROM private.atlas_model_calls WHERE id=p_call FOR UPDATE;
 IF call.state<>'reserved' THEN RETURN false;END IF;
 tokens:=CASE WHEN p_usage->>'total_tokens' ~ '^[0-9]{1,9}$' THEN (p_usage->>'total_tokens')::integer
  WHEN p_usage->>'prompt_tokens' ~ '^[0-9]{1,9}$' AND p_usage->>'completion_tokens' ~ '^[0-9]{1,9}$'
   THEN (p_usage->>'prompt_tokens')::integer+(p_usage->>'completion_tokens')::integer ELSE call.estimate END;
 UPDATE public.atlas_event_config SET
  used_tokens=CASE WHEN usage_day=day THEN used_tokens ELSE 0 END+tokens,
  model_calls=CASE WHEN usage_day=day THEN model_calls ELSE 0 END,
  legacy_tokens=CASE WHEN usage_day=day THEN legacy_tokens ELSE 0 END,
  legacy_model_calls=CASE WHEN usage_day=day THEN legacy_model_calls ELSE 0 END,
  usage_day=day,reserved_tokens=greatest(0,reserved_tokens-call.estimate) WHERE owner_id=own;
 UPDATE private.atlas_model_calls SET state='finished',usage=p_usage,actual_tokens=tokens,finished_at=now() WHERE id=p_call;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.atlas_model_reserve(uuid,integer,uuid,uuid,uuid),public.atlas_model_finish(uuid,jsonb),public.atlas_model_defer(uuid,jsonb,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.atlas_model_reserve(uuid,integer,uuid,uuid,uuid),public.atlas_model_finish(uuid,jsonb),public.atlas_model_defer(uuid,jsonb,uuid,uuid) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;

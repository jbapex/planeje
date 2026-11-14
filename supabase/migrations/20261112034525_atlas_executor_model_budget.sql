BEGIN;

ALTER TABLE private.atlas_model_calls ADD COLUMN run_id uuid REFERENCES public.atlas_runs(id);
ALTER TABLE private.atlas_model_calls DROP CONSTRAINT atlas_model_calls_check;
ALTER TABLE private.atlas_model_calls ADD CONSTRAINT atlas_model_calls_origin_check
  CHECK(num_nonnulls(request_id,job_id,run_id)=1);

-- The service never receives access to authentication tables, only this exact-session predicate.
CREATE FUNCTION private.atlas_executor_model_session(p_owner uuid,p_session uuid) RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' AS $$
  SELECT private.atlas_source_session_exists(p_owner,p_session) AND EXISTS(
    SELECT 1 FROM auth.users u JOIN auth.sessions s ON s.user_id=u.id
    WHERE u.id=p_owner AND s.id=p_session
      AND (u.banned_until IS NULL OR u.banned_until<clock_timestamp())
      AND (s.not_after IS NULL OR s.not_after>clock_timestamp())
  );
$$;
REVOKE ALL ON FUNCTION private.atlas_executor_model_session(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.atlas_executor_model_session(uuid,uuid) TO service_role;

CREATE FUNCTION public.atlas_executor_model_reserve(p_run uuid,p_call uuid,p_estimate integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE r public.atlas_runs;c public.atlas_event_config;s public.atlas_office_state;
  expired integer;pending_office integer;day date:=(now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  IF current_user<>'service_role' THEN RAISE EXCEPTION 'Reserva exclusiva do serviço Atlas.' USING ERRCODE='42501';END IF;
  IF p_run IS NULL OR p_call IS NULL OR p_estimate IS NULL OR p_estimate NOT BETWEEN 1 AND 1000000 THEN
    RAISE EXCEPTION 'Estimativa ou execução de modelo inválida.' USING ERRCODE='22023';END IF;
  SELECT * INTO r FROM public.atlas_runs WHERE id=p_run FOR UPDATE;
  IF r.id IS NULL OR r.status<>'processing' OR left(r.request_message,length(E'[Executor Planeje]\n')) IS DISTINCT FROM E'[Executor Planeje]\n' THEN
    RAISE EXCEPTION 'Execução conversacional indisponível.' USING ERRCODE='42501';END IF;
  SELECT * INTO c FROM public.atlas_event_config WHERE owner_id=r.owner_id FOR UPDATE;
  -- Permission changes committed while waiting for the shared owner lock must invalidate the call.
  IF NOT private.atlas_executor_model_session(r.owner_id,r.source_session_id)
    OR NOT EXISTS(SELECT 1 FROM public.atlas_settings a JOIN public.profiles p ON p.id=a.owner_id
      WHERE a.id='atlas' AND a.owner_id=r.owner_id AND a.enabled AND p.status='active' AND p.role IN('admin','superadmin','colaborador'))
    OR NOT coalesce((SELECT p.is_enabled FROM public.user_module_permissions p WHERE p.user_id=r.owner_id AND p.module_name::text='assistant'),
      (SELECT m.is_enabled FROM public.module_settings m WHERE m.module_name::text='assistant'),true)
  THEN RAISE EXCEPTION 'Titular, sessão ou módulo da execução indisponível.' USING ERRCODE='42501';END IF;
  IF c.owner_id IS NULL THEN RETURN jsonb_build_object('reserved',false,'reason','budget_unavailable');END IF;
  IF EXISTS(SELECT 1 FROM private.atlas_model_calls WHERE id=p_call) THEN RETURN jsonb_build_object('reserved',false,'reason','call_already_recorded');END IF;
  IF c.usage_day IS DISTINCT FROM day THEN
    UPDATE public.atlas_event_config SET usage_day=day,used_tokens=0,model_calls=0,legacy_tokens=0,legacy_model_calls=0
      WHERE owner_id=r.owner_id RETURNING * INTO c;
  END IF;
  SELECT * INTO s FROM public.atlas_office_state WHERE owner_id=r.owner_id FOR SHARE;
  UPDATE public.atlas_event_config SET legacy_tokens=CASE WHEN s.usage_day=day THEN s.tokens_today ELSE 0 END,
    legacy_model_calls=CASE WHEN s.usage_day=day THEN s.calls_today ELSE 0 END WHERE owner_id=r.owner_id RETURNING * INTO c;
  SELECT coalesce(sum(estimate),0) INTO expired FROM private.atlas_model_calls WHERE owner_id=r.owner_id AND state='reserved' AND expires_at<=now();
  IF expired>0 THEN
    UPDATE private.atlas_model_calls SET state='expired',actual_tokens=estimate,finished_at=now() WHERE owner_id=r.owner_id AND state='reserved' AND expires_at<=now();
    UPDATE public.atlas_event_config SET used_tokens=used_tokens+expired,reserved_tokens=greatest(0,reserved_tokens-expired) WHERE owner_id=r.owner_id RETURNING * INTO c;
  END IF;
  pending_office:=CASE WHEN s.analysis_reservation IS NOT NULL THEN s.reservation_tokens ELSE 0 END;
  IF c.used_tokens::bigint+c.reserved_tokens+c.legacy_tokens+pending_office+p_estimate>c.max_tokens_per_day THEN
    RETURN jsonb_build_object('reserved',false,'reason','daily_budget');END IF;
  INSERT INTO private.atlas_model_calls(id,owner_id,run_id,lease,estimate,usage_day,expires_at)
    VALUES(p_call,r.owner_id,r.id,r.id,p_estimate,day,now()+interval '3 minutes');
  UPDATE public.atlas_event_config SET reserved_tokens=reserved_tokens+p_estimate,model_calls=model_calls+1 WHERE owner_id=r.owner_id;
  RETURN jsonb_build_object('reserved',true,'call_id',p_call);
END $$;
REVOKE ALL ON FUNCTION public.atlas_executor_model_reserve(uuid,uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.atlas_executor_model_reserve(uuid,uuid,integer) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;

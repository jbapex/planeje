BEGIN;
-- Dates in onboarding follow the agency calendar, even after midnight in UTC.
CREATE FUNCTION public.calculate_client_onboarding_due_date(p_started_at timestamptz,p_days integer)
RETURNS date LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT (public.calculate_task_stage_deadline(
    ((p_started_at AT TIME ZONE 'America/Sao_Paulo')::date + time '12:00') AT TIME ZONE 'America/Sao_Paulo',p_days
  ) AT TIME ZONE 'America/Sao_Paulo')::date;
$$;
REVOKE ALL ON FUNCTION public.calculate_client_onboarding_due_date(timestamptz,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.calculate_client_onboarding_due_date(timestamptz,integer) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION planeje_private.activate_client_onboarding_stage(p_stage uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_stage public.client_onboarding_stages%ROWTYPE; v_run public.client_onboardings%ROWTYPE; v_task uuid; v_company text; v_started timestamptz:=clock_timestamp();
BEGIN
  SELECT * INTO STRICT v_stage FROM public.client_onboarding_stages WHERE id=p_stage FOR UPDATE;
  IF v_stage.task_id IS NOT NULL THEN RETURN v_stage.task_id; END IF;
  SELECT * INTO STRICT v_run FROM public.client_onboardings WHERE id=v_stage.onboarding_id;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id=v_stage.assignee_id AND status='active' AND role IN ('admin','superadmin','colaborador')) THEN
    RAISE EXCEPTION 'A próxima etapa está sem um responsável ativo. Ajuste o responsável antes de avançar.';
  END IF;
  SELECT empresa INTO v_company FROM public.clientes WHERE id=v_run.client_id;
  INSERT INTO public.tarefas(title,description,status,type,priority,client_id,owner_id,assignee_ids,due_date,demand_type,demand_origin,sla_days)
    VALUES ('['||coalesce(v_company,'Cliente')||'] Onboarding · '||v_stage.title,v_stage.instructions,
      'todo','onboarding','medium',v_run.client_id,v_run.created_by,ARRAY[v_stage.assignee_id],
      public.calculate_client_onboarding_due_date(v_started,v_stage.sla_days),'planned','internal',v_stage.sla_days) RETURNING id INTO v_task;
  UPDATE public.client_onboarding_stages SET state='active',task_id=v_task,started_at=v_started WHERE id=p_stage;
  RETURN v_task;
END;
$$;
NOTIFY pgrst,'reload schema';
COMMIT;

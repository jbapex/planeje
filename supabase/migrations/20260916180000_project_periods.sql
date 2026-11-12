BEGIN;
-- Existing projects retain their original month and deadlines. NULL end means one month.
ALTER TABLE public.projetos ADD COLUMN mes_fim date,
  ADD CONSTRAINT project_period_valid CHECK (mes_fim IS NULL OR (
    mes_referencia IS NOT NULL AND extract(day FROM mes_fim) = 1
    AND mes_fim >= date_trunc('month', mes_referencia)::date
  ));
CREATE INDEX project_client_period_end ON public.projetos(client_id, mes_fim);
CREATE FUNCTION public.project_covers_month(p_start date, p_end date, p_month date) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT p_start IS NOT NULL AND p_month IS NOT NULL
    AND pg_catalog.date_trunc('month', p_start)::date <= pg_catalog.date_trunc('month', p_month)::date
    AND pg_catalog.date_trunc('month', coalesce(p_end, p_start))::date >= pg_catalog.date_trunc('month', p_month)::date;
$$;
CREATE OR REPLACE FUNCTION public.start_client_monthly_project(p_client_id uuid, p_reference_month date) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_month date := date_trunc('month', p_reference_month)::date;
  v_project public.projetos;
  v_name text;
BEGIN
  IF auth.uid() IS NULL OR public.get_my_role() IS NULL OR public.get_my_role() = 'cliente' THEN RAISE EXCEPTION 'Sem permissão para iniciar planejamento'; END IF;
  IF v_month IS NULL THEN RAISE EXCEPTION 'Escolha o mês do planejamento'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_client_id::text, 0));
  SELECT * INTO v_project FROM public.projetos WHERE client_id = p_client_id AND public.project_covers_month(mes_referencia, mes_fim, v_month) ORDER BY created_at LIMIT 1;
  IF v_project.id IS NOT NULL THEN RETURN v_project.id; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.clientes WHERE id = p_client_id) THEN RAISE EXCEPTION 'Cliente não encontrado'; END IF;
  v_name := 'Plano de ' || (ARRAY['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'])[extract(month FROM v_month)::integer] || ' de ' || extract(year FROM v_month)::integer;
  INSERT INTO public.projetos(client_id, name, owner_id, mes_referencia, status)
    VALUES (p_client_id, v_name, auth.uid(), v_month, 'planejamento') RETURNING id INTO v_project.id;
  RETURN v_project.id;
END;
$$;
CREATE OR REPLACE FUNCTION public.project_planning_audit() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_before jsonb;
  v_after jsonb;
  v_due date;
  v_today date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  v_after := jsonb_build_object('mes_referencia', NEW.mes_referencia, 'mes_fim', NEW.mes_fim, 'planning_start_on', NEW.planning_start_on, 'plan_due_on', NEW.plan_due_on, 'approval_due_on', NEW.approval_due_on, 'first_week_due_on', NEW.first_week_due_on);
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.project_planning_history(project_id, action, to_stage, after_dates, changed_by)
      VALUES (NEW.id, 'created', NEW.status, v_after, auth.uid());
  ELSE
    v_before := jsonb_build_object('mes_referencia', OLD.mes_referencia, 'mes_fim', OLD.mes_fim, 'planning_start_on', OLD.planning_start_on, 'plan_due_on', OLD.plan_due_on, 'approval_due_on', OLD.approval_due_on, 'first_week_due_on', OLD.first_week_due_on);
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF OLD.workflow_managed THEN
        v_due := CASE lower(OLD.status) WHEN 'a_fazer' THEN OLD.planning_start_on WHEN 'planejamento' THEN OLD.plan_due_on WHEN 'aprovacao' THEN OLD.approval_due_on ELSE NULL END;
      END IF;
      INSERT INTO public.project_planning_history(project_id, action, from_stage, to_stage, due_on, late_days, before_dates, after_dates, changed_by)
        VALUES (NEW.id, 'stage_changed', OLD.status, NEW.status, v_due, greatest(coalesce(v_today - v_due, 0), 0), v_before, v_after, auth.uid());
    END IF;
    IF v_before IS DISTINCT FROM v_after THEN
      INSERT INTO public.project_planning_history(project_id, action, from_stage, to_stage, before_dates, after_dates, changed_by)
        VALUES (NEW.id, 'deadlines_changed', OLD.status, NEW.status, v_before, v_after, auth.uid());
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
NOTIFY pgrst, 'reload schema';
COMMIT;

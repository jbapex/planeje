BEGIN;

CREATE TABLE public.project_planning_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  automatic_pending boolean NOT NULL DEFAULT true,
  start_day integer NOT NULL DEFAULT 10 CHECK (start_day BETWEEN 1 AND 31),
  plan_day integer NOT NULL DEFAULT 15 CHECK (plan_day BETWEEN 1 AND 31),
  approval_day integer NOT NULL DEFAULT 20 CHECK (approval_day BETWEEN 1 AND 31),
  first_week_day integer NOT NULL DEFAULT 28 CHECK (first_week_day BETWEEN 1 AND 31),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  CHECK (start_day <= plan_day AND plan_day <= approval_day AND approval_day <= first_week_day)
);
INSERT INTO public.project_planning_settings(id) VALUES (true);
ALTER TABLE public.project_planning_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY project_planning_settings_read ON public.project_planning_settings FOR SELECT TO authenticated
  USING (public.get_my_role() IS NOT NULL AND public.get_my_role() <> 'cliente');
CREATE POLICY project_planning_settings_update ON public.project_planning_settings FOR UPDATE TO authenticated
  USING (public.get_my_role() IN ('superadmin', 'admin')) WITH CHECK (public.get_my_role() IN ('superadmin', 'admin'));
REVOKE ALL ON public.project_planning_settings FROM authenticated, anon;
GRANT SELECT, UPDATE ON public.project_planning_settings TO authenticated;
GRANT ALL ON public.project_planning_settings TO service_role;

ALTER TABLE public.projetos
  ADD COLUMN workflow_managed boolean NOT NULL DEFAULT false,
  ADD COLUMN planning_start_on date,
  ADD COLUMN plan_due_on date,
  ADD COLUMN approval_due_on date,
  ADD COLUMN first_week_due_on date,
  ADD COLUMN stage_entered_at timestamptz,
  ADD COLUMN plan_ready_at timestamptz,
  ADD COLUMN plan_approved_at timestamptz,
  ADD CONSTRAINT project_planning_dates_order CHECK (
    NOT workflow_managed OR (
      planning_start_on IS NOT NULL AND plan_due_on IS NOT NULL AND approval_due_on IS NOT NULL AND first_week_due_on IS NOT NULL
      AND planning_start_on <= plan_due_on AND plan_due_on <= approval_due_on AND approval_due_on <= first_week_due_on
    )
  );

CREATE TABLE public.project_planning_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES public.projetos(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('created', 'stage_changed', 'deadlines_changed')),
  from_stage text,
  to_stage text,
  due_on date,
  late_days integer NOT NULL DEFAULT 0,
  before_dates jsonb,
  after_dates jsonb,
  changed_at timestamptz NOT NULL DEFAULT now(),
  changed_by uuid
);
CREATE INDEX project_planning_history_project ON public.project_planning_history(project_id, changed_at DESC);
ALTER TABLE public.project_planning_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY project_planning_history_read ON public.project_planning_history FOR SELECT TO authenticated
  USING (public.get_my_role() IS NOT NULL AND public.get_my_role() <> 'cliente' AND EXISTS (SELECT 1 FROM public.projetos p WHERE p.id = project_id));
REVOKE ALL ON public.project_planning_history FROM authenticated, anon;
REVOKE ALL ON SEQUENCE public.project_planning_history_id_seq FROM authenticated, anon;
GRANT SELECT ON public.project_planning_history TO authenticated;
GRANT ALL ON public.project_planning_history TO service_role;

CREATE FUNCTION public.project_previous_month_day(p_month date, p_day integer) RETURNS date
LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT (date_trunc('month', p_month)::date - interval '1 month')::date
    + least(greatest(p_day, 1), extract(day FROM date_trunc('month', p_month)::date - 1)::integer) - 1;
$$;

CREATE FUNCTION public.project_planning_before_write() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_settings public.project_planning_settings;
  v_changed boolean;
  v_plan public.campaign_plans;
BEGIN
  IF TG_OP = 'INSERT' AND NEW.mes_referencia IS NOT NULL THEN
    NEW.workflow_managed := true;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.workflow_managed AND NOT NEW.workflow_managed THEN
    RAISE EXCEPTION 'Os prazos deste projeto já estão registrados. Ajuste as datas para manter o histórico.';
  END IF;
  IF NEW.workflow_managed THEN
    NEW.status := lower(btrim(coalesce(NEW.status, 'planejamento')));
    IF NEW.status NOT IN ('a_fazer', 'planejamento', 'aprovacao', 'execucao', 'concluido', 'pausado') THEN RAISE EXCEPTION 'Escolha uma etapa válida para o planejamento'; END IF;
  END IF;
  v_changed := TG_OP = 'INSERT';
  IF TG_OP = 'UPDATE' THEN v_changed := NEW.status IS DISTINCT FROM OLD.status; END IF;
  IF NEW.workflow_managed THEN
    IF TG_OP = 'INSERT' THEN
      SELECT * INTO v_settings FROM public.project_planning_settings WHERE id = true;
      NEW.planning_start_on := coalesce(NEW.planning_start_on, public.project_previous_month_day(NEW.mes_referencia, v_settings.start_day));
      NEW.plan_due_on := coalesce(NEW.plan_due_on, public.project_previous_month_day(NEW.mes_referencia, v_settings.plan_day));
      NEW.approval_due_on := coalesce(NEW.approval_due_on, public.project_previous_month_day(NEW.mes_referencia, v_settings.approval_day));
      NEW.first_week_due_on := coalesce(NEW.first_week_due_on, public.project_previous_month_day(NEW.mes_referencia, v_settings.first_week_day));
      NEW.plan_ready_at := NULL;
      NEW.plan_approved_at := NULL;
    ELSE
      NEW.plan_ready_at := OLD.plan_ready_at;
      NEW.plan_approved_at := OLD.plan_approved_at;
    END IF;
    IF v_changed AND lower(coalesce(NEW.status, '')) IN ('aprovacao', 'execucao', 'concluido') THEN
      SELECT * INTO v_plan FROM public.campaign_plans WHERE project_id = NEW.id ORDER BY updated_at DESC NULLS LAST, created_at DESC LIMIT 1;
      IF v_plan.id IS NULL OR (
        btrim(regexp_replace(replace(replace(replace(coalesce(v_plan.contexto_ia, ''), '&nbsp;', ' '), '&#160;', ' '), chr(160), ' '), '<[^>]*>', '', 'g')) = ''
        AND btrim(coalesce(v_plan.objetivo, '')) = ''
        AND NOT EXISTS (SELECT 1 FROM jsonb_each_text(coalesce(v_plan.estrategia_comunicacao, '{}'::jsonb)) WHERE btrim(value) <> '')
      ) OR coalesce(cardinality(v_plan.materiais), 0) = 0 THEN
        RAISE EXCEPTION 'Registre o planejamento e defina os materiais do mês antes de enviar para aprovação ou execução.';
      END IF;
      NEW.plan_ready_at := coalesce(NEW.plan_ready_at, now());
      IF lower(NEW.status) IN ('execucao', 'concluido') THEN NEW.plan_approved_at := coalesce(NEW.plan_approved_at, now()); END IF;
      IF NEW.status = 'concluido' AND EXISTS (
        SELECT 1 FROM unnest(v_plan.materiais) material WHERE NOT EXISTS (
          SELECT 1 FROM public.tarefas t LEFT JOIN public.task_statuses s ON s.value = t.status
          WHERE t.project_id = NEW.id AND t.plan_material_id::text = material->>'id'
            AND (s.is_terminal OR lower(t.status) IN ('published', 'done', 'completed', 'concluido', 'concluído', 'concluida', 'concluída'))
        )
      ) THEN RAISE EXCEPTION 'Conclua as tarefas dos materiais planejados antes de concluir o projeto.'; END IF;
    END IF;
  END IF;
  IF v_changed THEN NEW.stage_entered_at := now();
  ELSIF TG_OP = 'UPDATE' THEN NEW.stage_entered_at := OLD.stage_entered_at;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER project_planning_before_write BEFORE INSERT OR UPDATE ON public.projetos
  FOR EACH ROW EXECUTE FUNCTION public.project_planning_before_write();

CREATE FUNCTION public.project_planning_audit() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_before jsonb;
  v_after jsonb;
  v_due date;
  v_today date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  v_after := jsonb_build_object('planning_start_on', NEW.planning_start_on, 'plan_due_on', NEW.plan_due_on, 'approval_due_on', NEW.approval_due_on, 'first_week_due_on', NEW.first_week_due_on);
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.project_planning_history(project_id, action, to_stage, after_dates, changed_by)
      VALUES (NEW.id, 'created', NEW.status, v_after, auth.uid());
  ELSE
    v_before := jsonb_build_object('planning_start_on', OLD.planning_start_on, 'plan_due_on', OLD.plan_due_on, 'approval_due_on', OLD.approval_due_on, 'first_week_due_on', OLD.first_week_due_on);
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
CREATE TRIGGER project_planning_audit AFTER INSERT OR UPDATE ON public.projetos
  FOR EACH ROW EXECUTE FUNCTION public.project_planning_audit();

CREATE FUNCTION public.project_planning_settings_stamp() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at := now(); NEW.updated_by := auth.uid(); RETURN NEW; END;
$$;
CREATE TRIGGER project_planning_settings_stamp BEFORE UPDATE ON public.project_planning_settings
  FOR EACH ROW EXECUTE FUNCTION public.project_planning_settings_stamp();

-- The board itself is read-only. Persist a project only when someone starts its plan.
-- The lock makes repeated clicks / two users starting the same client-month idempotent.
CREATE FUNCTION public.start_client_monthly_project(p_client_id uuid, p_reference_month date) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_month date := date_trunc('month', p_reference_month)::date;
  v_project public.projetos;
  v_name text;
BEGIN
  IF auth.uid() IS NULL OR public.get_my_role() IS NULL OR public.get_my_role() = 'cliente' THEN RAISE EXCEPTION 'Sem permissão para iniciar planejamento'; END IF;
  IF v_month IS NULL THEN RAISE EXCEPTION 'Escolha o mês do planejamento'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_client_id::text || ':' || v_month::text, 0));
  SELECT * INTO v_project FROM public.projetos WHERE client_id = p_client_id AND date_trunc('month', mes_referencia)::date = v_month ORDER BY created_at LIMIT 1;
  IF v_project.id IS NOT NULL THEN RETURN v_project.id; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.clientes WHERE id = p_client_id) THEN RAISE EXCEPTION 'Cliente não encontrado'; END IF;
  v_name := 'Plano de ' || (ARRAY['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'])[extract(month FROM v_month)::integer] || ' de ' || extract(year FROM v_month)::integer;
  INSERT INTO public.projetos(client_id, name, owner_id, mes_referencia, status)
    VALUES (p_client_id, v_name, auth.uid(), v_month, 'planejamento') RETURNING id INTO v_project.id;
  RETURN v_project.id;
END;
$$;
REVOKE ALL ON FUNCTION public.start_client_monthly_project(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_client_monthly_project(uuid, date) TO authenticated;
REVOKE ALL ON FUNCTION public.project_planning_before_write(), public.project_planning_audit() FROM PUBLIC, anon, authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;

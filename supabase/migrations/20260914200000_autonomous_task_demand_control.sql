-- Fase 4 — tornar função e classificação operacionais, sem adivinhar dados antigos.

CREATE OR REPLACE FUNCTION planeje_private.infer_new_task_operational_data()
RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_candidates uuid[];
  v_project_month date;
  v_reference_date date;
BEGIN
  -- A pessoa continua sendo escolhida no cadastro. A função só é inferida quando
  -- existe exatamente uma função ativa contendo todos os responsáveis escolhidos.
  IF NEW.operational_function_id IS NULL
     AND cardinality(coalesce(NEW.assignee_ids, '{}'::uuid[])) > 0 THEN
    SELECT coalesce(array_agg(f.id ORDER BY f.id), '{}'::uuid[])
      INTO v_candidates
    FROM public.task_operational_functions f
    WHERE f.is_active
      AND f.assignee_ids @> NEW.assignee_ids;
    IF cardinality(v_candidates) = 1 THEN
      NEW.operational_function_id := v_candidates[1];
    END IF;
  END IF;

  -- Urgência explícita na prioridade pode classificar a demanda sem ambiguidade.
  IF NEW.demand_type IS NULL AND lower(coalesce(NEW.priority, '')) = 'urgent' THEN
    NEW.demand_type := 'urgency';
  END IF;

  -- Uma tarefa dentro do planejamento mensal do mesmo mês é planejada e vem do plano.
  IF NEW.project_id IS NOT NULL AND (NEW.demand_type IS NULL OR NEW.demand_origin IS NULL) THEN
    SELECT p.mes_referencia INTO v_project_month
    FROM public.projetos p WHERE p.id = NEW.project_id;
    v_reference_date := coalesce(NEW.due_date::date, current_date);
    IF v_project_month IS NOT NULL
       AND date_trunc('month', v_project_month)::date = date_trunc('month', v_reference_date)::date THEN
      NEW.demand_type := coalesce(NEW.demand_type, 'planned');
      NEW.demand_origin := coalesce(NEW.demand_origin, 'plan');
    END IF;
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS aa_tarefas_infer_operational_data ON public.tarefas;
CREATE TRIGGER aa_tarefas_infer_operational_data
  BEFORE INSERT ON public.tarefas
  FOR EACH ROW EXECUTE FUNCTION planeje_private.infer_new_task_operational_data();

CREATE OR REPLACE FUNCTION planeje_private.capture_task_stage_execution()
RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  old_members uuid[];
  new_members uuid[];
  status_changed boolean;
  function_changed boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.stage_execution_history := '[]'::jsonb;
    RETURN NEW;
  END IF;

  NEW.stage_execution_history := OLD.stage_execution_history;
  SELECT coalesce(pg_catalog.array_agg(DISTINCT x ORDER BY x), '{}'::uuid[])
    INTO old_members
  FROM pg_catalog.unnest(coalesce(OLD.assignee_ids, '{}'::uuid[])) AS x
  WHERE x IS NOT NULL;
  SELECT coalesce(pg_catalog.array_agg(DISTINCT x ORDER BY x), '{}'::uuid[])
    INTO new_members
  FROM pg_catalog.unnest(coalesce(NEW.assignee_ids, '{}'::uuid[])) AS x
  WHERE x IS NOT NULL;
  status_changed := NEW.status IS DISTINCT FROM OLD.status;
  function_changed := NEW.operational_function_id IS DISTINCT FROM OLD.operational_function_id;

  IF status_changed OR function_changed OR new_members IS DISTINCT FROM old_members THEN
    NEW.stage_execution_history := OLD.stage_execution_history ||
      pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'id', pg_catalog.gen_random_uuid(),
        'at', pg_catalog.clock_timestamp(),
        'actor_id', auth.uid(),
        'kind', CASE WHEN status_changed THEN 'status_change'
                     WHEN function_changed THEN 'function_change'
                     ELSE 'assignment_change' END,
        'from_status', OLD.status,
        'from_assignee_ids', old_members,
        'from_operational_function_id', OLD.operational_function_id,
        'to_status', NEW.status,
        'to_assignee_ids', new_members,
        'to_operational_function_id', NEW.operational_function_id
      ));
  END IF;
  RETURN NEW;
END
$$;

COMMENT ON FUNCTION planeje_private.infer_new_task_operational_data() IS
  'Infere somente dados não ambíguos em novas tarefas: função única dos responsáveis, urgência explícita e vínculo ao planejamento mensal.';

NOTIFY pgrst, 'reload schema';

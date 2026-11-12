-- Checklist de onboarding: a linha espera na lista. Virar tarefa abre o prazo.
-- Concluir a tarefa marca o item e não abre a próxima sozinha.
BEGIN;

CREATE FUNCTION planeje_private.onboarding_actor(p_actor uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NOT NULL THEN
    IF p_actor IS NOT NULL AND p_actor IS DISTINCT FROM v_uid THEN
      RAISE EXCEPTION 'O autor deve ser o usuário autenticado.' USING ERRCODE = '42501';
    END IF;
    RETURN v_uid;
  END IF;
  IF coalesce(auth.role(), '') <> 'service_role' OR p_actor IS NULL THEN
    RAISE EXCEPTION 'Apenas a equipe pode alterar o onboarding.' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_actor AND status = 'active' AND role IN ('admin', 'superadmin', 'colaborador')
  ) THEN
    RAISE EXCEPTION 'Selecione um usuário ativo da equipe.';
  END IF;
  PERFORM set_config('planeje.onboarding_actor', p_actor::text, true);
  RETURN p_actor;
END;
$$;

CREATE FUNCTION planeje_private.actor_manages_onboarding(p_actor uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM planeje_private.task_operational_function_managers AS m
    WHERE m.user_id = p_actor AND m.is_active
  );
$$;

REVOKE ALL ON FUNCTION planeje_private.onboarding_actor(uuid), planeje_private.actor_manages_onboarding(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

DROP INDEX IF EXISTS public.client_onboarding_one_current_stage;

CREATE OR REPLACE FUNCTION planeje_private.advance_client_onboarding_from_task()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_stage public.client_onboarding_stages%ROWTYPE;
  v_terminal boolean;
  v_actor uuid;
BEGIN
  SELECT * INTO v_stage FROM public.client_onboarding_stages WHERE task_id = OLD.id;
  IF v_stage.id IS NULL THEN
    RETURN NEW;
  END IF;
  v_actor := auth.uid();
  IF v_actor IS NULL THEN
    v_actor := nullif(current_setting('planeje.onboarding_actor', true), '')::uuid;
  END IF;
  IF v_actor IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = v_actor AND status = 'active' AND role IN ('admin', 'superadmin', 'colaborador')
  ) THEN
    RAISE EXCEPTION 'Apenas a equipe pode alterar tarefas do onboarding.' USING ERRCODE = '42501';
  END IF;
  IF NOT planeje_private.actor_manages_onboarding(v_actor)
     AND NOT (v_actor = ANY (coalesce(OLD.assignee_ids, '{}'::uuid[]))) THEN
    RAISE EXCEPTION 'Somente o responsável ou um gestor pode alterar esta etapa.' USING ERRCODE = '42501';
  END IF;
  IF NEW.client_id IS DISTINCT FROM OLD.client_id OR NEW.type IS DISTINCT FROM 'onboarding'
     OR NEW.project_id IS NOT NULL OR NEW.workflow_template_id IS NOT NULL THEN
    RAISE EXCEPTION 'Esta tarefa pertence ao onboarding. Mantenha o cliente e o tipo.';
  END IF;
  IF cardinality(coalesce(NEW.assignee_ids, '{}'::uuid[])) <> 1 OR NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = NEW.assignee_ids[1] AND status = 'active' AND role IN ('admin', 'superadmin', 'colaborador')
  ) OR NEW.due_date IS NULL THEN
    RAISE EXCEPTION 'A etapa precisa de um responsável ativo e de prazo.';
  END IF;
  SELECT coalesce(bool_or(is_terminal), false) INTO v_terminal FROM public.task_statuses WHERE value = NEW.status;
  v_terminal := v_terminal OR NEW.status IN ('completed', 'done', 'published');
  IF v_stage.state = 'completed' THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'Esta etapa já foi concluída. O restante está no checklist.';
    END IF;
    RETURN NEW;
  END IF;
  IF NOT v_terminal OR NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;
  PERFORM 1 FROM public.client_onboardings WHERE id = v_stage.onboarding_id FOR UPDATE;
  SELECT * INTO STRICT v_stage FROM public.client_onboarding_stages WHERE id = v_stage.id FOR UPDATE;
  IF v_stage.state <> 'active' THEN
    RETURN NEW;
  END IF;
  UPDATE public.client_onboarding_stages
    SET state = 'completed', completed_at = clock_timestamp(), completed_by = v_actor
    WHERE id = v_stage.id;
  IF NOT EXISTS (
    SELECT 1 FROM public.client_onboarding_stages
    WHERE onboarding_id = v_stage.onboarding_id AND state <> 'completed'
  ) THEN
    UPDATE public.client_onboardings
      SET status = 'completed', completed_at = clock_timestamp()
      WHERE id = v_stage.onboarding_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP FUNCTION public.start_client_onboarding(uuid, uuid, uuid);

CREATE FUNCTION public.start_client_onboarding(p_client uuid, p_template uuid, p_assignee uuid, p_actor uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_template public.client_onboarding_templates%ROWTYPE;
  v_id uuid;
  v_actor uuid;
BEGIN
  v_actor := planeje_private.onboarding_actor(p_actor);
  IF NOT planeje_private.actor_manages_onboarding(v_actor) THEN
    RAISE EXCEPTION 'Somente gestores podem iniciar o onboarding.' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('client_onboarding:' || p_client::text, 0));
  SELECT id INTO v_id FROM public.client_onboardings WHERE client_id = p_client AND status = 'active';
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;
  SELECT * INTO v_template FROM public.client_onboarding_templates WHERE id = p_template AND is_active;
  IF v_template.id IS NULL THEN
    RAISE EXCEPTION 'Selecione um modelo ativo.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.clientes WHERE id = p_client) THEN
    RAISE EXCEPTION 'Cliente não encontrado.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_assignee AND status = 'active' AND role IN ('admin', 'superadmin', 'colaborador')
  ) THEN
    RAISE EXCEPTION 'Selecione um responsável ativo da equipe.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_template.stages) stage
    WHERE nullif(stage->>'assignee_id', '') IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = (stage->>'assignee_id')::uuid AND status = 'active' AND role IN ('admin', 'superadmin', 'colaborador')
    )
  ) THEN
    RAISE EXCEPTION 'O modelo contém um responsável indisponível. Ajuste o modelo antes de iniciar.';
  END IF;
  INSERT INTO public.client_onboardings (client_id, template_id, template_name)
    VALUES (p_client, p_template, v_template.name)
    RETURNING id INTO v_id;
  INSERT INTO public.client_onboarding_stages (onboarding_id, position, title, instructions, pending_side, sla_days, assignee_id)
    SELECT v_id, ordinality, btrim(value->>'title'), coalesce(value->>'instructions', ''), value->>'pending_side',
      (value->>'sla_days')::integer, coalesce(nullif(value->>'assignee_id', '')::uuid, p_assignee)
    FROM jsonb_array_elements(v_template.stages) WITH ORDINALITY;
  RETURN v_id;
END;
$$;

DROP FUNCTION public.complete_client_onboarding_stage(uuid);

CREATE FUNCTION public.complete_client_onboarding_stage(p_stage uuid, p_actor uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_stage public.client_onboarding_stages%ROWTYPE;
  v_actor uuid;
BEGIN
  v_actor := planeje_private.onboarding_actor(p_actor);
  SELECT * INTO v_stage FROM public.client_onboarding_stages WHERE id = p_stage;
  IF v_stage.id IS NULL THEN
    RAISE EXCEPTION 'Etapa não encontrada.';
  END IF;
  IF NOT planeje_private.actor_manages_onboarding(v_actor) AND v_stage.assignee_id <> v_actor THEN
    RAISE EXCEPTION 'Somente o responsável ou um gestor pode concluir esta etapa.' USING ERRCODE = '42501';
  END IF;
  IF v_stage.state = 'completed' THEN
    RETURN v_stage.onboarding_id;
  END IF;
  IF v_stage.state <> 'active' OR v_stage.task_id IS NULL THEN
    RAISE EXCEPTION 'Esta linha ainda não é uma tarefa.';
  END IF;
  UPDATE public.tarefas SET status = 'completed' WHERE id = v_stage.task_id;
  RETURN v_stage.onboarding_id;
END;
$$;

DROP FUNCTION public.update_client_onboarding_stage(uuid, uuid, text, integer, date, text);

CREATE FUNCTION public.update_client_onboarding_stage(
  p_stage uuid, p_assignee uuid, p_side text, p_days integer, p_due date, p_instructions text, p_actor uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_stage public.client_onboarding_stages%ROWTYPE;
  v_actor uuid;
BEGIN
  v_actor := planeje_private.onboarding_actor(p_actor);
  SELECT * INTO v_stage FROM public.client_onboarding_stages WHERE id = p_stage FOR UPDATE;
  IF v_stage.id IS NULL THEN
    RAISE EXCEPTION 'Etapa não encontrada.';
  END IF;
  IF NOT planeje_private.actor_manages_onboarding(v_actor) AND v_stage.assignee_id <> v_actor THEN
    RAISE EXCEPTION 'Somente o responsável ou um gestor pode ajustar esta etapa.' USING ERRCODE = '42501';
  END IF;
  IF v_stage.state = 'completed' THEN
    RAISE EXCEPTION 'Etapa já concluída.';
  END IF;
  IF p_side NOT IN ('client', 'internal') OR p_side IS NULL OR p_days IS NULL OR p_days NOT BETWEEN 0 AND 365 THEN
    RAISE EXCEPTION 'Informe a parte responsável e o prazo em dias úteis.';
  END IF;
  IF v_stage.state = 'active' AND p_due IS NULL THEN
    RAISE EXCEPTION 'A etapa ativa precisa de prazo.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_assignee AND status = 'active' AND role IN ('admin', 'superadmin', 'colaborador')
  ) THEN
    RAISE EXCEPTION 'Selecione um responsável ativo da equipe.';
  END IF;
  IF v_stage.task_id IS NOT NULL THEN
    UPDATE public.tarefas
      SET assignee_ids = ARRAY[p_assignee], due_date = p_due, description = coalesce(p_instructions, ''), sla_days = p_days
      WHERE id = v_stage.task_id;
  END IF;
  UPDATE public.client_onboarding_stages
    SET assignee_id = p_assignee, pending_side = p_side, sla_days = p_days, instructions = coalesce(p_instructions, '')
    WHERE id = p_stage;
END;
$$;

CREATE FUNCTION public.open_client_onboarding_stage(p_stage uuid, p_actor uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_stage public.client_onboarding_stages%ROWTYPE;
  v_actor uuid;
BEGIN
  v_actor := planeje_private.onboarding_actor(p_actor);
  SELECT * INTO v_stage FROM public.client_onboarding_stages WHERE id = p_stage FOR UPDATE;
  IF v_stage.id IS NULL THEN
    RAISE EXCEPTION 'Etapa não encontrada.';
  END IF;
  IF NOT planeje_private.actor_manages_onboarding(v_actor) AND v_stage.assignee_id <> v_actor THEN
    RAISE EXCEPTION 'Somente o responsável ou um gestor pode abrir esta etapa.' USING ERRCODE = '42501';
  END IF;
  IF v_stage.state = 'completed' THEN
    RAISE EXCEPTION 'Etapa já concluída.';
  END IF;
  IF v_stage.state = 'active' AND v_stage.task_id IS NOT NULL THEN
    RETURN v_stage.task_id;
  END IF;
  IF v_stage.state <> 'locked' THEN
    RAISE EXCEPTION 'Esta linha não pode virar tarefa agora.';
  END IF;
  RETURN planeje_private.activate_client_onboarding_stage(p_stage);
END;
$$;

REVOKE ALL ON FUNCTION
  public.start_client_onboarding(uuid, uuid, uuid, uuid),
  public.complete_client_onboarding_stage(uuid, uuid),
  public.update_client_onboarding_stage(uuid, uuid, text, integer, date, text, uuid),
  public.open_client_onboarding_stage(uuid, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.start_client_onboarding(uuid, uuid, uuid, uuid),
  public.complete_client_onboarding_stage(uuid, uuid),
  public.update_client_onboarding_stage(uuid, uuid, text, integer, date, text, uuid),
  public.open_client_onboarding_stage(uuid, uuid)
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;

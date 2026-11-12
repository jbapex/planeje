BEGIN;
CREATE OR REPLACE FUNCTION planeje_private.traffic_weekly_guard_task() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE r public.traffic_weekly_reviews; v_terminal boolean;
BEGIN
  SELECT * INTO r FROM public.traffic_weekly_reviews WHERE task_id=OLD.id;
  IF r.id IS NULL THEN RETURN NEW; END IF;
  -- Do not let broad legacy task grants turn a reader into the review assignee.
  IF NOT planeje_private.traffic_weekly_can_edit(OLD.id) THEN RAISE insufficient_privilege USING MESSAGE='Somente o responsável ou gestor pode editar esta revisão.'; END IF;
  IF NEW.assignee_ids IS DISTINCT FROM OLD.assignee_ids THEN
    IF NOT public.central_trafego_can_assign_others() THEN RAISE insufficient_privilege USING MESSAGE='Peça ao gestor para trocar os responsáveis desta revisão.'; END IF;
    IF NEW.assignee_ids IS NULL OR cardinality(NEW.assignee_ids)=0 OR EXISTS(
      SELECT 1 FROM unnest(NEW.assignee_ids) u(id) LEFT JOIN public.profiles p ON p.id=u.id
      WHERE p.id IS NULL OR p.status IS DISTINCT FROM 'active' OR p.role NOT IN ('superadmin','admin','colaborador')) THEN RAISE EXCEPTION 'Defina responsáveis internos ativos.'; END IF;
  END IF;
  IF NEW.client_id IS DISTINCT FROM OLD.client_id OR NEW.type IS DISTINCT FROM OLD.type OR NEW.id IS DISTINCT FROM OLD.id THEN RAISE EXCEPTION 'Preserve o cliente e o tipo da revisão semanal.'; END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT planeje_private.traffic_weekly_can_edit(OLD.id) THEN RAISE insufficient_privilege USING MESSAGE='Somente o responsável ou gestor pode mover esta revisão.'; END IF;
    SELECT coalesce(is_terminal,false) INTO v_terminal FROM public.task_statuses WHERE value=NEW.status;
    IF coalesce(v_terminal,false) AND r.finalized_at IS NULL THEN RAISE EXCEPTION 'Abra a Rotina semanal e finalize a análise antes de concluir esta tarefa.'; END IF;
    IF r.finalized_at IS NOT NULL AND EXISTS(SELECT 1 FROM public.task_statuses WHERE value=OLD.status AND is_terminal) THEN RAISE EXCEPTION 'Revisão finalizada. Seu histórico permanece preservado.'; END IF;
  END IF;
  RETURN NEW;
END;
$$;
COMMIT;

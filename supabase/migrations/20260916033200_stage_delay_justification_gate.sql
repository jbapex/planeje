-- Exige justificativa também ao avançar uma etapa operacional vencida.

CREATE OR REPLACE FUNCTION planeje_private.track_task_delivery_and_stage_deadline()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_template public.task_workflow_templates%ROWTYPE;
  v_stage jsonb;
  v_stage_position integer;
  v_delivery_position integer;
  v_stage_sla integer;
  v_delivery_gate_reached boolean := false;
  v_is_content boolean := false;
  v_proof public.task_attachments%ROWTYPE;
BEGIN
  v_is_content := lower(coalesce(NEW.type, '')) IN (
    'arte', 'carrossel', 'video', 'reels', 'post', 'posts', 'story', 'stories',
    'design', 'social_media', 'anuncio', 'anuncios'
  );

  IF NEW.workflow_template_id IS NOT NULL THEN
    SELECT * INTO v_template FROM public.task_workflow_templates WHERE id = NEW.workflow_template_id;
    IF FOUND AND NEW.workflow_stage_key IS NOT NULL THEN
      SELECT stage.value, stage.ordinality::integer
        INTO v_stage, v_stage_position
      FROM jsonb_array_elements(v_template.stages) WITH ORDINALITY AS stage(value, ordinality)
      WHERE stage.value->>'key' = NEW.workflow_stage_key
      LIMIT 1;

      SELECT coalesce(
        min(stage.ordinality::integer) FILTER (WHERE stage.value->>'key' = 'review'),
        min(stage.ordinality::integer) FILTER (WHERE stage.value->>'kind' IN ('client', 'publishing', 'complete'))
      ) INTO v_delivery_position
      FROM jsonb_array_elements(v_template.stages) WITH ORDINALITY AS stage(value, ordinality);

      v_delivery_gate_reached := v_delivery_position IS NOT NULL AND v_stage_position >= v_delivery_position;
      IF nullif(v_stage->>'sla_days', '') IS NOT NULL THEN
        v_stage_sla := (v_stage->>'sla_days')::integer;
      END IF;
    END IF;
  ELSE
    v_delivery_gate_reached := NEW.status IN (
      'review', 'josias', 'alteração', 'approve', 'aguardando_aprovação', 'agendar',
      '4628a3b6-7e34-4753-b46c-8e068608b802_scheduled', 'youtube', 'completed', 'published'
    );
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.stage_started_at := coalesce(NEW.stage_started_at, clock_timestamp());
    IF v_stage_sla IS NOT NULL
       AND coalesce(v_stage->>'key', '') <> 'waiting_client'
       AND coalesce(v_stage->>'kind', '') <> 'complete' THEN
      NEW.stage_due_at := planeje_private.add_business_days(NEW.stage_started_at, v_stage_sla);
    END IF;
  ELSIF NEW.workflow_stage_key IS DISTINCT FROM OLD.workflow_stage_key
     OR NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.stage_started_at := clock_timestamp();
    NEW.stage_due_at := CASE
      WHEN v_stage_sla IS NOT NULL
       AND coalesce(v_stage->>'key', '') <> 'waiting_client'
       AND coalesce(v_stage->>'kind', '') <> 'complete'
      THEN planeje_private.add_business_days(NEW.stage_started_at, v_stage_sla)
      ELSE NULL
    END;
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.production_delivered_at IS NOT NULL
     AND (NEW.workflow_stage_key IS DISTINCT FROM OLD.workflow_stage_key OR NEW.status IS DISTINCT FROM OLD.status)
     AND OLD.stage_due_at IS NOT NULL
     AND OLD.stage_due_at < clock_timestamp()
     AND NOT EXISTS (
       SELECT 1
       FROM public.task_delay_justifications justification
       WHERE justification.task_id = OLD.id
         AND justification.deadline_kind = 'stage'
         AND justification.due_on = OLD.stage_due_at::date
         AND coalesce(justification.workflow_stage_key, '') = coalesce(OLD.workflow_stage_key, '')
     ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001',
      MESSAGE = 'Justifique o atraso da etapa antes de avançar a tarefa.';
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.production_delivered_at IS NOT NULL THEN
    NEW.production_delivered_at := OLD.production_delivered_at;
    NEW.production_delivery_attachment_id := OLD.production_delivery_attachment_id;
    RETURN NEW;
  END IF;

  IF NOT v_is_content OR NOT v_delivery_gate_reached THEN
    IF NEW.production_delivered_at IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001',
        MESSAGE = 'A produção só pode ser concluída ao entrar na revisão final ou em uma etapa posterior.';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.production_delivered_at IS NULL THEN
    SELECT * INTO v_proof
    FROM public.task_attachments attachment
    WHERE attachment.task_id = NEW.id
      AND nullif(btrim(attachment.url), '') IS NOT NULL
    ORDER BY attachment.created_at DESC, attachment.id DESC
    LIMIT 1;
    IF v_proof.id IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001',
        MESSAGE = 'Anexe o conteúdo produzido antes de enviar o material para revisão.';
    END IF;
    NEW.production_delivery_attachment_id := v_proof.id;
    NEW.production_delivered_at := clock_timestamp();
  ELSE
    SELECT * INTO v_proof
    FROM public.task_attachments attachment
    WHERE attachment.id = NEW.production_delivery_attachment_id
      AND attachment.task_id = NEW.id
      AND nullif(btrim(attachment.url), '') IS NOT NULL;
    IF v_proof.id IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001',
        MESSAGE = 'O comprovante da entrega precisa ser um anexo desta tarefa.';
    END IF;
  END IF;

  IF NEW.due_date IS NOT NULL
     AND NEW.production_delivered_at::date > NEW.due_date
     AND NOT EXISTS (
       SELECT 1
       FROM public.task_delay_justifications justification
       WHERE justification.task_id = NEW.id
         AND justification.deadline_kind = 'production'
         AND justification.due_on = NEW.due_date
     ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001',
      MESSAGE = 'Justifique o atraso antes de confirmar a entrega do material.';
  END IF;

  RETURN NEW;
END
$$;

CREATE OR REPLACE VIEW public.task_delay_report
WITH (security_invoker = true)
AS
SELECT
  justification.id,
  justification.task_id,
  task.client_id,
  client.empresa AS client_name,
  task.project_id,
  project.name AS project_name,
  task.title AS task_title,
  justification.deadline_kind,
  justification.due_on,
  justification.workflow_stage_key,
  justification.publication_id,
  justification.reason_code,
  justification.details,
  justification.created_by,
  profile.full_name AS justified_by_name,
  justification.created_at,
  deadline.production_delivered_at,
  deadline.production_days_late,
  deadline.stage_days_late,
  deadline.overdue_publications,
  greatest(justification.created_at::date - justification.due_on, 0) AS delay_days
FROM public.task_delay_justifications justification
JOIN public.tarefas task ON task.id = justification.task_id
LEFT JOIN public.clientes client ON client.id = task.client_id
LEFT JOIN public.projetos project ON project.id = task.project_id
LEFT JOIN public.profiles profile ON profile.id = justification.created_by
LEFT JOIN public.task_deadline_status deadline ON deadline.task_id = task.id;

GRANT SELECT ON public.task_delay_report TO authenticated, service_role;
COMMENT ON VIEW public.task_delay_report IS
  'Justificativas de produção e de etapas, com dias de atraso preservados por ocorrência.';
NOTIFY pgrst, 'reload schema';

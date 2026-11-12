-- Allow the team to remove or replace a task attachment after production
-- delivery. The first delivery timestamp stays; the locked proof link does not.
BEGIN;

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
      NEW.stage_due_at := public.calculate_task_stage_deadline(NEW.stage_started_at, v_stage_sla);
    END IF;
  ELSIF NEW.workflow_stage_key IS DISTINCT FROM OLD.workflow_stage_key
     OR NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.stage_started_at := clock_timestamp();
    NEW.stage_due_at := CASE
      WHEN v_stage_sla IS NOT NULL
       AND coalesce(v_stage->>'key', '') <> 'waiting_client'
       AND coalesce(v_stage->>'kind', '') <> 'complete'
      THEN public.calculate_task_stage_deadline(NEW.stage_started_at, v_stage_sla)
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
    IF NEW.production_delivery_attachment_id IS DISTINCT FROM OLD.production_delivery_attachment_id THEN
      IF NEW.production_delivery_attachment_id IS NOT NULL THEN
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
    ELSE
      NEW.production_delivery_attachment_id := OLD.production_delivery_attachment_id;
    END IF;
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

CREATE OR REPLACE FUNCTION planeje_private.release_task_attachment_references()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_next uuid;
BEGIN
  SELECT attachment.id
    INTO v_next
  FROM public.task_attachments AS attachment
  WHERE attachment.task_id = OLD.task_id
    AND attachment.id <> OLD.id
    AND nullif(btrim(attachment.url), '') IS NOT NULL
  ORDER BY attachment.created_at DESC, attachment.id DESC
  LIMIT 1;

  UPDATE public.tarefas
     SET production_delivery_attachment_id = v_next
   WHERE production_delivery_attachment_id = OLD.id;

  RETURN OLD;
END
$$;

ALTER FUNCTION planeje_private.release_task_attachment_references() OWNER TO postgres;
REVOKE ALL ON FUNCTION planeje_private.release_task_attachment_references()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS task_attachments_release_delivery_proof ON public.task_attachments;
CREATE TRIGGER task_attachments_release_delivery_proof
  BEFORE DELETE ON public.task_attachments
  FOR EACH ROW
  EXECUTE FUNCTION planeje_private.release_task_attachment_references();

ALTER TABLE public.tarefas
  DROP CONSTRAINT IF EXISTS tarefas_production_delivery_attachment_id_fkey;
ALTER TABLE public.tarefas
  ADD CONSTRAINT tarefas_production_delivery_attachment_id_fkey
  FOREIGN KEY (production_delivery_attachment_id)
  REFERENCES public.task_attachments(id)
  ON DELETE SET NULL;

ALTER TABLE public.traffic_completion_evidence
  DROP CONSTRAINT IF EXISTS traffic_completion_evidence_attachment_id_fkey;
ALTER TABLE public.traffic_completion_evidence
  ADD CONSTRAINT traffic_completion_evidence_attachment_id_fkey
  FOREIGN KEY (attachment_id)
  REFERENCES public.task_attachments(id)
  ON DELETE CASCADE;

COMMENT ON COLUMN public.tarefas.production_delivery_attachment_id IS
  'Anexo usado como comprovante da primeira entrega. Pode ser trocado ou removido; o horário da entrega permanece.';

NOTIFY pgrst, 'reload schema';
COMMIT;

-- Entrega comprovada, relógios separados e justificativas auditáveis de atraso.

ALTER TABLE public.tarefas
  ADD COLUMN IF NOT EXISTS production_delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS production_delivery_attachment_id uuid
    REFERENCES public.task_attachments(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS stage_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS stage_due_at timestamptz;

CREATE TABLE IF NOT EXISTS public.task_delay_justifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tarefas(id) ON DELETE CASCADE,
  deadline_kind text NOT NULL,
  due_on date NOT NULL,
  workflow_stage_key text,
  publication_id uuid REFERENCES public.task_channel_publications(id) ON DELETE SET NULL,
  reason_code text NOT NULL,
  details text NOT NULL,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT task_delay_justifications_kind_valid CHECK (deadline_kind IN ('production', 'stage', 'publication')),
  CONSTRAINT task_delay_justifications_reason_valid CHECK (reason_code IN (
    'client_waiting', 'scope_change', 'missing_input', 'rework',
    'internal_capacity', 'technical_issue', 'priority_change', 'other'
  )),
  CONSTRAINT task_delay_justifications_details_valid CHECK (length(btrim(details)) >= 10)
);

CREATE INDEX IF NOT EXISTS task_delay_justifications_task_idx
  ON public.task_delay_justifications(task_id, created_at DESC);
CREATE INDEX IF NOT EXISTS task_delay_justifications_report_idx
  ON public.task_delay_justifications(deadline_kind, due_on, reason_code, created_at DESC);

ALTER TABLE public.task_delay_justifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.task_delay_justifications FROM anon;
GRANT SELECT, INSERT ON public.task_delay_justifications TO authenticated;
GRANT ALL ON public.task_delay_justifications TO service_role;

DROP POLICY IF EXISTS task_delay_justifications_read ON public.task_delay_justifications;
CREATE POLICY task_delay_justifications_read ON public.task_delay_justifications
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS task_delay_justifications_insert ON public.task_delay_justifications;
CREATE POLICY task_delay_justifications_insert ON public.task_delay_justifications
  FOR INSERT TO authenticated WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (SELECT 1 FROM public.tarefas task WHERE task.id = task_id)
  );

CREATE OR REPLACE FUNCTION planeje_private.add_business_days(
  p_started_at timestamptz,
  p_days integer
)
RETURNS timestamptz
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_result timestamptz := p_started_at;
  v_remaining integer := greatest(coalesce(p_days, 0), 0);
BEGIN
  WHILE v_remaining > 0 LOOP
    v_result := v_result + interval '1 day';
    IF extract(isodow FROM v_result) < 6 THEN
      v_remaining := v_remaining - 1;
    END IF;
  END LOOP;
  RETURN v_result;
END
$$;

-- Prazos iniciais podem ser alterados em Tarefas > Automações > Fluxos.
UPDATE public.task_workflow_templates template
SET stages = (
      SELECT jsonb_agg(
        CASE
          WHEN stage.value ? 'sla_days' THEN stage.value
          ELSE stage.value || jsonb_build_object(
            'sla_days', CASE
              WHEN stage.value->>'key' IN ('briefing', 'script') THEN 2
              WHEN stage.value->>'key' IN ('script_review', 'review', 'validation', 'send_client', 'schedule') THEN 1
              ELSE NULL
            END
          )
        END
        ORDER BY stage.ordinality
      )
      FROM jsonb_array_elements(template.stages) WITH ORDINALITY AS stage(value, ordinality)
    ),
    updated_at = clock_timestamp()
WHERE jsonb_typeof(template.stages) = 'array';

-- O histórico existente ajuda a iniciar o relógio sem inventar uma data nova.
UPDATE public.tarefas task
SET stage_started_at = coalesce(
  (
    SELECT max(nullif(event->>'at', '')::timestamptz)
    FROM jsonb_array_elements(coalesce(task.stage_execution_history, '[]'::jsonb)) event
    WHERE event ? 'at'
  ),
  task.created_at,
  clock_timestamp()
)
WHERE task.stage_started_at IS NULL;

-- Tarefas antigas só recebem o marco quando já possuem uma evidência real.
WITH proof AS (
  SELECT DISTINCT ON (attachment.task_id)
    attachment.task_id,
    attachment.id,
    attachment.created_at
  FROM public.task_attachments attachment
  WHERE nullif(btrim(attachment.url), '') IS NOT NULL
  ORDER BY attachment.task_id, attachment.created_at DESC, attachment.id DESC
), transition AS (
  SELECT
    task.id AS task_id,
    min(nullif(event->>'at', '')::timestamptz) FILTER (
      WHERE event->>'to_workflow_stage_key' IN ('review', 'validation', 'send_client', 'waiting_client', 'schedule', 'scheduled', 'published')
         OR event->>'to_status' IN ('review', 'josias', 'approve', 'aguardando_aprovação', 'agendar', 'published', 'completed')
    ) AS delivered_at
  FROM public.tarefas task
  LEFT JOIN LATERAL jsonb_array_elements(coalesce(task.stage_execution_history, '[]'::jsonb)) event ON true
  GROUP BY task.id
)
UPDATE public.tarefas task
SET production_delivery_attachment_id = proof.id,
    production_delivered_at = greatest(coalesce(transition.delivered_at, proof.created_at), proof.created_at)
FROM proof
LEFT JOIN transition ON transition.task_id = proof.task_id
WHERE task.id = proof.task_id
  AND task.production_delivered_at IS NULL
  AND (
    task.workflow_stage_key IN ('review', 'validation', 'send_client', 'waiting_client', 'schedule', 'scheduled', 'published')
    OR task.status IN (
      'review', 'josias', 'alteração', 'approve', 'aguardando_aprovação', 'agendar',
      '4628a3b6-7e34-4753-b46c-8e068608b802_scheduled', 'youtube', 'completed', 'published'
    )
  );

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

DROP TRIGGER IF EXISTS a1_tarefas_track_delivery_deadlines ON public.tarefas;
CREATE TRIGGER a1_tarefas_track_delivery_deadlines
  BEFORE INSERT OR UPDATE OF status, workflow_template_id, workflow_stage_key,
    production_delivered_at, production_delivery_attachment_id
  ON public.tarefas
  FOR EACH ROW EXECUTE FUNCTION planeje_private.track_task_delivery_and_stage_deadline();

CREATE OR REPLACE VIEW public.task_deadline_status
WITH (security_invoker = true)
AS
SELECT
  task.id AS task_id,
  task.client_id,
  task.project_id,
  task.title,
  task.status,
  task.workflow_stage_key,
  task.due_date AS production_due_on,
  task.production_delivered_at,
  task.production_delivery_attachment_id,
  task.stage_started_at,
  task.stage_due_at,
  CASE
    WHEN task.due_date IS NULL THEN 'no_due_date'
    WHEN task.production_delivered_at IS NOT NULL AND task.production_delivered_at::date <= task.due_date THEN 'delivered_on_time'
    WHEN task.production_delivered_at IS NOT NULL THEN 'delivered_late'
    WHEN task.due_date < current_date THEN 'overdue'
    WHEN task.due_date = current_date THEN 'due_today'
    ELSE 'upcoming'
  END AS production_state,
  CASE
    WHEN task.production_delivered_at IS NULL OR task.stage_due_at IS NULL THEN 'not_running'
    WHEN task.stage_due_at < clock_timestamp() THEN 'overdue'
    WHEN task.stage_due_at::date = current_date THEN 'due_today'
    ELSE 'upcoming'
  END AS stage_state,
  CASE
    WHEN task.due_date IS NULL THEN 0
    WHEN task.production_delivered_at IS NOT NULL THEN greatest(task.production_delivered_at::date - task.due_date, 0)
    ELSE greatest(current_date - task.due_date, 0)
  END AS production_days_late,
  CASE WHEN task.stage_due_at < clock_timestamp() THEN greatest(current_date - task.stage_due_at::date, 0) ELSE 0 END AS stage_days_late,
  (task.production_delivered_at IS NOT NULL AND proof.id IS NOT NULL) AS delivery_proof_valid,
  (latest_justification.id IS NOT NULL) AS production_delay_justified,
  latest_justification.reason_code AS latest_delay_reason,
  latest_justification.details AS latest_delay_details,
  coalesce(publications.overdue_count, 0)::integer AS overdue_publications
FROM public.tarefas task
LEFT JOIN public.task_attachments proof ON proof.id = task.production_delivery_attachment_id AND proof.task_id = task.id
LEFT JOIN LATERAL (
  SELECT justification.id, justification.reason_code, justification.details
  FROM public.task_delay_justifications justification
  WHERE justification.task_id = task.id
    AND justification.deadline_kind = 'production'
    AND justification.due_on = task.due_date
  ORDER BY justification.created_at DESC
  LIMIT 1
) latest_justification ON true
LEFT JOIN LATERAL (
  SELECT count(*) FILTER (
    WHERE publication.status NOT IN ('published', 'cancelled')
      AND publication.scheduled_for < current_date
  ) AS overdue_count
  FROM public.task_channel_publications publication
  WHERE publication.task_id = task.id
) publications ON true;

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
  deadline.overdue_publications
FROM public.task_delay_justifications justification
JOIN public.tarefas task ON task.id = justification.task_id
LEFT JOIN public.clientes client ON client.id = task.client_id
LEFT JOIN public.projetos project ON project.id = task.project_id
LEFT JOIN public.profiles profile ON profile.id = justification.created_by
LEFT JOIN public.task_deadline_status deadline ON deadline.task_id = task.id;

GRANT SELECT ON public.task_deadline_status, public.task_delay_report TO authenticated, service_role;

COMMENT ON COLUMN public.tarefas.production_delivered_at IS
  'Marco auditável que encerra o prazo de produção; exige anexo e, quando atrasado, justificativa.';
COMMENT ON COLUMN public.tarefas.production_delivery_attachment_id IS
  'Anexo preservado como comprovante da primeira entrega da produção.';
COMMENT ON COLUMN public.tarefas.stage_due_at IS
  'Prazo da etapa atual, calculado pelo SLA em dias úteis configurado no fluxo.';
COMMENT ON TABLE public.task_delay_justifications IS
  'Histórico append-only de causas de atraso para relatórios operacionais.';

NOTIFY pgrst, 'reload schema';

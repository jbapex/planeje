-- Fase 4 — fluxos configuráveis para novas tarefas de conteúdo.
-- Tarefas antigas só entram em um fluxo quando alguém escolher explicitamente.

CREATE TABLE IF NOT EXISTS public.task_workflow_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  task_types text[] NOT NULL DEFAULT '{}'::text[],
  stages jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT task_workflow_templates_name_valid CHECK (length(btrim(name)) BETWEEN 2 AND 100),
  CONSTRAINT task_workflow_templates_types_valid CHECK (cardinality(task_types) > 0),
  CONSTRAINT task_workflow_templates_stages_valid CHECK (jsonb_typeof(stages) = 'array' AND jsonb_array_length(stages) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS task_workflow_templates_name_unique
  ON public.task_workflow_templates (lower(name));

ALTER TABLE public.task_workflow_templates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.task_workflow_templates FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.task_workflow_templates TO authenticated;
GRANT ALL ON public.task_workflow_templates TO service_role;

DROP POLICY IF EXISTS task_workflow_templates_read ON public.task_workflow_templates;
CREATE POLICY task_workflow_templates_read ON public.task_workflow_templates
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS task_workflow_templates_insert ON public.task_workflow_templates;
CREATE POLICY task_workflow_templates_insert ON public.task_workflow_templates
  FOR INSERT TO authenticated WITH CHECK ((SELECT public.can_manage_task_operational_functions()));
DROP POLICY IF EXISTS task_workflow_templates_update ON public.task_workflow_templates;
CREATE POLICY task_workflow_templates_update ON public.task_workflow_templates
  FOR UPDATE TO authenticated
  USING ((SELECT public.can_manage_task_operational_functions()))
  WITH CHECK ((SELECT public.can_manage_task_operational_functions()));

ALTER TABLE public.tarefas
  ADD COLUMN IF NOT EXISTS workflow_template_id uuid
    REFERENCES public.task_workflow_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS workflow_stage_key text;

-- Funções iniciais refletem a operação atual, mas podem ser editadas na tela Funções.
INSERT INTO public.task_operational_functions (name, assignee_ids, is_active)
VALUES
  ('Planejamento e briefing', ARRAY['4628a3b6-7e34-4753-b46c-8e068608b802'::uuid], true),
  ('Roteiro e gravação', ARRAY['56cb41db-a306-4706-ac23-d8999aa87a82'::uuid], true),
  ('Design', ARRAY['b80d59ba-9fdc-467f-8d9c-890e90359cd8'::uuid], true),
  ('Edição', ARRAY['77d51190-5a9c-4200-9111-2ccabeac0e95'::uuid], true)
ON CONFLICT ((lower(name))) DO NOTHING;

INSERT INTO public.task_statuses (value, label, color, sort_order, is_initial, is_terminal)
SELECT v.value, v.label, v.color, v.sort_order, false, false
FROM (VALUES
  ('briefing', 'Briefing', '#7C3AED', 13),
  ('roteiro', 'Roteiro', '#2563EB', 14),
  ('aprovacao_roteiro', 'Aprovar roteiro', '#F59E0B', 15),
  ('gravacao', 'Gravação', '#0891B2', 16),
  ('design', 'Design', '#DB2777', 17),
  ('edicao', 'Edição', '#4F46E5', 18)
) AS v(value, label, color, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM public.task_statuses s WHERE s.value = v.value);

DO $$
DECLARE
  f_plan uuid;
  f_script uuid;
  f_design uuid;
  f_edit uuid;
  f_review uuid;
  f_validate uuid;
  f_client uuid;
  f_post uuid;
  scheduled_status text;
BEGIN
  SELECT id INTO STRICT f_plan FROM public.task_operational_functions WHERE lower(name) = lower('Planejamento e briefing');
  SELECT id INTO STRICT f_script FROM public.task_operational_functions WHERE lower(name) = lower('Roteiro e gravação');
  SELECT id INTO STRICT f_design FROM public.task_operational_functions WHERE lower(name) = lower('Design');
  SELECT id INTO STRICT f_edit FROM public.task_operational_functions WHERE lower(name) = lower('Edição');
  SELECT id INTO STRICT f_review FROM public.task_operational_functions WHERE lower(name) = lower('Revisão interna');
  SELECT id INTO STRICT f_validate FROM public.task_operational_functions WHERE lower(name) = lower('Validação interna');
  SELECT id INTO STRICT f_client FROM public.task_operational_functions WHERE lower(name) = lower('Aprovação com cliente');
  SELECT id INTO STRICT f_post FROM public.task_operational_functions WHERE lower(name) = lower('Postagem');
  SELECT value INTO scheduled_status FROM public.task_statuses
    WHERE lower(label) = 'agendado' ORDER BY sort_order NULLS LAST LIMIT 1;
  IF scheduled_status IS NULL THEN RAISE EXCEPTION 'Status Agendado não encontrado'; END IF;

  INSERT INTO public.task_workflow_templates (name, task_types, stages)
  VALUES (
    'Conteúdo — Arte e carrossel', ARRAY['arte','carrossel'],
    jsonb_build_array(
      jsonb_build_object('key','briefing','label','Briefing','status_value','briefing','function_id',f_plan,'kind','planning'),
      jsonb_build_object('key','design','label','Criação da arte','status_value','design','function_id',f_design,'kind','production'),
      jsonb_build_object('key','review','label','Revisão interna','status_value','review','function_id',f_review,'kind','review'),
      jsonb_build_object('key','validation','label','Validação Josias','status_value','josias','function_id',f_validate,'kind','validation'),
      jsonb_build_object('key','send_client','label','Enviar ao cliente','status_value','approve','function_id',f_client,'kind','client'),
      jsonb_build_object('key','waiting_client','label','Aguardando cliente','status_value','aguardando_aprovação','function_id',f_client,'kind','client'),
      jsonb_build_object('key','schedule','label','Preparar postagem','status_value','agendar','function_id',f_post,'kind','publishing'),
      jsonb_build_object('key','scheduled','label','Agendado','status_value',scheduled_status,'function_id',f_post,'kind','publishing'),
      jsonb_build_object('key','published','label','Publicado com evidência','status_value','published','function_id',f_post,'kind','complete')
    )
  ) ON CONFLICT ((lower(name))) DO NOTHING;

  INSERT INTO public.task_workflow_templates (name, task_types, stages)
  VALUES (
    'Conteúdo — Vídeo e reels', ARRAY['video','reels'],
    jsonb_build_array(
      jsonb_build_object('key','briefing','label','Briefing','status_value','briefing','function_id',f_plan,'kind','planning'),
      jsonb_build_object('key','script','label','Roteiro','status_value','roteiro','function_id',f_script,'kind','production'),
      jsonb_build_object('key','script_review','label','Aprovação interna do roteiro','status_value','aprovacao_roteiro','function_id',f_review,'kind','review'),
      jsonb_build_object('key','recording','label','Gravação','status_value','gravacao','function_id',f_script,'kind','production'),
      jsonb_build_object('key','editing','label','Edição','status_value','edicao','function_id',f_edit,'kind','production'),
      jsonb_build_object('key','review','label','Revisão do material','status_value','review','function_id',f_review,'kind','review'),
      jsonb_build_object('key','validation','label','Validação Josias','status_value','josias','function_id',f_validate,'kind','validation'),
      jsonb_build_object('key','send_client','label','Enviar ao cliente','status_value','approve','function_id',f_client,'kind','client'),
      jsonb_build_object('key','waiting_client','label','Aguardando cliente','status_value','aguardando_aprovação','function_id',f_client,'kind','client'),
      jsonb_build_object('key','schedule','label','Preparar postagem','status_value','agendar','function_id',f_post,'kind','publishing'),
      jsonb_build_object('key','scheduled','label','Agendado','status_value',scheduled_status,'function_id',f_post,'kind','publishing'),
      jsonb_build_object('key','published','label','Publicado com evidência','status_value','published','function_id',f_post,'kind','complete')
    )
  ) ON CONFLICT ((lower(name))) DO NOTHING;
END $$;

CREATE OR REPLACE FUNCTION planeje_private.apply_task_workflow()
RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_template public.task_workflow_templates%ROWTYPE;
  v_stage jsonb;
  v_function public.task_operational_functions%ROWTYPE;
BEGIN
  IF NEW.workflow_template_id IS NULL AND NEW.type IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.type IS DISTINCT FROM OLD.type) THEN
    SELECT * INTO v_template
    FROM public.task_workflow_templates w
    WHERE w.is_active AND NEW.type = ANY(w.task_types)
    ORDER BY w.created_at, w.id LIMIT 1;
    IF FOUND THEN NEW.workflow_template_id := v_template.id; END IF;
  ELSIF NEW.workflow_template_id IS NOT NULL THEN
    SELECT * INTO v_template FROM public.task_workflow_templates WHERE id = NEW.workflow_template_id;
  END IF;

  IF NEW.workflow_template_id IS NULL THEN
    NEW.workflow_stage_key := NULL;
    RETURN NEW;
  END IF;
  IF v_template.id IS NULL THEN
    SELECT * INTO STRICT v_template FROM public.task_workflow_templates WHERE id = NEW.workflow_template_id;
  END IF;

  IF (TG_OP = 'INSERT' AND coalesce(NEW.status, 'todo') IN ('todo','A Fazer'))
     OR (TG_OP = 'UPDATE' AND NEW.workflow_template_id IS DISTINCT FROM OLD.workflow_template_id
         AND coalesce(NEW.status, 'todo') IN ('todo','A Fazer')) THEN
    NEW.status := v_template.stages->0->>'status_value';
  END IF;

  SELECT value INTO v_stage
  FROM jsonb_array_elements(v_template.stages) AS value
  WHERE value->>'status_value' = NEW.status
  LIMIT 1;
  IF v_stage IS NULL THEN
    NEW.workflow_stage_key := NULL;
    RETURN NEW;
  END IF;

  NEW.workflow_stage_key := v_stage->>'key';
  SELECT * INTO v_function FROM public.task_operational_functions
  WHERE id = (v_stage->>'function_id')::uuid;
  IF v_function.id IS NULL OR NOT v_function.is_active OR cardinality(v_function.assignee_ids) = 0 THEN
    RAISE EXCEPTION 'A etapa % está sem uma função ativa com responsável.', v_stage->>'label';
  END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(v_function.assignee_ids) member_id
    LEFT JOIN public.profiles p ON p.id = member_id
    WHERE p.id IS NULL OR p.status IS DISTINCT FROM 'active'
      OR p.role NOT IN ('admin','superadmin','colaborador')
  ) THEN
    RAISE EXCEPTION 'A função % contém uma pessoa indisponível.', v_function.name;
  END IF;
  NEW.operational_function_id := v_function.id;
  NEW.assignee_ids := v_function.assignee_ids;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS a0_tarefas_apply_workflow ON public.tarefas;
CREATE TRIGGER a0_tarefas_apply_workflow
  BEFORE INSERT OR UPDATE OF type, status, workflow_template_id ON public.tarefas
  FOR EACH ROW EXECUTE FUNCTION planeje_private.apply_task_workflow();

-- Acrescenta a etapa do fluxo ao histórico usado para devolução ao produtor.
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
  old_stage_kind text;
  new_stage_kind text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.stage_execution_history := '[]'::jsonb;
    RETURN NEW;
  END IF;
  NEW.stage_execution_history := OLD.stage_execution_history;
  SELECT coalesce(array_agg(DISTINCT x ORDER BY x), '{}'::uuid[]) INTO old_members
    FROM unnest(coalesce(OLD.assignee_ids, '{}'::uuid[])) AS x WHERE x IS NOT NULL;
  SELECT coalesce(array_agg(DISTINCT x ORDER BY x), '{}'::uuid[]) INTO new_members
    FROM unnest(coalesce(NEW.assignee_ids, '{}'::uuid[])) AS x WHERE x IS NOT NULL;
  status_changed := NEW.status IS DISTINCT FROM OLD.status;
  function_changed := NEW.operational_function_id IS DISTINCT FROM OLD.operational_function_id;
  IF OLD.workflow_template_id IS NOT NULL AND OLD.workflow_stage_key IS NOT NULL THEN
    SELECT stage->>'kind' INTO old_stage_kind FROM public.task_workflow_templates w,
      jsonb_array_elements(w.stages) stage
      WHERE w.id = OLD.workflow_template_id AND stage->>'key' = OLD.workflow_stage_key LIMIT 1;
  END IF;
  IF NEW.workflow_template_id IS NOT NULL AND NEW.workflow_stage_key IS NOT NULL THEN
    SELECT stage->>'kind' INTO new_stage_kind FROM public.task_workflow_templates w,
      jsonb_array_elements(w.stages) stage
      WHERE w.id = NEW.workflow_template_id AND stage->>'key' = NEW.workflow_stage_key LIMIT 1;
  END IF;
  IF status_changed OR function_changed OR new_members IS DISTINCT FROM old_members THEN
    NEW.stage_execution_history := OLD.stage_execution_history || jsonb_build_array(jsonb_build_object(
      'id', gen_random_uuid(), 'at', clock_timestamp(), 'actor_id', auth.uid(),
      'kind', CASE WHEN status_changed THEN 'status_change' WHEN function_changed THEN 'function_change' ELSE 'assignment_change' END,
      'from_status', OLD.status, 'from_assignee_ids', old_members,
      'from_operational_function_id', OLD.operational_function_id,
      'from_workflow_stage_key', OLD.workflow_stage_key, 'from_workflow_stage_kind', old_stage_kind,
      'to_status', NEW.status, 'to_assignee_ids', new_members,
      'to_operational_function_id', NEW.operational_function_id,
      'to_workflow_stage_key', NEW.workflow_stage_key, 'to_workflow_stage_kind', new_stage_kind
    ));
  END IF;
  RETURN NEW;
END
$$;

UPDATE public.task_automations
SET actions = jsonb_set(actions, '{0,config,production_status}', '"__last_workflow_production__"'::jsonb, true)
WHERE id = 'b9481cd9-ca5f-4c2b-8b1b-bfca726e023d'::uuid
  AND is_active
  AND actions->0->>'type' = 'reassign_producer';

COMMENT ON TABLE public.task_workflow_templates IS
  'Fluxos configuráveis aplicados somente a novas tarefas ou a tarefas antigas adotadas explicitamente.';
COMMENT ON COLUMN public.tarefas.workflow_template_id IS 'Fluxo operacional escolhido para esta tarefa.';
COMMENT ON COLUMN public.tarefas.workflow_stage_key IS 'Etapa atual dentro do fluxo escolhido.';

NOTIFY pgrst, 'reload schema';

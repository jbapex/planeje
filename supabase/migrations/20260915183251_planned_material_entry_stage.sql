-- Keep A Fazer as the backlog while routing the task to the first work that is still needed.
ALTER TABLE public.tarefas
  ADD COLUMN IF NOT EXISTS workflow_entry_stage_key text;

ALTER TABLE public.tarefas
  DROP CONSTRAINT IF EXISTS tarefas_workflow_entry_stage_key_valid;
ALTER TABLE public.tarefas
  ADD CONSTRAINT tarefas_workflow_entry_stage_key_valid
  CHECK (workflow_entry_stage_key IS NULL OR length(btrim(workflow_entry_stage_key)) BETWEEN 1 AND 80);

COMMENT ON COLUMN public.tarefas.workflow_entry_stage_key IS
  'Primeira etapa necessária ao iniciar a tarefa em A Fazer; etapas já concluídas no planejamento podem ser puladas.';

CREATE OR REPLACE FUNCTION planeje_private.apply_task_workflow()
RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_template public.task_workflow_templates%ROWTYPE;
  v_stage jsonb;
  v_assignment_stage jsonb;
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
    NEW.workflow_entry_stage_key := NULL;
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
  v_assignment_stage := v_stage;
  IF NEW.workflow_stage_key = v_template.stages->0->>'key'
     AND NEW.workflow_entry_stage_key IS NOT NULL THEN
    SELECT value INTO v_assignment_stage
    FROM jsonb_array_elements(v_template.stages) WITH ORDINALITY AS item(value, ord)
    WHERE value->>'key' = NEW.workflow_entry_stage_key AND ord > 1
    LIMIT 1;
    IF v_assignment_stage IS NULL THEN
      RAISE EXCEPTION 'A primeira etapa escolhida não existe neste fluxo.';
    END IF;
  END IF;

  SELECT * INTO v_function FROM public.task_operational_functions
  WHERE id = (v_assignment_stage->>'function_id')::uuid;
  IF v_function.id IS NULL OR NOT v_function.is_active OR cardinality(v_function.assignee_ids) = 0 THEN
    RAISE EXCEPTION 'A etapa % está sem uma função ativa com responsável.', v_assignment_stage->>'label';
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
  BEFORE INSERT OR UPDATE OF type, status, workflow_template_id, workflow_entry_stage_key ON public.tarefas
  FOR EACH ROW EXECUTE FUNCTION planeje_private.apply_task_workflow();

CREATE OR REPLACE FUNCTION public.create_task_from_plan_material(p_project_id uuid, p_material_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_project public.projetos%ROWTYPE;
  v_plan public.campaign_plans%ROWTYPE;
  v_task public.tarefas%ROWTYPE;
  v_material jsonb;
  v_count integer;
  v_client_name text;
  v_type text;
  v_raw_type text;
  v_material_ord bigint;
  v_number text;
  v_title_label text;
  v_task_name text;
  v_channels text[];
  v_description text;
  v_due_date date;
  v_post_date date;
  v_assignees uuid[] := '{}'::uuid[];
  v_workflow_template_id uuid;
  v_workflow_template public.task_workflow_templates%ROWTYPE;
  v_workflow_entry_stage_key text;
  v_requested_entry_key text;
BEGIN
  IF v_actor IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = v_actor AND p.status = 'active'
      AND p.role IN ('superadmin', 'admin', 'colaborador')
  ) THEN
    RAISE EXCEPTION 'Entre com um usuário ativo da equipe para criar a tarefa.' USING ERRCODE = '42501';
  END IF;
  IF p_project_id IS NULL OR p_material_id IS NULL OR length(btrim(p_material_id)) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'Informe o projeto e um material salvo.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_project FROM public.projetos WHERE id = p_project_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Projeto não encontrado ou sem acesso.' USING ERRCODE = '42501';
  END IF;
  IF v_project.client_id IS NULL THEN
    RAISE EXCEPTION 'Escolha o cliente do projeto antes de criar a tarefa.' USING ERRCODE = '22023';
  END IF;
  SELECT empresa INTO v_client_name FROM public.clientes WHERE id = v_project.client_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cliente do projeto não encontrado ou sem acesso.' USING ERRCODE = '42501';
  END IF;

  -- Abre a tarefa existente mesmo se o material foi renomeado/removido do plano.
  SELECT * INTO v_task FROM public.tarefas
    WHERE project_id = p_project_id AND plan_material_id = p_material_id;
  IF FOUND THEN RETURN jsonb_build_object('task', to_jsonb(v_task), 'created', false); END IF;

  SELECT count(*) INTO v_count FROM public.campaign_plans WHERE project_id = p_project_id;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'O projeto precisa ter um único planejamento salvo para criar a tarefa.' USING ERRCODE = '22023';
  END IF;
  -- Serializa chamadas concorrentes do mesmo plano e usa somente dados persistidos.
  SELECT * INTO v_plan FROM public.campaign_plans WHERE project_id = p_project_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Planejamento não encontrado ou sem acesso.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_task FROM public.tarefas
    WHERE project_id = p_project_id AND plan_material_id = p_material_id;
  IF FOUND THEN RETURN jsonb_build_object('task', to_jsonb(v_task), 'created', false); END IF;

  SELECT count(*) INTO v_count FROM unnest(v_plan.materiais) AS m WHERE m->>'id' = p_material_id;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Material não encontrado ou com ID repetido. Salve o planejamento e tente novamente.' USING ERRCODE = '22023';
  END IF;
  SELECT m, ord INTO v_material, v_material_ord
    FROM unnest(v_plan.materiais) WITH ORDINALITY AS item(m, ord)
    WHERE m->>'id' = p_material_id;
  IF nullif(btrim(v_material->>'descricao'), '') IS NULL THEN
    RAISE EXCEPTION 'Dê um título ao material antes de criar a tarefa.' USING ERRCODE = '22023';
  END IF;

  v_raw_type := lower(translate(btrim(coalesce(v_material->>'tipo', '')), 'áàâãéêíóôõúç', 'aaaaeeiooouc'));
  v_type := CASE
    WHEN v_raw_type IN ('post','posts','post feed','design','story','stories','social_media') THEN 'arte'
    WHEN v_raw_type IN ('video','videos','edicao de video') THEN 'video'
    WHEN v_raw_type IN ('arte','carrossel','reels') THEN v_raw_type
    ELSE coalesce(nullif(v_raw_type, ''), 'arte') END;
  IF v_raw_type IN ('arte','post','posts','design','social_media')
     AND lower(coalesce(v_material->>'formato', '')) LIKE '%carrossel%' THEN
    v_type := 'carrossel';
  END IF;

  IF nullif(btrim(v_material->>'workflow_template_id'), '') IS NOT NULL THEN
    BEGIN
      v_workflow_template_id := (v_material->>'workflow_template_id')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'O fluxo escolhido para o material é inválido.' USING ERRCODE = '22023';
    END;
  END IF;

  SELECT * INTO v_workflow_template
  FROM public.task_workflow_templates w
  WHERE w.is_active
    AND v_type = ANY(w.task_types)
    AND (v_workflow_template_id IS NULL OR w.id = v_workflow_template_id)
  ORDER BY w.created_at, w.id
  LIMIT 1;
  IF v_workflow_template_id IS NOT NULL AND v_workflow_template.id IS NULL THEN
    RAISE EXCEPTION 'O fluxo escolhido não atende o tipo deste material.' USING ERRCODE = '22023';
  END IF;
  IF v_workflow_template.id IS NOT NULL THEN
    v_workflow_template_id := v_workflow_template.id;
    v_requested_entry_key := nullif(btrim(v_material->>'workflow_entry_stage_key'), '');
    IF v_requested_entry_key IS NULL THEN
      IF coalesce(v_material->>'briefing_status', 'needs_briefing') <> 'ready' THEN
        v_requested_entry_key := 'briefing';
      ELSIF v_type IN ('video', 'reels') THEN
        v_requested_entry_key := CASE coalesce(v_material->>'script_status', 'not_started')
          WHEN 'ready_for_review' THEN 'script_review'
          WHEN 'approved' THEN 'recording'
          ELSE 'script'
        END;
      ELSE
        v_requested_entry_key := 'art_production';
      END IF;
    END IF;
    SELECT stage->>'key' INTO v_workflow_entry_stage_key
    FROM jsonb_array_elements(v_workflow_template.stages) AS stage
    WHERE stage->>'key' = v_requested_entry_key
    LIMIT 1;
    IF v_workflow_entry_stage_key IS NULL THEN
      SELECT stage->>'key' INTO v_workflow_entry_stage_key
      FROM jsonb_array_elements(v_workflow_template.stages) WITH ORDINALITY AS item(stage, ord)
      WHERE ord > 1
      ORDER BY ord
      LIMIT 1;
    END IF;
  END IF;

  v_title_label := CASE
    WHEN v_raw_type IN ('video','videos','edicao de video') THEN 'Video'
    WHEN v_raw_type IN ('story','stories') THEN 'Story'
    WHEN v_raw_type IN ('post','posts','post feed') THEN 'Post'
    WHEN v_type = 'carrossel' THEN 'Carrossel'
    WHEN v_type = 'reels' THEN 'Reels'
    WHEN v_type = 'arte' THEN 'Arte'
    ELSE 'Outro' END;

  v_number := regexp_replace(coalesce(v_material->>'numero', ''), '[^0-9]', '', 'g');
  IF length(v_number) > 4 THEN
    RAISE EXCEPTION 'O número do material deve ter no máximo 4 dígitos.' USING ERRCODE = '22023';
  END IF;
  IF coalesce(v_number, '') = '' THEN
    v_task_name := lower(translate(btrim(v_material->>'descricao'), 'áàâãéêíóôõúç', 'aaaaeeiooouc'));
    IF v_task_name ~ '^(video|videos|arte|carrossel|reels?|story|stories|post|posts)[[:space:]]+[0-9]+' THEN
      v_number := substring(v_task_name from '([0-9]+)');
    END IF;
  END IF;
  IF coalesce(v_number, '') = '' OR v_number::integer < 1 THEN
    SELECT count(*)::text INTO v_number
      FROM unnest(v_plan.materiais) WITH ORDINALITY AS item(m, ord)
      WHERE ord <= v_material_ord
        AND lower(translate(btrim(coalesce(m->>'tipo', '')), 'áàâãéêíóôõúç', 'aaaaeeiooouc')) = v_raw_type;
  END IF;
  v_number := lpad((v_number::integer)::text, 2, '0');

  v_task_name := btrim(v_material->>'descricao');
  v_task_name := regexp_replace(v_task_name, '^\[[^]]+\][[:space:]]*', '', 'i');
  v_task_name := btrim(regexp_replace(v_task_name,
    '^(video|vídeo|videos|arte|carrossel|reels?|story|stories|post|posts)[[:space:]]+[0-9]+[[:space:]]*([-–—:][[:space:]]*)?', '', 'i'));
  IF nullif(v_task_name, '') IS NULL THEN
    RAISE EXCEPTION 'Dê um nome à tarefa além do tipo e número.' USING ERRCODE = '22023';
  END IF;

  -- Somente a seleção de canais é transferida; destino e prova pertencem às publicações.
  WITH channels AS (
    SELECT value, ord FROM jsonb_array_elements_text(
      CASE
        WHEN jsonb_typeof(v_material->'canais') = 'array' THEN v_material->'canais'
        WHEN jsonb_typeof(v_material->'plataformas') = 'array' THEN v_material->'plataformas'
        ELSE to_jsonb(regexp_split_to_array(coalesce(v_material->>'plataforma', ''), '[,;|]'))
      END
    ) WITH ORDINALITY AS c(value, ord)
  ), canonical AS (
    SELECT CASE lower(translate(btrim(value), 'áàâãéêíóôõúç', 'aaaaeeiooouc'))
      WHEN 'instagram' THEN 'Instagram' WHEN 'facebook' THEN 'Facebook'
      WHEN 'linkedin' THEN 'LinkedIn' WHEN 'tiktok' THEN 'TikTok'
      WHEN 'youtube' THEN 'YouTube' WHEN 'site' THEN 'Site'
      WHEN 'google meu negocio' THEN 'Google Meu Negócio'
      WHEN 'google business' THEN 'Google Meu Negócio'
      WHEN 'google business profile' THEN 'Google Meu Negócio'
      ELSE 'Outro' END AS channel, ord
    FROM channels WHERE nullif(btrim(value), '') IS NOT NULL
  ), distinct_channels AS (SELECT channel, min(ord) AS ord FROM canonical GROUP BY channel)
  SELECT coalesce(array_agg(channel ORDER BY ord), '{}'::text[]) INTO v_channels FROM distinct_channels;

  IF nullif(btrim(v_material->>'data_entrega'), '') IS NOT NULL THEN
    IF (v_material->>'data_entrega') !~ '^\d{4}-\d{2}-\d{2}$' THEN
      RAISE EXCEPTION 'Data de entrega inválida.' USING ERRCODE = '22007';
    END IF;
    v_due_date := (v_material->>'data_entrega')::date;
  END IF;
  IF nullif(btrim(v_material->>'data_postagem'), '') IS NOT NULL THEN
    IF (v_material->>'data_postagem') !~ '^\d{4}-\d{2}-\d{2}$' THEN
      RAISE EXCEPTION 'Data de postagem inválida.' USING ERRCODE = '22007';
    END IF;
    v_post_date := (v_material->>'data_postagem')::date;
  END IF;
  IF nullif(v_material->>'responsavel_id', '') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles WHERE id::text = v_material->>'responsavel_id'
        AND status = 'active' AND role IN ('superadmin','admin','colaborador')
    ) THEN
      RAISE EXCEPTION 'O responsável do material não está ativo na equipe.' USING ERRCODE = '22023';
    END IF;
    v_assignees := ARRAY[(v_material->>'responsavel_id')::uuid];
  END IF;
  v_description := nullif(concat_ws(E'\n\n',
    nullif(btrim(v_material->>'detalhes'), ''),
    CASE WHEN nullif(btrim(v_material->>'briefing'), '') IS NOT NULL THEN 'Briefing: ' || (v_material->>'briefing') END,
    CASE WHEN nullif(btrim(v_material->>'roteiro'), '') IS NOT NULL THEN 'Roteiro: ' || (v_material->>'roteiro') END,
    CASE WHEN nullif(btrim(v_material->>'legenda'), '') IS NOT NULL THEN 'Legenda: ' || (v_material->>'legenda') END,
    CASE WHEN nullif(btrim(v_material->>'cta'), '') IS NOT NULL THEN 'CTA: ' || (v_material->>'cta') END,
    CASE WHEN nullif(btrim(v_material->>'referencias'), '') IS NOT NULL THEN 'Referências: ' || (v_material->>'referencias') END
  ), '');

  -- Mantém A Fazer como entrada e deixa o trigger atribuir a primeira função necessária.
  INSERT INTO public.tarefas (
    title, description, status, project_id, client_id, owner_id, type,
    due_date, post_date, assignee_ids, plataforma, plan_material_id,
    planned_channels, briefing_payload, demand_type, demand_origin, workflow_template_id, workflow_entry_stage_key
  ) VALUES (
    '[' || coalesce(nullif(btrim(v_client_name), ''), 'Cliente') || '] ' || v_title_label || ' ' || v_number || ' - ' || v_task_name,
    v_description, 'todo', p_project_id, v_project.client_id, v_actor, v_type,
    v_due_date, v_post_date, v_assignees, v_channels[1], p_material_id,
    v_channels, jsonb_build_object('plan_material', v_material, 'plan_id', v_plan.id), 'planned', 'plan', v_workflow_template_id, v_workflow_entry_stage_key
  ) ON CONFLICT (project_id, plan_material_id) DO NOTHING RETURNING * INTO v_task;
  IF FOUND THEN RETURN jsonb_build_object('task', to_jsonb(v_task), 'created', true); END IF;
  SELECT * INTO v_task FROM public.tarefas
    WHERE project_id = p_project_id AND plan_material_id = p_material_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'A tarefa já existe, mas não está disponível para este usuário.' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object('task', to_jsonb(v_task), 'created', false);
END;
$$;


REVOKE ALL ON FUNCTION public.create_task_from_plan_material(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_task_from_plan_material(uuid, text) TO authenticated;
COMMENT ON FUNCTION public.create_task_from_plan_material(uuid, text) IS
  'Cria ou retorna a tarefa do material em A Fazer, atribuída à primeira função que ainda precisa atuar.';

NOTIFY pgrst, 'reload schema';

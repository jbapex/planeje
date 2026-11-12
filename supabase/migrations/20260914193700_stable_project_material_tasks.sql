-- Planejamento é a origem; status, funções e responsáveis continuam em Tarefas.
-- Nenhum vínculo histórico é inferido pelo título.
-- Planos antigos conservam NULL até seu primeiro salvamento; não há backfill.
ALTER TABLE public.campaign_plans ADD COLUMN IF NOT EXISTS updated_at timestamptz;

CREATE OR REPLACE FUNCTION public.stamp_campaign_plan_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.stamp_campaign_plan_updated_at() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER campaign_plans_stamp_updated_at
  BEFORE INSERT OR UPDATE ON public.campaign_plans
  FOR EACH ROW EXECUTE FUNCTION public.stamp_campaign_plan_updated_at();

ALTER TABLE public.tarefas
  ADD COLUMN IF NOT EXISTS plan_material_id text,
  ADD COLUMN IF NOT EXISTS planned_channels text[] NOT NULL DEFAULT '{}'::text[];

ALTER TABLE public.tarefas
  ADD CONSTRAINT tarefas_plan_material_valid
    CHECK (plan_material_id IS NULL OR (project_id IS NOT NULL AND length(btrim(plan_material_id)) BETWEEN 1 AND 200));

CREATE UNIQUE INDEX IF NOT EXISTS tarefas_project_plan_material_unique
  ON public.tarefas (project_id, plan_material_id);

COMMENT ON COLUMN public.tarefas.plan_material_id IS
  'ID estável do material salvo no planejamento do projeto. Não depende do título da tarefa.';
COMMENT ON COLUMN public.tarefas.planned_channels IS
  'Canais pretendidos no planejamento. As ocorrências e seus status são configurados em task_channel_publications.';

CREATE OR REPLACE FUNCTION planeje_private.guard_task_planned_channels_before_published()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_missing text;
BEGIN
  -- Mesma conclusão do guard existente; não cria mapeamentos de status paralelos.
  IF NEW.status = 'published'
     AND (TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status)
     AND cardinality(coalesce(NEW.planned_channels, '{}'::text[])) > 0 THEN
    SELECT string_agg(planned.channel, ', ' ORDER BY planned.channel) INTO v_missing
    FROM unnest(NEW.planned_channels) AS planned(channel)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.task_channel_publications publication
      WHERE publication.task_id = NEW.id
        AND lower(btrim(publication.channel)) = lower(btrim(planned.channel))
    );
    IF v_missing IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE = '23514',
        MESSAGE = 'Configure os canais planejados em Publicações antes de concluir: ' || v_missing || '.';
    END IF;
  END IF;
  -- Publicações canceladas representam decisão explícita. Pendências e evidências
  -- continuam sob os guards/constraints já existentes.
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION planeje_private.guard_task_planned_channels_before_published()
  FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER tarefas_guard_planned_channels_before_published
  BEFORE INSERT OR UPDATE OF status ON public.tarefas
  FOR EACH ROW EXECUTE FUNCTION planeje_private.guard_task_planned_channels_before_published();

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
  v_channels text[];
  v_description text;
  v_due_date date;
  v_post_date date;
  v_assignees uuid[] := '{}'::uuid[];
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
  SELECT m INTO v_material FROM unnest(v_plan.materiais) AS m WHERE m->>'id' = p_material_id;
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

  -- Não define fluxo/função nem altera seus triggers. O fluxo existente trata o INSERT.
  INSERT INTO public.tarefas (
    title, description, status, project_id, client_id, owner_id, type,
    due_date, post_date, assignee_ids, plataforma, plan_material_id,
    planned_channels, briefing_payload, demand_type, demand_origin
  ) VALUES (
    '[' || coalesce(nullif(btrim(v_client_name), ''), 'Cliente') || '] ' || btrim(v_material->>'descricao'),
    v_description, 'todo', p_project_id, v_project.client_id, v_actor, v_type,
    v_due_date, v_post_date, v_assignees, v_channels[1], p_material_id,
    v_channels, jsonb_build_object('plan_material', v_material, 'plan_id', v_plan.id), 'planned', 'plan'
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
  'Cria ou retorna a mesma tarefa para um material salvo, sob as permissões do usuário e os fluxos atuais de Tarefas.';

CREATE OR REPLACE FUNCTION public.link_task_to_plan_material(p_project_id uuid, p_material_id text, p_task_id uuid)
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
  v_count integer;
BEGIN
  IF v_actor IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = v_actor AND status = 'active'
      AND role IN ('superadmin','admin','colaborador')
  ) THEN
    RAISE EXCEPTION 'Entre com um usuário ativo da equipe para vincular a tarefa.' USING ERRCODE = '42501';
  END IF;
  IF p_project_id IS NULL OR p_task_id IS NULL OR p_material_id IS NULL
     OR length(btrim(p_material_id)) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'Informe o projeto, material e tarefa.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_project FROM public.projetos WHERE id = p_project_id;
  IF NOT FOUND OR v_project.client_id IS NULL THEN
    RAISE EXCEPTION 'Projeto não encontrado, sem cliente ou sem acesso.' USING ERRCODE = '42501';
  END IF;
  SELECT count(*) INTO v_count FROM public.campaign_plans WHERE project_id = p_project_id;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'O projeto precisa ter um único planejamento salvo.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_plan FROM public.campaign_plans WHERE project_id = p_project_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Planejamento sem acesso.' USING ERRCODE = '42501'; END IF;
  SELECT count(*) INTO v_count FROM unnest(v_plan.materiais) m WHERE m->>'id' = p_material_id;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Material não encontrado ou com ID repetido. Salve o planejamento.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_task FROM public.tarefas WHERE id = p_task_id FOR UPDATE;
  IF NOT FOUND OR v_task.project_id IS DISTINCT FROM p_project_id
     OR v_task.client_id IS DISTINCT FROM v_project.client_id THEN
    RAISE EXCEPTION 'Escolha uma tarefa deste projeto e cliente.' USING ERRCODE = '42501';
  END IF;
  IF v_task.plan_material_id = p_material_id THEN
    RETURN jsonb_build_object('task', to_jsonb(v_task), 'linked', false);
  END IF;
  IF v_task.plan_material_id IS NOT NULL THEN
    RAISE EXCEPTION 'Esta tarefa já está vinculada a outro material.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.tarefas WHERE project_id = p_project_id AND plan_material_id = p_material_id) THEN
    RAISE EXCEPTION 'Este material já tem uma tarefa vinculada.' USING ERRCODE = '23505';
  END IF;
  -- UPDATE apenas na identidade: não dispara os triggers de status/tipo/fluxo.
  UPDATE public.tarefas SET plan_material_id = p_material_id WHERE id = p_task_id RETURNING * INTO v_task;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sem permissão para vincular esta tarefa.' USING ERRCODE = '42501'; END IF;
  RETURN jsonb_build_object('task', to_jsonb(v_task), 'linked', true);
END;
$$;

REVOKE ALL ON FUNCTION public.link_task_to_plan_material(uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.link_task_to_plan_material(uuid, text, uuid) TO authenticated;
COMMENT ON FUNCTION public.link_task_to_plan_material(uuid, text, uuid) IS
  'Vínculo escolhido explicitamente pela equipe com uma tarefa existente do mesmo projeto/cliente. Preserva execução e responsáveis.';

NOTIFY pgrst, 'reload schema';

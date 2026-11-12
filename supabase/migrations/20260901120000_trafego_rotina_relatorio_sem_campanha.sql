-- Rotina fixa: relatório quinzenal automático (system/report_15d) não exige campanha Planeje na criação.

CREATE OR REPLACE FUNCTION public.create_traffic_demand(
  p_title text,
  p_client_id uuid,
  p_demand_type text,
  p_due_date date,
  p_priority text,
  p_assignee_ids uuid[],
  p_description text DEFAULT NULL,
  p_links jsonb DEFAULT '[]'::jsonb,
  p_campaign jsonb DEFAULT NULL,
  p_source_type text DEFAULT 'manual',
  p_source_reference text DEFAULT NULL,
  p_generated_from_task_id uuid DEFAULT NULL,
  p_generation_key text DEFAULT NULL,
  p_next_review_at timestamptz DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_status text;
  v_task_id uuid;
  v_link jsonb;
  v_campaign_id uuid;
  v_rel text;
  v_camp_status text;
  v_camp_name text;
  v_camp_assignee uuid;
  v_camp_budget numeric;
  v_skip_campaign_requirement boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Central de Tráfego: não autenticado';
  END IF;
  IF NOT public.central_trafego_is_internal() THEN
    RAISE EXCEPTION 'Central de Tráfego: apenas equipe interna pode criar demanda';
  END IF;
  IF NOT public.central_trafego_ui_allowed() THEN
    RAISE EXCEPTION 'Central de Tráfego: UI/RPC não liberada para este perfil';
  END IF;
  IF p_title IS NULL OR btrim(p_title) = '' THEN
    RAISE EXCEPTION 'Central de Tráfego: título obrigatório';
  END IF;
  IF p_client_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.clientes WHERE id = p_client_id) THEN
    RAISE EXCEPTION 'Central de Tráfego: cliente obrigatório';
  END IF;
  IF NOT public.central_trafego_can_access_client(p_client_id) THEN
    IF p_generated_from_task_id IS NULL OR NOT public.central_trafego_can_see_task(p_generated_from_task_id) THEN
      RAISE EXCEPTION 'Central de Tráfego: sem acesso a este cliente';
    END IF;
  END IF;
  IF p_due_date IS NULL THEN
    RAISE EXCEPTION 'Central de Tráfego: prazo obrigatório';
  END IF;
  p_priority := public.central_trafego_normalize_priority(p_priority);
  IF p_demand_type IS NULL OR p_demand_type NOT IN (
    'nova_campanha', 'publicacao', 'revisao_24h', 'revisao_72h',
    'analise', 'orcamento', 'criativo', 'relatorio',
    'cobranca_material', 'aprovacao_cliente', 'pausa_reativacao',
    'rastreamento', 'ajuste', 'outro'
  ) THEN
    RAISE EXCEPTION 'Central de Tráfego: demand_type inválido';
  END IF;
  IF COALESCE(p_source_type, 'manual') NOT IN ('manual', 'review', 'legacy', 'successor', 'system') THEN
    RAISE EXCEPTION 'Central de Tráfego: source_type inválido';
  END IF;

  v_skip_campaign_requirement :=
    COALESCE(p_source_type, 'manual') = 'system'
    AND p_generation_key IS NOT NULL
    AND p_generation_key LIKE 'report_15d:%';

  PERFORM public.central_trafego_assert_assignees(p_assignee_ids);

  SELECT value INTO v_status FROM public.task_statuses WHERE is_initial LIMIT 1;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Central de Tráfego: nenhum status inicial configurado em task_statuses.is_initial';
  END IF;

  IF p_generated_from_task_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.tarefas src
      WHERE src.id = p_generated_from_task_id AND src.client_id = p_client_id
    ) THEN
      RAISE EXCEPTION 'Central de Tráfego: tarefa geradora inválida ou de outro cliente';
    END IF;
    IF NOT public.central_trafego_can_see_task(p_generated_from_task_id) THEN
      RAISE EXCEPTION 'Central de Tráfego: sem acesso à tarefa geradora';
    END IF;
  END IF;

  IF p_demand_type = 'nova_campanha' THEN
    IF p_links IS NOT NULL AND jsonb_typeof(p_links) = 'array' AND jsonb_array_length(p_links) > 0 THEN
      RAISE EXCEPTION 'Central de Tráfego: nova campanha não vincula campanha existente';
    END IF;
    IF p_campaign IS NULL OR jsonb_typeof(p_campaign) <> 'object' THEN
      RAISE EXCEPTION 'Central de Tráfego: dados da nova campanha obrigatórios';
    END IF;
  END IF;

  INSERT INTO public.tarefas (
    title, description, client_id, type, status, due_date, priority, owner_id, assignee_ids, status_history
  ) VALUES (
    btrim(p_title),
    NULLIF(btrim(COALESCE(p_description, '')), ''),
    p_client_id,
    'paid_traffic',
    v_status,
    p_due_date,
    p_priority,
    v_uid,
    p_assignee_ids,
    jsonb_build_array(jsonb_build_object(
      'status', v_status,
      'user_id', v_uid,
      'timestamp', to_char(timezone('utc', now()), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'assignee_ids', to_jsonb(p_assignee_ids)
    ))
  )
  RETURNING id INTO v_task_id;

  INSERT INTO public.traffic_task_details (
    task_id, demand_type, source_type, source_reference,
    generated_from_task_id, generation_key, next_review_at
  ) VALUES (
    v_task_id,
    p_demand_type,
    COALESCE(NULLIF(p_source_type, ''), 'manual'),
    NULLIF(p_source_reference, ''),
    p_generated_from_task_id,
    NULLIF(p_generation_key, ''),
    p_next_review_at
  );

  IF p_demand_type = 'nova_campanha' THEN
    v_camp_name := NULLIF(btrim(COALESCE(p_campaign->>'name', '')), '');
    IF v_camp_name IS NULL THEN
      RAISE EXCEPTION 'Central de Tráfego: nome da campanha obrigatório';
    END IF;
    BEGIN
      v_camp_budget := NULLIF(p_campaign->>'budget', '')::numeric;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'Central de Tráfego: orçamento da campanha inválido';
    END;
    IF v_camp_budget IS NULL OR v_camp_budget <= 0 THEN
      RAISE EXCEPTION 'Central de Tráfego: orçamento da campanha deve ser maior que zero';
    END IF;
    IF NOT public.central_trafego_kpis_valid(p_campaign->'kpis') THEN
      RAISE EXCEPTION 'Central de Tráfego: kpis da campanha em formato inválido';
    END IF;
    v_camp_assignee := public.central_trafego_try_uuid(p_campaign->>'assignee_id');
    IF v_camp_assignee IS NULL THEN
      RAISE EXCEPTION 'Central de Tráfego: responsável da campanha obrigatório';
    END IF;
    PERFORM public.central_trafego_assert_assignees(ARRAY[v_camp_assignee]);

    SELECT value INTO v_camp_status
    FROM public.paid_campaign_statuses
    WHERE lifecycle = 'planning' AND value = 'planning'
    LIMIT 1;
    IF v_camp_status IS NULL THEN
      SELECT value INTO v_camp_status FROM public.paid_campaign_statuses WHERE lifecycle = 'planning' LIMIT 1;
    END IF;
    IF v_camp_status IS NULL THEN
      RAISE EXCEPTION 'Central de Tráfego: nenhum status de campanha com lifecycle=planning';
    END IF;

    INSERT INTO public.paid_campaigns (
      name, description, budget, kpis, client_id, owner_id, assignee_id, status, ad_sets
    ) VALUES (
      v_camp_name,
      NULLIF(btrim(COALESCE(p_campaign->>'description', '')), ''),
      v_camp_budget,
      COALESCE(p_campaign->'kpis', '[]'::jsonb),
      p_client_id,
      v_uid,
      v_camp_assignee,
      v_camp_status,
      '[]'::jsonb
    )
    RETURNING id INTO v_campaign_id;

    INSERT INTO public.paid_campaign_task_links (task_id, paid_campaign_id, relation_type, created_by)
    VALUES (v_task_id, v_campaign_id, 'origin', v_uid);
  ELSIF p_links IS NOT NULL AND jsonb_typeof(p_links) = 'array' THEN
    FOR v_link IN SELECT * FROM jsonb_array_elements(p_links)
    LOOP
      v_campaign_id := public.central_trafego_try_uuid(v_link->>'paid_campaign_id');
      v_rel := COALESCE(NULLIF(v_link->>'relation_type', ''), 'linked');
      IF v_campaign_id IS NULL THEN
        CONTINUE;
      END IF;
      IF NOT public.central_trafego_campaign_of_client(v_campaign_id, p_client_id) THEN
        RAISE EXCEPTION 'Central de Tráfego: campanha % não pertence ao cliente da demanda', v_campaign_id;
      END IF;
      INSERT INTO public.paid_campaign_task_links (task_id, paid_campaign_id, relation_type, created_by)
      VALUES (v_task_id, v_campaign_id, v_rel, v_uid)
      ON CONFLICT (task_id, paid_campaign_id, relation_type) DO NOTHING;
    END LOOP;
  END IF;

  IF public.central_trafego_demand_requires_existing_campaign(p_demand_type)
     AND NOT v_skip_campaign_requirement
     AND NOT EXISTS (SELECT 1 FROM public.paid_campaign_task_links l WHERE l.task_id = v_task_id) THEN
    RAISE EXCEPTION 'Central de Tráfego: este tipo exige campanha válida do mesmo cliente';
  END IF;

  RETURN v_task_id;
END;
$$;

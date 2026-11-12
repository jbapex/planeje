-- Testes transacionais da Central de Tráfego — Fase 1.
-- SOMENTE banco descartável, DEPOIS da fixture pre e da migration real.
-- NÃO executar em produção.
-- NÃO reimplementa o backfill: só confere o resultado da migration sobre __ct_fase1_*.
--
--   psql ... -v ON_ERROR_STOP=1 -f scripts/test-central-trafego-fase1.pg.sql

\set ON_ERROR_STOP on

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.central_test_set_uid(p_uid uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', p_uid::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', p_uid::text, 'role', 'authenticated')::text,
    true
  );
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.central_test_count_rpc_leftovers()
RETURNS integer
LANGUAGE sql
AS $$
  SELECT (
    (SELECT count(*) FROM public.tarefas WHERE title LIKE '__ct_fase1_rpc_%')
    + (SELECT count(*) FROM public.paid_campaign_task_links l
       JOIN public.paid_campaigns pc ON pc.id = l.paid_campaign_id
       WHERE pc.name LIKE '__ct_fase1_rpc_%')
    + (SELECT count(*) FROM public.traffic_completion_evidence e
       JOIN public.tarefas t ON t.id = e.task_id
       WHERE t.title LIKE '__ct_fase1_rpc_%')
  )::integer
$$;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF public.central_trafego_try_uuid('nao-e-uuid') IS NOT NULL THEN
    RAISE EXCEPTION 'UUID inválido não pode converter';
  END IF;
  IF public.central_trafego_try_uuid('11111111-1111-1111-1111-111111111111') IS NULL THEN
    RAISE EXCEPTION 'UUID válido deve converter';
  END IF;
  IF public.central_trafego_normalize_priority('alta') IS DISTINCT FROM 'high'
     OR public.central_trafego_normalize_priority('media') IS DISTINCT FROM 'medium'
     OR public.central_trafego_normalize_priority(NULL) IS DISTINCT FROM 'medium' THEN
    RAISE EXCEPTION 'normalização de prioridade';
  END IF;
  IF public.central_trafego_operational_date() IS DISTINCT FROM (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN
    RAISE EXCEPTION 'data operacional deve ser America/Sao_Paulo';
  END IF;
  IF (timestamptz '2026-08-26 00:00:00+00' AT TIME ZONE 'America/Sao_Paulo')::date
     IS DISTINCT FROM DATE '2026-08-25' THEN
    RAISE EXCEPTION '21h de Brasília deve permanecer 2026-08-25, não a data UTC';
  END IF;
  IF public.central_trafego_demand_requires_existing_campaign('publicacao') IS NOT TRUE THEN
    RAISE EXCEPTION 'publicacao exige campanha';
  END IF;
  IF public.central_trafego_kpis_valid(NULL) IS NOT TRUE
     OR public.central_trafego_kpis_valid('null'::jsonb) IS NOT TRUE THEN
    RAISE EXCEPTION 'kpis NULL/json null deve ser válido';
  END IF;
  IF public.central_trafego_kpis_valid('"string"'::jsonb)
     OR public.central_trafego_kpis_valid('{"name":"x"}'::jsonb)
     OR public.central_trafego_kpis_valid('[1,2]'::jsonb)
     OR public.central_trafego_kpis_valid('[{"name":""}]'::jsonb) THEN
    RAISE EXCEPTION 'kpis inválido deve falhar sem jsonb_array_elements em não-array';
  END IF;
  IF NOT public.central_trafego_kpis_valid('[{"name":"CPL"}]'::jsonb) THEN
    RAISE EXCEPTION 'kpis array de objetos com name deve passar';
  END IF;
  IF public.central_trafego_min_comment_chars('ajuste') IS DISTINCT FROM 20
     OR public.central_trafego_min_comment_chars('relatorio') IS DISTINCT FROM 80 THEN
    RAISE EXCEPTION 'mínimo textual';
  END IF;
END $$;

-- A migration não substitui a função global da Caixa (corpo não cita a Central).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'criar_pendencias_caixa_comentario'
      AND pg_get_functiondef(p.oid) ILIKE '%trafego_conclusao%'
  ) THEN
    RAISE EXCEPTION 'criar_pendencias_caixa_comentario não pode ser substituída pela Central';
  END IF;
END $$;

-- Situação não lê clientes.updated_at (coluna inexistente no dump) nem created_at como fallback.
DO $$
DECLARE
  v_def text;
BEGIN
  v_def := pg_get_functiondef('public.central_trafego_situacao()'::regprocedure);
  IF v_def ~ 'clientes\.updated_at' OR v_def ~ '\mc\.updated_at\M' THEN
    RAISE EXCEPTION 'central_trafego_situacao referencia clientes.updated_at';
  END IF;
  IF v_def ~ 'client_updated_at' THEN
    RAISE EXCEPTION 'central_trafego_situacao ainda usa client_updated_at';
  END IF;
  IF v_def ~* 'COALESCE\s*\(\s*r\.ops_updated_at' THEN
    RAISE EXCEPTION 'updated_at da Situação não pode cair para data do cliente';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Backfill real (fixtures pre; não reexecuta o INSERT do backfill)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_n int;
  v_prio text;
  v_sit text;
  v_gestor uuid;
  v_client uuid;
  v_task uuid;
  v_camp uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.clientes WHERE empresa = '__ct_fase1_client_a') THEN
    RAISE EXCEPTION 'fixture pre ausente (__ct_fase1_client_a); rode test-central-trafego-fase1.pre.pg.sql antes da migration';
  END IF;

  SELECT count(*) INTO v_n
  FROM public.paid_campaign_task_links l
  JOIN public.paid_campaigns pc ON pc.id = l.paid_campaign_id
  WHERE pc.name = '__ct_fase1_camp_uuid_invalido';
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'backfill: task_id inválido não pode gerar link (count=%)', v_n;
  END IF;

  SELECT t.id, pc.id INTO v_task, v_camp
  FROM public.tarefas t
  JOIN public.paid_campaigns pc ON pc.client_id = t.client_id AND pc.name = '__ct_fase1_camp_legacy_ok'
  WHERE t.title = '__ct_fase1_task_legacy';
  IF v_task IS NULL OR v_camp IS NULL THEN
    RAISE EXCEPTION 'fixture pre de legado válido ausente';
  END IF;
  SELECT count(*) INTO v_n
  FROM public.paid_campaign_task_links
  WHERE task_id = v_task AND paid_campaign_id = v_camp AND relation_type = 'legacy';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'backfill: ligação legada do mesmo cliente ausente (count=%)', v_n;
  END IF;

  SELECT priority INTO v_prio FROM public.tarefas WHERE title = '__ct_fase1_task_alta';
  IF v_prio IS DISTINCT FROM 'high' THEN
    RAISE EXCEPTION 'backfill prioridade alta -> high, obtido %', v_prio;
  END IF;
  SELECT priority INTO v_prio FROM public.tarefas WHERE title = '__ct_fase1_task_media';
  IF v_prio IS DISTINCT FROM 'medium' THEN
    RAISE EXCEPTION 'backfill prioridade media -> medium, obtido %', v_prio;
  END IF;
  SELECT priority INTO v_prio FROM public.tarefas WHERE title = '__ct_fase1_task_nullprio';
  IF v_prio IS DISTINCT FROM 'medium' THEN
    RAISE EXCEPTION 'backfill prioridade NULL -> medium, obtido %', v_prio;
  END IF;

  SELECT c.id INTO v_client FROM public.clientes c WHERE c.empresa = '__ct_fase1_client_a';
  SELECT situation, primary_assignee_id INTO v_sit, v_gestor
  FROM public.traffic_client_ops
  WHERE client_id = v_client;
  IF v_sit IS DISTINCT FROM 'needs_review' OR v_gestor IS NOT NULL THEN
    RAISE EXCEPTION 'backfill sem gestor inequívoco deve ser needs_review + gestor NULL';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- FK evidência: exatamente uma constraint, RESTRICT, e DELETE bloqueado por ela
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_n int;
  v_rule text;
  v_task uuid;
  v_camp uuid;
  v_client uuid;
  v_owner uuid;
  v_con text;
  v_state text;
BEGIN
  SELECT count(*), min(delete_rule)
  INTO v_n, v_rule
  FROM information_schema.referential_constraints
  WHERE constraint_schema = 'public'
    AND constraint_name = 'traffic_completion_evidence_campaign_id_fkey';

  IF v_n <> 1 THEN
    RAISE EXCEPTION 'FK traffic_completion_evidence_campaign_id_fkey ausente ou duplicada (count=%)', v_n;
  END IF;
  IF v_rule IS DISTINCT FROM 'RESTRICT' THEN
    RAISE EXCEPTION 'FK campaign_id delete_rule deve ser RESTRICT, obtido %', v_rule;
  END IF;

  SELECT id INTO v_client FROM public.clientes WHERE empresa = '__ct_fase1_client_a';
  SELECT id INTO v_owner FROM public.profiles WHERE role IN ('superadmin', 'admin', 'colaborador') LIMIT 1;
  SELECT id INTO v_task FROM public.tarefas WHERE title = '__ct_fase1_task_legacy';
  IF v_client IS NULL OR v_owner IS NULL OR v_task IS NULL THEN
    RAISE EXCEPTION 'fixture pre insuficiente para DELETE RESTRICT';
  END IF;

  INSERT INTO public.paid_campaigns (name, client_id, owner_id, status, ad_sets, kpis)
  VALUES (
    '__ct_fase1_rpc_camp_restrict',
    v_client,
    v_owner,
    COALESCE((SELECT value FROM public.paid_campaign_statuses WHERE value = 'planning'), (SELECT value FROM public.paid_campaign_statuses LIMIT 1)),
    '[]'::jsonb,
    '[]'::jsonb
  )
  RETURNING id INTO v_camp;

  INSERT INTO public.traffic_completion_evidence (task_id, campaign_id, evidence_kind)
  VALUES (v_task, v_camp, 'campaign');

  BEGIN
    DELETE FROM public.paid_campaigns WHERE id = v_camp;
    RAISE EXCEPTION 'DELETE de campanha com evidência deveria falhar (RESTRICT)';
  EXCEPTION
    WHEN foreign_key_violation THEN
      GET STACKED DIAGNOSTICS v_con = CONSTRAINT_NAME;
      IF v_con IS DISTINCT FROM 'traffic_completion_evidence_campaign_id_fkey' THEN
        RAISE EXCEPTION 'DELETE bloqueado por constraint %, esperado traffic_completion_evidence_campaign_id_fkey', v_con;
      END IF;
    WHEN OTHERS THEN
      IF SQLERRM LIKE '%deveria falhar (RESTRICT)%' THEN
        RAISE;
      END IF;
      GET STACKED DIAGNOSTICS v_con = CONSTRAINT_NAME, v_state = RETURNED_SQLSTATE;
      RAISE EXCEPTION 'DELETE RESTRICT: esperado 23503 da FK de evidência, obtido % %', v_state, v_con;
  END;
END $$;

-- Sem UNIQUE global em attachment_id
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_index i
    JOIN pg_class t ON t.oid = i.indrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY (i.indkey)
    WHERE n.nspname = 'public'
      AND t.relname = 'traffic_completion_evidence'
      AND i.indisunique
      AND a.attname = 'attachment_id'
      AND i.indnkeyatts = 1
  ) THEN
    RAISE EXCEPTION 'attachment_id não pode ser unique global em evidências';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- RPCs / RLS — fixtures obrigatórias, causa específica, sem leftover
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_admin uuid;
  v_self uuid;
  v_other uuid;
  v_client uuid;
  v_other_camp uuid;
  v_non_traffic uuid;
  v_non_status text;
  v_err text;
  v_state text;
  v_task uuid;
  v_camp uuid;
  v_payload jsonb;
  v_row jsonb;
  v_client_b uuid;
BEGIN
  SELECT id INTO v_admin FROM public.profiles WHERE role IN ('superadmin', 'admin') LIMIT 1;
  SELECT id INTO v_self FROM public.profiles WHERE role = 'colaborador' LIMIT 1;
  SELECT id INTO v_other
  FROM public.profiles
  WHERE role IN ('superadmin', 'admin', 'colaborador')
    AND id IS DISTINCT FROM COALESCE(v_self, '00000000-0000-0000-0000-000000000000'::uuid)
  LIMIT 1;
  SELECT id INTO v_client FROM public.clientes WHERE empresa = '__ct_fase1_client_a';
  SELECT id INTO v_other_camp FROM public.paid_campaigns WHERE name = '__ct_fase1_camp_b';
  SELECT id, status INTO v_non_traffic, v_non_status
  FROM public.tarefas
  WHERE title = '__ct_fase1_task_nao_trafego';

  IF v_admin IS NULL THEN
    RAISE EXCEPTION 'dump sem admin/superadmin para RPCs';
  END IF;
  IF v_client IS NULL OR v_other_camp IS NULL OR v_non_traffic IS NULL THEN
    RAISE EXCEPTION 'fixtures pre ausentes (cliente A, campanha B, tarefa não-tráfego)';
  END IF;
  IF v_self IS NULL OR v_other IS NULL THEN
    RAISE EXCEPTION 'dump precisa de colaborador e de outro perfil interno para teste self';
  END IF;

  PERFORM pg_temp.central_test_set_uid(v_admin);

  BEGIN
    PERFORM public.create_traffic_demand(
      p_title := '__ct_fase1_rpc_pub_sem_campanha',
      p_client_id := v_client,
      p_demand_type := 'publicacao',
      p_due_date := public.central_trafego_operational_date(),
      p_priority := 'alta',
      p_assignee_ids := ARRAY[v_admin]
    );
    RAISE EXCEPTION 'publicação sem campanha deveria falhar';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    IF v_err NOT ILIKE '%este tipo exige campanha válida%' THEN
      RAISE EXCEPTION 'publicação sem campanha: causa inesperada: %', v_err;
    END IF;
  END;
  IF pg_temp.central_test_count_rpc_leftovers() <> 0 THEN
    RAISE EXCEPTION 'publicação sem campanha deixou tarefa/link/evidência';
  END IF;

  BEGIN
    PERFORM public.create_traffic_demand(
      p_title := '__ct_fase1_rpc_campanha_outro_cliente',
      p_client_id := v_client,
      p_demand_type := 'ajuste',
      p_due_date := public.central_trafego_operational_date(),
      p_priority := 'media',
      p_assignee_ids := ARRAY[v_admin],
      p_links := jsonb_build_array(jsonb_build_object(
        'paid_campaign_id', v_other_camp,
        'relation_type', 'linked'
      ))
    );
    RAISE EXCEPTION 'campanha de outro cliente deveria falhar';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    IF v_err NOT ILIKE '%não pertence ao cliente%' THEN
      RAISE EXCEPTION 'campanha de outro cliente: causa inesperada: %', v_err;
    END IF;
  END;
  IF pg_temp.central_test_count_rpc_leftovers() <> 0 THEN
    RAISE EXCEPTION 'campanha de outro cliente deixou tarefa/link/evidência';
  END IF;

  BEGIN
    PERFORM public.complete_traffic_demand(
      p_task_id := v_non_traffic,
      p_completion_summary := 'resumo suficiente',
      p_next_action_none := true,
      p_comment_content := 'evidência textual com mais de vinte caracteres.'
    );
    RAISE EXCEPTION 'complete em type<>paid_traffic deveria falhar';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    IF v_err NOT ILIKE '%somente tarefas type=paid_traffic%' THEN
      RAISE EXCEPTION 'complete não-tráfego: causa inesperada: %', v_err;
    END IF;
  END;
  IF EXISTS (
    SELECT 1 FROM public.tarefas
    WHERE id = v_non_traffic AND status IS DISTINCT FROM v_non_status
  ) THEN
    RAISE EXCEPTION 'complete não-tráfego alterou a tarefa';
  END IF;
  IF pg_temp.central_test_count_rpc_leftovers() <> 0 THEN
    RAISE EXCEPTION 'complete não-tráfego deixou leftover';
  END IF;

  DELETE FROM public.user_module_access
  WHERE user_id = v_self AND module_name IN ('tasks', 'paid_traffic');
  INSERT INTO public.user_module_access (user_id, module_name, access_level)
  VALUES (v_self, 'paid_traffic', 'self'), (v_self, 'tasks', 'self')
  ON CONFLICT (user_id, module_name) DO UPDATE SET access_level = 'self';

  PERFORM pg_temp.central_test_set_uid(v_self);
  BEGIN
    PERFORM public.central_trafego_assert_assignees(ARRAY[v_other]);
    RAISE EXCEPTION 'self atribuindo outro responsável deveria falhar';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    IF v_err NOT ILIKE '%só pode atribuir a demanda a si%' THEN
      RAISE EXCEPTION 'self-assign: causa inesperada: %', v_err;
    END IF;
  END;
  IF pg_temp.central_test_count_rpc_leftovers() <> 0 THEN
    RAISE EXCEPTION 'self-assign deixou leftover';
  END IF;

  -- no_campaign_expected: zera órfãs sem lookup por nome.
  PERFORM pg_temp.central_test_set_uid(v_admin);
  UPDATE public.traffic_client_ops
  SET situation = 'no_campaign_expected', primary_assignee_id = NULL
  WHERE client_id = v_client;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ops do cliente A ausente após backfill';
  END IF;

  v_payload := public.central_trafego_situacao();
  SELECT r FROM jsonb_array_elements(v_payload->'rows') r
  WHERE r->>'client_id' = v_client::text
  LIMIT 1
  INTO v_row;
  IF v_row IS NULL THEN
    RAISE EXCEPTION 'situacao não devolveu o cliente fixture';
  END IF;
  IF jsonb_array_length(COALESCE(v_row->'campaigns_without_demand', '[]'::jsonb)) <> 0 THEN
    RAISE EXCEPTION 'no_campaign_expected deve zerar campaigns_without_demand';
  END IF;
  IF (v_row->>'pending_gestor')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'fixture sem gestor deve marcar pending_gestor';
  END IF;
  IF COALESCE((v_row->>'client_pending')::int, 0) <> 0 THEN
    RAISE EXCEPTION 'pendência de gestor não deve inflar client_pending';
  END IF;
  IF v_row->>'updated_at' IS NULL THEN
    RAISE EXCEPTION 'com traffic_client_ops, updated_at operacional não pode ser nulo';
  END IF;

  SELECT id INTO v_client_b FROM public.clientes WHERE empresa = '__ct_fase1_client_b';
  IF v_client_b IS NULL THEN
    RAISE EXCEPTION 'fixture cliente B ausente';
  END IF;
  DELETE FROM public.traffic_client_ops WHERE client_id = v_client_b;
  v_payload := public.central_trafego_situacao();
  SELECT r FROM jsonb_array_elements(v_payload->'rows') r
  WHERE r->>'client_id' = v_client_b::text
  LIMIT 1
  INTO v_row;
  IF v_row IS NULL THEN
    RAISE EXCEPTION 'situacao não devolveu o cliente B sem ops';
  END IF;
  IF v_row->'updated_at' IS DISTINCT FROM 'null'::jsonb THEN
    RAISE EXCEPTION 'sem traffic_client_ops, updated_at deve ser JSON null (sem fallback)';
  END IF;

  -- RLS: INSERT estruturalmente válido; só 42501 conta.
  IF has_table_privilege('authenticated', 'public.traffic_completion_evidence', 'INSERT') THEN
    RAISE EXCEPTION 'authenticated não pode ter INSERT em traffic_completion_evidence';
  END IF;

  SELECT id INTO v_task FROM public.tarefas WHERE title = '__ct_fase1_task_legacy';
  SELECT id INTO v_camp FROM public.paid_campaigns WHERE name = '__ct_fase1_camp_legacy_ok';
  IF v_task IS NULL OR v_camp IS NULL THEN
    RAISE EXCEPTION 'fixture para INSERT de evidência ausente';
  END IF;

  BEGIN
    EXECUTE 'SET LOCAL ROLE authenticated';
    INSERT INTO public.traffic_completion_evidence (task_id, campaign_id, evidence_kind, created_by)
    VALUES (v_task, v_camp, 'campaign', v_admin);
    RAISE EXCEPTION 'INSERT direto em evidência deveria ser 42501';
  EXCEPTION
    WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_err = MESSAGE_TEXT;
      EXECUTE 'RESET ROLE';
      IF v_err LIKE 'INSERT direto em evidência deveria ser 42501' THEN
        RAISE EXCEPTION '%', v_err;
      END IF;
      IF v_state IS DISTINCT FROM '42501' THEN
        RAISE EXCEPTION 'INSERT evidência: esperado 42501, obtido %', v_state;
      END IF;
  END;
END $$;

ROLLBACK;

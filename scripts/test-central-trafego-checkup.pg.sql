-- Testes transacionais do check-up diário — Fase 1.1.
-- SOMENTE banco descartável, DEPOIS da Fase 1 e de
-- supabase/migrations/20260826220000_central_trafego_checkup.sql.
-- NÃO executar em produção.

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

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'criar_pendencias_caixa_comentario'
      AND pg_get_functiondef(p.oid) ILIKE '%checkup%'
  ) THEN
    RAISE EXCEPTION 'check-up não pode alterar criar_pendencias_caixa_comentario';
  END IF;
END $$;

DO $$
DECLARE
  v_def text;
BEGIN
  v_def := pg_get_functiondef('public.central_trafego_situacao()'::regprocedure);
  IF v_def ~ 'clientes\.updated_at' OR v_def ~ '\mc\.updated_at\M' THEN
    RAISE EXCEPTION 'situacao (1.1) referencia clientes.updated_at';
  END IF;
  IF v_def !~ 'checkup_summary' OR v_def !~ 'checkup_unreviewed' THEN
    RAISE EXCEPTION 'situacao deve expor resumo e não revisados do check-up';
  END IF;
  IF COALESCE((SELECT enabled FROM public.traffic_central_settings WHERE id), true) THEN
    RAISE EXCEPTION 'flag da Central deve permanecer desligada';
  END IF;
END $$;

DO $$
DECLARE
  v_admin uuid;
  v_colab uuid;
  v_client_a uuid;
  v_client_b uuid;
  v_today date := public.central_trafego_operational_date();
  v_first jsonb;
  v_second jsonb;
  v_att jsonb;
  v_att2 jsonb;
  v_snap jsonb;
  v_board jsonb;
  v_sit jsonb;
  v_row jsonb;
  v_tasks int;
  v_key text;
  v_state text;
  v_err text;
BEGIN
  SELECT id INTO v_admin FROM public.profiles WHERE role IN ('superadmin', 'admin') LIMIT 1;
  SELECT id INTO v_colab FROM public.profiles WHERE role = 'colaborador' LIMIT 1;
  SELECT id INTO v_client_a FROM public.clientes WHERE empresa = '__ct_fase1_client_a';
  SELECT id INTO v_client_b FROM public.clientes WHERE empresa = '__ct_fase1_client_b';
  IF v_admin IS NULL OR v_client_a IS NULL OR v_client_b IS NULL THEN
    RAISE EXCEPTION 'fixtures/admin ausentes para check-up';
  END IF;

  PERFORM pg_temp.central_test_set_uid(v_admin);

  v_snap := public.central_trafego_checkup_snapshot(v_client_a, v_today);
  IF COALESCE((v_snap->'spend_day'->>'available')::boolean, true) THEN
    RAISE EXCEPTION 'investimento do dia deve ser indisponível nesta fase';
  END IF;
  IF v_snap->>'spend_day' IS NOT NULL AND v_snap->'spend_day'->>'label' IS DISTINCT FROM 'Dados indisponíveis' THEN
    RAISE EXCEPTION 'rótulo do dia deve ser Dados indisponíveis';
  END IF;

  PERFORM public.upsert_traffic_checkup_settings(
    p_client_id := v_client_a,
    p_enabled := true,
    p_weekdays := ARRAY[1, 2, 3, 4, 5]::smallint[],
    p_require_active_campaign := false,
    p_require_budget := false
  );
  UPDATE public.traffic_client_ops
  SET situation = 'no_campaign_expected'
  WHERE client_id = v_client_a;
  v_snap := public.central_trafego_checkup_snapshot(v_client_a, v_today);
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(COALESCE(v_snap->'problems', '[]'::jsonb)) p
    WHERE p->>'code' = 'missing_active_campaign'
  ) THEN
    RAISE EXCEPTION 'no_campaign_expected / require_active_campaign=false não pode alertar campanha ausente';
  END IF;

  v_first := public.central_trafego_confirm_checkup(v_client_a, 'ok', 'conta conferida');
  IF COALESCE((v_first->>'created')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'primeira confirmação deveria criar o run';
  END IF;
  v_second := public.central_trafego_confirm_checkup(v_client_a, 'needs_attention', 'tentativa duplicada', 'problema', v_admin, v_today);
  IF COALESCE((v_second->>'created')::boolean, true) IS NOT FALSE THEN
    RAISE EXCEPTION 'segunda confirmação não pode criar outro check-in';
  END IF;
  IF v_second->'run'->>'id' IS DISTINCT FROM v_first->'run'->>'id' THEN
    RAISE EXCEPTION 'reload deve devolver o mesmo run';
  END IF;
  IF v_second->'run'->>'result' IS DISTINCT FROM 'ok' THEN
    RAISE EXCEPTION 'resultado do dia não pode ser sobrescrito';
  END IF;
  IF (SELECT count(*) FROM public.traffic_checkup_runs WHERE client_id = v_client_a AND operational_date = v_today) <> 1 THEN
    RAISE EXCEPTION 'mais de um run no mesmo dia';
  END IF;

  BEGIN
    PERFORM public.central_trafego_confirm_checkup(v_client_b, 'needs_attention', NULL, NULL, NULL, NULL);
    RAISE EXCEPTION 'atenção sem problema deveria falhar';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    IF v_err LIKE 'atenção sem problema deveria falhar' THEN
      RAISE EXCEPTION '%', v_err;
    END IF;
    IF v_err NOT ILIKE '%descreva o problema%' THEN
      RAISE EXCEPTION 'atenção sem problema: causa inesperada: %', v_err;
    END IF;
  END;

  v_att := public.central_trafego_confirm_checkup(
    v_client_b,
    'needs_attention',
    'CPA alto',
    'Criativo cansado, revisar conjunto',
    v_admin,
    v_today + 1
  );
  IF COALESCE((v_att->>'created')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'atenção deveria criar run';
  END IF;
  IF NULLIF(v_att->'run'->>'task_id', '') IS NULL THEN
    RAISE EXCEPTION 'atenção deve criar tarefa real';
  END IF;
  v_key := public.central_trafego_checkup_generation_key(v_client_b, v_today);
  IF NOT EXISTS (
    SELECT 1 FROM public.traffic_task_details d
    WHERE d.generation_key = v_key
      AND d.source_type = 'system'
      AND d.demand_type = 'analise'
      AND d.task_id = (v_att->'run'->>'task_id')::uuid
  ) THEN
    RAISE EXCEPTION 'tarefa de atenção deve usar generation_key e create_traffic_demand';
  END IF;

  v_att2 := public.central_trafego_confirm_checkup(
    v_client_b,
    'needs_attention',
    'de novo',
    'outro problema',
    v_admin,
    v_today + 2
  );
  IF COALESCE((v_att2->>'created')::boolean, true) IS NOT FALSE THEN
    RAISE EXCEPTION 'segunda atenção não pode criar outro check-in';
  END IF;
  SELECT count(*) INTO v_tasks
  FROM public.traffic_task_details
  WHERE generation_key = v_key;
  IF v_tasks <> 1 THEN
    RAISE EXCEPTION 'reload não pode duplicar tarefa (count=%)', v_tasks;
  END IF;

  v_board := public.central_trafego_checkup_board();
  IF v_board->>'operational_date' IS DISTINCT FROM v_today::text THEN
    RAISE EXCEPTION 'board deve usar data operacional de Brasília';
  END IF;

  v_sit := public.central_trafego_situacao();
  SELECT r FROM jsonb_array_elements(v_sit->'rows') r
  WHERE r->>'client_id' = v_client_b::text
  LIMIT 1
  INTO v_row;
  IF v_row->>'checkup_result' IS DISTINCT FROM 'needs_attention' THEN
    RAISE EXCEPTION 'situacao deve mostrar check-up de atenção';
  END IF;
  IF NULLIF(v_row->>'checkup_task_id', '') IS NULL THEN
    RAISE EXCEPTION 'situacao deve mostrar a tarefa criada';
  END IF;
  IF COALESCE((v_sit->'checkup_summary'->>'attention')::int, 0) < 1 THEN
    RAISE EXCEPTION 'resumo da situacao deve contar atenção';
  END IF;

  PERFORM public.upsert_traffic_checkup_settings(
    p_client_id := v_client_a,
    p_enabled := false,
    p_weekdays := ARRAY[1, 2, 3, 4, 5]::smallint[]
  );
  IF public.central_trafego_checkup_is_due(v_client_a, v_today) THEN
    RAISE EXCEPTION 'check-up desligado não pode ser due';
  END IF;

  IF v_colab IS NOT NULL THEN
    PERFORM pg_temp.central_test_set_uid(v_colab);
    BEGIN
      PERFORM public.central_trafego_checkup_board();
      RAISE EXCEPTION 'colaborador com flag off não deveria ver o board';
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
      IF v_err LIKE 'colaborador com flag off não deveria ver o board' THEN
        RAISE EXCEPTION '%', v_err;
      END IF;
      IF v_err NOT ILIKE '%não liberada%' THEN
        RAISE EXCEPTION 'colaborador flag off: causa inesperada: %', v_err;
      END IF;
    END;
  END IF;

  PERFORM pg_temp.central_test_set_uid(v_admin);
  IF has_table_privilege('authenticated', 'public.traffic_checkup_runs', 'INSERT') THEN
    RAISE EXCEPTION 'authenticated não pode ter INSERT em traffic_checkup_runs';
  END IF;
  IF has_table_privilege('authenticated', 'public.traffic_checkup_items', 'UPDATE') THEN
    RAISE EXCEPTION 'authenticated não pode ter UPDATE em traffic_checkup_items';
  END IF;

  BEGIN
    EXECUTE 'SET LOCAL ROLE authenticated';
    INSERT INTO public.traffic_checkup_runs (
      client_id, operational_date, result, confirmed_by
    ) VALUES (
      v_client_a, v_today + 10, 'ok', v_admin
    );
    RAISE EXCEPTION 'INSERT direto em checkup_runs deveria ser 42501';
  EXCEPTION
    WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_err = MESSAGE_TEXT;
      EXECUTE 'RESET ROLE';
      IF v_err LIKE 'INSERT direto em checkup_runs deveria ser 42501' THEN
        RAISE EXCEPTION '%', v_err;
      END IF;
      IF v_state IS DISTINCT FROM '42501' THEN
        RAISE EXCEPTION 'INSERT checkup_runs: esperado 42501, obtido %', v_state;
      END IF;
  END;
END $$;

ROLLBACK;

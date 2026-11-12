-- Central de Tráfego — Fase 1.1: check-up diário.
-- Aditiva. NÃO altera 20260826010000_central_trafego_fase1.sql.
-- Idempotente. Não liga a flag. Não toca criar_pendencias_caixa_comentario().
-- Data operacional = America/Sao_Paulo. Sem Google Ads. Sem integração Meta nova.

BEGIN;

CREATE TABLE IF NOT EXISTS public.traffic_checkup_settings (
  client_id uuid PRIMARY KEY REFERENCES public.clientes(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  weekdays smallint[] NOT NULL DEFAULT ARRAY[1, 2, 3, 4, 5]::smallint[],
  expected_time time,
  require_active_campaign boolean NOT NULL DEFAULT true,
  require_budget boolean NOT NULL DEFAULT false,
  check_indicators jsonb NOT NULL DEFAULT jsonb_build_object(
    'gestor', true,
    'last_update', true,
    'active_campaigns', true,
    'spend_day', true,
    'spend_month', true,
    'budget', true,
    'pace', true,
    'next_action', true,
    'problems', true
  ),
  assignee_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  CONSTRAINT traffic_checkup_settings_weekdays_chk CHECK (
    cardinality(weekdays) >= 1
    AND weekdays <@ ARRAY[1, 2, 3, 4, 5, 6, 7]::smallint[]
  ),
  CONSTRAINT traffic_checkup_settings_indicators_chk CHECK (jsonb_typeof(check_indicators) = 'object')
);

CREATE TABLE IF NOT EXISTS public.traffic_checkup_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  operational_date date NOT NULL,
  result text NOT NULL,
  confirmed_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  confirmed_at timestamptz NOT NULL DEFAULT now(),
  note text,
  task_id uuid REFERENCES public.tarefas(id) ON DELETE SET NULL,
  attention_problem text,
  attention_assignee_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  attention_due_date date,
  CONSTRAINT traffic_checkup_runs_result_chk CHECK (
    result IN ('ok', 'needs_attention', 'waiting_client', 'planned_pause', 'data_unavailable')
  ),
  CONSTRAINT traffic_checkup_runs_attention_chk CHECK (
    result <> 'needs_attention'
    OR (
      NULLIF(btrim(attention_problem), '') IS NOT NULL
      AND attention_assignee_id IS NOT NULL
      AND attention_due_date IS NOT NULL
    )
  ),
  UNIQUE (client_id, operational_date)
);

CREATE INDEX IF NOT EXISTS traffic_checkup_runs_date_idx
  ON public.traffic_checkup_runs (operational_date, result);

CREATE INDEX IF NOT EXISTS traffic_checkup_runs_task_idx
  ON public.traffic_checkup_runs (task_id)
  WHERE task_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.traffic_checkup_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.traffic_checkup_runs(id) ON DELETE CASCADE,
  code text NOT NULL,
  label text NOT NULL,
  status text NOT NULL,
  value_text text,
  value_json jsonb,
  detected boolean NOT NULL DEFAULT true,
  CONSTRAINT traffic_checkup_items_status_chk CHECK (status IN ('ok', 'alert', 'unavailable')),
  UNIQUE (run_id, code)
);

CREATE INDEX IF NOT EXISTS traffic_checkup_items_run_idx
  ON public.traffic_checkup_items (run_id);

ALTER TABLE public.traffic_checkup_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.traffic_checkup_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.traffic_checkup_items ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.traffic_checkup_settings FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.traffic_checkup_runs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.traffic_checkup_items FROM PUBLIC, anon, authenticated;

GRANT SELECT ON public.traffic_checkup_settings TO authenticated;
GRANT SELECT ON public.traffic_checkup_runs TO authenticated;
GRANT SELECT ON public.traffic_checkup_items TO authenticated;

GRANT ALL ON public.traffic_checkup_settings TO service_role;
GRANT ALL ON public.traffic_checkup_runs TO service_role;
GRANT ALL ON public.traffic_checkup_items TO service_role;

DROP POLICY IF EXISTS traffic_checkup_settings_select ON public.traffic_checkup_settings;
CREATE POLICY traffic_checkup_settings_select ON public.traffic_checkup_settings
  FOR SELECT TO authenticated
  USING (
    public.central_trafego_is_internal()
    AND public.central_trafego_can_access_client(client_id)
  );

DROP POLICY IF EXISTS traffic_checkup_runs_select ON public.traffic_checkup_runs;
CREATE POLICY traffic_checkup_runs_select ON public.traffic_checkup_runs
  FOR SELECT TO authenticated
  USING (
    public.central_trafego_is_internal()
    AND public.central_trafego_can_access_client(client_id)
  );

DROP POLICY IF EXISTS traffic_checkup_items_select ON public.traffic_checkup_items;
CREATE POLICY traffic_checkup_items_select ON public.traffic_checkup_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.traffic_checkup_runs r
      WHERE r.id = run_id
        AND public.central_trafego_is_internal()
        AND public.central_trafego_can_access_client(r.client_id)
    )
  );

CREATE OR REPLACE FUNCTION public.central_trafego_checkup_indicators_default()
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
  SELECT jsonb_build_object(
    'gestor', true,
    'last_update', true,
    'active_campaigns', true,
    'spend_day', true,
    'spend_month', true,
    'budget', true,
    'pace', true,
    'next_action', true,
    'problems', true
  )
$$;

CREATE OR REPLACE FUNCTION public.central_trafego_checkup_generation_key(p_client_id uuid, p_date date)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
  SELECT 'checkup:' || p_client_id::text || ':' || p_date::text
$$;

CREATE OR REPLACE FUNCTION public.central_trafego_checkup_is_operational_client(p_client_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.cliente_meta_accounts m WHERE m.cliente_id = p_client_id
  )
  OR EXISTS (
    SELECT 1 FROM public.paid_campaigns pc WHERE pc.client_id = p_client_id
  )
  OR EXISTS (
    SELECT 1 FROM public.tarefas t WHERE t.client_id = p_client_id AND t.type = 'paid_traffic'
  )
  OR EXISTS (
    SELECT 1 FROM public.traffic_client_ops o WHERE o.client_id = p_client_id
  )
$$;

CREATE OR REPLACE FUNCTION public.central_trafego_checkup_is_due(p_client_id uuid, p_date date DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_date date := COALESCE(p_date, public.central_trafego_operational_date());
  v_dow smallint;
  v_settings public.traffic_checkup_settings%ROWTYPE;
  v_situation text;
BEGIN
  IF p_client_id IS NULL THEN
    RETURN false;
  END IF;
  IF NOT public.central_trafego_checkup_is_operational_client(p_client_id) THEN
    RETURN false;
  END IF;

  v_dow := EXTRACT(ISODOW FROM v_date)::smallint;
  SELECT * INTO v_settings FROM public.traffic_checkup_settings WHERE client_id = p_client_id;
  IF FOUND THEN
    IF NOT v_settings.enabled THEN
      RETURN false;
    END IF;
    RETURN v_dow = ANY (v_settings.weekdays);
  END IF;

  SELECT situation INTO v_situation FROM public.traffic_client_ops WHERE client_id = p_client_id;
  IF v_situation IS NOT DISTINCT FROM 'closed' THEN
    RETURN false;
  END IF;
  RETURN v_dow BETWEEN 1 AND 5;
END;
$$;

CREATE OR REPLACE FUNCTION public.central_trafego_checkup_require_active_campaign(p_client_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_settings public.traffic_checkup_settings%ROWTYPE;
  v_situation text;
BEGIN
  SELECT * INTO v_settings FROM public.traffic_checkup_settings WHERE client_id = p_client_id;
  IF FOUND THEN
    RETURN v_settings.require_active_campaign;
  END IF;
  SELECT situation INTO v_situation FROM public.traffic_client_ops WHERE client_id = p_client_id;
  RETURN COALESCE(v_situation, '') NOT IN ('no_campaign_expected', 'closed');
END;
$$;

CREATE OR REPLACE FUNCTION public.central_trafego_checkup_pace(
  p_spend numeric,
  p_budget numeric,
  p_date date
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_days integer;
  v_expected numeric;
  v_remaining numeric;
  v_status text := 'on_pace';
  v_label text := 'No ritmo';
BEGIN
  IF p_spend IS NULL OR p_budget IS NULL OR p_budget <= 0 OR p_date IS NULL THEN
    RETURN jsonb_build_object(
      'available', false,
      'status', 'unavailable',
      'label', 'Dados indisponíveis',
      'remaining', NULL,
      'expected', NULL
    );
  END IF;
  v_days := EXTRACT(DAY FROM (date_trunc('month', p_date) + interval '1 month - 1 day'))::integer;
  IF v_days < 1 THEN
    v_days := 30;
  END IF;
  v_expected := (p_budget / v_days) * EXTRACT(DAY FROM p_date);
  v_remaining := p_budget - p_spend;
  IF p_spend > p_budget THEN
    v_status := 'over';
    v_label := 'Acima do orçamento';
  ELSIF p_spend > v_expected * 1.2 THEN
    v_status := 'ahead';
    v_label := 'Acima do ritmo';
  ELSIF EXTRACT(DAY FROM p_date) > 5 AND p_spend < v_expected * 0.5 THEN
    v_status := 'behind';
    v_label := 'Abaixo do ritmo';
  END IF;
  RETURN jsonb_build_object(
    'available', true,
    'status', v_status,
    'label', v_label,
    'remaining', v_remaining,
    'expected', v_expected
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.central_trafego_checkup_snapshot(p_client_id uuid, p_date date DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_date date := COALESCE(p_date, public.central_trafego_operational_date());
  v_settings public.traffic_checkup_settings%ROWTYPE;
  v_ops public.traffic_client_ops%ROWTYPE;
  v_empresa text;
  v_meta jsonb;
  v_budget numeric;
  v_gestor uuid;
  v_gestor_name text;
  v_indicators jsonb;
  v_require_campaign boolean;
  v_require_budget boolean;
  v_active integer := 0;
  v_perm boolean := false;
  v_err text;
  v_spend numeric;
  v_active_meta integer;
  v_meta_kind text := 'unavailable';
  v_spend_month jsonb;
  v_spend_day jsonb;
  v_budget_json jsonb;
  v_pace jsonb;
  v_next jsonb;
  v_overdue boolean := false;
  v_problems jsonb := '[]'::jsonb;
  v_ind jsonb;
BEGIN
  SELECT empresa, meta_resumo, limite_meta
    INTO v_empresa, v_meta, v_budget
  FROM public.clientes
  WHERE id = p_client_id;
  IF v_empresa IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_settings FROM public.traffic_checkup_settings WHERE client_id = p_client_id;
  SELECT * INTO v_ops FROM public.traffic_client_ops WHERE client_id = p_client_id;

  v_indicators := COALESCE(v_settings.check_indicators, public.central_trafego_checkup_indicators_default());
  v_require_campaign := COALESCE(v_settings.require_active_campaign, public.central_trafego_checkup_require_active_campaign(p_client_id));
  v_require_budget := COALESCE(v_settings.require_budget, false);
  v_gestor := COALESCE(v_settings.assignee_id, v_ops.primary_assignee_id);
  SELECT full_name INTO v_gestor_name FROM public.profiles WHERE id = v_gestor;

  SELECT count(*)::integer INTO v_active
  FROM public.paid_campaigns pc
  JOIN public.paid_campaign_statuses st ON st.value = pc.status
  WHERE pc.client_id = p_client_id AND st.lifecycle = 'active';

  v_perm := COALESCE(v_meta->'permError', 'false'::jsonb) IN ('true'::jsonb);
  v_err := NULLIF(v_meta->>'errorMessage', '');
  BEGIN
    v_spend := CASE WHEN v_meta ? 'spend' THEN (v_meta->>'spend')::numeric ELSE NULL END;
  EXCEPTION WHEN invalid_text_representation THEN
    v_spend := NULL;
  END;
  BEGIN
    v_active_meta := CASE WHEN v_meta ? 'activeCount' THEN (v_meta->>'activeCount')::integer ELSE NULL END;
  EXCEPTION WHEN invalid_text_representation THEN
    v_active_meta := NULL;
  END;

  IF v_meta IS NULL OR v_perm OR (v_err IS NOT NULL AND COALESCE(v_spend, 0) = 0 AND COALESCE(v_active_meta, 0) = 0) THEN
    v_meta_kind := 'unavailable';
  ELSIF COALESCE(v_spend, 0) = 0 AND COALESCE(v_active_meta, 0) = 0 THEN
    v_meta_kind := 'zero';
  ELSE
    v_meta_kind := 'ok';
  END IF;

  v_spend_day := jsonb_build_object(
    'available', false,
    'value', NULL,
    'label', 'Dados indisponíveis'
  );
  IF v_meta_kind = 'unavailable' THEN
    v_spend_month := jsonb_build_object('available', false, 'value', NULL, 'label', 'Dados indisponíveis');
  ELSE
    v_spend_month := jsonb_build_object(
      'available', true,
      'value', COALESCE(v_spend, 0),
      'label', NULL
    );
  END IF;

  IF v_budget IS NOT NULL AND v_budget > 0 THEN
    v_budget_json := jsonb_build_object(
      'available', true,
      'value', v_budget,
      'remaining', CASE WHEN (v_spend_month->>'available')::boolean THEN v_budget - COALESCE(v_spend, 0) ELSE NULL END,
      'label', NULL
    );
  ELSE
    v_budget_json := jsonb_build_object('available', false, 'value', NULL, 'remaining', NULL, 'label', 'Dados indisponíveis');
  END IF;

  IF (v_spend_month->>'available')::boolean AND (v_budget_json->>'available')::boolean THEN
    v_pace := public.central_trafego_checkup_pace(COALESCE(v_spend, 0), v_budget, v_date);
  ELSE
    v_pace := public.central_trafego_checkup_pace(NULL, NULL, v_date);
  END IF;

  SELECT to_jsonb(x) INTO v_next FROM (
    SELECT t.id AS task_id, t.title, t.due_date
    FROM public.tarefas t
    JOIN public.traffic_task_details d ON d.task_id = t.id
    WHERE t.client_id = p_client_id AND t.type = 'paid_traffic'
      AND NOT EXISTS (SELECT 1 FROM public.task_statuses s WHERE s.value = t.status AND s.is_terminal)
    ORDER BY t.due_date NULLS LAST, t.created_at
    LIMIT 1
  ) x;
  v_overdue := COALESCE((v_next->>'due_date')::date < v_date, false);

  v_ind := COALESCE(v_indicators, '{}'::jsonb);
  IF COALESCE((v_ind->>'gestor')::boolean, true) AND v_gestor IS NULL THEN
    v_problems := v_problems || jsonb_build_array(jsonb_build_object('code', 'missing_gestor', 'label', 'Sem gestor responsável'));
  END IF;
  IF COALESCE((v_ind->>'active_campaigns')::boolean, true)
     AND v_require_campaign
     AND COALESCE(v_ops.situation, '') NOT IN ('no_campaign_expected', 'closed')
     AND v_active < 1 THEN
    v_problems := v_problems || jsonb_build_array(jsonb_build_object('code', 'missing_active_campaign', 'label', 'Nenhuma campanha ativa'));
  END IF;
  IF COALESCE((v_ind->>'budget')::boolean, true) AND v_require_budget AND NOT (v_budget IS NOT NULL AND v_budget > 0) THEN
    v_problems := v_problems || jsonb_build_array(jsonb_build_object('code', 'missing_budget', 'label', 'Orçamento não informado'));
  END IF;
  IF COALESCE((v_ind->>'spend_month')::boolean, true) AND v_meta_kind = 'unavailable' THEN
    v_problems := v_problems || jsonb_build_array(jsonb_build_object('code', 'meta_unavailable', 'label', 'Dados da Meta indisponíveis'));
  END IF;
  IF COALESCE((v_ind->>'next_action')::boolean, true) AND v_overdue THEN
    v_problems := v_problems || jsonb_build_array(jsonb_build_object('code', 'next_action_overdue', 'label', 'Próxima ação vencida'));
  END IF;
  IF COALESCE((v_ind->>'budget')::boolean, true)
     AND (v_spend_month->>'available')::boolean
     AND v_budget IS NOT NULL AND v_budget > 0
     AND COALESCE(v_spend, 0) > v_budget THEN
    v_problems := v_problems || jsonb_build_array(jsonb_build_object('code', 'over_budget', 'label', 'Investimento acima do orçamento'));
  END IF;
  IF COALESCE((v_ind->>'problems')::boolean, true) AND v_ops.situation = 'waiting_client' THEN
    v_problems := v_problems || jsonb_build_array(jsonb_build_object('code', 'waiting_client', 'label', 'Operação aguardando o cliente'));
  END IF;

  RETURN jsonb_build_object(
    'client_id', p_client_id,
    'empresa', v_empresa,
    'due', public.central_trafego_checkup_is_due(p_client_id, v_date),
    'gestor_id', v_gestor,
    'gestor_name', v_gestor_name,
    'updated_at', v_ops.updated_at,
    'situation', v_ops.situation,
    'active_campaigns', v_active,
    'spend_day', v_spend_day,
    'spend_month', v_spend_month,
    'budget', v_budget_json,
    'pace', v_pace,
    'next_action', v_next,
    'next_action_overdue', v_overdue,
    'problems', v_problems,
    'meta_kind', v_meta_kind,
    'require_active_campaign', v_require_campaign,
    'require_budget', v_require_budget,
    'indicators', v_indicators,
    'settings', CASE WHEN v_settings.client_id IS NULL THEN NULL ELSE jsonb_build_object(
      'enabled', v_settings.enabled,
      'weekdays', to_jsonb(v_settings.weekdays),
      'expected_time', v_settings.expected_time,
      'require_active_campaign', v_settings.require_active_campaign,
      'require_budget', v_settings.require_budget,
      'check_indicators', v_settings.check_indicators,
      'assignee_id', v_settings.assignee_id
    ) END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.central_trafego_checkup_run_json(p_run_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT jsonb_build_object(
    'id', r.id,
    'client_id', r.client_id,
    'operational_date', r.operational_date,
    'result', r.result,
    'confirmed_by', r.confirmed_by,
    'confirmed_at', r.confirmed_at,
    'actor_name', p.full_name,
    'note', r.note,
    'task_id', r.task_id,
    'task_title', t.title,
    'attention_problem', r.attention_problem,
    'attention_assignee_id', r.attention_assignee_id,
    'attention_due_date', r.attention_due_date,
    'items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'code', i.code,
        'label', i.label,
        'status', i.status,
        'value_text', i.value_text,
        'value_json', i.value_json,
        'detected', i.detected
      ) ORDER BY i.code)
      FROM public.traffic_checkup_items i
      WHERE i.run_id = r.id
    ), '[]'::jsonb)
  )
  FROM public.traffic_checkup_runs r
  LEFT JOIN public.profiles p ON p.id = r.confirmed_by
  LEFT JOIN public.tarefas t ON t.id = r.task_id
  WHERE r.id = p_run_id
$$;

CREATE OR REPLACE FUNCTION public.central_trafego_checkup_board()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_today date := public.central_trafego_operational_date();
  v_now_time time := (now() AT TIME ZONE 'America/Sao_Paulo')::time;
  v_out jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Central de Tráfego: não autenticado';
  END IF;
  IF NOT public.central_trafego_ui_allowed() THEN
    RAISE EXCEPTION 'Central de Tráfego: UI/RPC não liberada para este perfil';
  END IF;

  WITH scoped AS (
    SELECT c.id
    FROM public.clientes c
    WHERE public.central_trafego_can_access_client(c.id)
      AND public.central_trafego_checkup_is_due(c.id, v_today)
  ),
  rows AS (
    SELECT
      public.central_trafego_checkup_snapshot(s.id, v_today)
        || jsonb_build_object(
          'late', CASE
            WHEN st.expected_time IS NOT NULL
              AND NOT EXISTS (
                SELECT 1 FROM public.traffic_checkup_runs r
                WHERE r.client_id = s.id AND r.operational_date = v_today
              )
              AND v_now_time > st.expected_time
            THEN true
            ELSE false
          END,
          'run', (
            SELECT public.central_trafego_checkup_run_json(r.id)
            FROM public.traffic_checkup_runs r
            WHERE r.client_id = s.id AND r.operational_date = v_today
            LIMIT 1
          )
        ) AS payload
    FROM scoped s
    LEFT JOIN public.traffic_checkup_settings st ON st.client_id = s.id
  )
  SELECT jsonb_build_object(
    'operational_date', v_today,
    'clients', COALESCE((
      SELECT jsonb_agg(payload ORDER BY
        (payload->'run'->>'result' IS NULL) DESC,
        jsonb_array_length(COALESCE(payload->'problems', '[]'::jsonb)) DESC,
        payload->>'empresa'
      )
      FROM rows
    ), '[]'::jsonb),
    'team', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', p.id, 'full_name', p.full_name, 'role', p.role) ORDER BY p.full_name)
      FROM public.profiles p
      WHERE p.role IN ('superadmin', 'admin', 'colaborador')
        AND (
          public.central_trafego_is_admin()
          OR public.central_trafego_can_assign_others()
          OR p.id = v_uid
        )
    ), '[]'::jsonb)
  )
  INTO v_out;

  RETURN v_out;
END;
$$;

CREATE OR REPLACE FUNCTION public.central_trafego_checkup_freeze_items(p_run_id uuid, p_snapshot jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  INSERT INTO public.traffic_checkup_items (run_id, code, label, status, value_text, value_json, detected)
  VALUES
    (
      p_run_id, 'gestor', 'Gestor responsável',
      CASE WHEN NULLIF(p_snapshot->>'gestor_id', '') IS NULL THEN 'alert' ELSE 'ok' END,
      NULLIF(p_snapshot->>'gestor_name', ''),
      jsonb_build_object('gestor_id', p_snapshot->'gestor_id'),
      true
    ),
    (
      p_run_id, 'last_update', 'Última atualização',
      CASE WHEN p_snapshot->>'updated_at' IS NULL THEN 'unavailable' ELSE 'ok' END,
      p_snapshot->>'updated_at',
      jsonb_build_object('updated_at', p_snapshot->'updated_at'),
      true
    ),
    (
      p_run_id, 'active_campaigns', 'Campanhas ativas',
      CASE
        WHEN COALESCE((p_snapshot->>'require_active_campaign')::boolean, true)
          AND COALESCE((p_snapshot->>'active_campaigns')::int, 0) < 1
          AND COALESCE(p_snapshot->>'situation', '') NOT IN ('no_campaign_expected', 'closed')
        THEN 'alert'
        ELSE 'ok'
      END,
      COALESCE(p_snapshot->>'active_campaigns', '0'),
      jsonb_build_object('count', p_snapshot->'active_campaigns'),
      true
    ),
    (
      p_run_id, 'spend_day', 'Investimento do dia',
      'unavailable',
      'Dados indisponíveis',
      COALESCE(p_snapshot->'spend_day', '{}'::jsonb),
      true
    ),
    (
      p_run_id, 'spend_month', 'Investimento do mês',
      CASE WHEN COALESCE((p_snapshot->'spend_month'->>'available')::boolean, false) THEN 'ok' ELSE 'unavailable' END,
      CASE
        WHEN COALESCE((p_snapshot->'spend_month'->>'available')::boolean, false)
        THEN p_snapshot->'spend_month'->>'value'
        ELSE 'Dados indisponíveis'
      END,
      COALESCE(p_snapshot->'spend_month', '{}'::jsonb),
      true
    ),
    (
      p_run_id, 'budget', 'Orçamento e saldo',
      CASE
        WHEN COALESCE((p_snapshot->>'require_budget')::boolean, false)
          AND NOT COALESCE((p_snapshot->'budget'->>'available')::boolean, false)
        THEN 'alert'
        WHEN COALESCE((p_snapshot->'budget'->>'available')::boolean, false) THEN 'ok'
        ELSE 'unavailable'
      END,
      CASE
        WHEN COALESCE((p_snapshot->'budget'->>'available')::boolean, false) THEN p_snapshot->'budget'->>'value'
        ELSE 'Dados indisponíveis'
      END,
      COALESCE(p_snapshot->'budget', '{}'::jsonb),
      true
    ),
    (
      p_run_id, 'pace', 'Ritmo da verba',
      CASE
        WHEN NOT COALESCE((p_snapshot->'pace'->>'available')::boolean, false) THEN 'unavailable'
        WHEN p_snapshot->'pace'->>'status' IN ('over', 'ahead') THEN 'alert'
        ELSE 'ok'
      END,
      COALESCE(p_snapshot->'pace'->>'label', 'Dados indisponíveis'),
      COALESCE(p_snapshot->'pace', '{}'::jsonb),
      true
    ),
    (
      p_run_id, 'next_action', 'Próxima ação',
      CASE
        WHEN COALESCE((p_snapshot->>'next_action_overdue')::boolean, false) THEN 'alert'
        WHEN p_snapshot->'next_action' IS NULL OR p_snapshot->'next_action' = 'null'::jsonb THEN 'unavailable'
        ELSE 'ok'
      END,
      COALESCE(p_snapshot->'next_action'->>'title', 'Nenhuma'),
      COALESCE(p_snapshot->'next_action', 'null'::jsonb),
      true
    ),
    (
      p_run_id, 'problems', 'Problemas detectados',
      CASE WHEN jsonb_array_length(COALESCE(p_snapshot->'problems', '[]'::jsonb)) > 0 THEN 'alert' ELSE 'ok' END,
      CASE
        WHEN jsonb_array_length(COALESCE(p_snapshot->'problems', '[]'::jsonb)) > 0
        THEN (SELECT string_agg(p->>'label', ' · ') FROM jsonb_array_elements(p_snapshot->'problems') p)
        ELSE 'Nenhum'
      END,
      COALESCE(p_snapshot->'problems', '[]'::jsonb),
      true
    )
  ON CONFLICT (run_id, code) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.central_trafego_confirm_checkup(
  p_client_id uuid,
  p_result text,
  p_note text DEFAULT NULL,
  p_attention_problem text DEFAULT NULL,
  p_attention_assignee_id uuid DEFAULT NULL,
  p_attention_due_date date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_today date := public.central_trafego_operational_date();
  v_run_id uuid;
  v_existing uuid;
  v_task_id uuid;
  v_key text;
  v_title text;
  v_desc text;
  v_snap jsonb;
  v_empresa text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Central de Tráfego: não autenticado';
  END IF;
  IF NOT public.central_trafego_ui_allowed() THEN
    RAISE EXCEPTION 'Central de Tráfego: UI/RPC não liberada para este perfil';
  END IF;
  IF NOT public.central_trafego_is_internal() THEN
    RAISE EXCEPTION 'Central de Tráfego: apenas equipe interna confirma check-up';
  END IF;
  IF p_client_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.clientes WHERE id = p_client_id) THEN
    RAISE EXCEPTION 'Central de Tráfego: cliente obrigatório';
  END IF;
  IF NOT public.central_trafego_can_access_client(p_client_id) THEN
    RAISE EXCEPTION 'Central de Tráfego: sem acesso a este cliente';
  END IF;
  IF p_result IS NULL OR p_result NOT IN ('ok', 'needs_attention', 'waiting_client', 'planned_pause', 'data_unavailable') THEN
    RAISE EXCEPTION 'Central de Tráfego: resultado do check-up inválido';
  END IF;
  IF p_result = 'needs_attention' THEN
    IF NULLIF(btrim(p_attention_problem), '') IS NULL THEN
      RAISE EXCEPTION 'Central de Tráfego: descreva o problema';
    END IF;
    IF p_attention_assignee_id IS NULL THEN
      RAISE EXCEPTION 'Central de Tráfego: responsável da pendência obrigatório';
    END IF;
    IF p_attention_due_date IS NULL THEN
      RAISE EXCEPTION 'Central de Tráfego: prazo da pendência obrigatório';
    END IF;
  END IF;

  SELECT id INTO v_existing
  FROM public.traffic_checkup_runs
  WHERE client_id = p_client_id AND operational_date = v_today;
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object(
      'created', false,
      'run', public.central_trafego_checkup_run_json(v_existing)
    );
  END IF;

  v_snap := public.central_trafego_checkup_snapshot(p_client_id, v_today);
  SELECT empresa INTO v_empresa FROM public.clientes WHERE id = p_client_id;

  INSERT INTO public.traffic_checkup_runs (
    client_id, operational_date, result, confirmed_by, confirmed_at, note,
    attention_problem, attention_assignee_id, attention_due_date
  ) VALUES (
    p_client_id,
    v_today,
    p_result,
    v_uid,
    now(),
    NULLIF(btrim(p_note), ''),
    CASE WHEN p_result = 'needs_attention' THEN NULLIF(btrim(p_attention_problem), '') ELSE NULL END,
    CASE WHEN p_result = 'needs_attention' THEN p_attention_assignee_id ELSE NULL END,
    CASE WHEN p_result = 'needs_attention' THEN p_attention_due_date ELSE NULL END
  )
  ON CONFLICT (client_id, operational_date) DO NOTHING
  RETURNING id INTO v_run_id;

  IF v_run_id IS NULL THEN
    SELECT id INTO v_existing
    FROM public.traffic_checkup_runs
    WHERE client_id = p_client_id AND operational_date = v_today;
    RETURN jsonb_build_object(
      'created', false,
      'run', public.central_trafego_checkup_run_json(v_existing)
    );
  END IF;

  IF p_result = 'needs_attention' THEN
    v_key := public.central_trafego_checkup_generation_key(p_client_id, v_today);
    v_title := 'Check-up: atenção — ' || COALESCE(v_empresa, 'cliente');
    v_desc := btrim(p_attention_problem);
    IF NULLIF(btrim(p_note), '') IS NOT NULL THEN
      v_desc := v_desc || E'\n\n' || btrim(p_note);
    END IF;
    BEGIN
      v_task_id := public.create_traffic_demand(
        v_title,
        p_client_id,
        'analise',
        p_attention_due_date,
        'high',
        ARRAY[p_attention_assignee_id],
        v_desc,
        '[]'::jsonb,
        NULL,
        'system',
        v_key,
        NULL,
        v_key,
        NULL
      );
    EXCEPTION WHEN unique_violation THEN
      SELECT task_id INTO v_task_id
      FROM public.traffic_task_details
      WHERE generation_key = v_key;
    END;
    UPDATE public.traffic_checkup_runs SET task_id = v_task_id WHERE id = v_run_id;
  END IF;

  PERFORM public.central_trafego_checkup_freeze_items(v_run_id, v_snap);

  RETURN jsonb_build_object(
    'created', true,
    'run', public.central_trafego_checkup_run_json(v_run_id)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_traffic_checkup_settings(
  p_client_id uuid,
  p_enabled boolean DEFAULT true,
  p_weekdays smallint[] DEFAULT ARRAY[1, 2, 3, 4, 5]::smallint[],
  p_expected_time time DEFAULT NULL,
  p_require_active_campaign boolean DEFAULT true,
  p_require_budget boolean DEFAULT false,
  p_check_indicators jsonb DEFAULT NULL,
  p_assignee_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_indicators jsonb;
  v_assignee uuid;
  v_existing public.traffic_checkup_settings%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Central de Tráfego: não autenticado';
  END IF;
  IF NOT public.central_trafego_ui_allowed() THEN
    RAISE EXCEPTION 'Central de Tráfego: UI/RPC não liberada para este perfil';
  END IF;
  IF p_client_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.clientes WHERE id = p_client_id) THEN
    RAISE EXCEPTION 'Central de Tráfego: cliente obrigatório';
  END IF;
  IF NOT public.central_trafego_can_access_client(p_client_id) THEN
    RAISE EXCEPTION 'Central de Tráfego: sem acesso a este cliente';
  END IF;
  IF p_weekdays IS NULL OR cardinality(p_weekdays) < 1 OR NOT (p_weekdays <@ ARRAY[1, 2, 3, 4, 5, 6, 7]::smallint[]) THEN
    RAISE EXCEPTION 'Central de Tráfego: dias da semana inválidos';
  END IF;

  v_indicators := COALESCE(p_check_indicators, public.central_trafego_checkup_indicators_default());
  IF jsonb_typeof(v_indicators) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Central de Tráfego: indicadores inválidos';
  END IF;

  SELECT * INTO v_existing FROM public.traffic_checkup_settings WHERE client_id = p_client_id;
  IF public.central_trafego_is_admin() THEN
    v_assignee := p_assignee_id;
  ELSE
    IF NOT public.central_trafego_is_gestor(p_client_id) THEN
      RAISE EXCEPTION 'Central de Tráfego: só o gestor oficial ou admin altera o check-up';
    END IF;
    v_assignee := COALESCE(v_existing.assignee_id, (SELECT primary_assignee_id FROM public.traffic_client_ops WHERE client_id = p_client_id));
  END IF;

  INSERT INTO public.traffic_checkup_settings (
    client_id, enabled, weekdays, expected_time, require_active_campaign, require_budget,
    check_indicators, assignee_id, updated_at, updated_by
  ) VALUES (
    p_client_id, COALESCE(p_enabled, true), p_weekdays, p_expected_time,
    COALESCE(p_require_active_campaign, true), COALESCE(p_require_budget, false),
    v_indicators, v_assignee, now(), v_uid
  )
  ON CONFLICT (client_id) DO UPDATE SET
    enabled = EXCLUDED.enabled,
    weekdays = EXCLUDED.weekdays,
    expected_time = EXCLUDED.expected_time,
    require_active_campaign = EXCLUDED.require_active_campaign,
    require_budget = EXCLUDED.require_budget,
    check_indicators = EXCLUDED.check_indicators,
    assignee_id = EXCLUDED.assignee_id,
    updated_at = EXCLUDED.updated_at,
    updated_by = EXCLUDED.updated_by;
END;
$$;

-- Situação: campos de check-up do dia, sem editar o arquivo da Fase 1.
CREATE OR REPLACE FUNCTION public.central_trafego_situacao()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_today date := public.central_trafego_operational_date();
  v_out jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Central de Tráfego: não autenticado';
  END IF;
  IF NOT public.central_trafego_ui_allowed() THEN
    RAISE EXCEPTION 'Central de Tráfego: UI/RPC não liberada para este perfil';
  END IF;

  WITH ops_clients AS (
    SELECT c.id, c.empresa, c.meta_resumo
    FROM public.clientes c
    WHERE public.central_trafego_can_access_client(c.id)
      AND (
        EXISTS (SELECT 1 FROM public.cliente_meta_accounts m WHERE m.cliente_id = c.id)
        OR EXISTS (SELECT 1 FROM public.paid_campaigns pc WHERE pc.client_id = c.id)
        OR EXISTS (SELECT 1 FROM public.tarefas t WHERE t.client_id = c.id AND t.type = 'paid_traffic')
        OR EXISTS (SELECT 1 FROM public.traffic_client_ops o WHERE o.client_id = c.id)
      )
  ),
  rows AS (
    SELECT
      oc.id AS client_id,
      oc.empresa,
      ops.primary_assignee_id AS gestor_id,
      gp.full_name AS gestor_name,
      ops.situation,
      ops.situation_reason,
      ops.resume_at,
      ops.updated_at AS ops_updated_at,
      oc.meta_resumo,
      (
        SELECT count(*) FROM public.tarefas t
        JOIN public.traffic_task_details d ON d.task_id = t.id
        WHERE t.client_id = oc.id AND t.type = 'paid_traffic'
          AND NOT EXISTS (SELECT 1 FROM public.task_statuses s WHERE s.value = t.status AND s.is_terminal)
      ) AS open_tasks,
      (
        SELECT count(*) FROM public.tarefas t
        JOIN public.traffic_task_details d ON d.task_id = t.id
        WHERE t.client_id = oc.id AND t.type = 'paid_traffic'
          AND t.due_date < v_today
          AND NOT EXISTS (SELECT 1 FROM public.task_statuses s WHERE s.value = t.status AND s.is_terminal)
      ) AS overdue_tasks,
      (
        SELECT count(*) FROM public.tarefas t
        JOIN public.traffic_task_details d ON d.task_id = t.id
        WHERE t.client_id = oc.id AND t.type = 'paid_traffic'
          AND d.demand_type IN ('cobranca_material', 'aprovacao_cliente')
          AND NOT EXISTS (SELECT 1 FROM public.task_statuses s WHERE s.value = t.status AND s.is_terminal)
      ) AS pending_client_tasks,
      (
        SELECT to_jsonb(x) FROM (
          SELECT t.id AS task_id, t.title, t.due_date
          FROM public.tarefas t
          JOIN public.traffic_task_details d ON d.task_id = t.id
          WHERE t.client_id = oc.id AND t.type = 'paid_traffic'
            AND NOT EXISTS (SELECT 1 FROM public.task_statuses s WHERE s.value = t.status AND s.is_terminal)
          ORDER BY t.due_date NULLS LAST, t.created_at
          LIMIT 1
        ) x
      ) AS next_action,
      (
        SELECT to_jsonb(x) FROM (
          SELECT t.id AS task_id, t.title, t.due_date, d.next_review_at
          FROM public.tarefas t
          JOIN public.traffic_task_details d ON d.task_id = t.id
          WHERE t.client_id = oc.id AND t.type = 'paid_traffic'
            AND d.demand_type IN ('revisao_24h', 'revisao_72h')
            AND NOT EXISTS (SELECT 1 FROM public.task_statuses s WHERE s.value = t.status AND s.is_terminal)
          ORDER BY COALESCE(d.next_review_at::date, t.due_date) NULLS LAST
          LIMIT 1
        ) x
      ) AS next_review,
      (
        SELECT count(*) FROM public.paid_campaigns pc
        JOIN public.paid_campaign_statuses st ON st.value = pc.status
        WHERE pc.client_id = oc.id AND st.lifecycle = 'active'
      ) AS active_campaigns,
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object('id', pc.id, 'name', pc.name))
        FROM public.paid_campaigns pc
        WHERE pc.client_id = oc.id
          AND NOT EXISTS (
            SELECT 1
            FROM public.paid_campaign_task_links l
            JOIN public.tarefas t ON t.id = l.task_id
            WHERE l.paid_campaign_id = pc.id
              AND t.type = 'paid_traffic'
              AND NOT EXISTS (SELECT 1 FROM public.task_statuses s WHERE s.value = t.status AND s.is_terminal)
          )
      ), '[]'::jsonb) AS campaigns_without_demand,
      public.central_trafego_checkup_is_due(oc.id, v_today) AS checkup_due,
      ck.id AS checkup_run_id,
      ck.result AS checkup_result,
      ck.confirmed_at AS checkup_confirmed_at,
      ck.confirmed_by AS checkup_confirmed_by,
      ckp.full_name AS checkup_actor_name,
      ck.note AS checkup_note,
      ck.attention_problem AS checkup_problem,
      ck.task_id AS checkup_task_id,
      ckt.title AS checkup_task_title
    FROM ops_clients oc
    LEFT JOIN public.traffic_client_ops ops ON ops.client_id = oc.id
    LEFT JOIN public.profiles gp ON gp.id = ops.primary_assignee_id
    LEFT JOIN public.traffic_checkup_runs ck
      ON ck.client_id = oc.id AND ck.operational_date = v_today
    LEFT JOIN public.profiles ckp ON ckp.id = ck.confirmed_by
    LEFT JOIN public.tarefas ckt ON ckt.id = ck.task_id
  )
  SELECT jsonb_build_object(
    'rows', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'client_id', r.client_id,
        'empresa', r.empresa,
        'gestor_id', r.gestor_id,
        'gestor_name', r.gestor_name,
        'situation', r.situation,
        'situation_reason', r.situation_reason,
        'resume_at', r.resume_at,
        'next_action', r.next_action,
        'next_review', r.next_review,
        'open_tasks', r.open_tasks,
        'overdue_tasks', r.overdue_tasks,
        'client_pending', (CASE WHEN r.situation = 'waiting_client' THEN 1 ELSE 0 END) + r.pending_client_tasks,
        'pending_gestor', r.gestor_id IS NULL,
        'next_action_overdue', CASE
          WHEN r.next_action ? 'due_date' AND NULLIF(r.next_action->>'due_date', '') IS NOT NULL
            THEN (r.next_action->>'due_date')::date < v_today
          ELSE false
        END,
        'active_campaigns', r.active_campaigns,
        'campaigns_without_demand', CASE
          WHEN r.situation = 'no_campaign_expected' THEN '[]'::jsonb
          ELSE r.campaigns_without_demand
        END,
        'meta_resumo', r.meta_resumo,
        'updated_at', r.ops_updated_at,
        'checkup_due', r.checkup_due,
        'checkup_result', r.checkup_result,
        'checkup_confirmed_at', r.checkup_confirmed_at,
        'checkup_actor_name', r.checkup_actor_name,
        'checkup_note', r.checkup_note,
        'checkup_problem', r.checkup_problem,
        'checkup_task_id', r.checkup_task_id,
        'checkup_task_title', r.checkup_task_title,
        'checkup_unreviewed', r.checkup_due AND r.checkup_result IS NULL
      ) ORDER BY (r.gestor_id IS NULL) DESC, r.empresa)
      FROM rows r
    ), '[]'::jsonb),
    'checkup_summary', (
      SELECT jsonb_build_object(
        'total', count(*) FILTER (WHERE checkup_due),
        'reviewed', count(*) FILTER (WHERE checkup_due AND checkup_result IS NOT NULL),
        'ok', count(*) FILTER (WHERE checkup_due AND checkup_result = 'ok'),
        'attention', count(*) FILTER (WHERE checkup_due AND checkup_result = 'needs_attention'),
        'waiting_client', count(*) FILTER (WHERE checkup_due AND checkup_result = 'waiting_client'),
        'planned_pause', count(*) FILTER (WHERE checkup_due AND checkup_result = 'planned_pause'),
        'data_unavailable', count(*) FILTER (WHERE checkup_due AND checkup_result = 'data_unavailable'),
        'unreviewed', count(*) FILTER (WHERE checkup_due AND checkup_result IS NULL)
      )
      FROM rows
    ),
    'team', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', p.id, 'full_name', p.full_name, 'role', p.role) ORDER BY p.full_name)
      FROM public.profiles p
      WHERE p.role IN ('superadmin', 'admin', 'colaborador')
        AND public.central_trafego_is_admin()
    ), '[]'::jsonb)
  )
  INTO v_out;

  RETURN v_out;
END;
$$;

REVOKE ALL ON FUNCTION public.central_trafego_checkup_indicators_default() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.central_trafego_checkup_generation_key(uuid, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.central_trafego_checkup_is_operational_client(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.central_trafego_checkup_is_due(uuid, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.central_trafego_checkup_require_active_campaign(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.central_trafego_checkup_pace(numeric, numeric, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.central_trafego_checkup_snapshot(uuid, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.central_trafego_checkup_run_json(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.central_trafego_checkup_board() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.central_trafego_checkup_freeze_items(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.central_trafego_confirm_checkup(uuid, text, text, text, uuid, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.upsert_traffic_checkup_settings(uuid, boolean, smallint[], time, boolean, boolean, jsonb, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.central_trafego_situacao() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.central_trafego_checkup_indicators_default() TO authenticated;
GRANT EXECUTE ON FUNCTION public.central_trafego_checkup_generation_key(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.central_trafego_checkup_is_operational_client(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.central_trafego_checkup_is_due(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.central_trafego_checkup_require_active_campaign(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.central_trafego_checkup_pace(numeric, numeric, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.central_trafego_checkup_snapshot(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.central_trafego_checkup_run_json(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.central_trafego_checkup_board() TO authenticated;
GRANT EXECUTE ON FUNCTION public.central_trafego_confirm_checkup(uuid, text, text, text, uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_traffic_checkup_settings(uuid, boolean, smallint[], time, boolean, boolean, jsonb, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.central_trafego_situacao() TO authenticated;

COMMENT ON TABLE public.traffic_checkup_settings IS
  'Configuração de check-up diário por cliente. Escrita só via upsert_traffic_checkup_settings.';
COMMENT ON TABLE public.traffic_checkup_runs IS
  'Uma confirmação por cliente e data operacional (Brasília). Escrita só via central_trafego_confirm_checkup.';
COMMENT ON TABLE public.traffic_checkup_items IS
  'Snapshot somente leitura dos indicadores detectados no momento da confirmação.';
COMMENT ON FUNCTION public.central_trafego_confirm_checkup IS
  'Confirma o check-up do dia. Precisa de atenção cria demanda via create_traffic_demand com generation_key estável.';

COMMIT;

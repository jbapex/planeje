-- Rotina fixa: relatório quinzenal (dias 1 e 16) + CRM segunda-feira

CREATE TABLE IF NOT EXISTS public.traffic_client_routines (
  client_id uuid PRIMARY KEY REFERENCES public.clientes(id) ON DELETE CASCADE,
  report_enabled boolean NOT NULL DEFAULT true,
  report_cadence smallint NOT NULL DEFAULT 15,
  crm_weekly_enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  CONSTRAINT traffic_client_routines_cadence_chk CHECK (report_cadence IN (15, 30))
);

CREATE TABLE IF NOT EXISTS public.traffic_routine_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  routine_type text NOT NULL,
  cycle_key text NOT NULL,
  task_id uuid REFERENCES public.tarefas(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT traffic_routine_log_type_chk CHECK (routine_type IN ('report_15d', 'crm_weekly')),
  CONSTRAINT traffic_routine_log_unique UNIQUE (client_id, routine_type, cycle_key)
);

CREATE INDEX IF NOT EXISTS traffic_routine_log_client_idx
  ON public.traffic_routine_log (client_id, routine_type, created_at DESC);

ALTER TABLE public.traffic_client_routines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.traffic_routine_log ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.traffic_client_routines FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.traffic_routine_log FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.traffic_client_routines TO authenticated;
GRANT SELECT ON public.traffic_routine_log TO authenticated;
GRANT ALL ON public.traffic_client_routines TO service_role;
GRANT ALL ON public.traffic_routine_log TO service_role;

DROP POLICY IF EXISTS traffic_client_routines_select ON public.traffic_client_routines;
CREATE POLICY traffic_client_routines_select ON public.traffic_client_routines
  FOR SELECT TO authenticated
  USING (public.central_trafego_can_access_client(client_id));

DROP POLICY IF EXISTS traffic_routine_log_select ON public.traffic_routine_log;
CREATE POLICY traffic_routine_log_select ON public.traffic_routine_log
  FOR SELECT TO authenticated
  USING (public.central_trafego_can_access_client(client_id));

-- Seed: clientes com Meta ativa entram com relatório ligado
INSERT INTO public.traffic_client_routines (client_id, report_enabled, crm_weekly_enabled)
SELECT DISTINCT c.id, true, false
FROM public.clientes c
JOIN public.cliente_meta_accounts m ON m.cliente_id = c.id AND m.is_active = true
WHERE c.etapa = 'closed'
ON CONFLICT (client_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.central_trafego_routine_report_cycle_key(p_date date)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT 'report_15d:' || to_char(p_date, 'YYYY-MM-DD');
$$;

CREATE OR REPLACE FUNCTION public.central_trafego_routine_crm_cycle_key(p_date date)
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT 'crm_weekly:' || to_char(p_date, 'IYYY-"W"IW');
$$;

CREATE OR REPLACE FUNCTION public.central_trafego_is_report_due_day(p_date date DEFAULT NULL)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT extract(day FROM COALESCE(p_date, public.central_trafego_operational_date())) IN (1, 16);
$$;

CREATE OR REPLACE FUNCTION public.central_trafego_is_crm_monday(p_date date DEFAULT NULL)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT extract(isodow FROM COALESCE(p_date, public.central_trafego_operational_date())) = 1;
$$;

CREATE OR REPLACE FUNCTION public.central_trafego_last_week_range(p_today date DEFAULT NULL)
RETURNS TABLE(week_start date, week_end date)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_today date := COALESCE(p_today, public.central_trafego_operational_date());
BEGIN
  week_start := v_today - 7;
  week_end := v_today - 1;
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.central_trafego_pending_crm_leads_count(p_client_id uuid, p_today date DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_today date := COALESCE(p_today, public.central_trafego_operational_date());
  v_start date;
  v_end date;
  v_count integer := 0;
BEGIN
  SELECT r.week_start, r.week_end INTO v_start, v_end
  FROM public.central_trafego_last_week_range(v_today) r;

  SELECT count(*)::integer INTO v_count
  FROM (
    SELECT l.id
    FROM public.leads l
    WHERE l.cliente_id = p_client_id
      AND l.comprou IS NULL
      AND COALESCE(l.data_entrada, l.created_at::date) BETWEEN v_start AND v_end
    UNION
    SELECT c.id
    FROM public.cliente_whatsapp_contact c
    WHERE c.cliente_id = p_client_id
      AND c.comprou IS NULL
      AND COALESCE(c.first_seen_at::date, c.last_message_at::date) BETWEEN v_start AND v_end
  ) x;

  RETURN COALESCE(v_count, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.central_trafego_is_routine_generation_key(p_key text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_key IS NOT NULL
    AND (p_key LIKE 'report_15d:%' OR p_key LIKE 'crm_weekly:%');
$$;

CREATE OR REPLACE FUNCTION public.central_trafego_ensure_routine_demands()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_today date := public.central_trafego_operational_date();
  v_client record;
  v_assignees uuid[];
  v_key text;
  v_title text;
  v_task_id uuid;
  v_pending integer;
  v_cycle text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN;
  END IF;
  IF NOT public.central_trafego_ui_allowed() THEN
    RETURN;
  END IF;

  FOR v_client IN
    SELECT
      c.id AS client_id,
      c.empresa,
      COALESCE(r.report_enabled, true) AS report_enabled,
      COALESCE(r.crm_weekly_enabled, false) AS crm_weekly_enabled,
      ops.primary_assignee_id
    FROM public.clientes c
    JOIN public.cliente_meta_accounts m ON m.cliente_id = c.id AND m.is_active = true
    LEFT JOIN public.traffic_client_routines r ON r.client_id = c.id
    LEFT JOIN public.traffic_client_ops ops ON ops.client_id = c.id
    WHERE c.etapa = 'closed'
      AND public.central_trafego_can_access_client(c.id)
      AND COALESCE(ops.situation, 'active') NOT IN ('closed', 'no_campaign_expected')
  LOOP
    v_assignees := ARRAY[
      COALESCE(
        v_client.primary_assignee_id,
        v_uid
      )
    ]::uuid[];

    IF public.central_trafego_is_report_due_day(v_today) AND v_client.report_enabled THEN
      v_key := public.central_trafego_routine_report_cycle_key(v_today);
      v_cycle := 'report_15d';

      IF NOT EXISTS (
        SELECT 1 FROM public.traffic_routine_log
        WHERE client_id = v_client.client_id
          AND routine_type = v_cycle
          AND cycle_key = v_key
      ) AND NOT EXISTS (
        SELECT 1
        FROM public.traffic_task_details d
        JOIN public.tarefas t ON t.id = d.task_id
        WHERE d.generation_key = v_key
          AND t.client_id = v_client.client_id
          AND NOT EXISTS (
            SELECT 1 FROM public.task_statuses s
            WHERE s.value = t.status AND s.is_terminal
          )
      ) THEN
        v_title := 'Relatório quinzenal — ' || COALESCE(v_client.empresa, 'Cliente');
        BEGIN
          v_task_id := public.create_traffic_demand(
            v_title,
            v_client.client_id,
            'relatorio',
            v_today,
            'medium',
            v_assignees,
            'PDF no Canva → anexar ao concluir.',
            '[]'::jsonb,
            NULL,
            'system',
            v_key,
            NULL,
            v_key,
            NULL
          );
        EXCEPTION WHEN unique_violation THEN
          NULL;
        END;
      END IF;
    END IF;

    IF public.central_trafego_is_crm_monday(v_today) AND v_client.crm_weekly_enabled THEN
      v_pending := public.central_trafego_pending_crm_leads_count(v_client.client_id, v_today);
      IF v_pending > 0 THEN
        v_key := public.central_trafego_routine_crm_cycle_key(v_today);
        v_cycle := 'crm_weekly';

        IF NOT EXISTS (
          SELECT 1 FROM public.traffic_routine_log
          WHERE client_id = v_client.client_id
            AND routine_type = v_cycle
            AND cycle_key = v_key
        ) AND NOT EXISTS (
          SELECT 1
          FROM public.traffic_task_details d
          JOIN public.tarefas t ON t.id = d.task_id
          WHERE d.generation_key = v_key
            AND t.client_id = v_client.client_id
            AND NOT EXISTS (
              SELECT 1 FROM public.task_statuses s
              WHERE s.value = t.status AND s.is_terminal
            )
        ) THEN
          v_title := 'CRM semanal — ' || v_pending::text || ' lead(s) sem resultado';
          BEGIN
            v_task_id := public.create_traffic_demand(
              v_title,
              v_client.client_id,
              'analise',
              v_today,
              'medium',
              v_assignees,
              'Preencher comprou/não comprou dos leads da semana passada.',
              '[]'::jsonb,
              NULL,
              'system',
              v_key,
              NULL,
              v_key,
              NULL
            );
          EXCEPTION WHEN unique_violation THEN
            NULL;
          END;
        END IF;
      END IF;
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_traffic_client_routines(
  p_client_id uuid,
  p_report_enabled boolean DEFAULT true,
  p_crm_weekly_enabled boolean DEFAULT false,
  p_report_cadence smallint DEFAULT 15
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Central de Tráfego: não autenticado';
  END IF;
  IF NOT public.central_trafego_ui_allowed() THEN
    RAISE EXCEPTION 'Central de Tráfego: UI/RPC não liberada';
  END IF;
  IF NOT public.central_trafego_can_access_client(p_client_id) THEN
    RAISE EXCEPTION 'Central de Tráfego: sem acesso a este cliente';
  END IF;
  IF p_report_cadence NOT IN (15, 30) THEN
    RAISE EXCEPTION 'Central de Tráfego: cadência inválida';
  END IF;

  INSERT INTO public.traffic_client_routines (
    client_id, report_enabled, report_cadence, crm_weekly_enabled, updated_at, updated_by
  ) VALUES (
    p_client_id,
    COALESCE(p_report_enabled, true),
    COALESCE(p_report_cadence, 15),
    COALESCE(p_crm_weekly_enabled, false),
    now(),
    v_uid
  )
  ON CONFLICT (client_id) DO UPDATE SET
    report_enabled = EXCLUDED.report_enabled,
    report_cadence = EXCLUDED.report_cadence,
    crm_weekly_enabled = EXCLUDED.crm_weekly_enabled,
    updated_at = now(),
    updated_by = v_uid;
END;
$$;

-- generation_key no payload da tarefa
CREATE OR REPLACE FUNCTION public.central_trafego_task_json(p_task_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT jsonb_build_object(
    'id', t.id,
    'title', t.title,
    'description', t.description,
    'status', t.status,
    'due_date', t.due_date,
    'priority', t.priority,
    'client_id', t.client_id,
    'client_empresa', cl.empresa,
    'assignee_ids', t.assignee_ids,
    'owner_id', t.owner_id,
    'demand_type', d.demand_type,
    'source_type', d.source_type,
    'source_reference', d.source_reference,
    'generation_key', d.generation_key,
    'next_review_at', d.next_review_at,
    'details', to_jsonb(d),
    'situation', ops.situation,
    'campaigns', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', pc.id,
        'name', pc.name,
        'client_id', pc.client_id,
        'status', pc.status,
        'relation_type', l.relation_type
      ))
      FROM public.paid_campaign_task_links l
      JOIN public.paid_campaigns pc ON pc.id = l.paid_campaign_id
      WHERE l.task_id = t.id AND pc.client_id = t.client_id
    ), '[]'::jsonb)
  )
  FROM public.tarefas t
  JOIN public.traffic_task_details d ON d.task_id = t.id
  JOIN public.clientes cl ON cl.id = t.client_id
  LEFT JOIN public.traffic_client_ops ops ON ops.client_id = t.client_id
  WHERE t.id = p_task_id
$$;

-- central_trafego_hoje: dispara rotinas + retorna bucket rotina
CREATE OR REPLACE FUNCTION public.central_trafego_hoje()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_today date := public.central_trafego_operational_date();
  v_now timestamptz := now();
  v_horizon timestamptz := now() + interval '48 hours';
  v_out jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Central de Tráfego: não autenticado';
  END IF;
  IF NOT public.central_trafego_ui_allowed() THEN
    RAISE EXCEPTION 'Central de Tráfego: UI/RPC não liberada para este perfil';
  END IF;

  PERFORM public.central_trafego_ensure_routine_demands();

  WITH scoped AS (
    SELECT t.id,
      public.central_trafego_task_json(t.id) AS payload,
      t.due_date,
      d.demand_type,
      d.generation_key,
      d.next_review_at,
      ops.situation
    FROM public.tarefas t
    JOIN public.traffic_task_details d ON d.task_id = t.id
    LEFT JOIN public.traffic_client_ops ops ON ops.client_id = t.client_id
    WHERE t.type = 'paid_traffic'
      AND public.central_trafego_can_see_task(t.id)
      AND NOT EXISTS (
        SELECT 1 FROM public.task_statuses s
        WHERE s.value = t.status AND s.is_terminal
      )
  ),
  classified AS (
    SELECT
      id,
      payload,
      CASE
        WHEN public.central_trafego_is_routine_generation_key(generation_key) THEN 'rotina'
        WHEN due_date IS NOT NULL AND due_date < v_today THEN 'atrasadas'
        WHEN due_date IS NOT NULL AND due_date = v_today THEN 'vencem_hoje'
        WHEN demand_type IN ('revisao_24h', 'revisao_72h')
          AND (
            (due_date IS NOT NULL AND due_date > v_today AND due_date <= (v_today + 2))
            OR (next_review_at IS NOT NULL AND next_review_at >= v_now AND next_review_at <= v_horizon)
          )
          THEN 'revisoes_48h'
        WHEN situation = 'waiting_client'
          OR demand_type IN ('cobranca_material', 'aprovacao_cliente')
          THEN 'aguardando_cliente'
        WHEN demand_type = 'publicacao' THEN 'publicacoes_pendentes'
        ELSE 'demais'
      END AS bucket
    FROM scoped
  )
  SELECT jsonb_build_object(
    'atrasadas', COALESCE((
      SELECT jsonb_agg(payload ORDER BY (payload->>'due_date'))
      FROM classified WHERE bucket = 'atrasadas'
    ), '[]'::jsonb),
    'vencem_hoje', COALESCE((
      SELECT jsonb_agg(payload ORDER BY (payload->>'due_date'))
      FROM classified WHERE bucket = 'vencem_hoje'
    ), '[]'::jsonb),
    'rotina', COALESCE((
      SELECT jsonb_agg(payload ORDER BY (payload->>'due_date'))
      FROM classified WHERE bucket = 'rotina'
    ), '[]'::jsonb),
    'revisoes_48h', COALESCE((
      SELECT jsonb_agg(payload ORDER BY (payload->>'due_date'))
      FROM classified WHERE bucket = 'revisoes_48h'
    ), '[]'::jsonb),
    'aguardando_cliente', COALESCE((
      SELECT jsonb_agg(payload ORDER BY (payload->>'due_date'))
      FROM classified WHERE bucket = 'aguardando_cliente'
    ), '[]'::jsonb),
    'publicacoes_pendentes', COALESCE((
      SELECT jsonb_agg(payload ORDER BY (payload->>'due_date'))
      FROM classified WHERE bucket = 'publicacoes_pendentes'
    ), '[]'::jsonb),
    'demais', COALESCE((
      SELECT jsonb_agg(payload ORDER BY (payload->>'due_date'))
      FROM classified WHERE bucket = 'demais'
    ), '[]'::jsonb),
    'clients', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', c.id, 'empresa', c.empresa) ORDER BY c.empresa)
      FROM public.clientes c
      WHERE public.central_trafego_can_access_client(c.id)
        AND (
          EXISTS (SELECT 1 FROM public.cliente_meta_accounts m WHERE m.cliente_id = c.id)
          OR EXISTS (SELECT 1 FROM public.paid_campaigns pc WHERE pc.client_id = c.id)
          OR EXISTS (SELECT 1 FROM public.tarefas t WHERE t.client_id = c.id AND t.type = 'paid_traffic')
          OR EXISTS (SELECT 1 FROM public.traffic_client_ops o WHERE o.client_id = c.id)
        )
    ), '[]'::jsonb),
    'campaigns', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', pc.id, 'name', pc.name, 'client_id', pc.client_id, 'status', pc.status, 'budget', pc.budget
      ) ORDER BY pc.name)
      FROM public.paid_campaigns pc
      WHERE public.central_trafego_can_access_client(pc.client_id)
    ), '[]'::jsonb),
    'team', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', p.id, 'full_name', p.full_name, 'role', p.role) ORDER BY p.full_name)
      FROM public.profiles p
      WHERE p.role IN ('superadmin', 'admin', 'colaborador')
        AND public.central_trafego_is_admin()
    ), '[]'::jsonb),
    'attachments_by_task', '{}'::jsonb
  )
  INTO v_out;

  RETURN v_out;
END;
$$;

-- Log automático quando demanda de rotina vai para status terminal
CREATE OR REPLACE FUNCTION public.traffic_routine_log_on_terminal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_details public.traffic_task_details%ROWTYPE;
  v_routine_type text;
  v_cycle_key text;
BEGIN
  IF NEW.type IS DISTINCT FROM 'paid_traffic' THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.task_statuses s
    WHERE s.value = NEW.status AND s.is_terminal
  ) THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_details FROM public.traffic_task_details WHERE task_id = NEW.id;
  IF NOT FOUND OR NOT public.central_trafego_is_routine_generation_key(v_details.generation_key) THEN
    RETURN NEW;
  END IF;

  IF v_details.generation_key LIKE 'report_15d:%' THEN
    v_routine_type := 'report_15d';
    v_cycle_key := v_details.generation_key;
  ELSIF v_details.generation_key LIKE 'crm_weekly:%' THEN
    v_routine_type := 'crm_weekly';
    v_cycle_key := v_details.generation_key;
  ELSE
    RETURN NEW;
  END IF;

  INSERT INTO public.traffic_routine_log (client_id, routine_type, cycle_key, task_id)
  VALUES (NEW.client_id, v_routine_type, v_cycle_key, NEW.id)
  ON CONFLICT (client_id, routine_type, cycle_key) DO UPDATE SET
    task_id = EXCLUDED.task_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS traffic_routine_log_on_terminal_trg ON public.tarefas;
CREATE TRIGGER traffic_routine_log_on_terminal_trg
  AFTER UPDATE OF status ON public.tarefas
  FOR EACH ROW
  EXECUTE FUNCTION public.traffic_routine_log_on_terminal();

-- Situação: expor rotina por cliente
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
      COALESCE(rt.report_enabled, true) AS report_enabled,
      COALESCE(rt.report_cadence, 15) AS report_cadence,
      COALESCE(rt.crm_weekly_enabled, false) AS crm_weekly_enabled,
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
      ), '[]'::jsonb) AS campaigns_without_demand
    FROM ops_clients oc
    LEFT JOIN public.traffic_client_ops ops ON ops.client_id = oc.id
    LEFT JOIN public.traffic_client_routines rt ON rt.client_id = oc.id
    LEFT JOIN public.profiles gp ON gp.id = ops.primary_assignee_id
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
        'routine', jsonb_build_object(
          'report_enabled', r.report_enabled,
          'report_cadence', r.report_cadence,
          'crm_weekly_enabled', r.crm_weekly_enabled
        )
      ) ORDER BY (r.gestor_id IS NULL) DESC, r.empresa)
      FROM rows r
    ), '[]'::jsonb),
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

REVOKE ALL ON FUNCTION public.central_trafego_ensure_routine_demands() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.upsert_traffic_client_routines(uuid, boolean, boolean, smallint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.central_trafego_ensure_routine_demands() TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_traffic_client_routines(uuid, boolean, boolean, smallint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.central_trafego_routine_report_cycle_key(date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.central_trafego_routine_crm_cycle_key(date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.central_trafego_is_report_due_day(date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.central_trafego_is_crm_monday(date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.central_trafego_last_week_range(date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.central_trafego_pending_crm_leads_count(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.central_trafego_is_routine_generation_key(text) TO authenticated;

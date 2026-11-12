-- Relatório no 1º dia útil e no dia 15 (ou a segunda seguinte).
-- Toda segunda, demanda para contar a semana no grupo. Não envia WhatsApp.

ALTER TABLE public.traffic_client_routines
  ADD COLUMN IF NOT EXISTS group_weekly_enabled boolean NOT NULL DEFAULT true;

ALTER TABLE public.traffic_routine_log DROP CONSTRAINT IF EXISTS traffic_routine_log_type_chk;
ALTER TABLE public.traffic_routine_log
  ADD CONSTRAINT traffic_routine_log_type_chk
  CHECK (routine_type = ANY (ARRAY['report_15d'::text, 'crm_weekly'::text, 'group_week'::text]));

CREATE OR REPLACE FUNCTION public.central_trafego_is_report_due_day(p_date date DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v date := COALESCE(p_date, public.central_trafego_operational_date());
  v_month date := date_trunc('month', v)::date;
  v_first date := v_month;
  v_mid date := v_month + 14;
BEGIN
  IF extract(isodow FROM v_first) = 6 THEN v_first := v_first + 2; END IF;
  IF extract(isodow FROM v_first) = 7 THEN v_first := v_first + 1; END IF;
  IF extract(isodow FROM v_mid) = 6 THEN v_mid := v_mid + 2; END IF;
  IF extract(isodow FROM v_mid) = 7 THEN v_mid := v_mid + 1; END IF;
  RETURN v = v_first OR v = v_mid;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.central_trafego_is_routine_generation_key(p_key text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $fn$
  SELECT p_key IS NOT NULL
    AND (p_key LIKE 'report_15d:%' OR p_key LIKE 'crm_weekly:%' OR p_key LIKE 'group_week:%');
$fn$;

CREATE OR REPLACE FUNCTION public.central_trafego_ensure_routine_demands()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
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
  v_start date;
  v_end date;
  v_desc text;
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
      COALESCE(r.group_weekly_enabled, true) AS group_weekly_enabled,
      NULLIF(c.entregaveis->'whatsapp_grupo'->>'chat_jid', '') AS grupo_jid,
      ops.primary_assignee_id
    FROM public.clientes c
    JOIN public.cliente_meta_accounts m ON m.cliente_id = c.id AND m.is_active = true
    LEFT JOIN public.traffic_client_routines r ON r.client_id = c.id
    LEFT JOIN public.traffic_client_ops ops ON ops.client_id = c.id
    WHERE c.etapa = 'closed'
      AND public.central_trafego_can_access_client(c.id)
      AND COALESCE(ops.situation, 'active') NOT IN ('closed', 'no_campaign_expected')
  LOOP
    v_assignees := ARRAY[COALESCE(v_client.primary_assignee_id, v_uid)]::uuid[];

    IF public.central_trafego_is_report_due_day(v_today) AND v_client.report_enabled THEN
      v_key := public.central_trafego_routine_report_cycle_key(v_today);
      v_cycle := 'report_15d';
      IF NOT EXISTS (
        SELECT 1 FROM public.traffic_routine_log
        WHERE client_id = v_client.client_id AND routine_type = v_cycle AND cycle_key = v_key
      ) AND NOT EXISTS (
        SELECT 1 FROM public.traffic_task_details d
        JOIN public.tarefas t ON t.id = d.task_id
        WHERE d.generation_key = v_key AND t.client_id = v_client.client_id
          AND NOT EXISTS (SELECT 1 FROM public.task_statuses s WHERE s.value = t.status AND s.is_terminal)
      ) THEN
        v_title := 'Relatório de tráfego — ' || COALESCE(v_client.empresa, 'Cliente');
        BEGIN
          v_task_id := public.create_traffic_demand(
            v_title, v_client.client_id, 'relatorio', v_today, 'medium', v_assignees,
            'PDF no Canva → anexar ao concluir.',
            '[]'::jsonb, NULL, 'system', v_key, NULL, v_key, NULL
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
          WHERE client_id = v_client.client_id AND routine_type = v_cycle AND cycle_key = v_key
        ) AND NOT EXISTS (
          SELECT 1 FROM public.traffic_task_details d
          JOIN public.tarefas t ON t.id = d.task_id
          WHERE d.generation_key = v_key AND t.client_id = v_client.client_id
            AND NOT EXISTS (SELECT 1 FROM public.task_statuses s WHERE s.value = t.status AND s.is_terminal)
        ) THEN
          v_title := 'CRM semanal — ' || v_pending::text || ' lead(s) sem resultado';
          BEGIN
            v_task_id := public.create_traffic_demand(
              v_title, v_client.client_id, 'analise', v_today, 'medium', v_assignees,
              'Preencher comprou/não comprou dos leads da semana passada.',
              '[]'::jsonb, NULL, 'system', v_key, NULL, v_key, NULL
            );
          EXCEPTION WHEN unique_violation THEN
            NULL;
          END;
        END IF;
      END IF;
    END IF;

    IF public.central_trafego_is_crm_monday(v_today)
       AND v_client.group_weekly_enabled
       AND v_client.grupo_jid IS NOT NULL THEN
      v_key := 'group_week:' || to_char(v_today, 'YYYY-MM-DD');
      v_cycle := 'group_week';
      IF NOT EXISTS (
        SELECT 1 FROM public.traffic_routine_log
        WHERE client_id = v_client.client_id AND routine_type = v_cycle AND cycle_key = v_key
      ) AND NOT EXISTS (
        SELECT 1 FROM public.traffic_task_details d
        JOIN public.tarefas t ON t.id = d.task_id
        WHERE d.generation_key = v_key AND t.client_id = v_client.client_id
          AND NOT EXISTS (SELECT 1 FROM public.task_statuses s WHERE s.value = t.status AND s.is_terminal)
      ) THEN
        SELECT r.week_start, r.week_end INTO v_start, v_end
        FROM public.central_trafego_last_week_range(v_today) r;
        v_title := 'Resumo da semana no grupo — ' || COALESCE(v_client.empresa, 'Cliente');
        v_desc := format(
          E'Enviar no grupo de WhatsApp já vinculado a este cliente. Nada é enviado sozinho.\n\nOi, pessoal. Passando para contar como foi a semana de %s (%s a %s).\n\nComplete o que aconteceu e envie esta mensagem no grupo.',
          COALESCE(v_client.empresa, 'Cliente'),
          to_char(v_start, 'DD/MM'),
          to_char(v_end, 'DD/MM')
        );
        BEGIN
          v_task_id := public.create_traffic_demand(
            v_title, v_client.client_id, 'outro', v_today, 'medium', v_assignees,
            v_desc, '[]'::jsonb, NULL, 'system', v_key, NULL, v_key, NULL
          );
        EXCEPTION WHEN unique_violation THEN
          NULL;
        END;
      END IF;
    END IF;
  END LOOP;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.traffic_routine_log_on_terminal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
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
  ELSIF v_details.generation_key LIKE 'group_week:%' THEN
    v_routine_type := 'group_week';
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
$fn$;

DROP FUNCTION IF EXISTS public.upsert_traffic_client_routines(uuid, boolean, boolean, smallint);

CREATE OR REPLACE FUNCTION public.upsert_traffic_client_routines(
  p_client_id uuid,
  p_report_enabled boolean DEFAULT true,
  p_crm_weekly_enabled boolean DEFAULT false,
  p_report_cadence smallint DEFAULT 15,
  p_group_weekly_enabled boolean DEFAULT true
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
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
    client_id, report_enabled, report_cadence, crm_weekly_enabled, group_weekly_enabled, updated_at, updated_by
  ) VALUES (
    p_client_id,
    COALESCE(p_report_enabled, true),
    COALESCE(p_report_cadence, 15),
    COALESCE(p_crm_weekly_enabled, false),
    COALESCE(p_group_weekly_enabled, true),
    now(),
    v_uid
  )
  ON CONFLICT (client_id) DO UPDATE SET
    report_enabled = EXCLUDED.report_enabled,
    report_cadence = EXCLUDED.report_cadence,
    crm_weekly_enabled = EXCLUDED.crm_weekly_enabled,
    group_weekly_enabled = EXCLUDED.group_weekly_enabled,
    updated_at = now(),
    updated_by = v_uid;
END;
$fn$;

REVOKE ALL ON FUNCTION public.upsert_traffic_client_routines(uuid, boolean, boolean, smallint, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_traffic_client_routines(uuid, boolean, boolean, smallint, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.central_trafego_situacao()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
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
      COALESCE(rt.group_weekly_enabled, true) AS group_weekly_enabled,
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
          'crm_weekly_enabled', r.crm_weekly_enabled,
          'group_weekly_enabled', r.group_weekly_enabled
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
$function$



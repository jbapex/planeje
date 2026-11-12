-- Indicadores por colaborador (Relatório #/reports).
-- Guarda o que o cálculo de comissão precisa e o Planeje ainda não registrava:
-- histórico de prazos, gravação agendada, regravação classificada, metas de
-- resultado por cliente, perfil de indicador por pessoa e fotos do dia 1º e do
-- último dia do mês. Não altera tarefas existentes, não envia nada para fora.

-- 1. Histórico de prazo -------------------------------------------------------

ALTER TABLE public.tarefas
  ADD COLUMN IF NOT EXISTS recording_scheduled_on date;

CREATE TABLE IF NOT EXISTS public.task_deadline_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tarefas(id) ON DELETE CASCADE,
  field text NOT NULL CHECK (field IN ('due_date', 'post_date', 'customer_promised_date', 'recording_scheduled_on')),
  old_value date,
  new_value date,
  source text NOT NULL CHECK (source IN ('insert', 'update', 'baseline')),
  changed_by uuid,
  changed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS task_deadline_changes_task_idx
  ON public.task_deadline_changes (task_id, changed_at);

ALTER TABLE public.task_deadline_changes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS task_deadline_changes_read ON public.task_deadline_changes;
CREATE POLICY task_deadline_changes_read ON public.task_deadline_changes
  FOR SELECT TO authenticated USING (public.central_trafego_is_internal());

GRANT SELECT ON public.task_deadline_changes TO authenticated;

CREATE OR REPLACE FUNCTION planeje_private.log_task_deadline_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $fn$
DECLARE
  v_source text := CASE WHEN TG_OP = 'INSERT' THEN 'insert' ELSE 'update' END;
BEGIN
  IF (TG_OP = 'INSERT' AND NEW.due_date IS NOT NULL) OR (TG_OP = 'UPDATE' AND NEW.due_date IS DISTINCT FROM OLD.due_date) THEN
    INSERT INTO public.task_deadline_changes (task_id, field, old_value, new_value, source, changed_by)
    VALUES (NEW.id, 'due_date', CASE WHEN TG_OP = 'UPDATE' THEN OLD.due_date END, NEW.due_date, v_source, auth.uid());
  END IF;
  IF (TG_OP = 'INSERT' AND NEW.post_date IS NOT NULL) OR (TG_OP = 'UPDATE' AND NEW.post_date IS DISTINCT FROM OLD.post_date) THEN
    INSERT INTO public.task_deadline_changes (task_id, field, old_value, new_value, source, changed_by)
    VALUES (NEW.id, 'post_date', CASE WHEN TG_OP = 'UPDATE' THEN OLD.post_date END, NEW.post_date, v_source, auth.uid());
  END IF;
  IF (TG_OP = 'INSERT' AND NEW.customer_promised_date IS NOT NULL) OR (TG_OP = 'UPDATE' AND NEW.customer_promised_date IS DISTINCT FROM OLD.customer_promised_date) THEN
    INSERT INTO public.task_deadline_changes (task_id, field, old_value, new_value, source, changed_by)
    VALUES (NEW.id, 'customer_promised_date', CASE WHEN TG_OP = 'UPDATE' THEN OLD.customer_promised_date END, NEW.customer_promised_date, v_source, auth.uid());
  END IF;
  IF (TG_OP = 'INSERT' AND NEW.recording_scheduled_on IS NOT NULL) OR (TG_OP = 'UPDATE' AND NEW.recording_scheduled_on IS DISTINCT FROM OLD.recording_scheduled_on) THEN
    INSERT INTO public.task_deadline_changes (task_id, field, old_value, new_value, source, changed_by)
    VALUES (NEW.id, 'recording_scheduled_on', CASE WHEN TG_OP = 'UPDATE' THEN OLD.recording_scheduled_on END, NEW.recording_scheduled_on, v_source, auth.uid());
  END IF;
  RETURN NULL;
END
$fn$;

DROP TRIGGER IF EXISTS zz_tarefas_log_deadline_change ON public.tarefas;
CREATE TRIGGER zz_tarefas_log_deadline_change
  AFTER INSERT OR UPDATE OF due_date, post_date, customer_promised_date, recording_scheduled_on ON public.tarefas
  FOR EACH ROW EXECUTE FUNCTION planeje_private.log_task_deadline_change();

-- Ponto de partida: o prazo de hoje, sem saber quem o mudou antes.
INSERT INTO public.task_deadline_changes (task_id, field, old_value, new_value, source, changed_by, changed_at)
SELECT t.id, f.field, NULL, f.value, 'baseline', NULL, clock_timestamp()
FROM public.tarefas t
CROSS JOIN LATERAL (VALUES
  ('due_date', t.due_date),
  ('post_date', t.post_date),
  ('customer_promised_date', t.customer_promised_date)
) AS f(field, value)
WHERE f.value IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.task_deadline_changes c WHERE c.task_id = t.id AND c.field = f.field);

-- 2. Regravação classificada --------------------------------------------------

CREATE TABLE IF NOT EXISTS public.task_rework_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tarefas(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'regravacao' CHECK (kind IN ('regravacao')),
  reason text NOT NULL CHECK (reason IN ('falha_captacao', 'pedido_cliente', 'outro')),
  notes text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS task_rework_events_task_idx ON public.task_rework_events (task_id);

ALTER TABLE public.task_rework_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS task_rework_events_read ON public.task_rework_events;
CREATE POLICY task_rework_events_read ON public.task_rework_events
  FOR SELECT TO authenticated USING (public.central_trafego_is_internal());

DROP POLICY IF EXISTS task_rework_events_insert ON public.task_rework_events;
CREATE POLICY task_rework_events_insert ON public.task_rework_events
  FOR INSERT TO authenticated
  WITH CHECK (public.central_trafego_is_internal() AND created_by = auth.uid());

DROP POLICY IF EXISTS task_rework_events_delete ON public.task_rework_events;
CREATE POLICY task_rework_events_delete ON public.task_rework_events
  FOR DELETE TO authenticated
  USING (public.central_trafego_caller_role() IN ('superadmin', 'admin'));

GRANT SELECT, INSERT, DELETE ON public.task_rework_events TO authenticated;

-- 3. Metas de resultado por cliente e mês -------------------------------------
-- CPL e CPA continuam em clientes.meta_custo_mensagem / meta_custo_compra.

CREATE TABLE IF NOT EXISTS public.client_result_goals (
  client_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  reference_month date NOT NULL CHECK (reference_month = date_trunc('month', reference_month)::date),
  leads_goal integer CHECK (leads_goal >= 0),
  agendamentos_goal integer CHECK (agendamentos_goal >= 0),
  vendas_goal integer CHECK (vendas_goal >= 0),
  updated_by uuid DEFAULT auth.uid(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (client_id, reference_month)
);

ALTER TABLE public.client_result_goals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS client_result_goals_read ON public.client_result_goals;
CREATE POLICY client_result_goals_read ON public.client_result_goals
  FOR SELECT TO authenticated USING (public.central_trafego_is_internal());

DROP POLICY IF EXISTS client_result_goals_write ON public.client_result_goals;
CREATE POLICY client_result_goals_write ON public.client_result_goals
  FOR ALL TO authenticated
  USING (public.central_trafego_caller_role() IN ('superadmin', 'admin'))
  WITH CHECK (public.central_trafego_caller_role() IN ('superadmin', 'admin'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_result_goals TO authenticated;

-- 4. Perfil de indicador de cada pessoa ---------------------------------------

CREATE TABLE IF NOT EXISTS public.collaborator_indicator_profiles (
  profile_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  indicator_profile text NOT NULL CHECK (indicator_profile IN ('gestao', 'design', 'roteiro_gravacao', 'edicao', 'trafego', 'nenhum')),
  updated_by uuid DEFAULT auth.uid(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.collaborator_indicator_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS collaborator_indicator_profiles_read ON public.collaborator_indicator_profiles;
CREATE POLICY collaborator_indicator_profiles_read ON public.collaborator_indicator_profiles
  FOR SELECT TO authenticated USING (public.central_trafego_is_internal());

DROP POLICY IF EXISTS collaborator_indicator_profiles_write ON public.collaborator_indicator_profiles;
CREATE POLICY collaborator_indicator_profiles_write ON public.collaborator_indicator_profiles
  FOR ALL TO authenticated
  USING (public.central_trafego_caller_role() IN ('superadmin', 'admin'))
  WITH CHECK (public.central_trafego_caller_role() IN ('superadmin', 'admin'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.collaborator_indicator_profiles TO authenticated;

INSERT INTO public.collaborator_indicator_profiles (profile_id, indicator_profile, updated_by)
SELECT p.id, v.indicator_profile, NULL
FROM (VALUES
  ('4628a3b6-7e34-4753-b46c-8e068608b802'::uuid, 'gestao'),
  ('b80d59ba-9fdc-467f-8d9c-890e90359cd8'::uuid, 'design'),
  ('56cb41db-a306-4706-ac23-d8999aa87a82'::uuid, 'roteiro_gravacao'),
  ('77d51190-5a9c-4200-9111-2ccabeac0e95'::uuid, 'edicao'),
  ('3b248b66-6782-4dae-b647-b50ba4332463'::uuid, 'trafego')
) AS v(id, indicator_profile)
JOIN public.profiles p ON p.id = v.id
ON CONFLICT (profile_id) DO NOTHING;

-- 5. Fotos do dia 1º (cobertura) e do último dia (vencidas) ------------------

CREATE TABLE IF NOT EXISTS public.indicator_month_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('cobertura_dia1', 'fechamento_vencidas')),
  reference_month date NOT NULL CHECK (reference_month = date_trunc('month', reference_month)::date),
  source text NOT NULL CHECK (source IN ('auto', 'manual')),
  rows jsonb NOT NULL DEFAULT '[]'::jsonb,
  taken_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  taken_by uuid,
  UNIQUE (kind, reference_month)
);

ALTER TABLE public.indicator_month_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS indicator_month_snapshots_read ON public.indicator_month_snapshots;
CREATE POLICY indicator_month_snapshots_read ON public.indicator_month_snapshots
  FOR SELECT TO authenticated USING (public.central_trafego_is_internal());

GRANT SELECT ON public.indicator_month_snapshots TO authenticated;

-- A foto não é refeita: a primeira que existir para o mês vale.
CREATE OR REPLACE FUNCTION planeje_private.take_indicator_snapshot(p_kind text, p_month date, p_source text)
RETURNS public.indicator_month_snapshots
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $fn$
DECLARE
  v_month date := date_trunc('month', p_month)::date;
  v_now timestamptz := clock_timestamp();
  v_today date := (v_now AT TIME ZONE 'America/Sao_Paulo')::date;
  v_rows jsonb;
  v_row public.indicator_month_snapshots;
BEGIN
  SELECT * INTO v_row FROM public.indicator_month_snapshots WHERE kind = p_kind AND reference_month = v_month;
  IF FOUND THEN RETURN v_row; END IF;

  IF p_kind = 'cobertura_dia1' THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'cliente_id', r.cliente_id, 'empresa', r.empresa, 'responsavel_id', r.responsavel_id,
      'tipo_servico_norm', r.tipo_servico_norm, 'tem_plano_mes', r.tem_plano_mes,
      'contratado', r.contratado, 'planejado', r.planejado, 'planejado_no_plano', r.planejado_no_plano,
      'cobertura_pct', r.cobertura_pct, 'status_cobertura', r.status_cobertura
    )), '[]'::jsonb) INTO v_rows
    FROM public.resumo_cobertura_operacional_mensal(v_month) r;
  ELSIF p_kind = 'fechamento_vencidas' THEN
    WITH open_tasks AS (
      SELECT t.id, t.title, t.client_id, t.assignee_ids, t.status,
        CASE WHEN t.production_delivered_at IS NULL THEN 'production' ELSE 'stage' END AS main_kind,
        CASE WHEN t.production_delivered_at IS NULL THEN t.due_date::timestamptz ELSE NULL END AS production_due,
        CASE WHEN t.production_delivered_at IS NOT NULL THEN t.stage_due_at ELSE NULL END AS stage_due,
        t.post_date
      FROM public.tarefas t
      LEFT JOIN public.task_statuses s ON s.value = t.status
      WHERE coalesce(s.is_terminal, false) = false
        AND lower(coalesce(t.status, '')) NOT IN ('published', 'done', 'completed', 'concluido', 'concluído', 'concluida', 'concluída')
        AND coalesce(s.label, '') NOT ILIKE 'stand%by'
        AND coalesce(cardinality(t.assignee_ids), 0) > 0
    ), late AS (
      SELECT o.*,
        CASE
          WHEN o.stage_due IS NOT NULL AND o.stage_due < v_now THEN 'stage'
          WHEN o.production_due IS NOT NULL AND o.production_due::date <= v_today THEN 'production'
          WHEN o.post_date IS NOT NULL AND o.post_date <= v_today THEN 'publication'
        END AS deadline_kind
      FROM open_tasks o
    )
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'task_id', l.id, 'title', l.title, 'client_id', l.client_id, 'assignee_ids', to_jsonb(l.assignee_ids),
      'status', l.status, 'deadline_kind', l.deadline_kind,
      'deadline', CASE l.deadline_kind WHEN 'stage' THEN l.stage_due::text WHEN 'production' THEN l.production_due::date::text ELSE l.post_date::text END
    )), '[]'::jsonb) INTO v_rows
    FROM late l WHERE l.deadline_kind IS NOT NULL;
  ELSE
    RAISE EXCEPTION 'Tipo de foto desconhecido: %', p_kind;
  END IF;

  INSERT INTO public.indicator_month_snapshots (kind, reference_month, source, rows, taken_at, taken_by)
  VALUES (p_kind, v_month, p_source, v_rows, v_now, auth.uid())
  ON CONFLICT (kind, reference_month) DO NOTHING
  RETURNING * INTO v_row;
  IF v_row.id IS NULL THEN
    SELECT * INTO v_row FROM public.indicator_month_snapshots WHERE kind = p_kind AND reference_month = v_month;
  END IF;
  RETURN v_row;
END
$fn$;

-- Botão do administrador: tira a foto agora se o mês ainda não tem uma.
CREATE OR REPLACE FUNCTION public.capture_indicator_snapshot(p_kind text, p_month date)
RETURNS public.indicator_month_snapshots
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $fn$
BEGIN
  IF coalesce(public.central_trafego_caller_role(), '') NOT IN ('superadmin', 'admin') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Só administrador tira a foto do mês.';
  END IF;
  RETURN planeje_private.take_indicator_snapshot(p_kind, p_month, 'manual');
END
$fn$;

REVOKE ALL ON FUNCTION public.capture_indicator_snapshot(text, date) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.capture_indicator_snapshot(text, date) TO authenticated;
REVOKE ALL ON FUNCTION planeje_private.take_indicator_snapshot(text, date, text) FROM public, anon, authenticated;

-- 23h55 de Brasília (02h55 UTC do dia seguinte).
DO $cron$
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname IN ('planeje-indicadores-cobertura-dia1', 'planeje-indicadores-fechamento');
  PERFORM cron.schedule('planeje-indicadores-cobertura-dia1', '55 2 2 * *',
    $$SELECT planeje_private.take_indicator_snapshot('cobertura_dia1', date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo')::date, 'auto')$$);
  PERFORM cron.schedule('planeje-indicadores-fechamento', '55 2 1 * *',
    $$SELECT planeje_private.take_indicator_snapshot('fechamento_vencidas', date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo')::date, 'auto')$$);
END
$cron$;

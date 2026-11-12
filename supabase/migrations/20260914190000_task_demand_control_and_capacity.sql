-- Fase 4.2/4.3 — controle da demanda e capacidade por função.
-- Campos novos são opcionais para preservar todas as tarefas e automações atuais.

ALTER TABLE public.tarefas
  ADD COLUMN IF NOT EXISTS operational_function_id uuid NULL
    REFERENCES public.task_operational_functions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS demand_type text NULL,
  ADD COLUMN IF NOT EXISTS demand_origin text NULL,
  ADD COLUMN IF NOT EXISTS sla_days integer NULL,
  ADD COLUMN IF NOT EXISTS customer_promised_date date NULL,
  ADD COLUMN IF NOT EXISTS review_round integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reschedule_reason text NULL,
  ADD COLUMN IF NOT EXISTS displaced_task_id uuid NULL
    REFERENCES public.tarefas(id) ON DELETE SET NULL;

DO $$ BEGIN
  ALTER TABLE public.tarefas ADD CONSTRAINT tarefas_demand_type_valid
    CHECK (demand_type IS NULL OR demand_type IN ('planned', 'correction', 'change', 'extra', 'urgency'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.tarefas ADD CONSTRAINT tarefas_demand_origin_valid
    CHECK (demand_origin IS NULL OR demand_origin IN ('plan', 'client', 'internal'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.tarefas ADD CONSTRAINT tarefas_sla_days_valid
    CHECK (sla_days IS NULL OR sla_days BETWEEN 0 AND 365);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.tarefas ADD CONSTRAINT tarefas_review_round_valid
    CHECK (review_round BETWEEN 0 AND 999);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.tarefas ADD CONSTRAINT tarefas_displaced_task_not_self
    CHECK (displaced_task_id IS NULL OR displaced_task_id <> id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.tarefas ADD CONSTRAINT tarefas_replanning_complete
    CHECK (
      (displaced_task_id IS NULL AND nullif(btrim(reschedule_reason), '') IS NULL)
      OR
      (displaced_task_id IS NOT NULL AND nullif(btrim(reschedule_reason), '') IS NOT NULL)
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_tarefas_operational_function
  ON public.tarefas(operational_function_id, due_date);
CREATE INDEX IF NOT EXISTS idx_tarefas_demand_control
  ON public.tarefas(demand_type, customer_promised_date);

CREATE TABLE IF NOT EXISTS public.task_function_capacities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operational_function_id uuid NOT NULL
    REFERENCES public.task_operational_functions(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  task_limit integer NOT NULL,
  notes text NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  created_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  CONSTRAINT task_function_capacities_week_start CHECK (extract(isodow FROM week_start) = 1),
  CONSTRAINT task_function_capacities_limit CHECK (task_limit BETWEEN 1 AND 999),
  CONSTRAINT task_function_capacities_unique_week UNIQUE (operational_function_id, week_start)
);

ALTER TABLE public.task_function_capacities ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_function_capacities TO authenticated;
GRANT ALL ON public.task_function_capacities TO service_role;

DROP POLICY IF EXISTS task_function_capacities_read ON public.task_function_capacities;
CREATE POLICY task_function_capacities_read ON public.task_function_capacities
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS task_function_capacities_manage ON public.task_function_capacities;
CREATE POLICY task_function_capacities_manage ON public.task_function_capacities
  FOR ALL TO authenticated
  USING ((SELECT public.can_manage_task_operational_functions()))
  WITH CHECK ((SELECT public.can_manage_task_operational_functions()));

CREATE OR REPLACE FUNCTION planeje_private.touch_task_function_capacity()
RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    NEW.created_at := OLD.created_at;
    NEW.created_by := OLD.created_by;
  END IF;
  NEW.updated_at := clock_timestamp();
  NEW.updated_by := auth.uid();
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS task_function_capacities_touch ON public.task_function_capacities;
CREATE TRIGGER task_function_capacities_touch
  BEFORE INSERT OR UPDATE ON public.task_function_capacities
  FOR EACH ROW EXECUTE FUNCTION planeje_private.touch_task_function_capacity();

COMMENT ON COLUMN public.tarefas.operational_function_id IS
  'Função responsável pela execução atual; pessoas continuam em assignee_ids.';
COMMENT ON COLUMN public.tarefas.displaced_task_id IS
  'Tarefa cuja promessa foi deslocada para acomodar esta demanda.';
COMMENT ON TABLE public.task_function_capacities IS
  'Limite semanal configurado em quantidade de tarefas por função operacional.';

NOTIFY pgrst, 'reload schema';

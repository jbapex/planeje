BEGIN;

-- Persist the first tracked month once; it must not slide forward as time passes.
ALTER TABLE public.project_planning_settings
  ADD COLUMN automatic_from_month date NOT NULL
    DEFAULT ((date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo') + interval '1 month')::date),
  ADD CONSTRAINT project_planning_start_month_first_day
    CHECK (extract(day FROM automatic_from_month) = 1);

NOTIFY pgrst, 'reload schema';
COMMIT;

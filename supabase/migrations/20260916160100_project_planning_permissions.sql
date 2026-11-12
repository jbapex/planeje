BEGIN;
REVOKE ALL ON public.project_planning_settings FROM authenticated, anon;
GRANT SELECT, UPDATE ON public.project_planning_settings TO authenticated;
REVOKE ALL ON public.project_planning_history FROM authenticated, anon;
REVOKE ALL ON SEQUENCE public.project_planning_history_id_seq FROM authenticated, anon;
GRANT SELECT ON public.project_planning_history TO authenticated;
COMMIT;

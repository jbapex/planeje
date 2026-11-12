BEGIN;

CREATE TABLE public.project_plan_skips (
  client_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  reference_month date NOT NULL CHECK (extract(day FROM reference_month) = 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  PRIMARY KEY (client_id, reference_month)
);

ALTER TABLE public.project_plan_skips ENABLE ROW LEVEL SECURITY;

CREATE POLICY project_plan_skips_read ON public.project_plan_skips
  FOR SELECT TO authenticated
  USING (public.get_my_role() IS NOT NULL AND public.get_my_role() <> 'cliente');

CREATE POLICY project_plan_skips_insert ON public.project_plan_skips
  FOR INSERT TO authenticated
  WITH CHECK (public.get_my_role() IN ('superadmin', 'admin', 'colaborador'));

REVOKE ALL ON public.project_plan_skips FROM authenticated, anon;
GRANT SELECT, INSERT ON public.project_plan_skips TO authenticated;
GRANT ALL ON public.project_plan_skips TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;

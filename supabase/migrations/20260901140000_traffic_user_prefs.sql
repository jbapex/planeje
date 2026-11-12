-- Preferências de UI do módulo de tráfego (colunas do Painel, etc.)

CREATE TABLE IF NOT EXISTS public.traffic_user_prefs (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  painel_columns jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.traffic_user_prefs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS traffic_user_prefs_select ON public.traffic_user_prefs;
CREATE POLICY traffic_user_prefs_select ON public.traffic_user_prefs
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS traffic_user_prefs_insert ON public.traffic_user_prefs;
CREATE POLICY traffic_user_prefs_insert ON public.traffic_user_prefs
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS traffic_user_prefs_update ON public.traffic_user_prefs;
CREATE POLICY traffic_user_prefs_update ON public.traffic_user_prefs
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

REVOKE ALL ON public.traffic_user_prefs FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE ON public.traffic_user_prefs TO authenticated;
GRANT ALL ON public.traffic_user_prefs TO service_role;

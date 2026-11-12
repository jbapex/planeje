-- Fase 1: admin liga a Central e coloca gestores na allowlist sem depender de GRANT na tabela.

CREATE OR REPLACE FUNCTION public.central_trafego_set_allowlist(
  p_enabled boolean,
  p_profile_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_ids uuid[] := COALESCE(p_profile_ids, ARRAY[]::uuid[]);
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Central de Tráfego: não autenticado';
  END IF;
  IF NOT public.central_trafego_is_admin() THEN
    RAISE EXCEPTION 'Central de Tráfego: só admin altera a allowlist';
  END IF;

  UPDATE public.traffic_central_settings
  SET enabled = COALESCE(p_enabled, enabled),
      updated_at = now(),
      updated_by = v_uid
  WHERE id;

  INSERT INTO public.traffic_central_allowed_profiles (profile_id, created_by)
  SELECT DISTINCT pid, v_uid
  FROM unnest(v_ids) AS pid
  WHERE pid IS NOT NULL
  ON CONFLICT (profile_id) DO NOTHING;

  RETURN jsonb_build_object(
    'enabled', (SELECT enabled FROM public.traffic_central_settings WHERE id),
    'profiles', COALESCE((
      SELECT jsonb_agg(profile_id ORDER BY profile_id)
      FROM public.traffic_central_allowed_profiles
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.central_trafego_set_allowlist(boolean, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.central_trafego_set_allowlist(boolean, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.central_trafego_set_allowlist(boolean, uuid[]) TO service_role;

COMMENT ON FUNCTION public.central_trafego_set_allowlist(boolean, uuid[]) IS
  'Admin liga/desliga a Central e inclui perfis na allowlist. Não remove quem já está.';

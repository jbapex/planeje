-- Corrige: function digest(bytea, unknown) does not exist
-- No Supabase o pgcrypto fica em general.extensions; o 2º arg precisa de cast explícito.

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public._mcp_token_hash(p_token text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, extensions
AS $$
  SELECT encode(
    extensions.digest(convert_to(p_token, 'UTF8'), 'sha256'::text),
    'hex'
  );
$$;

-- Reaplica generate/verify para usar a hash corrigida (já chamam _mcp_token_hash)
CREATE OR REPLACE FUNCTION public.generate_mcp_user_token(
  p_label text DEFAULT 'default',
  p_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_target uuid;
  v_label text := nullif(trim(coalesce(p_label, 'default')), '');
  v_token text;
  v_prefix text;
  v_hash text;
  v_id uuid;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  v_label := coalesce(v_label, 'default');
  v_target := coalesce(p_user_id, v_caller);

  IF v_target <> v_caller THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = v_caller AND p.role = 'superadmin'
    ) THEN
      RAISE EXCEPTION 'Só superadmin pode gerar token para outro usuário';
    END IF;
  END IF;

  PERFORM public._assert_mcp_team_user(v_target);

  UPDATE public.mcp_user_tokens
  SET revoked_at = now()
  WHERE user_id = v_target
    AND lower(label) = lower(v_label)
    AND revoked_at IS NULL;

  v_token := 'mcp_' || replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  v_prefix := left(v_token, 12);
  v_hash := public._mcp_token_hash(v_token);

  INSERT INTO public.mcp_user_tokens (user_id, token_prefix, token_hash, label)
  VALUES (v_target, v_prefix, v_hash, v_label)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'id', v_id,
    'token', v_token,
    'token_prefix', v_prefix,
    'label', v_label,
    'user_id', v_target,
    'endpoint', 'https://mcp.planeje.jbapex.com.br/mcp',
    'hint', 'Guarde o token agora — ele não será exibido de novo. Use Authorization: Bearer <token>.'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.verify_mcp_user_token(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_hash text;
  v_row public.mcp_user_tokens%ROWTYPE;
  v_profile public.profiles%ROWTYPE;
BEGIN
  IF p_token IS NULL OR trim(p_token) = '' THEN
    RETURN NULL;
  END IF;

  v_hash := public._mcp_token_hash(trim(p_token));

  SELECT * INTO v_row
  FROM public.mcp_user_tokens
  WHERE token_hash = v_hash AND revoked_at IS NULL
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = v_row.user_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF v_profile.role NOT IN ('superadmin', 'admin', 'colaborador') THEN
    RETURN NULL;
  END IF;

  UPDATE public.mcp_user_tokens
  SET last_used_at = now()
  WHERE id = v_row.id;

  RETURN jsonb_build_object(
    'token_id', v_row.id,
    'user_id', v_profile.id,
    'full_name', v_profile.full_name,
    'role', v_profile.role,
    'cliente_id', v_profile.cliente_id,
    'label', v_row.label,
    'token_prefix', v_row.token_prefix
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_mcp_user_token(text, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.verify_mcp_user_token(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.verify_mcp_user_token(text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_mcp_user_token(text) TO service_role;

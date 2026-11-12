-- Tokens MCP pessoais por usuário da equipe (profiles internos internos)

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.mcp_user_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  token_prefix text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  label text NOT NULL DEFAULT 'default',
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at timestamptz,
  CONSTRAINT mcp_user_tokens_label_nonempty CHECK (char_length(trim(label)) > 0)
);

CREATE INDEX IF NOT EXISTS mcp_user_tokens_user_id_idx
  ON public.mcp_user_tokens (user_id)
  WHERE revoked_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS mcp_user_tokens_user_label_active_uidx
  ON public.mcp_user_tokens (user_id, lower(label))
  WHERE revoked_at IS NULL;

COMMENT ON TABLE public.mcp_user_tokens IS
  'Tokens pessoais para autenticar no planeje-mcp (Bearer). Apenas hash é persistido.';

ALTER TABLE public.mcp_user_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mcp_user_tokens_select_own ON public.mcp_user_tokens;
CREATE POLICY mcp_user_tokens_select_own ON public.mcp_user_tokens
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'superadmin'
    )
  );

-- Sem INSERT/UPDATE/DELETE diretos — só via RPCs SECURITY DEFINER

CREATE OR REPLACE FUNCTION public._assert_mcp_team_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id é obrigatório';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = p_user_id
      AND p.role IN ('superadmin', 'admin', 'colaborador')
  ) THEN
    RAISE EXCEPTION 'Apenas usuários internos da equipe podem ter token MCP';
  END IF;
END;
$$;

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

CREATE OR REPLACE FUNCTION public.generate_mcp_user_token(
  p_label text DEFAULT 'default',
  p_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

  -- Revoga token ativo com o mesmo label
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

CREATE OR REPLACE FUNCTION public.revoke_mcp_user_token(p_token_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_owner uuid;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;
  IF p_token_id IS NULL THEN
    RAISE EXCEPTION 'token_id é obrigatório';
  END IF;

  SELECT user_id INTO v_owner FROM public.mcp_user_tokens WHERE id = p_token_id;
  IF v_owner IS NULL THEN
    RETURN false;
  END IF;

  IF v_owner <> v_caller AND NOT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = v_caller AND p.role = 'superadmin'
  ) THEN
    RAISE EXCEPTION 'Sem permissão para revogar este token';
  END IF;

  UPDATE public.mcp_user_tokens
  SET revoked_at = now()
  WHERE id = p_token_id AND revoked_at IS NULL;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_mcp_user_tokens(p_user_id uuid DEFAULT NULL)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  token_prefix text,
  label text,
  created_at timestamptz,
  last_used_at timestamptz,
  revoked_at timestamptz,
  full_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_target uuid;
  v_is_super boolean;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  SELECT (p.role = 'superadmin') INTO v_is_super
  FROM public.profiles p WHERE p.id = v_caller;

  v_target := coalesce(p_user_id, v_caller);
  IF v_target <> v_caller AND NOT coalesce(v_is_super, false) THEN
    RAISE EXCEPTION 'Sem permissão para listar tokens de outro usuário';
  END IF;

  RETURN QUERY
  SELECT
    t.id,
    t.user_id,
    t.token_prefix,
    t.label,
    t.created_at,
    t.last_used_at,
    t.revoked_at,
    p.full_name
  FROM public.mcp_user_tokens t
  JOIN public.profiles p ON p.id = t.user_id
  WHERE t.user_id = v_target
  ORDER BY t.created_at DESC;
END;
$$;

-- Usado pelo planeje-mcp (service role) para validar Bearer
CREATE OR REPLACE FUNCTION public.verify_mcp_user_token(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
GRANT EXECUTE ON FUNCTION public.revoke_mcp_user_token(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_mcp_user_tokens(uuid) TO authenticated;
-- verify: service_role (e authenticated bloqueado na prática por não expor o token;
-- grant para service_role implícito; revoga de anon/authenticated se necessário)
REVOKE ALL ON FUNCTION public.verify_mcp_user_token(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.verify_mcp_user_token(text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_mcp_user_token(text) TO service_role;

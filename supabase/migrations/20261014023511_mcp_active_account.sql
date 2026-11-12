-- O token pessoal MCP só representa uma conta de equipe existente e aprovada.
CREATE OR REPLACE FUNCTION public.verify_mcp_user_token(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  IF v_profile.status IS DISTINCT FROM 'active'
     OR v_profile.role NOT IN ('superadmin', 'admin', 'colaborador')
     OR NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id=v_profile.id
         AND (u.banned_until IS NULL OR u.banned_until<now())) THEN
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
$function$;

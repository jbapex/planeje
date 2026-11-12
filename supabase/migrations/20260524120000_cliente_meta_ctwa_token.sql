-- Token Meta por cliente (Conversões CTWA) — BM do cliente, não MADS

ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS meta_ctwa_business_id text,
  ADD COLUMN IF NOT EXISTS meta_ctwa_token_updated_at timestamptz;

COMMENT ON COLUMN public.clientes.meta_ctwa_business_id IS 'ID do portfólio Meta Business do cliente (para listar WABA). Não usar BM MADS.';
COMMENT ON COLUMN public.clientes.meta_ctwa_token_updated_at IS 'Última atualização do token CTWA do cliente em app_secrets';

-- Nome do secret: META_CTWA_CLIENT_<uuid_sem_hifens>
CREATE OR REPLACE FUNCTION public.meta_ctwa_secret_name(p_cliente_id uuid)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT 'META_CTWA_CLIENT_' || replace(p_cliente_id::text, '-', '_');
$$;

CREATE OR REPLACE FUNCTION public.set_cliente_meta_ctwa_token(
  p_cliente_id uuid,
  p_token text DEFAULT NULL,
  p_business_id text DEFAULT NULL,
  p_update_token boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_secret_name text;
  v_trim_token text;
BEGIN
  IF p_cliente_id IS NULL THEN
    RAISE EXCEPTION 'cliente_id é obrigatório';
  END IF;

  v_trim_token := NULLIF(trim(COALESCE(p_token, '')), '');
  v_secret_name := public.meta_ctwa_secret_name(p_cliente_id);

  IF auth.uid() IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (
          p.role = 'superadmin'
          OR p.role IN ('admin', 'colaborador')
          OR (p.role = 'cliente' AND p.cliente_id = p_cliente_id)
        )
    ) THEN
      RAISE EXCEPTION 'Sem permissão para configurar token Meta deste cliente';
    END IF;
  END IF;

  IF p_update_token THEN
    IF v_trim_token IS NOT NULL THEN
      INSERT INTO public.app_secrets (name, secret_value)
      VALUES (v_secret_name, v_trim_token)
      ON CONFLICT (name)
      DO UPDATE SET
        secret_value = EXCLUDED.secret_value,
        updated_at = NOW();
    ELSE
      DELETE FROM public.app_secrets WHERE name = v_secret_name;
    END IF;
  END IF;

  UPDATE public.clientes
  SET
    meta_ctwa_business_id = COALESCE(NULLIF(trim(p_business_id), ''), meta_ctwa_business_id),
    meta_ctwa_token_updated_at = CASE
      WHEN p_update_token AND v_trim_token IS NOT NULL THEN NOW()
      ELSE meta_ctwa_token_updated_at
    END
  WHERE id = p_cliente_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.cliente_has_meta_ctwa_token(p_cliente_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text;
  v_exists boolean;
BEGIN
  v_name := public.meta_ctwa_secret_name(p_cliente_id);
  SELECT EXISTS (
    SELECT 1 FROM public.app_secrets s
    WHERE s.name = v_name AND length(trim(s.secret_value)) > 20
  ) INTO v_exists;
  RETURN COALESCE(v_exists, false);
END;
$$;

GRANT EXECUTE ON FUNCTION public.meta_ctwa_secret_name(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_cliente_meta_ctwa_token(uuid, text, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cliente_has_meta_ctwa_token(uuid) TO authenticated;

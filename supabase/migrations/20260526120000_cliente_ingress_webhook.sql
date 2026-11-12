-- Webhook de entrada genérico por cliente (CRMs externos, sem uazapi)

ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS ingress_webhook_secret text;

COMMENT ON COLUMN public.clientes.ingress_webhook_secret IS
  'Secret para POST em crm-ingress-webhook (um URL por cliente; opcional channel_id na query).';

COMMENT ON COLUMN public.cliente_whatsapp_config.provider IS
  'Provedor do canal: uazapi (padrão), webhook_only, meta_cloud, external';

CREATE OR REPLACE FUNCTION public._assert_cliente_ingress_access(p_cliente_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_cliente_id IS NULL THEN
    RAISE EXCEPTION 'cliente_id é obrigatório';
  END IF;
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
      RAISE EXCEPTION 'Sem permissão para configurar webhook de entrada deste cliente';
    END IF;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_cliente_ingress_webhook_secret(p_cliente_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_secret text;
BEGIN
  PERFORM public._assert_cliente_ingress_access(p_cliente_id);
  SELECT ingress_webhook_secret INTO v_secret FROM public.clientes WHERE id = p_cliente_id;
  IF v_secret IS NULL OR trim(v_secret) = '' THEN
    v_secret := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
    UPDATE public.clientes SET ingress_webhook_secret = v_secret WHERE id = p_cliente_id;
  END IF;
  RETURN v_secret;
END;
$$;

CREATE OR REPLACE FUNCTION public.regenerate_cliente_ingress_webhook_secret(p_cliente_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_secret text;
BEGIN
  PERFORM public._assert_cliente_ingress_access(p_cliente_id);
  v_secret := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  UPDATE public.clientes SET ingress_webhook_secret = v_secret WHERE id = p_cliente_id;
  RETURN v_secret;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_cliente_ingress_webhook_secret(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.regenerate_cliente_ingress_webhook_secret(uuid) TO authenticated;

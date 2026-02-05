-- =====================================================
-- MIGRATION: Configuração WhatsApp do CRM por cliente
-- Descrição: Tabela cliente_whatsapp_config (uazapi: subdomínio + token).
-- =====================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'cliente_whatsapp_config'
  ) THEN
    CREATE TABLE public.cliente_whatsapp_config (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      cliente_id uuid NOT NULL UNIQUE,
      provider text NOT NULL DEFAULT 'uazapi',
      subdomain text,
      token text,
      instance_status text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_cliente_whatsapp_config_cliente
      ON public.cliente_whatsapp_config (cliente_id);

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'clientes') THEN
      ALTER TABLE public.cliente_whatsapp_config
        ADD CONSTRAINT fk_cliente_whatsapp_config_cliente
        FOREIGN KEY (cliente_id) REFERENCES public.clientes(id) ON DELETE CASCADE;
    END IF;

    COMMENT ON TABLE public.cliente_whatsapp_config IS 'Conexão WhatsApp (uazapi) por cliente para uso no CRM';
    COMMENT ON COLUMN public.cliente_whatsapp_config.subdomain IS 'Subdomínio em https://{subdomain}.uazapi.com';
    COMMENT ON COLUMN public.cliente_whatsapp_config.token IS 'Token da instância uazapi';
    COMMENT ON COLUMN public.cliente_whatsapp_config.instance_status IS 'Estado da instância: disconnected, connecting, connected';
  END IF;
END $$;

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.cliente_whatsapp_config_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_cliente_whatsapp_config_updated_at ON public.cliente_whatsapp_config;
CREATE TRIGGER trg_cliente_whatsapp_config_updated_at
  BEFORE UPDATE ON public.cliente_whatsapp_config
  FOR EACH ROW
  EXECUTE FUNCTION public.cliente_whatsapp_config_set_updated_at();

-- RLS
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'profiles') THEN
    ALTER TABLE public.cliente_whatsapp_config ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "cliente_whatsapp_config_superadmin_all" ON public.cliente_whatsapp_config;
    CREATE POLICY "cliente_whatsapp_config_superadmin_all"
      ON public.cliente_whatsapp_config FOR ALL TO authenticated
      USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin'))
      WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin'));

    DROP POLICY IF EXISTS "cliente_whatsapp_config_cliente_own" ON public.cliente_whatsapp_config;
    CREATE POLICY "cliente_whatsapp_config_cliente_own"
      ON public.cliente_whatsapp_config FOR ALL TO authenticated
      USING (
        cliente_id IN (SELECT cliente_id FROM public.profiles WHERE id = auth.uid() AND role = 'cliente' AND cliente_id IS NOT NULL)
      )
      WITH CHECK (
        cliente_id IN (SELECT cliente_id FROM public.profiles WHERE id = auth.uid() AND role = 'cliente' AND cliente_id IS NOT NULL)
      );

    DROP POLICY IF EXISTS "cliente_whatsapp_config_admin_colaborador" ON public.cliente_whatsapp_config;
    CREATE POLICY "cliente_whatsapp_config_admin_colaborador"
      ON public.cliente_whatsapp_config FOR ALL TO authenticated
      USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'colaborador')))
      WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'colaborador')));
  END IF;
END $$;

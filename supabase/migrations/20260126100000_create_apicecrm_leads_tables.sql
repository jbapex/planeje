-- =====================================================
-- MIGRATION: Tabelas do CRM Apice (leads, cliente_settings, produtos)
-- Descrição: leads por cliente_id, configurações por cliente, produtos por cliente.
-- =====================================================

-- 1. Tabela produtos (por cliente) – opcional para product_id em leads
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'crm_produtos'
  ) THEN
    CREATE TABLE public.crm_produtos (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      cliente_id uuid NOT NULL,
      name text NOT NULL,
      code text,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_crm_produtos_cliente ON public.crm_produtos (cliente_id);
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'clientes') THEN
      ALTER TABLE public.crm_produtos
        ADD CONSTRAINT fk_crm_produtos_cliente
        FOREIGN KEY (cliente_id) REFERENCES public.clientes(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

-- 2. Tabela leads (por cliente_id, schema alinhado ao apicecrm)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'leads'
  ) THEN
    CREATE TABLE public.leads (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      cliente_id uuid NOT NULL,

      nome text NOT NULL,
      whatsapp text,
      email text,

      origem text,
      sub_origem text,

      data_entrada date NOT NULL DEFAULT (current_date),
      agendamento timestamptz,
      status text NOT NULL,
      vendedor text,
      valor numeric(14,2) DEFAULT 0,
      observacoes text,

      product_id uuid,
      custom_date_field date,
      profile_pic_url text,

      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_leads_cliente_id ON public.leads (cliente_id);
    CREATE INDEX IF NOT EXISTS idx_leads_cliente_status ON public.leads (cliente_id, status);
    CREATE INDEX IF NOT EXISTS idx_leads_cliente_data_entrada ON public.leads (cliente_id, data_entrada DESC);
    CREATE INDEX IF NOT EXISTS idx_leads_created_at ON public.leads (created_at DESC);

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'clientes') THEN
      ALTER TABLE public.leads
        ADD CONSTRAINT fk_leads_cliente
        FOREIGN KEY (cliente_id) REFERENCES public.clientes(id) ON DELETE CASCADE;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'crm_produtos') THEN
      ALTER TABLE public.leads
        ADD CONSTRAINT fk_leads_product
        FOREIGN KEY (product_id) REFERENCES public.crm_produtos(id) ON DELETE SET NULL;
    END IF;
  END IF;
END $$;

-- Trigger updated_at em leads
CREATE OR REPLACE FUNCTION public.leads_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_leads_set_updated_at ON public.leads;
CREATE TRIGGER trg_leads_set_updated_at
  BEFORE UPDATE ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.leads_set_updated_at();

-- 3. Tabela cliente_settings (configurações de CRM por cliente: statuses, origins, sellers)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'cliente_crm_settings'
  ) THEN
    CREATE TABLE public.cliente_crm_settings (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      cliente_id uuid NOT NULL UNIQUE,

      name text DEFAULT 'Configuração CRM',
      statuses jsonb DEFAULT '[{"name":"agendado","color":"#3b82f6"},{"name":"compareceu","color":"#f97316"},{"name":"vendeu","color":"#22c55e"},{"name":"nao_compareceu","color":"#ef4444"}]'::jsonb,
      origins text[] DEFAULT ARRAY['instagram','facebook','whatsapp','indicacao','site'],
      sub_origins jsonb DEFAULT '{"instagram":["feed","stories","reels"],"facebook":["feed","stories"],"whatsapp":[],"indicacao":[],"site":[]}'::jsonb,
      sellers text[] DEFAULT ARRAY['Vendedor 1','Vendedor 2'],
      noshow_status text DEFAULT 'nao_compareceu',
      custom_fields_settings jsonb DEFAULT '{"date_field":{"is_active":true,"label":"Data de Venda"}}'::jsonb,

      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_cliente_crm_settings_cliente ON public.cliente_crm_settings (cliente_id);
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'clientes') THEN
      ALTER TABLE public.cliente_crm_settings
        ADD CONSTRAINT fk_cliente_crm_settings_cliente
        FOREIGN KEY (cliente_id) REFERENCES public.clientes(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.cliente_crm_settings_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_cliente_crm_settings_updated_at ON public.cliente_crm_settings;
CREATE TRIGGER trg_cliente_crm_settings_updated_at
  BEFORE UPDATE ON public.cliente_crm_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.cliente_crm_settings_set_updated_at();

-- 4. RLS leads
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'profiles') THEN
    ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "leads_superadmin_all" ON public.leads;
    CREATE POLICY "leads_superadmin_all"
      ON public.leads FOR ALL TO authenticated
      USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin'))
      WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin'));

    DROP POLICY IF EXISTS "leads_cliente_own" ON public.leads;
    CREATE POLICY "leads_cliente_own"
      ON public.leads FOR ALL TO authenticated
      USING (
        cliente_id IN (SELECT cliente_id FROM public.profiles WHERE id = auth.uid() AND role = 'cliente' AND cliente_id IS NOT NULL)
      )
      WITH CHECK (
        cliente_id IN (SELECT cliente_id FROM public.profiles WHERE id = auth.uid() AND role = 'cliente' AND cliente_id IS NOT NULL)
      );

    -- admin/colaborador: ver leads do cliente que estão visualizando (via client-area)
    DROP POLICY IF EXISTS "leads_admin_colaborador" ON public.leads;
    CREATE POLICY "leads_admin_colaborador"
      ON public.leads FOR ALL TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid() AND p.role IN ('admin','colaborador')
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid() AND p.role IN ('admin','colaborador')
        )
      );
  END IF;
END $$;

-- 5. RLS crm_produtos
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'profiles') THEN
    ALTER TABLE public.crm_produtos ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "crm_produtos_superadmin_all" ON public.crm_produtos;
    CREATE POLICY "crm_produtos_superadmin_all"
      ON public.crm_produtos FOR ALL TO authenticated
      USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin'))
      WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin'));
    DROP POLICY IF EXISTS "crm_produtos_cliente_own" ON public.crm_produtos;
    CREATE POLICY "crm_produtos_cliente_own"
      ON public.crm_produtos FOR ALL TO authenticated
      USING (cliente_id IN (SELECT cliente_id FROM public.profiles WHERE id = auth.uid() AND role = 'cliente' AND cliente_id IS NOT NULL))
      WITH CHECK (cliente_id IN (SELECT cliente_id FROM public.profiles WHERE id = auth.uid() AND role = 'cliente' AND cliente_id IS NOT NULL));
    DROP POLICY IF EXISTS "crm_produtos_admin_colaborador" ON public.crm_produtos;
    CREATE POLICY "crm_produtos_admin_colaborador"
      ON public.crm_produtos FOR ALL TO authenticated
      USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','colaborador')))
      WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','colaborador')));
  END IF;
END $$;

-- 6. RLS cliente_crm_settings
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'profiles') THEN
    ALTER TABLE public.cliente_crm_settings ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "cliente_crm_settings_superadmin_all" ON public.cliente_crm_settings;
    CREATE POLICY "cliente_crm_settings_superadmin_all"
      ON public.cliente_crm_settings FOR ALL TO authenticated
      USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin'))
      WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin'));
    DROP POLICY IF EXISTS "cliente_crm_settings_cliente_own" ON public.cliente_crm_settings;
    CREATE POLICY "cliente_crm_settings_cliente_own"
      ON public.cliente_crm_settings FOR ALL TO authenticated
      USING (cliente_id IN (SELECT cliente_id FROM public.profiles WHERE id = auth.uid() AND role = 'cliente' AND cliente_id IS NOT NULL))
      WITH CHECK (cliente_id IN (SELECT cliente_id FROM public.profiles WHERE id = auth.uid() AND role = 'cliente' AND cliente_id IS NOT NULL));
    DROP POLICY IF EXISTS "cliente_crm_settings_admin_colaborador" ON public.cliente_crm_settings;
    CREATE POLICY "cliente_crm_settings_admin_colaborador"
      ON public.cliente_crm_settings FOR ALL TO authenticated
      USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','colaborador')))
      WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','colaborador')));
  END IF;
END $$;

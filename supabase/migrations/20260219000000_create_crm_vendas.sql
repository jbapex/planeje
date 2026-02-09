-- =====================================================
-- MIGRATION: Vendas vinculadas ao lead (e itens da venda)
-- Descrição: crm_vendas (uma venda por lead) e crm_venda_itens (múltiplos itens por venda).
--            Permite registrar o que o cliente comprou e múltiplas compras por lead.
-- =====================================================

-- 1. Tabela crm_vendas
CREATE TABLE IF NOT EXISTS public.crm_vendas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL,
  cliente_id uuid NOT NULL,
  data_venda date NOT NULL DEFAULT (current_date),
  valor_total numeric(14,2) NOT NULL DEFAULT 0,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_vendas_lead ON public.crm_vendas (lead_id);
CREATE INDEX IF NOT EXISTS idx_crm_vendas_cliente ON public.crm_vendas (cliente_id);
CREATE INDEX IF NOT EXISTS idx_crm_vendas_data ON public.crm_vendas (data_venda DESC);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'leads') THEN
    ALTER TABLE public.crm_vendas DROP CONSTRAINT IF EXISTS fk_crm_vendas_lead;
    ALTER TABLE public.crm_vendas ADD CONSTRAINT fk_crm_vendas_lead
      FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'clientes') THEN
    ALTER TABLE public.crm_vendas DROP CONSTRAINT IF EXISTS fk_crm_vendas_cliente;
    ALTER TABLE public.crm_vendas ADD CONSTRAINT fk_crm_vendas_cliente
      FOREIGN KEY (cliente_id) REFERENCES public.clientes(id) ON DELETE CASCADE;
  END IF;
END $$;

COMMENT ON TABLE public.crm_vendas IS 'Vendas registradas por lead; um lead pode ter várias vendas (cliente recorrente).';
COMMENT ON COLUMN public.crm_vendas.data_venda IS 'Data da venda';
COMMENT ON COLUMN public.crm_vendas.valor_total IS 'Valor total da venda (soma dos itens ou informado manualmente)';

-- 2. Tabela crm_venda_itens
CREATE TABLE IF NOT EXISTS public.crm_venda_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venda_id uuid NOT NULL,
  product_id uuid,
  descricao text,
  quantidade integer NOT NULL DEFAULT 1,
  valor_unitario numeric(14,2) NOT NULL DEFAULT 0,
  valor_total numeric(14,2) NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_crm_venda_itens_venda ON public.crm_venda_itens (venda_id);

DO $$
BEGIN
  ALTER TABLE public.crm_venda_itens DROP CONSTRAINT IF EXISTS fk_crm_venda_itens_venda;
  ALTER TABLE public.crm_venda_itens ADD CONSTRAINT fk_crm_venda_itens_venda
    FOREIGN KEY (venda_id) REFERENCES public.crm_vendas(id) ON DELETE CASCADE;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'crm_produtos') THEN
    ALTER TABLE public.crm_venda_itens DROP CONSTRAINT IF EXISTS fk_crm_venda_itens_product;
    ALTER TABLE public.crm_venda_itens ADD CONSTRAINT fk_crm_venda_itens_product
      FOREIGN KEY (product_id) REFERENCES public.crm_produtos(id) ON DELETE SET NULL;
  END IF;
END $$;

COMMENT ON TABLE public.crm_venda_itens IS 'Itens de cada venda; produto cadastrado (product_id) ou descrição livre.';
COMMENT ON COLUMN public.crm_venda_itens.descricao IS 'Nome do item quando não usa produto cadastrado (ex: Outro - Areia m³)';

-- 3. Trigger updated_at em crm_vendas
CREATE OR REPLACE FUNCTION public.crm_vendas_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_crm_vendas_set_updated_at ON public.crm_vendas;
CREATE TRIGGER trg_crm_vendas_set_updated_at
  BEFORE UPDATE ON public.crm_vendas
  FOR EACH ROW EXECUTE FUNCTION public.crm_vendas_set_updated_at();

-- 4. RLS crm_vendas (mesmo critério dos leads: cliente vê só seu cliente_id)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'profiles') THEN
    ALTER TABLE public.crm_vendas ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "crm_vendas_superadmin_all" ON public.crm_vendas;
    CREATE POLICY "crm_vendas_superadmin_all"
      ON public.crm_vendas FOR ALL TO authenticated
      USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin'))
      WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin'));

    DROP POLICY IF EXISTS "crm_vendas_cliente_own" ON public.crm_vendas;
    CREATE POLICY "crm_vendas_cliente_own"
      ON public.crm_vendas FOR ALL TO authenticated
      USING (cliente_id IN (SELECT cliente_id FROM public.profiles WHERE id = auth.uid() AND role = 'cliente' AND cliente_id IS NOT NULL))
      WITH CHECK (cliente_id IN (SELECT cliente_id FROM public.profiles WHERE id = auth.uid() AND role = 'cliente' AND cliente_id IS NOT NULL));

    DROP POLICY IF EXISTS "crm_vendas_admin_colaborador" ON public.crm_vendas;
    CREATE POLICY "crm_vendas_admin_colaborador"
      ON public.crm_vendas FOR ALL TO authenticated
      USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','colaborador')))
      WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','colaborador')));
  END IF;
END $$;

-- 5. RLS crm_venda_itens (via venda -> cliente_id)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'profiles') THEN
    ALTER TABLE public.crm_venda_itens ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "crm_venda_itens_superadmin_all" ON public.crm_venda_itens;
    CREATE POLICY "crm_venda_itens_superadmin_all"
      ON public.crm_venda_itens FOR ALL TO authenticated
      USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin'))
      WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin'));

    DROP POLICY IF EXISTS "crm_venda_itens_via_venda" ON public.crm_venda_itens;
    CREATE POLICY "crm_venda_itens_via_venda"
      ON public.crm_venda_itens FOR ALL TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.crm_vendas v
          WHERE v.id = venda_id
          AND (
            v.cliente_id IN (SELECT cliente_id FROM public.profiles WHERE id = auth.uid() AND role = 'cliente' AND cliente_id IS NOT NULL)
            OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('superadmin','admin','colaborador'))
          )
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.crm_vendas v
          WHERE v.id = venda_id
          AND (
            v.cliente_id IN (SELECT cliente_id FROM public.profiles WHERE id = auth.uid() AND role = 'cliente' AND cliente_id IS NOT NULL)
            OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('superadmin','admin','colaborador'))
          )
        )
      );
  END IF;
END $$;

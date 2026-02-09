-- =====================================================
-- Serviços no CRM e tipo de item (produto vs serviço) na venda
-- Permite cadastrar serviços (mecânica, odontologia, etc.) e registrar vendas como produto ou serviço.
-- =====================================================

-- 1. Tabela crm_servicos (catálogo de serviços por cliente, espelho de crm_produtos)
CREATE TABLE IF NOT EXISTS public.crm_servicos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL,
  name text NOT NULL,
  code text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_servicos_cliente ON public.crm_servicos (cliente_id);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'clientes') THEN
    ALTER TABLE public.crm_servicos DROP CONSTRAINT IF EXISTS fk_crm_servicos_cliente;
    ALTER TABLE public.crm_servicos ADD CONSTRAINT fk_crm_servicos_cliente
      FOREIGN KEY (cliente_id) REFERENCES public.clientes(id) ON DELETE CASCADE;
  END IF;
END $$;

COMMENT ON TABLE public.crm_servicos IS 'Catálogo de serviços por cliente (ex.: mecânica, odontologia); usado em itens de venda.';

-- 2. crm_venda_itens: tipo do item e referência a serviço
ALTER TABLE public.crm_venda_itens
  ADD COLUMN IF NOT EXISTS item_tipo text NOT NULL DEFAULT 'produto';

ALTER TABLE public.crm_venda_itens
  DROP CONSTRAINT IF EXISTS ck_crm_venda_itens_item_tipo;

ALTER TABLE public.crm_venda_itens
  ADD CONSTRAINT ck_crm_venda_itens_item_tipo CHECK (item_tipo IN ('produto', 'serviço'));

ALTER TABLE public.crm_venda_itens
  ADD COLUMN IF NOT EXISTS service_id uuid NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'crm_servicos') THEN
    ALTER TABLE public.crm_venda_itens DROP CONSTRAINT IF EXISTS fk_crm_venda_itens_service;
    ALTER TABLE public.crm_venda_itens ADD CONSTRAINT fk_crm_venda_itens_service
      FOREIGN KEY (service_id) REFERENCES public.crm_servicos(id) ON DELETE SET NULL;
  END IF;
END $$;

COMMENT ON COLUMN public.crm_venda_itens.item_tipo IS 'produto = item é produto (product_id ou descrição); serviço = item é serviço (service_id ou descrição).';
COMMENT ON COLUMN public.crm_venda_itens.service_id IS 'Serviço cadastrado do catálogo; null quando descrição livre (Outro).';

-- 3. RLS crm_servicos (mesmo critério de crm_produtos)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'profiles') THEN
    ALTER TABLE public.crm_servicos ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "crm_servicos_superadmin_all" ON public.crm_servicos;
    CREATE POLICY "crm_servicos_superadmin_all"
      ON public.crm_servicos FOR ALL TO authenticated
      USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin'))
      WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin'));

    DROP POLICY IF EXISTS "crm_servicos_cliente_own" ON public.crm_servicos;
    CREATE POLICY "crm_servicos_cliente_own"
      ON public.crm_servicos FOR ALL TO authenticated
      USING (cliente_id IN (SELECT cliente_id FROM public.profiles WHERE id = auth.uid() AND role = 'cliente' AND cliente_id IS NOT NULL))
      WITH CHECK (cliente_id IN (SELECT cliente_id FROM public.profiles WHERE id = auth.uid() AND role = 'cliente' AND cliente_id IS NOT NULL));

    DROP POLICY IF EXISTS "crm_servicos_admin_colaborador" ON public.crm_servicos;
    CREATE POLICY "crm_servicos_admin_colaborador"
      ON public.crm_servicos FOR ALL TO authenticated
      USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','colaborador')))
      WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','colaborador')));
  END IF;
END $$;

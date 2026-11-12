-- Configuração do Mini CRM por cliente: status, colunas e vendedores.
-- Não altera qualificado/comprou e não dispara CAPI.

CREATE TABLE IF NOT EXISTS public.mini_crm_config (
  cliente_id uuid PRIMARY KEY REFERENCES public.clientes(id) ON DELETE CASCADE,
  statuses jsonb NOT NULL DEFAULT '[]'::jsonb,
  columns jsonb NOT NULL DEFAULT '[]'::jsonb,
  sellers jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.mini_crm_config IS
  'Status, colunas e vendedores do Mini CRM da loja. O preenchimento continua em cliente_whatsapp_contact.mini_crm.';

ALTER TABLE public.mini_crm_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mini_crm_config_superadmin_all" ON public.mini_crm_config;
CREATE POLICY "mini_crm_config_superadmin_all"
  ON public.mini_crm_config FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin'));

DROP POLICY IF EXISTS "mini_crm_config_cliente_own" ON public.mini_crm_config;
CREATE POLICY "mini_crm_config_cliente_own"
  ON public.mini_crm_config FOR ALL TO authenticated
  USING (
    cliente_id IN (SELECT cliente_id FROM public.profiles WHERE id = auth.uid() AND role = 'cliente' AND cliente_id IS NOT NULL)
  )
  WITH CHECK (
    cliente_id IN (SELECT cliente_id FROM public.profiles WHERE id = auth.uid() AND role = 'cliente' AND cliente_id IS NOT NULL)
  );

DROP POLICY IF EXISTS "mini_crm_config_admin_colaborador" ON public.mini_crm_config;
CREATE POLICY "mini_crm_config_admin_colaborador"
  ON public.mini_crm_config FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'colaborador')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'colaborador')));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mini_crm_config TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mini_crm_config TO service_role;

-- Encaminhar eventos do webhook (Canais) do Planeje para o Webhook Genérico do CRM-Apice (Integrações).
-- Assim os eventos aparecem no CRM-Apice e podem ir para a Caixa de Entrada.
CREATE TABLE IF NOT EXISTS public.cliente_crm_apice_forward (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL,
  webhook_url text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cliente_id)
);

CREATE INDEX IF NOT EXISTS idx_cliente_crm_apice_forward_cliente_enabled
  ON public.cliente_crm_apice_forward (cliente_id) WHERE enabled = true;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'clientes')
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_cliente_crm_apice_forward_cliente') THEN
    ALTER TABLE public.cliente_crm_apice_forward
      ADD CONSTRAINT fk_cliente_crm_apice_forward_cliente
      FOREIGN KEY (cliente_id) REFERENCES public.clientes(id) ON DELETE CASCADE;
  END IF;
END $$;

COMMENT ON TABLE public.cliente_crm_apice_forward IS 'URL do Webhook Genérico do CRM-Apice para encaminhar eventos da aba Canais (cliente_whatsapp_webhook_log) para a Caixa de Entrada do CRM-Apice.';

ALTER TABLE public.cliente_crm_apice_forward ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cliente_crm_apice_forward_superadmin_all" ON public.cliente_crm_apice_forward;
CREATE POLICY "cliente_crm_apice_forward_superadmin_all"
  ON public.cliente_crm_apice_forward FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin'));

DROP POLICY IF EXISTS "cliente_crm_apice_forward_cliente_own" ON public.cliente_crm_apice_forward;
CREATE POLICY "cliente_crm_apice_forward_cliente_own"
  ON public.cliente_crm_apice_forward FOR ALL TO authenticated
  USING (
    cliente_id IN (SELECT cliente_id FROM public.profiles WHERE id = auth.uid() AND role = 'cliente' AND cliente_id IS NOT NULL)
  )
  WITH CHECK (
    cliente_id IN (SELECT cliente_id FROM public.profiles WHERE id = auth.uid() AND role = 'cliente' AND cliente_id IS NOT NULL)
  );

DROP POLICY IF EXISTS "cliente_crm_apice_forward_admin_colaborador" ON public.cliente_crm_apice_forward;
CREATE POLICY "cliente_crm_apice_forward_admin_colaborador"
  ON public.cliente_crm_apice_forward FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'colaborador')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'colaborador')));

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION public.set_cliente_crm_apice_forward_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cliente_crm_apice_forward_updated_at ON public.cliente_crm_apice_forward;
CREATE TRIGGER trg_cliente_crm_apice_forward_updated_at
  BEFORE UPDATE ON public.cliente_crm_apice_forward
  FOR EACH ROW EXECUTE FUNCTION public.set_cliente_crm_apice_forward_updated_at();

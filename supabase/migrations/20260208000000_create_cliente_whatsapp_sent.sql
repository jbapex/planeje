-- =====================================================
-- Mensagens enviadas pelo CRM via uazapi (envio de texto)
-- Thread WhatsApp: união inbox (recebidas) + sent (enviadas)
-- =====================================================

CREATE TABLE IF NOT EXISTS public.cliente_whatsapp_sent (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL,
  to_jid text NOT NULL,
  message_id text,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cliente_whatsapp_sent_cliente
  ON public.cliente_whatsapp_sent (cliente_id);
CREATE INDEX IF NOT EXISTS idx_cliente_whatsapp_sent_to_jid
  ON public.cliente_whatsapp_sent (cliente_id, to_jid);
CREATE INDEX IF NOT EXISTS idx_cliente_whatsapp_sent_created
  ON public.cliente_whatsapp_sent (cliente_id, created_at DESC);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'clientes') THEN
    ALTER TABLE public.cliente_whatsapp_sent
      ADD CONSTRAINT fk_cliente_whatsapp_sent_cliente
      FOREIGN KEY (cliente_id) REFERENCES public.clientes(id) ON DELETE CASCADE;
  END IF;
END $$;

COMMENT ON TABLE public.cliente_whatsapp_sent IS 'Mensagens enviadas pelo CRM via uazapi para exibição na thread tipo WhatsApp';

-- RLS (alinhado a cliente_whatsapp_inbox)
ALTER TABLE public.cliente_whatsapp_sent ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cliente_whatsapp_sent_superadmin_all" ON public.cliente_whatsapp_sent;
CREATE POLICY "cliente_whatsapp_sent_superadmin_all"
  ON public.cliente_whatsapp_sent FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin'));

DROP POLICY IF EXISTS "cliente_whatsapp_sent_cliente_own" ON public.cliente_whatsapp_sent;
CREATE POLICY "cliente_whatsapp_sent_cliente_own"
  ON public.cliente_whatsapp_sent FOR ALL TO authenticated
  USING (
    cliente_id IN (SELECT cliente_id FROM public.profiles WHERE id = auth.uid() AND role = 'cliente' AND cliente_id IS NOT NULL)
  )
  WITH CHECK (
    cliente_id IN (SELECT cliente_id FROM public.profiles WHERE id = auth.uid() AND role = 'cliente' AND cliente_id IS NOT NULL)
  );

DROP POLICY IF EXISTS "cliente_whatsapp_sent_admin_colaborador" ON public.cliente_whatsapp_sent;
CREATE POLICY "cliente_whatsapp_sent_admin_colaborador"
  ON public.cliente_whatsapp_sent FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'colaborador')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'colaborador')));

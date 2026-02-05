-- =====================================================
-- Mensagens recebidas no WhatsApp (uazapi) por cliente
-- Para Caixa de entrada: SSE grava aqui; lista lê daqui.
-- =====================================================

CREATE TABLE IF NOT EXISTS public.cliente_whatsapp_inbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL,
  message_id text NOT NULL,
  from_jid text NOT NULL,
  sender_name text,
  msg_timestamp timestamptz,
  type text,
  body text,
  is_group boolean NOT NULL DEFAULT false,
  group_name text,
  raw_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cliente_id, message_id)
);

CREATE INDEX IF NOT EXISTS idx_cliente_whatsapp_inbox_cliente
  ON public.cliente_whatsapp_inbox (cliente_id);
CREATE INDEX IF NOT EXISTS idx_cliente_whatsapp_inbox_from_jid
  ON public.cliente_whatsapp_inbox (cliente_id, from_jid);
CREATE INDEX IF NOT EXISTS idx_cliente_whatsapp_inbox_created
  ON public.cliente_whatsapp_inbox (cliente_id, created_at DESC);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'clientes') THEN
    ALTER TABLE public.cliente_whatsapp_inbox
      ADD CONSTRAINT fk_cliente_whatsapp_inbox_cliente
      FOREIGN KEY (cliente_id) REFERENCES public.clientes(id) ON DELETE CASCADE;
  END IF;
END $$;

COMMENT ON TABLE public.cliente_whatsapp_inbox IS 'Mensagens recebidas no WhatsApp (uazapi) para Caixa de entrada do CRM';

-- RLS
ALTER TABLE public.cliente_whatsapp_inbox ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cliente_whatsapp_inbox_superadmin_all" ON public.cliente_whatsapp_inbox;
CREATE POLICY "cliente_whatsapp_inbox_superadmin_all"
  ON public.cliente_whatsapp_inbox FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin'));

DROP POLICY IF EXISTS "cliente_whatsapp_inbox_cliente_own" ON public.cliente_whatsapp_inbox;
CREATE POLICY "cliente_whatsapp_inbox_cliente_own"
  ON public.cliente_whatsapp_inbox FOR ALL TO authenticated
  USING (
    cliente_id IN (SELECT cliente_id FROM public.profiles WHERE id = auth.uid() AND role = 'cliente' AND cliente_id IS NOT NULL)
  )
  WITH CHECK (
    cliente_id IN (SELECT cliente_id FROM public.profiles WHERE id = auth.uid() AND role = 'cliente' AND cliente_id IS NOT NULL)
  );

DROP POLICY IF EXISTS "cliente_whatsapp_inbox_admin_colaborador" ON public.cliente_whatsapp_inbox;
CREATE POLICY "cliente_whatsapp_inbox_admin_colaborador"
  ON public.cliente_whatsapp_inbox FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'colaborador')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'colaborador')));

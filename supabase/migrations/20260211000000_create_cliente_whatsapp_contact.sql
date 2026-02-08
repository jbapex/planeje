-- =====================================================
-- Contatos WhatsApp por cliente: origem (Meta Ads, não identificado)
-- Atualizado a cada mensagem recebida no webhook; usado na página Contatos.
-- =====================================================

CREATE TABLE IF NOT EXISTS public.cliente_whatsapp_contact (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL,
  from_jid text NOT NULL,
  phone text,
  sender_name text,
  origin_source text NOT NULL DEFAULT 'nao_identificado',
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  tracking_data jsonb,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_message_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cliente_id, from_jid)
);

CREATE INDEX IF NOT EXISTS idx_cliente_whatsapp_contact_cliente
  ON public.cliente_whatsapp_contact (cliente_id);
CREATE INDEX IF NOT EXISTS idx_cliente_whatsapp_contact_origin
  ON public.cliente_whatsapp_contact (cliente_id, origin_source);
CREATE INDEX IF NOT EXISTS idx_cliente_whatsapp_contact_last_message
  ON public.cliente_whatsapp_contact (cliente_id, last_message_at DESC);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'clientes') THEN
    ALTER TABLE public.cliente_whatsapp_contact
      ADD CONSTRAINT fk_cliente_whatsapp_contact_cliente
      FOREIGN KEY (cliente_id) REFERENCES public.clientes(id) ON DELETE CASCADE;
  END IF;
END $$;

COMMENT ON TABLE public.cliente_whatsapp_contact IS 'Contatos que enviaram mensagem via WhatsApp; origem = meta_ads (rastreio Meta/Facebook) ou nao_identificado';
COMMENT ON COLUMN public.cliente_whatsapp_contact.origin_source IS 'meta_ads = veio de Meta Ads/Facebook; nao_identificado = sem rastreio identificado';
COMMENT ON COLUMN public.cliente_whatsapp_contact.tracking_data IS 'Dados brutos de rastreio (fbclid, source_id, etc.) quando disponíveis';

-- RLS
ALTER TABLE public.cliente_whatsapp_contact ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cliente_whatsapp_contact_superadmin_all" ON public.cliente_whatsapp_contact;
CREATE POLICY "cliente_whatsapp_contact_superadmin_all"
  ON public.cliente_whatsapp_contact FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin'));

DROP POLICY IF EXISTS "cliente_whatsapp_contact_cliente_own" ON public.cliente_whatsapp_contact;
CREATE POLICY "cliente_whatsapp_contact_cliente_own"
  ON public.cliente_whatsapp_contact FOR ALL TO authenticated
  USING (
    cliente_id IN (SELECT cliente_id FROM public.profiles WHERE id = auth.uid() AND role = 'cliente' AND cliente_id IS NOT NULL)
  )
  WITH CHECK (
    cliente_id IN (SELECT cliente_id FROM public.profiles WHERE id = auth.uid() AND role = 'cliente' AND cliente_id IS NOT NULL)
  );

DROP POLICY IF EXISTS "cliente_whatsapp_contact_admin_colaborador" ON public.cliente_whatsapp_contact;
CREATE POLICY "cliente_whatsapp_contact_admin_colaborador"
  ON public.cliente_whatsapp_contact FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'colaborador')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'colaborador')));

-- Log em tempo real do que o webhook recebe (exibido na aba Canais, abaixo da URL)
CREATE TABLE IF NOT EXISTS public.cliente_whatsapp_webhook_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'ok',
  from_jid text,
  type text,
  body_preview text,
  body_keys jsonb,
  error_message text
);

CREATE INDEX IF NOT EXISTS idx_cliente_whatsapp_webhook_log_cliente_created
  ON public.cliente_whatsapp_webhook_log (cliente_id, created_at DESC);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'clientes')
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_cliente_whatsapp_webhook_log_cliente') THEN
    ALTER TABLE public.cliente_whatsapp_webhook_log
      ADD CONSTRAINT fk_cliente_whatsapp_webhook_log_cliente
      FOREIGN KEY (cliente_id) REFERENCES public.clientes(id) ON DELETE CASCADE;
  END IF;
END $$;

COMMENT ON TABLE public.cliente_whatsapp_webhook_log IS 'Log em tempo real das requisições recebidas no webhook uazapi (aba Canais)';

-- RLS (mesmo padrão da inbox)
ALTER TABLE public.cliente_whatsapp_webhook_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cliente_whatsapp_webhook_log_superadmin_all" ON public.cliente_whatsapp_webhook_log;
CREATE POLICY "cliente_whatsapp_webhook_log_superadmin_all"
  ON public.cliente_whatsapp_webhook_log FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin'));

DROP POLICY IF EXISTS "cliente_whatsapp_webhook_log_cliente_own" ON public.cliente_whatsapp_webhook_log;
CREATE POLICY "cliente_whatsapp_webhook_log_cliente_own"
  ON public.cliente_whatsapp_webhook_log FOR ALL TO authenticated
  USING (
    cliente_id IN (SELECT cliente_id FROM public.profiles WHERE id = auth.uid() AND role = 'cliente' AND cliente_id IS NOT NULL)
  )
  WITH CHECK (
    cliente_id IN (SELECT cliente_id FROM public.profiles WHERE id = auth.uid() AND role = 'cliente' AND cliente_id IS NOT NULL)
  );

DROP POLICY IF EXISTS "cliente_whatsapp_webhook_log_admin_colaborador" ON public.cliente_whatsapp_webhook_log;
CREATE POLICY "cliente_whatsapp_webhook_log_admin_colaborador"
  ON public.cliente_whatsapp_webhook_log FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'colaborador')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'colaborador')));

-- Realtime: permitir que o cliente veja novos logs em tempo real
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'cliente_whatsapp_webhook_log') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.cliente_whatsapp_webhook_log;
  END IF;
END $$;

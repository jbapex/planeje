-- Habilita Supabase Realtime para mensagens recebidas e enviadas (módulo Conversas)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'cliente_whatsapp_inbox'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.cliente_whatsapp_inbox;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'cliente_whatsapp_sent'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.cliente_whatsapp_sent;
  END IF;
END $$;

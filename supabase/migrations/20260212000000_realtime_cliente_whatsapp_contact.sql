-- Habilitar Realtime na tabela cliente_whatsapp_contact para a página Contatos atualizar em tempo real
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'cliente_whatsapp_contact'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.cliente_whatsapp_contact;
  END IF;
END $$;

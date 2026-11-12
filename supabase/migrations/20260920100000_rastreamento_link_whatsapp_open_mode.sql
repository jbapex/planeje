-- Modo de abertura do WhatsApp no link rastreável (estilo CQC).
ALTER TABLE public.cliente_rastreamento_links
  ADD COLUMN IF NOT EXISTS whatsapp_open_mode text NOT NULL DEFAULT 'auto';

DO $$
BEGIN
  ALTER TABLE public.cliente_rastreamento_links
    DROP CONSTRAINT IF EXISTS cliente_rastreamento_links_open_mode_check;
  ALTER TABLE public.cliente_rastreamento_links
    ADD CONSTRAINT cliente_rastreamento_links_open_mode_check
    CHECK (whatsapp_open_mode IN ('auto', 'app', 'web'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON COLUMN public.cliente_rastreamento_links.whatsapp_open_mode IS
  'auto=wa.me (detecta), app=whatsapp://, web=web.whatsapp.com';

-- Origem do evento: uazapi ou apicebot (para filtrar e exibir no log)
ALTER TABLE public.cliente_whatsapp_webhook_log
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'uazapi';

COMMENT ON COLUMN public.cliente_whatsapp_webhook_log.source IS 'Origem do webhook: uazapi ou apicebot';

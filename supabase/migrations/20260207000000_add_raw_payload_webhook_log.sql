-- Corpo completo recebido pelo webhook (para exibir na UI)
ALTER TABLE public.cliente_whatsapp_webhook_log
  ADD COLUMN IF NOT EXISTS raw_payload jsonb;

COMMENT ON COLUMN public.cliente_whatsapp_webhook_log.raw_payload IS 'Body JSON completo recebido no POST do webhook (uazapi)';

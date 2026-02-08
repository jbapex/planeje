-- API Apicebot: URL do endpoint e Bearer token para envio de mensagens (container API na página Integração Apicebot)
ALTER TABLE public.cliente_whatsapp_config
  ADD COLUMN IF NOT EXISTS apicebot_api_url text,
  ADD COLUMN IF NOT EXISTS apicebot_token text;

COMMENT ON COLUMN public.cliente_whatsapp_config.apicebot_api_url IS 'URL do endpoint Apicebot para envio de mensagens (API)';
COMMENT ON COLUMN public.cliente_whatsapp_config.apicebot_token IS 'Bearer token para autenticar envio via API Apicebot';

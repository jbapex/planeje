-- Adiciona webhook_secret para validar POST da uazapi na Edge Function
ALTER TABLE public.cliente_whatsapp_config
  ADD COLUMN IF NOT EXISTS webhook_secret text;

COMMENT ON COLUMN public.cliente_whatsapp_config.webhook_secret IS 'Secret para validar webhook uazapi (Caixa de entrada). Gere na aba Canais.';

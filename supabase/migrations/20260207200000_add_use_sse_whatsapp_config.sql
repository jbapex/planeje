-- Opção de usar SSE (Server-Sent Events) além do webhook para receber mensagens na Caixa de entrada
ALTER TABLE public.cliente_whatsapp_config
  ADD COLUMN IF NOT EXISTS use_sse boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.cliente_whatsapp_config.use_sse IS 'Quando true, o front conecta ao SSE da uazapi para receber mensagens em tempo real (além do webhook)';

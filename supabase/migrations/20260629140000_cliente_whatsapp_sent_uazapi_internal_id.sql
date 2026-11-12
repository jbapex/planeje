-- ID interno uazapi (rXXXX) para correlacionar messages_update com mensagens enviadas
ALTER TABLE public.cliente_whatsapp_sent
  ADD COLUMN IF NOT EXISTS uazapi_internal_id text;

CREATE INDEX IF NOT EXISTS idx_cliente_whatsapp_sent_uazapi_internal_id
  ON public.cliente_whatsapp_sent (cliente_id, uazapi_internal_id)
  WHERE uazapi_internal_id IS NOT NULL;

-- Status de entrega/leitura das mensagens enviadas (risquinhos estilo WhatsApp)
ALTER TABLE public.cliente_whatsapp_sent
  ADD COLUMN IF NOT EXISTS ack_status text NOT NULL DEFAULT 'sent';

COMMENT ON COLUMN public.cliente_whatsapp_sent.ack_status IS
  'sent = 1 risquinho, delivered = 2 risquinhos, read = 2 risquinhos azul';

UPDATE public.cliente_whatsapp_sent
SET ack_status = 'sent'
WHERE ack_status IS NULL OR ack_status = '';

CREATE INDEX IF NOT EXISTS idx_cliente_whatsapp_sent_message_id
  ON public.cliente_whatsapp_sent (cliente_id, message_id);

-- Cronômetro de tempo sem resposta: inicia em msg externa, para ao responder ou encerrar.

ALTER TABLE public.atendimento_conversas
  ADD COLUMN IF NOT EXISTS awaiting_response_since timestamptz;

COMMENT ON COLUMN public.atendimento_conversas.awaiting_response_since IS
  'Início do período aguardando resposta da equipe/instância; NULL quando já respondido ou encerrado.';

-- Backfill: conversas ativas cuja última msg do cliente ainda não teve resposta
UPDATE public.atendimento_conversas c
SET awaiting_response_since = c.last_customer_message_at
WHERE c.status IN ('aguardando', 'em_atendimento')
  AND c.last_customer_message_at IS NOT NULL
  AND c.awaiting_response_since IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.cliente_whatsapp_sent s
    WHERE s.conversation_id = c.id
      AND s.created_at >= c.last_customer_message_at
  );

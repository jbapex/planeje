-- Migration: Adicionar modo 'traffic_assistant' para conversas do assistente de tráfego
-- Descrição: Permite salvar conversas do assistente de tráfego pago

-- Remover constraint antiga se existir
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'assistant_project_conversations_mode_check'
  ) THEN
    ALTER TABLE public.assistant_project_conversations
    DROP CONSTRAINT assistant_project_conversations_mode_check;
  END IF;
END $$;

-- Adicionar nova constraint com 'traffic_assistant'
ALTER TABLE public.assistant_project_conversations
ADD CONSTRAINT assistant_project_conversations_mode_check 
CHECK (mode IN ('client_specific', 'general', 'traffic_assistant'));

-- Atualizar comentário
COMMENT ON COLUMN public.assistant_project_conversations.mode IS 'Modo da conversa: client_specific (focado em um cliente), general (chat geral) ou traffic_assistant (assistente de tráfego pago)';

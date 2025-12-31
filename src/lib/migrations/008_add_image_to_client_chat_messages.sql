-- =====================================================
-- MIGRATION: Adicionar coluna image na tabela client_chat_messages
-- Descrição: Permite salvar imagens anexadas nas mensagens do chat
-- =====================================================

ALTER TABLE public.client_chat_messages
ADD COLUMN IF NOT EXISTS image text; -- Base64 ou URL da imagem anexada

COMMENT ON COLUMN public.client_chat_messages.image IS 'Imagem anexada na mensagem (base64 ou URL)';


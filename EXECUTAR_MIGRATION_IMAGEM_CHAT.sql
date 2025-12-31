-- =====================================================
-- EXECUTAR MIGRATION: Adicionar coluna image ao chat
-- =====================================================
-- 
-- INSTRUÇÕES:
-- 1. Acesse o Supabase Dashboard
-- 2. Vá em SQL Editor
-- 3. Cole este conteúdo
-- 4. Clique em Run
--
-- =====================================================

-- Adicionar coluna image na tabela client_chat_messages
ALTER TABLE public.client_chat_messages
ADD COLUMN IF NOT EXISTS image text; -- Base64 ou URL da imagem anexada

COMMENT ON COLUMN public.client_chat_messages.image IS 'Imagem anexada na mensagem (base64 ou URL)';

-- Verificar se a coluna foi adicionada
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'client_chat_messages'
  AND column_name = 'image';


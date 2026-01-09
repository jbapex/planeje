-- Migration: Criar tabela para conversas do Assistente de Projetos
-- Execute este script no Supabase SQL Editor

-- Criar tabela (se não existir)
CREATE TABLE IF NOT EXISTS public.assistant_project_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  
  -- Modo da conversa: 'client_specific' ou 'general'
  mode VARCHAR(20) NOT NULL,
  
  -- Se for modo cliente específico, referência ao cliente
  client_id UUID REFERENCES public.clientes(id) ON DELETE CASCADE,
  
  -- Se for modo geral, pode ter múltiplos clientes mencionados
  mentioned_client_ids UUID[] DEFAULT '{}',
  
  -- Mensagens da conversa (JSONB para flexibilidade)
  messages JSONB NOT NULL DEFAULT '[]'::jsonb,
  
  -- Metadados
  title VARCHAR(255), -- Título da conversa (gerado automaticamente)
  context_loaded JSONB DEFAULT '{}'::jsonb, -- Quais dados foram carregados
  
  -- Usuário que criou a conversa
  owner_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  
  -- Tags/classificação para busca
  tags TEXT[] DEFAULT '{}'
);

-- Adicionar constraint de modo apenas se não existir
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'assistant_project_conversations_mode_check'
  ) THEN
    ALTER TABLE public.assistant_project_conversations
    ADD CONSTRAINT assistant_project_conversations_mode_check 
    CHECK (mode IN ('client_specific', 'general'));
  END IF;
END $$;

-- Índices para melhor performance (criar apenas se não existirem)
CREATE INDEX IF NOT EXISTS idx_assistant_conversations_owner ON public.assistant_project_conversations(owner_id);
CREATE INDEX IF NOT EXISTS idx_assistant_conversations_client ON public.assistant_project_conversations(client_id) WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_assistant_conversations_mode ON public.assistant_project_conversations(mode);
CREATE INDEX IF NOT EXISTS idx_assistant_conversations_created ON public.assistant_project_conversations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_assistant_conversations_updated ON public.assistant_project_conversations(updated_at DESC);

-- Índice GIN para busca em mensagens JSONB
CREATE INDEX IF NOT EXISTS idx_assistant_conversations_messages ON public.assistant_project_conversations USING GIN (messages);

-- Trigger para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_assistant_conversations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_assistant_conversations_updated_at ON public.assistant_project_conversations;
CREATE TRIGGER update_assistant_conversations_updated_at
  BEFORE UPDATE ON public.assistant_project_conversations
  FOR EACH ROW
  EXECUTE FUNCTION update_assistant_conversations_updated_at();

-- Comentários
COMMENT ON TABLE public.assistant_project_conversations IS 'Armazena conversas do Assistente de Projetos (modo cliente específico e modo geral)';
COMMENT ON COLUMN public.assistant_project_conversations.mode IS 'Modo da conversa: client_specific (focado em um cliente) ou general (chat geral)';
COMMENT ON COLUMN public.assistant_project_conversations.messages IS 'Array JSONB com mensagens da conversa. Formato: [{"role": "user|assistant", "content": "...", "timestamp": "..."}]';
COMMENT ON COLUMN public.assistant_project_conversations.context_loaded IS 'JSONB com informações sobre quais dados foram carregados: {"client_data": true, "documents": [...], "projects": [...]}';

-- Permissões RLS (Row Level Security)
ALTER TABLE public.assistant_project_conversations ENABLE ROW LEVEL SECURITY;

-- Política: Usuários só podem ver suas próprias conversas ou conversas de clientes que têm acesso
DROP POLICY IF EXISTS "Users can view their own conversations" ON public.assistant_project_conversations;
CREATE POLICY "Users can view their own conversations"
  ON public.assistant_project_conversations
  FOR SELECT
  USING (
    owner_id = auth.uid() OR
    (mode = 'client_specific' AND (
      EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() 
        AND role IN ('superadmin', 'admin')
      ) OR
      client_id IN (
        SELECT id FROM public.clientes 
        WHERE responsavel::text = auth.uid()::text
      )
    ))
  );

-- Política: Usuários podem criar suas próprias conversas
DROP POLICY IF EXISTS "Users can create their own conversations" ON public.assistant_project_conversations;
CREATE POLICY "Users can create their own conversations"
  ON public.assistant_project_conversations
  FOR INSERT
  WITH CHECK (owner_id = auth.uid());

-- Política: Usuários podem atualizar suas próprias conversas
DROP POLICY IF EXISTS "Users can update their own conversations" ON public.assistant_project_conversations;
CREATE POLICY "Users can update their own conversations"
  ON public.assistant_project_conversations
  FOR UPDATE
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- Política: Usuários podem deletar suas próprias conversas
DROP POLICY IF EXISTS "Users can delete their own conversations" ON public.assistant_project_conversations;
CREATE POLICY "Users can delete their own conversations"
  ON public.assistant_project_conversations
  FOR DELETE
  USING (owner_id = auth.uid());

-- Garantir permissões básicas
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.assistant_project_conversations TO authenticated;

-- Verificar se a tabela foi criada
SELECT 
    'Tabela criada com sucesso!' as status,
    COUNT(*) as total_conversations
FROM public.assistant_project_conversations;


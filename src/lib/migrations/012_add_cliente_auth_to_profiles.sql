-- =====================================================
-- MIGRATION: Adicionar Autenticação de Clientes
-- Descrição: Adiciona suporte para clientes terem login/senha
-- =====================================================

-- 1. Adicionar coluna cliente_id em profiles
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'profiles' 
        AND column_name = 'cliente_id'
    ) THEN
        ALTER TABLE public.profiles 
        ADD COLUMN cliente_id uuid REFERENCES public.clientes(id) ON DELETE SET NULL;
        
        RAISE NOTICE 'Coluna cliente_id adicionada com sucesso!';
    ELSE
        RAISE NOTICE 'Coluna cliente_id já existe.';
    END IF;
END $$;

-- 2. Garantir que role existe e adicionar 'cliente' aos valores possíveis
DO $$ 
BEGIN
    -- Verificar se a coluna role existe
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'profiles' 
        AND column_name = 'role'
    ) THEN
        ALTER TABLE public.profiles 
        ADD COLUMN role text DEFAULT 'colaborador';
        
        RAISE NOTICE 'Coluna role criada com sucesso!';
    ELSE
        RAISE NOTICE 'Coluna role já existe.';
    END IF;
END $$;

-- 3. Atualizar role existente para garantir valores válidos
UPDATE public.profiles 
SET role = 'colaborador' 
WHERE role IS NULL 
   OR role NOT IN ('superadmin', 'admin', 'colaborador', 'cliente');

-- 4. Criar índice para melhor performance
CREATE INDEX IF NOT EXISTS idx_profiles_cliente_id 
    ON public.profiles(cliente_id);

CREATE INDEX IF NOT EXISTS idx_profiles_role 
    ON public.profiles(role);

-- 5. Comentários explicativos
COMMENT ON COLUMN public.profiles.cliente_id IS 'Vincula o perfil a um cliente específico. NULL para usuários internos (superadmin, admin, colaborador). Preenchido para role="cliente".';
COMMENT ON COLUMN public.profiles.role IS 'Papel do usuário: superadmin, admin, colaborador ou cliente.';

-- 6. RLS Policy: Clientes podem ver apenas seus próprios dados
DROP POLICY IF EXISTS "Clientes podem ver apenas seus dados" ON public.clientes;
CREATE POLICY "Clientes podem ver apenas seus dados"
  ON public.clientes FOR SELECT
  USING (
    id IN (
      SELECT cliente_id 
      FROM public.profiles 
      WHERE id = auth.uid() 
        AND role = 'cliente' 
        AND cliente_id IS NOT NULL
    )
  );

-- 7. RLS Policy: Clientes podem ver suas sessões de chat
DROP POLICY IF EXISTS "Clientes podem ver suas sessões de chat" ON public.client_chat_sessions;
CREATE POLICY "Clientes podem ver suas sessões de chat"
  ON public.client_chat_sessions FOR SELECT
  USING (
    client_id IN (
      SELECT cliente_id 
      FROM public.profiles 
      WHERE id = auth.uid() 
        AND role = 'cliente' 
        AND cliente_id IS NOT NULL
    )
  );

-- 8. RLS Policy: Clientes podem ver suas mensagens de chat
DROP POLICY IF EXISTS "Clientes podem ver suas mensagens de chat" ON public.client_chat_messages;
CREATE POLICY "Clientes podem ver suas mensagens de chat"
  ON public.client_chat_messages FOR SELECT
  USING (
    session_id IN (
      SELECT id 
      FROM public.client_chat_sessions 
      WHERE client_id IN (
        SELECT cliente_id 
        FROM public.profiles 
        WHERE id = auth.uid() 
          AND role = 'cliente' 
          AND cliente_id IS NOT NULL
      )
    )
  );

-- 9. Permitir que clientes criem suas próprias sessões (quando autenticados)
DROP POLICY IF EXISTS "Clientes podem criar sessões de chat" ON public.client_chat_sessions;
CREATE POLICY "Clientes podem criar sessões de chat"
  ON public.client_chat_sessions FOR INSERT
  WITH CHECK (
    client_id IN (
      SELECT cliente_id 
      FROM public.profiles 
      WHERE id = auth.uid() 
        AND role = 'cliente' 
        AND cliente_id IS NOT NULL
    )
  );

-- 10. Permitir que clientes criem mensagens (quando autenticados)
DROP POLICY IF EXISTS "Clientes podem criar mensagens de chat" ON public.client_chat_messages;
CREATE POLICY "Clientes podem criar mensagens de chat"
  ON public.client_chat_messages FOR INSERT
  WITH CHECK (
    session_id IN (
      SELECT id 
      FROM public.client_chat_sessions 
      WHERE client_id IN (
        SELECT cliente_id 
        FROM public.profiles 
        WHERE id = auth.uid() 
          AND role = 'cliente' 
          AND cliente_id IS NOT NULL
      )
    )
  );

-- 11. Permitir que clientes atualizem suas sessões
DROP POLICY IF EXISTS "Clientes podem atualizar sessões de chat" ON public.client_chat_sessions;
CREATE POLICY "Clientes podem atualizar sessões de chat"
  ON public.client_chat_sessions FOR UPDATE
  USING (
    client_id IN (
      SELECT cliente_id 
      FROM public.profiles 
      WHERE id = auth.uid() 
        AND role = 'cliente' 
        AND cliente_id IS NOT NULL
    )
  );

-- Migration concluída com sucesso!

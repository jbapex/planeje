-- =====================================================
-- MIGRATION: Adicionar Permissões de Páginas para Usuários de Cliente
-- Descrição: Permite controlar quais páginas da área do cliente cada usuário pode acessar
-- =====================================================

-- 1. Adicionar coluna allowed_pages em profiles (JSONB para armazenar array de páginas permitidas)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'profiles' 
        AND column_name = 'allowed_pages'
    ) THEN
        ALTER TABLE public.profiles 
        ADD COLUMN allowed_pages jsonb DEFAULT NULL;
        
        RAISE NOTICE 'Coluna allowed_pages adicionada com sucesso!';
    ELSE
        RAISE NOTICE 'Coluna allowed_pages já existe.';
    END IF;
END $$;

-- 2. Criar índice GIN para melhor performance em consultas JSONB
CREATE INDEX IF NOT EXISTS idx_profiles_allowed_pages 
    ON public.profiles USING gin(allowed_pages);

-- 3. Comentário explicativo
COMMENT ON COLUMN public.profiles.allowed_pages IS 'Array JSONB com as páginas permitidas para usuários de cliente. Exemplo: ["dashboard", "trafego", "campaigns-status", "apexia", "pgm-panel"]. NULL significa acesso a todas as páginas (comportamento padrão).';

-- 4. Função helper para verificar se uma página está permitida (opcional, para uso em RLS se necessário)
CREATE OR REPLACE FUNCTION public.user_has_page_access(user_id uuid, page_key text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    user_allowed_pages jsonb;
    user_role text;
    user_cliente_id uuid;
BEGIN
    -- Buscar dados do usuário
    SELECT role, cliente_id, allowed_pages
    INTO user_role, user_cliente_id, user_allowed_pages
    FROM public.profiles
    WHERE id = user_id;
    
    -- Se não for cliente, não aplicar restrições
    IF user_role != 'cliente' OR user_cliente_id IS NULL THEN
        RETURN true;
    END IF;
    
    -- Se allowed_pages é NULL, permite acesso a todas as páginas
    IF user_allowed_pages IS NULL THEN
        RETURN true;
    END IF;
    
    -- Verificar se a página está no array de páginas permitidas
    RETURN user_allowed_pages ? page_key;
END;
$$;

-- 5. Comentário na função
COMMENT ON FUNCTION public.user_has_page_access(uuid, text) IS 'Verifica se um usuário tem acesso a uma página específica. Retorna true se o usuário não for cliente, se allowed_pages for NULL, ou se a página estiver no array de páginas permitidas.';

-- ============================================
-- Adicionar Controle de Acesso do ApexIA aos Documentos
-- ============================================
-- Este script adiciona o campo apexia_access na tabela client_documents
-- para controlar quais documentos o ApexIA pode acessar durante o chat

-- Adiciona a coluna apexia_access se não existir
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'client_documents'
        AND column_name = 'apexia_access'
    ) THEN
        ALTER TABLE public.client_documents 
        ADD COLUMN apexia_access BOOLEAN DEFAULT false NOT NULL;
        
        -- Comentário explicativo
        COMMENT ON COLUMN public.client_documents.apexia_access IS 
        'Controla se o ApexIA tem acesso a este documento. Quando true, o documento será incluído no contexto do chat do ApexIA.';
        
        RAISE NOTICE 'Coluna apexia_access adicionada com sucesso!';
    ELSE
        RAISE NOTICE 'Coluna apexia_access já existe na tabela client_documents.';
    END IF;
END $$;

-- Verificar se a coluna foi criada
SELECT 
    column_name, 
    data_type, 
    column_default, 
    is_nullable
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'client_documents'
  AND column_name = 'apexia_access';


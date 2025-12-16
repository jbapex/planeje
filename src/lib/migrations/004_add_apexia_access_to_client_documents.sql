-- Migration: Adicionar campo apexia_access na tabela client_documents
-- Este campo controla se o ApexIA tem acesso ao documento específico

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
    END IF;
END $$;


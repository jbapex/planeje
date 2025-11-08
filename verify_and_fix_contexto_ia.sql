-- Script para verificar e corrigir a coluna contexto_ia na tabela campaign_plans

-- 1. Verifica se a tabela existe
SELECT EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'campaign_plans'
) AS table_exists;

-- 2. Verifica se a coluna contexto_ia existe
SELECT EXISTS (
    SELECT FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'campaign_plans' 
    AND column_name = 'contexto_ia'
) AS column_exists;

-- 3. Se a tabela não existir, cria ela
CREATE TABLE IF NOT EXISTS public.campaign_plans (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    project_id uuid NOT NULL,
    contexto_ia TEXT DEFAULT '',
    objetivo TEXT DEFAULT '',
    estrategia_comunicacao JSONB DEFAULT '{}'::jsonb,
    conteudo_criativos JSONB DEFAULT '{}'::jsonb,
    trafego_pago JSONB DEFAULT '{}'::jsonb,
    materiais JSONB DEFAULT '[]'::jsonb,
    cronograma JSONB DEFAULT '[]'::jsonb,
    CONSTRAINT campaign_plans_pkey PRIMARY KEY (id)
);

-- 4. Adiciona a coluna contexto_ia se não existir
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'campaign_plans' 
        AND column_name = 'contexto_ia'
    ) THEN
        ALTER TABLE public.campaign_plans 
        ADD COLUMN contexto_ia TEXT DEFAULT '';
        
        RAISE NOTICE 'Coluna contexto_ia adicionada com sucesso!';
    ELSE
        RAISE NOTICE 'Coluna contexto_ia já existe.';
    END IF;
END $$;

-- 5. Garante que a coluna tem o tipo correto
ALTER TABLE public.campaign_plans 
ALTER COLUMN contexto_ia SET DEFAULT '';

-- 6. Comentário na coluna
COMMENT ON COLUMN public.campaign_plans.contexto_ia IS 'Contexto adicional para a IA aprender sobre o cliente e gerar conteúdo personalizado';

-- 7. Permissões
GRANT ALL ON TABLE public.campaign_plans TO anon, authenticated, service_role;

-- 8. Força atualização do cache do schema (isso pode ajudar)
NOTIFY pgrst, 'reload schema';


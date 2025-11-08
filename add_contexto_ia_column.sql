-- Cria a tabela campaign_plans se não existir, ou adiciona a coluna contexto_ia se a tabela já existir

-- Primeiro, cria a tabela se não existir (sem foreign key por enquanto, pode ser adicionada depois)
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

-- Adiciona a foreign key apenas se a tabela projetos existir
DO $$ 
BEGIN
    IF EXISTS (
        SELECT 1 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'projetos'
    ) THEN
        -- Remove a constraint se já existir
        IF EXISTS (
            SELECT 1 
            FROM information_schema.table_constraints 
            WHERE constraint_schema = 'public' 
            AND constraint_name = 'campaign_plans_project_id_fkey'
        ) THEN
            ALTER TABLE public.campaign_plans DROP CONSTRAINT campaign_plans_project_id_fkey;
        END IF;
        
        -- Adiciona a foreign key
        ALTER TABLE public.campaign_plans 
        ADD CONSTRAINT campaign_plans_project_id_fkey 
        FOREIGN KEY (project_id) REFERENCES public.projetos(id) ON DELETE CASCADE;
    END IF;
END $$;

-- Adiciona a coluna contexto_ia se a tabela já existir mas não tiver essa coluna
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
    END IF;
END $$;

-- Comentário explicativo
COMMENT ON COLUMN public.campaign_plans.contexto_ia IS 'Contexto adicional para a IA aprender sobre o cliente e gerar conteúdo personalizado';

-- Permissões
GRANT ALL ON TABLE public.campaign_plans TO anon, authenticated, service_role;


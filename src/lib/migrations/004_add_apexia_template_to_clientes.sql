-- Adiciona coluna apexia_template na tabela clientes
-- Esta coluna armazena o template de personalidade escolhido pelo cliente para o ApexIA

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'clientes' 
        AND column_name = 'apexia_template'
    ) THEN
        ALTER TABLE public.clientes 
        ADD COLUMN apexia_template TEXT;
        
        RAISE NOTICE 'Coluna apexia_template adicionada com sucesso!';
    ELSE
        RAISE NOTICE 'Coluna apexia_template já existe.';
    END IF;
END $$;

-- Comentário explicativo
COMMENT ON COLUMN public.clientes.apexia_template IS 'Template de personalidade escolhido pelo cliente para o ApexIA. Valores possíveis: consultor, suporte, vendas, educativo, casual. NULL usa configuração padrão do sistema.';

-- Permissões (já devem existir, mas garantindo)
GRANT ALL ON TABLE public.clientes TO anon, authenticated, service_role;


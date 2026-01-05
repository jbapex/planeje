-- Migration: Adicionar campo limite_meta (limite de gasto no Meta Ads) na tabela clientes
-- Este campo é diferente de clientes.valor (quanto o cliente paga)
-- limite_meta = limite de quanto pode gastar no Meta Ads (custo/despesa)
-- valor = quanto o cliente paga para a empresa (receita)

-- Adiciona a coluna limite_meta se não existir
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'clientes' 
        AND column_name = 'limite_meta'
    ) THEN
        ALTER TABLE public.clientes 
        ADD COLUMN limite_meta NUMERIC(10, 2) DEFAULT NULL;
        
        RAISE NOTICE 'Coluna limite_meta adicionada com sucesso!';
    ELSE
        RAISE NOTICE 'Coluna limite_meta já existe.';
    END IF;
END $$;

-- Adiciona comentário explicativo
COMMENT ON COLUMN public.clientes.limite_meta IS 'Limite de gasto no Meta Ads (custo/despesa). Diferente de valor (quanto o cliente paga - receita).';

-- Garante permissões
GRANT SELECT, UPDATE ON TABLE public.clientes TO authenticated;


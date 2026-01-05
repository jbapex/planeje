-- Script para executar migration: Adicionar campo limite_meta na tabela clientes
-- Este campo separa o limite de gasto no Meta Ads do valor que o cliente paga
-- Execute este script no Supabase SQL Editor

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

-- Verifica se a coluna foi criada
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_schema = 'public' 
AND table_name = 'clientes' 
AND column_name IN ('valor', 'limite_meta')
ORDER BY column_name;


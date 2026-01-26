-- Migration: Adicionar modelo padrão para tráfego pago
-- Descrição: Adiciona campo default_model_traffic para modelo padrão específico do tráfego pago
-- Data: 2026-01-26

-- Adicionar campo default_model_traffic na tabela cliente_apexia_config
ALTER TABLE cliente_apexia_config 
ADD COLUMN IF NOT EXISTS default_model_traffic TEXT;

-- Renomear default_model para default_model_chat para clareza (se não existir default_model_chat)
DO $$ 
BEGIN
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'cliente_apexia_config' 
        AND column_name = 'default_model'
    ) AND NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'cliente_apexia_config' 
        AND column_name = 'default_model_chat'
    ) THEN
        ALTER TABLE cliente_apexia_config 
        RENAME COLUMN default_model TO default_model_chat;
    END IF;
END $$;

-- Se default_model_chat não existir, criar
ALTER TABLE cliente_apexia_config 
ADD COLUMN IF NOT EXISTS default_model_chat TEXT;

-- Comentários
COMMENT ON COLUMN cliente_apexia_config.default_model_chat IS 'Modelo padrão específico para este cliente no chat normal do ApexIA (opcional, sobrescreve o padrão global)';
COMMENT ON COLUMN cliente_apexia_config.default_model_traffic IS 'Modelo padrão específico para este cliente no modo Tráfego Pago do ApexIA (opcional, sobrescreve o padrão global)';

-- Verificar se as colunas foram criadas
SELECT 
    column_name, 
    data_type, 
    is_nullable
FROM information_schema.columns 
WHERE table_schema = 'public' 
AND table_name = 'cliente_apexia_config' 
AND column_name IN ('default_model_chat', 'default_model_traffic')
ORDER BY column_name;

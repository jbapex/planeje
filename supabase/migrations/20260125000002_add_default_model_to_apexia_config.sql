-- Migration: Adicionar modelo padrão global e campo default_model
-- Descrição: Adiciona configuração de modelo padrão global e campo default_model por cliente
-- Data: 2026-01-25

-- Adicionar campo default_model na tabela cliente_apexia_config (opcional, para override por cliente)
ALTER TABLE cliente_apexia_config 
ADD COLUMN IF NOT EXISTS default_model TEXT;

-- Criar configuração global de modelo padrão em public_config (se não existir)
INSERT INTO public_config (key, value)
VALUES ('apexia_default_model', 'gpt-4o-mini')
ON CONFLICT (key) DO NOTHING;

-- Comentário
COMMENT ON COLUMN cliente_apexia_config.default_model IS 'Modelo padrão específico para este cliente (opcional, sobrescreve o padrão global)';

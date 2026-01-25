-- Migration: Criar tabela cliente_apexia_config
-- Descrição: Configuração de acesso ao tráfego e modelos IA por cliente no ApexIA
-- Data: 2026-01-25

-- Criar tabela
CREATE TABLE IF NOT EXISTS cliente_apexia_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  has_traffic_access BOOLEAN DEFAULT false,
  allowed_ai_models TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(cliente_id)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_cliente_apexia_config_cliente_id ON cliente_apexia_config(cliente_id);
CREATE INDEX IF NOT EXISTS idx_cliente_apexia_config_traffic_access ON cliente_apexia_config(has_traffic_access);

-- RLS
ALTER TABLE cliente_apexia_config ENABLE ROW LEVEL SECURITY;

-- Políticas (apenas superadmin pode gerenciar)
CREATE POLICY "Superadmin pode gerenciar configurações"
  ON cliente_apexia_config
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role = 'superadmin'
    )
  );

-- Clientes podem ver sua própria configuração
CREATE POLICY "Clientes podem ver sua configuração"
  ON cliente_apexia_config
  FOR SELECT
  TO authenticated
  USING (
    cliente_id IN (
      SELECT cliente_id FROM profiles
      WHERE id = auth.uid()
      AND role = 'cliente'
    )
  );

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION update_cliente_apexia_config_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_cliente_apexia_config_updated_at
  BEFORE UPDATE ON cliente_apexia_config
  FOR EACH ROW
  EXECUTE FUNCTION update_cliente_apexia_config_updated_at();

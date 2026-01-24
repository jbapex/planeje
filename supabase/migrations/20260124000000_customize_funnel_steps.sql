-- Adiciona colunas para personalização das etapas do funil na tabela clientes
ALTER TABLE clientes 
ADD COLUMN IF NOT EXISTS funnel_step_2_name TEXT DEFAULT 'Visita Agendada',
ADD COLUMN IF NOT EXISTS funnel_step_3_name TEXT DEFAULT 'Visita Realizada';

-- Comentários para documentação
COMMENT ON COLUMN clientes.funnel_step_2_name IS 'Nome personalizado para a Etapa 2 do funil (ex: Visita Agendada, Lead Qualificado)';
COMMENT ON COLUMN clientes.funnel_step_3_name IS 'Nome personalizado para a Etapa 3 do funil (ex: Visita Realizada, Venda Concluída)';

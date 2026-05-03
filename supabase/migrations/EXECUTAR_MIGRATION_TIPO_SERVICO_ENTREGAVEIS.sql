-- Adiciona campos de tipo de serviço e entregáveis na tabela clientes
ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS tipo_servico TEXT DEFAULT 'execucao_completa',
  ADD COLUMN IF NOT EXISTS entregaveis JSONB DEFAULT '{"carrosseis": 0, "posts": 0, "stories": 0, "videos": 0, "anuncios": 0}'::jsonb;

-- Adiciona campo de data de evento na tabela projetos (opcional)
ALTER TABLE projetos
  ADD COLUMN IF NOT EXISTS data_evento DATE;

-- Comentários para documentação
COMMENT ON COLUMN clientes.tipo_servico IS 'Tipo de serviço: execucao_completa, execucao_parcial, apenas_consultoria';
COMMENT ON COLUMN clientes.entregaveis IS 'JSON com quantidades mensais: carrosseis, posts, stories, videos, anuncios';
COMMENT ON COLUMN projetos.data_evento IS 'Data âncora opcional da campanha (Dia das Mães, Black Friday, lançamento)';

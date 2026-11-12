-- Funil: diagrama publicado + atribuição de contatos por campanha UTM

ALTER TABLE public.cliente_funil_diagrama
  ADD COLUMN IF NOT EXISTS is_published boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.cliente_funil_diagrama.is_published IS
  'Diagrama ativo para métricas e atribuição de leads (um por cliente recomendado)';

CREATE INDEX IF NOT EXISTS idx_cliente_funil_diagrama_published
  ON public.cliente_funil_diagrama (cliente_id, is_published)
  WHERE is_published = true;

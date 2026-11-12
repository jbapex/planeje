-- Localização da conta do cliente (visão geral geográfica da carteira)

ALTER TABLE public.clientes
ADD COLUMN IF NOT EXISTS estado text;

ALTER TABLE public.clientes
ADD COLUMN IF NOT EXISTS cidade text;

ALTER TABLE public.clientes
ADD COLUMN IF NOT EXISTS email text;

ALTER TABLE public.clientes
ADD COLUMN IF NOT EXISTS telefone text;

COMMENT ON COLUMN public.clientes.estado IS 'UF brasileira (2 letras), ex: SP';
COMMENT ON COLUMN public.clientes.cidade IS 'Cidade do cliente';

ALTER TABLE public.clientes DROP CONSTRAINT IF EXISTS clientes_estado_uf_check;
ALTER TABLE public.clientes
ADD CONSTRAINT clientes_estado_uf_check
CHECK (estado IS NULL OR estado ~ '^[A-Z]{2}$');

CREATE INDEX IF NOT EXISTS idx_clientes_estado ON public.clientes (estado);
CREATE INDEX IF NOT EXISTS idx_clientes_cidade ON public.clientes (cidade);

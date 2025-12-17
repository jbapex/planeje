-- =====================================================
-- MIGRATION: Objetivo e metas de tráfego por cliente
-- Execute este script no Supabase SQL Editor
-- =====================================================

-- Adiciona campos na tabela clientes
ALTER TABLE public.clientes
ADD COLUMN IF NOT EXISTS objetivo_meta text;

ALTER TABLE public.clientes
ADD COLUMN IF NOT EXISTS meta_custo_mensagem numeric;

ALTER TABLE public.clientes
ADD COLUMN IF NOT EXISTS meta_custo_compra numeric;

ALTER TABLE public.clientes
ADD COLUMN IF NOT EXISTS roas_alvo numeric;

COMMENT ON COLUMN public.clientes.objetivo_meta IS 'Objetivo principal de tráfego: mensagens, compras ou misto';
COMMENT ON COLUMN public.clientes.meta_custo_mensagem IS 'Meta interna de custo por mensagem (R$)';
COMMENT ON COLUMN public.clientes.meta_custo_compra IS 'Meta interna de custo por compra (R$)';
COMMENT ON COLUMN public.clientes.roas_alvo IS 'ROAS alvo desejado (ex: 3 = 3x)';

-- Verificação
SELECT 
  objetivo_meta,
  meta_custo_mensagem,
  meta_custo_compra,
  roas_alvo
FROM public.clientes
LIMIT 5;



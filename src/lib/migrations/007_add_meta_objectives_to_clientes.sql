-- =====================================================
-- MIGRATION: Adicionar campos de objetivo/meta na tabela clientes
-- Descrição: Objetivo da conta de tráfego e metas de custo/ROAS
-- =====================================================

ALTER TABLE public.clientes
ADD COLUMN IF NOT EXISTS objetivo_meta text; -- 'mensagens' | 'compras' | 'misto'

ALTER TABLE public.clientes
ADD COLUMN IF NOT EXISTS meta_custo_mensagem numeric; -- Meta de custo por mensagem (R$)

ALTER TABLE public.clientes
ADD COLUMN IF NOT EXISTS meta_custo_compra numeric; -- Meta de custo por compra (R$)

ALTER TABLE public.clientes
ADD COLUMN IF NOT EXISTS roas_alvo numeric; -- ROAS alvo (ex: 3 = 3x)

COMMENT ON COLUMN public.clientes.objetivo_meta IS 'Objetivo principal de tráfego: mensagens, compras ou misto';
COMMENT ON COLUMN public.clientes.meta_custo_mensagem IS 'Meta interna de custo por mensagem (R$)';
COMMENT ON COLUMN public.clientes.meta_custo_compra IS 'Meta interna de custo por compra (R$)';
COMMENT ON COLUMN public.clientes.roas_alvo IS 'ROAS alvo desejado (ex: 3 = 3x)';



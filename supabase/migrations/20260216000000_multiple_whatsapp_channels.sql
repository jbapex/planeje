-- =====================================================
-- Múltiplos canais WhatsApp por cliente
-- Remove UNIQUE(cliente_id) e adiciona nome do canal.
-- =====================================================

-- Remover constraint UNIQUE em cliente_id para permitir vários configs por cliente
ALTER TABLE public.cliente_whatsapp_config
  DROP CONSTRAINT IF EXISTS cliente_whatsapp_config_cliente_id_key;

-- Adicionar coluna nome do canal (opcional)
ALTER TABLE public.cliente_whatsapp_config
  ADD COLUMN IF NOT EXISTS name text;

COMMENT ON COLUMN public.cliente_whatsapp_config.name IS 'Nome do canal (ex: Vendas, Suporte) para identificar na lista de canais';

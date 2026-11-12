-- Mini CRM da loja: preenchimento manual no contato do Rastreamento.
-- Não altera qualificado/comprou e não dispara CAPI.

ALTER TABLE public.cliente_whatsapp_contact
  ADD COLUMN IF NOT EXISTS mini_crm jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.cliente_whatsapp_contact.mini_crm IS
  'Preenchimento do mini CRM da loja (vendedor, status e colunas do nicho). Separado do Qualificado/Comprou da Meta.';

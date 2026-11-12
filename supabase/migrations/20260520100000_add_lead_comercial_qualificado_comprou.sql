-- Qualificação e compra: Contatos, Rastreamento e Relatório Meta
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS qualificado boolean,
  ADD COLUMN IF NOT EXISTS comprou boolean;

ALTER TABLE public.cliente_whatsapp_contact
  ADD COLUMN IF NOT EXISTS qualificado boolean,
  ADD COLUMN IF NOT EXISTS comprou boolean,
  ADD COLUMN IF NOT EXISTS valor_venda numeric(14,2);

COMMENT ON COLUMN public.leads.qualificado IS 'NULL=não informado, true=qualificado, false=não qualificado';
COMMENT ON COLUMN public.leads.comprou IS 'NULL=não informado, true=comprou, false=não comprou';
COMMENT ON COLUMN public.cliente_whatsapp_contact.qualificado IS 'Quando não há lead no CRM, marca no contato WhatsApp';
COMMENT ON COLUMN public.cliente_whatsapp_contact.comprou IS 'Quando não há lead no CRM, marca no contato WhatsApp';
COMMENT ON COLUMN public.cliente_whatsapp_contact.valor_venda IS 'Valor da venda no contato (sem lead); com lead use leads.valor';

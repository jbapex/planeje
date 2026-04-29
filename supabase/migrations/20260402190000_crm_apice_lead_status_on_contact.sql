-- Status do lead no CRM-Apice espelhado no Planeje (webhook de entrada → Edge Function).
-- CRM-Apice (ou automação) chama a função com Bearer secret; atualiza contato e/ou lead pelo telefone.

ALTER TABLE public.cliente_whatsapp_contact
  ADD COLUMN IF NOT EXISTS crm_apice_lead_status text,
  ADD COLUMN IF NOT EXISTS crm_apice_lead_status_at timestamptz;

COMMENT ON COLUMN public.cliente_whatsapp_contact.crm_apice_lead_status IS 'Último status do lead informado pelo CRM-Apice (webhook crm-apice-contact-status-webhook).';
COMMENT ON COLUMN public.cliente_whatsapp_contact.crm_apice_lead_status_at IS 'Quando o status do CRM-Apice foi recebido.';

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS crm_apice_lead_status text,
  ADD COLUMN IF NOT EXISTS crm_apice_lead_status_at timestamptz;

COMMENT ON COLUMN public.leads.crm_apice_lead_status IS 'Último status do lead no CRM-Apice (mesmo webhook; lead sem contato WhatsApp no Planeje).';
COMMENT ON COLUMN public.leads.crm_apice_lead_status_at IS 'Quando o status do CRM-Apice foi recebido para este lead.';

ALTER TABLE public.cliente_crm_apice_forward
  ADD COLUMN IF NOT EXISTS status_incoming_secret text;

COMMENT ON COLUMN public.cliente_crm_apice_forward.status_incoming_secret IS 'Secret Bearer para o CRM-Apice atualizar status no Planeje (função crm-apice-contact-status-webhook).';

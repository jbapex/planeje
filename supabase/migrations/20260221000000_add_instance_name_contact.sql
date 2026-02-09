-- Nome da instância/conta WhatsApp (instanceName do corpo do webhook uazapi) para exibir na coluna Conta da página Contatos
ALTER TABLE public.cliente_whatsapp_contact
  ADD COLUMN IF NOT EXISTS instance_name text;

COMMENT ON COLUMN public.cliente_whatsapp_contact.instance_name IS 'Nome da instância/conta WhatsApp (body.instanceName do webhook uazapi, ex: Impacto ADS)';

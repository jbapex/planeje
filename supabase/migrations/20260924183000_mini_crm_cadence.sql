-- Dias de cada etapa do follow-up e da repescagem, por loja.
-- Não altera leads, senhas nem o CRM antigo.

ALTER TABLE public.mini_crm_config
  ADD COLUMN IF NOT EXISTS cadence jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.mini_crm_config.cadence IS
  'Dias de cada etapa do follow-up e da repescagem. O preenchimento do lead continua em cliente_whatsapp_contact.mini_crm.';

NOTIFY pgrst, 'reload schema';

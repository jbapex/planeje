-- Conversões Meta por canal WhatsApp (cliente_whatsapp_config)

ALTER TABLE public.cliente_whatsapp_config
  ADD COLUMN IF NOT EXISTS meta_waba_id text,
  ADD COLUMN IF NOT EXISTS meta_dataset_id text,
  ADD COLUMN IF NOT EXISTS meta_conversions_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.cliente_whatsapp_config.meta_waba_id IS 'WABA ID Meta para este canal uazapi';
COMMENT ON COLUMN public.cliente_whatsapp_config.meta_dataset_id IS 'Dataset ID Meta (Conversions API) deste canal';
COMMENT ON COLUMN public.cliente_whatsapp_config.meta_conversions_enabled IS 'Enviar QualifiedLead/Purchase à Meta para contatos deste canal';

ALTER TABLE public.cliente_whatsapp_contact
  ADD COLUMN IF NOT EXISTS whatsapp_config_id uuid REFERENCES public.cliente_whatsapp_config(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_cliente_whatsapp_contact_config
  ON public.cliente_whatsapp_contact (whatsapp_config_id);

COMMENT ON COLUMN public.cliente_whatsapp_contact.whatsapp_config_id IS 'Canal uazapi que recebeu a mensagem (webhook secret)';

ALTER TABLE public.meta_conversion_event_log
  ADD COLUMN IF NOT EXISTS whatsapp_config_id uuid REFERENCES public.cliente_whatsapp_config(id) ON DELETE SET NULL;

-- Copia config antiga do cliente para canais que ainda não têm WABA
UPDATE public.cliente_whatsapp_config c
SET
  meta_waba_id = cl.meta_waba_id,
  meta_dataset_id = cl.meta_dataset_id,
  meta_conversions_enabled = COALESCE(cl.meta_conversions_enabled, false)
FROM public.clientes cl
WHERE c.cliente_id = cl.id
  AND (c.meta_waba_id IS NULL OR c.meta_waba_id = '')
  AND cl.meta_waba_id IS NOT NULL
  AND TRIM(cl.meta_waba_id) <> '';

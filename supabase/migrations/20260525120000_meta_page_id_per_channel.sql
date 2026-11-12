-- Página do Facebook vinculada ao WhatsApp (alternativa a WABA na CAPI CTWA)

ALTER TABLE public.cliente_whatsapp_config
  ADD COLUMN IF NOT EXISTS meta_page_id text;

COMMENT ON COLUMN public.cliente_whatsapp_config.meta_page_id IS
  'ID da Página Facebook ligada ao WhatsApp deste canal (CAPI: user_data.page_id + ctwa_clid)';

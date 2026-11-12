-- Retenção de mídia nas conversas: após 35 dias remove binários/URLs do banco (job atendimento-media-purge).

ALTER TABLE public.cliente_whatsapp_inbox
  ADD COLUMN IF NOT EXISTS media_purged_at timestamptz;

COMMENT ON COLUMN public.cliente_whatsapp_inbox.media_purged_at IS
  'Quando a mídia (imagem/áudio/PDF/vídeo) foi removida do raw_payload; arquivo permanece no celular.';

CREATE INDEX IF NOT EXISTS idx_cliente_whatsapp_inbox_media_purge
  ON public.cliente_whatsapp_inbox (created_at)
  WHERE raw_payload IS NOT NULL AND media_purged_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_cliente_whatsapp_webhook_log_media_purge
  ON public.cliente_whatsapp_webhook_log (created_at)
  WHERE raw_payload IS NOT NULL;

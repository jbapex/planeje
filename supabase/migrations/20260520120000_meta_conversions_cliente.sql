-- Conversões Meta (Click to WhatsApp) por cliente
ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS meta_waba_id text,
  ADD COLUMN IF NOT EXISTS meta_dataset_id text,
  ADD COLUMN IF NOT EXISTS meta_conversions_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.clientes.meta_waba_id IS 'WhatsApp Business Account ID (WABA) para Conversions API';
COMMENT ON COLUMN public.clientes.meta_dataset_id IS 'Dataset ID Meta ligado ao WABA (Events Manager)';
COMMENT ON COLUMN public.clientes.meta_conversions_enabled IS 'Enviar QualifiedLead/Purchase à Meta ao marcar qualificado/comprou';

CREATE TABLE IF NOT EXISTS public.meta_conversion_event_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  contact_id uuid,
  lead_id uuid,
  event_name text NOT NULL,
  ctwa_clid text,
  success boolean NOT NULL DEFAULT false,
  meta_response jsonb,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_meta_conversion_log_cliente_created
  ON public.meta_conversion_event_log (cliente_id, created_at DESC);

COMMENT ON TABLE public.meta_conversion_event_log IS 'Log de envios Conversions API (Business Messaging / CTWA)';

ALTER TABLE public.meta_conversion_event_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "meta_conversion_log_staff_read" ON public.meta_conversion_event_log;
CREATE POLICY "meta_conversion_log_staff_read"
  ON public.meta_conversion_event_log FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('superadmin', 'admin', 'colaborador'))
    OR cliente_id IN (SELECT cliente_id FROM public.profiles WHERE id = auth.uid() AND role = 'cliente' AND cliente_id IS NOT NULL)
  );

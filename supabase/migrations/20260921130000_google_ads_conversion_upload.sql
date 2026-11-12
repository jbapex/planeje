-- Upload de conversões Google Ads (gclid): mapeamento por conta + log

ALTER TABLE public.cliente_google_ads_accounts
  ADD COLUMN IF NOT EXISTS conversions_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS conv_action_lead text,
  ADD COLUMN IF NOT EXISTS conv_action_qualified text,
  ADD COLUMN IF NOT EXISTS conv_action_purchase text;

COMMENT ON COLUMN public.cliente_google_ads_accounts.conversions_enabled IS
  'Devolver conversões (upload de cliques) ao Google Ads quando houver gclid';
COMMENT ON COLUMN public.cliente_google_ads_accounts.conv_action_lead IS
  'Resource name da ação de conversão para 1ª mensagem / conversa (LeadSubmitted)';
COMMENT ON COLUMN public.cliente_google_ads_accounts.conv_action_qualified IS
  'Resource name opcional para Qualificado (QualifiedLead)';
COMMENT ON COLUMN public.cliente_google_ads_accounts.conv_action_purchase IS
  'Resource name opcional para Compra (Purchase)';

CREATE TABLE IF NOT EXISTS public.google_conversion_event_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  contact_id uuid,
  lead_id uuid,
  gclid text,
  event_name text NOT NULL,
  conversion_action text,
  customer_id text,
  success boolean NOT NULL DEFAULT false,
  google_response jsonb,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_google_conversion_log_cliente_created
  ON public.google_conversion_event_log (cliente_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_google_conversion_log_gclid_event
  ON public.google_conversion_event_log (gclid, event_name)
  WHERE gclid IS NOT NULL AND success = true;

COMMENT ON TABLE public.google_conversion_event_log IS
  'Log de envios UploadClickConversions (Google Ads) a partir de gclid';

ALTER TABLE public.google_conversion_event_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "google_conversion_log_staff_read" ON public.google_conversion_event_log;
CREATE POLICY "google_conversion_log_staff_read"
  ON public.google_conversion_event_log FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('superadmin', 'admin', 'colaborador'))
    OR cliente_id IN (SELECT cliente_id FROM public.profiles WHERE id = auth.uid() AND role = 'cliente' AND cliente_id IS NOT NULL)
  );

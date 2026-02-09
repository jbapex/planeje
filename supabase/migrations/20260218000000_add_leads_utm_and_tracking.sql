-- Dados de rastreio Meta/UTM no lead (campanha, anúncio, etc.) quando o lead vem de contato com origem Meta Ads
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS utm_source text,
  ADD COLUMN IF NOT EXISTS utm_medium text,
  ADD COLUMN IF NOT EXISTS utm_campaign text,
  ADD COLUMN IF NOT EXISTS utm_content text,
  ADD COLUMN IF NOT EXISTS utm_term text,
  ADD COLUMN IF NOT EXISTS tracking_data jsonb;

COMMENT ON COLUMN public.leads.utm_source IS 'Fonte UTM (ex: facebook, instagram)';
COMMENT ON COLUMN public.leads.utm_campaign IS 'Nome da campanha (Meta Ads, etc.)';
COMMENT ON COLUMN public.leads.tracking_data IS 'Dados de rastreio (fbclid, ctwaClid, etc.) quando origem Meta Ads';

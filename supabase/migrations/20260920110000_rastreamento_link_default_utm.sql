-- UTM padrão no link rastreável (quando o anúncio/site não manda UTM na URL).
ALTER TABLE public.cliente_rastreamento_links
  ADD COLUMN IF NOT EXISTS default_utm_source text,
  ADD COLUMN IF NOT EXISTS default_utm_medium text,
  ADD COLUMN IF NOT EXISTS default_utm_campaign text,
  ADD COLUMN IF NOT EXISTS default_utm_content text,
  ADD COLUMN IF NOT EXISTS default_utm_term text;

COMMENT ON COLUMN public.cliente_rastreamento_links.default_utm_source IS
  'UTM source gravada no clique se a URL do /r/ não trouxer utm_source (ex.: Meta→site sem UTM)';
COMMENT ON COLUMN public.cliente_rastreamento_links.default_utm_campaign IS
  'UTM campaign padrão anexada ao link público e ao clique quando ausente na URL';

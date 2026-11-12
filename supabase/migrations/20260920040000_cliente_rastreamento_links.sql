-- Links rastreáveis por cliente (Google Ads / Meta→site / site → WhatsApp).
-- Aditivo: não altera tabelas existentes nem reaplica SQL anterior.

CREATE TABLE IF NOT EXISTS public.cliente_rastreamento_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL,
  slug text NOT NULL,
  label text,
  destination_phone text NOT NULL,
  default_origin text NOT NULL DEFAULT 'site',
  whatsapp_config_id uuid,
  is_default boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cliente_rastreamento_links_slug_format
    CHECK (slug ~ '^[a-z0-9][a-z0-9_-]{2,47}$'),
  CONSTRAINT cliente_rastreamento_links_origin_check
    CHECK (default_origin IN ('site', 'google_ads', 'meta_ads')),
  CONSTRAINT cliente_rastreamento_links_phone_digits
    CHECK (destination_phone ~ '^[0-9]{10,15}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS cliente_rastreamento_links_slug_uidx
  ON public.cliente_rastreamento_links (slug);

CREATE INDEX IF NOT EXISTS idx_cliente_rastreamento_links_cliente
  ON public.cliente_rastreamento_links (cliente_id);

CREATE UNIQUE INDEX IF NOT EXISTS cliente_rastreamento_links_one_default
  ON public.cliente_rastreamento_links (cliente_id)
  WHERE is_default AND is_active;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'clientes') THEN
    ALTER TABLE public.cliente_rastreamento_links
      DROP CONSTRAINT IF EXISTS fk_cliente_rastreamento_links_cliente;
    ALTER TABLE public.cliente_rastreamento_links
      ADD CONSTRAINT fk_cliente_rastreamento_links_cliente
      FOREIGN KEY (cliente_id) REFERENCES public.clientes(id) ON DELETE CASCADE;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'cliente_whatsapp_config') THEN
    ALTER TABLE public.cliente_rastreamento_links
      DROP CONSTRAINT IF EXISTS fk_cliente_rastreamento_links_whatsapp;
    ALTER TABLE public.cliente_rastreamento_links
      ADD CONSTRAINT fk_cliente_rastreamento_links_whatsapp
      FOREIGN KEY (whatsapp_config_id) REFERENCES public.cliente_whatsapp_config(id) ON DELETE SET NULL;
  END IF;
END $$;

COMMENT ON TABLE public.cliente_rastreamento_links IS
  'Link público do Planeje (/r/:slug) que abre o WhatsApp do cliente com código de casamento';
COMMENT ON COLUMN public.cliente_rastreamento_links.default_origin IS
  'Origem quando o clique não traz gclid/fbclid/UTM de anúncio: site | google_ads | meta_ads';
COMMENT ON COLUMN public.cliente_rastreamento_links.destination_phone IS
  'Número WhatsApp (só dígitos) já ligado no Rastreamento';

CREATE OR REPLACE FUNCTION public.update_cliente_rastreamento_links_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_update_cliente_rastreamento_links_updated_at
  ON public.cliente_rastreamento_links;
CREATE TRIGGER trigger_update_cliente_rastreamento_links_updated_at
  BEFORE UPDATE ON public.cliente_rastreamento_links
  FOR EACH ROW
  EXECUTE FUNCTION public.update_cliente_rastreamento_links_updated_at();

CREATE TABLE IF NOT EXISTS public.cliente_rastreamento_link_clicks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id uuid NOT NULL,
  cliente_id uuid NOT NULL,
  match_code text NOT NULL,
  gclid text,
  fbclid text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  landing_query text,
  referer text,
  user_agent text,
  origin_resolved text NOT NULL DEFAULT 'site',
  clicked_at timestamptz NOT NULL DEFAULT now(),
  matched_at timestamptz,
  matched_from_jid text,
  CONSTRAINT cliente_rastreamento_link_clicks_code_format
    CHECK (match_code ~ '^PJ-[A-Z0-9]{6}$'),
  CONSTRAINT cliente_rastreamento_link_clicks_origin_check
    CHECK (origin_resolved IN ('site', 'google_ads', 'meta_ads'))
);

CREATE UNIQUE INDEX IF NOT EXISTS cliente_rastreamento_link_clicks_code_uidx
  ON public.cliente_rastreamento_link_clicks (match_code);

CREATE INDEX IF NOT EXISTS idx_cliente_rastreamento_link_clicks_link
  ON public.cliente_rastreamento_link_clicks (link_id, clicked_at DESC);

CREATE INDEX IF NOT EXISTS idx_cliente_rastreamento_link_clicks_cliente_open
  ON public.cliente_rastreamento_link_clicks (cliente_id, clicked_at DESC)
  WHERE matched_at IS NULL;

DO $$
BEGIN
  ALTER TABLE public.cliente_rastreamento_link_clicks
    DROP CONSTRAINT IF EXISTS fk_cliente_rastreamento_link_clicks_link;
  ALTER TABLE public.cliente_rastreamento_link_clicks
    ADD CONSTRAINT fk_cliente_rastreamento_link_clicks_link
    FOREIGN KEY (link_id) REFERENCES public.cliente_rastreamento_links(id) ON DELETE CASCADE;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'clientes') THEN
    ALTER TABLE public.cliente_rastreamento_link_clicks
      DROP CONSTRAINT IF EXISTS fk_cliente_rastreamento_link_clicks_cliente;
    ALTER TABLE public.cliente_rastreamento_link_clicks
      ADD CONSTRAINT fk_cliente_rastreamento_link_clicks_cliente
      FOREIGN KEY (cliente_id) REFERENCES public.clientes(id) ON DELETE CASCADE;
  END IF;
END $$;

COMMENT ON TABLE public.cliente_rastreamento_link_clicks IS
  'Clique no link rastreável; matched_at quando o código aparece na 1ª mensagem WhatsApp';
COMMENT ON COLUMN public.cliente_rastreamento_link_clicks.match_code IS
  'Código curto (PJ-XXXXXX) embutido no texto inicial do wa.me';

ALTER TABLE public.cliente_rastreamento_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cliente_rastreamento_link_clicks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cliente_rastreamento_links_superadmin_all" ON public.cliente_rastreamento_links;
CREATE POLICY "cliente_rastreamento_links_superadmin_all"
  ON public.cliente_rastreamento_links FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin'));

DROP POLICY IF EXISTS "cliente_rastreamento_links_admin_colaborador" ON public.cliente_rastreamento_links;
CREATE POLICY "cliente_rastreamento_links_admin_colaborador"
  ON public.cliente_rastreamento_links FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'colaborador')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'colaborador')));

DROP POLICY IF EXISTS "cliente_rastreamento_links_cliente_own" ON public.cliente_rastreamento_links;
CREATE POLICY "cliente_rastreamento_links_cliente_own"
  ON public.cliente_rastreamento_links FOR SELECT TO authenticated
  USING (
    cliente_id IN (SELECT cliente_id FROM public.profiles WHERE id = auth.uid() AND role = 'cliente' AND cliente_id IS NOT NULL)
  );

-- Cliques: agência lê; escrita só via service_role (função pública de redirect / webhook).
DROP POLICY IF EXISTS "cliente_rastreamento_link_clicks_superadmin_all" ON public.cliente_rastreamento_link_clicks;
CREATE POLICY "cliente_rastreamento_link_clicks_superadmin_all"
  ON public.cliente_rastreamento_link_clicks FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin'));

DROP POLICY IF EXISTS "cliente_rastreamento_link_clicks_admin_colaborador" ON public.cliente_rastreamento_link_clicks;
CREATE POLICY "cliente_rastreamento_link_clicks_admin_colaborador"
  ON public.cliente_rastreamento_link_clicks FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'colaborador')));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cliente_rastreamento_links TO authenticated;
GRANT SELECT ON public.cliente_rastreamento_link_clicks TO authenticated;
GRANT ALL ON public.cliente_rastreamento_links TO service_role;
GRANT ALL ON public.cliente_rastreamento_link_clicks TO service_role;

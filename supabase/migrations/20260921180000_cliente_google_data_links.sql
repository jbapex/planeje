-- Vínculos opt-in de Analytics, Meu Negócio e Tag Manager por cliente.
-- Não liga a carteira em massa. Não reaplicar.

CREATE TABLE IF NOT EXISTS public.cliente_google_analytics_properties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  cliente_id uuid NOT NULL,
  property_id text NOT NULL,
  property_name text,
  account_id text,
  account_name text,
  is_active boolean NOT NULL DEFAULT true
);

CREATE UNIQUE INDEX IF NOT EXISTS cliente_google_analytics_properties_unique
  ON public.cliente_google_analytics_properties (cliente_id, property_id);

CREATE INDEX IF NOT EXISTS idx_cliente_google_analytics_properties_cliente
  ON public.cliente_google_analytics_properties (cliente_id);

CREATE TABLE IF NOT EXISTS public.cliente_google_business_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  cliente_id uuid NOT NULL,
  location_name text NOT NULL,
  location_title text,
  account_name text,
  is_active boolean NOT NULL DEFAULT true
);

CREATE UNIQUE INDEX IF NOT EXISTS cliente_google_business_locations_unique
  ON public.cliente_google_business_locations (cliente_id, location_name);

CREATE INDEX IF NOT EXISTS idx_cliente_google_business_locations_cliente
  ON public.cliente_google_business_locations (cliente_id);

CREATE TABLE IF NOT EXISTS public.cliente_google_tag_containers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  cliente_id uuid NOT NULL,
  account_id text NOT NULL,
  container_id text NOT NULL,
  container_name text,
  public_id text,
  is_active boolean NOT NULL DEFAULT true
);

CREATE UNIQUE INDEX IF NOT EXISTS cliente_google_tag_containers_unique
  ON public.cliente_google_tag_containers (cliente_id, container_id);

CREATE INDEX IF NOT EXISTS idx_cliente_google_tag_containers_cliente
  ON public.cliente_google_tag_containers (cliente_id);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'clientes') THEN
    ALTER TABLE public.cliente_google_analytics_properties
      DROP CONSTRAINT IF EXISTS fk_cliente_google_analytics_properties_cliente;
    ALTER TABLE public.cliente_google_analytics_properties
      ADD CONSTRAINT fk_cliente_google_analytics_properties_cliente
      FOREIGN KEY (cliente_id) REFERENCES public.clientes(id) ON DELETE CASCADE;
    ALTER TABLE public.cliente_google_business_locations
      DROP CONSTRAINT IF EXISTS fk_cliente_google_business_locations_cliente;
    ALTER TABLE public.cliente_google_business_locations
      ADD CONSTRAINT fk_cliente_google_business_locations_cliente
      FOREIGN KEY (cliente_id) REFERENCES public.clientes(id) ON DELETE CASCADE;
    ALTER TABLE public.cliente_google_tag_containers
      DROP CONSTRAINT IF EXISTS fk_cliente_google_tag_containers_cliente;
    ALTER TABLE public.cliente_google_tag_containers
      ADD CONSTRAINT fk_cliente_google_tag_containers_cliente
      FOREIGN KEY (cliente_id) REFERENCES public.clientes(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.touch_cliente_google_data_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_touch_cliente_google_analytics_properties ON public.cliente_google_analytics_properties;
CREATE TRIGGER trigger_touch_cliente_google_analytics_properties
  BEFORE UPDATE ON public.cliente_google_analytics_properties
  FOR EACH ROW EXECUTE FUNCTION public.touch_cliente_google_data_updated_at();

DROP TRIGGER IF EXISTS trigger_touch_cliente_google_business_locations ON public.cliente_google_business_locations;
CREATE TRIGGER trigger_touch_cliente_google_business_locations
  BEFORE UPDATE ON public.cliente_google_business_locations
  FOR EACH ROW EXECUTE FUNCTION public.touch_cliente_google_data_updated_at();

DROP TRIGGER IF EXISTS trigger_touch_cliente_google_tag_containers ON public.cliente_google_tag_containers;
CREATE TRIGGER trigger_touch_cliente_google_tag_containers
  BEFORE UPDATE ON public.cliente_google_tag_containers
  FOR EACH ROW EXECUTE FUNCTION public.touch_cliente_google_data_updated_at();

ALTER TABLE public.cliente_google_analytics_properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cliente_google_business_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cliente_google_tag_containers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cliente_google_analytics_properties_select" ON public.cliente_google_analytics_properties;
CREATE POLICY "cliente_google_analytics_properties_select"
  ON public.cliente_google_analytics_properties FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "cliente_google_analytics_properties_insert" ON public.cliente_google_analytics_properties;
CREATE POLICY "cliente_google_analytics_properties_insert"
  ON public.cliente_google_analytics_properties FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "cliente_google_analytics_properties_update" ON public.cliente_google_analytics_properties;
CREATE POLICY "cliente_google_analytics_properties_update"
  ON public.cliente_google_analytics_properties FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "cliente_google_analytics_properties_delete" ON public.cliente_google_analytics_properties;
CREATE POLICY "cliente_google_analytics_properties_delete"
  ON public.cliente_google_analytics_properties FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "cliente_google_business_locations_select" ON public.cliente_google_business_locations;
CREATE POLICY "cliente_google_business_locations_select"
  ON public.cliente_google_business_locations FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "cliente_google_business_locations_insert" ON public.cliente_google_business_locations;
CREATE POLICY "cliente_google_business_locations_insert"
  ON public.cliente_google_business_locations FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "cliente_google_business_locations_update" ON public.cliente_google_business_locations;
CREATE POLICY "cliente_google_business_locations_update"
  ON public.cliente_google_business_locations FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "cliente_google_business_locations_delete" ON public.cliente_google_business_locations;
CREATE POLICY "cliente_google_business_locations_delete"
  ON public.cliente_google_business_locations FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "cliente_google_tag_containers_select" ON public.cliente_google_tag_containers;
CREATE POLICY "cliente_google_tag_containers_select"
  ON public.cliente_google_tag_containers FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "cliente_google_tag_containers_insert" ON public.cliente_google_tag_containers;
CREATE POLICY "cliente_google_tag_containers_insert"
  ON public.cliente_google_tag_containers FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "cliente_google_tag_containers_update" ON public.cliente_google_tag_containers;
CREATE POLICY "cliente_google_tag_containers_update"
  ON public.cliente_google_tag_containers FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "cliente_google_tag_containers_delete" ON public.cliente_google_tag_containers;
CREATE POLICY "cliente_google_tag_containers_delete"
  ON public.cliente_google_tag_containers FOR DELETE TO authenticated USING (true);

COMMENT ON TABLE public.cliente_google_analytics_properties IS 'Vínculo opt-in cliente ↔ propriedade GA4';
COMMENT ON TABLE public.cliente_google_business_locations IS 'Vínculo opt-in cliente ↔ ficha Google Meu Negócio';
COMMENT ON TABLE public.cliente_google_tag_containers IS 'Vínculo opt-in cliente ↔ contêiner Tag Manager';

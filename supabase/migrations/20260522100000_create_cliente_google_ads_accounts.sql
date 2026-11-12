-- Contas Google Ads vinculadas por cliente (espelha cliente_meta_accounts)

CREATE TABLE IF NOT EXISTS public.cliente_google_ads_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  cliente_id uuid NOT NULL,
  google_customer_id text NOT NULL,
  google_customer_name text,
  is_active boolean NOT NULL DEFAULT true,
  notes text
);

CREATE UNIQUE INDEX IF NOT EXISTS cliente_google_ads_accounts_unique
  ON public.cliente_google_ads_accounts (cliente_id, google_customer_id);

CREATE INDEX IF NOT EXISTS idx_cliente_google_ads_accounts_cliente
  ON public.cliente_google_ads_accounts (cliente_id);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'clientes') THEN
    ALTER TABLE public.cliente_google_ads_accounts
      ADD CONSTRAINT fk_cliente_google_ads_accounts_cliente
      FOREIGN KEY (cliente_id) REFERENCES public.clientes(id) ON DELETE CASCADE;
  END IF;
END $$;

COMMENT ON TABLE public.cliente_google_ads_accounts IS 'Vínculo cliente ↔ conta Google Ads (customer ID numérico)';

CREATE OR REPLACE FUNCTION update_cliente_google_ads_accounts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_cliente_google_ads_accounts_updated_at ON public.cliente_google_ads_accounts;
CREATE TRIGGER trigger_update_cliente_google_ads_accounts_updated_at
  BEFORE UPDATE ON public.cliente_google_ads_accounts
  FOR EACH ROW
  EXECUTE FUNCTION update_cliente_google_ads_accounts_updated_at();

ALTER TABLE public.cliente_google_ads_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cliente_google_ads_accounts_select" ON public.cliente_google_ads_accounts;
CREATE POLICY "cliente_google_ads_accounts_select"
  ON public.cliente_google_ads_accounts FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "cliente_google_ads_accounts_insert" ON public.cliente_google_ads_accounts;
CREATE POLICY "cliente_google_ads_accounts_insert"
  ON public.cliente_google_ads_accounts FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "cliente_google_ads_accounts_update" ON public.cliente_google_ads_accounts;
CREATE POLICY "cliente_google_ads_accounts_update"
  ON public.cliente_google_ads_accounts FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "cliente_google_ads_accounts_delete" ON public.cliente_google_ads_accounts;
CREATE POLICY "cliente_google_ads_accounts_delete"
  ON public.cliente_google_ads_accounts FOR DELETE TO authenticated USING (true);

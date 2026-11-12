-- Vínculo cliente ↔ página Facebook / Instagram Business (System User da agência).
-- Distinto de cliente_meta_accounts (contas de anúncio) e do token CTWA do Rastreamento.

CREATE TABLE IF NOT EXISTS public.cliente_social_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  platform text NOT NULL,
  meta_id text NOT NULL,
  display_name text,
  username text,
  page_id text,
  profile_picture_url text,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  CONSTRAINT cliente_social_accounts_platform_valid
    CHECK (platform IN ('facebook_page', 'instagram')),
  CONSTRAINT cliente_social_accounts_meta_id_valid
    CHECK (char_length(btrim(meta_id)) BETWEEN 1 AND 80),
  CONSTRAINT cliente_social_accounts_unique
    UNIQUE (cliente_id, platform, meta_id)
);

CREATE INDEX IF NOT EXISTS idx_cliente_social_accounts_cliente
  ON public.cliente_social_accounts (cliente_id)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_cliente_social_accounts_meta
  ON public.cliente_social_accounts (platform, meta_id)
  WHERE is_active = true;

CREATE OR REPLACE FUNCTION public.update_cliente_social_accounts_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = clock_timestamp();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_update_cliente_social_accounts_updated_at
  ON public.cliente_social_accounts;
CREATE TRIGGER trigger_update_cliente_social_accounts_updated_at
  BEFORE UPDATE ON public.cliente_social_accounts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_cliente_social_accounts_updated_at();

ALTER TABLE public.cliente_social_accounts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.cliente_social_accounts
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.cliente_social_accounts TO authenticated;
GRANT ALL ON TABLE public.cliente_social_accounts TO service_role;

DROP POLICY IF EXISTS cliente_social_accounts_superadmin_all ON public.cliente_social_accounts;
DROP POLICY IF EXISTS cliente_social_accounts_admin_colaborador ON public.cliente_social_accounts;

CREATE POLICY cliente_social_accounts_superadmin_all
  ON public.cliente_social_accounts FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'superadmin' AND status = 'active'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'superadmin' AND status = 'active'
  ));

CREATE POLICY cliente_social_accounts_admin_colaborador
  ON public.cliente_social_accounts FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin', 'colaborador') AND status = 'active'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin', 'colaborador') AND status = 'active'
  ));

COMMENT ON TABLE public.cliente_social_accounts IS
  'Páginas Facebook e contas Instagram Business ligadas ao cliente para Redes Sociais (token System User da agência).';

-- ID do post/mídia na Meta para conferência e comprovante automático.
ALTER TABLE public.task_channel_publications
  ADD COLUMN IF NOT EXISTS meta_post_id text;

COMMENT ON COLUMN public.task_channel_publications.meta_post_id IS
  'ID do post ou mídia na Graph API (Facebook/Instagram), quando publicado pela integração.';

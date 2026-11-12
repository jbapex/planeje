-- Miniaturas de anúncio: um arquivo por anúncio no Storage, URL estável no rastreio.
-- Não reaplicar. Não grava a imagem em Base64 no JSON do lead.

CREATE TABLE IF NOT EXISTS public.meta_ad_thumbnails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  asset_key text NOT NULL,
  ad_id text,
  storage_path text NOT NULL,
  public_url text NOT NULL,
  source_url text,
  byte_size integer,
  content_type text,
  CONSTRAINT meta_ad_thumbnails_asset_key_unique UNIQUE (asset_key),
  CONSTRAINT meta_ad_thumbnails_asset_key_valid
    CHECK (char_length(btrim(asset_key)) BETWEEN 3 AND 80)
);

CREATE INDEX IF NOT EXISTS idx_meta_ad_thumbnails_ad_id
  ON public.meta_ad_thumbnails (ad_id)
  WHERE ad_id IS NOT NULL;

ALTER TABLE public.meta_ad_thumbnails ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.meta_ad_thumbnails
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.meta_ad_thumbnails TO authenticated;
GRANT ALL ON TABLE public.meta_ad_thumbnails TO service_role;

DROP POLICY IF EXISTS meta_ad_thumbnails_agency_select ON public.meta_ad_thumbnails;
CREATE POLICY meta_ad_thumbnails_agency_select
  ON public.meta_ad_thumbnails FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('superadmin', 'admin', 'colaborador') AND status = 'active'
  ));

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'ad-thumbnails',
  'ad-thumbnails',
  true,
  524288,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS ad_thumbnails_select ON storage.objects;
CREATE POLICY ad_thumbnails_select
  ON storage.objects FOR SELECT
  USING (bucket_id = 'ad-thumbnails');

DROP POLICY IF EXISTS ad_thumbnails_insert_service ON storage.objects;
CREATE POLICY ad_thumbnails_insert_service
  ON storage.objects FOR INSERT
  TO service_role
  WITH CHECK (bucket_id = 'ad-thumbnails');

DROP POLICY IF EXISTS ad_thumbnails_update_service ON storage.objects;
CREATE POLICY ad_thumbnails_update_service
  ON storage.objects FOR UPDATE
  TO service_role
  USING (bucket_id = 'ad-thumbnails')
  WITH CHECK (bucket_id = 'ad-thumbnails');

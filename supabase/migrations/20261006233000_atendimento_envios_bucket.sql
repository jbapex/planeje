-- Arquivos grandes das Conversas da agência (até 1 GB).
-- A loja continua no envio direto de até 4 MB e não usa este bucket.
-- Aplicar uma vez.

BEGIN;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('atendimento-envios', 'atendimento-envios', false, 1073741824, NULL)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS atendimento_envios_select ON storage.objects;
CREATE POLICY atendimento_envios_select
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'atendimento-envios'
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('superadmin', 'admin', 'colaborador')
    )
  );

DROP POLICY IF EXISTS atendimento_envios_insert ON storage.objects;
CREATE POLICY atendimento_envios_insert
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'atendimento-envios'
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('superadmin', 'admin', 'colaborador')
    )
  );

DROP POLICY IF EXISTS atendimento_envios_delete ON storage.objects;
CREATE POLICY atendimento_envios_delete
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'atendimento-envios'
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('superadmin', 'admin', 'colaborador')
    )
  );

NOTIFY pgrst, 'reload schema';
COMMIT;

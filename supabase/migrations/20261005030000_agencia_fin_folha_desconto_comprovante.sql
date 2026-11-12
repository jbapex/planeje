-- Desconto do mês na folha e comprovante privado do pagamento/vale.
-- Aplicar uma vez. Não reaplicar.

BEGIN;

ALTER TABLE public.agencia_fin_folha
  ADD COLUMN IF NOT EXISTS desconto numeric(14, 2) NOT NULL DEFAULT 0;

ALTER TABLE public.agencia_fin_folha
  ADD COLUMN IF NOT EXISTS desconto_motivo text NOT NULL DEFAULT '';

ALTER TABLE public.agencia_fin_folha
  ADD COLUMN IF NOT EXISTS comprovante_pagamento_path text;

ALTER TABLE public.agencia_fin_folha
  ADD COLUMN IF NOT EXISTS comprovante_vale_path text;

ALTER TABLE public.agencia_fin_folha
  DROP CONSTRAINT IF EXISTS agencia_fin_folha_desconto_check;

ALTER TABLE public.agencia_fin_folha
  ADD CONSTRAINT agencia_fin_folha_desconto_check CHECK (desconto >= 0);

ALTER TABLE public.agencia_fin_folha
  DROP CONSTRAINT IF EXISTS agencia_fin_folha_desconto_motivo_check;

ALTER TABLE public.agencia_fin_folha
  ADD CONSTRAINT agencia_fin_folha_desconto_motivo_check
  CHECK (char_length(desconto_motivo) <= 120);

COMMENT ON COLUMN public.agencia_fin_folha.desconto IS
  'Abatimento só do pagamento do mês (restante + extras). Não altera o vale nem o salário do contrato.';

COMMENT ON COLUMN public.agencia_fin_folha.desconto_motivo IS
  'Motivo do desconto. Obrigatório na tela quando desconto > 0.';

COMMENT ON COLUMN public.agencia_fin_folha.comprovante_pagamento_path IS
  'Caminho no bucket financeiro-comprovantes do comprovante do salário/pagamento.';

COMMENT ON COLUMN public.agencia_fin_folha.comprovante_vale_path IS
  'Caminho no bucket financeiro-comprovantes do comprovante do vale.';

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'financeiro-comprovantes',
  'financeiro-comprovantes',
  false,
  8388608,
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS financeiro_comprovantes_select ON storage.objects;
CREATE POLICY financeiro_comprovantes_select
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'financeiro-comprovantes'
    AND public.get_my_role() IN ('superadmin', 'admin')
  );

DROP POLICY IF EXISTS financeiro_comprovantes_insert ON storage.objects;
CREATE POLICY financeiro_comprovantes_insert
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'financeiro-comprovantes'
    AND public.get_my_role() IN ('superadmin', 'admin')
  );

DROP POLICY IF EXISTS financeiro_comprovantes_update ON storage.objects;
CREATE POLICY financeiro_comprovantes_update
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'financeiro-comprovantes'
    AND public.get_my_role() IN ('superadmin', 'admin')
  )
  WITH CHECK (
    bucket_id = 'financeiro-comprovantes'
    AND public.get_my_role() IN ('superadmin', 'admin')
  );

DROP POLICY IF EXISTS financeiro_comprovantes_delete ON storage.objects;
CREATE POLICY financeiro_comprovantes_delete
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'financeiro-comprovantes'
    AND public.get_my_role() IN ('superadmin', 'admin')
  );

NOTIFY pgrst, 'reload schema';
COMMIT;

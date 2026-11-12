-- O salário se divide em porcentagem entre vale e pagamento.

BEGIN;

ALTER TABLE public.agencia_fin_contratos
  ADD COLUMN IF NOT EXISTS pct_vale smallint NOT NULL DEFAULT 0;

ALTER TABLE public.agencia_fin_contratos
  DROP CONSTRAINT IF EXISTS agencia_fin_contratos_pct_vale_check;

ALTER TABLE public.agencia_fin_contratos
  ADD CONSTRAINT agencia_fin_contratos_pct_vale_check
  CHECK (pct_vale BETWEEN 0 AND 100);

ALTER TABLE public.agencia_fin_folha
  ADD COLUMN IF NOT EXISTS pct_vale smallint NOT NULL DEFAULT 0;

ALTER TABLE public.agencia_fin_folha
  DROP CONSTRAINT IF EXISTS agencia_fin_folha_pct_vale_check;

ALTER TABLE public.agencia_fin_folha
  ADD CONSTRAINT agencia_fin_folha_pct_vale_check
  CHECK (pct_vale BETWEEN 0 AND 100);

NOTIFY pgrst, 'reload schema';
COMMIT;

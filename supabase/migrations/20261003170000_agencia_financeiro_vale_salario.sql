-- Pagamento da equipe em duas partes: vale e salário.

BEGIN;

ALTER TABLE public.agencia_fin_contratos
  ADD COLUMN IF NOT EXISTS vale numeric(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dia_vale smallint;

ALTER TABLE public.agencia_fin_contratos
  DROP CONSTRAINT IF EXISTS agencia_fin_contratos_vale_check;

ALTER TABLE public.agencia_fin_contratos
  ADD CONSTRAINT agencia_fin_contratos_vale_check CHECK (vale >= 0);

ALTER TABLE public.agencia_fin_contratos
  DROP CONSTRAINT IF EXISTS agencia_fin_contratos_dia_vale_check;

ALTER TABLE public.agencia_fin_contratos
  ADD CONSTRAINT agencia_fin_contratos_dia_vale_check
  CHECK (dia_vale IS NULL OR (dia_vale BETWEEN 1 AND 28));

ALTER TABLE public.agencia_fin_folha
  ADD COLUMN IF NOT EXISTS vale numeric(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vale_status text NOT NULL DEFAULT 'previsto',
  ADD COLUMN IF NOT EXISTS vale_pago_em date,
  ADD COLUMN IF NOT EXISTS vale_lancamento_id uuid REFERENCES public.agencia_fin_lancamentos(id) ON DELETE SET NULL;

ALTER TABLE public.agencia_fin_folha
  DROP CONSTRAINT IF EXISTS agencia_fin_folha_vale_check;

ALTER TABLE public.agencia_fin_folha
  ADD CONSTRAINT agencia_fin_folha_vale_check CHECK (vale >= 0);

ALTER TABLE public.agencia_fin_folha
  DROP CONSTRAINT IF EXISTS agencia_fin_folha_vale_status_check;

ALTER TABLE public.agencia_fin_folha
  ADD CONSTRAINT agencia_fin_folha_vale_status_check
  CHECK (vale_status IN ('previsto', 'pago'));

NOTIFY pgrst, 'reload schema';
COMMIT;

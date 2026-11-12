-- Início na base, cobrança em duas parcelas no mês (dia 1 e dia 2).
-- Aplicar uma vez em produção após revisão.

BEGIN;

ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS inicio_na_base date,
  ADD COLUMN IF NOT EXISTS cobranca_parcelada boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS dia_cobranca_2 smallint;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'clientes_dia_cobranca_2_check'
  ) THEN
    ALTER TABLE public.clientes
      ADD CONSTRAINT clientes_dia_cobranca_2_check
      CHECK (dia_cobranca_2 IS NULL OR (dia_cobranca_2 BETWEEN 1 AND 28));
  END IF;
END $$;

COMMENT ON COLUMN public.clientes.inicio_na_base IS
  'Data em que o cliente entrou na base/contrato ativo. Usada no Financeiro; distinta de created_at do cadastro.';
COMMENT ON COLUMN public.clientes.cobranca_parcelada IS
  'Quando true, a mensalidade vence em dia_cobranca e dia_cobranca_2 no mesmo mês.';
COMMENT ON COLUMN public.clientes.dia_cobranca_2 IS
  'Dia do mês (1–28) da 2ª parcela quando cobranca_parcelada é true.';

COMMIT;

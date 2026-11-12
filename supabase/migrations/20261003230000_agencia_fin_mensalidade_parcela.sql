-- Duas parcelas de mensalidade no mesmo mês (cliente com cobranca_parcelada).
-- Aplicar uma vez.

BEGIN;

ALTER TABLE public.agencia_fin_lancamentos
  ADD COLUMN IF NOT EXISTS parcela_mensalidade smallint NOT NULL DEFAULT 1;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'agencia_fin_lancamentos_parcela_mensalidade_check'
  ) THEN
    ALTER TABLE public.agencia_fin_lancamentos
      ADD CONSTRAINT agencia_fin_lancamentos_parcela_mensalidade_check
      CHECK (parcela_mensalidade BETWEEN 1 AND 2);
  END IF;
END $$;

COMMENT ON COLUMN public.agencia_fin_lancamentos.parcela_mensalidade IS
  '1 ou 2 quando origem=mensalidade e o cliente divide a mensalidade no mês.';

DROP INDEX IF EXISTS public.agencia_fin_lancamentos_mensalidade_unica;

CREATE UNIQUE INDEX IF NOT EXISTS agencia_fin_lancamentos_mensalidade_parcela_unica
  ON public.agencia_fin_lancamentos (cliente_id, competencia, parcela_mensalidade)
  WHERE origem = 'mensalidade' AND status <> 'cancelado' AND cliente_id IS NOT NULL;

COMMIT;

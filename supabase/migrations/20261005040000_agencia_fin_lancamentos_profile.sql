-- Colaborador no lançamento (folha e despesas avulsas).
-- Preenche profile_id a partir da folha já ligada.

BEGIN;

ALTER TABLE public.agencia_fin_lancamentos
  ADD COLUMN IF NOT EXISTS profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS agencia_fin_lancamentos_profile_idx
  ON public.agencia_fin_lancamentos (profile_id)
  WHERE profile_id IS NOT NULL;

COMMENT ON COLUMN public.agencia_fin_lancamentos.profile_id IS
  'Colaborador do lançamento (salário, vale ou despesa ligada à pessoa).';

UPDATE public.agencia_fin_lancamentos l
SET profile_id = f.profile_id
FROM public.agencia_fin_folha f
WHERE l.profile_id IS NULL
  AND f.lancamento_id = l.id
  AND f.profile_id IS NOT NULL;

UPDATE public.agencia_fin_lancamentos l
SET profile_id = f.profile_id
FROM public.agencia_fin_folha f
WHERE l.profile_id IS NULL
  AND f.vale_lancamento_id = l.id
  AND f.profile_id IS NOT NULL;

COMMIT;

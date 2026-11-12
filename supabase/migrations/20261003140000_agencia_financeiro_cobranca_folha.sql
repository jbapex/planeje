-- Cobrança: marca de boleto enviado na mensalidade.
-- Folha: histórico de salário, função, extras e forma de pagamento.
-- Sem emissão de boleto, nota ou banco.

BEGIN;

ALTER TABLE public.agencia_fin_lancamentos
  ADD COLUMN IF NOT EXISTS boleto_em date;

COMMENT ON COLUMN public.agencia_fin_lancamentos.boleto_em IS
  'Dia em que o boleto foi marcado como enviado. Nulo = ainda não enviado. Não emite boleto.';

ALTER TABLE public.agencia_fin_lancamentos
  DROP CONSTRAINT IF EXISTS agencia_fin_lancamentos_origem_check;

ALTER TABLE public.agencia_fin_lancamentos
  ADD CONSTRAINT agencia_fin_lancamentos_origem_check
  CHECK (origem IN ('mensalidade', 'manual', 'folha'));

CREATE TABLE IF NOT EXISTS public.agencia_fin_folha (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competencia date NOT NULL CHECK (competencia = date_trunc('month', competencia)::date),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  funcao text NOT NULL DEFAULT '' CHECK (char_length(funcao) <= 80),
  salario numeric(14, 2) NOT NULL CHECK (salario > 0),
  extras numeric(14, 2) NOT NULL DEFAULT 0 CHECK (extras >= 0),
  forma text NOT NULL DEFAULT 'pix' CHECK (forma IN ('pix', 'transferencia', 'dinheiro', 'outro')),
  status text NOT NULL DEFAULT 'previsto' CHECK (status IN ('previsto', 'pago')),
  pago_em date,
  lancamento_id uuid REFERENCES public.agencia_fin_lancamentos(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS agencia_fin_folha_pessoa_mes
  ON public.agencia_fin_folha (profile_id, competencia);

CREATE INDEX IF NOT EXISTS agencia_fin_folha_competencia_idx
  ON public.agencia_fin_folha (competencia, status);

DROP TRIGGER IF EXISTS agencia_fin_folha_touch ON public.agencia_fin_folha;
CREATE TRIGGER agencia_fin_folha_touch
  BEFORE UPDATE ON public.agencia_fin_folha
  FOR EACH ROW EXECUTE FUNCTION public.agencia_fin_touch_updated_at();

ALTER TABLE public.agencia_fin_folha ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agencia_fin_folha_admin ON public.agencia_fin_folha;
CREATE POLICY agencia_fin_folha_admin ON public.agencia_fin_folha
  FOR ALL TO authenticated
  USING (public.get_my_role() IN ('superadmin', 'admin'))
  WITH CHECK (public.get_my_role() IN ('superadmin', 'admin'));

REVOKE ALL ON public.agencia_fin_folha FROM authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agencia_fin_folha TO authenticated;
GRANT ALL ON public.agencia_fin_folha TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;

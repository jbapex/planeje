-- Fornecedores e custos/despesas recorrentes da agência.
-- Folha (salário/vale) continua só na Equipe; estes fixos entram em Lançamentos/Caixa.

BEGIN;

CREATE TABLE IF NOT EXISTS public.agencia_fin_fornecedores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL CHECK (char_length(btrim(nome)) BETWEEN 2 AND 80),
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS agencia_fin_fornecedores_nome_lower
  ON public.agencia_fin_fornecedores (lower(btrim(nome)));

CREATE INDEX IF NOT EXISTS agencia_fin_fornecedores_ativo_idx
  ON public.agencia_fin_fornecedores (ativo, nome);

DROP TRIGGER IF EXISTS agencia_fin_fornecedores_touch ON public.agencia_fin_fornecedores;
CREATE TRIGGER agencia_fin_fornecedores_touch
  BEFORE UPDATE ON public.agencia_fin_fornecedores
  FOR EACH ROW EXECUTE FUNCTION public.agencia_fin_touch_updated_at();

CREATE TABLE IF NOT EXISTS public.agencia_fin_recorrencias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fornecedor_id uuid REFERENCES public.agencia_fin_fornecedores(id) ON DELETE SET NULL,
  grupo text NOT NULL CHECK (grupo IN ('custo', 'despesa')),
  categoria_id uuid NOT NULL REFERENCES public.agencia_fin_categorias(id),
  descricao text NOT NULL CHECK (char_length(btrim(descricao)) BETWEEN 1 AND 200),
  valor numeric(14, 2) NOT NULL CHECK (valor > 0),
  dia_vencimento smallint NOT NULL DEFAULT 10
    CHECK (dia_vencimento BETWEEN 1 AND 28),
  termina_em date
    CHECK (termina_em IS NULL OR termina_em = date_trunc('month', termina_em)::date),
  ativa boolean NOT NULL DEFAULT true,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agencia_fin_recorrencias_ativas_idx
  ON public.agencia_fin_recorrencias (ativa, grupo)
  WHERE ativa = true;

CREATE INDEX IF NOT EXISTS agencia_fin_recorrencias_fornecedor_idx
  ON public.agencia_fin_recorrencias (fornecedor_id)
  WHERE fornecedor_id IS NOT NULL;

DROP TRIGGER IF EXISTS agencia_fin_recorrencias_touch ON public.agencia_fin_recorrencias;
CREATE TRIGGER agencia_fin_recorrencias_touch
  BEFORE UPDATE ON public.agencia_fin_recorrencias
  FOR EACH ROW EXECUTE FUNCTION public.agencia_fin_touch_updated_at();

ALTER TABLE public.agencia_fin_lancamentos
  ADD COLUMN IF NOT EXISTS fornecedor_id uuid
    REFERENCES public.agencia_fin_fornecedores(id) ON DELETE SET NULL;

ALTER TABLE public.agencia_fin_lancamentos
  ADD COLUMN IF NOT EXISTS recorrencia_id uuid
    REFERENCES public.agencia_fin_recorrencias(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS agencia_fin_lancamentos_fornecedor_idx
  ON public.agencia_fin_lancamentos (fornecedor_id)
  WHERE fornecedor_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS agencia_fin_lancamentos_recorrencia_unica
  ON public.agencia_fin_lancamentos (recorrencia_id, competencia)
  WHERE recorrencia_id IS NOT NULL AND status <> 'cancelado';

COMMENT ON TABLE public.agencia_fin_fornecedores IS
  'Fornecedores de custo/despesa fixa da agência (aluguel, software, etc.).';
COMMENT ON TABLE public.agencia_fin_recorrencias IS
  'Recorrência de custo/despesa. Parar = ativa false. termina_em = último mês incluso.';
COMMENT ON COLUMN public.agencia_fin_lancamentos.recorrencia_id IS
  'Lançamento gerado por uma recorrência (um por competência enquanto ativa).';

ALTER TABLE public.agencia_fin_fornecedores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agencia_fin_recorrencias ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agencia_fin_fornecedores_admin ON public.agencia_fin_fornecedores;
CREATE POLICY agencia_fin_fornecedores_admin ON public.agencia_fin_fornecedores
  FOR ALL TO authenticated
  USING (public.get_my_role() IN ('superadmin', 'admin'))
  WITH CHECK (public.get_my_role() IN ('superadmin', 'admin'));

DROP POLICY IF EXISTS agencia_fin_recorrencias_admin ON public.agencia_fin_recorrencias;
CREATE POLICY agencia_fin_recorrencias_admin ON public.agencia_fin_recorrencias
  FOR ALL TO authenticated
  USING (public.get_my_role() IN ('superadmin', 'admin'))
  WITH CHECK (public.get_my_role() IN ('superadmin', 'admin'));

REVOKE ALL ON public.agencia_fin_fornecedores FROM authenticated, anon;
REVOKE ALL ON public.agencia_fin_recorrencias FROM authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agencia_fin_fornecedores TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agencia_fin_recorrencias TO authenticated;
GRANT ALL ON public.agencia_fin_fornecedores TO service_role;
GRANT ALL ON public.agencia_fin_recorrencias TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;

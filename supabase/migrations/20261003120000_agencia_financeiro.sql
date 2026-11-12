-- Financeiro da agência: DRE gerencial e caixa.
-- Mensalidades dos clientes ativos + lançamentos manuais.
-- Só superadmin/admin. Sem boleto, nota ou banco.

BEGIN;

ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS dia_cobranca smallint;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'clientes_dia_cobranca_check'
  ) THEN
    ALTER TABLE public.clientes
      ADD CONSTRAINT clientes_dia_cobranca_check
      CHECK (dia_cobranca IS NULL OR (dia_cobranca BETWEEN 1 AND 28));
  END IF;
END $$;

COMMENT ON COLUMN public.clientes.dia_cobranca IS
  'Dia do mês (1–28) da cobrança da mensalidade. Distinto de vencimento (fim do contrato).';

CREATE TABLE IF NOT EXISTS public.agencia_fin_categorias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL CHECK (char_length(btrim(nome)) BETWEEN 2 AND 60),
  grupo text NOT NULL CHECK (grupo IN ('receita', 'custo', 'despesa', 'repasse')),
  ordem integer NOT NULL DEFAULT 100,
  ativa boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS agencia_fin_categorias_grupo_nome_lower
  ON public.agencia_fin_categorias (grupo, lower(btrim(nome)));

CREATE INDEX IF NOT EXISTS agencia_fin_categorias_grupo_ordem_idx
  ON public.agencia_fin_categorias (grupo, ordem, nome);

INSERT INTO public.agencia_fin_categorias (nome, grupo, ordem) VALUES
  ('Mensalidade', 'receita', 10),
  ('Serviço avulso', 'receita', 20),
  ('Outras receitas', 'receita', 30),
  ('Freela', 'custo', 10),
  ('Ferramenta do cliente', 'custo', 20),
  ('Salário', 'despesa', 10),
  ('Aluguel', 'despesa', 20),
  ('Software', 'despesa', 30),
  ('Imposto', 'despesa', 40),
  ('Outras despesas', 'despesa', 50),
  ('Mídia do cliente', 'repasse', 10)
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS public.agencia_fin_lancamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competencia date NOT NULL CHECK (competencia = date_trunc('month', competencia)::date),
  data_caixa date,
  grupo text NOT NULL CHECK (grupo IN ('receita', 'custo', 'despesa', 'repasse')),
  categoria_id uuid NOT NULL REFERENCES public.agencia_fin_categorias(id),
  cliente_id uuid REFERENCES public.clientes(id) ON DELETE SET NULL,
  descricao text NOT NULL CHECK (char_length(btrim(descricao)) BETWEEN 1 AND 200),
  valor numeric(14, 2) NOT NULL CHECK (valor > 0),
  origem text NOT NULL DEFAULT 'manual' CHECK (origem IN ('mensalidade', 'manual')),
  status text NOT NULL DEFAULT 'previsto' CHECK (status IN ('previsto', 'recebido', 'pago', 'cancelado')),
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS agencia_fin_lancamentos_mensalidade_unica
  ON public.agencia_fin_lancamentos (cliente_id, competencia)
  WHERE origem = 'mensalidade' AND status <> 'cancelado' AND cliente_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS agencia_fin_lancamentos_competencia_idx
  ON public.agencia_fin_lancamentos (competencia, status);

CREATE INDEX IF NOT EXISTS agencia_fin_lancamentos_cliente_idx
  ON public.agencia_fin_lancamentos (cliente_id)
  WHERE cliente_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.agencia_fin_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS agencia_fin_lancamentos_touch ON public.agencia_fin_lancamentos;
CREATE TRIGGER agencia_fin_lancamentos_touch
  BEFORE UPDATE ON public.agencia_fin_lancamentos
  FOR EACH ROW EXECUTE FUNCTION public.agencia_fin_touch_updated_at();

ALTER TABLE public.agencia_fin_categorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agencia_fin_lancamentos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agencia_fin_categorias_admin ON public.agencia_fin_categorias;
CREATE POLICY agencia_fin_categorias_admin ON public.agencia_fin_categorias
  FOR ALL TO authenticated
  USING (public.get_my_role() IN ('superadmin', 'admin'))
  WITH CHECK (public.get_my_role() IN ('superadmin', 'admin'));

DROP POLICY IF EXISTS agencia_fin_lancamentos_admin ON public.agencia_fin_lancamentos;
CREATE POLICY agencia_fin_lancamentos_admin ON public.agencia_fin_lancamentos
  FOR ALL TO authenticated
  USING (public.get_my_role() IN ('superadmin', 'admin'))
  WITH CHECK (public.get_my_role() IN ('superadmin', 'admin'));

REVOKE ALL ON public.agencia_fin_categorias FROM authenticated, anon;
REVOKE ALL ON public.agencia_fin_lancamentos FROM authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agencia_fin_categorias TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agencia_fin_lancamentos TO authenticated;
GRANT ALL ON public.agencia_fin_categorias TO service_role;
GRANT ALL ON public.agencia_fin_lancamentos TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;

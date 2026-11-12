-- Configuração financeira separada do cadastro comercial.
-- Não aplicar em produção sem revisão. Não faz backfill de clientes fechados.
-- Rollback: dropar as tabelas e colunas novas no fim deste arquivo, em ordem inversa.

BEGIN;

CREATE TABLE IF NOT EXISTS public.agencia_fin_servicos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE RESTRICT,
  descricao text NOT NULL CHECK (char_length(btrim(descricao)) BETWEEN 2 AND 120),
  estado text NOT NULL DEFAULT 'rascunho' CHECK (estado IN ('rascunho', 'ativo', 'pausado', 'encerrado')),
  modo text NOT NULL DEFAULT 'recorrente' CHECK (modo IN ('recorrente', 'parcelado')),
  valor numeric(14, 2) NOT NULL DEFAULT 0 CHECK (valor >= 0),
  valor_anterior numeric(14, 2),
  vigencia_valor date,
  inicio date,
  periodicidade text NOT NULL DEFAULT 'mensal' CHECK (periodicidade IN ('mensal', 'unica')),
  dia_cobranca smallint CHECK (dia_cobranca IS NULL OR dia_cobranca BETWEEN 1 AND 31),
  primeiro_vencimento date,
  termino date,
  parcelas smallint CHECK (parcelas IS NULL OR parcelas BETWEEN 1 AND 60),
  competencia_inicial date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.agencia_fin_lancamentos
  ADD COLUMN IF NOT EXISTS servico_id uuid REFERENCES public.agencia_fin_servicos(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS chave text,
  ADD COLUMN IF NOT EXISTS vencimento date;

CREATE UNIQUE INDEX IF NOT EXISTS agencia_fin_lancamentos_chave_unica
  ON public.agencia_fin_lancamentos (chave)
  WHERE chave IS NOT NULL AND status <> 'cancelado';

CREATE TABLE IF NOT EXISTS public.agencia_fin_liquidacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lancamento_id uuid NOT NULL REFERENCES public.agencia_fin_lancamentos(id) ON DELETE RESTRICT,
  valor_obrigacao numeric(14, 2) NOT NULL CHECK (valor_obrigacao > 0),
  valor_caixa numeric(14, 2) NOT NULL CHECK (valor_caixa >= 0),
  taxa numeric(14, 2) NOT NULL DEFAULT 0 CHECK (taxa >= 0),
  data_caixa date NOT NULL,
  status text NOT NULL DEFAULT 'valido' CHECK (status IN ('valido', 'estornado')),
  estorno_de uuid REFERENCES public.agencia_fin_liquidacoes(id),
  chave_idempotencia text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS agencia_fin_liquidacoes_chave_unica
  ON public.agencia_fin_liquidacoes (chave_idempotencia)
  WHERE chave_idempotencia IS NOT NULL AND status = 'valido';

CREATE TABLE IF NOT EXISTS public.agencia_fin_contas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL CHECK (char_length(btrim(nome)) BETWEEN 2 AND 60),
  saldo_abertura numeric(14, 2),
  data_abertura date,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.agencia_fin_servicos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agencia_fin_liquidacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agencia_fin_contas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agencia_fin_servicos_admin ON public.agencia_fin_servicos;
CREATE POLICY agencia_fin_servicos_admin ON public.agencia_fin_servicos
  FOR ALL TO authenticated
  USING (public.get_my_role() IN ('superadmin', 'admin'))
  WITH CHECK (public.get_my_role() IN ('superadmin', 'admin'));

DROP POLICY IF EXISTS agencia_fin_liquidacoes_admin ON public.agencia_fin_liquidacoes;
CREATE POLICY agencia_fin_liquidacoes_admin ON public.agencia_fin_liquidacoes
  FOR ALL TO authenticated
  USING (public.get_my_role() IN ('superadmin', 'admin'))
  WITH CHECK (public.get_my_role() IN ('superadmin', 'admin'));

DROP POLICY IF EXISTS agencia_fin_contas_admin ON public.agencia_fin_contas;
CREATE POLICY agencia_fin_contas_admin ON public.agencia_fin_contas
  FOR ALL TO authenticated
  USING (public.get_my_role() IN ('superadmin', 'admin'))
  WITH CHECK (public.get_my_role() IN ('superadmin', 'admin'));

REVOKE ALL ON public.agencia_fin_servicos FROM authenticated, anon;
REVOKE ALL ON public.agencia_fin_liquidacoes FROM authenticated, anon;
REVOKE ALL ON public.agencia_fin_contas FROM authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agencia_fin_servicos TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agencia_fin_liquidacoes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agencia_fin_contas TO authenticated;
GRANT ALL ON public.agencia_fin_servicos TO service_role;
GRANT ALL ON public.agencia_fin_liquidacoes TO service_role;
GRANT ALL ON public.agencia_fin_contas TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;

-- Rollback manual, se a migração ainda não tiver dados de uso:
-- BEGIN;
-- DROP TABLE IF EXISTS public.agencia_fin_liquidacoes;
-- DROP TABLE IF EXISTS public.agencia_fin_contas;
-- ALTER TABLE public.agencia_fin_lancamentos DROP COLUMN IF EXISTS chave, DROP COLUMN IF EXISTS vencimento, DROP COLUMN IF EXISTS servico_id;
-- DROP TABLE IF EXISTS public.agencia_fin_servicos;
-- COMMIT;

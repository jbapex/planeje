-- Folha recorrente: quem entra na equipe, o squad e o salário que se repete todo mês.
-- Não cria usuário. A pessoa continua sendo o perfil da equipe.

BEGIN;

CREATE TABLE IF NOT EXISTS public.agencia_fin_squads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL CHECK (char_length(btrim(nome)) BETWEEN 2 AND 40),
  ordem integer NOT NULL DEFAULT 100,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS agencia_fin_squads_nome_lower
  ON public.agencia_fin_squads (lower(btrim(nome)));

CREATE TABLE IF NOT EXISTS public.agencia_fin_contratos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  squad_id uuid REFERENCES public.agencia_fin_squads(id) ON DELETE SET NULL,
  funcao text NOT NULL DEFAULT '' CHECK (char_length(funcao) <= 80),
  salario numeric(14, 2) NOT NULL CHECK (salario > 0),
  extras numeric(14, 2) NOT NULL DEFAULT 0 CHECK (extras >= 0),
  forma text NOT NULL DEFAULT 'pix' CHECK (forma IN ('pix', 'transferencia', 'dinheiro', 'outro')),
  dia_pagamento smallint CHECK (dia_pagamento IS NULL OR (dia_pagamento BETWEEN 1 AND 28)),
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS agencia_fin_contratos_profile
  ON public.agencia_fin_contratos (profile_id);

DROP TRIGGER IF EXISTS agencia_fin_contratos_touch ON public.agencia_fin_contratos;
CREATE TRIGGER agencia_fin_contratos_touch
  BEFORE UPDATE ON public.agencia_fin_contratos
  FOR EACH ROW EXECUTE FUNCTION public.agencia_fin_touch_updated_at();

ALTER TABLE public.agencia_fin_squads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agencia_fin_contratos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agencia_fin_squads_admin ON public.agencia_fin_squads;
CREATE POLICY agencia_fin_squads_admin ON public.agencia_fin_squads
  FOR ALL TO authenticated
  USING (public.get_my_role() IN ('superadmin', 'admin'))
  WITH CHECK (public.get_my_role() IN ('superadmin', 'admin'));

DROP POLICY IF EXISTS agencia_fin_contratos_admin ON public.agencia_fin_contratos;
CREATE POLICY agencia_fin_contratos_admin ON public.agencia_fin_contratos
  FOR ALL TO authenticated
  USING (public.get_my_role() IN ('superadmin', 'admin'))
  WITH CHECK (public.get_my_role() IN ('superadmin', 'admin'));

REVOKE ALL ON public.agencia_fin_squads FROM authenticated, anon;
REVOKE ALL ON public.agencia_fin_contratos FROM authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agencia_fin_squads TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agencia_fin_contratos TO authenticated;
GRANT ALL ON public.agencia_fin_squads TO service_role;
GRANT ALL ON public.agencia_fin_contratos TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;

-- Aviso na tela quando o cliente fica sem resposta. Uma linha por operação.

CREATE TABLE IF NOT EXISTS public.atendimento_aviso_espera (
  cliente_id uuid PRIMARY KEY REFERENCES public.clientes(id) ON DELETE CASCADE,
  habilitado boolean NOT NULL DEFAULT true,
  primeiro_minutos integer NOT NULL DEFAULT 10,
  repetir_minutos integer NOT NULL DEFAULT 10,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT atendimento_aviso_espera_primeiro_chk CHECK (primeiro_minutos BETWEEN 1 AND 240),
  CONSTRAINT atendimento_aviso_espera_repetir_chk CHECK (repetir_minutos BETWEEN 1 AND 240)
);

COMMENT ON TABLE public.atendimento_aviso_espera IS
  'Primeiro aviso e repetição do popup de cliente sem resposta. Não envia WhatsApp.';

ALTER TABLE public.atendimento_aviso_espera ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS atendimento_aviso_espera_superadmin ON public.atendimento_aviso_espera;
CREATE POLICY atendimento_aviso_espera_superadmin
  ON public.atendimento_aviso_espera FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin'));

DROP POLICY IF EXISTS atendimento_aviso_espera_leitura ON public.atendimento_aviso_espera;
CREATE POLICY atendimento_aviso_espera_leitura
  ON public.atendimento_aviso_espera FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'colaborador')));

GRANT SELECT, INSERT, UPDATE ON public.atendimento_aviso_espera TO authenticated;
GRANT ALL ON public.atendimento_aviso_espera TO service_role;

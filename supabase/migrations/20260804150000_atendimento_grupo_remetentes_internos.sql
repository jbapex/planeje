-- Remetentes internos por cliente: IA trata como equipe em grupos WhatsApp (não dispara aguardo).

CREATE TABLE IF NOT EXISTS public.atendimento_grupo_remetente_interno (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  label text NOT NULL,
  phone text,
  sender_jid text,
  name_match text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_atendimento_grupo_remetente_interno_cliente
  ON public.atendimento_grupo_remetente_interno (cliente_id);

COMMENT ON TABLE public.atendimento_grupo_remetente_interno IS
  'Pessoas da agência ou do cliente que falam em grupos — IA não marca aguardo quando reconhece estes remetentes.';
COMMENT ON COLUMN public.atendimento_grupo_remetente_interno.label IS 'Nome de exibição (ex.: João — Agência JB).';
COMMENT ON COLUMN public.atendimento_grupo_remetente_interno.phone IS 'Telefone só dígitos (opcional).';
COMMENT ON COLUMN public.atendimento_grupo_remetente_interno.name_match IS 'Trecho do pushName/sender_name no WhatsApp (opcional).';
COMMENT ON COLUMN public.atendimento_grupo_remetente_interno.sender_jid IS 'JID WhatsApp completo (opcional, avançado).';

ALTER TABLE public.atendimento_grupo_remetente_interno ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "atendimento_grupo_remetente_interno_superadmin" ON public.atendimento_grupo_remetente_interno;
CREATE POLICY "atendimento_grupo_remetente_interno_superadmin"
  ON public.atendimento_grupo_remetente_interno FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin'));

DROP POLICY IF EXISTS "atendimento_grupo_remetente_interno_internal" ON public.atendimento_grupo_remetente_interno;
CREATE POLICY "atendimento_grupo_remetente_interno_internal"
  ON public.atendimento_grupo_remetente_interno FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'colaborador')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'colaborador')));

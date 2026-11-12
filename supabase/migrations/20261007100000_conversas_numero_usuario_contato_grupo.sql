-- Número do WhatsApp de cada usuário da equipe, e os contatos do grupo que pedem resposta rápida.

ALTER TABLE public.atendimento_grupo_remetente_interno
  ADD COLUMN IF NOT EXISTS profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.atendimento_grupo_remetente_interno.profile_id IS
  'Usuário do Planeje dono deste WhatsApp. Quando a pessoa responde pelo aplicativo, o grupo reconhece esse usuário.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_remetente_interno_profile_agencia
  ON public.atendimento_grupo_remetente_interno (profile_id)
  WHERE cliente_id IS NULL AND profile_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.atendimento_grupo_contato_resposta (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  chat_jid text NOT NULL,
  phone text NOT NULL,
  label text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_grupo_contato_resposta_phone
  ON public.atendimento_grupo_contato_resposta (cliente_id, chat_jid, phone);

COMMENT ON TABLE public.atendimento_grupo_contato_resposta IS
  'Números marcados no grupo. A mensagem deles liga o Aguardando há. Os outros números do grupo não ligam.';

ALTER TABLE public.atendimento_grupo_contato_resposta ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS atendimento_grupo_contato_resposta_superadmin ON public.atendimento_grupo_contato_resposta;
CREATE POLICY atendimento_grupo_contato_resposta_superadmin
  ON public.atendimento_grupo_contato_resposta FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin'));

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

DROP POLICY IF EXISTS atendimento_grupo_contato_resposta_internal ON public.atendimento_grupo_contato_resposta;
CREATE POLICY atendimento_grupo_contato_resposta_internal
  ON public.atendimento_grupo_contato_resposta FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'colaborador')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'colaborador')));

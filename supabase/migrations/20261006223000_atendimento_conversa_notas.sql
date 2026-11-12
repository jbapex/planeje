-- Notas internas da inbox da agência (Conversas). Não vão ao WhatsApp.
-- cliente_atend_notas é da loja e exige o módulo da loja ligado.

CREATE TABLE IF NOT EXISTS public.atendimento_conversa_notas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.atendimento_conversas(id) ON DELETE CASCADE,
  autor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  autor_nome text,
  texto text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT atendimento_conversa_notas_texto_len CHECK (char_length(btrim(texto)) BETWEEN 1 AND 4000)
);

CREATE INDEX IF NOT EXISTS atendimento_conversa_notas_conv_idx
  ON public.atendimento_conversa_notas (conversation_id, created_at);

COMMENT ON TABLE public.atendimento_conversa_notas IS 'Notas internas da conversa da agência. Não são enviadas ao WhatsApp.';

ALTER TABLE public.atendimento_conversa_notas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "atendimento_notas_superadmin" ON public.atendimento_conversa_notas;
CREATE POLICY "atendimento_notas_superadmin"
  ON public.atendimento_conversa_notas FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin'));

DROP POLICY IF EXISTS "atendimento_notas_admin" ON public.atendimento_conversa_notas;
CREATE POLICY "atendimento_notas_admin"
  ON public.atendimento_conversa_notas FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "atendimento_notas_colaborador_select" ON public.atendimento_conversa_notas;
CREATE POLICY "atendimento_notas_colaborador_select"
  ON public.atendimento_conversa_notas FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'colaborador')
    AND public.atendimento_user_can_access_conversation(conversation_id)
  );

DROP POLICY IF EXISTS "atendimento_notas_colaborador_insert" ON public.atendimento_conversa_notas;
CREATE POLICY "atendimento_notas_colaborador_insert"
  ON public.atendimento_conversa_notas FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'colaborador')
    AND public.atendimento_user_can_access_conversation(conversation_id)
    AND autor_id = auth.uid()
  );

DROP POLICY IF EXISTS "atendimento_notas_colaborador_delete" ON public.atendimento_conversa_notas;
CREATE POLICY "atendimento_notas_colaborador_delete"
  ON public.atendimento_conversa_notas FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'colaborador')
    AND autor_id = auth.uid()
    AND public.atendimento_user_can_access_conversation(conversation_id)
  );

GRANT SELECT, INSERT, DELETE ON public.atendimento_conversa_notas TO authenticated;

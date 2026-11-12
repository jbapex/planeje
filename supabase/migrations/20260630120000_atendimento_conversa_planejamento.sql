-- Planejamento a partir de conversas (grupos WhatsApp): tarefas vinculadas e lembretes agendados.

ALTER TABLE public.tarefas
  ADD COLUMN IF NOT EXISTS atendimento_conversation_id uuid REFERENCES public.atendimento_conversas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS whatsapp_chat_jid text;

CREATE INDEX IF NOT EXISTS idx_tarefas_atendimento_conversation
  ON public.tarefas (atendimento_conversation_id)
  WHERE atendimento_conversation_id IS NOT NULL;

COMMENT ON COLUMN public.tarefas.atendimento_conversation_id IS 'Conversa WhatsApp que originou a tarefa (ex.: pedido no grupo)';
COMMENT ON COLUMN public.tarefas.whatsapp_chat_jid IS 'JID do chat/grupo no momento da criação';

CREATE TABLE IF NOT EXISTS public.atendimento_conversa_planejamento (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.atendimento_conversas(id) ON DELETE CASCADE,
  whatsapp_config_id uuid NOT NULL REFERENCES public.cliente_whatsapp_config(id) ON DELETE CASCADE,
  chat_jid text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('lembrete_whatsapp', 'lembrete_interno')),
  title text NOT NULL,
  body text,
  scheduled_at timestamptz NOT NULL,
  assignee_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  task_id uuid REFERENCES public.tarefas(id) ON DELETE SET NULL,
  source_message_preview text,
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'concluido', 'cancelado', 'falhou')),
  completed_at timestamptz,
  error_message text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_atendimento_planejamento_conv
  ON public.atendimento_conversa_planejamento (conversation_id, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_atendimento_planejamento_due
  ON public.atendimento_conversa_planejamento (status, scheduled_at)
  WHERE status = 'pendente';

COMMENT ON TABLE public.atendimento_conversa_planejamento IS 'Lembretes e agendamentos ligados a uma conversa/grupo WhatsApp';

ALTER TABLE public.atendimento_conversa_planejamento ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "atendimento_planejamento_superadmin" ON public.atendimento_conversa_planejamento;
CREATE POLICY "atendimento_planejamento_superadmin"
  ON public.atendimento_conversa_planejamento FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin'));

DROP POLICY IF EXISTS "atendimento_planejamento_admin" ON public.atendimento_conversa_planejamento;
CREATE POLICY "atendimento_planejamento_admin"
  ON public.atendimento_conversa_planejamento FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "atendimento_planejamento_colaborador_select" ON public.atendimento_conversa_planejamento;
CREATE POLICY "atendimento_planejamento_colaborador_select"
  ON public.atendimento_conversa_planejamento FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'colaborador')
    AND public.atendimento_user_can_access_conversation(conversation_id)
  );

DROP POLICY IF EXISTS "atendimento_planejamento_colaborador_write" ON public.atendimento_conversa_planejamento;
CREATE POLICY "atendimento_planejamento_colaborador_write"
  ON public.atendimento_conversa_planejamento FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'colaborador')
    AND public.atendimento_user_can_access_conversation(conversation_id)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'colaborador')
    AND public.atendimento_user_can_access_conversation(conversation_id)
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'atendimento_conversa_planejamento'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.atendimento_conversa_planejamento;
  END IF;
END $$;

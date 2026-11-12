-- Favoritos de conversa por usuário (atalhos na lateral do módulo Conversas).

CREATE TABLE IF NOT EXISTS public.atendimento_conversa_favorita (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.atendimento_conversas(id) ON DELETE CASCADE,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, conversation_id)
);

CREATE INDEX IF NOT EXISTS idx_atendimento_conversa_favorita_user_cliente
  ON public.atendimento_conversa_favorita (user_id, cliente_id, sort_order, created_at);

COMMENT ON TABLE public.atendimento_conversa_favorita IS 'Conversas favoritadas pelo usuário para atalho rápido no atendimento';

ALTER TABLE public.atendimento_conversa_favorita ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "atendimento_favorita_superadmin" ON public.atendimento_conversa_favorita;
CREATE POLICY "atendimento_favorita_superadmin"
  ON public.atendimento_conversa_favorita FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin'));

DROP POLICY IF EXISTS "atendimento_favorita_own_select" ON public.atendimento_conversa_favorita;
CREATE POLICY "atendimento_favorita_own_select"
  ON public.atendimento_conversa_favorita FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    AND public.atendimento_user_can_access_conversation(conversation_id)
  );

DROP POLICY IF EXISTS "atendimento_favorita_own_insert" ON public.atendimento_conversa_favorita;
CREATE POLICY "atendimento_favorita_own_insert"
  ON public.atendimento_conversa_favorita FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND public.atendimento_user_can_access_conversation(conversation_id)
  );

DROP POLICY IF EXISTS "atendimento_favorita_own_delete" ON public.atendimento_conversa_favorita;
CREATE POLICY "atendimento_favorita_own_delete"
  ON public.atendimento_conversa_favorita FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    AND public.atendimento_user_can_access_conversation(conversation_id)
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'atendimento_conversa_favorita'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.atendimento_conversa_favorita;
  END IF;
END $$;

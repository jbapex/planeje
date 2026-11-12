-- Log de materiais/mensagens enviadas pelo atendimento (Conversas)
CREATE TABLE IF NOT EXISTS public.atendimento_material_envios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES public.atendimento_conversas(id) ON DELETE SET NULL,
  chat_jid text NOT NULL,
  whatsapp_config_id uuid REFERENCES public.cliente_whatsapp_config(id) ON DELETE SET NULL,
  sent_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  message_id text,
  send_kind text NOT NULL CHECK (send_kind IN ('text', 'link', 'image', 'document', 'audio', 'video')),
  label text NOT NULL,
  file_name text,
  body_preview text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_atendimento_material_envios_cliente_chat
  ON public.atendimento_material_envios (cliente_id, chat_jid, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_atendimento_material_envios_conversation
  ON public.atendimento_material_envios (conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_atendimento_material_envios_cliente_created
  ON public.atendimento_material_envios (cliente_id, created_at DESC);

COMMENT ON TABLE public.atendimento_material_envios IS 'Histórico de textos, links e arquivos enviados pelo módulo Conversas/atendimento';

ALTER TABLE public.atendimento_material_envios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "atendimento_material_envios_superadmin" ON public.atendimento_material_envios;
CREATE POLICY "atendimento_material_envios_superadmin"
  ON public.atendimento_material_envios FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin'));

DROP POLICY IF EXISTS "atendimento_material_envios_admin" ON public.atendimento_material_envios;
CREATE POLICY "atendimento_material_envios_admin"
  ON public.atendimento_material_envios FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "atendimento_material_envios_colaborador" ON public.atendimento_material_envios;
CREATE POLICY "atendimento_material_envios_colaborador"
  ON public.atendimento_material_envios FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'colaborador'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'colaborador'));

DROP POLICY IF EXISTS "atendimento_material_envios_cliente" ON public.atendimento_material_envios;
CREATE POLICY "atendimento_material_envios_cliente"
  ON public.atendimento_material_envios FOR SELECT TO authenticated
  USING (
    cliente_id IN (SELECT cliente_id FROM public.profiles WHERE id = auth.uid() AND role = 'cliente' AND cliente_id IS NOT NULL)
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'atendimento_material_envios'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.atendimento_material_envios;
  END IF;
END $$;

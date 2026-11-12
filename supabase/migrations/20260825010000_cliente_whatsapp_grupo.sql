-- Grupo WhatsApp operacional (equipe + cliente) vinculado à ficha do cliente.
CREATE TABLE IF NOT EXISTS public.cliente_whatsapp_grupo (
  cliente_id uuid PRIMARY KEY REFERENCES public.clientes(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES public.atendimento_conversas(id) ON DELETE SET NULL,
  chat_jid text NOT NULL,
  display_name text,
  wa_cliente_id uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cliente_whatsapp_grupo_jid_idx
  ON public.cliente_whatsapp_grupo (chat_jid);

ALTER TABLE public.cliente_whatsapp_grupo ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "equipe le grupo cliente" ON public.cliente_whatsapp_grupo;
CREATE POLICY "equipe le grupo cliente"
  ON public.cliente_whatsapp_grupo FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "equipe escreve grupo cliente" ON public.cliente_whatsapp_grupo;
CREATE POLICY "equipe escreve grupo cliente"
  ON public.cliente_whatsapp_grupo FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "equipe atualiza grupo cliente" ON public.cliente_whatsapp_grupo;
CREATE POLICY "equipe atualiza grupo cliente"
  ON public.cliente_whatsapp_grupo FOR UPDATE TO authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "equipe apaga grupo cliente" ON public.cliente_whatsapp_grupo;
CREATE POLICY "equipe apaga grupo cliente"
  ON public.cliente_whatsapp_grupo FOR DELETE TO authenticated
  USING (true);

GRANT ALL ON TABLE public.cliente_whatsapp_grupo TO authenticated, service_role;

COMMENT ON TABLE public.cliente_whatsapp_grupo IS
  'Grupo WhatsApp (equipe + cliente) oficial da conta. chat_jid vive no WhatsApp da agência; cliente_id é a ficha no Planeje.';

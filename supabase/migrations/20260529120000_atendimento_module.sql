-- =====================================================
-- Módulo de atendimento WhatsApp: filas, conversas, permissões
-- =====================================================

-- Filas de atendimento
CREATE TABLE IF NOT EXISTS public.atendimento_filas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  name text NOT NULL,
  sla_primeira_resposta_minutos integer NOT NULL DEFAULT 5,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cliente_id, name)
);

CREATE INDEX IF NOT EXISTS idx_atendimento_filas_cliente
  ON public.atendimento_filas (cliente_id);

-- Canais WhatsApp vinculados a filas
CREATE TABLE IF NOT EXISTS public.atendimento_fila_canais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fila_id uuid NOT NULL REFERENCES public.atendimento_filas(id) ON DELETE CASCADE,
  whatsapp_config_id uuid NOT NULL REFERENCES public.cliente_whatsapp_config(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (whatsapp_config_id)
);

CREATE INDEX IF NOT EXISTS idx_atendimento_fila_canais_fila
  ON public.atendimento_fila_canais (fila_id);

-- Acesso de usuários internos a filas e/ou canais
CREATE TABLE IF NOT EXISTS public.atendimento_usuario_acesso (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  fila_id uuid REFERENCES public.atendimento_filas(id) ON DELETE CASCADE,
  whatsapp_config_id uuid REFERENCES public.cliente_whatsapp_config(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (fila_id IS NOT NULL OR whatsapp_config_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_atendimento_usuario_acesso_user
  ON public.atendimento_usuario_acesso (user_id, cliente_id);
CREATE INDEX IF NOT EXISTS idx_atendimento_usuario_acesso_fila
  ON public.atendimento_usuario_acesso (fila_id);
CREATE INDEX IF NOT EXISTS idx_atendimento_usuario_acesso_canal
  ON public.atendimento_usuario_acesso (whatsapp_config_id);

-- Conversas / tickets de atendimento
CREATE TABLE IF NOT EXISTS public.atendimento_conversas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  whatsapp_config_id uuid NOT NULL REFERENCES public.cliente_whatsapp_config(id) ON DELETE CASCADE,
  chat_jid text NOT NULL,
  is_group boolean NOT NULL DEFAULT false,
  display_name text,
  status text NOT NULL DEFAULT 'aguardando'
    CHECK (status IN ('aguardando', 'em_atendimento', 'resolvido')),
  fila_id uuid REFERENCES public.atendimento_filas(id) ON DELETE SET NULL,
  assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  last_message_at timestamptz,
  last_customer_message_at timestamptz,
  first_response_at timestamptz,
  resolved_at timestamptz,
  resolved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  unread_count integer NOT NULL DEFAULT 0,
  last_message_preview text,
  profile_pic_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cliente_id, whatsapp_config_id, chat_jid)
);

CREATE INDEX IF NOT EXISTS idx_atendimento_conversas_cliente_status
  ON public.atendimento_conversas (cliente_id, status, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_atendimento_conversas_assigned
  ON public.atendimento_conversas (cliente_id, assigned_to);
CREATE INDEX IF NOT EXISTS idx_atendimento_conversas_chat_jid
  ON public.atendimento_conversas (cliente_id, chat_jid);

-- Colunas extras em inbox e sent
ALTER TABLE public.cliente_whatsapp_inbox
  ADD COLUMN IF NOT EXISTS whatsapp_config_id uuid REFERENCES public.cliente_whatsapp_config(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS chat_jid text,
  ADD COLUMN IF NOT EXISTS sender_jid text,
  ADD COLUMN IF NOT EXISTS conversation_id uuid REFERENCES public.atendimento_conversas(id) ON DELETE SET NULL;

ALTER TABLE public.cliente_whatsapp_sent
  ADD COLUMN IF NOT EXISTS whatsapp_config_id uuid REFERENCES public.cliente_whatsapp_config(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS chat_jid text,
  ADD COLUMN IF NOT EXISTS sent_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS conversation_id uuid REFERENCES public.atendimento_conversas(id) ON DELETE SET NULL;

-- Backfill chat_jid a partir de from_jid / to_jid
UPDATE public.cliente_whatsapp_inbox
SET chat_jid = from_jid
WHERE chat_jid IS NULL AND from_jid IS NOT NULL AND from_jid <> 'unknown';

UPDATE public.cliente_whatsapp_sent
SET chat_jid = to_jid
WHERE chat_jid IS NULL AND to_jid IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cliente_whatsapp_inbox_chat_jid
  ON public.cliente_whatsapp_inbox (cliente_id, chat_jid, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cliente_whatsapp_sent_chat_jid
  ON public.cliente_whatsapp_sent (cliente_id, chat_jid, created_at DESC);

-- Função auxiliar: colaborador tem acesso à conversa?
CREATE OR REPLACE FUNCTION public.atendimento_user_can_access_conversation(conv_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.atendimento_conversas c
    JOIN public.profiles p ON p.id = auth.uid()
    WHERE c.id = conv_id
      AND (
        p.role IN ('superadmin', 'admin')
        OR (
          p.role = 'colaborador'
          AND (
            NOT EXISTS (
              SELECT 1 FROM public.atendimento_usuario_acesso a
              WHERE a.cliente_id = c.cliente_id AND a.user_id = p.id
            )
            OR EXISTS (
              SELECT 1 FROM public.atendimento_usuario_acesso a
              WHERE a.user_id = p.id
                AND a.cliente_id = c.cliente_id
                AND (
                  (a.fila_id IS NOT NULL AND a.fila_id = c.fila_id)
                  OR (a.whatsapp_config_id IS NOT NULL AND a.whatsapp_config_id = c.whatsapp_config_id)
                )
            )
          )
        )
      )
  );
$$;

-- RLS atendimento_filas
ALTER TABLE public.atendimento_filas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "atendimento_filas_superadmin_all" ON public.atendimento_filas;
CREATE POLICY "atendimento_filas_superadmin_all"
  ON public.atendimento_filas FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin'));

DROP POLICY IF EXISTS "atendimento_filas_internal" ON public.atendimento_filas;
CREATE POLICY "atendimento_filas_internal"
  ON public.atendimento_filas FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'colaborador')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'colaborador')));

-- RLS atendimento_fila_canais
ALTER TABLE public.atendimento_fila_canais ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "atendimento_fila_canais_superadmin" ON public.atendimento_fila_canais;
CREATE POLICY "atendimento_fila_canais_superadmin"
  ON public.atendimento_fila_canais FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin'));

DROP POLICY IF EXISTS "atendimento_fila_canais_internal" ON public.atendimento_fila_canais;
CREATE POLICY "atendimento_fila_canais_internal"
  ON public.atendimento_fila_canais FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'colaborador')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'colaborador')));

-- RLS atendimento_usuario_acesso
ALTER TABLE public.atendimento_usuario_acesso ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "atendimento_usuario_acesso_superadmin" ON public.atendimento_usuario_acesso;
CREATE POLICY "atendimento_usuario_acesso_superadmin"
  ON public.atendimento_usuario_acesso FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin'));

DROP POLICY IF EXISTS "atendimento_usuario_acesso_internal" ON public.atendimento_usuario_acesso;
CREATE POLICY "atendimento_usuario_acesso_internal"
  ON public.atendimento_usuario_acesso FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'colaborador')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'colaborador')));

DROP POLICY IF EXISTS "atendimento_usuario_acesso_own_read" ON public.atendimento_usuario_acesso;
CREATE POLICY "atendimento_usuario_acesso_own_read"
  ON public.atendimento_usuario_acesso FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- RLS atendimento_conversas
ALTER TABLE public.atendimento_conversas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "atendimento_conversas_superadmin" ON public.atendimento_conversas;
CREATE POLICY "atendimento_conversas_superadmin"
  ON public.atendimento_conversas FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin'));

DROP POLICY IF EXISTS "atendimento_conversas_admin" ON public.atendimento_conversas;
CREATE POLICY "atendimento_conversas_admin"
  ON public.atendimento_conversas FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "atendimento_conversas_colaborador_select" ON public.atendimento_conversas;
CREATE POLICY "atendimento_conversas_colaborador_select"
  ON public.atendimento_conversas FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'colaborador')
    AND public.atendimento_user_can_access_conversation(id)
  );

DROP POLICY IF EXISTS "atendimento_conversas_colaborador_update" ON public.atendimento_conversas;
CREATE POLICY "atendimento_conversas_colaborador_update"
  ON public.atendimento_conversas FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'colaborador')
    AND public.atendimento_user_can_access_conversation(id)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'colaborador')
    AND public.atendimento_user_can_access_conversation(id)
  );

-- Realtime
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'atendimento_conversas'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.atendimento_conversas;
  END IF;
END $$;

COMMENT ON TABLE public.atendimento_conversas IS 'Conversas/tickets de atendimento WhatsApp (grupo ou PV)';
COMMENT ON TABLE public.atendimento_filas IS 'Filas de atendimento por cliente CRM';

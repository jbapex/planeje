-- Escopo de fila/canal unificado + mensagens (inbox/sent) respeitam permissões.

CREATE OR REPLACE FUNCTION public.atendimento_user_can_access_atendimento_scope(
  p_cliente_id uuid,
  p_fila_id uuid,
  p_whatsapp_config_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND (
        p.role = 'superadmin'
        OR (
          p.role IN ('admin', 'colaborador')
          AND (
            NOT EXISTS (
              SELECT 1
              FROM public.atendimento_usuario_acesso a
              WHERE a.cliente_id = p_cliente_id
                AND a.user_id = p.id
            )
            OR EXISTS (
              SELECT 1
              FROM public.atendimento_usuario_acesso a
              WHERE a.user_id = p.id
                AND a.cliente_id = p_cliente_id
                AND (
                  (
                    a.fila_id IS NOT NULL
                    AND a.fila_id = COALESCE(
                      p_fila_id,
                      (
                        SELECT fc.fila_id
                        FROM public.atendimento_fila_canais fc
                        WHERE fc.whatsapp_config_id = p_whatsapp_config_id
                        LIMIT 1
                      )
                    )
                  )
                  OR (
                    a.whatsapp_config_id IS NOT NULL
                    AND a.whatsapp_config_id = p_whatsapp_config_id
                  )
                )
            )
          )
        )
      )
  );
$$;

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
    WHERE c.id = conv_id
      AND public.atendimento_user_can_access_atendimento_scope(
        c.cliente_id,
        c.fila_id,
        c.whatsapp_config_id
      )
  );
$$;

-- Admin com escopo (substitui política de acesso total se ainda existir)
DROP POLICY IF EXISTS "atendimento_conversas_admin" ON public.atendimento_conversas;

DROP POLICY IF EXISTS "atendimento_conversas_admin_select" ON public.atendimento_conversas;
CREATE POLICY "atendimento_conversas_admin_select"
  ON public.atendimento_conversas FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    AND public.atendimento_user_can_access_conversation(id)
  );

DROP POLICY IF EXISTS "atendimento_conversas_admin_update" ON public.atendimento_conversas;
CREATE POLICY "atendimento_conversas_admin_update"
  ON public.atendimento_conversas FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    AND public.atendimento_user_can_access_conversation(id)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    AND public.atendimento_user_can_access_conversation(id)
  );

-- Inbox: mensagens só do escopo permitido
DROP POLICY IF EXISTS "cliente_whatsapp_inbox_admin_colaborador" ON public.cliente_whatsapp_inbox;
CREATE POLICY "cliente_whatsapp_inbox_admin_colaborador"
  ON public.cliente_whatsapp_inbox FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'colaborador'))
    AND (
      public.atendimento_user_can_access_atendimento_scope(cliente_id, NULL, whatsapp_config_id)
      OR (
        conversation_id IS NOT NULL
        AND public.atendimento_user_can_access_conversation(conversation_id)
      )
    )
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'colaborador'))
    AND (
      public.atendimento_user_can_access_atendimento_scope(cliente_id, NULL, whatsapp_config_id)
      OR (
        conversation_id IS NOT NULL
        AND public.atendimento_user_can_access_conversation(conversation_id)
      )
    )
  );

-- Sent: mesmo escopo
DROP POLICY IF EXISTS "cliente_whatsapp_sent_admin_colaborador" ON public.cliente_whatsapp_sent;
CREATE POLICY "cliente_whatsapp_sent_admin_colaborador"
  ON public.cliente_whatsapp_sent FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'colaborador'))
    AND (
      public.atendimento_user_can_access_atendimento_scope(cliente_id, NULL, whatsapp_config_id)
      OR (
        conversation_id IS NOT NULL
        AND public.atendimento_user_can_access_conversation(conversation_id)
      )
    )
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'colaborador'))
    AND (
      public.atendimento_user_can_access_atendimento_scope(cliente_id, NULL, whatsapp_config_id)
      OR (
        conversation_id IS NOT NULL
        AND public.atendimento_user_can_access_conversation(conversation_id)
      )
    )
  );

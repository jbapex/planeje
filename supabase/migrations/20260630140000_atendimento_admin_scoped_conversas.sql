-- Admin passa a ter o mesmo escopo de colaborador em Conversas (filas/canais vinculados).

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
        p.role = 'superadmin'
        OR (
          p.role IN ('admin', 'colaborador')
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

-- Conversas: admin deixa de ter acesso total
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

-- Planejamento/lembretes: admin com escopo
DROP POLICY IF EXISTS "atendimento_planejamento_admin" ON public.atendimento_conversa_planejamento;

DROP POLICY IF EXISTS "atendimento_planejamento_admin_select" ON public.atendimento_conversa_planejamento;
CREATE POLICY "atendimento_planejamento_admin_select"
  ON public.atendimento_conversa_planejamento FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    AND public.atendimento_user_can_access_conversation(conversation_id)
  );

DROP POLICY IF EXISTS "atendimento_planejamento_admin_write" ON public.atendimento_conversa_planejamento;
CREATE POLICY "atendimento_planejamento_admin_write"
  ON public.atendimento_conversa_planejamento FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    AND public.atendimento_user_can_access_conversation(conversation_id)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    AND public.atendimento_user_can_access_conversation(conversation_id)
  );

-- Envios de material: admin alinhado ao colaborador (sem acesso global)
DROP POLICY IF EXISTS "atendimento_material_envios_admin" ON public.atendimento_material_envios;
CREATE POLICY "atendimento_material_envios_admin"
  ON public.atendimento_material_envios FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

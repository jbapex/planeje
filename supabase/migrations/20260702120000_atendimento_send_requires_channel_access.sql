-- Envio de mensagens exige vínculo direto no canal (número), não basta acesso à fila.

CREATE OR REPLACE FUNCTION public.atendimento_user_can_send_on_whatsapp_config(
  p_user_id uuid,
  p_cliente_id uuid,
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
    WHERE p.id = p_user_id
      AND (
        p.role = 'superadmin'
        OR (
          p.role IN ('admin', 'colaborador')
          AND p_whatsapp_config_id IS NOT NULL
          AND (
            NOT EXISTS (
              SELECT 1
              FROM public.atendimento_usuario_acesso a
              WHERE a.cliente_id = p_cliente_id
                AND a.user_id = p_user_id
            )
            OR EXISTS (
              SELECT 1
              FROM public.atendimento_usuario_acesso a
              WHERE a.user_id = p_user_id
                AND a.cliente_id = p_cliente_id
                AND a.whatsapp_config_id IS NOT NULL
                AND a.whatsapp_config_id = p_whatsapp_config_id
            )
          )
        )
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.atendimento_user_can_send_on_whatsapp_config(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.atendimento_user_can_send_on_whatsapp_config(uuid, uuid, uuid) TO service_role;

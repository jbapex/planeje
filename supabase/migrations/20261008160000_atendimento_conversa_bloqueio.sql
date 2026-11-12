-- Bloqueio de conversa na inbox da agência. Não envia WhatsApp.
-- Aplicar uma vez. A linha guarda só o nome, para poder desbloquear.

ALTER TABLE public.atendimento_conversas
  ADD COLUMN IF NOT EXISTS bloqueada boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS bloqueada_em timestamptz,
  ADD COLUMN IF NOT EXISTS bloqueada_por uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.atendimento_conversas.bloqueada IS
  'Conversa bloqueada: o webhook não grava mensagem, prévia nem contato novo.';

CREATE TABLE IF NOT EXISTS public.atendimento_bloqueios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  chat_jid text NOT NULL,
  is_group boolean NOT NULL DEFAULT false,
  display_name text,
  bloqueado_por uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cliente_id, chat_jid)
);

COMMENT ON TABLE public.atendimento_bloqueios IS
  'Grupo ou contato que a Conversas não grava. Não envia WhatsApp.';

CREATE INDEX IF NOT EXISTS atendimento_bloqueios_cliente_idx
  ON public.atendimento_bloqueios (cliente_id, chat_jid);

ALTER TABLE public.atendimento_bloqueios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS atendimento_bloqueios_leitura ON public.atendimento_bloqueios;
CREATE POLICY atendimento_bloqueios_leitura
  ON public.atendimento_bloqueios FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('superadmin', 'admin', 'colaborador')
  ));

GRANT SELECT ON public.atendimento_bloqueios TO authenticated;
GRANT ALL ON public.atendimento_bloqueios TO service_role;

CREATE OR REPLACE FUNCTION public.bloquear_conversa_atendimento(p_conversation_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_conv public.atendimento_conversas%ROWTYPE;
  v_inbox integer := 0;
  v_sent integer := 0;
BEGIN
  SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();
  IF v_role IS NULL OR v_role NOT IN ('superadmin', 'admin', 'colaborador') THEN
    RAISE EXCEPTION 'Sem permissão para bloquear';
  END IF;
  IF NOT public.atendimento_user_can_access_conversation(p_conversation_id) THEN
    RAISE EXCEPTION 'Sem acesso a esta conversa';
  END IF;

  SELECT * INTO v_conv FROM public.atendimento_conversas WHERE id = p_conversation_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conversa não encontrada';
  END IF;
  IF v_conv.chat_jid IS NULL OR btrim(v_conv.chat_jid) = '' OR v_conv.chat_jid = 'unknown' THEN
    RAISE EXCEPTION 'Conversa sem identificador';
  END IF;

  INSERT INTO public.atendimento_bloqueios (cliente_id, chat_jid, is_group, display_name, bloqueado_por)
  VALUES (v_conv.cliente_id, v_conv.chat_jid, v_conv.is_group, v_conv.display_name, auth.uid())
  ON CONFLICT (cliente_id, chat_jid) DO UPDATE
    SET is_group = EXCLUDED.is_group,
        display_name = COALESCE(EXCLUDED.display_name, public.atendimento_bloqueios.display_name),
        bloqueado_por = EXCLUDED.bloqueado_por,
        created_at = now();

  UPDATE public.atendimento_conversas
  SET bloqueada = true,
      bloqueada_em = now(),
      bloqueada_por = auth.uid(),
      last_message_preview = NULL,
      unread_count = 0,
      awaiting_response_since = NULL,
      group_ai_analysis = NULL,
      updated_at = now()
  WHERE cliente_id = v_conv.cliente_id
    AND chat_jid = v_conv.chat_jid;

  DELETE FROM public.atendimento_grupo_analise_log l
  USING public.atendimento_conversas c
  WHERE l.conversation_id = c.id
    AND c.cliente_id = v_conv.cliente_id
    AND c.chat_jid = v_conv.chat_jid;

  DELETE FROM public.atendimento_conversa_notas n
  USING public.atendimento_conversas c
  WHERE n.conversation_id = c.id
    AND c.cliente_id = v_conv.cliente_id
    AND c.chat_jid = v_conv.chat_jid;

  DELETE FROM public.cliente_whatsapp_inbox
  WHERE cliente_id = v_conv.cliente_id
    AND (
      chat_jid = v_conv.chat_jid
      OR conversation_id IN (
        SELECT id FROM public.atendimento_conversas
        WHERE cliente_id = v_conv.cliente_id AND chat_jid = v_conv.chat_jid
      )
    );
  GET DIAGNOSTICS v_inbox = ROW_COUNT;

  DELETE FROM public.cliente_whatsapp_sent
  WHERE cliente_id = v_conv.cliente_id
    AND (
      chat_jid = v_conv.chat_jid
      OR to_jid = v_conv.chat_jid
      OR conversation_id IN (
        SELECT id FROM public.atendimento_conversas
        WHERE cliente_id = v_conv.cliente_id AND chat_jid = v_conv.chat_jid
      )
    );
  GET DIAGNOSTICS v_sent = ROW_COUNT;

  DELETE FROM public.cliente_whatsapp_webhook_log
  WHERE cliente_id = v_conv.cliente_id
    AND from_jid = v_conv.chat_jid;

  UPDATE public.pendencias_caixa
  SET resolved_at = now(),
      resolution_kind = 'arquivada'
  WHERE resolved_at IS NULL
    AND conversation_id IN (
      SELECT id FROM public.atendimento_conversas
      WHERE cliente_id = v_conv.cliente_id AND chat_jid = v_conv.chat_jid
    );

  RETURN jsonb_build_object('ok', true, 'inbox', v_inbox, 'sent', v_sent, 'chat_jid', v_conv.chat_jid);
END;
$$;

CREATE OR REPLACE FUNCTION public.desbloquear_conversa_atendimento(p_conversation_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_conv public.atendimento_conversas%ROWTYPE;
BEGIN
  SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();
  IF v_role IS NULL OR v_role NOT IN ('superadmin', 'admin', 'colaborador') THEN
    RAISE EXCEPTION 'Sem permissão para desbloquear';
  END IF;
  IF NOT public.atendimento_user_can_access_conversation(p_conversation_id) THEN
    RAISE EXCEPTION 'Sem acesso a esta conversa';
  END IF;

  SELECT * INTO v_conv FROM public.atendimento_conversas WHERE id = p_conversation_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conversa não encontrada';
  END IF;

  DELETE FROM public.atendimento_bloqueios
  WHERE cliente_id = v_conv.cliente_id
    AND chat_jid = v_conv.chat_jid;

  UPDATE public.atendimento_conversas
  SET bloqueada = false,
      bloqueada_em = NULL,
      bloqueada_por = NULL,
      updated_at = now()
  WHERE cliente_id = v_conv.cliente_id
    AND chat_jid = v_conv.chat_jid;

  RETURN jsonb_build_object('ok', true, 'chat_jid', v_conv.chat_jid);
END;
$$;

REVOKE ALL ON FUNCTION public.bloquear_conversa_atendimento(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.desbloquear_conversa_atendimento(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bloquear_conversa_atendimento(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.desbloquear_conversa_atendimento(uuid) TO authenticated;

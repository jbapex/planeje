BEGIN;

CREATE FUNCTION public.cs_ia_inventory_group_source(p_conversation_id uuid, p_wa_client_id uuid, p_channel_id uuid, p_group_jid text)
RETURNS TABLE(id uuid, cliente_id uuid, whatsapp_config_id uuid, chat_jid text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT p_conversation_id, p_wa_client_id, p_channel_id, p_group_jid
  WHERE private.cs_ia_group_label_editable(p_conversation_id, p_wa_client_id, p_channel_id, p_group_jid)
    AND EXISTS (SELECT 1 FROM public.cliente_whatsapp_config cfg WHERE cfg.id = p_channel_id AND cfg.provider = 'uazapi')
    AND NOT EXISTS (SELECT 1 FROM private.cs_ia_group_claims() claim WHERE claim.conversation_id = p_conversation_id
      OR (claim.conversation_id IS NULL AND claim.wa_client_id = p_wa_client_id AND claim.group_jid = lower(btrim(p_group_jid))));
$$;

REVOKE ALL ON FUNCTION public.cs_ia_inventory_group_source(uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cs_ia_inventory_group_source(uuid, uuid, uuid, text) TO authenticated;

-- client_id nulo é uma marcação de inventário. As leituras continuam usando a identidade do cliente vinculado.
ALTER TABLE private.cs_ia_group_team_marks
  DROP CONSTRAINT cs_ia_group_team_marks_pkey,
  ALTER COLUMN client_id DROP NOT NULL,
  ADD CONSTRAINT cs_ia_group_team_marks_identity UNIQUE NULLS NOT DISTINCT (client_id, conversation_id, wa_client_id, channel_id, group_jid, sender_jid);

CREATE OR REPLACE FUNCTION private.cs_ia_group_team_scope(p_client_id uuid, p_conversation_id uuid,
  p_wa_client_id uuid, p_channel_id uuid, p_group_jid text)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT CASE WHEN p_client_id IS NULL THEN EXISTS (
    SELECT 1 FROM public.cs_ia_inventory_group_source(p_conversation_id, p_wa_client_id, p_channel_id, p_group_jid)
  ) ELSE EXISTS (
    SELECT 1 FROM public.cs_ia_group_source(p_client_id, p_conversation_id) g
    WHERE (g.cliente_id, g.whatsapp_config_id, g.chat_jid) = (p_wa_client_id, p_channel_id, p_group_jid)
  ) END;
$$;

CREATE OR REPLACE FUNCTION public.cs_ia_group_team(p_client_id uuid, p_conversation_id uuid, p_wa_client_id uuid, p_channel_id uuid, p_group_jid text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT (SELECT coalesce(jsonb_agg(m.sender_jid ORDER BY m.sender_jid), '[]'::jsonb)
    FROM private.cs_ia_group_team_marks m WHERE m.client_id IS NOT DISTINCT FROM p_client_id
      AND (m.conversation_id, m.wa_client_id, m.channel_id, m.group_jid) = (p_conversation_id, p_wa_client_id, p_channel_id, p_group_jid))
  WHERE private.cs_ia_group_team_scope(p_client_id, p_conversation_id, p_wa_client_id, p_channel_id, p_group_jid);
$$;

CREATE OR REPLACE FUNCTION public.cs_ia_mark_group_team(p_client_id uuid, p_conversation_id uuid, p_wa_client_id uuid, p_channel_id uuid,
  p_group_jid text, p_sender_jids text[], p_is_team boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  senders text[];
BEGIN
  IF NOT coalesce(private.cs_ia_role() IN ('admin', 'superadmin'), false) THEN
    RAISE insufficient_privilege USING MESSAGE = 'Sem permissão para editar a equipe do grupo.';
  END IF;
  IF p_is_team IS NULL OR NOT coalesce(cardinality(p_sender_jids) BETWEEN 1 AND 3, false) THEN
    RAISE invalid_parameter_value USING MESSAGE = 'Confirme a identidade WhatsApp do participante.';
  END IF;
  SELECT array_agg(DISTINCT private.cs_ia_sender_jid(sender)) INTO senders FROM unnest(p_sender_jids) sender;
  IF array_position(senders, NULL) IS NOT NULL THEN
    RAISE invalid_parameter_value USING MESSAGE = 'Confirme a identidade WhatsApp do participante.';
  END IF;

  IF p_client_id IS NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(p_conversation_id::text, 20261109));
  ELSE
    PERFORM pg_advisory_xact_lock(hashtextextended(p_client_id::text, 72857));
  END IF;
  IF NOT private.cs_ia_group_team_scope(p_client_id, p_conversation_id, p_wa_client_id, p_channel_id, p_group_jid) THEN
    RAISE insufficient_privilege USING MESSAGE = 'Grupo indisponível para esta classificação.';
  END IF;

  IF p_is_team THEN
    INSERT INTO private.cs_ia_group_team_marks (client_id, conversation_id, wa_client_id, channel_id, group_jid, sender_jid)
    SELECT p_client_id, p_conversation_id, p_wa_client_id, p_channel_id, p_group_jid, sender FROM unnest(senders) sender
    ON CONFLICT DO NOTHING;
  ELSE
    DELETE FROM private.cs_ia_group_team_marks m WHERE m.client_id IS NOT DISTINCT FROM p_client_id
      AND (m.conversation_id, m.wa_client_id, m.channel_id, m.group_jid) = (p_conversation_id, p_wa_client_id, p_channel_id, p_group_jid)
      AND m.sender_jid = ANY(senders);
  END IF;
  RETURN public.cs_ia_group_team(p_client_id, p_conversation_id, p_wa_client_id, p_channel_id, p_group_jid);
END;
$$;

CREATE OR REPLACE FUNCTION public.cs_ia_set_group_binding(p_client_id uuid, p_conversation_id uuid, p_wa_client_id uuid,
  p_channel_id uuid, p_group_jid text, p_version text)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  client public.clientes%ROWTYPE;
  source public.atendimento_conversas%ROWTYPE;
  had_link boolean;
  inventory_senders text[];
  payload jsonb;
  saved_deliverables jsonb;
BEGIN
  IF coalesce(private.cs_ia_role(), '') NOT IN ('admin', 'superadmin') THEN
    RAISE insufficient_privilege USING MESSAGE = 'Sem acesso para alterar o grupo deste cliente.';
  END IF;
  SELECT c.* INTO client FROM public.clientes c WHERE c.id = p_client_id AND c.etapa = 'closed' FOR UPDATE;
  IF NOT FOUND THEN
    RAISE insufficient_privilege USING MESSAGE = 'Sem acesso para alterar o grupo deste cliente.';
  END IF;
  PERFORM l.cliente_id FROM public.cliente_whatsapp_grupo l WHERE l.cliente_id = client.id FOR UPDATE;
  had_link := FOUND;
  IF p_version IS NULL OR p_version IS DISTINCT FROM (public.cs_ia_group_binding(client.id)->>'version') THEN
    RAISE serialization_failure USING MESSAGE = 'O vínculo mudou. Atualize o grupo antes de salvar.';
  END IF;

  client.entregaveis := coalesce(nullif(client.entregaveis, 'null'::jsonb), '{}'::jsonb);
  IF jsonb_typeof(client.entregaveis) <> 'object' THEN RAISE EXCEPTION 'O cadastro precisa ser corrigido antes de alterar o grupo.'; END IF;

  IF p_conversation_id IS NULL THEN
    IF num_nonnulls(p_wa_client_id, p_channel_id, p_group_jid) <> 0 THEN RAISE EXCEPTION 'Grupo inválido.'; END IF;
    DELETE FROM public.cliente_whatsapp_grupo WHERE cliente_id = client.id;
    IF had_link AND NOT FOUND THEN RAISE insufficient_privilege USING MESSAGE = 'Sem acesso para remover o vínculo.'; END IF;
    client.entregaveis := client.entregaveis - 'whatsapp_grupo';
  ELSE
    -- Serializa o uso da mesma conversa entre clientes sem exigir escrita no Atendimento.
    PERFORM pg_advisory_xact_lock(hashtextextended(p_conversation_id::text, 20261109));
    SELECT g.* INTO source FROM public.atendimento_conversas g WHERE g.id = p_conversation_id
      AND g.cliente_id = p_wa_client_id AND g.whatsapp_config_id = p_channel_id AND g.chat_jid = p_group_jid
      AND private.cs_ia_group_source_visible(g.id, g.cliente_id, g.chat_jid);
    IF NOT FOUND THEN RAISE insufficient_privilege USING MESSAGE = 'Grupo indisponível neste canal.'; END IF;

    IF EXISTS (SELECT 1 FROM private.cs_ia_group_archives a WHERE a.conversation_id = source.id
      AND a.wa_client_id = source.cliente_id AND a.channel_id = source.whatsapp_config_id AND a.group_jid = source.chat_jid) THEN
      RAISE object_not_in_prerequisite_state USING MESSAGE = 'Restaure o grupo no CS antes de vincular.';
    END IF;

    IF EXISTS (SELECT 1 FROM private.cs_ia_group_claims() claim WHERE claim.client_id <> client.id
      AND (claim.conversation_id = source.id OR (claim.conversation_id IS NULL AND claim.wa_client_id = source.cliente_id
        AND claim.group_jid = lower(btrim(source.chat_jid))))) THEN
      RAISE unique_violation USING MESSAGE = 'Este grupo já está vinculado a outro cliente.';
    END IF;

    -- Retira as marcas ainda autorizadas no inventário antes de gravar a reivindicação.
    WITH staged AS (
      DELETE FROM private.cs_ia_group_team_marks m WHERE m.client_id IS NULL
        AND (m.conversation_id, m.wa_client_id, m.channel_id, m.group_jid)
          = (source.id, source.cliente_id, source.whatsapp_config_id, source.chat_jid)
      RETURNING m.sender_jid
    ) SELECT array_agg(sender_jid) INTO inventory_senders FROM staged;

    IF had_link THEN
      UPDATE public.cliente_whatsapp_grupo SET conversation_id = source.id, chat_jid = source.chat_jid,
        display_name = source.display_name, wa_cliente_id = source.cliente_id, updated_at = clock_timestamp()
      WHERE cliente_id = client.id;
    ELSE
      INSERT INTO public.cliente_whatsapp_grupo (cliente_id, conversation_id, chat_jid, display_name, wa_cliente_id)
      VALUES (client.id, source.id, source.chat_jid, source.display_name, source.cliente_id)
      ON CONFLICT (cliente_id) DO NOTHING;
    END IF;
    IF NOT FOUND THEN RAISE serialization_failure USING MESSAGE = 'O vínculo mudou. Atualize o grupo antes de salvar.'; END IF;
    payload := jsonb_build_object('conversation_id', source.id, 'chat_jid', source.chat_jid,
      'display_name', source.display_name, 'wa_cliente_id', source.cliente_id);
    client.entregaveis := jsonb_set(client.entregaveis, '{whatsapp_grupo}', payload);
  END IF;

  UPDATE public.clientes SET entregaveis = client.entregaveis WHERE id = client.id RETURNING entregaveis INTO saved_deliverables;
  IF NOT FOUND OR (saved_deliverables->'whatsapp_grupo') IS DISTINCT FROM (client.entregaveis->'whatsapp_grupo') THEN
    RAISE insufficient_privilege USING MESSAGE = 'Sem acesso para alterar o grupo deste cliente.';
  END IF;
  IF cardinality(inventory_senders) > 0 THEN
    INSERT INTO private.cs_ia_group_team_marks (client_id, conversation_id, wa_client_id, channel_id, group_jid, sender_jid)
    SELECT client.id, source.id, source.cliente_id, source.whatsapp_config_id, source.chat_jid, sender
    FROM unnest(inventory_senders) sender ON CONFLICT DO NOTHING;
  END IF;
  RETURN true;
END;
$$;

NOTIFY pgrst, 'reload schema';
COMMIT;

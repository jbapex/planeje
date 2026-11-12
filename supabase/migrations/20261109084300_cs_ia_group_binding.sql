BEGIN;

CREATE TABLE private.cs_ia_group_archives (
  conversation_id uuid NOT NULL REFERENCES public.atendimento_conversas(id) ON DELETE CASCADE,
  wa_client_id uuid NOT NULL,
  channel_id uuid NOT NULL,
  group_jid text NOT NULL,
  archived_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  archived_by uuid NOT NULL DEFAULT auth.uid(),
  PRIMARY KEY (conversation_id, wa_client_id, channel_id, group_jid)
);

CREATE FUNCTION private.cs_ia_group_archive_scope(p_conversation uuid, p_wa_client uuid, p_channel uuid, p_jid text)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT coalesce(private.cs_ia_role() IN ('admin', 'superadmin'), false)
    AND private.cs_ia_group_source_visible(p_conversation, p_wa_client, p_jid)
    AND EXISTS (SELECT 1 FROM public.atendimento_conversas g WHERE g.id = p_conversation
      AND g.cliente_id = p_wa_client AND g.whatsapp_config_id = p_channel AND g.chat_jid = p_jid);
$$;

ALTER TABLE private.cs_ia_group_archives ENABLE ROW LEVEL SECURITY;
CREATE POLICY cs_ia_group_archives_scope ON private.cs_ia_group_archives FOR ALL TO authenticated
  USING (private.cs_ia_group_archive_scope(conversation_id, wa_client_id, channel_id, group_jid))
  WITH CHECK (archived_by = auth.uid() AND private.cs_ia_group_archive_scope(conversation_id, wa_client_id, channel_id, group_jid));
REVOKE ALL ON TABLE private.cs_ia_group_archives FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, DELETE ON TABLE private.cs_ia_group_archives TO authenticated;

CREATE FUNCTION private.cs_ia_group_archive_version(p_conversation uuid, p_wa_client uuid, p_channel uuid, p_jid text, p_archived_at timestamptz)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT md5(jsonb_build_array(p_conversation, p_wa_client, p_channel, p_jid, extract(epoch FROM p_archived_at))::text);
$$;

CREATE FUNCTION private.cs_ia_group_claims()
RETURNS TABLE (client_id uuid, conversation_id uuid, wa_client_id uuid, group_jid text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT l.cliente_id, l.conversation_id, l.wa_cliente_id, lower(btrim(l.chat_jid))
  FROM public.cliente_whatsapp_grupo l WHERE private.cs_ia_role() IN ('admin', 'superadmin')
  UNION ALL
  SELECT c.id, public.central_trafego_try_uuid(c.entregaveis->'whatsapp_grupo'->>'conversation_id'),
    public.central_trafego_try_uuid(c.entregaveis->'whatsapp_grupo'->>'wa_cliente_id'),
    lower(btrim(c.entregaveis->'whatsapp_grupo'->>'chat_jid'))
  FROM public.clientes c WHERE c.etapa = 'closed' AND private.cs_ia_role() IN ('admin', 'superadmin')
    AND jsonb_typeof(c.entregaveis->'whatsapp_grupo') = 'object'
    AND NOT EXISTS (SELECT 1 FROM public.cliente_whatsapp_grupo l WHERE l.cliente_id = c.id);
$$;

CREATE FUNCTION public.cs_ia_group_binding(p_client_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'version', md5(jsonb_build_array(c.entregaveis->'whatsapp_grupo', l.conversation_id, l.chat_jid,
      l.wa_cliente_id, l.display_name, extract(epoch FROM l.updated_at))::text),
    'status', g.group_status, 'conversationId', g.conversation_id, 'groupName', g.group_name)
  FROM public.clientes c
  LEFT JOIN public.cliente_whatsapp_grupo l ON l.cliente_id = c.id
  CROSS JOIN LATERAL private.cs_ia_group(c.id) g
  WHERE c.id = p_client_id AND c.etapa = 'closed' AND private.cs_ia_role() IN ('admin', 'superadmin');
$$;

CREATE FUNCTION public.cs_ia_set_group_binding(p_client_id uuid, p_conversation_id uuid, p_wa_client_id uuid,
  p_channel_id uuid, p_group_jid text, p_version text)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  client public.clientes%ROWTYPE;
  source public.atendimento_conversas%ROWTYPE;
  had_link boolean;
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
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION private.cs_ia_group_claims(), public.cs_ia_group_binding(uuid), public.cs_ia_set_group_binding(uuid, uuid, uuid, uuid, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.cs_ia_group_claims(), public.cs_ia_group_binding(uuid), public.cs_ia_set_group_binding(uuid, uuid, uuid, uuid, text, text) TO authenticated;
REVOKE ALL ON FUNCTION private.cs_ia_group_archive_scope(uuid, uuid, uuid, text),
  private.cs_ia_group_archive_version(uuid, uuid, uuid, text, timestamptz) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.cs_ia_group_archive_scope(uuid, uuid, uuid, text),
  private.cs_ia_group_archive_version(uuid, uuid, uuid, text, timestamptz) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;

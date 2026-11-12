BEGIN;

CREATE TABLE private.cs_ia_group_labels (
  conversation_id uuid NOT NULL REFERENCES public.atendimento_conversas(id) ON DELETE CASCADE,
  wa_client_id uuid NOT NULL,
  channel_id uuid NOT NULL,
  group_jid text NOT NULL,
  display_name text CHECK (display_name IS NULL OR (char_length(display_name) BETWEEN 1 AND 120 AND display_name ~ '[^[:space:]]')),
  version uuid NOT NULL DEFAULT gen_random_uuid(),
  PRIMARY KEY (conversation_id, wa_client_id, channel_id, group_jid)
);

CREATE FUNCTION private.cs_ia_group_label_editable(p_conversation uuid, p_wa_client uuid, p_channel uuid, p_jid text)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT private.cs_ia_group_archive_scope(p_conversation, p_wa_client, p_channel, p_jid)
    AND EXISTS (SELECT 1 FROM public.cliente_whatsapp_config cfg WHERE cfg.id = p_channel AND cfg.archived_at IS NULL)
    AND NOT EXISTS (SELECT 1 FROM private.cs_ia_group_archives a WHERE a.conversation_id = p_conversation
      AND a.wa_client_id = p_wa_client AND a.channel_id = p_channel AND a.group_jid = p_jid);
$$;

ALTER TABLE private.cs_ia_group_labels ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.cs_ia_group_labels FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE private.cs_ia_group_labels TO authenticated;
CREATE POLICY cs_ia_group_label_read ON private.cs_ia_group_labels FOR SELECT TO authenticated USING (
  (SELECT private.cs_ia_role()) IS NOT NULL AND EXISTS (SELECT 1 FROM public.atendimento_conversas g
    WHERE g.id = cs_ia_group_labels.conversation_id AND g.cliente_id = cs_ia_group_labels.wa_client_id
      AND g.whatsapp_config_id = cs_ia_group_labels.channel_id AND g.chat_jid = cs_ia_group_labels.group_jid
      AND g.is_group AND NOT g.bloqueada AND public.atendimento_user_can_access_conversation(g.id))
);
CREATE POLICY cs_ia_group_label_insert ON private.cs_ia_group_labels FOR INSERT TO authenticated
  WITH CHECK (private.cs_ia_group_label_editable(conversation_id, wa_client_id, channel_id, group_jid));
CREATE POLICY cs_ia_group_label_update ON private.cs_ia_group_labels FOR UPDATE TO authenticated
  USING (private.cs_ia_group_label_editable(conversation_id, wa_client_id, channel_id, group_jid))
  WITH CHECK (private.cs_ia_group_label_editable(conversation_id, wa_client_id, channel_id, group_jid));

CREATE FUNCTION public.cs_ia_group_label(p_conversation_id uuid, p_wa_client_id uuid, p_channel_id uuid, p_group_jid text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT jsonb_build_object('officialName', coalesce(nullif(btrim(g.display_name), ''), 'Grupo sem nome'),
    'name', l.display_name, 'version', l.version)
  FROM public.atendimento_conversas g LEFT JOIN private.cs_ia_group_labels l ON l.conversation_id = g.id
    AND l.wa_client_id = g.cliente_id AND l.channel_id = g.whatsapp_config_id AND l.group_jid = g.chat_jid
  WHERE g.id = p_conversation_id AND g.cliente_id = p_wa_client_id AND g.whatsapp_config_id = p_channel_id
    AND g.chat_jid = p_group_jid AND private.cs_ia_group_label_editable(g.id, g.cliente_id, g.whatsapp_config_id, g.chat_jid);
$$;

CREATE FUNCTION public.cs_ia_set_group_label(p_conversation_id uuid, p_wa_client_id uuid, p_channel_id uuid,
  p_group_jid text, p_version uuid, p_name text)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  label text := regexp_replace(p_name, '^[[:space:]]+|[[:space:]]+$', '', 'g');
  current_label jsonb;
BEGIN
  IF coalesce(private.cs_ia_role(), '') NOT IN ('admin', 'superadmin') THEN
    RAISE insufficient_privilege USING MESSAGE = 'Sem acesso para renomear grupos no CS.';
  END IF;
  IF label IS NOT NULL AND char_length(label) NOT BETWEEN 1 AND 120 THEN
    RAISE invalid_parameter_value USING MESSAGE = 'Informe um nome com 1 a 120 caracteres.';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_conversation_id::text, 20261109));
  current_label := public.cs_ia_group_label(p_conversation_id, p_wa_client_id, p_channel_id, p_group_jid);
  IF current_label IS NULL THEN RAISE insufficient_privilege USING MESSAGE = 'Grupo indisponível neste canal.'; END IF;
  IF (current_label->>'version')::uuid IS DISTINCT FROM p_version THEN
    RAISE serialization_failure USING MESSAGE = 'O nome mudou. Atualize antes de salvar.';
  END IF;
  INSERT INTO private.cs_ia_group_labels AS l (conversation_id, wa_client_id, channel_id, group_jid, display_name)
    VALUES (p_conversation_id, p_wa_client_id, p_channel_id, p_group_jid, label)
    ON CONFLICT (conversation_id, wa_client_id, channel_id, group_jid)
    DO UPDATE SET display_name = EXCLUDED.display_name, version = EXCLUDED.version WHERE l.version = p_version;
  IF NOT FOUND THEN RAISE serialization_failure USING MESSAGE = 'O nome mudou. Atualize antes de salvar.'; END IF;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.cs_ia_radar()
RETURNS TABLE(client_id uuid, client_name text, owner_id uuid, owner_name text, manual_status text,
  group_status text, conversation_id uuid, group_jid text, group_name text, wa_client_id uuid,
  last_activity_at timestamptz, awaiting_since timestamptz, wait_minutes integer,
  score integer, health text, signal text, factors jsonb, score_delta integer, channel_id uuid)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT r.client_id, r.client_name, r.owner_id, r.owner_name, r.manual_status, r.group_status,
    r.conversation_id, r.group_jid, coalesce(l.display_name, r.group_name), r.wa_client_id, r.last_activity_at,
    r.awaiting_since, r.wait_minutes, r.score, r.health, r.signal, r.factors, r.score_delta, r.channel_id
  FROM private.cs_ia_radar_at(now()) r LEFT JOIN private.cs_ia_group_labels l ON l.conversation_id = r.conversation_id
    AND l.wa_client_id = r.wa_client_id AND l.channel_id = r.channel_id AND l.group_jid = r.group_jid;
$$;

CREATE OR REPLACE FUNCTION public.cs_ia_group_binding(p_client_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'version', md5(jsonb_build_array(c.entregaveis->'whatsapp_grupo', l.conversation_id, l.chat_jid,
      l.wa_cliente_id, l.display_name, extract(epoch FROM l.updated_at))::text),
    'status', g.group_status, 'conversationId', g.conversation_id, 'groupName', coalesce(n.display_name, g.group_name))
  FROM public.clientes c
  LEFT JOIN public.cliente_whatsapp_grupo l ON l.cliente_id = c.id
  CROSS JOIN LATERAL private.cs_ia_group(c.id) g
  LEFT JOIN private.cs_ia_group_labels n ON n.conversation_id = g.conversation_id AND n.wa_client_id = g.wa_client_id
    AND n.channel_id = g.channel_id AND n.group_jid = g.group_jid
  WHERE c.id = p_client_id AND c.etapa = 'closed' AND private.cs_ia_role() IN ('admin', 'superadmin');
$$;

CREATE OR REPLACE FUNCTION public.cs_ia_group_inventory(p_status text, p_after uuid DEFAULT NULL)
RETURNS TABLE (id uuid, display_name text, channel_name text, wa_cliente_id uuid, whatsapp_config_id uuid,
  chat_jid text, last_message_at timestamptz, archived_at timestamptz, archive_origin text, archive_version text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  WITH claims AS MATERIALIZED (SELECT * FROM private.cs_ia_group_claims())
  SELECT g.id, coalesce(l.display_name, nullif(btrim(g.display_name), ''), 'Grupo sem nome'), cfg.name::text,
    g.cliente_id, g.whatsapp_config_id, CASE WHEN p_status = 'unlinked' THEN g.chat_jid END, g.last_message_at,
    coalesce(g.archived_at, a.archived_at),
    CASE WHEN g.archived_at IS NOT NULL THEN 'atendimento' WHEN a.archived_at IS NOT NULL THEN 'cs' END,
    CASE WHEN g.archived_at IS NULL AND cfg.id IS NOT NULL AND cfg.archived_at IS NULL THEN
      private.cs_ia_group_archive_version(g.id, g.cliente_id, g.whatsapp_config_id, g.chat_jid, a.archived_at) END
  FROM public.atendimento_conversas g LEFT JOIN public.cliente_whatsapp_config cfg ON cfg.id = g.whatsapp_config_id
  LEFT JOIN private.cs_ia_group_archives a ON a.conversation_id = g.id AND a.wa_client_id = g.cliente_id
    AND a.channel_id = g.whatsapp_config_id AND a.group_jid = g.chat_jid
  LEFT JOIN private.cs_ia_group_labels l ON l.conversation_id = g.id AND l.wa_client_id = g.cliente_id
    AND l.channel_id = g.whatsapp_config_id AND l.group_jid = g.chat_jid
  WHERE private.cs_ia_role() IN ('admin', 'superadmin') AND g.is_group AND NOT g.bloqueada
    AND g.whatsapp_config_id IS NOT NULL AND (p_after IS NULL OR g.id > p_after)
    AND public.atendimento_user_can_access_conversation(g.id)
    AND ((p_status = 'archived' AND g.archived_at IS NOT NULL) OR (g.archived_at IS NULL
      AND ((p_status = 'unlinked' AND a.archived_at IS NULL) OR (p_status = 'archived' AND a.archived_at IS NOT NULL))
      AND NOT EXISTS (SELECT 1 FROM claims c WHERE c.conversation_id = g.id OR (c.conversation_id IS NULL
        AND c.wa_client_id = g.cliente_id AND c.group_jid = lower(btrim(g.chat_jid))))))
  ORDER BY g.id
  LIMIT 100;
$$;

REVOKE ALL ON FUNCTION private.cs_ia_group_label_editable(uuid, uuid, uuid, text), public.cs_ia_group_label(uuid, uuid, uuid, text),
  public.cs_ia_set_group_label(uuid, uuid, uuid, text, uuid, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.cs_ia_group_label_editable(uuid, uuid, uuid, text), public.cs_ia_group_label(uuid, uuid, uuid, text),
  public.cs_ia_set_group_label(uuid, uuid, uuid, text, uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;

BEGIN;

CREATE FUNCTION public.cs_ia_group_inventory(p_status text, p_after uuid DEFAULT NULL)
RETURNS TABLE (id uuid, display_name text, channel_name text, wa_cliente_id uuid, whatsapp_config_id uuid,
  chat_jid text, last_message_at timestamptz, archived_at timestamptz, archive_origin text, archive_version text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  WITH claims AS MATERIALIZED (SELECT * FROM private.cs_ia_group_claims())
  SELECT g.id, coalesce(nullif(btrim(g.display_name), ''), 'Grupo sem nome'), cfg.name::text, g.cliente_id,
    g.whatsapp_config_id, CASE WHEN p_status = 'unlinked' THEN g.chat_jid END, g.last_message_at,
    coalesce(g.archived_at, a.archived_at),
    CASE WHEN g.archived_at IS NOT NULL THEN 'atendimento' WHEN a.archived_at IS NOT NULL THEN 'cs' END,
    CASE WHEN g.archived_at IS NULL AND cfg.id IS NOT NULL AND cfg.archived_at IS NULL THEN
      private.cs_ia_group_archive_version(g.id, g.cliente_id, g.whatsapp_config_id, g.chat_jid, a.archived_at) END
  FROM public.atendimento_conversas g LEFT JOIN public.cliente_whatsapp_config cfg ON cfg.id = g.whatsapp_config_id
  LEFT JOIN private.cs_ia_group_archives a ON a.conversation_id = g.id AND a.wa_client_id = g.cliente_id
    AND a.channel_id = g.whatsapp_config_id AND a.group_jid = g.chat_jid
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

REVOKE ALL ON FUNCTION public.cs_ia_group_inventory(text, uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cs_ia_group_inventory(text, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;

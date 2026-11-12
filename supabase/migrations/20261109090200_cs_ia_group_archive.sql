BEGIN;

CREATE FUNCTION public.cs_ia_set_group_archive(p_conversation_id uuid, p_wa_client_id uuid, p_channel_id uuid,
  p_version text, p_archive boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  source public.atendimento_conversas%ROWTYPE;
  previous timestamptz;
BEGIN
  IF coalesce(private.cs_ia_role(), '') NOT IN ('admin', 'superadmin') THEN
    RAISE insufficient_privilege USING MESSAGE = 'Sem acesso para alterar o arquivamento no CS.';
  END IF;
  IF p_archive IS NULL OR p_version IS NULL THEN RAISE EXCEPTION 'Arquivamento inválido.'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_conversation_id::text, 20261109));
  SELECT g.* INTO source FROM public.atendimento_conversas g JOIN public.cliente_whatsapp_config cfg
    ON cfg.id = g.whatsapp_config_id AND cfg.archived_at IS NULL
  WHERE g.id = p_conversation_id AND g.cliente_id = p_wa_client_id AND g.whatsapp_config_id = p_channel_id
    AND private.cs_ia_group_archive_scope(g.id, g.cliente_id, g.whatsapp_config_id, g.chat_jid);
  IF NOT FOUND THEN RAISE insufficient_privilege USING MESSAGE = 'Grupo indisponível neste canal.'; END IF;

  IF EXISTS (SELECT 1 FROM private.cs_ia_group_claims() c WHERE c.conversation_id = source.id OR (c.conversation_id IS NULL
    AND c.wa_client_id = source.cliente_id AND c.group_jid = lower(btrim(source.chat_jid)))) THEN
    RAISE object_not_in_prerequisite_state USING MESSAGE = 'Este grupo está vinculado. Revise o vínculo antes de alterar o arquivamento.';
  END IF;

  SELECT a.archived_at INTO previous FROM private.cs_ia_group_archives a WHERE a.conversation_id = source.id
    AND a.wa_client_id = source.cliente_id AND a.channel_id = source.whatsapp_config_id AND a.group_jid = source.chat_jid;
  IF p_version IS DISTINCT FROM private.cs_ia_group_archive_version(source.id, source.cliente_id, source.whatsapp_config_id, source.chat_jid, previous)
      OR p_archive = (previous IS NOT NULL) THEN
    RAISE serialization_failure USING MESSAGE = 'O arquivamento mudou. Atualize os grupos.';
  END IF;

  IF p_archive THEN
    INSERT INTO private.cs_ia_group_archives (conversation_id, wa_client_id, channel_id, group_jid)
    VALUES (source.id, source.cliente_id, source.whatsapp_config_id, source.chat_jid) ON CONFLICT DO NOTHING;
  ELSE
    DELETE FROM private.cs_ia_group_archives WHERE conversation_id = source.id AND wa_client_id = source.cliente_id
      AND channel_id = source.whatsapp_config_id AND group_jid = source.chat_jid AND archived_at = previous;
  END IF;
  IF NOT FOUND THEN RAISE serialization_failure USING MESSAGE = 'O arquivamento mudou. Atualize os grupos.'; END IF;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.cs_ia_set_group_archive(uuid, uuid, uuid, text, boolean) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cs_ia_set_group_archive(uuid, uuid, uuid, text, boolean) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;

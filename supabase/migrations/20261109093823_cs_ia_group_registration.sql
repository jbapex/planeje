BEGIN;

ALTER TABLE public.atendimento_conversas ADD COLUMN cs_registered_at timestamptz;

CREATE FUNCTION private.cs_ia_protect_registration_marker()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  previous_marker timestamptz := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.cs_registered_at END;
BEGIN
  IF current_user IN ('authenticated', 'anon') AND NEW.cs_registered_at IS DISTINCT FROM previous_marker THEN
    RAISE insufficient_privilege USING MESSAGE = 'A origem do cadastro é registrada pelo servidor.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER cs_ia_protect_registration_marker BEFORE INSERT OR UPDATE OF cs_registered_at ON public.atendimento_conversas
  FOR EACH ROW EXECUTE FUNCTION private.cs_ia_protect_registration_marker();
REVOKE ALL ON FUNCTION private.cs_ia_protect_registration_marker() FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.cs_ia_group_registration_channels(p_channel_id uuid DEFAULT NULL)
RETURNS TABLE(id uuid, wa_client_id uuid, channel_name text, revision timestamptz)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT cfg.id, cfg.cliente_id, cfg.name::text, cfg.updated_at
  FROM public.cliente_whatsapp_config cfg
  WHERE private.cs_ia_role() IN ('admin', 'superadmin') AND cfg.provider = 'uazapi' AND cfg.archived_at IS NULL
    AND (p_channel_id IS NULL OR cfg.id = p_channel_id)
    AND public.atendimento_user_can_access_atendimento_scope(cfg.cliente_id, NULL, cfg.id);
$$;

CREATE FUNCTION private.cs_ia_register_group(p_actor_id uuid, p_session_id uuid, p_channel_id uuid, p_wa_client_id uuid,
  p_config_revision timestamptz, p_group_jid text, p_official_name text, p_name text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
SET "request.jwt.claims" = '' SET "request.jwt.claim.sub" = '' AS $$
DECLARE
  source public.atendimento_conversas%ROWTYPE;
  inserted boolean := false;
  official_name text := nullif(btrim(p_official_name), '');
  label text := regexp_replace(p_name, '^[[:space:]]+|[[:space:]]+$', '', 'g');
BEGIN
  IF p_actor_id IS NULL OR p_session_id IS NULL THEN RAISE insufficient_privilege USING MESSAGE = 'Sem acesso para registrar grupos no CS.'; END IF;
  -- Somente a função Edge chama este gravador, com uma sessão verificada pelo Auth.
  PERFORM set_config('request.jwt.claim.sub', p_actor_id::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', p_actor_id, 'session_id', p_session_id, 'role', 'authenticated')::text, true);
  IF p_group_jid IS NULL OR p_group_jid !~ '^[a-z0-9-]{1,196}@g\.us$' OR label IS NULL OR char_length(label) NOT BETWEEN 1 AND 120
    OR official_name IS NULL OR char_length(official_name) > 300 THEN
    RAISE invalid_parameter_value USING MESSAGE = 'Confira o ID e o nome do grupo.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_wa_client_id::text || ':' || p_group_jid, 20261109));
  IF coalesce(private.cs_ia_role(), '') NOT IN ('admin', 'superadmin') THEN
    RAISE insufficient_privilege USING MESSAGE = 'Sem acesso para registrar grupos no CS.';
  END IF;
  PERFORM cfg.id FROM public.cliente_whatsapp_config cfg WHERE cfg.id = p_channel_id AND cfg.cliente_id = p_wa_client_id
    AND cfg.updated_at = p_config_revision AND cfg.provider = 'uazapi' AND cfg.archived_at IS NULL
    AND public.atendimento_user_can_access_atendimento_scope(cfg.cliente_id, NULL, cfg.id) FOR SHARE;
  IF NOT FOUND THEN RAISE insufficient_privilege USING MESSAGE = 'Canal indisponível para esta sessão.'; END IF;

  SELECT g.* INTO source FROM public.atendimento_conversas g
  WHERE g.cliente_id = p_wa_client_id AND g.whatsapp_config_id = p_channel_id AND lower(btrim(g.chat_jid)) = p_group_jid
  ORDER BY (g.chat_jid = p_group_jid) DESC, g.archived_at NULLS FIRST, g.id LIMIT 1;
  IF NOT FOUND THEN
    IF EXISTS (SELECT 1 FROM public.atendimento_conversas g WHERE g.cliente_id = p_wa_client_id
      AND g.whatsapp_config_id <> p_channel_id AND lower(btrim(g.chat_jid)) = p_group_jid AND g.archived_at IS NULL) THEN
      RAISE unique_violation USING MESSAGE = 'Já existe uma conversa ativa para este grupo em outro canal.';
    END IF;
    INSERT INTO public.atendimento_conversas (cliente_id, whatsapp_config_id, chat_jid, is_group, display_name, status,
      fila_id, assigned_to, cs_registered_at)
    VALUES (p_wa_client_id, p_channel_id, p_group_jid, true, official_name, 'resolvido',
      (SELECT fc.fila_id FROM public.atendimento_fila_canais fc WHERE fc.whatsapp_config_id = p_channel_id),
      public.caixa_dono_padrao_conversa(p_wa_client_id, official_name), clock_timestamp())
    ON CONFLICT (cliente_id, whatsapp_config_id, chat_jid) DO NOTHING RETURNING * INTO source;
    inserted := FOUND;
    IF NOT inserted THEN
      SELECT g.* INTO source FROM public.atendimento_conversas g WHERE g.cliente_id = p_wa_client_id
        AND g.whatsapp_config_id = p_channel_id AND g.chat_jid = p_group_jid;
    END IF;
  END IF;
  IF source.id IS NULL OR NOT coalesce(source.is_group, false) OR source.bloqueada OR source.archived_at IS NOT NULL
    OR NOT public.atendimento_user_can_access_conversation(source.id) THEN
    RAISE object_not_in_prerequisite_state USING MESSAGE = 'A conversa existente está indisponível neste canal.';
  END IF;
  IF inserted AND label IS DISTINCT FROM official_name THEN
    INSERT INTO private.cs_ia_group_labels (conversation_id, wa_client_id, channel_id, group_jid, display_name)
      VALUES (source.id, source.cliente_id, source.whatsapp_config_id, source.chat_jid, label);
  END IF;
  RETURN jsonb_build_object('id', source.id, 'created', inserted);
END;
$$;

CREATE FUNCTION public.cs_ia_register_group(p_actor_id uuid, p_session_id uuid, p_channel_id uuid, p_wa_client_id uuid,
  p_config_revision timestamptz, p_group_jid text, p_official_name text, p_name text)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path = '' AS $$
  SELECT private.cs_ia_register_group(p_actor_id, p_session_id, p_channel_id, p_wa_client_id, p_config_revision, p_group_jid, p_official_name, p_name);
$$;

REVOKE ALL ON FUNCTION public.cs_ia_group_registration_channels(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cs_ia_group_registration_channels(uuid) TO authenticated;
REVOKE ALL ON FUNCTION private.cs_ia_register_group(uuid, uuid, uuid, uuid, timestamptz, text, text, text),
  public.cs_ia_register_group(uuid, uuid, uuid, uuid, timestamptz, text, text, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.cs_ia_register_group(uuid, uuid, uuid, uuid, timestamptz, text, text, text),
  public.cs_ia_register_group(uuid, uuid, uuid, uuid, timestamptz, text, text, text) TO service_role;

-- Um cadastro sem mensagens não compete com uma conversa que já tem atividade.
CREATE OR REPLACE FUNCTION public.caixa_arquivar_canais_duplicados(
  p_chat_jid text DEFAULT NULL,
  p_cliente_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conversas integer := 0;
  v_canais integer := 0;
BEGIN
  WITH ranked AS (
    SELECT
      c.id,
      c.cliente_id,
      c.chat_jid,
      c.assigned_to,
      row_number() OVER (
        PARTITION BY c.cliente_id, c.chat_jid
        ORDER BY coalesce(c.last_message_at, c.created_at) DESC, c.created_at DESC
      ) AS rn
    FROM public.atendimento_conversas c
    WHERE c.archived_at IS NULL
      AND (c.cs_registered_at IS NULL OR c.last_message_at IS NOT NULL)
      AND (p_chat_jid IS NULL OR c.chat_jid = p_chat_jid)
      AND (p_cliente_id IS NULL OR c.cliente_id = p_cliente_id)
  ),
  winners AS (
    SELECT * FROM ranked WHERE rn = 1
  ),
  losers AS (
    SELECT r.*
    FROM ranked r
    JOIN winners w
      ON w.cliente_id = r.cliente_id
     AND w.chat_jid = r.chat_jid
    WHERE r.rn > 1
  ),
  copied AS (
    UPDATE public.atendimento_conversas w
    SET assigned_to = l.assigned_to, updated_at = now()
    FROM winners win
    JOIN losers l
      ON l.cliente_id = win.cliente_id
     AND l.chat_jid = win.chat_jid
     AND l.assigned_to IS NOT NULL
    WHERE w.id = win.id
      AND w.assigned_to IS NULL
    RETURNING w.id
  ),
  archived AS (
    UPDATE public.atendimento_conversas c
    SET archived_at = now(), updated_at = now()
    FROM losers l
    WHERE c.id = l.id
      AND c.archived_at IS NULL
    RETURNING c.id
  )
  SELECT (SELECT count(*) FROM archived)
  INTO v_conversas
  FROM (SELECT count(*) AS n FROM copied) AS _copied;

  WITH dead AS (
    UPDATE public.cliente_whatsapp_config cfg
    SET archived_at = now(), updated_at = now()
    WHERE cfg.archived_at IS NULL
      AND EXISTS (
        SELECT 1
        FROM public.atendimento_conversas c
        WHERE c.whatsapp_config_id = cfg.id
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.atendimento_conversas c
        WHERE c.whatsapp_config_id = cfg.id
          AND c.archived_at IS NULL
      )
    RETURNING cfg.id
  )
  SELECT count(*) INTO v_canais FROM dead;

  RETURN jsonb_build_object(
    'conversas_arquivadas', v_conversas,
    'canais_arquivados', v_canais
  );
END;
$$;

NOTIFY pgrst, 'reload schema';
COMMIT;

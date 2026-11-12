BEGIN;

CREATE TABLE private.cs_ia_reading_config (
  client_id uuid PRIMARY KEY REFERENCES public.clientes(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL,
  wa_client_id uuid NOT NULL,
  channel_id uuid NOT NULL,
  group_jid text NOT NULL,
  revision uuid NOT NULL DEFAULT gen_random_uuid(),
  enabled boolean NOT NULL DEFAULT true,
  enabled_at timestamptz NOT NULL DEFAULT now(),
  include_audio boolean NOT NULL,
  transcribe_audio_since timestamptz CHECK (transcribe_audio_since IS NULL OR enabled AND include_audio)
);

CREATE TABLE private.cs_ia_reading_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES private.cs_ia_reading_config(client_id) ON DELETE CASCADE,
  revision uuid NOT NULL,
  fingerprint text NOT NULL,
  source_at timestamptz NOT NULL,
  state text NOT NULL DEFAULT 'processing' CHECK (state IN ('processing', 'budget_wait', 'completed', 'no_text', 'failed')),
  lease uuid,
  lease_until timestamptz,
  attempts smallint NOT NULL DEFAULT 1 CHECK (attempts BETWEEN 0 AND 3),
  ready_at timestamptz NOT NULL DEFAULT now(),
  charged_estimate integer CHECK (charged_estimate BETWEEN 1 AND 16000),
  finished_at timestamptz,
  result jsonb,
  UNIQUE (client_id, revision, fingerprint)
);

ALTER TABLE private.cs_ia_reading_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.cs_ia_reading_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.cs_ia_reading_config, private.cs_ia_reading_jobs FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION private.cs_ia_sender_jid(p_value text)
RETURNS text LANGUAGE sql IMMUTABLE STRICT SET search_path = '' AS $$
  SELECT part[1] || '@' || CASE WHEN part[2] = 'c.us' THEN 's.whatsapp.net' ELSE part[2] END
  FROM regexp_match(lower(btrim(p_value)), '^([0-9]{6,20})(?::[0-9]{1,4})?@(s[.]whatsapp[.]net|c[.]us|lid)$') part;
$$;

CREATE TABLE private.cs_ia_group_team_marks (
  client_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.atendimento_conversas(id) ON DELETE CASCADE,
  wa_client_id uuid NOT NULL,
  channel_id uuid NOT NULL,
  group_jid text NOT NULL,
  sender_jid text NOT NULL CHECK (sender_jid IS NOT DISTINCT FROM private.cs_ia_sender_jid(sender_jid)),
  PRIMARY KEY (client_id, conversation_id, wa_client_id, channel_id, group_jid, sender_jid)
);
CREATE INDEX cs_ia_group_team_conversation_idx ON private.cs_ia_group_team_marks (conversation_id);
ALTER TABLE private.cs_ia_group_team_marks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.cs_ia_group_team_marks FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, DELETE ON private.cs_ia_group_team_marks TO authenticated;

CREATE FUNCTION private.cs_ia_group_team_scope(p_client_id uuid, p_conversation_id uuid,
  p_wa_client_id uuid, p_channel_id uuid, p_group_jid text)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.cs_ia_group_source(p_client_id, p_conversation_id) g
    WHERE (g.cliente_id, g.whatsapp_config_id, g.chat_jid) = (p_wa_client_id, p_channel_id, p_group_jid)
  );
$$;

CREATE POLICY cs_ia_group_team_read ON private.cs_ia_group_team_marks FOR SELECT TO authenticated
  USING (private.cs_ia_group_team_scope(client_id, conversation_id, wa_client_id, channel_id, group_jid));
CREATE POLICY cs_ia_group_team_manage ON private.cs_ia_group_team_marks FOR ALL TO authenticated
  USING ((SELECT private.cs_ia_role()) IN ('admin', 'superadmin')
    AND private.cs_ia_group_team_scope(client_id, conversation_id, wa_client_id, channel_id, group_jid))
  WITH CHECK ((SELECT private.cs_ia_role()) IN ('admin', 'superadmin')
    AND private.cs_ia_group_team_scope(client_id, conversation_id, wa_client_id, channel_id, group_jid));

CREATE FUNCTION public.cs_ia_group_team(p_client_id uuid, p_conversation_id uuid, p_wa_client_id uuid, p_channel_id uuid, p_group_jid text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT coalesce(jsonb_agg(m.sender_jid ORDER BY m.sender_jid) FILTER (WHERE m.sender_jid IS NOT NULL), '[]'::jsonb)
  FROM public.cs_ia_group_source(p_client_id, p_conversation_id) g
  LEFT JOIN private.cs_ia_group_team_marks m
    ON m.client_id = p_client_id AND m.conversation_id = g.id AND m.wa_client_id = g.cliente_id
    AND m.channel_id = g.whatsapp_config_id AND m.group_jid = g.chat_jid
  WHERE (g.cliente_id, g.whatsapp_config_id, g.chat_jid) = (p_wa_client_id, p_channel_id, p_group_jid)
  GROUP BY g.id;
$$;

CREATE FUNCTION public.cs_ia_mark_group_team(p_client_id uuid, p_conversation_id uuid, p_wa_client_id uuid, p_channel_id uuid,
  p_group_jid text, p_sender_jids text[], p_is_team boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  source record;
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

  PERFORM pg_advisory_xact_lock(hashtextextended(p_client_id::text, 72857));
  SELECT * INTO source FROM public.cs_ia_group_source(p_client_id, p_conversation_id);
  IF NOT FOUND OR (source.cliente_id, source.whatsapp_config_id, source.chat_jid)
    IS DISTINCT FROM (p_wa_client_id, p_channel_id, p_group_jid) THEN
    RAISE insufficient_privilege USING MESSAGE = 'Grupo indisponível para este vínculo.';
  END IF;

  IF p_is_team THEN
    INSERT INTO private.cs_ia_group_team_marks (client_id, conversation_id, wa_client_id, channel_id, group_jid, sender_jid)
    SELECT p_client_id, source.id, source.cliente_id, source.whatsapp_config_id, source.chat_jid, sender FROM unnest(senders) sender
    ON CONFLICT DO NOTHING;
  ELSE
    DELETE FROM private.cs_ia_group_team_marks m WHERE m.client_id = p_client_id AND m.conversation_id = source.id
      AND m.wa_client_id = source.cliente_id AND m.channel_id = source.whatsapp_config_id AND m.group_jid = source.chat_jid
      AND m.sender_jid = ANY(senders);
  END IF;
  RETURN public.cs_ia_group_team(p_client_id, p_conversation_id, p_wa_client_id, p_channel_id, p_group_jid);
END;
$$;

REVOKE ALL ON FUNCTION private.cs_ia_sender_jid(text), private.cs_ia_group_team_scope(uuid, uuid, uuid, uuid, text),
  public.cs_ia_group_team(uuid, uuid, uuid, uuid, text), public.cs_ia_mark_group_team(uuid, uuid, uuid, uuid, text, text[], boolean)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.cs_ia_sender_jid(text), private.cs_ia_group_team_scope(uuid, uuid, uuid, uuid, text),
  public.cs_ia_group_team(uuid, uuid, uuid, uuid, text), public.cs_ia_mark_group_team(uuid, uuid, uuid, uuid, text, text[], boolean) TO authenticated;

-- Cada braço lê no máximo 40 linhas ordenadas da conversa e da instância exatas.
CREATE INDEX cs_ia_reading_inbox_window ON public.cliente_whatsapp_inbox
  (conversation_id, cliente_id, whatsapp_config_id, created_at DESC, id DESC);
CREATE INDEX cs_ia_reading_sent_window ON public.cliente_whatsapp_sent
  (conversation_id, cliente_id, whatsapp_config_id, created_at DESC, id DESC);

CREATE FUNCTION private.cs_ia_reading_group(p_client_id uuid)
RETURNS TABLE(conversation_id uuid, wa_client_id uuid, channel_id uuid, group_jid text)
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT g.conversation_id, g.wa_client_id, g.channel_id, g.group_jid
  FROM private.cs_ia_group(p_client_id) g
  WHERE g.group_status = 'linked' AND NOT EXISTS (
    SELECT 1
    FROM public.clientes c
    LEFT JOIN public.cliente_whatsapp_grupo l ON l.cliente_id = c.id
    WHERE c.id <> p_client_id AND c.etapa = 'closed' AND (
      l.conversation_id = g.conversation_id AND l.wa_cliente_id = g.wa_client_id
        AND lower(btrim(l.chat_jid)) = lower(btrim(g.group_jid))
      OR l.cliente_id IS NULL
        AND public.central_trafego_try_uuid(c.entregaveis->'whatsapp_grupo'->>'conversation_id') = g.conversation_id
        AND public.central_trafego_try_uuid(c.entregaveis->'whatsapp_grupo'->>'wa_cliente_id') = g.wa_client_id
        AND lower(btrim(c.entregaveis->'whatsapp_grupo'->>'chat_jid')) = lower(btrim(g.group_jid))
    )
  );
$$;

-- O worker não tem sessão de usuário no RPC. Reconfere o titular, módulos e escopo de fila/canal.
CREATE FUNCTION private.cs_ia_reading_owner_scope(p_owner uuid, p_conversation uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.atlas_settings s
    JOIN public.profiles p ON p.id = s.owner_id
    JOIN auth.users u ON u.id = p.id
    JOIN public.atendimento_conversas c ON c.id = p_conversation
    WHERE s.id = 'atlas' AND s.owner_id = p_owner AND s.enabled
      AND p.status = 'active' AND p.role IN ('admin', 'superadmin')
      AND (u.banned_until IS NULL OR u.banned_until <= now())
      AND NOT EXISTS (
        SELECT 1 FROM (VALUES ('clients'), ('atendimento')) m(name)
        WHERE NOT coalesce(
          (SELECT v.is_enabled FROM public.user_module_permissions v WHERE v.user_id = p_owner AND v.module_name::text = m.name),
          (SELECT v.is_enabled FROM public.module_settings v WHERE v.module_name::text = m.name), true
        )
      )
      AND (
        p.role = 'superadmin' OR NOT EXISTS (
          SELECT 1 FROM public.atendimento_usuario_acesso a WHERE a.user_id = p_owner AND a.cliente_id = c.cliente_id
        ) OR EXISTS (
          SELECT 1 FROM public.atendimento_usuario_acesso a WHERE a.user_id = p_owner AND a.cliente_id = c.cliente_id
            AND (a.whatsapp_config_id = c.whatsapp_config_id OR a.fila_id = coalesce(c.fila_id, (
              SELECT fc.fila_id FROM public.atendimento_fila_canais fc WHERE fc.whatsapp_config_id = c.whatsapp_config_id LIMIT 1
            )))
        )
      )
  );
$$;

CREATE FUNCTION private.cs_ia_reading_source(p_config private.cs_ia_reading_config)
RETURNS TABLE(source_at timestamptz, fingerprint text, team_message_ids uuid[], latest_message_id uuid)
LANGUAGE sql STABLE SET search_path = '' SET TimeZone = 'UTC' AS $$
  WITH message_window AS MATERIALIZED (
    SELECT * FROM (
      (SELECT id, created_at, 'in'::text AS direction, type, body, sender_jid, media_purged_at
       FROM public.cliente_whatsapp_inbox
       WHERE conversation_id = p_config.conversation_id AND cliente_id = p_config.wa_client_id
         AND whatsapp_config_id = p_config.channel_id AND created_at >= p_config.enabled_at
       ORDER BY created_at DESC, id DESC LIMIT 40)
      UNION ALL
      (SELECT id, created_at, 'out'::text, NULL::text, body, NULL::text, NULL::timestamptz
       FROM public.cliente_whatsapp_sent
       WHERE conversation_id = p_config.conversation_id AND cliente_id = p_config.wa_client_id
         AND whatsapp_config_id = p_config.channel_id AND created_at >= p_config.enabled_at
       ORDER BY created_at DESC, id DESC LIMIT 40)
    ) messages
    ORDER BY created_at DESC, id DESC, direction DESC LIMIT 40
  )
  SELECT max(w.created_at), encode(sha256(convert_to(jsonb_agg(
    jsonb_build_array(w.id, w.created_at, w.direction, w.type, w.body, w.sender_jid, w.media_purged_at, t.transcript, m.sender_jid IS NOT NULL)
    ORDER BY w.created_at DESC, w.id DESC, w.direction DESC
  )::text, 'UTF8')), 'hex'), coalesce(array_agg(w.id ORDER BY w.id) FILTER (WHERE m.sender_jid IS NOT NULL), '{}'::uuid[]),
    (SELECT CASE WHEN count(*) = 1 THEN min(h.id::text)::uuid END FROM message_window h
     WHERE h.created_at = (SELECT max(created_at) FROM message_window))
  FROM message_window w
  LEFT JOIN public.atlas_audio_transcripts t ON p_config.include_audio AND w.direction = 'in'
    AND w.media_purged_at IS NULL
    AND lower(w.type) IN ('audio','ptt','myaudio','voice','voicemessage','voice_message','audiomessage')
    AND t.inbox_id = w.id AND t.conversation_id = p_config.conversation_id AND t.owner_id = p_config.owner_id
    AND t.status = 'completed'
  LEFT JOIN private.cs_ia_group_team_marks m ON w.direction = 'in' AND m.client_id = p_config.client_id
    AND (m.conversation_id, m.wa_client_id, m.channel_id, m.group_jid)
      = (p_config.conversation_id, p_config.wa_client_id, p_config.channel_id, p_config.group_jid)
    AND m.sender_jid = private.cs_ia_sender_jid(w.sender_jid);
$$;

CREATE FUNCTION private.cs_ia_reading_current(p_config private.cs_ia_reading_config)
RETURNS boolean LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT p_config.enabled AND private.cs_ia_reading_owner_scope(p_config.owner_id, p_config.conversation_id)
    AND EXISTS (
      SELECT 1 FROM private.cs_ia_reading_group(p_config.client_id) g
      WHERE (g.conversation_id, g.wa_client_id, g.channel_id, g.group_jid)
        = (p_config.conversation_id, p_config.wa_client_id, p_config.channel_id, p_config.group_jid)
    );
$$;

-- A troca de vínculo revoga o consentimento mesmo se o grupo anterior for vinculado de novo.
CREATE FUNCTION private.cs_ia_reading_binding_changed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  affected uuid[];
BEGIN
  IF TG_TABLE_NAME = 'atendimento_conversas' THEN
    UPDATE private.cs_ia_reading_config SET enabled = false, revision = gen_random_uuid(), include_audio = false, transcribe_audio_since = NULL
      WHERE conversation_id = OLD.id AND enabled;
    RETURN NULL;
  ELSIF TG_TABLE_NAME = 'clientes' THEN
    affected := ARRAY[NEW.id];
  ELSIF TG_OP = 'DELETE' THEN
    affected := ARRAY[OLD.cliente_id];
  ELSIF TG_OP = 'INSERT' THEN
    affected := ARRAY[NEW.cliente_id];
  ELSE
    affected := ARRAY[OLD.cliente_id, NEW.cliente_id];
  END IF;

  UPDATE private.cs_ia_reading_config config SET enabled = false, revision = gen_random_uuid(), include_audio = false, transcribe_audio_since = NULL
  FROM public.clientes c LEFT JOIN public.cliente_whatsapp_grupo l ON l.cliente_id = c.id
  WHERE config.client_id = ANY(affected) AND c.id = config.client_id AND config.enabled AND (
    c.etapa IS DISTINCT FROM 'closed'
    OR ROW(config.conversation_id, config.wa_client_id, lower(btrim(config.group_jid))) IS DISTINCT FROM ROW(
      CASE WHEN l.cliente_id IS NOT NULL THEN l.conversation_id
        ELSE public.central_trafego_try_uuid(c.entregaveis->'whatsapp_grupo'->>'conversation_id') END,
      CASE WHEN l.cliente_id IS NOT NULL THEN l.wa_cliente_id
        ELSE public.central_trafego_try_uuid(c.entregaveis->'whatsapp_grupo'->>'wa_cliente_id') END,
      lower(btrim(CASE WHEN l.cliente_id IS NOT NULL THEN l.chat_jid
        ELSE c.entregaveis->'whatsapp_grupo'->>'chat_jid' END))
    )
  );
  RETURN NULL;
END;
$$;

CREATE TRIGGER cs_ia_reading_binding_changed
  AFTER INSERT OR DELETE OR UPDATE OF cliente_id, conversation_id, wa_cliente_id, chat_jid ON public.cliente_whatsapp_grupo
  FOR EACH ROW EXECUTE FUNCTION private.cs_ia_reading_binding_changed();
CREATE TRIGGER cs_ia_reading_legacy_binding_changed
  AFTER UPDATE OF etapa, entregaveis ON public.clientes FOR EACH ROW
  WHEN (OLD.etapa IS DISTINCT FROM NEW.etapa OR
    OLD.entregaveis->'whatsapp_grupo' IS DISTINCT FROM NEW.entregaveis->'whatsapp_grupo')
  EXECUTE FUNCTION private.cs_ia_reading_binding_changed();
CREATE TRIGGER cs_ia_reading_conversation_changed
  AFTER UPDATE OF cliente_id, whatsapp_config_id, chat_jid, is_group ON public.atendimento_conversas FOR EACH ROW
  WHEN ((OLD.cliente_id, OLD.whatsapp_config_id, OLD.chat_jid, OLD.is_group)
    IS DISTINCT FROM (NEW.cliente_id, NEW.whatsapp_config_id, NEW.chat_jid, NEW.is_group))
  EXECUTE FUNCTION private.cs_ia_reading_binding_changed();

CREATE FUNCTION private.cs_ia_reading_owner_changed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  UPDATE private.cs_ia_reading_config SET enabled = false, revision = gen_random_uuid(), include_audio = false, transcribe_audio_since = NULL
    WHERE enabled AND owner_id = OLD.owner_id;
  RETURN NULL;
END;
$$;

CREATE TRIGGER cs_ia_reading_owner_changed
  AFTER UPDATE OF owner_id ON public.atlas_settings FOR EACH ROW
  WHEN (OLD.owner_id IS DISTINCT FROM NEW.owner_id)
  EXECUTE FUNCTION private.cs_ia_reading_owner_changed();

CREATE FUNCTION private.cs_ia_reading_state(p_client_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  config private.cs_ia_reading_config;
  job private.cs_ia_reading_jobs;
  group_id uuid;
  source_time timestamptz;
  source_fingerprint text;
  allowed boolean := coalesce(private.cs_ia_role() IN ('admin', 'superadmin') AND private.atlas_demand_owner(), false);
  status text := 'unavailable';
  enabled boolean := false;
  can_configure boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO config FROM private.cs_ia_reading_config WHERE client_id = p_client_id;
  can_configure := allowed AND coalesce(config.enabled AND config.owner_id = auth.uid(), false);

  IF private.cs_ia_client_exists(p_client_id) THEN
    SELECT conversation_id INTO group_id FROM private.cs_ia_reading_group(p_client_id);
    IF group_id IS NOT NULL THEN
      can_configure := allowed OR can_configure;
      status := 'disabled';
      IF private.cs_ia_reading_current(config) THEN
        enabled := true;
        status := 'waiting';
        SELECT source_at, fingerprint INTO source_time, source_fingerprint FROM private.cs_ia_reading_source(config);
        SELECT * INTO job FROM private.cs_ia_reading_jobs
          WHERE client_id = p_client_id AND revision = config.revision AND fingerprint = source_fingerprint;
        IF FOUND THEN
          status := CASE
            WHEN job.state = 'processing' AND job.lease_until <= now() THEN
              CASE WHEN job.charged_estimate IS NOT NULL OR job.attempts >= 3 THEN 'failed' ELSE 'waiting' END
            ELSE job.state
          END;
        END IF;
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'enabled', enabled,
    'include_audio', enabled AND config.include_audio,
    'transcribe_new_audio', enabled AND config.transcribe_audio_since IS NOT NULL,
    'can_configure', can_configure,
    'can_pause', allowed AND coalesce(config.enabled AND config.owner_id = auth.uid(), false),
    'status', status,
    'conversation_id', group_id,
    'wa_client_id', CASE WHEN enabled THEN config.wa_client_id END,
    'channel_id', CASE WHEN enabled THEN config.channel_id END,
    'group_jid', CASE WHEN enabled THEN config.group_jid END,
    'source_at', source_time,
    'finished_at', job.finished_at,
    'tone', job.result->'tone',
    'complaint', job.result->'complaint',
    'unresolved', job.result->'unresolved',
    'cancellation', job.result->'cancellation',
    'awaiting_client_reply', job.result->'awaiting_client_reply',
    'message_count', job.result->'message_count',
    'audio_missing', job.result->'audio_missing'
  );
END;
$$;

CREATE FUNCTION public.cs_ia_get_reading(p_client_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT private.cs_ia_reading_state(CASE WHEN private.cs_ia_client_exists(p_client_id) THEN p_client_id END);
$$;

CREATE FUNCTION private.cs_ia_set_reading(p_client_id uuid, p_enabled boolean, p_include_audio boolean,
  p_conversation_id uuid, p_transcribe_audio boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  group_source record;
  consent private.cs_ia_reading_config;
BEGIN
  IF auth.uid() IS NULL OR private.atlas_demand_owner() IS DISTINCT FROM true THEN
    RAISE insufficient_privilege USING MESSAGE = 'Titular autorizado do Atlas necessário.';
  END IF;
  IF p_enabled IS NULL OR p_include_audio IS NULL THEN
    RAISE invalid_parameter_value USING MESSAGE = 'Confirme as opções da leitura.';
  END IF;
  IF p_transcribe_audio AND NOT (p_enabled AND p_include_audio) THEN
    RAISE invalid_parameter_value USING MESSAGE = 'Ative a leitura e a inclusão de áudio para transcrever novos áudios.';
  END IF;

  IF NOT p_enabled THEN
    SELECT * INTO consent FROM private.cs_ia_reading_config
      WHERE client_id = p_client_id AND owner_id = auth.uid() FOR UPDATE;
    IF NOT FOUND THEN RETURN; END IF;
    IF (p_conversation_id IS NOT NULL AND p_conversation_id <> consent.conversation_id)
      OR (p_conversation_id IS NULL AND EXISTS (SELECT 1 FROM private.cs_ia_reading_group(p_client_id))) THEN
      RAISE invalid_parameter_value USING MESSAGE = 'O grupo da leitura mudou. Atualize a ficha e confirme o grupo.';
    END IF;
    UPDATE private.cs_ia_reading_config SET enabled = false, revision = gen_random_uuid(), include_audio = false, transcribe_audio_since = NULL
      WHERE client_id = consent.client_id AND enabled;
    RETURN;
  END IF;
  IF coalesce(private.cs_ia_role(), '') NOT IN ('admin', 'superadmin')
    OR NOT private.cs_ia_client_exists(p_client_id) THEN
    RAISE insufficient_privilege USING MESSAGE = 'Sem acesso à configuração de leitura do cliente.';
  END IF;
  SELECT * INTO group_source FROM private.cs_ia_reading_group(p_client_id);
  IF NOT FOUND OR NOT private.cs_ia_reading_owner_scope(auth.uid(), group_source.conversation_id) THEN
    RAISE insufficient_privilege USING MESSAGE = 'Fonte do cliente indisponível para leitura.';
  END IF;
  IF p_conversation_id IS DISTINCT FROM group_source.conversation_id THEN
    RAISE invalid_parameter_value USING MESSAGE = 'O grupo da leitura mudou. Atualize a ficha e confirme o grupo.';
  END IF;

  INSERT INTO private.cs_ia_reading_config AS c
    (client_id, owner_id, conversation_id, wa_client_id, channel_id, group_jid, include_audio, transcribe_audio_since)
    VALUES (p_client_id, auth.uid(), group_source.conversation_id, group_source.wa_client_id,
      group_source.channel_id, group_source.group_jid, p_include_audio, CASE WHEN p_transcribe_audio THEN clock_timestamp() END)
  ON CONFLICT (client_id) DO UPDATE SET
    owner_id = excluded.owner_id, conversation_id = excluded.conversation_id, wa_client_id = excluded.wa_client_id,
    channel_id = excluded.channel_id, group_jid = excluded.group_jid, enabled = true,
    revision = excluded.revision, include_audio = excluded.include_audio,
    transcribe_audio_since = CASE WHEN excluded.include_audio AND p_transcribe_audio IS DISTINCT FROM false THEN
      CASE WHEN c.enabled AND (c.owner_id, c.conversation_id, c.wa_client_id, c.channel_id, c.group_jid) =
        (excluded.owner_id, excluded.conversation_id, excluded.wa_client_id, excluded.channel_id, excluded.group_jid)
        THEN coalesce(c.transcribe_audio_since, excluded.transcribe_audio_since) ELSE excluded.transcribe_audio_since END
    END,
    enabled_at = CASE WHEN c.enabled AND
      (c.owner_id, c.conversation_id, c.wa_client_id, c.channel_id, c.group_jid) =
      (excluded.owner_id, excluded.conversation_id, excluded.wa_client_id, excluded.channel_id, excluded.group_jid)
      THEN c.enabled_at ELSE excluded.enabled_at END
  WHERE NOT c.enabled OR
    (c.owner_id, c.conversation_id, c.wa_client_id, c.channel_id, c.group_jid, c.include_audio) IS DISTINCT FROM
    (excluded.owner_id, excluded.conversation_id, excluded.wa_client_id, excluded.channel_id, excluded.group_jid, excluded.include_audio)
    OR (c.transcribe_audio_since IS NOT NULL) <> p_transcribe_audio;
END;
$$;

CREATE FUNCTION public.cs_ia_reading_settings(p_client_id uuid, p_enabled boolean, p_include_audio boolean,
  p_conversation_id uuid, p_transcribe_audio boolean DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF p_enabled AND NOT private.cs_ia_client_exists(p_client_id) THEN
    RAISE insufficient_privilege USING MESSAGE = 'Sem acesso à configuração de leitura do cliente.';
  END IF;
  PERFORM private.cs_ia_set_reading(p_client_id, p_enabled, p_include_audio, p_conversation_id, p_transcribe_audio);
  RETURN public.cs_ia_get_reading(p_client_id);
END;
$$;

CREATE FUNCTION private.cs_ia_reading_current_signals()
RETURNS TABLE(client_id uuid, conversation_id uuid, tone text, complaint boolean, unresolved boolean,
  cancellation boolean, source_at timestamptz, finished_at timestamptz,
  awaiting_client_reply boolean, wa_client_id uuid, channel_id uuid, group_jid text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT config.client_id, config.conversation_id, job.result->>'tone', (job.result->>'complaint')::boolean,
    (job.result->>'unresolved')::boolean, (job.result->>'cancellation')::boolean, job.source_at, job.finished_at,
    (job.result->>'awaiting_client_reply')::boolean, config.wa_client_id, config.channel_id, config.group_jid
  FROM private.cs_ia_reading_config config
  CROSS JOIN LATERAL private.cs_ia_reading_source(config) source
  JOIN private.cs_ia_reading_jobs job ON job.client_id = config.client_id AND job.revision = config.revision
    AND job.fingerprint = source.fingerprint AND job.state = 'completed'
  WHERE auth.uid() IS NOT NULL AND config.enabled AND private.cs_ia_reading_current(config);
$$;

CREATE FUNCTION public.cs_ia_reading_signals()
RETURNS TABLE(client_id uuid, conversation_id uuid, tone text, complaint boolean, unresolved boolean,
  cancellation boolean, source_at timestamptz, finished_at timestamptz,
  awaiting_client_reply boolean, wa_client_id uuid, channel_id uuid, group_jid text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT s.* FROM private.cs_ia_reading_current_signals() s WHERE private.cs_ia_client_exists(s.client_id);
$$;

CREATE FUNCTION private.cs_ia_claim_reading(p_owner uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  candidate record;
  job private.cs_ia_reading_jobs;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' OR auth.uid() IS NOT NULL THEN
    RAISE insufficient_privilege USING MESSAGE = 'Worker exclusivo.';
  END IF;

  SELECT config.*, source.source_at, source.fingerprint, source.team_message_ids, source.latest_message_id INTO candidate
  FROM private.cs_ia_reading_config config
  CROSS JOIN LATERAL private.cs_ia_reading_source(config) source
  LEFT JOIN private.cs_ia_reading_jobs previous ON previous.client_id = config.client_id
    AND previous.revision = config.revision AND previous.fingerprint = source.fingerprint
  WHERE config.owner_id = p_owner AND config.enabled AND private.cs_ia_reading_current(config)
    AND source.source_at <= now() - interval '1 hour'
    AND (previous.id IS NULL OR (previous.charged_estimate IS NULL AND previous.attempts < 3 AND (
      previous.state = 'budget_wait' AND previous.ready_at <= now()
      OR previous.state = 'processing' AND previous.lease_until <= now()
    )))
  ORDER BY source.source_at, config.client_id LIMIT 1 FOR UPDATE OF config SKIP LOCKED;
  IF NOT FOUND THEN RETURN NULL; END IF;

  INSERT INTO private.cs_ia_reading_jobs AS previous (client_id, revision, fingerprint, source_at, lease, lease_until)
    VALUES (candidate.client_id, candidate.revision, candidate.fingerprint, candidate.source_at,
      gen_random_uuid(), now() + interval '3 minutes')
  ON CONFLICT (client_id, revision, fingerprint) DO UPDATE SET
    state = 'processing', lease = excluded.lease, lease_until = excluded.lease_until, attempts = previous.attempts + 1
  WHERE previous.charged_estimate IS NULL AND previous.attempts < 3 AND (
    previous.state = 'budget_wait' AND previous.ready_at <= now()
    OR previous.state = 'processing' AND previous.lease_until <= now()
  )
  RETURNING * INTO job;
  IF NOT FOUND THEN RETURN NULL; END IF;

  RETURN jsonb_build_object('id', job.id, 'lease', job.lease, 'client_id', candidate.client_id,
    'conversation_id', candidate.conversation_id, 'wa_client_id', candidate.wa_client_id,
    'channel_id', candidate.channel_id, 'source_at', job.source_at, 'enabled_at', candidate.enabled_at,
    'include_audio', candidate.include_audio, 'team_message_ids', candidate.team_message_ids,
    'latest_message_id', candidate.latest_message_id);
END;
$$;

CREATE FUNCTION private.cs_ia_reading_fresh(p_job private.cs_ia_reading_jobs)
RETURNS boolean LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM private.cs_ia_reading_config config
    CROSS JOIN LATERAL private.cs_ia_reading_source(config) source
    WHERE config.client_id = p_job.client_id AND config.revision = p_job.revision
      AND private.cs_ia_reading_current(config) AND source.fingerprint = p_job.fingerprint
      AND source.source_at <= now() - interval '1 hour'
  );
$$;

CREATE FUNCTION private.cs_ia_reserve_reading(p_job uuid, p_lease uuid, p_estimate integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  job private.cs_ia_reading_jobs;
  budget public.atlas_event_config;
  office public.atlas_office_state;
  owner_id_for_job uuid;
  day date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  office_tokens integer;
  office_calls integer;
  office_pending integer;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' OR auth.uid() IS NOT NULL THEN
    RAISE insufficient_privilege USING MESSAGE = 'Worker exclusivo.';
  END IF;
  IF p_estimate IS NULL OR p_estimate NOT BETWEEN 1 AND 16000 THEN RETURN false; END IF;

  SELECT config.owner_id INTO owner_id_for_job FROM private.cs_ia_reading_jobs j
  JOIN private.cs_ia_reading_config config ON config.client_id = j.client_id AND config.revision = j.revision
  WHERE j.id = p_job AND j.state = 'processing' AND j.lease = p_lease AND j.lease_until > now()
    AND j.charged_estimate IS NULL;
  IF NOT FOUND THEN RETURN false; END IF;

  -- Mesmo lock e mesmo dia de uso de acontecimentos, especialistas e escritório.
  SELECT * INTO budget FROM public.atlas_event_config WHERE owner_id = owner_id_for_job FOR UPDATE;
  SELECT * INTO job FROM private.cs_ia_reading_jobs
    WHERE id = p_job AND state = 'processing' AND lease = p_lease AND lease_until > now() AND charged_estimate IS NULL
    FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF budget.enabled THEN
    SELECT * INTO office FROM public.atlas_office_state WHERE owner_id = owner_id_for_job FOR SHARE;
  END IF;
  IF NOT private.cs_ia_reading_fresh(job) THEN RETURN false; END IF;

  office_tokens := CASE WHEN office.usage_day = day THEN office.tokens_today ELSE 0 END;
  office_calls := CASE WHEN office.usage_day = day THEN office.calls_today ELSE 0 END;
  office_pending := CASE WHEN office.analysis_reservation IS NOT NULL THEN office.reservation_tokens ELSE 0 END;
  -- Com eventos desativados, o caminho legado do escritório usa o teto independente.
  IF budget.enabled IS DISTINCT FROM true OR
    (CASE WHEN budget.usage_day = day THEN budget.used_tokens ELSE 0 END)::bigint +
      budget.reserved_tokens + office_tokens + office_pending + p_estimate > budget.max_tokens_per_day THEN
    UPDATE private.cs_ia_reading_jobs SET state = 'budget_wait', lease = NULL, lease_until = NULL,
      ready_at = now() + interval '15 minutes', attempts = attempts - 1 WHERE id = job.id;
    RETURN false;
  END IF;

  -- A chamada pode ser faturada mesmo que o transporte expire ou a fonte mude.
  UPDATE public.atlas_event_config SET usage_day = day,
    used_tokens = CASE WHEN budget.usage_day = day THEN budget.used_tokens ELSE 0 END + p_estimate,
    model_calls = CASE WHEN budget.usage_day = day THEN budget.model_calls ELSE 0 END + 1,
    legacy_tokens = office_tokens, legacy_model_calls = office_calls
  WHERE owner_id = owner_id_for_job;
  UPDATE private.cs_ia_reading_jobs SET charged_estimate = p_estimate WHERE id = job.id;
  RETURN true;
END;
$$;

CREATE FUNCTION private.cs_ia_finish_reading(p_job uuid, p_lease uuid, p_result jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  job private.cs_ia_reading_jobs;
  next_state text := 'failed';
  message_count integer;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' OR auth.uid() IS NOT NULL THEN
    RAISE insufficient_privilege USING MESSAGE = 'Worker exclusivo.';
  END IF;
  SELECT * INTO job FROM private.cs_ia_reading_jobs
    WHERE id = p_job AND state = 'processing' AND lease = p_lease AND lease_until > now() FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF NOT private.cs_ia_reading_fresh(job) THEN RETURN false; END IF;

  IF p_result IS NOT NULL THEN
    IF jsonb_typeof(p_result) IS DISTINCT FROM 'object' THEN RETURN false; END IF;
    IF (SELECT count(*) FROM jsonb_object_keys(p_result - 'awaiting_client_reply')) <> 6
      OR coalesce(p_result->>'tone', '') NOT IN ('positive', 'neutral', 'negative', 'mixed', 'unknown')
      OR jsonb_typeof(p_result->'complaint') IS DISTINCT FROM 'boolean'
      OR jsonb_typeof(p_result->'unresolved') IS DISTINCT FROM 'boolean'
      OR jsonb_typeof(p_result->'cancellation') IS DISTINCT FROM 'boolean'
      OR (p_result ? 'awaiting_client_reply' AND jsonb_typeof(p_result->'awaiting_client_reply') IS DISTINCT FROM 'boolean')
      OR jsonb_typeof(p_result->'message_count') IS DISTINCT FROM 'number'
      OR jsonb_typeof(p_result->'audio_missing') IS DISTINCT FROM 'number'
      OR p_result->>'message_count' !~ '^([0-9]|[1-3][0-9]|40)$'
      OR p_result->>'audio_missing' !~ '^([0-9]|[1-3][0-9]|40)$' THEN
      RETURN false;
    END IF;
    message_count := (p_result->>'message_count')::integer;
    IF message_count = 0 THEN
      IF p_result->>'tone' <> 'unknown' OR p_result->>'complaint' = 'true'
        OR p_result->>'unresolved' = 'true' OR p_result->>'cancellation' = 'true' OR p_result->>'awaiting_client_reply' = 'true' THEN
        RETURN false;
      END IF;
      next_state := 'no_text';
    ELSIF job.charged_estimate IS NOT NULL THEN
      next_state := 'completed';
    ELSE
      RETURN false;
    END IF;
  END IF;

  UPDATE private.cs_ia_reading_jobs SET state = next_state, result = p_result, finished_at = now(),
    lease = NULL, lease_until = NULL WHERE id = job.id;
  RETURN true;
END;
$$;

CREATE FUNCTION public.cs_ia_reading_claim(p_owner uuid)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT private.cs_ia_claim_reading(p_owner);
$$;

CREATE FUNCTION public.cs_ia_reading_reserve(p_job uuid, p_lease uuid, p_estimate integer)
RETURNS boolean LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT private.cs_ia_reserve_reading(p_job, p_lease, p_estimate);
$$;

CREATE FUNCTION public.cs_ia_reading_finish(p_job uuid, p_lease uuid, p_result jsonb)
RETURNS boolean LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT private.cs_ia_finish_reading(p_job, p_lease, p_result);
$$;

REVOKE ALL ON FUNCTION private.cs_ia_reading_group(uuid), private.cs_ia_reading_owner_scope(uuid, uuid),
  private.cs_ia_reading_source(private.cs_ia_reading_config), private.cs_ia_reading_current(private.cs_ia_reading_config),
  private.cs_ia_reading_binding_changed(), private.cs_ia_reading_owner_changed(),
  private.cs_ia_reading_fresh(private.cs_ia_reading_jobs), private.cs_ia_reading_state(uuid),
  private.cs_ia_set_reading(uuid, boolean, boolean, uuid, boolean), private.cs_ia_reading_current_signals(),
  private.cs_ia_claim_reading(uuid), private.cs_ia_reserve_reading(uuid, uuid, integer), private.cs_ia_finish_reading(uuid, uuid, jsonb),
  public.cs_ia_get_reading(uuid), public.cs_ia_reading_settings(uuid, boolean, boolean, uuid, boolean), public.cs_ia_reading_signals(),
  public.cs_ia_reading_claim(uuid), public.cs_ia_reading_reserve(uuid, uuid, integer), public.cs_ia_reading_finish(uuid, uuid, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION private.cs_ia_reading_state(uuid), private.cs_ia_set_reading(uuid, boolean, boolean, uuid, boolean),
  private.cs_ia_reading_current_signals(), public.cs_ia_get_reading(uuid), public.cs_ia_reading_settings(uuid, boolean, boolean, uuid, boolean),
  public.cs_ia_reading_signals() TO authenticated;

GRANT EXECUTE ON FUNCTION private.cs_ia_claim_reading(uuid), private.cs_ia_reserve_reading(uuid, uuid, integer),
  private.cs_ia_finish_reading(uuid, uuid, jsonb), public.cs_ia_reading_claim(uuid), public.cs_ia_reading_reserve(uuid, uuid, integer),
  public.cs_ia_reading_finish(uuid, uuid, jsonb) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;

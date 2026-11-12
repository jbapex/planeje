BEGIN;

ALTER TABLE public.cs_ia_settings
  ADD COLUMN task_board_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN task_automation_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN task_controls_version uuid NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN task_automation_since timestamptz NOT NULL DEFAULT '-infinity';

-- Grupos já autorizados continuam sob a autorização que estava vigente.
UPDATE public.cs_ia_settings SET task_automation_enabled = true
WHERE EXISTS (SELECT 1 FROM private.cs_ia_reading_config
  WHERE enabled AND task_moves_revision = revision AND task_moves_since IS NOT NULL);

GRANT UPDATE (task_board_enabled, task_automation_enabled) ON public.cs_ia_settings TO authenticated;

CREATE FUNCTION private.cs_ia_version_task_controls()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF (NEW.task_board_enabled, NEW.task_automation_enabled) IS DISTINCT FROM
    (OLD.task_board_enabled, OLD.task_automation_enabled) THEN
    NEW.task_controls_version := gen_random_uuid();
    IF NEW.task_board_enabled AND NEW.task_automation_enabled AND NOT (OLD.task_board_enabled AND OLD.task_automation_enabled) THEN
      NEW.task_automation_since := clock_timestamp();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER cs_ia_version_task_controls BEFORE UPDATE OF task_board_enabled, task_automation_enabled ON public.cs_ia_settings
  FOR EACH ROW EXECUTE FUNCTION private.cs_ia_version_task_controls();
REVOKE ALL ON FUNCTION private.cs_ia_version_task_controls() FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.cs_ia_task_move_options(p_client uuid, p_conversation uuid, p_enabled boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  consent private.cs_ia_reading_config;
  can_configure boolean;
  current_reading boolean;
  automation_allowed boolean;
BEGIN
  IF auth.uid() IS NULL OR NOT private.cs_ia_client_exists(p_client) OR NOT private.cs_ia_user_task_module(auth.uid(), 'tasks') THEN
    RAISE insufficient_privilege USING MESSAGE = 'Cliente indisponível para esta sessão.';
  END IF;

  IF p_enabled IS NOT NULL THEN
    IF NOT coalesce(private.atlas_demand_owner() AND private.cs_ia_role() IN ('admin', 'superadmin'), false) THEN
      RAISE insufficient_privilege USING MESSAGE = 'Somente o titular autorizado do Atlas pode alterar esta regra.';
    END IF;
    SELECT task_board_enabled AND task_automation_enabled INTO automation_allowed
      FROM public.cs_ia_settings WHERE id = 1 FOR SHARE;
    IF automation_allowed IS DISTINCT FROM true THEN
      RAISE insufficient_privilege USING MESSAGE = 'A automação por WhatsApp está pausada nas configurações do CS.';
    END IF;
    SELECT * INTO consent FROM private.cs_ia_reading_config WHERE client_id = p_client FOR UPDATE;
  ELSE
    SELECT task_board_enabled AND task_automation_enabled INTO automation_allowed
      FROM public.cs_ia_settings WHERE id = 1;
    IF automation_allowed IS DISTINCT FROM true THEN
      RETURN jsonb_build_object('enabled', false, 'can_configure', false, 'global_paused', true);
    END IF;
    SELECT * INTO consent FROM private.cs_ia_reading_config WHERE client_id = p_client;
  END IF;

  current_reading := coalesce(p_conversation = consent.conversation_id AND private.cs_ia_reading_current(consent)
    AND private.cs_ia_user_task_module(consent.owner_id, 'tasks') AND private.cs_ia_user_task_module(consent.owner_id, 'assistant'), false);
  can_configure := current_reading AND consent.owner_id = auth.uid() AND coalesce(private.atlas_demand_owner(), false);
  IF p_enabled IS NOT NULL THEN
    IF p_conversation IS DISTINCT FROM consent.conversation_id THEN
      RAISE invalid_parameter_value USING MESSAGE = 'O grupo mudou. Atualize a ficha e confira o vínculo.';
    END IF;
    IF NOT can_configure THEN
      RAISE insufficient_privilege USING MESSAGE = 'Habilite a leitura deste grupo para configurar a movimentação.';
    END IF;
    UPDATE private.cs_ia_reading_config
      SET task_moves_revision = CASE WHEN p_enabled THEN revision END,
        task_moves_since = CASE WHEN p_enabled THEN CASE WHEN task_moves_revision = revision
          THEN task_moves_since ELSE clock_timestamp() END END
      WHERE client_id = p_client RETURNING * INTO consent;
  END IF;
  RETURN jsonb_build_object('enabled', current_reading AND consent.task_moves_since IS NOT NULL
    AND consent.task_moves_revision IS NOT DISTINCT FROM consent.revision, 'can_configure', coalesce(can_configure, false));
END;
$$;

CREATE OR REPLACE FUNCTION private.cs_ia_move_from_reading()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  consent private.cs_ia_reading_config;
  command record;
  automation_since timestamptz;
  command_since timestamptz;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' OR auth.uid() IS NOT NULL THEN RETURN NEW; END IF;
  SELECT task_automation_since INTO automation_since FROM public.cs_ia_settings
  WHERE id = 1 AND task_board_enabled AND task_automation_enabled FOR SHARE;
  IF NOT FOUND THEN RETURN NEW; END IF;

  SELECT * INTO consent FROM private.cs_ia_reading_config
    WHERE client_id = NEW.client_id AND revision = NEW.revision AND task_moves_revision = revision
      AND greatest(task_moves_since, automation_since) < NEW.source_at FOR SHARE;
  IF NOT FOUND OR NOT private.cs_ia_reading_fresh(NEW)
    OR NOT private.cs_ia_user_task_module(consent.owner_id, 'tasks')
    OR NOT private.cs_ia_user_task_module(consent.owner_id, 'assistant') THEN RETURN NEW; END IF;

  command_since := greatest(consent.task_moves_since, automation_since);

  -- O recorte preserva as mesmas 40 mensagens usadas pela leitura do grupo.
  FOR command IN
    WITH messages AS (
      (SELECT i.id, i.created_at, 'in'::text AS direction FROM public.cliente_whatsapp_inbox i
       WHERE (i.conversation_id, i.cliente_id, i.whatsapp_config_id) = (consent.conversation_id, consent.wa_client_id, consent.channel_id)
         AND i.created_at >= consent.enabled_at ORDER BY i.created_at DESC, i.id DESC LIMIT 40)
      UNION ALL
      (SELECT s.id, s.created_at, 'out' FROM public.cliente_whatsapp_sent s
       WHERE (s.conversation_id, s.cliente_id, s.whatsapp_config_id) = (consent.conversation_id, consent.wa_client_id, consent.channel_id)
         AND s.created_at >= consent.enabled_at ORDER BY s.created_at DESC, s.id DESC LIMIT 40)
    ), recent AS (SELECT * FROM messages ORDER BY created_at DESC, id DESC, direction DESC LIMIT 40)
    SELECT i.id, i.sender_jid, btrim(parts[1]) AS title, least(i.msg_timestamp, i.created_at) AS at
    FROM recent r JOIN public.cliente_whatsapp_inbox i ON i.id = r.id AND r.direction = 'in'
    CROSS JOIN LATERAL regexp_match(i.body, '^[[:blank:]]*(?:iniciei|comecei)[[:blank:]]*:[[:blank:]]*([^\r\n]{1,180})$', 'i') parts
    WHERE lower(btrim(i.type)) IN ('text', 'chat', 'conversation', 'extendedtextmessage') AND i.media_purged_at IS NULL
      AND i.created_at > command_since AND i.msg_timestamp > command_since AND i.msg_timestamp <= now()
    ORDER BY i.created_at, i.id
  LOOP
    PERFORM private.cs_ia_start_task_from_message(consent, command.id, command.sender_jid, command.title, command.at);
  END LOOP;
  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;

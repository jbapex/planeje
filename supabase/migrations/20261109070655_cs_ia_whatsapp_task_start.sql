BEGIN;

ALTER TABLE private.cs_ia_reading_config
  ADD COLUMN task_moves_revision uuid,
  ADD COLUMN task_moves_since timestamptz;

CREATE TABLE private.cs_ia_task_move_messages (
  message_id uuid PRIMARY KEY,
  client_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE
);
ALTER TABLE private.cs_ia_task_move_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.cs_ia_task_move_messages FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION private.cs_ia_version_staff_sender()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.cs_ia_version_staff_sender() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER cs_ia_version_staff_sender BEFORE INSERT OR UPDATE ON public.atendimento_grupo_remetente_interno
  FOR EACH ROW EXECUTE FUNCTION private.cs_ia_version_staff_sender();

CREATE FUNCTION private.cs_ia_user_task_module(p_actor uuid, p_module text)
RETURNS boolean LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT coalesce(
    (SELECT p.is_enabled FROM public.user_module_permissions p WHERE p.user_id = p_actor AND p.module_name::text = p_module),
    (SELECT s.is_enabled FROM public.module_settings s WHERE s.module_name::text = p_module), true);
$$;

CREATE FUNCTION private.cs_ia_task_move_options(p_client uuid, p_conversation uuid, p_enabled boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  consent private.cs_ia_reading_config;
  can_configure boolean;
  current_reading boolean;
BEGIN
  IF auth.uid() IS NULL OR NOT private.cs_ia_client_exists(p_client) OR NOT private.cs_ia_user_task_module(auth.uid(), 'tasks') THEN
    RAISE insufficient_privilege USING MESSAGE = 'Cliente indisponível para esta sessão.';
  END IF;

  IF p_enabled IS NOT NULL THEN
    IF NOT coalesce(private.atlas_demand_owner() AND private.cs_ia_role() IN ('admin', 'superadmin'), false) THEN
      RAISE insufficient_privilege USING MESSAGE = 'Somente o titular autorizado do Atlas pode alterar esta regra.';
    END IF;
    SELECT * INTO consent FROM private.cs_ia_reading_config WHERE client_id = p_client FOR UPDATE;
  ELSE
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

CREATE FUNCTION public.cs_ia_task_move_options(p_client_id uuid, p_conversation_id uuid, p_enabled boolean DEFAULT NULL)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT private.cs_ia_task_move_options(p_client_id, p_conversation_id, p_enabled);
$$;

CREATE FUNCTION private.cs_ia_task_trigger_may_match(p_field jsonb, p_status text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  -- Configurações legadas ou ambíguas voltam para o editor, que executa as automações existentes.
  WITH values AS (
    SELECT lower(btrim(CASE jsonb_typeof(v) WHEN 'object' THEN v->>'value' WHEN 'string' THEN v #>> '{}' END)) AS value
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_field) = 'array' THEN p_field ELSE jsonb_build_array(p_field) END) v
  )
  SELECT coalesce(bool_or(value IS NULL OR value !~ '^[a-z0-9]+(_[a-z0-9]+)*$' OR value = p_status), true) FROM values;
$$;

CREATE FUNCTION private.cs_ia_start_task_from_message(p_consent private.cs_ia_reading_config,
  p_message_id uuid, p_sender text, p_title text, p_at timestamptz)
RETURNS void LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  actor uuid;
  candidates uuid[];
  task public.tarefas;
  rule_count integer;
  steps jsonb;
BEGIN
  INSERT INTO private.cs_ia_task_move_messages (message_id, client_id) VALUES (p_message_id, p_consent.client_id)
  ON CONFLICT DO NOTHING;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT (array_agg(DISTINCT identity.id))[1] INTO actor
  FROM (
    SELECT p.id, greatest(r.created_at, r.updated_at) AS known_since
    FROM public.atendimento_grupo_remetente_interno r
    JOIN public.profiles p ON p.id = r.profile_id AND p.status = 'active' AND p.role IN ('admin', 'superadmin', 'colaborador')
    JOIN auth.users u ON u.id = p.id AND (u.banned_until IS NULL OR u.banned_until <= now())
    WHERE (r.cliente_id IS NULL OR r.cliente_id = p_consent.wa_client_id)
      AND private.cs_ia_sender_jid(r.sender_jid) = private.cs_ia_sender_jid(p_sender)
    FOR SHARE OF r NOWAIT
  ) identity
  HAVING count(DISTINCT identity.id) = 1 AND bool_or(identity.known_since <= p_at);
  IF actor IS NULL OR EXISTS (SELECT 1 FROM (VALUES ('tasks'), ('clients'), ('atendimento')) m(name)
    WHERE NOT private.cs_ia_user_task_module(actor, m.name)) THEN RETURN; END IF;
  IF EXISTS (
    SELECT 1 FROM public.profiles p CROSS JOIN public.clientes c
    WHERE p.id = actor AND p.role = 'colaborador' AND c.id = p_consent.client_id
      AND (c.responsavel::text IS DISTINCT FROM actor::text AND EXISTS (SELECT 1 FROM public.user_module_access a
        WHERE a.user_id = actor AND a.module_name::text = 'clients' AND a.access_level::text = 'responsible')
        OR EXISTS (SELECT 1 FROM public.atendimento_usuario_acesso a WHERE a.user_id = actor AND a.cliente_id = p_consent.wa_client_id)
        AND NOT EXISTS (SELECT 1 FROM public.atendimento_usuario_acesso a
          JOIN public.atendimento_conversas g ON g.id = p_consent.conversation_id
          WHERE a.user_id = actor AND a.cliente_id = p_consent.wa_client_id
            AND (a.whatsapp_config_id = p_consent.channel_id OR a.fila_id = coalesce(g.fila_id, (
              SELECT fc.fila_id FROM public.atendimento_fila_canais fc WHERE fc.whatsapp_config_id = g.whatsapp_config_id LIMIT 1)))))
  ) THEN RETURN; END IF;

  SELECT array_agg(id) INTO candidates FROM (
    SELECT t.id FROM public.tarefas t LEFT JOIN public.task_statuses s ON s.value = t.status
    WHERE t.client_id = p_consent.client_id AND lower(btrim(t.title)) = lower(p_title)
      AND t.created_at <= p_at AND s.is_terminal IS DISTINCT FROM true
    LIMIT 2
  ) matches;
  IF cardinality(candidates) IS DISTINCT FROM 1 THEN RETURN; END IF;

  SELECT * INTO task FROM public.tarefas WHERE id = candidates[1] FOR UPDATE NOWAIT;
  -- shortcut: apenas a transição interna todo → in_progress; outras etapas exigem revisão no editor.
  IF NOT FOUND OR task.client_id IS DISTINCT FROM p_consent.client_id OR lower(btrim(task.title)) IS DISTINCT FROM lower(p_title)
    OR task.type IS DISTINCT FROM 'interno' OR task.status IS DISTINCT FROM 'todo' OR task.workflow_template_id IS NOT NULL
    OR task.due_date IS NULL OR NOT coalesce(actor = ANY(task.assignee_ids), false) OR task.created_at > p_at
    OR (task.status_history IS NOT NULL AND jsonb_typeof(task.status_history) IS DISTINCT FROM 'array') THEN RETURN; END IF;
  IF coalesce((task.status_history->-1->>'timestamp')::timestamptz, '-infinity') > p_at
    OR coalesce((task.stage_execution_history->-1->>'at')::timestamptz, '-infinity') > p_at THEN RETURN; END IF;

  IF (SELECT count(*) FROM (SELECT 1 FROM public.task_statuses WHERE value IN ('todo', 'in_progress')
    AND is_terminal = false FOR SHARE NOWAIT) statuses) <> 2 THEN RETURN; END IF;
  LOCK TABLE public.task_automations, public.workflow_rules IN SHARE MODE NOWAIT;
  IF EXISTS (SELECT 1 FROM public.task_automations a WHERE a.is_active AND a.trigger_type = 'status_change'
    AND private.cs_ia_task_trigger_may_match(to_jsonb(a.trigger_config)->'from_status', 'todo')
    AND private.cs_ia_task_trigger_may_match(to_jsonb(a.trigger_config)->'to_status', 'in_progress')) THEN RETURN; END IF;

  SELECT count(*), (array_agg(to_jsonb(w.required_subtasks)))[1] INTO rule_count, steps FROM public.workflow_rules w
    WHERE w.task_type = task.type AND w.status_value = 'in_progress';
  IF rule_count > 1 OR (steps IS NOT NULL AND jsonb_typeof(steps) <> 'array') THEN RETURN; END IF;
  PERFORM 1 FROM public.task_subtasks WHERE task_id = task.id FOR SHARE NOWAIT;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(coalesce(steps, '[]'::jsonb)) step
    LEFT JOIN LATERAL (SELECT s.is_completed, s.content FROM public.task_subtasks s
      WHERE s.task_id = task.id AND s.title = step->>'title' ORDER BY s.created_at, s.id LIMIT 1) actual ON true
    WHERE CASE WHEN step->>'type' = 'text' THEN coalesce(actual.content, '') !~ '[^[:space:]]'
      ELSE actual.is_completed IS DISTINCT FROM true END
  ) THEN RETURN; END IF;

  BEGIN
    UPDATE public.tarefas SET status = 'in_progress',
      status_history = coalesce(task.status_history, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
        'status', 'in_progress', 'user_id', actor, 'assignee_ids', task.assignee_ids, 'timestamp', now(), 'source', 'cs_ia_whatsapp'))
    WHERE id = task.id;
  EXCEPTION WHEN check_violation OR raise_exception THEN
    -- A leitura de saúde pode concluir mesmo quando o fluxo oficial recusa a movimentação.
    RETURN;
  END;
EXCEPTION WHEN lock_not_available OR invalid_datetime_format OR datetime_field_overflow THEN RETURN;
END;
$$;

CREATE FUNCTION private.cs_ia_move_from_reading()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  consent private.cs_ia_reading_config;
  command record;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' OR auth.uid() IS NOT NULL THEN RETURN NEW; END IF;
  SELECT * INTO consent FROM private.cs_ia_reading_config
    WHERE client_id = NEW.client_id AND revision = NEW.revision AND task_moves_revision = revision
      AND task_moves_since < NEW.source_at FOR SHARE;
  IF NOT FOUND OR NOT private.cs_ia_reading_fresh(NEW)
    OR NOT private.cs_ia_user_task_module(consent.owner_id, 'tasks')
    OR NOT private.cs_ia_user_task_module(consent.owner_id, 'assistant') THEN RETURN NEW; END IF;

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
      AND i.created_at > consent.task_moves_since AND i.msg_timestamp > consent.task_moves_since AND i.msg_timestamp <= now()
    ORDER BY i.created_at, i.id
  LOOP
    PERFORM private.cs_ia_start_task_from_message(consent, command.id, command.sender_jid, command.title, command.at);
  END LOOP;
  RETURN NEW;
END;
$$;

CREATE TRIGGER cs_ia_move_from_reading AFTER UPDATE OF state ON private.cs_ia_reading_jobs
  FOR EACH ROW WHEN (NEW.state = 'completed' AND OLD.state IS DISTINCT FROM NEW.state)
  EXECUTE FUNCTION private.cs_ia_move_from_reading();

REVOKE ALL ON FUNCTION private.cs_ia_user_task_module(uuid,text), private.cs_ia_task_trigger_may_match(jsonb,text),
  private.cs_ia_start_task_from_message(private.cs_ia_reading_config,uuid,text,text,timestamptz), private.cs_ia_move_from_reading(),
  private.cs_ia_task_move_options(uuid,uuid,boolean), public.cs_ia_task_move_options(uuid,uuid,boolean)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.cs_ia_task_move_options(uuid,uuid,boolean), public.cs_ia_task_move_options(uuid,uuid,boolean) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;

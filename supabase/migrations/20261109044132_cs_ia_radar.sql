BEGIN;

CREATE TABLE public.cs_ia_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  healthy_min smallint NOT NULL DEFAULT 75,
  result_min smallint NOT NULL DEFAULT 55,
  attention_min smallint NOT NULL DEFAULT 35,
  score_drop smallint NOT NULL DEFAULT 15 CHECK (score_drop BETWEEN 1 AND 100),
  quiet_days smallint NOT NULL DEFAULT 3 CHECK (quiet_days BETWEEN 1 AND 89),
  critical_quiet_days smallint NOT NULL DEFAULT 7 CHECK (critical_quiet_days <= 90),
  start_hour smallint NOT NULL DEFAULT 8 CHECK (start_hour BETWEEN 0 AND 23),
  end_hour smallint NOT NULL DEFAULT 18 CHECK (end_hour <= 24),
  weekends boolean NOT NULL DEFAULT false,
  radar_enabled boolean NOT NULL DEFAULT false,
  CHECK (1 <= attention_min AND attention_min < result_min AND result_min < healthy_min AND healthy_min <= 100),
  CHECK (quiet_days < critical_quiet_days),
  CHECK (start_hour < end_hour)
);

INSERT INTO public.cs_ia_settings DEFAULT VALUES;

CREATE TABLE public.cs_ia_relationships (
  client_id uuid PRIMARY KEY REFERENCES public.clientes(id) ON DELETE CASCADE,
  manual_status text CHECK (manual_status IN ('saudavel', 'resultado', 'atencao', 'critico')),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.cs_ia_daily (
  client_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  -- O histórico conserva a fonte original mesmo quando a conversa é removida.
  conversation_id uuid,
  wa_client_id uuid,
  group_jid text,
  whatsapp_config_id uuid,
  operational_date date NOT NULL,
  captured_at timestamptz NOT NULL,
  score smallint CHECK (score BETWEEN 0 AND 100),
  health text NOT NULL CHECK (health IN ('saudavel', 'resultado', 'atencao', 'critico', 'sem_leitura')),
  signal text NOT NULL CHECK (signal IN ('critico', 'resposta_pendente', 'inatividade', 'queda', 'atencao', 'sem_grupo', 'sem_dados', 'em_dia')),
  factors jsonb NOT NULL CHECK (jsonb_typeof(factors) = 'array'),
  PRIMARY KEY (client_id, operational_date),
  CHECK (num_nonnulls(conversation_id, wa_client_id, group_jid, whatsapp_config_id) IN (0, 4))
);

ALTER TABLE public.cs_ia_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cs_ia_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cs_ia_daily ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.cs_ia_settings, public.cs_ia_relationships, public.cs_ia_daily FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.cs_ia_settings, public.cs_ia_relationships, public.cs_ia_daily TO authenticated;
GRANT UPDATE (healthy_min, result_min, attention_min, score_drop, quiet_days, critical_quiet_days,
  start_hour, end_hour, weekends, radar_enabled) ON public.cs_ia_settings TO authenticated;
GRANT INSERT (client_id, manual_status), UPDATE (client_id, manual_status) ON public.cs_ia_relationships TO authenticated;

CREATE FUNCTION private.cs_ia_module_enabled(p_module text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce(
    (SELECT p.is_enabled FROM public.user_module_permissions p WHERE p.user_id = auth.uid() AND p.module_name::text = p_module),
    (SELECT s.is_enabled FROM public.module_settings s WHERE s.module_name::text = p_module), true);
$$;

CREATE FUNCTION private.cs_ia_role()
RETURNS text LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT staff.role FROM (SELECT private.planeje_staff_role() AS role) staff
  WHERE staff.role IN ('admin', 'superadmin', 'colaborador')
    AND private.cs_ia_module_enabled('clients') AND private.cs_ia_module_enabled('atendimento');
$$;

CREATE FUNCTION private.cs_ia_worker()
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT auth.uid() IS NULL AND current_user = (
    SELECT pg_catalog.pg_get_userbyid(relowner) FROM pg_catalog.pg_class WHERE oid = 'public.cs_ia_daily'::regclass
  );
$$;

CREATE FUNCTION private.cs_ia_client_scope(p_responsavel text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce(staff.role IN ('admin', 'superadmin') OR (
    staff.role = 'colaborador' AND (
      p_responsavel = auth.uid()::text OR NOT EXISTS (
        SELECT 1 FROM public.user_module_access a
        WHERE a.user_id = auth.uid() AND a.module_name::text = 'clients' AND a.access_level::text = 'responsible'
      )
    )), false)
  FROM (SELECT private.planeje_staff_role() AS role) staff;
$$;

CREATE FUNCTION private.cs_ia_owner_visible()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce(staff.role = 'superadmin' OR (staff.role IN ('admin', 'colaborador') AND coalesce(
    (SELECT u.can_view FROM public.user_client_field_permissions u WHERE u.user_id = auth.uid() AND u.field_name::text = 'responsavel'),
    (SELECT r.can_view FROM public.client_field_permissions r WHERE r.role::text = staff.role AND r.field_name::text = 'responsavel'), true)
  ), false)
  FROM (SELECT private.planeje_staff_role() AS role) staff;
$$;

CREATE FUNCTION private.cs_ia_client_exists(p_client_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.clientes c
    WHERE c.id = p_client_id AND c.etapa = 'closed' AND private.cs_ia_role() IS NOT NULL
      AND private.cs_ia_client_scope(c.responsavel::text)
  );
$$;

CREATE FUNCTION private.cs_ia_group_writer(p_client_id uuid, p_responsavel text)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT coalesce(private.planeje_staff_role() IN ('admin', 'superadmin', 'colaborador') AND (
    (private.cs_ia_module_enabled('clients') AND private.cs_ia_client_scope(p_responsavel)) OR (
      private.cs_ia_module_enabled('paid_traffic') AND (
        public.central_trafego_is_gestor(p_client_id) OR p_responsavel = auth.uid()::text
        OR (public.central_trafego_ui_allowed() AND public.central_trafego_can_access_client(p_client_id))
      )
    )), false);
$$;

CREATE FUNCTION private.cs_ia_group_writable(p_client_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.clientes c WHERE c.id = p_client_id
    AND private.cs_ia_group_writer(c.id, c.responsavel::text));
$$;

CREATE FUNCTION private.cs_ia_group_source_visible(p_conversation uuid, p_wa_client uuid, p_jid text)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.atendimento_conversas g WHERE g.id = p_conversation
    AND g.cliente_id = p_wa_client AND lower(btrim(g.chat_jid)) = lower(btrim(p_jid))
    AND g.whatsapp_config_id IS NOT NULL AND g.is_group AND NOT g.bloqueada AND g.archived_at IS NULL
    AND public.atendimento_user_can_access_conversation(g.id));
$$;

-- A fonte compartilhada também alimenta avaliações feitas fora da sessão de um usuário.
REVOKE ALL ON public.cliente_whatsapp_grupo FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cliente_whatsapp_grupo TO authenticated;
CREATE POLICY cs_ia_link_staff ON public.cliente_whatsapp_grupo AS RESTRICTIVE FOR SELECT TO authenticated
  USING ((SELECT private.planeje_staff_role()) IN ('admin', 'superadmin', 'colaborador'));
CREATE POLICY cs_ia_link_insert ON public.cliente_whatsapp_grupo AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (private.cs_ia_group_writable(cliente_id) AND private.cs_ia_group_source_visible(conversation_id, wa_cliente_id, chat_jid));
CREATE POLICY cs_ia_link_update ON public.cliente_whatsapp_grupo AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (private.cs_ia_group_writable(cliente_id))
  WITH CHECK (private.cs_ia_group_writable(cliente_id) AND private.cs_ia_group_source_visible(conversation_id, wa_cliente_id, chat_jid));
CREATE POLICY cs_ia_link_delete ON public.cliente_whatsapp_grupo AS RESTRICTIVE FOR DELETE TO authenticated
  USING (private.cs_ia_group_writable(cliente_id));

CREATE FUNCTION private.cs_ia_protect_legacy_group()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  previous_link jsonb := nullif(CASE WHEN TG_OP = 'UPDATE' THEN OLD.entregaveis->'whatsapp_grupo' END, 'null'::jsonb);
  proposed_link jsonb := nullif(NEW.entregaveis->'whatsapp_grupo', 'null'::jsonb);
  writable boolean;
  source_visible boolean;
  same_legacy_source boolean;
  proposed_conversation uuid;
  proposed_wa_client uuid;
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') OR proposed_link IS NOT DISTINCT FROM previous_link THEN RETURN NEW; END IF;
  IF current_user = 'anon' THEN RAISE insufficient_privilege USING MESSAGE = 'Sem acesso para alterar o grupo vinculado deste cliente.'; END IF;
  writable := private.cs_ia_group_writer(NEW.id, CASE WHEN TG_OP = 'UPDATE' THEN OLD.responsavel::text ELSE NEW.responsavel::text END);
  proposed_conversation := public.central_trafego_try_uuid(proposed_link->>'conversation_id');
  proposed_wa_client := public.central_trafego_try_uuid(proposed_link->>'wa_cliente_id');
  source_visible := writable AND private.cs_ia_group_source_visible(proposed_conversation, proposed_wa_client, proposed_link->>'chat_jid');
  same_legacy_source := previous_link IS NOT NULL AND proposed_link IS NOT NULL AND ROW(
    lower(btrim(previous_link->>'chat_jid')),
    coalesce(public.central_trafego_try_uuid(previous_link->>'conversation_id')::text, previous_link->>'conversation_id'),
    coalesce(public.central_trafego_try_uuid(previous_link->>'wa_cliente_id')::text, previous_link->>'wa_cliente_id')
  ) IS NOT DISTINCT FROM ROW(
    lower(btrim(proposed_link->>'chat_jid')),
    coalesce(proposed_conversation::text, proposed_link->>'conversation_id'),
    coalesce(proposed_wa_client::text, proposed_link->>'wa_cliente_id')
  );

  -- O formulário geral reconstitui o vínculo. Preserve a cópia anterior quando a fonte está fora do escopo.
  IF (proposed_link IS NULL AND NOT writable) OR (NOT source_visible AND (same_legacy_source OR EXISTS (
    SELECT 1 FROM public.cliente_whatsapp_grupo l WHERE l.cliente_id = NEW.id AND (
      proposed_link IS NULL OR (TG_OP = 'UPDATE' AND l.conversation_id IS NOT DISTINCT FROM proposed_conversation
        AND l.wa_cliente_id IS NOT DISTINCT FROM proposed_wa_client
        AND lower(btrim(l.chat_jid)) = lower(btrim(proposed_link->>'chat_jid')))
    )
  ))) THEN
    NEW.entregaveis := (CASE WHEN jsonb_typeof(NEW.entregaveis) = 'object' THEN NEW.entregaveis ELSE '{}'::jsonb END) - 'whatsapp_grupo';
    IF previous_link IS NOT NULL THEN NEW.entregaveis := NEW.entregaveis || jsonb_build_object('whatsapp_grupo', previous_link); END IF;
    RETURN NEW;
  END IF;

  IF NOT writable OR (proposed_link IS NOT NULL AND NOT source_visible) THEN
    RAISE insufficient_privilege USING MESSAGE = 'Sem acesso para alterar o grupo vinculado deste cliente.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER cs_ia_protect_legacy_group BEFORE INSERT OR UPDATE OF entregaveis ON public.clientes
  FOR EACH ROW EXECUTE FUNCTION private.cs_ia_protect_legacy_group();

CREATE FUNCTION private.cs_ia_group(p_client_id uuid)
RETURNS TABLE(group_status text, conversation_id uuid, group_jid text, group_name text, wa_client_id uuid,
  channel_id uuid, last_activity_at timestamptz, awaiting_since timestamptz)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  WITH link AS (
    SELECT CASE WHEN l.cliente_id IS NOT NULL THEN l.conversation_id
      ELSE public.central_trafego_try_uuid(c.entregaveis->'whatsapp_grupo'->>'conversation_id') END AS conversation_id,
      CASE WHEN l.cliente_id IS NOT NULL THEN l.wa_cliente_id
      ELSE public.central_trafego_try_uuid(c.entregaveis->'whatsapp_grupo'->>'wa_cliente_id') END AS wa_client_id,
      CASE WHEN l.cliente_id IS NOT NULL THEN l.chat_jid ELSE c.entregaveis->'whatsapp_grupo'->>'chat_jid' END AS jid,
      l.cliente_id IS NOT NULL OR nullif(c.entregaveis->'whatsapp_grupo', 'null'::jsonb) IS NOT NULL AS configured
    FROM public.clientes c LEFT JOIN public.cliente_whatsapp_grupo l ON l.cliente_id = c.id
    WHERE c.id = p_client_id AND c.etapa = 'closed'
      AND (private.cs_ia_worker() OR (private.cs_ia_role() IS NOT NULL AND private.cs_ia_client_scope(c.responsavel::text)))
  )
  -- Nunca resolve por JID sozinho: o mesmo grupo pode aparecer em vários números.
  SELECT CASE WHEN g.id IS NOT NULL THEN 'linked' WHEN l.configured THEN 'unavailable' ELSE 'unlinked' END,
    g.id, g.chat_jid, g.display_name, g.cliente_id, g.whatsapp_config_id, g.last_message_at,
    CASE WHEN g.status IS DISTINCT FROM 'resolvido' THEN g.awaiting_response_since END
  FROM link l LEFT JOIN public.atendimento_conversas g ON g.id = l.conversation_id
    AND g.cliente_id = l.wa_client_id AND lower(btrim(g.chat_jid)) = lower(btrim(l.jid))
    AND g.whatsapp_config_id IS NOT NULL AND g.is_group AND NOT g.bloqueada AND g.archived_at IS NULL
    AND (private.cs_ia_worker() OR public.atendimento_user_can_access_conversation(g.id));
$$;

CREATE POLICY cs_ia_settings_read ON public.cs_ia_settings FOR SELECT TO authenticated
  USING ((SELECT private.cs_ia_role()) IS NOT NULL);
CREATE POLICY cs_ia_settings_update ON public.cs_ia_settings FOR UPDATE TO authenticated
  USING ((SELECT private.cs_ia_role()) IN ('admin', 'superadmin'))
  WITH CHECK ((SELECT private.cs_ia_role()) IN ('admin', 'superadmin'));

CREATE POLICY cs_ia_relationships_read ON public.cs_ia_relationships FOR SELECT TO authenticated
  USING (private.cs_ia_client_exists(client_id));
CREATE POLICY cs_ia_relationships_insert ON public.cs_ia_relationships FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.cs_ia_role()) IN ('admin', 'superadmin') AND private.cs_ia_client_exists(client_id));
CREATE POLICY cs_ia_relationships_update ON public.cs_ia_relationships FOR UPDATE TO authenticated
  USING ((SELECT private.cs_ia_role()) IN ('admin', 'superadmin') AND private.cs_ia_client_exists(client_id))
  WITH CHECK ((SELECT private.cs_ia_role()) IN ('admin', 'superadmin') AND private.cs_ia_client_exists(client_id));

CREATE FUNCTION private.cs_ia_touch_relationship()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER cs_ia_relationship_updated BEFORE UPDATE ON public.cs_ia_relationships
  FOR EACH ROW EXECUTE FUNCTION private.cs_ia_touch_relationship();

CREATE POLICY cs_ia_daily_read ON public.cs_ia_daily FOR SELECT TO authenticated
  USING (private.cs_ia_client_exists(client_id) AND (
    conversation_id IS NULL OR EXISTS (
      SELECT 1 FROM private.cs_ia_group(client_id) g
      WHERE g.conversation_id = cs_ia_daily.conversation_id AND g.channel_id = cs_ia_daily.whatsapp_config_id
        AND g.wa_client_id = cs_ia_daily.wa_client_id AND g.group_jid = cs_ia_daily.group_jid
    )
  ));

CREATE FUNCTION private.cs_ia_wait_minutes(p_since timestamptz, p_now timestamptz, p_start int, p_end int, p_weekends boolean)
RETURNS integer LANGUAGE sql IMMUTABLE STRICT SECURITY INVOKER SET search_path = '' AS $$
  WITH local_times AS (
    SELECT p_since AT TIME ZONE 'America/Sao_Paulo' AS started, p_now AT TIME ZONE 'America/Sao_Paulo' AS finished
    WHERE isfinite(p_since) AND isfinite(p_now) AND p_since <= p_now
  ), dates AS (
    SELECT started, finished, started::date AS first_day, finished::date AS last_day,
      greatest(finished::date - started::date - 1, 0) AS whole_days FROM local_times
  )
  SELECT least(2147483647, floor(partial.minutes + (p_end - p_start) * 60::numeric * (
    CASE WHEN p_weekends THEN whole_days ELSE (whole_days / 7) * 5 + (
      SELECT count(*) FROM generate_series(1, whole_days % 7) AS days(offset_days)
      WHERE extract(isodow FROM first_day + days.offset_days) < 6
    ) END
  )))::integer
  FROM dates CROSS JOIN LATERAL (
    SELECT coalesce(sum(greatest(0, extract(epoch FROM (
      least(finished, bounds.day + make_interval(hours => p_end))
      - greatest(started, bounds.day + make_interval(hours => p_start))
    )) / 60)), 0) AS minutes
    FROM (SELECT first_day AS day UNION SELECT last_day) bounds
    WHERE p_weekends OR extract(isodow FROM bounds.day) < 6
  ) partial;
$$;

CREATE FUNCTION private.cs_ia_radar_at(p_now timestamptz)
RETURNS TABLE(client_id uuid, client_name text, owner_id uuid, owner_name text, manual_status text,
  group_status text, conversation_id uuid, group_jid text, group_name text, wa_client_id uuid,
  last_activity_at timestamptz, awaiting_since timestamptz, wait_minutes integer,
  score integer, health text, signal text, factors jsonb, score_delta integer, channel_id uuid)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  WITH inputs AS (
    SELECT c.id AS client_id, c.empresa::text AS client_name, p.id AS owner_id, p.full_name::text AS owner_name,
      r.manual_status, g.group_status, g.conversation_id, g.group_jid, g.group_name, g.wa_client_id, g.channel_id,
      CASE WHEN isfinite(g.last_activity_at) AND g.last_activity_at <= p_now THEN g.last_activity_at END AS last_activity_at,
      CASE WHEN isfinite(g.awaiting_since) AND g.awaiting_since <= p_now THEN g.awaiting_since END AS awaiting_since,
      private.cs_ia_wait_minutes(g.awaiting_since, p_now, s.start_hour, s.end_hour, s.weekends) AS wait_minutes,
      s.healthy_min, s.result_min, s.attention_min, s.score_drop, s.quiet_days, s.critical_quiet_days,
      (s.end_hour - s.start_hour) * 60 AS shift_minutes, (p_now AT TIME ZONE 'America/Sao_Paulo')::date AS day
    FROM public.cs_ia_settings s CROSS JOIN public.clientes c
    CROSS JOIN LATERAL private.cs_ia_group(c.id) g
    LEFT JOIN public.cs_ia_relationships r ON r.client_id = c.id
    LEFT JOIN public.profiles p ON p.id::text = c.responsavel::text
      AND p.status = 'active' AND p.role IN ('admin', 'superadmin', 'colaborador')
      AND (SELECT private.cs_ia_owner_visible())
    WHERE s.id = 1 AND c.etapa = 'closed'
  ), scored AS (
    SELECT i.*, elapsed.quiet, rollup.score, rollup.factors
    FROM inputs i CROSS JOIN LATERAL (
      SELECT i.day - (i.last_activity_at AT TIME ZONE 'America/Sao_Paulo')::date AS quiet
    ) elapsed CROSS JOIN LATERAL (
      SELECT round(sum(parts.score * parts.weight)::numeric / sum(parts.weight))::integer AS score,
        coalesce(jsonb_agg(jsonb_build_object('key', parts.key, 'label', parts.label, 'score', parts.score,
          'weight', round(100 * parts.weight::numeric / parts.total, 2)) ORDER BY parts.position), '[]'::jsonb) AS factors
      FROM (
        SELECT f.*, sum(f.weight) OVER () AS total
        FROM (VALUES
          (1, 'atendimento', 'Espera no expediente', 60,
            CASE WHEN i.wait_minutes IS NOT NULL THEN greatest(0, 100 - floor(i.wait_minutes * 100::numeric / i.shift_minutes))::integer
              WHEN i.last_activity_at IS NOT NULL THEN 100 END),
          (2, 'atividade', 'Atividade do grupo', 30,
            CASE WHEN elapsed.quiet IS NOT NULL THEN greatest(0, 100 - floor(elapsed.quiet * 100::numeric / i.critical_quiet_days))::integer END),
          (3, 'manual', 'Status manual', 10,
            CASE i.manual_status WHEN 'saudavel' THEN 100 WHEN 'resultado' THEN 65 WHEN 'atencao' THEN 45 WHEN 'critico' THEN 15 END)
        ) f(position, key, label, weight, score)
        WHERE f.score IS NOT NULL
      ) parts
    ) rollup
  ), classified AS (
    SELECT s.*, CASE WHEN s.score IS NULL THEN 'sem_leitura' WHEN s.score >= s.healthy_min THEN 'saudavel'
      WHEN s.score >= s.result_min THEN 'resultado' WHEN s.score >= s.attention_min THEN 'atencao' ELSE 'critico' END AS health,
      s.score - prior.score AS delta
    FROM scored s LEFT JOIN public.cs_ia_daily prior ON prior.client_id = s.client_id AND prior.operational_date = s.day - 7
      AND prior.conversation_id IS NOT DISTINCT FROM s.conversation_id AND prior.whatsapp_config_id IS NOT DISTINCT FROM s.channel_id
      AND prior.wa_client_id IS NOT DISTINCT FROM s.wa_client_id AND prior.group_jid IS NOT DISTINCT FROM s.group_jid
  )
  SELECT c.client_id, c.client_name, c.owner_id, c.owner_name, c.manual_status, c.group_status,
    c.conversation_id, c.group_jid, c.group_name, c.wa_client_id, c.last_activity_at, c.awaiting_since, c.wait_minutes,
    c.score, c.health, CASE
      WHEN c.health = 'critico' OR c.quiet >= c.critical_quiet_days THEN 'critico'
      WHEN c.awaiting_since IS NOT NULL THEN 'resposta_pendente'
      WHEN c.quiet >= c.quiet_days THEN 'inatividade'
      WHEN c.delta < -c.score_drop THEN 'queda'
      WHEN c.health = 'atencao' THEN 'atencao'
      WHEN c.group_status = 'unlinked' THEN 'sem_grupo'
      WHEN c.group_status = 'unavailable' OR c.score IS NULL THEN 'sem_dados'
      ELSE 'em_dia' END, c.factors, c.delta, c.channel_id
  FROM classified c;
$$;

CREATE FUNCTION public.cs_ia_radar()
RETURNS TABLE(client_id uuid, client_name text, owner_id uuid, owner_name text, manual_status text,
  group_status text, conversation_id uuid, group_jid text, group_name text, wa_client_id uuid,
  last_activity_at timestamptz, awaiting_since timestamptz, wait_minutes integer,
  score integer, health text, signal text, factors jsonb, score_delta integer, channel_id uuid)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT r.client_id, r.client_name, r.owner_id, r.owner_name, r.manual_status, r.group_status,
    r.conversation_id, r.group_jid, r.group_name, r.wa_client_id, r.last_activity_at, r.awaiting_since, r.wait_minutes,
    r.score, r.health, r.signal, r.factors, r.score_delta, r.channel_id
  FROM private.cs_ia_radar_at(now()) r;
$$;

CREATE FUNCTION public.cs_ia_group_source(p_client_id uuid, p_conversation_id uuid)
RETURNS TABLE(id uuid, cliente_id uuid, whatsapp_config_id uuid, chat_jid text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT g.conversation_id, g.wa_client_id, g.channel_id, g.group_jid
  FROM private.cs_ia_group(p_client_id) g
  WHERE private.cs_ia_role() IS NOT NULL AND g.group_status = 'linked' AND g.conversation_id = p_conversation_id;
$$;

REVOKE ALL ON FUNCTION public.cs_ia_group_source(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cs_ia_group_source(uuid, uuid) TO authenticated;

CREATE FUNCTION private.cs_ia_capture_radar(p_now timestamptz)
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  local_time timestamp := p_now AT TIME ZONE 'America/Sao_Paulo';
  inserted integer;
BEGIN
  IF NOT private.cs_ia_worker() OR extract(hour FROM local_time) IS DISTINCT FROM 9::numeric THEN RETURN 0; END IF;
  PERFORM 1 FROM public.cs_ia_settings WHERE id = 1 AND radar_enabled FOR SHARE;
  IF NOT FOUND THEN RETURN 0; END IF;

  INSERT INTO public.cs_ia_daily (client_id, conversation_id, wa_client_id, group_jid, whatsapp_config_id,
    operational_date, captured_at, score, health, signal, factors)
  SELECT r.client_id, r.conversation_id, r.wa_client_id, r.group_jid, r.channel_id,
    local_time::date, p_now, r.score, r.health, r.signal, r.factors
  FROM private.cs_ia_radar_at(p_now) r
  ON CONFLICT (client_id, operational_date) DO NOTHING;
  GET DIAGNOSTICS inserted = ROW_COUNT;
  RETURN inserted;
END;
$$;

REVOKE ALL ON FUNCTION private.cs_ia_module_enabled(text), private.cs_ia_role(), private.cs_ia_worker(), private.cs_ia_client_scope(text),
  private.cs_ia_owner_visible(), private.cs_ia_group_writer(uuid,text), private.cs_ia_group_writable(uuid),
  private.cs_ia_group_source_visible(uuid,uuid,text), private.cs_ia_protect_legacy_group(),
  private.cs_ia_client_exists(uuid), private.cs_ia_group(uuid), private.cs_ia_touch_relationship(),
  private.cs_ia_wait_minutes(timestamptz, timestamptz, int, int, boolean), private.cs_ia_radar_at(timestamptz),
  private.cs_ia_capture_radar(timestamptz), public.cs_ia_radar() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.cs_ia_module_enabled(text), private.cs_ia_role(), private.cs_ia_worker(), private.cs_ia_client_scope(text),
  private.cs_ia_owner_visible(), private.cs_ia_group_writer(uuid,text), private.cs_ia_group_writable(uuid),
  private.cs_ia_group_source_visible(uuid,uuid,text),
  private.cs_ia_client_exists(uuid), private.cs_ia_group(uuid), private.cs_ia_wait_minutes(timestamptz, timestamptz, int, int, boolean),
  private.cs_ia_radar_at(timestamptz), public.cs_ia_radar() TO authenticated;

-- A rotina só captura com adesão explícita e usa o horário de São Paulo mesmo que cron use outro fuso.
DO $cron$
BEGIN
  IF to_regprocedure('cron.schedule(text,text,text)') IS NOT NULL THEN
    PERFORM cron.schedule('planeje-cs-ia-radar-diario', '0 * * * *', 'SELECT private.cs_ia_capture_radar(now())');
  END IF;
END;
$cron$;

COMMIT;

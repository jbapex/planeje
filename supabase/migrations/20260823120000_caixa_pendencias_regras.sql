-- Caixa v2: regras fechadas (active, fila 2 determinística, 7 dias, arquivar, nomes).
-- Incremental. Não edita a migration 20260822110000 já aplicada.

CREATE TABLE IF NOT EXISTS public.atendimento_grupo_remetente_interno (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  label text NOT NULL,
  phone text,
  sender_jid text,
  name_match text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_atendimento_grupo_remetente_interno_cliente
  ON public.atendimento_grupo_remetente_interno (cliente_id);

ALTER TABLE public.pendencias_caixa
  ADD COLUMN IF NOT EXISTS pedido_explicito_cliente boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sla_estourado boolean NOT NULL DEFAULT false;

ALTER TABLE public.atendimento_conversas
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

ALTER TABLE public.cliente_whatsapp_config
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

ALTER TABLE public.pendencias_caixa
  DROP CONSTRAINT IF EXISTS pendencias_caixa_resolution_kind_check;

ALTER TABLE public.pendencias_caixa
  ADD CONSTRAINT pendencias_caixa_resolution_kind_check
  CHECK (
    resolution_kind IS NULL
    OR resolution_kind IN ('feito', 'respondido', 'nao_e_comigo', 'arquivada', 'expirada')
  );

CREATE INDEX IF NOT EXISTS atendimento_conversas_archived_jid_idx
  ON public.atendimento_conversas (cliente_id, chat_jid)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS cliente_whatsapp_config_archived_idx
  ON public.cliente_whatsapp_config (cliente_id)
  WHERE archived_at IS NULL;

COMMENT ON COLUMN public.pendencias_caixa.pedido_explicito_cliente IS
  'Pedido explícito de cliente: não expira sozinho em 7 dias.';
COMMENT ON COLUMN public.pendencias_caixa.sla_estourado IS
  'SLA da fila estourou enquanto a última mensagem relevante é do cliente.';
COMMENT ON COLUMN public.atendimento_conversas.archived_at IS
  'Canal/conversa substituído por um canal mais novo no mesmo chat_jid.';
COMMENT ON COLUMN public.cliente_whatsapp_config.archived_at IS
  'Canal WhatsApp sem conversa viva (todas as conversas foram arquivadas).';

CREATE OR REPLACE FUNCTION public.caixa_uuid_orfao()
RETURNS uuid
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT 'a9b2a0f6-053d-44d2-b5b0-3c0d823c4e91'::uuid;
$$;

CREATE OR REPLACE FUNCTION public.caixa_cliente_agencia_id()
RETURNS uuid
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT 'a02d4491-d6b1-41f6-bf57-7c252f798c16'::uuid;
$$;

CREATE OR REPLACE FUNCTION public.caixa_pessoa_elegivel(p_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    p_id IS NOT NULL
    AND p_id <> public.caixa_uuid_orfao()
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = p_id
        AND p.role IN ('superadmin', 'admin', 'colaborador')
        AND p.status = 'active'
    );
$$;

CREATE OR REPLACE FUNCTION public.caixa_normalizar_nome(p_nome text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT trim(both from regexp_replace(
    regexp_replace(
      lower(coalesce(p_nome, '')),
      '^[[:space:]]*(mkt|grupo|gp|group)[[:space:]]*[-–:]*[[:space:]]*',
      ''
    ),
    '[^[:alnum:]]+',
    ' ',
    'g'
  ));
$$;

CREATE OR REPLACE FUNCTION public.caixa_nomes_equivalentes(p_a text, p_b text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    length(coalesce(p_a, '')) >= 4
    AND length(coalesce(p_b, '')) >= 4
    AND (
      p_a = p_b
      OR p_a LIKE p_b || '%'
      OR p_b LIKE p_a || '%'
      OR p_a LIKE '%' || p_b || '%'
      OR p_b LIKE '%' || p_a || '%'
    );
$$;

CREATE OR REPLACE FUNCTION public.caixa_empresa_e_agencia(p_empresa text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT public.caixa_normalizar_nome(p_empresa) IN (
    'jb apex',
    'jbapex',
    'jb estrategico',
    'jb estratégico'
  )
  OR public.caixa_normalizar_nome(p_empresa) LIKE 'jb apex%';
$$;

CREATE OR REPLACE FUNCTION public.caixa_cliente_representado(
  p_cliente_id uuid,
  p_display_name text
)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_empresa text;
  v_norm text := public.caixa_normalizar_nome(p_display_name);
  v_match uuid;
BEGIN
  IF p_cliente_id IS NOT NULL AND p_cliente_id <> public.caixa_cliente_agencia_id() THEN
    SELECT empresa INTO v_empresa FROM public.clientes WHERE id = p_cliente_id;
    IF v_empresa IS NOT NULL AND NOT public.caixa_empresa_e_agencia(v_empresa) THEN
      RETURN p_cliente_id;
    END IF;
  END IF;

  SELECT c.id
  INTO v_match
  FROM public.clientes c
  WHERE c.id <> public.caixa_cliente_agencia_id()
    AND NOT public.caixa_empresa_e_agencia(c.empresa)
    AND public.caixa_nomes_equivalentes(public.caixa_normalizar_nome(c.empresa), v_norm)
  ORDER BY length(public.caixa_normalizar_nome(c.empresa)) DESC
  LIMIT 1;

  RETURN v_match;
END;
$$;

CREATE OR REPLACE FUNCTION public.caixa_empresa_exibicao(
  p_cliente_id uuid,
  p_display_name text
)
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_id uuid := public.caixa_cliente_representado(p_cliente_id, p_display_name);
  v_empresa text;
BEGIN
  IF v_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT empresa INTO v_empresa FROM public.clientes WHERE id = v_id;
  IF public.caixa_empresa_e_agencia(v_empresa) THEN
    RETURN NULL;
  END IF;
  RETURN v_empresa;
END;
$$;

CREATE OR REPLACE FUNCTION public.caixa_dono_padrao_conversa(
  p_cliente_id uuid,
  p_display_name text
)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cliente uuid := coalesce(
    public.caixa_cliente_representado(p_cliente_id, p_display_name),
    CASE
      WHEN p_cliente_id IS DISTINCT FROM public.caixa_cliente_agencia_id() THEN p_cliente_id
      ELSE NULL
    END
  );
  v_dono uuid;
BEGIN
  IF v_cliente IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT responsavel INTO v_dono
  FROM public.clientes
  WHERE id = v_cliente;

  IF public.caixa_pessoa_elegivel(v_dono) THEN
    RETURN v_dono;
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.caixa_texto_irrelevante(p_body text, p_type text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_type text := lower(trim(coalesce(p_type, '')));
  v_body text := lower(trim(coalesce(p_body, '')));
BEGIN
  IF v_type IN (
    'reaction', 'sticker', 'ptt', 'audio', 'myaudio', 'voice',
    'voicemessage', 'pttmessage'
  ) THEN
    RETURN true;
  END IF;

  IF v_body = '' THEN
    RETURN true;
  END IF;

  IF v_body IN (
    'ok', 'okay', 'ok.', 'okk', 'ok!', 'ta', 'tá', 'tá.', 'blz', 'beleza',
    'obrigado', 'obrigada', 'obg', 'vlw', 'valeu', '👍', '✅', '🙏',
    'kk', 'kkk', 'haha', 'rs', 'rss'
  ) THEN
    RETURN true;
  END IF;

  IF v_body ~ '^\[(ptt|áudio|audio|sticker|reaction|figurinha)\]$' THEN
    RETURN true;
  END IF;

  IF v_body !~ '[[:alnum:]]' AND char_length(v_body) <= 8 THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.caixa_remetente_e_equipe(
  p_conversa public.atendimento_conversas,
  p_sender_name text,
  p_sender_jid text,
  p_phone text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_name text := lower(coalesce(p_sender_name, ''));
  v_digits text := regexp_replace(coalesce(p_phone, p_sender_jid, ''), '\D', '', 'g');
  v_cliente uuid;
  v_interno boolean := false;
BEGIN
  IF v_name ~ '(jb[[:space:]]|estratégico|estrategico|apex ia|planeje)' THEN
    RETURN true;
  END IF;

  IF p_conversa.assigned_to IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.profiles pr
    WHERE pr.id = p_conversa.assigned_to
      AND pr.full_name IS NOT NULL
      AND v_name <> ''
      AND v_name LIKE '%' || lower(pr.full_name) || '%'
  ) THEN
    RETURN true;
  END IF;

  v_cliente := coalesce(
    public.caixa_cliente_representado(p_conversa.cliente_id, p_conversa.display_name),
    p_conversa.cliente_id
  );

  IF to_regclass('public.atendimento_grupo_remetente_interno') IS NOT NULL THEN
    EXECUTE
      $q$
      SELECT EXISTS (
        SELECT 1
        FROM public.atendimento_grupo_remetente_interno r
        WHERE r.cliente_id IN ($1, $2)
          AND (
            (r.sender_jid IS NOT NULL AND coalesce($3, '') ILIKE '%' || r.sender_jid || '%')
            OR (
              r.phone IS NOT NULL
              AND $4 <> ''
              AND $4 LIKE '%' || regexp_replace(r.phone, '\D', '', 'g') || '%'
            )
            OR (
              r.name_match IS NOT NULL
              AND $5 <> ''
              AND $5 LIKE '%' || lower(r.name_match) || '%'
            )
          )
      )
      $q$
    INTO v_interno
    USING p_conversa.cliente_id, v_cliente, p_sender_jid, v_digits, v_name;
    IF v_interno THEN
      RETURN true;
    END IF;
  END IF;

  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.caixa_ultima_mensagem_relevante(p_conversa_id uuid)
RETURNS TABLE (papel text, ocorrido_em timestamptz, corpo text)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_conv public.atendimento_conversas%ROWTYPE;
  v_last_inbox_ts timestamptz;
BEGIN
  SELECT * INTO v_conv
  FROM public.atendimento_conversas
  WHERE id = p_conversa_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT max(coalesce(i.msg_timestamp, i.created_at))
  INTO v_last_inbox_ts
  FROM public.cliente_whatsapp_inbox i
  WHERE i.conversation_id = p_conversa_id;

  RETURN QUERY
  WITH msgs AS (
    SELECT
      coalesce(i.msg_timestamp, i.created_at) AS ts,
      i.body,
      CASE
        WHEN public.caixa_remetente_e_equipe(v_conv, i.sender_name, i.sender_jid, i.phone) THEN 'equipe'
        WHEN coalesce(i.msg_timestamp, i.created_at) IS NOT DISTINCT FROM v_last_inbox_ts
          AND coalesce(v_conv.group_ai_analysis ->> 'sender_role', '') = 'equipe'
          THEN 'equipe'
        ELSE 'cliente'
      END AS papel
    FROM public.cliente_whatsapp_inbox i
    WHERE i.conversation_id = p_conversa_id
      AND NOT public.caixa_texto_irrelevante(i.body, i.type)

    UNION ALL

    SELECT
      s.created_at,
      s.body,
      'equipe'
    FROM public.cliente_whatsapp_sent s
    WHERE s.conversation_id = p_conversa_id
      AND NOT public.caixa_texto_irrelevante(s.body, 'text')
  )
  SELECT m.papel, m.ts, m.body
  FROM msgs m
  ORDER BY m.ts DESC NULLS LAST
  LIMIT 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.caixa_sla_minutos(p_conversa public.atendimento_conversas)
RETURNS integer
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT coalesce(
    (
      SELECT f.sla_primeira_resposta_minutos
      FROM public.atendimento_filas f
      WHERE f.id = p_conversa.fila_id
    ),
    5
  );
$$;

DROP TRIGGER IF EXISTS atendimento_conversas_sincronizar_pendencia_caixa
  ON public.atendimento_conversas;
DROP FUNCTION IF EXISTS public.caixa_conversa_precisa_resposta(public.atendimento_conversas);

CREATE OR REPLACE FUNCTION public.caixa_conversa_precisa_resposta(
  p_conversa public.atendimento_conversas
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_ultima record;
BEGIN
  IF p_conversa.status = 'resolvido' THEN
    RETURN false;
  END IF;
  IF p_conversa.archived_at IS NOT NULL THEN
    RETURN false;
  END IF;

  SELECT * INTO v_ultima
  FROM public.caixa_ultima_mensagem_relevante(p_conversa.id);

  -- Fila 2: última mensagem relevante é do cliente.
  -- needs_agency_response não decide.
  RETURN FOUND AND v_ultima.papel = 'cliente';
END;
$$;

CREATE OR REPLACE FUNCTION public.caixa_conversa_precisa_resposta_id(p_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT public.caixa_conversa_precisa_resposta(c)
  FROM public.atendimento_conversas c
  WHERE c.id = p_id;
$$;

CREATE OR REPLACE FUNCTION public.caixa_conversa_sla_estourado(
  p_conversa public.atendimento_conversas
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_ultima record;
  v_since timestamptz;
BEGIN
  IF NOT public.caixa_conversa_precisa_resposta(p_conversa) THEN
    RETURN false;
  END IF;

  SELECT * INTO v_ultima
  FROM public.caixa_ultima_mensagem_relevante(p_conversa.id);

  v_since := coalesce(
    p_conversa.awaiting_response_since,
    p_conversa.last_customer_message_at,
    v_ultima.ocorrido_em
  );

  RETURN v_since IS NOT NULL
    AND v_since + (public.caixa_sla_minutos(p_conversa) || ' minutes')::interval < now();
END;
$$;

CREATE OR REPLACE FUNCTION public.criar_pendencias_caixa_comentario()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task public.tarefas%ROWTYPE;
BEGIN
  IF NOT NEW.pendencia_caixa THEN
    RETURN NEW;
  END IF;

  IF NEW.user_id <> '07d65b46-dd33-4ce6-a98f-8940374c534c'::uuid
     AND lower(coalesce(NEW.origem, '')) <> 'gestor' THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_task
  FROM public.tarefas
  WHERE id = NEW.task_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF coalesce(array_length(v_task.assignee_ids, 1), 0) > 0 THEN
    INSERT INTO public.pendencias_caixa (
      origem,
      pessoa_id,
      task_comment_id,
      task_id,
      estado,
      last_activity_at
    )
    SELECT
      'comentario',
      p.id,
      NEW.id,
      NEW.task_id,
      'aberta',
      coalesce(NEW.created_at, now())
    FROM unnest(v_task.assignee_ids) AS assignee(id)
    JOIN public.profiles p ON p.id = assignee.id
    WHERE public.caixa_pessoa_elegivel(p.id)
    ON CONFLICT (task_comment_id, pessoa_id) WHERE origem = 'comentario'
    DO NOTHING;
  ELSE
    INSERT INTO public.pendencias_caixa (
      origem,
      pessoa_id,
      task_comment_id,
      task_id,
      estado,
      last_activity_at
    )
    SELECT
      'comentario',
      p.id,
      NEW.id,
      NEW.task_id,
      'aberta',
      coalesce(NEW.created_at, now())
    FROM public.profiles p
    WHERE p.id = v_task.owner_id
      AND public.caixa_pessoa_elegivel(p.id)
    ON CONFLICT (task_comment_id, pessoa_id) WHERE origem = 'comentario'
    DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sincronizar_pendencia_caixa_conversa()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_precisa boolean := public.caixa_conversa_precisa_resposta(NEW);
  v_old_precisa boolean := false;
  v_explicito boolean := false;
  v_sla boolean := false;
BEGIN
  IF NEW.archived_at IS NOT NULL THEN
    UPDATE public.pendencias_caixa
    SET
      estado = 'resolvida',
      resolution_kind = 'arquivada',
      resolved_at = coalesce(resolved_at, now()),
      updated_at = now()
    WHERE origem = 'conversa'
      AND conversation_id = NEW.id
      AND resolved_at IS NULL;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    v_old_precisa := public.caixa_conversa_precisa_resposta(OLD);

    IF OLD.assigned_to IS NOT NULL
       AND OLD.assigned_to IS DISTINCT FROM NEW.assigned_to THEN
      UPDATE public.pendencias_caixa
      SET
        estado = 'resolvida',
        resolution_kind = 'nao_e_comigo',
        resolved_at = coalesce(resolved_at, now()),
        updated_at = now()
      WHERE origem = 'conversa'
        AND conversation_id = NEW.id
        AND pessoa_id = OLD.assigned_to
        AND resolved_at IS NULL;
    END IF;
  END IF;

  IF NOT public.caixa_pessoa_elegivel(NEW.assigned_to) THEN
    RETURN NEW;
  END IF;

  v_explicito := v_precisa;
  v_sla := public.caixa_conversa_sla_estourado(NEW);

  IF v_precisa THEN
    INSERT INTO public.pendencias_caixa (
      origem,
      pessoa_id,
      conversation_id,
      estado,
      created_at,
      updated_at,
      last_activity_at,
      resolved_at,
      resolved_by,
      resolution_kind,
      pedido_explicito_cliente,
      sla_estourado
    )
    VALUES (
      'conversa',
      NEW.assigned_to,
      NEW.id,
      CASE WHEN NEW.status = 'em_atendimento' THEN 'em_atendimento' ELSE 'aberta' END,
      coalesce(NEW.awaiting_response_since, NEW.last_message_at, now()),
      now(),
      coalesce(NEW.last_message_at, NEW.awaiting_response_since, now()),
      NULL,
      NULL,
      NULL,
      v_explicito,
      v_sla
    )
    ON CONFLICT (conversation_id, pessoa_id) WHERE origem = 'conversa'
    DO UPDATE SET
      estado = CASE
        WHEN NEW.status = 'em_atendimento' THEN 'em_atendimento'
        ELSE 'aberta'
      END,
      updated_at = now(),
      last_activity_at = coalesce(NEW.last_message_at, NEW.awaiting_response_since, now()),
      resolved_at = NULL,
      resolved_by = NULL,
      resolution_kind = NULL,
      pedido_explicito_cliente = EXCLUDED.pedido_explicito_cliente,
      sla_estourado = EXCLUDED.sla_estourado
    WHERE
      pendencias_caixa.resolved_at IS NULL
      OR coalesce(pendencias_caixa.resolution_kind, '') NOT IN ('arquivada', 'expirada')
      OR EXCLUDED.last_activity_at > pendencias_caixa.last_activity_at;
  ELSE
    UPDATE public.pendencias_caixa
    SET
      estado = 'resolvida',
      resolution_kind = CASE
        WHEN resolution_kind IN ('arquivada', 'expirada') THEN resolution_kind
        WHEN v_old_precisa THEN 'respondido'
        ELSE coalesce(resolution_kind, 'respondido')
      END,
      resolved_at = coalesce(resolved_at, now()),
      updated_at = now(),
      last_activity_at = coalesce(NEW.last_message_at, now()),
      sla_estourado = false
    WHERE origem = 'conversa'
      AND conversation_id = NEW.id
      AND pessoa_id = NEW.assigned_to
      AND resolved_at IS NULL;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER atendimento_conversas_sincronizar_pendencia_caixa
AFTER INSERT OR UPDATE OF
  assigned_to,
  awaiting_response_since,
  group_ai_analysis,
  status,
  last_message_at,
  last_message_preview,
  archived_at
ON public.atendimento_conversas
FOR EACH ROW
EXECUTE FUNCTION public.sincronizar_pendencia_caixa_conversa();

CREATE OR REPLACE FUNCTION public.caixa_ao_ativar_perfil()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'active' AND OLD.status IS DISTINCT FROM 'active' THEN
    UPDATE public.atendimento_conversas c
    SET updated_at = now()
    WHERE c.assigned_to = NEW.id
      AND c.archived_at IS NULL
      AND c.status <> 'resolvido';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_caixa_ao_ativar ON public.profiles;
CREATE TRIGGER profiles_caixa_ao_ativar
AFTER UPDATE OF status
ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.caixa_ao_ativar_perfil();

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

CREATE OR REPLACE FUNCTION public.caixa_reatribuir_grupos_sem_dono()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  WITH updated AS (
    UPDATE public.atendimento_conversas c
    SET
      assigned_to = public.caixa_dono_padrao_conversa(c.cliente_id, c.display_name),
      updated_at = now()
    WHERE c.archived_at IS NULL
      AND c.is_group = true
      AND c.assigned_to IS NULL
      AND public.caixa_dono_padrao_conversa(c.cliente_id, c.display_name) IS NOT NULL
    RETURNING c.id
  )
  SELECT count(*) INTO v_count FROM updated;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.manutencao_caixa_diaria()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expiradas integer := 0;
  v_dup jsonb;
  v_reatribuidos integer := 0;
  v_fechadas integer := 0;
BEGIN
  UPDATE public.pendencias_caixa
  SET
    estado = 'resolvida',
    resolution_kind = 'expirada',
    resolved_at = coalesce(resolved_at, now()),
    updated_at = now()
  WHERE resolved_at IS NULL
    AND pedido_explicito_cliente = false
    AND last_activity_at < now() - interval '7 days';
  GET DIAGNOSTICS v_expiradas = ROW_COUNT;

  v_dup := public.caixa_arquivar_canais_duplicados();
  v_reatribuidos := public.caixa_reatribuir_grupos_sem_dono();

  UPDATE public.pendencias_caixa p
  SET
    estado = 'resolvida',
    resolution_kind = CASE
      WHEN c.archived_at IS NOT NULL THEN 'arquivada'
      ELSE 'respondido'
    END,
    resolved_at = coalesce(p.resolved_at, now()),
    updated_at = now(),
    sla_estourado = false
  FROM public.atendimento_conversas c
  WHERE p.origem = 'conversa'
    AND p.conversation_id = c.id
    AND p.resolved_at IS NULL
    AND NOT public.caixa_conversa_precisa_resposta(c);
  GET DIAGNOSTICS v_fechadas = ROW_COUNT;

  INSERT INTO public.pendencias_caixa (
    origem,
    pessoa_id,
    conversation_id,
    estado,
    created_at,
    updated_at,
    last_activity_at,
    pedido_explicito_cliente,
    sla_estourado
  )
  SELECT
    'conversa',
    c.assigned_to,
    c.id,
    CASE WHEN c.status = 'em_atendimento' THEN 'em_atendimento' ELSE 'aberta' END,
    coalesce(c.awaiting_response_since, c.last_message_at, now()),
    now(),
    coalesce(c.last_message_at, c.awaiting_response_since, now()),
    true,
    public.caixa_conversa_sla_estourado(c)
  FROM public.atendimento_conversas c
  WHERE public.caixa_pessoa_elegivel(c.assigned_to)
    AND c.archived_at IS NULL
    AND public.caixa_conversa_precisa_resposta(c)
  ON CONFLICT (conversation_id, pessoa_id) WHERE origem = 'conversa'
  DO UPDATE SET
    estado = EXCLUDED.estado,
    updated_at = now(),
    last_activity_at = EXCLUDED.last_activity_at,
    pedido_explicito_cliente = true,
    sla_estourado = EXCLUDED.sla_estourado,
    resolved_at = NULL,
    resolved_by = NULL,
    resolution_kind = NULL
  WHERE
    pendencias_caixa.resolved_at IS NULL
    OR coalesce(pendencias_caixa.resolution_kind, '') NOT IN ('arquivada', 'expirada')
    OR EXCLUDED.last_activity_at > pendencias_caixa.last_activity_at;

  RETURN jsonb_build_object(
    'expiradas', v_expiradas,
    'duplicados', v_dup,
    'reatribuidos', v_reatribuidos,
    'fechadas_sem_pedido', v_fechadas
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.listar_pendencias_caixa(
  p_pessoa_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_target uuid := coalesce(p_pessoa_id, auth.uid());
  v_result jsonb;
BEGIN
  IF v_target IS NULL THEN
    RAISE EXCEPTION 'pessoa_id é obrigatório para chamadas administrativas';
  END IF;

  IF v_caller IS NOT NULL
     AND v_caller <> v_target
     AND NOT EXISTS (
       SELECT 1 FROM public.profiles
       WHERE id = v_caller AND role IN ('superadmin', 'admin')
     ) THEN
    RAISE EXCEPTION 'Sem acesso à caixa de outra pessoa';
  END IF;

  IF NOT public.caixa_pessoa_elegivel(v_target) THEN
    RETURN jsonb_build_object(
      'pessoa_id', v_target,
      'badge_total', 0,
      'contagem', jsonb_build_object(
        'pedidos_internos', 0,
        'cliente_sem_resposta', 0,
        'respondido_hoje', 0
      ),
      'itens', '[]'::jsonb
    );
  END IF;

  WITH items AS (
    SELECT
      p.id,
      p.origem,
      p.pessoa_id,
      p.estado,
      CASE
        WHEN p.resolved_at IS NOT NULL THEN 'respondido_hoje'
        WHEN p.origem = 'comentario' THEN 'pedidos_internos'
        ELSE 'cliente_sem_resposta'
      END AS fila,
      p.created_at,
      p.updated_at,
      p.last_activity_at,
      p.resolved_at,
      p.resolved_by,
      p.resolution_kind,
      p.pedido_explicito_cliente,
      p.sla_estourado,
      p.task_id,
      t.title AS task_title,
      p.task_comment_id,
      tc.content AS comment_content,
      comment_author.full_name AS comment_author_name,
      p.conversation_id,
      coalesce(c.display_name, c.chat_jid) AS conversation_name,
      c.chat_jid,
      c.status AS conversation_status,
      c.last_message_preview,
      c.last_message_at,
      c.awaiting_response_since,
      c.is_group,
      coalesce(t.client_id, c.cliente_id) AS cliente_id,
      CASE
        WHEN p.origem = 'comentario' THEN
          CASE
            WHEN public.caixa_empresa_e_agencia(task_client.empresa) THEN NULL
            ELSE task_client.empresa
          END
        ELSE public.caixa_empresa_exibicao(c.cliente_id, c.display_name)
      END AS empresa
    FROM public.pendencias_caixa p
    LEFT JOIN public.tarefas t ON t.id = p.task_id
    LEFT JOIN public.task_comments tc ON tc.id = p.task_comment_id
    LEFT JOIN public.profiles comment_author ON comment_author.id = tc.user_id
    LEFT JOIN public.atendimento_conversas c ON c.id = p.conversation_id
    LEFT JOIN public.clientes task_client ON task_client.id = t.client_id
    WHERE p.pessoa_id = v_target
      AND coalesce(p.resolution_kind, '') NOT IN ('arquivada', 'expirada', 'nao_e_comigo')
      AND (p.origem <> 'conversa' OR c.archived_at IS NULL)
      AND (
        p.resolved_at IS NULL
        OR (
          p.resolution_kind IN ('feito', 'respondido')
          AND p.resolved_at >= (
            date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo')
            AT TIME ZONE 'America/Sao_Paulo'
          )
        )
      )
  )
  SELECT jsonb_build_object(
    'pessoa_id', v_target,
    'badge_total', count(*) FILTER (WHERE resolved_at IS NULL),
    'contagem', jsonb_build_object(
      'pedidos_internos', count(*) FILTER (WHERE fila = 'pedidos_internos'),
      'cliente_sem_resposta', count(*) FILTER (WHERE fila = 'cliente_sem_resposta'),
      'respondido_hoje', count(*) FILTER (WHERE fila = 'respondido_hoje')
    ),
    'itens', coalesce(
      jsonb_agg(to_jsonb(items) ORDER BY
        CASE fila
          WHEN 'pedidos_internos' THEN 1
          WHEN 'cliente_sem_resposta' THEN 2
          ELSE 3
        END,
        last_activity_at DESC
      ),
      '[]'::jsonb
    )
  )
  INTO v_result
  FROM items;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.agir_pendencia_caixa(
  p_id uuid,
  p_acao text,
  p_actor_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := coalesce(auth.uid(), p_actor_id);
  v_item public.pendencias_caixa%ROWTYPE;
  v_role text;
BEGIN
  IF p_acao NOT IN ('estou_nisso', 'feito', 'nao_e_comigo', 'arquivar') THEN
    RAISE EXCEPTION 'Ação inválida: %', p_acao;
  END IF;

  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Usuário não identificado';
  END IF;

  SELECT role INTO v_role FROM public.profiles WHERE id = v_actor;
  IF v_role NOT IN ('superadmin', 'admin', 'colaborador') THEN
    RAISE EXCEPTION 'Ação permitida apenas para equipe';
  END IF;

  SELECT * INTO v_item
  FROM public.pendencias_caixa
  WHERE id = p_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pendência não encontrada';
  END IF;

  IF v_item.pessoa_id <> v_actor AND v_role NOT IN ('superadmin', 'admin') THEN
    RAISE EXCEPTION 'Sem acesso a esta pendência';
  END IF;

  IF p_acao = 'estou_nisso' THEN
    UPDATE public.pendencias_caixa
    SET estado = 'em_atendimento', updated_at = now()
    WHERE id = p_id AND resolved_at IS NULL;

    IF v_item.origem = 'conversa' THEN
      UPDATE public.atendimento_conversas
      SET status = 'em_atendimento', updated_at = now()
      WHERE id = v_item.conversation_id
        AND status <> 'resolvido';
    END IF;
  ELSIF p_acao = 'feito' THEN
    IF v_item.origem = 'conversa' THEN
      UPDATE public.atendimento_conversas
      SET
        status = 'resolvido',
        awaiting_response_since = NULL,
        group_ai_analysis = CASE
          WHEN group_ai_analysis IS NULL THEN NULL
          ELSE jsonb_set(group_ai_analysis, '{needs_agency_response}', 'false'::jsonb, true)
        END,
        resolved_at = now(),
        resolved_by = v_actor,
        updated_at = now()
      WHERE id = v_item.conversation_id;
    END IF;

    UPDATE public.pendencias_caixa
    SET
      estado = 'resolvida',
      resolution_kind = 'feito',
      resolved_at = coalesce(resolved_at, now()),
      resolved_by = v_actor,
      updated_at = now()
    WHERE id = p_id;
  ELSIF p_acao = 'arquivar' THEN
    UPDATE public.pendencias_caixa
    SET
      estado = 'resolvida',
      resolution_kind = 'arquivada',
      resolved_at = coalesce(resolved_at, now()),
      resolved_by = v_actor,
      updated_at = now()
    WHERE id = p_id;
  ELSE
    IF v_item.origem = 'conversa' THEN
      UPDATE public.atendimento_conversas
      SET assigned_to = NULL, updated_at = now()
      WHERE id = v_item.conversation_id
        AND assigned_to = v_item.pessoa_id;
    ELSE
      UPDATE public.tarefas
      SET assignee_ids = array_remove(assignee_ids, v_item.pessoa_id)
      WHERE id = v_item.task_id
        AND v_item.pessoa_id = ANY(coalesce(assignee_ids, ARRAY[]::uuid[]));
    END IF;

    UPDATE public.pendencias_caixa
    SET
      estado = 'resolvida',
      resolution_kind = 'nao_e_comigo',
      resolved_at = coalesce(resolved_at, now()),
      resolved_by = v_actor,
      updated_at = now()
    WHERE id = p_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'id', p_id,
    'acao', p_acao,
    'actor_id', v_actor
  );
END;
$$;

REVOKE ALL ON FUNCTION public.caixa_dono_padrao_conversa(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.caixa_dono_padrao_conversa(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.caixa_conversa_precisa_resposta_id(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.caixa_cliente_representado(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.caixa_empresa_exibicao(uuid, text) TO service_role;
REVOKE ALL ON FUNCTION public.caixa_arquivar_canais_duplicados(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.caixa_arquivar_canais_duplicados(text, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.caixa_reatribuir_grupos_sem_dono() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.caixa_reatribuir_grupos_sem_dono() TO service_role;
REVOKE ALL ON FUNCTION public.manutencao_caixa_diaria() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.manutencao_caixa_diaria() TO service_role;
REVOKE ALL ON FUNCTION public.listar_pendencias_caixa(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.listar_pendencias_caixa(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.agir_pendencia_caixa(uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.agir_pendencia_caixa(uuid, text, uuid) TO authenticated, service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(j.jobid)
    FROM cron.job j
    WHERE j.jobname = 'caixa-manutencao-diaria';
    PERFORM cron.schedule(
      'caixa-manutencao-diaria',
      '0 9 * * *',
      $cron$SELECT public.manutencao_caixa_diaria()$cron$
    );
  END IF;
EXCEPTION
  WHEN undefined_table THEN
    NULL;
  WHEN undefined_function THEN
    NULL;
  WHEN OTHERS THEN
    NULL;
END $$;

SELECT public.manutencao_caixa_diaria();

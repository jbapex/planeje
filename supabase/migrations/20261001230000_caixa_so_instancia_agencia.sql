-- Caixa do Planeje só recebe conversa da instância da agência (JB APEX).
-- Mensagem que chega na instância da loja continua no atendimento da loja
-- e deixa de abrir pendência na Caixa da equipe.

CREATE OR REPLACE FUNCTION public.sincronizar_pendencia_caixa_conversa()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_precisa boolean := public.caixa_conversa_precisa_resposta(NEW);
  v_old_precisa boolean := false;
  v_explicito boolean := false;
  v_sla boolean := false;
BEGIN
  IF NEW.cliente_id IS DISTINCT FROM public.caixa_cliente_agencia_id() THEN
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
$function$;

CREATE OR REPLACE FUNCTION public.caixa_reatribuir_grupos_sem_dono()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      AND c.cliente_id = public.caixa_cliente_agencia_id()
      AND public.caixa_dono_padrao_conversa(c.cliente_id, c.display_name) IS NOT NULL
    RETURNING c.id
  )
  SELECT count(*) INTO v_count FROM updated;
  RETURN v_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.manutencao_caixa_diaria()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_expiradas integer := 0;
  v_dup jsonb;
  v_reatribuidos integer := 0;
  v_fechadas integer := 0;
  v_fora integer := 0;
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
    resolution_kind = 'arquivada',
    resolved_at = coalesce(p.resolved_at, now()),
    updated_at = now(),
    sla_estourado = false
  FROM public.atendimento_conversas c
  WHERE p.origem = 'conversa'
    AND p.conversation_id = c.id
    AND p.resolved_at IS NULL
    AND c.cliente_id IS DISTINCT FROM public.caixa_cliente_agencia_id();
  GET DIAGNOSTICS v_fora = ROW_COUNT;

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
    AND c.cliente_id = public.caixa_cliente_agencia_id()
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
    AND c.cliente_id = public.caixa_cliente_agencia_id()
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
    'fechadas_sem_pedido', v_fechadas,
    'fora_da_agencia', v_fora
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.listar_pendencias_caixa(p_pessoa_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      AND (p.origem <> 'conversa' OR c.cliente_id = public.caixa_cliente_agencia_id())
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
$function$;

UPDATE public.pendencias_caixa p
SET
  estado = 'resolvida',
  resolution_kind = 'arquivada',
  resolved_at = coalesce(p.resolved_at, now()),
  updated_at = now()
FROM public.atendimento_conversas c
WHERE p.origem = 'conversa'
  AND p.conversation_id = c.id
  AND p.resolved_at IS NULL
  AND c.cliente_id IS DISTINCT FROM public.caixa_cliente_agencia_id();

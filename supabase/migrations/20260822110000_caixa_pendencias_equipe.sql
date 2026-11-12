-- Caixa de pendências da equipe.
-- Une cobranças internas explícitas e conversas atribuídas que aguardam resposta,
-- sem depender de parse de texto e sem duplicar a inbox de atendimento.

ALTER TABLE public.task_comments
  ADD COLUMN IF NOT EXISTS pendencia_caixa boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS origem text NOT NULL DEFAULT 'comentario';

COMMENT ON COLUMN public.task_comments.pendencia_caixa IS
  'Quando true, cria pendência explícita para os responsáveis da tarefa.';
COMMENT ON COLUMN public.task_comments.origem IS
  'Origem estruturada do comentário. Use gestor para cobranças criadas pelo Gestor.';

CREATE TABLE IF NOT EXISTS public.pendencias_caixa (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  origem text NOT NULL CHECK (origem IN ('comentario', 'conversa')),
  pessoa_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  task_comment_id uuid REFERENCES public.task_comments(id) ON DELETE CASCADE,
  task_id uuid REFERENCES public.tarefas(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES public.atendimento_conversas(id) ON DELETE CASCADE,
  estado text NOT NULL DEFAULT 'aberta'
    CHECK (estado IN ('aberta', 'em_atendimento', 'resolvida')),
  resolution_kind text
    CHECK (resolution_kind IS NULL OR resolution_kind IN ('feito', 'respondido', 'nao_e_comigo')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  CHECK (
    (origem = 'comentario' AND task_comment_id IS NOT NULL AND task_id IS NOT NULL AND conversation_id IS NULL)
    OR
    (origem = 'conversa' AND conversation_id IS NOT NULL AND task_comment_id IS NULL AND task_id IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS pendencias_caixa_comentario_pessoa_uidx
  ON public.pendencias_caixa (task_comment_id, pessoa_id)
  WHERE origem = 'comentario';

CREATE UNIQUE INDEX IF NOT EXISTS pendencias_caixa_conversa_pessoa_uidx
  ON public.pendencias_caixa (conversation_id, pessoa_id)
  WHERE origem = 'conversa';

CREATE INDEX IF NOT EXISTS pendencias_caixa_pessoa_abertas_idx
  ON public.pendencias_caixa (pessoa_id, estado, last_activity_at DESC);

CREATE INDEX IF NOT EXISTS pendencias_caixa_resolvidas_idx
  ON public.pendencias_caixa (pessoa_id, resolved_at DESC)
  WHERE resolved_at IS NOT NULL;

COMMENT ON TABLE public.pendencias_caixa IS
  'Pendências pessoais da equipe: cobrança em tarefa ou conversa aguardando resposta.';

CREATE OR REPLACE FUNCTION public.caixa_conversa_precisa_resposta(
  p_conversa public.atendimento_conversas
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT
    p_conversa.status <> 'resolvido'
    AND (
      p_conversa.awaiting_response_since IS NOT NULL
      OR coalesce(
        CASE
          WHEN jsonb_typeof(p_conversa.group_ai_analysis -> 'needs_agency_response') = 'boolean'
            THEN (p_conversa.group_ai_analysis ->> 'needs_agency_response')::boolean
          ELSE false
        END,
        false
      )
    );
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

  -- Cobrança precisa ser explícita e vir do Josias/Gestor.
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
    WHERE p.role IN ('superadmin', 'admin', 'colaborador')
      AND p.id <> 'a9b2a0f6-053d-44d2-b5b0-3c0d823c4e91'::uuid
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
      AND p.role IN ('superadmin', 'admin', 'colaborador')
      AND p.id <> 'a9b2a0f6-053d-44d2-b5b0-3c0d823c4e91'::uuid
    ON CONFLICT (task_comment_id, pessoa_id) WHERE origem = 'comentario'
    DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS task_comments_criar_pendencias_caixa
  ON public.task_comments;
CREATE TRIGGER task_comments_criar_pendencias_caixa
AFTER INSERT OR UPDATE OF pendencia_caixa, origem
ON public.task_comments
FOR EACH ROW
WHEN (NEW.pendencia_caixa = true)
EXECUTE FUNCTION public.criar_pendencias_caixa_comentario();

CREATE OR REPLACE FUNCTION public.sincronizar_pendencia_caixa_conversa()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_precisa boolean := public.caixa_conversa_precisa_resposta(NEW);
  v_old_precisa boolean := false;
BEGIN
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

  IF NEW.assigned_to IS NULL THEN
    RETURN NEW;
  END IF;

  -- UUIDs sem profile/equipe nunca recebem uma caixa.
  IF NEW.assigned_to = 'a9b2a0f6-053d-44d2-b5b0-3c0d823c4e91'::uuid
     OR NOT EXISTS (
       SELECT 1
       FROM public.profiles p
       WHERE p.id = NEW.assigned_to
         AND p.role IN ('superadmin', 'admin', 'colaborador')
     ) THEN
    RETURN NEW;
  END IF;

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
      resolution_kind
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
      NULL
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
      resolution_kind = NULL;
  ELSE
    UPDATE public.pendencias_caixa
    SET
      estado = 'resolvida',
      resolution_kind = CASE
        WHEN v_old_precisa THEN 'respondido'
        ELSE coalesce(resolution_kind, 'respondido')
      END,
      resolved_at = coalesce(resolved_at, now()),
      updated_at = now(),
      last_activity_at = coalesce(NEW.last_message_at, now())
    WHERE origem = 'conversa'
      AND conversation_id = NEW.id
      AND pessoa_id = NEW.assigned_to
      AND resolved_at IS NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS atendimento_conversas_sincronizar_pendencia_caixa
  ON public.atendimento_conversas;
CREATE TRIGGER atendimento_conversas_sincronizar_pendencia_caixa
AFTER INSERT OR UPDATE OF
  assigned_to,
  awaiting_response_since,
  group_ai_analysis,
  status,
  last_message_at,
  last_message_preview
ON public.atendimento_conversas
FOR EACH ROW
EXECUTE FUNCTION public.sincronizar_pendencia_caixa_conversa();

-- Conversas atualmente atribuídas e aguardando resposta entram imediatamente.
INSERT INTO public.pendencias_caixa (
  origem,
  pessoa_id,
  conversation_id,
  estado,
  created_at,
  updated_at,
  last_activity_at
)
SELECT
  'conversa',
  c.assigned_to,
  c.id,
  CASE WHEN c.status = 'em_atendimento' THEN 'em_atendimento' ELSE 'aberta' END,
  coalesce(c.awaiting_response_since, c.last_message_at, now()),
  now(),
  coalesce(c.last_message_at, c.awaiting_response_since, now())
FROM public.atendimento_conversas c
JOIN public.profiles p ON p.id = c.assigned_to
WHERE c.assigned_to IS NOT NULL
  AND c.assigned_to <> 'a9b2a0f6-053d-44d2-b5b0-3c0d823c4e91'::uuid
  AND p.role IN ('superadmin', 'admin', 'colaborador')
  AND public.caixa_conversa_precisa_resposta(c)
ON CONFLICT (conversation_id, pessoa_id) WHERE origem = 'conversa'
DO UPDATE SET
  estado = EXCLUDED.estado,
  updated_at = now(),
  last_activity_at = EXCLUDED.last_activity_at,
  resolved_at = NULL,
  resolved_by = NULL,
  resolution_kind = NULL;

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
      client.empresa
    FROM public.pendencias_caixa p
    LEFT JOIN public.tarefas t ON t.id = p.task_id
    LEFT JOIN public.task_comments tc ON tc.id = p.task_comment_id
    LEFT JOIN public.profiles comment_author ON comment_author.id = tc.user_id
    LEFT JOIN public.atendimento_conversas c ON c.id = p.conversation_id
    LEFT JOIN public.clientes client ON client.id = coalesce(t.client_id, c.cliente_id)
    WHERE p.pessoa_id = v_target
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
  IF p_acao NOT IN ('estou_nisso', 'feito', 'nao_e_comigo') THEN
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

ALTER TABLE public.pendencias_caixa ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pendencias_caixa_select_own ON public.pendencias_caixa;
CREATE POLICY pendencias_caixa_select_own
ON public.pendencias_caixa
FOR SELECT TO authenticated
USING (
  pessoa_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role IN ('superadmin', 'admin')
  )
);

REVOKE ALL ON FUNCTION public.listar_pendencias_caixa(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.listar_pendencias_caixa(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.agir_pendencia_caixa(uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.agir_pendencia_caixa(uuid, text, uuid) TO authenticated, service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'pendencias_caixa'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.pendencias_caixa;
  END IF;
END $$;

-- Cérebro IA, primeira versão: consulta, proposta e memória confirmada.
-- Aplicar uma vez, só com autorização. Não reaplicar.
-- Não cria cron, fila, WhatsApp nem CAPI.
-- A agência não tem tabela de organização; o vínculo é a chave jbapex.

BEGIN;

CREATE TABLE IF NOT EXISTS public.brain_settings (
  id text PRIMARY KEY CHECK (id = 'jbapex'),
  ativo boolean NOT NULL DEFAULT false,
  piloto_cliente_ids uuid[] NOT NULL DEFAULT '{}',
  decision_owner_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  max_etapas integer NOT NULL DEFAULT 8 CHECK (max_etapas BETWEEN 1 AND 30),
  max_agentes integer NOT NULL DEFAULT 3 CHECK (max_agentes BETWEEN 1 AND 8),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

INSERT INTO public.brain_settings (id)
VALUES ('jbapex')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.brain_agents (
  id text PRIMARY KEY CHECK (id IN ('central', 'clientes', 'operacao')),
  funcao text NOT NULL,
  instrucoes_versao text NOT NULL,
  instrucoes text NOT NULL,
  ferramentas text[] NOT NULL,
  acesso_memoria text[] NOT NULL,
  nivel text NOT NULL CHECK (nivel IN ('consultar', 'propor')),
  ativo boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.brain_agents (id, funcao, instrucoes_versao, instrucoes, ferramentas, acesso_memoria, nivel, ativo)
VALUES
  (
    'central',
    'Interpretar o pedido, recuperar o contexto permitido e consolidar a resposta.',
    '2026-10-08.1',
    'Responda só com registros e com regras confirmadas. Não invente responsável, prazo ou compromisso. Não execute alteração.',
    ARRAY['consultar_contexto', 'consolidar_resposta'],
    ARRAY['agencia', 'cliente', 'agente', 'usuario'],
    'consultar',
    false
  ),
  (
    'clientes',
    'Conferir reuniões, notas e briefings contra projetos e tarefas do cliente.',
    '2026-10-08.1',
    'Separe ideia, pedido, aprovação e cancelamento. Proponha tarefa só para aprovação sem vínculo. A mesma fonte não gera outra proposta.',
    ARRAY['ler_alinhamentos', 'comparar_tarefas', 'propor_tarefa'],
    ARRAY['agencia', 'cliente'],
    'propor',
    false
  ),
  (
    'operacao',
    'Acompanhar responsáveis, prazos, impedimentos e a cobertura das entregas previstas.',
    '2026-10-08.1',
    'O estado da tarefa é o do Planeje no momento da consulta. Sem responsável, prazo ou evidência, mostre o campo pendente.',
    ARRAY['ler_tarefas', 'listar_bloqueios', 'propor_cobertura'],
    ARRAY['agencia', 'cliente'],
    'propor',
    false
  )
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.brain_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitante_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  cliente_id uuid REFERENCES public.clientes(id) ON DELETE SET NULL,
  projeto_id uuid,
  conversation_id uuid REFERENCES public.assistant_project_conversations(id) ON DELETE SET NULL,
  pergunta text NOT NULL,
  agentes text[] NOT NULL DEFAULT '{}',
  estado text NOT NULL CHECK (estado IN ('inativo', 'em_fila', 'executando', 'aguardando_decisao', 'concluido', 'falhou')),
  gatilho text NOT NULL DEFAULT 'chat',
  etapas integer NOT NULL DEFAULT 0,
  consumo jsonb NOT NULL DEFAULT '{}'::jsonb,
  resultado jsonb NOT NULL DEFAULT '{}'::jsonb,
  fontes jsonb NOT NULL DEFAULT '[]'::jsonb,
  proximo_passo text,
  instrucao_ignorada boolean NOT NULL DEFAULT false,
  iniciado_em timestamptz NOT NULL DEFAULT now(),
  concluido_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS brain_runs_solicitante_idx
  ON public.brain_runs (solicitante_id, created_at DESC);
CREATE INDEX IF NOT EXISTS brain_runs_cliente_estado_idx
  ON public.brain_runs (cliente_id, estado, created_at DESC);

CREATE TABLE IF NOT EXISTS public.brain_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.brain_runs(id) ON DELETE CASCADE,
  agente_id text NOT NULL,
  ferramenta text NOT NULL,
  argumentos jsonb NOT NULL DEFAULT '{}'::jsonb,
  alvo_tipo text,
  alvo_id text,
  autorizador_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  executor_agente_id text,
  versao_esperada text,
  dedupe_key text,
  estado text NOT NULL CHECK (estado IN ('proposta', 'consultada', 'recusada', 'invalidada', 'falhou', 'incerta')),
  resultado jsonb NOT NULL DEFAULT '{}'::jsonb,
  justificativa text,
  pendencias jsonb NOT NULL DEFAULT '[]'::jsonb,
  fonte jsonb,
  precisa_decisao boolean NOT NULL DEFAULT true,
  caixa_thread_id uuid REFERENCES public.caixa_dot_threads(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS brain_actions_proposta_dedupe_idx
  ON public.brain_actions (dedupe_key)
  WHERE estado = 'proposta' AND dedupe_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS brain_actions_run_idx
  ON public.brain_actions (run_id, created_at);

CREATE TABLE IF NOT EXISTS public.brain_alignment_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid REFERENCES public.brain_runs(id) ON DELETE CASCADE,
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  fonte_tipo text NOT NULL,
  fonte_id text NOT NULL,
  fonte_titulo text,
  texto text NOT NULL,
  texto_norm text NOT NULL,
  classe text NOT NULL CHECK (classe IN ('ideia', 'pedido', 'aprovacao', 'cancelamento')),
  tarefa_id uuid REFERENCES public.tarefas(id) ON DELETE SET NULL,
  material_id text,
  estado text NOT NULL CHECK (estado IN ('vinculado', 'proposta', 'hipotese', 'revisao', 'cancelado', 'duplicado')),
  confianca text NOT NULL CHECK (confianca IN ('alta', 'duvidosa')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT brain_alignment_fonte_texto_key UNIQUE (cliente_id, fonte_id, texto_norm)
);

CREATE INDEX IF NOT EXISTS brain_alignment_cliente_idx
  ON public.brain_alignment_items (cliente_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.brain_memories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL CHECK (tipo IN ('fato', 'regra', 'hipotese')),
  escopo text NOT NULL CHECK (escopo IN ('agencia', 'cliente', 'projeto', 'agente', 'usuario')),
  cliente_id uuid REFERENCES public.clientes(id) ON DELETE CASCADE,
  projeto_id uuid,
  agente_id text,
  owner_user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  conteudo jsonb NOT NULL,
  resumo text NOT NULL,
  fonte jsonb,
  visibilidade text NOT NULL DEFAULT 'equipe' CHECK (visibilidade IN ('equipe', 'privado', 'financeiro', 'rh')),
  valido_de timestamptz,
  valido_ate timestamptz,
  versao integer NOT NULL DEFAULT 1 CHECK (versao >= 1),
  substitui_id uuid REFERENCES public.brain_memories(id) ON DELETE SET NULL,
  estado text NOT NULL CHECK (estado IN ('vigente', 'substituida', 'revogada', 'conflito')),
  autor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  validador_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  chave text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS brain_memories_vigente_chave_idx
  ON public.brain_memories (
    escopo,
    COALESCE(cliente_id, '00000000-0000-0000-0000-000000000000'::uuid),
    chave
  )
  WHERE estado = 'vigente' AND chave IS NOT NULL;
CREATE INDEX IF NOT EXISTS brain_memories_cliente_idx
  ON public.brain_memories (cliente_id, estado, created_at DESC);

CREATE TABLE IF NOT EXISTS public.brain_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid REFERENCES public.brain_runs(id) ON DELETE SET NULL,
  memoria_id uuid REFERENCES public.brain_memories(id) ON DELETE SET NULL,
  memoria_proposta_id uuid REFERENCES public.brain_memories(id) ON DELETE SET NULL,
  usuario_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  correcao text NOT NULL,
  motivo text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS brain_feedback_memoria_idx
  ON public.brain_feedback (memoria_id, created_at DESC);

COMMENT ON TABLE public.brain_settings IS 'Piloto do Cérebro. Nasce desligado. A agência é a chave jbapex.';
COMMENT ON TABLE public.brain_memories IS 'Fato, regra ou hipótese com fonte, versão e escopo. O estado da tarefa continua em tarefas.';
COMMENT ON TABLE public.brain_actions IS 'Proposta consultada. Esta versão não grava o estado executada.';

CREATE OR REPLACE FUNCTION public.brain_is_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.status = 'active'
      AND p.role IN ('superadmin', 'admin', 'colaborador')
  );
$$;

CREATE OR REPLACE FUNCTION public.brain_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.status = 'active'
      AND p.role IN ('superadmin', 'admin')
  );
$$;

CREATE OR REPLACE FUNCTION public.brain_can_client(p_cliente uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_cliente IS NULL
    OR public.brain_is_admin()
    OR EXISTS (
      SELECT 1 FROM public.clientes c
      WHERE c.id = p_cliente
        AND c.responsavel::text = auth.uid()::text
    )
    OR EXISTS (
      SELECT 1 FROM public.tarefas t
      WHERE t.client_id = p_cliente
        AND auth.uid() = ANY (coalesce(t.assignee_ids, '{}'::uuid[]))
    );
$$;

CREATE OR REPLACE FUNCTION public.brain_owns_run(p_run uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.brain_runs r
    WHERE r.id = p_run
      AND (r.solicitante_id = auth.uid() OR public.brain_is_admin())
  );
$$;

REVOKE ALL ON FUNCTION public.brain_is_staff() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.brain_is_admin() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.brain_can_client(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.brain_owns_run(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.brain_is_staff() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.brain_is_admin() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.brain_can_client(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.brain_owns_run(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.brain_memory_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.conteudo IS DISTINCT FROM OLD.conteudo THEN
    RAISE EXCEPTION 'Correção grava uma versão nova.' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.cliente_id IS DISTINCT FROM OLD.cliente_id THEN
    RAISE EXCEPTION 'A memória permanece no mesmo cliente.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS brain_memory_guard ON public.brain_memories;
CREATE TRIGGER brain_memory_guard
BEFORE UPDATE ON public.brain_memories
FOR EACH ROW
EXECUTE FUNCTION public.brain_memory_guard();

CREATE OR REPLACE FUNCTION public.brain_actions_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.ferramenta IS DISTINCT FROM OLD.ferramenta
     OR NEW.argumentos IS DISTINCT FROM OLD.argumentos
     OR NEW.dedupe_key IS DISTINCT FROM OLD.dedupe_key
     OR NEW.executor_agente_id IS DISTINCT FROM OLD.executor_agente_id
     OR NEW.autorizador_id IS DISTINCT FROM OLD.autorizador_id
  THEN
    RAISE EXCEPTION 'A proposta não muda ferramenta, argumentos nem autorizador por esta via.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS brain_actions_guard ON public.brain_actions;
CREATE TRIGGER brain_actions_guard
BEFORE UPDATE ON public.brain_actions
FOR EACH ROW
EXECUTE FUNCTION public.brain_actions_guard();

ALTER TABLE public.brain_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brain_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brain_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brain_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brain_alignment_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brain_memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brain_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS brain_settings_select ON public.brain_settings;
CREATE POLICY brain_settings_select ON public.brain_settings
FOR SELECT TO authenticated
USING (public.brain_is_staff());

DROP POLICY IF EXISTS brain_settings_update ON public.brain_settings;
CREATE POLICY brain_settings_update ON public.brain_settings
FOR UPDATE TO authenticated
USING (public.brain_is_admin())
WITH CHECK (public.brain_is_admin());

DROP POLICY IF EXISTS brain_agents_select ON public.brain_agents;
CREATE POLICY brain_agents_select ON public.brain_agents
FOR SELECT TO authenticated
USING (public.brain_is_staff());

DROP POLICY IF EXISTS brain_agents_update ON public.brain_agents;
CREATE POLICY brain_agents_update ON public.brain_agents
FOR UPDATE TO authenticated
USING (public.brain_is_admin())
WITH CHECK (public.brain_is_admin());

DROP POLICY IF EXISTS brain_runs_select ON public.brain_runs;
CREATE POLICY brain_runs_select ON public.brain_runs
FOR SELECT TO authenticated
USING (
  public.brain_is_staff()
  AND (solicitante_id = auth.uid() OR public.brain_is_admin())
  AND (cliente_id IS NULL OR public.brain_can_client(cliente_id))
);

DROP POLICY IF EXISTS brain_runs_insert ON public.brain_runs;
CREATE POLICY brain_runs_insert ON public.brain_runs
FOR INSERT TO authenticated
WITH CHECK (
  public.brain_is_staff()
  AND solicitante_id = auth.uid()
  AND (cliente_id IS NULL OR public.brain_can_client(cliente_id))
);

DROP POLICY IF EXISTS brain_actions_select ON public.brain_actions;
CREATE POLICY brain_actions_select ON public.brain_actions
FOR SELECT TO authenticated
USING (public.brain_owns_run(run_id));

DROP POLICY IF EXISTS brain_actions_insert ON public.brain_actions;
CREATE POLICY brain_actions_insert ON public.brain_actions
FOR INSERT TO authenticated
WITH CHECK (public.brain_owns_run(run_id) AND autorizador_id IS NULL);

DROP POLICY IF EXISTS brain_actions_update ON public.brain_actions;
CREATE POLICY brain_actions_update ON public.brain_actions
FOR UPDATE TO authenticated
USING (public.brain_owns_run(run_id))
WITH CHECK (public.brain_owns_run(run_id) AND autorizador_id IS NULL);

DROP POLICY IF EXISTS brain_alignment_select ON public.brain_alignment_items;
CREATE POLICY brain_alignment_select ON public.brain_alignment_items
FOR SELECT TO authenticated
USING (public.brain_is_staff() AND public.brain_can_client(cliente_id));

DROP POLICY IF EXISTS brain_alignment_insert ON public.brain_alignment_items;
CREATE POLICY brain_alignment_insert ON public.brain_alignment_items
FOR INSERT TO authenticated
WITH CHECK (
  public.brain_is_staff()
  AND public.brain_can_client(cliente_id)
  AND (run_id IS NULL OR public.brain_owns_run(run_id))
);

DROP POLICY IF EXISTS brain_memories_select ON public.brain_memories;
CREATE POLICY brain_memories_select ON public.brain_memories
FOR SELECT TO authenticated
USING (
  public.brain_is_staff()
  AND (cliente_id IS NULL OR public.brain_can_client(cliente_id))
  AND (
    visibilidade = 'equipe'
    OR (visibilidade = 'privado' AND (owner_user_id = auth.uid() OR public.brain_is_admin()))
    OR (visibilidade IN ('financeiro', 'rh') AND public.brain_is_admin())
  )
  AND (escopo <> 'usuario' OR owner_user_id = auth.uid() OR public.brain_is_admin())
);

DROP POLICY IF EXISTS brain_memories_insert ON public.brain_memories;
CREATE POLICY brain_memories_insert ON public.brain_memories
FOR INSERT TO authenticated
WITH CHECK (
  public.brain_is_staff()
  AND autor_id = auth.uid()
  AND validador_id = auth.uid()
  AND (cliente_id IS NULL OR public.brain_can_client(cliente_id))
  AND (
    (visibilidade IN ('equipe', 'privado') AND (visibilidade <> 'privado' OR owner_user_id = auth.uid()))
    OR (visibilidade IN ('financeiro', 'rh') AND public.brain_is_admin())
  )
);

DROP POLICY IF EXISTS brain_memories_update ON public.brain_memories;
CREATE POLICY brain_memories_update ON public.brain_memories
FOR UPDATE TO authenticated
USING (public.brain_is_admin() OR autor_id = auth.uid())
WITH CHECK (public.brain_is_admin() OR autor_id = auth.uid());

DROP POLICY IF EXISTS brain_feedback_select ON public.brain_feedback;
CREATE POLICY brain_feedback_select ON public.brain_feedback
FOR SELECT TO authenticated
USING (usuario_id = auth.uid() OR public.brain_is_admin());

DROP POLICY IF EXISTS brain_feedback_insert ON public.brain_feedback;
CREATE POLICY brain_feedback_insert ON public.brain_feedback
FOR INSERT TO authenticated
WITH CHECK (public.brain_is_staff() AND usuario_id = auth.uid());

REVOKE ALL ON public.brain_settings, public.brain_agents, public.brain_runs, public.brain_actions,
  public.brain_alignment_items, public.brain_memories, public.brain_feedback
  FROM PUBLIC, anon;

GRANT SELECT, UPDATE ON public.brain_settings TO authenticated;
GRANT SELECT, UPDATE ON public.brain_agents TO authenticated;
GRANT SELECT, INSERT ON public.brain_runs TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.brain_actions TO authenticated;
GRANT SELECT, INSERT ON public.brain_alignment_items TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.brain_memories TO authenticated;
GRANT SELECT, INSERT ON public.brain_feedback TO authenticated;

GRANT ALL ON public.brain_settings, public.brain_agents, public.brain_runs, public.brain_actions,
  public.brain_alignment_items, public.brain_memories, public.brain_feedback
  TO service_role;

COMMIT;

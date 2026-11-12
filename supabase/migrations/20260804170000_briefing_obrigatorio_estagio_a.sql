-- ============================================================
-- Briefing Obrigatório v1.1 — estágio A
-- Sem constraint NOT NULL; sem bloqueio de atribuição/conclusão.
-- ============================================================

-- 1) Configuração (briefing_stage A|B|C)
CREATE TABLE IF NOT EXISTS public.planeje_config (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid NULL
);

CREATE TABLE IF NOT EXISTS public.planeje_config_log (
  id bigserial PRIMARY KEY,
  key text NOT NULL,
  old_value text,
  new_value text NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  changed_by uuid NULL
);

INSERT INTO public.planeje_config (key, value)
VALUES ('briefing_stage', 'A')
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.planeje_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.planeje_config_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS planeje_config_select ON public.planeje_config;
CREATE POLICY planeje_config_select ON public.planeje_config
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS planeje_config_log_select ON public.planeje_config_log;
CREATE POLICY planeje_config_log_select ON public.planeje_config_log
  FOR SELECT TO authenticated USING (true);

GRANT SELECT ON public.planeje_config TO authenticated, service_role;
GRANT SELECT ON public.planeje_config_log TO authenticated, service_role;
GRANT ALL ON public.planeje_config TO service_role;
GRANT ALL ON public.planeje_config_log TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.planeje_config_log_id_seq TO service_role;

-- 2) Colunas em tarefas (nomes reais confirmados: public.tarefas)
ALTER TABLE public.tarefas
  ADD COLUMN IF NOT EXISTS briefing_estado text NOT NULL DEFAULT 'rascunho',
  ADD COLUMN IF NOT EXISTS briefing_completo boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS briefing_legado boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS briefing_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS briefing_validado_em timestamptz NULL;

COMMENT ON COLUMN public.tarefas.briefing_estado IS 'rascunho | completo';
COMMENT ON COLUMN public.tarefas.briefing_completo IS 'Derivado: true só se briefing válido e estado=completo (ou legado com description)';
COMMENT ON COLUMN public.tarefas.briefing_legado IS 'true = criada antes do deploy do briefing; exige só description';
COMMENT ON COLUMN public.tarefas.briefing_payload IS 'Campos estruturados do briefing (sem senhas/tokens)';

-- 3) Histórico anterior ao deploy = legado (idempotente via cutoff)
INSERT INTO public.planeje_config (key, value)
VALUES ('briefing_legado_cutoff', now()::text)
ON CONFLICT (key) DO NOTHING;

UPDATE public.tarefas t
SET
  briefing_legado = true,
  briefing_estado = CASE
    WHEN coalesce(btrim(t.description), '') <> '' THEN 'completo'
    ELSE 'rascunho'
  END,
  briefing_completo = (coalesce(btrim(t.description), '') <> ''),
  briefing_validado_em = coalesce(t.briefing_validado_em, now())
FROM public.planeje_config cfg
WHERE cfg.key = 'briefing_legado_cutoff'
  AND t.created_at <= cfg.value::timestamptz
  AND t.briefing_legado = false;

-- 4) Helpers
CREATE OR REPLACE FUNCTION public.get_briefing_stage()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(
    (SELECT value FROM public.planeje_config WHERE key = 'briefing_stage'),
    'A'
  );
$$;

CREATE OR REPLACE FUNCTION public.tarefa_briefing_isenta(p_type text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(coalesce(p_type, '')) IN (
    'trafego_recorrente', 'paid_traffic', 'trafego',
    'reuniao', 'reunião',
    'financeiro', 'interno', 'administrativo', 'onboarding'
  );
$$;

CREATE OR REPLACE FUNCTION public.tarefa_conta_como_planejada(
  p_type text,
  p_legado boolean,
  p_completo boolean
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT coalesce(p_legado, false)
      OR coalesce(p_completo, false)
      OR public.tarefa_briefing_isenta(p_type);
$$;

-- Recusa estágio B/C se precondições não cumpridas
CREATE OR REPLACE FUNCTION public.set_briefing_stage(
  p_stage text,
  p_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old text;
  v_stage text := upper(btrim(p_stage));
  v_pending int;
  v_orfaos int;
  v_cobertura numeric;
BEGIN
  IF v_stage NOT IN ('A', 'B', 'C') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'stage inválido (A|B|C)');
  END IF;

  SELECT value INTO v_old FROM public.planeje_config WHERE key = 'briefing_stage';

  IF v_stage IN ('B', 'C') THEN
    SELECT count(*) INTO v_pending
    FROM public.profiles
    WHERE role IN ('superadmin', 'admin', 'colaborador')
      AND status = 'pending';

    SELECT count(*) INTO v_orfaos
    FROM public.clientes c
    WHERE c.etapa = 'closed'
      AND (
        c.responsavel IS NULL
        OR btrim(c.responsavel) = ''
        OR NOT EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id::text = btrim(c.responsavel)
            AND coalesce(p.role, '') <> 'cliente'
            AND p.status = 'active'
        )
      );

    IF v_pending > 0 OR v_orfaos > 0 THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'Pré-condições do estágio B/C não cumpridas',
        'perfis_pending', v_pending,
        'clientes_sem_responsavel_ativo', v_orfaos
      );
    END IF;
  END IF;

  IF v_stage = 'C' THEN
    SELECT cobertura_geral INTO v_cobertura
    FROM public.resumo_cobertura_agregado(
      (date_trunc('month', current_date) - interval '1 month')::date,
      false
    );
    IF coalesce(v_cobertura, 0) < 0.60 THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'Estágio C exige cobertura ≥ 60% em um mês fechado',
        'cobertura_mes_anterior', v_cobertura
      );
    END IF;
  END IF;

  INSERT INTO public.planeje_config (key, value, updated_at, updated_by)
  VALUES ('briefing_stage', v_stage, now(), p_user_id)
  ON CONFLICT (key) DO UPDATE
    SET value = excluded.value,
        updated_at = excluded.updated_at,
        updated_by = excluded.updated_by;

  INSERT INTO public.planeje_config_log (key, old_value, new_value, changed_by)
  VALUES ('briefing_stage', v_old, v_stage, p_user_id);

  RETURN jsonb_build_object('ok', true, 'stage', v_stage, 'old', v_old);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_briefing_stage() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_briefing_stage(text, uuid) TO authenticated, service_role;

-- 5) RPCs de cobertura atualizadas (rascunho não conta em planejado)
-- DROP necessário: RETURNS TABLE mudou (novas colunas)
DROP FUNCTION IF EXISTS public.resumo_cobertura_agregado(date, boolean);
DROP FUNCTION IF EXISTS public.resumo_cobertura_mensal(date, boolean);

CREATE OR REPLACE FUNCTION public.resumo_cobertura_mensal(
  p_mes date DEFAULT current_date,
  p_exigir_responsavel_ativo boolean DEFAULT false
)
RETURNS TABLE (
  cliente_id               uuid,
  empresa                  text,
  tier                     text,
  valor                    numeric,
  tipo_servico_norm        text,
  plano_id                 uuid,
  tem_plano_mes            boolean,
  responsavel_id           uuid,
  responsavel_nome         text,
  responsavel_existe       boolean,
  responsavel_ativo        boolean,
  responsavel_valido       boolean,
  contratado               integer,
  planejado                integer,
  planejado_no_plano       integer,
  improviso                integer,
  planejado_com_briefing   integer,
  planejado_rascunho       integer,
  entregue                 integer,
  atrasadas                integer,
  sem_briefing             integer,
  briefing_completude_pct  numeric,
  cobertura_pct            numeric,
  status_cobertura         text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
WITH
periodo AS (
  SELECT
    date_trunc('month', p_mes)::date AS inicio,
    (date_trunc('month', p_mes) + interval '1 month - 1 day')::date AS fim,
    date_trunc('month', p_mes)::date AS mes_ref
),
ativos AS (
  SELECT
    c.id,
    c.empresa,
    c.valor,
    c.responsavel,
    CASE
      WHEN lower(btrim(coalesce(c.tipo_servico, ''))) IN
           ('execucao_completa', 'execução_completa', 'execucao completa')
        THEN 'execucao_completa'
      WHEN lower(btrim(coalesce(c.tipo_servico, ''))) LIKE '%social%'
        THEN 'social_apenas'
      WHEN lower(btrim(coalesce(c.tipo_servico, ''))) LIKE '%tr%fego%'
        THEN 'trafego_apenas'
      WHEN lower(btrim(coalesce(c.tipo_contrato, ''))) ~ '(ads|google|meta)'
           AND coalesce((coalesce(c.entregaveis, '{}'::jsonb) ->> 'posts')::int, 0)
             + coalesce((coalesce(c.entregaveis, '{}'::jsonb) ->> 'videos')::int, 0)
             + coalesce((coalesce(c.entregaveis, '{}'::jsonb) ->> 'stories')::int, 0)
             + coalesce((coalesce(c.entregaveis, '{}'::jsonb) ->> 'anuncios')::int, 0)
             + coalesce((coalesce(c.entregaveis, '{}'::jsonb) ->> 'carrosseis')::int, 0) = 0
        THEN 'trafego_apenas'
      ELSE 'indefinido'
    END AS tipo_servico_norm,
    coalesce((coalesce(c.entregaveis, '{}'::jsonb) ->> 'posts')::int, 0)
  + coalesce((coalesce(c.entregaveis, '{}'::jsonb) ->> 'videos')::int, 0)
  + coalesce((coalesce(c.entregaveis, '{}'::jsonb) ->> 'stories')::int, 0)
  + coalesce((coalesce(c.entregaveis, '{}'::jsonb) ->> 'anuncios')::int, 0)
  + coalesce((coalesce(c.entregaveis, '{}'::jsonb) ->> 'carrosseis')::int, 0)
      AS contratado
  FROM public.clientes c
  WHERE c.etapa = 'closed'
),
plano AS (
  SELECT DISTINCT ON (v.cliente_id)
    v.cliente_id,
    v.plano_id
  FROM public.v_plano_mensal v
  CROSS JOIN periodo p
  WHERE v.mes_referencia = p.mes_ref
  ORDER BY v.cliente_id, v.plano_id
),
tarefas_mes AS (
  SELECT
    t.client_id,
    count(*) FILTER (
      WHERE public.tarefa_conta_como_planejada(t.type, t.briefing_legado, t.briefing_completo)
    )::int AS planejado,
    count(*) FILTER (
      WHERE public.tarefa_conta_como_planejada(t.type, t.briefing_legado, t.briefing_completo)
        AND t.project_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.v_plano_mensal vp
          CROSS JOIN periodo p2
          WHERE vp.plano_id = t.project_id
            AND vp.cliente_id = t.client_id
            AND vp.mes_referencia = p2.mes_ref
        )
    )::int AS planejado_no_plano,
    count(*) FILTER (
      WHERE coalesce(t.briefing_completo, false)
        AND public.tarefa_conta_como_planejada(t.type, t.briefing_legado, t.briefing_completo)
    )::int AS planejado_com_briefing,
    count(*) FILTER (
      WHERE NOT public.tarefa_conta_como_planejada(t.type, t.briefing_legado, t.briefing_completo)
    )::int AS planejado_rascunho,
    count(*) FILTER (WHERE t.status = 'completed')::int AS entregue,
    count(*) FILTER (
      WHERE t.status IS DISTINCT FROM 'completed'
        AND t.due_date < current_date
        AND public.tarefa_conta_como_planejada(t.type, t.briefing_legado, t.briefing_completo)
    )::int AS atrasadas,
    -- sem briefing = planejada do mês sem briefing completo (conteúdo, não isento)
    count(*) FILTER (
      WHERE public.tarefa_conta_como_planejada(t.type, t.briefing_legado, t.briefing_completo)
        AND NOT coalesce(t.briefing_completo, false)
        AND NOT public.tarefa_briefing_isenta(t.type)
        AND lower(coalesce(t.type, '')) IN (
          'arte', 'video', 'carrossel', 'vídeo', 'social_media', 'reels', 'story', 'stories', 'post'
        )
    )::int AS sem_briefing
  FROM public.tarefas t
  CROSS JOIN periodo p
  WHERE t.client_id IS NOT NULL
    AND t.due_date BETWEEN p.inicio AND p.fim
  GROUP BY t.client_id
),
base AS (
  SELECT
    a.id,
    a.empresa,
    a.valor,
    a.tipo_servico_norm,
    a.contratado,
    a.responsavel,
    m.id AS responsavel_uuid,
    pl.plano_id,
    (pl.plano_id IS NOT NULL) AS tem_plano_mes,
    (m.id IS NOT NULL AND coalesce(m.role, '') <> 'cliente') AS responsavel_existe,
    (m.id IS NOT NULL AND coalesce(m.role, '') <> 'cliente' AND m.status = 'active') AS responsavel_ativo,
    m.full_name,
    coalesce(t.planejado, 0) AS planejado,
    coalesce(t.planejado_no_plano, 0) AS planejado_no_plano,
    coalesce(t.planejado_com_briefing, 0) AS planejado_com_briefing,
    coalesce(t.planejado_rascunho, 0) AS planejado_rascunho,
    coalesce(t.entregue, 0) AS entregue,
    coalesce(t.atrasadas, 0) AS atrasadas,
    coalesce(t.sem_briefing, 0) AS sem_briefing,
    CASE
      WHEN coalesce(t.planejado, 0) = 0 THEN NULL
      ELSE round(coalesce(t.planejado_com_briefing, 0)::numeric / t.planejado, 2)
    END AS briefing_completude_pct,
    CASE
      WHEN a.tipo_servico_norm = 'trafego_apenas' THEN NULL
      WHEN a.contratado = 0 THEN NULL
      ELSE round(coalesce(t.planejado, 0)::numeric / a.contratado, 2)
    END AS cobertura_pct
  FROM ativos a
  LEFT JOIN tarefas_mes t ON t.client_id = a.id
  LEFT JOIN plano pl ON pl.cliente_id = a.id
  LEFT JOIN public.profiles m ON m.id::text = nullif(btrim(a.responsavel), '')
)
SELECT
  b.id AS cliente_id,
  b.empresa,
  CASE
    WHEN b.valor IS NULL THEN '—'
    WHEN b.valor >= 2000 THEN 'A'
    WHEN b.valor >= 1500 THEN 'B'
    ELSE 'C'
  END AS tier,
  b.valor,
  b.tipo_servico_norm,
  b.plano_id,
  b.tem_plano_mes,
  b.responsavel_uuid AS responsavel_id,
  CASE
    WHEN b.responsavel_existe AND b.responsavel_ativo THEN b.full_name
    WHEN b.responsavel_existe THEN b.full_name || ' (cadastro pendente)'
    ELSE 'SEM RESPONSÁVEL VÁLIDO'
  END AS responsavel_nome,
  b.responsavel_existe,
  b.responsavel_ativo,
  CASE
    WHEN p_exigir_responsavel_ativo THEN b.responsavel_ativo
    ELSE b.responsavel_existe
  END AS responsavel_valido,
  b.contratado,
  b.planejado,
  b.planejado_no_plano,
  greatest(b.planejado - b.planejado_no_plano, 0) AS improviso,
  b.planejado_com_briefing,
  b.planejado_rascunho,
  b.entregue,
  b.atrasadas,
  b.sem_briefing,
  b.briefing_completude_pct,
  b.cobertura_pct,
  CASE
    WHEN b.tipo_servico_norm = 'trafego_apenas' THEN 'nao_aplicavel'
    WHEN b.contratado = 0 THEN 'sem_escopo'
    WHEN b.cobertura_pct >= 1.0 THEN 'coberto'
    WHEN b.cobertura_pct >= 0.6 THEN 'parcial'
    ELSE 'descoberto'
  END AS status_cobertura
FROM base b
ORDER BY
  CASE
    WHEN b.tipo_servico_norm = 'trafego_apenas' THEN 4
    WHEN b.contratado = 0 THEN 3
    WHEN coalesce(b.cobertura_pct, 0) < 0.6 THEN 0
    WHEN coalesce(b.cobertura_pct, 0) < 1.0 THEN 1
    ELSE 2
  END,
  b.valor DESC NULLS LAST;
$$;

CREATE OR REPLACE FUNCTION public.resumo_cobertura_agregado(
  p_mes date DEFAULT current_date,
  p_exigir_responsavel_ativo boolean DEFAULT false
)
RETURNS TABLE (
  mes_referencia            date,
  clientes_ativos           integer,
  clientes_conteudo         integer,
  contratado_total          integer,
  planejado_total           integer,
  planejado_no_plano_total  integer,
  improviso_total           integer,
  planejado_com_briefing_total integer,
  planejado_rascunho_total  integer,
  entregue_total            integer,
  cobertura_geral           numeric,
  briefing_completude_pct   numeric,
  qtd_descoberto            integer,
  qtd_parcial               integer,
  qtd_coberto               integer,
  qtd_sem_escopo            integer,
  qtd_nao_aplicavel         integer,
  qtd_sem_plano             integer,
  atrasadas_total           integer,
  sem_briefing_total        integer,
  legadas_abertas_total     integer,
  clientes_sem_responsavel  integer,
  fee_sem_responsavel       numeric,
  gate_liberado             boolean,
  briefing_stage            text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
WITH r AS (
  SELECT * FROM public.resumo_cobertura_mensal(p_mes, p_exigir_responsavel_ativo)
),
periodo AS (
  SELECT
    date_trunc('month', p_mes)::date AS inicio,
    (date_trunc('month', p_mes) + interval '1 month - 1 day')::date AS fim
),
legadas AS (
  SELECT count(*)::int AS n
  FROM public.tarefas t
  CROSS JOIN periodo p
  WHERE coalesce(t.briefing_legado, false)
    AND t.status IS DISTINCT FROM 'completed'
    AND t.due_date BETWEEN p.inicio AND p.fim
)
SELECT
  date_trunc('month', p_mes)::date,
  count(*)::int,
  count(*) FILTER (WHERE status_cobertura <> 'nao_aplicavel')::int,
  coalesce(sum(contratado) FILTER (WHERE status_cobertura <> 'nao_aplicavel'), 0)::int,
  coalesce(sum(planejado) FILTER (WHERE status_cobertura <> 'nao_aplicavel'), 0)::int,
  coalesce(sum(planejado_no_plano) FILTER (WHERE status_cobertura <> 'nao_aplicavel'), 0)::int,
  coalesce(sum(improviso) FILTER (WHERE status_cobertura <> 'nao_aplicavel'), 0)::int,
  coalesce(sum(planejado_com_briefing) FILTER (WHERE status_cobertura <> 'nao_aplicavel'), 0)::int,
  coalesce(sum(planejado_rascunho) FILTER (WHERE status_cobertura <> 'nao_aplicavel'), 0)::int,
  coalesce(sum(entregue) FILTER (WHERE status_cobertura <> 'nao_aplicavel'), 0)::int,
  CASE
    WHEN coalesce(sum(contratado) FILTER (WHERE status_cobertura <> 'nao_aplicavel'), 0) = 0 THEN NULL
    ELSE round(
      sum(planejado) FILTER (WHERE status_cobertura <> 'nao_aplicavel')::numeric
      / sum(contratado) FILTER (WHERE status_cobertura <> 'nao_aplicavel'), 2)
  END,
  CASE
    WHEN coalesce(sum(planejado) FILTER (WHERE status_cobertura <> 'nao_aplicavel'), 0) = 0 THEN NULL
    ELSE round(
      sum(planejado_com_briefing) FILTER (WHERE status_cobertura <> 'nao_aplicavel')::numeric
      / sum(planejado) FILTER (WHERE status_cobertura <> 'nao_aplicavel'), 2)
  END,
  count(*) FILTER (WHERE status_cobertura = 'descoberto')::int,
  count(*) FILTER (WHERE status_cobertura = 'parcial')::int,
  count(*) FILTER (WHERE status_cobertura = 'coberto')::int,
  count(*) FILTER (WHERE status_cobertura = 'sem_escopo')::int,
  count(*) FILTER (WHERE status_cobertura = 'nao_aplicavel')::int,
  count(*) FILTER (WHERE status_cobertura <> 'nao_aplicavel' AND tem_plano_mes = false)::int,
  coalesce(sum(atrasadas), 0)::int,
  coalesce(sum(sem_briefing), 0)::int,
  (SELECT n FROM legadas),
  count(*) FILTER (WHERE responsavel_valido = false)::int,
  coalesce(sum(valor) FILTER (WHERE responsavel_valido = false), 0),
  (count(*) FILTER (
     WHERE status_cobertura IN ('descoberto', 'sem_escopo')
        OR (status_cobertura <> 'nao_aplicavel' AND tem_plano_mes = false)
   ) = 0),
  public.get_briefing_stage()
FROM r;
$$;

GRANT EXECUTE ON FUNCTION public.resumo_cobertura_mensal(date, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.resumo_cobertura_agregado(date, boolean) TO authenticated, service_role;

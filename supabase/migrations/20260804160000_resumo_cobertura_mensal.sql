-- ============================================================
-- Cobertura Mensal v1.1 (adaptado ao schema real do Planeje)
-- Plano do mês = projetos.mes_referencia (+ campaign_plans via project_id)
-- Responsável = profiles (não team_members)
-- ============================================================

-- View: plano mensal por cliente (projetos com mês de referência)
CREATE OR REPLACE VIEW public.v_plano_mensal AS
SELECT
  p.id AS plano_id,
  p.client_id AS cliente_id,
  date_trunc('month', p.mes_referencia)::date AS mes_referencia,
  coalesce(p.status, 'planejamento') AS plano_status
FROM public.projetos p
WHERE p.mes_referencia IS NOT NULL
  AND p.client_id IS NOT NULL;

COMMENT ON VIEW public.v_plano_mensal IS
  'Adaptação: 1 projeto por cliente/mês = plano do mês. campaign_plans liga via project_id.';

-- Índices
CREATE INDEX IF NOT EXISTS idx_tarefas_client_due
  ON public.tarefas (client_id, due_date);

CREATE INDEX IF NOT EXISTS idx_tarefas_status
  ON public.tarefas (status);

CREATE INDEX IF NOT EXISTS idx_tarefas_project
  ON public.tarefas (project_id);

CREATE INDEX IF NOT EXISTS idx_clientes_etapa
  ON public.clientes (etapa);

CREATE INDEX IF NOT EXISTS idx_projetos_client_mes
  ON public.projetos (client_id, mes_referencia);

-- ============================================================
-- resumo_cobertura_mensal
-- ============================================================
CREATE OR REPLACE FUNCTION public.resumo_cobertura_mensal(
  p_mes date DEFAULT current_date,
  p_exigir_responsavel_ativo boolean DEFAULT false
)
RETURNS TABLE (
  cliente_id          uuid,
  empresa             text,
  tier                text,
  valor               numeric,
  tipo_servico_norm   text,
  plano_id            uuid,
  tem_plano_mes       boolean,
  responsavel_id      uuid,
  responsavel_nome    text,
  responsavel_existe  boolean,
  responsavel_ativo   boolean,
  responsavel_valido  boolean,
  contratado          integer,
  planejado           integer,
  planejado_no_plano  integer,
  improviso           integer,
  entregue            integer,
  atrasadas           integer,
  sem_briefing        integer,
  cobertura_pct       numeric,
  status_cobertura    text
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
    count(*)::int AS planejado,
    count(*) FILTER (
      WHERE t.project_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.v_plano_mensal vp
          CROSS JOIN periodo p2
          WHERE vp.plano_id = t.project_id
            AND vp.cliente_id = t.client_id
            AND vp.mes_referencia = p2.mes_ref
        )
    )::int AS planejado_no_plano,
    count(*) FILTER (WHERE t.status = 'completed')::int AS entregue,
    count(*) FILTER (
      WHERE t.status IS DISTINCT FROM 'completed'
        AND t.due_date < current_date
    )::int AS atrasadas,
    count(*) FILTER (
      WHERE lower(coalesce(t.type, '')) IN ('arte', 'video', 'carrossel', 'vídeo')
        AND coalesce(btrim(t.description), '') = ''
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
    coalesce(t.entregue, 0) AS entregue,
    coalesce(t.atrasadas, 0) AS atrasadas,
    coalesce(t.sem_briefing, 0) AS sem_briefing,
    CASE
      WHEN a.tipo_servico_norm = 'trafego_apenas' THEN NULL
      WHEN a.contratado = 0 THEN NULL
      ELSE round(coalesce(t.planejado, 0)::numeric / a.contratado, 2)
    END AS cobertura_pct
  FROM ativos a
  LEFT JOIN tarefas_mes t ON t.client_id = a.id
  LEFT JOIN plano pl ON pl.cliente_id = a.id
  -- clientes.responsavel é text; profiles.id é uuid
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
  b.entregue,
  b.atrasadas,
  b.sem_briefing,
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

-- ============================================================
-- resumo_cobertura_agregado
-- ============================================================
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
  entregue_total            integer,
  cobertura_geral           numeric,
  qtd_descoberto            integer,
  qtd_parcial               integer,
  qtd_coberto               integer,
  qtd_sem_escopo            integer,
  qtd_nao_aplicavel         integer,
  qtd_sem_plano             integer,
  atrasadas_total           integer,
  sem_briefing_total        integer,
  clientes_sem_responsavel  integer,
  fee_sem_responsavel       numeric,
  gate_liberado             boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
WITH r AS (
  SELECT * FROM public.resumo_cobertura_mensal(p_mes, p_exigir_responsavel_ativo)
)
SELECT
  date_trunc('month', p_mes)::date,
  count(*)::int,
  count(*) FILTER (WHERE status_cobertura <> 'nao_aplicavel')::int,
  coalesce(sum(contratado) FILTER (WHERE status_cobertura <> 'nao_aplicavel'), 0)::int,
  coalesce(sum(planejado) FILTER (WHERE status_cobertura <> 'nao_aplicavel'), 0)::int,
  coalesce(sum(planejado_no_plano) FILTER (WHERE status_cobertura <> 'nao_aplicavel'), 0)::int,
  coalesce(sum(improviso) FILTER (WHERE status_cobertura <> 'nao_aplicavel'), 0)::int,
  coalesce(sum(entregue) FILTER (WHERE status_cobertura <> 'nao_aplicavel'), 0)::int,
  CASE
    WHEN coalesce(sum(contratado) FILTER (WHERE status_cobertura <> 'nao_aplicavel'), 0) = 0 THEN NULL
    ELSE round(
      sum(planejado) FILTER (WHERE status_cobertura <> 'nao_aplicavel')::numeric
      / sum(contratado) FILTER (WHERE status_cobertura <> 'nao_aplicavel'), 2)
  END,
  count(*) FILTER (WHERE status_cobertura = 'descoberto')::int,
  count(*) FILTER (WHERE status_cobertura = 'parcial')::int,
  count(*) FILTER (WHERE status_cobertura = 'coberto')::int,
  count(*) FILTER (WHERE status_cobertura = 'sem_escopo')::int,
  count(*) FILTER (WHERE status_cobertura = 'nao_aplicavel')::int,
  count(*) FILTER (WHERE status_cobertura <> 'nao_aplicavel' AND tem_plano_mes = false)::int,
  coalesce(sum(atrasadas), 0)::int,
  coalesce(sum(sem_briefing), 0)::int,
  count(*) FILTER (WHERE responsavel_valido = false)::int,
  coalesce(sum(valor) FILTER (WHERE responsavel_valido = false), 0),
  (count(*) FILTER (
     WHERE status_cobertura IN ('descoberto', 'sem_escopo')
        OR (status_cobertura <> 'nao_aplicavel' AND tem_plano_mes = false)
   ) = 0)
FROM r;
$$;

GRANT EXECUTE ON FUNCTION public.resumo_cobertura_mensal(date, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resumo_cobertura_agregado(date, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resumo_cobertura_mensal(date, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.resumo_cobertura_agregado(date, boolean) TO service_role;

COMMENT ON FUNCTION public.resumo_cobertura_mensal IS
  'Cobertura mensal: contratado (entregaveis) x planejado/entregue (tarefas) por cliente closed.';
COMMENT ON FUNCTION public.resumo_cobertura_agregado IS
  'KPIs agregados da cobertura mensal + gate_liberado para virada de mês.';

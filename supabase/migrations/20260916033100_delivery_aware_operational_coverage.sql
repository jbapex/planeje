-- Ajusta a cobertura para encerrar o atraso na entrega comprovada, antes da publicação.
-- Uma peça conta uma vez no escopo, independentemente da quantidade de canais.
-- Uma adaptação que exige nova produção/edição deve existir como outro material.

CREATE OR REPLACE FUNCTION public.resumo_cobertura_operacional_mensal(
  p_mes date DEFAULT current_date
)
RETURNS TABLE (
  cliente_id uuid,
  empresa text,
  tier text,
  valor numeric,
  tipo_servico_norm text,
  plano_id uuid,
  tem_plano_mes boolean,
  responsavel_id uuid,
  responsavel_nome text,
  responsavel_valido boolean,
  contratado integer,
  planejado integer,
  planejado_no_plano integer,
  improviso integer,
  aguardando_tarefa integer,
  em_execucao integer,
  entregue integer,
  atrasadas integer,
  publicacoes_total integer,
  publicacoes_publicadas integer,
  falta_planejar integer,
  cobertura_pct numeric,
  status_cobertura text,
  por_tipo jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
WITH
periodo AS (
  SELECT
    pg_catalog.date_trunc('month', p_mes)::date AS inicio,
    (pg_catalog.date_trunc('month', p_mes) + interval '1 month - 1 day')::date AS fim
),
interno AS (
  SELECT auth.uid() IS NULL OR EXISTS (
    SELECT 1
    FROM public.profiles profile
    WHERE profile.id = auth.uid()
      AND profile.status = 'active'
      AND profile.role IN ('superadmin', 'admin', 'colaborador')
  ) AS permitido
),
clientes_base AS (
  SELECT
    client.id,
    client.empresa,
    client.valor,
    client.tipo_servico,
    client.tipo_contrato,
    client.responsavel,
    coalesce(scope.product, nullif(client.tipo_servico, ''), 'indefinido') AS produto_mes,
    coalesce(scope.deliverables, client.entregaveis, '{}'::jsonb) AS entregaveis_mes,
    scope.account_owner_id
  FROM public.clientes client
  CROSS JOIN periodo
  CROSS JOIN interno
  LEFT JOIN public.client_monthly_scopes scope
    ON scope.client_id = client.id
   AND scope.reference_month = periodo.inicio
  WHERE client.etapa = 'closed'
    AND interno.permitido
),
projetos_mes AS (
  SELECT project.id, project.client_id, project.mes_referencia
  FROM public.projetos project
  CROSS JOIN periodo
  WHERE project.client_id IS NOT NULL
    AND pg_catalog.date_trunc('month', project.mes_referencia)::date = periodo.inicio
),
plano_principal AS (
  SELECT DISTINCT ON (project.client_id)
    project.client_id,
    project.id AS plano_id
  FROM projetos_mes project
  ORDER BY project.client_id, project.id
),
materiais_plano_raw AS (
  SELECT
    project.client_id,
    project.id AS project_id,
    coalesce(
      nullif(pg_catalog.btrim(material.item->>'id'), ''),
      'legacy:' || plan.id::text || ':' || material.ordinality::text
    ) AS material_id,
    material.item AS material
  FROM projetos_mes project
  JOIN public.campaign_plans plan ON plan.project_id = project.id
  CROSS JOIN LATERAL pg_catalog.unnest(
    coalesce(plan.materiais, ARRAY[]::jsonb[])
  ) WITH ORDINALITY AS material(item, ordinality)
  WHERE pg_catalog.jsonb_typeof(material.item) = 'object'
),
materiais_plano AS (
  SELECT DISTINCT ON (raw.project_id, raw.material_id)
    raw.client_id,
    raw.project_id,
    raw.material_id,
    CASE
      WHEN pg_catalog.lower(pg_catalog.translate(pg_catalog.btrim(coalesce(raw.material->>'tipo', '')), 'áàâãéêíóôõúç', 'aaaaeeiooouc')) IN ('video', 'videos', 'reels') THEN 'videos'
      WHEN pg_catalog.lower(pg_catalog.translate(pg_catalog.btrim(coalesce(raw.material->>'tipo', '')), 'áàâãéêíóôõúç', 'aaaaeeiooouc')) IN ('story', 'stories') THEN 'stories'
      WHEN pg_catalog.lower(pg_catalog.translate(pg_catalog.btrim(coalesce(raw.material->>'tipo', '')), 'áàâãéêíóôõúç', 'aaaaeeiooouc')) IN ('carrossel', 'carousel') THEN 'carrosseis'
      WHEN pg_catalog.lower(pg_catalog.translate(pg_catalog.btrim(coalesce(raw.material->>'tipo', '')), 'áàâãéêíóôõúç', 'aaaaeeiooouc')) IN ('anuncio', 'anuncios', 'ad', 'ads') THEN 'anuncios'
      ELSE 'posts'
    END AS categoria,
    raw.material
  FROM materiais_plano_raw raw
  ORDER BY raw.project_id, raw.material_id
),
publicacoes_por_tarefa AS (
  SELECT
    publication.task_id,
    pg_catalog.count(*) FILTER (WHERE publication.status <> 'cancelled')::integer AS total,
    pg_catalog.count(*) FILTER (WHERE publication.status = 'published')::integer AS publicadas
  FROM public.task_channel_publications publication
  GROUP BY publication.task_id
),
itens_plano AS (
  SELECT
    material.client_id,
    material.categoria,
    material.project_id,
    material.material_id,
    task.id AS task_id,
    1::integer AS planejado,
    1::integer AS planejado_no_plano,
    0::integer AS improviso,
    CASE WHEN task.id IS NULL THEN 1 ELSE 0 END::integer AS aguardando_tarefa,
    CASE
      WHEN task.id IS NOT NULL
       AND task.production_delivered_at IS NULL
       AND NOT (coalesce(status.is_terminal, false) OR task.status IN ('completed', 'published'))
      THEN 1 ELSE 0
    END::integer AS em_execucao,
    CASE
      WHEN task.id IS NOT NULL
       AND (task.production_delivered_at IS NOT NULL
         OR coalesce(status.is_terminal, false)
         OR task.status IN ('completed', 'published'))
      THEN 1 ELSE 0
    END::integer AS entregue,
    CASE
      WHEN task.id IS NOT NULL
       AND task.production_delivered_at IS NULL
       AND NOT (coalesce(status.is_terminal, false) OR task.status IN ('completed', 'published'))
       AND task.due_date IS NOT NULL
       AND task.due_date < current_date
      THEN 1 ELSE 0
    END::integer AS atrasada,
    coalesce(publication.total, 0)::integer AS publicacoes_total,
    coalesce(publication.publicadas, 0)::integer AS publicacoes_publicadas
  FROM materiais_plano material
  LEFT JOIN public.tarefas task
    ON task.project_id = material.project_id
   AND task.plan_material_id = material.material_id
  LEFT JOIN public.task_statuses status ON status.value = task.status
  LEFT JOIN publicacoes_por_tarefa publication ON publication.task_id = task.id
),
tarefas_extras AS (
  SELECT
    task.client_id,
    CASE
      WHEN pg_catalog.lower(pg_catalog.translate(pg_catalog.btrim(coalesce(task.type, '')), 'áàâãéêíóôõúç', 'aaaaeeiooouc')) IN ('video', 'videos', 'reels') THEN 'videos'
      WHEN pg_catalog.lower(pg_catalog.translate(pg_catalog.btrim(coalesce(task.type, '')), 'áàâãéêíóôõúç', 'aaaaeeiooouc')) IN ('story', 'stories') THEN 'stories'
      WHEN pg_catalog.lower(pg_catalog.translate(pg_catalog.btrim(coalesce(task.type, '')), 'áàâãéêíóôõúç', 'aaaaeeiooouc')) IN ('carrossel', 'carousel') THEN 'carrosseis'
      WHEN pg_catalog.lower(pg_catalog.translate(pg_catalog.btrim(coalesce(task.type, '')), 'áàâãéêíóôõúç', 'aaaaeeiooouc')) IN ('anuncio', 'anuncios', 'ad', 'ads') THEN 'anuncios'
      ELSE 'posts'
    END AS categoria,
    task.project_id,
    task.plan_material_id AS material_id,
    task.id AS task_id,
    1::integer AS planejado,
    0::integer AS planejado_no_plano,
    1::integer AS improviso,
    0::integer AS aguardando_tarefa,
    CASE WHEN task.production_delivered_at IS NULL
      AND NOT (coalesce(status.is_terminal, false) OR task.status IN ('completed', 'published')) THEN 1 ELSE 0 END::integer AS em_execucao,
    CASE WHEN task.production_delivered_at IS NOT NULL
      OR coalesce(status.is_terminal, false)
      OR task.status IN ('completed', 'published') THEN 1 ELSE 0 END::integer AS entregue,
    CASE
      WHEN task.production_delivered_at IS NULL
       AND NOT (coalesce(status.is_terminal, false) OR task.status IN ('completed', 'published'))
       AND task.due_date IS NOT NULL
       AND task.due_date < current_date
      THEN 1 ELSE 0
    END::integer AS atrasada,
    coalesce(publication.total, 0)::integer AS publicacoes_total,
    coalesce(publication.publicadas, 0)::integer AS publicacoes_publicadas
  FROM public.tarefas task
  CROSS JOIN periodo
  LEFT JOIN public.task_statuses status ON status.value = task.status
  LEFT JOIN publicacoes_por_tarefa publication ON publication.task_id = task.id
  WHERE task.client_id IS NOT NULL
    AND coalesce(task.post_date, task.due_date) BETWEEN periodo.inicio AND periodo.fim
    AND pg_catalog.lower(
      pg_catalog.translate(
        pg_catalog.btrim(coalesce(task.type, '')),
        'áàâãéêíóôõúç',
        'aaaaeeiooouc'
      )
    ) IN (
      'arte', 'post', 'posts', 'design', 'social_media',
      'video', 'videos', 'reels',
      'story', 'stories',
      'carrossel', 'carousel',
      'anuncio', 'anuncios', 'ad', 'ads'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM materiais_plano material
      WHERE material.project_id = task.project_id
        AND material.material_id = task.plan_material_id
    )
),
itens AS (
  SELECT * FROM itens_plano
  UNION ALL
  SELECT * FROM tarefas_extras
),
estatisticas_tipo AS (
  SELECT
    item.client_id,
    item.categoria,
    pg_catalog.sum(item.planejado)::integer AS planejado,
    pg_catalog.sum(item.planejado_no_plano)::integer AS planejado_no_plano,
    pg_catalog.sum(item.improviso)::integer AS improviso,
    pg_catalog.sum(item.aguardando_tarefa)::integer AS aguardando_tarefa,
    pg_catalog.sum(item.em_execucao)::integer AS em_execucao,
    pg_catalog.sum(item.entregue)::integer AS entregue,
    pg_catalog.sum(item.atrasada)::integer AS atrasadas,
    pg_catalog.sum(item.publicacoes_total)::integer AS publicacoes_total,
    pg_catalog.sum(item.publicacoes_publicadas)::integer AS publicacoes_publicadas
  FROM itens item
  GROUP BY item.client_id, item.categoria
),
categorias AS (
  SELECT * FROM (VALUES
    ('posts'::text, 'Posts'::text),
    ('carrosseis'::text, 'Carrosséis'::text),
    ('videos'::text, 'Vídeos'::text),
    ('stories'::text, 'Stories'::text),
    ('anuncios'::text, 'Anúncios'::text)
  ) AS category(key, label)
),
por_tipo_linhas AS (
  SELECT
    client.id AS client_id,
    category.key,
    category.label,
    greatest(coalesce((client.entregaveis_mes->>category.key)::integer, 0), 0)::integer AS contratado,
    coalesce(stats.planejado, 0)::integer AS planejado,
    coalesce(stats.planejado_no_plano, 0)::integer AS planejado_no_plano,
    coalesce(stats.improviso, 0)::integer AS improviso,
    coalesce(stats.aguardando_tarefa, 0)::integer AS aguardando_tarefa,
    coalesce(stats.em_execucao, 0)::integer AS em_execucao,
    coalesce(stats.entregue, 0)::integer AS entregue,
    coalesce(stats.atrasadas, 0)::integer AS atrasadas,
    coalesce(stats.publicacoes_total, 0)::integer AS publicacoes_total,
    coalesce(stats.publicacoes_publicadas, 0)::integer AS publicacoes_publicadas
  FROM clientes_base client
  CROSS JOIN categorias category
  LEFT JOIN estatisticas_tipo stats
    ON stats.client_id = client.id
   AND stats.categoria = category.key
),
por_cliente AS (
  SELECT
    line.client_id,
    pg_catalog.sum(line.contratado)::integer AS contratado,
    pg_catalog.sum(line.planejado)::integer AS planejado,
    pg_catalog.sum(line.planejado_no_plano)::integer AS planejado_no_plano,
    pg_catalog.sum(line.improviso)::integer AS improviso,
    pg_catalog.sum(line.aguardando_tarefa)::integer AS aguardando_tarefa,
    pg_catalog.sum(line.em_execucao)::integer AS em_execucao,
    pg_catalog.sum(line.entregue)::integer AS entregue,
    pg_catalog.sum(line.atrasadas)::integer AS atrasadas,
    pg_catalog.sum(line.publicacoes_total)::integer AS publicacoes_total,
    pg_catalog.sum(line.publicacoes_publicadas)::integer AS publicacoes_publicadas,
    pg_catalog.jsonb_object_agg(
      line.key,
      pg_catalog.jsonb_build_object(
        'label', line.label,
        'contratado', line.contratado,
        'planejado', line.planejado,
        'planejado_no_plano', line.planejado_no_plano,
        'improviso', line.improviso,
        'aguardando_tarefa', line.aguardando_tarefa,
        'em_execucao', line.em_execucao,
        'entregue', line.entregue,
        'atrasadas', line.atrasadas,
        'publicacoes_total', line.publicacoes_total,
        'publicacoes_publicadas', line.publicacoes_publicadas,
        'falta_planejar', greatest(line.contratado - line.planejado, 0)
      ) ORDER BY line.key
    ) AS por_tipo
  FROM por_tipo_linhas line
  GROUP BY line.client_id
)
SELECT
  client.id AS cliente_id,
  client.empresa,
  CASE
    WHEN client.valor IS NULL THEN '—'
    WHEN client.valor >= 2000 THEN 'A'
    WHEN client.valor >= 1500 THEN 'B'
    ELSE 'C'
  END AS tier,
  client.valor,
  CASE
    WHEN pg_catalog.lower(pg_catalog.btrim(coalesce(client.produto_mes, ''))) IN ('execucao_completa', 'execução_completa', 'execucao completa') THEN 'execucao_completa'
    WHEN pg_catalog.lower(pg_catalog.btrim(coalesce(client.produto_mes, ''))) LIKE '%social%' THEN 'social_apenas'
    WHEN pg_catalog.lower(pg_catalog.translate(pg_catalog.btrim(coalesce(client.produto_mes, client.tipo_contrato, '')), 'áàâãéêíóôõúç', 'aaaaeeiooouc')) LIKE '%trafego%' THEN 'trafego_apenas'
    WHEN pg_catalog.lower(coalesce(client.tipo_contrato, '')) ~ '(ads|google|meta)'
     AND stats.contratado = 0 THEN 'trafego_apenas'
    ELSE 'indefinido'
  END AS tipo_servico_norm,
  plan.plano_id,
  (plan.plano_id IS NOT NULL) AS tem_plano_mes,
  profile.id AS responsavel_id,
  CASE
    WHEN profile.id IS NULL THEN 'SEM RESPONSÁVEL VÁLIDO'
    WHEN profile.status = 'active' AND profile.role <> 'cliente' THEN profile.full_name
    ELSE coalesce(profile.full_name, '—') || ' (cadastro pendente)'
  END AS responsavel_nome,
  (profile.id IS NOT NULL AND profile.status = 'active' AND profile.role <> 'cliente') AS responsavel_valido,
  stats.contratado,
  stats.planejado,
  stats.planejado_no_plano,
  stats.improviso,
  stats.aguardando_tarefa,
  stats.em_execucao,
  stats.entregue,
  stats.atrasadas,
  stats.publicacoes_total,
  stats.publicacoes_publicadas,
  greatest(stats.contratado - stats.planejado, 0)::integer AS falta_planejar,
  CASE WHEN stats.contratado = 0 THEN NULL ELSE pg_catalog.round(stats.planejado::numeric / stats.contratado, 2) END AS cobertura_pct,
  CASE
    WHEN pg_catalog.lower(pg_catalog.translate(pg_catalog.btrim(coalesce(client.produto_mes, client.tipo_contrato, '')), 'áàâãéêíóôõúç', 'aaaaeeiooouc')) LIKE '%trafego%'
      OR (pg_catalog.lower(coalesce(client.tipo_contrato, '')) ~ '(ads|google|meta)' AND stats.contratado = 0)
      THEN 'nao_aplicavel'
    WHEN stats.contratado = 0 THEN 'sem_escopo'
    WHEN stats.planejado > stats.contratado THEN 'acima'
    WHEN stats.planejado = stats.contratado THEN 'coberto'
    WHEN stats.planejado::numeric / stats.contratado >= 0.6 THEN 'parcial'
    ELSE 'descoberto'
  END AS status_cobertura,
  stats.por_tipo
FROM clientes_base client
JOIN por_cliente stats ON stats.client_id = client.id
LEFT JOIN plano_principal plan ON plan.client_id = client.id
LEFT JOIN public.profiles profile
  ON profile.id = coalesce(
    client.account_owner_id,
    CASE
      WHEN coalesce(client.responsavel, '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      THEN client.responsavel::uuid
      ELSE NULL
    END
  )
ORDER BY
  CASE
    WHEN stats.contratado = 0 THEN 3
    WHEN stats.planejado::numeric / stats.contratado < 0.6 THEN 0
    WHEN stats.planejado < stats.contratado THEN 1
    ELSE 2
  END,
  client.valor DESC NULLS LAST,
  client.empresa;
$$;

REVOKE ALL ON FUNCTION public.resumo_cobertura_operacional_mensal(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resumo_cobertura_operacional_mensal(date) TO authenticated, service_role;

COMMENT ON FUNCTION public.resumo_cobertura_operacional_mensal(date) IS
  'Cobertura mensal por material. Uma peça conta uma vez; publicações multicanal são acompanhadas separadamente.';

NOTIFY pgrst, 'reload schema';

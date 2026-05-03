/**
 * Introspecção do schema exposto pelo PostgREST (OpenAPI) para alinhar colunas reais do projeto.
 */

export type TableColumnMap = Record<string, string[]>;

const TABLES_TO_INTROSPECT = [
  'clientes',
  'projetos',
  'tarefas',
  'task_statuses',
  'task_subtasks',
  'task_comments',
  'team_members',
  'campaign_plans',
  'paid_campaigns',
  'solicitacoes',
  'task_solicitations',
  'leads',
  'profiles',
  'cliente_resultados_diarios',
  'crm_oportunidades',
] as const;

/** Fallback derivado das migrations e do uso no app React (quando OpenAPI não está disponível). */
export const FALLBACK_COLUMNS: TableColumnMap = {
  clientes: [
    'id',
    'created_at',
    'owner_id',
    'empresa',
    'nome_contato',
    'responsavel',
    'tipo_contrato',
    'etapa',
    'produtos_servicos',
    'instagram',
    'publico_alvo',
    'tom_de_voz',
    'vencimento',
    'valor',
    'etiquetas',
    'nicho',
    'logo_urls',
    'sobre_empresa',
    'tipo_servico',
    'entregaveis',
    'objetivo_meta',
    'meta_custo_mensagem',
    'meta_custo_compra',
    'roas_alvo',
    'limite_meta',
    'updated_at',
  ],
  projetos: [
    'id',
    'name',
    'status',
    'client_id',
    'owner_id',
    'mes_referencia',
    'data_evento',
    'created_at',
    'updated_at',
  ],
  tarefas: [
    'id',
    'title',
    'description',
    'status',
    'project_id',
    'client_id',
    'owner_id',
    'assignee_ids',
    'type',
    'due_date',
    'post_date',
    'plataforma',
    'priority',
    'status_history',
    'time_logs',
    'created_at',
    'updated_at',
  ],
  task_statuses: ['id', 'label', 'value', 'color', 'sort_order', 'owner_id'],
  task_subtasks: [
    'id',
    'created_at',
    'task_id',
    'title',
    'is_completed',
    'is_required',
    'type',
  ],
  task_comments: ['id', 'created_at', 'task_id', 'user_id', 'content'],
  team_members: [
    'id',
    'full_name',
    'role',
    'status',
    'email',
    'created_at',
    'user_id',
    'nome',
    'name',
    'updated_at',
  ],
  campaign_plans: [
    'id',
    'project_id',
    'objetivo',
    'estrategia_comunicacao',
    'conteudo_criativos',
    'trafego_pago',
    'cronograma',
    'roteiros',
    'materiais',
    'contexto_ia',
    'created_at',
    'updated_at',
  ],
  paid_campaigns: [
    'id',
    'client_id',
    'name',
    'status',
    'objetivo',
    'plataforma',
    'orcamento',
    'data_inicio',
    'data_fim',
    'meta_id',
    'created_at',
    'updated_at',
    'description',
    'budget',
    'assignee_id',
    'owner_id',
    'kpis',
    'ad_sets',
  ],
  cliente_resultados_diarios: [
    'id',
    'cliente_id',
    'data_referencia',
    'created_at',
    'leads',
    'visitas_agendadas',
    'visitas_realizadas',
    'vendas',
    'faturamento',
    'investimento',
    'observacoes',
    'created_by',
  ],
  crm_oportunidades: [
    'id',
    'cliente_id',
    'lead_nome',
    'lead_telefone',
    'origem_canal',
    'origem_campanha',
    'status_etapa',
    'valor_previsto',
    'probabilidade',
    'venda_confirmada',
    'venda_valor_real',
    'data_criacao',
    'observacoes_resumo',
  ],
  solicitacoes: [
    'id',
    'created_at',
    'title',
    'description',
    'status',
    'client_id',
    'owner_id',
    'origem',
    'priority',
    'prazo',
    'data_recebida',
    'updated_at',
  ],
  task_solicitations: [
    'id',
    'created_at',
    'title',
    'description',
    'status',
    'client_id',
    'owner_id',
    'origem',
    'priority',
    'prazo',
    'updated_at',
  ],
  leads: [
    'id',
    'cliente_id',
    'nome',
    'whatsapp',
    'email',
    'origem',
    'sub_origem',
    'data_entrada',
    'agendamento',
    'status',
    'vendedor',
    'valor',
    'observacoes',
    'product_id',
    'custom_date_field',
    'profile_pic_url',
    'responsavel_id',
    'utm_source',
    'utm_medium',
    'utm_campaign',
    'utm_content',
    'utm_term',
    'tracking_data',
    'created_at',
    'updated_at',
  ],
  profiles: [
    'id',
    'full_name',
    'role',
    'status',
    'email',
    'created_at',
    'avatar_url',
    'updated_at',
  ],
};

function extractPropertiesFromSchema(schema: unknown): string[] | null {
  if (!schema || typeof schema !== 'object') return null;
  const o = schema as Record<string, unknown>;
  const props = o.properties;
  if (props && typeof props === 'object') {
    return Object.keys(props as Record<string, unknown>);
  }
  return null;
}

function collectSchemasFromOpenApi(spec: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const components = spec.components as Record<string, unknown> | undefined;
  const schemas = components?.schemas as Record<string, unknown> | undefined;
  if (schemas) Object.assign(out, schemas);
  const definitions = spec.definitions as Record<string, unknown> | undefined;
  if (definitions) Object.assign(out, definitions);
  return out;
}

export async function introspectColumnsFromSupabase(
  supabaseUrl: string,
  serviceRoleKey: string
): Promise<{ columns: TableColumnMap; warnings: string[] }> {
  const warnings: string[] = [];
  const base = supabaseUrl.replace(/\/$/, '');
  const res = await fetch(`${base}/rest/v1/`, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      Accept: 'application/openapi+json',
    },
  });

  if (!res.ok) {
    warnings.push(`OpenAPI HTTP ${res.status}: ${await res.text().catch(() => '')}`);
    return { columns: { ...FALLBACK_COLUMNS }, warnings };
  }

  let spec: Record<string, unknown>;
  try {
    spec = (await res.json()) as Record<string, unknown>;
  } catch (e) {
    warnings.push(`OpenAPI JSON inválido: ${e instanceof Error ? e.message : String(e)}`);
    return { columns: { ...FALLBACK_COLUMNS }, warnings };
  }

  const schemas = collectSchemasFromOpenApi(spec);
  const columns: TableColumnMap = { ...FALLBACK_COLUMNS };

  for (const table of TABLES_TO_INTROSPECT) {
    const keys = extractPropertiesFromSchema(schemas[table]);
    if (keys && keys.length > 0) {
      columns[table] = keys;
    } else if (table === 'team_members') {
      columns[table] = [];
    }
  }

  return { columns, warnings };
}

export function pickExistingColumns(
  table: keyof typeof FALLBACK_COLUMNS | string,
  columns: TableColumnMap,
  wanted: string[]
): string[] {
  const available = new Set(columns[table] ?? []);
  if (available.size === 0) return wanted;
  return wanted.filter((c) => available.has(c));
}

/** Colunas da tabela no schema mesclado (OpenAPI + fallback), para filtrar PATCH/INSERT. */
export function introspectColumns(table: string, columns: TableColumnMap): Set<string> {
  return new Set(columns[table] ?? []);
}

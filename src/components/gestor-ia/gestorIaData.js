import { dateRange } from '@/lib/trafficPerformanceReport';
import { canSeeCampaignGoals, canUseGestorIa, GESTOR_CONTEXT_FIELDS } from './gestorIaAccess';
import { presentMetaReading } from './gestorIaHistoryView';
import { linkedMediaGoals, MEDIA_GOAL_SUMMARY_FIELDS } from './gestorIaMediaGoalData';
export { canSeeCampaignGoals, canUseGestorIa, GESTOR_PERMISSION_FIELDS } from './gestorIaAccess';
export { loadGestorGoalReadings } from './gestorIaMediaGoalData';

function requireAccess(profile, modules) {
  if (!canUseGestorIa(profile, modules)) throw new Error('Acesso ao Gestor IA indisponível.');
}

function checkedPeriod(period) {
  const range = dateRange(period?.since, period?.until);
  if (!range) throw new Error('Escolha um período válido.');
  return { since: range.since, until: range.until };
}

async function authorizeClient(db, profile, modules, clientId) {
  requireAccess(profile, modules);
  if (!clientId) throw new Error('Escolha um cliente.');
  const { data, error } = await db.rpc('central_trafego_can_access_client', { p_cliente_id: clientId });
  if (error || data !== true) throw new Error('Não foi possível confirmar o acesso a este cliente.');
}

async function readAll(query) {
  const rows = [];
  // Continuar até a página vazia também respeita um teto interno menor do banco.
  for (;;) {
    const { data, error } = await query().range(rows.length, rows.length + 499);
    if (error) throw new Error('Não foi possível consultar esta fonte.');
    if (!Array.isArray(data)) throw new Error('Resposta de consulta inválida.');
    if (!data.length) return rows;
    rows.push(...data);
  }
}

async function readClientsSource(db, table, fields, key, ids, filters = (q) => q) {
  const rows = [];
  for (let start = 0; start < ids.length; start += 100) {
    const chunk = ids.slice(start, start + 100);
    rows.push(...await readAll(() => filters(db.from(table).select(fields).in(key, chunk)).order(table === 'traffic_client_ops' ? 'client_id' : 'id')));
  }
  return rows;
}

const META_ACCOUNT_FIELDS = 'cliente_id,meta_account_id,meta_account_name,is_active';
const GOAL_CONTEXT_FIELDS = ['objetivo_meta', 'limite_meta', 'meta_custo_mensagem', 'meta_custo_compra', 'roas_alvo', 'meta_resumo', 'entregaveis'];

function visibleContextFields(fields, canViewField) {
  return fields.filter((field) => canViewField(field) === true &&
    (field !== 'limite_meta' || canViewField('valor') === true) &&
    (field !== 'entregaveis' || canViewField('meta_resumo') === true));
}

function activeMetaAccounts(db, ids) {
  return readClientsSource(db, 'cliente_meta_accounts', META_ACCOUNT_FIELDS, 'cliente_id', ids, (q) => q.eq('is_active', true));
}

function activeCampaignGoals(db, ids) {
  return readClientsSource(db, 'gestor_ia_metas_campanha', MEDIA_GOAL_SUMMARY_FIELDS, 'client_id', ids, (q) => q.eq('is_active', true));
}

export async function loadGestorPageCampaignGoals(db, clientIds) {
  async function allowed(ids) {
    const checks = await Promise.all(ids.map((id) => db.rpc('gestor_ia_pode_usar_metas', { p_client_id: id })));
    return ids.filter((_, index) => !checks[index].error && checks[index].data === true);
  }
  const ids = await allowed([...new Set(clientIds)]);
  const [accounts, goals] = await Promise.all([activeMetaAccounts(db, ids), activeCampaignGoals(db, ids)]);
  const current = await allowed(ids);
  return Object.fromEntries(current.map((id) => [id,
    linkedMediaGoals(goals.filter((goal) => goal.client_id === id), accounts.filter((account) => account.cliente_id === id))]));
}

export async function loadGestorGoalClient(db, profile, modules, canViewField, clientId) {
  await authorizeClient(db, profile, modules, clientId);
  const fields = visibleContextFields(GOAL_CONTEXT_FIELDS, canViewField)
    .map((field) => field === 'entregaveis' ? 'legacy_meta_resumo:entregaveis->meta_resumo' : field);
  const { data, error } = await db.from('clientes').select(['id', 'empresa', 'etapa', ...fields].join(','))
    .eq('id', clientId).eq('etapa', 'closed').maybeSingle();
  if (error || data?.id !== clientId || data.etapa !== 'closed') throw new Error('Cliente indisponível para consultar metas.');
  const [metaAccounts, activeGoals] = canSeeCampaignGoals(profile, modules, canViewField) ? await Promise.all([
    activeMetaAccounts(db, [clientId]), activeCampaignGoals(db, [clientId]),
  ]) : [[], []];
  const { legacy_meta_resumo, ...client } = data;
  return { ...client, entregaveis: legacy_meta_resumo ? { meta_resumo: legacy_meta_resumo } : undefined,
    metaAccounts, mediaGoals: linkedMediaGoals(activeGoals, metaAccounts) };
}

export async function loadGestorPortfolio(db, profile, modules, canViewField = () => false, taskScope = 'all') {
  requireAccess(profile, modules);
  const candidates = await readAll(() => db.from('clientes').select('id,empresa,etapa').eq('etapa', 'closed').order('id'));
  const ids = [];
  // A RPC é STABLE e usa a carteira/ACL oficial, inclusive acessos explícitos.
  for (let start = 0; start < candidates.length; start += 20) {
    const chunk = candidates.slice(start, start + 20);
    const access = await Promise.all(chunk.map(async (client) => {
      const { data, error } = await db.rpc('central_trafego_can_access_client', { p_cliente_id: client.id });
      if (error || typeof data !== 'boolean') throw new Error('Não foi possível confirmar sua carteira.');
      return data;
    }));
    chunk.forEach((client, index) => { if (access[index]) ids.push(client.id); });
  }
  if (!ids.length) return { clients: [], availableClients: [], warnings: [] };
  const fields = visibleContextFields(GESTOR_CONTEXT_FIELDS, canViewField);
  const clients = await readClientsSource(db, 'clientes', ['id', 'empresa', 'etapa', ...fields].join(','), 'id', ids, (q) => q.eq('etapa', 'closed'));
  const warnings = [];
  async function optional(label, promise) {
    try { return await promise; } catch {
      warnings.push(`${label}: consulta indisponível.`);
      return null;
    }
  }
  function taskFilter(query) {
    const traffic = query.eq('type', 'paid_traffic');
    return profile.role === 'colaborador' && taskScope === 'responsible' ? traffic.contains('assignee_ids', [profile.id]) : traffic;
  }
  const canSeeMediaGoals = canSeeCampaignGoals(profile, modules, canViewField);
  const [meta, google, ops, tasks, campaigns, mediaGoals] = await Promise.all([
    optional('Contas Meta', activeMetaAccounts(db, ids)),
    optional('Contas Google', readClientsSource(db, 'cliente_google_ads_accounts', 'cliente_id,google_customer_id,google_customer_name,is_active', 'cliente_id', ids, (q) => q.eq('is_active', true))),
    optional('Responsáveis', readClientsSource(db, 'traffic_client_ops', canViewField('responsavel') ? 'client_id,primary_assignee_id,situation' : 'client_id,situation', 'client_id', ids)),
    modules.tasks === true ? optional('Tarefas', readClientsSource(db, 'tarefas', 'id,title,status,client_id,due_date,type', 'client_id', ids, taskFilter)) : [],
    optional('Campanhas cadastradas', readClientsSource(db, 'paid_campaigns', 'id,client_id', 'client_id', ids)),
    canSeeMediaGoals ? optional('Metas de campanha', activeCampaignGoals(db, ids)) : [],
  ]);
  const managerIds = [...new Set([...clients.map((c) => c.responsavel), ...(ops || []).map((o) => o.primary_assignee_id)].filter(Boolean))];
  const managers = await optional('Nomes dos gestores', readClientsSource(db, 'profiles', 'id,full_name', 'id', managerIds));
  const byId = Object.fromEntries((managers || []).map((p) => [p.id, p.full_name]));
  const linked = (rows, id, key = 'client_id') => rows === null ? null : rows.filter((r) => r[key] === id);
  const availableClients = clients.map((client) => {
    const operation = ops?.find((o) => o.client_id === client.id);
    const metaAccounts = linked(meta, client.id, 'cliente_id');
    return { ...client, entregaveis: client.entregaveis ? { meta_resumo: client.entregaveis.meta_resumo } : undefined,
      metaAccounts, googleAccounts: linked(google, client.id, 'cliente_id'), tasks: linked(tasks, client.id), operation,
      mediaGoals: canSeeMediaGoals ? linkedMediaGoals(linked(mediaGoals, client.id), metaAccounts) : [],
      gestorName: byId[operation?.primary_assignee_id || client.responsavel] || 'Não informado',
      hasTraffic: [meta, google, ops, tasks, campaigns].some((rows) => rows === null || rows.some((r) => (r.client_id || r.cliente_id) === client.id)) };
  }).sort((a, b) => a.empresa.localeCompare(b.empresa, 'pt-BR'));
  return { clients: availableClients.filter((client) => client.hasTraffic), availableClients, warnings };
}

export async function loadGestorAccountsOverview(db, { profile, modules, clientId }) {
  requireAccess(profile, modules);
  if (!clientId) throw new Error('Consulta de contas indisponível.');
  const { data, error } = await db.functions.invoke('gestor-ia-meta', { body: {
    action: 'get-gestor-accounts-overview', cliente_id: clientId,
  } });
  if (error || data?.error || !Array.isArray(data?.accounts)) throw metaReadError(error, 'Dados das contas Meta indisponíveis.');
  if (data.period) checkedPeriod(data.period);
  return data;
}

function metaReadError(error, message) {
  const denied = [401, 403, 404].includes(error?.context?.status);
  return Object.assign(new Error(denied ? 'Acesso à leitura Meta indisponível.' : message), { accessDenied: denied });
}

export async function loadGestorMetrics(db, { profile, modules, clientId, accountId, period, compare = false, refresh = false }) {
  requireAccess(profile, modules);
  if (!clientId || !accountId) throw new Error('Escolha uma conta vinculada.');
  const range = checkedPeriod(period);
  const { data, error } = await db.functions.invoke('gestor-ia-meta', { body: {
    action: refresh ? 'refresh-gestor-metrics' : 'get-gestor-metrics',
    ad_account_id: accountId, cliente_id: clientId, time_range: range, ...(refresh && compare ? { compare: true } : {}),
  } });
  if (error || data?.error || !data) throw metaReadError(error, 'Não foi possível consultar os dados da Meta.');
  return presentMetaReading(data);
}

export async function loadGestorReviews(db, { profile, modules, clientId, period }) {
  const range = checkedPeriod(period);
  await authorizeClient(db, profile, modules, clientId);
  return readAll(() => db.from('traffic_weekly_reviews')
    .select('id,client_id,week_start,kind,result_label,investment,contacts,results,analysis,data_note,action_draft,finalized_at,updated_at')
    .eq('client_id', clientId).eq('kind', 'review').gte('week_start', range.since).lte('week_start', range.until).order('week_start').order('id'));
}

async function requestDecisionAnalysis(db, action, clientId, memoryIds, { accountId, context } = {}) {
  const { data, error } = await db.functions.invoke('gestor-ia-decisions', { body: {
    action, client_id: clientId, ...(accountId && { account_id: accountId }), ...(context && { context }),
    ...(memoryIds.length ? { memory_ids: memoryIds } : {}),
  } });
  if (!error && data?.period) {
    if (action !== 'prepare' && Array.isArray(data.suggestions)) return data;
    if (action === 'prepare' && /^[a-f0-9]{64}$/.test(data.context || '') && data.metrics && typeof data.metrics === 'object' &&
      ['account', 'summary'].includes(data.source)) return data;
  }
  const messages = {
    AUTH: 'Entre novamente no Planeje.', FORBIDDEN: 'Você não tem acesso a esta leitura da Meta.',
    DISABLED: 'A análise com IA ainda não está ativa neste ambiente.',
    PILOT_SCOPE: 'A análise com IA está disponível apenas no piloto.',
    PILOT_USED: 'A tentativa autorizada deste piloto já foi usada.',
    PILOT_STORAGE: 'Não foi possível confirmar a trava do piloto no Planeje.',
    MEMORY_CHANGED: 'Uma anotação mudou. Abra a análise e escolha os trechos novamente.',
    MEMORY_SCOPE: 'Um aprendizado pertence a outro recorte. Confira a conta e as campanhas da análise.',
    MEMORY_SOURCE: 'Não foi possível consultar as anotações do Atlas.',
    CONTEXT_CHANGED: 'Os dados da análise mudaram. Confira o contexto novamente.',
    NO_LINK: accountId ? 'A conta escolhida não está vinculada ao cliente.' : 'Este cliente precisa de uma conta Meta vinculada.',
    NO_DATA: 'Atualize o resumo da Meta no Tráfego para analisar este cliente.',
    NO_ACCOUNT_DATA: 'Esta conta precisa de sete dias fechados na leitura salva.',
    SOURCE: 'Não foi possível consultar as leituras salvas e as metas deste cliente.',
    RATE_LIMIT: 'Aguarde um minuto para solicitar outra análise.',
    PROVIDER_CONFIG: 'Confira a configuração da OpenAI no Planeje.',
    PROVIDER_LIMIT: 'A OpenAI recusou a análise por limite ou cota.',
    PROVIDER_UNAVAILABLE: 'O Planeje não conseguiu receber a resposta da OpenAI.',
    PROVIDER_INCOMPLETE: 'A OpenAI devolveu uma leitura incompleta.',
    PROVIDER_INVALID: 'A IA devolveu uma resposta que o Planeje não conseguiu validar.',
  };
  let body;
  try { body = await error?.context?.clone().json(); } catch { /* O gateway pode devolver HTML. */ }
  const fallback = action === 'prepare' ? 'Não foi possível conferir o contexto. Tente novamente em instantes.'
    : action === 'analyze' ? 'A resposta da análise ficou indisponível. Confira a disponibilidade do piloto antes de tentar de novo.'
      : 'A IA não concluiu a análise. Tente novamente em instantes.';
  const known = Object.hasOwn(messages, body?.code);
  throw Object.assign(new Error(known ? messages[body.code] : fallback), { code: known ? body.code : null });
}

export function prepareGestorDecisionAnalysis(db, clientId, memoryIds = [], accountId) {
  return requestDecisionAnalysis(db, 'prepare', clientId, memoryIds, { accountId });
}

export function loadGestorDecisionAnalysis(db, clientId, memoryIds = [], scope) {
  return requestDecisionAnalysis(db, scope ? 'analyze' : undefined, clientId, memoryIds, scope);
}

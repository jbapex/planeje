import { previousMetaPeriod, selectMetaHistory, sumMetaRows } from './history.js';

export const PORTFOLIO_BATCH_SIZE = 8;
export const portfolioScopeKey = ({ clientId, accountId }) => `${clientId}:${accountId}`;

export async function authorizedPortfolioScopes(caller, scopes, normalizeAccount) {
  const clientIds = [...new Set(scopes.map(({ clientId }) => clientId))];
  const [clients, ...permissions] = await Promise.all([
    caller.from('clientes').select('id').in('id', clientIds).eq('etapa', 'closed'),
    ...clientIds.map((id) => caller.rpc('central_trafego_can_access_client', { p_cliente_id: id })),
  ]);
  if (clients.error || !Array.isArray(clients.data) || permissions.some(({ error, data }) => error || typeof data !== 'boolean')) {
    throw new Error('Carteira indisponível.');
  }
  const allowed = new Set(clients.data.map(({ id }) => id).filter((id) => permissions[clientIds.indexOf(id)]?.data === true));
  const candidates = scopes.filter(({ clientId }) => allowed.has(clientId));
  if (!candidates.length) return [];
  const accounts = [...new Set(candidates.flatMap(({ accountId }) => [accountId, accountId.slice(4)]))];
  const { data: links, error } = await caller.from('cliente_meta_accounts').select('cliente_id,meta_account_id')
    .in('cliente_id', [...allowed]).in('meta_account_id', accounts).eq('is_active', true);
  if (error || !Array.isArray(links)) throw new Error('Vínculos indisponíveis.');
  const linked = new Set(links.map(({ cliente_id, meta_account_id }) => portfolioScopeKey({ clientId: cliente_id, accountId: normalizeAccount(meta_account_id) })));
  return candidates.filter((scope) => linked.has(portfolioScopeKey(scope)));
}

function campaignSeries(history, reading) {
  const range = reading.period;
  if (!history?.period || history.period.since > range.since || history.period.until < range.until ||
      !(Date.parse(history.fetchedAt) >= Date.parse(reading.fetchedAt))) return null;
  const direct = history.campaignPartial === false && Array.isArray(history.campaignDays);
  const source = direct ? history.campaignDays : history.adsPartial === false ? history.adDays : null;
  if (!Array.isArray(source)) return null;
  const groups = new Map();
  for (const row of source) {
    if (!row.campaign_id || !row.date_start || row.date_start < range.since || row.date_start > range.until) continue;
    const key = `${row.campaign_id}:${row.date_start}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return [...groups.values()].map((rows) => ({ ...sumMetaRows(rows)[0], campaign_id: rows[0].campaign_id, date_start: rows[0].date_start }));
}

function project(reading, history, includeEntities) {
  if (!reading) return null;
  const { period, fetchedAt, accountRows, dailyRows, dailyPartial, partial, derived, campaigns, campaignMetricsPartial } = reading;
  const campaignRows = !includeEntities && Array.isArray(campaigns) ? campaigns.map(({ id, objective, insights }) => ({ id, objective, insights })) : campaigns;
  return { period, fetchedAt, accountRows, dailyRows, dailyPartial, partial, derived, campaigns: campaignRows, campaignMetricsPartial,
    campaignDays: campaignSeries(history, reading) };
}

export async function readCachedPortfolioReadings(cache, scopes, period) {
  return Promise.all(scopes.map(async (scope) => {
    const { clientId, accountId } = scope;
    const { reading, history } = await cache.metrics(clientId, accountId, period, false);
    if (!reading) return { ...scope, reading: null, prior: null };
    const priorPeriod = previousMetaPeriod(reading.period);
    const historical = selectMetaHistory(history, priorPeriod);
    const exactComparison = reading.comparison?.period?.since === priorPeriod.since && reading.comparison?.period?.until === priorPeriod.until;
    const prior = historical?.exact ? historical : exactComparison ? { ...reading.comparison, fetchedAt: reading.fetchedAt } : null;
    return { ...scope, reading: project(reading, history, true), prior: project(prior, history, false) };
  }));
}

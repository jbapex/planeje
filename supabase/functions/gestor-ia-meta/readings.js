import { periodKey } from './cache.js';
import { previousMetaPeriod, rollingMetaPeriod, selectMetaHistory } from './history.js';
import { readCachedMetaReport } from './report.js';
import { buildPortalPerformance, readSharedPortalPerformance } from './portal.js';
import { PORTAL_PERFORMANCE_OBJECTIVES } from '../../../src/lib/gestorIaPortalPerformance.js';

import { authorizedPortfolioScopes, PORTFOLIO_BATCH_SIZE, portfolioScopeKey, readCachedPortfolioReadings } from './portfolio.js';

const GRAPH = 'https://graph.facebook.com/v24.0';
const OVERVIEW = 'get-gestor-accounts-overview';
const READING = 'get-gestor-metrics';
const GOAL_READINGS = 'get-gestor-goal-readings';
const PORTFOLIO_READINGS = 'get-gestor-portfolio-readings';
const REPORT_READING = 'get-gestor-report-reading';
const PORTAL_READING = 'get-gestor-portal-metrics';
const PORTAL_PREVIEW = 'get-gestor-portal-metrics-preview';
const REFRESH = 'refresh-gestor-metrics';
const CAMPAIGNS = 'get-campaigns';
const INSIGHTS = 'get-campaign-insights';
const PROFILE_VISITS = 'instagram_profile_visits';
const THRUPLAYS = 'video_thruplay_watched_actions';
const LINK_CLICKS = 'inline_link_clicks';
const METRICS = 'spend,impressions,clicks,reach,frequency,actions,action_values,account_currency,date_start,date_stop';
const HISTORY_METRICS = `spend,impressions,clicks,actions,action_values,account_currency,date_start,${THRUPLAYS},${PROFILE_VISITS}`;
const ENTITY = 'id,name,status,configured_status,effective_status';
const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const META_LIMITS = new Set([4, 17, 32, 613, 80004]);
const accountId = (value) => typeof value === 'string' && /^(act_)?\d{1,32}$/.test(value) ? `act_${value.replace(/^act_/, '')}` : null;
const currency = (value) => typeof value === 'string' && /^[A-Z]{3}$/.test(value) ? value : null;
const amount = (value) => {
  if (!['number', 'string'].includes(typeof value) || !/^\d+(\.\d+)?$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed <= Number.MAX_SAFE_INTEGER ? parsed : null;
};

function last30Days(now) {
  const parts = new Intl.DateTimeFormat('en', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const part = (name) => parts.find(({ type }) => type === name).value;
  const until = `${part('year')}-${part('month')}-${part('day')}`;
  const since = new Date(Date.parse(until) - 29 * 86400000).toISOString().slice(0, 10);
  return { since, until };
}

function graphReader(token, graphFetch) {
  let rateLimited = false;
  const unavailable = new Set();
  async function get(path, params, timeout = 6500) {
    if (rateLimited) return {};
    let requestedFields = params.fields;
    for (const field of unavailable) requestedFields = requestedFields.replaceAll(`,${field}`, '');
    try {
      const response = await graphFetch(`${GRAPH}/${path}?${new URLSearchParams({ ...params, fields: requestedFields })}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
        redirect: 'error',
        signal: AbortSignal.timeout(timeout),
      });
      if (response.status === 429) {
        rateLimited = true;
        return {};
      }
      const data = await response.json();
      const code = Number(data?.error?.code);
      if (META_LIMITS.has(code)) rateLimited = true;
      const message = data?.error?.message;
      const optionalField = [100, 200].includes(code) && typeof message === 'string' && [PROFILE_VISITS, THRUPLAYS, LINK_CLICKS].find((field) =>
        requestedFields.includes(field) && message.includes(field));
      if (optionalField) {
        unavailable.add(optionalField);
        return get(path, params, timeout);
      }
      return response.ok && !data?.error ? { data } : { code };
    } catch {
      return {};
    }
  }
  return { get, limited: () => rateLimited };
}

async function readAccount(id, get, period, showBilling) {
  const base = 'id,account_status,currency,timezone_name';
  const withBusiness = `${base},business{id,name}`;
  const deniedField = (result) => result.code === 100 || result.code === 200;
  async function metadata() {
    let result = await get(id, { fields: showBilling ? `${withBusiness},is_prepay_account,balance` : withBusiness });
    // A Meta pode recusar um campo opcional e rejeitar a requisição inteira.
    if (showBilling && deniedField(result)) result = await get(id, { fields: withBusiness });
    return (deniedField(result) ? await get(id, { fields: base }) : result).data;
  }
  const [meta, insights] = await Promise.all([
    metadata(), get(`${id}/insights`, { level: 'account', fields: 'spend,account_currency', time_range: JSON.stringify(period) }),
  ]);
  const fields = meta?.id === id ? meta : null;
  const rows = insights.data?.data;
  const total = Array.isArray(rows) && rows.length === 1 && !insights.data?.paging?.next ? rows[0] : null;
  const accountCurrency = currency(fields?.currency);
  const spendCurrency = currency(total?.account_currency);
  const spend = spendCurrency && (!accountCurrency || spendCurrency === accountCurrency) ? amount(total.spend) : null;
  const prepaid = showBilling && typeof fields?.is_prepay_account === 'boolean' ? fields.is_prepay_account : null;
  const balance = showBilling && prepaid === false && accountCurrency === 'BRL' ? amount(fields?.balance) : null;
  return {
    id,
    status: Number.isInteger(fields?.account_status) ? fields.account_status : null,
    business: typeof fields?.business?.id === 'string' && /^\d{1,32}$/.test(fields.business.id) ? {
      id: fields.business.id, name: typeof fields.business.name === 'string' ? fields.business.name : null,
    } : null,
    timezone: typeof fields?.timezone_name === 'string' ? fields.timezone_name : null,
    currency: accountCurrency || spendCurrency,
    spend30d: spend,
    // shortcut: converter só BRL pós-pago até validar a escala e o saldo das demais modalidades.
    billingBalance: Number.isSafeInteger(balance) ? balance / 100 : null,
    prepaid,
  };
}

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}

function fields(row, keys) {
  return Object.fromEntries(keys.split(',').filter((key) => ['number', 'string'].includes(typeof row?.[key])).map((key) => [key, row[key]]));
}

function insightRows(rows) {
  return rows.map((row) => {
    const visits = amount(row?.[PROFILE_VISITS]);
    const links = amount(row?.[LINK_CLICKS]);
    const play = Array.isArray(row?.[THRUPLAYS]) ? row[THRUPLAYS].find((action) => action?.action_type === 'video_view') : null;
    return {
      ...fields(row, METRICS),
      ...Object.fromEntries(['actions', 'action_values'].filter((key) => Array.isArray(row?.[key]))
        .map((key) => [key, row[key].map((action) => fields(action, 'action_type,value'))])),
      ...(visits !== null && { [PROFILE_VISITS]: row[PROFILE_VISITS] }),
      ...(links !== null && { [LINK_CLICKS]: row[LINK_CLICKS] }),
      ...(amount(play?.value) !== null && { [THRUPLAYS]: [fields(play, 'action_type,value')] }),
    };
  });
}

function campaignTree(rows) {
  let partial = false;
  function page(value, project) {
    if (!Array.isArray(value?.data)) return undefined;
    if (value.paging?.next) partial = true;
    return { data: project(value.data) };
  }
  const entity = (row) => ({ ...fields(row, ENTITY), insights: page(row?.insights, insightRows) });
  const adset = (row) => ({ ...entity(row), ads: page(row?.ads, (ads) => ads.map(entity)) });
  const campaigns = rows.map((row) => ({
    ...entity(row), ...fields(row, 'objective'), adsets: page(row?.adsets, (adsets) => adsets.map(adset)),
  }));
  return { campaigns, partial };
}

function activeMeasuredAds(campaigns, adDays) {
  const measured = new Set(adDays.map(({ ad_id }) => ad_id));
  const active = (entity) => (entity.effective_status || entity.status) === 'ACTIVE';
  return [...new Set(campaigns.filter(active).flatMap((campaign) => (campaign.adsets?.data || []).filter(active)
    .flatMap((set) => (set.ads?.data || []).filter((ad) => active(ad) && measured.has(ad.id)).map(({ id }) => id))))];
}

async function detailedReading(get, action, id, period, daily) {
  const timeRange = JSON.stringify(period);
  if (action === INSIGHTS) {
    const result = await get(`${id}/insights`, { level: 'account', fields: `${METRICS},${THRUPLAYS}`, limit: '500', time_range: timeRange,
      ...(daily ? { time_increment: '1' } : {}) });
    if (!Array.isArray(result.data?.data)) return null;
    return { campaigns: insightRows(result.data.data), partial: Boolean(result.data.paging?.next) };
  }

  const insights = (metrics) => `insights.time_range(${timeRange}).fields(${metrics})`;
  const top = `${ENTITY},objective,${insights(`${METRICS},${THRUPLAYS},${PROFILE_VISITS}`)}`;
  const sets = `${ENTITY},${insights(METRICS)}`;
  const [first, account] = await Promise.all([
    get(`${id}/campaigns`, { fields: `${top},adsets.limit(25){${sets},ads.limit(25){${sets}}}`, limit: '50' }),
    get(id, { fields: 'account_status,disable_reason' }),
  ]);
  const fallback = !first.data && [100, 200].includes(first.code);
  const result = fallback ? await get(`${id}/campaigns`, { fields: `${top},adsets.limit(25){${sets}}`, limit: '50' }) : first;
  if (!Array.isArray(result.data?.data)) return null;
  const tree = campaignTree(result.data.data);
  const status = fields(account.data, 'account_status,disable_reason');
  const campaignMetricsPartial = Boolean(result.data.paging?.next);
  return { campaigns: tree.campaigns.map((row) => ({ ...row, ...status })), campaignMetricsPartial,
    partial: fallback || tree.partial || campaignMetricsPartial };
}

async function entityHistory(get, id, period, level, pages) {
  const idFields = level === 'ad' ? ['campaign_id', 'adset_id', 'ad_id'] : ['campaign_id'];
  const identifiers = level === 'ad' ? 'campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name' : 'campaign_id,campaign_name';
  const metrics = level === 'ad' ? `${HISTORY_METRICS},frequency,${LINK_CLICKS}` : HISTORY_METRICS;
  const days = [];
  const seen = new Set();
  let cursor = null, partial = false;
  for (let page = 0; page < pages; page += 1) {
    const result = await get(`${id}/insights`, {
      level, time_increment: '1', fields: `${metrics},${identifiers}`, limit: '500',
      time_range: JSON.stringify(period), ...(cursor ? { after: cursor } : {}),
    }, 12000);
    if (!Array.isArray(result.data?.data)) return days.length ? { days, partial: true } : null;
    for (const row of result.data.data) {
      if (!validDate(row?.date_start) || row.date_start < period.since || row.date_start > period.until) continue;
      if (!idFields.every((key) => /^\d{1,32}$/.test(row[key] ?? ''))) continue;
      const key = `${row.date_start}:${row[idFields.at(-1)]}`;
      if (seen.has(key)) continue;
      seen.add(key);
      days.push({ ...insightRows([row])[0], ...fields(row, identifiers) });
    }
    partial = Boolean(result.data.paging?.next);
    const next = result.data.paging?.cursors?.after;
    if (!partial || typeof next !== 'string' || next.length > 512 || cursor === next) break;
    cursor = next;
  }
  return { days, partial };
}

async function historyDetails(get, id, period) {
  const start = new Date(period.since);
  const ymd = (offset, day) => new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + offset, day)).toISOString().slice(0, 10);
  // shortcut: uma página de anúncios por mês; ampliar só com a cota de API medida.
  const adMonths = await Promise.all([0, 1, 2].map((offset) => entityHistory(get, id,
    { since: ymd(offset, 1), until: offset === 2 ? period.until : ymd(offset + 1, 0) }, 'ad', 1)));
  const adsPartial = adMonths.some((month) => !month || month.partial);
  const campaigns = adsPartial ? await entityHistory(get, id, period, 'campaign', 3) : null;
  if (adMonths.every((month) => !month) && !campaigns) return null;
  return { adDays: adMonths.flatMap((month) => month?.days || []), adsPartial,
    ...(campaigns ? { campaignDays: campaigns.days, campaignPartial: campaigns.partial } : {}) };
}

async function insightPair(get, id, period, historyPeriod, accountDays) {
  const covered = period.since >= historyPeriod.since && period.until <= historyPeriod.until;
  async function getDaily() {
    const saved = covered ? await accountDays : null;
    if (saved && !saved.partial) return { campaigns: saved.campaigns.filter(({ date_start }) => date_start >= period.since && date_start <= period.until) };
    return detailedReading(get, INSIGHTS, id, period, true);
  }
  const [total, daily] = await Promise.all([
    detailedReading(get, INSIGHTS, id, period, false),
    getDaily(),
  ]);
  if (!total || !daily || total.partial || total.campaigns.length > 1) return null;
  if (new Set(daily.campaigns.map(({ date_start }) => date_start)).size !== daily.campaigns.length ||
    daily.campaigns.some(({ date_start }) => !validDate(date_start) || date_start < period.since || date_start > period.until)) return null;
  return { period, accountRows: total.campaigns, dailyRows: daily.campaigns, dailyPartial: daily.partial };
}

async function refreshReading(cache, { clientId, id, period, compare, showBilling, readToken, graphFetch, now }) {
  const previous = await cache.metrics(clientId, id, period);
  const accountPeriod = last30Days(now);
  if (period.since > accountPeriod.until) return { ...previous, refreshStatus: 'future' };
  const until = period.until > accountPeriod.until ? accountPeriod.until : period.until;
  const earliest = new Date(Date.parse(until) - 91 * 86400000).toISOString().slice(0, 10);
  const actual = { since: period.since < earliest ? earliest : period.since, until };
  const { lease, retryAt } = await cache.reserve(clientId, id);
  if (!lease) return { ...previous, refreshStatus: 'cooldown', retryAt };
  let metrics, overview, history, limited = false;
  const rows = [];
  try {
    const token = await readToken();
    if (token) {
      const graph = graphReader(token, graphFetch);
      const historyPeriod = rollingMetaPeriod(accountPeriod.until);
      const accountDays = detailedReading(graph.get, INSIGHTS, id, historyPeriod, true);
      const [tree, current, comparison, account, daily, ads] = await Promise.all([
        detailedReading(graph.get, CAMPAIGNS, id, actual, false),
        insightPair(graph.get, id, actual, historyPeriod, accountDays),
        compare ? insightPair(graph.get, id, previousMetaPeriod(actual), historyPeriod, accountDays) : null,
        readAccount(id, graph.get, accountPeriod, showBilling),
        accountDays,
        historyDetails(graph.get, id, historyPeriod),
      ]);
      limited = graph.limited();
      if (!limited && tree && current && (!compare || comparison)) {
        metrics = { ...current, ...tree, comparison: comparison || null };
        rows.push({ janela: periodKey(actual), dados: metrics });
        const previousHistory = previous.history;
        const replacesCompleteAds = ads?.adsPartial && previousHistory?.adsPartial === false && periodKey(previousHistory.period) === periodKey(historyPeriod);
        if (!replacesCompleteAds && (ads || !previousHistory?.adDays?.length) && daily && !daily.partial &&
          new Set(daily.campaigns.map(({ date_start }) => date_start)).size === daily.campaigns.length &&
          daily.campaigns.every(({ date_start }) => validDate(date_start) && date_start >= historyPeriod.since && date_start <= historyPeriod.until)) {
          history = { period: historyPeriod, accountDays: daily.campaigns, ...(ads || { adDays: [], adsPartial: true }),
            timezone: account.timezone, activeAdIds: activeMeasuredAds(tree.campaigns, ads?.adDays || []),
            campaignMeta: Object.fromEntries(tree.campaigns.filter(({ id }) => id).map((row) => [row.id, fields(row, `${ENTITY},objective,account_status,disable_reason`)])) };
          rows.push({ janela: 'historico', dados: history });
        }
        if (account.status != null || account.business || account.spend30d != null) {
          const [old] = await cache.accounts(clientId, [id]);
          // Uma leitura parcial ou sem autorização de cobrança não apaga o último dado completo.
          if (!old || (old.spend30d == null || account.spend30d != null) &&
            (old.status == null || account.status != null) && (!old.business || account.business) &&
            (old.prepaid == null || account.prepaid != null) && (old.billingBalance == null || account.billingBalance != null)) {
            overview = { ...account, period: accountPeriod };
            rows.push({ janela: 'conta', dados: overview });
          }
        }
      }
    }
  } catch {
    rows.length = 0;
    metrics = overview = history = null;
  }
  const fetchedAt = await cache.finish(lease, rows, limited);
  if (!fetchedAt) throw new Error('Reserva de atualização expirou.');
  if (!metrics) {
    return { ...previous, refreshStatus: limited ? 'rate-limited' : 'failed',
      retryAt: limited ? new Date(Date.parse(fetchedAt) + 15 * 60000).toISOString() : retryAt };
  }
  const savedHistory = history ? { ...history, fetchedAt } : previous.history;
  const historicalComparison = selectMetaHistory(savedHistory, actual)?.comparison;
  return { exact: periodKey(actual) === periodKey(period), reading: { ...metrics, fetchedAt, coverage: savedHistory?.period,
    comparison: metrics.comparison || historicalComparison || null }, history: savedHistory, refreshStatus: 'updated', retryAt,
    overview: overview ? { ...overview, fetchedAt } : null };
}

async function readGoalReadings(caller, makeCache, goalIds, period) {
  // O cliente autenticado aplica a RLS das metas, inclusive carteira, módulos e campos.
  const { data: goals, error } = await caller.from('gestor_ia_metas_campanha').select('id,client_id,account_id')
    .in('id', goalIds).eq('is_active', true).eq('is_primary', true);
  if (error) throw error;
  if (!goals.length) return [];
  const accounts = [...new Set(goals.map(({ account_id }) => account_id))];
  const { data: links, error: linkError } = await caller.from('cliente_meta_accounts').select('cliente_id,meta_account_id')
    .in('cliente_id', [...new Set(goals.map(({ client_id }) => client_id))])
    .in('meta_account_id', accounts.flatMap((id) => [id, id.slice(4)])).eq('is_active', true);
  if (linkError) throw linkError;
  const linked = new Set(links.map((link) => `${link.cliente_id}:${accountId(link.meta_account_id)}`));
  const eligible = goals.filter((goal) => linked.has(`${goal.client_id}:${goal.account_id}`));
  if (!eligible.length) return [];

  const cache = makeCache();
  const results = await Promise.all(eligible.map(async ({ id, client_id, account_id }) => {
    const { reading } = await cache.metrics(client_id, account_id, period, false);
    if (!reading) return null;
    return { goalId: id, accountId: account_id, reading: {
      period: reading.period, fetchedAt: reading.fetchedAt, derived: reading.derived,
      partial: reading.partial, campaignMetricsPartial: reading.campaignMetricsPartial,
      accountRows: insightRows((reading.accountRows || []).slice(0, 1)),
      campaigns: (reading.campaigns || []).map((campaign) => ({ id: campaign.id, objective: campaign.objective,
        insights: { data: insightRows((campaign.insights?.data || []).slice(0, 1)) } })),
    } };
  }));
  return results.filter(Boolean);
}

export async function getGestorMeta({ req, body, makeCaller, makeCache, readToken, graphFetch = fetch, now = new Date(), corsHeaders = {} }) {
  const json = (data, status = 200) => Response.json(data, { status, headers: { ...corsHeaders, 'Cache-Control': 'no-store' } });
  const fail = (status, message) => json({ error: { message } }, status);
  if (req.method !== 'POST') return fail(405, 'Método não aceito.');
  const token = req.headers.get('authorization')?.match(/^Bearer ([^\s]+)$/i)?.[1];
  if (!token) return fail(401, 'Sessão obrigatória.');

  try {
    const caller = makeCaller(token);
    const { data: auth, error: authError } = await caller.auth.getUser(token);
    if (authError || !auth?.user?.id) return fail(401, 'Sessão inválida.');
    const actor = auth.user.id;
    const clienteId = body?.cliente_id;
    const action = body?.action;
    if (action === PORTAL_READING) {
      if (Object.keys(body).some((key) => key !== 'action')) return fail(400, 'Consulta inválida.');
      return json(await readSharedPortalPerformance(caller, makeCache, now));
    }
    const byGoal = action === GOAL_READINGS;
    const byPortfolio = action === PORTFOLIO_READINGS;
    const byReport = action === REPORT_READING;
    const byPortalPreview = action === PORTAL_PREVIEW;
    if (!byGoal && !byPortfolio && (typeof clienteId !== 'string' || !UUID.test(clienteId))) return fail(400, 'Cliente inválido.');
    if (![OVERVIEW, READING, GOAL_READINGS, PORTFOLIO_READINGS, REPORT_READING, PORTAL_PREVIEW, REFRESH, CAMPAIGNS, INSIGHTS].includes(action)) return fail(400, 'Consulta inválida.');
    if (byPortalPreview && !Object.hasOwn(PORTAL_PERFORMANCE_OBJECTIVES, body.objective)) return fail(400, 'Indicador inválido.');
    const since = body?.time_range?.since;
    const until = body?.time_range?.until;
    const period = { since, until };
    const validPeriod = validDate(since) && validDate(until) && since <= until;
    const requested = action === OVERVIEW || byGoal || byPortfolio ? null : accountId(body.ad_account_id);
    const goalIds = body?.goal_ids;
    if (byGoal && (!validPeriod || !since.endsWith('-01') || since.slice(0, 7) !== until.slice(0, 7) ||
      !Array.isArray(goalIds) || goalIds.length < 1 || goalIds.length > 10 || goalIds.some((id) => typeof id !== 'string' || !UUID.test(id)))) {
      return fail(400, 'Metas ou mês inválidos.');
    }
    const scopes = byPortfolio && Array.isArray(body.scopes) && body.scopes.length <= PORTFOLIO_BATCH_SIZE
      ? body.scopes.map((scope) => ({ clientId: scope?.cliente_id, accountId: accountId(scope?.ad_account_id) })) : null;
    if (byPortfolio && (!validPeriod || !scopes?.length || Object.keys(body).some((key) => !['action', 'scopes', 'time_range'].includes(key)) ||
        scopes.some(({ clientId, accountId }) => typeof clientId !== 'string' || !UUID.test(clientId) || !accountId))) return fail(400, 'Carteira ou período inválidos.');
    const requiresAccount = !byReport || body.ad_account_id != null;
    if (!byGoal && !byPortfolio && !byPortalPreview && action !== OVERVIEW && ((requiresAccount && !requested) || !validPeriod)) {
      return fail(400, 'Conta ou período inválido.');
    }
    const [active, profile] = await Promise.all([
      caller.rpc('planeje_current_account_access'),
      caller.from('profiles').select('role,status').eq('id', actor).maybeSingle(),
    ]);
    const role = profile.data?.role;
    const allowedRole = ['admin', 'superadmin'].includes(role) || role === 'colaborador' && !byGoal && !byReport && !byPortalPreview;
    if (active.error || active.data !== true || profile.error || profile.data?.status !== 'active' || !allowedRole) {
      return fail(403, 'Acesso indisponível.');
    }
    if (byGoal) return json({ readings: await readGoalReadings(caller, makeCache, [...new Set(goalIds)], period) });

    async function paidAccess() {
      const [global, individual] = await Promise.all([
        caller.from('module_settings').select('is_enabled').eq('module_name', 'paid_traffic').maybeSingle(),
        caller.from('user_module_permissions').select('is_enabled').eq('module_name', 'paid_traffic').eq('user_id', actor).maybeSingle(),
      ]);
      return !global.error && !individual.error && (individual.data?.is_enabled ?? global.data?.is_enabled ?? true) === true;
    }

    async function fieldAccess(field, defaultAllowed) {
      if (role === 'superadmin') return true;
      const [byRole, byUser] = await Promise.all([
        caller.from('client_field_permissions').select('can_view').eq('role', role).eq('field_name', field).maybeSingle(),
        caller.from('user_client_field_permissions').select('can_view').eq('user_id', actor).eq('field_name', field).maybeSingle(),
      ]);
      return !byRole.error && !byUser.error && (byUser.data ?? byRole.data ?? { can_view: defaultAllowed }).can_view === true;
    }

    if (byPortfolio) {
      const permissions = await Promise.all([paidAccess(), fieldAccess('meta_resumo', true)]);
      if (permissions.some((allowed) => !allowed)) return fail(403, 'Acesso às métricas da carteira indisponível.');
      const unique = [...new Map(scopes.map((scope) => [portfolioScopeKey(scope), scope])).values()];
      const authorized = await authorizedPortfolioScopes(caller, unique, accountId);
      return json({ readings: authorized.length ? await readCachedPortfolioReadings(makeCache(), authorized, period) : [] });
    }

    const [acl, paid] = await Promise.all([caller.rpc('central_trafego_can_access_client', { p_cliente_id: clienteId }), paidAccess()]);
    if (acl.error || acl.data !== true || !paid) return fail(403, 'Acesso indisponível.');
    const client = await caller.from('clientes').select('id').eq('id', clienteId).eq('etapa', 'closed').maybeSingle();
    if (client.error || !client.data) return fail(404, 'Cliente indisponível.');
    if (!(await fieldAccess('meta_resumo', true))) return fail(403, 'Acesso ao resumo Meta indisponível.');
    if (byReport || byPortalPreview) {
      const [showSpend, globalReports, userReports] = await Promise.all([
        fieldAccess('valor', false),
        caller.from('module_settings').select('is_enabled').eq('module_name', 'reports').maybeSingle(),
        caller.from('user_module_permissions').select('is_enabled').eq('module_name', 'reports').eq('user_id', actor).maybeSingle(),
      ]);
      if (!showSpend || globalReports.error || userReports.error || (userReports.data?.is_enabled ?? globalReports.data?.is_enabled ?? true) !== true) {
        return fail(403, 'Acesso ao relatório salvo indisponível.');
      }
    }
    if (byPortalPreview) {
      const source = await makeCache().portalHistories(clienteId, null);
      return source ? json({ shared: true, clientId: clienteId, ...buildPortalPerformance(source, body.objective, now) })
        : fail(404, 'Cliente indisponível.');
    }

    const ids = new Set();
    for (let start = 0;;) {
      const links = await caller.from('cliente_meta_accounts').select('meta_account_id').eq('cliente_id', clienteId)
        .eq('is_active', true).order('id').range(start, start + 499);
      if (links.error || !Array.isArray(links.data)) return fail(503, 'Vínculos Meta indisponíveis.');
      if (!links.data.length) break;
      for (const row of links.data) {
        const id = accountId(row.meta_account_id);
        if (id) ids.add(id);
      }
      start += links.data.length;
    }

    if (requested && !ids.has(requested)) return fail(403, 'Conta não vinculada ao cliente.');
    if (byReport) return json(ids.size ? await readCachedMetaReport(makeCache(), clienteId, requested ? [requested] : [...ids], period, body.compare === true)
      : { report: null, reason: 'NO_ACCOUNTS' });
    if (!ids.size) return json({ accounts: [], period: null, fetchedAt: null });
    const cache = makeCache();
    if (action === READING) return json(await cache.metrics(clienteId, requested, period));
    if (action === CAMPAIGNS || action === INSIGHTS) {
      // Compatibilidade com as abas abertas antes da publicação do cache.
      const { reading, exact } = await cache.metrics(clienteId, requested, period, false);
      if (!reading || !exact) return fail(404, 'Período ainda sem leitura salva.');
      if (action === CAMPAIGNS) return json({ campaigns: reading.campaigns, partial: reading.partial });
      const daily = body.time_increment === 1;
      return json({ campaigns: daily ? reading.dailyRows : reading.accountRows, partial: daily && reading.dailyPartial });
    }
    const showBilling = await fieldAccess('valor', false);
    if (action === REFRESH) {
      return json(await refreshReading(cache, { clientId: clienteId, id: requested, period, compare: body.compare === true,
        showBilling, readToken, graphFetch, now }));
    }
    const accounts = (await cache.accounts(clienteId, [...ids])).map((row) => showBilling ? row : { ...row, billingBalance: null, prepaid: null });
    const first = accounts[0]?.period;
    const commonPeriod = first && accounts.every((item) => item.period?.since === first.since && item.period?.until === first.until) ? first : null;
    return json({ accounts, period: commonPeriod, fetchedAt: accounts.map(({ fetchedAt }) => fetchedAt).sort().at(-1) || null });
  } catch {
    return fail(503, body?.action === GOAL_READINGS ? 'Não foi possível consultar o progresso das metas.'
      : body?.action === PORTFOLIO_READINGS ? 'Não foi possível consultar as métricas salvas da carteira.'
      : body?.action === REPORT_READING ? 'Não foi possível consultar a leitura salva do relatório.'
        : [PORTAL_READING, PORTAL_PREVIEW].includes(body?.action) ? 'Não foi possível consultar os números do portal.' : 'Não foi possível consultar as contas na Meta.');
  }
}

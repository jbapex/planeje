import { PORTFOLIO_BATCH_SIZE, portfolioScopeKey } from '../../../supabase/functions/gestor-ia-meta/portfolio.js';
import { goalAccountId } from './gestorIaMediaGoalData.js';
import { presentMetaReading } from './gestorIaHistoryView.js';
import { MEDIA_GOAL_OBJECTIVES, matchesMediaGoal, needsMediaGoalMeasurement } from './gestorIaMediaGoalModel.js';
import { metricValue, normalizeInsight, previousPeriod } from './gestorIaMetricModel.js';

const ADDITIVE = ['spend', 'impressions', 'clicks', 'messages', 'leads', 'purchases', 'landingPageViews', 'postEngagements', 'thruPlays', 'instagramProfileVisits'];
const COSTS = { leads: 'cpl', mensagens: 'costMessage', compras: 'costPurchase', trafego: 'costVisit',
  alcance: 'cpm', engajamento: 'costEngagement', video: 'costThruPlay', perfil_instagram: 'costProfileVisit' };
const samePeriod = (a, b) => a?.since === b?.since && a?.until === b?.until;

export function portfolioMetricScopes(clients, selectedAccount) {
  const byAccount = new Map();
  for (const client of clients) {
    for (const { meta_account_id, meta_account_name } of client.metaAccounts || []) {
      if (!meta_account_id) continue;
      const accountId = goalAccountId(meta_account_id);
      if (selectedAccount && accountId !== goalAccountId(selectedAccount)) continue;
      if (!byAccount.has(accountId)) byAccount.set(accountId, new Map());
      const goals = client.mediaGoals?.filter((goal) => goal.is_active && goal.account_id === accountId) ?? null;
      byAccount.get(accountId).set(client.id, { clientId: client.id, clientName: client.empresa, accountId,
        accountName: meta_account_name || accountId, objective: client.objetivo_meta, goals });
    }
  }
  const unique = [...byAccount.values()].filter((clients) => clients.size === 1);
  return { scopes: unique.flatMap((items) => [...items.values()]), sharedAccounts: byAccount.size - unique.length };
}

export async function loadPortfolioMetricReadings(db, scopes, period) {
  const result = [];
  for (let start = 0; start < scopes.length; start += PORTFOLIO_BATCH_SIZE) {
    const batch = scopes.slice(start, start + PORTFOLIO_BATCH_SIZE);
    const expected = new Set(batch.map(portfolioScopeKey));
    const { data, error } = await db.functions.invoke('gestor-ia-meta', { body: {
      action: 'get-gestor-portfolio-readings', time_range: { since: period.since, until: period.until },
      scopes: batch.map(({ clientId, accountId }) => ({ cliente_id: clientId, ad_account_id: accountId })),
    } });
    if (error || !Array.isArray(data?.readings)) {
      const accessDenied = [401, 403].includes(error?.context?.status);
      throw Object.assign(new Error(accessDenied ? 'Acesso às métricas da carteira indisponível.' : 'Não foi possível consultar as métricas salvas da carteira.'), { accessDenied });
    }
    for (const row of data.readings) {
      if (!row || !expected.delete(portfolioScopeKey(row))) throw new Error('Leitura da carteira inválida.');
      result.push(row);
    }
  }
  return result;
}

function sumMetrics(rows, allowReach = true) {
  if (!rows.length) return null;
  const currency = rows[0].currency;
  const hasCurrency = currency && rows.every((row) => row.currency === currency);
  const total = { currency: hasCurrency ? currency : '', reach: null, frequency: null };
  for (const key of ADDITIVE) {
    const values = rows.map((row) => metricValue(row, key));
    total[key] = (key === 'spend' && !hasCurrency) || values.some((value) => value === null) ? null : values.reduce((sum, value) => sum + value, 0);
  }
  if (allowReach && rows.length === 1) {
    total.reach = metricValue(rows[0], 'reach');
    total.frequency = metricValue(rows[0], 'frequency');
  }
  return total;
}

function goalPresence(goals, campaign, values) {
  if (!goals) return null;
  if (goals.some((goal) => matchesMediaGoal(goal, campaign, values))) return true;
  return goals.some((goal) => goal.scope === 'objective' && needsMediaGoalMeasurement(MEDIA_GOAL_OBJECTIVES[goal.objective], campaign, values)) ? null : false;
}

function groupDays(rows, allowSpend) {
  const dates = new Map();
  for (const row of rows) {
    if (!dates.has(row.date)) dates.set(row.date, []);
    dates.get(row.date).push(row);
  }
  return [...dates].map(([date, rows]) => {
    const values = sumMetrics(rows, false);
    return { ...values, date, spend: allowSpend ? values.spend : null };
  });
}

function filteredDays(rawDays, selected, currency, resultKey) {
  if (!Array.isArray(rawDays) || !selected.length) return [];
  const days = new Map(selected.map(({ campaign }) => [campaign.id, []]));
  for (const row of rawDays) {
    if (!days.has(row.campaign_id)) continue;
    const value = normalizeInsight(row);
    if (value) days.get(row.campaign_id).push({ ...value, currency: value.currency || currency });
  }
  const keys = [...new Set(['spend', 'impressions', 'clicks', resultKey])].filter((key) => ADDITIVE.includes(key));
  const complete = selected.every(({ campaign, values }) => {
    const total = sumMetrics(days.get(campaign.id), false);
    return total && keys.every((key) => {
      const value = metricValue(values, key), daily = metricValue(total, key);
      return value === null ? daily === null : daily !== null && Math.abs(value - daily) < 0.01;
    });
  });
  return complete ? groupDays([...days.values()].flat(), true) : [];
}

function filteredScope(scope, raw, objective, goal, resultKey) {
  if (!raw || !Number.isFinite(Date.parse(raw.fetchedAt))) return null;
  let reading;
  try { reading = presentMetaReading({ reading: raw }); } catch { return null; }
  const byObjective = Object.hasOwn(MEDIA_GOAL_OBJECTIVES, objective) ? MEDIA_GOAL_OBJECTIVES[objective] : null;
  const filtered = Boolean(byObjective || goal !== 'all');
  const currency = reading.account?.currency || '';
  let unknown = false;
  const selected = reading.campaigns.flatMap((campaign) => {
    const normalized = normalizeInsight(campaign.insights?.data?.[0]);
    const values = normalized && { ...normalized, currency: normalized.currency || currency };
    if (byObjective && !matchesMediaGoal({ scope: 'objective', objective }, campaign, values)) {
      unknown ||= needsMediaGoalMeasurement(byObjective, campaign, values);
      return [];
    }
    if (goal !== 'all') {
      const hasGoal = goalPresence(scope.goals, campaign, values);
      unknown ||= hasGoal === null;
      if (hasGoal !== (goal === 'with')) return [];
    }
    return [{ campaign, values }];
  });
  const metrics = selected.map(({ values }) => values).filter(Boolean);
  const metric = (!filtered && reading.account) || sumMetrics(metrics);
  const partial = (!reading.account || filtered) && (reading.campaignMetricsPartial || !Array.isArray(raw.campaigns) || unknown || metrics.length !== selected.length);
  const daily = filtered ? filteredDays(raw.campaignDays, selected, currency, resultKey) : reading.daily.map((row) => ({ ...row, currency: row.currency || currency }));
  const { clientId, clientName, accountId, accountName } = scope;
  return { ...reading, metric, partial, tablePartial: reading.partial, daily,
    dailyPartial: reading.dailyPartial || (filtered && selected.length > 0 && daily.length === 0),
    rows: selected.map(({ campaign, values }) => ({ ...campaign,
      portfolioScope: { clientId, clientName, accountId, accountName, currency: values?.currency || currency, period: reading.period } })) };
}

export function buildPortfolioMetrics(scopes, entries, requested, objective = 'all', goal = 'all') {
  const configured = new Set(scopes.map((scope) => scope.objective));
  const resultObjective = objective !== 'all' ? objective : configured.size === 1 ? [...configured][0] : null;
  const resultKey = MEDIA_GOAL_OBJECTIVES[resultObjective]?.resultKey || 'impressions';
  const costKey = COSTS[resultObjective] || 'clicks';
  const records = new Map(entries.map((entry) => [portfolioScopeKey(entry), entry]));
  const available = scopes.flatMap((scope) => {
    const entry = records.get(portfolioScopeKey(scope));
    const raw = entry?.reading;
    if (!raw?.period || raw.period.since < requested.since || raw.period.until > requested.until) return [];
    const reading = filteredScope(scope, raw, objective, goal, resultKey);
    return reading ? [{ scope, reading, prior: entry.prior }] : [];
  });
  const aligned = available.length > 0 && available.every(({ reading }) => samePeriod(reading.period, available[0].reading.period));
  const period = aligned ? available[0].reading.period : requested;
  const values = available.map(({ reading }) => reading.metric).filter(Boolean);
  const account = sumMetrics(values);
  const currencies = new Set(values.map(({ currency }) => currency).filter(Boolean));
  const exact = aligned && available.length === scopes.length && samePeriod(period, requested);
  const partial = available.length !== scopes.length || available.some(({ reading }) => reading.partial);
  const daily = groupDays(available.flatMap(({ reading }) => reading.daily), Boolean(account?.currency));
  const contributors = available.filter(({ reading }) => reading.metric);
  const dailyPartial = contributors.some(({ reading }) => reading.dailyPartial || reading.daily.length < daily.length);
  const earlier = aligned ? previousPeriod(period) : null;
  let comparison = null;
  if (!partial && earlier && available.every(({ prior }) => samePeriod(prior?.period, earlier))) {
    const priors = available.map(({ scope, prior }) => filteredScope(scope, prior, objective, goal, resultKey));
    const previous = sumMetrics(priors.map((item) => item?.metric).filter(Boolean));
    if (previous && priors.every((item) => item && !item.partial) && previous.currency === account?.currency && currencies.size <= 1) {
      comparison = { period: earlier, account: previous, daily: groupDays(priors.flatMap(({ daily }) => daily), Boolean(previous.currency)),
        partial: priors.some((item) => item.dailyPartial) };
    }
  }
  return { account, daily, comparison, period, exact, partial, dailyPartial, resultKey, costKey, currency: account?.currency || '',
    accountsRead: available.length, clientsRead: new Set(available.map(({ scope }) => scope.clientId)).size,
    mixedCurrency: currencies.size > 1, campaigns: available.flatMap(({ reading }) => reading.rows),
    tablePartial: available.some(({ reading }) => reading.tablePartial),
    fetchedAt: available.map(({ reading }) => reading.fetchedAt).sort().at(-1) || null };
}

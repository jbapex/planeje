import { campaignObjectiveKey } from '../../../src/lib/trafegoObjetivo.js';
import { DECISION_OUTCOME_METRICS, decisionActionValue, decisionAmount, decisionDayAt } from '../../../src/components/gestor-ia/gestorIaDecisionOutcomeModel.js';

export const decisionResultKeys = { leads: 'leads', mensagens: 'messages', compras: 'purchases', trafego: 'landingPageViews', engajamento: 'postEngagements' };
const day = 86400000;
const shift = (date, days) => new Date(Date.parse(date) + days * day).toISOString().slice(0, 10);
const validDay = (date) => typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)) && shift(date, 0) === date;
const preferredGoal = (goals) => goals.find((goal) => goal.is_primary) || (goals.length === 1 ? goals[0] : null);

function sum(rows, read) {
  let total = 0;
  for (const row of rows) {
    const value = read(row);
    if (value === null) return undefined;
    total += value;
  }
  return total <= Number.MAX_SAFE_INTEGER ? total : undefined;
}

function metricsFor(rows, currency, objective, goal) {
  if (!rows.length || rows.some((row) => row.account_currency !== currency)) return null;
  const metrics = {};
  for (const key of ['spend', 'impressions', 'clicks']) {
    const value = sum(rows, (row) => decisionAmount(row[key]));
    if (value !== undefined) metrics[key] = value;
  }
  if (metrics.spend === undefined) return null;
  for (const [key, result] of Object.entries(decisionResultKeys)) {
    for (const action of DECISION_OUTCOME_METRICS[key].actions) {
      const value = sum(rows, (row) => Array.isArray(row.actions) ? decisionActionValue(row, action) : null);
      if (value !== undefined) { metrics[result] = value; break; }
    }
  }
  if (!Object.values(metrics).some((value) => value > 0)) return null;
  const results = metrics[decisionResultKeys[objective]];
  if (results > 0) {
    const cost = Math.round(metrics.spend / results * 100) / 100;
    if (cost <= Number.MAX_SAFE_INTEGER) metrics.cost = cost;
  }
  if (currency === 'BRL' && objective && goal?.objective === objective && Number.isSafeInteger(goal.cost_cents) && goal.cost_cents > 0) {
    metrics.target = goal.cost_cents / 100;
  }
  return metrics;
}

export function buildAccountDecisionReading(history, goals, now, accountId, focusCampaigns = []) {
  const captured = Date.parse(history?.fetchedAt);
  const zone = history?.timezone;
  const today = decisionDayAt(now, zone), capturedDay = decisionDayAt(captured, zone);
  if (!today || !capturedDay || captured > now + 60000 || now - captured > 3 * day || !validDay(history.period?.since) || !validDay(history.period?.until) ||
    !Array.isArray(history.accountDays)) return null;
  const closed = shift(capturedDay, -1);
  const until = history.period.until < closed ? history.period.until : closed;
  if (until < shift(today, -3)) return null;
  const since = shift(until, -6);
  if (since < history.period.since) return null;
  const period = { since, until };
  const inPeriod = (row) => typeof row?.date_start === 'string' && row.date_start >= since && row.date_start <= until;
  const account = history.accountDays.filter(inPeriod);
  const dates = new Set(account.map((row) => row.date_start));
  if (account.length !== 7 || !Array.from({ length: 7 }, (_, offset) => shift(since, offset)).every((date) => dates.has(date))) return null;
  const currency = account[0].account_currency;
  if (!/^[A-Z]{3}$/.test(currency || '')) return null;
  const general = preferredGoal(goals.filter((goal) => goal.scope === 'account'));
  const accountGoal = goals.every((goal) => goal.scope === 'account') ? general : null;
  const accountObjective = Object.hasOwn(decisionResultKeys, accountGoal?.objective) ? accountGoal.objective : null;
  const metrics = metricsFor(account, currency, accountObjective, accountGoal);
  if (!metrics) return null;
  const sources = [{ id: 'resumo', label: 'Total da conta', objective: accountObjective, metrics }];
  if (history.campaignPartial === false && Array.isArray(history.campaignDays)) {
    const campaigns = new Map();
    for (const row of history.campaignDays) {
      if (!inPeriod(row) || typeof row.campaign_id !== 'string' || !/^\d{1,32}$/.test(row.campaign_id)) continue;
      if (!campaigns.has(row.campaign_id)) campaigns.set(row.campaign_id, []);
      campaigns.get(row.campaign_id).push(row);
    }
    const ranked = [...campaigns].flatMap(([id, rows]) => {
      if (new Set(rows.map((row) => row.date_start)).size !== rows.length) return [];
      const item = history.campaignMeta?.[id];
      const key = campaignObjectiveKey(item?.objective);
      const manual = goals.filter((goal) => goal.scope === 'campaigns' && goal.campaign_ids?.includes(id));
      const automatic = goals.filter((goal) => goal.scope === 'objective' && goal.objective === key);
      const goal = manual.length ? preferredGoal(manual) : automatic.length ? preferredGoal(automatic) : general;
      const resultObjective = goal?.objective ?? key;
      const objective = Object.hasOwn(decisionResultKeys, resultObjective) ? resultObjective : null;
      const metrics = metricsFor(rows, currency, objective, goal);
      const name = typeof item?.name === 'string' ? item.name.replace(/[<>\p{C}]/gu, ' ').trim().slice(0, 140) : '';
      return metrics ? [{ label: name, campaignId: id, objective, metrics }] : [];
    }).sort((a, b) => Number(focusCampaigns.includes(b.campaignId)) - Number(focusCampaigns.includes(a.campaignId)) ||
      b.metrics.spend - a.metrics.spend || a.campaignId.localeCompare(b.campaignId));
    ranked.slice(0, 8).forEach((row, index) => sources.push({ ...row, id: `campanha_${index + 1}`, label: row.label || `Campanha ${index + 1}` }));
  }
  const primary = goals.find((goal) => goal.is_primary);
  return { accountId, period, syncedAt: new Date(captured).toISOString(), currency, sources,
    goal: Object.hasOwn(decisionResultKeys, primary?.objective) ? primary.objective : accountObjective };
}

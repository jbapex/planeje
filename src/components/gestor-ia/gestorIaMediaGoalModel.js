import { campaignObjectiveKey } from '../../lib/trafegoObjetivo.js';
import { monthEnd } from '../../lib/collaboratorIndicators.js';
import { defaultMetricsPeriod, metricValue, normalizeInsight } from './gestorIaMetricModel.js';

export const MEDIA_GOAL_OBJECTIVES = {
  leads: { label: 'Leads', volume: 'Leads', cost: 'Custo por lead', resultKey: 'leads' },
  mensagens: { label: 'Conversas', volume: 'Conversas', cost: 'Custo por conversa', resultKey: 'messages' },
  compras: { label: 'Vendas', volume: 'Compras', cost: 'Custo por compra', resultKey: 'purchases' },
  trafego: { label: 'Tráfego', volume: 'Visitas à página', cost: 'Custo por visita', resultKey: 'landingPageViews' },
  alcance: { label: 'Alcance', volume: 'Pessoas alcançadas', cost: 'CPM', resultKey: 'reach' },
  engajamento: { label: 'Engajamento', volume: 'Interações', cost: 'Custo por interação', resultKey: 'postEngagements' },
  video: { label: 'Vídeo', volume: 'ThruPlays', cost: 'Custo por ThruPlay', resultKey: 'thruPlays', measuredScope: 'ThruPlays' },
  perfil_instagram: { label: 'Perfil do Instagram', volume: 'Visitas ao perfil', cost: 'Custo por visita ao perfil', resultKey: 'instagramProfileVisits', measuredScope: 'visitas ao perfil' },
};

const MAX_INTEGER = 2147483647;
const DAY = 86400000;
const dayCount = (since, until) => Math.round((Date.parse(until) - Date.parse(since)) / DAY) + 1;
const optional = (value) => value == null || String(value).trim() === '';

function cents(value) {
  const text = String(value ?? '').trim().replace(',', '.');
  const number = Math.round(Number(text) * 100);
  return /^\d+(?:\.\d{1,2})?$/.test(text) && number > 0 && number <= MAX_INTEGER ? number : null;
}

export function suggestedGoalVolume(cost, budget, objective) {
  if (objective === 'alcance') return null;
  const unit = cents(cost), amount = cents(budget);
  return unit && amount ? Math.round(amount / unit) || null : null;
}

export function usesSuggestedGoalVolume(goal) {
  if (!goal.id && goal.cost_cents == null) return true;
  const suggested = suggestedGoalVolume(goal.cost_cents / 100, goal.budget_cents / 100, goal.objective);
  return suggested !== null && goal.result_target === suggested;
}

export function parseMediaGoalDraft(draft) {
  const name = draft.name?.trim();
  if (!name || name.length > 80) throw new Error('Dê um nome de até 80 caracteres para a meta.');
  if (!Object.hasOwn(MEDIA_GOAL_OBJECTIVES, draft.objective)) throw new Error('Escolha um objetivo.');
  if (!['objective', 'account', 'campaigns'].includes(draft.scope)) throw new Error('Escolha onde a meta vale.');
  const campaignIds = draft.scope === 'campaigns' ? [...new Set(draft.campaign_ids || [])] : [];
  if (draft.scope === 'campaigns' && (!campaignIds.length || campaignIds.length > 100 || campaignIds.some((id) => !/^\d{1,32}$/.test(id)))) {
    throw new Error('Escolha de 1 a 100 campanhas da conta.');
  }
  const cost = cents(draft.cost), budget = cents(draft.budget);
  if (cost === null) throw new Error('Informe um custo alvo maior que zero, com até duas casas decimais.');
  if (budget === null && !optional(draft.budget)) throw new Error('Informe uma verba maior que zero, com até duas casas decimais.');
  const volume = optional(draft.volume) ? null : Number(draft.volume);
  if (volume !== null && (!Number.isInteger(volume) || volume < 1 || volume > MAX_INTEGER)) throw new Error('Informe um volume inteiro maior que zero.');
  return { name, objective: draft.objective, scope: draft.scope, campaign_ids: campaignIds, cost_cents: cost, budget_cents: budget,
    result_target: volume, is_active: draft.is_active === true, is_primary: draft.is_primary === true };
}

export function goalMonthPeriod(key, now = new Date()) {
  const current = defaultMetricsPeriod(now);
  const selected = /^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(key || '') && `${key}-01` < current.since ? `${key}-01` : current.since;
  const end = monthEnd(selected);
  return { since: selected, until: selected === current.since ? current.until : end, monthEnd: end };
}

const goalReadingInPeriod = (reading, period) => Boolean(reading?.fetchedAt && !reading.accessDenied && reading.period?.since === period.since &&
  reading.period.until >= period.since && reading.period.until <= period.until);

export function matchesMediaGoal(candidate, campaign, values) {
  if (candidate.scope === 'account') return true;
  if (candidate.scope === 'campaigns') return candidate.campaign_ids.includes(campaign.id);
  const objective = MEDIA_GOAL_OBJECTIVES[candidate.objective];
  return objective?.measuredScope ? metricValue(values, objective.resultKey) > 0 : campaignObjectiveKey(campaign.objective) === candidate.objective;
}

export function needsMediaGoalMeasurement(objective, campaign, values) {
  return objective.measuredScope ? metricValue(values, objective.resultKey) === null : !campaign.objective;
}

export function mediaGoalStats(goal, reading, period, accountGoals = []) {
  const valid = goalReadingInPeriod(reading, period);
  const { resultKey } = MEDIA_GOAL_OBJECTIVES[goal.objective];
  const uniqueReach = resultKey === 'reach';
  const source = valid ? reading.campaigns || [] : [];
  const specific = goal.scope === 'account' ? accountGoals.filter((candidate) => candidate.is_active && candidate.scope !== 'account') : [];
  const currency = valid ? reading.account?.currency || '' : '';
  const comparable = currency === 'BRL';
  const completeCampaignCosts = comparable && !(reading?.campaignMetricsPartial ?? reading?.partial);
  const costFor = (spend, units) => units > 0 && spend !== null ? spend / units * (uniqueReach ? 1000 : 1) : null;
  const campaigns = source.flatMap((campaign) => {
    const values = normalizeInsight(campaign.insights?.data?.[0]);
    if (!matchesMediaGoal(goal, campaign, values) || specific.some((candidate) => matchesMediaGoal(candidate, campaign, values))) return [];
    const spend = metricValue(values, 'spend');
    const results = uniqueReach && reading.derived ? null : metricValue(values, resultKey);
    const impressions = metricValue(values, 'impressions');
    const units = uniqueReach ? impressions : results;
    const cost = costFor(spend, units);
    const state = spend === null || units === null ? 'missing' : spend === 0 ? 'idle' : units === 0 ? 'no-result'
      : !comparable ? 'unknown' : Math.round(cost * 100) > goal.cost_cents ? 'above' : 'on';
    let excessSpendCents = null;
    if (completeCampaignCosts && state !== 'missing' && !campaign.insights?.error) {
      const targetSpendCents = Math.round(units * goal.cost_cents / (uniqueReach ? 1000 : 1));
      excessSpendCents = state === 'above' || state === 'no-result' ? Math.max(0, Math.round(spend * 100) - targetSpendCents) : 0;
    }
    return [{ id: campaign.id, name: campaign.name, spend, results, impressions, cost, state, excessSpendCents }];
  });
  const usesAccount = goal.scope === 'account' && !specific.length && resultKey !== 'instagramProfileVisits';
  const needsObjective = [goal, ...specific].some((candidate) =>
    candidate.scope === 'objective' && !MEDIA_GOAL_OBJECTIVES[candidate.objective]?.measuredScope);
  const monthCutShort = valid && period.until === period.monthEnd && reading.period.until < period.until;
  const missingResult = campaigns.some(({ spend, results }) => spend !== null && results === null);
  const sum = (key) => {
    const measured = campaigns.filter((row) => row[key] !== null);
    return measured.length ? measured.reduce((total, row) => total + row[key], 0) : null;
  };
  const spend = usesAccount && valid ? metricValue(reading.account, 'spend') : sum('spend');
  const scopePartial = usesAccount ? !reading?.account : (reading?.campaignMetricsPartial ?? reading?.partial) || campaigns.some(({ spend }) => spend === null) ||
    (goal.scope === 'campaigns' && campaigns.length !== goal.campaign_ids.length) || (needsObjective && source.some(({ objective }) => !objective));
  let results = usesAccount && valid ? metricValue(reading.account, resultKey) : missingResult ? null : sum('results');
  // Alcance único só existe para o total retornado pela Meta naquele recorte.
  if (uniqueReach && (reading?.derived || (!usesAccount && (campaigns.length !== 1 || scopePartial)))) results = null;
  const impressions = usesAccount ? metricValue(reading?.account, 'impressions')
    : campaigns.every((campaign) => campaign.impressions !== null) ? sum('impressions') : null;
  const units = uniqueReach ? impressions : results;
  const partial = Boolean(valid && (monthCutShort || scopePartial || (spend !== null && units === null)));
  const cost = costFor(spend, units);
  const remaining = !partial && results !== null && goal.result_target != null ? Math.max(0, goal.result_target - results) : null;
  const monthDays = dayCount(period.since, period.monthEnd);
  const daysLeft = dayCount(valid ? reading.period.until : period.until, period.monthEnd) - 1;
  const elapsed = valid ? dayCount(period.since, reading.period.until) : 0;
  const expectedProgress = !uniqueReach && remaining !== null ? elapsed * 100 / monthDays : null;
  const requiredDaily = !uniqueReach && remaining > 0 && daysLeft > 0 ? remaining / daysLeft : null;
  const canProject = Boolean(valid && !partial && daysLeft > 0);
  const canProjectResults = canProject && !uniqueReach;
  const projection = canProject && comparable && spend !== null ? spend * monthDays / elapsed : null;
  const resultProjection = canProjectResults && results !== null ? Math.round(results * monthDays / elapsed) : null;
  const spentCents = Math.round(spend * 100);
  const budgetLeftCents = !partial && comparable && spend !== null && goal.budget_cents != null
    ? Math.max(0, goal.budget_cents - spentCents) : null;
  const resultsWithinBudget = canProjectResults && budgetLeftCents !== null && cost > 0 && spentCents > 0
    ? results + Math.floor(budgetLeftCents * results / spentCents) : null;
  const requiredCost = canProjectResults && budgetLeftCents !== null && remaining > 0 ? Math.floor(budgetLeftCents / remaining) / 100 : null;
  const estimatedBudgetCents = canProjectResults && comparable && remaining > 0 && results > 0 && spentCents > 0
    ? spentCents + Math.ceil(spentCents * remaining / results) : null;
  const budgetToHitCents = Number.isSafeInteger(estimatedBudgetCents) ? estimatedBudgetCents : null;
  const budgetScenarioCents = budgetToHitCents > (goal.budget_cents ?? 0) && budgetToHitCents <= MAX_INTEGER ? budgetToHitCents : null;
  const overDay = projection !== null && spentCents > 0 && goal.budget_cents > spentCents
    ? Math.floor(goal.budget_cents * elapsed / spentCents) + 1 : null;
  const budgetEndOn = overDay !== null && overDay <= monthDays
    ? new Date(Date.parse(period.since) + (overDay - 1) * DAY).toISOString().slice(0, 10) : null;
  return { valid, campaigns, usesAccount, partial, comparable, currency, spend, results, cost, remaining, projection,
    uniqueReachMissing: uniqueReach && spend !== null && results === null,
    daysLeft, elapsed, expectedProgress, requiredDaily, budgetEndOn, resultProjection,
    budgetRemaining: budgetLeftCents === null ? null : budgetLeftCents / 100, resultsWithinBudget, requiredCost,
    budgetToHitCents, budgetScenarioCents };
}

export function mediaGoalCoverage(reading, period, goals) {
  if (!goalReadingInPeriod(reading, period)) return null;
  const active = goals.filter((goal) => goal.is_active);
  const general = active.filter((goal) => goal.scope === 'account');
  const specific = active.filter((goal) => goal.scope !== 'account');
  const automatic = [...new Set(specific.filter((goal) => goal.scope === 'objective').map((goal) => MEDIA_GOAL_OBJECTIVES[goal.objective]))];
  const campaigns = new Map((reading.campaigns || []).map(campaign => [campaign.id, campaign]));
  return Array.from(campaigns.values(), (campaign) => {
    const { id, name } = campaign;
    const values = normalizeInsight(campaign.insights?.data?.[0]);
    const matches = specific.filter((goal) => matchesMediaGoal(goal, campaign, values));
    const assigned = matches.length ? matches : general;
    const uncertain = automatic.some((objective) => needsMediaGoalMeasurement(objective, campaign, values));
    return { id, name, objective: campaignObjectiveKey(campaign.objective), spend: metricValue(values, 'spend'),
      goals: assigned, pending: assigned.length === 0 && uncertain, uncertain };
  });
}

export function mediaGoalCoverageImpact(reading, period, otherGoals, original, draft) {
  const coverage = mediaGoalCoverage(reading, period, [...otherGoals, draft]);
  if (!coverage) return null;
  const before = mediaGoalCoverage(reading, period, original.id ? [...otherGoals, original] : otherGoals);
  const rows = coverage.flatMap(({ id, name, goals, pending }, index) => {
    const previousGoals = before[index].goals;
    const included = goals.includes(draft);
    const wasIncluded = previousGoals.includes(original);
    if (!included && !wasIncluded) return [];
    const change = included ? (wasIncluded ? 'retained' : 'added') : 'removed';
    const replacedGoals = included ? previousGoals.filter((goal) => goal !== original && !goals.includes(goal)).map((goal) => goal.name) : [];
    return [{ id, name, change, otherGoals: goals.filter((goal) => goal !== draft).map((goal) => goal.name), replacedGoals, pending }];
  });
  const seen = new Set(coverage.map(({ id }) => id));
  const withoutReading = draft.scope === 'campaigns' ? draft.campaign_ids.filter((id) => !seen.has(id)).length : 0;
  const partial = Boolean(reading.campaignMetricsPartial ?? reading.partial) || coverage.some(({ uncertain }) => uncertain) ||
    (period.until === period.monthEnd && reading.period.until < period.until);
  return { rows, partial, withoutReading };
}

export function mediaGoalHealth(goal, stats) {
  if (!goal.is_active) return ['Inativa', 'quiet'];
  if (!stats.valid || stats.spend === null) return ['Sem leitura no mês', 'quiet'];
  if (stats.partial) return ['Dados parciais', 'quiet'];
  if (stats.spend === 0 && stats.results === 0) return ['Sem entrega', 'quiet'];
  if (stats.remaining === 0) return ['Meta batida', 'good'];
  if (stats.spend > 0 && stats.results === 0) return ['Gasto sem resultado', 'warning'];
  if (stats.budgetRemaining === 0) return ['Verba consumida', 'warning'];
  if (stats.budgetEndOn) return ['Verba em risco', 'warning'];
  if (stats.daysLeft === 0 && stats.remaining > 0) return ['Volume abaixo da meta', 'warning'];
  if (stats.expectedProgress !== null && stats.results * 100 / goal.result_target < stats.expectedProgress) return ['Abaixo do ritmo', 'warning'];
  if (stats.comparable && stats.cost !== null && Math.round(stats.cost * 100) > goal.cost_cents) return ['Custo acima do alvo', 'warning'];
  if (stats.uniqueReachMissing) return ['Alcance único indisponível', 'quiet'];
  return [null, null];
}

export function mediaGoalProgress(goal, reading, period, goals) {
  const stats = mediaGoalStats(goal, reading, period, goals.filter(({ account_id }) => account_id === goal.account_id));
  const [status, tone] = mediaGoalHealth(goal, stats);
  const measured = stats.valid && !stats.partial;
  const results = measured ? stats.results : null;
  return {
    results, volumePercent: results !== null && goal.result_target > 0 ? results * 100 / goal.result_target : null,
    budgetPercent: measured && stats.comparable && stats.spend !== null && goal.budget_cents > 0 ? stats.spend * 10000 / goal.budget_cents : null,
    spendBrl: measured && stats.comparable ? stats.spend : null,
    unitCostBrl: measured && stats.comparable ? stats.cost : null,
    projectedResults: stats.resultProjection, projectedSpend: stats.projection, budgetEndOn: stats.budgetEndOn,
    through: stats.valid ? reading.period.until : null, status, tone,
  };
}

export function mediaGoalPace(goal, reading, period, stats) {
  if (goal.objective === 'alcance' || !goal.result_target || !stats.valid || stats.partial || stats.results === null || reading.dailyError) return null;
  const { resultKey } = MEDIA_GOAL_OBJECTIVES[goal.objective];
  const { since, until } = reading.period;
  const days = new Map();
  const inRange = (day) => typeof day === 'string' && day >= since && day <= until;
  const add = (rows, dayOf, valueOf, total) => {
    let sum = 0;
    if (!rows.length) return false;
    for (const row of rows) {
      const day = dayOf(row), value = valueOf(row);
      if (!inRange(day) || value === null || value < 0) return false;
      sum += value;
      days.set(day, (days.get(day) || 0) + value);
    }
    return Math.abs(sum - total) < 0.000001;
  };
  if (stats.usesAccount) {
    const daily = reading.daily || [];
    if (reading.dailyPartial || new Set(daily.map(({ date }) => date)).size !== daily.length ||
      !add(daily, ({ date }) => date, (row) => metricValue(row, resultKey), stats.results)) return null;
  } else {
    const history = reading.history;
    if (!history?.period || history.period.since > since || history.period.until < until || history.campaignPartial || !stats.campaigns.length) return null;
    const byCampaign = (rows) => {
      const groups = new Map();
      for (const row of rows) {
        if (!inRange(row.date_start)) continue;
        if (!groups.has(row.campaign_id)) groups.set(row.campaign_id, []);
        groups.get(row.campaign_id).push(row);
      }
      return groups;
    };
    const totals = byCampaign(history.campaignDays || []);
    const ads = byCampaign(history.adsPartial ? [] : history.adDays || []);
    for (const { id, results } of stats.campaigns) {
      if (results === null || !add(totals.get(id) || ads.get(id) || [], ({ date_start }) => date_start,
        (row) => metricValue(normalizeInsight(row), resultKey), results)) return null;
    }
  }
  const monthDays = dayCount(period.since, period.monthEnd);
  const start = Date.parse(period.since);
  let cumulative = 0;
  return Array.from({ length: monthDays }, (_, index) => {
    const date = new Date(start + index * DAY).toISOString().slice(0, 10);
    cumulative += days.get(date) || 0;
    return { date, actual: date <= until ? cumulative : null, target: goal.result_target * (index + 1) / monthDays };
  });
}

export function mediaGoalAdjustment(goal, stats) {
  if (!goal.is_active || stats.budgetScenarioCents === null) return null;
  const volume = Math.floor(stats.resultsWithinBudget ?? 0);
  return { budgetCents: stats.budgetScenarioCents,
    volume: volume >= Math.max(1, Math.ceil(stats.results)) && volume < goal.result_target ? volume : null };
}

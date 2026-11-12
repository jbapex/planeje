import { buildMetaSnapshot } from '@/lib/clienteMetaSnapshot';
import { dateRange } from '@/lib/trafficPerformanceReport';
import { selectMetaHistory } from '../../../supabase/functions/gestor-ia-meta/history.js';
import { normalizeInsight } from './gestorIaMetricModel';

function savedInsights(reading) {
  const range = dateRange(reading.period?.since, reading.period?.until);
  if (!range) throw new Error('Janela salva inválida.');
  const period = { since: range.since, until: range.until };
  const account = (reading.accountRows || []).map(normalizeInsight)[0] || null;
  const daily = (reading.dailyRows || []).map(normalizeInsight);
  if (daily.some((row) => !row || !dateRange(row.date, row.date) || row.date < period.since || row.date > period.until) ||
    new Set(daily.map((row) => row.date)).size !== daily.length) throw new Error('Série Meta inválida.');
  return { period, account, daily, dailyPartial: reading.dailyPartial === true };
}

export function presentMetaReading(data) {
  const { reading, history } = data;
  const status = { refreshStatus: data.refreshStatus, retryAt: data.retryAt, overview: data.overview, history };
  if (!reading) return { ...status, exact: false, fetchedAt: null };
  const current = savedInsights(reading);
  const campaigns = reading.campaigns || [];
  const measured = campaigns.filter((campaign) => Array.isArray(campaign.insights?.data) && campaign.insights.data.length);
  const partial = reading.partial === true || measured.length !== campaigns.length;
  const snapshot = measured.length ? { ...buildMetaSnapshot({ campaigns: measured, period: current.period }), syncedAt: reading.fetchedAt } : null;
  let comparison = reading.comparison ? savedInsights(reading.comparison) : null;
  if (comparison?.account?.currency && current.account?.currency && comparison.account.currency !== current.account.currency) {
    comparison = { period: comparison.period, account: null, daily: [], error: 'Moedas diferentes: comparação indisponível.' };
  }
  return { ...status, ...current, exact: data.exact === true, fetchedAt: reading.fetchedAt, derived: reading.derived === true, coverage: reading.coverage,
    campaigns, snapshot, partial, campaignMetricsPartial: reading.campaignMetricsPartial ?? partial, comparison };
}

export function filterSavedMetaHistory(history, period) {
  const reading = selectMetaHistory(history, period);
  return reading ? presentMetaReading({ reading, exact: reading.exact, history }) : null;
}

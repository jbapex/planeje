import { metricValue, normalizeInsight } from '../../../src/components/gestor-ia/gestorIaMetricModel.js';
import { decisionDayAt } from '../../../src/components/gestor-ia/gestorIaDecisionOutcomeModel.js';
import { PORTAL_PERFORMANCE_OBJECTIVES } from '../../../src/lib/gestorIaPortalPerformance.js';

const DAY = 86400000;
const shift = (date, days) => new Date(Date.parse(date) + days * DAY).toISOString().slice(0, 10);
const validDate = (date) => typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)) && shift(date, 0) === date;
const amount = (value) => Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER ? value : null;

function accountDays(account, now, resultKey) {
  const days = new Map();
  const fetchedAt = Date.parse(account?.fetchedAt);
  if (!Array.isArray(account?.days) || !Number.isFinite(fetchedAt) || fetchedAt > now.getTime()) return days;
  const readingDay = decisionDayAt(fetchedAt, account.timezone || 'America/Sao_Paulo');
  if (!readingDay) return days;
  const lastClosed = shift(readingDay, -1);
  for (const row of account.days) {
    const date = row?.date_start;
    if (!validDate(date) || date > lastClosed) continue;
    if (days.has(date)) { days.set(date, null); continue; }
    const reading = normalizeInsight(row);
    const spend = amount(reading?.spend);
    days.set(date, spend === null || !reading.currency ? null : { spend, result: amount(metricValue(reading, resultKey)), currency: reading.currency });
  }
  for (const [date, row] of days) if (!row) days.delete(date);
  return days;
}

function totals(rows, scale) {
  const spend = rows.length ? amount(rows.reduce((total, row) => total + row.spend, 0)) : null;
  const result = rows.length && rows.every((row) => row.result !== null) ? amount(rows.reduce((total, row) => total + row.result, 0)) : null;
  return { spend, result, cost: spend !== null && result > 0 ? amount(spend / result * scale) : null, measuredDays: rows.length };
}

export function buildPortalPerformance({ accounts, excludedAccounts = 0 }, objective, now = new Date()) {
  const unavailable = (reason) => ({ performance: null, reason });
  if (!accounts.length) return unavailable('NO_ACCOUNTS');
  const { resultKey } = PORTAL_PERFORMANCE_OBJECTIVES[objective];
  const series = accounts.map((account) => accountDays(account, now, resultKey));
  const common = [...series[0].keys()].filter((date) => series.every((days) => days.has(date))).sort();
  const until = common.at(-1);
  if (!until) return unavailable('NO_COMMON_READING');
  const since = common[0] > shift(until, -27) ? common[0] : shift(until, -27);
  const days = common.filter((date) => date >= since).map((date) => ({ date, rows: series.map((series) => series.get(date)) }));
  const currencies = new Set(days.flatMap(({ rows }) => rows.map(({ currency }) => currency)));
  if (currencies.size !== 1) return unavailable('MIXED_CURRENCY');
  const daily = days.map(({ date, rows }) => ({ date, spend: rows.reduce((sum, row) => sum + row.spend, 0),
    result: rows.every((row) => row.result !== null) ? rows.reduce((sum, row) => sum + row.result, 0) : null }));
  const scale = objective === 'alcance' ? 1000 : 1;
  const weeks = [];
  for (let end = until; end >= since; end = shift(end, -7)) {
    const start = shift(end, -6) < since ? since : shift(end, -6);
    weeks.unshift({ since: start, until: end, ...totals(daily.filter(({ date }) => date >= start && date <= end), scale) });
  }
  return { performance: { objective, currency: [...currencies][0], period: { since, until },
    fetchedAt: accounts.map(({ fetchedAt }) => fetchedAt).sort((a, b) => Date.parse(a) - Date.parse(b))[0],
    excludedAccounts, total: totals(daily, scale), weeks } };
}

export async function readSharedPortalPerformance(caller, makeCache, now) {
  const access = async () => {
    const { data, error } = await caller.rpc('gestor_ia_escopo_metricas_portal');
    if (error) throw error;
    return data;
  };
  const scope = await access();
  if (!scope) return { shared: false };
  const source = await makeCache().portalHistories(scope.clientId, scope.revision);
  const latest = await access();
  if (!source || latest?.clientId !== scope.clientId || latest.revision !== scope.revision) return { shared: false };
  return { shared: true, clientId: scope.clientId, ...buildPortalPerformance(source, scope.objective, now) };
}

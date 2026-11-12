import { dateRange } from '../../lib/trafficPerformanceReport.js';
import { normalizeAccountInsights } from '../../lib/trafegoFila.js';

const DAY = 86400000;
const stamp = (day) => new Date(`${day}T12:00:00Z`).getTime();
const dayString = (time) => new Date(time).toISOString().slice(0, 10);
const numeric = (value) => value != null && value !== '' && Number.isFinite(Number(value)) ? Number(value) : null;

export const CHART_METRICS = [
  { key: 'spend', label: 'Investimento', unit: 'money' },
  { key: 'messages', label: 'Mensagens' }, { key: 'leads', label: 'Leads' }, { key: 'purchases', label: 'Compras' },
  { key: 'costMessage', label: 'Custo por mensagem', unit: 'money' },
  { key: 'cpl', label: 'Custo por lead', unit: 'money' },
  { key: 'costPurchase', label: 'Custo por compra', unit: 'money' },
  { key: 'ctr', label: 'CTR', unit: 'percent' }, { key: 'cpm', label: 'CPM', unit: 'money' },
  { key: 'frequency', label: 'Frequência', unit: 'decimal' },
  { key: 'impressions', label: 'Impressões' }, { key: 'clicks', label: 'Cliques' },
  { key: 'landingPageViews', label: 'Visitas à página' }, { key: 'costVisit', label: 'Custo por visita', unit: 'money' },
  { key: 'postEngagements', label: 'Interações' }, { key: 'costEngagement', label: 'Custo por interação', unit: 'money' },
  { key: 'thruPlays', label: 'ThruPlays' }, { key: 'costThruPlay', label: 'Custo por ThruPlay', unit: 'money' },
  { key: 'instagramProfileVisits', label: 'Visitas ao perfil' }, { key: 'costProfileVisit', label: 'Custo por visita ao perfil', unit: 'money' },
  { key: 'reach', label: 'Pessoas alcançadas' },
];

const COST_RESULT = { cpl: 'leads', costMessage: 'messages', costPurchase: 'purchases', costVisit: 'landingPageViews',
  costEngagement: 'postEngagements', costThruPlay: 'thruPlays', costProfileVisit: 'instagramProfileVisits' };

export function objectiveMetricKeys(objective) {
  const resultKey = { mensagens: 'messages', leads: 'leads', compras: 'purchases' }[objective] || 'messages';
  const costKey = { messages: 'costMessage', leads: 'cpl', purchases: 'costPurchase' }[resultKey];
  return { resultKey, costKey };
}

export function defaultMetricsPeriod(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now).map((p) => [p.type, p.value]));
  const until = `${parts.year}-${parts.month}-${parts.day}`;
  return { since: `${parts.year}-${parts.month}-01`, until };
}

export function previousPeriod(period) {
  const range = dateRange(period?.since, period?.until);
  if (!range) return null;
  const first = stamp(range.since), last = stamp(range.until);
  return { since: dayString(first - (last - first + DAY)), until: dayString(first - DAY) };
}

export function presetPeriod(preset, now = new Date()) {
  const month = defaultMetricsPeriod(now);
  if (preset === 'month') return month;
  if (preset === 'lastMonth') {
    const last = dayString(stamp(month.since) - DAY);
    return { since: `${last.slice(0, 7)}-01`, until: last };
  }
  const count = preset === 'last7' ? 7 : preset === 'last14' ? 14 : preset === 'last30' ? 30 : 0;
  return count ? { since: dayString(stamp(month.until) - (count - 1) * DAY), until: month.until } : null;
}

export function normalizeInsight(row) {
  if (!row || numeric(row.spend) === null) return null;
  const action = (type, list = row.actions) => {
    const value = numeric(Array.isArray(list) ? list.find((item) => item?.action_type === type)?.value : null);
    return value >= 0 ? value : null;
  };
  const profileVisits = numeric(row.instagram_profile_visits);
  return {
    ...normalizeAccountInsights(row),
    spend: numeric(row.spend), impressions: numeric(row.impressions), clicks: numeric(row.clicks),
    reach: numeric(row.reach), frequency: numeric(row.frequency),
    landingPageViews: action('landing_page_view'), postEngagements: action('post_engagement'),
    thruPlays: action('video_view', row.video_thruplay_watched_actions ?? []),
    instagramProfileVisits: profileVisits >= 0 ? profileVisits : null,
    date: row.date_start || null, currency: /^[A-Z]{3}$/.test(row.account_currency || '') ? row.account_currency : '',
  };
}

export function metricValue(metrics, key) {
  if (!metrics) return null;
  const fraction = (top, bottom, scale = 1) => {
    const a = numeric(metrics[top]), b = numeric(metrics[bottom]);
    return a !== null && b !== null && b > 0 ? a / b * scale : null;
  };
  if (Object.hasOwn(COST_RESULT, key)) return fraction('spend', COST_RESULT[key]);
  if (key === 'ctr') return fraction('clicks', 'impressions', 100);
  if (key === 'cpm') return fraction('spend', 'impressions', 1000);
  return numeric(metrics[key]);
}

export function comparisonDelta(current, previous) {
  const a = numeric(current), b = numeric(previous);
  return a !== null && b !== null && b !== 0 ? (a - b) / Math.abs(b) * 100 : null;
}

export function formatMetric(value, metric, currency = '') {
  if (numeric(value) === null) return '—';
  if (metric?.unit === 'money' && /^[A-Z]{3}$/.test(currency)) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(value);
  }
  const decimals = metric?.unit ? 2 : 0;
  const number = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: decimals, minimumFractionDigits: decimals }).format(value);
  return metric?.unit === 'percent' ? `${number}%` : number;
}

export function timelineRows(current, previous, period) {
  const range = dateRange(period?.since, period?.until);
  if (!range) return [];
  const prior = previousPeriod(range), currentByDay = new Map(current.map((r) => [r.date, r]));
  const priorByDay = new Map(previous.map((r) => [r.date, r]));
  const first = stamp(range.since);
  // shortcut: a integração entrega até 500 dias; exibir limite até existir paginação segura no backend.
  const count = Math.min(500, Math.round((stamp(range.until) - first) / DAY) + 1);
  return Array.from({ length: count }, (_, index) => {
    const date = dayString(first + index * DAY);
    const previousDate = dayString(stamp(prior.since) + index * DAY);
    return { date, previousDate, current: currentByDay.get(date) || null, previous: priorByDay.get(previousDate) || null };
  });
}

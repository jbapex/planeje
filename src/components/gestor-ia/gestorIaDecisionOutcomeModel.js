import { selectMetaHistory } from '../../../supabase/functions/gestor-ia-meta/history.js';
import { isDecisionTaskComplete } from './gestorIaDecisionLog.js';

export const DECISION_REVIEW_DAYS = [3, 7, 14];
export const DECISION_OUTCOME_METRICS = {
  leads: { label: 'Leads na Meta', cost: 'Custo por lead', actions: ['lead'] },
  mensagens: { label: 'Conversas na Meta', cost: 'Custo por conversa', actions: ['onsite_conversion.messaging_conversation_started_7d', 'onsite_messaging_conversation_started', 'messaging_conversation_started'] },
  compras: { label: 'Compras na Meta', cost: 'Custo por compra', actions: ['omni_purchase', 'purchase'] },
  trafego: { label: 'Visitas à página', cost: 'Custo por visita', actions: ['landing_page_view'] },
  engajamento: { label: 'Interações na publicação', cost: 'Custo por interação', actions: ['post_engagement'] },
};

export async function readDecisionTask(db, clientId, taskId) {
  const { data, error } = await db.from('tarefas').select('status,status_history').eq('id', taskId)
    .eq('client_id', clientId).eq('type', 'paid_traffic').maybeSingle();
  if (error) throw new Error('Não foi possível consultar a tarefa vinculada.');
  return data;
}

export function decisionTaskCompletedAt(task, statuses, earliest) {
  if (!isDecisionTaskComplete(task, statuses) || !Array.isArray(task.status_history)) return null;
  const history = task.status_history;
  if (history.at(-1)?.status !== task.status) return null;
  let index = history.length - 1;
  while (index > 0 && isDecisionTaskComplete(history[index - 1], statuses)) index--;
  const timestamp = history[index]?.timestamp;
  return typeof timestamp === 'string' && Number.isFinite(Date.parse(timestamp)) &&
    (!earliest || Date.parse(timestamp) >= Date.parse(earliest)) ? timestamp : null;
}

export function decisionDayAt(instant, timeZone) {
  if (typeof timeZone !== 'string' || !timeZone) return null;
  try {
    const formatter = new Intl.DateTimeFormat('en', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
    const parts = Object.fromEntries(formatter.formatToParts(new Date(instant)).map(({ type, value }) => [type, value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
  } catch { return null; }
}

export function decisionReviewWindows(completedAt, days, timeZone, now = new Date()) {
  if (!DECISION_REVIEW_DAYS.includes(days) || !completedAt || !Number.isFinite(Date.parse(completedAt)) || Date.parse(completedAt) > now.getTime()) return null;
  const day = decisionDayAt(completedAt, timeZone);
  if (!day) return null;
  const shift = (offset) => new Date(Date.parse(day) + offset * 86400000).toISOString().slice(0, 10);
  const readyOn = shift(days + 1);
  return { day, before: { since: shift(-days), until: shift(-1) }, after: { since: shift(1), until: shift(days) },
    readyOn, ready: decisionDayAt(now, timeZone) >= readyOn };
}

export const decisionAmount = (value) => (typeof value === 'number' || (typeof value === 'string' && value.trim())) &&
  Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : null;
export const decisionActionValue = (row, action) => decisionAmount(row?.actions?.find(({ action_type }) => action_type === action)?.value);
const amount = decisionAmount;
const actionValue = decisionActionValue;
const ratio = (a, b, scale = 1) => a !== null && b > 0 ? a / b * scale : null;

export function decisionLinkDelivery(rows) {
  let impressions = 0, clicks = 0;
  for (const row of rows) {
    const shown = amount(row?.impressions), links = amount(row?.inline_link_clicks);
    if (!(shown > 0) || links === null) return null;
    impressions += shown;
    clicks += links;
  }
  if (!impressions || impressions > Number.MAX_SAFE_INTEGER || clicks > Number.MAX_SAFE_INTEGER) return null;
  const last = rows.at(-1);
  const frequency = amount(last.frequency);
  return { impressions, clicks, ctr: ratio(clicks, impressions, 100),
    frequency: frequency > 0 && frequency <= amount(last.impressions) ? frequency : null };
}

function compareAdOutcome(history, before, after, campaignId, adId) {
  const capturedOn = decisionDayAt(history.fetchedAt, history.timezone);
  if (!campaignId || !capturedOn || capturedOn <= after.until || !history.period || history.period.since > before.since || history.period.until < after.until) return null;
  const rows = (history.adDays || []).filter((row) => row.ad_id === adId && row.campaign_id === campaignId);
  const select = ({ since, until }) => {
    const daily = rows.filter(({ date_start }) => date_start >= since && date_start <= until).sort((a, b) => a.date_start.localeCompare(b.date_start));
    const count = (Date.parse(until) - Date.parse(since)) / 86400000 + 1;
    return daily.length === count && new Set(daily.map(({ date_start }) => date_start)).size === count ? decisionLinkDelivery(daily) : null;
  };
  const first = select(before), last = select(after);
  if (!first || !last) return null;
  return { adName: rows.find(({ ad_name }) => ad_name)?.ad_name || `#${adId}`, fetchedAt: history.fetchedAt, rows: [
    { key: 'ctr', label: 'CTR de link', unit: 'percent', before: first.ctr, after: last.ctr },
    ...(first.frequency !== null && last.frequency !== null ? [{ key: 'frequency', label: 'Frequência no último dia', unit: 'times', before: first.frequency, after: last.frequency }] : []),
  ] };
}

export function compareDecisionOutcome(history, { before, after }, { campaignId, objective, adId }) {
  if (!Number.isFinite(Date.parse(history?.fetchedAt))) return null;
  if (adId) return compareAdOutcome(history, before, after, campaignId, adId);
  const inScope = (row) => row.campaign_id === campaignId && row.date_start >= before.since && row.date_start <= after.until;
  const campaignDays = campaignId ? (history.campaignDays || []).filter(inScope) : [];
  if (campaignId && (history.campaignPartial || (!campaignDays.length && history.adsPartial))) return null;
  // Use one reporting level for both windows, even when the other level has some rows.
  const source = { ...history, campaignDays, adDays: campaignId && !campaignDays.length ? (history.adDays || []).filter(inScope) : [] };
  const select = (period) => {
    const reading = selectMetaHistory(source, period);
    if (!reading?.exact) return null;
    const campaign = campaignId ? reading.campaigns.find(({ id }) => id === campaignId) : null;
    const account = reading.accountRows[0];
    const row = campaignId ? campaign?.insights.data[0] : account;
    return row ? { row, currency: row.account_currency, name: campaign?.name } : null;
  };
  const first = select(before), last = select(after);
  if (!first || !last) return null;

  const currency = /^[A-Z]{3}$/.test(first.currency || '') && first.currency === last.currency ? first.currency : '';
  const result = Object.hasOwn(DECISION_OUTCOME_METRICS, objective) ? DECISION_OUTCOME_METRICS[objective] : null;
  const action = result?.actions.find((id) => actionValue(first.row, id) !== null && actionValue(last.row, id) !== null);
  const a = action ? actionValue(first.row, action) : null, b = action ? actionValue(last.row, action) : null;
  const spendBefore = currency ? amount(first.row.spend) : null, spendAfter = currency ? amount(last.row.spend) : null;
  const rows = [
    { key: 'spend', label: 'Investimento', unit: 'money', before: spendBefore, after: spendAfter },
    { key: 'result', label: result?.label, before: a, after: b },
    { key: 'cost', label: result?.cost, unit: 'money', before: ratio(spendBefore, a), after: ratio(spendAfter, b) },
    { key: 'ctr', label: 'CTR', unit: 'percent', before: ratio(amount(first.row.clicks), amount(first.row.impressions), 100),
      after: ratio(amount(last.row.clicks), amount(last.row.impressions), 100) },
  ].filter((row) => row.before !== null && row.after !== null);
  const campaignName = campaignId ? last.name || first.name || `#${campaignId}` : undefined;
  return rows.length ? { rows, currency, campaignName, fetchedAt: history.fetchedAt } : null;
}

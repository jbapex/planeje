import { appointmentDay, appointmentStatusKeys, presetForNicho, readMiniCrm, resolveMiniCrmSetup } from './miniCrm.js';
import { isMetaAdsContactForStats } from './contactFromWebhookPayload.js';
import { periodBoundsSaoPaulo } from './rastreamentoPeriod.js';
import { shiftDate } from './trafficWeeklyReview.js';
import { catalogFromCampaigns } from './trafficSheetCatalog.js';
import { buildAdsetSpendIndex } from './trafficSheetMetaSpend.js';
import { detectRoutineAppointment, hasAppointmentNegation, maskRoutinePhone, maskRoutineText } from './gestorIaRoutineSignals.js';
export { maskRoutinePhone, maskRoutineText } from './gestorIaRoutineSignals.js';

export function routineValidationState(review) {
  if (review?.finalized_at) return 'validado';
  if (review?.validation_state === 'rascunho_ia') return 'rascunho_ia';
  return review?.revision > 0 ? 'em_revisao' : 'a_preencher';
}

export function normalizeRoutineWeek(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return '';
  const date = new Date(`${value}T12:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) return '';
  return shiftDate(value, 1 - (date.getUTCDay() || 7));
}

const id = (value) => typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
const accountId = (value) => id(value).replace(/^act_/i, '');
const adsets = (campaign) => Array.isArray(campaign.adsets) ? campaign.adsets : campaign.adsets?.data || [];

export function routineSavedCatalog(reading) {
  if (!reading?.fetchedAt && !reading?.campaigns?.length) return { status: 'ok', campaigns: [], error: '' };
  return { status: 'ok', campaigns: catalogFromCampaigns((reading.campaigns || []).map((campaign) => ({ ...campaign, adsets: adsets(campaign) }))), error: '' };
}

export function routineSavedSpend(reading, period) {
  if (!reading?.exact || reading.partial || reading.period?.since !== period.since || reading.period?.until !== period.until) {
    throw new Error('Não há uma leitura salva completa para esta semana. Atualize a conta em Métricas ou preencha o gasto manualmente.');
  }
  const sets = (reading.campaigns || []).flatMap((campaign) => adsets(campaign).map((set) => ({ ...set, campaign_id: campaign.id, campaign_name: campaign.name })));
  if (!sets.length) throw new Error('A leitura salva não contém gasto dos conjuntos desta semana.');
  if (sets.some((set) => !set.insights?.data?.length || set.insights.data.some((row) => row.account_currency !== 'BRL' || row.spend == null || !Number.isFinite(Number(row.spend)) || Number(row.spend) < 0))) {
    throw new Error('Gasto salvo incompleto ou com moeda diferente de BRL. Confira a leitura em Métricas.');
  }
  return buildAdsetSpendIndex(sets);
}

function rowTarget(row) {
  if ((row.platform || 'meta') !== 'meta' || !accountId(row.account_id) || !id(row.campaign_id) || (row.adset_name && !id(row.adset_id))) return null;
  return { account: accountId(row.account_id), campaign: id(row.campaign_id), adset: id(row.adset_id) };
}

function contactTarget(contact) {
  const tracking = contact.tracking_data || {};
  const ad = tracking.meta_ad_details?.ad || {};
  return { account: accountId(ad.account_id || ad.campaign?.account_id || tracking.account_id),
    campaign: id(ad.campaign?.id || ad.campaign_id || tracking.meta_ad_details?.campaign_id || tracking.campaign_id || tracking.campaignId),
    adset: id(ad.adset?.id || ad.adset_id || tracking.adset_id) };
}

export function selectRoutineLeads(contacts, { clientId, weekStart, rows = [], config, niche, appointmentsOnly = false, messages = [] }) {
  const week = normalizeRoutineWeek(weekStart);
  if (!week || week !== weekStart) throw new Error('Escolha uma semana válida.');
  const bounds = periodBoundsSaoPaulo(week, shiftDate(week, 6));
  const setup = resolveMiniCrmSetup(presetForNicho(niche || ''), config, []);
  const scheduledStatuses = new Set(appointmentStatusKeys(setup.statuses));
  const targets = rows.map(rowTarget).filter(Boolean);
  const leads = [];
  const unmatchedLeads = [];
  const seen = new Set();
  const messagesByContact = new Map();
  for (const message of messages) {
    if (message.cliente_id && message.cliente_id !== clientId) continue;
    const list = messagesByContact.get(message.contact_id) || [];
    list.push(message);
    messagesByContact.set(message.contact_id, list);
  }
  let unattributed = 0;
  for (const contact of contacts || []) {
    const first = Date.parse(contact.first_seen_at);
    if (!contact.id || seen.has(contact.id) || contact.cliente_id !== clientId || !Number.isFinite(first)
      || first < Date.parse(bounds.sinceIso) || first > Date.parse(bounds.untilIso)) continue;
    seen.add(contact.id);
    const target = contactTarget(contact);
    const meta = isMetaAdsContactForStats(contact);
    const incomplete = !target.account || !target.campaign || !target.adset;
    if (meta && incomplete) unattributed += 1;
    const matched = meta && !incomplete && (!rows.length || targets.some((row) => row.account === target.account && row.campaign === target.campaign && (!row.adset || row.adset === target.adset)));
    if (meta && !incomplete && !matched) continue;
    const mini = readMiniCrm(contact.mini_crm);
    const status = setup.statuses.find((item) => item.key === mini.status);
    const negated = hasAppointmentNegation(`${mini.status || ''} ${status?.label || ''}`);
    const appointment = negated ? '' : appointmentDay(mini, setup.columns);
    const crmScheduled = !negated && Boolean(appointment || scheduledStatuses.has(mini.status));
    const conversation = detectRoutineAppointment(messagesByContact.get(contact.id) || []);
    const scheduled = crmScheduled || Boolean(conversation);
    if (matched && appointmentsOnly && !scheduled) continue;
    const safe = { id: contact.id, cliente_id: clientId, sender_name: maskRoutineText(mini.contato_nome || contact.sender_name || 'Lead sem nome'),
      phone: maskRoutinePhone(contact.phone || contact.from_jid), first_seen_at: contact.first_seen_at, origin_source: contact.origin_source ? maskRoutineText(contact.origin_source) : null,
      qualificado: contact.qualificado ?? null, comprou: contact.comprou ?? null,
      routineAppointment: appointment || conversation?.date || '', routineScheduled: scheduled,
      routineScheduleSource: crmScheduled ? 'crm' : conversation ? 'conversation' : null,
      routineCrmOutdated: !crmScheduled && Boolean(conversation),
      routineMatchReason: matched ? '' : meta ? 'Identificação Meta incompleta' : 'Origem manual, Google ou outra plataforma' };
    (matched ? leads : unmatchedLeads).push(safe);
  }
  return { leads, unmatchedLeads, unattributed, unresolvedRows: rows.length - targets.length };
}

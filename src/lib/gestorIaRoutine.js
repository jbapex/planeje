import { appointmentDay, appointmentStatusKeys, presetForNicho, readMiniCrm, resolveMiniCrmSetup } from './miniCrm.js';
import { isMetaAdsContactForStats } from './contactFromWebhookPayload.js';
import { periodBoundsSaoPaulo } from './rastreamentoPeriod.js';
import { shiftDate } from './trafficWeeklyReview.js';
import { catalogFromCampaigns } from './trafficSheetCatalog.js';
import { buildAdsetSpendIndex } from './trafficSheetMetaSpend.js';

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

export function selectRoutineLeads(contacts, { clientId, weekStart, rows = [], config, niche, appointmentsOnly = false }) {
  const week = normalizeRoutineWeek(weekStart);
  if (!week || week !== weekStart) throw new Error('Escolha uma semana válida.');
  const bounds = periodBoundsSaoPaulo(week, shiftDate(week, 6));
  const setup = resolveMiniCrmSetup(presetForNicho(niche || ''), config, []);
  const scheduledStatuses = new Set(appointmentStatusKeys(setup.statuses));
  const targets = rows.map(rowTarget).filter(Boolean);
  const leads = [];
  const seen = new Set();
  let unattributed = 0;
  for (const contact of contacts || []) {
    const first = Date.parse(contact.first_seen_at);
    if (!contact.id || seen.has(contact.id) || contact.cliente_id !== clientId || !Number.isFinite(first)
      || first < Date.parse(bounds.sinceIso) || first > Date.parse(bounds.untilIso) || !isMetaAdsContactForStats(contact)) continue;
    seen.add(contact.id);
    const target = contactTarget(contact);
    if (!target.account || !target.campaign || !target.adset) unattributed += 1;
    if (!targets.some((row) => row.account === target.account && row.campaign === target.campaign && (!row.adset || row.adset === target.adset))) continue;
    const mini = readMiniCrm(contact.mini_crm);
    const appointment = appointmentDay(mini, setup.columns);
    const scheduled = Boolean(appointment || scheduledStatuses.has(mini.status));
    if (appointmentsOnly && !scheduled) continue;
    leads.push({ ...contact, routineAppointment: appointment, routineScheduled: scheduled });
  }
  return { leads, unattributed, unresolvedRows: rows.length - targets.length };
}

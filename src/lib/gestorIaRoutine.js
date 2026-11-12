import { appointmentDay, appointmentStatusKeys, presetForNicho, readMiniCrm, resolveMiniCrmSetup } from './miniCrm.js';
import { isMetaAdsContactForStats } from './contactFromWebhookPayload.js';
import { periodBoundsSaoPaulo } from './rastreamentoPeriod.js';
import { campaignTotals, metricNumber, shiftDate } from './trafficWeeklyReview.js';
import { catalogFromCampaigns, normalizeSheetName } from './trafficSheetCatalog.js';
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

function originIdentity(value = {}) {
  return { account_id: accountId(value.account_id), campaign_id: id(value.campaign_id), campaign_name: id(value.campaign_name),
    adset_id: id(value.adset_id), adset_name: id(value.adset_name), ad_name: id(value.ad_name) };
}

const originKey = (origin) => `${origin.account_id}|${origin.campaign_id}|${origin.adset_id}`;
const matchesRow = (origin, row) => row.account === origin.account_id && row.campaign === origin.campaign_id && (!row.adset || row.adset === origin.adset_id);
const compatibleOrigin = (origin, candidate) => ['account_id', 'campaign_id', 'adset_id'].every((key) => !origin[key] || origin[key] === candidate[key]);

function contactIdentity(contact) {
  const tracking = contact.tracking_data || {};
  const snapshot = tracking.planeje_link_attribution || {};
  const configured = tracking.link_configured === true || (snapshot.platform === 'meta'
    && ['campaign_id', 'campaign_name', 'adset_id', 'adset_name'].some((key) => id(snapshot[key])));
  if (configured) return { origin: originIdentity(snapshot), adId: '', conflict: false, configured: true,
    meta: snapshot.platform === 'meta' && contact.origin_source !== 'google_ads' && tracking.planeje_link_origin !== 'google_ads' };
  if (tracking.planeje_link_id || tracking.planeje_match_code || ['meta_ads', 'google_ads', 'site'].includes(tracking.planeje_link_origin)) {
    return { origin: originIdentity(), adId: '', conflict: false, configured: false, meta: isMetaAdsContactForStats(contact) };
  }
  const details = tracking.meta_ad_details || {};
  const ad = details.ad || {};
  const accounts = [ad.account_id, ad.campaign?.account_id, tracking.account_id].map(accountId).filter(Boolean);
  const campaigns = [ad.campaign?.id, ad.campaign_id, details.campaign_id, tracking.campaign_id, tracking.campaignId].map(id).filter(Boolean);
  const sets = [ad.adset?.id, ad.adset_id, tracking.adset_id].map(id).filter(Boolean);
  const ads = [ad.id, tracking.ad_id, tracking.adId, tracking.source_id, tracking.sourceID].map(id).filter(Boolean);
  return { origin: originIdentity({ account_id: accounts[0], campaign_id: campaigns[0], adset_id: sets[0],
    campaign_name: ad.campaign?.name || ad.campaign_name || details.campaign_name || tracking.campaign_name || tracking.campaignName,
    adset_name: ad.adset?.name || ad.adset_name || tracking.adset_name, ad_name: ad.name || details.ad_name || tracking.ad_name }),
  adId: ads[0] || '', conflict: tracking.attribution_conflict === true || [accounts, campaigns, sets, ads].some((values) => new Set(values).size > 1),
  configured: false, meta: isMetaAdsContactForStats(contact) };
}

function uniqueOrigin(candidates, target, includeAdName = false) {
  if (new Set(candidates.map(originKey)).size !== 1) return null;
  const result = { ...target };
  for (const key of ['account_id', 'campaign_id', 'campaign_name', 'adset_id', 'adset_name']) {
    result[key] = candidates.find((candidate) => candidate[key])?.[key] || result[key];
  }
  if (includeAdName && !result.ad_name) result.ad_name = candidates.find((candidate) => candidate.ad_name)?.ad_name || '';
  return result;
}

function resolveContactOrigin(contact, candidates) {
  const target = contactIdentity(contact);
  const unresolved = (reason) => ({ ...target, method: null, reason });
  if (!target.meta) return unresolved('Origem manual, Google ou outra plataforma');
  if (target.conflict) return unresolved('Identificação Meta conflitante');
  const match = (items, method, includeAdName = false) => {
    const origin = uniqueOrigin(items.filter((candidate) => compatibleOrigin(target.origin, candidate)), target.origin, includeAdName);
    if (origin && target.configured) {
      origin.campaign_name = target.origin.campaign_name || origin.campaign_name;
      origin.adset_name = target.origin.adset_name || origin.adset_name;
    }
    return origin ? { ...target, origin, method: target.configured ? 'link' : method, reason: '' }
      : unresolved('Identificação Meta ambígua ou conflitante');
  };
  if (target.adId) {
    const ads = candidates.filter((candidate) => candidate.ad_id === target.adId);
    if (ads.length) return match(ads, 'id', true);
  }
  if (target.origin.campaign_id && target.origin.adset_id) {
    const pairs = candidates.filter((candidate) => candidate.campaign_id === target.origin.campaign_id && candidate.adset_id === target.origin.adset_id);
    if (pairs.length) return match(pairs, 'id');
    if (target.origin.account_id) return { ...target, method: target.configured ? 'link' : 'id', reason: '' };
  }
  if (target.origin.campaign_name && target.origin.adset_name) {
    const campaignName = normalizeSheetName(maskRoutineText(target.origin.campaign_name));
    const adsetName = normalizeSheetName(maskRoutineText(target.origin.adset_name));
    const pairs = candidates.filter((candidate) => normalizeSheetName(maskRoutineText(candidate.campaign_name)) === campaignName
      && normalizeSheetName(maskRoutineText(candidate.adset_name)) === adsetName);
    if (pairs.length) return match(pairs, 'name');
  }
  return unresolved('Identificação Meta incompleta');
}

function safeOrigin(origin) {
  return { ...origin, campaign_name: maskRoutineText(origin.campaign_name), adset_name: maskRoutineText(origin.adset_name), ad_name: maskRoutineText(origin.ad_name) };
}

function weeklyAppointmentEvents(events, clientId, since, until) {
  const selected = new Map();
  for (const event of events) {
    const at = Date.parse(event.at);
    if (!event.contact_id || (event.cliente_id && event.cliente_id !== clientId) || !['automatico', 'manual'].includes(event.source)
      || !Number.isFinite(at) || at < since || at > until) continue;
    const previous = selected.get(event.contact_id);
    if (!previous || at < Date.parse(previous.at)) selected.set(event.contact_id, event);
  }
  return selected;
}

function appointmentEventDay(event) {
  const day = id(event?.appointment_day);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return '';
  const date = new Date(`${day}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === day ? day : '';
}

function leadCounts(leads) {
  const counts = { total: leads.length, novos: 0, antigos: 0, agendamentos: 0, agendamentosNovos: 0, agendamentosAntigos: 0 };
  for (const lead of leads) {
    const old = lead.routineCohort === 'antigo';
    counts[old ? 'antigos' : 'novos'] += 1;
    if (lead.routineScheduled) {
      counts.agendamentos += 1;
      counts[old ? 'agendamentosAntigos' : 'agendamentosNovos'] += 1;
    }
  }
  return counts;
}

export function routineLeadSummary(result, rows = []) {
  const leads = result.leads || [];
  const unmatched = result.unmatchedLeads || [];
  const costRows = rows.filter((row) => rowTarget(row) && Number.isFinite(metricNumber(row.spend)));
  const targets = costRows.map(rowTarget);
  const cpaNovos = leads.filter((lead) => lead.routineCohort !== 'antigo' && lead.routineScheduled
    && lead.routineOrigin && targets.some((target) => matchesRow(lead.routineOrigin, target))).length;
  const spend = campaignTotals(costRows).spend;
  return { ...leadCounts([...leads, ...unmatched]),
    atribuidos: { ...leadCounts(leads), cpaNovos, cpa: spend != null && cpaNovos > 0 ? spend / cpaNovos : null },
    semVinculo: leadCounts(unmatched) };
}

function historicalOriginRows(leads, reviewTargets, catalog) {
  const groups = new Map();
  for (const lead of leads) {
    if (reviewTargets.some((target) => matchesRow(lead.routineOrigin, target))) continue;
    const key = originKey(lead.routineOrigin);
    const group = groups.get(key) || [];
    group.push(lead);
    groups.set(key, group);
  }
  return [...groups.values()].map((group) => {
    const { ad_name: _adName, ...origin } = group[0].routineOrigin;
    const statuses = catalog.filter((item) => accountId(item.account_id) === origin.account_id && id(item.campaign_id) === origin.campaign_id)
      .map((item) => id(item.campaign_status || item.status).toUpperCase()).filter(Boolean);
    const { total: _total, ...counts } = leadCounts(group);
    return { ...origin, spend: 0, readOnly: true,
      status: statuses.length && statuses.every((status) => ['PAUSED', 'ARCHIVED', 'DELETED'].includes(status)) ? 'campanha_encerrada' : 'fora_da_revisao',
      ...counts, cpa: null };
  });
}

export function selectRoutineLeads(contacts, { clientId, weekStart, rows = [], allRows = rows, originCatalog = [], mode = 'entrada', appointmentEvents = [], config, niche, appointmentsOnly = false, messages = [] }) {
  const week = normalizeRoutineWeek(weekStart);
  if (!week || week !== weekStart) throw new Error('Escolha uma semana válida.');
  if (!['entrada', 'agendados_na_semana'].includes(mode)) throw new Error('Escolha um modo válido para consultar os leads.');
  const bounds = periodBoundsSaoPaulo(week, shiftDate(week, 6));
  const since = Date.parse(bounds.sinceIso);
  const until = Date.parse(bounds.untilIso);
  const byAppointment = mode === 'agendados_na_semana';
  const events = weeklyAppointmentEvents(appointmentEvents, clientId, since, until);
  const setup = resolveMiniCrmSetup(presetForNicho(niche || ''), config, []);
  const scheduledStatuses = new Set(appointmentStatusKeys(setup.statuses));
  const targets = rows.map(rowTarget).filter(Boolean);
  const reviewTargets = allRows.map(rowTarget).filter(Boolean);
  const fullSelection = !rows.length || reviewTargets.every((review) => targets.some((target) => target.account === review.account
    && target.campaign === review.campaign && (!target.adset || target.adset === review.adset)));
  const candidates = [...allRows.filter(rowTarget), ...originCatalog.filter((item) => (item.platform || 'meta') === 'meta')]
    .map((item) => ({ ...originIdentity(item), ad_id: id(item.ad_id) })).filter((item) => item.account_id && item.campaign_id && item.adset_id);
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
    const event = events.get(contact.id);
    if (!contact.id || seen.has(contact.id) || contact.cliente_id !== clientId || !Number.isFinite(first)
      || first > until || (byAppointment ? !event : first < since)) continue;
    seen.add(contact.id);
    let attribution = resolveContactOrigin(contact, candidates);
    if (!byAppointment && attribution.method === 'name' && !reviewTargets.some((target) => matchesRow(attribution.origin, target))) {
      attribution = { ...attribution, method: null, reason: 'Origem fora da revisão' };
    }
    if (attribution.meta && !attribution.method) unattributed += 1;
    const outsideReview = byAppointment && fullSelection && !reviewTargets.some((target) => matchesRow(attribution.origin, target));
    const matched = Boolean(attribution.method) && (!rows.length || targets.some((row) => matchesRow(attribution.origin, row)) || outsideReview);
    if (attribution.method && !matched) continue;
    const mini = readMiniCrm(contact.mini_crm);
    const status = setup.statuses.find((item) => item.key === mini.status);
    const negated = hasAppointmentNegation(`${mini.status || ''} ${status?.label || ''}`);
    const appointment = negated ? '' : appointmentDay(mini, setup.columns);
    const crmScheduled = !negated && Boolean(appointment || scheduledStatuses.has(mini.status));
    const conversation = detectRoutineAppointment(messagesByContact.get(contact.id) || []);
    const scheduled = byAppointment || crmScheduled || Boolean(conversation);
    if (matched && appointmentsOnly && !scheduled) continue;
    const safe = { id: contact.id, cliente_id: clientId, sender_name: maskRoutineText(mini.contato_nome || contact.sender_name || 'Lead sem nome'),
      phone: maskRoutinePhone(contact.phone || contact.from_jid), first_seen_at: contact.first_seen_at, origin_source: contact.origin_source ? maskRoutineText(contact.origin_source) : null,
      qualificado: contact.qualificado ?? null, comprou: contact.comprou ?? null,
      routineAppointment: (byAppointment && appointmentEventDay(event)) || appointment || conversation?.date || '', routineScheduled: scheduled,
      routineMatchMethod: attribution.method, routineOrigin: safeOrigin(attribution.origin), routineCohort: first < since ? 'antigo' : 'novo',
      routineScheduledAt: byAppointment ? event.at : conversation?.confirmedAt || '',
      routineScheduleSource: byAppointment ? event.source : crmScheduled ? 'crm' : conversation ? 'conversation' : null,
      routineCrmOutdated: !crmScheduled && Boolean(conversation),
      routineMatchReason: attribution.reason };
    (matched ? leads : unmatchedLeads).push(safe);
  }
  return { leads, unmatchedLeads, unattributed, unresolvedRows: rows.length - targets.length,
    originRows: byAppointment ? historicalOriginRows(leads, reviewTargets, originCatalog) : [] };
}

import { contactIdentity, maskRoutineText, normalizeRoutineWeek, resolveContactOrigin, routineLeadSummary, selectRoutineLeads } from './gestorIaRoutine.js';
import { dateOnlyInSaoPaulo, periodBoundsSaoPaulo } from './rastreamentoPeriod.js';
import { shiftDate } from './trafficWeeklyReview.js';

const DAY = 86400000;
const id = value => typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
const account = value => id(value).replace(/^act_/i, '');
const record = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const rows = value => Array.isArray(value) && value.every(record);
const validInstant = value => typeof value === 'string' && /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
const invalid = () => { throw new Error('Resposta de coortes inválida para o cliente e a semana solicitados.'); };
const weekOf = value => normalizeRoutineWeek(dateOnlyInSaoPaulo(new Date(value)));
const identity = value => ({ account_id: account(value.account_id), campaign_id: id(value.campaign_id), adset_id: id(value.adset_id),
  campaign_name: id(value.campaign_name), adset_name: id(value.adset_name), ad_id: id(value.ad_id) });

function validate(dto) {
  if (!record(dto) || dto.schema_version !== 1 || !id(dto.cliente_id) || !dto.semana || normalizeRoutineWeek(dto.semana) !== dto.semana
    || !validInstant(dto.as_of) || !validInstant(dto.ledger_started_at) || !rows(dto.contacts) || !rows(dto.first_appointments)
    || !rows(dto.reviews) || !rows(dto.origin_catalog) || (dto.config != null && !record(dto.config))
    || typeof dto.niche !== 'string' || !record(dto.weekly) || !rows(dto.weekly.contacts)
    || !rows(dto.weekly.appointment_events) || (dto.weekly.origin_catalog != null && !rows(dto.weekly.origin_catalog))
    || (dto.weekly.config != null && !record(dto.weekly.config)) || (dto.weekly.niche != null && typeof dto.weekly.niche !== 'string')
    || (dto.weekly.cliente_id != null && dto.weekly.cliente_id !== dto.cliente_id)
    || (dto.weekly.semana != null && dto.weekly.semana !== dto.semana)) invalid();
  for (const contact of [...dto.contacts, ...dto.weekly.contacts]) {
    if (!id(contact.id) || contact.cliente_id !== dto.cliente_id || !validInstant(contact.first_seen_at)
      || (contact.tracking_data != null && !record(contact.tracking_data)) || (contact.mini_crm != null && !record(contact.mini_crm))) invalid();
  }
  for (const review of dto.reviews) if (!review.week_start || normalizeRoutineWeek(review.week_start) !== review.week_start || !rows(review.campaign_metrics)) invalid();
  for (const event of dto.weekly.appointment_events) if (event.cliente_id != null && event.cliente_id !== dto.cliente_id) invalid();
}

function completeOrigin(origin, universe) {
  const key = origin.adset_id ? 'adset_id' : 'campaign_id';
  if (!origin[key]) return origin;
  const matches = universe.filter(candidate => candidate[key] === origin[key]);
  const completed = { ...origin };
  for (const field of key === 'adset_id' ? ['account_id', 'campaign_id'] : ['account_id']) {
    const values = new Set([origin[field], ...matches.map(candidate => candidate[field])].filter(Boolean));
    if (values.size > 1) return null;
    completed[field] = [...values][0] || '';
  }
  for (const field of key === 'adset_id' ? ['campaign_name', 'adset_name'] : ['campaign_name']) {
    completed[field] ||= matches.find(candidate => candidate[field])?.[field] || '';
  }
  return completed;
}

function cohortOrigin(contact, candidates, universe) {
  const resolved = resolveContactOrigin(contact, candidates);
  const target = contactIdentity(contact);
  const completed = completeOrigin(resolved.method ? resolved.origin : target.origin, universe);
  const origin = completed || target.origin;
  const trusted = completed && target.meta && !target.conflict && (resolved.method || !/ambígua|conflitante/.test(resolved.reason));
  const kind = trusted && origin.adset_id ? 'adset' : trusted && origin.campaign_id ? 'campaign' : 'unlinked';
  return { kind, id: kind === 'adset' ? origin.adset_id : kind === 'campaign' ? origin.campaign_id : '',
    account_id: kind === 'unlinked' ? '' : origin.account_id, campaign_id: kind === 'unlinked' ? '' : origin.campaign_id,
    adset_id: kind === 'adset' ? origin.adset_id : '', campaign_name: kind === 'unlinked' ? '' : maskRoutineText(origin.campaign_name),
    adset_name: kind === 'adset' ? maskRoutineText(origin.adset_name) : '',
    label: kind === 'adset' ? maskRoutineText(origin.adset_name) || `Conjunto ${origin.adset_id}`
      : kind === 'campaign' ? maskRoutineText(origin.campaign_name) || `Campanha ${origin.campaign_id}` : 'Sem vínculo' };
}

function savedSpend(reviews, week, origin) {
  if (origin.kind === 'unlinked') return { spend: null, spend_status: 'sem_vinculo' };
  if (!origin.account_id || !origin.campaign_id) return { spend: null, spend_status: 'ausente' };
  const saved = reviews.filter(review => review.week_start === week);
  if (saved.length > 1) return { spend: null, spend_status: 'ambiguo' };
  const metrics = (saved[0]?.campaign_metrics || []).filter(row => (row.platform || 'meta') === 'meta').map(row => ({ ...row, ...identity(row) }));
  const compatible = metrics.filter(row => row.account_id === origin.account_id && row.campaign_id === origin.campaign_id);
  const matching = compatible.filter(row => origin.kind === 'adset' ? row.adset_id === origin.adset_id : !row.adset_id && !row.adset_name);
  const parentAndChild = compatible.some(row => !row.adset_id && !row.adset_name) && compatible.some(row => row.adset_id || row.adset_name);
  if (matching.length > 1 || parentAndChild) return { spend: null, spend_status: 'ambiguo' };
  if (!matching.length) return { spend: null, spend_status: 'ausente' };
  const spend = matching[0].spend;
  if (spend == null || spend === '' || (typeof spend !== 'number' && typeof spend !== 'string') || !Number.isFinite(Number(spend)) || Number(spend) < 0) {
    return { spend: null, spend_status: 'incompleto' };
  }
  return { spend: Number(spend), spend_status: 'conhecido' };
}

const reasons = {
  unknown_origin: ['Origem desconhecida', 'Revisar evidências da entrada. Não presumir origem orgânica.'],
  link_without_origin: ['Link sem campanha/conjunto', 'Revisar a configuração do Link e seu snapshot para novas entradas.'],
  meta_identity_not_found: ['Identidade Meta fora do catálogo', 'Conferir IDs e nomes salvos com o catálogo e a revisão, sem atribuir por aproximação.'],
  conflict: ['Identificação conflitante ou ambígua', 'Conferir as identidades conflitantes antes de corrigir a atribuição.'],
  google: ['Google', 'Usar a origem Google comprovada; não vincular a um conjunto Meta.'],
  linktree_site: ['Link de site', 'Conferir a origem configurada no Link de site.'],
  manual: ['Origem manual ou orgânica comprovada', 'Manter a origem registrada; revisar somente se houver nova evidência.'],
  no_identity: ['Meta sem identidade suficiente', 'Conferir IDs ou pares de nomes completos salvos na entrada.'],
  outside_review: ['Origem fora da revisão', 'Conferir a presença dessa origem na revisão da semana.'],
};
function diagnosticCode(contact, lead) {
  const tracking = contact?.tracking_data || {};
  const target = contactIdentity(contact || {});
  if (target.conflict || /ambígua|conflitante/.test(lead.routineMatchReason)) return 'conflict';
  if (contact?.origin_source === 'google_ads' || tracking.planeje_link_origin === 'google_ads') return 'google';
  if (contact?.origin_source === 'site' || tracking.planeje_link_origin === 'site') return 'linktree_site';
  if (['manual', 'organico', 'organic'].includes(contact?.origin_source)) return 'manual';
  if (contact?.has_link || tracking.planeje_link_id || tracking.planeje_match_code || tracking.link_configured) return 'link_without_origin';
  if (target.meta && (target.adId || target.origin.campaign_name || target.origin.adset_name)) return 'meta_identity_not_found';
  if (/fora da revisão/.test(lead.routineMatchReason)) return 'outside_review';
  return target.meta ? 'no_identity' : 'unknown_origin';
}

/** Read-only aggregate shared by React and MCP; never returns working contacts or event identities. */
export function buildRoutineCohortReport(dto) {
  validate(dto);
  const asOf = Date.parse(dto.as_of);
  const ledger = Date.parse(dto.ledger_started_at);
  const currentRows = dto.reviews.find(review => review.week_start === dto.semana)?.campaign_metrics || [];
  const weekly = selectRoutineLeads(dto.weekly.contacts, { clientId: dto.cliente_id, weekStart: dto.semana,
    rows: currentRows, allRows: currentRows, mode: 'agendados_na_semana',
    originCatalog: dto.weekly.origin_catalog || dto.origin_catalog, appointmentEvents: dto.weekly.appointment_events,
    config: dto.weekly.config ?? dto.config, niche: dto.weekly.niche ?? dto.niche, messages: [] });
  const diagnosticGroups = new Map();
  const weeklyContacts = new Map(dto.weekly.contacts.map(contact => [contact.id, contact]));
  for (const lead of weekly.unmatchedLeads) {
    const code = diagnosticCode(weeklyContacts.get(lead.id), lead);
    const group = diagnosticGroups.get(code) || { code, label: reasons[code][0], count: 0, novos: 0, antigos: 0, correction: reasons[code][1] };
    group.count++; group[lead.routineCohort === 'antigo' ? 'antigos' : 'novos']++; diagnosticGroups.set(code, group);
  }
  const savedOrigins = [...dto.reviews.flatMap(review => review.campaign_metrics), ...dto.origin_catalog]
    .filter(row => (row.platform || 'meta') === 'meta').map(identity);
  const entrantOrigins = dto.contacts.filter(contact => Date.parse(contact.first_seen_at) <= asOf).map(contactIdentity)
    .filter(target => target.meta && !target.conflict).map(target => target.origin);
  const universe = [...new Map([...savedOrigins, ...entrantOrigins].map(origin => [JSON.stringify(origin), origin])).values()]
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  const candidates = savedOrigins.filter(row => row.account_id && row.campaign_id && row.adset_id)
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  const appointments = new Map();
  const contactsById = new Map(dto.contacts.map(contact => [contact.id, contact]));
  for (const event of dto.first_appointments) {
    const contact = contactsById.get(event.contact_id); const at = Date.parse(event.at);
    if (!contact || !Number.isFinite(at)) continue;
    if (!appointments.has(event.contact_id) || at < appointments.get(event.contact_id)) appointments.set(event.contact_id, at);
  }
  for (const [contactId, at] of appointments) {
    if (at < Date.parse(contactsById.get(contactId).first_seen_at) || at < ledger || at > asOf) appointments.delete(contactId);
  }
  const contactsByWeek = new Map();
  for (const contact of dto.contacts) {
    const week = weekOf(contact.first_seen_at);
    const group = contactsByWeek.get(week) || [];
    group.push(contact); contactsByWeek.set(week, group);
  }
  const crmScheduled = new Set();
  for (const [week, contacts] of contactsByWeek) {
    const result = selectRoutineLeads(contacts, { clientId: dto.cliente_id, weekStart: week, config: dto.config, niche: dto.niche, messages: [] });
    for (const lead of [...result.leads, ...result.unmatchedLeads]) if (lead.routineScheduled) crmScheduled.add(lead.id);
  }
  const groups = new Map(); const seen = new Set();
  for (const contact of [...dto.contacts].sort((a, b) => id(a.id).localeCompare(id(b.id)))) {
    if (seen.has(contact.id) || Date.parse(contact.first_seen_at) > asOf) continue;
    seen.add(contact.id);
    const week = weekOf(contact.first_seen_at); const origin = cohortOrigin(contact, candidates, universe);
    const key = [week, origin.kind, origin.id].join('|');
    if (!groups.has(key)) groups.set(key, { key, week_start: week, origin, entries: 0, ...savedSpend(dto.reviews, week, origin),
      cost_per_entry: null, appointments: 0, dated_appointments: 0, without_history: 0, cpa: null,
      buckets: { week0: 0, week1: 0, week2: 0, week3plus: 0 },
      windows: [3, 7, 14, 30].map(days => ({ days, count: 0, percent: 0, incomplete: Date.parse(periodBoundsSaoPaulo(week, shiftDate(week, 6)).untilIso) + days * DAY > asOf, partial_history: false })) });
    const cohort = groups.get(key); cohort.entries++;
    // An audited later reschedule cannot date a first appointment already proven before the ledger.
    const at = contact.legacy_appointment === true ? undefined : appointments.get(contact.id);
    const unknown = at == null && (contact.legacy_appointment === true || crmScheduled.has(contact.id));
    if (at != null || unknown) cohort.appointments++;
    if (unknown) cohort.without_history++;
    if (at != null) {
      cohort.dated_appointments++;
      const distance = Math.round((Date.parse(`${weekOf(at)}T12:00:00Z`) - Date.parse(`${week}T12:00:00Z`)) / (7 * DAY));
      cohort.buckets[distance >= 3 ? 'week3plus' : `week${distance}`]++;
    }
    for (const window of cohort.windows) {
      if (at != null && at - Date.parse(contact.first_seen_at) <= window.days * DAY) window.count++;
      if (unknown || Date.parse(contact.first_seen_at) < ledger) window.partial_history = true;
    }
  }
  const cohorts = [...groups.values()].sort((a, b) => b.week_start.localeCompare(a.week_start) || a.key.localeCompare(b.key));
  for (const cohort of cohorts) {
    cohort.cost_per_entry = cohort.spend == null ? null : cohort.spend / cohort.entries;
    cohort.cpa = cohort.spend == null || !cohort.appointments ? null : cohort.spend / cohort.appointments;
    for (const window of cohort.windows) window.percent = window.count / cohort.entries * 100;
  }
  return { schema_version: 1, cliente_id: dto.cliente_id, semana: dto.semana, as_of: dto.as_of, ledger_started_at: dto.ledger_started_at,
    cohorts, weekly_summary: routineLeadSummary(weekly, currentRows),
    diagnostics: { total: weekly.unmatchedLeads.length, groups: [...diagnosticGroups.values()].sort((a, b) => b.count - a.count || a.code.localeCompare(b.code)) },
    coverage: { entries: cohorts.reduce((total, cohort) => total + cohort.entries, 0),
      dated_appointments: cohorts.reduce((total, cohort) => total + cohort.dated_appointments, 0),
      without_history: cohorts.reduce((total, cohort) => total + cohort.without_history, 0),
      partial_history: cohorts.some(cohort => cohort.windows.some(window => window.partial_history)) } };
}

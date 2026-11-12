/** Leitura do Rastreamento para o Assistente da Rotina. Só consulta. Sem envio. */

import { campaignContextFromTracking } from './rastreamentoEventosMeta.js';
import { periodBoundsSaoPaulo, timestampInSaoPauloRange, ymdInSaoPaulo } from './rastreamentoPeriod.js';
import { shiftDate, displayDate } from './trafficWeeklyReview.js';

export const ROUTINE_BRIEF_LEAD_CAP = 30;
export const ROUTINE_BRIEF_MESSAGE_CAP = 3000;
const THREAD_LINES = 8;
const THREAD_CHARS = 280;

export function routineWeekRange(weekStart) {
  const since = String(weekStart || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(since)) return null;
  return routineSearchRange(since, shiftDate(since, 6));
}

export function routineSearchRange(since, until) {
  const start = String(since || '').slice(0, 10);
  const end = String(until || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || start > end) return null;
  return { since: start, until: end, label: `${displayDate(start)} a ${displayDate(end)}`, ...periodBoundsSaoPaulo(start, end) };
}

export function routineSearchMatchesSheet({ since, until, weekStart, scope } = {}) {
  if (scope === 'all') return false;
  const screen = routineWeekRange(weekStart);
  const range = routineSearchRange(since, until);
  return Boolean(screen && range && range.since === screen.since && range.until === screen.until);
}

export function phoneKey(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length < 8) return '';
  return digits.slice(-11);
}

function dayField(mini, pattern) {
  if (!mini || typeof mini !== 'object') return '';
  for (const [key, value] of Object.entries(mini)) {
    if (!pattern.test(key)) continue;
    const text = String(value || '').trim();
    const iso = text.match(/^(\d{4}-\d{2}-\d{2})/);
    if (iso) return iso[1];
    const br = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  }
  return '';
}

export function leadOutcome(contact) {
  const mini = contact?.mini_crm && typeof contact.mini_crm === 'object' ? contact.mini_crm : {};
  const status = String(mini.status || '');
  const folded = status.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const scheduled = /agendad/.test(folded);
  const sold = contact?.comprou === true || /venda realizada|venda_realizada/.test(folded);
  return {
    status,
    scheduled,
    sold,
    appointmentDate: dayField(mini, /agend|visita/i),
    saleDate: dayField(mini, /data_venda|venda/i) || (sold ? ymdInSaoPaulo(contact?.crm_apice_lead_status_at) : ''),
    value: contact?.valor_venda ?? mini.valor ?? null,
  };
}

export function contactInRoutineWeek(contact, range) {
  if (!range) return false;
  const first = Date.parse(contact?.first_seen_at || '');
  const last = Date.parse(contact?.last_message_at || '');
  return timestampInSaoPauloRange(first, range.since, range.until)
    || timestampInSaoPauloRange(last, range.since, range.until);
}

function clip(text, max = 140) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

const SCHEDULE_TALK = /\b(agend\w*|reagend\w*|visita|hor[aá]rio|segunda|ter[cç]a|quarta|quinta|sexta|s[aá]bado|domingo|amanh[aã]|pode ser|[àa]s \d{1,2})\b/i;
const REFUSAL = /n[aã]o (vai dar|quero|queria|tenho|posso|agendo|marca)|j[aá] tenho compromisso|ainda n[aã]o|n[aã]o queria agendar|sem tempo/i;
const STORE_SCRIPT = /preencha as seguintes|continuidade no seu agendamento|nome completo|essencial que/i;

function foldName(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function namesMatch(leadName, sheetName) {
  if (!sheetName) return true;
  if (!leadName || leadName === 'campanha nao resolvida' || leadName === 'conjunto nao resolvido') return false;
  if (leadName === sheetName) return true;
  const short = Math.min(leadName.length, sheetName.length);
  if (short < 12) return false;
  return leadName.includes(sheetName) || sheetName.includes(leadName);
}

function isStoreScript(text) {
  return STORE_SCRIPT.test(String(text || ''));
}

export function messageTalksSchedule(text) {
  return SCHEDULE_TALK.test(String(text || ''));
}

export function leadConfirmedVisit(text) {
  const raw = String(text || '').replace(/\s+/g, ' ').trim();
  if (!raw || isStoreScript(raw)) return false;
  if (/vim pelo instagram e quero agendar|quero agendar meu atendimento/i.test(raw)) return false;
  if (REFUSAL.test(raw)) return false;
  if (/voc[eê]s atendem|vcs atendem|atendem no/i.test(raw)) return false;
  if (/bodas|casamento|vou casar/i.test(raw) && !/agend|hor[aá]rio|visita/i.test(raw)) return false;
  if (/\?/.test(raw) && !/pode ser (na |no |dia |[àa]s |as |\d)/i.test(raw)) return false;
  if (raw.length <= 40 && /\bdia \d{1,2}\/\d{1,2}\b/i.test(raw)) return true;
  return /pode ser (na |no |dia |[àa]s |as |\d)/i.test(raw)
    || /[àa]s \d{1,2}/i.test(raw)
    || /\b\d{1,2}h\b/i.test(raw)
    || /\b\d{1,2}:\d{2}\b/i.test(raw);
}

function namedPlace(name) {
  return !/não resolvid|nao resolvid/i.test(String(name || ''));
}

function leadSort(a, b) {
  return Number(b.scheduled || b.bookedInChat) - Number(a.scheduled || a.bookedInChat) || b.messages - a.messages;
}

function buildRoutineGroups(leads, sheetRows) {
  const rows = (sheetRows || []).filter((row) => foldName(row.campaign) || foldName(row.adset));
  const sortLeads = (list) => [...list].sort(leadSort);
  if (rows.length) {
    const groups = rows.map((row) => ({
      campaign: row.campaign || 'Campanha',
      adset: row.adset || 'Conjunto',
      spend: row.spend ?? '',
      onSheet: true,
      leads: [],
    }));
    const outside = [];
    leads.forEach((lead) => {
      const hit = groups.find((row) => namesMatch(foldName(lead.campaign), foldName(row.campaign)) && namesMatch(foldName(lead.adset), foldName(row.adset)));
      if (hit) hit.leads.push(lead);
      else outside.push(lead);
    });
    const named = groups.map((group) => ({ ...group, leads: sortLeads(group.leads) }));
    if (outside.length) {
      named.push({ campaign: 'Fora das campanhas da ficha', adset: '', spend: '', onSheet: false, leads: sortLeads(outside) });
    }
    return named.map(finishGroup);
  }
  const byKey = new Map();
  leads.forEach((lead) => {
    const key = `${lead.campaign}||${lead.adset}`;
    const group = byKey.get(key) || { campaign: lead.campaign, adset: lead.adset, spend: '', onSheet: false, leads: [] };
    group.leads.push(lead);
    byKey.set(key, group);
  });
  return [...byKey.values()]
    .map((group) => ({ ...group, onSheet: namedPlace(group.campaign), leads: sortLeads(group.leads) }))
    .sort((a, b) => Number(b.onSheet) - Number(a.onSheet) || b.leads.length - a.leads.length)
    .map(finishGroup);
}

function finishGroup(group) {
  const appointments = group.leads.filter((lead) => lead.scheduled || lead.bookedInChat);
  return {
    ...group,
    recognized: group.leads.length,
    appointments: appointments.length,
    scheduled: group.leads.filter((lead) => lead.scheduled).length,
    messages: group.leads.reduce((sum, lead) => sum + lead.messages, 0),
  };
}

function sheetAppointmentCount(groups) {
  const onSheet = (groups || []).filter((group) => group.onSheet);
  const base = onSheet.length ? onSheet : (groups || []).filter((group) => namedPlace(group.campaign) && group.onSheet !== false);
  return base.reduce((sum, group) => sum + (group.appointments || 0), 0);
}

function routineSummary(groups, fillCount, crmCount) {
  const onSheet = (groups || []).filter((group) => group.onSheet);
  const base = onSheet.length ? onSheet : (groups || []);
  const empty = base.filter((group) => group.appointments === 0).length;
  return `${fillCount} agendamento(s) lendo as mensagens (${crmCount} marcado(s) no CRM). ${empty} conjunto(s) não tiveram agendamento.`;
}

export function summarizeRoutineLeads({ contacts = [], inbox = [], sent = [], range, clientId, clientName, resultLabel = 'Agendamentos', sheetRows = [], scope = 'sheet' } = {}) {
  const inWeek = (contacts || []).filter((contact) => contactInRoutineWeek(contact, range));
  const inboundByPhone = new Map();
  const outboundByPhone = new Map();
  const note = (map, row, inbound) => {
    const key = phoneKey(row.phone) || phoneKey(row.from_jid) || phoneKey(row.chat_jid) || phoneKey(row.to_jid);
    if (!key) return;
    const bucket = map.get(key) || { count: 0, snippets: [], scheduleSnippet: '', bookedSnippet: '', lines: [] };
    bucket.count += 1;
    const spoken = clip(row.body, THREAD_CHARS);
    if (spoken) bucket.lines.push({ at: row.created_at || '', who: inbound ? 'lead' : 'loja', text: spoken });
    if (inbound && spoken && !isStoreScript(spoken)) {
      const text = clip(row.body);
      if (text && leadConfirmedVisit(text) && !bucket.bookedSnippet) bucket.bookedSnippet = text;
      if (text && messageTalksSchedule(text) && !bucket.scheduleSnippet) bucket.scheduleSnippet = text;
      if (text && bucket.snippets.length < 2) bucket.snippets.push(text);
    }
    map.set(key, bucket);
  };
  (inbox || []).forEach((row) => note(inboundByPhone, row, true));
  (sent || []).forEach((row) => note(outboundByPhone, row, false));

  const leads = inWeek.map((contact) => {
    const key = phoneKey(contact.phone) || phoneKey(contact.from_jid);
    const inbound = inboundByPhone.get(key) || { count: 0, snippets: [], lines: [] };
    const outbound = outboundByPhone.get(key) || { count: 0, lines: [] };
    const outcome = leadOutcome(contact);
    const place = campaignContextFromTracking(contact);
    const digits = String(contact.phone || '').replace(/\D/g, '');
    return {
      id: contact.id,
      name: contact.sender_name || contact.phone || 'Sem nome',
      phone: contact.phone || '',
      campaign: place.campaignName,
      adset: place.adSetName,
      ...outcome,
      inbound: inbound.count,
      outbound: outbound.count,
      messages: inbound.count + outbound.count,
      mentionsSchedule: Boolean(inbound.scheduleSnippet) || inbound.snippets.some(messageTalksSchedule),
      bookedInChat: Boolean(inbound.bookedSnippet),
      snippets: inbound.bookedSnippet ? [inbound.bookedSnippet] : (inbound.snippets || []),
      thread: [...(inbound.lines || []), ...(outbound.lines || [])]
        .sort((a, b) => String(a.at).localeCompare(String(b.at)))
        .slice(-THREAD_LINES),
      href: digits
        ? `/rastreamento?cliente_id=${encodeURIComponent(clientId || '')}&from=${range.since}&to=${range.until}&fone=${encodeURIComponent(digits)}`
        : '',
    };
  });

  const bySet = new Map();
  leads.forEach((lead) => {
    const key = `${lead.campaign}||${lead.adset}`;
    const row = bySet.get(key) || {
      campaign: lead.campaign,
      adset: lead.adset,
      leads: 0,
      scheduled: 0,
      sold: 0,
      messages: 0,
    };
    row.leads += 1;
    if (lead.scheduled) row.scheduled += 1;
    if (lead.sold) row.sold += 1;
    row.messages += lead.messages;
    bySet.set(key, row);
  });

  const scheduled = leads.filter((lead) => lead.scheduled);
  const booked = leads.filter((lead) => lead.bookedInChat && !lead.scheduled);
  const counted = leads.filter((lead) => lead.scheduled || lead.bookedInChat);
  const sold = leads.filter((lead) => lead.sold);
  const scheduleTalk = leads.filter((lead) => lead.mentionsSchedule && !lead.scheduled);
  const ranked = [...leads]
    .filter((lead) => lead.scheduled || lead.sold || lead.bookedInChat || lead.mentionsSchedule)
    .sort((a, b) => Number(b.scheduled) - Number(a.scheduled) || Number(b.bookedInChat) - Number(a.bookedInChat) || Number(b.sold) - Number(a.sold) || b.messages - a.messages);
  const groups = scope === 'all'
    ? buildRoutineGroups(leads, []).map((group) => ({ ...group, onSheet: true }))
    : buildRoutineGroups(leads, sheetRows);

  return {
    clientId: clientId || '',
    clientName: clientName || '',
    resultLabel,
    scope: scope === 'all' ? 'all' : 'sheet',
    weekLabel: range?.label || '',
    since: range?.since || '',
    until: range?.until || '',
    found: leads.length,
    scheduled: scheduled.length,
    booked: booked.length,
    fillCount: sheetAppointmentCount(groups),
    scheduleTalk: scheduleTalk.length,
    sold: sold.length,
    messages: leads.reduce((sum, lead) => sum + lead.messages, 0),
    messagesTruncated: (inbox || []).length >= ROUTINE_BRIEF_MESSAGE_CAP || (sent || []).length >= ROUTINE_BRIEF_MESSAGE_CAP,
    sets: [...bySet.values()].sort((a, b) => Number(namedPlace(b.campaign)) - Number(namedPlace(a.campaign)) || b.scheduled - a.scheduled || b.leads - a.leads),
    groups,
    summary: routineSummary(groups, sheetAppointmentCount(groups), scheduled.length),
    leads: ranked.slice(0, ROUTINE_BRIEF_LEAD_CAP),
    leadsTruncated: ranked.length > ROUTINE_BRIEF_LEAD_CAP,
  };
}

function leadTalk(lead) {
  const spoken = (lead.thread || []).filter((line) => line.who === 'lead').slice(-4);
  if (spoken.length) return spoken.map((line) => `“${line.text}”`).join(' | ');
  return lead.snippets?.[0] ? `“${lead.snippets[0]}”` : '';
}

function leadLine(lead, mark) {
  const when = lead.appointmentDate ? displayDate(lead.appointmentDate) : '';
  const label = mark || (lead.scheduled
    ? `Agendado no CRM${when ? ` ${when}` : ''}`
    : 'Agendou na conversa');
  const talk = leadTalk(lead);
  return `- ${lead.name} · ${lead.phone || 'sem telefone'} · ${label}${talk ? `\n  falas: ${talk}` : ''}`;
}

export function routineBriefPrompt(brief) {
  if (!brief) return '';
  const blocks = (brief.groups || []).map((group) => {
    if (group.onSheet === false) {
      return `${group.campaign}: ${group.recognized} contatos sem campanha na ficha. Não entram no número de agendamentos.`;
    }
    const head = `${group.campaign}${group.adset ? ` / ${group.adset}` : ''}${group.spend !== '' && group.spend != null ? ` · gasto ${group.spend}` : ''}: ${group.recognized} mensagens reconhecidas, ${group.appointments} agendaram.`;
    const people = (group.leads || []).filter((lead) => lead.scheduled || lead.bookedInChat).slice(0, 12).map((lead) => leadLine(lead));
    const aside = (group.leads || [])
      .filter((lead) => !lead.scheduled && !lead.bookedInChat && leadTalk(lead))
      .slice(0, 4)
      .map((lead) => leadLine(lead, 'Conversa lida, sem horário marcado pelo filtro'));
    if (!group.appointments && !aside.length) return `${head}\nNão teve agendamento.`;
    const others = (group.leads || []).length - people.length - aside.length;
    return [head, ...people, ...aside, others > 0 ? `${others} conversas lidas não marcaram horário.` : ''].filter(Boolean).join('\n');
  });
  return [
    brief.scope === 'all'
      ? 'RASTREAMENTO DO PERÍODO ESCOLHIDO, sem limitar às campanhas da tela:'
      : 'RASTREAMENTO DO PERÍODO ESCOLHIDO, só das campanhas que estão na tela:',
    'Cada conjunto já foi lido no Rastreamento. Não diga que não tem acesso e não peça para colar a conversa.',
    `Cliente: ${brief.clientName || brief.clientId}`,
    `Período: ${brief.weekLabel}`,
    `Contatos no período: ${brief.found}. Marcados como Agendado no Mini CRM: ${brief.scheduled}.`,
    brief.scope === 'all'
      ? `Número desta pesquisa: ${brief.fillCount}. Use este número. Ele inclui quem não está na ficha.`
      : `Número do campo Agendamentos: ${brief.fillCount}. Use este número. Não invente outro. Não some quem está fora da ficha.`,
    brief.summary || '',
    ...blocks,
    'Leia as falas e interprete o que a pessoa quis. Uma data no texto não é visita: pode ser casamento, dúvida ou recusa. Não liste nomes, telefones nem campanhas: a tela já mostra os cartões. Em até 5 linhas, diga o que as conversas mostram e se o número do campo faz sentido. Não diga que não tem acesso.',
  ].filter(Boolean).join('\n');
}

async function pageRows(queryFactory, cap) {
  const rows = [];
  let from = 0;
  const page = 400;
  while (rows.length < cap) {
    const { data, error } = await queryFactory().range(from, from + page - 1);
    if (error) throw error;
    const chunk = data || [];
    rows.push(...chunk);
    if (chunk.length < page) break;
    from += page;
  }
  return rows.slice(0, cap);
}

export async function loadRoutineBrief(client, { clientId, weekStart, since, until, scope = 'sheet', clientName = '', resultLabel = 'Agendamentos', sheetRows = [] } = {}) {
  const range = routineSearchRange(since, until) || routineWeekRange(weekStart);
  if (!clientId || !range?.sinceIso) {
    return { error: 'Escolha o período no chat para eu ler o Rastreamento.' };
  }
  const searchScope = scope === 'all' ? 'all' : 'sheet';
  const { sinceIso, untilIso } = range;
  const contactSelect = 'id, phone, from_jid, sender_name, first_seen_at, last_message_at, tracking_data, utm_campaign, utm_medium, utm_content, qualificado, comprou, valor_venda, mini_crm';
  const [entered, talked, inbox, sent] = await Promise.all([
    pageRows(
      () => client
        .from('cliente_whatsapp_contact')
        .select(contactSelect)
        .eq('cliente_id', clientId)
        .gte('first_seen_at', sinceIso)
        .lte('first_seen_at', untilIso)
        .order('first_seen_at', { ascending: false }),
      500,
    ),
    pageRows(
      () => client
        .from('cliente_whatsapp_contact')
        .select(contactSelect)
        .eq('cliente_id', clientId)
        .gte('last_message_at', sinceIso)
        .lte('last_message_at', untilIso)
        .order('last_message_at', { ascending: false }),
      500,
    ),
    pageRows(
      () => client
        .from('cliente_whatsapp_inbox')
        .select('phone, from_jid, chat_jid, body, created_at')
        .eq('cliente_id', clientId)
        .eq('is_group', false)
        .gte('created_at', sinceIso)
        .lte('created_at', untilIso)
        .order('created_at', { ascending: false }),
      ROUTINE_BRIEF_MESSAGE_CAP,
    ),
    pageRows(
      () => client
        .from('cliente_whatsapp_sent')
        .select('to_jid, chat_jid, body, created_at')
        .eq('cliente_id', clientId)
        .gte('created_at', sinceIso)
        .lte('created_at', untilIso)
        .order('created_at', { ascending: false }),
      ROUTINE_BRIEF_MESSAGE_CAP,
    ),
  ]);
  const byId = new Map();
  [...entered, ...talked].forEach((row) => byId.set(row.id, row));
  const brief = summarizeRoutineLeads({
    contacts: [...byId.values()],
    inbox,
    sent,
    range,
    clientId,
    clientName,
    resultLabel,
    sheetRows: searchScope === 'all' ? [] : sheetRows,
    scope: searchScope,
  });
  return {
    ...brief,
    canApply: routineSearchMatchesSheet({ since: range.since, until: range.until, weekStart, scope: searchScope }),
  };
}

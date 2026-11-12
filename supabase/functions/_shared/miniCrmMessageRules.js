// Shared by the preview and the webhook. No transport, model or commercial action.
export const MESSAGE_RULES_VERSION = 1;
export const DEFAULT_APPOINTMENT_WORDS = ['agendada', 'agendado', 'agendei', 'agendamos', 'reagendada', 'reagendado', 'reagendei', 'marcada', 'marcado', 'marquei', 'marcamos', 'confirmada', 'confirmado', 'confirmei'];
export const normalizeRuleText = (value) => String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
export const splitRuleWords = (value) => String(value || '').split(/[,;\n]/).map((word) => normalizeRuleText(word).slice(0, 100)).filter(Boolean).slice(0, 30);
export const timeFieldFor = (field) => `${field}_hora`;
const MONTHS = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const cleanChannels = (value) => [...new Set((Array.isArray(value) ? value : []).filter((key) => typeof key === 'string' && key.length <= 100))].slice(0, 40);

export function normalizeMessageRules(value = {}) {
  const base = value && typeof value === 'object' ? value : {};
  return {
    version: MESSAGE_RULES_VERSION, enabled: base.enabled === true,
    entryStatus: String(base.entryStatus || 'Novo Lead').slice(0, 150),
    workingStatus: String(base.workingStatus || 'Em Atendimento').slice(0, 150),
    arrivalChannels: cleanChannels(base.arrivalChannels),
    appointmentEnabled: base.appointmentEnabled !== false,
    appointmentStatus: String(base.appointmentStatus || 'Agendado').slice(0, 150),
    appointmentField: String(base.appointmentField || '').slice(0, 150),
    appointmentWords: String(base.appointmentWords || '').slice(0, 2000),
    appointmentChannels: cleanChannels(base.appointmentChannels),
    keywords: (Array.isArray(base.keywords) ? base.keywords : []).slice(0, 30).map((rule, index) => ({
      id: String(rule?.id || `rule-${index}`).slice(0, 100), words: String(rule?.words || '').slice(0, 2000),
      status: String(rule?.status || '').slice(0, 150), sender: ['team', 'any'].includes(rule?.sender) ? rule.sender : 'lead',
      channels: cleanChannels(rule?.channels),
    })),
  };
}

function distanceAtMostOne(a, b) {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, errors = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i += 1; j += 1; continue; }
    if (++errors > 1) return false;
    if (a.length >= b.length) i += 1;
    if (b.length >= a.length) j += 1;
  }
  return errors + (i < a.length || j < b.length ? 1 : 0) <= 1;
}

export function messageHasAppointmentWord(text, extra = '') {
  const words = normalizeRuleText(text).split(/[^a-z0-9]+/).filter((word) => word.length >= 5 && word.length <= 18);
  const expected = [...DEFAULT_APPOINTMENT_WORDS, ...splitRuleWords(extra).filter((word) => !word.includes(' ') && word.length >= 5)];
  return words.some((word) => expected.some((term) => distanceAtMostOne(word, term)))
    || splitRuleWords(extra).some((phrase) => phrase.includes(' ') && messageHasKeyword(text, phrase));
}

export function messageHasKeyword(text, word) {
  const normalized = ` ${normalizeRuleText(text).replace(/[^a-z0-9 ]/g, ' ')} `;
  const expected = normalizeRuleText(word).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  return expected.length >= 2 && normalized.replace(/\s+/g, ' ').includes(` ${expected} `);
}

export function localMessageDate(timestamp) {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return null;
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date).map((part) => [part.type, part.value]));
  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day) };
}

export function parseMessageAppointment(message, timestamp, extraWords = '') {
  const text = normalizeRuleText(message).slice(0, 5000);
  if (!messageHasAppointmentWord(text, extraWords)) return { ok: false, reason: 'Sem confirmação de agendamento.' };
  if (/\b(nao|nunca|nem|ainda nao)\b.{0,45}\b(agend|reagend|marcad|confirm)/.test(text) || /\b(cancelad[oa]|cancelamento|desmarcad[oa])\b/.test(text)) return { ok: false, reason: 'Mensagem negativa ou de cancelamento.' };
  if (text.includes('?')) return { ok: false, reason: 'A mensagem é uma pergunta. Aguarde uma confirmação.' };
  if (/\bhoje\b/.test(text) && /\bamanha\b/.test(text)) return { ok: false, reason: 'Há mais de uma data. Confirme uma data única.' };
  const reference = localMessageDate(timestamp);
  if (!reference) return { ok: false, reason: 'Horário da mensagem inválido.' };
  const found = [];
  const isoDates = [...text.matchAll(/\b(20\d{2})-(\d{2})-(\d{2})\b/g)];
  isoDates.forEach((match) => found.push({ year: +match[1], month: +match[2], day: +match[3] }));
  const withoutIso = text.replace(/\b20\d{2}-\d{2}-\d{2}\b/g, ' ');
  for (const match of withoutIso.matchAll(/\b(\d{1,2})\s*[\/.-]\s*(\d{1,2})(?:\s*[\/.-]\s*(\d{2}|\d{4}))?\b/g)) {
    found.push({ day: +match[1], month: +match[2], year: match[3] ? (+match[3] < 100 ? +match[3] + 2000 : +match[3]) : null });
  }
  const monthPattern = new RegExp(`\\b(\\d{1,2}) de (${MONTHS.join('|')})(?: de (20\\d{2}))?\\b`, 'g');
  for (const match of text.matchAll(monthPattern)) found.push({ day: +match[1], month: MONTHS.indexOf(match[2]) + 1, year: match[3] ? +match[3] : null });
  if (!found.length && /\b(hoje|amanha)\b/.test(text)) {
    const date = new Date(Date.UTC(reference.year, reference.month - 1, reference.day + (/\bamanha\b/.test(text) ? 1 : 0)));
    found.push({ year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() });
  }
  const dates = new Map();
  for (const value of found) {
    let year = value.year || reference.year;
    if (!value.year && Date.UTC(year, value.month - 1, value.day) < Date.UTC(reference.year, reference.month - 1, reference.day) - 7 * 86400000) year += 1;
    const candidate = new Date(Date.UTC(year, value.month - 1, value.day));
    if (year < 2000 || year > 2100 || candidate.getUTCFullYear() !== year || candidate.getUTCMonth() + 1 !== value.month || candidate.getUTCDate() !== value.day) return { ok: false, reason: 'Data inválida.' };
    const day = `${year}-${String(value.month).padStart(2, '0')}-${String(value.day).padStart(2, '0')}`;
    dates.set(day, day);
  }
  if (dates.size !== 1) return { ok: false, reason: dates.size ? 'Há mais de uma data. Confirme uma data única.' : 'Não encontrei o dia do agendamento.' };
  const times = new Set();
  const timePattern = /(?:\b(?:as|pelas)\s+)?\b(\d{1,2})\s*(?::\s*(\d{2})|h\s*(\d{2})\b|(?:hrs|hr|horas|hora|h)\b)|\b(?:as|pelas)\s+(\d{1,2})\b/g;
  for (const match of text.matchAll(timePattern)) {
    const hour = Number(match[1] ?? match[4]), minute = Number(match[2] ?? match[3] ?? 0);
    if (hour > 23 || minute > 59) return { ok: false, reason: 'Horário inválido.' };
    times.add(`${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`);
  }
  if (times.size > 1) return { ok: false, reason: 'Há mais de um horário. Confirme um horário único.' };
  const day = [...dates.keys()][0], time = [...times][0] || '';
  return { ok: true, day, time, label: `${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)}${time ? ` às ${time}` : ' · sem horário'}` };
}

// These stages have their own confirmation/cadence actions in the Mini CRM.
export const MANUAL_ACTION_STATUSES = new Set(['Venda Realizada', 'Lead Qualificado', 'Follow Up', 'Repescagem']);
export const messageStatusAllowed = (key) => !MANUAL_ACTION_STATUSES.has(key);

export function messageRulesCatalog(client, config) {
  const defaults = ['Novo Lead', 'Em Atendimento', 'Lead Qualificado', 'Agendado', 'Em Negociação', 'Venda Realizada', 'Venda Perdida', 'Follow Up', 'Não Respondeu', 'Não Compareceu', 'Reagendado', 'Lead Desqualificado'];
  const statuses = config && Array.isArray(config.statuses) ? config.statuses : defaults;
  let columns = config && Array.isArray(config.columns) ? config.columns : [];
  if (!config && /noiva/.test(normalizeRuleText(client?.nicho))) columns = [{ key: 'data_agendamento', label: 'Data Agendamento', kind: 'day' }];
  if (!config && /loja de carro|revenda de veiculo|concessionaria/.test(normalizeRuleText(client?.nicho))) columns = [{ key: 'data_da_visita', label: 'Data da Visita', kind: 'day' }];
  return {
    statuses: statuses.map((item) => typeof item === 'string' ? { key: item, label: item } : item).filter((item) => item?.key && item?.label),
    columns: columns.filter((column) => ['day', 'date'].includes(column.kind) && /agend|visita/.test(normalizeRuleText(`${column.key} ${column.label}`)) && column.key !== 'data_venda'),
  };
}

export function validateMessageRules(value, catalog) {
  const rules = normalizeMessageRules(value), errors = [];
  if (!rules.enabled) return errors;
  const keys = new Set(catalog.statuses.filter((status) => messageStatusAllowed(status.key)).map((status) => status.key));
  if (!keys.has(rules.entryStatus)) errors.push('Escolha a etapa de chegada entre os status da loja.');
  if (!keys.has(rules.workingStatus)) errors.push('Escolha a etapa após a resposta da equipe.');
  if (rules.appointmentEnabled) {
    if (!keys.has(rules.appointmentStatus)) errors.push('Escolha a etapa de agendamento.');
    if (!catalog.columns.some((column) => column.key === rules.appointmentField)) errors.push('Escolha uma coluna de data de agendamento ou visita.');
  }
  if (rules.keywords.some((rule) => !splitRuleWords(rule.words).length || !keys.has(rule.status))) errors.push('Preencha as palavras e o status de cada regra.');
  return errors;
}

export function planMiniCrmMessage({ rules: value, catalog, mini = {}, event, enabledAt = null, now = new Date().toISOString() }) {
  const rules = normalizeMessageRules(value);
  const skip = (reason) => ({ apply: false, reason });
  if (!rules.enabled) return skip('disabled');
  if (validateMessageRules(rules, catalog).length) return skip('invalid_rules');
  if (!event || event.historical || event.isGroup || typeof event.fromMe !== 'boolean' || !event.messageId || String(event.messageId).length > 200 || !event.channel) return skip('not_a_direct_message');
  if (/reaction|reacao|ack|receipt|protocol|update|revok|delete|blocked|noted|step_entered|nps_interaction/i.test(String(event.type || ''))) return skip('not_a_message');
  const at = new Date(event.at).getTime();
  if (!Number.isFinite(at) || at > new Date(now).getTime() + 300000 || (enabledAt && at < new Date(enabledAt).getTime())) return skip('old_or_invalid_time');
  const meta = mini._planeje_message_status || {};
  if (meta.manual === true) return skip('manual');
  const channels = [event.channel, ...(event.channelAliases || [])];
  if ((meta.lastMessageId === String(event.messageId) && channels.includes(meta.lastChannel)) || (meta.lastMessageAt && at < new Date(meta.lastMessageAt).getTime())) return skip('already_processed_or_older');
  const current = String(mini.status || '');
  if (current && current !== rules.entryStatus && current !== rules.workingStatus && meta.lastStatus !== current) return skip('existing_manual_stage');
  const inChannels = (list) => !list.length || channels.some(channel => list.includes(channel));
  const patch = {};
  let status = '', reason = '', appointment = null;
  if (rules.appointmentEnabled && event.fromMe && inChannels(rules.appointmentChannels)) {
    const parsed = parseMessageAppointment(event.text, event.at, rules.appointmentWords);
    if (parsed.ok) { appointment = parsed; status = rules.appointmentStatus; reason = 'appointment'; }
  }
  if (!status) {
    const keyword = rules.keywords.find((rule) => inChannels(rule.channels)
      && (rule.sender === 'any' || (rule.sender === 'team') === event.fromMe)
      && splitRuleWords(rule.words).some((word) => messageHasKeyword(event.text, word)));
    if (keyword) { status = keyword.status; reason = `keyword:${keyword.id}`; }
  }
  if (!status && inChannels(rules.arrivalChannels)) {
    if (event.fromMe && (!current || current === rules.entryStatus || current === rules.workingStatus)) { status = rules.workingStatus; reason = 'team_reply'; }
    else if (!event.fromMe && !current) { status = rules.entryStatus; reason = 'arrival'; }
  }
  if (!status) return skip('no_match');
  patch.status = status;
  if (appointment) {
    patch[rules.appointmentField] = appointment.day;
    patch[timeFieldFor(rules.appointmentField)] = appointment.time || null;
  }
  patch._planeje_message_status = {
    manual: false, lastStatus: status, lastMessageAt: new Date(at).toISOString(),
    lastMessageId: String(event.messageId), lastChannel: event.channel, reason,
  };
  return { apply: true, patch, reason, appointment };
}

export function miniCrmPatchDifference(before = {}, after = {}) {
  const patch = {};
  for (const key of new Set([...Object.keys(before || {}), ...Object.keys(after || {})])) {
    if (key === '_planeje_message_status') continue;
    if (JSON.stringify(before?.[key]) !== JSON.stringify(after?.[key])) patch[key] = after?.[key] ?? null;
  }
  return patch;
}

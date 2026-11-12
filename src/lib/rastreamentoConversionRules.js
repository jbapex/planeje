import { withoutAnalysisLabels } from './rastreamentoAnalysisLabels.js';

/** Gatilhos de conversão do Rastreamento (especificação TRACK-APICE). */

export const CONVERSION_TRIGGER_TYPES = [
  { value: 'etiqueta', label: 'Etiqueta (CRM ou WhatsApp)' },
  { value: 'mensagem', label: 'Frase na mensagem' },
];

export const CONVERSION_EVENT_NAMES = [
  { value: 'Lead', label: 'Lead' },
  { value: 'QualifiedLead', label: 'Qualificado' },
  { value: 'InitiateCheckout', label: 'Checkout iniciado' },
  { value: 'Purchase', label: 'Compra' },
];

export function conversionEventLabel(eventName) {
  const found = CONVERSION_EVENT_NAMES.find((item) => item.value === eventName);
  return found?.label || String(eventName || '');
}

function gatilhoHint(rule) {
  const value = String(rule?.trigger_value || '').trim();
  if (!value) return '';
  const kind = rule.trigger_type === 'mensagem' ? 'Frase' : 'Etiqueta';
  return `${kind} “${value}”`;
}

/** Etapas do funil da Visão geral: um evento por gatilho ativo, na ordem da jornada. */
export function activeJourneyEvents(rules) {
  const buckets = new Map();
  for (const rule of rules || []) {
    if (rule?.active === false) continue;
    const eventName = String(rule.event_name || '').trim();
    if (!eventName) continue;
    const hint = gatilhoHint(rule);
    const existing = buckets.get(eventName);
    if (!existing) {
      buckets.set(eventName, {
        eventName,
        label: String(rule.name || '').trim() || conversionEventLabel(eventName),
        hints: hint ? [hint] : [],
      });
      continue;
    }
    if (hint && !existing.hints.includes(hint)) existing.hints.push(hint);
  }
  const known = CONVERSION_EVENT_NAMES.map((item) => item.value).filter((name) => buckets.has(name));
  const extra = [...buckets.keys()].filter((name) => !known.includes(name));
  return [...known, ...extra].map((eventName) => {
    const item = buckets.get(eventName);
    return {
      eventName,
      label: item.label,
      hint: item.hints.join(' · '),
    };
  });
}

export function normalizeTriggerText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

export function matchConversionRule(rule, { etiquetas = [], messageText = '' } = {}) {
  if (!rule || rule.active === false) return false;
  const expected = normalizeTriggerText(rule.trigger_value);
  if (!expected) return false;
  const mode = rule.match_mode === 'exact' ? 'exact' : 'contains';

  if (rule.trigger_type === 'etiqueta') {
    const tags = (Array.isArray(etiquetas) ? etiquetas : []).map(normalizeTriggerText).filter(Boolean);
    return tags.some((tag) => (mode === 'exact' ? tag === expected : tag.includes(expected)));
  }

  if (rule.trigger_type === 'mensagem') {
    const text = normalizeTriggerText(messageText);
    if (!text) return false;
    return mode === 'exact' ? text === expected : text.includes(expected);
  }

  return false;
}

export function addedEtiquetas(previous, next) {
  const prev = new Set((Array.isArray(previous) ? previous : []).map(normalizeTriggerText).filter(Boolean));
  return (Array.isArray(next) ? next : []).filter((tag) => {
    const key = normalizeTriggerText(tag);
    return key && !prev.has(key);
  });
}

export function rulesMatchingNewEtiquetas(rules, added) {
  return (rules || []).filter((rule) => matchConversionRule(rule, { etiquetas: added }));
}

export function rulesMatchingMessage(rules, messageText) {
  const text = String(messageText || '');
  if (!text.trim()) return [];
  return (rules || []).filter(
    (rule) => rule.trigger_type === 'mensagem' && matchConversionRule(rule, { messageText: text }),
  );
}

/** Lead de rastreamento no TRACK: inbound, não grupo, com ctwaClid. */
export function paidCtwaReady({ isGroup = false, ctwaClid = '' } = {}) {
  return !isGroup && Boolean(String(ctwaClid || '').trim());
}

/**
 * Eventos CAPI desta mensagem, na ordem TRACK: auto_lead → etiqueta nova → frase.
 * fromMe não cria conversa iniciada; só avalia frase (e etiqueta nova) no lead já pago.
 */
export function webhookConversionPlan({
  fromMe = false,
  isGroup = false,
  ctwaClid = '',
  addedLabels = [],
  messageText = '',
  rules = [],
  autoLeadAlreadySent = false,
} = {}) {
  if (!paidCtwaReady({ isGroup, ctwaClid })) return [];
  const events = [];
  if (!fromMe && !autoLeadAlreadySent) {
    events.push({ id: 'auto_lead', event_name: 'LeadSubmitted', trigger_type: 'auto_lead' });
  }
  events.push(...rulesMatchingNewEtiquetas(rules, withoutAnalysisLabels(addedLabels)));
  events.push(...rulesMatchingMessage(rules, messageText));
  const seen = new Set();
  return events.filter((item) => {
    const key = String(item.id || item.event_name);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Nomes de etiqueta do payload Uazapi (chat.labels / tags). */
export function extractChatLabels(source) {
  const names = [];
  const visit = (value) => {
    if (value == null) return;
    if (typeof value === 'string' || typeof value === 'number') {
      const name = String(value).trim();
      if (name) names.push(name);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (typeof value === 'object') {
      const rec = value;
      const named = rec.name ?? rec.title ?? rec.label ?? rec.tag ?? rec.value;
      if (named != null) visit(named);
    }
  };
  if (!source || typeof source !== 'object') return [];
  const rec = source;
  visit(rec.labels ?? rec.Labels ?? rec.tags ?? rec.Tags ?? rec.wa_labels ?? rec.chatLabels);
  return [...new Set(names)];
}

export function eventPatchForName(eventName, { valor } = {}) {
  if (eventName === 'Purchase') {
    return { comprou: true, ...(valor != null ? { valor } : {}) };
  }
  if (eventName === 'QualifiedLead' || eventName === 'Lead') {
    return { qualificado: true };
  }
  if (eventName === 'InitiateCheckout') {
    return {};
  }
  return null;
}

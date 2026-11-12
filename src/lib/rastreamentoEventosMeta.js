/** Auditoria de Eventos Meta no Rastreamento — equivalente TRACK, sem fila/sombra. */

import {
  capiEventLabel,
  classifyCapiLogRow,
  isTransientCapiError,
} from './rastreamentoCapiStatus.js';
import {
  dateOnlyInSaoPaulo as dateOnlyInSaoPauloShared,
  defaultRastreamentoPeriod,
  periodBoundsSaoPaulo,
  timestampInSaoPauloRange,
} from './rastreamentoPeriod.js';

export const EVENTOS_PAGE_SIZE = 25;

export const EVENTOS_EVENT_FILTERS = [
  { value: 'LeadSubmitted', label: 'Conversa iniciada' },
  { value: 'QualifiedLead', label: 'Lead qualificado' },
  { value: 'InitiateCheckout', label: 'Checkout iniciado' },
  { value: 'Purchase', label: 'Compra' },
];

export const EVENTOS_STATUS_FILTERS = [
  { value: 'sent', label: 'Enviados' },
  { value: 'blocked', label: 'Bloqueados' },
  { value: 'failed', label: 'Falhas' },
];

export const EVENTOS_SOURCE_FILTERS = [
  { value: 'whatsapp_automation', label: 'Automação do WhatsApp' },
  { value: 'system', label: 'Regra automática' },
  { value: 'other', label: 'Outra origem' },
];

export const dateOnlyInSaoPaulo = dateOnlyInSaoPauloShared;

export function defaultEventosPeriod(now = new Date()) {
  return defaultRastreamentoPeriod(now);
}

export function periodUtcBounds(since, until) {
  const bounds = periodBoundsSaoPaulo(since, until);
  if (!bounds.sinceIso) return null;
  return { from: bounds.sinceIso, to: bounds.untilIso };
}

export function formatEventosDateBr(isoDate) {
  const [year, month, day] = String(isoDate || '').slice(0, 10).split('-');
  if (!year || !month || !day) return String(isoDate || '');
  return `${day}/${month}/${year}`;
}

export function capiEventSource(eventName) {
  const name = String(eventName || '');
  if (name === 'LeadSubmitted' || name === 'Lead') {
    return { id: 'whatsapp_automation', label: 'Automação do WhatsApp' };
  }
  if (name === 'QualifiedLead' || name === 'Purchase' || name === 'InitiateCheckout') {
    return { id: 'system', label: 'Regra automática' };
  }
  return { id: 'other', label: 'Outra origem' };
}

export function capiDeliveryState(row) {
  const classified = classifyCapiLogRow(row);
  if (classified === 'enviado') return 'sent';
  if (classified === 'not_configured') return 'blocked';
  return 'failed';
}

export function capiDeliveryLabel(state) {
  switch (state) {
    case 'sent':
      return 'Enviado';
    case 'blocked':
      return 'Bloqueado';
    case 'failed':
      return 'Falha';
    default:
      return 'Erro';
  }
}

export function capiDeliveryDetail(row) {
  const state = capiDeliveryState(row);
  if (state === 'sent') return 'Recebido pela Meta';
  if (state === 'blocked') return 'Falta configuração de destino';
  return String(row?.error_message || '').trim() || 'Envio não concluído';
}

export function capiMissingFields(row) {
  if (row?.success) return [];
  const err = String(row?.error_message || '').toLowerCase();
  const fields = [];
  if (!row?.ctwa_clid || (err.includes('ctwa') && (err.includes('falt') || err.includes('ausent') || err.includes('obrigat')))) {
    if (!row?.ctwa_clid) fields.push('ctwa_clid');
  }
  if (err.includes('page_id') || err.includes('página') || err.includes('pagina')) fields.push('page_id');
  if (err.includes('dataset') || err.includes('pixel')) fields.push('pixel_id');
  if (err.includes('not_configured') && !fields.length) {
    fields.push('pixel_id', 'page_id');
  }
  return [...new Set(fields)];
}

export function missingFieldLabel(field) {
  const labels = {
    phone_hash: 'Telefone identificável',
    ad_id: 'Anúncio de origem',
    ctwa_clid: 'Identificador de clique',
    pixel_id: 'Pixel Meta',
    page_id: 'Página Facebook',
  };
  return labels[field] || field;
}

export function campaignContextFromTracking(row) {
  const td = row?.tracking_data && typeof row.tracking_data === 'object' ? row.tracking_data : {};
  const campaign =
    td.meta_ad_details?.ad?.campaign?.name ||
    row?.utm_campaign ||
    td.utm_campaign ||
    td.campaign_name ||
    '';
  const adSet =
    td.meta_ad_details?.ad?.adset?.name ||
    td.adset_name ||
    row?.utm_medium ||
    td.utm_medium ||
    '';
  const ad =
    td.meta_ad_details?.ad?.name ||
    td.ad_name ||
    row?.utm_content ||
    td.utm_content ||
    '';
  return {
    campaignName: String(campaign || '').trim() || 'Campanha não resolvida',
    adSetName: String(adSet || '').trim() || 'Conjunto não resolvido',
    adName: String(ad || '').trim() || 'Anúncio não resolvido',
  };
}

export function displayEventosPhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 13 && digits.startsWith('55')) {
    return `+55 (${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`;
  }
  if (digits.length === 12 && digits.startsWith('55')) {
    return `+55 (${digits.slice(2, 4)}) ${digits.slice(4, 8)}-${digits.slice(8)}`;
  }
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return String(value || '').trim() || 'Telefone indisponível';
}

export function capiInspectSnapshots(row) {
  return {
    source: {
      label: row?.ctwa_clid ? 'Clique CTWA e contato' : 'Sem identificador de clique',
      payload: {
        event_name: row?.event_name || null,
        ctwa_clid: row?.ctwa_clid || null,
        contact_id: row?.contact_id || null,
        lead_id: row?.lead_id || null,
        whatsapp_config_id: row?.whatsapp_config_id || null,
      },
    },
    request: {
      label: 'Resumo do que foi enviado. O JSON completo da Graph não fica gravado.',
      payload: {
        event_name: row?.event_name || null,
        action_source: 'business_messaging',
        messaging_channel: 'whatsapp',
        tem_ctwa_clid: Boolean(row?.ctwa_clid),
        sucesso: Boolean(row?.success),
      },
    },
    response: {
      label: row?.meta_response ? 'Resposta da Graph' : 'Sem resposta gravada',
      payload: row?.meta_response || null,
    },
  };
}

function startedConversationKey(row) {
  return String(row?.contact_id || row?.ctwa_clid || row?.lead_id || row?.id || '');
}

/** Conversa iniciada no recorte = LeadSubmitted cuja primeira mensagem do contato cai no período. */
export function isStartedConversationInPeriod(row, sinceYmd, untilYmd) {
  if (row?.event_name !== 'LeadSubmitted') return false;
  if (!sinceYmd && !untilYmd) return true;
  const firstSeen = row.contact?.first_seen_at;
  if (!firstSeen) return false;
  const ms = Date.parse(firstSeen);
  if (Number.isNaN(ms)) return false;
  return timestampInSaoPauloRange(ms, sinceYmd || '', untilYmd || '');
}

export const CAPI_EVENT_SHORT_LABELS = {
  LeadSubmitted: 'Iniciada',
  Lead: 'Lead',
  QualifiedLead: 'Qualificado',
  InitiateCheckout: 'Checkout',
  Purchase: 'Compra',
};

const CAPI_EVENT_RANK = {
  LeadSubmitted: 1,
  Lead: 2,
  QualifiedLead: 3,
  InitiateCheckout: 4,
  Purchase: 5,
};

export function capiEventShortLabel(eventName) {
  const key = String(eventName || '').trim();
  return CAPI_EVENT_SHORT_LABELS[key] || capiEventLabel(key);
}

/** Evento mais avançado enviado com sucesso; se nenhum sucesso, o último envio. */
export function summarizeLeadCapiEvents(rows) {
  const list = Array.isArray(rows) ? rows.filter(Boolean) : [];
  if (!list.length) return null;
  const sorted = [...list].sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')));
  const latest = sorted[sorted.length - 1];
  let farthest = null;
  let farthestRank = -1;
  for (const row of sorted) {
    if (!row.success) continue;
    const rank = CAPI_EVENT_RANK[row.event_name] || 0;
    if (rank >= farthestRank) {
      farthest = row;
      farthestRank = rank;
    }
  }
  const shown = farthest || latest;
  const delivery = capiDeliveryState(shown);
  return {
    eventName: shown.event_name || '',
    label: capiEventShortLabel(shown.event_name),
    fullLabel: capiEventLabel(shown.event_name),
    success: Boolean(shown.success),
    delivery,
    count: list.length,
    createdAt: shown.created_at || '',
    title: [
      capiEventLabel(shown.event_name),
      capiDeliveryLabel(delivery),
      list.length > 1 ? `${list.length} envios no período` : '',
    ]
      .filter(Boolean)
      .join(' · '),
  };
}

export function indexCapiEventsByLeadKey(rows) {
  const groups = new Map();
  for (const row of rows || []) {
    if (row?.contact_id) {
      const key = `c:${row.contact_id}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    }
    if (row?.lead_id) {
      const key = `l:${row.lead_id}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    }
  }
  const out = new Map();
  for (const [key, list] of groups) {
    out.set(key, summarizeLeadCapiEvents(list));
  }
  return out;
}

export function capiEventKeyForLeadRow(row) {
  if (row?._fromLead && row._leadRef?.id) return `l:${row._leadRef.id}`;
  if (row?.id) return `c:${row.id}`;
  return '';
}

export function summarizeEventos(rows, { since, until } = {}) {
  let sent = 0;
  let blocked = 0;
  let failed = 0;
  const started = new Set();
  (rows || []).forEach((row, index) => {
    const state = capiDeliveryState(row);
    if (state === 'sent') sent += 1;
    else if (state === 'blocked') blocked += 1;
    else failed += 1;
    if (isStartedConversationInPeriod(row, since, until)) {
      started.add(startedConversationKey(row) || `anon:${index}`);
    }
  });
  return {
    total: rows.length,
    sent,
    blocked,
    failed,
    startedConversations: started.size,
  };
}

export function filterEventosRows(rows, { eventName, status, source, startedOnly, since, until } = {}) {
  return (rows || []).filter((row) => {
    if (eventName && row.event_name !== eventName) return false;
    if (status && capiDeliveryState(row) !== status) return false;
    if (source && capiEventSource(row.event_name).id !== source) return false;
    if (startedOnly && !isStartedConversationInPeriod(row, since, until)) return false;
    return true;
  });
}

export function paginateEventosRows(rows, page, pageSize = EVENTOS_PAGE_SIZE) {
  const size = Math.min(Math.max(Number(pageSize) || EVENTOS_PAGE_SIZE, 1), 100);
  const totalItems = Array.isArray(rows) ? rows.length : 0;
  const totalPages = Math.max(1, Math.ceil(totalItems / size) || 1);
  const current = Math.min(Math.max(Number(page) || 1, 1), totalPages);
  const start = (current - 1) * size;
  return {
    page: current,
    pageSize: size,
    totalItems,
    totalPages,
    items: (rows || []).slice(start, start + size),
  };
}

export function formatEventosWhen(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function canRetryEvento(row) {
  if (!row || row.success) return false;
  if (row.event_name === 'LeadSubmitted') {
    return Boolean(String(row.ctwa_clid || '').trim());
  }
  return isTransientCapiError(row.error_message);
}

export { capiEventLabel, isTransientCapiError };

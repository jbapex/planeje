import { capiEventLabel, isTransientCapiError } from './rastreamentoCapiStatus.js';

export function googleEventLabel(eventName) {
  return capiEventLabel(eventName);
}

export function googleDeliveryState(row) {
  if (row?.success) return 'sent';
  const meta = googleEventMetadata(row);
  if (meta?.phase === 'processing') return 'pending';
  if (meta?.phase === 'sending') return Date.now() - Date.parse(meta.submittedAt || row.created_at) > 5 * 60_000 ? 'uncertain' : 'pending';
  if (meta?.phase === 'uncertain') return 'uncertain';
  const err = String(row?.error_message || '').toLowerCase();
  if (
    err.includes('not_configured') ||
    err.includes('ação não mapeada') ||
    err.includes('action_not_mapped') ||
    err.includes('conversions_enabled') ||
    err.includes('sem_gclid') ||
    err.includes('missing_gclid') ||
    err.includes('datamanager_reauthorize') ||
    err.includes('datamanager_api_disabled')
  ) {
    return 'blocked';
  }
  return 'failed';
}

export function googleDeliveryLabel(state) {
  switch (state) {
    case 'sent':
      return 'Enviado';
    case 'pending':
      return 'Em processamento';
    case 'uncertain':
      return 'Sem confirmação';
    case 'blocked':
      return 'Bloqueado';
    case 'failed':
      return 'Falha';
    default:
      return 'Erro';
  }
}

export function canRetryGoogleEvento(row) {
  if (!row || row.success || googleDeliveryState(row) === 'pending') return false;
  const meta = googleEventMetadata(row);
  if (row.event_name === 'Purchase' && !meta?.event) return false;
  const details = meta?.response?.error?.details;
  if (meta?.phase === 'failed' && Array.isArray(details) && details.some((detail) =>
    Array.isArray(detail?.fieldViolations) && detail.fieldViolations.some((v) =>
      v?.reason === 'REQUIRED_FIELD_MISSING' && v?.field === 'events.events[0].event_source'))) return true;
  return googleDeliveryState(row) === 'uncertain' || isTransientCapiError(row.error_message) ||
    /DATAMANAGER_REAUTHORIZE|DATAMANAGER_API_DISABLED|DATAMANAGER_PROJECT_REQUIRED|HTTP (429|5\d\d)|New integrations.*Data Manager|CUSTOMER_NOT_ALLOWLISTED_FOR_THIS_FEATURE/i.test(row.error_message || '');
}

export function googleEventMetadata(row) {
  return row?.google_response?.api === 'data_manager_v1' ? row.google_response : null;
}

/** O log é de tentativas; a conversão mantém a identidade de cliente/clique/evento/ação. */
export function groupGoogleEventos(rows) {
  const groups = new Map();
  const seen = new Set();
  (rows || []).forEach((row, index) => {
    const recordKey = JSON.stringify([row.cliente_id, row.id || index]);
    if (seen.has(recordKey)) return;
    seen.add(recordKey);
    const eventName = row.event_name === 'Lead' ? 'LeadSubmitted' : row.event_name;
    const key = row.gclid && eventName && row.conversion_action
      ? JSON.stringify([row.cliente_id, row.gclid, eventName, row.conversion_action])
      : `record:${recordKey}`;
    if (!groups.has(key)) groups.set(key, { key, eventName, attempts: [] });
    groups.get(key).attempts.push(row);
  });
  return [...groups.values()].map((group) => {
    const attempts = group.attempts.sort((a, b) =>
      (Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0) || String(b.id).localeCompare(String(a.id)));
    const superseded = new Set(attempts.map(row => googleEventMetadata(row)?.retryOf).filter(Boolean));
    const active = (phases) => attempts.find(row => !superseded.has(row.id) && phases.includes(googleEventMetadata(row)?.phase));
    const current = attempts.find(row => row.success) || active(['processing', 'sending']) || active(['uncertain']) || attempts[0];
    const contactIds = [...new Set(attempts.map(row => row.contact_id).filter(Boolean))];
    const leadIds = [...new Set(attempts.map(row => row.lead_id).filter(Boolean))];
    const first = [...attempts].reverse().find(row => Number.isFinite(Date.parse(googleEventMetadata(row)?.event?.eventTimestamp)));
    return {
      ...group, attempts, current,
      contactId: contactIds.length === 1 ? contactIds[0] : null,
      leadId: leadIds.length === 1 ? leadIds[0] : null,
      identityConflict: contactIds.length > 1 || leadIds.length > 1,
      firstAt: googleEventMetadata(first)?.event?.eventTimestamp || attempts.at(-1).created_at,
      lastAt: attempts[0].created_at,
    };
  }).sort((a, b) => (Date.parse(b.lastAt) || 0) - (Date.parse(a.lastAt) || 0) || a.key.localeCompare(b.key));
}

export function summarizeGoogleEventos(rows) {
  let sent = 0;
  let pending = 0;
  let blocked = 0;
  let failed = 0;
  (rows || []).forEach((row) => {
    const state = googleDeliveryState(row);
    if (state === 'sent') sent += 1;
    else if (state === 'pending') pending += 1;
    else if (state === 'blocked') blocked += 1;
    else failed += 1;
  });
  return { sent, pending, blocked, failed, total: (rows || []).length };
}

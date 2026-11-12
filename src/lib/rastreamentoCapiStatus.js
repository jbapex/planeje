/** Status e nomes de evento CAPI, alinhados à operação TRACK-APICE. */

export const CAPI_EVENT_LABELS = {
  LeadSubmitted: 'Conversa iniciada',
  Lead: 'Lead',
  QualifiedLead: 'Lead qualificado',
  InitiateCheckout: 'Checkout iniciado',
  Purchase: 'Compra atribuída',
};

export function capiEventLabel(eventName) {
  const key = String(eventName || '').trim();
  return CAPI_EVENT_LABELS[key] || key || '—';
}

export function classifyCapiLogRow(row) {
  if (row?.success) return 'enviado';
  const err = String(row?.error_message || '').toLowerCase();
  if (!err) return 'erro';
  if (
    err.includes('not_configured') ||
    err.includes('sem token') ||
    err.includes('dataset') ||
    err.includes('page_id') ||
    err.includes('ctwa') && (err.includes('falt') || err.includes('ausent') || err.includes('obrigat'))
  ) {
    return 'not_configured';
  }
  return 'erro';
}

export function classifyCapiLogLabel(status) {
  switch (status) {
    case 'enviado':
      return 'Enviado';
    case 'not_configured':
      return 'Sem destino';
    default:
      return 'Erro';
  }
}

/** TRACK só reenvia falha transitória de rede — não not_configured nem 2804117. */
export function isTransientCapiError(message) {
  const t = String(message || '').toLowerCase();
  if (!t) return false;
  if (t.includes('not_configured') || t.includes('2804117')) return false;
  if (t.includes('token') || t.includes('dataset') || t.includes('page_id')) return false;
  return /network|timeout|fetch|econnreset|503|502|429/.test(t);
}

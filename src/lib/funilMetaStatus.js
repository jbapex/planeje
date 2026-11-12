/** @typedef {'active'|'paused'|'inactive'|'unknown'} MetaStatusTone */

const ACTIVE = new Set(['ACTIVE']);
const PAUSED = new Set([
  'PAUSED',
  'CAMPAIGN_PAUSED',
  'ADSET_PAUSED',
  'PENDING_REVIEW',
  'PREAPPROVED',
  'PENDING_BILLING_INFO',
]);
const INACTIVE = new Set([
  'DELETED',
  'ARCHIVED',
  'DISAPPROVED',
  'WITH_ISSUES',
  'IN_PROCESS',
]);

export function normalizeMetaStatus(status) {
  const s = String(status || '')
    .trim()
    .toUpperCase();
  if (!s) return 'unknown';
  if (ACTIVE.has(s)) return 'active';
  if (PAUSED.has(s)) return 'paused';
  if (INACTIVE.has(s)) return 'inactive';
  if (s.includes('PAUS')) return 'paused';
  if (s.includes('ACTIVE')) return 'active';
  return 'unknown';
}

export function getMetaStatusLabel(status) {
  const tone = normalizeMetaStatus(status);
  const labels = {
    active: 'Ativa',
    paused: 'Pausada',
    inactive: 'Inativa',
    unknown: 'Status desconhecido',
  };
  return labels[tone];
}

/** Texto curto no badge do nó (canvas). */
export function getMetaStatusBadgeText(status) {
  const tone = normalizeMetaStatus(status);
  if (tone === 'active') return 'Meta';
  if (tone === 'paused') return 'Pausada';
  if (tone === 'inactive') return 'Inativa';
  return 'Meta';
}

/** Anel no círculo só quando pausada/inativa (sem brilho em ativa). */
export function getMetaStatusRingClass(status) {
  const tone = normalizeMetaStatus(status);
  if (tone === 'active' || tone === 'unknown') return '';
  return `vn-meta-status-ring vn-meta-status-ring--${tone}`;
}

export function getMetaStatusClass(tone) {
  return `funil-meta-status--${tone}`;
}


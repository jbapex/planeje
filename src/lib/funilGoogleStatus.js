/** @typedef {'active'|'paused'|'inactive'|'unknown'} GoogleStatusTone */

const ACTIVE = new Set(['ENABLED']);
const PAUSED = new Set(['PAUSED']);
const INACTIVE = new Set(['REMOVED', 'UNKNOWN']);

export function normalizeGoogleStatus(status) {
  const s = String(status || '')
    .trim()
    .toUpperCase();
  if (!s) return 'unknown';
  if (ACTIVE.has(s)) return 'active';
  if (PAUSED.has(s)) return 'paused';
  if (INACTIVE.has(s)) return 'inactive';
  if (s.includes('PAUS')) return 'paused';
  if (s.includes('ENABLE')) return 'active';
  return 'unknown';
}

export function getGoogleStatusLabel(status) {
  const tone = normalizeGoogleStatus(status);
  const labels = {
    active: 'Ativa',
    paused: 'Pausada',
    inactive: 'Removida',
    unknown: 'Status desconhecido',
  };
  return labels[tone];
}

export function getGoogleStatusBadgeText(status) {
  const tone = normalizeGoogleStatus(status);
  if (tone === 'active') return 'Google';
  if (tone === 'paused') return 'Pausada';
  if (tone === 'inactive') return 'Inativa';
  return 'Google';
}

export function getGoogleStatusRingClass(status) {
  const tone = normalizeGoogleStatus(status);
  if (tone === 'active' || tone === 'unknown') return '';
  return `vn-google-status-ring vn-google-status-ring--${tone}`;
}

export function getGoogleStatusClass(tone) {
  return `funil-google-status--${tone}`;
}

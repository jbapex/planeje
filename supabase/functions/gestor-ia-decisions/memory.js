export const MAX_DECISION_MEMORIES = 3;
export const isMemoryReferenceId = (value) => typeof value === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);

export function decisionMemoryReference(note) {
  if (typeof note?.confirmedAt !== 'string' || !Number.isFinite(Date.parse(note.confirmedAt))) return null;
  const { memoryId, version, confirmedAt } = note;
  return isMemoryReferenceId(memoryId) && Number.isSafeInteger(version) && version > 0 ? { memoryId, version, confirmedAt } : { confirmedAt };
}

export function memoryFitsDecisionAccount(source, accountId) {
  if (!source) return true;
  if (source.current !== true || source.adId) return false;
  return source.accountId ? source.accountId === accountId : !source.campaignId;
}

export function decisionMemorySourceIds(source, reading) {
  if (!memoryFitsDecisionAccount(source, reading.accountId)) return [];
  return reading.sources.filter(({ campaignId, objective }) => (!source?.campaignId || campaignId === source.campaignId) &&
    (!source?.objective || objective === source.objective)).map(({ id }) => id);
}

export async function decisionContextHash(value) {
  const encoded = new TextEncoder().encode(JSON.stringify(value));
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', encoded));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function decisionMemoryContext(ids) {
  return ids.length ? decisionContextHash([...ids].sort()) : null;
}

export function decisionMemoryExcerpt(note) {
  if (note?.state !== 'active' || note.source !== 'user_confirmation' || typeof note.confirmed_at !== 'string' ||
    !Number.isFinite(Date.parse(note.confirmed_at)) || typeof note.content !== 'string') return '';
  return note.content
    .replace(/https?:\/\/[^\s]+/gi, '[link removido]')
    .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, '[e-mail removido]')
    .replace(/\+?\(?\d[\d .()-]{7,}\d/g, (value) => value.replace(/\D/g, '').length >= 9 ? '[número removido]' : value)
    .replace(/[<>\p{C}]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 480).trim();
}

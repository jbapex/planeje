const CACHE_VERSION = 'v2';

function cacheKey(clienteId, convKey) {
  return `planeje-atendimento-thread:${CACHE_VERSION}:${clienteId}:${convKey}`;
}

export function readAtendimentoThreadCache(clienteId, convKey) {
  if (!clienteId || !convKey || typeof sessionStorage === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(cacheKey(clienteId, convKey));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeAtendimentoThreadCache(clienteId, convKey, messages) {
  if (!clienteId || !convKey || typeof sessionStorage === 'undefined') return;
  if (!Array.isArray(messages) || !messages.length) return;
  try {
    sessionStorage.setItem(cacheKey(clienteId, convKey), JSON.stringify(messages));
  } catch {
    /* quota / private mode */
  }
}

export function clearAtendimentoThreadCache(clienteId, convKey) {
  if (!clienteId || !convKey || typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.removeItem(cacheKey(clienteId, convKey));
  } catch {
    /* ignore */
  }
}

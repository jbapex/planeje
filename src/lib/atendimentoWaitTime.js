const RESOLVED_STATUS = 'resolvido';

export function isAwaitingResponse(conv) {
  if (!conv?.awaiting_response_since) return false;
  if (conv.status === RESOLVED_STATUS) return false;
  return true;
}

export function getWaitElapsedMs(conv, nowMs = Date.now()) {
  if (!isAwaitingResponse(conv)) return null;
  const since = new Date(conv.awaiting_response_since).getTime();
  if (!Number.isFinite(since)) return null;
  return Math.max(0, nowMs - since);
}

export function formatWaitDuration(ms) {
  if (ms == null || ms < 0) return '';
  const totalMinutes = Math.floor(ms / 60000);
  if (totalMinutes < 1) return '< 1 min';
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${String(minutes).padStart(2, '0')}m`;
}

export function formatWaitLabel(conv, nowMs = Date.now()) {
  const elapsed = getWaitElapsedMs(conv, nowMs);
  if (elapsed == null) return null;
  return formatWaitDuration(elapsed);
}

/** Status ao vivo da instância Uazapi. Espelhado em supabase/functions/uazapi-instance-status. */

export function nomeDoCanal(channel) {
  const name = String(channel?.name || '').trim();
  return name || 'Canal sem nome';
}

export function classificarRespostaInstancia(httpStatus, data) {
  const statusCode = Number(httpStatus) || 0;
  const payload = data && typeof data === 'object' ? data : {};
  const blob = `${statusCode} ${JSON.stringify(payload)}`.toLowerCase();
  const connected =
    payload.connected === true ||
    payload.status?.loggedIn === true ||
    payload.status?.connected === true ||
    payload.instance?.status === 'connected' ||
    String(payload.status || '').toLowerCase() === 'connected';
  if (connected) return 'connected';
  const instanceStatus = String(payload.instance?.status || '').toLowerCase();
  if (instanceStatus === 'connecting' || payload.status === 'connecting') return 'connecting';
  if (statusCode === 0 || statusCode >= 500) {
    if (blob.includes('disconnect') || blob.includes('desconect')) return 'disconnected';
    return 'unknown';
  }
  if (statusCode === 401 || statusCode === 403) return 'disconnected';
  return 'disconnected';
}

export function canaisDesconectados(channels) {
  return (channels || []).filter((channel) => channel?.status === 'disconnected');
}

export function textoCanalDesconectado(channels) {
  const names = canaisDesconectados(channels).map(nomeDoCanal);
  if (!names.length) return '';
  if (names.length === 1) {
    return `O canal ${names[0]} está desconectado. As mensagens desse número não entram até reconectar.`;
  }
  const last = names[names.length - 1];
  const head = names.slice(0, -1).join(', ');
  return `Os canais ${head} e ${last} estão desconectados. As mensagens desses números não entram até reconectar.`;
}

/** Canais que caíram desde a leitura anterior. A primeira leitura não dispara aviso extra. */
export function canaisNovosDesconectados(previous, next) {
  if (!previous) return [];
  const before = new Set(canaisDesconectados(previous).map((channel) => channel.id));
  return canaisDesconectados(next).filter((channel) => channel?.id && !before.has(channel.id));
}

// Pure contract shared with the browser. No instance credentials or provider payloads escape.
export const CONNECTION_LINK_TTL_SECONDS = 24 * 60 * 60;
export const CONNECTION_TOKEN_PATTERN = /^[a-f0-9]{64}$/;

export function canManageWhatsappConnection(profile, moduleEnabled = true) {
  return profile?.status === 'active' && ['superadmin', 'admin', 'colaborador'].includes(profile?.role)
    && moduleEnabled === true;
}

export function isWhatsappConnectionPath(path) {
  return /^\/conectar-whatsapp\/[^/]+\/?$/i.test(String(path || ''));
}

export function normalizePairingPhone(value) {
  const raw = String(value || '').trim();
  if (!/^[+\d\s()-]+$/.test(raw)) return '';
  const digits = raw.replace(/\D/g, '');
  return /^\d{10,15}$/.test(digits) ? digits : '';
}

export function connectionProviderUrl(value) {
  const raw = String(value || '').trim();
  if (/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(raw)) return `https://${raw}.uazapi.com`;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.port || url.username || url.password) return '';
    if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.uazapi\.com$/.test(url.hostname)) return '';
    if (url.pathname !== '/' || url.search || url.hash) return '';
    return url.origin;
  } catch { return ''; }
}

export function publicConnectionPayload(payload) {
  const data = payload && typeof payload === 'object' ? payload : {};
  const instance = data.instance && typeof data.instance === 'object' ? data.instance : {};
  const status = data.status && typeof data.status === 'object' ? data.status : {};
  const connected = data.connected === true || data.loggedIn === true || status.connected === true
    || status.loggedIn === true || instance.status === 'connected' || data.status === 'connected';
  if (connected) return { state: 'connected', qr: null, code: null };
  if (['disconnected', 'hibernated'].includes(instance.status) || data.status === 'disconnected') {
    return { state: 'disconnected', qr: null, code: null };
  }
  const qr = instance.qrcode || data.qrcode || data.qr_code;
  const base64 = typeof qr === 'string' ? qr.replace(/^data:image\/(?:png|jpeg);base64,/i, '') : '';
  const safeQr = base64.length > 40 && base64.length < 524288 && /^[a-zA-Z0-9+/=\r\n]+$/.test(base64)
    ? `data:image/png;base64,${base64.replace(/[\r\n]/g, '')}` : null;
  const rawCode = String(instance.paircode || data.paircode || data.pairingCode || '').replace(/-/g, '').toUpperCase();
  const code = /^[A-Z0-9]{8}$/.test(rawCode) ? `${rawCode.slice(0, 4)}-${rawCode.slice(4)}` : null;
  const connecting = instance.status === 'connecting' || data.status === 'connecting' || safeQr || code;
  return { state: connecting ? 'connecting' : 'disconnected', qr: safeQr, code };
}

export function createConnectionToken(cryptoApi = globalThis.crypto) {
  const bytes = cryptoApi.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function hashConnectionToken(token, cryptoApi = globalThis.crypto) {
  const digest = await cryptoApi.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

export function whatsappConnectionUrl(origin, token) {
  if (!CONNECTION_TOKEN_PATTERN.test(token || '')) return '';
  return `${new URL(origin).origin}/#/conectar-whatsapp/${token}`;
}

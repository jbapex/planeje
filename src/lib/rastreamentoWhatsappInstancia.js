/** Instâncias WhatsApp do Rastreamento — equivalente TRACK (Uazapi BYO), sem WABA. */

export function parseUazapiSubdomain(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const host = new URL(withProtocol).hostname.toLowerCase();
    return host.replace(/\.uazapi\.com$/i, '').split('.')[0] || '';
  } catch {
    return raw.replace(/^https?:\/\//i, '').split('/')[0].replace(/\.uazapi\.com$/i, '').trim();
  }
}

export function uazapiBaseUrl(subdomainOrUrl) {
  const sub = parseUazapiSubdomain(subdomainOrUrl);
  return sub ? `https://${sub}.uazapi.com` : '';
}

export function rastreamentoWebhookUrl(supabaseUrl, clienteId, secret) {
  if (!supabaseUrl || !clienteId || !secret) return '';
  const q = new URLSearchParams({ cliente_id: clienteId, secret });
  return `${String(supabaseUrl).replace(/\/$/, '')}/functions/v1/uazapi-inbox-webhook?${q.toString()}`;
}

export function classifyUazapiStatusPayload(data) {
  if (!data || typeof data !== 'object') {
    return { connected: false, status: 'disconnected', phone: '', profileName: '', instanceName: '' };
  }
  const connected =
    data.connected === true ||
    data.status?.loggedIn === true ||
    data.status?.connected === true ||
    data.instance?.status === 'connected' ||
    String(data.status || '').toLowerCase() === 'connected';
  const jid = data.status?.jid ?? data.instance?.jid ?? data.jid ?? '';
  // O JID pode ser telefone:dispositivo@servidor; o dispositivo não faz parte do telefone.
  const phoneFromJid = String(jid).split('@')[0].split(':')[0].replace(/\D/g, '');
  const phone =
    phoneFromJid ||
    String(data.instance?.phone || data.phone || '').replace(/\D/g, '');
  return {
    connected,
    status: connected ? 'connected' : 'disconnected',
    phone,
    profileName: String(data.instance?.profileName || data.profileName || data.profile?.name || ''),
    instanceName: String(data.instance?.name || data.instanceName || ''),
  };
}

export function whatsappInstanceStatusLabel(status) {
  if (status === 'connected') return 'Conectada';
  if (status === 'connecting') return 'Conectando';
  if (status === 'disconnected') return 'Desconectada';
  return 'Sem teste';
}

export function matchWebhookToInstance(logs, instance) {
  const name = String(instance?.name || '').trim().toLowerCase();
  if (!Array.isArray(logs) || !logs.length) return null;
  if (name) {
    const hit = logs.find((row) => String(row.instance_name || '').trim().toLowerCase() === name);
    if (hit) return hit;
  }
  return logs[0] || null;
}

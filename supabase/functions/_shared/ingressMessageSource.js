// Source keys are scoped by the authenticated client, never by a payload's client label.
export function ingressMessageSource(inbound, channelId = null) {
  if (channelId) return { id: channelId, aliases: [] };
  const format = inbound.format;
  const digits = String(inbound.ownerPhone || '').replace(/\D/g, '');
  const phone = /^\d{8,15}$/.test(digits) ? digits : '';
  const rawKey = String(inbound.channelKey || inbound.instanceName || phone || '');
  const key = format === 'chatvolt' ? rawKey.toLowerCase() : rawKey;
  const validKey = (format === 'meta_cloud' ? /^\d{1,60}$/ : /^[a-zA-Z0-9_.-]{1,60}$/).test(key) ? key : '';
  const suffix = format === 'meta_cloud' ? validKey || phone : phone || validKey;
  const legacy = `ingress:${format}`;
  const provider = format === 'chatvolt' ? (validKey === 'zapperapi' ? 'WhatsApp via Chatvolt (Zapperapi)' : 'WhatsApp via Chatvolt') : 'WhatsApp via webhook';
  return { id: suffix ? `${legacy}:${suffix}` : legacy, aliases: suffix ? [legacy] : [],
    name: `${provider}${phone ? ` · +${phone}` : format !== 'chatvolt' && suffix ? ` · ${suffix}` : ''}`, phone: phone || null };
}

export function mergeMessageSources(channels, sources) {
  const result = new Map(channels.map(channel => [channel.id, channel]));
  for (const source of sources) {
    const metaId = source.id.match(/^ingress:meta_cloud(?::(.*))?$/);
    if (metaId && !/^\d+$/.test(metaId[1] || '') && !source.phone) continue;
    if (!result.has(source.id)) result.set(source.id, source);
  }
  return [...result.values()];
}

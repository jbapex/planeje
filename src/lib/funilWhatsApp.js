/**
 * Canal WhatsApp do cliente (cliente_whatsapp_config) no nó do funil.
 */

export function isWhatsAppNode(node) {
  return node?.data?.type === 'whatsapp';
}

export function hasWhatsAppChannel(whatsappChannel) {
  return !!(whatsappChannel?.configId);
}

/** Monta link wa.me com UTMs opcionais (texto pré-preenchido não — só query params). */
export function buildWaMeUrl(phoneDigits, utm = {}) {
  const digits = String(phoneDigits || '').replace(/\D/g, '');
  if (!digits) return '';
  const params = new URLSearchParams();
  if (utm.utm_source) params.set('utm_source', utm.utm_source);
  if (utm.utm_medium) params.set('utm_medium', utm.utm_medium);
  if (utm.utm_campaign) params.set('utm_campaign', utm.utm_campaign);
  if (utm.utm_content) params.set('utm_content', utm.utm_content);
  if (utm.utm_term) params.set('utm_term', utm.utm_term);
  const qs = params.toString();
  return qs ? `https://wa.me/${digits}?${qs}` : `https://wa.me/${digits}`;
}

export function getUtmFromEffectiveLink(effective = {}) {
  const meta = effective.metaLink || {};
  const google = effective.googleLink || {};
  return {
    utm_source: meta.utmSource || google.utmSource || '',
    utm_medium: meta.utmMedium || google.utmMedium || '',
    utm_campaign: meta.utmCampaign || google.utmCampaign || '',
    utm_content: meta.utmContent || '',
    utm_term: meta.utmTerm || '',
  };
}

export function formatWhatsAppChannelBadge(whatsappChannel) {
  if (!hasWhatsAppChannel(whatsappChannel)) return null;
  const name = whatsappChannel.channelName?.trim();
  if (name) return name.length > 18 ? `${name.slice(0, 16)}…` : name;
  if (whatsappChannel.phone) {
    const p = String(whatsappChannel.phone).replace(/\D/g, '');
    return p.length >= 10 ? `+${p.slice(-11)}` : p;
  }
  return 'Canal';
}

export function channelConnectionTone(instanceStatus) {
  if (instanceStatus === 'connected') return 'success';
  if (instanceStatus === 'connecting') return 'warning';
  return 'muted';
}

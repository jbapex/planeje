const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
const text = (value) => typeof value === 'string' ? value.trim() : '';
const object = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};

export function linkAttributionSnapshot(value) {
  const row = object(value);
  const platform = text(row.platform) || { meta_ads: 'meta', google_ads: 'google', site: 'site' }[row.default_origin];
  if (!['meta', 'google', 'site'].includes(platform)) return null;
  const snapshot = { platform };
  for (const key of ['campaign_id', 'campaign_name', 'adset_id', 'adset_name']) {
    const field = text(row[key]);
    if (field && (key.endsWith('_id') ? /^\d{1,32}$/.test(field) : field.length <= 500)) snapshot[key] = field;
  }
  return snapshot;
}

export function hasStoredContactAttribution(contact) {
  const row = object(contact), tracking = object(row.tracking_data);
  return ['meta_ads', 'google_ads', 'site'].includes(row.origin_source)
    || UTM_KEYS.some((key) => text(row[key]) || text(tracking[key]))
    || ['ctwaClid', 'ctwa_clid', 'gclid', 'fbclid', 'source_id', 'ad_id', 'sourceApp',
      'conversionSource', 'planeje_link_id', 'planeje_match_code'].some((key) => Boolean(tracking[key]))
    || Boolean(tracking.meta_ad_details?.ad?.id);
}

export function mergeContactAttributionMetadata(contact, incoming) {
  const previous = object(contact?.tracking_data);
  if (hasStoredContactAttribution(contact)) return Object.keys(previous).length ? previous : null;
  const merged = { ...previous, ...object(incoming) };
  return Object.keys(merged).length ? merged : null;
}

export function normalizeLinkInitialMessage(value) {
  return text(value).normalize('NFKC').replace(/\s+/gu, ' ').toLocaleLowerCase('pt-BR');
}

/** Mensagem completa e exclusiva do cliente; nunca escolhe um clique por horário. */
export function findInitialMessageLink(links, { message, clienteId, whatsappConfigId, ownerPhone, fromMe = false, isGroup = false } = {}) {
  const normalized = normalizeLinkInitialMessage(message);
  if (fromMe || isGroup || !clienteId || normalized.length < 16 || /\bPJ-[A-Z0-9]{6}\b/i.test(normalized)) return null;
  const matches = (links || []).filter((link) => link.cliente_id === clienteId && link.is_active === true
    && normalizeLinkInitialMessage(link.initial_message) === normalized);
  if (matches.length !== 1) return null;
  const link = matches[0];
  if (link.whatsapp_config_id) {
    if (!whatsappConfigId || link.whatsapp_config_id !== whatsappConfigId) return null;
  } else {
    const digits = (value) => String(value || '').split('@')[0].split(':')[0].replace(/\D/g, '');
    if (!digits(ownerPhone) || digits(ownerPhone) !== digits(link.destination_phone)) return null;
  }
  return link;
}

export async function lookupInitialMessageLink(supabase, options) {
  const normalized = normalizeLinkInitialMessage(options?.message);
  if (!options?.clienteId || options.fromMe || options.isGroup || normalized.length < 16) return null;
  const { data, error } = await supabase.from('cliente_rastreamento_links')
    .select('id, cliente_id, initial_message, is_active, whatsapp_config_id, destination_phone, default_origin, default_utm_source, default_utm_medium, default_utm_campaign, default_utm_content, default_utm_term, campaign_id, campaign_name, adset_id, adset_name')
    .eq('cliente_id', options.clienteId).eq('is_active', true).limit(201);
  // Falha ou catálogo truncado não comprova que a frase seja exclusiva.
  if (error || !Array.isArray(data) || data.length >= 201) return null;
  return findInitialMessageLink(data, options);
}

export function trackingFromInitialMessageLink(link, existing = null, { messageId = null, recordedAt = new Date().toISOString() } = {}) {
  const tracking = { ...object(existing), planeje_link_id: link.id, planeje_link_origin: link.default_origin,
    planeje_link_attribution: linkAttributionSnapshot(link),
    planeje_link_match_method: 'initial_message', planeje_link_attribution_recorded_at: recordedAt };
  if (messageId) tracking.planeje_link_matched_message_id = String(messageId);
  for (const key of UTM_KEYS) {
    const value = text(link[`default_${key}`]);
    if (value) tracking[key] = value;
  }
  return tracking;
}

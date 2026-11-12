const UTM = ['utm_source','utm_medium','utm_campaign','utm_content','utm_term'];
const text = value => typeof value === 'string' ? value.trim() : '';
const iso = value => {
  if (value == null || value === '') return null;
  const numeric = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
  const date = new Date(typeof numeric === 'number' && numeric < 1e12 ? numeric * 1000 : numeric);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

export function attributionEvidence({source, messageId, messageAt, receivedAt = new Date().toISOString(), tracking, fromMe = false, isGroup = false} = {}) {
  if (fromMe || isGroup || !text(source) || !['site','google_ads','meta_ads'].includes(tracking?.origin_source)) return null;
  const raw = tracking.tracking_data || {}, attribution = {};
  const values = {
    ...Object.fromEntries(UTM.map(key => [key, tracking[key] || raw[key]])),
    gclid:raw.gclid,fbclid:raw.fbclid,ctwa_clid:raw.ctwaClid || raw.ctwa_clid,
    source_id:raw.source_id,ad_id:raw.ad_id,source_url:raw.sourceURL || raw.source_url,
    planeje_click_id:raw.planeje_click_id,planeje_link_id:raw.planeje_link_id,
    planeje_match_code:raw.planeje_match_code,method:raw.planeje_link_match_method,
    campaign_name:raw.meta_ad_details?.ad?.campaign?.name,
    adset_name:raw.meta_ad_details?.ad?.adset?.name,ad_name:raw.meta_ad_details?.ad?.name,
  };
  for (const [key,value] of Object.entries(values)) if (text(value)) attribution[key] = text(value);
  const identity = attribution.planeje_click_id ? `click:${attribution.planeje_click_id}`
    : attribution.ctwa_clid ? `ctwa:${attribution.ctwa_clid}`
      : attribution.gclid ? `gclid:${attribution.gclid}`
        : attribution.fbclid ? `fbclid:${attribution.fbclid}`
          : text(messageId) ? `message:${text(source)}:${text(messageId)}` : '';
  if (!identity) return null;
  return {event_key:identity,source:text(source),message_id:text(messageId) || null,
    clicked_at:iso(raw.planeje_clicked_at),message_at:iso(messageAt),received_at:iso(receivedAt),
    origin_source:tracking.origin_source,attribution};
}

export async function persistIngressContactAttribution(supabase, {clienteId, fromJid, contact, evidences = []}) {
  return supabase.rpc('persist_ingress_contact_attribution', {
    p_cliente_id:clienteId,p_from_jid:fromJid,p_contact:contact,p_evidences:evidences.filter(Boolean),
  });
}

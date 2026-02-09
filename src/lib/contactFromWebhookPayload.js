/**
 * Extrai phone e sender_name de um raw_payload recebido pelo webhook (uazapi/Apicebot).
 * Usado em ContatosPage (preencher a partir do log) e no modal "Ver corpo" (importar como contato).
 */

/** Retorna o primeiro valor string não vazio encontrado em obj[keys]. Se o valor for objeto com URL/url, retorna essa URL. */
function getStr(obj, ...keys) {
  if (!obj || typeof obj !== 'object') return null;
  for (const k of keys) {
    const v = obj[k];
    if (v != null && typeof v === 'string' && String(v).trim()) return String(v).trim();
    if (v != null && typeof v === 'number') return String(v);
    if (v != null && typeof v === 'object' && !Array.isArray(v)) {
      const u = v.URL ?? v.url;
      if (u != null && typeof u === 'string' && String(u).trim()) return String(u).trim();
    }
  }
  return null;
}

/**
 * Obtém o from_jid (identificador do remetente) a partir do raw_payload.
 * Útil quando o log foi salvo sem from_jid (ex.: formato uazapi com chatid/sender_pn).
 */
export function getFromJidFromRawPayload(rawPayload) {
  if (!rawPayload || typeof rawPayload !== 'object') return null;
  const body = rawPayload;
  const payload = (body.data && typeof body.data === 'object' ? body.data : body) || {};
  const chat = body.chat ?? payload.chat ?? (body.data && body.data.chat);
  const key = payload.key ?? body.key;
  const jid = getStr(chat, 'wa_chatid', 'id')
    ?? getStr(payload, 'from', 'remoteJid', 'chatId', 'chatid', 'sender_pn', 'author', 'participant')
    ?? getStr(key, 'remoteJid', 'from')
    ?? getStr(body, 'from', 'chatid', 'sender_pn');
  if (!jid || jid === 'unknown') return null;
  if (jid.includes('@')) return jid;
  return `${jid}@s.whatsapp.net`;
}

/**
 * Extrai URL da foto de perfil (imagePreview, etc.) do raw_payload do evento.
 * Usado ao importar como contato para salvar no contato e repassar ao lead.
 */
export function getProfilePicFromRawPayload(rawPayload) {
  if (!rawPayload || typeof rawPayload !== 'object') return null;
  const body = rawPayload;
  const payload = (body.data && typeof body.data === 'object' ? body.data : body) || {};
  const chat = body.chat ?? payload.chat ?? (body.data && body.data.chat);
  const url = getStr(chat, 'imagePreview', 'image', 'pictureUrl', 'profilePictureUrl', 'URL')
    ?? getStr(payload, 'imagePreview', 'image', 'pictureUrl', 'profilePictureUrl', 'avatar', 'URL')
    ?? getStr(body, 'imagePreview', 'image', 'pictureUrl', 'avatar', 'URL');
  return url || null;
}

export function extractPhoneAndNameFromRawPayload(rawPayload, fromJid) {
  const extractPhoneFromJid = (jid) => {
    if (!jid || typeof jid !== 'string') return '';
    return jid.replace(/@.*$/, '').trim();
  };
  const phoneFromJid = fromJid ? extractPhoneFromJid(fromJid) : '';
  let phone = phoneFromJid;
  let senderName = null;
  if (rawPayload && typeof rawPayload === 'object') {
    const body = rawPayload;
    const payload = (body.data && typeof body.data === 'object' ? body.data : body) || {};
    const chat = body.chat ?? payload.chat ?? (body.data && body.data.chat);
    if (!phone) {
      phone = getStr(chat, 'phone') ?? getStr(payload, 'number', 'phone') ?? getStr(body, 'number', 'phone') ?? '';
    }
    const leadName = getStr(chat, 'lead_name', 'leadName') ?? getStr(body, 'lead_name', 'leadName') ?? getStr(payload, 'lead_name', 'leadName');
    const nameRaw = leadName ?? getStr(chat, 'name', 'wa_name') ?? getStr(payload, 'notifyName', 'pushName', 'senderName', 'contactName', 'name', 'verifiedName') ?? getStr(body, 'notifyName', 'pushName', 'name', 'senderName');
    senderName = (nameRaw && String(nameRaw).trim()) || (phone && String(phone).trim()) || phoneFromJid || null;
  }
  return {
    phone: (phone && String(phone).trim()) || phoneFromJid || null,
    sender_name: senderName,
  };
}

/**
 * Monta objeto de tracking (origin_source, utm_*, tracking_data) a partir do raw_payload.
 * Usado no modal "Importar como contato" para upsert do contato com os mesmos campos que o webhook.
 * Inclui source_id/sourceID, sourceApp, ctwaClid, utm_*, fbclid.
 */
export function buildContactTrackingFromRawPayload(rawPayload) {
  const empty = {
    origin_source: 'nao_identificado',
    utm_source: null,
    utm_medium: null,
    utm_campaign: null,
    utm_content: null,
    utm_term: null,
    tracking_data: null,
  };
  if (!rawPayload || typeof rawPayload !== 'object') {
    return empty;
  }
  const body = rawPayload;
  const payload = (body.data && typeof body.data === 'object' ? body.data : body) || {};
  const chat = body.chat ?? payload.chat ?? (body.data && body.data.chat);
  const message = body.message ?? payload.message;
  const content = message && typeof message === 'object' ? message.content : undefined;
  const contextInfo = content && typeof content === 'object' ? content.contextInfo : undefined;
  const externalAdReply = contextInfo && typeof contextInfo === 'object' ? contextInfo.externalAdReply : undefined;
  const utm_source_val = getStr(body, 'utm_source') ?? getStr(payload, 'utm_source') ?? (chat ? getStr(chat, 'utm_source') : null);
  const utm_medium_val = getStr(body, 'utm_medium') ?? getStr(payload, 'utm_medium') ?? (chat ? getStr(chat, 'utm_medium') : null);
  const utm_campaign_val = getStr(body, 'utm_campaign') ?? getStr(payload, 'utm_campaign') ?? (chat ? getStr(chat, 'utm_campaign') : null);
  const utm_content_val = getStr(body, 'utm_content') ?? getStr(payload, 'utm_content') ?? null;
  const utm_term_val = getStr(body, 'utm_term') ?? getStr(payload, 'utm_term') ?? null;
  const fbclid = getStr(body, 'fbclid') ?? getStr(payload, 'fbclid') ?? (chat ? getStr(chat, 'fbclid') : null);
  const source_id = getStr(externalAdReply, 'sourceID', 'source_id', 'sourceId') ?? getStr(body, 'sourceID', 'source_id', 'sourceId') ?? getStr(payload, 'sourceID', 'source_id', 'sourceId') ?? (chat ? getStr(chat, 'sourceID', 'source_id', 'sourceId') : null);
  const sourceApp = getStr(externalAdReply, 'sourceApp', 'source_app') ?? getStr(body, 'sourceApp', 'source_app') ?? getStr(payload, 'sourceApp', 'source_app') ?? (chat ? getStr(chat, 'sourceApp', 'source_app') : null);
  const ctwaClid = getStr(externalAdReply, 'ctwaClid', 'ctwa_clid') ?? getStr(body, 'ctwaClid', 'ctwa_clid') ?? getStr(payload, 'ctwaClid', 'ctwa_clid') ?? (chat ? getStr(chat, 'ctwaClid', 'ctwa_clid') : null);
  const conversionSource = getStr(contextInfo, 'conversionSource', 'conversion_source') ?? getStr(contextInfo, 'entryPointConversionExternalSource') ?? getStr(body, 'conversionSource', 'conversion_source') ?? getStr(payload, 'conversionSource', 'conversion_source') ?? (chat ? getStr(chat, 'conversionSource', 'conversion_source') : null);
  const entryPointConversionExternalSource = getStr(contextInfo, 'entryPointConversionExternalSource') ?? getStr(body, 'entryPointConversionExternalSource') ?? getStr(payload, 'entryPointConversionExternalSource') ?? null;
  const sourceURL = getStr(externalAdReply, 'sourceURL', 'source_url') ?? getStr(body, 'sourceURL', 'source_url') ?? getStr(payload, 'sourceURL', 'source_url') ?? null;
  const thumbnailURL = getStr(externalAdReply, 'thumbnailURL', 'thumbnail_url') ?? getStr(body, 'thumbnailURL', 'thumbnail_url') ?? getStr(payload, 'thumbnailURL', 'thumbnail_url') ?? null;
  const metaIndicators = ['facebook', 'meta', 'fb', 'meta_ads', 'meta ads', 'facebook_ads', 'fb_ads'];
  const utmIsMeta = utm_source_val && metaIndicators.some((m) => utm_source_val.toLowerCase().includes(m));
  const conversionSourceIsMeta = conversionSource && metaIndicators.some((m) => conversionSource.toLowerCase().includes(m));
  const origin_source_val = utmIsMeta || fbclid || source_id || sourceApp || ctwaClid || conversionSourceIsMeta ? 'meta_ads' : 'nao_identificado';
  const tracking = {};
  if (utm_source_val) tracking.utm_source = utm_source_val;
  if (utm_medium_val) tracking.utm_medium = utm_medium_val;
  if (utm_campaign_val) tracking.utm_campaign = utm_campaign_val;
  if (utm_content_val) tracking.utm_content = utm_content_val;
  if (utm_term_val) tracking.utm_term = utm_term_val;
  if (fbclid) tracking.fbclid = fbclid;
  if (source_id) tracking.source_id = source_id;
  if (sourceApp) tracking.sourceApp = sourceApp;
  if (ctwaClid) tracking.ctwaClid = ctwaClid;
  if (conversionSource) tracking.conversionSource = conversionSource;
  if (entryPointConversionExternalSource) tracking.entryPointConversionExternalSource = entryPointConversionExternalSource;
  if (sourceURL) tracking.sourceURL = sourceURL;
  if (thumbnailURL) tracking.thumbnailURL = thumbnailURL;
  return {
    origin_source: origin_source_val,
    utm_source: utm_source_val || null,
    utm_medium: utm_medium_val || null,
    utm_campaign: utm_campaign_val || null,
    utm_content: utm_content_val || null,
    utm_term: utm_term_val || null,
    tracking_data: Object.keys(tracking).length ? tracking : null,
  };
}

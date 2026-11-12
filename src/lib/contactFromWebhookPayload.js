/**
 * Extrai phone e sender_name de um raw_payload recebido pelo webhook (uazapi/Apicebot).
 * Usado em ContatosPage (preencher a partir do log) e no modal "Ver corpo" (importar como contato).
 */

import { recordedOriginSource } from './rastreamentoTrackableLink.js';

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

/** Últimos 10–11 dígitos para comparar números BR (com/sem 55, com/sem 9). */
export function normalizeWhatsappPhoneKey(phoneOrJid) {
  const digits = String(phoneOrJid || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length >= 11) return digits.slice(-11);
  if (digits.length >= 10) return digits.slice(-10);
  return digits;
}

/** Variantes de JID/telefone para bater log ↔ contato (uazapi usa formatos diferentes). */
export function buildContactJidLookupVariants(contact) {
  const jid = contact?.from_jid && String(contact.from_jid).trim();
  const phone = (contact?.phone && String(contact.phone).trim()) || (jid ? jid.replace(/@.*$/i, '').trim() : '');
  const key = normalizeWhatsappPhoneKey(phone || jid);
  const variants = new Set();
  if (jid && jid !== 'unknown') variants.add(jid);
  if (phone) variants.add(phone);
  if (key) {
    variants.add(key);
    variants.add(`${key}@s.whatsapp.net`);
    variants.add(`${key}@lid`);
    variants.add(`${key}@c.us`);
    if (key.length === 11 && key[2] === '9') {
      const ddd = key.slice(0, 2);
      const rest = key.slice(2);
      variants.add(`55${ddd}${rest}@s.whatsapp.net`);
      variants.add(`55${ddd}9${rest}@s.whatsapp.net`);
    }
    if (key.length >= 12 && key.startsWith('55')) {
      const local = key.slice(2);
      variants.add(`${local}@s.whatsapp.net`);
      variants.add(`${local}@lid`);
    }
  }
  return [...variants].filter(Boolean);
}

/** Verifica se um registro de webhook_log pertence ao contato. */
export function webhookLogMatchesContact(log, contact) {
  if (!log || !contact) return false;
  const variants = buildContactJidLookupVariants(contact);
  const contactKey = normalizeWhatsappPhoneKey(contact.phone || contact.from_jid);
  const col = log.from_jid && String(log.from_jid).trim();
  if (col && col !== 'unknown') {
    if (variants.includes(col)) return true;
    const colKey = normalizeWhatsappPhoneKey(col);
    if (contactKey && colKey && contactKey === colKey) return true;
  }
  const extracted = getFromJidFromRawPayload(log.raw_payload);
  if (!extracted || extracted === 'unknown') return false;
  if (variants.includes(extracted)) return true;
  const exKey = normalizeWhatsappPhoneKey(extracted);
  return !!(contactKey && exKey && contactKey === exKey);
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
    const message = body.message ?? payload.message;
    const isGroup = !!(chat?.wa_isGroup ?? message?.isGroup ?? payload?.isGroup ?? payload?.is_group ?? body?.isGroup ?? body?.is_group);

    if (isGroup && message && typeof message === 'object') {
      const participantPhone = getStr(message, 'sender_pn', 'senderPn') ?? getStr(payload, 'sender_pn', 'senderPn') ?? getStr(body, 'sender_pn', 'senderPn');
      if (participantPhone) phone = extractPhoneFromJid(participantPhone);
      const participantName = getStr(message, 'senderName', 'pushName', 'notifyName');
      if (participantName) senderName = participantName;
    }

    if (!phone) {
      phone = getStr(chat, 'phone') ?? getStr(payload, 'number', 'phone') ?? getStr(body, 'number', 'phone') ?? '';
    }
    if (!senderName) {
      const leadName = getStr(chat, 'lead_name', 'leadName') ?? getStr(body, 'lead_name', 'leadName') ?? getStr(payload, 'lead_name', 'leadName');
      const nameRaw = leadName ?? getStr(chat, 'name', 'wa_name') ?? getStr(payload, 'notifyName', 'pushName', 'senderName', 'contactName', 'name', 'verifiedName') ?? getStr(body, 'notifyName', 'pushName', 'name', 'senderName');
      senderName = (nameRaw && String(nameRaw).trim()) || (phone && String(phone).trim()) || phoneFromJid || null;
    }
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
  const gclid = getStr(body, 'gclid') ?? getStr(payload, 'gclid') ?? (chat ? getStr(chat, 'gclid') : null);
  const source_id = getStr(externalAdReply, 'sourceID', 'source_id', 'sourceId') ?? getStr(body, 'sourceID', 'source_id', 'sourceId') ?? getStr(payload, 'sourceID', 'source_id', 'sourceId') ?? (chat ? getStr(chat, 'sourceID', 'source_id', 'sourceId') : null);
  const sourceApp = getStr(externalAdReply, 'sourceApp', 'source_app') ?? getStr(body, 'sourceApp', 'source_app') ?? getStr(payload, 'sourceApp', 'source_app') ?? (chat ? getStr(chat, 'sourceApp', 'source_app') : null);
  const ctwaClid = getStr(externalAdReply, 'ctwaClid', 'ctwa_clid') ?? getStr(body, 'ctwaClid', 'ctwa_clid') ?? getStr(payload, 'ctwaClid', 'ctwa_clid') ?? (chat ? getStr(chat, 'ctwaClid', 'ctwa_clid') : null);
  const conversionSource = getStr(contextInfo, 'conversionSource', 'conversion_source') ?? getStr(contextInfo, 'entryPointConversionExternalSource') ?? getStr(body, 'conversionSource', 'conversion_source') ?? getStr(payload, 'conversionSource', 'conversion_source') ?? (chat ? getStr(chat, 'conversionSource', 'conversion_source') : null);
  const entryPointConversionExternalSource = getStr(contextInfo, 'entryPointConversionExternalSource') ?? getStr(body, 'entryPointConversionExternalSource') ?? getStr(payload, 'entryPointConversionExternalSource') ?? null;
  const sourceURL = getStr(externalAdReply, 'sourceURL', 'source_url') ?? getStr(body, 'sourceURL', 'source_url') ?? getStr(payload, 'sourceURL', 'source_url') ?? null;
  const thumbnailURL = getStr(externalAdReply, 'thumbnailURL', 'thumbnail_url') ?? getStr(body, 'thumbnailURL', 'thumbnail_url') ?? getStr(payload, 'thumbnailURL', 'thumbnail_url') ?? null;
  const ownerPhone =
    getStr(body, 'owner') ?? getStr(payload, 'owner') ?? (chat ? getStr(chat, 'owner') : null);
  const metaIndicators = ['facebook', 'meta', 'fb', 'meta_ads', 'meta ads', 'facebook_ads', 'fb_ads'];
  const googleIndicators = ['google', 'googleads', 'google_ads', 'adwords', 'gads'];
  const utmIsMeta = utm_source_val && metaIndicators.some((m) => utm_source_val.toLowerCase().includes(m));
  const utmIsGoogle =
    utm_source_val && googleIndicators.some((m) => utm_source_val.toLowerCase().includes(m));
  const utmMediumIsCpc = utm_medium_val && /cpc|ppc|paid/i.test(utm_medium_val);
  const conversionSourceIsMeta = conversionSource && metaIndicators.some((m) => conversionSource.toLowerCase().includes(m));
  let origin_source_val = 'nao_identificado';
  if (utmIsMeta || fbclid || source_id || sourceApp || ctwaClid || conversionSourceIsMeta) {
    origin_source_val = 'meta_ads';
  } else if (gclid || utmIsGoogle || (utmMediumIsCpc && utmIsGoogle)) {
    origin_source_val = 'google_ads';
  }
  const tracking = {};
  if (utm_source_val) tracking.utm_source = utm_source_val;
  if (utm_medium_val) tracking.utm_medium = utm_medium_val;
  if (utm_campaign_val) tracking.utm_campaign = utm_campaign_val;
  if (utm_content_val) tracking.utm_content = utm_content_val;
  if (utm_term_val) tracking.utm_term = utm_term_val;
  if (fbclid) tracking.fbclid = fbclid;
  if (gclid) tracking.gclid = gclid;
  if (source_id) tracking.source_id = source_id;
  if (sourceApp) tracking.sourceApp = sourceApp;
  if (ctwaClid) tracking.ctwaClid = ctwaClid;
  if (conversionSource) tracking.conversionSource = conversionSource;
  if (entryPointConversionExternalSource) tracking.entryPointConversionExternalSource = entryPointConversionExternalSource;
  if (sourceURL) tracking.sourceURL = sourceURL;
  if (thumbnailURL) tracking.thumbnailURL = thumbnailURL;
  if (ownerPhone) tracking.owner_phone = ownerPhone;
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

const META_UTM_HINTS = ['facebook', 'meta', 'fb', 'instagram', 'ig', 'anúncio', 'anuncio'];

function utmStringsSuggestMeta(parts) {
  const flat = (parts || []).filter(Boolean).map((s) => String(s).toLowerCase());
  return flat.some((p) => META_UTM_HINTS.some((m) => p.includes(m)));
}

/**
 * Contagem e filtros na página Contatos: considera "Meta Ads" quem tem origem no banco
 * ou rastreio típico de anúncio Meta no tracking (muitos registros ficam como nao_identificado).
 * Inclui colunas UTM na raiz do contato (denormalizadas) e nomes de campanha no JSON.
 */
export function isMetaAdsContactForStats(c) {
  if (!c) return false;
  const origin = recordedOriginSource(c);
  if (origin) return origin === 'meta_ads';
  if (
    utmStringsSuggestMeta([
      c.utm_source,
      c.utm_medium,
      c.utm_campaign,
      c.utm_content,
      c.utm_term,
    ])
  ) {
    return true;
  }
  const td = c.tracking_data;
  if (!td || typeof td !== 'object') return false;
  if (utmStringsSuggestMeta([td.utm_source, td.utm_medium, td.utm_campaign, td.utm_content, td.utm_term, td.campaign_name])) {
    return true;
  }
  if (td.meta_ad_details?.ad) return true;
  if (td.source_id != null && String(td.source_id).trim() !== '') return true;
  if (td.ad_id != null && String(td.ad_id).trim() !== '') return true;
  if (td.fbclid != null && String(td.fbclid).trim() !== '') return true;
  if (td.ctwaClid != null && String(td.ctwaClid).trim() !== '') return true;
  if (Array.isArray(td.events_by_date) && td.events_by_date.length > 0) {
    const hasMetaSignal = td.events_by_date.some(
      (ev) =>
        ev &&
        (ev.source_id ||
          ev.ad_id ||
          ev.fbclid ||
          ev.ctwaClid ||
          (ev.tracking_data && typeof ev.tracking_data === 'object' && (ev.tracking_data.source_id || ev.tracking_data.ad_id)))
    );
    if (hasMetaSignal) return true;
  }
  return false;
}

/**
 * Mesmo critério de "Meta Ads" que {@link isMetaAdsContactForStats}, para linhas da tabela `leads`
 * (colunas utm_* na raiz + tracking_data). Garante contagem alinhada entre Contatos e Relatório Meta.
 */
export function isMetaAdsLeadForStats(lead) {
  if (!lead) return false;
  const origin = recordedOriginSource(lead, true);
  if (origin) return origin === 'meta_ads';
  if (lead.origem === 'Meta Ads') return true;
  const td0 = lead.tracking_data;
  if (td0 && typeof td0 === 'object' && (td0.meta_lead_id || td0.form_id)) return true;
  const asContact = {
    origin_source: null,
    utm_source: lead.utm_source ?? null,
    utm_medium: lead.utm_medium ?? null,
    utm_campaign: lead.utm_campaign ?? null,
    utm_content: lead.utm_content ?? null,
    utm_term: lead.utm_term ?? null,
    tracking_data: lead.tracking_data ?? null,
  };
  return isMetaAdsContactForStats(asContact);
}

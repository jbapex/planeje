/**
 * Normaliza payloads de entrada (canônico Planeje, uazapi, Meta Cloud, Chatvolt, genérico).
 */
import { readChatvoltPayload } from "./chatvoltIngress.js";

export type TrackingResult = {
  origin_source: "meta_ads" | "google_ads" | "site" | "nao_identificado";
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  tracking_data: Record<string, unknown> | null;
};

export type InboundNormalized = {
  phone: string | null;
  fromJid: string;
  name: string | null;
  messageText: string | null;
  messageId: string;
  msgTimestamp: string;
  ownerPhone: string | null;
  instanceName: string | null;
  channelKey: string | null;
  profilePicUrl: string | null;
  isGroup: boolean;
  groupName: string | null;
  eventType: string;
  tracking: TrackingResult;
  format: "canonical" | "uazapi" | "meta_cloud" | "chatvolt" | "generic";
  fromMe?: boolean;
  historical?: boolean;
  automationAt?: string | null;
  labels?: string[];
};

function getStr(obj: Record<string, unknown> | null | undefined, ...keys: string[]): string {
  if (!obj || typeof obj !== "object") return "";
  for (const k of keys) {
    const v = obj[k];
    if (v != null && typeof v === "string" && v.trim()) return v.trim();
    if (v != null && typeof v === "number") return String(v);
  }
  return "";
}

export function extractPhoneFromJid(jid: string): string {
  if (!jid || typeof jid !== "string") return "";
  return jid.replace(/@.*$/, "").replace(/\D/g, "") || jid.trim();
}

function getVal(obj: Record<string, unknown> | null | undefined, ...keys: string[]): string | null {
  const s = getStr(obj ?? null, ...keys);
  return s || null;
}

function isCanonicalPayload(body: Record<string, unknown>): boolean {
  if (body.planeje_ingress === true || body.planeje_ingress === "true") return true;
  const hasPhone = !!(getStr(body, "phone", "lead_phone", "from") || getStr(body, "from_jid", "fromJid"));
  const hasCtwa = !!(getStr(body, "ctwa_clid", "ctwaClid") || (body.tracking && typeof body.tracking === "object"));
  return hasPhone && (hasCtwa || body.tracking != null || body.owner_phone != null || body.ownerPhone != null);
}

function buildTrackingFromParts(parts: {
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_content?: string | null;
  utm_term?: string | null;
  fbclid?: string | null;
  gclid?: string | null;
  source_id?: string | null;
  sourceApp?: string | null;
  ctwaClid?: string | null;
  conversionSource?: string | null;
  entryPointConversionExternalSource?: string | null;
  sourceURL?: string | null;
  thumbnailURL?: string | null;
  ownerPhone?: string | null;
}): TrackingResult {
  const metaIndicators = ["facebook", "meta", "fb", "meta_ads", "meta ads", "facebook_ads", "fb_ads"];
  const googleIndicators = ["google", "googleads", "google_ads", "adwords", "gads"];
  const utmIsMeta = parts.utm_source && metaIndicators.some((m) => parts.utm_source!.toLowerCase().includes(m));
  const utmIsGoogle = parts.utm_source && googleIndicators.some((m) => parts.utm_source!.toLowerCase().includes(m));
  const utmMediumIsCpc = parts.utm_medium && /cpc|ppc|paid/i.test(parts.utm_medium);
  const conversionSourceIsMeta = parts.conversionSource &&
    metaIndicators.some((m) => parts.conversionSource!.toLowerCase().includes(m));

  let origin_source: TrackingResult["origin_source"] = "nao_identificado";
  if (utmIsMeta || parts.fbclid || parts.source_id || parts.sourceApp || parts.ctwaClid || conversionSourceIsMeta) {
    origin_source = "meta_ads";
  } else if (parts.gclid || utmIsGoogle || (utmMediumIsCpc && utmIsGoogle)) {
    origin_source = "google_ads";
  } else if (parts.utm_source && /^(site|website|organic)$/i.test(String(parts.utm_source).trim())) {
    origin_source = "site";
  }

  const tracking_data: Record<string, unknown> = {};
  if (parts.utm_source) tracking_data.utm_source = parts.utm_source;
  if (parts.utm_medium) tracking_data.utm_medium = parts.utm_medium;
  if (parts.utm_campaign) tracking_data.utm_campaign = parts.utm_campaign;
  if (parts.utm_content) tracking_data.utm_content = parts.utm_content;
  if (parts.utm_term) tracking_data.utm_term = parts.utm_term;
  if (parts.fbclid) tracking_data.fbclid = parts.fbclid;
  if (parts.gclid) tracking_data.gclid = parts.gclid;
  if (parts.source_id) tracking_data.source_id = parts.source_id;
  if (parts.sourceApp) tracking_data.sourceApp = parts.sourceApp;
  if (parts.ctwaClid) tracking_data.ctwaClid = parts.ctwaClid;
  if (parts.conversionSource) tracking_data.conversionSource = parts.conversionSource;
  if (parts.entryPointConversionExternalSource) {
    tracking_data.entryPointConversionExternalSource = parts.entryPointConversionExternalSource;
  }
  if (parts.sourceURL) tracking_data.sourceURL = parts.sourceURL;
  if (parts.thumbnailURL) tracking_data.thumbnailURL = parts.thumbnailURL;
  if (parts.ownerPhone) tracking_data.owner_phone = parts.ownerPhone;

  return {
    origin_source,
    utm_source: parts.utm_source ?? null,
    utm_medium: parts.utm_medium ?? null,
    utm_campaign: parts.utm_campaign ?? null,
    utm_content: parts.utm_content ?? null,
    utm_term: parts.utm_term ?? null,
    tracking_data: Object.keys(tracking_data).length ? tracking_data : null,
  };
}

function extractUazapiStyleTracking(
  body: Record<string, unknown>,
  payload: Record<string, unknown>,
  chat: Record<string, unknown> | undefined
): TrackingResult {
  const message = (body?.message ?? payload?.message) as Record<string, unknown> | undefined;
  const content = message?.content as Record<string, unknown> | undefined;
  const contextInfo = content?.contextInfo as Record<string, unknown> | undefined;
  const externalAdReply = contextInfo?.externalAdReply as Record<string, unknown> | undefined;

  const ownerPhone =
    getVal(body, "owner") ?? getVal(payload, "owner") ?? (chat ? getVal(chat, "owner") : null);

  return buildTrackingFromParts({
    utm_source: getVal(body, "utm_source") ?? getVal(payload, "utm_source") ?? (chat ? getVal(chat, "utm_source") : null),
    utm_medium: getVal(body, "utm_medium") ?? getVal(payload, "utm_medium") ?? (chat ? getVal(chat, "utm_medium") : null),
    utm_campaign: getVal(body, "utm_campaign") ?? getVal(payload, "utm_campaign") ?? (chat ? getVal(chat, "utm_campaign") : null),
    utm_content: getVal(body, "utm_content") ?? getVal(payload, "utm_content"),
    utm_term: getVal(body, "utm_term") ?? getVal(payload, "utm_term"),
    fbclid: getVal(body, "fbclid") ?? getVal(payload, "fbclid") ?? (chat ? getVal(chat, "fbclid") : null),
    gclid: getVal(body, "gclid") ?? getVal(payload, "gclid") ?? (chat ? getVal(chat, "gclid") : null),
    source_id: getVal(externalAdReply, "sourceID", "source_id", "sourceId") ??
      getVal(body, "sourceID", "source_id", "sourceId") ?? getVal(payload, "sourceID", "source_id", "sourceId"),
    sourceApp: getVal(externalAdReply, "sourceApp", "source_app") ?? getVal(body, "sourceApp", "source_app"),
    ctwaClid: getVal(externalAdReply, "ctwaClid", "ctwa_clid") ?? getVal(body, "ctwaClid", "ctwa_clid"),
    conversionSource: getVal(contextInfo, "conversionSource", "conversion_source") ??
      getVal(contextInfo, "entryPointConversionExternalSource"),
    entryPointConversionExternalSource: getVal(contextInfo, "entryPointConversionExternalSource"),
    sourceURL: getVal(externalAdReply, "sourceURL", "source_url"),
    thumbnailURL: getVal(externalAdReply, "thumbnailURL", "thumbnail_url"),
    ownerPhone,
  });
}

function parseTimestamp(tsRaw: unknown): string {
  if (tsRaw == null) return new Date().toISOString();
  if (typeof tsRaw === "number") {
    const ms = tsRaw > 1e12 ? tsRaw : tsRaw * 1000;
    return new Date(ms).toISOString();
  }
  const s = String(tsRaw).trim();
  if (/^\d+$/.test(s)) {
    const n = parseInt(s, 10);
    return new Date(n > 1e12 ? n : n * 1000).toISOString();
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

function normalizeCanonical(body: Record<string, unknown>): InboundNormalized {
  const trackingObj = (body.tracking && typeof body.tracking === "object"
    ? body.tracking
    : {}) as Record<string, unknown>;

  const phoneRaw = getStr(body, "phone", "lead_phone", "from") || extractPhoneFromJid(getStr(body, "from_jid", "fromJid"));
  const phone = extractPhoneFromJid(phoneRaw) || phoneRaw.replace(/\D/g, "") || phoneRaw;
  const fromJid = phone.includes("@") ? phone : (phone ? `${phone}@s.whatsapp.net` : "unknown");

  const ctwa = getStr(body, "ctwa_clid", "ctwaClid") || getStr(trackingObj, "ctwa_clid", "ctwaClid");
  const ownerPhone = getStr(body, "owner_phone", "ownerPhone", "owner") || getStr(trackingObj, "owner_phone", "owner");

  const tracking = buildTrackingFromParts({
    utm_source: getVal(trackingObj, "utm_source") ?? getVal(body, "utm_source"),
    utm_medium: getVal(trackingObj, "utm_medium") ?? getVal(body, "utm_medium"),
    utm_campaign: getVal(trackingObj, "utm_campaign") ?? getVal(body, "utm_campaign"),
    utm_content: getVal(trackingObj, "utm_content"),
    utm_term: getVal(trackingObj, "utm_term"),
    fbclid: getVal(trackingObj, "fbclid"),
    gclid: getVal(trackingObj, "gclid"),
    source_id: getVal(trackingObj, "source_id", "sourceID"),
    sourceApp: getVal(trackingObj, "sourceApp", "source_app"),
    ctwaClid: ctwa || null,
    sourceURL: getVal(trackingObj, "sourceURL", "source_url"),
    ownerPhone: ownerPhone || null,
  });

  if (body.external_id) {
    tracking.tracking_data = { ...(tracking.tracking_data || {}), external_id: String(body.external_id) };
  }

  return {
    phone: phone || null,
    fromJid,
    name: getStr(body, "name", "sender_name", "lead_name") || null,
    messageText: getStr(body, "message", "text", "body") || null,
    messageId: getStr(body, "message_id", "messageId", "id") || `${fromJid}_${Date.now()}`,
    msgTimestamp: parseTimestamp(body.timestamp ?? body.message_timestamp),
    ownerPhone: ownerPhone || null,
    instanceName: getStr(body, "instance_name", "instanceName") || null,
    channelKey: getStr(body, "channel_key", "channelKey") || null,
    profilePicUrl: getStr(body, "profile_pic_url", "profilePicUrl", "image") || null,
    isGroup: !!(body.is_group ?? body.isGroup),
    groupName: getStr(body, "group_name", "groupName") || null,
    eventType: getStr(body, "event", "event_type", "type") || "message",
    tracking,
    format: "canonical",
  };
}

function normalizeMetaCloud(body: Record<string, unknown>): InboundNormalized | null {
  const entry = Array.isArray(body.entry) ? body.entry[0] : null;
  if (!entry || typeof entry !== "object") return null;
  const changes = (entry as Record<string, unknown>).changes;
  if (!Array.isArray(changes) || !changes[0]) return null;

  const value = (changes[0] as Record<string, unknown>).value as Record<string, unknown> | undefined;
  if (!value) return null;

  const echo = (changes[0] as Record<string, unknown>).field === 'smb_message_echoes';
  const metaMessages = echo ? (Array.isArray(value.message_echoes) ? value.message_echoes : []) : (Array.isArray(value.messages) ? value.messages : []);
  const metaMsg = metaMessages[0] && typeof metaMessages[0] === "object"
    ? metaMessages[0] as Record<string, unknown>
    : null;
  if (!metaMsg) return null;

  const metaContacts = Array.isArray(value.contacts) ? value.contacts : [];
  const selectedContact = metaContacts.find(contact => contact?.wa_id === getStr(metaMsg, echo ? 'to' : 'from'));
  const metaContact = selectedContact && typeof selectedContact === "object"
    ? selectedContact as Record<string, unknown>
    : null;

  const referral = metaMsg.referral as Record<string, unknown> | undefined;
  const metaText = metaMsg.text && typeof metaMsg.text === "object"
    ? (metaMsg.text as Record<string, unknown>).body
    : null;

  const fromRaw = getStr(metaMsg, echo ? 'to' : 'from');
  const phone = /^\+?\d{8,15}$/.test(fromRaw) ? fromRaw.replace(/\D/g, '') : '';
  const fromJid = phone ? `${phone}@s.whatsapp.net` : 'unknown';

  const ctwaClid = referral ? getStr(referral, "ctwa_clid", "ctwaClid") : "";
  const metadata = value.metadata as Record<string, unknown> | undefined;
  const ownerDigits = getStr(metadata, 'display_phone_number').replace(/\D/g, '');
  const ownerPhone = /^\d{8,15}$/.test(ownerDigits) ? ownerDigits : null;
  const originalMs = /^\d{10,13}$/.test(String(metaMsg.timestamp || '')) ? Number(metaMsg.timestamp) * (String(metaMsg.timestamp).length === 13 ? 1 : 1000) : NaN;
  const automationAt = Number.isFinite(originalMs) && !Number.isNaN(new Date(originalMs).getTime()) ? new Date(originalMs).toISOString() : null;
  const template = metaMsg.template as Record<string, unknown> | undefined;
  const interactive = metaMsg.interactive as Record<string, Record<string, unknown>> | undefined;
  const tracking = buildTrackingFromParts({
    ctwaClid: ctwaClid || null,
    source_id: referral ? getStr(referral, "source_id", "sourceID") : null,
    sourceURL: referral ? getStr(referral, "source_url", "sourceURL") : null,
    sourceApp: referral ? getStr(referral, "source_type", "sourceApp") : null,
    ownerPhone,
  });

  return {
    phone: phone || null,
    fromJid,
    name: echo ? null : metaContact?.profile && typeof metaContact.profile === "object"
      ? getStr(metaContact.profile as Record<string, unknown>, "name")
      : getStr(metaContact ?? null, "name"),
    messageText: typeof metaText === "string" ? metaText : getStr(template, 'f3_rendered_text') || [interactive?.header?.text, interactive?.body?.text, interactive?.footer?.text].filter(v => typeof v === 'string').join('\n') || getStr(metaMsg, "body"),
    messageId: getStr(metaMsg, "id"),
    msgTimestamp: automationAt || new Date().toISOString(),
    automationAt,
    historical: (body.f3_mirror as Record<string, unknown> | undefined)?.historical === true,
    fromMe: echo,
    ownerPhone,
    instanceName: null,
    channelKey: getStr(metadata, 'phone_number_id') || ownerPhone,
    profilePicUrl: null,
    isGroup: false,
    groupName: null,
    eventType: getStr(metaMsg, 'type') || 'message',
    tracking,
    format: "meta_cloud",
  };
}

export function splitMetaMessages(body: Record<string, unknown>): Record<string, unknown>[] {
  if (body.object !== 'whatsapp_business_account' || !Array.isArray(body.entry)) return [body];
  const messages: Record<string, unknown>[] = [];
  for (const entry of body.entry) for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
    const key = change?.field === 'smb_message_echoes' ? 'message_echoes' : 'messages';
    const items = change?.value?.[key];
    if (!Array.isArray(items)) continue;
    for (const message of items) if (message && typeof message === 'object') messages.push({ ...body,
      entry: [{ ...entry, changes: [{ ...change, value: { ...change.value, [key]: [message] } }] }] });
  }
  return messages.length ? messages : [body];
}

function normalizeChatvolt(body: Record<string, unknown>): InboundNormalized | null {
  const chatvolt = readChatvoltPayload(body);
  if (!chatvolt) return null;
  const phone = chatvolt.phone;
  const fromJid = phone ? `${phone}@s.whatsapp.net` : "unknown";
  const tracking = buildTrackingFromParts({
    ctwaClid: chatvolt.ctwaClid || null,
    source_id: chatvolt.sourceId || null,
    sourceApp: chatvolt.sourceType || null,
    sourceURL: chatvolt.sourceUrl || null,
    thumbnailURL: chatvolt.thumbnailUrl || null,
  });
  return {
    phone: phone || null,
    fromJid,
    name: chatvolt.name || null,
    messageText: chatvolt.messageText || null,
    messageId: chatvolt.messageId || `${fromJid}_${chatvolt.event}_${String(chatvolt.createdAt || Date.now())}`,
    msgTimestamp: parseTimestamp(chatvolt.createdAt),
    ownerPhone: null,
    instanceName: null,
    channelKey: chatvolt.channel || "chatvolt",
    profilePicUrl: null,
    isGroup: chatvolt.isGroup,
    groupName: chatvolt.groupName || null,
    eventType: chatvolt.event,
    tracking,
    format: "chatvolt",
    fromMe: chatvolt.fromMe,
    labels: chatvolt.labels,
  };
}

function normalizeGeneric(body: Record<string, unknown>): InboundNormalized {
  const payload = (body.data && typeof body.data === "object" ? body.data : body) as Record<string, unknown>;
  const chat = (body.chat ?? payload.chat) as Record<string, unknown> | undefined;
  const contact = (body.contact && typeof body.contact === "object" ? body.contact : payload?.contact) as
    | Record<string, unknown>
    | undefined;
  const msgObj = (body.message && typeof body.message === "object" ? body.message : payload?.message) as
    | Record<string, unknown>
    | undefined;

  const fromRaw =
    getStr(body, "from", "phone", "number", "sender", "sender_pn", "chatid", "remoteJid") ||
    getStr(payload, "from", "phone", "number", "sender", "sender_pn", "chatid") ||
    (contact ? getStr(contact, "phone", "wa_id", "number") : "") ||
    (msgObj ? getStr(msgObj, "from", "sender_pn", "chatid") : "");
  const phone = extractPhoneFromJid(fromRaw) || fromRaw.replace(/\D/g, "") || fromRaw;
  const fromJid = fromRaw.includes("@") ? fromRaw : (phone ? `${phone}@s.whatsapp.net` : "unknown");

  const tracking = extractUazapiStyleTracking(body, payload, chat);
  const ownerFromBody = getVal(body, "owner") ?? getVal(payload, "owner") ?? (chat ? getVal(chat, "owner") : null);
  if (ownerFromBody) {
    tracking.tracking_data = { ...(tracking.tracking_data || {}), owner_phone: ownerFromBody };
  }

  const instanceName = getStr(body, "instanceName", "instance_name") || null;

  return {
    phone: phone || null,
    fromJid,
    name:
      getStr(body, "name", "senderName", "pushName") ||
      getStr(payload, "name", "senderName") ||
      (contact ? getStr(contact, "name") : "") ||
      null,
    messageText:
      getStr(body, "message", "text", "body") ||
      getStr(payload, "message", "text", "body") ||
      (msgObj ? getStr(msgObj, "text", "body", "content") : "") ||
      null,
    messageId: getStr(body, "messageid", "messageId", "id") || `${fromJid}_${Date.now()}`,
    msgTimestamp: parseTimestamp(body.timestamp ?? payload.timestamp ?? msgObj?.timestamp ?? body.messageTimestamp),
    ownerPhone: ownerFromBody,
    instanceName,
    channelKey: instanceName,
    profilePicUrl: getStr(body, "imagePreview", "profilePicUrl") || null,
    isGroup: !!(body.isGroup ?? payload.isGroup),
    groupName: getStr(body, "groupName", "group_name") || null,
    eventType: getStr(body, "EventType", "event", "type") || "event",
    tracking,
    format: body.instanceName || body.message ? "uazapi" : "generic",
  };
}

export function normalizeInboundPayload(body: Record<string, unknown>): InboundNormalized {
  if (isCanonicalPayload(body)) {
    return normalizeCanonical(body);
  }
  const meta = normalizeMetaCloud(body);
  if (meta) return meta;
  const chatvolt = normalizeChatvolt(body);
  if (chatvolt) return chatvolt;
  return normalizeGeneric(body);
}

export function normChannelKey(s: string): string {
  return String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Webhook de entrada genérico — CRMs externos, Meta Cloud, JSON canônico (sem uazapi).
 * URL: POST .../crm-ingress-webhook?cliente_id=UUID&secret=SECRET&channel_id=opcional
 * Auth: secret do cliente (ingress_webhook_secret) ou secret do canal (webhook_secret).
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
/**
 * Normaliza payloads de entrada (canônico Planeje, uazapi, Meta Cloud, genérico).
 */

export type TrackingResult = {
  origin_source: "meta_ads" | "google_ads" | "nao_identificado";
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
  format: "canonical" | "uazapi" | "meta_cloud" | "generic";
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

  const metaMessages = Array.isArray(value.messages) ? value.messages : [];
  const metaMsg = metaMessages[0] && typeof metaMessages[0] === "object"
    ? metaMessages[0] as Record<string, unknown>
    : null;
  if (!metaMsg) return null;

  const metaContacts = Array.isArray(value.contacts) ? value.contacts : [];
  const metaContact = metaContacts[0] && typeof metaContacts[0] === "object"
    ? metaContacts[0] as Record<string, unknown>
    : null;

  const referral = metaMsg.referral as Record<string, unknown> | undefined;
  const metaText = metaMsg.text && typeof metaMsg.text === "object"
    ? (metaMsg.text as Record<string, unknown>).body
    : null;

  const fromRaw = getStr(metaMsg, "from") || getStr(metaContact ?? null, "wa_id");
  const phone = extractPhoneFromJid(fromRaw) || fromRaw;
  const fromJid = fromRaw.includes("@") ? fromRaw : (phone ? `${phone}@s.whatsapp.net` : "unknown");

  const ctwaClid = referral ? getStr(referral, "ctwa_clid", "ctwaClid") : "";
  const tracking = buildTrackingFromParts({
    ctwaClid: ctwaClid || null,
    source_id: referral ? getStr(referral, "source_id", "sourceID") : null,
    sourceURL: referral ? getStr(referral, "source_url", "sourceURL") : null,
    sourceApp: referral ? getStr(referral, "source_type", "sourceApp") : null,
  });

  return {
    phone: phone || null,
    fromJid,
    name: metaContact?.profile && typeof metaContact.profile === "object"
      ? getStr(metaContact.profile as Record<string, unknown>, "name")
      : getStr(metaContact ?? null, "name"),
    messageText: typeof metaText === "string" ? metaText : getStr(metaMsg, "body", "text"),
    messageId: getStr(metaMsg, "id") || `${fromJid}_${Date.now()}`,
    msgTimestamp: parseTimestamp(metaMsg.timestamp),
    ownerPhone: null,
    instanceName: null,
    channelKey: null,
    profilePicUrl: null,
    isGroup: false,
    groupName: null,
    eventType: "message",
    tracking,
    format: "meta_cloud",
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
  return normalizeGeneric(body);
}

export function normChannelKey(s: string): string {
  return String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type AuthResult = {
  clienteId: string;
  channelConfig: { id: string; name: string | null } | null;
  authVia: "cliente" | "channel";
};

async function resolveAuth(
  supabase: ReturnType<typeof createClient>,
  secret: string,
  queryClienteId: string | null,
  queryChannelId: string | null
): Promise<AuthResult | null> {
  if (!secret) return null;

  const { data: byClientSecret } = await supabase
    .from("clientes")
    .select("id, ingress_webhook_secret")
    .eq("ingress_webhook_secret", secret)
    .maybeSingle();

  if (byClientSecret?.id && byClientSecret.ingress_webhook_secret === secret) {
    let channelConfig: { id: string; name: string | null } | null = null;
    if (queryChannelId) {
      const { data: ch } = await supabase
        .from("cliente_whatsapp_config")
        .select("id, name")
        .eq("id", queryChannelId)
        .eq("cliente_id", byClientSecret.id)
        .maybeSingle();
      channelConfig = ch;
    }
    return { clienteId: byClientSecret.id, channelConfig, authVia: "cliente" };
  }

  const { data: byChannel } = await supabase
    .from("cliente_whatsapp_config")
    .select("id, name, cliente_id, webhook_secret")
    .eq("webhook_secret", secret)
    .maybeSingle();

  if (byChannel?.webhook_secret === secret && byChannel.cliente_id) {
    if (queryClienteId && queryClienteId !== byChannel.cliente_id) return null;
    return {
      clienteId: byChannel.cliente_id,
      channelConfig: { id: byChannel.id, name: byChannel.name },
      authVia: "channel",
    };
  }

  return null;
}

async function resolveChannelByKey(
  supabase: ReturnType<typeof createClient>,
  clienteId: string,
  inbound: InboundNormalized,
  preferredChannelId: string | null
): Promise<{ id: string; name: string | null } | null> {
  if (preferredChannelId) {
    const { data: ch } = await supabase
      .from("cliente_whatsapp_config")
      .select("id, name")
      .eq("id", preferredChannelId)
      .eq("cliente_id", clienteId)
      .maybeSingle();
    if (ch) return ch;
  }

  const key = normChannelKey(inbound.channelKey || inbound.instanceName || "");
  if (!key) return null;

  const { data: configs } = await supabase
    .from("cliente_whatsapp_config")
    .select("id, name")
    .eq("cliente_id", clienteId);

  for (const c of configs || []) {
    const n = normChannelKey(String(c.name || ""));
    if (n && (n === key || key.includes(n) || n.includes(key))) {
      return { id: c.id, name: c.name };
    }
  }
  return null;
}

serve(async (req) => {
  const url = new URL(req.url);
  console.log("[crm-ingress-webhook]", req.method, url.pathname);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method === "GET") {
    return new Response(
      JSON.stringify({
        ok: true,
        message: "Webhook de entrada Planeje ativo. POST com JSON canônico, uazapi ou Meta Cloud.",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Método não permitido" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !supabaseServiceKey) {
    return new Response(JSON.stringify({ error: "Configuração incompleta" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const secretFromQuery = url.searchParams.get("secret");
  const authHeader = req.headers.get("Authorization");
  const secretFromBearer = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  const secret = secretFromQuery || secretFromBearer || null;
  const queryClienteId = url.searchParams.get("cliente_id");
  const queryChannelId = url.searchParams.get("channel_id");

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const auth = await resolveAuth(supabase, secret || "", queryClienteId, queryChannelId);

  if (!auth) {
    return new Response(JSON.stringify({ error: "Secret inválido ou cliente não encontrado" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { clienteId } = auth;
  let channelConfig = auth.channelConfig;

  let body: Record<string, unknown>;
  try {
    const raw = await req.json();
    body = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  } catch {
    await supabase.from("cliente_whatsapp_webhook_log").insert({
      cliente_id: clienteId,
      status: "error",
      source: "ingress",
      error_message: "Body JSON inválido",
      raw_payload: null,
    });
    return new Response(JSON.stringify({ error: "Body JSON inválido" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const inbound = normalizeInboundPayload(body);
  if (!channelConfig) {
    channelConfig = await resolveChannelByKey(supabase, clienteId, inbound, queryChannelId);
  }

  const bodyPreview =
    inbound.messageText?.slice(0, 200) ||
    `${inbound.format}:${inbound.eventType}` ||
    "ingress";

  await supabase.from("cliente_whatsapp_webhook_log").insert({
    cliente_id: clienteId,
    status: "ok",
    source: "ingress",
    from_jid: inbound.fromJid !== "unknown" ? inbound.fromJid : null,
    type: `${inbound.format}:${inbound.eventType}`,
    body_preview: bodyPreview,
    body_keys: Object.keys(body).length ? Object.keys(body) : null,
    raw_payload: body,
  });

  let contactCreated = false;

  if (inbound.fromJid && inbound.fromJid !== "unknown") {
    const tracking = inbound.tracking;
    const now = new Date().toISOString();

    const { data: existingContact } = await supabase
      .from("cliente_whatsapp_contact")
      .select(
        "tracking_data, origin_source, utm_source, utm_medium, utm_campaign, utm_content, utm_term, first_seen_at, last_message_at, whatsapp_config_id"
      )
      .eq("cliente_id", clienteId)
      .eq("from_jid", inbound.fromJid)
      .maybeSingle();

    const msgMs = new Date(inbound.msgTimestamp).getTime();
    const prevFirst = existingContact?.first_seen_at ? new Date(existingContact.first_seen_at).getTime() : null;
    const prevLast = existingContact?.last_message_at ? new Date(existingContact.last_message_at).getTime() : null;
    const firstSeenIso = new Date(prevFirst == null ? msgMs : Math.min(prevFirst, msgMs)).toISOString();
    const lastSeenIso = new Date(prevLast == null ? msgMs : Math.max(prevLast, msgMs)).toISOString();

    const existingHasTracking = existingContact?.tracking_data &&
      typeof existingContact.tracking_data === "object" &&
      Object.keys(existingContact.tracking_data as object).length > 0;
    const existingRaw = existingContact?.tracking_data as Record<string, unknown> | undefined;

    const finalTracking = (() => {
      if (existingHasTracking) return existingRaw ?? null;
      const flat = tracking.tracking_data;
      if (existingRaw?.meta_ad_details || existingRaw?.meta_ad_details_history) {
        return {
          ...(flat || {}),
          meta_ad_details: existingRaw.meta_ad_details,
          meta_ad_details_history: existingRaw.meta_ad_details_history,
        };
      }
      return flat ?? null;
    })();

    const finalOrigin = existingHasTracking
      ? (existingContact!.origin_source ?? tracking.origin_source)
      : tracking.origin_source;
    const finalUtm = existingHasTracking
      ? {
          utm_source: existingContact!.utm_source ?? tracking.utm_source,
          utm_medium: existingContact!.utm_medium ?? tracking.utm_medium,
          utm_campaign: existingContact!.utm_campaign ?? tracking.utm_campaign,
          utm_content: existingContact!.utm_content ?? tracking.utm_content,
          utm_term: existingContact!.utm_term ?? tracking.utm_term,
        }
      : {
          utm_source: tracking.utm_source,
          utm_medium: tracking.utm_medium,
          utm_campaign: tracking.utm_campaign,
          utm_content: tracking.utm_content,
          utm_term: tracking.utm_term,
        };

    const { error: contactError } = await supabase.from("cliente_whatsapp_contact").upsert(
      {
        cliente_id: clienteId,
        from_jid: inbound.fromJid,
        phone: inbound.phone || null,
        sender_name: inbound.name || null,
        origin_source: finalOrigin,
        utm_source: finalUtm.utm_source,
        utm_medium: finalUtm.utm_medium,
        utm_campaign: finalUtm.utm_campaign,
        utm_content: finalUtm.utm_content,
        utm_term: finalUtm.utm_term,
        tracking_data: finalTracking,
        profile_pic_url: inbound.profilePicUrl || null,
        instance_name: inbound.instanceName || inbound.channelKey || null,
        whatsapp_config_id: channelConfig?.id ?? (existingContact?.whatsapp_config_id as string | null) ?? null,
        first_seen_at: firstSeenIso,
        last_message_at: lastSeenIso,
        updated_at: now,
      },
      {
        onConflict: "cliente_id,from_jid",
        updateColumns: [
          "phone", "sender_name", "origin_source", "utm_source", "utm_medium", "utm_campaign",
          "utm_content", "utm_term", "tracking_data", "profile_pic_url", "instance_name",
          "whatsapp_config_id", "first_seen_at", "last_message_at", "updated_at",
        ],
      }
    );

    if (!contactError) {
      contactCreated = true;
      if (inbound.messageText) {
        await supabase.from("cliente_whatsapp_inbox").upsert(
          {
            cliente_id: clienteId,
            message_id: String(inbound.messageId),
            from_jid: inbound.fromJid,
            sender_name: inbound.name || null,
            msg_timestamp: inbound.msgTimestamp,
            type: "text",
            body: inbound.messageText,
            is_group: inbound.isGroup,
            group_name: inbound.groupName,
            phone: inbound.phone || null,
            profile_pic_url: inbound.profilePicUrl || null,
            raw_payload: body,
          },
          { onConflict: "cliente_id,message_id" }
        );
      }

      try {
        await fetch(`${supabaseUrl}/functions/v1/create-lead-from-contact`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({
            cliente_id: clienteId,
            from_jid: inbound.fromJid,
            phone: inbound.phone || null,
            sender_name: inbound.name || null,
            profile_pic_url: inbound.profilePicUrl || null,
          }),
        });
      } catch (e) {
        console.error("[crm-ingress-webhook] create-lead-from-contact failed", e);
      }
    } else {
      console.error("[crm-ingress-webhook] contact upsert error", contactError);
    }
  }

  return new Response(
    JSON.stringify({
      ok: true,
      format: inbound.format,
      contact_upserted: contactCreated,
      channel_id: channelConfig?.id ?? null,
      auth_via: auth.authVia,
      has_ctwa: !!(inbound.tracking.tracking_data as Record<string, unknown> | null)?.ctwaClid,
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});

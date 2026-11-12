import { runMiniCrmMessage } from "../_shared/miniCrmMessageRunner.js";
/**
 * Webhook para receber mensagens da uazapi (Caixa de entrada).
 * Configure na uazapi a URL: POST https://<seu-projeto>.supabase.co/functions/v1/uazapi-inbox-webhook?cliente_id=UUID&secret=SECRET
 * O secret deve ser o mesmo configurado no CRM (aba Canais → Webhook).
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  applyRastreamentoConversionFromWebhook,
  extractChatLabelsFromPayload,
} from './applyRastreamentoConversion.ts';
import { attachStoredThumbnail } from '../_shared/persistAdThumbnail.ts';
import { attributionEvidence, persistIngressContactAttribution } from '../_shared/contactAttributionHistory.js';
import {
  claimTrackableClickMatch,
  extractMatchCode,
  hasCtwaTrackingSignal,
  trackingFromMatchedClick,
} from '../_shared/rastreamentoTrackableLink.ts';
import { ensureLojaAtendConversa, maybeLojaIaAutoReply } from './lojaIaAutoReply.ts';
import { jidParaContatoLoja } from '../_shared/atendimentoLojaInbox.js';
import { isClientAcknowledgment, isUazapiReactionInbound } from '../_shared/atendimentoClientAck.js';
import { hasStoredContactAttribution, lookupInitialMessageLink, mergeContactAttributionMetadata, trackingFromInitialMessageLink } from '../_shared/rastreamentoMessageAttribution.js';
import { handleUazapiGroupEvent } from './groupDeparture.js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function isInternalUazapiId(id: string): boolean {
  const s = String(id || '').trim();
  if (!s) return true;
  if (/^r[0-9a-f]{6,}$/i.test(s)) return true;
  if (/^sent_\d+$/i.test(s)) return true;
  if (/@.+_\d{13,}$/.test(s)) return true;
  return false;
}

function stanzaFromValue(value: unknown): string {
  const s = String(value ?? '').trim();
  if (!s || isInternalUazapiId(s)) return '';
  if (s.includes(':')) {
    const part = s.split(':').pop()?.trim() || '';
    return isInternalUazapiId(part) ? '' : part;
  }
  return s;
}

function extractWhatsAppIdsFromRaw(raw: unknown): { stanza: string; full?: string } | null {
  if (!raw || typeof raw !== 'object') return null;
  const body = raw as Record<string, unknown>;
  const payload = (body.data && typeof body.data === 'object' ? body.data : body) as Record<string, unknown>;
  const key = (payload.key ?? body.key) as Record<string, unknown> | undefined;
  const msg = (payload.message ?? body.message) as Record<string, unknown> | undefined;
  const msgKey = msg?.key as Record<string, unknown> | undefined;

  const fullIdRaw = String(payload.id ?? body.id ?? '').trim();
  if (fullIdRaw.includes(':')) {
    const stanza = stanzaFromValue(fullIdRaw);
    if (stanza) return { stanza, full: fullIdRaw };
  }

  for (const candidate of [payload.messageid, payload.messageId, key?.id, msgKey?.id, payload.id, body.id]) {
    const stanza = stanzaFromValue(candidate);
    if (stanza) {
      return {
        stanza,
        full: String(candidate ?? '').includes(':') ? String(candidate).trim() : undefined,
      };
    }
  }
  return null;
}

function pickStoredMessageId(
  payload: Record<string, unknown>,
  body: Record<string, unknown>,
  key: Record<string, unknown> | undefined,
  messageKey: Record<string, unknown> | undefined,
  chatJid: string,
): string {
  const fromRaw = extractWhatsAppIdsFromRaw({ ...body, data: payload });
  if (fromRaw?.stanza) return fromRaw.stanza;

  for (const candidate of [payload.messageid, payload.messageId, body.messageid, body.messageId, key?.id, messageKey?.id, payload.id, body.id]) {
    const stanza = stanzaFromValue(candidate);
    if (stanza) return stanza;
  }

  return `${chatJid}_${Date.now()}`;
}

type TrackingResult = {
  origin_source: 'meta_ads' | 'google_ads' | 'site' | 'nao_identificado';
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  tracking_data: Record<string, unknown> | null;
};

function extractTrackingFromPayload(body: Record<string, unknown>, payload: Record<string, unknown>, chat: Record<string, unknown> | undefined): TrackingResult {
  const getVal = (obj: Record<string, unknown> | null | undefined, ...keys: string[]): string | null => {
    if (!obj || typeof obj !== 'object') return null;
    for (const k of keys) {
      const v = obj[k];
      if (v != null && typeof v === 'string' && String(v).trim()) return String(v).trim();
      if (v != null && typeof v === 'number') return String(v);
    }
    return null;
  };
  const message = (body?.message ?? payload?.message) as Record<string, unknown> | undefined;
  const content = message?.content as Record<string, unknown> | undefined;
  const contextInfo = content?.contextInfo as Record<string, unknown> | undefined;
  const externalAdReply = contextInfo?.externalAdReply as Record<string, unknown> | undefined;
  const utm_source = getVal(body, 'utm_source') ?? getVal(payload, 'utm_source') ?? (chat ? getVal(chat, 'utm_source') : null);
  const utm_medium = getVal(body, 'utm_medium') ?? getVal(payload, 'utm_medium') ?? (chat ? getVal(chat, 'utm_medium') : null);
  const utm_campaign = getVal(body, 'utm_campaign') ?? getVal(payload, 'utm_campaign') ?? (chat ? getVal(chat, 'utm_campaign') : null);
  const utm_content = getVal(body, 'utm_content') ?? getVal(payload, 'utm_content') ?? null;
  const utm_term = getVal(body, 'utm_term') ?? getVal(payload, 'utm_term') ?? null;
  const fbclid = getVal(body, 'fbclid') ?? getVal(payload, 'fbclid') ?? (chat ? getVal(chat, 'fbclid') : null);
  const gclid = getVal(body, 'gclid') ?? getVal(payload, 'gclid') ?? (chat ? getVal(chat, 'gclid') : null);
  const source_id = getVal(externalAdReply, 'sourceID', 'source_id', 'sourceId') ?? getVal(body, 'sourceID', 'source_id', 'sourceId') ?? getVal(payload, 'sourceID', 'source_id', 'sourceId') ?? (chat ? getVal(chat, 'sourceID', 'source_id', 'sourceId') : null);
  const sourceApp = getVal(externalAdReply, 'sourceApp', 'source_app') ?? getVal(body, 'sourceApp', 'source_app') ?? getVal(payload, 'sourceApp', 'source_app') ?? (chat ? getVal(chat, 'sourceApp', 'source_app') : null);
  const ctwaClid = getVal(externalAdReply, 'ctwaClid', 'ctwa_clid') ?? getVal(body, 'ctwaClid', 'ctwa_clid') ?? getVal(payload, 'ctwaClid', 'ctwa_clid') ?? (chat ? getVal(chat, 'ctwaClid', 'ctwa_clid') : null);
  const conversionSource = getVal(contextInfo, 'conversionSource', 'conversion_source') ?? getVal(contextInfo, 'entryPointConversionExternalSource') ?? getVal(body, 'conversionSource', 'conversion_source') ?? getVal(payload, 'conversionSource', 'conversion_source') ?? (chat ? getVal(chat, 'conversionSource', 'conversion_source') : null);
  const entryPointConversionExternalSource = getVal(contextInfo, 'entryPointConversionExternalSource') ?? getVal(body, 'entryPointConversionExternalSource') ?? getVal(payload, 'entryPointConversionExternalSource') ?? null;
  const sourceURL = getVal(externalAdReply, 'sourceURL', 'source_url') ?? getVal(body, 'sourceURL', 'source_url') ?? getVal(payload, 'sourceURL', 'source_url') ?? null;
  const thumbnailURL = getVal(externalAdReply, 'thumbnailURL', 'thumbnail_url') ?? getVal(body, 'thumbnailURL', 'thumbnail_url') ?? getVal(payload, 'thumbnailURL', 'thumbnail_url') ?? null;
  const ownerPhone =
    getVal(body, 'owner') ??
    getVal(payload, 'owner') ??
    (chat ? getVal(chat, 'owner') : null);
  const metaIndicators = ['facebook', 'meta', 'fb', 'meta_ads', 'meta ads', 'facebook_ads', 'fb_ads'];
  const googleIndicators = ['google', 'googleads', 'google_ads', 'adwords', 'gads'];
  const utmIsMeta = utm_source && metaIndicators.some((m) => utm_source.toLowerCase().includes(m));
  const utmIsGoogle = utm_source && googleIndicators.some((m) => utm_source.toLowerCase().includes(m));
  const utmMediumIsCpc = utm_medium && /cpc|ppc|paid/i.test(utm_medium);
  const conversionSourceIsMeta = conversionSource && metaIndicators.some((m) => conversionSource.toLowerCase().includes(m));
  let origin_source: 'meta_ads' | 'google_ads' | 'site' | 'nao_identificado' = 'nao_identificado';
  if (utmIsMeta || !!fbclid || !!source_id || !!sourceApp || !!ctwaClid || conversionSourceIsMeta) {
    origin_source = 'meta_ads';
  } else if (!!gclid || utmIsGoogle || (utmMediumIsCpc && utmIsGoogle)) {
    origin_source = 'google_ads';
  } else if (utm_source && /^(site|website|organic)$/i.test(utm_source)) {
    origin_source = 'site';
  }
  const tracking_data: Record<string, unknown> = {};
  if (utm_source) tracking_data.utm_source = utm_source;
  if (utm_medium) tracking_data.utm_medium = utm_medium;
  if (utm_campaign) tracking_data.utm_campaign = utm_campaign;
  if (utm_content) tracking_data.utm_content = utm_content;
  if (utm_term) tracking_data.utm_term = utm_term;
  if (fbclid) tracking_data.fbclid = fbclid;
  if (gclid) tracking_data.gclid = gclid;
  if (source_id) tracking_data.source_id = source_id;
  if (sourceApp) tracking_data.sourceApp = sourceApp;
  if (ctwaClid) tracking_data.ctwaClid = ctwaClid;
  if (conversionSource) tracking_data.conversionSource = conversionSource;
  if (entryPointConversionExternalSource) tracking_data.entryPointConversionExternalSource = entryPointConversionExternalSource;
  if (sourceURL) tracking_data.sourceURL = sourceURL;
  if (thumbnailURL) tracking_data.thumbnailURL = thumbnailURL;
  if (ownerPhone) tracking_data.owner_phone = ownerPhone;
  return {
    origin_source,
    utm_source: utm_source || null,
    utm_medium: utm_medium || null,
    utm_campaign: utm_campaign || null,
    utm_content: utm_content || null,
    utm_term: utm_term || null,
    tracking_data: Object.keys(tracking_data).length ? tracking_data : null,
  };
}

/** Varre o payload recursivamente e retorna o primeiro valor que pareça JID ou telefone (igual ao "Importar como contato" no frontend). */
function findJidOrPhoneInObject(obj: unknown, depth = 0): string | null {
  if (depth > 10) return null;
  if (obj == null) return null;
  if (typeof obj === 'string') {
    const s = obj.trim();
    if (!s || s === 'unknown') return null;
    if (s.includes('@s.whatsapp.net')) return s;
    const digits = s.replace(/\D/g, '');
    if (digits.length >= 10 && digits.length <= 15) return s;
    return null;
  }
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const found = findJidOrPhoneInObject(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (typeof obj === 'object') {
    const o = obj as Record<string, unknown>;
    const keys = ['from', 'remoteJid', 'chatId', 'chatid', 'sender_pn', 'author', 'participant', 'wa_chatid', 'id', 'phone', 'sender', 'senderId', 'phoneNumber', 'senderPhone', 'wa_id', 'number'];
    for (const k of keys) {
      const v = o[k];
      const found = findJidOrPhoneInObject(v, depth + 1);
      if (found) return found;
    }
    for (const v of Object.values(o)) {
      const found = findJidOrPhoneInObject(v, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

function parseMessageTimestamp(payload: Record<string, unknown>, body: Record<string, unknown>): string {
  const raw = payload.messageTimestamp ?? payload.timestamp ?? body.messageTimestamp ?? body.timestamp;
  if (raw == null) return new Date().toISOString();
  const n = Number(raw);
  if (Number.isNaN(n)) return new Date().toISOString();
  const ms = n > 1e12 ? n : n * 1000;
  return new Date(ms).toISOString();
}

function normalizeJid(raw: string): string {
  const s = String(raw || '').trim();
  if (!s || s === 'unknown') return '';
  if (s.includes('@')) return s;
  const digits = s.replace(/\D/g, '');
  return digits ? `${digits}@s.whatsapp.net` : '';
}

const DEBUG_LOG_URL = 'http://127.0.0.1:7242/ingest/72aa0069-2fbf-413e-a858-b1b419cc5e13';
function debugLog(location: string, message: string, data: Record<string, unknown>, hypothesisId: string) {
  fetch(DEBUG_LOG_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ location, message, data, timestamp: Date.now(), hypothesisId }),
  }).catch(() => {});
}

function resolveInboundMessageType(
  payload: Record<string, unknown>,
  body: Record<string, unknown>,
  messageObj: Record<string, unknown> | undefined,
): string {
  const candidates = [payload.type, body.type, payload.mediaType, payload.mediatype, payload.messageType]
    .map((v) => String(v ?? '').toLowerCase().trim())
    .filter(Boolean);

  for (const t of candidates) {
    if (['ptt', 'myaudio', 'audio', 'voice', 'voicemessage'].includes(t)) return t;
    if (t && t !== 'text' && t !== 'chat') return t;
  }

  const msg = messageObj;
  const msgType = String(msg?.type ?? msg?.messageType ?? '').toLowerCase();
  if (msgType.includes('reaction')) return 'reaction';
  if (msg?.reactionMessage) return 'reaction';
  if (msg?.audioMessage || msg?.pttMessage) return 'ptt';

  const content = msg?.content;
  if (content && typeof content === 'object') {
    const c = content as Record<string, unknown>;
    const mime = String(c.mimetype ?? '').toLowerCase();
    if (mime.startsWith('audio/') || c.ptt === true || c.voice === true) return 'ptt';
  }

  return String(payload.type ?? body.type ?? 'text');
}

function extractMessageBody(payload: Record<string, unknown>, body: Record<string, unknown>): string {
  const pick = (...vals: unknown[]): string => {
    for (const v of vals) {
      if (typeof v === 'string' && v.trim()) return v.trim();
    }
    return '';
  };
  const direct = pick(payload.body, payload.text, payload.content, body.body, body.text);
  if (direct) return direct;

  const message = (payload.message ?? body.message) as Record<string, unknown> | string | undefined;
  if (typeof message === 'string' && message.trim()) return message.trim();
  if (!message || typeof message !== 'object') return '';

  const msg = message as Record<string, unknown>;
  const fromConversation = pick(msg.conversation, msg.text);
  if (fromConversation) return fromConversation;

  const ext = msg.extendedTextMessage as Record<string, unknown> | undefined;
  if (ext) {
    const t = pick(ext.text);
    if (t) return t;
  }

  const content = msg.content;
  if (typeof content === 'string' && content.trim()) return content.trim();
  if (content && typeof content === 'object') {
    const c = content as Record<string, unknown>;
    const t = pick(c.text, c.caption, c.title);
    if (t) return t;
  }

  const image = msg.imageMessage as Record<string, unknown> | undefined;
  if (image) {
    const t = pick(image.caption);
    if (t) return t;
  }

  return '';
}

type AckStatus = 'sent' | 'delivered' | 'read';

const ACK_STATUS_RANK: Record<AckStatus, number> = {
  sent: 1,
  delivered: 2,
  read: 3,
};

function normalizeUazapiAckStatus(raw: unknown): AckStatus | null {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    if (raw >= 4) return 'read';
    if (raw >= 3) return 'delivered';
    if (raw >= 2) return 'sent';
    return null;
  }
  const s = String(raw).trim().toLowerCase();
  if (!s) return null;
  if (s === 'read' || s === 'played' || s === 'viewed') return 'read';
  if (s === 'delivered' || s === 'delivery_ack') return 'delivered';
  if (s === 'sent' || s === 'server_ack' || s === 'queued' || s === 'pending') return 'sent';
  return null;
}

function ackStatusRank(status: AckStatus | null | undefined): number {
  if (!status) return 0;
  return ACK_STATUS_RANK[status] ?? 0;
}

function resolveWebhookEventType(body: Record<string, unknown>, url: URL): string {
  for (const candidate of [
    body.event,
    body.Event,
    body.eventType,
    url.searchParams.get('event'),
    url.searchParams.get('EventType'),
    (body.data && typeof body.data === 'object' && !Array.isArray(body.data)
      ? (body.data as Record<string, unknown>).event
      : null),
  ]) {
    if (candidate == null || candidate === '') continue;
    return String(candidate).trim().toLowerCase();
  }
  return '';
}

function isMessagesUpdateEvent(eventType: string): boolean {
  if (!eventType) return false;
  return (
    eventType === 'messages_update' ||
    eventType === 'message_update' ||
    eventType === 'messages.update' ||
    eventType === 'message.update' ||
    eventType.includes('messages_update') ||
    eventType.includes('messages.update')
  );
}

function payloadFromMe(
  body: Record<string, unknown>,
  payload: Record<string, unknown>,
  messageObj?: Record<string, unknown> | null,
): boolean | null {
  const updateObj = (payload.update ?? body.update) as Record<string, unknown> | undefined;
  const key = (payload.key ?? body.key ?? messageObj?.key) as Record<string, unknown> | undefined;
  const dataObj =
    payload.data && typeof payload.data === 'object' ? (payload.data as Record<string, unknown>) : null;
  for (const candidate of [
    payload.fromMe,
    body.fromMe,
    dataObj?.fromMe,
    messageObj?.fromMe,
    updateObj?.fromMe,
    key?.fromMe,
    payload.wasSentByApi,
    body.wasSentByApi,
  ]) {
    if (typeof candidate === 'boolean') return candidate;
  }
  return null;
}

function buildInboundSentPreview(type: string, bodyText: string, payload: Record<string, unknown>): string {
  const text = String(bodyText || '').trim();
  if (text) return text;
  const t = String(type || '').toLowerCase();
  const content =
    payload.content && typeof payload.content === 'object' ? (payload.content as Record<string, unknown>) : null;
  const fileName = String(content?.fileName ?? content?.title ?? payload.fileName ?? '').trim();
  if (t === 'image' || t === 'sticker') return fileName ? `[Imagem] ${fileName}` : '[Imagem]';
  if (t === 'audio' || t === 'ptt' || t === 'myaudio' || t === 'voice') return fileName ? `[Áudio] ${fileName}` : '[Áudio]';
  if (t === 'video' || t === 'videoplay' || t === 'ptv') return fileName ? `[Vídeo] ${fileName}` : '[Vídeo]';
  if (t === 'document' || t === 'file') return fileName ? `[Documento] ${fileName}` : '[Documento]';
  return t ? `[${t}]` : '(mensagem enviada)';
}

function looksLikeMessageStatusUpdate(body: Record<string, unknown>): boolean {
  const payloadRaw = body.data ?? body;
  const items = Array.isArray(payloadRaw)
    ? payloadRaw
    : [payloadRaw && typeof payloadRaw === 'object' ? payloadRaw : body];
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const payload = item as Record<string, unknown>;
    const updateObj = (payload.update ?? body.update) as Record<string, unknown> | undefined;
    const hasStatus = updateObj?.status != null || payload.status != null || body.status != null;
    if (!hasStatus) continue;
    const fromMe = payloadFromMe(body, payload);
    if (fromMe === false) continue;
    return true;
  }
  return false;
}

function collectMessageIdCandidates(body: Record<string, unknown>, payload: Record<string, unknown>): string[] {
  const ids = new Set<string>();
  const add = (value: unknown) => {
    const stanza = stanzaFromValue(value);
    if (stanza) ids.add(stanza);
    const s = String(value ?? '').trim();
    if (s.includes(':') && !isInternalUazapiId(s)) ids.add(s);
  };

  const messageObj = (body.message ?? payload.message) as Record<string, unknown> | undefined;
  const key = (payload.key ?? body.key ?? messageObj?.key) as Record<string, unknown> | undefined;
  const updateObj = (payload.update ?? body.update) as Record<string, unknown> | undefined;

  for (const candidate of [
    payload.id,
    payload.messageid,
    payload.messageId,
    body.id,
    body.messageid,
    body.messageId,
    key?.id,
    (updateObj?.key as Record<string, unknown> | undefined)?.id,
  ]) {
    add(candidate);
  }

  const internalId = String(payload.id ?? body.id ?? '').trim();
  if (/^r[0-9a-f]{6,}$/i.test(internalId)) ids.add(internalId);

  const fromRaw = extractWhatsAppIdsFromRaw(body);
  if (fromRaw?.stanza) ids.add(fromRaw.stanza);
  if (fromRaw?.full) ids.add(fromRaw.full);

  return Array.from(ids);
}

function extractAckStatusFromPayload(body: Record<string, unknown>, payload: Record<string, unknown>): AckStatus | null {
  const updateObj = (payload.update ?? body.update) as Record<string, unknown> | undefined;
  const messageObj = (body.message ?? payload.message) as Record<string, unknown> | undefined;
  for (const candidate of [
    updateObj?.status,
    payload.status,
    body.status,
    messageObj?.status,
    payload.ack,
    body.ack,
    updateObj?.ack,
  ]) {
    const normalized = normalizeUazapiAckStatus(candidate);
    if (normalized) return normalized;
  }
  return null;
}

async function findSentRowsForAckUpdate(
  supabase: ReturnType<typeof createClient>,
  clienteId: string,
  ids: string[],
): Promise<Array<{ id: string; ack_status: string | null; message_id: string | null }>> {
  if (!ids.length) return [];

  const { data: exactRows, error: exactError } = await supabase
    .from('cliente_whatsapp_sent')
    .select('id, ack_status, message_id')
    .eq('cliente_id', clienteId)
    .in('message_id', ids);

  if (exactError) {
    console.error('[uazapi-inbox-webhook] messages_update exact select error', exactError);
    return [];
  }
  if (exactRows?.length) return exactRows;

  const internalIds = ids.filter((id) => /^r[0-9a-f]{6,}$/i.test(id));
  if (internalIds.length) {
    const { data: internalRows, error: internalError } = await supabase
      .from('cliente_whatsapp_sent')
      .select('id, ack_status, message_id')
      .eq('cliente_id', clienteId)
      .in('uazapi_internal_id', internalIds);
    if (internalError) {
      console.error('[uazapi-inbox-webhook] messages_update internal select error', internalError);
    } else if (internalRows?.length) {
      return internalRows;
    }
  }

  const stanzaIds = [...new Set(ids.map((id) => stanzaFromValue(id) || id).filter(Boolean))];
  for (const stanza of stanzaIds) {
    if (stanza.length < 6) continue;
    const { data: fuzzyRows, error: fuzzyError } = await supabase
      .from('cliente_whatsapp_sent')
      .select('id, ack_status, message_id')
      .eq('cliente_id', clienteId)
      .ilike('message_id', `%${stanza}`)
      .order('created_at', { ascending: false })
      .limit(5);
    if (fuzzyError) {
      console.error('[uazapi-inbox-webhook] messages_update fuzzy select error', fuzzyError);
      continue;
    }
    if (fuzzyRows?.length) return fuzzyRows;
  }

  return [];
}

async function handleMessagesUpdateAck(
  supabase: ReturnType<typeof createClient>,
  clienteId: string,
  body: Record<string, unknown>,
): Promise<Response> {
  const payloadRaw = body.data ?? body;
  const payloads = Array.isArray(payloadRaw)
    ? payloadRaw.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    : [payloadRaw && typeof payloadRaw === 'object' ? (payloadRaw as Record<string, unknown>) : body];

  let lastAck: AckStatus | null = null;
  let updated = 0;

  for (const payload of payloads) {
    const fromMe = payloadFromMe(body, payload);
    if (fromMe === false) continue;

    const ackStatus = extractAckStatusFromPayload(body, payload);
    if (!ackStatus) continue;

    const ids = collectMessageIdCandidates(body, payload);
    const rows = await findSentRowsForAckUpdate(supabase, clienteId, ids);
    if (!rows.length) {
      console.log('[uazapi-inbox-webhook] messages_update sem match', { ids, ackStatus });
      continue;
    }

    for (const row of rows) {
      const current = normalizeUazapiAckStatus(row.ack_status) ?? 'sent';
      if (ackStatusRank(ackStatus) <= ackStatusRank(current)) continue;
      const { error: updateError } = await supabase
        .from('cliente_whatsapp_sent')
        .update({ ack_status: ackStatus })
        .eq('id', row.id);
      if (updateError) {
        console.error('[uazapi-inbox-webhook] messages_update update error', updateError);
        continue;
      }
      updated += 1;
      lastAck = ackStatus;
    }
  }

  await supabase.from('cliente_whatsapp_webhook_log').insert({
    cliente_id: clienteId,
    status: updated > 0 ? 'ok' : 'ok',
    source: 'uazapi',
    type: 'messages_update',
    body_preview: lastAck ? `ack=${lastAck}` : 'sem ack',
    body_keys: Object.keys(body),
    error_message: null,
    raw_payload: body,
  });

  return new Response(
    JSON.stringify({ ok: true, event: 'messages_update', updated, ack_status: lastAck }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
}

serve(async (req) => {
  const url = new URL(req.url);
  console.log('[uazapi-inbox-webhook] WEBHOOK RECEBEU REQUEST', req.method, url.searchParams.get('cliente_id') ? 'cliente_id=OK' : 'cliente_id=FALTA', url.searchParams.get('secret') ? 'secret=OK' : 'secret=FALTA');
  // #region agent log
  debugLog('uazapi-inbox-webhook/index.ts:entry', 'webhook_request', {
    method: req.method,
    pathname: url.pathname,
    cliente_id_from_url: url.searchParams.get('cliente_id') ?? null,
    hasSecret: !!url.searchParams.get('secret'),
  }, 'H1');
  // #endregion
  console.log('[uazapi-inbox-webhook] Requisição:', req.method, url.pathname, 'cliente_id=', url.searchParams.get('cliente_id'), 'has_secret=', !!url.searchParams.get('secret'));

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method === 'GET') {
    return new Response(JSON.stringify({ ok: true, message: 'Webhook uazapi ativo. Use POST para receber eventos.' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Método não permitido' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!supabaseUrl || !supabaseServiceKey) {
    return new Response(JSON.stringify({ error: 'Configuração do servidor incompleta' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const clienteId = url.searchParams.get('cliente_id');
  const secret = url.searchParams.get('secret');
  if (!clienteId || !secret) {
    return new Response(
      JSON.stringify({ error: 'Query params cliente_id e secret são obrigatórios' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const { data: config, error: configError } = await supabase
    .from('cliente_whatsapp_config')
    .select('id, webhook_secret')
    .eq('cliente_id', clienteId)
    .eq('webhook_secret', secret)
    .maybeSingle();

  if (configError || !config?.webhook_secret) {
    // #region agent log
    debugLog('uazapi-inbox-webhook/index.ts:auth', 'webhook_auth_failed', {
      configError: configError?.message ?? null,
      hasSecret: !!config?.webhook_secret,
      clienteId: clienteId ?? null,
    }, 'H2');
    console.log('[uazapi-inbox-webhook] DEBUG auth failed', JSON.stringify({ configError: configError?.message, hasSecret: !!config?.webhook_secret, clienteId }));
    // #endregion
    return new Response(JSON.stringify({ error: 'Secret inválido' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  // #region agent log
  debugLog('uazapi-inbox-webhook/index.ts:auth', 'webhook_auth_ok', { clienteId }, 'H2');
  console.log('[uazapi-inbox-webhook] DEBUG auth OK, parsing body', JSON.stringify({ clienteId }));
  // #endregion

  let body: Record<string, unknown>;
  try {
    const raw = await req.json();
    body = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  } catch (e) {
    // #region agent log
    debugLog('uazapi-inbox-webhook/index.ts:body', 'webhook_body_parse_failed', { error: String(e) }, 'H4');
    // #endregion
    console.log('[uazapi-inbox-webhook] Body não é JSON válido ou está vazio');
    return new Response(JSON.stringify({ error: 'Body JSON inválido' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // #region agent log
  debugLog('uazapi-inbox-webhook/index.ts:body', 'webhook_body_parsed', { bodyKeysCount: Object.keys(body).length }, 'H4');
  // #endregion

  const eventType = resolveWebhookEventType(body, url);
  if (eventType === 'groups' || (typeof body.EventType === 'string' && body.EventType.trim().toLowerCase() === 'groups')) {
    const status = await handleUazapiGroupEvent(supabase, { clientId: clienteId, channelId: config.id, secret }, body);
    return new Response(JSON.stringify({ ok: status === 200 }), {
      status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  if (isMessagesUpdateEvent(eventType) || looksLikeMessageStatusUpdate(body)) {
    console.log('[uazapi-inbox-webhook] messages_update event', eventType || 'structural');
    return handleMessagesUpdateAck(supabase, clienteId, body);
  }

  const payload = (body.data && typeof body.data === 'object' ? body.data as Record<string, unknown> : body) as Record<string, unknown>;
  const chat = (body.chat ?? payload.chat ?? (body.data as Record<string, unknown>)?.chat) as Record<string, unknown> | undefined;
  const key = (payload?.key ?? body?.key ?? (body.message as Record<string, unknown>)?.key) as Record<string, unknown> | undefined;
  const keyObj = key && typeof key === 'object' && key !== null ? key : {};
  const bodyKeys = Object.keys(body);
  console.log('[uazapi-inbox-webhook] body_keys:', bodyKeys, 'payload_keys:', Object.keys(payload));

  const getStr = (obj: Record<string, unknown> | null | undefined, ...keys: string[]): string => {
    if (!obj || typeof obj !== 'object') return '';
    for (const k of keys) {
      const v = obj[k];
      if (v != null && typeof v === 'string' && v.trim()) return v.trim();
      if (v != null && typeof v === 'number') return String(v);
      if (v != null && typeof v === 'object' && !Array.isArray(v)) {
        const urlVal = (v as Record<string, unknown>)['URL'] ?? (v as Record<string, unknown>)['url'];
        if (urlVal != null && typeof urlVal === 'string' && urlVal.trim()) return urlVal.trim();
      }
    }
    return '';
  };

  const messageObj = (body?.message ?? payload?.message) as Record<string, unknown> | undefined;
  const messageKey = messageObj?.key as Record<string, unknown> | undefined;

  const isGroup = !!(chat?.wa_isGroup ?? payload.isGroup ?? payload.is_group ?? body.isGroup ?? body.is_group);
  const groupName = (chat?.name ?? chat?.wa_name ?? payload.groupName ?? payload.subject ?? body.groupName ?? null) as string | null;

  const chatJidRaw =
    getStr(chat as Record<string, unknown>, 'wa_chatid', 'id') ||
    getStr(keyObj, 'remoteJid') ||
    getStr(messageKey, 'remoteJid') ||
    getStr(payload, 'chatid', 'chatId', 'remoteJid', 'from') ||
    getStr(body, 'chatid', 'from') ||
    '';
  let chatJid = normalizeJid(chatJidRaw);

  const extractPhoneFromJid = (jid: string) => {
    if (!jid || typeof jid !== 'string') return '';
    return jid.replace(/@.*$/, '').trim();
  };

  const isLidJid = (jid: string) => /@lid$/i.test(String(jid || '').trim());

  const isLikelyLidDigits = (digits: string) => {
    const d = String(digits || '').replace(/\D/g, '');
    return d.length > 13;
  };

  const isPlausibleWhatsAppPhoneDigits = (digits: string) => {
    const d = String(digits || '').replace(/\D/g, '');
    if (!d || d.length < 10 || d.length > 13) return false;
    return !isLikelyLidDigits(d);
  };

  const phoneDigitsFromJidMaybe = (jid: string) => {
    if (!jid || isLidJid(jid)) return '';
    const d = extractPhoneFromJid(jid).replace(/\D/g, '');
    return isPlausibleWhatsAppPhoneDigits(d) ? d : '';
  };

  const participantJidRaw = isGroup
    ? (
        getStr(messageObj, 'sender_lid', 'senderLid', 'sender', 'from') ||
        getStr(payload, 'participant', 'author', 'sender', 'sender_lid', 'senderLid') ||
        getStr(messageKey, 'participant') ||
        getStr(body, 'participant', 'author', 'sender') ||
        getStr(messageObj, 'sender_pn', 'senderPn') ||
        getStr(payload, 'sender_pn', 'senderPn') ||
        getStr(body, 'sender_pn', 'senderPn') ||
        ''
      )
    : '';

  const senderRaw =
    participantJidRaw ||
    getStr(payload, 'participant', 'author', 'sender_pn', 'sender') ||
    getStr(messageKey, 'participant', 'remoteJid') ||
    getStr(messageObj, 'sender', 'from') ||
    getStr(body, 'participant', 'author', 'sender') ||
    '';
  let senderJid = isGroup ? normalizeJid(senderRaw) : chatJid;

  const participantPhoneDigits = isGroup
    ? (
        phoneDigitsFromJidMaybe(getStr(messageObj, 'sender_pn', 'senderPn')) ||
        phoneDigitsFromJidMaybe(getStr(payload, 'sender_pn', 'senderPn')) ||
        phoneDigitsFromJidMaybe(getStr(body, 'sender_pn', 'senderPn')) ||
        phoneDigitsFromJidMaybe(senderJid) ||
        phoneDigitsFromJidMaybe(getStr(messageKey, 'participant')) ||
        phoneDigitsFromJidMaybe(getStr(payload, 'participant', 'author')) ||
        ''
      )
    : '';

  if (!chatJid && body && typeof body === 'object') {
    const found = findJidOrPhoneInObject(body);
    if (found) chatJid = normalizeJid(found);
  }
  if (!chatJid) chatJid = 'unknown';
  if (!isGroup && chatJid !== 'unknown' && !senderJid) senderJid = chatJid;

  if (clienteId && chatJid !== 'unknown') {
    const { data: bloqueio, error: bloqueioError } = await supabase
      .from('atendimento_bloqueios')
      .select('id')
      .eq('cliente_id', clienteId)
      .eq('chat_jid', chatJid)
      .maybeSingle();
    if (bloqueioError) {
      console.error('[uazapi-inbox-webhook] bloqueio lookup', bloqueioError.message);
    } else if (bloqueio?.id) {
      console.log('[uazapi-inbox-webhook] bloqueada, nada gravado');
      return new Response(JSON.stringify({ success: true, skipped: 'bloqueada' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }

  const fromJid = chatJid;
  const phoneFromJid = isGroup
    ? participantPhoneDigits
    : extractPhoneFromJid(chatJid);
  const phoneRawVal = phoneFromJid || (chat?.phone ?? payload?.phone ?? payload?.number ?? chat?.owner ?? payload?.owner ?? '');
  const phoneRaw = phoneRawVal != null && typeof phoneRawVal === 'number' ? String(phoneRawVal) : (typeof phoneRawVal === 'string' ? phoneRawVal : '');
  let phoneFinal = (typeof phoneRaw === 'string' && phoneRaw.trim() ? phoneRaw.trim() : '') || phoneFromJid || '';
  if (!phoneFinal && body && typeof body === 'object') {
    const fallbackStr = getStr(body, 'phone', 'number') || getStr(payload, 'phone', 'number');
    if (fallbackStr) phoneFinal = fallbackStr.replace(/\D/g, '').length >= 10 ? fallbackStr.replace(/\D/g, '') : fallbackStr;
  }

  const fromMe = payloadFromMe(body, payload, messageObj) === true;

  const PROFILE_PIC_KEYS = ['imagePreview', 'image', 'pictureUrl', 'profilePictureUrl', 'avatar', 'URL'] as const;

  const bodyText = extractMessageBody(payload, body);
  const type = resolveInboundMessageType(payload, body, messageObj);
  const bodyPreview = typeof bodyText === 'string' && bodyText ? bodyText.slice(0, 200) : (type !== 'text' ? `[${type}]` : '');

  const leadName = (chat?.lead_name ?? body?.lead_name ?? payload?.lead_name ?? chat?.leadName ?? body?.leadName ?? payload?.leadName ?? '') as string;
  const participantName =
    getStr(messageObj, 'senderName', 'pushName', 'notifyName') ||
    getStr(payload, 'pushName', 'notifyName', 'senderName') ||
    getStr(body, 'pushName', 'notifyName', 'senderName');
  const nameRaw = (isGroup && participantName)
    ? participantName
    : ((leadName && String(leadName).trim()) || (chat?.name ?? chat?.wa_name ?? payload.notifyName ?? payload.pushName ?? payload.senderName ?? payload.contactName ?? payload.name ?? payload.verifiedName ?? body.notifyName ?? body.pushName ?? body.name ?? body.senderName ?? '') as string);
  const dataObj = body?.data && typeof body.data === 'object' ? (body.data as Record<string, unknown>) : undefined;
  const contactObj = (body?.contact ?? payload?.contact ?? dataObj?.contact) as Record<string, unknown> | undefined;
  const senderObj = (body?.sender ?? payload?.sender ?? dataObj?.sender) as Record<string, unknown> | undefined;
  const profilePicUrl = (
    getStr(chat as Record<string, unknown>, ...PROFILE_PIC_KEYS) ||
    getStr(payload, ...PROFILE_PIC_KEYS) ||
    getStr(body, ...PROFILE_PIC_KEYS) ||
    (contactObj ? getStr(contactObj, ...PROFILE_PIC_KEYS) : '') ||
    (senderObj ? getStr(senderObj, ...PROFILE_PIC_KEYS) : '') ||
    (dataObj ? getStr(dataObj, ...PROFILE_PIC_KEYS) : '') ||
    ''
  ).trim() || '';
  const participantProfilePicUrl = isGroup
    ? (
        (senderObj ? getStr(senderObj, ...PROFILE_PIC_KEYS) : '') ||
        (contactObj ? getStr(contactObj, ...PROFILE_PIC_KEYS) : '') ||
        getStr(payload, ...PROFILE_PIC_KEYS) ||
        getStr(body, ...PROFILE_PIC_KEYS) ||
        ''
      ).trim() || ''
    : profilePicUrl;
  const inboxProfilePicUrl = isGroup ? participantProfilePicUrl : profilePicUrl;

  const instanceName = (getStr(body, 'instanceName') || getStr(payload, 'instanceName') || (dataObj ? getStr(dataObj, 'instanceName') : '')).trim() || null;

  const logRow = {
    cliente_id: clienteId,
    status: 'ok',
    source: 'uazapi',
    from_jid: fromJid && fromJid !== 'unknown' ? fromJid : null,
    type: type || null,
    body_preview: bodyPreview || null,
    body_keys: bodyKeys.length ? bodyKeys : null,
    error_message: null,
    raw_payload: body,
  };

  const messageId = pickStoredMessageId(payload, body, keyObj, messageKey, chatJid);
  let notificationSnapshot: string | null = null;
  if (fromMe && !isGroup && (payload.wasSentByApi === true || body.wasSentByApi === true)) {
    try {
      const receipt = await supabase.rpc('crm_ia_notification_webhook_receipt', {
        p_client: clienteId, p_channel: config.id, p_jid: chatJid, p_message: String(messageId),
      });
      if (!receipt.error && receipt.data?.notification === true) {
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (!receipt.error && receipt.data?.snapshot_id) notificationSnapshot = receipt.data.snapshot_id;
    } catch { /* Without an exact provider receipt the normal human path remains authoritative. */ }
  }
  const displayName = isGroup
    ? ((groupName && String(groupName).trim()) || chatJid.replace(/@.*$/, ''))
    : ((nameRaw && String(nameRaw).trim()) || phoneFinal || phoneFromJid || chatJid.replace(/@.*$/, ''));
  const participantDisplayName = (() => {
    if (!isGroup) return null;
    if (participantName && String(participantName).trim()) return String(participantName).trim();
    const fromSenderObj = senderObj
      ? getStr(senderObj, 'pushName', 'notifyName', 'name', 'senderName', 'verifiedName')
      : '';
    if (fromSenderObj) return fromSenderObj;
    const fromContact = contactObj ? getStr(contactObj, 'pushName', 'notifyName', 'name', 'senderName') : '';
    if (fromContact) return fromContact;
    if (participantPhoneDigits) return participantPhoneDigits;
    return null;
  })();
  const inboxSenderName = isGroup
    ? participantDisplayName
    : ((nameRaw && String(nameRaw).trim()) || phoneFinal || phoneFromJid || null);
  const ts = parseMessageTimestamp(payload, body);

  const { data: filaCanal } = await supabase
    .from('atendimento_fila_canais')
    .select('fila_id')
    .eq('whatsapp_config_id', config.id)
    .maybeSingle();

  let conversationId: string | null = null;
  if (chatJid && chatJid !== 'unknown') {
    const { data: existingConv } = await supabase
      .from('atendimento_conversas')
      .select('id, status, unread_count, last_customer_message_at, last_message_at, last_message_preview, awaiting_response_since, assigned_to')
      .eq('cliente_id', clienteId)
      .eq('whatsapp_config_id', config.id)
      .eq('chat_jid', chatJid)
      .maybeSingle();

    const nowIso = new Date().toISOString();
    let nextStatus = existingConv?.status ?? 'aguardando';
    let unreadCount = existingConv?.unread_count ?? 0;
    let lastCustomerAt = existingConv?.last_customer_message_at ?? null;
    let awaitingResponseSince: string | null = existingConv?.awaiting_response_since ?? null;
    let assignedTo = existingConv?.assigned_to ?? null;

    const inboundReaction = isUazapiReactionInbound(payload, messageObj) || type === 'reaction';
    const inboundAck = inboundReaction || isClientAcknowledgment({ body: bodyText, type });
    let lastPreview = bodyPreview || null;
    let lastAt = ts;
    if (!fromMe) {
      if (inboundReaction) {
        unreadCount = existingConv?.unread_count ?? unreadCount;
        lastCustomerAt = existingConv?.last_customer_message_at ?? lastCustomerAt;
        lastPreview = existingConv?.last_message_preview ?? lastPreview;
        lastAt = existingConv?.last_message_at ?? lastAt;
        awaitingResponseSince = null;
        if (nextStatus === 'aguardando') {
          nextStatus = assignedTo ? 'em_atendimento' : 'resolvido';
        }
      } else if (inboundAck) {
        unreadCount = (unreadCount || 0) + 1;
        lastCustomerAt = ts;
        awaitingResponseSince = null;
        if (nextStatus === 'aguardando' && assignedTo) nextStatus = 'em_atendimento';
      } else {
        unreadCount = (unreadCount || 0) + 1;
        lastCustomerAt = ts;
        if (nextStatus === 'resolvido') nextStatus = 'aguardando';
        if (!isGroup) awaitingResponseSince = ts;
      }
    } else {
      awaitingResponseSince = null;
    }

    if (!existingConv) {
      const { data: defaultOwner, error: ownerError } = await supabase.rpc(
        'caixa_dono_padrao_conversa',
        { p_cliente_id: clienteId, p_display_name: displayName || null }
      );
      if (ownerError) {
        console.error('[uazapi-inbox-webhook] caixa_dono_padrao_conversa', ownerError);
      } else if (defaultOwner) {
        assignedTo = defaultOwner;
      }
    }

    const upsertPayload: Record<string, unknown> = {
      cliente_id: clienteId,
      whatsapp_config_id: config.id,
      chat_jid: chatJid,
      is_group: isGroup,
      display_name: displayName || null,
      status: nextStatus,
      fila_id: filaCanal?.fila_id ?? null,
      last_message_at: lastAt,
      last_customer_message_at: lastCustomerAt,
      awaiting_response_since: awaitingResponseSince,
      unread_count: unreadCount,
      last_message_preview: lastPreview,
      profile_pic_url: (profilePicUrl && String(profilePicUrl).trim()) || null,
      updated_at: nowIso,
    };
    if (!existingConv && assignedTo) {
      upsertPayload.assigned_to = assignedTo;
    }

    let conversationWrite;
    if (notificationSnapshot) {
      const write = await supabase.rpc('crm_ia_notification_webhook_write', { p_snapshot: notificationSnapshot, p_payload: upsertPayload });
      if (!write.error && write.data?.notification === true) {
        return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      conversationWrite = { data: write.data?.row || null, error: write.error || (write.data?.conflict ? { message: 'notification_conversation_conflict' } : null) };
    } else conversationWrite = await supabase.from('atendimento_conversas').upsert(
        upsertPayload,
        { onConflict: 'cliente_id,whatsapp_config_id,chat_jid' }
      )
      .select('id')
      .single();
    const { data: convRow, error: convError } = conversationWrite;

    if (convError) console.error('[uazapi-inbox-webhook] conversation upsert error', convError);
    else conversationId = convRow?.id ?? null;
    if (!conversationId) {
      const { data: convFetch } = await supabase
        .from('atendimento_conversas')
        .select('id')
        .eq('cliente_id', clienteId)
        .eq('whatsapp_config_id', config.id)
        .eq('chat_jid', chatJid)
        .maybeSingle();
      conversationId = convFetch?.id ?? null;
    }

    const { error: archiveError } = await supabase.rpc('caixa_arquivar_canais_duplicados', {
      p_chat_jid: chatJid,
      p_cliente_id: clienteId,
    });
    if (archiveError) {
      console.error('[uazapi-inbox-webhook] caixa_arquivar_canais_duplicados', archiveError);
    }
  }

  if (fromMe) {
    const sentBody = buildInboundSentPreview(type, bodyText, payload);
    const ackStatus = extractAckStatusFromPayload(body, payload);
    const internalId = String(payload.id ?? body.id ?? '').trim();
    const uazapiInternalId = /^r[0-9a-f]{6,}$/i.test(internalId) ? internalId : null;

    const { data: existingSent } = await supabase
      .from('cliente_whatsapp_sent')
      .select('id')
      .eq('cliente_id', clienteId)
      .eq('message_id', String(messageId))
      .maybeSingle();

    if (!existingSent) {
      const { error: sentErr } = await supabase.from('cliente_whatsapp_sent').insert({
        cliente_id: clienteId,
        to_jid: chatJid !== 'unknown' ? chatJid : fromJid,
        chat_jid: chatJid !== 'unknown' ? chatJid : fromJid,
        whatsapp_config_id: config.id,
        conversation_id: conversationId,
        message_id: String(messageId),
        body: sentBody,
        ack_status: ackStatus || 'sent',
        uazapi_internal_id: uazapiInternalId,
      });
      if (sentErr) console.error('[uazapi-inbox-webhook] sent insert (fromMe) error', sentErr);
    }
    if (!isGroup && chatJid && chatJid !== 'unknown') {
      const labels = extractChatLabelsFromPayload(body, payload, chat);
      void applyRastreamentoConversionFromWebhook({
        supabase,
        supabaseUrl,
        serviceKey: supabaseServiceKey,
        clienteId,
        contactJid: chatJid,
        whatsappConfigId: config.id,
        phone: phoneFinal || null,
        messageText: bodyText || '',
        labels,
        fromMe: true,
        isGroup: false,
      }).catch((err) => console.error('[uazapi-inbox-webhook] conversion_rule fromMe failed', err?.message));
    }
  } else {
    const { error: insertError } = await supabase.from('cliente_whatsapp_inbox').upsert(
      {
        cliente_id: clienteId,
        message_id: String(messageId),
        from_jid: fromJid,
        chat_jid: chatJid !== 'unknown' ? chatJid : fromJid,
        sender_jid: senderJid || null,
        whatsapp_config_id: config.id,
        conversation_id: conversationId,
        sender_name: inboxSenderName || null,
        msg_timestamp: ts,
        type,
        body: bodyText || (type !== 'text' ? `[${type}]` : null),
        is_group: isGroup,
        group_name: groupName || null,
        phone: (isGroup ? participantPhoneDigits : phoneFinal) || null,
        profile_pic_url: (inboxProfilePicUrl && String(inboxProfilePicUrl).trim()) || null,
        raw_payload: body,
      },
      { onConflict: 'cliente_id,message_id' }
    );

    if (insertError) {
      console.error('[uazapi-inbox-webhook] Insert error', insertError);
      await supabase.from('cliente_whatsapp_webhook_log').insert({
        cliente_id: clienteId,
        status: 'error',
        source: 'uazapi',
        from_jid: fromJid && fromJid !== 'unknown' ? fromJid : null,
        type: type || null,
        body_preview: bodyPreview || null,
        body_keys: bodyKeys.length ? bodyKeys : null,
        error_message: insertError.message,
        raw_payload: body,
      });
      return new Response(JSON.stringify({ error: insertError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }

  const contactJid = isGroup
    ? (fromMe ? null : (senderJid && senderJid !== 'unknown' ? senderJid : null))
    : jidParaContatoLoja({ chatJid, fromJid });
  if (contactJid) {
    const tracking = extractTrackingFromPayload(body, payload, chat);
    if (leadName && String(leadName).trim() && tracking.tracking_data) {
      (tracking.tracking_data as Record<string, unknown>).lead_name = String(leadName).trim();
    } else if (leadName && String(leadName).trim()) {
      tracking.tracking_data = { lead_name: String(leadName).trim() };
    }

    // Link rastreável Planeje: casa código PJ-XXXXXX na 1ª mensagem (não sobrescreve CTWA).
    const matchCode = fromMe ? '' : extractMatchCode(bodyText);
    if (matchCode && !hasCtwaTrackingSignal(tracking.tracking_data as Record<string, unknown> | null)) {
      try {
        const matched = await claimTrackableClickMatch(supabase, {
          matchCode,
          clienteId,
          fromJid: contactJid,
        });
        if (matched) {
          tracking.origin_source = matched.origin_resolved;
          tracking.utm_source = matched.utm_source ?? tracking.utm_source;
          tracking.utm_medium = matched.utm_medium ?? tracking.utm_medium;
          tracking.utm_campaign = matched.utm_campaign ?? tracking.utm_campaign;
          tracking.utm_content = matched.utm_content ?? tracking.utm_content;
          tracking.utm_term = matched.utm_term ?? tracking.utm_term;
          tracking.tracking_data = trackingFromMatchedClick(
            matched,
            tracking.tracking_data as Record<string, unknown> | null,
          );
        }
      } catch (e) {
        console.error('[uazapi-inbox-webhook] trackable link match failed', e);
      }
    }

    const now = new Date().toISOString();
    const contactName = isGroup
      ? (participantDisplayName || (leadName && String(leadName).trim()) || null)
      : ((nameRaw && String(nameRaw).trim()) || (leadName && String(leadName).trim()) || null);

    const { data: existingContact } = await supabase
      .from('cliente_whatsapp_contact')
      .select('id, tracking_data, origin_source, utm_source, utm_medium, utm_campaign, utm_content, utm_term, first_seen_at, last_message_at, sender_name')
      .eq('cliente_id', clienteId)
      .eq('from_jid', contactJid)
      .maybeSingle();

    const tMs = new Date(ts).getTime();
    const prevFirst = existingContact?.first_seen_at ? new Date(existingContact.first_seen_at).getTime() : null;
    const prevLast = existingContact?.last_message_at ? new Date(existingContact.last_message_at).getTime() : null;
    const firstSeenIso = new Date(prevFirst == null ? tMs : Math.min(prevFirst, tMs)).toISOString();
    const lastSeenIso = new Date(prevLast == null ? tMs : Math.max(prevLast, tMs)).toISOString();

    const existingHasTracking = hasStoredContactAttribution(existingContact);
    if (!matchCode && !fromMe && !isGroup && !hasStoredContactAttribution(tracking)) {
      try {
        const matched = await lookupInitialMessageLink(supabase, { message: bodyText, clienteId,
          whatsappConfigId: config.id, ownerPhone: tracking.tracking_data?.owner_phone });
        if (matched) {
          tracking.origin_source = matched.default_origin;
          tracking.tracking_data = trackingFromInitialMessageLink(matched, tracking.tracking_data, { messageId });
          for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'] as const) {
            tracking[key] = matched[`default_${key}`] || null;
          }
        }
      } catch (error) { console.error('[uazapi-inbox-webhook] initial message attribution failed', error); }
    }
    const existingRaw = existingContact?.tracking_data as Record<string, unknown> | undefined;
    // Mesmo formato do "Importar como contato": tracking_data plano (sem events_by_date), preservando meta_ad_details do existente se houver
    let finalTracking = (() => {
      if (existingHasTracking) return existingRaw ?? null;
      const flat = tracking.tracking_data as Record<string, unknown> | null | undefined;
      if (existingRaw?.meta_ad_details || existingRaw?.meta_ad_details_history) {
        return { ...(flat || {}), meta_ad_details: existingRaw.meta_ad_details, meta_ad_details_history: existingRaw.meta_ad_details_history };
      }
      return mergeContactAttributionMetadata(existingContact, flat);
    })();
    const contactProfilePic = ((isGroup ? inboxProfilePicUrl : profilePicUrl) && String(isGroup ? inboxProfilePicUrl : profilePicUrl).trim()) || null;
    const trackingWithThumb = await attachStoredThumbnail(supabase, finalTracking as Record<string, unknown> | null, supabaseUrl);
    const { data: upsertedContact, error: contactError } = await persistIngressContactAttribution(supabase, {
      clienteId,fromJid:contactJid,contact:{
        cliente_id: clienteId,
        from_jid: contactJid,
        phone: (isGroup ? participantPhoneDigits : phoneFinal) || null,
        sender_name: (existingContact?.sender_name || contactName) || null,
        sender_name_is_fallback:true,
        ...tracking,
        tracking_data: existingHasTracking ? tracking.tracking_data : trackingWithThumb,
        profile_pic_url: contactProfilePic,
        instance_name: instanceName,
        whatsapp_config_id: config.id,
        first_seen_at: firstSeenIso,
        last_message_at: lastSeenIso,
        updated_at: now,
      },evidences:[attributionEvidence({source:'uazapi',messageId:messageId.startsWith(chatJid+'_')?null:messageId,
        messageAt:payload.messageTimestamp ?? payload.timestamp ?? body.messageTimestamp ?? body.timestamp,
        receivedAt:now,tracking,fromMe,isGroup})],
    });
    if (contactError || !upsertedContact) {
      console.error('[uazapi-inbox-webhook] contact history persistence failed',contactError?.code || 'database');
      return new Response(JSON.stringify({error:'Não foi possível registrar o contato e seu histórico.'}),{status:500,headers:{...corsHeaders,'Content-Type':'application/json'}});
    }
    finalTracking = upsertedContact.tracking_data;
    // #region agent log
    if (contactError) console.error('[uazapi-inbox-webhook] DEBUG contact upsert error', JSON.stringify({ message: contactError.message, code: contactError.code, details: contactError.details }));
    else console.log('[uazapi-inbox-webhook] DEBUG contact upsert OK', JSON.stringify({ fromJid: fromJid?.slice(0, 50), clienteId }));
    // #endregion
    if (contactError) console.error('[uazapi-inbox-webhook] Contact upsert error', contactError);
    else {
      const lojaContactId = upsertedContact?.id || existingContact?.id || null;
      if (lojaContactId) {
        try {
          await ensureLojaAtendConversa({
            supabase,
            clienteId,
            contactId: lojaContactId,
            fromMe,
            messageId: String(messageId),
            whatsappConfigId: config.id,
            sentByApi: payload.wasSentByApi === true || body.wasSentByApi === true,
          });
        } catch (err) {
          console.error('[uazapi-inbox-webhook] conversa loja', err instanceof Error ? err.message : err);
        }
      }
      // Automação: novo contato -> funil (create-lead-from-contact com service role)
      if (!fromMe) try {
        const fnUrl = `${supabaseUrl}/functions/v1/create-lead-from-contact`;
        const res = await fetch(fnUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({
            cliente_id: clienteId,
            from_jid: contactJid,
            phone: phoneFinal || null,
            sender_name: contactName || null,
            profile_pic_url: contactProfilePic || null,
          }),
        });
        const result = await res.json().catch(() => ({}));
        if (result?.created) console.log('[uazapi-inbox-webhook] Lead criado por automação', result.lead_id);
      } catch (e) {
        console.error('[uazapi-inbox-webhook] create-lead-from-contact call failed', e);
      }
      if (!fromMe) {
        const labels = extractChatLabelsFromPayload(body, payload, chat);
        void applyRastreamentoConversionFromWebhook({
          supabase,
          supabaseUrl,
          serviceKey: supabaseServiceKey,
          clienteId,
          contactJid,
          whatsappConfigId: config.id,
          phone: (isGroup ? participantPhoneDigits : phoneFinal) || null,
          messageText: bodyText || '',
          labels,
          tracking: finalTracking as Record<string, unknown> | null,
          fromMe: false,
          isGroup,
        }).catch((err) => console.error('[uazapi-inbox-webhook] conversion_rule invoke failed', err?.message));
      }
    }
  } else {
    console.log('[uazapi-inbox-webhook] Contato não criado: fromJid ausente ou unknown. body_keys:', bodyKeys.slice(0, 20));
  }

  // #region agent log
  debugLog('uazapi-inbox-webhook/index.ts:webhook_log', 'webhook_before_insert_log', { cliente_id: logRow.cliente_id, source: logRow.source }, 'H5');
  // #endregion
  const { data: insertedRow, error: webhookLogError } = await supabase
    .from('cliente_whatsapp_webhook_log')
    .insert(logRow)
    .select('id, cliente_id')
    .single();
  // #region agent log
  debugLog('uazapi-inbox-webhook/index.ts:webhook_log', 'webhook_log_insert_result', {
    success: !webhookLogError,
    cliente_id: clienteId,
    inserted_id: insertedRow?.id ?? null,
    inserted_cliente_id: insertedRow?.cliente_id ?? null,
    error: webhookLogError?.message ?? null,
    code: webhookLogError?.code ?? null,
  }, 'H5');
  // #endregion
  if (webhookLogError) {
    console.error('[uazapi-inbox-webhook] cliente_whatsapp_webhook_log insert failed', webhookLogError);
    return new Response(JSON.stringify({ error: webhookLogError.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Encaminhar evento para CRM-Apice (Integrações > Webhook Genérico) quando configurado
  try {
    const { data: forwards, error: forwardConfigError } = await supabase
      .from('cliente_crm_apice_forward')
      .select('webhook_url')
      .eq('cliente_id', clienteId)
      .eq('enabled', true);
    if (forwardConfigError) {
      console.error('[uazapi-inbox-webhook] cliente_crm_apice_forward read error', forwardConfigError.message);
    }
    if (!forwards?.length) {
      if (!forwardConfigError) console.log('[uazapi-inbox-webhook] Nenhum encaminhamento ativo para cliente_id=', clienteId, '- Em Canais ative "Ativar encaminhamento" e clique Salvar.');
    } else {
      console.log('[uazapi-inbox-webhook] Encaminhando para CRM-Apice, URLs=', forwards.length);
      const trackingForForward = extractTrackingFromPayload(body, payload, chat);
      const payload = {
        event_type: 'planeje_whatsapp',
        payload: {
          source: 'uazapi',
          from_jid: logRow.from_jid,
          phone: phoneFinal || null,
          sender_name: inboxSenderName || displayName || null,
          body_preview: logRow.body_preview,
          type: logRow.type,
          created_at: new Date().toISOString(),
          webhook_log_id: insertedRow?.id,
          profile_pic_url: (profilePicUrl && String(profilePicUrl).trim()) || null,
          imagePreview: (profilePicUrl && String(profilePicUrl).trim()) || null,
          origin_source: trackingForForward.origin_source,
          tracking_data: trackingForForward.tracking_data || null,
          raw_payload: body,
        },
      };
      const forwardPromises: Promise<void>[] = [];
      for (const row of forwards) {
        const url = row?.webhook_url?.trim();
        if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
          forwardPromises.push(
            fetch(url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
            })
              .then(async (res) => {
                if (res.ok) {
                  console.log('[uazapi-inbox-webhook] forward to CRM-Apice OK', res.status);
                } else {
                  const text = await res.text().catch(() => '');
                  console.error('[uazapi-inbox-webhook] forward to CRM-Apice ERRO', res.status, url.slice(0, 60), text.slice(0, 200));
                }
              })
              .catch((e) => console.error('[uazapi-inbox-webhook] forward to CRM-Apice fetch failed', url.slice(0, 60), e?.message))
          );
        }
      }
      if (forwardPromises.length) await Promise.race([Promise.all(forwardPromises), new Promise((r) => setTimeout(r, 8000))]);
    }
  } catch (e) {
    console.error('[uazapi-inbox-webhook] cliente_crm_apice_forward read or forward failed', e);
  }

  try {
    await runMiniCrmMessage({ supabase, clienteId, jid: contactJid,
      event: { messageId: String(messageId), channel: config.id, fromMe, isGroup, text: bodyText || '', type, at: ts } });
  } catch (error) { console.error('[mini-crm-message] webhook rule failed', error instanceof Error ? error.message : 'database'); }

  // Grupo: analisar com IA se cliente aguarda resposta (fire-and-forget)
  if (isGroup && !fromMe && conversationId) {
    try {
      fetch(`${supabaseUrl}/functions/v1/atendimento-group-analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${supabaseServiceKey}`,
        },
        body: JSON.stringify({
          conversation_id: conversationId,
          cliente_id: clienteId,
          chat_jid: chatJid !== 'unknown' ? chatJid : fromJid,
          message_id: String(messageId),
          message_body: bodyText || (type !== 'text' ? `[${type}]` : ''),
          message_type: type || '',
          sender_name: inboxSenderName || participantDisplayName || null,
          sender_jid: senderJid || contactJid || null,
          sender_phone: isGroup ? participantPhoneDigits || null : phoneFinal || null,
          message_at: ts,
        }),
      }).catch((err) => console.error('[uazapi-inbox-webhook] atendimento-group-analyze failed', err));
    } catch (e) {
      console.error('[uazapi-inbox-webhook] atendimento-group-analyze invoke error', e);
    }
  }

  if (!fromMe) {
    try {
      // Aguarda de verdade: neste edge self-hosted o waitUntil do worker some com o pedido
      // e a IA morre em silêncio (sem log e sem envio). Falha da IA não derruba o 200 do webhook.
      await maybeLojaIaAutoReply({
        supabase,
        supabaseUrl,
        serviceKey: supabaseServiceKey,
        clienteId,
        contactJid: isGroup ? null : (fromJid !== 'unknown' ? fromJid : null),
        isGroup,
        fromMe,
        bodyText: bodyText || '',
        whatsappConfigId: config.id,
        messageId: String(messageId),
      });
    } catch (err) {
      console.error('[uazapi-inbox-webhook] loja IA auto', err instanceof Error ? err.message : err);
    }
  }

  console.log('[uazapi-inbox-webhook] EVENTO_GRAVADO cliente_id=', clienteId, 'log_id=', insertedRow?.id, '— Se o cliente não vê na tela, a URL do webhook na uazapi deve usar esse cliente_id.');
  return new Response(JSON.stringify({ success: true }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});

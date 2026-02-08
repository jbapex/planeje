/**
 * Webhook para receber todos os eventos do Apicebot (compatível com Apice CRM).
 * - Todo POST é registrado em cliente_whatsapp_webhook_log.
 * - Quando o evento tiver remetente + texto, também grava na Caixa de entrada (inbox).
 *
 * Autenticação (qualquer um dos modos):
 * 1) URL: ?cliente_id=UUID&secret=SECRET (secret na query)
 * 2) URL: ?cliente_id=UUID + header Authorization: Bearer SECRET
 * 3) Só header Authorization: Bearer SECRET (cliente resolvido pelo secret)
 *
 * Formatos de payload aceitos:
 * - Simples: { from, message/text/body, name, id, timestamp }
 * - Aninhado: { data: { from, message, ... } } ou { message: { from, body/text }, contact: { wa_id, name } }
 * - Meta/WhatsApp Cloud: entry[0].changes[0].value.messages[0] (from, text.body, type) e value.contacts[0].wa_id
 * - Vários nomes de campo: from, phone, number, sender, remoteJid, chatId; message, text, body, content; event, type, eventType.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function getStr(obj: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = obj?.[k];
    if (v != null && typeof v === 'string' && v.trim()) return v.trim();
    if (v != null && typeof v === 'number') return String(v);
  }
  return '';
}

function extractPhoneFromJid(jid: string): string {
  if (!jid || typeof jid !== 'string') return '';
  return jid.replace(/@.*$/, '').replace(/\D/g, '') || jid.trim();
}

type TrackingResult = {
  origin_source: 'meta_ads' | 'nao_identificado';
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  tracking_data: Record<string, unknown> | null;
};

function extractTrackingFromPayload(body: Record<string, unknown>): TrackingResult {
  const getVal = (obj: Record<string, unknown> | null, ...keys: string[]): string | null => {
    if (!obj || typeof obj !== 'object') return null;
    for (const k of keys) {
      const v = obj[k];
      if (v != null && typeof v === 'string' && String(v).trim()) return String(v).trim();
      if (v != null && typeof v === 'number') return String(v);
    }
    return null;
  };
  const payload = (body?.data && typeof body.data === 'object' ? body.data : body) as Record<string, unknown>;
  const chat = (body?.chat ?? payload?.chat) as Record<string, unknown> | undefined;
  const message = (body?.message ?? payload?.message) as Record<string, unknown> | undefined;
  const content = message?.content as Record<string, unknown> | undefined;
  const contextInfo = content?.contextInfo as Record<string, unknown> | undefined;
  const externalAdReply = contextInfo?.externalAdReply as Record<string, unknown> | undefined;
  const utm_source = getVal(body, 'utm_source', 'utm_source') ?? getVal(payload, 'utm_source') ?? (chat ? getVal(chat, 'utm_source') : null);
  const utm_medium = getVal(body, 'utm_medium') ?? getVal(payload, 'utm_medium') ?? (chat ? getVal(chat, 'utm_medium') : null);
  const utm_campaign = getVal(body, 'utm_campaign') ?? getVal(payload, 'utm_campaign') ?? (chat ? getVal(chat, 'utm_campaign') : null);
  const utm_content = getVal(body, 'utm_content') ?? getVal(payload, 'utm_content') ?? null;
  const utm_term = getVal(body, 'utm_term') ?? getVal(payload, 'utm_term') ?? null;
  const fbclid = getVal(body, 'fbclid', 'fbclid') ?? getVal(payload, 'fbclid') ?? (chat ? getVal(chat, 'fbclid') : null);
  const source_id = getVal(externalAdReply ?? null, 'sourceID', 'source_id', 'sourceId', 'source_Id') ?? getVal(body, 'sourceID', 'source_id', 'sourceId') ?? getVal(payload, 'sourceID', 'source_id', 'sourceId') ?? (chat ? getVal(chat, 'sourceID', 'source_id', 'sourceId') : null);
  const sourceApp = getVal(externalAdReply ?? null, 'sourceApp', 'source_app') ?? getVal(body, 'sourceApp', 'source_app') ?? getVal(payload, 'sourceApp', 'source_app') ?? (chat ? getVal(chat, 'sourceApp', 'source_app') : null);
  const ctwaClid = getVal(externalAdReply ?? null, 'ctwaClid', 'ctwa_clid') ?? getVal(body, 'ctwaClid', 'ctwa_clid') ?? getVal(payload, 'ctwaClid', 'ctwa_clid') ?? (chat ? getVal(chat, 'ctwaClid', 'ctwa_clid') : null);
  const conversionSource = getVal(contextInfo ?? null, 'conversionSource', 'conversion_source') ?? getVal(contextInfo ?? null, 'entryPointConversionExternalSource') ?? getVal(body, 'conversionSource', 'conversion_source') ?? getVal(payload, 'conversionSource', 'conversion_source') ?? (chat ? getVal(chat, 'conversionSource', 'conversion_source') : null);
  const entryPointConversionExternalSource = getVal(contextInfo ?? null, 'entryPointConversionExternalSource') ?? getVal(body, 'entryPointConversionExternalSource') ?? getVal(payload, 'entryPointConversionExternalSource') ?? null;
  const sourceURL = getVal(externalAdReply ?? null, 'sourceURL', 'source_url') ?? getVal(body, 'sourceURL', 'source_url') ?? getVal(payload, 'sourceURL', 'source_url') ?? null;
  const thumbnailURL = getVal(externalAdReply ?? null, 'thumbnailURL', 'thumbnail_url') ?? getVal(body, 'thumbnailURL', 'thumbnail_url') ?? getVal(payload, 'thumbnailURL', 'thumbnail_url') ?? null;
  const metaIndicators = ['facebook', 'meta', 'fb', 'meta_ads', 'meta ads', 'facebook_ads', 'fb_ads'];
  const utmIsMeta = utm_source && metaIndicators.some((m) => utm_source.toLowerCase().includes(m));
  const conversionSourceIsMeta = conversionSource && metaIndicators.some((m) => conversionSource.toLowerCase().includes(m));
  const origin_source: 'meta_ads' | 'nao_identificado' = utmIsMeta || !!fbclid || !!source_id || !!sourceApp || !!ctwaClid || conversionSourceIsMeta ? 'meta_ads' : 'nao_identificado';
  const tracking_data: Record<string, unknown> = {};
  if (utm_source) tracking_data.utm_source = utm_source;
  if (utm_medium) tracking_data.utm_medium = utm_medium;
  if (utm_campaign) tracking_data.utm_campaign = utm_campaign;
  if (utm_content) tracking_data.utm_content = utm_content;
  if (utm_term) tracking_data.utm_term = utm_term;
  if (fbclid) tracking_data.fbclid = fbclid;
  if (source_id) tracking_data.source_id = source_id;
  if (sourceApp) tracking_data.sourceApp = sourceApp;
  if (ctwaClid) tracking_data.ctwaClid = ctwaClid;
  if (conversionSource) tracking_data.conversionSource = conversionSource;
  if (entryPointConversionExternalSource) tracking_data.entryPointConversionExternalSource = entryPointConversionExternalSource;
  if (sourceURL) tracking_data.sourceURL = sourceURL;
  if (thumbnailURL) tracking_data.thumbnailURL = thumbnailURL;
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

serve(async (req) => {
  const url = new URL(req.url);
  console.log('[apicebot-inbox-webhook] Requisição:', req.method, url.pathname);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method === 'GET') {
    return new Response(
      JSON.stringify({ ok: true, message: 'Webhook Apicebot ativo. Use POST para enviar mensagens para a Caixa de entrada do CRM.' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
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

  const queryClienteId = url.searchParams.get('cliente_id');
  const userId = url.searchParams.get('user_id');
  const secretFromQuery = url.searchParams.get('secret');
  const authHeader = req.headers.get('Authorization');
  const secretFromBearer = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  const secret = secretFromQuery || secretFromBearer || null;

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  let clienteId: string | null = queryClienteId;

  if (userId && !queryClienteId) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('cliente_id')
      .eq('id', userId)
      .not('cliente_id', 'is', null)
      .limit(1)
      .single();
    if (profile?.cliente_id) clienteId = profile.cliente_id;
  }

  // Se o sistema externo (ex.: Apicebot) chama só com Bearer e não envia cliente_id na URL, resolve cliente pelo secret
  if (!clienteId && secret) {
    const { data: configBySecret, error: errSecret } = await supabase
      .from('cliente_whatsapp_config')
      .select('cliente_id, webhook_secret')
      .eq('webhook_secret', secret)
      .not('webhook_secret', 'is', null);
    if (!errSecret && configBySecret?.length === 1 && configBySecret[0].webhook_secret === secret) {
      clienteId = configBySecret[0].cliente_id;
    }
  }

  if (!clienteId || !secret) {
    return new Response(
      JSON.stringify({
        error: 'Use cliente_id e secret na URL, ou user_id na URL + header Authorization: Bearer <webhook_secret>, ou apenas Authorization: Bearer <webhook_secret> (o cliente é resolvido pelo secret).',
      }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const { data: config, error: configError } = await supabase
    .from('cliente_whatsapp_config')
    .select('webhook_secret')
    .eq('cliente_id', clienteId)
    .eq('webhook_secret', secret)
    .maybeSingle();

  if (configError || !config?.webhook_secret) {
    return new Response(JSON.stringify({ error: 'Secret inválido' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let body: Record<string, unknown>;
  try {
    const raw = await req.json();
    body = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  } catch {
    await supabase.from('cliente_whatsapp_webhook_log').insert({
      cliente_id: clienteId,
      status: 'error',
      source: 'apicebot',
      error_message: 'Body JSON inválido (Apicebot enviou corpo que não é JSON válido)',
      raw_payload: null,
    });
    return new Response(JSON.stringify({ error: 'Body JSON inválido' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const payload = (body.data && typeof body.data === 'object' ? body.data : body) as Record<string, unknown>;
  const contact = (body.contact && typeof body.contact === 'object' ? body.contact : payload?.contact) as Record<string, unknown> | undefined;
  const msgObj = (body.message && typeof body.message === 'object' ? body.message : payload?.message) as Record<string, unknown> | undefined;

  // Formato Meta/WhatsApp Cloud API: entry[0].changes[0].value.messages[0] e value.contacts[0]
  const entry = Array.isArray(body.entry) ? body.entry[0] : null;
  const change = entry && typeof entry === 'object' && Array.isArray((entry as Record<string, unknown>).changes)
    ? (entry as Record<string, unknown>).changes[0] : null;
  const value = change && typeof change === 'object' ? (change as Record<string, unknown>).value as Record<string, unknown> | undefined : null;
  const metaMessages = value && Array.isArray(value.messages) ? value.messages : [];
  const metaMsg = metaMessages[0] && typeof metaMessages[0] === 'object' ? metaMessages[0] as Record<string, unknown> : null;
  const metaContacts = value && Array.isArray(value.contacts) ? value.contacts : [];
  const metaContact = metaContacts[0] && typeof metaContacts[0] === 'object' ? metaContacts[0] as Record<string, unknown> : null;
  const metaText = metaMsg?.text && typeof metaMsg.text === 'object' ? (metaMsg.text as Record<string, unknown>).body : null;

  const eventType =
    getStr(body, 'event', 'type', 'eventType', 'event_type', 'action') ||
    getStr(payload, 'event', 'type', 'eventType', 'event_type', 'action') ||
    'event';

  const fromRaw =
    getStr(body, 'from', 'phone', 'number', 'sender', 'senderId', 'remoteJid', 'chatId', 'author', 'participant', 'phoneNumber', 'senderPhone') ||
    getStr(payload, 'from', 'phone', 'number', 'sender', 'senderId', 'remoteJid', 'chatId', 'author', 'participant', 'phoneNumber', 'senderPhone') ||
    (metaMsg ? getStr(metaMsg, 'from', 'sender', 'author') : '') ||
    (metaContact ? getStr(metaContact, 'wa_id', 'phone', 'number', 'id') : '') ||
    (contact ? getStr(contact, 'phone', 'number', 'wa_id', 'id') : '') ||
    (msgObj ? getStr(msgObj, 'from', 'sender', 'author', 'remoteJid', 'chatId') : '');
  const phone = extractPhoneFromJid(fromRaw) || (fromRaw && fromRaw.replace(/\D/g, '')) || fromRaw;
  const fromJid = fromRaw && fromRaw.includes('@') ? fromRaw : (phone ? `${phone}@s.whatsapp.net` : 'unknown');

  const bodyText =
    getStr(body, 'message', 'text', 'body', 'content', 'messageText') ||
    getStr(payload, 'message', 'text', 'body', 'content', 'messageText') ||
    (typeof metaText === 'string' ? metaText : (metaMsg ? getStr(metaMsg as Record<string, unknown>, 'body', 'text', 'content') : '')) ||
    (msgObj ? getStr(msgObj as Record<string, unknown>, 'body', 'text', 'content') : '');
  const name =
    getStr(body, 'name', 'pushName', 'senderName', 'contactName', 'notifyName') ||
    getStr(payload, 'name', 'pushName', 'senderName', 'contactName', 'notifyName') ||
    (metaContact && metaContact.profile && typeof metaContact.profile === 'object' ? getStr(metaContact.profile as Record<string, unknown>, 'name') : (metaContact ? getStr(metaContact, 'name', 'displayName', 'formattedName') : '')) ||
    (contact ? getStr(contact, 'name', 'displayName', 'formattedName') : '');
  const messageId =
    getStr(body, 'id', 'messageId') || getStr(payload, 'id', 'messageId') ||
    (metaMsg ? getStr(metaMsg as Record<string, unknown>, 'id', 'messageId') : '') ||
    `${fromJid}_${Date.now()}`;
  const tsRaw = body.timestamp ?? payload.timestamp ?? (metaMsg && (metaMsg as Record<string, unknown>).timestamp);
  const msgTimestamp = (() => {
    if (tsRaw == null) return new Date().toISOString();
    if (typeof tsRaw === 'number') return new Date(tsRaw * 1000).toISOString();
    const s = String(tsRaw).trim();
    if (/^\d+$/.test(s)) return new Date(parseInt(s, 10) * 1000).toISOString(); // Unix segundos (ex.: Meta)
    return new Date(s).toISOString();
  })();
  const profilePicUrl = getStr(body, 'profilePicUrl', 'image', 'avatar', 'pictureUrl') || getStr(payload, 'profilePicUrl', 'image', 'avatar', 'pictureUrl') || null;
  const isGroup = !!(body.isGroup ?? payload.isGroup ?? body.is_group ?? payload.is_group);
  const groupName = (body.groupName ?? payload.groupName ?? body.group_name ?? payload.group_name) as string | null;

  const bodyPreview =
    bodyText?.slice(0, 200) ||
    (eventType !== 'event' ? `${eventType}` : null) ||
    (Object.keys(body).length ? `Chaves: ${Object.keys(body).slice(0, 8).join(', ')}` : 'payload');

  // Sempre registrar todo evento no log (para aparecer no card "Webhook Apicebot")
  await supabase.from('cliente_whatsapp_webhook_log').insert({
    cliente_id: clienteId,
    status: 'ok',
    source: 'apicebot',
    from_jid: fromJid !== 'unknown' ? fromJid : null,
    type: eventType,
    body_preview: bodyPreview,
    body_keys: Object.keys(body).length ? Object.keys(body) : null,
    error_message: null,
    raw_payload: body,
  });

  // Só gravar na Caixa de entrada quando for mensagem com remetente
  if (fromJid && fromJid !== 'unknown') {
    const senderName = name || phone || null;
    const { error: insertError } = await supabase.from('cliente_whatsapp_inbox').upsert(
      {
        cliente_id: clienteId,
        message_id: String(messageId),
        from_jid: fromJid,
        sender_name: senderName || null,
        msg_timestamp: msgTimestamp,
        type: 'text',
        body: bodyText || null,
        is_group: isGroup || false,
        group_name: groupName || null,
        phone: phone || null,
        profile_pic_url: profilePicUrl || null,
        raw_payload: body,
      },
      { onConflict: 'cliente_id,message_id' }
    );
    if (insertError) {
      console.error('[apicebot-inbox-webhook] Inbox insert error', insertError);
    } else {
      console.log('[apicebot-inbox-webhook] Evento registrado + mensagem na inbox:', eventType, fromJid, bodyText?.slice(0, 50));
    }
    // Contato: identificar origem (Meta Ads ou não identificado) e upsert; preservar tracking existente se o contato já tiver dados
    const tracking = extractTrackingFromPayload(body);
    const now = new Date().toISOString();

    const { data: existingContact } = await supabase
      .from('cliente_whatsapp_contact')
      .select('tracking_data, origin_source, utm_source, utm_medium, utm_campaign, utm_content, utm_term')
      .eq('cliente_id', clienteId)
      .eq('from_jid', fromJid)
      .maybeSingle();

    const existingHasTracking = existingContact?.tracking_data && typeof existingContact.tracking_data === 'object' && Object.keys(existingContact.tracking_data as object).length > 0;
    const existingRaw = existingContact?.tracking_data as Record<string, unknown> | undefined;
    const existingEvents = Array.isArray(existingRaw?.events_by_date) ? existingRaw.events_by_date as Record<string, unknown>[] : [];
    const newEventEntry =
      tracking.origin_source === 'meta_ads' && tracking.tracking_data
        ? { received_at: msgTimestamp, ...(tracking.tracking_data as Record<string, unknown>) }
        : null;
    const updatedEventsByDate = newEventEntry ? [...existingEvents, newEventEntry].slice(-50) : existingEvents;

    const finalTracking = (() => {
      if (existingHasTracking) {
        const out = { ...(existingRaw || {}) };
        out.events_by_date = updatedEventsByDate;
        return out;
      }
      if (tracking.tracking_data) {
        return { ...(tracking.tracking_data as Record<string, unknown>), events_by_date: newEventEntry ? [newEventEntry] : [] };
      }
      return updatedEventsByDate.length > 0 ? { events_by_date: updatedEventsByDate } : null;
    })();
    const finalOrigin = existingHasTracking ? (existingContact!.origin_source ?? tracking.origin_source) : tracking.origin_source;
    const finalUtm = existingHasTracking
      ? {
          utm_source: existingContact!.utm_source ?? tracking.utm_source,
          utm_medium: existingContact!.utm_medium ?? tracking.utm_medium,
          utm_campaign: existingContact!.utm_campaign ?? tracking.utm_campaign,
          utm_content: existingContact!.utm_content ?? tracking.utm_content,
          utm_term: existingContact!.utm_term ?? tracking.utm_term,
        }
      : { utm_source: tracking.utm_source, utm_medium: tracking.utm_medium, utm_campaign: tracking.utm_campaign, utm_content: tracking.utm_content, utm_term: tracking.utm_term };

    const { error: contactError } = await supabase.from('cliente_whatsapp_contact').upsert(
      {
        cliente_id: clienteId,
        from_jid: fromJid,
        phone: phone || null,
        sender_name: senderName || null,
        origin_source: finalOrigin,
        utm_source: finalUtm.utm_source,
        utm_medium: finalUtm.utm_medium,
        utm_campaign: finalUtm.utm_campaign,
        utm_content: finalUtm.utm_content,
        utm_term: finalUtm.utm_term,
        tracking_data: finalTracking,
        last_message_at: msgTimestamp,
        updated_at: now,
      },
      { onConflict: 'cliente_id,from_jid', updateColumns: ['phone', 'sender_name', 'origin_source', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'tracking_data', 'last_message_at', 'updated_at'] }
    );
    if (contactError) console.error('[apicebot-inbox-webhook] Contact upsert error', contactError);
  } else {
    console.log('[apicebot-inbox-webhook] Evento registrado (sem remetente):', eventType, Object.keys(body));
  }

  return new Response(
    JSON.stringify({ success: true, event: eventType, received: true }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
});

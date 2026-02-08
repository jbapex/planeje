/**
 * Webhook para receber mensagens da uazapi (Caixa de entrada).
 * Configure na uazapi a URL: POST https://<seu-projeto>.supabase.co/functions/v1/uazapi-inbox-webhook?cliente_id=UUID&secret=SECRET
 * O secret deve ser o mesmo configurado no CRM (aba Canais → Webhook).
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type TrackingResult = {
  origin_source: 'meta_ads' | 'nao_identificado';
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
  const source_id = getVal(externalAdReply, 'sourceID', 'source_id', 'sourceId') ?? getVal(body, 'sourceID', 'source_id', 'sourceId') ?? getVal(payload, 'sourceID', 'source_id', 'sourceId') ?? (chat ? getVal(chat, 'sourceID', 'source_id', 'sourceId') : null);
  const sourceApp = getVal(externalAdReply, 'sourceApp', 'source_app') ?? getVal(body, 'sourceApp', 'source_app') ?? getVal(payload, 'sourceApp', 'source_app') ?? (chat ? getVal(chat, 'sourceApp', 'source_app') : null);
  const ctwaClid = getVal(externalAdReply, 'ctwaClid', 'ctwa_clid') ?? getVal(body, 'ctwaClid', 'ctwa_clid') ?? getVal(payload, 'ctwaClid', 'ctwa_clid') ?? (chat ? getVal(chat, 'ctwaClid', 'ctwa_clid') : null);
  const conversionSource = getVal(contextInfo, 'conversionSource', 'conversion_source') ?? getVal(contextInfo, 'entryPointConversionExternalSource') ?? getVal(body, 'conversionSource', 'conversion_source') ?? getVal(payload, 'conversionSource', 'conversion_source') ?? (chat ? getVal(chat, 'conversionSource', 'conversion_source') : null);
  const entryPointConversionExternalSource = getVal(contextInfo, 'entryPointConversionExternalSource') ?? getVal(body, 'entryPointConversionExternalSource') ?? getVal(payload, 'entryPointConversionExternalSource') ?? null;
  const sourceURL = getVal(externalAdReply, 'sourceURL', 'source_url') ?? getVal(body, 'sourceURL', 'source_url') ?? getVal(payload, 'sourceURL', 'source_url') ?? null;
  const thumbnailURL = getVal(externalAdReply, 'thumbnailURL', 'thumbnail_url') ?? getVal(body, 'thumbnailURL', 'thumbnail_url') ?? getVal(payload, 'thumbnailURL', 'thumbnail_url') ?? null;
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

serve(async (req) => {
  const url = new URL(req.url);
  console.log('[uazapi-inbox-webhook] Requisição:', req.method, url.pathname, 'query:', { cliente_id: url.searchParams.get('cliente_id'), has_secret: !!url.searchParams.get('secret') });

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
    console.log('[uazapi-inbox-webhook] DEBUG auth failed', JSON.stringify({ configError: configError?.message, hasSecret: !!config?.webhook_secret, clienteId }));
    // #endregion
    return new Response(JSON.stringify({ error: 'Secret inválido' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  // #region agent log
  console.log('[uazapi-inbox-webhook] DEBUG auth OK, parsing body', JSON.stringify({ clienteId }));
  // #endregion

  let body: Record<string, unknown>;
  try {
    const raw = await req.json();
    body = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  } catch {
    console.log('[uazapi-inbox-webhook] Body não é JSON válido ou está vazio');
    return new Response(JSON.stringify({ error: 'Body JSON inválido' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
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
    }
    return '';
  };

  const fromRaw =
    getStr(chat as Record<string, unknown>, 'wa_chatid', 'id', 'phone') ||
    getStr(payload, 'from', 'remoteJid', 'chatId', 'chatid', 'sender_pn', 'author', 'participant', 'sender', 'senderId', 'phoneNumber', 'senderPhone', 'wa_id', 'owner') ||
    getStr(keyObj, 'remoteJid', 'from') ||
    getStr(body, 'from', 'chatid', 'sender_pn', 'sender', 'senderId', 'owner') ||
    getStr((body.data as Record<string, unknown>) || {}, 'from', 'sender', 'remoteJid') ||
    getStr((body.message as Record<string, unknown>) || {}, 'from', 'sender') ||
    getStr((body.message as Record<string, unknown>)?.key as Record<string, unknown>, 'remoteJid', 'from') ||
    '';
  const from = typeof fromRaw === 'string' ? fromRaw.trim() : '';

  const extractPhoneFromJid = (jid: string) => {
    if (!jid || typeof jid !== 'string') return '';
    return jid.replace(/@.*$/, '').trim();
  };

  const phoneFromJid = extractPhoneFromJid(from);
  const phoneRawVal = chat?.owner ?? chat?.phone ?? payload.owner ?? payload.phone ?? payload.number ?? phoneFromJid ?? '';
  const phoneRaw = phoneRawVal != null && typeof phoneRawVal === 'number' ? String(phoneRawVal) : (typeof phoneRawVal === 'string' ? phoneRawVal : '');
  let phoneFinal = (typeof phoneRaw === 'string' && phoneRaw.trim() ? phoneRaw.trim() : '') || phoneFromJid || '';
  if (!phoneFinal && body && typeof body === 'object') {
    const ownerStr = getStr(body, 'owner') || getStr(payload, 'owner', 'phone', 'number');
    if (ownerStr) phoneFinal = ownerStr.replace(/\D/g, '').length >= 10 ? ownerStr.replace(/\D/g, '') : ownerStr;
  }
  let fromJid = (from && from !== 'unknown')
    ? (from.includes('@') ? from : `${extractPhoneFromJid(from) || from}@s.whatsapp.net`)
    : (phoneFinal ? `${phoneFinal.replace(/@.*$/, '')}@s.whatsapp.net` : 'unknown');

  // Fallback: se fromJid ainda é unknown, procurar em todo o body por JID ou número (mesma lógica do "Importar como contato" no frontend)
  let fallbackUsed = false;
  if (fromJid === 'unknown' && body && typeof body === 'object') {
    const found = findJidOrPhoneInObject(body);
    if (found) {
      fromJid = found.includes('@') ? found : `${found.replace(/\D/g, '')}@s.whatsapp.net`;
      if (!phoneFinal) phoneFinal = extractPhoneFromJid(fromJid);
      fallbackUsed = true;
    }
  }
  // #region agent log
  console.log('[uazapi-inbox-webhook] DEBUG extraction', JSON.stringify({ fromRaw: fromRaw?.slice(0, 80), from, fromJid: fromJid?.slice(0, 80), phoneFinal: phoneFinal?.slice(0, 30), fallbackUsed, bodyKeys: bodyKeys.slice(0, 25), willRunContactBlock: !!(fromJid && fromJid !== 'unknown') }));
  // #endregion

  const bodyText = (payload.body ?? payload.text ?? payload.content ?? body.body ?? body.text ?? '') as string;
  const type = (payload.type ?? body.type ?? 'text') as string;
  const bodyPreview = typeof bodyText === 'string' ? bodyText.slice(0, 200) : '';

  const leadName = (chat?.lead_name ?? body?.lead_name ?? payload?.lead_name ?? chat?.leadName ?? body?.leadName ?? payload?.leadName ?? '') as string;
  const nameRaw = (leadName && String(leadName).trim()) || (chat?.name ?? chat?.wa_name ?? payload.notifyName ?? payload.pushName ?? payload.senderName ?? payload.contactName ?? payload.name ?? payload.verifiedName ?? body.notifyName ?? body.pushName ?? body.name ?? body.senderName ?? '') as string;
  const profilePicUrl = (chat?.imagePreview ?? chat?.image ?? chat?.pictureUrl ?? payload.imagePreview ?? payload.image ?? payload.pictureUrl ?? payload.profilePictureUrl ?? payload.avatar ?? '') as string;

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

  const messageId = (payload.id ?? (payload.key as Record<string, unknown>)?.id ?? payload.messageId ?? body.id ?? chat?.id ?? `${from}_${Date.now()}`) as string;
  const name = (nameRaw && String(nameRaw).trim()) || phoneFinal || phoneFromJid || (from && from !== 'unknown' ? from : null);
  const isGroup = !!(chat?.wa_isGroup ?? payload.isGroup ?? payload.is_group ?? body.isGroup ?? body.is_group);
  const groupName = (chat?.name ?? chat?.wa_name ?? payload.groupName ?? payload.subject ?? body.groupName ?? null) as string | null;
  const ts = (payload.timestamp ?? body.timestamp)
    ? new Date(((payload.timestamp ?? body.timestamp) as number) * 1000).toISOString()
    : new Date().toISOString();

  const { error: insertError } = await supabase.from('cliente_whatsapp_inbox').upsert(
    {
      cliente_id: clienteId,
      message_id: String(messageId),
      from_jid: fromJid,
      sender_name: name || null,
      msg_timestamp: ts,
      type,
      body: bodyText || null,
      is_group: isGroup,
      group_name: groupName || null,
      phone: phoneFinal || null,
      profile_pic_url: (profilePicUrl && String(profilePicUrl).trim()) || null,
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

  if (fromJid && fromJid !== 'unknown') {
    const tracking = extractTrackingFromPayload(body, payload, chat);
    if (leadName && String(leadName).trim() && tracking.tracking_data) {
      (tracking.tracking_data as Record<string, unknown>).lead_name = String(leadName).trim();
    } else if (leadName && String(leadName).trim()) {
      tracking.tracking_data = { lead_name: String(leadName).trim() };
    }
    const now = new Date().toISOString();
    const contactName = (name && String(name).trim()) || (leadName && String(leadName).trim()) || null;

    const { data: existingContact } = await supabase
      .from('cliente_whatsapp_contact')
      .select('tracking_data, origin_source, utm_source, utm_medium, utm_campaign, utm_content, utm_term')
      .eq('cliente_id', clienteId)
      .eq('from_jid', fromJid)
      .maybeSingle();

    const existingHasTracking = existingContact?.tracking_data && typeof existingContact.tracking_data === 'object' && Object.keys(existingContact.tracking_data as object).length > 0;
    const existingRaw = existingContact?.tracking_data as Record<string, unknown> | undefined;
    // Mesmo formato do "Importar como contato": tracking_data plano (sem events_by_date), preservando meta_ad_details do existente se houver
    const finalTracking = (() => {
      if (existingHasTracking) return existingRaw ?? null;
      const flat = tracking.tracking_data as Record<string, unknown> | null | undefined;
      if (existingRaw?.meta_ad_details || existingRaw?.meta_ad_details_history) {
        return { ...(flat || {}), meta_ad_details: existingRaw.meta_ad_details, meta_ad_details_history: existingRaw.meta_ad_details_history };
      }
      return flat ?? null;
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

    const contactProfilePic = (profilePicUrl && String(profilePicUrl).trim()) || null;
    const { error: contactError } = await supabase.from('cliente_whatsapp_contact').upsert(
      {
        cliente_id: clienteId,
        from_jid: fromJid,
        phone: phoneFinal || null,
        sender_name: contactName || null,
        origin_source: finalOrigin,
        utm_source: finalUtm.utm_source,
        utm_medium: finalUtm.utm_medium,
        utm_campaign: finalUtm.utm_campaign,
        utm_content: finalUtm.utm_content,
        utm_term: finalUtm.utm_term,
        tracking_data: finalTracking,
        profile_pic_url: contactProfilePic,
        first_seen_at: ts,
        last_message_at: ts,
        updated_at: now,
      },
      { onConflict: 'cliente_id,from_jid', updateColumns: ['phone', 'sender_name', 'origin_source', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'tracking_data', 'profile_pic_url', 'last_message_at', 'updated_at'] }
    );
    // #region agent log
    if (contactError) console.error('[uazapi-inbox-webhook] DEBUG contact upsert error', JSON.stringify({ message: contactError.message, code: contactError.code, details: contactError.details }));
    else console.log('[uazapi-inbox-webhook] DEBUG contact upsert OK', JSON.stringify({ fromJid: fromJid?.slice(0, 50), clienteId }));
    // #endregion
    if (contactError) console.error('[uazapi-inbox-webhook] Contact upsert error', contactError);
    else {
      // Automação: novo contato -> funil (create-lead-from-contact com service role)
      try {
        const fnUrl = `${supabaseUrl}/functions/v1/create-lead-from-contact`;
        const res = await fetch(fnUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({
            cliente_id: clienteId,
            from_jid: fromJid,
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
    }
  } else {
    console.log('[uazapi-inbox-webhook] Contato não criado: fromJid ausente ou unknown. body_keys:', bodyKeys.slice(0, 20));
  }

  await supabase.from('cliente_whatsapp_webhook_log').insert(logRow);
  return new Response(JSON.stringify({ success: true }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});

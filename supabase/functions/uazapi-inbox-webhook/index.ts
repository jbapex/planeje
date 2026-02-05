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
    .select('webhook_secret')
    .eq('cliente_id', clienteId)
    .single();

  if (configError || !config?.webhook_secret || config.webhook_secret !== secret) {
    return new Response(JSON.stringify({ error: 'Secret inválido' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

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
  const bodyKeys = Object.keys(body);
  console.log('[uazapi-inbox-webhook] body_keys:', bodyKeys, 'payload_keys:', Object.keys(payload));

  const from = (chat?.wa_chatid ?? payload.from ?? payload.remoteJid ?? payload.chatId ?? body.from ?? '') as string;
  const bodyText = (payload.body ?? payload.text ?? payload.content ?? body.body ?? body.text ?? '') as string;
  const type = (payload.type ?? body.type ?? 'text') as string;
  const bodyPreview = typeof bodyText === 'string' ? bodyText.slice(0, 200) : '';

  const extractPhoneFromJid = (jid: string) => {
    if (!jid || typeof jid !== 'string') return '';
    const s = jid.replace(/@.*$/, '').trim();
    return /^\d+$/.test(s) ? s : s;
  };

  const phoneFromJid = extractPhoneFromJid(from);
  const phone = (chat?.owner ?? chat?.phone ?? payload.owner ?? payload.phone ?? phoneFromJid ?? '') as string;
  const profilePicUrl = (chat?.imagePreview ?? chat?.image ?? payload.imagePreview ?? payload.image ?? '') as string;

  const logRow = {
    cliente_id: clienteId,
    status: 'ok',
    from_jid: from || null,
    type: type || null,
    body_preview: bodyPreview || null,
    body_keys: bodyKeys.length ? bodyKeys : null,
    error_message: null,
    raw_payload: body,
  };

  const messageId = (payload.id ?? (payload.key as Record<string, unknown>)?.id ?? payload.messageId ?? body.id ?? chat?.id ?? `${from}_${Date.now()}`) as string;
  const nameRaw = (chat?.name ?? chat?.wa_name ?? payload.name ?? payload.pushName ?? payload.senderName ?? payload.contactName ?? body.name ?? '') as string;
  const name = (nameRaw && nameRaw.trim()) || phone || phoneFromJid || (from && from !== 'unknown' ? from : null);
  const isGroup = !!(chat?.wa_isGroup ?? payload.isGroup ?? payload.is_group ?? body.isGroup ?? body.is_group);
  const groupName = (chat?.name ?? chat?.wa_name ?? payload.groupName ?? payload.subject ?? body.groupName ?? null) as string | null;
  const ts = (payload.timestamp ?? body.timestamp)
    ? new Date(((payload.timestamp ?? body.timestamp) as number) * 1000).toISOString()
    : new Date().toISOString();

  const fromJid = from || (phone || phoneFromJid ? `${phone || phoneFromJid}@s.whatsapp.net` : null) || 'unknown';
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
      phone: phone || null,
      profile_pic_url: profilePicUrl || null,
      raw_payload: body,
    },
    { onConflict: 'cliente_id,message_id' }
  );

  if (insertError) {
    console.error('[uazapi-inbox-webhook] Insert error', insertError);
    await supabase.from('cliente_whatsapp_webhook_log').insert({
      cliente_id: clienteId,
      status: 'error',
      from_jid: from || null,
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

  await supabase.from('cliente_whatsapp_webhook_log').insert(logRow);
  return new Response(JSON.stringify({ success: true }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});

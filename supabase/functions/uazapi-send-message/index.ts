/**
 * Edge Function para enviar mensagem de texto via uazapi (CRM WhatsApp).
 * Recebe: { to: string (jid ou número), body: string }
 * Opcional para admin/colaborador: { cliente_id: string }
 * Usa cliente_whatsapp_config (subdomain, token) e grava em cliente_whatsapp_sent.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function normalizeToPhone(to: string): string {
  const jid = String(to).trim();
  const num = jid.replace(/@.*$/, '').replace(/\D/g, '');
  return num || jid;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
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

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Não autorizado' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const token = authHeader.slice(7);
  const { data: { user }, error: userError } = await supabase.auth.getUser(token);
  if (userError || !user?.id) {
    return new Response(JSON.stringify({ error: 'Token inválido ou expirado' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let body: Record<string, unknown>;
  try {
    const raw = await req.json();
    body = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  } catch {
    return new Response(JSON.stringify({ error: 'Body JSON inválido' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('cliente_id, role')
    .eq('id', user.id)
    .single();

  let clienteId: string | null = profile?.cliente_id ?? null;
  const role = profile?.role ?? null;
  if ((role === 'admin' || role === 'colaborador' || role === 'superadmin') && body?.cliente_id) {
    clienteId = (body.cliente_id as string) || clienteId;
  }
  if (!clienteId) {
    return new Response(JSON.stringify({ error: 'Cliente não identificado. Faça login como cliente ou informe cliente_id.' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const to = (body?.to ?? body?.to_jid ?? '').trim() as string;
  const bodyText = (body?.body ?? body?.text ?? body?.message ?? '').trim() as string;

  if (!to || !bodyText) {
    return new Response(JSON.stringify({ error: 'Campos "to" e "body" são obrigatórios' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { data: config, error: configError } = await supabase
    .from('cliente_whatsapp_config')
    .select('subdomain, token')
    .eq('cliente_id', clienteId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (configError || !config?.subdomain || !config?.token) {
    return new Response(JSON.stringify({ error: 'WhatsApp não configurado para este cliente. Configure em API e Canais.' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const subdomain = String(config.subdomain).replace(/^https?:\/\//, '').split('/')[0].replace(/\.uazapi\.com$/i, '');
  const baseUrl = `https://${subdomain}.uazapi.com`;
  const phone = normalizeToPhone(to);
  const toJid = to.includes('@') ? to : `${phone}@s.whatsapp.net`;

  const token = config.token.trim();
  const headers = { 'Content-Type': 'application/json', token };

  // uazapi: tentar paths e bodies comuns (v1 usa /send-text, v2 pode usar /instance/send-text com number + body)
  const attempts: { path: string; body: Record<string, string> }[] = [
    { path: '/instance/send-text', body: { number: phone, body: bodyText } },
    { path: '/instance/send-text', body: { phone, text: bodyText } },
    { path: '/send-text', body: { number: phone, body: bodyText } },
    { path: '/send-text', body: { phone, text: bodyText } },
  ];

  let res: Response | null = null;
  let resData: Record<string, unknown> = {};
  let lastError = '';

  for (const { path, body } of attempts) {
    res = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    resData = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (res.ok) break;
    lastError = (resData.message as string) ?? (resData.error as string) ?? res.statusText;
    if (res.status === 404) continue;
    break;
  }

  const apiFailed = !res || !res.ok || resData?.success === false || (resData?.error && typeof resData.error === 'string');
  if (apiFailed) {
    const errMsg = (resData?.error as string) ?? (resData?.message as string) ?? lastError || 'Erro ao enviar mensagem na uazapi.';
    console.error('[uazapi-send-message] uazapi error', res?.status, resData);
    return new Response(
      JSON.stringify({
        error: errMsg,
        details: resData,
      }),
      { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const messageId = (resData as { id?: string })?.id ?? (resData as { key?: { id?: string } })?.key?.id ?? `sent_${Date.now()}_${clienteId}`;
  const { error: insertError } = await supabase.from('cliente_whatsapp_sent').insert({
    cliente_id: clienteId,
    to_jid: toJid,
    message_id: String(messageId),
    body: bodyText,
  });

  if (insertError) {
    console.error('[uazapi-send-message] insert sent error', insertError);
    // Mensagem já foi enviada; retornamos sucesso mesmo assim
  }

  return new Response(
    JSON.stringify({ success: true, message_id: String(messageId), to_jid: toJid }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
});

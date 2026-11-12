/**
 * Consulta /instance/status de cada canal do cliente e grava instance_status.
 * Não envia mensagem. A classificação espelha src/lib/uazapiInstanceStatus.js.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function classificarRespostaInstancia(httpStatus: number, data: Record<string, unknown> | null): string {
  const statusCode = Number(httpStatus) || 0;
  const payload = data && typeof data === 'object' ? data : {};
  const blob = `${statusCode} ${JSON.stringify(payload)}`.toLowerCase();
  const statusObj = payload.status && typeof payload.status === 'object'
    ? payload.status as Record<string, unknown>
    : null;
  const instanceObj = payload.instance && typeof payload.instance === 'object'
    ? payload.instance as Record<string, unknown>
    : null;
  const connected =
    payload.connected === true ||
    statusObj?.loggedIn === true ||
    statusObj?.connected === true ||
    instanceObj?.status === 'connected' ||
    String(payload.status || '').toLowerCase() === 'connected';
  if (connected) return 'connected';
  const instanceStatus = String(instanceObj?.status || '').toLowerCase();
  if (instanceStatus === 'connecting' || payload.status === 'connecting') return 'connecting';
  if (statusCode === 0 || statusCode >= 500) {
    if (blob.includes('disconnect') || blob.includes('desconect')) return 'disconnected';
    return 'unknown';
  }
  if (statusCode === 401 || statusCode === 403) return 'disconnected';
  return 'disconnected';
}

function uazapiBaseUrl(subdomainOrUrl: string): string {
  const raw = String(subdomainOrUrl || '').trim();
  if (!raw) return '';
  try {
    const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const host = new URL(withProtocol).hostname.toLowerCase();
    const sub = host.replace(/\.uazapi\.com$/i, '').split('.')[0] || '';
    return sub ? `https://${sub}.uazapi.com` : '';
  } catch {
    return '';
  }
}

async function probe(subdomain: string, token: string): Promise<string> {
  const base = uazapiBaseUrl(subdomain);
  if (!base || !token) return 'unknown';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${base}/instance/status`, {
      headers: { token, Accept: 'application/json' },
      signal: controller.signal,
    });
    const text = await res.text();
    let data: Record<string, unknown> | null = null;
    try {
      const parsed = JSON.parse(text);
      data = parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : { message: text.slice(0, 180) };
    } catch {
      data = { message: text.slice(0, 180) };
    }
    return classificarRespostaInstancia(res.status, data);
  } catch {
    return 'unknown';
  } finally {
    clearTimeout(timer);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
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
  const { data: { user }, error: userError } = await supabase.auth.getUser(authHeader.slice(7));
  if (userError || !user?.id) {
    return new Response(JSON.stringify({ error: 'Token inválido ou expirado' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const role = profile?.role ?? '';
  if (!['superadmin', 'admin', 'colaborador'].includes(role)) {
    return new Response(JSON.stringify({ error: 'Acesso negado.' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let body: Record<string, unknown> = {};
  try {
    const raw = await req.json();
    body = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  } catch {
    body = {};
  }
  const clienteId = String(body.cliente_id || '').trim();
  if (!clienteId) {
    return new Response(JSON.stringify({ error: 'Informe o cliente.' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { data: rows, error: rowsError } = await supabase
    .from('cliente_whatsapp_config')
    .select('id, name, subdomain, token, instance_status')
    .eq('cliente_id', clienteId)
    .is('archived_at', null)
    .order('created_at');
  if (rowsError) {
    return new Response(JSON.stringify({ error: 'Não foi possível ler os canais.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const channels = await Promise.all((rows || []).map(async (row) => {
    const status = await probe(String(row.subdomain || ''), String(row.token || ''));
    if (status !== 'unknown' && status !== row.instance_status) {
      await supabase
        .from('cliente_whatsapp_config')
        .update({ instance_status: status, updated_at: new Date().toISOString() })
        .eq('id', row.id)
        .eq('cliente_id', clienteId);
    }
    return {
      id: row.id,
      name: String(row.name || '').trim(),
      status: status === 'unknown' ? (row.instance_status || 'unknown') : status,
      live: status !== 'unknown',
    };
  }));

  return new Response(JSON.stringify({ channels }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});

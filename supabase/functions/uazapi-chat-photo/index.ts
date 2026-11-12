/**
 * Busca a foto atual do chat na uazapi e guarda uma cópia no storage.
 * O link pps.whatsapp.net expira e o navegador mostra as iniciais.
 * Não envia mensagem.
 *
 * Body: { items: [{ jid, whatsapp_config_id, conversation_id? }] } — no máximo 12.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PUBLIC_BASE = 'https://planeje.jbapex.com.br';
const BUCKET = 'atendimento-fotos';
const MAX_ITEMS = 12;
const MAX_IMAGE_BYTES = 1_500_000;

type PhotoItem = {
  jid: string;
  whatsapp_config_id: string;
  conversation_id?: string;
};

type WaConfig = {
  id: string;
  cliente_id: string;
  subdomain: string;
  token: string;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function uazapiBase(subdomain: string) {
  let host = String(subdomain || '').trim().replace(/^https?:\/\//, '').split('/')[0];
  if (!host) return '';
  if (!host.includes('.')) host = `${host}.uazapi.com`;
  return `https://${host}`;
}

function pickImage(data: Record<string, unknown> | null) {
  if (!data) return '';
  for (const key of ['image', 'imagePreview', 'profilePicUrl', 'pictureUrl']) {
    const value = data[key];
    if (typeof value === 'string' && /^https?:\/\//i.test(value)) return value;
  }
  return '';
}

async function shaPath(clienteId: string, jid: string) {
  const prefix = String(clienteId).replace(/[^a-zA-Z0-9-]/g, '').slice(0, 36) || 'loja';
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${clienteId}:${jid}`));
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
  return `${prefix}/${hex}.jpg`;
}

async function fetchDetails(config: WaConfig, jid: string): Promise<Record<string, unknown> | null> {
  const base = uazapiBase(config.subdomain);
  if (!base || !config.token) return null;
  try {
    const res = await fetch(`${base}/chat/details`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', token: config.token.trim() },
      body: JSON.stringify({ number: jid, preview: false }),
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function downloadImage(url: string) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Planeje' },
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) return null;
  const type = String(res.headers.get('content-type') || '').toLowerCase();
  if (!type.startsWith('image/')) return null;
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (!bytes.byteLength || bytes.byteLength > MAX_IMAGE_BYTES) return null;
  const contentType = type.includes('png') ? 'image/png' : type.includes('webp') ? 'image/webp' : 'image/jpeg';
  return { bytes, contentType };
}

async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>) {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      out[index] = await fn(items[index]);
    }
  }
  const workers = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return out;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!supabaseUrl || !serviceKey) return json({ error: 'Configuração do servidor incompleta' }, 500);

  const authHeader = req.headers.get('Authorization') || '';
  if (!authHeader.startsWith('Bearer ')) return json({ error: 'Não autorizado' }, 401);

  const supabase = createClient(supabaseUrl, serviceKey);
  const { data: authData, error: authError } = await supabase.auth.getUser(authHeader.slice(7));
  if (authError || !authData.user?.id) return json({ error: 'Token inválido ou expirado' }, 401);

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', authData.user.id)
    .maybeSingle();
  const role = profile?.role ?? '';
  if (!['superadmin', 'admin', 'colaborador'].includes(role)) {
    return json({ error: 'Acesso negado.' }, 403);
  }

  let body: { items?: PhotoItem[] } = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Body JSON inválido' }, 400);
  }

  const items = (Array.isArray(body.items) ? body.items : [])
    .map((item) => ({
      jid: String(item?.jid || '').trim(),
      whatsapp_config_id: String(item?.whatsapp_config_id || '').trim(),
    }))
    .filter((item) => item.jid.includes('@') && item.whatsapp_config_id)
    .slice(0, MAX_ITEMS);

  if (!items.length) return json({ photos: [] });

  const configIds = [...new Set(items.map((item) => item.whatsapp_config_id))];
  const { data: preferredRows } = await supabase
    .from('cliente_whatsapp_config')
    .select('id, cliente_id, subdomain, token, archived_at')
    .in('id', configIds);

  const clienteIds = [...new Set((preferredRows || []).map((row) => row.cliente_id).filter(Boolean))];
  const { data: siblingRows } = clienteIds.length
    ? await supabase
      .from('cliente_whatsapp_config')
      .select('id, cliente_id, subdomain, token, archived_at, instance_status')
      .in('cliente_id', clienteIds)
      .is('archived_at', null)
    : { data: [] };

  const byCliente = new Map<string, WaConfig[]>();
  for (const row of siblingRows || []) {
    if (!row.subdomain || !row.token || !row.cliente_id) continue;
    const list = byCliente.get(row.cliente_id) || [];
    list.push({
      id: row.id,
      cliente_id: row.cliente_id,
      subdomain: row.subdomain,
      token: row.token,
    });
    byCliente.set(row.cliente_id, list);
  }

  const preferredById = new Map((preferredRows || []).map((row) => [row.id, row]));

  const photos = await mapPool(items, 3, async (item) => {
    const preferred = preferredById.get(item.whatsapp_config_id);
    const clienteId = preferred?.cliente_id;
    if (!clienteId) return { jid: item.jid, whatsapp_config_id: item.whatsapp_config_id, url: null };

    const configs = byCliente.get(clienteId) || [];
    const ordered = [
      ...configs.filter((config) => config.id === item.whatsapp_config_id),
      ...configs.filter((config) => config.id !== item.whatsapp_config_id),
    ];

    let imageUrl = '';
    for (const config of ordered) {
      const details = await fetchDetails(config, item.jid);
      if (!details) continue;
      imageUrl = pickImage(details);
      break;
    }
    if (!imageUrl) return { jid: item.jid, whatsapp_config_id: item.whatsapp_config_id, url: null };

    const image = await downloadImage(imageUrl).catch(() => null);
    if (!image) return { jid: item.jid, whatsapp_config_id: item.whatsapp_config_id, url: null };

    const path = await shaPath(clienteId, item.jid);
    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, image.bytes, {
      contentType: image.contentType,
      upsert: true,
      cacheControl: '86400',
    });
    if (uploadError) return { jid: item.jid, whatsapp_config_id: item.whatsapp_config_id, url: null };

    const publicUrl = `${PUBLIC_BASE}/storage/v1/object/public/${BUCKET}/${path}`;
    const now = new Date().toISOString();
    await supabase
      .from('atendimento_conversas')
      .update({ profile_pic_url: publicUrl, updated_at: now })
      .eq('cliente_id', clienteId)
      .eq('chat_jid', item.jid);

    await supabase
      .from('cliente_whatsapp_contact')
      .update({ profile_pic_url: publicUrl, updated_at: now })
      .eq('cliente_id', clienteId)
      .eq('from_jid', item.jid);

    if (!item.jid.includes('@g.us')) {
      const digits = item.jid.replace(/@.*/, '').replace(/\D/g, '');
      if (digits.length >= 10 && digits.length <= 13) {
        await supabase
          .from('cliente_whatsapp_contact')
          .update({ profile_pic_url: publicUrl, updated_at: now })
          .eq('cliente_id', clienteId)
          .eq('phone', digits);
      }
    }

    return { jid: item.jid, whatsapp_config_id: item.whatsapp_config_id, url: publicUrl };
  });

  return json({ photos });
});

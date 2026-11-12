import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-reuniao-chave',
};

const STAFF = new Set(['admin', 'superadmin', 'colaborador']);
const KEY_HOURS = 8;
const JUNK = /^(obrigad[oa]( por assistir)?\.?|legendas? pela comunidade.*|inscreva-se.*|thanks for watching.*|amém\.?|tchau\.?|\.+|…)$/i;

type Admin = ReturnType<typeof createClient>;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function b64url(bytes: Uint8Array) {
  let bin = '';
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(text: string) {
  const pad = text.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((text.length + 3) % 4);
  return Uint8Array.from(atob(pad), (c) => c.charCodeAt(0));
}

async function hmac(secret: string, data: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data))));
}

async function signKey(secret: string, payload: Record<string, unknown>) {
  const body = b64url(new TextEncoder().encode(JSON.stringify(payload)));
  return `${body}.${await hmac(`reuniao:${secret}`, body)}`;
}

async function readKey(secret: string, chave: string) {
  const [body, sig] = String(chave || '').split('.');
  if (!body || !sig) return null;
  if ((await hmac(`reuniao:${secret}`, body)) !== sig) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(fromB64url(body)));
    if (!payload?.r || !payload?.u || Number(payload.exp) * 1000 < Date.now()) return null;
    return payload as { r: string; u: string; exp: number };
  } catch {
    return null;
  }
}

async function staffUser(admin: Admin, req: Request) {
  const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!jwt || jwt.split('.').length !== 3) return null;
  const { data, error } = await admin.auth.getUser(jwt);
  if (error || !data.user) return null;
  const { data: profile } = await admin
    .from('profiles')
    .select('role, status, full_name')
    .eq('id', data.user.id)
    .maybeSingle();
  if (!profile || profile.status !== 'active' || !STAFF.has(profile.role)) return null;
  return { id: data.user.id, name: String(profile.full_name || '').trim() };
}

async function openaiKey(admin: Admin) {
  const fromEnv = Deno.env.get('OPENAI_API_KEY');
  if (fromEnv) return fromEnv;
  const { data } = await admin.rpc('get_encrypted_secret', { p_secret_name: 'OPENAI_API_KEY' });
  if (typeof data === 'string' && data) return data;
  const { data: row } = await admin.from('app_secrets').select('secret_value').eq('name', 'OPENAI_API_KEY').maybeSingle();
  return row?.secret_value || '';
}

async function transcribe(key: string, file: File, model: string) {
  const form = new FormData();
  form.append('file', file, file.name || 'fala.webm');
  form.append('model', model);
  form.append('language', 'pt');
  form.append('temperature', '0');
  if (model !== 'whisper-1') {
    form.append('response_format', 'json');
    form.append('include[]', 'logprobs');
  }
  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });
  const payload = await response.json().catch(() => ({}));
  const probs = Array.isArray(payload?.logprobs) ? payload.logprobs.map((item: { logprob?: number }) => Number(item?.logprob)).filter(Number.isFinite) : [];
  const confidence = probs.length ? probs.reduce((sum: number, value: number) => sum + value, 0) / probs.length : null;
  return { ok: response.ok, status: response.status, text: typeof payload?.text === 'string' ? payload.text : '', confidence };
}

const PT_WORDS = new Set(('a o e é de do da dos das que não nao um uma uns umas pra para pro com sem eu você voce vocês ele ela eles elas nós nos a gente isso isto esse essa este esta aquilo aí ai lá la aqui então entao mas mais se no na nos nas em por pelo pela já ja tá ta está esta estou vai vou foi era ser ter tem tenho tinha fazer faz quero queria pode posso sim bom boa dia tarde noite tudo bem beleza obrigado obrigada oi olá ola pessoal cliente só so também tambem muito muita meu minha seu sua como quando onde porque porquê qual quem gente certo claro assim agora depois antes hoje amanhã').split(' '));
const FOREIGN_WORDS = new Set(('hello hi hey ok okay bye yes yeah thank thanks you the what happened is are and to of it this that komm her takk for det können konnen sie ich und nicht danke bitte ja nein gracias thank-you').split(' '));

function notPortuguese(text: string) {
  const words = text.toLowerCase().normalize('NFC').replace(/[^a-zà-ÿß\s-]/g, ' ').split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  if (words.every((word) => FOREIGN_WORDS.has(word))) return true;
  if (/[ßåøæ]/.test(text.toLowerCase())) return true;
  const pt = words.filter((word) => PT_WORDS.has(word)).length;
  const foreign = words.filter((word) => FOREIGN_WORDS.has(word)).length;
  if (words.length >= 3 && !pt && foreign) return true;
  if (words.length >= 4 && !pt) return true;
  return foreign > pt && foreign >= 2;
}

function cleanText(value: string) {
  const text = String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/^(?:portugu[eê]s do brasil\.?\s*)+/gi, '')
    .replace(/\bcontext:\s*/gi, '')
    .trim()
    .slice(0, 4000);
  if (!/[0-9A-Za-zÀ-ÿ]/.test(text) || /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af\u0400-\u04ff\u0600-\u06ff]/.test(text)) return '';
  if (JUNK.test(text) || notPortuguese(text)) return '';
  return text;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Método inválido' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!supabaseUrl || !serviceKey) return json({ error: 'Configuração incompleta' }, 500);
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const acao = new URL(req.url).searchParams.get('acao') || 'transcrever';
  const chave = req.headers.get('x-reuniao-chave') || '';
  const keyed = chave ? await readKey(serviceKey, chave) : null;

  if (acao === 'chave') {
    const user = await staffUser(admin, req);
    if (!user) return json({ error: 'Sem permissão' }, 403);
    const body = await req.json().catch(() => ({}));
    const reuniaoId = String(body?.reuniao_id || '');
    const { data: reuniao } = await admin.from('cliente_reunioes').select('id').eq('id', reuniaoId).maybeSingle();
    if (!reuniao) return json({ error: 'Reunião não encontrada' }, 404);
    const exp = Math.floor(Date.now() / 1000) + KEY_HOURS * 3600;
    return json({ chave: await signKey(serviceKey, { r: reuniao.id, u: user.id, exp }), expira: exp, nome: user.name });
  }

  if (acao === 'fala' || acao === 'status') {
    if (!keyed) return json({ error: 'Chave da reunião vencida' }, 401);
    const body = await req.json().catch(() => ({}));
    if (acao === 'status') {
      const status = body?.status === 'transcrita' ? 'transcrita' : 'em_andamento';
      const patch: Record<string, unknown> = { status };
      if (status === 'transcrita') patch.encerrada_em = new Date().toISOString();
      const { data: current } = await admin.from('cliente_reunioes').select('iniciada_em').eq('id', keyed.r).maybeSingle();
      if (status === 'em_andamento' && !current?.iniciada_em) patch.iniciada_em = new Date().toISOString();
      const { error } = await admin.from('cliente_reunioes').update(patch).eq('id', keyed.r);
      return error ? json({ error: 'Não atualizou a reunião' }, 500) : json({ ok: true });
    }
    const ordem = Number(body?.ordem);
    if (body?.apagar === true && Number.isInteger(ordem) && ordem >= 0) {
      const { error } = await admin.from('cliente_reuniao_falas').delete().eq('reuniao_id', keyed.r).eq('ordem', ordem);
      return error ? json({ error: 'Não apagou a fala' }, 500) : json({ ok: true });
    }
    const texto = String(body?.texto || '').trim().slice(0, 8000);
    if (!Number.isInteger(ordem) || ordem < 0 || !texto) return json({ error: 'Fala inválida' }, 400);
    const row = {
      reuniao_id: keyed.r,
      ordem,
      nome: String(body?.nome || 'Participante').trim().slice(0, 120) || 'Participante',
      texto,
      inicio_em: body?.inicio_em || new Date().toISOString(),
      fim_em: body?.fim_em || new Date().toISOString(),
    };
    const { error } = await admin.from('cliente_reuniao_falas').upsert(row, { onConflict: 'reuniao_id,ordem' });
    return error ? json({ error: 'Não gravou a fala' }, 500) : json({ ok: true });
  }

  if (!keyed && !(await staffUser(admin, req))) return json({ error: 'Sem sessão' }, 401);

  const key = await openaiKey(admin);
  if (!key) return json({ error: 'Transcrição indisponível' }, 500);

  const incoming = await req.formData();
  const file = incoming.get('file');
  if (!(file instanceof File) || file.size < 400 || file.size > 4_000_000) return json({ text: '' });

  let result = await transcribe(key, file, 'gpt-4o-transcribe');
  if (!result.ok) result = await transcribe(key, file, 'gpt-4o-mini-transcribe');
  if (!result.ok) result = await transcribe(key, file, 'whisper-1');
  if (!result.ok) return json({ error: 'Não transcreveu' }, 502);

  if (result.confidence !== null && result.confidence < -1.1) return json({ text: '', confianca: result.confidence });
  return json({ text: cleanText(result.text), confianca: result.confidence });
});

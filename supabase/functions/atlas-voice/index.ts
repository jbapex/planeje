/** Authenticated SDP negotiation. Standard API keys never reach the browser. */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.30.0';
import { AtlasError, ownerGate } from '../_shared/atlasCore.js';
import { atlasVoiceConfig, validateVoiceOffer } from '../_shared/atlasVoiceConfig.js';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ ok: false, error: 'Use POST.' }, 405);
  try {
    const auth = req.headers.get('Authorization') || '';
    if (!auth.startsWith('Bearer ')) throw new AtlasError('UNAUTHENTICATED', 'Entre novamente no Planeje.', 401);
    const url = Deno.env.get('SUPABASE_URL'), anon = Deno.env.get('SUPABASE_ANON_KEY'), service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !anon || !service) throw new AtlasError('ATLAS_NOT_CONFIGURED', 'Atlas aguarda configuração no servidor.', 503);
    const caller = createClient(url, anon, { global: { headers: { Authorization: auth } }, auth: { persistSession: false, autoRefreshToken: false } });
    const { data: identity, error: authError } = await caller.auth.getUser();
    if (authError || !identity.user) throw new AtlasError('UNAUTHENTICATED', 'Sua sessão expirou.', 401);
    const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
    const settings = await admin.from('atlas_settings').select('owner_id,enabled').eq('id', 'atlas').maybeSingle();
    const profile = await caller.from('profiles').select('id,role,status').eq('id', identity.user.id).maybeSingle();
    if (settings.error || profile.error) throw new AtlasError('ATLAS_NOT_CONFIGURED', 'Não foi possível conferir o acesso ao Atlas.', 503);
    if (!ownerGate(identity.user, profile.data, settings.data).enabled) throw new AtlasError('ATLAS_DISABLED', 'Atlas está desligado.', 403);
    const raw = await req.text();
    if (raw.length > 70000) throw new AtlasError('INVALID_INPUT', 'Conexão de áudio inválida.');
    let body;
    try { body = JSON.parse(raw); } catch { throw new AtlasError('INVALID_INPUT', 'Conexão de áudio inválida.'); }
    const { sdp, clientId } = validateVoiceOffer(body);
    if (clientId) {
      const client = await caller.from('clientes').select('id').eq('id', clientId).eq('etapa','closed').maybeSingle();
      if (client.error || !client.data) throw new AtlasError('CLIENT_FORBIDDEN', 'Cliente indisponível para sua conta.', 403);
    }
    let key = Deno.env.get('OPENAI_API_KEY');
    if (!key) {
      const secret = await admin.rpc('get_encrypted_secret', { p_secret_name: 'OPENAI_API_KEY' });
      if (!secret.error && typeof secret.data === 'string') key = secret.data;
    }
    if (!key) throw new AtlasError('VOICE_NOT_CONFIGURED', 'A voz do Atlas precisa da chave OpenAI configurada no servidor.', 503);
    const session = atlasVoiceConfig({ model: Deno.env.get('ATLAS_VOICE_MODEL') || 'gpt-realtime-2.1-mini', voice: Deno.env.get('ATLAS_VOICE_NAME') || 'marin', clientId });
    const form = new FormData(); form.set('sdp', sdp); form.set('session', JSON.stringify(session));
    const response = await fetch('https://api.openai.com/v1/realtime/calls', { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: form, signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new AtlasError('VOICE_PROVIDER_FAILURE', response.status === 429 ? 'O provedor de voz atingiu seu limite. Tente novamente mais tarde.' : 'Não foi possível conectar a voz do Atlas. Confira a configuração do provedor.', 502);
    const answer = await response.text();
    if (!answer.startsWith('v=0')) throw new AtlasError('VOICE_PROVIDER_FAILURE', 'O provedor não confirmou a conexão de áudio.', 502);
    return json({ ok: true, sdp: answer });
  } catch (error) {
    if (error instanceof AtlasError) return json({ ok: false, code: error.code, error: error.message }, error.status);
    return json({ ok: false, code: 'VOICE_UNAVAILABLE', error: 'Não foi possível conectar a voz. A conversa por texto continua disponível.' }, 502);
  }
});

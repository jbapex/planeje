import {
  CONNECTION_TOKEN_PATTERN, connectionProviderUrl, createConnectionToken,
  hashConnectionToken, normalizePairingPhone, publicConnectionPayload, canManageWhatsappConnection,
} from './whatsappConnection.js';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json', 'Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff',
};
const reply = (data, status = 200) => new Response(JSON.stringify(data), { status, headers });
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function smallBody(req) {
  const reader = req.body?.getReader();
  if (!reader) throw new Error('body');
  let text = '', size = 0;
  const decoder = new TextDecoder();
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 4096) { await reader.cancel(); throw new Error('body'); }
    text += decoder.decode(value, { stream: true });
  }
  const parsed = JSON.parse(text + decoder.decode());
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') throw new Error('body');
  return parsed;
}

export function createWhatsappConnectionHandler({ createClient, env, providerFetch = fetch, cryptoApi = globalThis.crypto }) {
  return async function handle(req) {
    if (req.method === 'OPTIONS') return reply({});
    if (req.method !== 'POST') return reply({ error: 'Método não permitido.' }, 405);
    let body;
    try { body = await smallBody(req); } catch { return reply({ error: 'Pedido inválido.' }, 400); }
    const url = env('SUPABASE_URL'), serviceKey = env('SUPABASE_SERVICE_ROLE_KEY'), anonKey = env('SUPABASE_ANON_KEY');
    if (!url || !serviceKey || !anonKey) return reply({ error: 'Serviço temporariamente indisponível.' }, 503);
    const service = createClient(url, serviceKey, { auth: { persistSession: false } });
    const action = String(body.action || '');
    try {
      if (['issue', 'inspect', 'revoke'].includes(action)) {
        const authorization = req.headers.get('authorization') || '';
        if (!/^Bearer \S+$/i.test(authorization)) return reply({ error: 'Entre no Planeje para gerenciar o link.' }, 401);
        const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
        const { data: auth, error: authError } = await userClient.auth.getUser(authorization.replace(/^Bearer\s+/i, ''));
        if (authError || !auth?.user?.id) return reply({ error: 'Sessão inválida.' }, 401);
        const { data: active, error: accessError } = await userClient.rpc('planeje_current_account_access');
        if (accessError || active !== true) return reply({ error: 'Conta não autorizada.' }, 403);
        const { data: profile } = await userClient.from('profiles').select('role,status').eq('id', auth.user.id).maybeSingle();
        const [globalModule, userModule] = await Promise.all([
          userClient.from('module_settings').select('is_enabled').eq('module_name', 'rastreamento').maybeSingle(),
          userClient.from('user_module_permissions').select('is_enabled').eq('module_name', 'rastreamento').eq('user_id', auth.user.id).maybeSingle(),
        ]);
        const moduleEnabled = userModule.data?.is_enabled ?? globalModule.data?.is_enabled ?? true;
        if (globalModule.error || userModule.error || !canManageWhatsappConnection(profile, moduleEnabled)) {
          return reply({ error: 'Sua conta não tem acesso ao Rastreamento.' }, 403);
        }
        if (!uuid.test(body.config_id || '') || !uuid.test(body.cliente_id || '')) return reply({ error: 'Informe o canal e o cliente.' }, 400);
        // A scoped read preserves the existing client/configuration RLS boundary.
        const { data: config, error: configError } = await userClient.from('cliente_whatsapp_config')
          .select('id,cliente_id,provider').eq('id', body.config_id).eq('cliente_id', body.cliente_id).is('archived_at', null).maybeSingle();
        if (configError || !config || ![null, undefined, 'uazapi'].includes(config.provider)) return reply({ error: 'Canal indisponível.' }, 404);
        if (action === 'issue') {
          const token = createConnectionToken(cryptoApi);
          const { data, error } = await service.rpc('planeje_whatsapp_link_issue', {
            p_config_id: config.id, p_token_hash: await hashConnectionToken(token, cryptoApi), p_created_by: auth.user.id,
          });
          if (error || !data?.id) return reply({ error: 'Não foi possível gerar o link.' }, 503);
          return reply({ id: data.id, expires_at: data.expires_at, token });
        }
        if (action === 'revoke') {
          const { error } = await service.from('whatsapp_connection_links').update({ revoked_at: new Date().toISOString() })
            .eq('config_id', config.id).eq('cliente_id', config.cliente_id).is('revoked_at', null);
          return error ? reply({ error: 'Não foi possível revogar o link.' }, 503) : reply({ revoked: true });
        }
        const { data, error } = await service.from('whatsapp_connection_links').select('id,expires_at,completed_at')
          .eq('config_id', config.id).is('revoked_at', null).gt('expires_at', new Date().toISOString()).order('created_at', { ascending: false }).limit(1).maybeSingle();
        return error ? reply({ error: 'Não foi possível consultar o link.' }, 503) : reply({ link: data || null });
      }

      if (!['info', 'status', 'connect'].includes(action)) return reply({ error: 'Ação não permitida.' }, 400);
      if (!CONNECTION_TOKEN_PATTERN.test(body.token || '')) return reply({ error: 'Link inválido ou expirado.', code: 'invalid_link' }, 410);
      const phone = body.mode === 'code' ? normalizePairingPhone(body.phone) : '';
      if (action === 'connect' && (!['qr', 'code'].includes(body.mode) || (body.mode === 'code' && !phone))) return reply({ error: 'Informe o número completo, com país e DDD.' }, 400);
      const hash = await hashConnectionToken(body.token, cryptoApi);
      const { data: access, error: accessError } = await service.rpc('planeje_whatsapp_link_access', { p_token_hash: hash, p_action: action });
      if (accessError) return reply({ error: 'Serviço temporariamente indisponível.' }, 503);
      if (access?.error === 'rate') return reply({ error: 'Aguarde antes de tentar novamente.', retry_after: access.retry_after }, 429);
      if (!access || access.error || (!access.config_id && access.state !== 'connected')) return reply({ error: 'Link inválido ou expirado.', code: 'invalid_link' }, 410);
      if (access.state === 'connected') return reply({ state: 'connected', qr: null, code: null, expires_at: access.expires_at });
      const { data: config, error: configError } = await service.from('cliente_whatsapp_config')
        .select('id,name,subdomain,token').eq('id', access.config_id).eq('cliente_id', access.cliente_id).is('archived_at', null).maybeSingle();
      if (configError || !config) return reply({ error: 'Link inválido ou expirado.', code: 'invalid_link' }, 410);
      const metadata = { channel_name: String(config.name || 'WhatsApp').slice(0, 100), expires_at: access.expires_at };
      if (action === 'info') return reply({ ...metadata, state: 'ready' });
      const base = connectionProviderUrl(config.subdomain);
      if (!base || !config.token) return reply({ error: 'Canal indisponível. Peça ajuda à equipe.' }, 503);
      const call = async (path, payload) => {
        const response = await providerFetch(`${base}${path}`, {
          method: payload ? 'POST' : 'GET', redirect: 'error',
          headers: { token: String(config.token).trim(), 'Content-Type': 'application/json' },
          ...(payload ? { body: JSON.stringify(payload) } : {}), signal: AbortSignal.timeout(12000),
        });
        if (!response.ok) {
          const error = new Error('provider'); error.httpStatus = response.status; throw error;
        }
        return publicConnectionPayload(await response.json());
      };
      let result = await call('/instance/status');
      // A running or connected session is never disconnected/replaced by a public link.
      if (action === 'connect' && result.state === 'disconnected') {
        result = await call('/instance/connect', body.mode === 'code' ? { phone } : {});
        if (result.state === 'disconnected') result.state = 'connecting';
      }
      if (result.state === 'connected') {
        const { data: finished, error } = await service.rpc('planeje_whatsapp_link_access', { p_token_hash: hash, p_action: 'complete' });
        if (error || finished?.state !== 'connected') return reply({ error: 'Link inválido ou expirado.', code: 'invalid_link' }, 410);
      }
      return reply({ ...metadata, ...result });
    } catch (error) {
      if ([409, 429, 503].includes(error?.httpStatus)) return reply({ error: 'A conexão está em andamento ou ocupada. Aguarde e verifique novamente.', retry_after: 60 }, 429);
      return reply({ error: 'Não foi possível consultar a conexão. Tente novamente ou fale com a equipe.' }, 503);
    }
  };
}

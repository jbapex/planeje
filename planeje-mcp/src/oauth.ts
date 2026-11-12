import { loadApprovedTeamUser } from './accountAccess.js';
/**
 * OAuth 2.1 Authorization Server embutido no planeje-mcp
 * (ChatGPT / clientes MCP que só suportam OAuth).
 *
 * Fluxo: discovery → DCR → authorize (login Supabase equipe) → token (PKCE) → Bearer no /mcp
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const TEAM_ROLES = new Set(['superadmin', 'admin', 'colaborador']);

export type OAuthUser = {
  user_id: string;
  full_name: string | null;
  role: string;
  email: string | null;
};

type OAuthClient = {
  client_id: string;
  client_secret?: string;
  redirect_uris: string[];
  token_endpoint_auth_method: string;
  client_name?: string;
  created_at: number;
};

type AuthCode = {
  code: string;
  client_id: string;
  redirect_uri: string;
  code_challenge: string;
  code_challenge_method: string;
  scope: string;
  resource?: string;
  user: OAuthUser;
  expires_at: number;
};

type AccessToken = {
  token: string;
  client_id: string;
  user: OAuthUser;
  scope: string;
  resource?: string;
  expires_at: number;
  refresh_token?: string;
};

type RefreshToken = {
  token: string;
  client_id: string;
  user: OAuthUser;
  scope: string;
  resource?: string;
  expires_at: number;
};

export type OAuthDeps = {
  publicBaseUrl: string; // https://mcp.planeje.jbapex.com.br
  mcpPath: string; // /mcp
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseAdmin: SupabaseClient;
};

const clients = new Map<string, OAuthClient>();
const codes = new Map<string, AuthCode>();
const accessTokens = new Map<string, AccessToken>();
const refreshTokens = new Map<string, RefreshToken>();

const ACCESS_TTL_MS = 60 * 60 * 1000; // 1h
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30d
const CODE_TTL_MS = 10 * 60 * 1000; // 10m

function base64Url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function randomToken(prefix: string, bytes = 32): string {
  return `${prefix}${base64Url(randomBytes(bytes))}`;
}

function sha256Base64Url(value: string): string {
  return base64Url(createHash('sha256').update(value).digest());
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function html(res: ServerResponse, status: number, body: string): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(body);
}

function readUrl(req: IncomingMessage, publicBaseUrl: string): URL {
  return new URL(req.url ?? '/', publicBaseUrl);
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(Buffer.from(c));
  return Buffer.concat(chunks).toString('utf8');
}

async function parseBody(req: IncomingMessage): Promise<Record<string, string>> {
  const raw = await readBody(req);
  const ct = String(req.headers['content-type'] || '');
  if (ct.includes('application/json')) {
    try {
      const obj = JSON.parse(raw || '{}') as Record<string, unknown>;
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(obj)) {
        if (v == null) continue;
        out[k] = typeof v === 'string' ? v : String(v);
      }
      return out;
    } catch {
      return {};
    }
  }
  const params = new URLSearchParams(raw);
  const out: Record<string, string> = {};
  for (const [k, v] of params.entries()) out[k] = v;
  return out;
}

function pruneExpired(): void {
  const now = Date.now();
  for (const [k, v] of codes) if (v.expires_at < now) codes.delete(k);
  for (const [k, v] of accessTokens) if (v.expires_at < now) accessTokens.delete(k);
  for (const [k, v] of refreshTokens) if (v.expires_at < now) refreshTokens.delete(k);
}

function isAllowedRedirect(uri: string): boolean {
  try {
    const u = new URL(uri);
    if (u.protocol === 'https:') return true;
    if (u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1')) {
      return true;
    }
    // ChatGPT / OpenAI callbacks
    if (u.hostname.endsWith('openai.com') || u.hostname.endsWith('chatgpt.com')) return true;
    return false;
  } catch {
    return false;
  }
}

function resourceMetadata(deps: OAuthDeps) {
  const resource = `${deps.publicBaseUrl}${deps.mcpPath}`;
  return {
    resource,
    authorization_servers: [deps.publicBaseUrl],
    scopes_supported: ['mcp', 'openid', 'profile', 'email'],
    bearer_methods_supported: ['header'],
    resource_documentation: `${deps.publicBaseUrl}/info`,
  };
}

function asMetadata(deps: OAuthDeps) {
  return {
    issuer: deps.publicBaseUrl,
    authorization_endpoint: `${deps.publicBaseUrl}/authorize`,
    token_endpoint: `${deps.publicBaseUrl}/token`,
    registration_endpoint: `${deps.publicBaseUrl}/register`,
    revocation_endpoint: `${deps.publicBaseUrl}/revoke`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none', 'client_secret_post', 'client_secret_basic'],
    scopes_supported: ['mcp', 'openid', 'profile', 'email'],
    client_id_metadata_document_supported: true,
  };
}

function loginPage(opts: {
  error?: string;
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  scope: string;
  resource: string;
  responseType: string;
}): string {
  const err = opts.error
    ? `<p class="err">${escapeHtml(opts.error)}</p>`
    : '';
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Login MCP · Planeje</title>
  <style>
    :root { color-scheme: light dark; --bg:#0f1419; --card:#1a222c; --fg:#f4f7fb; --muted:#9aa7b5; --accent:#7c3aed; --err:#f87171; }
    * { box-sizing: border-box; }
    body { margin:0; min-height:100vh; display:grid; place-items:center; font-family: ui-sans-serif, system-ui, sans-serif;
      background: radial-gradient(1200px 600px at 20% -10%, #3b1d6e55, transparent), var(--bg); color: var(--fg); }
    .card { width:min(420px,92vw); background:var(--card); border:1px solid #2b3642; border-radius:16px; padding:28px; }
    h1 { margin:0 0 6px; font-size:1.35rem; }
    p { margin:0 0 18px; color:var(--muted); font-size:.92rem; line-height:1.45; }
    label { display:block; font-size:.8rem; margin:12px 0 6px; color:var(--muted); }
    input { width:100%; padding:12px 14px; border-radius:10px; border:1px solid #334155; background:#0b1220; color:var(--fg); }
    button { margin-top:18px; width:100%; padding:12px 14px; border:0; border-radius:10px; background:linear-gradient(135deg,#7c3aed,#db2777);
      color:white; font-weight:600; cursor:pointer; }
    .err { color:var(--err); background:#3f1d1d55; border:1px solid #7f1d1d88; padding:10px 12px; border-radius:10px; }
    .hint { font-size:.75rem; margin-top:14px; }
  </style>
</head>
<body>
  <form class="card" method="POST" action="/authorize">
    <h1>Planeje MCP</h1>
    <p>Entre com sua conta da equipe para autorizar o ChatGPT / cliente MCP.</p>
    ${err}
    <input type="hidden" name="response_type" value="${escapeHtml(opts.responseType)}"/>
    <input type="hidden" name="client_id" value="${escapeHtml(opts.clientId)}"/>
    <input type="hidden" name="redirect_uri" value="${escapeHtml(opts.redirectUri)}"/>
    <input type="hidden" name="state" value="${escapeHtml(opts.state)}"/>
    <input type="hidden" name="code_challenge" value="${escapeHtml(opts.codeChallenge)}"/>
    <input type="hidden" name="code_challenge_method" value="${escapeHtml(opts.codeChallengeMethod)}"/>
    <input type="hidden" name="scope" value="${escapeHtml(opts.scope)}"/>
    <input type="hidden" name="resource" value="${escapeHtml(opts.resource)}"/>
    <label>E-mail</label>
    <input type="email" name="email" required autocomplete="username"/>
    <label>Senha</label>
    <input type="password" name="password" required autocomplete="current-password"/>
    <button type="submit">Entrar e autorizar</button>
    <p class="hint">Somente superadmin, admin ou colaborador.</p>
  </form>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function authenticateTeamUser(
  deps: OAuthDeps,
  email: string,
  password: string
): Promise<{ ok: true; user: OAuthUser } | { ok: false; error: string }> {
  const authClient = createClient(deps.supabaseUrl, deps.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await authClient.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    return { ok: false, error: 'E-mail ou senha inválidos.' };
  }

  const user = await loadApprovedTeamUser(deps.supabaseAdmin, data.user.id);
  if (!user) return { ok: false, error: 'Seu acesso à equipe ainda não está autorizado.' };
  return { ok: true, user };
}

function issueTokens(
  clientId: string,
  user: OAuthUser,
  scope: string,
  resource?: string
): { access_token: string; refresh_token: string; expires_in: number; token_type: 'Bearer'; scope: string } {
  const access = randomToken('oat_');
  const refresh = randomToken('ort_');
  const now = Date.now();
  accessTokens.set(access, {
    token: access,
    client_id: clientId,
    user,
    scope,
    resource,
    expires_at: now + ACCESS_TTL_MS,
    refresh_token: refresh,
  });
  refreshTokens.set(refresh, {
    token: refresh,
    client_id: clientId,
    user,
    scope,
    resource,
    expires_at: now + REFRESH_TTL_MS,
  });
  return {
    access_token: access,
    refresh_token: refresh,
    expires_in: Math.floor(ACCESS_TTL_MS / 1000),
    token_type: 'Bearer',
    scope,
  };
}

export function verifyOAuthAccessToken(token: string): OAuthUser | null {
  pruneExpired();
  const row = accessTokens.get(token);
  if (!row || row.expires_at < Date.now()) {
    if (row) accessTokens.delete(token);
    return null;
  }
  return row.user;
}

export function wwwAuthenticateHeader(deps: OAuthDeps): string {
  const meta = `${deps.publicBaseUrl}/.well-known/oauth-protected-resource`;
  return `Bearer realm="planeje-mcp", resource_metadata="${meta}"`;
}

/** Retorna true se a rota foi tratada. */
export async function handleOAuthHttp(
  req: IncomingMessage,
  res: ServerResponse,
  deps: OAuthDeps
): Promise<boolean> {
  pruneExpired();
  const url = readUrl(req, deps.publicBaseUrl);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const method = req.method ?? 'GET';

  // --- Discovery ---
  if (
    method === 'GET' &&
    (path === '/.well-known/oauth-protected-resource' ||
      path === '/.well-known/oauth-protected-resource/mcp' ||
      path === `${deps.mcpPath}/.well-known/oauth-protected-resource`)
  ) {
    json(res, 200, resourceMetadata(deps));
    return true;
  }

  if (
    method === 'GET' &&
    (path === '/.well-known/oauth-authorization-server' ||
      path === '/.well-known/oauth-authorization-server/mcp' ||
      path === '/.well-known/openid-configuration' ||
      path === '/.well-known/openid-configuration/mcp' ||
      path === `${deps.mcpPath}/.well-known/openid-configuration` ||
      path === `${deps.mcpPath}/.well-known/oauth-authorization-server`)
  ) {
    json(res, 200, asMetadata(deps));
    return true;
  }

  // --- Dynamic Client Registration ---
  if (method === 'POST' && path === '/register') {
    return handleRegisterJson(req, res, deps);
  }

  // --- Authorize ---
  if (path === '/authorize' && (method === 'GET' || method === 'POST')) {
    const params =
      method === 'GET' ? Object.fromEntries(url.searchParams.entries()) : await parseBody(req);

    const clientId = params.client_id || '';
    const redirectUri = params.redirect_uri || '';
    const state = params.state || '';
    const codeChallenge = params.code_challenge || '';
    const codeChallengeMethod = params.code_challenge_method || 'S256';
    const scope = params.scope || 'mcp';
    const resource = params.resource || `${deps.publicBaseUrl}${deps.mcpPath}`;
    const responseType = params.response_type || 'code';

    if (responseType !== 'code') {
      json(res, 400, { error: 'unsupported_response_type' });
      return true;
    }
    if (!clientId || !redirectUri || !codeChallenge) {
      html(
        res,
        400,
        loginPage({
          error: 'Pedido OAuth incompleto (client_id, redirect_uri, code_challenge).',
          clientId,
          redirectUri,
          state,
          codeChallenge,
          codeChallengeMethod,
          scope,
          resource,
          responseType,
        })
      );
      return true;
    }
    if (codeChallengeMethod !== 'S256') {
      json(res, 400, { error: 'invalid_request', error_description: 'Somente S256 é suportado.' });
      return true;
    }
    if (!isAllowedRedirect(redirectUri)) {
      json(res, 400, { error: 'invalid_request', error_description: 'redirect_uri não permitido.' });
      return true;
    }

    // Auto-register unknown public clients (CIMD / ChatGPT) on first authorize
    let client = clients.get(clientId);
    if (!client) {
      client = {
        client_id: clientId,
        redirect_uris: [redirectUri],
        token_endpoint_auth_method: 'none',
        client_name: 'dynamic-client',
        created_at: Date.now(),
      };
      clients.set(clientId, client);
    } else if (!client.redirect_uris.includes(redirectUri) && isAllowedRedirect(redirectUri)) {
      client.redirect_uris.push(redirectUri);
    }

    if (method === 'GET') {
      html(
        res,
        200,
        loginPage({
          clientId,
          redirectUri,
          state,
          codeChallenge,
          codeChallengeMethod,
          scope,
          resource,
          responseType,
        })
      );
      return true;
    }

    const email = (params.email || '').trim();
    const password = params.password || '';
    if (!email || !password) {
      html(
        res,
        400,
        loginPage({
          error: 'Informe e-mail e senha.',
          clientId,
          redirectUri,
          state,
          codeChallenge,
          codeChallengeMethod,
          scope,
          resource,
          responseType,
        })
      );
      return true;
    }

    const auth = await authenticateTeamUser(deps, email, password);
    if (!auth.ok) {
      html(
        res,
        401,
        loginPage({
          error: auth.error,
          clientId,
          redirectUri,
          state,
          codeChallenge,
          codeChallengeMethod,
          scope,
          resource,
          responseType,
        })
      );
      return true;
    }

    const code = randomToken('oac_');
    codes.set(code, {
      code,
      client_id: clientId,
      redirect_uri: redirectUri,
      code_challenge: codeChallenge,
      code_challenge_method: codeChallengeMethod,
      scope,
      resource,
      user: auth.user,
      expires_at: Date.now() + CODE_TTL_MS,
    });

    const redirect = new URL(redirectUri);
    redirect.searchParams.set('code', code);
    if (state) redirect.searchParams.set('state', state);
    res.statusCode = 302;
    res.setHeader('Location', redirect.toString());
    res.end();
    return true;
  }

  // --- Token ---
  if (method === 'POST' && path === '/token') {
    const body = await parseBody(req);
    const grantType = body.grant_type || '';

    if (grantType === 'authorization_code') {
      const code = body.code || '';
      const redirectUri = body.redirect_uri || '';
      const codeVerifier = body.code_verifier || '';
      const clientId = body.client_id || '';
      const row = codes.get(code);
      codes.delete(code);

      if (!row || row.expires_at < Date.now()) {
        json(res, 400, { error: 'invalid_grant', error_description: 'Código inválido ou expirado.' });
        return true;
      }
      if (clientId && row.client_id !== clientId) {
        json(res, 400, { error: 'invalid_grant', error_description: 'client_id não confere.' });
        return true;
      }
      if (row.redirect_uri !== redirectUri) {
        json(res, 400, { error: 'invalid_grant', error_description: 'redirect_uri não confere.' });
        return true;
      }
      const challenge = sha256Base64Url(codeVerifier);
      if (!safeEqual(challenge, row.code_challenge)) {
        json(res, 400, { error: 'invalid_grant', error_description: 'PKCE inválido.' });
        return true;
      }

      const approved = await loadApprovedTeamUser(deps.supabaseAdmin, row.user.user_id);
      if (!approved) {
        json(res, 400, { error: 'invalid_grant' });
        return true;
      }
      const tokens = issueTokens(row.client_id, approved, row.scope, row.resource);
      json(res, 200, tokens);
      return true;
    }

    if (grantType === 'refresh_token') {
      const refresh = body.refresh_token || '';
      const row = refreshTokens.get(refresh);
      if (!row || row.expires_at < Date.now()) {
        json(res, 400, { error: 'invalid_grant' });
        return true;
      }
      const approved = await loadApprovedTeamUser(deps.supabaseAdmin, row.user.user_id);
      if (!approved) {
        json(res, 400, { error: 'invalid_grant' });
        return true;
      }
      const tokens = issueTokens(row.client_id, approved, row.scope, row.resource);
      // rotate refresh
      refreshTokens.delete(refresh);
      json(res, 200, tokens);
      return true;
    }

    json(res, 400, { error: 'unsupported_grant_type' });
    return true;
  }

  // --- Revoke ---
  if (method === 'POST' && path === '/revoke') {
    const body = await parseBody(req);
    const token = body.token || '';
    accessTokens.delete(token);
    refreshTokens.delete(token);
    res.statusCode = 200;
    res.end();
    return true;
  }

  return false;
}

/** parseBody melhorado para registration JSON com arrays — usado só em register via wrapper */
export async function handleRegisterJson(
  req: IncomingMessage,
  res: ServerResponse,
  deps: OAuthDeps
): Promise<boolean> {
  const url = readUrl(req, deps.publicBaseUrl);
  if ((req.method ?? '') !== 'POST' || url.pathname.replace(/\/+$/, '') !== '/register') {
    return false;
  }

  const raw = await readBody(req);
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(raw || '{}') as Record<string, unknown>;
  } catch {
    parsed = Object.fromEntries(new URLSearchParams(raw).entries());
  }

  let redirectUris: string[] = [];
  if (Array.isArray(parsed.redirect_uris)) {
    redirectUris = parsed.redirect_uris.map(String);
  } else if (typeof parsed.redirect_uris === 'string') {
    redirectUris = [parsed.redirect_uris];
  } else if (typeof parsed.redirect_uri === 'string') {
    redirectUris = [parsed.redirect_uri];
  }

  redirectUris = redirectUris.filter(isAllowedRedirect);
  if (!redirectUris.length) {
    json(res, 400, {
      error: 'invalid_redirect_uri',
      error_description: 'Informe ao menos um redirect_uri https ou localhost.',
    });
    return true;
  }

  const authMethod =
    typeof parsed.token_endpoint_auth_method === 'string'
      ? parsed.token_endpoint_auth_method
      : 'none';
  const clientId = randomToken('mcpcli_');
  const client: OAuthClient = {
    client_id: clientId,
    redirect_uris: redirectUris,
    token_endpoint_auth_method: authMethod,
    client_name: typeof parsed.client_name === 'string' ? parsed.client_name : 'mcp-client',
    created_at: Date.now(),
  };
  if (authMethod !== 'none') client.client_secret = randomToken('mcs_', 24);
  clients.set(clientId, client);

  json(res, 201, {
    client_id: client.client_id,
    client_secret: client.client_secret,
    client_id_issued_at: Math.floor(client.created_at / 1000),
    redirect_uris: client.redirect_uris,
    token_endpoint_auth_method: client.token_endpoint_auth_method,
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    client_name: client.client_name,
  });
  return true;
}

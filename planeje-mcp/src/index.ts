import { loadApprovedTeamUser, sameMcpActor } from './accountAccess.js';
import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { loadEnvFromFile } from './loadEnv.js';

loadEnvFromFile();
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import {
  FALLBACK_COLUMNS,
  introspectColumnsFromSupabase,
  type TableColumnMap,
} from './introspect.js';
import { registerPlanejeTools } from './tools.js';
import { buildServerInstructions, registerPageResources } from './metaTools.js';
import { pageUrl } from './pages.js';
import {
  handleOAuthHttp,
  verifyOAuthAccessToken,
  wwwAuthenticateHeader,
  type OAuthDeps,
} from './oauth.js';
import { applyChatgptToolBudget, isChatgptOAuthActor } from './chatgptToolBudget.js';

const PORT = Number(process.env.PORT ?? 3100);
const MCP_PATH = '/mcp';
const MCP_API_KEY = process.env.MCP_API_KEY?.trim() || '';
const PUBLIC_MCP_URL = process.env.MCP_PUBLIC_URL?.trim() || '';
const PUBLIC_BASE_URL = (
  process.env.MCP_PUBLIC_BASE_URL?.trim() ||
  PUBLIC_MCP_URL.replace(/\/mcp\/?$/, '') ||
  'https://mcp.planeje.jbapex.com.br'
).replace(/\/$/, '');
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY?.trim() || '';
/** Se true/1, permite acesso sem Bearer (só para emergência/dev). */
const MCP_ALLOW_ANON = ['1', 'true', 'yes'].includes(
  (process.env.MCP_ALLOW_ANON ?? '').trim().toLowerCase()
);
/** Sessões idle acima disso são encerradas (evita vazamento de memória). */
const SESSION_IDLE_MS = Number(process.env.MCP_SESSION_IDLE_MS ?? 60 * 60 * 1000);

type McpActor =
  | { type: 'user'; user_id: string; full_name: string | null; role: string; label: string; token_prefix: string }
  | { type: 'admin_key' }
  | { type: 'anon' };

type SessionEntry = {
  transport: StreamableHTTPServerTransport;
  server: McpServer;
  lastUsedAt: number;
  actor: McpActor;
};

/** Transporte persistente por sessão (Streamable HTTP stateful). */
const sessions = new Map<string, SessionEntry>();

function touchSession(sessionId: string): void {
  const entry = sessions.get(sessionId);
  if (entry) entry.lastUsedAt = Date.now();
}

function removeSession(sessionId: string): void {
  const entry = sessions.get(sessionId);
  if (!entry) return;
  sessions.delete(sessionId);
  void entry.server.close().catch(() => undefined);
}

function pruneIdleSessions(): void {
  const now = Date.now();
  for (const [id, entry] of sessions) {
    if (now - entry.lastUsedAt > SESSION_IDLE_MS) {
      console.log(`[planeje-mcp] Encerrando sessão idle ${id}`);
      void entry.transport.close().catch(() => undefined);
      removeSession(id);
    }
  }
}

function jsonRpcError(
  res: ServerResponse,
  status: number,
  code: number,
  message: string
): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ jsonrpc: '2.0', error: { code, message }, id: null }));
}

function readSessionId(req: IncomingMessage): string | undefined {
  const raw = req.headers['mcp-session-id'];
  if (typeof raw === 'string' && raw.trim()) return raw.trim();
  if (Array.isArray(raw) && typeof raw[0] === 'string' && raw[0].trim()) return raw[0].trim();
  return undefined;
}

/** Alguns clientes (fetch, curl) omitem Accept completo — o SDK exige ambos. */
function ensureMcpAcceptHeader(req: IncomingMessage): void {
  const accept = typeof req.headers.accept === 'string' ? req.headers.accept : '';
  const hasJson = accept.includes('application/json');
  const hasSse = accept.includes('text/event-stream');
  if (hasJson && hasSse) return;

  const value = 'application/json, text/event-stream';
  req.headers.accept = value;

  // @hono/node-server monta o Request a partir de rawHeaders
  if (Array.isArray(req.rawHeaders)) {
    let found = false;
    for (let i = 0; i < req.rawHeaders.length; i += 2) {
      if (String(req.rawHeaders[i]).toLowerCase() === 'accept') {
        req.rawHeaders[i + 1] = value;
        found = true;
      }
    }
    if (!found) {
      req.rawHeaders.push('Accept', value);
    }
  }
}

function isJsonRpcRequestLike(body: unknown): boolean {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return false;
  const m = (body as { method?: unknown }).method;
  return typeof m === 'string' && m.length > 0;
}

function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(Buffer.from(c)));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw.trim()) {
        resolve(undefined);
        return;
      }
      try {
        resolve(JSON.parse(raw) as unknown);
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function setCors(res: ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, mcp-session-id, Accept, X-API-Key'
  );
}

function extractPresentedToken(req: IncomingMessage): string | null {
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) {
    const bearer = auth.slice(7).trim();
    if (bearer) return bearer;
  }
  const apiKey = req.headers['x-api-key'];
  if (typeof apiKey === 'string' && apiKey.trim()) return apiKey.trim();
  return null;
}

async function verifyUserToken(
  supabase: SupabaseClient,
  token: string
): Promise<Extract<McpActor, { type: 'user' }> | null> {
  try {
    const { data, error } = await supabase.rpc('verify_mcp_user_token', { p_token: token });
    if (error || !data || typeof data !== 'object') return null;
    const row = data as Record<string, unknown>;
    if (typeof row.user_id !== 'string') return null;
    return {
      type: 'user',
      user_id: row.user_id,
      full_name: typeof row.full_name === 'string' ? row.full_name : null,
      role: typeof row.role === 'string' ? row.role : 'colaborador',
      label: typeof row.label === 'string' ? row.label : 'default',
      token_prefix: typeof row.token_prefix === 'string' ? row.token_prefix : '',
    };
  } catch {
    return null;
  }
}

async function resolveAuth(
  req: IncomingMessage,
  supabase: SupabaseClient
): Promise<{ ok: true; actor: McpActor } | { ok: false }> {
  const token = extractPresentedToken(req);

  if (token && MCP_API_KEY && token === MCP_API_KEY) {
    return { ok: true, actor: { type: 'admin_key' } };
  }

  if (token) {
    // Token OAuth (ChatGPT) — prefixo oat_
    if (token.startsWith('oat_')) {
      const oauthUser = verifyOAuthAccessToken(token);
      const approved = oauthUser && await loadApprovedTeamUser(supabase, oauthUser.user_id);
      if (approved) {
        return {
          ok: true,
          actor: {
            type: 'user',
            user_id: approved.user_id,
            full_name: approved.full_name,
            role: approved.role,
            label: 'oauth',
            token_prefix: token.slice(0, 12),
          },
        };
      }
      return { ok: false };
    }

    const user = await verifyUserToken(supabase, token);
    if (user) {
      const approved = await loadApprovedTeamUser(supabase, user.user_id);
      if (approved) return { ok: true, actor: { ...user, ...approved } };
    }
    return { ok: false };
  }

  if (MCP_ALLOW_ANON) {
    return { ok: true, actor: { type: 'anon' } };
  }

  return { ok: false };
}

function unauthorized(res: ServerResponse, oauthDeps?: OAuthDeps): void {
  res.statusCode = 401;
  res.setHeader('Content-Type', 'application/json');
  if (oauthDeps) {
    res.setHeader('WWW-Authenticate', wwwAuthenticateHeader(oauthDeps));
  }
  res.end(
    JSON.stringify({
      error: 'Não autorizado',
      hint:
        'Use OAuth (ChatGPT), token MCP pessoal (Configurações → Conta) ou MCP_API_KEY admin.',
    })
  );
}

function actorLabel(actor: McpActor): string {
  if (actor.type === 'user') return `${actor.full_name || actor.user_id} (${actor.role})`;
  if (actor.type === 'admin_key') return 'admin_key';
  return 'anon';
}

function buildMcpServer(
  supabase: SupabaseClient,
  columns: TableColumnMap,
  actor: McpActor
): McpServer {
  const who =
    actor.type === 'user'
      ? `Sessão autenticada como ${actor.full_name || actor.user_id} (role=${actor.role}).`
      : actor.type === 'admin_key'
        ? 'Sessão autenticada com MCP_API_KEY (admin).'
        : 'Sessão anônima (MCP_ALLOW_ANON).';

  const mcp = new McpServer(
    { name: 'planeje-mcp', version: '2.9.2' },
    {
      capabilities: {
        tools: {},
        resources: {},
      },
      instructions: `${buildServerInstructions()}\n\n${who}`,
    }
  );
  registerPlanejeTools(mcp, supabase, columns, actor);
  registerPageResources(mcp);

  mcp.registerTool(
    'quem_sou_eu',
    {
      title: 'Quem sou eu',
      description: 'Retorna o usuário da equipe autenticado nesta sessão MCP (token pessoal).',
      inputSchema: z.object({}),
    },
    async () => ({
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(
            actor.type === 'user'
              ? {
                  autenticado: true,
                  user_id: actor.user_id,
                  full_name: actor.full_name,
                  role: actor.role,
                  label: actor.label,
                  token_prefix: actor.token_prefix,
                }
              : { autenticado: actor.type !== 'anon', tipo: actor.type },
            null,
            2
          ),
        },
      ],
    })
  );

  // ChatGPT OAuth: corta tools/list para o núcleo (inclui criar/listar_demandas_caixa).
  if (isChatgptOAuthActor(actor)) {
    applyChatgptToolBudget(mcp);
  }

  return mcp;
}

function mcpEndpoint(req: IncomingMessage): string {
  const host = req.headers.host ?? 'localhost';
  const proto = req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
  if (PUBLIC_MCP_URL) return `${PUBLIC_MCP_URL.replace(/\/$/, '')}${MCP_PATH}`;
  return `${proto}://${host}${MCP_PATH}`;
}

function connectionInfo(req: IncomingMessage) {
  const url = mcpEndpoint(req);
  const authNote = MCP_ALLOW_ANON
    ? 'Anon permitido (MCP_ALLOW_ANON). Preferível: OAuth, token pessoal ou MCP_API_KEY.'
    : 'Requer OAuth (ChatGPT), token MCP pessoal (Bearer) da equipe, ou MCP_API_KEY admin.';

  return {
    service: 'planeje-mcp',
    version: '2.9.2',
    transport: 'streamable-http-stateful',
    sessions_ativas: sessions.size,
    endpoint: url,
    health: url.replace(/\/mcp\/?$/, '/health'),
    app_url: pageUrl('/'),
    auth: authNote,
    auth_modes: [
      'oauth',
      'user_token',
      ...(MCP_API_KEY ? ['admin_key'] : []),
      ...(MCP_ALLOW_ANON ? ['anon'] : []),
    ],
    oauth: {
      authorize: `${PUBLIC_BASE_URL}/authorize`,
      token: `${PUBLIC_BASE_URL}/token`,
      register: `${PUBLIC_BASE_URL}/register`,
      protected_resource: `${PUBLIC_BASE_URL}/.well-known/oauth-protected-resource`,
      authorization_server: `${PUBLIC_BASE_URL}/.well-known/oauth-authorization-server`,
    },
    clientes_compatíveis: [
      'Cursor (Settings → MCP → URL)',
      'Claude Desktop (mcpServers com type streamable-http)',
      'ChatGPT / OpenAI (Remote MCP)',
      'Qualquer SDK @modelcontextprotocol/sdk',
    ],
    exemplos: {
      cursor: {
        url,
        headers: { Authorization: 'Bearer mcp_<token_gerado_em_Configuracoes>' },
      },
      claude_desktop: {
        mcpServers: {
          planeje: {
            type: 'streamable-http',
            url,
            headers: { Authorization: 'Bearer mcp_<token_gerado_em_Configuracoes>' },
          },
        },
      },
    },
    resources: [
      'planeje://paginas/catalogo',
      'planeje://modulos/catalogo',
      'planeje://ferramentas/catalogo',
    ],
    tools_destaque: [
      'meus_modulos',
      'listar_abas',
      'ler_aba',
      'ver_rotina_semanal',
      'ver_relatorio_trafego',
      'listar_publicacoes_sociais',
      'ver_integracoes_cliente',
      'listar_google_dados',
      'listar_paginas',
      'listar_clientes',
    ],
  };
}

async function createStatefulSession(
  columns: TableColumnMap,
  supabase: SupabaseClient,
  actor: McpActor
): Promise<SessionEntry> {
  const server = buildMcpServer(supabase, columns, actor);
  let created!: SessionEntry;

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    // JSON evita falhas de parse SSE em clientes baseados em fetch ("fetch failed")
    enableJsonResponse: true,
    onsessioninitialized: (id) => {
      sessions.set(id, created);
      created.lastUsedAt = Date.now();
      console.log(
        `[planeje-mcp] Sessão iniciada ${id} actor=${actorLabel(actor)} (ativas=${sessions.size})`
      );
    },
    onsessionclosed: (id) => {
      removeSession(id);
      console.log(`[planeje-mcp] Sessão fechada ${id} (ativas=${sessions.size})`);
    },
  });

  created = { transport, server, lastUsedAt: Date.now(), actor };
  transport.onclose = () => {
    const id = transport.sessionId;
    if (id) removeSession(id);
  };

  await server.connect(transport);
  return created;
}

/** Um request isolado sem sessão (compat com clientes que perdem o header). */
async function handleStatelessPost(
  req: IncomingMessage,
  res: ServerResponse,
  parsedBody: unknown,
  columns: TableColumnMap,
  supabase: SupabaseClient,
  actor: McpActor
): Promise<void> {
  const server = buildMcpServer(supabase, columns, actor);
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, parsedBody);
  } finally {
    try {
      await transport.close();
    } catch {
      /* ignore */
    }
    try {
      await server.close();
    } catch {
      /* ignore */
    }
  }
}

async function handleMcp(
  req: IncomingMessage,
  res: ServerResponse,
  columns: TableColumnMap,
  supabase: SupabaseClient,
  oauthDeps: OAuthDeps
): Promise<void> {
  setCors(res);
  res.setHeader('X-Accel-Buffering', 'no');

  const auth = await resolveAuth(req, supabase);
  if (!auth.ok) {
    unauthorized(res, oauthDeps);
    return;
  }
  const actor = auth.actor;

  ensureMcpAcceptHeader(req);

  const method = req.method ?? 'GET';
  const sessionId = readSessionId(req);
  const existing = sessionId ? sessions.get(sessionId) : undefined;

  if (existing && !sameMcpActor(existing.actor, actor)) {
    jsonRpcError(res, 403, -32001, 'Sessão não pertence a este acesso. Inicie uma nova conexão.');
    return;
  }

  // Probe GET sem sessão: 405 rápido (Streamable HTTP via POST), não 400/hang.
  if (method === 'GET' && !sessionId) {
    res.statusCode = 405;
    res.setHeader('Allow', 'POST');
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'Method Not Allowed: use POST Streamable HTTP (initialize) on /mcp',
        },
        id: null,
        hint: {
          endpoint: '/mcp',
          transport: 'streamable-http',
          info: '/info',
        },
      })
    );
    return;
  }

  if ((method === 'GET' || method === 'DELETE') && sessionId && !existing) {
    jsonRpcError(res, 404, -32001, 'Session not found');
    return;
  }

  let parsedBody: unknown;
  if (method === 'POST') {
    try {
      parsedBody = await readJsonBody(req);
    } catch {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'JSON inválido no corpo da requisição' }));
      return;
    }
  }

  try {
    // initialize: sempre abre sessão nova (ignora session id stale)
    if (method === 'POST' && isInitializeRequest(parsedBody)) {
      const entry = await createStatefulSession(columns, supabase, actor);
      await entry.transport.handleRequest(req, res, parsedBody);
      if (entry.transport.sessionId) touchSession(entry.transport.sessionId);
      return;
    }

    if (existing) {
      touchSession(sessionId!);
      await existing.transport.handleRequest(req, res, parsedBody);
      touchSession(sessionId!);
      return;
    }

    if (sessionId) {
      jsonRpcError(res, 404, -32001, 'Session not found');
      return;
    }

    // POST sem sessão (tools/list, tools/call, etc.): fallback stateless
    if (method === 'POST' && isJsonRpcRequestLike(parsedBody)) {
      console.log(
        `[planeje-mcp] Fallback stateless method=${(parsedBody as { method: string }).method} actor=${actorLabel(actor)}`
      );
      await handleStatelessPost(req, res, parsedBody, columns, supabase, actor);
      return;
    }

    if (method === 'POST') {
      // notification sem sessão (ex.: notifications/initialized órfã)
      res.statusCode = 202;
      res.end();
      return;
    }

    jsonRpcError(res, 400, -32000, 'Bad Request: No valid session ID provided');
  } catch (e) {
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          error: e instanceof Error ? e.message : 'Erro interno no transporte MCP',
        })
      );
    }
  }
}

async function main(): Promise<void> {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !key) {
    console.warn(
      '[planeje-mcp] SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY ausentes. As tools falharão nas queries até configurar o .env.'
    );
  }

  if (MCP_ALLOW_ANON) {
    console.warn('[planeje-mcp] MCP_ALLOW_ANON ativo — acesso sem token permitido (só emergência/dev).');
  } else {
    console.log('[planeje-mcp] Auth obrigatória: token pessoal da equipe ou MCP_API_KEY.');
  }
  if (!MCP_API_KEY) {
    console.warn('[planeje-mcp] MCP_API_KEY não definida (ok se usar só tokens pessoais / OAuth).');
  }
  if (!SUPABASE_ANON_KEY) {
    console.warn(
      '[planeje-mcp] SUPABASE_ANON_KEY ausente — login OAuth (/authorize) não autenticará usuários.'
    );
  }

  const supabase = createClient(url ?? 'https://placeholder.supabase.co', key ?? 'placeholder', {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const oauthDeps: OAuthDeps = {
    publicBaseUrl: PUBLIC_BASE_URL,
    mcpPath: MCP_PATH,
    supabaseUrl: url ?? '',
    supabaseAnonKey: SUPABASE_ANON_KEY,
    supabaseAdmin: supabase,
  };

  let columns: TableColumnMap = { ...FALLBACK_COLUMNS };
  if (url && key) {
    try {
      const { columns: live, warnings } = await introspectColumnsFromSupabase(url, key);
      columns = { ...FALLBACK_COLUMNS, ...live };
      for (const w of warnings) console.warn(`[planeje-mcp] introspect: ${w}`);
      console.log('[planeje-mcp] Schema (OpenAPI) mesclado com fallback.');
    } catch (e) {
      console.warn(
        `[planeje-mcp] Falha na introspecção OpenAPI: ${e instanceof Error ? e.message : String(e)} — usando fallback.`
      );
    }
  }

  const server = createServer(async (req, res) => {
    setCors(res);
    const host = req.headers.host ?? 'localhost';
    const pathname = new URL(req.url ?? '/', `http://${host}`).pathname;

    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return;
    }

    if (pathname === '/health' && req.method === 'GET') {
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          ok: true,
          service: 'planeje-mcp',
          porta: PORT,
          version: '2.9.2',
          oauth: true,
        })
      );
      return;
    }

    if ((pathname === '/' || pathname === '/info') && req.method === 'GET') {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(connectionInfo(req), null, 2));
      return;
    }

    // OAuth AS + discovery (ChatGPT)
    if (await handleOAuthHttp(req, res, oauthDeps)) {
      return;
    }

    if (pathname === MCP_PATH || pathname.startsWith(`${MCP_PATH}/`)) {
      await handleMcp(req, res, columns, supabase, oauthDeps);
      return;
    }

    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Não encontrado', use: MCP_PATH, info: '/info' }));
  });

  setInterval(pruneIdleSessions, Math.min(SESSION_IDLE_MS, 5 * 60 * 1000)).unref();

  server.listen(PORT, () => {
    console.log(`[planeje-mcp] HTTP em http://0.0.0.0:${PORT}${MCP_PATH} (Streamable MCP + OAuth)`);
    console.log(`[planeje-mcp] OAuth authorize: ${PUBLIC_BASE_URL}/authorize`);
    console.log(`[planeje-mcp] Info/conexão: http://0.0.0.0:${PORT}/info`);
    console.log(`[planeje-mcp] Health: http://0.0.0.0:${PORT}/health`);
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { loadEnvFromFile } from './loadEnv.js';

loadEnvFromFile();
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  FALLBACK_COLUMNS,
  introspectColumnsFromSupabase,
  type TableColumnMap,
} from './introspect.js';
import { registerPlanejeTools } from './tools.js';

const PORT = Number(process.env.PORT ?? 3100);
const MCP_PATH = '/mcp';

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
    'Content-Type, Authorization, mcp-session-id, Accept'
  );
}

function buildMcpServer(supabase: SupabaseClient, columns: TableColumnMap): McpServer {
  const mcp = new McpServer(
    { name: 'planeje-mcp', version: '1.0.0' },
    {
      capabilities: {
        tools: {},
      },
      instructions:
        'Ferramentas Planeje: clientes, projetos, tarefas, leads, solicitações e resumo por status/responsável. Use service role apenas neste servidor seguro.',
    }
  );
  registerPlanejeTools(mcp, supabase, columns);
  return mcp;
}

async function handleMcp(
  req: IncomingMessage,
  res: ServerResponse,
  columns: TableColumnMap,
  supabase: SupabaseClient
): Promise<void> {
  setCors(res);
  let parsedBody: unknown;
  if (req.method === 'POST') {
    try {
      parsedBody = await readJsonBody(req);
    } catch {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'JSON inválido no corpo da requisição' }));
      return;
    }
  }

  const mcp = buildMcpServer(supabase, columns);
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  try {
    await mcp.connect(transport);
    await transport.handleRequest(req, res, parsedBody);
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
  } finally {
    try {
      await mcp.close();
    } catch {
      /* ignore */
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

  const supabase = createClient(url ?? 'https://placeholder.supabase.co', key ?? 'placeholder', {
    auth: { persistSession: false, autoRefreshToken: false },
  });

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
      res.end(JSON.stringify({ ok: true, service: 'planeje-mcp', porta: PORT }));
      return;
    }

    if (pathname === MCP_PATH || pathname.startsWith(`${MCP_PATH}/`)) {
      await handleMcp(req, res, columns, supabase);
      return;
    }

    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Não encontrado', use: MCP_PATH }));
  });

  server.listen(PORT, () => {
    console.log(`[planeje-mcp] HTTP em http://0.0.0.0:${PORT}${MCP_PATH} (GET/POST streamable MCP)`);
    console.log(`[planeje-mcp] Health: http://0.0.0.0:${PORT}/health`);
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

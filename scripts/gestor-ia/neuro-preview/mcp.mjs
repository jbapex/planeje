import { createRequire } from 'node:module';
import { createClient } from '@supabase/supabase-js';
import { registerPlanejeTools } from '../../../planeje-mcp/src/tools.ts';
import { FALLBACK_COLUMNS } from '../../../planeje-mcp/src/introspect.ts';
import { ACTOR, ROOT } from './db.mjs';
import { createPreviewFetch } from './bridge.mjs';

const require = createRequire(`${ROOT}/planeje-mcp/package.json`);
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { InMemoryTransport } = require('@modelcontextprotocol/sdk/inMemory.js');

export function previewClient(db, role = 'authenticated') {
  return createClient('http://127.0.0.1:4393', 'fixture-only', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: createPreviewFetch(db, role) },
  });
}

export async function createPreviewMcp(db) {
  const server = new McpServer({ name: 'planeje-neuro-disposable-preview', version: '1' });
  registerPlanejeTools(server, previewClient(db, 'service_role'), FALLBACK_COLUMNS, { type: 'user', user_id: ACTOR, role: 'colaborador' });
  const client = new Client({ name: 'neuro-preview-local-client', version: '1' });
  const [left, right] = InMemoryTransport.createLinkedPair();
  await server.connect(right);
  await client.connect(left);
  return { client, close: async () => { await client.close(); await server.close(); } };
}

export function toolPayload(result) {
  if (result.isError) throw new Error(result.content?.[0]?.text || 'MCP tool failed');
  return JSON.parse(result.content[0].text);
}

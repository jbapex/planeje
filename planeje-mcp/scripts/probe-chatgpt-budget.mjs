import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { registerPlanejeTools } from '../src/tools.ts';
import { applyChatgptToolBudget, CHATGPT_TOOL_ALLOWLIST } from '../src/chatgptToolBudget.ts';
import { FALLBACK_COLUMNS } from '../src/introspect.ts';

const supabase = createClient('https://example.supabase.co', 'x', {
  auth: { persistSession: false },
});
const mcp = new McpServer({ name: 't', version: '2.7.0' }, { capabilities: { tools: {} } });
registerPlanejeTools(mcp, supabase, FALLBACK_COLUMNS, {
  type: 'user',
  user_id: 'u',
  full_name: 'T',
  role: 'superadmin',
  label: 'oauth',
  token_prefix: 'oat_x',
});
mcp.registerTool(
  'quem_sou_eu',
  { title: 'x', description: 'x', inputSchema: z.object({}) },
  async () => ({ content: [] })
);

const map = mcp._registeredTools;
const before = Object.entries(map)
  .filter(([, t]) => t.enabled)
  .map(([n]) => n);
console.log(
  'before',
  before.length,
  'criar@',
  before.indexOf('criar_demanda_caixa') + 1,
  'listar@',
  before.indexOf('listar_demandas_caixa') + 1
);

const r = applyChatgptToolBudget(mcp);
console.log('allowlist', CHATGPT_TOOL_ALLOWLIST.length);
console.log('after enabled', r.enabled.length, 'disabled', r.disabled);
console.log(
  'criar',
  r.enabled.includes('criar_demanda_caixa'),
  'listar',
  r.enabled.includes('listar_demandas_caixa')
);
if (r.enabled.length > 58) {
  throw new Error(`still over 58: ${r.enabled.length}`);
}
if (!r.enabled.includes('criar_demanda_caixa') || !r.enabled.includes('listar_demandas_caixa')) {
  throw new Error('missing caixa tools');
}
console.log('OK');

import test from 'node:test';
import assert from 'node:assert/strict';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createClient } from '@supabase/supabase-js';
import { registerPlanejeTools } from '../src/tools.js';

test('installed SDK registers real schemas and rejects invalid input before data access', async () => {
  let reads = 0;
  const supabase = createClient('https://fixture.invalid', 'fixture-only-key', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async () => { reads++; throw new Error('Network forbidden in SDK fixture'); } },
  });
  const server = new McpServer({ name: 'planeje-fixture', version: '1.0.0' });
  const client = new Client({ name: 'planeje-fixture-client', version: '1.0.0' });
  registerPlanejeTools(server, supabase, {});
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  try {
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    const tools = (await client.listTools()).tools;
    for (const name of ['listar_clientes', 'consultar_trafego_meta', 'comparar_periodos_meta']) {
      assert.ok(tools.some(tool => tool.name === name), `Real tool schema missing: ${name}`);
    }
    const history = tools.find(tool => tool.name === 'ver_mensagens_rastreamento');
    assert.ok(history?.inputSchema.properties?.cursor);
    assert.ok(history?.inputSchema.properties?.inicio);
    assert.ok(history?.inputSchema.properties?.canal);
    assert.ok(history?.inputSchema.properties?.busca);
    const research = tools.find(tool => tool.name === 'consultar_historico_cliente');
    assert.ok(research?.inputSchema.properties?.tipo);
    assert.ok(research?.inputSchema.properties?.cursor);
    assert.equal(research?.annotations?.readOnlyHint, true);
    assert.equal(history?.annotations?.readOnlyHint, true);
    const result = await client.callTool({ name: 'listar_clientes', arguments: { limite: -1 } });
    assert.equal(result.isError, true);
    assert.equal(reads, 0);
  } finally {
    await client.close();
    await server.close();
  }
});

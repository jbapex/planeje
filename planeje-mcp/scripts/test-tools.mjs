import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const MCP_URL = process.env.MCP_URL ?? 'http://127.0.0.1:3100/mcp';

async function callTool(client, name, args = {}) {
  const result = await client.callTool({ name, arguments: args });
  const text = result.content?.find((c) => c.type === 'text')?.text ?? JSON.stringify(result);
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = text;
  }
  return { isError: Boolean(result.isError), data: parsed, raw: text.slice(0, 500) };
}

async function main() {
  const client = new Client({ name: 'planeje-mcp-test', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL(MCP_URL));
  await client.connect(transport);

  const tools = await client.listTools();
  console.log(`\n✓ Conectado — ${tools.tools.length} tools registradas\n`);

  const tests = [
    ['listar_paginas', { modulo: 'atendimento' }],
    ['listar_modulos', {}],
    ['listar_abas', { modulo: 'paid_traffic' }],
    ['listar_ferramentas_mcp', { dominio: 'rastreamento' }],
    ['listar_clientes', { limite: 3 }],
    ['listar_conversas', { limite: 5, status: 'aguardando' }],
    ['listar_conversas', { limite: 3, is_group: true }],
    ['listar_tarefas', { limit: 3 }],
    ['listar_equipe', {}],
  ];

  const results = [];
  for (const [name, args] of tests) {
    try {
      const r = await callTool(client, name, args);
      results.push({ name, args, ok: !r.isError, preview: summarize(r.data), error: r.isError ? r.raw : null });
    } catch (e) {
      results.push({ name, args, ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  }

  await transport.close();

  console.log('=== RESULTADOS ===\n');
  for (const r of results) {
    const status = r.ok ? 'OK' : 'FALHA';
    console.log(`[${status}] ${r.name}`, r.args && Object.keys(r.args).length ? JSON.stringify(r.args) : '');
    if (r.preview) console.log('  →', r.preview);
    if (r.error) console.log('  ✗', r.error);
    console.log('');
  }

  const failed = results.filter((r) => !r.ok).length;
  process.exit(failed > 0 ? 1 : 0);
}

function summarize(data) {
  if (!data || typeof data !== 'object') return String(data).slice(0, 120);
  if ('total' in data) return `total=${data.total}`;
  if ('total_ferramentas' in data) return `ferramentas=${data.total_ferramentas}`;
  if ('paginas' in data && Array.isArray(data.paginas)) return `${data.paginas.length} páginas`;
  if ('modulos' in data && Array.isArray(data.modulos)) return `${data.modulos.length} módulos`;
  if ('clientes' in data && Array.isArray(data.clientes)) {
    const names = data.clientes.slice(0, 2).map((c) => c.empresa ?? c.id).join(', ');
    return `${data.total} clientes (ex.: ${names})`;
  }
  if ('conversas' in data && Array.isArray(data.conversas)) {
    const names = data.conversas.slice(0, 2).map((c) => c.display_name ?? c.chat_jid).join(', ');
    return `${data.total} conversas (ex.: ${names || '—'})`;
  }
  if ('tarefas' in data && Array.isArray(data.tarefas)) return `${data.total} tarefas`;
  if ('membros' in data && Array.isArray(data.membros)) return `${data.total} membros`;
  return JSON.stringify(data).slice(0, 120);
}

main().catch((e) => {
  console.error('Erro fatal:', e);
  process.exit(1);
});

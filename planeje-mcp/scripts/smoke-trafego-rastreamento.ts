/**
 * Smoke real: chama as tools de Tráfego e Rastreamento para um cliente.
 * Só leitura. Imprime status e tamanho de cada resposta, não os dados.
 * Uso: npx tsx scripts/smoke-trafego-rastreamento.ts <cliente_id> [telefone]
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createClient } from '@supabase/supabase-js';
import { loadEnvFromFile } from '../src/loadEnv.js';
import { FALLBACK_COLUMNS } from '../src/introspect.js';
import { registerPlanejeTools } from '../src/tools.js';

loadEnvFromFile();

const clienteId = process.argv[2];
const mes = process.argv[3];
const telefone = process.argv[4];
if (!clienteId) {
  console.error('Informe cliente_id');
  process.exit(1);
}

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const mcp = new McpServer({ name: 'smoke', version: '0' }, { capabilities: { tools: {} } });
registerPlanejeTools(mcp, supabase, FALLBACK_COLUMNS, {
  type: 'user',
  user_id: '07d65b46-dd33-4ce6-a98f-8940374c534c',
  role: 'superadmin',
});

const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
await mcp.connect(serverSide);
const client = new Client({ name: 'smoke-client', version: '0' });
await client.connect(clientSide);

const { tools } = await client.listTools();
const names = new Set(tools.map((t) => t.name));

const base: [string, Record<string, unknown>][] = [
  ['consultar_trafego', { aba: 'hoje' }],
  ['consultar_trafego', { aba: 'rotina', cliente_id: clienteId }],
  ['consultar_trafego', { aba: 'relatorio', cliente_id: clienteId }],
  ['consultar_trafego', { aba: 'dashboard', cliente_id: clienteId }],
  ['consultar_trafego', { aba: 'situacao', cliente_id: clienteId }],
  ['consultar_trafego', { aba: 'fila', cliente_id: clienteId }],
  ['consultar_trafego', { aba: 'campaigns', cliente_id: clienteId }],
  ['consultar_trafego', { aba: 'meta-insights', cliente_id: clienteId }],
  ['consultar_trafego', { aba: 'google-insights', cliente_id: clienteId }],
  ['ver_painel_trafego', { cliente_id: clienteId }],
  ['consultar_rastreamento', { aba: 'visao', cliente_id: clienteId }],
  ['consultar_rastreamento', { aba: 'leads', cliente_id: clienteId, ...(telefone ? { telefone } : {}) }],
  ['consultar_rastreamento', { aba: 'relatorio', cliente_id: clienteId }],
  ['consultar_rastreamento', { aba: 'funil', cliente_id: clienteId }],
  ['consultar_rastreamento', { aba: 'eventos', cliente_id: clienteId }],
  ['consultar_rastreamento', { aba: 'links', cliente_id: clienteId }],
  ['consultar_rastreamento', { aba: 'integracoes', cliente_id: clienteId }],
  ['consultar_rastreamento', { aba: 'configuracoes', cliente_id: clienteId }],
  ['ver_mensagens_rastreamento', { cliente_id: clienteId, ...(telefone ? { telefone } : {}) }],
  ['consultar_rastreamento', { aba: 'leads', cliente_id: clienteId, qualificado: true, limite: 5 }],
  ['consultar_rastreamento', { aba: 'leads', cliente_id: clienteId, offset: 50, limite: 5 }],
  ['consultar_rastreamento', { aba: 'eventos', cliente_id: clienteId, busca: 'Purchase' }],
  ['listar_leads_rastreamento', { cliente_id: clienteId, busca: 'a', limite: 3 }],
];
const calls = base.map(
  ([n, a]) => [n, mes && a.aba !== 'hoje' ? { ...a, mes } : a] as [string, Record<string, unknown>]
);

let firstCampaign = '';
let firstAd = '';
let firstLeadPhone = '';

function summarize(value: unknown): string {
  if (!value || typeof value !== 'object') return String(value);
  const out: string[] = [];
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (Array.isArray(v)) out.push(`${k}=${v.length}`);
    else if (v && typeof v === 'object') {
      const inner = v as Record<string, unknown>;
      const bits = Object.entries(inner)
        .filter(([, x]) => Array.isArray(x) || typeof x === 'string' || typeof x === 'number')
        .slice(0, 6)
        .map(([ik, x]) => (Array.isArray(x) ? `${ik}=${x.length}` : `${ik}=${String(x).slice(0, 60)}`));
      out.push(`${k}{${bits.join(', ')}}`);
    }
  }
  return out.join(' | ');
}

let failed = 0;
for (const [name, args] of calls) {
  const label = `${name}${args.aba ? `:${args.aba}` : ''}`;
  if (!names.has(name)) {
    console.log(`FALTA  ${label}`);
    failed += 1;
    continue;
  }
  const started = Date.now();
  try {
    const res = (await client.callTool({ name, arguments: args })) as {
      isError?: boolean;
      content?: { text?: string }[];
    };
    const text = res.content?.[0]?.text || '';
    const ms = Date.now() - started;
    if (res.isError) {
      failed += 1;
      console.log(`ERRO   ${label} (${ms} ms): ${text.slice(0, 200)}`);
      continue;
    }
    const parsed = JSON.parse(text);
    const dados = parsed.dados ?? parsed;
    if (name === 'ver_painel_trafego' && !firstCampaign) {
      const camps = (dados.campanhas || []) as Record<string, any>[];
      const withSet = camps.find((c) => c.conjuntos?.some((s: any) => s.anuncios?.length));
      firstCampaign = String((withSet || camps[0])?.nome || '');
      firstAd = String(withSet?.conjuntos?.find((s: any) => s.anuncios?.length)?.anuncios?.[0]?.id || '');
      const c0 = withSet || camps[0];
      if (c0) {
        const pick = (o: any) =>
          Object.fromEntries(
            ['gasto', 'resultados', 'custo_por_resultado', 'ctr', 'cpc', 'conversas', 'leads', 'compras'].map((k) => [k, o?.[k] ?? null])
          );
        console.log(`       campanha exemplo: conjuntos=${c0.total_conjuntos} métricas=${JSON.stringify(pick(c0))}`);
      }
    }
    if (label === 'consultar_rastreamento:leads' && !firstLeadPhone) {
      firstLeadPhone = String((dados.contatos || [])[0]?.phone || '');
      console.log(`       total_contatos=${dados.total_contatos} total_leads=${dados.total_leads}`);
    }
    console.log(`OK     ${label} (${ms} ms) ${summarize(dados).slice(0, 400)}`);
  } catch (e) {
    failed += 1;
    console.log(`ERRO   ${label}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

const extra: [string, Record<string, unknown>][] = [];
if (firstCampaign) extra.push(['ver_painel_trafego', { cliente_id: clienteId, mes, linha: firstCampaign }]);
if (firstAd) extra.push(['ver_painel_trafego', { cliente_id: clienteId, mes, linha: firstAd }]);
if (firstLeadPhone) {
  extra.push(['consultar_rastreamento', { aba: 'leads', cliente_id: clienteId, busca: firstLeadPhone }]);
  extra.push(['ver_mensagens_rastreamento', { cliente_id: clienteId, telefone: firstLeadPhone, limite: 10 }]);
}
for (const [name, args] of extra) {
  try {
    const res = (await client.callTool({ name, arguments: args })) as { isError?: boolean; content?: { text?: string }[] };
    const text = res.content?.[0]?.text || '';
    if (res.isError) {
      failed += 1;
      console.log(`ERRO   ${name} (linha): ${text.slice(0, 200)}`);
      continue;
    }
    const parsed = JSON.parse(text);
    const dados = parsed.dados ?? parsed;
    const camps = (dados.campanhas || []) as Record<string, any>[];
    const detail = name === 'ver_painel_trafego'
      ? `campanhas=${camps.length} conjuntos=${camps.reduce((s, c) => s + (c.conjuntos?.length || 0), 0)} anuncios=${camps.reduce((s, c) => s + (c.conjuntos || []).reduce((t: number, x: any) => t + (x.anuncios?.length || 0), 0), 0)}`
      : summarize(dados).slice(0, 200);
    console.log(`OK     ${name} (linha específica) ${detail}`);
  } catch (e) {
    failed += 1;
    console.log(`ERRO   ${name} (linha): ${e instanceof Error ? e.message : String(e)}`);
  }
}

await client.close();
process.exit(failed ? 1 : 0);

import test from 'node:test';
import assert from 'node:assert/strict';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { registerPlanejeTools } from '../src/tools.js';
import { loadModuleAccess, denyModule } from '../src/access.js';
import { loadClienteDossie, loadIndicadores, loadDashboardResumo } from '../src/clienteDossie.js';
import { denyTool, TOOL_POLICIES } from '../src/toolAuthorization.js';

const userId = '10000000-0000-4000-8000-000000000001';
const otherId = '10000000-0000-4000-8000-000000000002';
const clientId = '20000000-0000-4000-8000-000000000001';
const actor = { type: 'user' as const, user_id: userId, role: 'colaborador' };
type Row = Record<string, unknown>;

function fixture(options: { tables?: Record<string, Row[]>; fail?: string; role?: string; status?: string } = {}) {
  const requests: { table: string; query: URLSearchParams; method: string }[] = [];
  const tables: Record<string, Row[]> = {
    profiles: [{ id: userId, role: options.role ?? 'colaborador', status: options.status ?? 'active', full_name: 'Pessoa A' }],
    clientes: [{ id: clientId, empresa: 'Fixture A' }],
    module_settings: [], user_module_permissions: [], user_module_access: [], ...options.tables,
  };
  const db = createClient('https://authorization-fixture.invalid', 'fixture-only', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (input, init) => {
      const url = new URL(String(input));
      assert.equal(url.hostname, 'authorization-fixture.invalid');
      if (url.pathname.startsWith('/auth/v1/admin/users/')) return new Response(JSON.stringify({ id: userId, email: 'fixture@example.invalid' }));
      const table = url.pathname.split('/').at(-1)!;
      requests.push({ table, query: url.searchParams, method: init?.method ?? 'GET' });
      if (table === options.fail) return new Response(JSON.stringify({ message: 'fixture permission failure', code: 'XX000' }), { status: 400 });
      let rows = [...(tables[table] ?? [])];
      for (const [key, value] of url.searchParams) {
        if (value.startsWith('eq.')) rows = rows.filter(row => String(row[key]) === value.slice(3));
        if (value.startsWith('in.(')) rows = rows.filter(row => value.slice(4, -1).split(',').includes(String(row[key])));
      }
      const headers = new Headers(init?.headers);
      const single = headers.get('accept')?.includes('application/vnd.pgrst.object+json');
      return new Response(init?.method === 'HEAD' ? null : JSON.stringify(single ? rows[0] ?? null : rows), {
        headers: { 'content-type': 'application/json', 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` },
      });
    } },
  });
  return { db, requests, tables };
}

async function session(f: ReturnType<typeof fixture>, role = 'colaborador') {
  const server = new McpServer({ name: 'auth-fixture', version: '1' });
  registerPlanejeTools(server, f.db, {}, { ...actor, role, full_name: 'Fixture', label: 'fixture', token_prefix: 'fixture' });
  let unguardedCalls = 0;
  server.registerTool('unknown_future_tool', { inputSchema: z.object({}) }, async () => {
    unguardedCalls++;
    return { content: [{ type: 'text', text: 'unguarded' }] };
  });
  const client = new Client({ name: 'fixture-client', version: '1' });
  const [left, right] = InMemoryTransport.createLinkedPair();
  await server.connect(right);
  await client.connect(left);
  return { client, unguardedCalls: () => unguardedCalls, close: async () => { await client.close(); await server.close(); } };
}

test('permission failures deny access instead of treating missing data as enabled', async () => {
  for (const fail of ['module_settings', 'user_module_permissions', 'user_module_access']) {
    const { db } = fixture({ fail });
    await assert.rejects(() => loadModuleAccess(db, actor), /permiss|validar/i);
  }
});

test('module checks deny anonymous and unknown modules but preserve explicit personal overrides', async () => {
  const f = fixture({ tables: {
    module_settings: [{ module_name: 'tasks', is_enabled: false }],
    user_module_permissions: [{ user_id: userId, module_name: 'tasks', is_enabled: true }],
  } });
  const access = await loadModuleAccess(f.db, actor);
  assert.equal(denyModule(access, 'tasks'), null);
  assert.notEqual(denyModule(access, 'not_a_module'), null);
  assert.notEqual(denyModule(await loadModuleAccess(f.db, { type: 'anon' }), 'tasks'), null);
  assert.notEqual(denyModule(access, 'requests'), null);
  assert.notEqual(denyTool(access, 'ler_aba', { modulo: 'settings', aba: 'integracoes' }), null);
  assert.equal(denyTool(access, 'ler_aba', { modulo: 'settings', aba: 'conta' }), null);
});

test('real SDK denies disabled modules before legacy tools read or mutate business data', async () => {
  const f = fixture({ tables: { module_settings: ['clients', 'projects', 'tasks', 'crm', 'paid_traffic', 'atendimento', 'rastreamento', 'onboarding', 'social_media'].map(module_name => ({ module_name, is_enabled: false })) } });
  const s = await session(f);
  try {
    for (const [name, args] of [
      ['listar_clientes', {}], ['criar_cliente', { empresa: 'Blocked' }], ['listar_tarefas', {}],
      ['listar_conversas', {}], ['buscar_leads', {}], ['listar_briefings', {}],
      ['listar_contas_meta_cliente', { cliente_id: clientId }], ['listar_projetos', {}],
      ['listar_publicacoes_sociais', {}], ['consultar_historico_cliente', { cliente_id: clientId, tipo: 'origens' }],
    ] as [string, Record<string, unknown>][]) {
      const result = await s.client.callTool({ name, arguments: args });
      assert.equal(result.isError, true, name);
    }
    assert.ok(f.requests.every(r => ['profiles', 'module_settings', 'user_module_permissions', 'user_module_access'].includes(r.table)));
  } finally { await s.close(); }
});

test('real SDK denies unmapped tools, raw RPC, account changes and role escalation', async () => {
  const f = fixture();
  const s = await session(f);
  try {
    for (const [name, args] of [
      ['unknown_future_tool', {}], ['criar_membro', { full_name: 'Escalated', role: 'superadmin' }],
      ['atualizar_membro', { id: userId, role: 'superadmin' }],
      ['invocar_meta_ads_api', { action: 'anything', ad_account_id: 'act_1' }],
      ['chamar_rpc_criar_campanha', { form_data: {} }],
      ['ler_aba', { modulo: 'settings', aba: 'inventada' }],
    ] as [string, Record<string, unknown>][]) assert.equal((await s.client.callTool({ name, arguments: args })).isError, true, name);
    assert.equal(s.unguardedCalls(), 0);
    f.tables.profiles![0]!.status = 'inactive';
    assert.equal((await s.client.callTool({ name: 'listar_clientes', arguments: {} })).isError, true);
    assert.equal(f.requests.some(r => r.table === 'clientes'), false);
  } finally { await s.close(); }
});

test('source and alias tools enforce their actual module and tab role without unrelated module gates', async () => {
  const f = fixture({ tables: { module_settings: [
    { module_name: 'clients', is_enabled: false }, { module_name: 'paid_traffic', is_enabled: false },
    { module_name: 'rastreamento', is_enabled: true }, { module_name: 'mini_crm', is_enabled: false },
  ] } });
  const access = await loadModuleAccess(f.db, actor);
  assert.equal(denyTool(access, 'listar_google_dados'), null);
  assert.equal(denyTool(access, 'consultar_historico_cliente', { tipo: 'origens' }), null);
  assert.equal(denyTool(access, 'consultar_historico_cliente', { tipo: 'canais' }), null);
  assert.notEqual(denyTool(access, 'consultar_historico_cliente', { tipo: 'observacoes' }), null);
  assert.notEqual(denyTool(access, 'consultar_historico_cliente', { tipo: 'anything' }), null);
  access.modules.paid_traffic = true;
  assert.notEqual(denyTool(access, 'consultar_trafego', { aba: 'campaigns' }), null);
  assert.notEqual(denyTool(access, 'consultar_rastreamento', { aba: 'unknown' }), null);
  assert.equal(denyTool(access, 'consultar_trafego', { aba: 'hoje' }), null);
});

test('manager operations require both role and module; generic raw operations remain superadmin-only', async () => {
  const collaborator = await loadModuleAccess(fixture().db, actor);
  const manager = await loadModuleAccess(fixture({ role: 'admin' }).db, { ...actor, role: 'admin' });
  for (const name of ['criar_campanha_paga', 'criar_status_campanha', 'vincular_conta_meta', 'iniciar_onboarding']) {
    assert.notEqual(denyTool(collaborator, name), null, name);
    assert.equal(denyTool(manager, name), null, name);
  }
  for (const name of ['criar_membro', 'atualizar_membro', 'invocar_meta_ads_api', 'chamar_rpc_criar_campanha']) {
    assert.notEqual(denyTool(manager, name), null, name);
  }
  manager.modules.paid_traffic = false;
  assert.notEqual(denyTool(manager, 'criar_campanha_paga'), null);
});

test('SDK permission lookup errors never reach legacy handlers', async () => {
  for (const fail of ['module_settings', 'user_module_permissions', 'user_module_access']) {
    const f = fixture({ fail });
    const s = await session(f);
    try {
      assert.equal((await s.client.callTool({ name: 'listar_clientes', arguments: {} })).isError, true, fail);
      assert.equal(f.requests.some(r => r.table === 'clientes'), false);
    } finally { await s.close(); }
  }
});

test('registered catalog is mapped and superadmin retains broad access after account validation', async () => {
  const f = fixture({ role: 'superadmin', fail: 'module_settings' });
  const s = await session(f, 'superadmin');
  try {
    const names = (await s.client.listTools()).tools.map(tool => tool.name);
    for (const name of names.filter(name => name !== 'unknown_future_tool')) assert.ok(Object.hasOwn(TOOL_POLICIES, name), name);
    assert.equal((await s.client.callTool({ name: 'unknown_future_tool', arguments: {} })).isError, undefined);
    assert.equal(s.unguardedCalls(), 1);
    assert.equal((await s.client.callTool({ name: 'listar_clientes', arguments: {} })).isError, undefined);
    f.tables.profiles![0]!.status = 'inactive';
    assert.equal((await s.client.callTool({ name: 'listar_clientes', arguments: {} })).isError, true);
  } finally { await s.close(); }
});

test('allowed SDK reads recheck module revocation and keep existing own-box guard', async () => {
  const f = fixture();
  const s = await session(f);
  try {
    assert.equal((await s.client.callTool({ name: 'listar_clientes', arguments: {} })).isError, undefined);
    f.tables.user_module_permissions = [{ user_id: userId, module_name: 'clients', is_enabled: false }];
    assert.equal((await s.client.callTool({ name: 'listar_clientes', arguments: {} })).isError, true);
    assert.equal((await s.client.callTool({ name: 'listar_caixa', arguments: { pessoa_id: otherId } })).isError, true);
    assert.equal(f.requests.some(r => r.table === 'listar_pendencias_caixa'), false);
  } finally { await s.close(); }
});

test('dossier omits disabled sections and never queries their tables', async () => {
  const f = fixture({ tables: { module_settings: ['projects', 'tasks', 'mini_crm', 'onboarding'].map(module_name => ({ module_name, is_enabled: false })) } });
  const access = await loadModuleAccess(f.db, actor);
  const result = await loadClienteDossie(f.db, clientId, {}, access);
  assert.equal(result.cadastro.empresa, 'Fixture A');
  for (const section of ['projetos', 'tarefas', 'mini_crm', 'onboarding', 'cobertura', 'solicitacoes']) assert.equal(result[section], null, section);
  for (const table of ['projetos', 'tarefas', 'cliente_whatsapp_contact', 'client_onboardings', 'solicitacoes']) assert.equal(f.requests.some(r => r.table === table), false, table);
});

for (const disabled of ['projects', 'tasks']) {
  test(`dossier coverage does not aggregate ${disabled} while the other module remains enabled`, async () => {
    const f = fixture({ tables: { module_settings: [{ module_name: disabled, is_enabled: false }] } });
    const result = await loadClienteDossie(f.db, clientId, { mes: '2026-10' }, await loadModuleAccess(f.db, actor));
    assert.equal(result.cobertura, null);
    assert.ok(result.modulos_omitidos.includes(disabled));
    const blockedTable = disabled === 'projects' ? 'projetos' : 'tarefas';
    assert.equal(f.requests.some(request => request.table === blockedTable), false);
    assert.notEqual(disabled === 'projects' ? result.tarefas : result.projetos, null);
  });

  for (const name of ['resumo_cobertura_mensal', 'ler_aba']) {
    test(`${name} denies coverage before data access when only ${disabled} is disabled`, async () => {
      const f = fixture({ tables: { module_settings: [{ module_name: disabled, is_enabled: false }] } });
      const s = await session(f);
      const args = name === 'ler_aba' ? { modulo: 'cobertura', aba: 'mes', mes: '2026-10' } : { mes: '2026-10' };
      try {
        assert.equal((await s.client.callTool({ name, arguments: args })).isError, true);
        assert.ok(f.requests.every(request => ['profiles', 'module_settings', 'user_module_permissions', 'user_module_access'].includes(request.table)));
        f.tables.module_settings = [];
        assert.notEqual((await s.client.callTool({ name, arguments: args })).isError, true);
      } finally { await s.close(); }
    });
  }
}

test('reports default to self including admin and only explicit all reveals team profiles', async () => {
  for (const role of ['colaborador', 'admin']) {
    const f = fixture({ role, tables: {
      collaborator_indicator_profiles: [{ profile_id: userId, indicator_profile: 'a' }, { profile_id: otherId, indicator_profile: 'b' }],
      client_result_goals: [{ client_id: clientId, reference_month: '2026-10-01', leads_goal: 50 }],
      indicator_month_snapshots: [{ id: 'snapshot', reference_month: '2026-10-01' }],
    } });
    let access = await loadModuleAccess(f.db, { ...actor, role });
    const own = await loadIndicadores(f.db, { mes: '2026-10' }, access);
    assert.deepEqual(own.pessoas.map(p => p.profile_id), [userId]);
    assert.deepEqual(own.metas, []);
    assert.deepEqual(own.fotos, []);
    f.tables.user_module_access = [{ user_id: userId, module_name: 'reports', access_level: 'all' }];
    access = await loadModuleAccess(f.db, { ...actor, role });
    const all = await loadIndicadores(f.db, { mes: '2026-10' }, access);
    assert.deepEqual(all.pessoas.map(p => p.profile_id), [userId, otherId]);
    assert.equal(all.metas.length, 1);
  }
});

test('dashboard suppresses disabled modules and restricts box counts to actor', async () => {
  const f = fixture({ tables: {
    module_settings: [{ module_name: 'tasks', is_enabled: false }, { module_name: 'onboarding', is_enabled: false }],
    pendencias_caixa: [{ id: 'own', pessoa_id: userId }, { id: 'other', pessoa_id: otherId }],
  } });
  const data = await loadDashboardResumo(f.db, await loadModuleAccess(f.db, actor));
  assert.equal(data.tarefas_atrasadas, null);
  assert.equal(data.solicitacoes_abertas, null);
  assert.equal(data.onboardings, null);
  assert.equal(data.pendencias_caixa, 1);
  assert.equal(f.requests.some(r => ['tarefas', 'solicitacoes', 'client_onboardings'].includes(r.table)), false);
});

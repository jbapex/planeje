import assert from 'node:assert/strict';
import test from 'node:test';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createClient } from '@supabase/supabase-js';
import { registerPlanejeTools } from '../src/tools.js';
import { FALLBACK_COLUMNS } from '../src/introspect.js';
import { applyChatgptToolBudget, CHATGPT_TOOL_ALLOWLIST } from '../src/chatgptToolBudget.js';
import { TOOL_POLICIES } from '../src/toolAuthorization.js';
import type { McpActorLike } from '../src/access.js';

const CLIENT = '10000000-0000-4000-8000-000000000001';
const OTHER = '10000000-0000-4000-8000-000000000002';
const USER = '10000000-0000-4000-8000-000000000003';
const ROW = '10000000-0000-4000-8000-000000000004';
const WEEK = '2026-11-09';
const PHONE = '5511999991234';
const actor: McpActorLike = { type: 'user', user_id: USER, role: 'colaborador' };
const names = ['gestor_ia_listar_painel', 'gestor_ia_ler_semana', 'gestor_ia_salvar_semana', 'gestor_ia_sugerir_acao', 'gestor_ia_ver_leads'];
const line = { id: ROW, platform: 'meta', account_id: 'act_10', account_name: 'Conta', campaign_id: '20', campaign_name: 'Campanha', adset_id: '30', adset_name: 'Conjunto', spend: 120, messages: 3, appointments: 1 };
type Json = Record<string, any>;

async function fixture(options: { actor?: McpActorLike; noActor?: boolean; rpc?: (body: Json) => Json; status?: string; deniedModules?: string[] } = {}) {
  const calls: Json[] = [];
  const state = { status: options.status ?? 'active', role: 'colaborador', deniedModules: options.deniedModules ?? [], error: null as Json | null };
  const review = { id: ROW, client_id: CLIENT, week_start: WEEK, revision: 2, fill_origin: 'ia', validation_state: 'rascunho_ia', finalized_at: null, campaign_metrics: [line] };
  const db = createClient('https://fixture.invalid', 'fixture-only', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, init) => {
      const url = new URL(String(input));
      assert.equal(url.host, 'fixture.invalid', 'test must never access a real service');
      if (url.pathname.startsWith('/auth/v1/admin/users/')) return new Response(JSON.stringify({ id: USER }));
      const table = url.pathname.split('/').at(-1)!;
      if (url.pathname.includes('/rpc/')) {
        assert.equal(table, 'gestor_ia_routine_mcp', 'routine tools cannot call campaign/advertising RPCs');
        const body = JSON.parse(String(init?.body));
        calls.push(body);
        if (state.error) return new Response(JSON.stringify(state.error), { status: 409 });
        const data = options.rpc?.(body) ?? (body.p_action === 'panel'
          ? { semana: WEEK, clientes: [{ cliente_id: CLIENT, empresa: 'Fixture', status: 'rascunho_ia', revision: 2 }] }
          : body.p_action === 'leads' ? { contacts: [], config: null, niche: '', messages: [] }
          : { cliente_id: CLIENT, semana: WEEK, review });
        return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
      }
      const data = table === 'profiles' ? { id: USER, role: state.role, status: state.status }
        : table === 'module_settings' ? state.deniedModules.map(module_name => ({ module_name, is_enabled: false })) : [];
      return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
    } },
  });
  const mcp = new McpServer({ name: 'routine-fixture', version: '1' });
  registerPlanejeTools(mcp, db, FALLBACK_COLUMNS, options.noActor ? undefined : (options.actor ?? actor) as any);
  const client = new Client({ name: 'routine-fixture-client', version: '1' });
  const [left, right] = InMemoryTransport.createLinkedPair();
  await mcp.connect(right);
  await client.connect(left);
  return { client, mcp, calls, state, review, close: async () => { await client.close(); await mcp.close(); } };
}
function payload(result: any) {
  assert.notEqual(result.isError, true, JSON.stringify(result.content));
  return JSON.parse(result.content[0].text);
}
const args = (name: string): Json => ({ semana: WEEK,
  ...(name === names[0] ? {} : { cliente_id: CLIENT }),
  ...(name === names[2] ? { linhas: [line], analise: 'Conferir resultados.', revision: 2 } : {}),
  ...(name === names[3] ? { texto: 'Revisar criativos.', revision: 2 } : {}),
});

test('all five routine tools are registered and exposed in the OAuth catalog with explicit policies', async () => {
  const f = await fixture();
  try {
    const registered = await f.client.listTools();
    const budget = applyChatgptToolBudget(f.mcp);
    const catalog = payload(await f.client.callTool({ name: 'listar_ferramentas_mcp', arguments: { dominio: 'trafego_pago' } }));
    for (const name of names) {
      assert.ok(registered.tools.some(tool => tool.name === name), name);
      assert.ok(CHATGPT_TOOL_ALLOWLIST.includes(name as any), name);
      assert.ok(budget.enabled.includes(name), name);
      assert.equal(TOOL_POLICIES[name]?.module, 'paid_traffic', name);
      assert.ok(catalog.catalogo.some((domain: Json) => domain.ferramentas.includes(name)), name);
    }
    assert.ok(!registered.tools.some(tool => /^gestor_ia_.*(?:validar|concluir|reabrir)/.test(tool.name)));
  } finally { await f.close(); }
});

for (const [index, name] of names.entries()) test(`${name} calls only the transactional routine RPC with the authenticated actor`, async () => {
  const f = await fixture();
  try {
    const result = payload(await f.client.callTool({ name, arguments: args(name) }));
    assert.equal(result.semana, WEEK);
    const target = f.calls.find(call => call.p_action === ['panel', 'read', 'save', 'suggest', 'leads'][index]);
    assert.ok(target);
    assert.equal(target.p_actor, USER);
    assert.equal(target.p_week, WEEK);
    assert.equal(target.p_client, index === 0 ? null : CLIENT);
    assert.ok(!('finalize' in target.p_payload));
    if (index === 2) assert.deepEqual(target.p_payload, { linhas: [line], analise: 'Conferir resultados.', revision: 2 });
    if (index === 3) assert.deepEqual(target.p_payload, { texto: 'Revisar criativos.', revision: 2 });
  } finally { await f.close(); }
});

test('routine ACL rejects anonymous, admin keys, revoked people and denied traffic before any RPC', async () => {
  for (const options of [{ actor: { type: 'anon' } as McpActorLike }, { actor: { type: 'admin_key' } as McpActorLike },
    { noActor: true }, { status: 'inactive' }, { deniedModules: ['paid_traffic'] }]) {
    const f = await fixture(options);
    try {
      for (const name of names) assert.equal((await f.client.callTool({ name, arguments: args(name) })).isError, true, name);
      assert.equal(f.calls.length, 0);
    } finally { await f.close(); }
  }
});

test('lead tool also requires rastreamento and rechecks revocation on the next invocation', async () => {
  const f = await fixture({ deniedModules: ['rastreamento'] });
  try {
    payload(await f.client.callTool({ name: names[1]!, arguments: args(names[1]!) }));
    const before = f.calls.length;
    assert.equal((await f.client.callTool({ name: names[4]!, arguments: args(names[4]!) })).isError, true);
    assert.equal(f.calls.length, before);
    f.state.status = 'inactive';
    assert.equal((await f.client.callTool({ name: names[1]!, arguments: args(names[1]!) })).isError, true);
    assert.equal(f.calls.length, before);
  } finally { await f.close(); }
});

test('invalid weeks and forged finalize/status/actor fields never reach the database', async () => {
  const f = await fixture();
  try {
    for (const semana of ['2026-02-30', '2026-11-10', '2026-11-09T00:00:00Z', '']) {
      assert.equal((await f.client.callTool({ name: names[1]!, arguments: { cliente_id: CLIENT, semana } })).isError, true);
    }
    for (const forged of [{ finalize: true }, { validation_state: 'validado' }, { p_actor: OTHER }, { linhas: [{ ...line, finalize: true }] }]) {
      assert.equal((await f.client.callTool({ name: names[2]!, arguments: { ...args(names[2]!), ...forged } })).isError, true);
    }
    for (const invalid of [{ linhas: Array.from({ length: 51 }, () => line) }, { analise: 'x'.repeat(10001) },
      { linhas: [{ ...line, spend: -1 }] }, { linhas: [{ ...line, appointments: 0.5 }] }, { revision: -1 }]) {
      assert.equal((await f.client.callTool({ name: names[2]!, arguments: { ...args(names[2]!), ...invalid } })).isError, true);
    }
    assert.equal(f.calls.length, 0);
  } finally { await f.close(); }
});

test('revision and validated conflicts return fixed instructions without raw database details', async () => {
  const f = await fixture();
  try {
    for (const code of ['40001', '55000', '42501', 'XX000']) {
      f.state.error = { code, message: `raw private ${PHONE}@s.whatsapp.net`, details: PHONE };
      const result = await f.client.callTool({ name: names[2]!, arguments: args(names[2]!) });
      assert.equal(result.isError, true);
      assert.ok(!JSON.stringify(result).includes(PHONE));
      if (code === '40001') assert.match(JSON.stringify(result), /ler_semana|novamente/);
      if (code === '55000') assert.match(JSON.stringify(result), /validada|humana/);
    }
  } finally { await f.close(); }
});

test('lead response masks phones and projects only safe fields, with unmatched leads separate', async () => {
  const contacts = [
    { id: 'lead-meta', cliente_id: CLIENT, sender_name: `Lead ${PHONE}@s.whatsapp.net`, phone: PHONE, from_jid: `${PHONE}@s.whatsapp.net`, first_seen_at: `${WEEK}T12:00:00Z`,
      origin_source: PHONE, tracking_data: { source: 'meta', ad_id: '40', account_id: '10', campaign_id: '20', adset_id: '30', private_phone: PHONE },
      mini_crm: { status: 'agendado', notes: PHONE } },
    { id: 'lead-google', cliente_id: CLIENT, name: 'Lead Google', phone: '5511888889876', first_seen_at: `${WEEK}T12:00:00Z`, origin: 'google_ads', tracking_data: { source: 'google' } },
    { id: 'lead-other', cliente_id: OTHER, name: 'Outro cliente', phone: PHONE, first_seen_at: `${WEEK}T12:00:00Z` },
  ];
  const f = await fixture({ rpc: body => body.p_action === 'read'
    ? { cliente_id: CLIENT, semana: WEEK, review: { campaign_metrics: [line] } }
    : { contacts, config: null, niche: '', messages: [{ contact_id: 'lead-meta', text: `Confirmado dia 12 às 14h. ${PHONE}`, direction: 'equipe', at: '2026-11-10T12:00:00Z', id: 'msg-1' }] } });
  try {
    const result = payload(await f.client.callTool({ name: names[4]!, arguments: args(names[4]!) }));
    const serialized = JSON.stringify(result);
    assert.ok(!serialized.includes(PHONE));
    assert.ok(!serialized.includes('@s.whatsapp.net'));
    assert.ok(!serialized.includes('tracking_data'));
    assert.ok(!serialized.includes('mini_crm'));
    assert.ok(!serialized.includes('Confirmado dia'));
    assert.equal(result.leads.length, 1);
    assert.match(result.leads[0].phone, /1234$/);
    assert.equal(result.unmatchedLeads.length, 1);
    assert.equal(result.unmatchedLeads[0].id, 'lead-google');
    assert.ok(!serialized.includes('lead-other'));
  } finally { await f.close(); }
});

test('conjunto filter resolves only exact IDs from the requested client/week review', async () => {
  const f = await fixture();
  try {
    const invalid = await f.client.callTool({ name: names[4]!, arguments: { ...args(names[4]!), conjunto_ids: ['999'] } });
    assert.equal(invalid.isError, true);
    assert.ok(!f.calls.some(call => call.p_action === 'leads'));
    const valid = payload(await f.client.callTool({ name: names[4]!, arguments: { ...args(names[4]!), conjunto_ids: ['30'], somente_agendados: true } }));
    assert.equal(valid.semana, WEEK);
    assert.ok(f.calls.some(call => call.p_action === 'read' && call.p_client === CLIENT && call.p_week === WEEK));
  } finally { await f.close(); }
});

test('empty conjunto selection keeps the full attributed cohort and scheduled filtering preserves unmatched leads', async () => {
  const contacts = Array.from({ length: 1201 }, (_, index) => ({
    id: `lead-${index}`, cliente_id: CLIENT, sender_name: `Fixture ${index}`, phone: PHONE,
    first_seen_at: `${WEEK}T12:00:00Z`, tracking_data: { source: 'meta', ad_id: '40', account_id: '10', campaign_id: '20', adset_id: '30' },
  }));
  const unmatched = { id: 'manual', cliente_id: CLIENT, phone: PHONE, first_seen_at: `${WEEK}T12:00:00Z`, origin_source: 'manual' };
  const f = await fixture({ rpc: body => body.p_action === 'read' ? { cliente_id: CLIENT, semana: WEEK, review: null }
    : { contacts: [...contacts, unmatched], config: null, niche: '', messages: [] } });
  try {
    const all = payload(await f.client.callTool({ name: names[4]!, arguments: { ...args(names[4]!), conjunto_ids: [] } }));
    assert.equal(all.leads.length, 1201, 'transport must never silently truncate a cohort at 1000');
    assert.equal(all.total, 1201);
    assert.equal(all.unmatchedLeads.length, 1);
    const scheduled = payload(await f.client.callTool({ name: names[4]!, arguments: { ...args(names[4]!), somente_agendados: true } }));
    assert.equal(scheduled.leads.length, 0);
    assert.equal(scheduled.unmatchedLeads.length, 1, 'unmatched leads always remain visible as a separate cohort');
  } finally { await f.close(); }
});

test('a mismatched routine response stops before selecting another client or week', async () => {
  for (const wrong of [{ cliente_id: OTHER, semana: WEEK }, { cliente_id: CLIENT, semana: '2026-11-02' }]) {
    const f = await fixture({ rpc: () => ({ ...wrong, review: { campaign_metrics: [line], private: PHONE } }) });
    try {
      const result = await f.client.callTool({ name: names[4]!, arguments: { ...args(names[4]!), conjunto_ids: ['30'] } });
      assert.equal(result.isError, true);
      assert.ok(!JSON.stringify(result).includes(PHONE));
      assert.ok(!f.calls.some(call => call.p_action === 'leads'));
    } finally { await f.close(); }
  }
});

test('malformed panel, contacts or messages fail closed without exposing raw response data', async () => {
  for (const target of ['clientes', 'contacts', 'messages']) {
    for (const value of [undefined, null, { private: PHONE }, `private ${PHONE}`, [null], [PHONE]]) {
      const f = await fixture({ rpc: body => body.p_action === 'panel'
        ? { semana: WEEK, clientes: value }
        : body.p_action === 'read' ? { cliente_id: CLIENT, semana: WEEK, review: null }
        : { contacts: [], messages: [], config: null, niche: '', [target]: value } });
      try {
        const name = target === 'clientes' ? names[0]! : names[4]!;
        const result = await f.client.callTool({ name, arguments: args(name) });
        assert.equal(result.isError, true, `${target} must be an array of records, never a successful empty result`);
        assert.ok(!JSON.stringify(result).includes(PHONE));
      } finally { await f.close(); }
    }
  }
});

for (const name of [names[1]!, names[2]!, names[3]!]) test(`${name} masks review prose and line labels while preserving exact identifiers`, async () => {
  const text = `Contato ${PHONE}@s.whatsapp.net; retorno em 12/11/2026.`;
  const freeReview = Object.fromEntries(['analysis', 'data_note', 'ai_suggestion', 'result_label'].map(key => [key, text]));
  const freeLine = Object.fromEntries(['account_name', 'campaign_name', 'adset_name', 'conversion_label'].map(key => [key, text]));
  const ids = { id: ROW, account_link_id: ROW, account_id: 'act_12345678901234567', campaign_id: '22345678901234567', adset_id: '32345678901234567' };
  const f = await fixture({ rpc: () => ({ cliente_id: CLIENT, semana: WEEK,
    review: { id: ROW, client_id: CLIENT, week_start: WEEK, ...freeReview, campaign_metrics: [{ ...line, ...ids, ...freeLine }] } }) });
  try {
    const result = payload(await f.client.callTool({ name, arguments: args(name) }));
    assert.ok(!JSON.stringify(result).includes(PHONE));
    assert.ok(!JSON.stringify(result).includes('@s.whatsapp.net'));
    for (const key of Object.keys(freeReview)) {
      assert.match(result.review[key], /•••• 1234/);
      assert.ok(result.review[key].includes('12/11/2026'));
    }
    for (const key of Object.keys(freeLine)) assert.match(result.review.campaign_metrics[0][key], /•••• 1234/);
    assert.equal(result.review.id, ROW);
    assert.equal(result.review.client_id, CLIENT);
    assert.equal(result.review.week_start, WEEK);
    for (const [key, value] of Object.entries(ids)) assert.equal(result.review.campaign_metrics[0][key], value);
  } finally { await f.close(); }
});

test('routine panel masks free company names and preserves client/review IDs', async () => {
  const f = await fixture({ rpc: () => ({ semana: WEEK, clientes: [{ cliente_id: CLIENT, review_id: ROW,
    empresa: `Empresa +55 (11) 99999-1234 e ${PHONE}@s.whatsapp.net`, status: 'rascunho_ia', revision: 2 }] }) });
  try {
    const result = payload(await f.client.callTool({ name: names[0]!, arguments: args(names[0]!) }));
    assert.ok(!JSON.stringify(result).includes(PHONE));
    assert.ok(!JSON.stringify(result).includes('@s.whatsapp.net'));
    assert.ok(!result.clientes[0].empresa.includes('99999-1234'));
    assert.match(result.clientes[0].empresa, /•••• 1234/);
    assert.equal(result.clientes[0].cliente_id, CLIENT);
    assert.equal(result.clientes[0].review_id, ROW);
    assert.equal(result.clientes[0].revision, 2);
  } finally { await f.close(); }
});


test('appointment-week mode forwards events and origin catalog, masks names and splits new/old', async () => {
  const contacts = [0,1].map(index => ({ id: `appointment-${index}`, cliente_id: CLIENT, phone: PHONE,
    sender_name: `Lead ${index}`, first_seen_at: index ? '2026-11-02T12:00:00Z' : `${WEEK}T12:00:00Z`,
    origin_source: 'meta_ads', tracking_data: { meta_ad_details: { ad: { name: `Anúncio ${PHONE}`,
      campaign: { name: 'Campanha' }, adset: { name: 'Conjunto' } } } } }));
  const f = await fixture({ rpc: body => body.p_action === 'read' ? { cliente_id: CLIENT, semana: WEEK, review: { campaign_metrics: [line] } }
    : { contacts, config: null, niche: '', messages: [], origin_catalog: [],
      appointment_events: contacts.map(contact => ({ contact_id: contact.id, at: '2026-11-10T12:00:00Z', source: 'automatico' })) } });
  try {
    const result = payload(await f.client.callTool({ name: names[4]!, arguments: { ...args(names[4]!), modo: 'agendados_na_semana' } }));
    assert.equal(f.calls.find(call => call.p_action === 'leads')?.p_payload.modo, 'agendados_na_semana');
    assert.equal(result.modo, 'agendados_na_semana');
    assert.equal(result.leads.length, 2);
    assert.deepEqual(result.leads.map((lead: Json) => lead.routineCohort), ['novo','antigo']);
    assert.ok(result.leads.every((lead: Json) => lead.routineMatchMethod === 'name'));
    assert.equal(result.leads[0].routineOrigin.campaign_name, 'Campanha');
    assert.equal(result.leads[0].routineOrigin.adset_name, 'Conjunto');
    assert.ok(!JSON.stringify(result).includes(PHONE));
    assert.equal(result.summary.novos, 1); assert.equal(result.summary.antigos, 1);
    assert.equal(result.summary.atribuidos.cpa, 120);
    assert.deepEqual(result.originRows, []);
  } finally { await f.close(); }
});

test('subset selection cannot turn an ambiguous name into a confirmed attribution', async () => {
  const f = await fixture({ rpc: body => body.p_action === 'read' ? { cliente_id: CLIENT, semana: WEEK,
    review: { campaign_metrics: [line, { ...line, account_id: 'act_11', campaign_id: '21', adset_id: '31' }] } }
    : { contacts: [{ id: 'ambiguous', cliente_id: CLIENT, first_seen_at: `${WEEK}T12:00:00Z`, origin_source: 'meta_ads',
      tracking_data: { meta_ad_details: { ad: { campaign: { name: 'Campanha' }, adset: { name: 'Conjunto' } } } } }], messages: [], config: null } });
  try {
    const result = payload(await f.client.callTool({ name: names[4]!, arguments: { ...args(names[4]!), conjunto_ids: ['30'] } }));
    assert.equal(result.leads.length, 0); assert.equal(result.unmatchedLeads.length, 1);
    assert.match(result.unmatchedLeads[0].routineMatchReason, /ambígua/);
  } finally { await f.close(); }
});

test('invalid appointment modes and missing event evidence fail closed', async () => {
  const f = await fixture();
  try {
    assert.equal((await f.client.callTool({ name: names[4]!, arguments: { ...args(names[4]!), modo: 'todas' } })).isError, true);
    assert.equal(f.calls.length, 0);
    const result = await f.client.callTool({ name: names[4]!, arguments: { ...args(names[4]!), modo: 'agendados_na_semana' } });
    assert.equal(result.isError, true);
  } finally { await f.close(); }
});

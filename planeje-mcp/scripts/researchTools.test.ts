import assert from 'node:assert/strict';
import test from 'node:test';
import { createClient } from '@supabase/supabase-js';
import { registerResearchTools } from '../src/researchTools.js';
import type { McpActorLike } from '../src/access.js';

const CLIENT = '10000000-0000-4000-8000-000000000001';
const OTHER = '10000000-0000-4000-8000-000000000002';
const CONTACT = '20000000-0000-4000-8000-000000000001';
const FOREIGN_CONTACT = '20000000-0000-4000-8000-000000000002';
const USER = '30000000-0000-4000-8000-000000000001';
const JID = '5511999990000@s.whatsapp.net';
const admin: McpActorLike = { type: 'admin_key' };
type Row = Record<string, any>;

function split(value: string) {
  const parts: string[] = [];
  let depth = 0, start = 0;
  for (let i = 0; i < value.length; i++) {
    if (value[i] === '(') depth++;
    if (value[i] === ')') depth--;
    if (value[i] === ',' && depth === 0) { parts.push(value.slice(start, i)); start = i + 1; }
  }
  return [...parts, value.slice(start)];
}
function normalize(value: unknown) {
  const text = String(value);
  if (!/^\d{4}-\d\d-\d\dT/.test(text)) return text;
  return new Date(text).toISOString().slice(0, 19) + '.' + (text.match(/\.(\d+)/)?.[1] || '').padEnd(6, '0');
}
function predicate(filter: string): (row: Row) => boolean {
  const group = filter.match(/^(and|or)\((.*)\)$/);
  if (group) {
    const predicates = split(group[2]!).map(predicate);
    return row => group[1] === 'and' ? predicates.every(p => p(row)) : predicates.some(p => p(row));
  }
  const match = filter.match(/^(\w+)\.(eq|gt|gte|lt|lte|is)\.(.*)$/);
  assert.ok(match, `Unsupported fixture filter: ${filter}`);
  const [, column, op, raw] = match;
  return row => {
    const value = row[column!];
    if (op === 'is') return raw === 'null' ? value == null : value === (raw === 'true');
    if (value == null) return false;
    const a = normalize(value), b = normalize(raw);
    return op === 'eq' ? a === b : op === 'gt' ? a > b : op === 'gte' ? a >= b : op === 'lt' ? a < b : a <= b;
  };
}
function fixture(extra: Record<string, Row[]> = {}, cap = Infinity) {
  const tables: Record<string, Row[]> = {
    clientes: [{ id: CLIENT }, { id: OTHER }],
    profiles: [{ id: USER, role: 'colaborador', status: 'active' }],
    cliente_whatsapp_contact: [
      { id: CONTACT, cliente_id: CLIENT, from_jid: JID },
      { id: FOREIGN_CONTACT, cliente_id: OTHER, from_jid: JID },
    ],
    ...extra,
  };
  const requests: URL[] = [];
  const unavailable = new Set<string>();
  const db = createClient('https://fixture.invalid', 'fixture-only', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, init) => {
      const url = new URL(String(input));
      assert.equal(url.host, 'fixture.invalid');
      assert.equal(init?.method ?? 'GET', 'GET');
      requests.push(url);
      if (url.pathname.startsWith('/auth/')) {
        return new Response(JSON.stringify({ id: USER, email: 'fixture@example.invalid' }));
      }
      const table = url.pathname.split('/').at(-1)!;
      if (unavailable.has(table)) return new Response(JSON.stringify({ message: 'sensitive fixture error' }), { status: 400 });
      let rows = [...(tables[table] || [])];
      for (const [key, value] of url.searchParams) {
        if (key === 'or') rows = rows.filter(predicate('or' + value));
        else if (!['select', 'limit', 'order'].includes(key)) rows = rows.filter(predicate(key + '.' + value));
      }
      const orders = url.searchParams.get('order')?.split(',').map(part => part.split('.'));
      if (orders) rows.sort((a, b) => {
        for (const [column, direction] of orders) {
          const comparison = normalize(a[column!]).localeCompare(normalize(b[column!]));
          if (comparison) return comparison * (direction === 'desc' ? -1 : 1);
        }
        return 0;
      });
      rows = rows.slice(0, Math.min(Number(url.searchParams.get('limit') || Infinity), cap));
      const select = url.searchParams.get('select');
      assert.ok(select && select !== '*', 'research must select explicit fields');
      assert.ok(!/(token|secret|raw_payload|subdomain|api_url)/i.test(select));
      rows = rows.map(row => Object.fromEntries(select.split(',').map(key => [key.trim(), row[key.trim()]])));
      return new Response(JSON.stringify(rows), { headers: { 'Content-Type': 'application/json' } });
    } },
  });
  return { db, tables, requests, unavailable };
}
function register(db: ReturnType<typeof createClient>, actor: McpActorLike = admin) {
  const tools = new Map<string, { schema: Row; handler: (args: Row) => Promise<any> }>();
  registerResearchTools({ registerTool: (name: string, schema: Row, handler: (args: Row) => Promise<any>) => tools.set(name, { schema, handler }) } as any, db, actor);
  assert.equal(tools.size, 1);
  const tool = tools.get('consultar_historico_cliente');
  assert.ok(tool);
  assert.equal(tool.schema.annotations?.readOnlyHint, true);
  return {
    call: (args: Row) => tool.handler({ cliente_id: CLIENT, tipo: 'origens', ...args }),
    read: async (args: Row = {}) => {
      const result = await tool.handler({ cliente_id: CLIENT, tipo: 'origens', ...args });
      assert.notEqual(result.isError, true, result.content?.[0]?.text);
      return JSON.parse(result.content[0].text);
    },
  };
}
function origin(i: number, extra: Row = {}): Row {
  return { id: `40000000-0000-4000-8000-${String(i).padStart(12, '0')}`, cliente_id: CLIENT, from_jid: JID,
    event_at: '2026-01-01T12:00:00.000000Z', recorded_at: '2026-01-01T12:00:00Z',
    received_at: '2026-01-01T12:00:00Z', clicked_at: null, message_at: null,
    source: 'chatvolt', origin_source: 'site', attribution: { utm_source: 'example' }, ...extra };
}

test('origins traverse all records across smaller database pages and preserve microsecond order', async () => {
  const rows = Array.from({ length: 1207 }, (_, i) => origin(i + 1));
  rows[0]!.event_at = '2026-01-01T12:00:00.000001Z';
  const f = fixture({ contact_attribution_history: rows, mini_crm_observation_history: [] }, 7);
  const tool = register(f.db);
  const results: Row[] = [];
  let cursor: string | undefined;
  do {
    const page = await tool.read({ contact_id: CONTACT, limite: 500, cursor });
    results.push(...page.dados);
    assert.equal(page.paginacao.total_lidos, results.length);
    cursor = page.paginacao.proximo_cursor || undefined;
    assert.equal(page.paginacao.concluido, !cursor);
    assert.ok(results.length <= 1207);
  } while (cursor);
  assert.equal(results.length, 1207);
  assert.equal(new Set(results.map(row => row.id)).size, 1207);
  assert.equal(results.at(-1)!.id, origin(1).id);
  assert.ok(f.requests.filter(u => u.pathname.endsWith('/contact_attribution_history')).every(u =>
    u.searchParams.get('cliente_id') === `eq.${CLIENT}` && u.searchParams.get('from_jid') === `eq.${JID}`));
});

test('client-wide batches and contact resolution never read the other client with the same phone', async () => {
  const f = fixture({ contact_attribution_history: [origin(1), origin(2, { cliente_id: OTHER })] });
  const tool = register(f.db);
  assert.deepEqual((await tool.read()).dados.map((row: Row) => row.id), [origin(1).id]);
  const count = f.requests.length;
  const result = await tool.call({ contact_id: FOREIGN_CONTACT });
  assert.equal(result.isError, true);
  const newReads = f.requests.slice(count);
  assert.ok(newReads.every(u => !u.pathname.endsWith('/contact_attribution_history')));
  assert.ok(newReads.filter(u => u.pathname.endsWith('/cliente_whatsapp_contact')).every(u =>
    u.searchParams.get('cliente_id') === `eq.${CLIENT}` && u.searchParams.get('id') === `eq.${FOREIGN_CONTACT}`));
});

test('cursor binds actor, client, kind, contact and period; tampering fails before history reads', async () => {
  const f = fixture({ contact_attribution_history: [origin(1), origin(2)] });
  const tool = register(f.db);
  const first = await tool.read({ contact_id: CONTACT, limite: 1 });
  const cursor = first.paginacao.proximo_cursor;
  assert.ok(cursor);
  for (const overrides of [{ cliente_id: OTHER }, { tipo: 'observacoes' }, { contact_id: undefined },
    { inicio: '2026-01-01' }, { fim: '2026-01-01' }, { cursor: cursor + 'x' }]) {
    const count = f.requests.length;
    const result = await tool.call({ contact_id: CONTACT, cursor, ...overrides });
    assert.equal(result.isError, true);
    assert.equal(f.requests.length, count, 'invalid cursor must fail before querying data');
  }
  const changedActor = register(f.db, { type: 'user', user_id: USER, role: 'colaborador' });
  const count = f.requests.length;
  assert.equal((await changedActor.call({ contact_id: CONTACT, cursor })).isError, true);
  assert.equal(f.requests.length, count);
});

test('continuation arguments can be reused directly without manufacturing optional values', async () => {
  const f = fixture({ contact_attribution_history: [origin(1), origin(2)] });
  const tool = register(f.db);
  const first = await tool.read({ limite: 1 });
  assert.equal(first.continuacao.ferramenta, 'consultar_historico_cliente');
  const second = await tool.read(first.continuacao.argumentos);
  assert.deepEqual(second.dados.map((row: Row) => row.id), [origin(2).id]);
});

test('dates use São Paulo civil days, exclusive next day, leap validation and no year ceiling', async () => {
  const times = ['2026-01-01T02:59:59.999999Z', '2026-01-01T03:00:00Z',
    '2026-01-02T02:59:59.999999Z', '2026-01-02T03:00:00Z',
    '2018-11-04T02:59:59.999999Z', '2018-11-04T03:00:00Z',
    '2018-11-05T01:59:59.999999Z', '2018-11-05T02:00:00Z'];
  const f = fixture({ contact_attribution_history: times.map((event_at, i) => origin(i + 1, { event_at })) });
  const tool = register(f.db);
  assert.deepEqual((await tool.read({ inicio: '2026-01-01', fim: '2026-01-01' })).dados.map((row: Row) => row.id), [origin(2).id, origin(3).id]);
  assert.deepEqual((await tool.read({ inicio: '2018-11-04', fim: '2018-11-04' })).dados.map((row: Row) => row.id), [origin(6).id, origin(7).id]);
  assert.equal((await tool.read({ inicio: '2010-01-01', fim: '2026-12-31' })).dados.length, 8);
  for (const args of [{ inicio: '2026-02-30' }, { inicio: '' }, { fim: '' },
    { inicio: '2026-01-02', fim: '2026-01-01' }, { limite: 0 }, { cliente_id: '' }]) {
    assert.equal((await tool.call(args)).isError, true);
  }
});

test('observations preserve full repeated bodies, cleared entries and undated legacy records', async () => {
  const body = '  start\n' + 'x'.repeat(10000) + '\nend  ';
  const f = fixture({ mini_crm_observation_history: [
    { ...origin(1), contact_id: CONTACT, created_at: '2026-01-01T12:00:00Z', body, kind: 'note', author_name: 'Fixture' },
    { ...origin(2), contact_id: CONTACT, created_at: '2026-01-01T12:00:00Z', body, kind: 'note' },
    { ...origin(3), contact_id: CONTACT, created_at: '2026-01-01T12:00:00Z', body: '', kind: 'cleared' },
    { ...origin(4), contact_id: CONTACT, created_at: null, body: 'legacy text', kind: 'legacy' },
    { ...origin(5), cliente_id: OTHER, contact_id: FOREIGN_CONTACT, created_at: null, body: 'foreign', kind: 'legacy' },
  ] }, 1);
  const tool = register(f.db);
  let cursor: string | undefined;
  const results: Row[] = [];
  do {
    const page = await tool.read({ tipo: 'observacoes', contact_id: CONTACT, inicio: '2026-01-01', fim: '2026-01-01', cursor });
    results.push(...page.dados);
    cursor = page.paginacao.proximo_cursor || undefined;
    assert.ok(results.length <= 4);
  } while (cursor);
  assert.deepEqual(results.map(row => row.body), [body, body, '', 'legacy text']);
  assert.equal(results[3]!.created_at, null);
  assert.equal(results[3]!.data_indisponivel, true);
});

test('attribution metadata only exposes allowlisted scalar fields and removes URL credentials and queries', async () => {
  const f = fixture({ contact_attribution_history: [origin(1, { attribution: {
    utm_source: 'example', utm_campaign: 'campaign', ad_id: '123',
    source_url: 'https://user:password@example.invalid/landing?access_token=secret#secret',
    token: 'secret', raw_payload: { phone: 'secret' }, meta_ad_details: { secret: 'secret' },
  } })] });
  const page = await register(f.db).read();
  assert.deepEqual(page.dados[0].attribution, {
    utm_source: 'example', utm_campaign: 'campaign', ad_id: '123', source_url: 'https://example.invalid/landing',
  });
  assert.ok(!JSON.stringify(page).includes('secret'));
  assert.ok(!JSON.stringify(page).includes('password'));
});

test('channels paginate both catalogs with safe fields and never claim captured historical coverage', async () => {
  const f = fixture({
    mini_crm_message_sources: [{ cliente_id: CLIENT, id: 'ingress:meta_cloud:1', name: 'Meta', phone: '5511999990000' },
      { cliente_id: CLIENT, id: 'ingress:chatvolt:zapperapi', name: 'Zapper' },
      { cliente_id: OTHER, id: 'foreign', name: 'Foreign' }],
    cliente_whatsapp_config: [{ id: CONTACT, cliente_id: CLIENT, name: 'Uazapi', provider: 'uazapi',
      instance_status: 'connected', created_at: '2026-01-01T00:00:00Z', archived_at: null,
      token: 'secret', webhook_secret: 'secret', api_url: 'secret' }],
  }, 1);
  const tool = register(f.db);
  const rows: Row[] = [];
  let cursor: string | undefined;
  do {
    const page = await tool.read({ tipo: 'canais', cursor });
    assert.equal(page.cobertura.captura_historica_completa, null);
    assert.equal(page.cobertura.catalogo_atual, true);
    rows.push(...page.dados);
    cursor = page.paginacao.proximo_cursor || undefined;
    assert.ok(rows.length <= 3);
    assert.ok(!JSON.stringify(page).includes('secret'));
  } while (cursor);
  assert.deepEqual(rows.map(row => row.name), ['Zapper', 'Meta', 'Uazapi']);
  assert.deepEqual(new Set(rows.map(row => row.fonte)), new Set(['mini_crm_message_sources', 'cliente_whatsapp_config']));
  assert.equal((await tool.call({ tipo: 'canais', inicio: '2026-01-01' })).isError, true);
  assert.equal((await tool.call({ tipo: 'canais', contact_id: CONTACT })).isError, true);
});

test('source failures return a safe error rather than an empty or complete history', async () => {
  for (const [tipo, table] of [['origens', 'contact_attribution_history'], ['observacoes', 'mini_crm_observation_history'],
    ['canais', 'mini_crm_message_sources'], ['canais', 'cliente_whatsapp_config']]) {
    const f = fixture();
    f.unavailable.add(table!);
    const result = await register(f.db).call({ tipo });
    assert.equal(result.isError, true);
    assert.ok(!result.content[0].text.includes('sensitive'));
  }
});

test('each page rechecks its module and denies revoked access before reading historical data', async () => {
  const f = fixture({ contact_attribution_history: [origin(1), origin(2)],
    module_settings: [{ module_name: 'rastreamento', is_enabled: true }, { module_name: 'mini_crm', is_enabled: false }] });
  const tool = register(f.db, { type: 'user', user_id: USER, role: 'colaborador' });
  const first = await tool.read({ limite: 1 });
  f.tables.module_settings![0]!.is_enabled = false;
  const count = f.requests.length;
  assert.equal((await tool.call({ cursor: first.paginacao.proximo_cursor })).isError, true);
  assert.ok(f.requests.slice(count).every(url => !url.pathname.endsWith('/contact_attribution_history')));
  assert.equal((await tool.call({ tipo: 'observacoes' })).isError, true);
  assert.equal((await tool.call({ tipo: 'canais' })).isError, true);
});

test('permission read errors and anonymous sessions fail closed without touching client data', async () => {
  for (const table of ['module_settings', 'user_module_permissions', 'user_module_access', 'profiles']) {
    const f = fixture();
    f.unavailable.add(table);
    const result = await register(f.db, { type: 'user', user_id: USER, role: 'colaborador' }).call({});
    assert.equal(result.isError, true);
    assert.ok(f.requests.every(url => !/\/(clientes|cliente_whatsapp_contact|contact_attribution_history)$/.test(url.pathname)));
    assert.ok(!result.content[0].text.includes('sensitive'));
  }
  const f = fixture();
  assert.equal((await register(f.db, { type: 'anon' }).call({})).isError, true);
  assert.equal(f.requests.length, 0);
});

test('empty research states absence of stored evidence without claiming complete historical capture', async () => {
  const page = await register(fixture().db).read();
  assert.deepEqual(page.dados, []);
  assert.equal(page.paginacao.concluido, true);
  assert.equal(page.paginacao.total_lidos, 0);
  assert.equal(page.cobertura.ausencia_de_registros, true);
  assert.equal(page.cobertura.captura_historica_completa, null);
});

test('snapshot excludes newly recorded origins and continuation survives deletion of a consumed record', async () => {
  const rows = [origin(1), origin(2)];
  const f = fixture({ contact_attribution_history: rows });
  const tool = register(f.db);
  const first = await tool.read({ limite: 1 });
  rows.shift();
  rows.push(origin(3, { recorded_at: new Date(Date.now() + 60000).toISOString() }));
  const second = await tool.read({ limite: 1, cursor: first.paginacao.proximo_cursor });
  assert.deepEqual(second.dados.map((row: Row) => row.id), [origin(2).id]);
  const last = await tool.read({ cursor: second.paginacao.proximo_cursor });
  assert.equal(last.paginacao.concluido, true);
  assert.equal(last.paginacao.total_lidos, 2);
});

import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { createClient } from '@supabase/supabase-js';

const scratch = await mkdtemp(path.join(tmpdir(), 'routine-data-'));
after(() => rm(scratch, { recursive: true, force: true }));
await build({ entryPoints: ['src/components/gestor-ia/gestorIaRoutineData.js'], outfile: path.join(scratch, 'data.cjs'), bundle: true, platform: 'node', format: 'cjs',
  plugins: [{ name: 'source-alias', setup(builder) {
    builder.onResolve({ filter: /customSupabaseClient/ }, () => ({ path: 'db', namespace: 'fixture' }));
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export const supabase = {};' }));
    builder.onResolve({ filter: /^@\// }, ({ path: file }) => ({ path: path.resolve('src', file.slice(2) + '.js') }));
  } }] });
const api = createRequire(import.meta.url)(path.join(scratch, 'data.cjs'));
const profile = { id: 'person', role: 'colaborador', status: 'active' };
const modules = { paid_traffic: true, rastreamento: true };
const row = { id: 'row', platform: 'meta', account_id: 'act_700', campaign_id: '10001', adset_id: '20001' };
const query = { profile, modules, clientId: 'client-a', weekStart: '2026-11-02', rows: [row], niche: 'Loja de noivas' };
function fixture({ deny = false, revoke = false, failContacts = false, failConfig = false, count = 1001 } = {}) {
  const calls = [];
  let checks = 0;
  const db = createClient('https://fixture.invalid', 'fixture-key', { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: async (input, init = {}) => {
    const url = new URL(input), body = init.body ? JSON.parse(init.body) : null;
    assert.equal(url.hostname, 'fixture.invalid');
    calls.push({ url, body });
    if (url.pathname.endsWith('/rpc/central_trafego_can_access_client')) return Response.json(!deny && !(revoke && ++checks > 1));
    if (url.pathname.endsWith('/rpc/traffic_weekly_board')) return Response.json({ today: '2026-11-11', can_manage: false, clients: [{ id: 'client-a', empresa: 'Cliente A', eligible: true, manager_id: 'person' }, { id: 'client-b', empresa: 'Não autorizado' }], reviews: [{ client_id: 'client-b', analysis: 'Não expor' }] });
    if (url.pathname.endsWith('/rpc/traffic_routine_client_history')) return Response.json([]);
    if (url.pathname.endsWith('/traffic_weekly_reviews')) return Response.json([]);
    assert.ok(url.pathname.endsWith('/rpc/gestor_ia_routine_leads_data'), url.pathname);
    assert.deepEqual(body, { p_client: 'client-a', p_week: '2026-11-02' });
    if (failContacts || failConfig) return Response.json({ message: 'Falha interna' }, { status: 500 });
    const contacts = Array.from({ length: count }, (_, index) => ({ id: 'lead-' + index, cliente_id: 'client-a', first_seen_at: '2026-11-03T12:00:00Z', origin_source: 'meta_ads', mini_crm: { data_agendamento: '2026-11-20' }, tracking_data: { account_id: '700', campaign_id: '10001', adset_id: '20001' } }));
    return Response.json({ contacts, messages: [], config: null });
  } } });
  return { db, calls };
}

test('sem módulo, cliente ou perfil ativo nenhuma consulta sai', async () => {
  const { db, calls } = fixture();
  for (const override of [{ modules: { paid_traffic: true } }, { modules: { rastreamento: true } }, { profile: { ...profile, status: 'inactive' } }, { profile: { ...profile, role: 'cliente' } }, { weekStart: '2026-02-30' }]) await assert.rejects(api.loadRoutineLeads(db, { ...query, ...override }));
  assert.equal(calls.length, 0);
});
test('consulta coorte completa pela RPC JSON, confirma ACL antes e depois', async () => {
  const { db, calls } = fixture();
  const result = await api.loadRoutineLeads(db, { ...query, appointmentsOnly: true });
  assert.equal(result.leads.length, 1001);
  assert.equal(calls.filter(({ url }) => url.pathname.endsWith('/central_trafego_can_access_client')).length, 2);
  assert.equal(calls.filter(({ url }) => url.pathname.endsWith('/rpc/gestor_ia_routine_leads_data')).length, 1);
});
test('negação, revogação, falha de configuração ou contatos nunca viram zero leads', async () => {
  for (const state of [{ deny: true }, { revoke: true }, { failContacts: true }, { failConfig: true }]) {
    const { db, calls } = fixture(state);
    await assert.rejects(api.loadRoutineLeads(db, query));
    assert.ok(calls.every(({ url }) => !url.pathname.includes('/functions/')));
    if (state.deny) assert.equal(calls.length, 1);
  }
});
test('entrada conserva apenas clientes autorizados, abrir semana não cria registro', async () => {
  const { db, calls } = fixture();
  const board = await api.loadRoutineBoard(db, { profile, modules, clients: [{ id: 'client-a', empresa: 'Cliente A', etapa: 'closed', metaAccounts: [] }, { id: 'client-c', empresa: 'Sem conta', etapa: 'closed' }] });
  assert.deepEqual(board.clients.map(({ id }) => id), ['client-a', 'client-c']);
  assert.equal(board.reviews.length, 0);
  const { review } = await api.loadRoutineWeek(db, { ...query, board });
  assert.equal(review.id, null);
  assert.equal(review.can_edit, true);
  const other = await api.loadRoutineWeek(db, { ...query, profile: { ...profile, id: 'other' }, board });
  assert.equal(other.review.can_edit, false);
  await assert.rejects(api.loadRoutineWeek(db, { ...query, clientId: 'client-b', board }));
  assert.ok(calls.every(({ url }) => !url.pathname.includes('start_traffic') && !url.pathname.includes('save_traffic')));
});

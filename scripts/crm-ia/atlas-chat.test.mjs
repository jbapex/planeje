import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { build } from 'esbuild';

const owner = '00000000-0000-4000-8000-000000000001';
const closed = '00000000-0000-4000-8000-000000000011';
const crm = '00000000-0000-4000-8000-000000000012';
const forbidden = '00000000-0000-4000-8000-000000000013';
const request = '00000000-0000-4000-8000-000000000021';
const entry = new URL('../../supabase/functions/atlas-chat/index.ts', import.meta.url);

test('chat Atlas une carteira fechada e contas CRM somente após bootstrap autenticado atual', async () => {
  const { outputFiles: [file] } = await build({ entryPoints: [entry.pathname], bundle: true, platform: 'node', format: 'cjs', external: ['https://*'], write: false });
  const calls = [];
  const jobs = [];
  const runs = new Map();
  let crmAllowed = true;
  let handler;
  const builder = (items, { single = false } = {}) => {
    let rows = Array.isArray(items) ? [...items] : items;
    const query = {
      select() { return query; }, update() { return query; }, order() { return query; }, limit(n) { if (Array.isArray(rows)) rows = rows.slice(0, n); return query; },
      eq(key, value) { if (Array.isArray(rows)) rows = rows.filter(row => row[key] === value); return query; },
      neq() { return query; }, lt() { return query; }, is() { return query; }, in() { return query; }, or() { return query; },
      maybeSingle() { return Promise.resolve({ data: Array.isArray(rows) ? rows[0] ?? null : rows }); },
      single() { return query.maybeSingle(); },
      then(resolve, reject) { return Promise.resolve({ data: single && Array.isArray(rows) ? rows[0] ?? null : rows }).then(resolve, reject); },
    };
    return query;
  };
  const caller = {
    auth: { getUser: async () => ({ data: { user: { id: owner } } }) },
    from(table) {
      calls.push({ caller: 'user', table });
      if (table === 'profiles') return builder({ id: owner, role: 'admin', status: 'active' });
      if (table === 'clientes') return builder([{ id: closed, empresa: 'Contrato fechado', etapa: 'closed' }, { id: crm, empresa: 'Conta comercial', etapa: 'prospect' }, { id: forbidden, empresa: 'Prospect sem acesso CRM', etapa: 'prospect' }]);
      if (table === 'atlas_jobs') return { ...builder([]), insert(payload) {
        jobs.push({ ...payload, id: request }); return builder([jobs.at(-1)], { single: true });
      } };
      if (['atlas_runs', 'atlas_conversations', 'atlas_memories', 'atlas_messages', 'atlas_inbox', 'atlas_worker_state'].includes(table)) return builder([]);
      assert.fail(`Tabela não esperada: ${table}`);
    },
    rpc(name, args) {
      calls.push({ caller: 'user', rpc: name, args });
      if (name === 'crm_ia_workspace') {
        assert.equal(args.p_action, 'bootstrap');
        return Promise.resolve(crmAllowed ? { data: { clients: [{ id: crm, empresa: 'Conta comercial' }] } }
          : { error: { code: '42501', message: 'NAO-ECOAR-SEGREDO' } });
      }
      if (name === 'atlas_recall') return builder([]);
      if (name === 'atlas_claim_run') {
        const row = { id: args.p_request_id, request_id: args.p_request_id, conversation_id: request,
          request_message: args.p_message, request_conversation_id: args.p_conversation_id, request_client_id: args.p_client_id, status: 'processing' };
        runs.set(row.id, row); return builder({ claimed: true, run: row });
      }
      if (name === 'atlas_finish_run') {
        const row = runs.get(args.p_run_id);
        Object.assign(row, { status: args.p_status, result: { content: args.p_content }, steps: args.p_steps });
        return builder(row);
      }
      assert.fail(`RPC não esperada: ${name}`);
    },
  };
  const admin = { from(table) {
    calls.push({ caller: 'service', table });
    assert.equal(table, 'atlas_settings');
    return builder({ owner_id: owner, enabled: true, auto_memory: false });
  }, rpc(name) { assert.fail(`Dados CRM não podem usar serviço privilegiado: ${name}`); } };
  const env = { SUPABASE_URL: 'https://fixture.invalid', SUPABASE_ANON_KEY: 'fixture-user', SUPABASE_SERVICE_ROLE_KEY: 'fixture-service', OPENAI_API_KEY: 'fixture-provider' };
  const provider = [];
  vm.runInNewContext(file.text, {
    require: spec => spec.includes('supabase-js') ? { createClient: (_, key) => key === env.SUPABASE_ANON_KEY ? caller : admin } : { serve: callback => { handler = callback; } },
    Deno: { env: { get: key => env[key] } }, AbortController, AbortSignal, setTimeout, clearTimeout, Response,
    fetch: async (_, init) => {
      provider.push(JSON.parse(init.body));
      return new Response(JSON.stringify({ model: 'fixture', choices: [{ message: { content: JSON.stringify({ reply: 'Vou consultar o CRM IA.', memories: [], mission: null }) } }], usage: { completion_tokens: 10 } }));
    },
  });
  const send = async body => {
    const response = await handler(new Request('https://fixture.invalid/atlas-chat', { method: 'POST', headers: { Authorization: 'Bearer fixture' }, body: JSON.stringify(body) }));
    return { status: response.status, body: await response.json() };
  };
  const bootstrap = await send({ action: 'bootstrap' });
  assert.equal(bootstrap.status, 200);
  assert.deepEqual(bootstrap.body.clients.map(row => row.id).sort(), [closed, crm].sort());
  assert.equal(bootstrap.body.clients.find(row => row.id === crm).crm_only, true);
  assert.equal(bootstrap.body.agents.find(row => row.id === 'crm').name, 'CRM IA');
  assert.ok(calls.some(row => row.caller === 'user' && row.rpc === 'crm_ia_workspace'));
  const accepted = await send({ action: 'chat', request_id: request, client_id: crm, message: 'Consulte o especialista CRM IA. Analise os leads.' });
  assert.equal(accepted.status, 200);
  assert.equal(accepted.body.status, 'completed');
  assert.equal(jobs[0].client_id, crm);
  assert.match(jobs[0].task, /CRM IA/);
  assert.equal(provider[0].model, 'gpt-4o-mini');
  const denied = await send({ action: 'chat', request_id: forbidden, client_id: forbidden, message: 'Consulte o especialista CRM IA.' });
  assert.equal(denied.status, 403);
  assert.equal(runs.has(forbidden), false);
  crmAllowed = false;
  const unavailable = await send({ action: 'bootstrap' });
  assert.equal(unavailable.status, 200);
  assert.deepEqual(unavailable.body.clients.map(row => row.id), [closed]);
  assert.ok(!JSON.stringify(unavailable.body).includes('NAO-ECOAR-SEGREDO'));
  assert.equal((await send({ action: 'chat', request_id: crm, client_id: crm, message: 'Consulte o especialista CRM IA.' })).status, 403);
  assert.equal(provider.length, 1);
});

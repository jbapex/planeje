import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createClient } from '@supabase/supabase-js';

const source = readFileSync(new URL('../../src/lib/atendimentoLojaData.js', import.meta.url), 'utf8');
const load = new Function('supabase', `${source.replace(/^import .*customSupabaseClient.*;$/m, '').replace(/^export /gm, '')}\nreturn fetchLojaBase;`);
function fixture(error) {
  const calls = [];
  const agents = [{ id: 'crm-agent', nome: 'Qualificação', ativo: true, setor_ids: [], funil: { destino_tipo: 'humano' } }, { id: 'inactive', ativo: false }];
  const db = {
    from(table) {
      assert.notEqual(table, 'cliente_atend_ia_agentes', 'A leitura de atendimento usa a projeção autorizada, sem funil bruto.');
      const q = { select() { return q; }, eq(key, value) { calls.push({ table, key, value }); return q; }, order() { return q; }, then(resolve, reject) { return Promise.resolve({ data: [{ id: table }] }).then(resolve, reject); } };
      return q;
    },
    async rpc(name, args) { calls.push({ name, args }); return { data: error ? null : agents, error }; },
  };
  return { fetch: load(db), calls, agents };
}

test('atendimento conserva agentes ativos e destino legado usando resumo por conta exata', async () => {
  const f = fixture();
  const base = await f.fetch('client-a');
  assert.deepEqual(base.agentes, [f.agents[0]]);
  assert.equal(base.agentesAtivos, 1);
  assert.equal(base.agentes[0].funil.destino_tipo, 'humano');
  assert.deepEqual(f.calls.filter(call => call.name), [{ name: 'cliente_atend_ia_agentes_resumo', args: { p_cliente_id: 'client-a' } }]);
  assert.equal(f.calls.filter(call => call.table).length, 4);
  assert.ok(f.calls.filter(call => call.table).every(call => call.key === 'cliente_id' && call.value === 'client-a'));
});

test('revogação ou falha do resumo não vira ausência de agentes nem tenta funil bruto', async () => {
  const error = { code: '42501', message: 'Conta revogada.' }, f = fixture(error);
  await assert.rejects(f.fetch('client-a'), failure => failure === error);
  assert.equal(f.calls.filter(call => call.name).length, 1);
});

test('cliente instalado preserva o operador JSON na exclusão de agentes CRM do editor legado', async () => {
  const requests = [];
  const db = createClient('https://fixture.invalid', 'synthetic-public-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async input => { requests.push(new URL(input)); return new Response('[]', { headers: { 'content-type': 'application/json' } }); } },
  });
  const response = await db.from('cliente_atend_ia_agentes').select('id').eq('cliente_id', 'client-a').is('funil->crm_ia', null);
  assert.equal(response.error, null);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].searchParams.get('funil->crm_ia'), 'is.null');
  assert.equal(requests[0].searchParams.get('cliente_id'), 'eq.client-a');
});

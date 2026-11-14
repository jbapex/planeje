import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareExecutorMemory, readExecutorMemory } from '../../supabase/functions/_shared/atlasExecutorMemory.js';

const client = '00000000-0000-4000-8000-000000000011';
const memory = { id: '00000000-0000-4000-8000-000000000101', client_id: client, content: 'Preferir reuniões pela manhã.', state: 'active', version: 2 };
const calls = [];
const caller = { rpc: async (name, args) => { calls.push({ name, args }); return { data: { rows: [memory], total: 1 }, error: null }; } };

test('conhecimento usa snapshot oficial e prepara confirmação sem gravar nem mudar escopo', async () => {
  const source = await readExecutorMemory(caller, { clientId: client, view: 'knowledge', input: {} });
  assert.equal(source.available, true); assert.equal(source.coverage.complete, true);
  const prepared = await prepareExecutorMemory(caller, { clientId: client, action: 'save_knowledge', input: { content: 'Preferir reuniões à tarde.', replaces_id: memory.id } });
  assert.equal(prepared.app, 'atlas'); assert.equal(prepared.client_id, client);
  assert.equal(prepared.payload.expected_version, 2); assert.equal(prepared.payload.replaces_id, memory.id);
  assert.match(JSON.stringify(prepared.preview), /tarde/); assert.equal(prepared.effect.external, false);
  assert.ok(calls.every(call => call.name === 'atlas_squad_knowledge_snapshot'));
  const revoke = await prepareExecutorMemory(caller, { clientId: client, action: 'revoke_knowledge', input: { id: memory.id } });
  assert.equal(revoke.payload.expected_version, 2);
  for (const input of [{ content: ' ', }, { content: 'x'.repeat(4001) }, { content: 'Texto', client_id: client }, { content: 'Texto', team_shared: true }]) await assert.rejects(prepareExecutorMemory(caller, { clientId: client, action: 'save_knowledge', input }));
  await assert.rejects(prepareExecutorMemory(caller, { clientId: null, action: 'revoke_knowledge', input: { id: memory.id } }));
});


test('conhecimento Squad mantém marca exata, paginação explícita e não aceita contratos Office', async () => {
  const seen = [];
  const scoped = { rpc: async (name, args) => { seen.push({ name, args }); return { data: { rows: [], total: 41, limit: args.p_limit, offset: args.p_offset }, error: null }; } };
  const source = await readExecutorMemory(scoped, { clientId: null, view: 'knowledge', input: { limit: 20, offset: 20 } });
  assert.deepEqual(seen, [{ name: 'atlas_squad_knowledge_snapshot', args: { p_client_id: null, p_id: null, p_limit: 20, p_offset: 20 } }]);
  assert.equal(source.coverage.complete, false); assert.equal(source.coverage.offset, 20);
  for (const scope of [{ view: 'memories' }, { view: 'knowledge', input: { limit: 41 } }, { view: 'knowledge', input: { offset: -1 } }]) await assert.rejects(readExecutorMemory(scoped, { clientId: client, ...scope }));
  for (const action of ['save_memory', 'revoke_memory']) await assert.rejects(prepareExecutorMemory(scoped, { clientId: client, action, input: {} }));
  const foreign = { rpc: async () => ({ data: { rows: [{ ...memory, client_id: null }], total: 1 }, error: null }) };
  await assert.rejects(readExecutorMemory(foreign, { clientId: client, view: 'knowledge' }), error => error.code === 'SCOPE_CONFLICT');
  assert.equal(seen.length, 1);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { canUseCrmIa, crmIaRequest } from '../../src/components/crm-ia/crmIaApi.js';

test('o acesso exige equipe ativa e módulo CRM atual', () => {
  assert.equal(canUseCrmIa({ role: 'admin', status: 'active' }, { crm: true }), true);
  for (const profile of [{ role: 'cliente', status: 'active' }, { role: 'admin', status: 'pending' }, null]) {
    assert.equal(canUseCrmIa(profile, { crm: true }), false);
  }
  assert.equal(canUseCrmIa({ role: 'admin', status: 'active' }, { crm: false }), false);
});
test('RPC mantém conta e payload explícitos e propaga conflito', async () => {
  const calls = [];
  const db = { rpc: async (name, args) => { calls.push({ name, args }); return { data: { rows: [], total: 0 } }; } };
  await crmIaRequest(db, 'leads', 'cliente-ficticio', { search: 'Nome' });
  assert.deepEqual(calls, [{ name: 'crm_ia_workspace', args: { p_action: 'leads', p_client_id: 'cliente-ficticio', p_payload: { search: 'Nome' } } }]);
  await assert.rejects(crmIaRequest({ rpc: async () => ({ error: { code: '40001', message: 'Atualize a versão.' } }) }, 'save_lead', 'cliente-ficticio'), /versão/);
});
test('envio usa a fila autenticada e teste de agente usa o endpoint existente', async () => {
  const calls = [];
  const db = { functions: { invoke: async (name, { body }) => { calls.push({ name, body }); return { data: { ok: true } }; } } };
  await crmIaRequest(db, 'send_message', 'cliente-ficticio', { contact_id: 'contato', channel_id: 'canal', body: 'Texto', request_id: 'pedido' });
  await crmIaRequest(db, 'test_agent', 'cliente-ficticio', { agent_id: 'agente', messages: [{ role: 'user', content: 'Oi' }] });
  assert.equal(calls[0].name, 'crm-ia');
  assert.equal(calls[0].body.cliente_id, 'cliente-ficticio');
  assert.equal(calls[0].body.channel_id, 'canal');
  assert.equal(calls[1].name, 'atendimento-ia');
  assert.equal(calls[1].body.acao, 'testar');
  assert.equal(calls[1].body.agente_id, 'agente');
});
test('capacidades de áudio consultam função autenticada sem alvo de mensagem', async () => {
  let request;
  const db = { functions: { invoke: async (name, args) => { request = { name, ...args }; return { data: { audio: { available: false } } }; } } };
  await crmIaRequest(db, 'capabilities', 'cliente-ficticio');
  assert.deepEqual(request, { name: 'crm-ia', body: { cliente_id: 'cliente-ficticio', mode: 'capabilities' } });
});
test('slots conferem Google antes do RPC e preservam conta, owner e reserva original', async () => {
  const calls = [];
  const db = { functions: { invoke: async (name, args) => { calls.push({ name, ...args }); return { data: { required: true, fresh: true } }; } },
    rpc: async (name, args) => { calls.push({ name, args }); return { data: { rows: [] } }; } };
  await crmIaRequest(db, 'slots', 'client-a', { date: '2026-12-03', owner_id: 'owner-a', lead_id: 'lead-a', appointment_id: 'original' });
  assert.equal(calls[0].name, 'crm-ia-calendar'); assert.equal(calls[0].body.action, 'busy'); assert.equal(calls[0].body.client_id, 'client-a');
  assert.equal(calls[0].body.owner_id, 'owner-a'); assert.equal(calls[0].body.appointment_id, 'original');
  assert.equal(calls[0].body.since, '2026-12-02T00:00:00.000Z'); assert.equal(calls[0].body.until, '2026-12-05T00:00:00.000Z');
  assert.equal(calls[1].name, 'crm_ia_workspace');
  calls.length = 0;
  db.functions.invoke = async () => ({ data: { required: true, fresh: false } });
  await assert.rejects(crmIaRequest(db, 'slots', 'client-a', { date: '2026-12-03', owner_id: 'owner-a' }), /Google/);
  assert.equal(calls.length, 0);
});

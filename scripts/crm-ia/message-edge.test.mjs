import assert from 'node:assert/strict';
import test from 'node:test';
import { handleCrmIaMessage } from '../../supabase/functions/crm-ia/message.js';

const body = { cliente_id: '00000000-0000-4000-8000-000000000011', contact_id: '00000000-0000-4000-8000-000000000031', channel_id: '00000000-0000-4000-8000-000000000021', body: 'Mensagem sintética', request_id: '00000000-0000-4000-8000-000000000101' };
const request = (payload = body, token = 'Bearer fixture') => new Request('https://fixture.invalid/crm-ia', {
  method: 'POST', headers: { Authorization: token, 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
});
test('mensagem humana é autorizada pela RPC, reservada e só então despachada', async () => {
  const calls = [];
  const result = await handleCrmIaMessage({ req: request(),
    makeCaller: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'equipe' } } }) }, rpc: async (name, args) => {
      calls.push({ name, args }); return { data: { id: 'item', status: 'pending' } };
    } }), db: {}, send: async () => assert.fail('dispatcher injectable'),
    dispatch: async ({ ids }) => { calls.push({ ids }); return { results: [{ id: 'item', status: 'sent' }] }; },
  });
  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), { id: 'item', status: 'sent' });
  assert.equal(calls[0].name, 'crm_ia_workspace');
  assert.equal(calls[0].args.p_action, 'schedule_message');
  assert.equal(calls[0].args.p_client_id, body.cliente_id);
  assert.deepEqual(calls[1].ids, ['item']);
});
test('acesso recusado não cria fila nem chama transporte', async () => {
  const response = await handleCrmIaMessage({ req: request(), makeCaller: () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'equipe' } } }) }, rpc: async () => ({ error: { code: '42501', message: 'Sem acesso ao canal.' } }),
  }), db: {}, send: () => assert.fail('send'), dispatch: () => assert.fail('dispatch') });
  assert.equal(response.status, 403);
});
test('resultado incerto conserva identificador e não afirma mensagem entregue', async () => {
  const result = await handleCrmIaMessage({ req: request(), makeCaller: () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'equipe' } } }) }, rpc: async () => ({ data: { id: 'item', status: 'pending' } }),
  }), db: {}, send: () => {}, dispatch: async () => ({ results: [{ id: 'item', status: 'uncertain' }] }) });
  assert.equal(result.status, 202);
  assert.equal((await result.json()).status, 'uncertain');
});
test('anexo guarda somente descritor e entrega bytes apenas ao transporte reservado', async () => {
  let prepared, transported;
  const result = await handleCrmIaMessage({ req: request({ ...body, mode: 'media', file: btoa('arquivo sintético'), media_type: 'document', doc_name: 'teste.pdf', mimetype: 'application/pdf' }),
    makeCaller: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'equipe' } } }) }, rpc: async (name, args) => {
      prepared = args; return { data: { id: 'item', status: 'pending' } };
    } }), db: {}, send: async payload => { transported = payload; return { ok: true }; },
    dispatch: async ({ send, ids }) => { assert.deepEqual(ids, ['item']); await send({ outbox_id: 'item' }); return { results: [{ id: 'item', status: 'sent' }] }; },
  });
  assert.equal(result.status, 200); assert.equal(prepared.p_action, 'prepare_media');
  assert.equal(prepared.p_payload.media_descriptor.file_name, 'teste.pdf');
  assert.equal(JSON.stringify(prepared).includes(btoa('arquivo sintético')), false);
  assert.equal(transported.file, btoa('arquivo sintético')); assert.equal(transported.outbox_id, 'item');
});
test('abrir mídia exige mensagem conhecida no contato e canal antes de baixar', async () => {
  let downloaded = false;
  const result = await handleCrmIaMessage({ req: request({ ...body, mode: 'media_get', message_id: 'foreign', media_kind: 'image' }),
    makeCaller: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'equipe' } } }) }, rpc: async (name, args) => {
      assert.equal(args.p_action, 'authorize_media'); assert.equal(args.p_payload.channel_id, body.channel_id);
      return { error: { code: '42501', message: 'Mensagem não autorizada.' } };
    } }), download: async () => { downloaded = true; }, db: {} });
  assert.equal(result.status, 403); assert.equal(downloaded, false);
});

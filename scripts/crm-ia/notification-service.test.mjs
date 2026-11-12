import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { authorizeCrmIaServiceDelivery } from '../../supabase/functions/_shared/crmIaServiceDelivery.js';
const body = { origem: 'crm-ia', outbox_id: 'outbox', claim_token: 'claim', cliente_id: 'tenant', whatsapp_config_id: 'channel', contact_id: 'source', to: '5511000000000@s.whatsapp.net', body: 'Resumo' };
const proof = { event_id: 'event', source_contact_id: 'source', to: body.to };
function db({ notification = true, human = false, changed = false } = {}) {
  let checks = 0;
  return { async rpc(name) {
    if (name === 'crm_ia_delivery_recheck') return { data: { ...body, id: body.outbox_id, allowed: !(changed && checks++ > 0), ...(notification && { internal_notification: proof }) } };
    if (name === 'crm_ia_delivery_actor_check') return { data: { allowed: true, human, actor_id: 'actor' } };
    if (name === 'crm_ia_delivery_start') return { data: true };
    assert.fail(name);
  } };
}
test('exceção de contato nasce somente da prova SQL e é revalidada após consumo', async () => {
  const result = await authorizeCrmIaServiceDelivery(db(), body);
  assert.deepEqual(result.internalNotification, proof);
  assert.equal(result.human, false);
  assert.equal((await authorizeCrmIaServiceDelivery(db({ changed: true }), body)).allowed, false);
  assert.equal((await authorizeCrmIaServiceDelivery(db({ human: true }), body)).allowed, false);
  const forged = await authorizeCrmIaServiceDelivery(db({ notification: false }), { ...body, internal_notification: proof });
  assert.equal(forged.internalNotification, undefined);
});
test('aviso rejeita aliases, mídia, reação, encaminhamento, citação e destino alterado', async () => {
  for (const patch of [{ internal: true }, { file: 'AA==' }, { caption: '' }, { media_type: '' }, { action: '' }, { forward: true }, { replyid: 'id' }, { reply_to_message_id: 'id' }, { to_jid: body.to }, { text: body.body }, { message: body.body }, { conversation_id: 'source-conversation' }, { contact_id: 'forged' }, { to: '5511000000001@s.whatsapp.net' }, { whatsapp_config_id: 'foreign' }, { claim_token: 'other' }]) {
    assert.equal((await authorizeCrmIaServiceDelivery(db(), { ...body, ...patch })).allowed, false, JSON.stringify(patch));
  }
});
test('endpoint exige prova derivada e revalida junto ao fetch textual', () => {
  const edge = readFileSync(new URL('../../supabase/functions/uazapi-send-message/index.ts', import.meta.url), 'utf8');
  assert.match(edge, /!serviceDelivery.internalNotification && to/);
  assert.match(edge, /revalidateCrmIaInternalNotification\(supabase, body, serviceDelivery.internalNotification\)/);
  assert.doesNotMatch(edge, /body\.internal\s*===\s*true/);
});

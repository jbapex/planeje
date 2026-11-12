import assert from 'node:assert/strict';
import test from 'node:test';
import { authorizeCrmIaServiceDelivery } from '../../supabase/functions/_shared/crmIaServiceDelivery.js';
import { crmIaMediaDescriptor } from '../../supabase/functions/_shared/crmIaMediaPayload.js';

const target = { allowed: true, id: 'request', cliente_id: 'client', whatsapp_config_id: 'channel', contact_id: 'contact', to: '551199999999@s.whatsapp.net', body: 'Texto', claim_token: 'lease' };
const body = { origem: 'crm-ia', outbox_id: 'request', claim_token: 'lease', cliente_id: 'client', whatsapp_config_id: 'channel', contact_id: 'contact', to: target.to, body: 'Texto' };
function db({ actor = true, allowed = true } = {}) {
  return { async rpc(name) {
    if (name === 'crm_ia_delivery_recheck') return { data: { ...target, allowed } };
    if (name === 'crm_ia_delivery_actor_check') return { data: actor ? { allowed: true, actor_id: 'staff', human: true } : { allowed: false } };
    if (name === 'crm_ia_delivery_start') return { data: true };
    assert.fail(name);
  } };
}
test('transporte de serviço exige claim e destino idêntico ao registro', async () => {
  assert.equal((await authorizeCrmIaServiceDelivery(db(), body)).allowed, true);
  for (const patch of [{ body: 'Outro' }, { to: '551100000000@s.whatsapp.net' }, { whatsapp_config_id: 'other' }, { action: 'delete' }, { file: 'anexo' }, { conversation_id: 'other' }]) {
    assert.equal((await authorizeCrmIaServiceDelivery(db(), { ...body, ...patch })).allowed, false);
  }
});
test('permissão revogada e lease perdida bloqueiam o transporte', async () => {
  assert.equal((await authorizeCrmIaServiceDelivery(db({ actor: false }), body)).allowed, false);
  assert.equal((await authorizeCrmIaServiceDelivery(db({ allowed: false }), body)).allowed, false);
  assert.equal((await authorizeCrmIaServiceDelivery({ rpc: async () => ({ error: {} }) }, body)).allowed, false);
});
test('resposta imediata legada não recebe autorização de fila por inferência', async () => {
  assert.equal((await authorizeCrmIaServiceDelivery(db(), { origem: 'atendimento-ia' })).handled, false);
});
test('mídia usa a mesma reserva e só aceita os bytes e metadados autorizados', async () => {
  const mediaBody = { ...body, file: btoa('imagem sintética'), media_type: 'image', mimetype: 'image/png', doc_name: 'foto.png', caption: 'Legenda' };
  const descriptor = await crmIaMediaDescriptor(mediaBody);
  const database = { async rpc(name) { return { data: name === 'crm_ia_delivery_start' ? true : name === 'crm_ia_delivery_recheck'
    ? { ...target, media_descriptor: descriptor } : { allowed: true, actor_id: 'staff', human: true } }; } };
  assert.equal((await authorizeCrmIaServiceDelivery(database, mediaBody)).allowed, true);
  assert.equal((await authorizeCrmIaServiceDelivery(database, { ...mediaBody, file: btoa('outros bytes') })).allowed, false);
  assert.equal((await authorizeCrmIaServiceDelivery(database, { ...mediaBody, caption: 'Outra legenda' })).allowed, false);
  assert.equal('file' in descriptor, false);
});
test('duas chamadas com a mesma reserva só liberam um transporte', async () => {
  let consumed = false;
  const database = db(); const rpc = database.rpc;
  database.rpc = async name => name === 'crm_ia_delivery_start' ? { data: !consumed && (consumed = true) } : rpc(name);
  const results = await Promise.all([authorizeCrmIaServiceDelivery(database, body), authorizeCrmIaServiceDelivery(database, body)]);
  assert.equal(results.filter(result => result.allowed).length, 1);
});
test('fronteira de arquivo recusa base64 inválido e legenda que seria truncada', async () => {
  await assert.rejects(crmIaMediaDescriptor({ file: 'invalido!', media_type: 'image', mimetype: 'image/png' }), /inválido/);
  await assert.rejects(crmIaMediaDescriptor({ file: btoa('arquivo'), media_type: 'document', caption: 'a'.repeat(4001) }), /legenda/i);
});

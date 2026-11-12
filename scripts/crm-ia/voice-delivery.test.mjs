import assert from 'node:assert/strict';
import test from 'node:test';
import { dispatchCrmIaQueue } from '../../supabase/functions/_shared/crmIaDelivery.js';
import { authorizeCrmIaServiceDelivery } from '../../supabase/functions/_shared/crmIaServiceDelivery.js';
import { crmIaMediaDescriptor } from '../../supabase/functions/_shared/crmIaMediaPayload.js';

const payload = { file: btoa('OggS fixture OpusHead audio'), media_type: 'ptt', mimetype: 'audio/ogg', doc_name: 'resposta.ogg', caption: 'Resposta confirmada' };
const row = { id: 'item', claim_token: 'claim', cliente_id: 'client', whatsapp_config_id: 'channel', contact_id: 'contact', to: '551199999999@s.whatsapp.net', body: payload.caption };
function fixture({ generation = { ok: true }, revoke = false } = {}) {
  const events = [], result = { ...row, status: 'pending', voice_status: 'off' };
  let consumed = false;
  const db = { async rpc(name, args) {
    events.push(name);
    if (name === 'crm_ia_delivery_claim') { const picked = result.status === 'pending'; if (picked) result.status = 'sending'; return { data: picked ? [row] : [] }; }
    if (name === 'crm_ia_delivery_recheck') return { data: { ...result, allowed: !revoke || result.voice_status === 'off',
      voice: { enabled: true, voice: 'alloy', speed: 1 }, voice_descriptor: result.voice_descriptor } };
    if (name === 'crm_ia_voice_begin') { result.voice_status = 'generating'; return { data: { allowed: true, settings: { enabled: true, voice: 'alloy', speed: 1 } } }; }
    if (name === 'crm_ia_voice_complete') {
      Object.assign(result, { voice_status: args.p_descriptor ? 'ready' : 'text_fallback', voice_descriptor: args.p_descriptor, voice_error_code: args.p_error_code });
      return { data: !revoke };
    }
    if (name === 'crm_ia_delivery_actor_check') return { data: { allowed: true, human: false, actor_id: 'staff' } };
    if (name === 'crm_ia_delivery_start') { if (consumed) return { data: false }; consumed = true; return { data: true }; }
    if (name === 'crm_ia_delivery_finish') { Object.assign(result, { status: args.p_status }); return { data: true }; }
    assert.fail(name);
  } };
  return { db, events, result, generateVoice: async () => { events.push('tts'); return generation.ok ? { ok: true, payload, descriptor: await crmIaMediaDescriptor(payload) } : generation; } };
}
test('gera voz uma vez sob lease, autoriza somente o hash exato e mantém replay bloqueado', async () => {
  const f = fixture(); let calls = 0, sent;
  await dispatchCrmIaQueue({ ...f, send: async body => { calls++; sent = body; assert.equal((await authorizeCrmIaServiceDelivery(f.db, body)).allowed, true); return { ok: true, messageId: 'receipt' }; } });
  await dispatchCrmIaQueue({ ...f, send: async () => { calls++; } });
  assert.equal(f.events.filter(item => item === 'tts').length, 1);
  assert.equal(calls, 1);
  assert.equal(sent.file, payload.file);
  assert.ok(f.events.indexOf('crm_ia_voice_begin') < f.events.indexOf('tts'));
  assert.ok(f.events.indexOf('crm_ia_voice_complete') < f.events.indexOf('crm_ia_delivery_start'));
  assert.equal((await authorizeCrmIaServiceDelivery(f.db, sent)).allowed, false);
  assert.equal((await authorizeCrmIaServiceDelivery(f.db, { ...sent, file: btoa('other') })).allowed, false);
});
test('TTS indisponível registra fallback antes de enviar texto sem anunciar voz', async () => {
  for (const error of ['voice_unavailable', 'voice_timeout', 'voice_file_too_large']) {
    const f = fixture({ generation: { ok: false, error } }); let sent;
    const batch = await dispatchCrmIaQueue({ ...f, send: async body => { sent = body; return { ok: true }; } });
    assert.equal(sent.file, undefined);
    assert.equal(sent.body, row.body);
    assert.equal(f.result.voice_status, 'text_fallback');
    assert.equal(f.result.voice_error_code, error);
    assert.equal(batch.results[0].voice_status, 'text_fallback');
  }
});
test('contexto revogado depois da geração impede transporte e falha WhatsApp não repete TTS', async () => {
  const revoked = fixture({ revoke: true }); let calls = 0;
  await dispatchCrmIaQueue({ ...revoked, send: async () => { calls++; } });
  assert.equal(calls, 0);
  const f = fixture();
  await dispatchCrmIaQueue({ ...f, send: async () => { calls++; throw new Error('timeout'); } });
  await dispatchCrmIaQueue({ ...f, send: async () => { calls++; } });
  assert.equal(calls, 1);
  assert.equal(f.result.status, 'uncertain');
  assert.equal(f.events.filter(item => item === 'tts').length, 1);
});

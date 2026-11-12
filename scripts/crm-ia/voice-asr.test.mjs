import assert from 'node:assert/strict';
import test from 'node:test';
import * as voice from '../../supabase/functions/_shared/crmIaVoice.js';
import { decodeAudio, transcribeGroupAudio } from '../../supabase/functions/_shared/atlasGroupAudio.js';

const audio = btoa('ID3' + 'x'.repeat(80));
const args = { clientId: 'client', channelId: 'channel', contactId: 'contact', messageId: 'inbound', apiKey: 'fixture' };
test('opção multilíngue do CRM preserva português nos consumidores anteriores do helper', async () => {
  const result = await transcribeGroupAudio({ audio: decodeAudio(audio), apiKey: 'fixture', fetcher: async (_url, init) => {
    assert.equal(init.body.get('language'), 'pt');
    return Response.json({ text: 'Áudio sintético.' });
  } });
  assert.equal(result.text, 'Áudio sintético.');
});
function fixture({ allowed = true, cached, revoke = 0 } = {}) {
  const calls = []; let checks = 0, saved;
  return { calls, get saved() { return saved; }, db: { async rpc(name, data) {
    calls.push(name);
    if (name === 'crm_ia_audio_begin') return { data: { allowed, id: 'audio-job', claim_token: 'token', ...(cached || {}) } };
    if (name === 'crm_ia_audio_recheck') return { data: { allowed: ++checks !== revoke, inbox: { message_id: 'inbound', raw_payload: {} }, config: { subdomain: 'fixture', token: 'fixture' } } };
    if (name === 'crm_ia_audio_complete') { saved = data; return { data: true }; }
    assert.fail(name);
  } } };
}
test('ASR está disponível com autorização separada da voz de saída', () => assert.equal(typeof voice.processCrmIaAudioInput, 'function'));
if (voice.processCrmIaAudioInput) {
  test('baixa somente do canal autorizado e transcreve sem vocabulário Atlas', async () => {
    const f = fixture(), fetches = [];
    const result = await voice.processCrmIaAudioInput({ ...args, db: f.db, fetchImpl: async (url, init) => {
      fetches.push(url);
      if (url === 'https://fixture.uazapi.com/message/download') { assert.deepEqual(JSON.parse(init.body), { id: 'inbound', return_link: false, return_base64: true, generate_mp3: true }); return Response.json({ base64: audio }); }
      assert.equal(url, 'https://api.openai.com/v1/audio/transcriptions');
      assert.equal(init.body.get('model'), 'gpt-4o-mini-transcribe');
      assert.equal(init.body.has('prompt'), false);
      assert.equal(init.body.has('language'), false);
      return Response.json({ text: 'Quero agendar amanhã.', usage: { total_tokens: 5 } });
    } });
    assert.equal(result.transcript, 'Quero agendar amanhã.');
    assert.equal(fetches.length, 2);
    assert.equal(f.saved.p_transcript, result.transcript);
    assert.equal('file' in f.saved, false);
  });
  test('opt-in ausente, cache e repetição falha não geram custo adicional', async () => {
    for (const options of [{ allowed: false }, { cached: { cached: true, status: 'completed', transcript: 'Já transcrito' } }, { cached: { cached: true, status: 'failed', error_code: 'audio_unavailable' } }]) {
      const f = fixture(options);
      const result = await voice.processCrmIaAudioInput({ ...args, db: f.db, fetchImpl: async () => assert.fail('cache/download') });
      assert.equal(result.ok, options.cached?.status === 'completed');
    }
    const f = fixture();
    const result = await voice.processCrmIaAudioInput({ ...args, db: f.db, apiKey: '', fetchImpl: async () => assert.fail('no key') });
    assert.equal(result.error, 'audio_unavailable');
    assert.equal(f.saved.p_error_code, 'audio_unavailable');
  });
  test('URL arbitrária, arquivo acima de 4 MB e áudio vazio nunca chegam ao modelo', async () => {
    for (const data of [{ fileURL: 'https://attacker.invalid/audio' }, { base64: btoa('x'.repeat(4194305)) }, { base64: btoa('ID3') }]) {
      const f = fixture(); let requests = 0;
      const result = await voice.processCrmIaAudioInput({ ...args, db: f.db, fetchImpl: async url => { requests++; assert.equal(url, 'https://fixture.uazapi.com/message/download'); return Response.json(data); } });
      assert.equal(result.ok, false); assert.equal(requests, 1); assert.ok(f.saved.p_error_code);
    }
  });
  test('revalida antes do download e antes do custo e limita timeout sem retry', async () => {
    for (const revoke of [1, 2]) {
      const f = fixture({ revoke }); let requests = 0;
      const result = await voice.processCrmIaAudioInput({ ...args, db: f.db, fetchImpl: async () => { requests++; return Response.json({ base64: audio }); } });
      assert.equal(result.ok, false); assert.equal(requests, revoke - 1);
    }
    const f = fixture(); let requests = 0;
    const result = await voice.processCrmIaAudioInput({ ...args, db: f.db, timeoutMs: 5, fetchImpl: async () => { requests++; return new Promise(() => {}); } });
    assert.equal(result.error, 'audio_timeout'); assert.equal(requests, 1);
  });
}

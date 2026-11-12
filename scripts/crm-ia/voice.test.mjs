import assert from 'node:assert/strict';
import test from 'node:test';

const voice = await import('../../supabase/functions/_shared/crmIaVoice.js').catch(() => null);
const settings = { enabled: true, voice: 'alloy', speed: 1 };
const ogg = new TextEncoder().encode('OggS\x00fixture OpusHead synthetic audio');
test('gerador de voz disponível com chave somente do servidor', () => assert.ok(voice?.generateCrmIaVoice));
if (voice) {
  test('modos de áudio preservam forma legada e nunca concedem custo a cópia desligada',()=>{
    const legacy={enabled:true,input_enabled:false,voice:'alloy',speed:1};
    assert.deepEqual(voice.normalizeCrmIaAudio(legacy),legacy);
    for(const mode of ['never','always','mirror']){
      const normalized=voice.normalizeCrmIaAudio({...legacy,mode});assert.equal(normalized.mode,mode);assert.equal(normalized.enabled,mode!=='never');
    }
    assert.equal(voice.normalizeCrmIaAudio({...legacy,enabled:false,mode:'mirror'}).enabled,false);
    assert.throws(()=>voice.normalizeCrmIaAudio({...legacy,mode:'invented'}),/voz/);
  });
  test('voz desligada, sem chave e entrada inválida não fazem chamada paga', async () => {
    let calls = 0;
    const fetchImpl = async () => { calls++; throw new Error('unexpected'); };
    for (const patch of [{ settings: { ...settings, enabled: false } }, { apiKey: '' },
      { settings: { ...settings, voice: 'custom' } }, { settings: { ...settings, speed: 5 } }, { text: 'x'.repeat(4097) }]) {
      const result = await voice.generateCrmIaVoice({ settings, text: 'Olá', apiKey: 'fixture', fetchImpl, ...patch });
      assert.equal(result.ok, false);
    }
    assert.equal(calls, 0);
  });
  test('usa modelo fixo, divulgação de voz sintética e Opus sem guardar bytes', async () => {
    let request;
    const result = await voice.generateCrmIaVoice({ settings, text: 'Horário confirmado.', apiKey: 'fixture', fetchImpl: async (url, init) => {
      request = { url, init, body: JSON.parse(init.body) };
      return new Response(ogg, { headers: { 'content-type': 'audio/ogg' } });
    } });
    assert.equal(result.ok, true);
    assert.equal(request.url, 'https://api.openai.com/v1/audio/speech');
    assert.equal(request.init.redirect, 'error');
    assert.deepEqual(request.body, { model: 'gpt-4o-mini-tts', input: voice.CRM_IA_VOICE_DISCLOSURE + 'Horário confirmado.', voice: 'alloy', speed: 1, response_format: 'opus' });
    assert.equal(result.payload.media_type, 'ptt');
    assert.equal(result.payload.caption, 'Horário confirmado.');
    assert.equal(result.descriptor.size, ogg.length);
    assert.equal('file' in result.descriptor, false);
    assert.equal(JSON.stringify(result.descriptor).includes(btoa(String.fromCharCode(...ogg))), false);
  });
  test('limite de 4 MB funciona também em stream sem content-length', async () => {
    for (const response of [new Response(new Uint8Array(4194305), { headers: { 'content-type': 'audio/ogg', 'content-length': '4194305' } }),
      new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(4194304)); controller.enqueue(new Uint8Array(1)); controller.close(); } }), { headers: { 'content-type': 'audio/ogg' } })]) {
      const result = await voice.generateCrmIaVoice({ settings, text: 'Olá', apiKey: 'fixture', fetchImpl: async () => response });
      assert.deepEqual(result, { ok: false, error: 'voice_file_too_large' });
    }
  });
  test('timeout, erro do provedor e arquivo falso falham antes do WhatsApp sem retry', async () => {
    let calls = 0;
    const timed = await voice.generateCrmIaVoice({ settings, text: 'Olá', apiKey: 'fixture', timeoutMs: 5,
      fetchImpl: async () => { calls++; return new Promise(() => {}); } });
    assert.deepEqual(timed, { ok: false, error: 'voice_timeout' });
    assert.equal(calls, 1);
    for (const response of [new Response('secret provider failure', { status: 500 }), new Response('not audio', { headers: { 'content-type': 'audio/ogg' } })]) {
      const result = await voice.generateCrmIaVoice({ settings, text: 'Olá', apiKey: 'fixture', fetchImpl: async () => response });
      assert.equal(result.ok, false);
      assert.equal(JSON.stringify(result).includes('secret'), false);
    }
  });
}

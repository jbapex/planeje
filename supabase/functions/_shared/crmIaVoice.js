import { crmIaMediaDescriptor } from './crmIaMediaPayload.js';
import { audioMessageIds, downloadGroupAudio, transcribeGroupAudio } from './atlasGroupAudio.js';

// https://developers.openai.com/api/docs/guides/text-to-speech
export const CRM_IA_VOICE_MODEL = 'gpt-4o-mini-tts';
export const CRM_IA_VOICES = ['alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'nova', 'onyx', 'sage', 'shimmer', 'verse', 'marin', 'cedar'];
export const CRM_IA_TTS_VOICES = CRM_IA_VOICES;
export const CRM_IA_VOICE_DISCLOSURE = 'Mensagem de voz gerada por inteligência artificial. ';
const MAX_BYTES = 4194304;
export const CRM_IA_ASR_MODEL = 'gpt-4o-mini-transcribe';

export function normalizeCrmIaAudio(value) {
  const defaults = { enabled: false, input_enabled: false, voice: 'alloy', speed: 1 };
  if (value == null || value === 'nunca') return defaults;
  if (typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => ![...Object.keys(defaults),'mode'].includes(key))) throw new Error('Configuração de voz inválida.');
  const config = { ...defaults, ...value };
  if (typeof config.enabled !== 'boolean' || typeof config.input_enabled !== 'boolean' || !CRM_IA_VOICES.includes(config.voice) || typeof config.speed !== 'number' || !Number.isFinite(config.speed) || config.speed < 0.25 || config.speed > 4) throw new Error('Configuração de voz inválida.');
  if ('mode' in config && !['never','always','mirror'].includes(config.mode)) throw new Error('Configuração de voz inválida.');
  if (config.mode === 'never') config.enabled = false;
  return config;
}

/** File bytes live only in this request; the caller must reserve and authorize the cost first. */
export async function generateCrmIaVoice({ text, settings, apiKey = globalThis.Deno?.env?.get('OPENAI_API_KEY'), fetchImpl = fetch, timeoutMs = 15000 }) {
  if (settings?.enabled !== true || settings.mode === 'never') return { ok: false, error: 'voice_disabled' };
  if (!apiKey) return { ok: false, error: 'voice_unavailable' };
  if (!CRM_IA_VOICES.includes(settings.voice) || typeof settings.speed !== 'number' || !Number.isFinite(settings.speed) || settings.speed < 0.25 || settings.speed > 4) return { ok: false, error: 'voice_invalid_config' };
  if (typeof text !== 'string' || !text.trim() || (CRM_IA_VOICE_DISCLOSURE + text).length > 4096) return { ok: false, error: 'voice_input_too_long' };
  const controller = new AbortController();
  let timer;
  const failure = error => ({ ok: false, error });
  try {
    return await Promise.race([
      new Promise(resolve => { timer = setTimeout(() => { controller.abort(); resolve(failure('voice_timeout')); }, timeoutMs); }),
      (async () => {
        const response = await fetchImpl('https://api.openai.com/v1/audio/speech', { method: 'POST', redirect: 'error', signal: controller.signal,
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: CRM_IA_VOICE_MODEL, input: CRM_IA_VOICE_DISCLOSURE + text, voice: settings.voice, speed: settings.speed, response_format: 'opus' }) });
        if (!response.ok) { await response.body?.cancel(); return failure('voice_generation_failed'); }
        if (Number(response.headers.get('content-length')) > MAX_BYTES) { await response.body?.cancel(); return failure('voice_file_too_large'); }
        if (!/^(audio\/(ogg|opus)|application\/octet-stream)(;|$)/i.test(response.headers.get('content-type') || '') || !response.body) { await response.body?.cancel(); return failure('voice_invalid_file'); }
        const reader = response.body.getReader(), chunks = [];
        let size = 0;
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > MAX_BYTES) { await reader.cancel(); return failure('voice_file_too_large'); }
            chunks.push(value);
          }
        } finally { reader.releaseLock(); }
        const bytes = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
        const header = new TextDecoder().decode(bytes.subarray(0, 128));
        if (!header.startsWith('OggS') || !header.includes('OpusHead')) return failure('voice_invalid_file');
        let binary = '';
        for (let index = 0; index < bytes.length; index += 8192) binary += String.fromCharCode(...bytes.subarray(index, index + 8192));
        const payload = { file: btoa(binary), media_type: 'ptt', mimetype: 'audio/ogg', doc_name: 'resposta.ogg', caption: text };
        return { ok: true, payload, descriptor: await crmIaMediaDescriptor(payload) };
      })(),
    ]);
  } catch {
    return failure(controller.signal.aborted ? 'voice_timeout' : 'voice_generation_failed');
  } finally { clearTimeout(timer); controller.abort(); }
}

/** Only the claimed inbox message may be downloaded; transcripts remain private source evidence. */
export async function processCrmIaAudioInput({ db, clientId, channelId, contactId, messageId, apiKey = globalThis.Deno?.env?.get('OPENAI_API_KEY'), fetchImpl = fetch, timeoutMs = 20000 }) {
  const read = async (name, args) => { const result = await db.rpc(name, args); if (result.error) throw new Error('audio_state_unconfirmed'); return result.data; };
  const job = await read('crm_ia_audio_begin', { p_client: clientId, p_channel: channelId, p_contact: contactId, p_message: messageId });
  if (job?.allowed !== true) return { ok: false, skipped: job?.reason || 'audio_not_allowed' };
  if (job.cached) return job.status === 'completed' ? { ok: true, transcript: job.transcript } : { ok: false, error: job.error_code || 'audio_unavailable' };
  const claim = { p_id: job.id, p_claim_token: job.claim_token };
  const controller = new AbortController(); let timer;
  let transcript = null, error = 'audio_unavailable';
  try {
    if (apiKey) {
      const result = await Promise.race([
        new Promise(resolve => { timer = setTimeout(() => { controller.abort(); resolve({ error: 'audio_timeout' }); }, timeoutMs); }),
        (async () => {
          const target = await read('crm_ia_audio_recheck', claim);
          if (target?.allowed !== true) return { skipped: 'audio_context_changed' };
          const audio = await downloadGroupAudio({ ids: audioMessageIds(target.inbox), config: target.config, signal: controller.signal, fetcher: fetchImpl, maxBytes: MAX_BYTES });
          const beforeCost = await read('crm_ia_audio_recheck', claim);
          if (beforeCost?.allowed !== true) return { skipped: 'audio_context_changed' };
          return await transcribeGroupAudio({ audio, apiKey, model: CRM_IA_ASR_MODEL, signal: controller.signal, fetcher: fetchImpl, prompt: '', language: '' });
        })(),
      ]);
      if (result.skipped) return { ok: false, skipped: result.skipped };
      transcript = result.text || null; error = result.error || null;
    }
  } catch (failure) {
    error = controller.signal.aborted ? 'audio_timeout' : failure.message === 'AUDIO_TOO_LARGE' ? 'audio_file_too_large' : 'audio_unavailable';
  } finally { clearTimeout(timer); controller.abort(); }
  const confirmed = await read('crm_ia_audio_complete', { ...claim, p_transcript: transcript, p_error_code: transcript ? null : error || 'audio_unavailable' });
  if (!confirmed) return { ok: false, skipped: 'audio_context_changed' };
  return transcript ? { ok: true, transcript } : { ok: false, error: error || 'audio_unavailable' };
}

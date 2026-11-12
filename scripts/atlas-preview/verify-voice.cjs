const { chromium } = require(process.env.ATLAS_PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.ATLAS_CHROME_PATH || undefined });
  const page = await browser.newPage({ viewport: { width: 1280, height: 1100 } });
  const errors = [], external = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/*', (route) => { const url = new URL(route.request().url()); if (url.hostname === '127.0.0.1') return route.continue(); external.push(url.origin); return route.abort(); });
  // No real microphone/device/network. Exercise the real hook/session with fake transport.
  await page.addInitScript(() => {
    const track = { enabled: true, stopped: false, stop() { this.stopped = true; } };
    const stream = { getTracks: () => [track], getAudioTracks: () => [track] };
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => { track.stopped = false; return stream; } } });
    window.__voiceFake = { track, messages: [] };
    window.RTCPeerConnection = class {
      addTrack() {}
      createDataChannel() { this.dc = { readyState: 'open', send: (data) => window.__voiceFake.messages.push(JSON.parse(data)), close() { this.readyState = 'closed'; this.onclose?.(); } }; window.__voiceFake.channel = this.dc; return this.dc; }
      async createOffer() { return { sdp: 'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111' }; }
      async setLocalDescription() {}
      async setRemoteDescription() { this.connectionState = 'connected'; this.onconnectionstatechange?.(); this.dc.onopen?.(); }
      close() { this.connectionState = 'closed'; this.onconnectionstatechange?.(); }
    };
  });
  await page.goto('http://127.0.0.1:4317/?voice=1');
  await page.getByRole('button', { name: /Conversar por voz/ }).click();
  await page.getByText('Pode falar. Estou ouvindo.', { exact: true }).waitFor();
  assert.equal(await page.locator('#atlas-client').isDisabled(), true);
  await page.getByRole('button', { name: 'Pausar microfone', exact: true }).click();
  assert.equal(await page.evaluate(() => window.__voiceFake.track.enabled), false);
  await page.getByRole('button', { name: 'Ativar microfone', exact: true }).click();
  assert.equal(await page.evaluate(() => window.__voiceFake.track.enabled), true);
  await page.evaluate(() => window.__voiceFake.channel.onmessage({ data: JSON.stringify({ type: 'response.done', response: { status: 'completed', output: [{ type: 'function_call', call_id: 'voice-call', name: 'consult_atlas', arguments: JSON.stringify({ message: 'Organize minhas prioridades por voz.' }) }] } }) }));
  await page.waitForFunction(() => window.__voiceFake.messages.some((event) => event.type === 'conversation.item.create'));
  assert.equal(await page.locator('.atlas-message').count(), 2);
  assert.equal(await page.evaluate(() => window.__atlasTest.calls.filter((call) => call.action === 'chat')[0].payload.message), 'Organize minhas prioridades por voz.');
  await page.evaluate(() => { const emit = (e) => window.__voiceFake.channel.onmessage({ data: JSON.stringify(e) }); emit({ type: 'response.created' }); emit({ type: 'output_audio_buffer.started' }); emit({ type: 'response.output_audio_transcript.done', transcript: 'Aqui está o seu panorama.' }); });
  await page.getByText('Atlas está falando…', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Interromper resposta', exact: true }).click();
  assert.equal(await page.evaluate(() => window.__voiceFake.messages.some((event) => event.type === 'response.cancel')), true);
  await page.getByRole('button', { name: 'Encerrar conversa por voz', exact: true }).click();
  assert.equal(await page.evaluate(() => window.__voiceFake.track.stopped), true);
  assert.equal(await page.locator('#atlas-client').isDisabled(), false);
  await page.getByRole('button', { name: /Conversar por voz/ }).click();
  await page.getByText('Pode falar. Estou ouvindo.', { exact: true }).waitFor();
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
  assert.equal(await page.evaluate(() => window.__voiceFake.track.stopped), true);
  await page.goto('http://127.0.0.1:4317/');
  await page.getByRole('button', { name: /Conversar por voz/ }).click();
  await page.getByText(/A voz real fica disponível após conectar o provedor/).waitFor();
  assert.equal(await page.evaluate(() => window.__voiceFake.track.stopped), true);
  assert.deepEqual(errors, []); assert.deepEqual(external, []);
  const result = { passed: ['voice connects through scoped backend', 'mic mute and resume', 'voice tool uses persistent Atlas chat', 'interrupt spoken response', 'end releases microphone', 'hidden tab releases microphone', 'unconfigured provider releases microphone'], realAudio: false, externalRequests: external, runtimeErrors: errors };
  fs.writeFileSync(path.resolve(__dirname, '../../.local/atlas-preview/voice-verification.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2)); await browser.close();
})().catch((error) => { console.error(error); process.exit(1); });

let audioCtx = null;
let htmlAudio = null;
let beepDataUrl = null;

const SOUND_ENABLED_KEY = 'conversas-sound-enabled';

export function isAtendimentoMessageSoundEnabled() {
  return localStorage.getItem(SOUND_ENABLED_KEY) !== 'false';
}

export function setAtendimentoMessageSoundEnabled(enabled) {
  localStorage.setItem(SOUND_ENABLED_KEY, enabled ? 'true' : 'false');
}

/** Libera/resume o AudioContext após gesto do usuário (política dos navegadores). */
export function unlockAtendimentoMessageSound() {
  if (typeof window === 'undefined') return Promise.resolve();
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return Promise.resolve();
    audioCtx = audioCtx || new Ctx();
    return audioCtx.state === 'suspended' ? audioCtx.resume() : Promise.resolve();
  } catch {
    return Promise.resolve();
  }
}

function tone(ctx, { freq, start, duration, gain = 0.12 }) {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0, start);
  g.gain.linearRampToValueAtTime(gain, start + 0.02);
  g.gain.exponentialRampToValueAtTime(0.001, start + duration);
  osc.connect(g);
  g.connect(ctx.destination);
  osc.start(start);
  osc.stop(start + duration + 0.05);
}

function scheduleNotificationTones(ctx) {
  const t0 = ctx.currentTime + 0.04;
  tone(ctx, { freq: 784, start: t0, duration: 0.1, gain: 0.16 });
  tone(ctx, { freq: 1046, start: t0 + 0.11, duration: 0.12, gain: 0.14 });
}

function buildBeepWavDataUrl() {
  if (beepDataUrl) return beepDataUrl;

  const sampleRate = 22050;
  const segments = [
    { freq: 784, start: 0, duration: 0.1 },
    { freq: 1046, start: 0.12, duration: 0.12 },
  ];
  const totalDuration = 0.28;
  const numSamples = Math.floor(sampleRate * totalDuration);
  const dataSize = numSamples * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeStr = (offset, str) => {
    for (let i = 0; i < str.length; i += 1) view.setUint8(offset + i, str.charCodeAt(i));
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);

  for (let i = 0; i < numSamples; i += 1) {
    const t = i / sampleRate;
    let sample = 0;
    for (const seg of segments) {
      if (t < seg.start || t > seg.start + seg.duration) continue;
      const local = t - seg.start;
      const env = Math.min(1, local / 0.01) * Math.max(0, 1 - (local - seg.duration * 0.65) / (seg.duration * 0.35));
      sample += Math.sin(2 * Math.PI * seg.freq * local) * env;
    }
    const clamped = Math.max(-1, Math.min(1, sample * 0.45));
    view.setInt16(44 + i * 2, Math.floor(clamped * 32767), true);
  }

  const blob = new Blob([buffer], { type: 'audio/wav' });
  beepDataUrl = URL.createObjectURL(blob);
  return beepDataUrl;
}

function playHtmlAudioFallback() {
  try {
    if (!htmlAudio) {
      htmlAudio = new Audio(buildBeepWavDataUrl());
      htmlAudio.volume = 0.55;
    }
    htmlAudio.currentTime = 0;
    const playPromise = htmlAudio.play();
    if (playPromise?.catch) playPromise.catch(() => {});
  } catch {
    /* ignore */
  }
}

/** Som curto estilo notificação de chat (dois tons suaves). */
export async function playAtendimentoMessageSound() {
  if (!isAtendimentoMessageSoundEnabled()) return;

  let webAudioPlayed = false;

  try {
    await unlockAtendimentoMessageSound();
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (Ctx) {
      audioCtx = audioCtx || new Ctx();
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
      }
      if (audioCtx.state === 'running') {
        scheduleNotificationTones(audioCtx);
        webAudioPlayed = true;
      }
    }
  } catch {
    webAudioPlayed = false;
  }

  if (!webAudioPlayed) {
    playHtmlAudioFallback();
  }
}

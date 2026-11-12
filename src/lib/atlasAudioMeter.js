/** Samples real microphone/output amplitudes; no audio is recorded or stored. */
export class AtlasAudioMeter {
  constructor(onLevel, Context = globalThis.AudioContext || globalThis.webkitAudioContext) {
    this.onLevel = onLevel; this.nodes = []; this.level = 0; this.levels = { input: 0, output: 0 };
    try { this.context = Context ? new Context() : null; this.context?.resume().catch(() => {}); } catch { this.context = null; }
  }
  add(stream, channel = 'input') {
    if (!this.context || !stream) return;
    try {
      const source = this.context.createMediaStreamSource(stream);
      const analyser = this.context.createAnalyser(); analyser.fftSize = 256;
      source.connect(analyser);
      this.nodes.push({ source, analyser, channel, values: new Float32Array(analyser.fftSize) });
      if (!this.timer) this.timer = setInterval(() => this.sample(), 50);
    } catch { /* Voice remains usable when the browser cannot visualize this stream. */ }
  }
  sample() {
    const amplitudes = { input: 0, output: 0 };
    for (const { analyser, values, channel } of this.nodes) {
      analyser.getFloatTimeDomainData(values);
      amplitudes[channel] = Math.max(amplitudes[channel] || 0, Math.sqrt(values.reduce((sum, n) => sum + n * n, 0) / values.length));
    }
    for (const channel of ['input', 'output']) {
      const target = Math.min(1, Math.max(0, amplitudes[channel] - .006) * 9);
      this.levels[channel] += (target - this.levels[channel]) * (target > this.levels[channel] ? .7 : .3);
    }
    this.level = Math.max(this.levels.input, this.levels.output);
    this.onLevel(this.level, { ...this.levels });
  }
  stop() {
    clearInterval(this.timer); this.timer = null;
    this.nodes.forEach(({ source, analyser }) => { source.disconnect(); analyser.disconnect(); });
    this.nodes = []; this.context?.close().catch(() => {}); this.context = null; this.levels = { input: 0, output: 0 }; this.onLevel(0, this.levels);
  }
}

/** Smooth, overlapping light surfaces, driven by the measured audio envelope. */
export function atlasWavePath({ level = 0, time = 0, layer = 0, reducedMotion = false } = {}) {
  const volume = reducedMotion ? 0 : Number.isFinite(level) ? Math.max(0, Math.min(1, level)) : 0;
  const phase = reducedMotion ? 0 : (Number.isFinite(time) ? time : 0);
  const radius = 108 + layer * 3 + volume * (10 + layer * 2);
  const amplitude = reducedMotion ? 0 : 8 + volume * 21;
  const drift = layer * 1.83;
  const count = 32;
  const points = Array.from({ length: count }, (_, i) => {
    const angle = i / count * Math.PI * 2;
    // Broad, independently drifting lobes avoid the repeating equalizer/ring pattern.
    const wave = Math.sin(angle * 2 + phase * .61 + drift) * .55
      + Math.sin(angle * 3 - phase * .43 + drift * .7) * .30
      + Math.cos(angle * 5 + phase * .27 - drift) * .15;
    const r = radius + amplitude * wave;
    return [200 + Math.cos(angle) * r, 200 + Math.sin(angle) * r];
  });
  const f = p => p.map(n => n.toFixed(2)).join(',');
  // Periodic Catmull–Rom interpolation keeps both the contour and its seam smooth.
  let path = `M${f(points[0])}`;
  for (let i = 0; i < count; i++) {
    const p0 = points[(i + count - 1) % count], p1 = points[i];
    const p2 = points[(i + 1) % count], p3 = points[(i + 2) % count];
    const a = p1.map((n, axis) => n + (p2[axis] - p0[axis]) / 6);
    const b = p2.map((n, axis) => n - (p3[axis] - p1[axis]) / 6);
    path += ` C${f(a)} ${f(b)} ${f(p2)}`;
  }
  return `${path} Z`;
}

export function atlasWaveLevel(voice = {}) {
  if (!voice.active || voice.needsPlay && voice.status === 'speaking') return 0;
  const levels = voice.levelsRef?.current;
  const measured = levels ? voice.status === 'speaking' ? levels.output : voice.muted ? 0 : levels.input : voice.levelRef?.current;
  return Math.max(0, Math.min(1, Number(measured) || 0));
}

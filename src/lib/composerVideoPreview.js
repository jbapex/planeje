export function formatVideoClock(seconds) {
  const n = Math.max(0, Number(seconds) || 0);
  const whole = Math.floor(n);
  const minutes = Math.floor(whole / 60);
  const rest = whole % 60;
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}

export function clampVideoOffset(seconds, duration) {
  const n = Number(seconds);
  if (!Number.isFinite(n) || n < 0) return 0;
  const max = Number(duration);
  if (Number.isFinite(max) && max > 0) return Math.min(n, Math.max(0, max - 0.05));
  return n;
}

/** O que o celular mostra quando o Reels não está tocando. */
export function composerStillKind(coverMode, { hasCoverImage = false, isVideo = false } = {}) {
  if (!isVideo) return hasCoverImage ? 'image' : 'empty';
  if (coverMode === 'image' && hasCoverImage) return 'image';
  if (coverMode === 'frame') return 'frame';
  return 'auto';
}

export function composerCoverOffset(coverMode, thumbOffsetSec, duration) {
  if (coverMode === 'frame') return clampVideoOffset(thumbOffsetSec, duration);
  return 0;
}

/** Texto da pastilha na pré-visualização do Reels. */
export function composerCoverChip(coverMode, offsetClock = '') {
  if (coverMode === 'image') return 'Capa';
  if (coverMode === 'frame') {
    const clock = String(offsetClock || '').trim();
    return clock ? `Capa · ${clock}` : 'Capa';
  }
  return 'Capa automática';
}

/**
 * Poster do Drive é o primeiro frame. Na capa Auto/Frame ele tapa o momento escolhido.
 */
export function composerPhonePoster(stillKind, { playing = false, drivePoster } = {}) {
  if (playing) return undefined;
  if (stillKind === 'frame' || stillKind === 'auto') return undefined;
  return drivePoster || undefined;
}

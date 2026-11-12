/** A Meta descarta um vídeo preparado depois de 24 h. A folga evita chegar vencido. */
export const IG_PREPARE_WINDOW_MS = 23 * 60 * 60 * 1000;

export function shouldPrepareInstagramNow(scheduledAt, now = Date.now()) {
  const when = scheduledAt instanceof Date ? scheduledAt.getTime() : Date.parse(String(scheduledAt || ''));
  if (!Number.isFinite(when)) return false;
  const lead = when - now;
  return lead > 60 * 1000 && lead <= IG_PREPARE_WINDOW_MS;
}

/** Percentual do envio (0–99) a partir de offset/file_size no meta_dispatch. */
export function instagramPreparePercent(dispatch) {
  if (!dispatch || typeof dispatch !== 'object') return 0;
  const fileSize = Number(dispatch.file_size || 0);
  const offset = Number(dispatch.offset || 0);
  if (!(fileSize > 0) || !(offset >= 0)) return 0;
  return Math.min(99, Math.round((offset / fileSize) * 100));
}

function scheduledMs(scheduledAt) {
  if (scheduledAt instanceof Date) return scheduledAt.getTime();
  return Date.parse(String(scheduledAt || ''));
}

/**
 * Progresso visual da fila Agendados enquanto o servidor manda o vídeo.
 * showBar: barra preenchida (uploading) ou indeterminada (queued/processing).
 * options.scheduledAt: se a hora já passou e ainda processa, o cartão fala atraso.
 */
export function instagramPrepareProgress(dispatch, options = {}) {
  if (!dispatch || typeof dispatch !== 'object') {
    return { phase: '', percent: 0, label: '', showBar: false, determinate: false, overdue: false };
  }
  const now = Number.isFinite(options.now) ? options.now : Date.now();
  const when = scheduledMs(options.scheduledAt);
  const overdue = Number.isFinite(when) && when <= now;
  const phase = String(dispatch.phase || '');
  const percent = instagramPreparePercent(dispatch);
  if (phase === 'ready') {
    return {
      phase,
      percent: 100,
      label: overdue ? 'Pronto — publicando na hora' : 'Pronto na Meta',
      showBar: true,
      determinate: true,
      overdue,
    };
  }
  if (phase === 'processing') {
    let label = 'A Meta está processando';
    if (overdue) {
      label = 'Horário passou — Meta ainda processa';
    } else {
      const since = Date.parse(String(dispatch.processing_since || ''));
      if (Number.isFinite(since) && now - since > 10 * 60 * 1000) {
        label = 'Meta demorando no processamento';
      }
    }
    return { phase, percent: 100, label, showBar: true, determinate: false, overdue };
  }
  if (phase === 'uploading') {
    return {
      phase,
      percent,
      label: percent > 0 ? `Enviando ${percent}%` : 'Enviando para a Meta',
      showBar: true,
      determinate: percent > 0,
      overdue,
    };
  }
  if (phase === 'queued') {
    return { phase, percent: 0, label: 'Na fila para a Meta', showBar: true, determinate: false, overdue };
  }
  return { phase, percent: 0, label: '', showBar: false, determinate: false, overdue };
}

/** Texto curto da fila Agendados (compatível com o progresso visual). */
export function instagramPrepareStatus(dispatch, options = {}) {
  return instagramPrepareProgress(dispatch, options).label;
}

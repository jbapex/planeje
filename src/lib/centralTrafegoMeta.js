import { isMetaRateLimited, previousHasMetaSignal } from './trafegoHojeCache.js';

/**
 * Meta: “indisponível” ≠ zero. Snapshot ausente, permError ou erro de sync
 * não podem ser apresentados como 0 no ar / R$ 0.
 * Limite da API ≠ conta desligada.
 */

export function metaAvailability(snapshot) {
  if (!snapshot) {
    return { kind: 'unavailable', label: 'Meta indisponível', detail: 'Ainda não há snapshot desta conta.' };
  }
  if (isMetaRateLimited(snapshot) && !previousHasMetaSignal(snapshot)) {
    return {
      kind: 'limited',
      label: 'Meta limitou',
      detail: snapshot.errorMessage || 'A Meta limitou as chamadas. Atualize em um ou dois minutos.',
    };
  }
  if (snapshot.permError) {
    return {
      kind: 'unavailable',
      label: 'Meta indisponível',
      detail: snapshot.errorMessage || 'Sem permissão ou falha ao ler a Meta.',
    };
  }
  if (snapshot.errorMessage && !snapshot.spend && !snapshot.activeCount && !isMetaRateLimited(snapshot)) {
    return { kind: 'unavailable', label: 'Meta indisponível', detail: snapshot.errorMessage };
  }
  const spend = Number(snapshot.spend) || 0;
  const active = Number(snapshot.activeCount) || 0;
  if (spend === 0 && active === 0) {
    return { kind: 'zero', label: 'Nada no ar', detail: 'Leitura ok: zero gasto e nenhuma campanha ativa no período.' };
  }
  return { kind: 'ok', label: 'Meta ok', detail: null };
}

export function formatMetaMetric(snapshot, formatter) {
  const av = metaAvailability(snapshot);
  if (av.kind === 'unavailable' || av.kind === 'limited') return av.label;
  if (typeof formatter === 'function') return formatter(snapshot);
  return av.kind === 'zero' ? '0' : String(snapshot?.spend ?? '');
}

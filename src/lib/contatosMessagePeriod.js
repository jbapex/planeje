/** yyyy-mm-dd → dd/mm/aaaa (só exibição / filtro de contatos). */
export function isoYmdToBrDisplay(iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

/** yyyy-mm-dd → Date local (calendário). */
export function isoYmdToLocalDate(iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return undefined;
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Date local → yyyy-mm-dd. */
export function localDateToIsoYmd(d) {
  if (!d || !(d instanceof Date) || Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function startOfLocalDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDaysLocal(d, n) {
  const next = startOfLocalDay(d);
  next.setDate(next.getDate() + n);
  return next;
}

export const MESSAGE_PERIOD_PRESETS = [
  { id: 'hoje', label: 'Hoje' },
  { id: 'ontem', label: 'Ontem' },
  { id: '7d', label: '7 dias' },
  { id: '15d', label: '15 dias' },
  { id: '30d', label: '30 dias' },
  { id: 'mes', label: 'Este mês' },
  { id: 'mes-passado', label: 'Mês passado' },
];

export function messagePeriodRange(id, now = new Date()) {
  const today = startOfLocalDay(now);
  switch (id) {
    case 'hoje':
      return { from: today, to: today };
    case 'ontem': {
      const yesterday = addDaysLocal(today, -1);
      return { from: yesterday, to: yesterday };
    }
    case '7d':
      return { from: addDaysLocal(today, -6), to: today };
    case '15d':
      return { from: addDaysLocal(today, -14), to: today };
    case '30d':
      return { from: addDaysLocal(today, -29), to: today };
    case 'mes':
      return {
        from: new Date(today.getFullYear(), today.getMonth(), 1),
        to: new Date(today.getFullYear(), today.getMonth() + 1, 0),
      };
    case 'mes-passado':
      return {
        from: new Date(today.getFullYear(), today.getMonth() - 1, 1),
        to: new Date(today.getFullYear(), today.getMonth(), 0),
      };
    default:
      return null;
  }
}

export function messagePeriodIso(id, now = new Date()) {
  const range = messagePeriodRange(id, now);
  if (!range) return { from: '', to: '' };
  return { from: localDateToIsoYmd(range.from), to: localDateToIsoYmd(range.to) };
}

export function matchMessagePeriodPreset(fromIso, toIso, now = new Date()) {
  if (!fromIso || !toIso) return null;
  return MESSAGE_PERIOD_PRESETS.find((preset) => {
    const iso = messagePeriodIso(preset.id, now);
    return iso.from === fromIso && iso.to === toIso;
  }) || null;
}

export function messagePeriodTriggerLabel(fromIso, toIso, now = new Date()) {
  if (!fromIso && !toIso) return 'Período';
  const matched = matchMessagePeriodPreset(fromIso, toIso, now);
  if (matched) return matched.label;
  return `${isoYmdToBrDisplay(fromIso) || '…'} – ${isoYmdToBrDisplay(toIso) || '…'}`;
}

import { paidTrafficPaths } from './paidTrafficRoutes.js';

export const PAINEL_PERIOD_PRESETS = [
  { id: 'hoje', label: 'Hoje' },
  { id: '7d', label: 'Últimos 7 dias' },
  { id: 'mes', label: 'Este mês' },
  { id: '30d', label: 'Últimos 30 dias' },
  { id: 'mes_passado', label: 'Mês passado' },
  { id: 'custom', label: 'Personalizado' },
];

function pad2(n) {
  return String(n).padStart(2, '0');
}

export function isoDate(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function resolvePainelPeriod(key, customFrom, customTo, today = new Date()) {
  const t = new Date(today);
  if (key === 'hoje') return { since: isoDate(t), until: isoDate(t) };
  if (key === '7d') {
    const from = new Date(t);
    from.setDate(from.getDate() - 6);
    return { since: isoDate(from), until: isoDate(t) };
  }
  if (key === '30d') {
    const from = new Date(t);
    from.setDate(from.getDate() - 29);
    return { since: isoDate(from), until: isoDate(t) };
  }
  if (key === 'mes_passado') {
    const start = new Date(t.getFullYear(), t.getMonth() - 1, 1);
    const end = new Date(t.getFullYear(), t.getMonth(), 0);
    return { since: isoDate(start), until: isoDate(end) };
  }
  if (key === 'custom' && customFrom && customTo) {
    return customFrom <= customTo
      ? { since: customFrom, until: customTo }
      : { since: customTo, until: customFrom };
  }
  const monthStart = new Date(t.getFullYear(), t.getMonth(), 1);
  return { since: isoDate(monthStart), until: isoDate(t) };
}

export function formatPainelPeriodLabel(period) {
  if (!period?.since || !period?.until) return '';
  const from = new Date(`${period.since}T12:00:00`);
  const to = new Date(`${period.until}T12:00:00`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return '';
  const dayMonth = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short' });
  const withYear = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' });
  return `${dayMonth.format(from)} – ${withYear.format(to)}`;
}

/** Texto curto nos cards: o número é de hoje, 7 dias ou do mês. */
export function periodWindowLabel(periodKey, period) {
  if (periodKey === 'hoje') return 'hoje';
  if (periodKey === '7d') return 'últimos 7 dias';
  if (periodKey === '30d') return 'últimos 30 dias';
  if (periodKey === 'mes') return 'este mês';
  if (periodKey === 'mes_passado') return 'mês passado';
  if (period?.since && period?.until && period.since === period.until) return 'hoje';
  const range = formatPainelPeriodLabel(period);
  return range || 'neste período';
}

/**
 * Teto/limite abre o mês da ficha. Qualidade e o resto abrem o recorte do alerta.
 */
export function painelPeriodForAction(actionCode, period) {
  if (actionCode === 'limite') return { periodo: 'mes' };
  if (period?.since && period?.until) {
    return { periodo: 'custom', from: period.since, to: period.until };
  }
  return { periodo: 'mes' };
}

export function painelHref(clientId, { period, actionCode } = {}) {
  const params = new URLSearchParams();
  if (clientId) params.set('client_id', clientId);
  if (actionCode) params.set('acao', actionCode);
  const spec = painelPeriodForAction(actionCode, period);
  if (spec.periodo) params.set('periodo', spec.periodo);
  if (spec.periodo === 'custom') {
    if (spec.from) params.set('from', spec.from);
    if (spec.to) params.set('to', spec.to);
  }
  const q = params.toString();
  return q ? `${paidTrafficPaths.fila()}?${q}` : paidTrafficPaths.fila();
}

export function clientVisibleInPainel({ activeCount = 0, anyCount = 0, hasOps = false } = {}) {
  return Boolean(activeCount || anyCount || hasOps);
}

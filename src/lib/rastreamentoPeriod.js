/** Período compartilhado do hub Rastreamento (Visão geral, Leads, Eventos). Fuso Brasília. */

export const RASTREAMENTO_TZ = 'America/Sao_Paulo';
export const RASTREAMENTO_PERIOD_SINCE_PARAM = 'de';
export const RASTREAMENTO_PERIOD_UNTIL_PARAM = 'ate';

const YMD = /^\d{4}-\d{2}-\d{2}$/;

export function isYmd(value) {
  return YMD.test(String(value || ''));
}

export function dateOnlyInSaoPaulo(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: RASTREAMENTO_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function ymdInSaoPaulo(value) {
  if (!value) return '';
  if (YMD.test(String(value))) return String(value).slice(0, 10);
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return dateOnlyInSaoPaulo(date);
}

export function periodBoundsSaoPaulo(since, until) {
  const start = String(since || '').slice(0, 10);
  const end = String(until || '').slice(0, 10);
  if (!YMD.test(start) || !YMD.test(end)) return { sinceIso: '', untilIso: '' };
  return {
    sinceIso: `${start}T00:00:00.000-03:00`,
    untilIso: `${end}T23:59:59.999-03:00`,
  };
}

export function timestampInSaoPauloRange(ms, sinceYmd, untilYmd) {
  if (!sinceYmd && !untilYmd) return true;
  if (ms == null || Number.isNaN(Number(ms))) return false;
  const start = sinceYmd || untilYmd;
  const end = untilYmd || sinceYmd;
  const bounds = periodBoundsSaoPaulo(start, end);
  if (sinceYmd && Number(ms) < Date.parse(bounds.sinceIso)) return false;
  if (untilYmd && Number(ms) > Date.parse(bounds.untilIso)) return false;
  return true;
}

/** Últimos 7 dias no calendário de Brasília, inclusive hoje. */
export function defaultRastreamentoPeriod(now = new Date()) {
  const until = dateOnlyInSaoPaulo(now);
  const sinceDate = new Date(`${until}T12:00:00.000Z`);
  sinceDate.setUTCDate(sinceDate.getUTCDate() - 6);
  return { since: sinceDate.toISOString().slice(0, 10), until };
}

export function readRastreamentoPeriod(searchParams, now = new Date()) {
  const since = searchParams?.get?.(RASTREAMENTO_PERIOD_SINCE_PARAM);
  const until = searchParams?.get?.(RASTREAMENTO_PERIOD_UNTIL_PARAM);
  if (isYmd(since) && isYmd(until)) return { since, until };
  return defaultRastreamentoPeriod(now);
}

export function writeRastreamentoPeriod(searchParams, { since, until } = {}) {
  const next = new URLSearchParams(searchParams);
  if (isYmd(since) && isYmd(until)) {
    next.set(RASTREAMENTO_PERIOD_SINCE_PARAM, since);
    next.set(RASTREAMENTO_PERIOD_UNTIL_PARAM, until);
  }
  return next;
}

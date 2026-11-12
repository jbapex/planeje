/** Rotina fixa da Central de Tráfego — relatório 1/16, CRM segunda e rotina semanal. */

import { WEEKDAYS, displayDate, displayWeek, reviewState } from './trafficWeeklyReview.js';
import { normalizePriority } from './centralTrafego.js';

export const ROUTINE_GENERATION_PREFIX = {
  report: 'report_15d:',
  crm: 'crm_weekly:',
  groupWeek: 'group_week:',
  weeklyReview: 'weekly_review:',
  weeklyOptimization: 'weekly_optimization:',
};

export function ymdInSaoPaulo(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function isoWeekday(ymd) {
  const [year, month, day] = String(ymd).split('-').map(Number);
  const js = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return js === 0 ? 7 : js;
}

function addDaysYmd(ymd, days) {
  const [year, month, day] = String(ymd).split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Sábado e domingo passam para a segunda. Feriado continua dia de demanda. */
export function rollToBusinessDay(ymd) {
  const weekday = isoWeekday(ymd);
  if (weekday === 6) return addDaysYmd(ymd, 2);
  if (weekday === 7) return addDaysYmd(ymd, 1);
  return ymd;
}

export function reportDueDaysInMonth(ymd) {
  const [year, month] = String(ymd).split('-');
  return [rollToBusinessDay(`${year}-${month}-01`), rollToBusinessDay(`${year}-${month}-15`)];
}

export function isReportDueDay(ymd = ymdInSaoPaulo()) {
  return reportDueDaysInMonth(ymd).includes(ymd);
}

export function nextReportDue(ymd = ymdInSaoPaulo()) {
  const inMonth = reportDueDaysInMonth(ymd).find((due) => due >= ymd);
  if (inMonth) return inMonth;
  const [year, month] = String(ymd).split('-').map(Number);
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = String(month === 12 ? 1 : month + 1).padStart(2, '0');
  return reportDueDaysInMonth(`${nextYear}-${nextMonth}-01`)[0];
}

export function nextMonday(ymd = ymdInSaoPaulo()) {
  const weekday = isoWeekday(ymd);
  return addDaysYmd(ymd, weekday === 1 ? 0 : 8 - weekday);
}

export function isCrmMonday(ymd = ymdInSaoPaulo()) {
  const d = parseYmd(ymd);
  if (!d) return false;
  const wd = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', weekday: 'short' }).format(d);
  return wd === 'Mon';
}

function parseYmd(ymd) {
  if (!ymd) return null;
  const d = new Date(`${ymd}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function reportCycleKey(ymd = ymdInSaoPaulo()) {
  return `${ROUTINE_GENERATION_PREFIX.report}${ymd}`;
}

export function crmCycleKey(ymd = ymdInSaoPaulo()) {
  const d = parseYmd(ymd);
  if (!d) return `${ROUTINE_GENERATION_PREFIX.crm}${ymd}`;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    week: 'numeric',
  }).formatToParts(d);
  const year = parts.find((p) => p.type === 'year')?.value;
  const week = parts.find((p) => p.type === 'week')?.value;
  return `${ROUTINE_GENERATION_PREFIX.crm}${year}-W${week}`;
}

export function demandGenerationKey(row) {
  return String(row?.generation_key || row?.details?.generation_key || '');
}

export function isRoutineGenerationKey(key) {
  const k = String(key || '');
  return k.startsWith(ROUTINE_GENERATION_PREFIX.report)
    || k.startsWith(ROUTINE_GENERATION_PREFIX.crm)
    || k.startsWith(ROUTINE_GENERATION_PREFIX.groupWeek);
}

export function isWeeklyRoutineKey(key) {
  const k = String(key || '');
  return k.startsWith(ROUTINE_GENERATION_PREFIX.weeklyReview) || k.startsWith(ROUTINE_GENERATION_PREFIX.weeklyOptimization);
}

export function isWeeklyRoutineDemand(row) {
  return isWeeklyRoutineKey(demandGenerationKey(row));
}

export function withoutWeeklyRoutineDemands(rows = []) {
  return (rows || []).filter((row) => !isWeeklyRoutineDemand(row));
}

export function isOpenWeeklyRoutine(review) {
  return Boolean(review?.id && !review.finalized_at && !review.task_completed);
}

export function weeklyRoutineKind(review) {
  return review?.kind === 'optimization' ? 'optimization' : 'analysis';
}

export function buildWeeklyRoutineUrl(reviewId, extra = {}) {
  if (!reviewId && !extra.clientId) return '/paid-traffic/rotina';
  const params = new URLSearchParams();
  if (extra.clientId) params.set('cliente', extra.clientId);
  if (extra.weekStart) params.set('semana', extra.weekStart);
  if (extra.kind === 'optimization') params.set('tipo', 'optimization');
  if (reviewId) params.set('review', reviewId);
  const query = params.toString();
  return query ? `/paid-traffic/rotina?${query}` : '/paid-traffic/rotina';
}

export function weekdayLabel(n) {
  return WEEKDAYS[Number(n) - 1] || 'Dia útil';
}

/** Rotina ligada cujo prazo ainda não virou tarefa no Hoje. Não cria Tarefas. */
export function buildUpcomingWeeklyCards(clients = [], { openReviews = [], today = '', kind = 'analysis' } = {}) {
  const openIds = new Set(
    (openReviews || [])
      .filter((review) => (kind === 'optimization' ? review.kind === 'optimization' : review.kind !== 'optimization'))
      .filter(isOpenWeeklyRoutine)
      .map((review) => String(review.client_id))
  );
  return (clients || [])
    .map((client) => {
      const settings = client.settings || {};
      const enabled = kind === 'optimization' ? settings.optimization_enabled : settings.enabled;
      const due = kind === 'optimization' ? client.next_optimization_due_on : client.next_due_on;
      const weekday = kind === 'optimization' ? settings.optimization_weekday : settings.review_weekday;
      if (!enabled || !due || due < today) return null;
      if (openIds.has(String(client.id))) return null;
      return {
        id: `upcoming:${kind}:${client.id}`,
        kind: 'upcoming',
        routineKind: kind === 'optimization' ? 'optimization' : 'analysis',
        clientId: client.id,
        title: client.empresa || 'Cliente',
        reason: due === today ? `Hoje · ${weekdayLabel(weekday)}` : `${weekdayLabel(weekday)} · ${displayDate(due)}`,
        dueOn: due,
        href: '/paid-traffic/rotina',
      };
    })
    .filter(Boolean)
    .sort(
      (a, b) =>
        String(a.dueOn).localeCompare(String(b.dueOn)) || a.title.localeCompare(b.title, 'pt-BR')
    );
}

export function buildWeeklyRoutineCards(reviews = [], today) {
  return (reviews || [])
    .filter(isOpenWeeklyRoutine)
    .map((review) => {
      const kind = weeklyRoutineKind(review);
      const state = reviewState(review, today);
      return {
        id: `weekly:${review.id}`,
        kind: 'weekly',
        routineKind: kind,
        clientId: review.client_id,
        title: review.empresa || 'Cliente',
        reason: `${displayWeek(review.week_start)} · ${state.label}`,
        review,
        overdue: Boolean(state.overdue),
        href: buildWeeklyRoutineUrl(review.id),
      };
    })
    .sort(
      (a, b) =>
        Number(b.overdue) - Number(a.overdue) ||
        String(a.review.task_due_date || '').localeCompare(String(b.review.task_due_date || '')) ||
        a.title.localeCompare(b.title, 'pt-BR')
    );
}

export function routineKindFromRow(row) {
  const key = demandGenerationKey(row);
  if (key.startsWith(ROUTINE_GENERATION_PREFIX.report)) return 'report';
  if (key.startsWith(ROUTINE_GENERATION_PREFIX.crm)) return 'crm';
  if (key.startsWith(ROUTINE_GENERATION_PREFIX.groupWeek)) return 'group';
  return null;
}

export function isRoutineDemandRow(row) {
  return Boolean(routineKindFromRow(row));
}

/** Semana anterior (seg–dom) quando hoje é segunda — espelho do RPC. */
export function lastWeekRange(ymd = ymdInSaoPaulo()) {
  const d = parseYmd(ymd);
  if (!d) return { from: ymd, to: ymd };
  d.setDate(d.getDate() - 7);
  const from = formatYmd(d);
  d.setDate(d.getDate() + 6);
  const to = formatYmd(d);
  return { from, to };
}

function formatYmd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function buildCrmRoutineUrl(clientId, ymd = ymdInSaoPaulo()) {
  if (!clientId) return '/crm/contatos';
  const { from, to } = lastWeekRange(ymd);
  const params = new URLSearchParams({
    cliente_id: clientId,
    comprou: 'pendente',
    from,
    to,
  });
  return `/crm/contatos?${params.toString()}`;
}

export function buildRotinaQueue(rows = []) {
  return (rows || [])
    .filter(isRoutineDemandRow)
    .map((row) => {
      const kind = routineKindFromRow(row);
      const overdue = row.due_date && row.due_date < ymdInSaoPaulo();
      return {
        id: `rotina:${row.id}`,
        kind: 'rotina',
        routineKind: kind,
        clientId: row.client_id,
        title: row.client_empresa || row.title,
        reason: row.title,
        demand: row,
        overdue: Boolean(overdue),
      };
    });
}

const WAIT_TAGS = {
  aguardando_cliente: 'Espera cliente',
  revisoes_48h: 'Revisão 48h',
  publicacoes_pendentes: 'Publicação',
  demais: 'Demanda',
};

function waitingItem(row, waitKind) {
  const tag = WAIT_TAGS[waitKind] || 'Demanda';
  const title = row.title || tag;
  return {
    id: `wait:${row.id}`,
    kind: 'demand',
    waitKind,
    clientId: row.client_id,
    title: row.client_empresa || title,
    reason: waitKind === 'aguardando_cliente' ? title : `${tag} · ${title}`,
    demand: row,
  };
}

const CLIENT_WAIT_TYPES = new Set(['cobranca_material', 'aprovacao_cliente']);

export function isClientWaitRow(row) {
  if (!row) return false;
  if (row.waitKind === 'aguardando_cliente') return true;
  const type = row.demand_type || row.details?.demand_type;
  return CLIENT_WAIT_TYPES.has(type);
}

function demandAlreadyOnBoard(item) {
  return item?.review?.task_id || item?.demand?.id || null;
}

function withStarted(item) {
  const status = item?.review?.task_status || item?.demand?.status || item?.status;
  if (!status || status === 'todo') return item;
  return { ...item, started: true };
}

/** Quadro: Aguardando é só o que está parado no cliente. */
export function waitingRowsFromBuckets(buckets = {}) {
  const groups = [
    ['aguardando_cliente', buckets.aguardando_cliente],
    ['revisoes_48h', buckets.revisoes_48h],
    ['publicacoes_pendentes', buckets.publicacoes_pendentes],
    ['demais', buckets.demais],
  ];
  const rows = [];
  for (const [waitKind, list] of groups) {
    for (const row of list || []) {
      if (!row) continue;
      rows.push({ ...row, waitKind });
    }
  }
  return rows;
}

export function partitionHojeBoard({
  agoraQueue = [],
  rotinaQueue = [],
  weeklyCards = [],
  waitingRows = [],
  today = ymdInSaoPaulo(),
} = {}) {
  const taken = new Set();
  const clientWaitIds = new Set((waitingRows || []).filter(isClientWaitRow).map((row) => row.id));
  const urgente = [];
  const atrasado = [];
  const venceHoje = [];
  const aFazer = [];
  const aguardando = [];

  const waitingCards = withoutWeeklyRoutineDemands(waitingRows)
    .filter(Boolean)
    .map((row) => waitingItem(row, row.waitKind || 'demais'));
  for (const original of [...(weeklyCards || []), ...(rotinaQueue || []), ...(agoraQueue || []), ...waitingCards]) {
    if (!original) continue;
    const taskId = demandAlreadyOnBoard(original);
    const key = taskId ? `task:${taskId}` : original.id;
    if (!key || taken.has(key)) continue;
    taken.add(key);
    const due = original.review?.task_due_date || original.demand?.due_date;
    const overdue = due && today ? due < today : Boolean(original.overdue);
    const item = withStarted({ ...original, overdue });
    if (item.demand && (isClientWaitRow(item.demand) || clientWaitIds.has(taskId))) {
      aguardando.push(item);
    } else if (item.action?.tone === 'issue' || normalizePriority(item.demand?.priority) === 'high') {
      urgente.push(item);
    } else if (overdue) {
      atrasado.push(item);
    } else if (due === today) {
      venceHoje.push(item);
    } else {
      aFazer.push(item);
    }
  }

  return {
    urgente,
    atrasado,
    venceHoje,
    aFazer,
    aguardando,
    feito: [],
  };
}

export const HOJE_VIEW_KEY = 'planeje-hoje-view';

export function readHojeViewMode() {
  try {
    const v = sessionStorage.getItem(HOJE_VIEW_KEY);
    return v === 'list' ? 'list' : 'board';
  } catch {
    return 'board';
  }
}

export function writeHojeViewMode(mode) {
  try {
    sessionStorage.setItem(HOJE_VIEW_KEY, mode === 'board' ? 'board' : 'list');
  } catch {
    /* ignore */
  }
}

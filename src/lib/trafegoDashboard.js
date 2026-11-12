import { startOfDay } from 'date-fns';
import { daysUntilVencimento } from '@/lib/carteiraClientes';
import { clientHealth } from '@/lib/trafegoFila';
import { metricsFromSnapshot, readClienteMetaResumo } from '@/lib/clienteMetaSnapshot';
import { nextActionForAccount } from '@/lib/trafegoProximaAcao';
import { gestorAccountChip } from '@/lib/trafegoFazerAgora';
import { metaAvailability } from '@/lib/centralTrafegoMeta';

const DONE_STATUS = new Set([
  'published',
  'done',
  'concluida',
  'concluido',
  'concluído',
  'completed',
  'cancelled',
  'canceled',
  'cancelado',
  'archived',
  'arquivado',
]);

export function isOpenTrafficTask(task) {
  return !DONE_STATUS.has(String(task?.status || '').trim().toLowerCase());
}

export function clientHasTrafficSignal(clientId, { accountIds, campaignIds, opsIds, taskClientIds, googleIds }) {
  const id = String(clientId || '');
  return accountIds.has(id) || campaignIds.has(id) || opsIds.has(id) || taskClientIds.has(id) || Boolean(googleIds?.has(id));
}

export function taskDueDays(due, today = startOfDay(new Date())) {
  return daysUntilVencimento(due, today);
}

export function decorateTrafficAccount(client, { tasks = [], ops = null, usersById = {}, today = startOfDay(new Date()), google = null } = {}) {
  const snapshot = readClienteMetaResumo(client);
  const metrics = metricsFromSnapshot(snapshot);
  const health = clientHealth(client, metrics === undefined ? undefined : metrics);
  const meta = metaAvailability(snapshot);
  const nextAction = nextActionForAccount({
    snapshot,
    brief:
      meta.kind === 'unavailable'
        ? { alert: meta.detail }
        : snapshot?.deliveryAlert
          ? { alert: snapshot.deliveryAlert, issueLabels: snapshot.issueLabels || [] }
          : null,
  });
  const openTasks = (tasks || []).filter((t) => t.client_id === client.id && isOpenTrafficTask(t));
  const sortedTasks = [...openTasks].sort((a, b) => {
    const da = taskDueDays(a.due_date, today);
    const db = taskDueDays(b.due_date, today);
    if (da == null && db == null) return 0;
    if (da == null) return 1;
    if (db == null) return -1;
    return da - db;
  });
  const nextTask = sortedTasks[0] || null;
  const nextDays = nextTask ? taskDueDays(nextTask.due_date, today) : null;
  const overdueTasks = openTasks.filter((t) => {
    const d = taskDueDays(t.due_date, today);
    return d != null && d < 0;
  });
  const dueSoonTasks = openTasks.filter((t) => {
    const d = taskDueDays(t.due_date, today);
    return d != null && d >= 0 && d <= 7;
  });
  const spend = Number(metrics?.spend || snapshot?.spend || 0);
  const limite = Number(client?.limite_meta || 0);
  const limitUsage = limite > 0 ? spend / limite : 0;
  const budgetEnding = limite > 0 && limitUsage >= 0.8;
  const activeCount = Number(snapshot?.activeCount || 0);
  const noAr = activeCount > 0;
  const gestorId = ops?.primary_assignee_id || client.responsavel || null;
  const gestorName = gestorId ? usersById[gestorId] || '' : '';

  const overTeto = Boolean(health.overTeto);
  const resultOff = health.resultStatus === 'critico';

  const lookBase = gestorAccountChip({
    nextAction,
    overdueDays: nextDays,
    overTeto,
    resultOff,
    dueSoonDays: dueSoonTasks.length ? nextDays : null,
    noAr,
    activeCount,
    budgetEnding,
    budgetPct: limitUsage * 100,
    healthLabel: health.status === 'atencao' ? health.label : '',
  });
  const look =
    meta.kind === 'unavailable'
      ? { tone: 'overdue', chip: 'Vincular a Meta' }
      : meta.kind === 'limited' && lookBase.tone === 'empty'
        ? { tone: 'due', chip: 'Meta limitou' }
        : lookBase;
  const tone = look.tone;
  const chip = look.chip;

  return {
    client,
    snapshot,
    metrics,
    health,
    metaKind: meta.kind,
    openTasks,
    overdueTasks,
    dueSoonTasks,
    nextTask,
    nextDays,
    spend,
    limite,
    limitUsage,
    budgetEnding,
    overTeto,
    resultOff,
    activeCount,
    noAr,
    gestorName,
    nextAction,
    tone,
    chip,
    situation: ops?.situation || null,
    hasGoogle: Boolean(google?.linked),
    google: google || null,
  };
}

export function spendBarLook(spend, limite) {
  const used = Number(spend) || 0;
  const limit = Number(limite) || 0;
  if (limit <= 0) return null;
  const ratio = used / limit;
  return {
    used,
    limit,
    ratio,
    pct: Math.round(ratio * 100),
    fill: Math.min(Math.max(ratio, 0), 1),
    tone: ratio > 1 ? 'over' : ratio >= 0.8 ? 'warn' : 'ok',
  };
}

export function computeTrafegoDashboardKpis(rows) {
  const list = rows || [];
  const foraRows = list.filter((r) => r.resultOff);
  const tetoRows = list.filter((r) => r.overTeto);
  return {
    contas: list.length,
    noAr: list.filter((r) => r.noAr).length,
    teto: tetoRows.length,
    fora: foraRows.length,
    vencendo: list.filter((r) => r.dueSoonTasks.length > 0).length,
    atrasadas: list.filter((r) => r.overdueTasks.length > 0).length,
    spend: list.reduce((sum, r) => sum + (Number(r.spend) || 0), 0),
    tetoSpend: tetoRows.reduce((sum, r) => sum + (Number(r.spend) || 0), 0),
    foraSpend: foraRows.reduce((sum, r) => sum + (Number(r.spend) || 0), 0),
  };
}

export function rowMatchesTrafegoFocus(row, focus) {
  if (!focus || focus === 'all') return true;
  if (focus === 'noAr') return row.noAr;
  if (focus === 'teto') return row.overTeto;
  if (focus === 'fora') return row.resultOff;
  if (focus === 'vencendo') return row.dueSoonTasks.length > 0;
  if (focus === 'atrasadas') return row.overdueTasks.length > 0;
  return true;
}

export function sortTrafegoDashboardRows(rows) {
  const rank = (row) => {
    if (row.nextAction?.tone === 'issue') return 0;
    if (row.overdueTasks.length) return 1;
    if (row.resultOff) return 2;
    if (row.overTeto) return 3;
    if (row.dueSoonTasks.length || row.budgetEnding || row.nextAction?.tone === 'warn') return 4;
    if (row.health?.status === 'atencao') return 5;
    if (!row.noAr) return 6;
    return 7;
  };
  return [...(rows || [])].sort(
    (a, b) => rank(a) - rank(b) || String(a.client.empresa || '').localeCompare(String(b.client.empresa || ''), 'pt-BR')
  );
}

/** Urgência visual e ordem de trabalho: produção, etapa atual e postagem. */

export const DUE_SOON_DAYS = 3;

export const TASK_PRIORITIES = [
  { value: 'low', label: 'Baixa', rank: 1 },
  { value: 'medium', label: 'Média', rank: 2 },
  { value: 'high', label: 'Alta', rank: 3 },
  { value: 'urgent', label: 'Urgente', rank: 4 },
];

const TERMINAL_STATUS_FALLBACK = new Set([
  'published',
  'done',
  'completed',
  'concluido',
  'concluído',
  'concluida',
  'concluída',
]);

export function normalizeTaskPriority(value) {
  const v = String(value || '')
    .trim()
    .toLowerCase();
  if (v === 'urgente' || v === 'urgent') return 'urgent';
  if (v === 'alta' || v === 'high') return 'high';
  if (v === 'baixa' || v === 'low') return 'low';
  return 'medium';
}

export function taskPriorityMeta(value) {
  const normalized = normalizeTaskPriority(value);
  return TASK_PRIORITIES.find((p) => p.value === normalized) || TASK_PRIORITIES[1];
}

export function parseTaskDate(value) {
  if (value == null || value === '') return null;
  const s = String(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [year, month, day] = s.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function startOfLocalDay(now = new Date()) {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export function daysUntilDue(dueDate, now = new Date()) {
  const due = parseTaskDate(dueDate);
  if (!due) return null;
  const today = startOfLocalDay(now);
  return Math.round((due.getTime() - today.getTime()) / 86400000);
}

export function isTerminalTaskStatus(status, statusOptions = []) {
  const opt = (statusOptions || []).find((s) => s.value === status);
  if (opt?.is_terminal === true) return true;
  return TERMINAL_STATUS_FALLBACK.has(String(status || '').toLowerCase());
}

/** overdue = hoje ou atrasada; soon = chega em 1–3 dias; none = restante ou concluída. */
export function getDueTone(dueDate, { isTerminal = false, now = new Date() } = {}) {
  if (isTerminal) return 'none';
  const days = daysUntilDue(dueDate, now);
  if (days == null) return 'none';
  if (days <= 0) return 'overdue';
  if (days <= DUE_SOON_DAYS) return 'soon';
  return 'none';
}

export function formatDueDatePt(dueDate) {
  const due = parseTaskDate(dueDate);
  if (!due) return '';
  const dd = String(due.getDate()).padStart(2, '0');
  const mm = String(due.getMonth() + 1).padStart(2, '0');
  const yyyy = due.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

/**
 * O trabalho segue o prazo mais próximo: produção ou postagem. Depois da
 * entrega do material, o prazo de produção dá lugar ao SLA da etapa atual.
 */
export function getEffectiveTaskDeadline(task) {
  const candidates = [
    task?.production_delivered_at
      ? { kind: 'stage', value: task?.stage_due_at || null }
      : { kind: 'production', value: task?.due_date || null },
    { kind: 'publication', value: task?.post_date || null },
  ].filter((item) => parseTaskDate(item.value));

  if (!candidates.length) return { kind: task?.production_delivered_at ? 'stage' : 'production', value: null };
  candidates.sort((a, b) => {
    const difference = deadlineTime(a) - deadlineTime(b);
    if (difference !== 0) return difference;
    return a.kind === (task?.production_delivered_at ? 'publication' : 'production') ? -1 : 1;
  });
  return candidates[0];
}

function deadlineTime(deadline) {
  if (deadline.kind === 'stage' && String(deadline.value).includes('T')) {
    const time = new Date(deadline.value).getTime();
    if (Number.isFinite(time)) return time;
  }
  return parseTaskDate(deadline.value)?.getTime() ?? null;
}

function localDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function formatDueWorkLabel(dueDate, { isTerminal = false, now = new Date() } = {}) {
  const formatted = formatDueDatePt(dueDate);
  if (!formatted) return '';
  if (isTerminal) return formatted;
  const days = daysUntilDue(dueDate, now);
  if (days == null) return formatted;
  if (days < 0) {
    const late = Math.abs(days);
    return late === 1 ? `Atrasada 1 dia · ${formatted}` : `Atrasada ${late} dias · ${formatted}`;
  }
  if (days === 0) return `Hoje · ${formatted}`;
  if (days === 1) return `Amanhã · ${formatted}`;
  if (days <= DUE_SOON_DAYS) return `Em ${days} dias · ${formatted}`;
  return formatted;
}

export function getTaskDueState(task, { statusOptions = [], now = new Date() } = {}) {
  const isTerminal = isTerminalTaskStatus(task?.status, statusOptions);
  const isProductionDelivered = Boolean(task?.production_delivered_at);
  const effectiveDeadline = getEffectiveTaskDeadline(task);
  const deadlineKind = effectiveDeadline.kind;
  const effectiveDueDate = effectiveDeadline.value;
  let tone = getDueTone(effectiveDueDate, { isTerminal, now });
  let days = daysUntilDue(effectiveDueDate, now);
  let label = formatDueWorkLabel(effectiveDueDate, { isTerminal, now });
  const deadlineAt = effectiveDueDate ? deadlineTime(effectiveDeadline) : null;
  let isOverdue = !isTerminal && days != null && days < 0;
  if (deadlineKind === 'stage' && deadlineAt != null && String(effectiveDueDate).includes('T')) {
    const stageDate = new Date(deadlineAt);
    const stageDay = localDateKey(stageDate);
    days = daysUntilDue(stageDay, now);
    isOverdue = !isTerminal && deadlineAt < now.getTime();
    tone = isTerminal ? 'none' : isOverdue ? 'overdue' : days <= DUE_SOON_DAYS ? 'soon' : 'none';
    label = formatDueWorkLabel(stageDay, { isTerminal, now });
    if (!isTerminal && days >= 0) {
      const time = stageDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      label = isOverdue ? `Prazo vencido · ${formatDueDatePt(stageDay)}, ${time}` : `${label} · ${time}`;
    }
  }
  if (isProductionDelivered && !effectiveDueDate) {
    label = `Material entregue${task.production_delivered_at ? ` · ${formatDueDatePt(task.production_delivered_at)}` : ''}`;
  } else if (deadlineKind === 'publication' && label) {
    label = `Postagem · ${label}`;
  } else if (deadlineKind === 'stage' && label) {
    label = `Etapa · ${label}`;
  }
  return {
    isTerminal,
    isProductionDelivered,
    deadlineKind,
    effectiveDueDate,
    tone,
    days,
    deadlineAt,
    isOverdue,
    label,
    color: tone === 'overdue' ? '#ef4444' : tone === 'soon' ? '#f59e0b' : null,
  };
}

/**
 * Abertas primeiro; entre abertas, data mais urgente (atrasada → hoje → próximas);
 * no mesmo dia, urgência maior primeiro. Sem data fica no fim das abertas.
 */
export function compareTasksByWorkOrder(a, b, { statusOptions = [], now = new Date() } = {}) {
  const aTerm = isTerminalTaskStatus(a?.status, statusOptions) ? 1 : 0;
  const bTerm = isTerminalTaskStatus(b?.status, statusOptions) ? 1 : 0;
  if (aTerm !== bTerm) return aTerm - bTerm;

  const aDue = getTaskDueState(a, { statusOptions, now });
  const bDue = getTaskDueState(b, { statusOptions, now });
  if (aDue.isOverdue !== bDue.isOverdue) return aDue.isOverdue ? -1 : 1;
  const aDays = aDue.days;
  const bDays = bDue.days;
  if (aDays == null && bDays != null) return 1;
  if (bDays == null && aDays != null) return -1;
  if (aDays != null && bDays != null && aDays !== bDays) return aDays - bDays;
  if (aDue.deadlineKind === 'stage' && bDue.deadlineKind === 'stage'
    && aDue.deadlineAt != null && bDue.deadlineAt != null && aDue.deadlineAt !== bDue.deadlineAt) {
    return aDue.deadlineAt - bDue.deadlineAt;
  }

  const aRank = taskPriorityMeta(a?.priority).rank;
  const bRank = taskPriorityMeta(b?.priority).rank;
  if (aRank !== bRank) return bRank - aRank;

  return String(a?.title || '').localeCompare(String(b?.title || ''), 'pt-BR');
}

export function sortTasksByWorkOrder(tasks, options) {
  return [...(tasks || [])].sort((a, b) => compareTasksByWorkOrder(a, b, options));
}

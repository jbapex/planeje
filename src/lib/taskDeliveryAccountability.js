import { daysUntilDue, parseTaskDate, startOfLocalDay } from './taskUrgency.js';

export const DELAY_REASON_OPTIONS = [
  { value: 'client_waiting', label: 'Aguardando cliente' },
  { value: 'scope_change', label: 'Mudança de escopo' },
  { value: 'missing_input', label: 'Faltou informação ou material' },
  { value: 'rework', label: 'Retrabalho' },
  { value: 'internal_capacity', label: 'Capacidade da equipe' },
  { value: 'technical_issue', label: 'Problema técnico' },
  { value: 'priority_change', label: 'Prioridade alterada' },
  { value: 'other', label: 'Outro' },
];

export const DELAY_REASON_LABELS = Object.fromEntries(
  DELAY_REASON_OPTIONS.map((item) => [item.value, item.label])
);

export function isProductionLate(task, now = new Date()) {
  const due = parseTaskDate(task?.due_date);
  if (!due) return false;
  const delivered = task?.production_delivered_at ? new Date(task.production_delivered_at) : null;
  if (delivered && !Number.isNaN(delivered.getTime())) {
    return startOfLocalDay(delivered).getTime() > due.getTime();
  }
  return daysUntilDue(task.due_date, now) < 0;
}

export function productionDelayDays(task, now = new Date()) {
  const due = parseTaskDate(task?.due_date);
  if (!due) return 0;
  const end = task?.production_delivered_at ? new Date(task.production_delivered_at) : now;
  if (Number.isNaN(end.getTime())) return 0;
  return Math.max(0, Math.round((startOfLocalDay(end).getTime() - due.getTime()) / 86400000));
}

export function needsProductionDelayJustification(task, justifications = [], now = new Date()) {
  if (!isProductionLate(task, now)) return false;
  return !(justifications || []).some((item) =>
    item.deadline_kind === 'production' && String(item.due_on || '').slice(0, 10) === String(task?.due_date || '').slice(0, 10)
  );
}

export function isStageLate(task, now = new Date()) {
  if (!task?.production_delivered_at || !task?.stage_due_at) return false;
  const due = new Date(task.stage_due_at);
  return !Number.isNaN(due.getTime()) && due.getTime() < now.getTime();
}

export function stageDelayDays(task, now = new Date()) {
  if (!isStageLate(task, now)) return 0;
  const due = new Date(task.stage_due_at);
  return Math.max(1, Math.round((startOfLocalDay(now).getTime() - startOfLocalDay(due).getTime()) / 86400000));
}

export function needsStageDelayJustification(task, justifications = [], now = new Date()) {
  if (!isStageLate(task, now)) return false;
  const dueOn = String(task.stage_due_at || '').slice(0, 10);
  return !(justifications || []).some((item) =>
    item.deadline_kind === 'stage'
      && String(item.due_on || '').slice(0, 10) === dueOn
      && String(item.workflow_stage_key || '') === String(task.workflow_stage_key || '')
  );
}

export function hasDeliveryProof(task, attachmentCount = 0) {
  return Boolean(task?.production_delivery_attachment_id || Number(attachmentCount) > 0);
}

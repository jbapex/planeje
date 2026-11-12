// Derived display only: execution lives in the linked task, progression in the database.
export function onboardingOverview(run, stages = [], tasks = []) {
  const ordered = stages.filter((stage) => stage.onboarding_id === run.id).sort((a, b) => a.position - b.position);
  const completed = ordered.filter((stage) => stage.state === 'completed').length;
  const current = ordered.find((stage) => stage.state === 'active') || null;
  const task = current ? tasks.find((item) => item.id === current.task_id) || null : null;
  return { stages: ordered, completed, total: ordered.length, progress: ordered.length ? Math.round(completed / ordered.length * 100) : 0,
    current, task, side: run.status === 'completed' ? 'completed' : current?.pending_side || 'internal' };
}

export function onboardingDue(due, now = new Date()) {
  if (!due || !/^\d{4}-\d{2}-\d{2}$/.test(String(due).slice(0, 10))) return { text: 'Definir prazo', overdue: false };
  const [year, month, day] = due.slice(0, 10).split('-').map(Number);
  const days = Math.round((new Date(year, month - 1, day) - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
  const formatted = `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
  return { text: days < 0 ? `Atrasada ${-days} dia${days === -1 ? '' : 's'} · ${formatted}` : days === 0 ? `Hoje · ${formatted}` : formatted, overdue: days < 0 };
}

function openDueStamp(item) {
  if (!item || item.is_completed || !item.due_date) return null;
  const time = new Date(item.due_date).getTime();
  return Number.isFinite(time) ? time : null;
}

export function orderChecklistItems(items = []) {
  return items.filter((item) => !item.is_completed).slice().sort((left, right) => {
    const a = openDueStamp(left);
    const b = openDueStamp(right);
    if (a == null && b == null) return 0;
    if (a == null) return 1;
    if (b == null) return -1;
    return a - b;
  });
}

export function orderChecklistColumns(clients = [], checklists = []) {
  const rank = new Map();
  for (const list of checklists) {
    for (const item of list.items || []) {
      if (item.is_completed) continue;
      const current = rank.get(list.client_id) || { open: false, due: null };
      current.open = true;
      const stamp = openDueStamp(item);
      if (stamp != null && (current.due == null || stamp < current.due)) current.due = stamp;
      rank.set(list.client_id, current);
    }
  }
  return clients.slice().sort((left, right) => {
    const a = rank.get(left.id) || { open: false, due: null };
    const b = rank.get(right.id) || { open: false, due: null };
    if (a.open !== b.open) return a.open ? -1 : 1;
    if (a.due == null && b.due == null) return String(left.empresa || '').localeCompare(String(right.empresa || ''), 'pt-BR');
    if (a.due == null) return 1;
    if (b.due == null) return -1;
    if (a.due !== b.due) return a.due - b.due;
    return String(left.empresa || '').localeCompare(String(right.empresa || ''), 'pt-BR');
  });
}

export const newOnboardingStage = () => ({ title: '', instructions: '', pending_side: 'internal', sla_days: 2, assignee_id: '' });

export function validateOnboardingTemplate(draft) {
  if (draft.name.trim().length < 2) return 'Informe o nome do modelo.';
  if (!draft.stages.length || draft.stages.length > 30) return 'Configure entre 1 e 30 etapas.';
  if (draft.stages.some((stage) => stage.title.trim().length < 2)) return 'Dê um nome a cada etapa.';
  if (draft.stages.some((stage) => !['internal', 'client'].includes(stage.pending_side)
    || stage.sla_days === '' || !Number.isInteger(Number(stage.sla_days)) || Number(stage.sla_days) < 0 || Number(stage.sla_days) > 365)) return 'Use prazos entre 0 e 365 dias úteis.';
  return '';
}

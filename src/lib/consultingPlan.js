import { isTerminalTaskStatus, daysUntilDue } from './taskUrgency.js';

export const PROJECT_MODELS = [{ value: 'content', label: 'Produção de conteúdo' }, { value: 'consulting', label: 'Assessoria de tráfego' }];
export const ACTION_KINDS = { strategy: 'Estratégia', material: 'Solicitar material', editing: 'Edição pontual', campaign: 'Campanha', tracking: 'Rastreamento / integração', review: 'Análise e orientação' };
export const MATERIAL_STATES = { requested: 'A solicitar', waiting_client: 'Aguardando cliente', received: 'Recebido', needs_edit: 'Precisa de edição', ready: 'Conferido para uso' };
export const isConsulting = (project) => project?.planning_model === 'consulting';
export const matchesClientLabel = (client, label) => !label || label === 'all' || (client?.etiquetas || []).includes(label);
export function consultingProgress(plan, tasks = [], statuses = []) {
  const { total, completed, percentage } = consultingExecution(plan, tasks, statuses);
  return { total, completed, percentage };
}

// One read model for the screen and AI. No independent status or completion is stored.
export function consultingExecution(plan, tasks = [], statuses = [], { complete = true, now = new Date() } = {}) {
  const options = statuses.map(s => ({ ...s, value: s.value || s.status_value }));
  const dateParts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now).map(p => [p.type, p.value]));
  const businessDay = new Date(Number(dateParts.year), Number(dateParts.month) - 1, Number(dateParts.day));
  const steps = (plan?.consulting?.actions || []).map((action, index) => {
    const task = tasks.find(t => t.project_id === plan.project_id && String(t.plan_material_id) === action.id);
    const definition = options.find(s => s.value === task?.status);
    const taskDone = Boolean(task && isTerminalTaskStatus(task.status, options));
    const materialPending = action.kind === 'material' && action.material_state !== 'ready';
    const validationPending = action.kind === 'tracking' && (!action.validation?.trim() || !action.evidence_url?.trim());
    const done = taskDone && !materialPending && !validationPending;
    const waiting = action.kind === 'material' && action.material_state === 'waiting_client';
    let state = 'planned', label = 'A planejar';
    if (!task && !complete) { state = 'unknown'; label = 'Tarefa não consultada'; }
    else if (done) { state = 'done'; label = 'Concluída'; }
    else if (waiting) { state = 'waiting_client'; label = 'Aguardando cliente'; }
    else if (taskDone) { state = 'needs_check'; label = 'Conferir entrega'; }
    else if (task) {
      const initial = definition?.is_initial || ['todo','a_fazer','pending'].includes(task.status);
      state = initial ? 'todo' : ['in_progress','doing','em_andamento'].includes(task.status) ? 'in_progress' : 'active';
      label = definition?.label || (initial ? 'A fazer' : state === 'in_progress' ? 'Em andamento' : 'Situação a conferir');
    }
    return {
      id: action.id, order: index + 1, title: action.title, kind: action.kind,
      state, label, completed: done, task_id: task?.id || null, task_status: task?.status || null,
      task_completed: taskDone, assignee_ids: task?.assignee_ids || [], due_date: task?.due_date || null,
      overdue: Boolean(task && !taskDone && daysUntilDue(task.due_date, businessDay) < 0),
      material_state: action.kind === 'material' ? action.material_state || 'requested' : null,
      client_due_on: action.kind === 'material' ? action.client_due_on || null : null,
      client_overdue: Boolean(materialPending && action.client_due_on && daysUntilDue(action.client_due_on, businessDay) < 0),
      validation_pending: validationPending,
    };
  });
  const completed = steps.filter(s => s.completed).length;
  const active = steps.filter(s => ['in_progress','active'].includes(s.state));
  const focus = active[0] || steps.find(s => !s.completed) || null;
  return {
    project_id: plan?.project_id || null, revision: plan?.consulting_revision || 0,
    objective: plan?.objetivo || '', total: steps.length,
    completed: complete ? completed : null,
    percentage: complete ? (steps.length ? Math.round(100 * completed / steps.length) : 0) : null,
    task_coverage_complete: complete, current_step_ids: active.map(s => s.id),
    next_step_id: complete ? focus?.id || null : null, steps,
  };
}
export function consultingGaps(plan, tasks = [], statuses = []) {
  const rows = [];
  if (!plan?.objetivo?.trim() || !plan?.consulting?.strategy?.trim()) rows.push({ reason: 'Estratégia ainda incompleta' });
  if (!plan?.consulting?.actions?.length) rows.push({ reason: 'Nenhuma ação registrada no plano' });
  for (const action of plan?.consulting?.actions || []) {
    const task = tasks.find((t) => t.project_id === plan.project_id && String(t.plan_material_id) === action.id);
    if (!task) rows.push({ id: action.id, title: action.title, reason: 'Sem tarefa vinculada' });
    else if (!isTerminalTaskStatus(task.status, statuses)) {
      if (!task.assignee_ids?.length) rows.push({ id: action.id, task_id: task.id, title: action.title, reason: 'Sem responsável' });
      if (!task.due_date) rows.push({ id: action.id, task_id: task.id, title: action.title, reason: 'Sem prazo interno' });
    }
    if (action.kind === 'tracking' && (!action.validation?.trim() || !action.evidence_url?.trim())) rows.push({ id: action.id, title: action.title, reason: 'Integração sem conferência e evidência registradas' });
    if (action.material_state === 'waiting_client') rows.push({ id: action.id, title: action.title, reason: 'Aguardando material do cliente', client_due_on: action.client_due_on || null });
  }
  return rows;
}
export const newConsultingAction = () => ({ id: crypto.randomUUID(), title: '', kind: 'strategy', guidance: '', material_state: 'requested', client_due_on: '', evidence_url: '' });
export function validHttpUrl(value) {
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password; } catch { return false; }
}

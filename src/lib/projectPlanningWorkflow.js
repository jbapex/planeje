import { planMateriaisAsRows } from './campaignPlanMateriais.js';
import { projectPlanHasContent } from './projectPlanOverview.js';
import { richTextHasContent } from './richText.js';
import { projectMonths, projectPeriod } from './projectPeriod.js';
import { daysUntilDue, formatDueWorkLabel, getDueTone, getEffectiveTaskDeadline, isTerminalTaskStatus, parseTaskDate } from './taskUrgency.js';

const planningDefaultsNow = new Date();
export const PROJECT_PLANNING_DEFAULTS = {
  automatic_pending: true,
  automatic_from_month: localDateKey(new Date(planningDefaultsNow.getFullYear(), planningDefaultsNow.getMonth() + 1, 1)),
  start_day: 10, plan_day: 15, approval_day: 20, first_week_day: 28,
};
export const PROJECT_DEADLINE_FIELDS = [
  { key: 'planning_start_on', label: 'Iniciar planejamento', setting: 'start_day' },
  { key: 'plan_due_on', label: 'Plano pronto', setting: 'plan_day' },
  { key: 'approval_due_on', label: 'Reunião / aprovação', setting: 'approval_day' },
  { key: 'first_week_due_on', label: 'Primeira semana pronta', setting: 'first_week_day' },
];
export function planningSettingsError(settings) {
  const fromMonth = settings?.automatic_from_month;
  if (!parseTaskDate(fromMonth) || localDateKey(parseTaskDate(fromMonth)) !== fromMonth || !fromMonth.endsWith('-01')) return 'Escolha um mês válido para iniciar o automático.';
  const days = PROJECT_DEADLINE_FIELDS.map(({ setting }) => Number(settings?.[setting]));
  if (days.some((day) => !Number.isInteger(day) || day < 1 || day > 31)) return 'Escolha dias entre 1 e 31.';
  if (days.some((day, index) => index > 0 && day < days[index - 1])) return 'Os prazos devem seguir a ordem: início, plano, aprovação e primeira semana.';
  return null;
}
export function localDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function previousMonthDeadlines(year, monthIndex, settings = PROJECT_PLANNING_DEFAULTS) {
  const previous = new Date(year, monthIndex - 1, 1);
  const lastDay = new Date(year, monthIndex, 0).getDate();
  return Object.fromEntries(PROJECT_DEADLINE_FIELDS.map(({ key, setting }) => {
    const day = Number(settings?.[setting] ?? PROJECT_PLANNING_DEFAULTS[setting]);
    return [key, localDateKey(new Date(previous.getFullYear(), previous.getMonth(), Math.min(lastDay, Math.max(1, day))))];
  }));
}
export function projectDeadlinesError(project) {
  const dates = PROJECT_DEADLINE_FIELDS.map(({ key }) => project?.[key]);
  if (dates.some((date) => !parseTaskDate(date) || localDateKey(parseTaskDate(date)) !== date)) return 'Preencha os quatro prazos com datas válidas.';
  if (dates.some((date, index) => index > 0 && date < dates[index - 1])) return 'Os prazos devem seguir a ordem: início, plano, aprovação e primeira semana.';
  return null;
}

// Monthly scope overrides the current contract; future scopes must never leak into earlier months.
export function planningContractForMonth(client, scopes, referenceMonth) {
  return (scopes || []).filter((scope) => scope.client_id === client.id && scope.reference_month <= referenceMonth)
    .sort((a, b) => b.reference_month.localeCompare(a.reference_month))[0]
    || { product: client.tipo_servico, deliverables: client.entregaveis || {} };
}
const SOCIAL_DELIVERABLE_KEYS = ['posts', 'videos', 'stories', 'carrosseis'];

export const CONTA_SERVICOS = [
  { value: 'so_midia', label: 'Só mídia' },
  { value: 'so_trafego', label: 'Só tráfego' },
  { value: 'trafego_e_midia', label: 'Tráfego e mídia' },
];

export function planSkipKey(clientId, referenceMonth) {
  return `${clientId}:${String(referenceMonth || '').slice(0, 10)}`;
}

export function isPaidTrafficOnly(client, contract = {}) {
  const deliverables = contract.deliverables || client?.entregaveis || {};
  if (SOCIAL_DELIVERABLE_KEYS.some((key) => Number(deliverables[key]) > 0)) return false;
  const product = String(contract.product || client?.tipo_servico || '').trim().toLowerCase();
  const contrato = String(client?.tipo_contrato || '').trim().toLowerCase();
  if (product === 'trafego' || product === 'trafego_apenas') return true;
  if (/tr[aá]fego/.test(product) || /tr[aá]fego/.test(contrato)) return true;
  if (/meta\s*ads|google\s*ads/.test(product) || /meta\s*ads|google\s*ads/.test(contrato)) return true;
  return false;
}

export function clientNeedsMonthlyPlan(client, scopes = [], referenceMonth) {
  if (client.etapa !== 'closed') return false;
  const contract = planningContractForMonth(client, scopes, referenceMonth);
  if (contract.product === 'so_trafego') return false;
  if (contract.product === 'so_midia' || contract.product === 'trafego_e_midia') return true;
  if (isPaidTrafficOnly(client, contract)) return false;
  const content = SOCIAL_DELIVERABLE_KEYS.some((key) => Number(contract.deliverables?.[key]) > 0);
  if (content) return true;
  return ['execucao_completa', 'execucao_parcial', 'apenas_consultoria'].includes(contract.product);
}
export function isAutomaticPlanningPeriod(referenceMonth, settings = PROJECT_PLANNING_DEFAULTS) {
  return String(referenceMonth || '').slice(0, 10) >= (settings?.automatic_from_month || PROJECT_PLANNING_DEFAULTS.automatic_from_month);
}
export function pendingPlanningRows(clients, existingRows, scopes, year, monthIndex, settings, skips = []) {
  if (!settings?.automatic_pending) return [];
  const referenceMonth = localDateKey(new Date(year, monthIndex, 1));
  if (!isAutomaticPlanningPeriod(referenceMonth, settings)) return [];
  const skipped = new Set((skips || []).filter((row) => String(row.reference_month || '').slice(0, 10) === referenceMonth).map((row) => row.client_id));
  const existing = new Set(existingRows.map((row) => row.client.id));
  const label = new Date(year, monthIndex, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  return clients.filter((client) => !existing.has(client.id) && !skipped.has(client.id) && clientNeedsMonthlyPlan(client, scopes, referenceMonth)).map((client) => ({
    pending: true, client, stage: 'a_fazer', hasPlan: false, hasDocument: false,
    progress: { completed: 0, total: 0, percentage: 0 },
    project: { id: `pending:${client.id}:${referenceMonth}`, client_id: client.id, name: `Plano de ${label}`, mes_referencia: referenceMonth,
      status: 'a_fazer', workflow_managed: true, ...previousMonthDeadlines(year, monthIndex, settings) },
  }));
}
export function planReadyForApproval(plan) {
  return projectPlanHasContent(plan ? { ...plan, materiais: [] } : null) && planMateriaisAsRows(plan).length > 0;
}

export function firstWeekProduction(plan, tasks = [], referenceMonth, statusOptions = []) {
  const month = String(referenceMonth || '').slice(0, 7);
  const materials = planMateriaisAsRows(plan).filter((material) => {
    const task = tasks.find((task) => String(task.plan_material_id) === String(material.id));
    const date = task?.post_date || material.data_postagem || material.data_publicacao;
    return String(date || '').slice(0, 7) === month && Number(String(date).slice(8, 10)) >= 1 && Number(String(date).slice(8, 10)) <= 7;
  });
  const deliveredIds = new Set(tasks.filter((task) => task.production_delivered_at || isTerminalTaskStatus(task.status, statusOptions)).map((task) => String(task.plan_material_id)));
  const ready = materials.filter((material) => material.id != null && deliveredIds.has(String(material.id))).length;
  return { total: materials.length, ready, complete: materials.length > 0 && ready === materials.length };
}
export function projectCurrentDeadline(project, plan, tasks = [], statusOptions = [], now = new Date()) {
  const stage = String(project.status || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  let value = null;
  let label = '';
  if (project.workflow_managed && !['concluido', 'pausado'].includes(stage)) {
    if (stage === 'a_fazer') { value = project.planning_start_on; label = 'Iniciar plano'; }
    else if (stage === 'planejamento') { value = project.plan_due_on; label = 'Plano pronto'; }
    else if (stage === 'aprovacao') { value = project.approval_due_on; label = 'Aprovação'; }
    else if (stage === 'execucao') {
      const months = projectMonths(project);
      const { start, end } = projectPeriod(project);
      const productionMonth = start === end ? start : months.find((month) => month >= localDateKey(now).slice(0, 7) && !firstWeekProduction(plan, tasks, month, statusOptions).complete);
      if (productionMonth && !firstWeekProduction(plan, tasks, productionMonth, statusOptions).complete) {
        value = productionMonth === start ? project.first_week_due_on : previousMonthDeadlines(Number(productionMonth.slice(0, 4)), Number(productionMonth.slice(5, 7)) - 1, { first_week_day: Number(String(project.first_week_due_on || '').slice(8, 10)) || PROJECT_PLANNING_DEFAULTS.first_week_day }).first_week_due_on;
        label = 'Primeira semana';
      }
    }
  }
  if (stage === 'execucao') {
    const next = tasks.filter((task) => !isTerminalTaskStatus(task.status, statusOptions))
      .map((task) => getEffectiveTaskDeadline(task)).filter((deadline) => parseTaskDate(deadline.value))
      .sort((a, b) => String(a.value).localeCompare(String(b.value)))[0];
    if (next && (!value || String(next.value).slice(0, 10) < value)) {
      value = next.value; label = next.kind === 'publication' ? 'Postagem' : next.kind === 'stage' ? 'Etapa da tarefa' : 'Produção';
    }
  }
  return { value, label, tone: getDueTone(value, { now }), days: daysUntilDue(value, now), text: formatDueWorkLabel(value, { now }),
    needsDates: !value && !['concluido', 'pausado'].includes(stage), hasDocument: richTextHasContent(plan?.contexto_ia) };
}

export function projectNeedsActionNow(row, statusOptions = [], now = new Date()) {
  if (['concluido', 'pausado'].includes(row.stage)) return false;
  const today = localDateKey(now);
  const monthEnd = localDateKey(new Date(now.getFullYear(), now.getMonth() + 1, 0));
  if (row.pending) return Boolean(row.project.planning_start_on && row.project.planning_start_on <= today);
  const deadline = projectCurrentDeadline(row.project, row.plan, row.tasks, statusOptions, now);
  if (deadline.value && String(deadline.value).slice(0, 10) <= monthEnd) return true;
  if (row.project.planning_start_on) return row.project.planning_start_on <= today;
  return projectPeriod(row.project).start <= localDateKey(new Date(now.getFullYear(), now.getMonth() + 1, 1)).slice(0, 7);
}

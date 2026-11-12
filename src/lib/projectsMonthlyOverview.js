import { projectPlanHasContent } from './projectPlanOverview.js';
import { richTextHasContent } from './richText.js';
import { projectCoversMonth, projectMaterialsForMonth, projectPeriod } from './projectPeriod.js';
import { isTerminalTaskStatus } from './taskUrgency.js';
import { planMateriaisAsRows } from './campaignPlanMateriais.js';

export const PROJECT_STAGES = [
  { key: 'a_fazer', label: 'A fazer' },
  { key: 'planejamento', label: 'Planejamento' },
  { key: 'aprovacao', label: 'Reunião / Aprovação' },
  { key: 'execucao', label: 'Execução' },
  { key: 'concluido', label: 'Concluídos' },
  { key: 'pausado', label: 'Pausados' },
];
const normalize = (value) => String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
export function plannedMaterialProgress(plan, tasks = [], statusOptions = []) {
  const materials = planMateriaisAsRows(plan);
  const completedIds = new Set(tasks.filter((task) => isTerminalTaskStatus(task.status, statusOptions) && task.plan_material_id != null).map((task) => String(task.plan_material_id)));
  const completed = materials.filter((material) => material?.id != null && completedIds.has(String(material.id))).length;
  return { completed, total: materials.length, percentage: materials.length ? Math.round(completed / materials.length * 100) : 0 };
}

export function buildProjectsMonthlyOverview({ clients = [], projects = [], tasks = [], campaignPlans = [], statusOptions = [], year, monthIndex, allPeriods = false }) {
  const clientsById = Object.fromEntries(clients.map((client) => [client.id, client]));
  const plansByProject = Object.fromEntries(campaignPlans.map((plan) => [plan.project_id, plan]));
  const tasksByProject = {};
  tasks.forEach((task) => { if (task.project_id) (tasksByProject[task.project_id] ||= []).push(task); });
  const rows = projects.filter((project) => {
    return clientsById[project.client_id] && (allPeriods || projectCoversMonth(project, `${year}-${String(monthIndex + 1).padStart(2, '0')}-01`));
  }).map((project) => {
    const plan = plansByProject[project.id];
    const projectTasks = tasksByProject[project.id] || [];
    const monthPlan = allPeriods ? plan : { ...plan, materiais: projectMaterialsForMonth(plan, project, `${year}-${String(monthIndex + 1).padStart(2, '0')}-01`, projectTasks) };
    const { start, end } = projectPeriod(project);
    const hasStrategy = projectPlanHasContent(plan ? { ...plan, materiais: [] } : null);
    return {
      project, plan, client: clientsById[project.client_id],
      tasks: tasksByProject[project.id] || [],
      stage: normalize(project.status) || 'planejamento',
      // Creating materials alone does not establish the strategy of the month.
      hasPlan: hasStrategy && (allPeriods || start === end || monthPlan.materiais.length > 0),
      hasStrategy,
      hasDocument: richTextHasContent(plan?.contexto_ia),
      progress: plannedMaterialProgress(monthPlan, projectTasks, statusOptions),
    };
  });
  const withPlan = new Set(rows.filter((row) => row.hasPlan).map((row) => row.client.id));
  const withProject = new Set(rows.map((row) => row.client.id));
  const totals = rows.reduce((sum, row) => ({ completed: sum.completed + row.progress.completed, total: sum.total + row.progress.total }), { completed: 0, total: 0 });
  return {
    rows,
    withoutPlan: clients.filter((client) => !withPlan.has(client.id)),
    withoutProject: clients.filter((client) => !withProject.has(client.id)),
    stages: Object.fromEntries(PROJECT_STAGES.map(({ key }) => [key, rows.filter((row) => row.stage === key).length])),
    progress: { ...totals, percentage: totals.total ? Math.round(totals.completed / totals.total * 100) : 0 },
  };
}

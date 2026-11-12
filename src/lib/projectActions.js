import { buildProjectsMonthlyOverview } from './projectsMonthlyOverview.js';
import { localDateKey, pendingPlanningRows, projectNeedsActionNow } from './projectPlanningWorkflow.js';

export function buildProjectsActionOverview({ clients = [], projects = [], tasks = [], campaignPlans = [], statusOptions = [], monthlyScopes = [], planSkips = [], settings, now = new Date() }) {
  const full = buildProjectsMonthlyOverview({ clients, projects, tasks, campaignPlans, statusOptions, allPeriods: true });
  const rows = full.rows.filter((row) => projectNeedsActionNow(row, statusOptions, now));
  const pendingNeeded = [];
  for (let offset = 0; offset <= 1; offset++) {
    const period = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const monthly = buildProjectsMonthlyOverview({ clients, projects, tasks, campaignPlans, statusOptions, year: period.getFullYear(), monthIndex: period.getMonth() });
    pendingNeeded.push(...pendingPlanningRows(clients, monthly.rows, monthlyScopes, period.getFullYear(), period.getMonth(), { ...settings, automatic_pending: true }, planSkips)
      .filter((row) => projectNeedsActionNow(row, statusOptions, now)));
  }
  const missingIds = new Set([...rows.filter((row) => !row.hasPlan).map((row) => row.client.id), ...pendingNeeded.map((row) => row.client.id)]);
  const totals = rows.reduce((sum, row) => ({ completed: sum.completed + row.progress.completed, total: sum.total + row.progress.total }), { completed: 0, total: 0 });
  return {
    rows,
    pendingRows: settings?.automatic_pending ? pendingNeeded : [],
    manualPendingRows: pendingNeeded,
    withoutPlan: clients.filter((client) => missingIds.has(client.id)),
    withoutProject: pendingNeeded.map((row) => ({ ...row.client, planning_reference_month: row.project.mes_referencia })),
    progress: { ...totals, percentage: totals.total ? Math.round(totals.completed / totals.total * 100) : 0 },
    referenceMonth: localDateKey(new Date(now.getFullYear(), now.getMonth() + 1, 1)),
  };
}

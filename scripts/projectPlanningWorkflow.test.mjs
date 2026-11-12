import assert from 'node:assert/strict';
import { PROJECT_PLANNING_DEFAULTS, clientNeedsMonthlyPlan, firstWeekProduction, isAutomaticPlanningPeriod, isPaidTrafficOnly, pendingPlanningRows, planReadyForApproval, planningSettingsError, previousMonthDeadlines, projectCurrentDeadline, projectDeadlinesError } from '../src/lib/projectPlanningWorkflow.js';

const settings = { ...PROJECT_PLANNING_DEFAULTS, automatic_from_month: '2026-10-01' };
assert.equal(isAutomaticPlanningPeriod('2026-09-01', settings), false);
assert.equal(isAutomaticPlanningPeriod('2026-10-01', settings), true);
assert.equal(isAutomaticPlanningPeriod('2027-01-01', settings), true, 'The activation month must stay fixed after a year rollover');
assert.equal(planningSettingsError(settings), null);
assert.ok(planningSettingsError({ ...settings, automatic_from_month: '2026-10-02' }));
assert.ok(planningSettingsError({ ...settings, automatic_from_month: '2026-02-30' }));

assert.deepEqual(previousMonthDeadlines(2026, 0), { planning_start_on: '2025-12-10', plan_due_on: '2025-12-15', approval_due_on: '2025-12-20', first_week_due_on: '2025-12-28' });
assert.equal(previousMonthDeadlines(2026, 2, { ...PROJECT_PLANNING_DEFAULTS, first_week_day: 31 }).first_week_due_on, '2026-02-28');
assert.equal(previousMonthDeadlines(2028, 2, { ...PROJECT_PLANNING_DEFAULTS, first_week_day: 31 }).first_week_due_on, '2028-02-29');
assert.ok(planningSettingsError({ ...PROJECT_PLANNING_DEFAULTS, plan_day: 5 }));
assert.ok(planningSettingsError({ ...PROJECT_PLANNING_DEFAULTS, start_day: 0 }));
assert.ok(projectDeadlinesError({ ...previousMonthDeadlines(2026, 2), first_week_due_on: '2026-02-30' }));

const clients = [
  { id: 'active', etapa: 'closed', tipo_servico: 'execucao_completa' },
  { id: 'traffic', etapa: 'closed', tipo_servico: 'trafego', entregaveis: { anuncios: 5 } },
  { id: 'inactive', etapa: 'lead', tipo_servico: 'execucao_completa' },
  { id: 'existing', etapa: 'closed', tipo_servico: 'execucao_completa' },
  { id: 'consulting', etapa: 'closed', tipo_servico: 'apenas_consultoria' },
];
const scopes = [{ client_id: 'active', reference_month: '2026-11-01', product: 'trafego', deliverables: {} }];
assert.equal(clientNeedsMonthlyPlan(clients[0], scopes, '2026-10-01'), true, 'Future contract changes must not suppress October');
assert.equal(clientNeedsMonthlyPlan(clients[0], scopes, '2026-11-01'), false);
assert.equal(clientNeedsMonthlyPlan({ ...clients[1], entregaveis: { videos: 2 } }, [], '2026-10-01'), true);
assert.equal(isPaidTrafficOnly(clients[1], { product: 'trafego', deliverables: { anuncios: 5 } }), true);
assert.equal(clientNeedsMonthlyPlan({ id: 'ads', etapa: 'closed', tipo_servico: 'apenas_consultoria', tipo_contrato: 'Tráfego Pago — Plano Master + Google Ads', entregaveis: {} }, [], '2026-10-01'), false);
assert.equal(clientNeedsMonthlyPlan({ id: 'meta', etapa: 'closed', tipo_servico: 'apenas_consultoria', tipo_contrato: 'Meta Ads + Google Ads — Piloto', entregaveis: {} }, [], '2026-10-01'), false);
assert.equal(clientNeedsMonthlyPlan({ id: 'gestao', etapa: 'closed', tipo_servico: 'Gestão de tráfego pago, edição de criativos', entregaveis: {} }, [], '2026-10-01'), false);
assert.equal(clientNeedsMonthlyPlan({ id: 'mix', etapa: 'closed', tipo_servico: 'execucao_completa', tipo_contrato: 'Meta Ads', entregaveis: { posts: 2 } }, [], '2026-10-01'), true);
assert.equal(clientNeedsMonthlyPlan({ id: 'so', etapa: 'closed', tipo_servico: 'so_trafego', entregaveis: { videos: 4 } }, [], '2026-10-01'), false);
assert.equal(clientNeedsMonthlyPlan({ id: 'midia', etapa: 'closed', tipo_servico: 'so_midia', entregaveis: {} }, [], '2026-10-01'), true);
assert.equal(clientNeedsMonthlyPlan({ id: 'ambos', etapa: 'closed', tipo_servico: 'trafego_e_midia', entregaveis: {} }, [], '2026-10-01'), true);
assert.deepEqual(pendingPlanningRows([clients[0]], [], scopes, 2026, 9, settings, [{ client_id: 'active', reference_month: '2026-10-01' }]), []);
assert.deepEqual(pendingPlanningRows([
  { id: 'ads', etapa: 'closed', tipo_servico: 'apenas_consultoria', tipo_contrato: 'Tráfego Pago', entregaveis: {} },
  clients[0],
], [], scopes, 2026, 9, settings).map((row) => row.client.id), ['active']);
assert.deepEqual(pendingPlanningRows(clients, [{ client: clients[3] }], scopes, 2026, 9, settings).map((row) => row.client.id), ['active', 'consulting']);
for (const [year, month] of [[2024, 0], [2025, 0], [2025, 11], [2026, 8]]) {
  assert.deepEqual(pendingPlanningRows(clients, [], scopes, year, month, settings), [], 'Historical months must not create automatic pending cards');
}
assert.deepEqual(pendingPlanningRows(clients, [], scopes, 2026, 9, { automatic_pending: false }), []);
assert.equal(planReadyForApproval({ contexto_ia: '<p><br></p>', materiais: [{ id: 'm' }] }), false);
assert.equal(planReadyForApproval({ contexto_ia: '<p>Plano do mês</p>', materiais: [] }), false);
assert.equal(planReadyForApproval({ contexto_ia: '<p>Plano do mês</p>', materiais: [{ id: 'm' }] }), true);

const project = { workflow_managed: true, mes_referencia: '2026-10-01', ...previousMonthDeadlines(2026, 9), status: 'planejamento' };
const plan = { materiais: [{ id: 'm1', data_postagem: '2026-10-03' }, { id: 'm2', data_postagem: '2026-10-07' }, { id: 'm3', data_postagem: '2026-10-15' }] };
const tasks = [{ plan_material_id: 'm1', status: 'review', due_date: '2026-09-10', production_delivered_at: '2026-09-12T12:00:00Z', stage_due_at: '2026-10-02' }, { plan_material_id: 'm2', status: 'custom_done' }];
const statuses = [{ value: 'custom_done', is_terminal: true }];
assert.equal(projectCurrentDeadline(project, plan, tasks, statuses).value, '2026-09-15');
assert.equal(projectCurrentDeadline({ ...project, status: 'aprovacao' }, plan, tasks, statuses).value, '2026-09-20', 'Old plan deadline stops being active during client approval');
assert.deepEqual(firstWeekProduction(plan, tasks, project.mes_referencia, statuses), { total: 2, ready: 2, complete: true });
assert.equal(projectCurrentDeadline({ ...project, status: 'execucao' }, plan, tasks, statuses).value, '2026-10-02', 'Delivered production must follow review/posting instead of its old production due date');
assert.equal(projectCurrentDeadline({ ...project, status: 'execucao' }, plan, [], statuses).value, '2026-09-28');
assert.equal(projectCurrentDeadline({ ...project, status: 'execucao' }, plan, [{ status: 'production', due_date: '2026-09-25' }], statuses).value, '2026-09-25', 'Urgent materials can precede the first-week milestone');
assert.equal(projectCurrentDeadline({ ...project, status: 'concluido' }, plan, tasks, statuses).value, null);
assert.equal(projectCurrentDeadline({ ...project, status: 'pausado' }, plan, tasks, statuses).value, null);
assert.equal(projectCurrentDeadline({ ...project, workflow_managed: false }, plan, tasks, statuses).value, null, 'Do not invent retrospective planning deadlines for existing projects');
assert.equal(projectCurrentDeadline({ ...project, status: 'a_fazer' }, plan, [], statuses, new Date(2026, 8, 10)).days, 0);
console.log('projectPlanningWorkflow: next-month dates, short months, contract scope, automatic opt-out, duplicate avoidance, approval content and stage-aware urgency OK');

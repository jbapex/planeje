import test from 'node:test';
import assert from 'node:assert/strict';
import { projectCoversMonth, projectMonths, materialReferenceMonth, projectPeriodError } from '../src/lib/projectPeriod.js';
import { buildProjectsMonthlyOverview } from '../src/lib/projectsMonthlyOverview.js';
import { buildProjectsActionOverview } from '../src/lib/projectActions.js';
import { pendingPlanningRows, projectCurrentDeadline, PROJECT_PLANNING_DEFAULTS } from '../src/lib/projectPlanningWorkflow.js';
import { parseSuggestedPlanMaterials, projectPlanPayload } from '../src/lib/projectPlanning.js';

const client = { id: 'client', etapa: 'closed', tipo_servico: 'execucao_completa' };
const project = { id: 'quarter', client_id: client.id, mes_referencia: '2026-10-01', mes_fim: '2026-12-01', status: 'planejamento', workflow_managed: true, planning_start_on: '2026-09-10', plan_due_on: '2026-09-15', approval_due_on: '2026-09-20', first_week_due_on: '2026-09-28' };
const plan = { project_id: project.id, contexto_ia: '<p>Campanha trimestral</p>', materiais: [
  { id: 'oct', tipo: 'video', mes_referencia: '2026-10-01', data_entrega: '2026-09-28' },
  { id: 'nov', tipo: 'video', data_postagem: '2026-11-03', data_entrega: '2026-10-28' },
] };
const settings = { ...PROJECT_PLANNING_DEFAULTS, automatic_from_month: '2026-10-01' };
const overview = (monthIndex, tasks = []) => buildProjectsMonthlyOverview({ clients: [client], projects: [project], campaignPlans: [plan], tasks, year: 2026, monthIndex });

test('periods include every month and cross years; legacy date remains a single month', () => {
  assert.deepEqual(projectMonths(project), ['2026-10', '2026-11', '2026-12']);
  assert.deepEqual(projectMonths({ mes_referencia: '2026-12-01', mes_fim: '2027-02-01' }), ['2026-12', '2027-01', '2027-02']);
  assert.equal(projectCoversMonth(project, '2026-09-01'), false);
  assert.equal(projectCoversMonth(project, '2027-01-01'), false);
  assert.equal(projectCoversMonth({ mes_referencia: '2025-11-07' }, '2025-11-01'), true);
  assert.equal(projectPeriodError('2026-12', '2026-10') != null, true);
  assert.equal(projectPeriodError('2026-10', '2026-12'), null);
  assert.equal(projectPeriodError('2026-13', '2027-01') != null, true);
});
test('monthly progress separates months and an empty later month is not considered planned', () => {
  assert.equal(overview(9).rows.length, 1);
  assert.equal(overview(10).progress.total, 1);
  assert.equal(overview(11).progress.total, 0);
  assert.equal(overview(11).rows[0].hasPlan, false);
  assert.equal(overview(11).rows[0].hasStrategy, true);
  assert.equal(overview(9, [{ project_id: project.id, plan_material_id: 'oct', status: 'published' }]).progress.percentage, 100);
  assert.equal(overview(10, [{ project_id: project.id, plan_material_id: 'oct', status: 'published' }]).progress.percentage, 0);
});
test('production dates do not choose publication month; linked task publication changes do', () => {
  assert.equal(materialReferenceMonth(plan.materiais[0], project), '2026-10');
  assert.equal(materialReferenceMonth(plan.materiais[1], project), '2026-11');
  const moved = [{ project_id: project.id, plan_material_id: 'oct', status: 'published', post_date: '2026-11-04' }];
  assert.equal(overview(9, moved).progress.total, 0);
  assert.deepEqual(overview(10, moved).progress, { completed: 1, total: 2, percentage: 50 });
  assert.equal(projectPlanPayload(plan).materiais[0].mes_referencia, '2026-10-01');
});
test('automatic pending cards use the existing project throughout its full period', () => {
  for (const monthIndex of [9, 10, 11]) assert.equal(pendingPlanningRows([client], overview(monthIndex).rows, [], 2026, monthIndex, settings).length, 0);
  assert.equal(pendingPlanningRows([client], [], [], 2027, 0, settings).length, 1);
});
test('Agora includes next-month preparation now, without starting future periods early or reviving closed projects', () => {
  const second = { ...client, id: 'pending' };
  const now = new Date('2026-09-16T12:00:00');
  const result = buildProjectsActionOverview({ clients: [client, second], projects: [project, { ...project, id: 'closed', status: 'concluido' }, { ...project, id: 'paused', status: 'pausado' }, { ...project, id: 'future', mes_referencia: '2027-01-01', mes_fim: '2027-03-01', planning_start_on: '2026-12-10', plan_due_on: '2026-12-15' }], campaignPlans: [plan], settings, now });
  assert.deepEqual(result.rows.map((row) => row.project.id), ['quarter']);
  assert.equal(result.pendingRows.length, 1);
  assert.equal(result.pendingRows[0].project.mes_referencia, '2026-10-01');
  assert.deepEqual(buildProjectsActionOverview({ clients: [second], settings, now: new Date('2026-09-01T12:00:00') }).pendingRows, []);
  assert.equal(buildProjectsActionOverview({ clients: [second], settings: { ...settings, automatic_pending: false }, now }).pendingRows.length, 0);
});
test('each month keeps its own first-week preparation deadline during execution', () => {
  const datedPlan = { ...plan, materiais: [{ id: 'oct', data_postagem: '2026-10-03' }, plan.materiais[1]] };
  const tasks = [{ plan_material_id: 'oct', status: 'review', production_delivered_at: '2026-09-27T12:00:00Z' }];
  const deadline = projectCurrentDeadline({ ...project, status: 'execucao' }, datedPlan, tasks, [], new Date('2026-10-01T12:00:00'));
  assert.equal(deadline.value, '2026-10-28');
});
test('AI extraction preserves similar materials in different months while rejecting a repeat in the same month', () => {
  const input = { materiais: [{ tipo: 'video', descricao: 'Oferta', mes_referencia: '2026-10-01' }, { tipo: 'video', descricao: 'Oferta', mes_referencia: '2026-11-01' }, { tipo: 'video', descricao: 'Oferta', mes_referencia: '2026-11-01' }] };
  assert.deepEqual(parseSuggestedPlanMaterials(input, [], { referencePeriod: '2026-10-01' }).map((material) => material.mes_referencia), ['2026-10-01', '2026-11-01']);
});

import assert from 'node:assert/strict';
import { buildProjectsMonthlyOverview, plannedMaterialProgress } from '../src/lib/projectsMonthlyOverview.js';

const clients = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
const projects = [
  { id: 'p1', client_id: 'a', mes_referencia: '2026-09-01', status: 'execucao' },
  { id: 'p2', client_id: 'a', mes_referencia: '2026-09-01', status: 'aprovacao' },
  { id: 'empty', client_id: 'b', mes_referencia: '2026-09-01', status: 'planejamento' },
  { id: 'materials-only', client_id: 'd', mes_referencia: '2026-09-01', status: 'planejamento' },
  { id: 'previous', client_id: 'c', mes_referencia: '2026-08-01', status: 'concluido' },
  { id: 'outside', client_id: 'other', mes_referencia: '2026-09-01', status: 'concluido' },
];
const campaignPlans = [
  { project_id: 'p1', contexto_ia: '<p>Estratégia do mês</p>', materiais: [{ id: 'm1' }, { id: 'm2' }, { id: 'm3' }] },
  { project_id: 'p2', contexto_ia: '<p>Campanha de aniversário</p>', materiais: [{ id: 'm4' }] },
  { project_id: 'empty', contexto_ia: '<p><br></p>', materiais: [] },
  { project_id: 'materials-only', materiais: [{ id: 'm5' }] },
];
const tasks = [
  { project_id: 'p1', plan_material_id: 'm1', status: 'published' },
  { project_id: 'p1', plan_material_id: 'm1', status: 'published' },
  { project_id: 'p1', plan_material_id: 'm2', status: 'review' },
  { project_id: 'p1', status: 'published' },
  { project_id: 'p2', plan_material_id: 'm4', status: 'finished_custom' },
  { project_id: 'previous', plan_material_id: 'm3', status: 'published' },
];
const statusOptions = [{ value: 'finished_custom', is_terminal: true }];
const result = buildProjectsMonthlyOverview({ clients, projects, campaignPlans, tasks, statusOptions, year: 2026, monthIndex: 8 });
assert.deepEqual(result.withoutPlan.map((client) => client.id), ['b', 'c', 'd']);
assert.deepEqual(result.withoutProject.map((client) => client.id), ['c']);
assert.equal(result.rows.length, 4);
assert.equal(result.stages.execucao, 1);
assert.equal(result.stages.aprovacao, 1);
assert.deepEqual(result.progress, { completed: 2, total: 5, percentage: 40 });
assert.deepEqual(result.rows[0].progress, { completed: 1, total: 3, percentage: 33 });
assert.deepEqual(plannedMaterialProgress(null), { completed: 0, total: 0, percentage: 0 });
const previous = buildProjectsMonthlyOverview({ clients, projects, campaignPlans, tasks, year: 2026, monthIndex: 7 });
assert.deepEqual(previous.rows.map((row) => row.project.id), ['previous']);
assert.equal(previous.stages.concluido, 1);
console.log('projectsMonthlyOverview: monthly filtering, missing strategy, unique clients, explicit task links and terminal statuses OK');

import assert from 'node:assert/strict';
import { projectPlanHasContent, projectPlanOverview } from '../src/lib/projectPlanOverview.js';

assert.equal(projectPlanHasContent(null), false);
assert.equal(projectPlanHasContent({ contexto_ia: '   ', materiais: [] }), false);
assert.equal(projectPlanHasContent({ contexto_ia: '<p><br></p><p>&nbsp;</p>', materiais: [] }), false);
assert.equal(projectPlanHasContent({ contexto_ia: 'Plano livre', materiais: [] }), true);
assert.equal(projectPlanHasContent({ contexto_ia: '<h2>Plano livre</h2>', materiais: [] }), true);
assert.equal(projectPlanHasContent({ contexto_ia: '', materiais: [{ id: 'm1' }] }), true);

const empty = projectPlanOverview({ id: 'p1' }, null, []);
assert.equal(empty.label, 'Plano vazio — abra para começar');
assert.equal(empty.tasksCount, 0);

const planned = projectPlanOverview(
  { id: 'p1' },
  { contexto_ia: 'Plano', materiais: [{ id: 'm1' }, { id: 'm2' }] },
  [{ id: 't1', project_id: 'p1' }, { id: 't2', project_id: 'other' }]
);
assert.equal(planned.label, '2 itens planejados');
assert.equal(planned.tasksCount, 1);

console.log('PASS project plan overview');

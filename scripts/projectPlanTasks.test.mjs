import test from 'node:test';
import assert from 'node:assert/strict';
import { createTaskFromPlanMaterial, findTaskForPlanMaterial, linkTaskToPlanMaterial, normalizePlanMaterialChannels } from '../src/lib/projectPlanTasks.js';

test('stable project/material identity survives renamed tasks and ignores matching historic titles', () => {
  const tasks = [
    { id: 'historic', project_id: 'a', title: 'Material' },
    { id: 'other-project', project_id: 'b', plan_material_id: '42', title: 'Material' },
    { id: 'linked', project_id: 'a', plan_material_id: '42', title: 'Renamed completely' },
  ];
  assert.equal(findTaskForPlanMaterial(tasks, 'a', 42)?.id, 'linked');
  assert.equal(findTaskForPlanMaterial(tasks, 'a', 'missing'), null);
  assert.equal(findTaskForPlanMaterial(tasks, 'a', null), null);
});

test('channels prefer intentional multiselect including empty, canonicalize and deduplicate', () => {
  assert.deepEqual(normalizePlanMaterialChannels({ canais: [' instagram ', 'Instagram', 'YOUTUBE', 'google meu negócio', 'Podcast', ''] }),
    ['Instagram', 'YouTube', 'Google Meu Negócio', 'Outro']);
  assert.deepEqual(normalizePlanMaterialChannels({ canais: [], plataforma: 'Instagram' }), []);
  assert.deepEqual(normalizePlanMaterialChannels({ plataforma: 'Instagram; Facebook | YouTube' }), ['Instagram', 'Facebook', 'YouTube']);
});

test('creation sends identifiers only and returns existing task without modifying it', async () => {
  const client = { rpc: async (name, args) => {
    assert.equal(name, 'create_task_from_plan_material');
    assert.deepEqual(args, { p_project_id: 'a', p_material_id: '42' });
    return { data: { task: { id: 'linked', status: 'review' }, created: false }, error: null };
  } };
  assert.deepEqual(await createTaskFromPlanMaterial(client, 'a', 42), { task: { id: 'linked', status: 'review' }, created: false });
});

test('create rejects missing identity, database error and missing confirmation', async () => {
  await assert.rejects(() => createTaskFromPlanMaterial({}, 'a', null), /Salve/);
  const dbError = new Error('sem acesso');
  await assert.rejects(() => createTaskFromPlanMaterial({ rpc: async () => ({ error: dbError }) }, 'a', 42), /sem acesso/);
  await assert.rejects(() => createTaskFromPlanMaterial({ rpc: async () => ({ data: {}, error: null }) }, 'a', 42), /confirmar/);
});

test('manual historic binding names the explicit task and propagates conflicts', async () => {
  const client = { rpc: async (name, args) => {
    assert.equal(name, 'link_task_to_plan_material');
    assert.deepEqual(args, { p_project_id: 'a', p_material_id: '42', p_task_id: 'historic' });
    return { data: { task: { id: 'historic', type: 'interno' }, linked: true } };
  } };
  assert.deepEqual(await linkTaskToPlanMaterial(client, 'a', 42, 'historic'), { task: { id: 'historic', type: 'interno' }, linked: true });
  await assert.rejects(() => linkTaskToPlanMaterial({}, 'a', 42, null), /Escolha/);
  await assert.rejects(() => linkTaskToPlanMaterial({ rpc: async () => ({ error: new Error('já vinculado') }) }, 'a', 42, 'historic'), /já vinculado/);
});

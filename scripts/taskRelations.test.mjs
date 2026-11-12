import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeTaskRelations, upsertTaskWithRelations, getTaskClientName, readTaskAfterAutomations } from '../src/lib/taskRelations.js';

const clients = [{ id: 'a', empresa: 'Cliente A' }, { id: 'b', empresa: 'Cliente B' }];
const projects = [{ id: 'p-a', name: 'Campanha A' }, { id: 'p-b', name: 'Campanha B' }];
const initial = { id: 't1', title: 'Tarefa', status: 'todo', client_id: 'a', project_id: 'p-a' };

test('a freshly saved task displays its client before a realtime notification', () => {
  const list = upsertTaskWithRelations([], initial, { clients, projects });
  assert.equal(list.length, 1);
  assert.equal(getTaskClientName(list[0]), 'Cliente A');
  assert.equal(list[0].projetos.name, 'Campanha A');
});

test('realtime insert enriches an existing ID without losing newer status and history', () => {
  const history = [{ status: 'todo' }, { status: 'review', automation: true }];
  const newer = { ...initial, status: 'review', status_history: history, assignee_ids: ['producer', 'reviewer'] };
  const inserted = { ...initial, clientes: clients[0], projetos: projects[0], status_history: [{ status: 'todo' }] };
  const result = upsertTaskWithRelations([newer], inserted, { relationsOnlyIfExists: true });
  assert.equal(result.length, 1);
  assert.equal(result[0].status, 'review');
  assert.equal(result[0].status_history, history);
  assert.deepEqual(result[0].assignee_ids, ['producer', 'reviewer']);
  assert.equal(result[0].clientes.empresa, 'Cliente A');
});

test('late insert enrichment cannot reattach an old client after the client changed', () => {
  const newer = { ...initial, client_id: 'b', clientes: clients[1] };
  const result = upsertTaskWithRelations([newer], { ...initial, clientes: clients[0] }, { relationsOnlyIfExists: true });
  assert.equal(getTaskClientName(result[0]), 'Cliente B');
});

test('raw updates keep joins for unchanged IDs and resolve changed IDs', () => {
  const joined = { ...initial, clientes: clients[0], projetos: projects[0] };
  assert.equal(mergeTaskRelations(joined, { status: 'review' }).clientes.empresa, 'Cliente A');
  const changed = mergeTaskRelations(joined, { client_id: 'b', project_id: 'p-b' }, { clients, projects });
  assert.equal(changed.clientes.empresa, 'Cliente B');
  assert.equal(changed.projetos.name, 'Campanha B');
  assert.equal(mergeTaskRelations(joined, { client_id: 'unknown' }).clientes, null);
});

test('clearing a relationship clears its label and unknown clients are not reported as absent', () => {
  const cleared = mergeTaskRelations({ ...initial, clientes: clients[0], projetos: projects[0] }, { client_id: null, project_id: null });
  assert.equal(cleared.clientes, null);
  assert.equal(cleared.projetos, null);
  assert.equal(getTaskClientName(cleared), 'Sem cliente');
  assert.equal(getTaskClientName({ client_id: 'unknown' }), 'Cliente indisponível');
  assert.equal(getTaskClientName({ ...initial, clientes: clients[1] }, clients), 'Cliente A');
});

test('authoritative final read wins over the first and last intermediate automation snapshots', async () => {
  const originalHistory = [{ status: 'todo', assignee_ids: ['producer'] }];
  const final = { ...initial, status: 'completed', type: 'social_media', assignee_ids: [], status_history: [...originalHistory, { status: 'published' }] };
  const result = await readTaskAfterAutomations({ results: [
    { result: { updatedTask: { ...initial, status: 'published', assignee_ids: ['reviewer'] } } },
    { result: { updatedTask: { ...initial, status: 'published', assignee_ids: [] } } },
  ] }, async () => ({ data: final, error: null }), initial);
  assert.equal(result.task, final);
  assert.equal(result.task.id, initial.id);
  assert.deepEqual(result.task.status_history[0], originalHistory[0]);
  assert.equal(result.error, null);
});

test('failed final read uses the latest successful write, including a later partial failure', async () => {
  const finalHistory = [{ status: 'todo' }, { status: 'josias', automation: true }];
  const result = await readTaskAfterAutomations({ results: [
    { result: { updatedTask: { ...initial, assignee_ids: ['producer', 'validator'] } } },
    { result: { updatedTask: { ...initial, assignee_ids: ['validator'], status_history: finalHistory }, error: { message: 'Later action failed' } } },
  ] }, async () => { throw new Error('Offline'); }, initial);
  assert.deepEqual(result.task.assignee_ids, ['validator']);
  assert.equal(result.task.status_history, finalHistory);
  assert.equal(result.error.message, 'Offline');
});

test('a persisted Social transfer leaves the task list and retains its calendar entry', () => {
  const final = { ...initial, type: 'social_media', status: 'completed', assignee_ids: [], post_date: '2026-09-15' };
  assert.deepEqual(upsertTaskWithRelations([initial], final, { include: task => task.type !== 'social_media' }), []);
  const calendar = upsertTaskWithRelations([], final, { include: task => Boolean(task.post_date) });
  assert.equal(calendar[0].id, initial.id);
  assert.equal(calendar[0].status, 'completed');
  assert.deepEqual(calendar[0].assignee_ids, []);
});

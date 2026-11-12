import test from 'node:test';
import assert from 'node:assert/strict';
import { createTaskSaveGuard } from '../src/lib/taskSaveGuard.js';

const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};

test('select then immediate save cannot write either the old or unvalidated status', () => {
  const guard = createTaskSaveGuard('alteração');
  const token = guard.beginValidation('approve');
  assert.equal(guard.beginSave('alteração'), false);
  assert.equal(guard.beginSave('approve'), false);
  assert.equal(guard.finishValidation(token), true);
  assert.equal(guard.beginSave('alteração'), false);
  assert.equal(guard.beginSave('approve'), true);
});

test('latest choice wins when two real promises resolve in reverse order', async () => {
  const guard = createTaskSaveGuard('todo');
  const slow = deferred();
  const fast = deferred();
  const earlier = guard.beginValidation('review');
  const earlierResult = slow.promise.then(() => guard.finishValidation(earlier, 'Regra antiga rejeitou'));
  const latest = guard.beginValidation('josias');
  const latestResult = fast.promise.then(() => guard.finishValidation(latest));
  fast.resolve();
  assert.equal(await latestResult, true);
  slow.resolve();
  assert.equal(await earlierResult, false);
  assert.equal(guard.snapshot().status, 'josias');
  assert.equal(guard.snapshot().error, '');
  assert.equal(guard.beginSave('josias'), true);
});

test('an older successful request cannot unlock the latest rejected selection', () => {
  const guard = createTaskSaveGuard('todo');
  const first = guard.beginValidation('production');
  const last = guard.beginValidation('review');
  guard.finishValidation(last, 'Conclua o roteiro.');
  assert.equal(guard.finishValidation(first), false);
  assert.equal(guard.snapshot().status, 'review');
  assert.equal(guard.beginSave('production'), false);
  assert.equal(guard.beginSave('review'), false);
});

test('failed validation retains selection and can retry without resetting other form data', () => {
  const form = { title: 'Minha tarefa', client_id: 'client-1', status: 'todo', description: 'Texto digitado' };
  const guard = createTaskSaveGuard(form.status);
  form.status = 'review';
  guard.finishValidation(guard.beginValidation(form.status), 'Falha de rede');
  assert.equal(guard.snapshot().status, 'review');
  assert.equal(guard.beginSave(form.status), false);
  guard.finishValidation(guard.beginValidation(form.status));
  assert.equal(guard.beginSave(form.status), true);
  assert.deepEqual(form, { title: 'Minha tarefa', client_id: 'client-1', status: 'review', description: 'Texto digitado' });
});

test('double save is blocked and a failed save can be retried', () => {
  const guard = createTaskSaveGuard('todo');
  assert.equal(guard.beginSave('todo'), true);
  assert.equal(guard.beginSave('todo'), false);
  assert.equal(guard.beginValidation('review'), null);
  guard.finishSave();
  assert.equal(guard.beginSave('todo'), true);
});

test('unmounted or superseded form ignores pending validation completion', () => {
  const guard = createTaskSaveGuard('todo');
  const token = guard.beginValidation('review');
  guard.invalidate();
  assert.equal(guard.finishValidation(token), false);
});

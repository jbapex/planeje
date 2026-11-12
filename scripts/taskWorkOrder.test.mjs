import test from 'node:test';
import assert from 'node:assert/strict';
import { getTaskDueState, sortTasksByWorkOrder } from '../src/lib/taskUrgency.js';

const now = new Date(2026, 8, 16, 12);
const delivered = { status: 'review', due_date: '2026-09-10', production_delivered_at: '2026-09-15T10:00:00Z' };

test('upcoming posting takes priority even while production is still open', () => {
  const due = getTaskDueState({ status: 'production', due_date: '2026-09-30', post_date: '2026-09-17' }, { now });
  assert.equal(due.deadlineKind, 'publication');
  assert.equal(due.tone, 'soon');
  assert.match(due.label, /^Postagem · Amanhã/);
  assert.equal(getTaskDueState({ status: 'production', post_date: '2026-09-17' }, { now }).deadlineKind, 'publication');
});

test('finished production stops accumulating delay; stage honors its actual hour', () => {
  const future = getTaskDueState({ ...delivered, stage_due_at: new Date(2026, 8, 16, 16).toISOString() }, { now });
  assert.equal(future.tone, 'soon');
  assert.equal(future.isOverdue, false);
  assert.match(future.label, /Hoje.*16:00/);
  const late = getTaskDueState({ ...delivered, stage_due_at: new Date(2026, 8, 16, 10).toISOString() }, { now });
  assert.equal(late.tone, 'overdue');
  assert.equal(late.isOverdue, true);
  assert.match(late.label, /Etapa · Prazo vencido/);
});

test('stage dates use local timezone, including a UTC date on the following day', () => {
  const date = new Date(2026, 8, 16, 23);
  const due = getTaskDueState({ ...delivered, stage_due_at: date.toISOString() }, { now });
  assert.equal(due.days, 0);
  assert.match(due.label, /16\/09\/2026.*23:00/);
});

test('real stage delay precedes work due today; same-day stages sort by hour', () => {
  const ordered = sortTasksByWorkOrder([
    { id: 'afternoon', ...delivered, priority: 'urgent', stage_due_at: new Date(2026, 8, 16, 16).toISOString() },
    { id: 'early', ...delivered, priority: 'low', stage_due_at: new Date(2026, 8, 16, 13).toISOString() },
    { id: 'today', status: 'production', due_date: '2026-09-16', priority: 'urgent' },
    { id: 'late-stage', ...delivered, stage_due_at: new Date(2026, 8, 16, 11).toISOString() },
    { id: 'closed', ...delivered, status: 'published', stage_due_at: new Date(2026, 8, 14, 11).toISOString() },
  ], { now }).map(task => task.id);
  assert.deepEqual(ordered, ['late-stage', 'today', 'early', 'afternoon', 'closed']);
});

test('old production date is ignored after delivery and terminal tasks have no active delay', () => {
  const noDeadline = getTaskDueState(delivered, { now });
  assert.equal(noDeadline.tone, 'none');
  assert.match(noDeadline.label, /^Material entregue/);
  const closed = getTaskDueState({ ...delivered, status: 'published', post_date: '2026-09-01' }, { now });
  assert.equal(closed.tone, 'none');
  assert.equal(closed.isOverdue, false);
});

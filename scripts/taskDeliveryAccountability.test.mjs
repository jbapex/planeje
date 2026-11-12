import assert from 'node:assert/strict';
import test from 'node:test';
import {
  hasDeliveryProof,
  isProductionLate,
  isStageLate,
  needsStageDelayJustification,
  needsProductionDelayJustification,
  productionDelayDays,
  stageDelayDays,
} from '../src/lib/taskDeliveryAccountability.js';

const now = new Date(2026, 8, 16, 12);

test('open production continues late until a proven delivery exists', () => {
  const task = { due_date: '2026-09-14', production_delivered_at: null };
  assert.equal(isProductionLate(task, now), true);
  assert.equal(productionDelayDays(task, now), 2);
  assert.equal(needsProductionDelayJustification(task, [], now), true);
});

test('delivery time decides whether a finished production was late', () => {
  assert.equal(isProductionLate({ due_date: '2026-09-14', production_delivered_at: '2026-09-13T18:00:00Z' }, now), false);
  assert.equal(isProductionLate({ due_date: '2026-09-14', production_delivered_at: '2026-09-16T11:00:00Z' }, now), true);
});

test('justification is matched to the deadline occurrence', () => {
  const task = { due_date: '2026-09-14', production_delivered_at: null };
  assert.equal(needsProductionDelayJustification(task, [{ deadline_kind: 'production', due_on: '2026-09-13' }], now), true);
  assert.equal(needsProductionDelayJustification(task, [{ deadline_kind: 'production', due_on: '2026-09-14' }], now), false);
});

test('proof comes from the locked delivery record or a current attachment', () => {
  assert.equal(hasDeliveryProof({}, 0), false);
  assert.equal(hasDeliveryProof({}, 1), true);
  assert.equal(hasDeliveryProof({ production_delivery_attachment_id: 'proof' }, 0), true);
});

test('a delivered material can be late in its current stage', () => {
  const task = {
    production_delivered_at: '2026-09-14T10:00:00Z',
    stage_due_at: '2026-09-15T12:00:00Z',
    workflow_stage_key: 'review',
  };
  assert.equal(isStageLate(task, now), true);
  assert.equal(stageDelayDays(task, now), 1);
  assert.equal(needsStageDelayJustification(task, [], now), true);
  assert.equal(needsStageDelayJustification(task, [{
    deadline_kind: 'stage',
    due_on: '2026-09-15',
    workflow_stage_key: 'review',
  }], now), false);
});

test('a justification for another stage does not clear the current delay', () => {
  const task = {
    production_delivered_at: '2026-09-14T10:00:00Z',
    stage_due_at: '2026-09-15T12:00:00Z',
    workflow_stage_key: 'validation',
  };
  assert.equal(needsStageDelayJustification(task, [{
    deadline_kind: 'stage',
    due_on: '2026-09-15',
    workflow_stage_key: 'review',
  }], now), true);
});

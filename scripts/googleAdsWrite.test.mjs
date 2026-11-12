import assert from 'node:assert/strict';
import { googleAdsWritePlan, parseGoogleBudgetReais } from '../src/lib/googleAdsWrite.js';

const customerId = '1234567890';
const budget = `customers/${customerId}/campaignBudgets/55`;

assert.equal(parseGoogleBudgetReais('80,50'), 80.5);
assert.equal(parseGoogleBudgetReais('1.200,00'), 1200);
assert.equal(parseGoogleBudgetReais('0,50'), 0.5);

const pause = googleAdsWritePlan({
  kind: 'campaign-status',
  customerId,
  campaignId: '99',
  status: 'PAUSED',
  name: 'Noivas',
});
assert.equal(pause.valid, true);
assert.equal(pause.payload.status, 'PAUSED');
assert.match(pause.detail, /Noivas/);

const shared = googleAdsWritePlan({
  kind: 'campaign-budget',
  customerId,
  budgetResource: budget,
  budgetReais: '120,00',
  budgetShared: true,
  name: 'Noivas',
});
assert.equal(shared.valid, true);
assert.equal(shared.payload.amountMicros, '120000000');
assert.match(shared.detail, /compartilhado/);

const tiny = googleAdsWritePlan({
  kind: 'campaign-budget',
  customerId,
  budgetResource: budget,
  budgetReais: '0,40',
});
assert.equal(tiny.valid, false);

const foreign = googleAdsWritePlan({
  kind: 'campaign-budget',
  customerId,
  budgetResource: 'customers/999/campaignBudgets/55',
  budgetReais: '80',
});
assert.equal(foreign.valid, false);

const keyword = googleAdsWritePlan({
  kind: 'keyword-status',
  customerId,
  adGroupId: '7',
  criterionId: '8',
  status: 'ENABLED',
  name: 'vestido de noiva',
});
assert.equal(keyword.valid, true);
assert.equal(keyword.payload.criterionId, '8');

const removed = googleAdsWritePlan({
  kind: 'campaign-status',
  customerId,
  campaignId: '1',
  status: 'REMOVED',
});
assert.equal(removed.valid, false);

console.log('googleAdsWrite.test.mjs: ok');

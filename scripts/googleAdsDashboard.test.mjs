import { test } from 'node:test';
import assert from 'node:assert/strict';
import { googleAdsMonthRange, googleDashboardBar, loadGoogleDashboardForClient, mergeGoogleDashboard } from '../src/lib/googleAdsDashboard.js';
import { groupGoogleAdsLinksByClient } from '../src/lib/googleAdsLinkedAccounts.js';

test('Google month range is calendar month to today and never invents extra days', () => {
  const range = googleAdsMonthRange(new Date(2026, 8, 21));
  assert.equal(range.since, '2026-09-01');
  assert.equal(range.until, '2026-09-21');
  assert.equal(range.daysInMonth, 30);
});

test('Google dashboard bar uses enabled daily budget as month cap, not a fake zero', () => {
  const bar = googleDashboardBar(
    [
      { status: 'ENABLED', dailyBudget: 20, spend: 400 },
      { status: 'PAUSED', dailyBudget: 50, spend: 10 },
    ],
    30
  );
  assert.equal(bar.spend, 410);
  assert.equal(bar.limite, 600);
  assert.equal(bar.unlimited, false);
  const unlimited = googleDashboardBar([{ status: 'ENABLED', spend: 90 }], 30);
  assert.equal(unlimited.spend, 90);
  assert.equal(unlimited.limite, 0);
  assert.equal(unlimited.unlimited, true);
});

test('failed Google read keeps the previous spend', () => {
  const previous = { linked: true, spend: 120, limite: 600, unlimited: false };
  assert.equal(mergeGoogleDashboard(previous, { linked: true, error: 'timeout' }).spend, 120);
  assert.equal(groupGoogleAdsLinksByClient([
    { cliente_id: 'c1', google_customer_id: '111-222', google_customer_name: 'A' },
    { cliente_id: 'c1', google_customer_id: '111222', google_customer_name: 'A' },
  ]).c1.length, 1);
});

test('Google dashboard fetch sums linked accounts and keeps the other when one fails', async () => {
  const bar = await loadGoogleDashboardForClient(
    [{ id: '1' }, { id: '2' }],
    { since: '2026-09-01', until: '2026-09-21', daysInMonth: 30 },
    async (id) => {
      if (id === '2') throw new Error('rate');
      return { campaigns: [{ status: 'ENABLED', dailyBudget: 10, spend: 80 }] };
    }
  );
  assert.equal(bar.spend, 80);
  assert.equal(bar.limite, 300);
  assert.equal(bar.error, '');
  const failed = await loadGoogleDashboardForClient(
    [{ id: 'x' }],
    { since: '2026-09-01', until: '2026-09-21', daysInMonth: 30 },
    async () => {
      throw new Error('timeout');
    }
  );
  assert.equal(failed.error, 'timeout');
  assert.equal(failed.linked, true);
});

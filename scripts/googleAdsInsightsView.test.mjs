import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  accountBalanceFromBudgets,
  addOneDay,
  campaignRates,
  dailyBarHeight,
  fillDailySeries,
  googleAdsAdLabel,
  googleAdsChannelLabel,
  googleAdsDailyHover,
  googleAdsKeywordMatchLabel,
  googleAdsKeywordsEmptyCopy,
  googleAdsStatusLabel,
  mergeGoogleAdsCampaigns,
  microsToMoney,
} from '../src/lib/googleAdsInsightsView.js';

test('account remaining balance uses approved finite budgets and never fakes zero as saldo', () => {
  assert.deepEqual(accountBalanceFromBudgets([]), {
    available: false,
    unlimited: false,
    remaining: null,
    limit: null,
    served: null,
  });
  assert.equal(microsToMoney(1_500_000), 1.5);
  const finite = accountBalanceFromBudgets([
    { status: 'APPROVED', limitMicros: 5_000_000_000, servedMicros: 1_200_000_000, limitType: 'FINITE' },
  ]);
  assert.equal(finite.available, true);
  assert.equal(finite.remaining, 3800);
  assert.equal(finite.limit, 5000);
  const unlimited = accountBalanceFromBudgets([
    { status: 'APPROVED', limitType: 'INFINITE', servedMicros: 900_000_000 },
  ]);
  assert.equal(unlimited.unlimited, true);
  assert.equal(unlimited.remaining, null);
});

test('campaign extras keep daily budget while rates come from period totals', () => {
  assert.equal(googleAdsChannelLabel('PERFORMANCE_MAX'), 'Performance Max');
  assert.equal(googleAdsStatusLabel('ENABLED', 'ELIGIBLE'), 'No ar');
  const rows = mergeGoogleAdsCampaigns(
    [{ id: '1', name: 'PMax', status: 'ENABLED', channelType: 'PERFORMANCE_MAX', dailyBudget: 80 }],
    [{ id: '1', impressions: 1000, clicks: 50, spend: 40, conversions: 4, conversionValue: 200 }]
  );
  assert.equal(rows[0].dailyBudget, 80);
  assert.equal(rows[0].spend, 40);
  const rates = campaignRates(rows[0]);
  assert.equal(rates.ctr, 5);
  assert.equal(rates.cpc, 0.8);
  assert.equal(rates.costPerConversion, 10);
});

test('daily series fills missing days and never invents spend', () => {
  assert.equal(addOneDay('2026-09-30'), '2026-10-01');
  const series = fillDailySeries('2026-09-01', '2026-09-03', [
    { date: '2026-09-01', spend: 10, clicks: 2 },
    { date: '2026-09-03', spend: 5, clicks: 1 },
  ]);
  assert.equal(series.length, 3);
  assert.equal(series[1].date, '2026-09-02');
  assert.equal(series[1].spend, 0);
  assert.equal(series[0].spend, 10);
  assert.equal(dailyBarHeight(10, 10), 100);
  assert.equal(dailyBarHeight(0, 10), 4);
  const tip = googleAdsDailyHover({ date: '2026-09-21', spend: 45.2, clicks: 12, conversions: 2 });
  assert.equal(tip.heading, '21/09/2026');
  assert.equal(tip.spend, 45.2);
  assert.equal(tip.clicks, 12);
});

test('ad and keyword labels stay in Portuguese with honest empties', () => {
  assert.equal(googleAdsKeywordMatchLabel('EXACT'), 'Exata');
  assert.equal(googleAdsKeywordMatchLabel('PHRASE'), 'Frase');
  assert.equal(googleAdsKeywordMatchLabel('BROAD'), 'Ampla');
  assert.equal(googleAdsAdLabel({ type: 'RESPONSIVE_SEARCH_AD', headlines: ['A', 'B'] }), 'A · B');
  assert.match(googleAdsKeywordsEmptyCopy('PERFORMANCE_MAX'), /não usa palavras-chave/i);
  assert.match(googleAdsKeywordsEmptyCopy('SMART'), /não lista palavras-chave/i);
});

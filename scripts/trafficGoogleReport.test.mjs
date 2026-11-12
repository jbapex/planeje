import assert from 'node:assert/strict';
import {
  buildGoogleReport,
  collectGoogleEvidence,
  googleCampaignPages,
  isGoogleMetricVisible,
  normalizeVisibleGoogleMetrics,
  toggleVisibleGoogleMetric,
} from '../src/lib/trafficGoogleReport.js';

const range = { since: '2026-10-01', until: '2026-10-31', month: 10, year: 2026 };
const report = buildGoogleReport({
  clientName: 'Sul Veículos',
  range,
  accounts: [
    {
      id: '111',
      name: 'Sul',
      daily: [
        { date: '2026-10-02', spend: 80, clicks: 20, impressions: 400, conversions: 1 },
        { date: '2026-10-01', spend: 120, clicks: 30, impressions: 600, conversions: 3 },
      ],
      campaigns: [
        { id: 'a', name: 'Busca', channelType: 'SEARCH', impressions: 1000, clicks: 50, spend: 200, conversions: 4, conversionValue: 800 },
        { id: 'b', name: 'Pausada', impressions: 0, clicks: 0, spend: 0, conversions: 0 },
      ],
    },
  ],
});

assert.equal(report.channel, 'google');
assert.equal(report.campaigns.length, 1);
assert.equal(report.campaigns[0].name, 'Busca');
assert.equal(report.campaigns[0].kind, 'Pesquisa');
assert.equal(report.daily[0].date, '2026-10-01');
assert.equal(report.daily[1].spend, 80);
assert.equal(report.totals.clicks, 50);
assert.equal(report.totals.ctr, 5);
assert.equal(report.totals.cost, 50);
assert.equal(report.totals.cpc, 4);
assert.equal(report.totals.value, 800);
assert.equal(report.totals.roas, 4);
assert.equal(report.labels.title, 'outubro de 2026');

const two = buildGoogleReport({
  clientName: 'Sul',
  range,
  accounts: [
    { id: '1', name: 'Conta A', campaigns: [{ id: 'a', name: 'Busca', impressions: 10, clicks: 1, spend: 5, conversions: 0 }] },
    { id: '2', name: 'Conta B', campaigns: [{ id: 'a', name: 'Busca', impressions: 20, clicks: 2, spend: 8, conversions: 1 }] },
  ],
});
assert.equal(two.campaigns[0].name, 'Busca · Conta B');
assert.equal(googleCampaignPages(two.campaigns, 1).length, 2);
assert.equal(isGoogleMetricVisible(['clicks'], 'clicks'), true);
assert.deepEqual(toggleVisibleGoogleMetric(['clicks', 'spend'], 'clicks', false), ['spend']);
assert.equal(toggleVisibleGoogleMetric(['clicks'], 'clicks', false).includes('impressions'), true);
assert.equal(normalizeVisibleGoogleMetrics(['impressions', 'clicks', 'ctr', 'spend', 'conversions', 'cost']).includes('cpc'), true);
assert.equal(normalizeVisibleGoogleMetrics(['clicks']).includes('cpc'), false);

const evidence = collectGoogleEvidence([{
  keywords: [
    { text: 'noiva', matchType: 'PHRASE', impressions: 100, clicks: 10, spend: 20, conversions: 1 },
    { text: 'Noiva', matchType: 'PHRASE', impressions: 40, clicks: 2, spend: 4, conversions: 0 },
    { text: 'vazia', matchType: 'BROAD', impressions: 0, clicks: 0, spend: 0, conversions: 0 },
  ],
  ads: [
    { id: '1', headlines: ['Vestido pronto'], adGroupName: 'Busca', impressions: 80, clicks: 8, spend: 16, conversions: 1 },
    { id: '2', name: '', headlines: [], impressions: 0, clicks: 0, spend: 0, conversions: 0 },
  ],
  adGroups: [{ name: 'Noivas', impressions: 90, clicks: 9, spend: 18, conversions: 1 }],
  assetGroups: [{ name: 'PMax festa', impressions: 40, clicks: 3, spend: 30, conversions: 0 }],
}]);
assert.equal(evidence.keywords.length, 1);
assert.equal(evidence.keywords[0].clicks, 12);
assert.equal(evidence.keywords[0].match, 'Frase');
assert.equal(evidence.ads.length, 1);
assert.equal(evidence.ads[0].title, 'Vestido pronto');
assert.equal(evidence.groups[0].kind, 'Performance Max');
assert.equal(evidence.groups[1].name, 'Noivas');

console.log('google report ok');

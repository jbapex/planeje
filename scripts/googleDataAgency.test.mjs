import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  GOOGLE_DATA_SCOPE,
  buildGoogleDataAuthUrl,
  extractOauthCodeFromInput,
  summarizeGoogleDataConnection,
} from '../src/lib/googleDataAgency.js';
import {
  ga4PropertyResource,
  googleDataProductErrorCopy,
  analyticsCampaignLabel,
  analyticsDelta,
  formatSignedPercent,
  mapAnalyticsReport,
  mapBusinessBoard,
  mapBusinessPerformance,
  mapTagManagerInventory,
  mapTagManagerOverview,
  parseGa4PropertyId,
} from '../src/lib/googleDataInsightsView.js';

test('auth URL asks Analytics, Meu Negócio and Tag Manager and never invents a client', () => {
  assert.equal(buildGoogleDataAuthUrl(''), '');
  const url = buildGoogleDataAuthUrl('123.apps.googleusercontent.com');
  assert.match(url, /accounts\.google\.com/);
  assert.match(url, /analytics\.readonly/);
  assert.match(url, /business\.manage/);
  assert.match(url, /tagmanager\.readonly/);
  assert.equal(GOOGLE_DATA_SCOPE.includes('adwords'), false);
  assert.equal(extractOauthCodeFromInput('http://127.0.0.1:8080/?code=4/abc_def'), '4/abc_def');
});

test('connection summary is ready when any product answers', () => {
  const none = summarizeGoogleDataConnection({ connected: false, error: { message: 'Falta token' } });
  assert.equal(none.readyToLink, false);
  assert.match(none.error, /token|Autorize/i);
  const some = summarizeGoogleDataConnection({
    connected: true,
    email: 'agencia@jbapex.com',
    analytics: { ok: true },
    business: { ok: false, error: '403' },
    tagmanager: { ok: false },
  });
  assert.equal(some.readyToLink, true);
  assert.equal(some.email, 'agencia@jbapex.com');
  assert.equal(some.analyticsOk, true);
  assert.equal(some.businessOk, false);
});

test('GA4 ids, analytics ranking and GMB numbers never fake zero as unlimited', () => {
  assert.equal(parseGa4PropertyId('properties/123456789'), '123456789');
  assert.equal(ga4PropertyResource('123456789'), 'properties/123456789');
  assert.equal(parseGa4PropertyId('xyz'), '');
  const report = mapAnalyticsReport({
    totals: { sessions: '90', users: '40', conversions: '3' },
    rows: [
      { channel: 'Paid Search', sessions: 10 },
      { channel: 'Direct', sessions: 80 },
    ],
  });
  assert.equal(report.sessions, 90);
  assert.equal(report.channels[0].channel, 'Direct');
  const biz = mapBusinessPerformance({ totals: { calls: '4', website: 2 } });
  assert.equal(biz.calls, 4);
  assert.equal(biz.impressions, 0);
  const gtm = mapTagManagerOverview({ publicId: 'GTM-XXXX', tags: '12' });
  assert.equal(gtm.publicId, 'GTM-XXXX');
  assert.equal(gtm.tags, 12);
  assert.match(googleDataProductErrorCopy('Google Analytics Data API has not been used'), /Biblioteca/);
});

test('analytics report keeps the period series and tag inventory stays beside the counts', () => {
  const report = mapAnalyticsReport({
    since: '2026-09-01',
    until: '2026-09-03',
    totals: { sessions: 10, users: 8, newUsers: 3, engagementRate: 0.5, averageSessionDuration: 65, conversions: 2 },
    daily: [{ date: '2026-09-01', sessions: 4, users: 3, conversions: 1 }],
    channels: [{ channel: 'Paid Social', sessions: 10, users: 8, conversions: 2, engagementRate: 0.5 }],
    pages: [{ page: '/', sessions: 10, users: 8, conversions: 1 }],
    devices: [{ device: 'mobile', sessions: 7, users: 6, conversions: 1 }],
    events: [{ event: 'generate_lead', count: 4, users: 3 }],
  });
  assert.equal(report.daily.length, 3);
  assert.equal(report.daily[1].sessions, 0);
  assert.equal(report.channels[0].channel, 'Paid Social');
  assert.equal(report.pages[0].page, '/');
  const inventory = mapTagManagerInventory({
    publicId: 'GTM-PPPWRPJP',
    tags: 1,
    triggers: 1,
    variables: 1,
    tagList: [{ name: 'GA4 evento', type: 'gaawe', paused: false, fires: ['Formulário'] }],
    triggerList: [{ name: 'Formulário', type: 'formSubmission' }],
    variableList: [{ name: 'email', type: 'v' }],
  });
  assert.equal(inventory.tags, 1);
  assert.equal(inventory.tagList[0].typeLabel, 'GA4 · evento');
  assert.equal(inventory.triggerList[0].typeLabel, 'Envio de formulário');
  assert.equal(inventory.variableList[0].typeLabel, 'Camada de dados');
  assert.equal(inventory.activeTags, 1);
  const compared = mapAnalyticsReport({
    totals: { sessions: 120, users: 80, conversions: 10 },
    previous: { since: '2026-08-01', until: '2026-08-31', sessions: 100, users: 80, conversions: 0 },
    campaigns: [{ campaign: '(not set)', sessions: 12, users: 9, conversions: 1 }, { campaign: 'Noivas', sessions: 40, users: 30, conversions: 4 }],
  });
  assert.equal(compared.previous.sessions, 100);
  assert.equal(analyticsDelta(compared.sessions, compared.previous.sessions), 20);
  assert.equal(formatSignedPercent(20), '+20%');
  assert.equal(analyticsDelta(compared.conversions, compared.previous.conversions), null);
  assert.equal(compared.campaigns[0].campaign, 'Noivas');
  assert.equal(analyticsCampaignLabel('(not set)'), 'Não informado');
  const board = mapBusinessBoard({
    totals: { impressions: 3, calls: 1 },
    daily: [{ date: '2026-09-02', impressions: 2, maps: 0, calls: 1, directions: 0, website: 0 }],
  });
  assert.equal(board.impressions, 3);
  assert.equal(board.daily[0].calls, 1);
  const detailed = mapTagManagerInventory({
    tags: 1,
    tagList: [{ name: 'Base', type: 'googtag', measurementId: 'G-ABC', snippet: 'gtag', notes: ['html curto'] }],
    variableList: [{ name: 'GA4 ID', type: 'c', value: 'G-ABC' }],
  });
  assert.equal(detailed.tagList[0].measurementId, 'G-ABC');
  assert.equal(detailed.variableList[0].value, 'G-ABC');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyAdsetPick,
  applyCampaignPick,
  attachCatalogIds,
  catalogFromCampaigns,
  catalogFromGoogleAds,
  catalogsChanged,
  deliveryLabel,
  matchName,
  normalizeSheetName,
  rankSuggestions,
} from '../src/lib/trafficSheetCatalog.js';

test('Google Ads ENABLED campaigns become live sheet suggestions with ad groups as conjuntos', () => {
  const google = catalogFromGoogleAds(
    [{ id: '88', name: 'Search orçamentos', status: 'ENABLED' }],
    [{ id: 'g1', name: 'Grupo SP', status: 'ENABLED', campaignId: '88', campaignName: 'Search orçamentos' }],
  );
  assert.equal(google[0].status, 'ACTIVE');
  assert.equal(google[0].adsets[0].name, 'Grupo SP');
  assert.equal(google[0].adsets[0].status, 'ACTIVE');
  assert.equal(deliveryLabel(google[0].status), 'no ar');
});

const catalog = catalogFromCampaigns([
  {
    id: '111',
    name: 'CA - Ana Júlia Noivas',
    effective_status: 'ACTIVE',
    adsets: [
      { id: 'a1', name: 'Lookalike 1%', status: 'ACTIVE', campaign_id: '111' },
      { id: 'a2', name: 'Remarketing', status: 'PAUSED', campaign_id: '111' },
    ],
  },
  {
    id: '222',
    name: 'CA - Ana Julia Noivas',
    status: 'PAUSED',
    adsets: [{ id: 'b1', name: 'Lookalike 1%', status: 'ACTIVE', campaign_id: '222' }],
  },
  {
    id: '333',
    name: 'Promo setembro',
    status: 'ACTIVE',
    adsets: [{ id: 'c1', name: 'Conjunto A', status: 'ACTIVE', campaign_id: '333' }],
  },
  { id: '444', name: 'Antiga', status: 'ARCHIVED', adsets: [] },
]);

test('normalizes typed names and matches the official Meta spelling', () => {
  assert.equal(normalizeSheetName('  Promo   setembro '), 'promo setembro');
  const match = matchName('promo setembro', catalog);
  assert.equal(match.status, 'exact');
  assert.equal(match.exact.id, '333');
  assert.equal(match.exact.name, 'Promo setembro');
  assert.equal(deliveryLabel('ACTIVE'), 'no ar');
  assert.equal(matchName('ca - ana julia noivas', catalog).status, 'ambiguous');
});

test('ambiguous official names stay unpicked so the analyst chooses', () => {
  const dupes = catalogFromCampaigns([
    { id: '1', name: 'Vendas', status: 'ACTIVE', adsets: [] },
    { id: '2', name: 'Vendas', status: 'PAUSED', adsets: [] },
  ]);
  const match = matchName('vendas', dupes);
  assert.equal(match.status, 'ambiguous');
  assert.equal(match.exact, null);
  assert.equal(match.suggestions.length, 2);
});

test('unknown typed names stay free-text and do not invent an id', () => {
  const rows = attachCatalogIds([{ campaign_name: 'Campanha nova da semana', adset_name: '', campaign_id: '', adset_id: '' }], catalog);
  assert.equal(rows[0].campaign_id, '');
  assert.equal(rows[0].campaign_name, 'Campanha nova da semana');
  assert.equal(matchName('Campanha nova da semana', catalog).status, 'unknown');
});

test('paste of an existing name copies official name and ids without numbers', () => {
  const rows = attachCatalogIds([{ campaign_name: 'promo setembro', adset_name: 'conjunto a', spend: '120' }], catalog);
  assert.equal(rows[0].campaign_name, 'Promo setembro');
  assert.equal(rows[0].campaign_id, '333');
  assert.equal(rows[0].adset_name, 'Conjunto A');
  assert.equal(rows[0].adset_id, 'c1');
  assert.equal(rows[0].spend, '120');
});

test('picking a campaign clears a conjunto that does not belong to it', () => {
  const next = applyCampaignPick({ campaign_name: 'x', adset_name: 'Outro', adset_id: 'z9' }, catalog[2]);
  assert.equal(next.campaign_id, '333');
  assert.equal(next.adset_id, '');
  assert.equal(next.adset_name, '');
});

test('picking a conjunto also copies the parent campaign name', () => {
  const adset = { ...catalog[2].adsets[0], campaign_name: catalog[2].name };
  const next = applyAdsetPick({ campaign_name: '' }, adset, catalog[2]);
  assert.equal(next.campaign_name, 'Promo setembro');
  assert.equal(next.adset_name, 'Conjunto A');
});

test('empty suggestions prefer live campaigns and hide archived until searched', () => {
  const idle = rankSuggestions('', catalog);
  assert.ok(idle.some((item) => item.id === '111'));
  assert.ok(!idle.some((item) => item.id === '444'));
  assert.equal(rankSuggestions('antiga', catalog)[0].id, '444');
});
test('short query CA prefers the official prefix over the word campanha', () => {
  const withPrefix = catalogFromCampaigns([
    { id: 'c1', name: 'Campanha teste agosto', status: 'PAUSED', adsets: [] },
    { id: 'c2', name: 'CA - Leads WhatsApp', status: 'ACTIVE', adsets: [] },
  ]);
  assert.equal(rankSuggestions('ca', withPrefix)[0].id, 'c2');
});

test('overtyping an official name drops the stale Meta id', () => {
  const rows = attachCatalogIds([{ campaign_name: 'Nome livre', campaign_id: '333', adset_id: 'c1' }], catalog);
  assert.equal(rows[0].campaign_id, '');
  assert.equal(rows[0].adset_id, '');
  assert.equal(catalogsChanged([{ campaign_id: '333' }], [{ campaign_id: '' }]), true);
});

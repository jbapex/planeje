import assert from 'node:assert/strict';
import {
  canActivateManualMeta,
  emptyMetaConnection,
  formatMetaTokenSourceLabel,
  groupMetaTokenSources,
  hydrateConnectionFromCliente,
  metaManualSetupSteps,
  metaManualStatusLabel,
  parseMetaAdAccountIds,
  parseMetaConnection,
  pixelSelectPlaceholder,
  resolveManualMetaDraft,
  reuseMetaCredentialPatch,
  tokenLast4,
  withSavedManualAsset,
  assetsForSelectedAccounts,
} from '../src/lib/rastreamentoMetaManual.js';

assert.deepEqual(parseMetaAdAccountIds('1234567890, act_9876543210; ACT_111'), [
  'act_1234567890',
  'act_9876543210',
  'act_111',
]);
assert.deepEqual(parseMetaAdAccountIds('lixo  act_  '), []);
assert.equal(tokenLast4('abcdefghijklmnopqrstuvwxyz'), 'wxyz');
assert.equal(parseMetaConnection(null).status, 'not_connected');
assert.equal(parseMetaConnection({ status: 'active', pixelId: ' 9 ' }).pixelId, '9');

const hydrated = hydrateConnectionFromCliente({
  connection: {},
  businessId: '111',
  hasToken: true,
  channels: [{ meta_dataset_id: '624', meta_page_id: '159' }],
});
assert.equal(hydrated.status, 'draft');
assert.equal(hydrated.businessId, '111');
assert.equal(hydrated.pixelId, '624');
assert.equal(hydrated.pageId, '159');

const draft = resolveManualMetaDraft({
  credentialLabel: '',
  businessLookupId: '222',
  selectedAccountIds: ['act_1'],
  directAccountIds: '3',
  directPixelId: '90',
  pageId: '80',
});
assert.equal(draft.credentialLabel, 'Token BM do cliente');
assert.equal(draft.businessId, '222');
assert.deepEqual(draft.adAccountIds, ['act_1', 'act_3']);
assert.equal(draft.pixelId, '90');
assert.equal(draft.pageId, '80');

assert.equal(
  canActivateManualMeta({
    hasToken: true,
    businessId: '1',
    pixelId: '2',
    pageId: '3',
    adAccountIds: ['act_1'],
  }),
  true,
);
assert.equal(
  canActivateManualMeta({
    hasToken: true,
    businessId: '1',
    pixelId: '2',
    pageId: '3',
    adAccountIds: [],
  }),
  false,
);

const steps = metaManualSetupSteps({
  hasToken: true,
  businessId: '',
  accountCount: 0,
  destinationReady: false,
});
assert.equal(steps[0].done, true);
assert.equal(steps[1].active, true);
assert.equal(metaManualStatusLabel('active'), 'Ativa');
assert.equal(emptyMetaConnection().mode, 'manual');

const grouped = groupMetaTokenSources([
  {
    id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    nome: 'Impacto Noivas',
    meta_ctwa_business_id: '111',
    meta_ctwa_token_updated_at: '2026-09-20T12:00:00Z',
    meta_rastreamento: {
      credentialLabel: 'Token BM do cliente',
      tokenLast4: 'ZDZD',
      businessId: '111',
      businessName: 'APICE',
      pixelId: '624',
      pageId: '159',
      adAccountIds: ['act_1'],
    },
  },
  {
    id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    nome: 'Lali',
    meta_ctwa_token_updated_at: '2026-09-21T08:00:00Z',
    meta_rastreamento: {
      tokenLast4: 'ZDZD',
      businessId: '111',
      businessName: 'APICE',
    },
  },
  {
    id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
    nome: 'Sem token',
    meta_rastreamento: { status: 'not_connected' },
  },
]);
assert.equal(grouped.length, 1);
assert.equal(grouped[0].sourceClienteId, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
assert.equal(grouped[0].clientes.length, 2);
assert.match(formatMetaTokenSourceLabel(grouped[0]), /final ZDZD/);
assert.match(formatMetaTokenSourceLabel(grouped[0]), /e mais 1/);

const reused = reuseMetaCredentialPatch(
  {
    credentialLabel: 'Token BM do cliente',
    tokenLast4: 'ZDZD',
    userName: 'APICE Ads',
    businessId: '111',
    businessName: 'APICE',
    pixelId: '624',
    pageId: '159',
    adAccountIds: ['act_1'],
    adAccounts: [{ id: 'act_1', name: 'Impacto' }],
  },
  {},
);
assert.equal(reused.businessId, '111');
assert.equal(reused.businessName, 'APICE');
assert.equal(reused.tokenLast4, 'ZDZD');
assert.equal(reused.pixelId, '');
assert.equal(reused.pageId, '');
assert.deepEqual(reused.adAccountIds, []);
assert.equal(reused.status, 'draft');

const reusedKeepDest = reuseMetaCredentialPatch(
  { tokenLast4: 'ZDZD', businessId: '111', pixelId: '624' },
  { pixelId: '900', pageId: '800', businessId: '222', adAccountIds: ['act_9'] },
);
assert.equal(reusedKeepDest.pixelId, '900');
assert.equal(reusedKeepDest.pageId, '800');

const bmPixels = [
  { id: '102', name: 'Impacto Noivas', adAccountId: 'act_111' },
  { id: '624', name: 'Pixel de Impacto eventos', adAccountId: 'act_111' },
  { id: '900', name: 'Annah Dress', adAccountId: 'act_885' },
];
assert.deepEqual(assetsForSelectedAccounts(bmPixels, []), []);
assert.deepEqual(
  assetsForSelectedAccounts(bmPixels, ['act_885']).map((item) => item.id),
  ['900'],
);
assert.equal(pixelSelectPlaceholder(0), 'Marque a conta de anúncio');
assert.equal(withSavedManualAsset([{ id: '900', name: 'Annah' }], '900', 'x').length, 1);
assert.equal(withSavedManualAsset([], '900', 'Annah Dress')[0].name, 'Annah Dress');
assert.equal(reusedKeepDest.businessId, '222');
assert.deepEqual(reusedKeepDest.adAccountIds, ['act_9']);

console.log('PASS rastreamento meta manual');

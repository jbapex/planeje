import { test } from 'node:test';
import assert from 'node:assert/strict';
import { catalogAccountKey, metaCatalogAccountKey } from '../src/lib/trafficSheetCatalog.js';
import { googleAdsAccountsForPicker, googleAdsLinkedClientIds } from '../src/lib/googleAdsLinkedAccounts.js';

test('Google catalog keys stay separate from Meta account digits', () => {
  assert.equal(metaCatalogAccountKey('act_123'), '123');
  assert.equal(catalogAccountKey('act_123', 'meta'), '123');
  assert.equal(catalogAccountKey('123-456-7890', 'google'), 'google:1234567890');
});

test('Google Ads picker lists only linked customer ids', () => {
  const links = [
    { cliente_id: 'c1', google_customer_id: '111-222-3333', google_customer_name: 'Loja A' },
    { cliente_id: 'c1', google_customer_id: '1112223333', google_customer_name: 'Loja A' },
    { cliente_id: 'c2', google_customer_id: '999', google_customer_name: 'Loja B' },
  ];
  assert.deepEqual(googleAdsLinkedClientIds(links), ['c1', 'c2']);
  assert.deepEqual(googleAdsAccountsForPicker(links, 'all').map((row) => row.id), ['1112223333', '999']);
  assert.deepEqual(googleAdsAccountsForPicker(links, 'c2').map((row) => row.id), ['999']);
});

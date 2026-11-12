import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  explainMetaTokenError,
  permissionChecklist,
  previewSecret,
  summarizeInspect,
} from '../src/lib/metaAgencyToken.js';

test('preview hides the token body', () => {
  assert.equal(previewSecret(''), '');
  assert.equal(previewSecret('short'), '••••');
  assert.equal(previewSecret('EAABsbCS1iHg0TOKENVALUE9999'), 'EAABsb…9999');
});

test('missing token and expired token get usable copy', () => {
  assert.match(explainMetaTokenError({ code: 'TOKEN_NOT_FOUND', message: 'not found in Vault' }), /Nenhum token/);
  assert.match(explainMetaTokenError({ code: '190', message: 'Invalid OAuth access token' }), /vencido/);
  assert.match(explainMetaTokenError({ code: '200', message: 'ads_read permission' }), /atribua contas/);
});

test('checklist marks ads ready and posting still missing', () => {
  const rows = permissionChecklist(['ads_read', 'ads_management', 'read_insights', 'business_management', 'pages_show_list']);
  const ads = rows.find((row) => row.id === 'ads');
  const publish = rows.find((row) => row.id === 'publish');
  assert.equal(ads.ready, true);
  assert.equal(publish.ready, false);
  assert.ok(publish.missing.includes('instagram_content_publish'));
});

test('inspect summary never exposes page tokens', () => {
  const summary = summarizeInspect({
    connected: true,
    user: { id: '1', name: 'Agência' },
    permissions: [{ permission: 'ads_read', status: 'granted' }],
    adAccounts: [{ id: 'act_1', name: 'Conta' }],
    pages: [{ id: '10', name: 'Página', category: 'Agency' }],
    instagramAccounts: [{ id: '20', username: 'agencia' }],
  });
  assert.equal(summary.connected, true);
  assert.equal(summary.adAccounts.length, 1);
  assert.equal(summary.pages[0].name, 'Página');
  assert.equal(JSON.stringify(summary).includes('access_token'), false);
});

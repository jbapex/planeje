import assert from 'node:assert/strict';
import test from 'node:test';
import { clientHasPageAccess, editorKeysFromAllowedPages, allowedPagesValueToSave } from '../../src/lib/clientAllowedPages.js';

const profile = { role: 'cliente', cliente_id: 'client-a' };
test('CRM IA requires its own explicit page even when classic pages are unrestricted', () => {
  for (const allowed_pages of [null, undefined, {}, [], ['crm'], ['atendimento']]) {
    assert.equal(clientHasPageAccess({ ...profile, allowed_pages }, 'crm-ia'), false);
  }
  assert.equal(clientHasPageAccess({ ...profile, allowed_pages: ['crm-ia'] }, 'crm-ia'), true);
  assert.equal(clientHasPageAccess(profile, 'crm'), true);
  assert.equal(editorKeysFromAllowedPages(null, profile.cliente_id).includes('crm-ia'), false);
  const keys = [...editorKeysFromAllowedPages(null, profile.cliente_id), 'crm-ia'];
  assert.deepEqual(allowedPagesValueToSave(keys), keys);
});

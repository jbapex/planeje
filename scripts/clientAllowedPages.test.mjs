import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ATENDIMENTO_PAGE_KEY,
  CLIENT_PAGE_KEYS,
  CLIENT_PAGES,
  CLIENT_STANDARD_PAGE_KEYS,
  allowedPagesValueToSave,
  clientHasPageAccess,
  describeAllowedPages,
  editorKeysFromAllowedPages,
} from '../src/lib/clientAllowedPages.js';
import { hasAtendimentoPagePermission } from '../src/lib/atendimentoLojaAcesso.js';

const APICE = 'a2396b48-2d2f-4b4b-adfd-3a4043b320e6';
const OUTRA = '11111111-2222-3333-4444-555555555555';

assert.equal(ATENDIMENTO_PAGE_KEY, 'atendimento');
assert.ok(CLIENT_PAGE_KEYS.includes('atendimento'));
assert.equal(CLIENT_PAGES.find((page) => page.key === 'atendimento')?.label, 'Atendimento');
assert.equal(CLIENT_STANDARD_PAGE_KEYS.includes('atendimento'), false);

assert.equal(hasAtendimentoPagePermission(null, APICE), true);
assert.equal(hasAtendimentoPagePermission(undefined, APICE), true);
assert.equal(hasAtendimentoPagePermission(null, OUTRA), false);
assert.equal(hasAtendimentoPagePermission(['dashboard', 'crm'], APICE), false);
assert.equal(hasAtendimentoPagePermission(['dashboard', 'atendimento'], OUTRA), true);
assert.equal(hasAtendimentoPagePermission(['atendimento'], OUTRA), true);
assert.equal(hasAtendimentoPagePermission([], OUTRA), false);
assert.equal(hasAtendimentoPagePermission(null, OUTRA, true), true);
assert.equal(hasAtendimentoPagePermission(['atendimento'], APICE, false), false);

assert.deepEqual(editorKeysFromAllowedPages(null, OUTRA), CLIENT_STANDARD_PAGE_KEYS);
assert.ok(editorKeysFromAllowedPages(null, APICE).includes('atendimento'));
assert.ok(CLIENT_STANDARD_PAGE_KEYS.every((key) => editorKeysFromAllowedPages(null, APICE).includes(key)));
assert.deepEqual(editorKeysFromAllowedPages(['crm'], OUTRA), ['crm']);
assert.equal(editorKeysFromAllowedPages(['crm'], APICE).includes('atendimento'), false);

assert.equal(allowedPagesValueToSave(CLIENT_STANDARD_PAGE_KEYS), null);
assert.deepEqual(
  allowedPagesValueToSave([...CLIENT_STANDARD_PAGE_KEYS, 'atendimento']).sort(),
  [...CLIENT_STANDARD_PAGE_KEYS, 'atendimento'].sort()
);
assert.deepEqual(allowedPagesValueToSave(['dashboard', 'atendimento']), ['dashboard', 'atendimento']);

assert.equal(describeAllowedPages(null, OUTRA), 'Todas as páginas');
assert.ok(describeAllowedPages(['crm', 'atendimento'], OUTRA).includes('Atendimento'));

const outra = { role: 'cliente', cliente_id: OUTRA, allowed_pages: null };
const apice = { role: 'cliente', cliente_id: APICE, allowed_pages: null };
assert.equal(clientHasPageAccess(outra, 'dashboard'), true);
assert.equal(clientHasPageAccess(outra, 'atendimento'), false);
assert.equal(clientHasPageAccess(apice, 'atendimento'), true);
assert.equal(
  clientHasPageAccess({ role: 'cliente', cliente_id: OUTRA, allowed_pages: ['atendimento'] }, 'atendimento'),
  true
);
assert.equal(clientHasPageAccess({ role: 'admin' }, 'atendimento'), true);

const manager = readFileSync(new URL('../src/components/admin/ClientUserManager.jsx', import.meta.url), 'utf8');
assert.match(manager, /CLIENT_PAGES as CLIENT_PAGE_DEFS/);
assert.match(manager, /atendimento: Headphones/);
assert.match(manager, /editorKeysFromAllowedPages/);
assert.match(manager, /allowedPagesValueToSave/);

const modulesUi = readFileSync(new URL('../src/components/pages/ModuleManagement.jsx', import.meta.url), 'utf8');
assert.doesNotMatch(modulesUi, /Atendimento da loja/);
assert.doesNotMatch(modulesUi, /CLIENT_STORE_MODULES/);
assert.doesNotMatch(modulesUi, /handleStoreModuleToggle/);

console.log('PASS client allowed pages atendimento');

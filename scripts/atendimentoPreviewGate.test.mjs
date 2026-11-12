import assert from 'node:assert/strict';
import {
  atendimentoPreviewFallbackPath,
  canSeeAtendimentoPreview,
  normalizeEmail,
} from '../src/lib/atendimentoPreviewGate.js';
import { ATENDIMENTO_LOJA_CLIENTE_IDS } from '../src/lib/atendimentoLojaAcesso.js';

const APICE = 'a2396b48-2d2f-4b4b-adfd-3a4043b320e6';
const OUTRA = '11111111-2222-3333-4444-555555555555';

assert.deepEqual(ATENDIMENTO_LOJA_CLIENTE_IDS, [APICE]);
assert.equal(normalizeEmail('  Apice@JBAPex.com.br '), 'apice@jbapex.com.br');

assert.equal(canSeeAtendimentoPreview({ role: 'cliente', cliente_id: APICE }), true);
assert.equal(canSeeAtendimentoPreview({ role: 'cliente', cliente_id: APICE.toUpperCase() }), true);
assert.equal(canSeeAtendimentoPreview({ role: 'cliente', cliente_id: APICE, allowed_pages: null }), true);

assert.equal(canSeeAtendimentoPreview({ role: 'cliente', cliente_id: OUTRA }), false);
assert.equal(canSeeAtendimentoPreview({ role: 'cliente', cliente_id: OUTRA, allowed_pages: null }), false);
assert.equal(
  canSeeAtendimentoPreview({ role: 'cliente', cliente_id: OUTRA, allowed_pages: ['dashboard', 'crm'] }),
  false
);
assert.equal(
  canSeeAtendimentoPreview({ role: 'cliente', cliente_id: OUTRA, allowed_pages: ['atendimento'] }),
  true
);
assert.equal(
  canSeeAtendimentoPreview({
    role: 'cliente',
    cliente_id: APICE,
    allowed_pages: ['dashboard', 'crm'],
  }),
  false
);
assert.equal(canSeeAtendimentoPreview({ role: 'cliente', cliente_id: OUTRA }, true), true);
assert.equal(canSeeAtendimentoPreview({ role: 'cliente', cliente_id: APICE }, false), false);
assert.equal(canSeeAtendimentoPreview({ role: 'cliente', cliente_id: null }), false);
assert.equal(canSeeAtendimentoPreview({ role: 'superadmin', cliente_id: APICE }), false);
assert.equal(canSeeAtendimentoPreview({ role: 'admin' }), false);
assert.equal(canSeeAtendimentoPreview({ role: 'colaborador', cliente_id: APICE }), false);
assert.equal(canSeeAtendimentoPreview('apice@jbapex.com.br'), false);
assert.equal(canSeeAtendimentoPreview(''), false);
assert.equal(canSeeAtendimentoPreview(null), false);
assert.equal(canSeeAtendimentoPreview(undefined), false);

assert.equal(
  atendimentoPreviewFallbackPath({ role: 'cliente', cliente_id: 'x' }),
  '/cliente/support'
);
assert.equal(atendimentoPreviewFallbackPath({ role: 'superadmin' }), '/');
assert.equal(atendimentoPreviewFallbackPath(null), '/');

console.log('PASS atendimento preview gate');

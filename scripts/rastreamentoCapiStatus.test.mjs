import assert from 'node:assert/strict';
import {
  capiEventLabel,
  classifyCapiLogRow,
  isTransientCapiError,
} from '../src/lib/rastreamentoCapiStatus.js';

assert.equal(capiEventLabel('LeadSubmitted'), 'Conversa iniciada');
assert.equal(capiEventLabel('QualifiedLead'), 'Lead qualificado');
assert.equal(capiEventLabel('InitiateCheckout'), 'Checkout iniciado');
assert.equal(classifyCapiLogRow({ success: true }), 'enviado');
assert.equal(classifyCapiLogRow({ success: false, error_message: 'not_configured' }), 'not_configured');
assert.equal(classifyCapiLogRow({ success: false, error_message: 'Meta 2804117' }), 'erro');
assert.equal(isTransientCapiError('network timeout'), true);
assert.equal(isTransientCapiError('not_configured'), false);
assert.equal(isTransientCapiError('2804117'), false);

console.log('PASS rastreamento capi status');

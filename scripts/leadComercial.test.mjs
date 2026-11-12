import assert from 'node:assert/strict';
import {
  needsPurchaseValuePrompt,
  parseComercialValor,
} from '../src/lib/leadComercial.js';

assert.equal(parseComercialValor(''), 0);
assert.equal(parseComercialValor('0'), 0);
assert.equal(parseComercialValor('0,00'), 0);
assert.equal(parseComercialValor('1500'), 1500);
assert.equal(parseComercialValor('1500,90'), 1500.9);
assert.equal(parseComercialValor(89.5), 89.5);
assert.equal(needsPurchaseValuePrompt(''), true);
assert.equal(needsPurchaseValuePrompt(0), true);
assert.equal(needsPurchaseValuePrompt('1500'), false);
assert.equal(needsPurchaseValuePrompt(10), false);

console.log('PASS lead comercial valor prompt');

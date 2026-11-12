import assert from 'node:assert/strict';
import test from 'node:test';
import { getPriceIndicator } from '../src/lib/openrouterModels.js';

test('preço do OpenRouter usa dólar por milhão, não quatro cifrões em tudo', () => {
  assert.equal(getPriceIndicator({ prompt: '0.000001', completion: '0.000005' }), '$$$');
  assert.equal(getPriceIndicator({ prompt: '0.0000001', completion: '0.0000004' }), '$');
  assert.equal(getPriceIndicator({ prompt: '0.000005', completion: '0.000025' }), '$$$$');
  assert.equal(getPriceIndicator({}), '');
});

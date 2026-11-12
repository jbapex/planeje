import assert from 'node:assert/strict';
import {
  isOpenDotStatus,
  normalizeDotBody,
  normalizeDotTitle,
  previewMessage,
} from '../src/lib/caixaDotCore.js';

assert.equal(previewMessage('  Olá   mundo  '), 'Olá mundo');
assert.equal(previewMessage('a'.repeat(200)).length, 160);
assert.ok(previewMessage('a'.repeat(200)).endsWith('…'));

assert.equal(normalizeDotTitle('  Relatório  '), 'Relatório');
assert.throws(() => normalizeDotTitle('   '), /título/i);
assert.throws(() => normalizeDotTitle('x'.repeat(201)), /200/);

assert.equal(normalizeDotBody(' oi '), 'oi');
assert.throws(() => normalizeDotBody(''), /mensagem/i);

assert.equal(isOpenDotStatus('aberta'), true);
assert.equal(isOpenDotStatus('respondido'), true);
assert.equal(isOpenDotStatus('feita'), false);
assert.equal(isOpenDotStatus('arquivada'), false);

console.log('caixaDot.test.mjs OK');

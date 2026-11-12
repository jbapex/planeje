import assert from 'node:assert/strict';
import {
  canaisNovosDesconectados,
  classificarRespostaInstancia,
  textoCanalDesconectado,
} from '../src/lib/uazapiInstanceStatus.js';

assert.equal(classificarRespostaInstancia(200, { status: { connected: true, loggedIn: true } }), 'connected');
assert.equal(classificarRespostaInstancia(200, { instance: { status: 'connected' } }), 'connected');
assert.equal(classificarRespostaInstancia(200, { connected: false, instance: { status: 'disconnected' } }), 'disconnected');
assert.equal(classificarRespostaInstancia(503, { error: 'WhatsApp disconnected' }), 'disconnected');
assert.equal(classificarRespostaInstancia(401, { error: 'unauthorized' }), 'disconnected');
assert.equal(classificarRespostaInstancia(500, { error: 'timeout' }), 'unknown');
assert.equal(classificarRespostaInstancia(200, { instance: { status: 'connecting' } }), 'connecting');

assert.equal(
  textoCanalDesconectado([{ name: 'Poliana', status: 'disconnected' }, { name: 'Raphael', status: 'connected' }]),
  'O canal Poliana está desconectado. As mensagens desse número não entram até reconectar.',
);
assert.equal(
  textoCanalDesconectado([
    { name: 'Poliana', status: 'disconnected' },
    { name: '', status: 'disconnected' },
  ]),
  'Os canais Poliana e Canal sem nome estão desconectados. As mensagens desses números não entram até reconectar.',
);
assert.equal(textoCanalDesconectado([{ name: 'Raphael', status: 'connected' }]), '');

const first = [{ id: 'a', status: 'connected' }];
const dropped = [{ id: 'a', status: 'disconnected' }];
assert.deepEqual(canaisNovosDesconectados(null, dropped), []);
assert.deepEqual(canaisNovosDesconectados(first, dropped).map((row) => row.id), ['a']);
assert.deepEqual(canaisNovosDesconectados(dropped, dropped), []);

console.log('uazapiInstanceStatus: ok');

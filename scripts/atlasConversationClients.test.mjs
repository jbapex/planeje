import test from 'node:test';
import assert from 'node:assert/strict';
import { atlasClientCandidates, atlasClientQuestion, filterAtlasClients } from '../src/lib/atlasConversationClients.js';

const clients = [
  { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', empresa: 'Aurora Noivas' },
  { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', empresa: 'Aurora Moda' },
  { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', empresa: 'Estúdio Pérola' },
];
test('client names are matched in the authorized catalogue with accents and word boundaries', () => {
  assert.deepEqual(atlasClientCandidates('Confira as demandas da aurora noivas.', clients).map(c => c.empresa), ['Aurora Noivas']);
  assert.deepEqual(atlasClientCandidates('E a Perola?', clients).map(c => c.empresa), ['Estúdio Pérola']);
  assert.deepEqual(atlasClientCandidates('Auroral não é um cliente.', clients), []);
  assert.deepEqual(atlasClientCandidates('Qual o prazo?', clients), []);
});
test('shared names ask rather than silently choosing the first client', () => {
  assert.equal(atlasClientQuestion('Confira a Aurora.', clients, '').candidates.length, 2);
  assert.equal(atlasClientQuestion('Confira Aurora Noivas.', clients, clients[0].id), null);
  assert.equal(atlasClientQuestion('Confira Pérola.', clients, clients[0].id).candidates[0].id, clients[2].id);
});
test('unknown explicit clients offer a searchable selection while general agency requests stay general', () => {
  assert.deepEqual(atlasClientQuestion('Veja a demanda do cliente Nebulosa.', clients, '').candidates, []);
  assert.deepEqual(atlasClientQuestion('Veja a demanda do cliente Nebulosa.', clients, clients[0].id).candidates, []);
  assert.equal(atlasClientQuestion('Veja as demandas do cliente.', clients, clients[0].id), null);
  assert.equal(atlasClientQuestion('Confira todos os clientes com atraso.', clients, ''), null);
  assert.equal(atlasClientQuestion('O que depende de mim hoje?', clients, ''), null);
  assert.deepEqual(filterAtlasClients(clients, 'perola').map(c => c.empresa), ['Estúdio Pérola']);
});

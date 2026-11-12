import assert from 'node:assert/strict';
import { etiquetaChave, etiquetaNome, mergeEtiquetaCatalog, prepareEtiqueta } from '../src/lib/clienteEtiquetas.js';

assert.equal(etiquetaChave('Tráfego pago'), 'trafego-pago');
assert.equal(etiquetaChave('  VIP  '), 'vip');
assert.equal(prepareEtiqueta('A').ok, false);
assert.equal(prepareEtiqueta('VIP', [{ chave: 'vip', nome: 'VIP' }]).existing, true);
const created = prepareEtiqueta('Loja de noiva', []);
assert.equal(created.ok, true);
assert.equal(created.etiqueta.chave, 'loja-de-noiva');
assert.equal(created.etiqueta.nome, 'Loja de noiva');

const catalog = mergeEtiquetaCatalog(
  [{ chave: 'loja-de-noiva', nome: 'Loja de noiva' }],
  [{ etiquetas: ['vip', 'orfã'] }],
);
assert.deepEqual(catalog.map((item) => item.chave), ['vip', 'inativo', 'novo', 'loja-de-noiva', 'orfã']);
assert.equal(etiquetaNome('vip', catalog), 'VIP');
assert.equal(etiquetaNome('loja-de-noiva', catalog), 'Loja de noiva');
console.log('cliente etiquetas: ok');

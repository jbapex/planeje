import assert from 'node:assert/strict';
import { storedPhotoIsStale } from '../src/lib/atendimentoFotoUrl.js';

assert.equal(storedPhotoIsStale(''), true);
assert.equal(storedPhotoIsStale(null), true);
assert.equal(
  storedPhotoIsStale('https://pps.whatsapp.net/v/t61/abc'),
  true,
);
assert.equal(
  storedPhotoIsStale('https://planeje.jbapex.com.br/storage/v1/object/public/atendimento-fotos/a/b.jpg'),
  false,
);

console.log('atendimentoFotoUrl: ok');

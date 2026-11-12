import assert from 'node:assert/strict';
import {
  isAgencyEmpresa,
  representedClientId,
} from '../src/lib/pulseClientMatch.js';

const clients = [
  { id: 'agencia', empresa: 'JB APEX' },
  { id: 'maxi', empresa: 'Maxifarma' },
  { id: 'impacto', empresa: 'Impacto Noivas' },
];

assert.equal(isAgencyEmpresa('JB APEX'), true);
assert.equal(isAgencyEmpresa('JB Estratégico'), true);
assert.equal(isAgencyEmpresa('Impacto Noivas'), false);

assert.equal(representedClientId('MKT - Maxifarma', clients), 'maxi');
assert.equal(representedClientId('Impacto ADS', clients), null);
assert.equal(representedClientId('JB APEX', clients), null);

console.log('accountPulse ok');

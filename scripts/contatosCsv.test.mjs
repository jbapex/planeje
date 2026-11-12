import assert from 'node:assert/strict';
import { escapeContatosCsvValue } from '../src/lib/contatosCsv.js';

for (const [value, expected] of [
  [null, ''], [0, '0'], ['chatgpt.com', 'chatgpt.com'], ['Google Ads', 'Google Ads'],
  ['Fonte "parceira", local', 'Fonte ""parceira"", local'],
  ['=1+1', "'=1+1"], ['+SUM(1,1)', "'+SUM(1,1)"],
  ['-1+1', "'-1+1"], ['@SUM(1,1)', "'@SUM(1,1)"],
  [' \t=1+1', "' \t=1+1"], ['\n=1+1', "'\n=1+1"],
]) assert.equal(escapeContatosCsvValue(value), expected);

console.log('PASS contacts CSV: custom sources remain text, quotes and empty values preserved');

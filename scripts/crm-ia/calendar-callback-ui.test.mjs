import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { captureCrmIaCalendarCallback, takeCrmIaCalendarCallback } from '../../src/components/crm-ia/crmIaCalendarCallback.js';

const client = '11111111-1111-4111-8111-111111111111';
const state = 'crmcal1.synthetic.signature';
function capture(query, now = 0) {
  const replacements = [];
  captureCrmIaCalendarCallback({ pathname: '/', search: '?v=release', hash: `#/crm-ia/configuracoes?cliente=${client}&aba=google_calendar&${query}` },
    { state: null, replaceState(...args) { replacements.push(args[2]); } }, now);
  return replacements;
}
test('retorno OAuth sai do endereço antes de guardas e fica apenas na memória da conta exata', () => {
  assert.deepEqual(capture(`google_calendar=finalize&calendar_state=${state}&calendar_code=synthetic-code`), [`/?v=release#/crm-ia/configuracoes?cliente=${client}&aba=google_calendar`]);
  assert.equal(takeCrmIaCalendarCallback('another-client', 1), null);
  assert.deepEqual(takeCrmIaCalendarCallback(client, 1), { state, code: 'synthetic-code' });
  assert.equal(takeCrmIaCalendarCallback(client, 1), null);
});
test('retorno incompleto ou expirado é removido e não pode concluir a conexão', () => {
  capture(`google_calendar=finalize&calendar_state=${state}`);
  assert.equal(takeCrmIaCalendarCallback(client, 1), null);
  capture(`google_calendar=finalize&calendar_state=${state}&calendar_code=synthetic-code`);
  assert.equal(takeCrmIaCalendarCallback(client, 300001), null);
});
test('bootstrap limpa o fragmento antes de montar qualquer rota', async () => {
  const main = await readFile(new URL('../../src/main.jsx', import.meta.url), 'utf8');
  assert.ok(main.indexOf('captureCrmIaCalendarCallback();') < main.indexOf("window.addEventListener('error'"));
  assert.ok(main.includes("import { captureCrmIaCalendarCallback }"));
});

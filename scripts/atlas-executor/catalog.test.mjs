import test from 'node:test';
import assert from 'node:assert/strict';
import { EXECUTOR_CATALOG, executorOperation, readExecutorApp, prepareExecutorAction } from '../../supabase/functions/_shared/atlasExecutorCatalog.js';

test('catálogo recusa app, modo e operação arbitrários antes de alcançar o banco', async () => {
  let calls = 0;
  const caller = { rpc: () => { calls++; throw new Error('Não deveria consultar.'); }, from: () => { calls++; throw new Error('Não deveria consultar.'); } };
  for (const scope of [{ app: 'sql', view: 'query' }, { app: 'crm', view: 'save_pipeline' }, { app: 'crm', view: 'constructor' }]) {
    await assert.rejects(readExecutorApp(caller, { ...scope, clientId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', input: {} }), error => error.code === 'TOOL_DENIED');
  }
  for (const scope of [{ app: 'crm', action: 'workspace' }, { app: 'cs', action: 'rpc' }, { app: 'gestor', action: 'create_live_campaign' }]) {
    await assert.rejects(prepareExecutorAction(caller, { ...scope, clientId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', input: {} }), error => error.code === 'TOOL_DENIED');
  }
  assert.equal(calls, 0);
  assert.throws(() => executorOperation('crm', 'arbitrary', 'workspace'), error => error.code === 'TOOL_DENIED');
});

test('operações do catálogo têm identidade única e a consulta não transforma leitura em escrita', () => {
  const unique = new Set(EXECUTOR_CATALOG.map(item => `${item.app}:${item.mode}:${item.name}`));
  assert.equal(unique.size, EXECUTOR_CATALOG.length);
  for (const item of EXECUTOR_CATALOG) assert.equal(executorOperation(item.app, item.mode, item.name), item);
  for (const app of ['crm', 'cs', 'gestor']) {
    assert.ok(EXECUTOR_CATALOG.some(item => item.app === app && item.mode === 'read'));
    assert.ok(EXECUTOR_CATALOG.some(item => item.app === app && item.mode === 'write'));
  }
});

test('catálogo manual mostra um exemplo completo que passa no validador real', async () => {
  const { validateManualSquadAutomation } = await import('../../supabase/functions/_shared/atlasExecutorAutomation.js');
  const operation = executorOperation('atlas', 'write', 'save_automation'); const prefix = 'Exemplo válido: ';
  assert.ok(operation.description.includes(prefix)); const example = JSON.parse(operation.description.split(prefix)[1]);
  assert.equal(example.recipe, 'squad_manual'); assert.equal(validateManualSquadAutomation(example.config).steps[0].app, 'crm');
});

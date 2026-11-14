import test from 'node:test';
import assert from 'node:assert/strict';
import { validateChat, sameRequest } from '../../supabase/functions/_shared/atlasCore.js';
import { ATLAS_EXECUTOR_TAG, ATLAS_EXECUTOR_MESSAGE_LIMIT, atlasExecutorMessageBody } from '../../src/lib/atlasExecutorRequest.js';
import { atlasClientQuestion } from '../../src/lib/atlasConversationClients.js';

const REQUEST = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const base = { request_id: REQUEST, message: 'Configure o CRM.', executor: true };
test('modo de execução faz parte da identidade persistida, preservando o texto para a interface', () => {
  const input = validateChat(base);
  assert.equal(input.executor, true);
  assert.equal(input.question, base.message);
  assert.equal(input.message, ATLAS_EXECUTOR_TAG + base.message);
  assert.equal(atlasExecutorMessageBody(input.message), base.message);
  assert.equal(atlasExecutorMessageBody('Olá'), 'Olá');
  assert.equal(sameRequest({ request_message: base.message }, input), false);
  assert.equal(sameRequest({ request_message: input.message }, input), true);
  assert.ok(!validateChat({ ...base, executor: false }).executor);
});
test('executor não mistura escopo implícito do CS nem aceita mensagem além do limite persistível', () => {
  assert.throws(() => validateChat({ ...base, cs_portfolio: true }));
  assert.throws(() => validateChat({ ...base, cs_client: true, client_id: REQUEST }));
  assert.throws(() => validateChat({ ...base, message: 'x'.repeat(ATLAS_EXECUTOR_MESSAGE_LIMIT + 1) }));
  assert.ok(validateChat({ ...base, message: 'x'.repeat(ATLAS_EXECUTOR_MESSAGE_LIMIT) }).message.length <= 12000);
});
test('configurar CRM sem conta pede escolha explícita antes de enviar; visão da carteira continua geral', () => {
  const clients = [{ id: REQUEST, empresa: 'Empresa fictícia' }];
  const question = atlasClientQuestion('Configure meu CRM do zero.', clients, null, { executor: true });
  assert.equal(question.requiresClient, true);
  assert.equal(question.message, 'Configure meu CRM do zero.');
  assert.equal(atlasClientQuestion('Configure meu CRM do zero.', clients, REQUEST, { executor: true }), null);
  assert.equal(atlasClientQuestion('Como funciona o CRM?', clients, null, { executor: true }), null);
  assert.equal(atlasClientQuestion('Como está a carteira do CS e Gestor?', clients, null, { executor: true }), null);
  assert.equal(atlasClientQuestion('Configure meu CRM do zero.', clients, null), null);
});
test('display removes the flattened executor title prefix without changing tagged request identity or body whitespace', () => {
  assert.equal(atlasExecutorMessageBody('[Executor Planeje] Quero preparar o CRM.'),'Quero preparar o CRM.');
  assert.equal(atlasExecutorMessageBody('[Executor Planeje]\n  Código indentado.'),'  Código indentado.');
  assert.equal(atlasExecutorMessageBody('Minha conversa [Executor Planeje]'),'Minha conversa [Executor Planeje]');
  assert.equal(atlasExecutorMessageBody(null),null);
  assert.equal(validateChat(base).message,ATLAS_EXECUTOR_TAG+base.message);
});

test('Squad valida modo e manifesto ordenado sem abrir esses campos ao Atlas Office', () => {
  const second = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const input = validateChat({ ...base, mode: 'automation', attachment_ids: [REQUEST, second] });
  assert.equal(input.mode, 'automation'); assert.deepEqual(input.attachment_ids, [REQUEST, second]);
  assert.equal(validateChat(base).mode, 'chat'); assert.deepEqual(validateChat(base).attachment_ids, []);
  for (const change of [{ mode: 'office' }, { mode: null }, { attachment_ids: [REQUEST, REQUEST] }, { attachment_ids: ['bad'] }, { attachment_ids: [REQUEST, second, REQUEST, second, REQUEST] }, { attachment_ids: null }]) assert.throws(() => validateChat({ ...base, ...change }));
  for (const change of [{ mode: 'automation' }, { attachment_ids: [REQUEST] }, { executor_reply: REQUEST }]) assert.throws(() => validateChat({ ...base, executor: false, ...change }));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { runExecutorRequest, decideExecutorItem, loadExecutorContinuation } from '../../supabase/functions/_shared/atlasExecutorService.js';
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const owner = id(1), client = id(2), conversation = id(3), runId = id(4), itemId = id(5), resumeId = id(6);
const question = { title: 'Nome do agente', fields: [{ id: 'nome', label: 'Nome', type: 'text', required: true }] };
function fixture(item = {}) {
  const saved = { id: itemId, owner_id: owner, conversation_id: conversation, run_id: runId, client_id: client, kind: 'question', state: 'awaiting_input', revision: 1, title: question.title, fields: question.fields, resume_request_id: resumeId, ...item };
  let writes = 0;
  const run = { id: runId, owner_id: owner, conversation_id: conversation, request_id: id(8), request_client_id: client, request_message: '[Executor Planeje]\nConfigure o CRM.', domain: 'squad', mode: 'chat', attachment_ids: [] };
  const context = { id: conversation, owner_id: owner, client_id: client, domain: 'squad', mode: 'chat' };
  const calls = [];
  const caller = { from: () => assert.fail('Serviço Squad não consulta tabelas Atlas legadas.'), rpc: async (name, args) => {
    calls.push({ name, args });
    if (name === 'atlas_squad_item') return args.p_id === saved.id ? { data: structuredClone(saved), error: null } : { data: null, error: { code: '42501' } };
    if (name === 'atlas_squad_run') return { data: structuredClone(run), error: null };
    if (name === 'atlas_squad_history') return { data: { domain: 'squad', conversation: context, messages: [], runs: [], interactions: [] }, error: null };
    if (name === 'atlas_squad_knowledge_snapshot') return { data: { rows: [{ id: id(30), client_id: client, content: 'Só conhecimento Squad.' }], total: 1 }, error: null };
    writes++;
    if (name === 'atlas_executor_store') Object.assign(saved, args.p_item, { state: args.p_item.kind === 'question' ? 'awaiting_input' : 'proposed' });
    else if (name === 'atlas_executor_decide') Object.assign(saved, { state: 'completed', decision: args.p_decision, answers: args.p_answers, revision: 2 });
    else throw new Error('RPC não permitida no teste: ' + name);
    return { data: structuredClone(saved), error: null };
  } };
  return { caller, saved, run, context, calls, writes: () => writes };
}
const response = (content, tool_calls) => ({ message: { role: 'assistant', content, tool_calls }, usage: { prompt_tokens: 1, completion_tokens: 1 }, model: 'fixture' });

test('runtime confirma pergunta no armazenamento antes de devolver estado de espera', async () => {
  const f = fixture();
  const result = await runExecutorRequest({ caller: f.caller, ownerId: owner, run: { id: runId, conversation_id: conversation }, input: { question: 'Preciso de um nome.', client_id: client },
    history: [], memories: [], interactions: [], callModel: async () => response(null, [{ id: 'call-question', type: 'function', function: { name: 'ask_user', arguments: JSON.stringify(question) } }]), onProgress: async () => {} });
  assert.equal(result.pending.id, itemId);
  assert.equal(f.saved.kind, 'question');
  assert.deepEqual(f.saved.fields, [{ id: 'nome', label: 'Nome', type: 'text', required: true, maxLength: 2000 }]);
  assert.equal(f.writes(), 1);
});

test('resposta valida o item real e não encaminha payload ou escopo adulterado para decisão', async () => {
  const f = fixture();
  for (const input of [{ id: itemId, revision: 1, decision: 'answer', answers: { nome: 'Ana', inject: true } },
    { id: itemId, revision: 1, decision: 'approve' }, { id: itemId, revision: 1, decision: 'answer', answers: { nome: 'Ana' }, payload: {} },
    { id: id(99), revision: 1, decision: 'answer', answers: { nome: 'Ana' } }]) await assert.rejects(decideExecutorItem(f.caller, { ownerId: owner, ...input }));
  assert.equal(f.writes(), 0);
  const done = await decideExecutorItem(f.caller, { ownerId: owner, id: itemId, revision: 1, decision: 'answer', answers: { nome: 'Ana' } });
  assert.equal(done.state, 'completed');
  assert.deepEqual(done.answers, { nome: 'Ana' });
  assert.equal(f.writes(), 1);
});

test('retomada deriva pedido e identidade do recibo persistido, sem aceitar outra conversa', async () => {
  const f = fixture({ state: 'completed', decision: 'answer', answers: { nome: 'Ana' }, revision: 2 });
  const next = await loadExecutorContinuation(f.caller, { ownerId: owner, id: itemId, conversationId: conversation, requestId: resumeId });
  assert.equal(next.request_id, resumeId); assert.equal(next.conversation_id, conversation); assert.equal(next.client_id, client);
  assert.match(next.objective, /Configure o CRM/); assert.match(next.message, /Respondi às perguntas/); assert.ok(!next.message.includes(itemId));
  for (const change of [{ conversationId: id(98) }, { requestId: id(97) }, { ownerId: id(96) }]) await assert.rejects(loadExecutorContinuation(f.caller, { ownerId: owner, id: itemId, conversationId: conversation, requestId: resumeId, ...change }));
  assert.equal(f.writes(), 0);
});


test('serviço deriva contexto Squad e ignora conteúdo Office recebido em argumentos', async () => {
  const f = fixture(); let providers = 0;
  await runExecutorRequest({ caller: f.caller, ownerId: owner, run: { id: runId, conversation_id: conversation }, input: { question: 'Olá.', client_id: client },
    history: [{ role: 'user', content: 'Histórico Office forjado.' }], memories: [{ client_id: client, content: 'Memória Office forjada.' }], interactions: [{ title: 'Recibo forjado.' }],
    callModel: async ({ messages }) => { providers++; const text = JSON.stringify(messages); assert.match(text, /Só conhecimento Squad/); assert.doesNotMatch(text, /Office forjad|Recibo forjado/); return response('Olá.'); } });
  assert.equal(providers, 1); assert.equal(f.writes(), 0); assert.ok(f.calls.some(call => call.name === 'atlas_squad_run'));
  assert.ok(f.calls.some(call => call.name === 'atlas_squad_history')); assert.ok(f.calls.some(call => call.name === 'atlas_squad_knowledge_snapshot'));
  f.run.domain = 'office';
  await assert.rejects(runExecutorRequest({ caller: f.caller, ownerId: owner, run: f.run, input: { question: 'Olá.', client_id: client }, callModel: async () => assert.fail('Office não chega ao provedor Squad.') }), error => error.code === 'SQUAD_FORBIDDEN');
});


test('anexos precisam de manifesto e origem Squad compatíveis antes do provedor', async () => {
  const f = fixture(); const attachment = id(91); f.run.attachment_ids = [attachment];
  const request = { caller: f.caller, ownerId: owner, run: f.run, input: { question: 'Leia o arquivo.', client_id: client }, callModel: async () => assert.fail('Anexo sem origem não chega ao provedor.') };
  await assert.rejects(runExecutorRequest(request), error => error.code === 'SCOPE_CONFLICT');
  const metadata = [{ id: attachment, owner_id: owner, conversation_id: conversation, client_id: client, run_id: runId, state: 'uploaded' }];
  await assert.rejects(runExecutorRequest({ ...request, attachmentContext: { metadata: [{ ...metadata[0], client_id: null }], contentParts: [] } }), error => error.code === 'SCOPE_CONFLICT');
  let called = 0;
  await runExecutorRequest({ ...request, attachmentContext: { metadata, contentParts: [{ type: 'text', text: 'Conteúdo autorizado.' }] }, callModel: async ({ messages }) => { called++; assert.ok(messages.some(row => Array.isArray(row.content))); return response('Arquivo consultado.'); } });
  assert.equal(called, 1); assert.equal(f.writes(), 0);
});

test('recibo CRM legado é seguro na decisão pública e no modelo sem alterar armazenamento ou execução', async () => {
  const f = fixture({ kind: 'proposal', app: 'crm', action: 'save_agent', state: 'proposed', links: [{ label: 'CRM', href: '/crm-ia/agentes' }],
    payload: { id: id(81), expected_updated_at: '2026-11-12T10:00:00.000Z' }, result: { id: id(81), funil: { legacy: { api_token: 'synthetic-token-private', api_key: 'synthetic-key-private', apiKey: 'synthetic-camel-private', apiToken: 'synthetic-token-private', accessToken: 'synthetic-token-private', refreshToken: 'synthetic-token-private', accessKey: 'synthetic-key-private', 'access-key': 'synthetic-key-private', serviceRoleKey: 'synthetic-key-private', 'service-role-key': 'synthetic-key-private', meta_access_token: 'synthetic-token-private', page_access_token: 'synthetic-token-private', oauth_token: 'synthetic-token-private', max_tokens: 2000, prompt_tokens: 123, ordinary: 'Preservar' } } } });
  const originalPayload = structuredClone(f.saved.payload);
  const result = await decideExecutorItem(f.caller, { ownerId: owner, id: itemId, revision: 1, decision: 'approve' });
  assert.doesNotMatch(JSON.stringify(result), /synthetic-(?:token|key|camel)-private/); assert.match(JSON.stringify(f.saved.result), /synthetic-token-private/); assert.deepEqual(f.saved.payload, originalPayload);
  assert.equal(result.id, itemId); assert.equal(result.revision, 2); assert.equal(result.result.id, id(81)); assert.deepEqual(result.links, f.saved.links); assert.equal(result.result.funil.legacy.max_tokens, 2000); assert.equal(result.result.funil.legacy.prompt_tokens, 123);
  const rpc = f.caller.rpc; f.caller.rpc = async (name, args) => name === 'atlas_squad_history' ? { data: { domain: 'squad', conversation: f.context, messages: [], runs: [], interactions: [f.saved] }, error: null } : rpc(name, args);
  let calls = 0; await runExecutorRequest({ caller: f.caller, ownerId: owner, run: f.run, input: { question: 'Olá.', client_id: client }, callModel: async ({ messages }) => { calls++; assert.doesNotMatch(JSON.stringify(messages), /synthetic-(?:token|key|camel)-private/); return response('Recibo conferido.'); } });
  assert.equal(calls, 1); assert.deepEqual(f.saved.payload, originalPayload); assert.match(JSON.stringify(f.saved.result), /synthetic-camel-private/);
});

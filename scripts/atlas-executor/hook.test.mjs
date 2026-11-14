import assert from 'node:assert/strict';
import { after, afterEach, beforeEach, test } from 'node:test';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';
import { createFixture, proposedItem, completedItem, deferred, OWNER, CLIENT, OTHER_CLIENT, CONVERSATION, OTHER_CONVERSATION, ITEM, RESUME } from './hook-fixture.mjs';

const qa = '/tmp/planeje-crm-ui-qa';
const require = createRequire(path.join(qa, 'package.json'));
const React = require('react'); const { act, create } = require('react-test-renderer');
const scratch = await mkdtemp(path.join(qa, 'atlas-hook-'));
const root = process.cwd();
await build({ entryPoints: ['src/components/atlas/useAtlas.js'], outfile: path.join(scratch, 'hook.cjs'),
  bundle: true, format: 'cjs', platform: 'node', external: ['react'],
  plugins: [{ name: 'offline-api', setup(builder) {
    builder.onResolve({ filter: /^@\/lib\/atlasApi$/ }, () => ({ path: path.join(root, 'scripts/atlas-executor/hook-fixture.mjs') }));
    builder.onResolve({ filter: /^@\// }, args => {
      const file = path.join(root, 'src', args.path.slice(2));
      return { path: existsSync(file) ? file : existsSync(file + '.jsx') ? file + '.jsx' : file + '.js' };
    });
  } }],
});
const useAtlas = require(path.join(scratch, 'hook.cjs')).default;
let fixture; let mounted = [];
beforeEach(() => { fixture = createFixture(); globalThis.__atlasExecutorHook = fixture; });
afterEach(async () => { for (const renderer of mounted) await act(async () => renderer.unmount()); mounted = []; delete globalThis.__atlasExecutorHook; });
after(async () => { await rm(scratch, { recursive: true, force: true }); });
async function mount(options = { executor: true }, userId = OWNER) {
  const handle = { current: null, props: { options, userId } };
  function Probe(props) { handle.current = useAtlas(props.userId, props.options); return null; }
  await act(async () => { handle.renderer = create(React.createElement(Probe, handle.props)); });
  mounted.push(handle.renderer);
  handle.update = async next => { handle.props = { ...handle.props, ...next }; await act(async () => handle.renderer.update(React.createElement(Probe, handle.props))); };
  return handle;
}
async function open(handle, id = CONVERSATION) { await act(async () => handle.current.openConversation(id)); }
async function respond(handle, payload) { assert.equal(typeof handle.current.respondToInteraction, 'function', 'Executor response handler is missing'); return handle.current.respondToInteraction(payload); }
async function respondIgnoringFailure(handle, payload) { try { return await respond(handle, payload); } catch { return null; } }
const approve = { id: ITEM, revision: 2, decision: 'approve' };
const resumePayload = () => ({ request_id: RESUME, conversation_id: CONVERSATION, client_id: CLIENT, executor: true, executor_reply: ITEM, message: 'Continuar após minha resposta.' });

test('executor bootstrap selects its own agents, preserves interactions from history and falls back for older bootstraps', async () => {
  const handle = await mount();
  assert.equal(handle.current.loading, false);
  assert.deepEqual(handle.current.base.agents.map(agent => agent.id), ['central', 'crm', 'cs', 'gestor']);
  await open(handle);
  assert.deepEqual(handle.current.interactions, [proposedItem()]);
  fixture.base.executor_agents = [{ id: 'central', name: 'Atlas atualizado' }, { id: 'gestor', name: 'Gestor IA' }];
  await act(async () => handle.current.refreshBase());
  assert.deepEqual(handle.current.base.agents.map(agent => agent.id), ['central', 'gestor']);
  delete fixture.base.executor_agents;
  const fallback = await mount();
  assert.deepEqual(fallback.current.base.agents.map(agent => agent.id), ['central', 'clientes']);
});

test('executor limits messages to 11900 characters and suppresses legacy CS scope flags', async () => {
  const handle = await mount();
  await act(async () => handle.current.newConversation(CLIENT, { csScope: 'client' }));
  assert.equal(handle.current.messageLimit, 11900);
  await act(async () => handle.current.send(undefined, 'x'.repeat(11901)));
  assert.equal(fixture.calls.send.length, 0);
  assert.ok(handle.current.error);
  await act(async () => handle.current.send(undefined, 'x'.repeat(11900)));
  assert.equal(fixture.calls.send.length, 1);
  assert.equal(fixture.calls.send[0].executor, true);
  assert.equal(fixture.calls.send[0].cs_client, undefined);
  await act(async () => handle.current.newConversation('', { csScope: 'portfolio' }));
  await act(async () => handle.current.send(undefined, 'Consulte os sinais salvos.'));
  assert.equal(fixture.calls.send.at(-1).executor, true);
  assert.equal(fixture.calls.send.at(-1).cs_portfolio, undefined);
});

test('default office mode preserves legacy agents, message limits and both CS scopes', async () => {
  const legacy = await mount({ executor: false });
  await legacy.update({ options: undefined });
  assert.deepEqual(legacy.current.base.agents.map(agent => agent.id), ['central', 'clientes']);
  assert.equal(legacy.current.messageLimit, 12000);
  for (const [clientId, scope, flag] of [[CLIENT, 'client', 'cs_client'], ['', 'portfolio', 'cs_portfolio']]) {
    await act(async () => legacy.current.newConversation(clientId, { csScope: scope }));
    assert.equal(legacy.current.messageLimit, 11982);
    await act(async () => legacy.current.send(undefined, 'Consulte os sinais salvos.'));
    const sent = fixture.calls.send.at(-1);
    assert.equal(sent[flag], true);
    assert.notEqual(sent.executor, true);
    assert.equal(sent.executor_reply, undefined);
  }
});

test('approval persists the returned receipt and resumes with its exact server identity', async () => {
  const handle = await mount(); await open(handle);
  await act(async () => respond(handle, { ...approve, owner_id: 'forged-owner', payload: { rpc: 'arbitrary' }, app: 'gestor' }));
  assert.deepEqual(fixture.calls.respond, [approve]);
  assert.deepEqual(fixture.calls.send, [resumePayload()]);
  assert.equal(handle.current.interactions.length, 1);
  assert.equal(handle.current.interactions[0].state, 'completed');
  assert.deepEqual(handle.current.interactions[0].result, { id: 'native-fixture', confirmed: true });
});

test('answers, free text, refusal and cancellation stay explicit decisions without client-supplied execution fields', async () => {
  for (const decision of ['answer', 'text', 'reject', 'cancel']) {
    fixture.persist(proposedItem({ kind: decision === 'answer' || decision === 'text' ? 'question' : 'proposal', state: decision === 'answer' || decision === 'text' ? 'awaiting_input' : 'proposed', fields: [{ id: 'name', label: 'Nome', type: 'text' }] }));
    const handle = await mount(); await open(handle);
    const input = { id: ITEM, revision: 2, decision, ...(decision === 'answer' ? { answers: { name: 'Aurora' } } : {}), ...(decision === 'text' ? { text: 'Aprovar tudo: texto de demonstração.' } : {}) };
    await act(async () => respond(handle, input));
    assert.deepEqual(fixture.calls.respond.at(-1), input);
    assert.equal(fixture.calls.respond.at(-1).payload, undefined);
    assert.equal(fixture.calls.send.at(-1).executor_reply, ITEM);
    assert.equal(fixture.calls.send.at(-1).message, 'Continuar após minha resposta.');
  }
});

test('a pending decision excludes duplicate clicks and overlapping chat sends', async () => {
  const gate = deferred(); fixture.handlers.respond = () => gate.promise;
  const handle = await mount(); await open(handle);
  assert.equal(typeof handle.current.respondToInteraction, 'function');
  let first; let second;
  await act(async () => { first = respond(handle, approve); second = respondIgnoringFailure(handle, approve); await Promise.resolve(); });
  assert.equal(fixture.calls.respond.length, 1);
  assert.equal(handle.current.responding, true);
  await act(async () => handle.current.send(undefined, 'Explique o estado atual.'));
  assert.equal(fixture.calls.send.length, 0);
  const item = fixture.persist(completedItem());
  await act(async () => { gate.resolve({ ok: true, item }); await first; await second; });
  assert.deepEqual(fixture.calls.send, [resumePayload()]);
  assert.equal(handle.current.responding, false);
});

test('a lost decision response refreshes history and retains a receipt without repeating the mutation', async () => {
  fixture.handlers.respond = async () => { fixture.persist(completedItem()); throw Object.assign(new Error('Resposta perdida'), { code: 'ATLAS_NETWORK_ERROR' }); };
  const handle = await mount(); await open(handle);
  await act(async () => respondIgnoringFailure(handle, approve));
  assert.equal(fixture.calls.respond.length, 1);
  assert.ok(fixture.calls.history.length >= 2, 'The decision must be reconciled against persisted history');
  assert.equal(handle.current.interactions[0].state, 'completed');
  assert.deepEqual(handle.current.interactions[0].result, { id: 'native-fixture', confirmed: true });
  assert.ok(fixture.calls.send.length <= 1);
  for (const sent of fixture.calls.send) assert.deepEqual(sent, resumePayload());
});

test('a failed model continuation keeps the receipt and allows analysis without replaying approval', async () => {
  fixture.handlers.send = async () => { throw new Error('Falha simulada na continuação'); };
  const handle = await mount(); await open(handle);
  await act(async () => respondIgnoringFailure(handle, approve));
  assert.equal(handle.current.interactions[0].state, 'completed');
  assert.ok(handle.current.error);
  delete fixture.handlers.send;
  await act(async () => handle.current.send(undefined, 'Explique o resultado salvo.'));
  assert.equal(fixture.calls.respond.length, 1);
  assert.equal(fixture.calls.send.length, 2);
  assert.equal(fixture.calls.send[1].executor_reply, undefined);
  assert.equal(fixture.calls.send[1].executor, true);
  assert.notEqual(fixture.calls.send[1].request_id, RESUME);
  assert.equal(handle.current.interactions[0].state, 'completed');
});

test('uncertain external approval waits for GET reconciliation before model continuation', async () => {
  fixture.handlers.respond = async () => ({ ok: true, item: fixture.persist(completedItem({ app: 'gestor', action: 'update_meta', state: 'uncertain', revision: 3 })) });
  const handle = await mount(); await open(handle);
  await act(async () => respond(handle, approve));
  assert.equal(handle.current.interactions[0].state, 'uncertain');
  assert.equal(fixture.calls.send.length, 0);
  assert.equal(typeof handle.current.reconcileInteraction, 'function');
  await act(async () => handle.current.reconcileInteraction(ITEM));
  assert.deepEqual(fixture.calls.reconcile, [ITEM]);
  assert.equal(fixture.calls.respond.length, 1);
  assert.equal(handle.current.interactions[0].state, 'completed');
  assert.deepEqual(fixture.calls.send, [resumePayload()]);
});

test('lost response cannot resume a different answer recorded in another tab', async () => {
  fixture.persist(proposedItem({ kind: 'question', state: 'awaiting_input', fields: [{ id: 'nome', label: 'Nome', type: 'text' }] }));
  fixture.handlers.respond = async () => {
    fixture.persist(completedItem({ kind: 'question', decision: 'answer', answers: { nome: 'Resposta de outra aba' } }));
    throw new Error('Resposta perdida');
  };
  const handle = await mount(); await open(handle);
  await act(async () => respondIgnoringFailure(handle, { id: ITEM, revision: 2, decision: 'answer', answers: { nome: 'Minha resposta' } }));
  assert.equal(handle.current.interactions[0].answers.nome, 'Resposta de outra aba');
  assert.equal(fixture.calls.send.length, 0);
  assert.ok(handle.current.error);
});

test('conflicted and failed items keep their recorded errors while subsequent analysis cannot approve automatically', async () => {
  for (const state of ['conflict', 'failed']) {
    fixture.persist(proposedItem());
    fixture.handlers.respond = async () => ({ ok: true, item: fixture.persist(completedItem({ state, error: 'Revisão necessária' })) });
    const handle = await mount(); await open(handle);
    const before = fixture.calls.respond.length;
    await act(async () => respondIgnoringFailure(handle, approve));
    assert.equal(handle.current.interactions[0].state, state);
    assert.equal(handle.current.interactions[0].error, 'Revisão necessária');
    await act(async () => handle.current.send(undefined, 'Explique o impedimento registrado.'));
    assert.equal(fixture.calls.respond.length, before + 1);
    assert.equal(fixture.calls.send.at(-1).executor_reply, undefined);
  }
});

test('an old decision cannot apply or resume after the authenticated user changes', async () => {
  const gate = deferred(); fixture.handlers.respond = () => gate.promise;
  const handle = await mount(); await open(handle);
  assert.equal(typeof handle.current.respondToInteraction, 'function');
  let pending;
  await act(async () => { pending = respondIgnoringFailure(handle, approve); await Promise.resolve(); });
  await handle.update({ userId: '99999999-9999-4999-8999-999999999999' });
  await act(async () => { gate.resolve({ ok: true, item: completedItem() }); await pending; });
  assert.equal(handle.current.conversationId, null);
  assert.deepEqual(handle.current.interactions, []);
  assert.equal(fixture.calls.send.length, 0);
});

test('switching back to office mode discards an in-flight executor decision', async () => {
  const gate = deferred(); fixture.handlers.respond = () => gate.promise;
  const handle = await mount(); await open(handle);
  let pending;
  await act(async () => { pending = respondIgnoringFailure(handle, approve); await Promise.resolve(); });
  await handle.update({ options: { executor: false } });
  await act(async () => { gate.resolve({ ok: true, item: completedItem() }); await pending; });
  assert.deepEqual(handle.current.base.agents.map(agent => agent.id), ['central', 'clientes']);
  assert.deepEqual(handle.current.interactions, []);
  assert.equal(fixture.calls.send.length, 0);
});

test('an unknown item or stale revision never reaches the decision API', async () => {
  const handle = await mount(); await open(handle);
  for (const payload of [{ ...approve, id: '77777777-7777-4777-8777-777777777777' }, { ...approve, revision: 99 }]) {
    await act(async () => assert.rejects(() => respond(handle, payload), /histórico/i));
  }
  assert.equal(fixture.calls.respond.length, 0);
  assert.equal(fixture.calls.send.length, 0);
});

test('history loaded for a previous conversation cannot overwrite the new conversation interactions', async () => {
  const handle = await mount(); await open(handle);
  const old = deferred();
  fixture.handlers.history = id => id === CONVERSATION ? old.promise : Promise.resolve(structuredClone(fixture.records.get(id)));
  let pending;
  await act(async () => { pending = handle.current.refreshHistory(); await Promise.resolve(); });
  await open(handle, OTHER_CONVERSATION);
  await act(async () => { old.resolve({ ...structuredClone(fixture.records.get(CONVERSATION)), interactions: [completedItem()] }); await pending; });
  assert.equal(handle.current.conversationId, OTHER_CONVERSATION);
  assert.equal(handle.current.clientId, OTHER_CLIENT);
  assert.equal(handle.current.interactions[0].client_id, OTHER_CLIENT);
  assert.notEqual(handle.current.interactions[0].id, ITEM);
});

test('terminal continuation failures remain visible after polling and preserve the human request for a new attempt', async () => {
  const objective = 'Quero configurar o CRM completo desta conta.';
  fixture.records.get(CONVERSATION).messages = [{ id:'original-user',role:'user',run_id:'origin-run',content:'[Executor Planeje]\n'+objective }];
  fixture.records.get(CONVERSATION).interactions[0].run_id = 'origin-run';
  fixture.handlers.send = async payload => {
    fixture.records.get(CONVERSATION).runs = [{ id:'failed-continuation',request_id:payload.request_id,status:'failed',error:'Descrição inválido.' }];
    return { ok:false,status:'failed',run_id:'failed-continuation',conversation_id:CONVERSATION,error:'Descrição inválido.' };
  };
  const handle = await mount();await open(handle);
  await act(async () => respond(handle,approve));
  assert.equal(handle.current.error,'Descrição inválido.');
  await act(async () => handle.current.refreshHistory());
  await act(async () => handle.current.refreshHistory());
  await act(async () => handle.current.refreshBase());
  assert.equal(handle.current.error,'Descrição inválido.');assert.equal(handle.current.retryKind,'terminal');
  assert.equal(handle.current.draft,objective);assert.equal(handle.current.interactions[0].state,'completed');
  delete fixture.handlers.send;
  await act(async () => handle.current.send());
  const retry = fixture.calls.send.at(-1);
  assert.equal(retry.message,objective);assert.notEqual(retry.request_id,RESUME);assert.equal(retry.executor,true);
  assert.equal(retry.executor_reply,undefined);assert.equal(retry.conversation_id,CONVERSATION);assert.equal(retry.client_id,CLIENT);
  assert.equal(fixture.calls.respond.length,1);assert.equal(handle.current.error,'');
});

test('a lost continuation response resolves failed history once and keeps its alert on later refreshes', async () => {
  fixture.handlers.send = async payload => {
    fixture.records.get(CONVERSATION).runs = [{ id:'lost-failed',request_id:payload.request_id,status:'failed',error:'Falha persistida da continuação.' }];
    throw Error('Resposta de rede perdida.');
  };
  const handle = await mount();await open(handle);
  await act(async () => respondIgnoringFailure(handle,approve));
  await act(async () => handle.current.refreshHistory());
  assert.equal(handle.current.error,'Falha persistida da continuação.');
  await act(async () => handle.current.refreshHistory());
  assert.equal(handle.current.error,'Falha persistida da continuação.');assert.equal(fixture.calls.respond.length,1);
});

test('bootstrap, refreshed base and loaded history display conversation titles without executor protocol tags', async () => {
  fixture.base.conversations = [{ id:CONVERSATION,title:'[Executor Planeje] Quero preparar o CRM.' }];
  fixture.records.get(CONVERSATION).conversation.title = '[Executor Planeje]\nQuero preparar o CRM.';
  const handle = await mount();
  assert.equal(handle.current.base.conversations[0].title,'Quero preparar o CRM.');
  assert.equal(fixture.base.conversations[0].title,'[Executor Planeje] Quero preparar o CRM.');
  await open(handle);assert.equal(handle.current.base.conversations[0].title,'Quero preparar o CRM.');
  await act(async () => handle.current.refreshBase());assert.equal(handle.current.base.conversations[0].title,'Quero preparar o CRM.');
  const office = await mount({ executor:false });assert.equal(office.current.base.conversations[0].title,'Quero preparar o CRM.');
});

test('uncertain continuation retry preserves the exact original payload without deciding the item again', async () => {
  fixture.handlers.send = async () => { throw Error('Resposta não confirmada.'); };
  const handle = await mount();await open(handle);
  await act(async () => respondIgnoringFailure(handle,approve));
  assert.equal(handle.current.retryKind,'uncertain');assert.deepEqual(fixture.calls.send,[resumePayload()]);
  await act(async () => handle.current.refreshHistory());assert.equal(handle.current.error,'Resposta não confirmada.');
  delete fixture.handlers.send;
  await act(async () => handle.current.send());
  assert.deepEqual(fixture.calls.send,[resumePayload(),resumePayload()]);assert.equal(fixture.calls.respond.length,1);
});

test('a later form continuation restores the original human goal rather than another automatic continuation', async () => {
  const original = 'Prepare meu atendimento completo para novos contatos.';
  const priorResume = '55555555-5555-4555-8555-555555555555';
  const record = fixture.records.get(CONVERSATION);
  record.messages = [{ role:'user',run_id:'original',content:'[Executor Planeje]\n'+original },{ role:'user',run_id:'continued',content:'[Executor Planeje]\nRespondi às perguntas: Nome do agente.' }];
  record.runs = [{ id:'original',request_id:'human-request',status:'completed' },{ id:'continued',request_id:priorResume,status:'completed' }];
  record.interactions = [proposedItem({ run_id:'continued' }),completedItem({ id:'66666666-6666-4666-8666-666666666666',kind:'question',run_id:'original',resume_request_id:priorResume })];
  fixture.handlers.send = async () => ({ ok:false,status:'failed',run_id:'failed-later',conversation_id:CONVERSATION,error:'Falha da nova etapa.' });
  const handle = await mount();await open(handle);
  await act(async () => respond(handle,approve));
  assert.equal(handle.current.draft,original);assert.equal(fixture.calls.respond.length,1);
});

test('a pending uncertain request clears its network alert only when history confirms completion', async () => {
  fixture.handlers.send = async payload => {
    fixture.records.get(CONVERSATION).runs = [{ id:'completed-after-network',request_id:payload.request_id,status:'completed' }];
    throw Error('Resposta de rede perdida.');
  };
  const handle = await mount();await open(handle);
  await act(async () => handle.current.send(undefined,'Confira o CRM salvo.'));
  assert.equal(handle.current.retryKind,'uncertain');assert.equal(handle.current.error,'Resposta de rede perdida.');
  await act(async () => handle.current.refreshHistory());
  assert.equal(handle.current.error,'');assert.equal(handle.current.retryKind,null);assert.equal(handle.current.draft,'');
  assert.equal(handle.current.runs[0].status,'completed');assert.equal(fixture.calls.send.length,1);
});

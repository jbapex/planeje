import test from 'node:test';
import assert from 'node:assert/strict';
import { claimSquadRun, loadSquadBootstrap, loadSquadHistory, requireSquadConversation, loadSquadProgress, loadSquadRun, loadSquadItem } from '../../supabase/functions/_shared/atlasExecutorDomain.js';
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const owner = id(1), client = id(2), conversationId = id(3), runId = id(4), itemId = id(5), requestId = id(6);
const conversation = { id: conversationId, owner_id: owner, client_id: client, domain: 'squad', mode: 'chat' };
const run = { id: runId, owner_id: owner, conversation_id: conversationId, request_id: requestId, request_client_id: client, domain: 'squad', mode: 'chat', attachment_ids: [] };
test('helpers usam RPCs fixas e recusam contexto Office ou marca divergente', async () => {
  const calls = [];
  const caller = { rpc: async (name, args) => { calls.push({ name, args }); return { data: name === 'atlas_squad_claim_run' ? { claimed: true, run, conversation } : name === 'atlas_squad_conversation' ? conversation : name === 'atlas_squad_run' ? run : name === 'atlas_squad_progress' ? { run } : name === 'atlas_squad_item' ? { id: itemId, owner_id: owner, conversation_id: conversationId, run_id: runId, client_id: client } : name === 'atlas_squad_history' ? { domain: 'squad', conversation, messages: [], runs: [], interactions: [] } : { domain: 'squad', agents: [], clients: [], conversations: [conversation], knowledge: [], preferences: {}, limits: {}, budget: {}, memories: [{ content: 'Office: não importar.' }], jobs: [] }, error: null }; } };
  const claimed = await claimSquadRun(caller, { requestId, conversationId: null, clientId: client, message: '[Executor Planeje]\nOlá', mode: 'chat', attachmentIds: [] });
  assert.equal(claimed.run.id, runId); assert.deepEqual(calls[0], { name: 'atlas_squad_claim_run', args: { p_request_id: requestId, p_conversation_id: null, p_client_id: client, p_message: '[Executor Planeje]\nOlá', p_mode: 'chat', p_attachment_ids: [] } });
  assert.equal((await requireSquadConversation(caller, { conversationId, clientId: client, ownerId: owner })).domain, 'squad');
  assert.equal((await loadSquadHistory(caller, { conversationId, ownerId: owner })).interactions.length, 0);
  assert.equal((await loadSquadRun(caller, { runId, ownerId: owner, clientId: client })).mode, 'chat');
  assert.equal((await loadSquadItem(caller, { itemId, ownerId: owner, forWrite: true })).id, itemId);
  assert.equal((await loadSquadProgress(caller, { requestId, ownerId: owner })).run.id, runId);
  const bootstrap = await loadSquadBootstrap(caller, { clientId: client }); assert.equal(Object.hasOwn(bootstrap, 'memories'), false); assert.equal(Object.hasOwn(bootstrap, 'jobs'), false);
  await assert.rejects(requireSquadConversation(caller, { conversationId, clientId: null }), error => error.code === 'SCOPE_CONFLICT');
  const office = { rpc: async () => ({ data: { ...conversation, domain: 'office' }, error: null }) };
  await assert.rejects(requireSquadConversation(office, { conversationId }), error => error.code === 'SQUAD_FORBIDDEN');
});
test('claim valida modo e anexos; permissão SQL não vira fonte vazia nem expõe erro interno', async () => {
  let calls = 0; const caller = { rpc: async () => { calls++; return { data: null, error: { code: '42501', message: 'segredo-interno' } }; } };
  for (const extra of [{ mode: 'office' }, { attachmentIds: [id(10), id(10)] }, { attachmentIds: [id(10), id(11), id(12), id(13), id(14)] }, { rpc: 'atlas_claim_run' }]) await assert.rejects(claimSquadRun(caller, { requestId, clientId: client, message: '[Executor Planeje]\nOlá', ...extra }));
  assert.equal(calls, 0);
  await assert.rejects(loadSquadBootstrap(caller, { clientId: client }), error => error.code === 'SQUAD_FORBIDDEN' && !error.message.includes('segredo-interno'));
});

test('DTO Squad remove credenciais legadas sem alterar o registro validado nem IDs/revisão/links', async () => {
  const item = { id: itemId, owner_id: owner, conversation_id: conversationId, run_id: runId, client_id: client, revision: 7,
    links: [{ label: 'CRM', href: '/crm-ia/agentes' }], result: { id: id(80), funil: { legacy: { api_token: 'synthetic-token-private', api_key: 'synthetic-key-private', apiKey: 'synthetic-camel-private', apiToken: 'synthetic-token-private', accessToken: 'synthetic-token-private', refreshToken: 'synthetic-token-private', accessKey: 'synthetic-key-private', 'access-key': 'synthetic-key-private', serviceRoleKey: 'synthetic-key-private', 'service-role-key': 'synthetic-key-private', meta_access_token: 'synthetic-token-private', page_access_token: 'synthetic-token-private', oauth_token: 'synthetic-token-private', max_tokens: 2000, prompt_tokens: 123, ordinary: 'Preservar' } } } };
  const original = structuredClone(item);
  const caller = { rpc: async name => ({ data: name === 'atlas_squad_item' ? item : { domain: 'squad', conversation, messages: [], runs: [], interactions: [item] }, error: null }) };
  const shown = await loadSquadItem(caller, { itemId, ownerId: owner, forWrite: true });
  assert.doesNotMatch(JSON.stringify(shown), /synthetic-(?:token|key|camel)-private/); assert.deepEqual(item, original);
  assert.equal(shown.id, item.id); assert.equal(shown.revision, 7); assert.equal(shown.result.id, id(80)); assert.deepEqual(shown.links, item.links); assert.equal(shown.result.funil.legacy.ordinary, 'Preservar'); assert.equal(shown.result.funil.legacy.max_tokens, 2000); assert.equal(shown.result.funil.legacy.prompt_tokens, 123);
  const history = await loadSquadHistory(caller, { conversationId, ownerId: owner }); assert.doesNotMatch(JSON.stringify(history), /synthetic-(?:token|key|camel)-private/);
});

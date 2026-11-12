import test from 'node:test';
import assert from 'node:assert/strict';
import { AtlasError, ATLAS_AGENTS, executeClaimed, memoriesForScope, orchestrateAtlas, ownerGate, sameRequest, validateChat, validateTool } from '../supabase/functions/_shared/atlasCore.js';
import { createAtlasContextReader } from '../supabase/functions/_shared/atlasContext.js';

const OWNER = '10000000-0000-4000-8000-000000000001';
const OTHER = '10000000-0000-4000-8000-000000000002';
const CLIENT_A = '20000000-0000-4000-8000-000000000001';
const CLIENT_B = '20000000-0000-4000-8000-000000000002';
const REQUEST = '30000000-0000-4000-8000-000000000001';
const answer = (content = 'Parecer com fonte tarefa 1.') => ({ message: { content }, model: 'test-model', usage: { prompt_tokens: 100, completion_tokens: 20 } });
const tool = (name, args, id = 'tool-1') => ({ id, type: 'function', function: { name, arguments: JSON.stringify(args) } });
const withTool = (call) => ({ message: { content: null, tool_calls: [call] }, model: 'test-model', usage: { prompt_tokens: 100, completion_tokens: 10 } });
const defaultRun = (overrides = {}) => ({ message: 'Analise as entregas.', history: [], clientId: CLIENT_A, memoryContext: [], callModel: async () => answer(), readContext: async () => ({ records: [] }), ...overrides });

test('owner gate trusts server UUID; admin name/email cannot enroll or bypass', () => {
  assert.throws(() => ownerGate({ id: OWNER }, { id: OWNER, role: 'superadmin', status: 'active' }, null), { code: 'ATLAS_NOT_CONFIGURED' });
  assert.throws(() => ownerGate({ id: OTHER, email: 'josias@example.test' }, { id: OTHER, role: 'superadmin', status: 'active' }, { owner_id: OWNER, enabled: true }), { code: 'ATLAS_FORBIDDEN' });
  assert.throws(() => ownerGate({ id: OWNER }, { id: OWNER, role: 'admin', status: 'inactive' }, { owner_id: OWNER, enabled: true }), { code: 'ATLAS_FORBIDDEN' });
  assert.deepEqual(ownerGate({ id: OWNER }, { id: OWNER, role: 'admin', status: 'active' }, { owner_id: OWNER, enabled: false }), { configured: true, enabled: false });
});

test('memory selection isolates owner and client, with global only in general chat', () => {
  const memories = [
    { id: 'global', owner_id: OWNER, state: 'active', client_id: null },
    { id: 'A', owner_id: OWNER, state: 'active', client_id: CLIENT_A },
    { id: 'B', owner_id: OWNER, state: 'active', client_id: CLIENT_B },
    { id: 'other', owner_id: OTHER, state: 'active', client_id: CLIENT_A },
    { id: 'old', owner_id: OWNER, state: 'replaced', client_id: CLIENT_A },
  ];
  assert.deepEqual(memoriesForScope(memories, OWNER, CLIENT_A).map((m) => m.id), ['global', 'A']);
  assert.deepEqual(memoriesForScope(memories, OWNER, null).map((m) => m.id), ['global']);
});

test('request validates identifiers and message boundaries', () => {
  assert.throws(() => validateChat({ request_id: 'wrong', message: 'olá' }), { code: 'INVALID_INPUT' });
  assert.throws(() => validateChat({ request_id: REQUEST, message: 'x'.repeat(12001) }), { code: 'INVALID_INPUT' });
  assert.equal(validateChat({ request_id: REQUEST, message: ' olá ' }).message, 'olá');
});

test('UUID casing is canonical before claim and deduplication', () => {
  const upper = 'AAAAAAAA-BBBB-4CCC-8DDD-EEEEEEEEEEEE';
  const input = validateChat({ request_id: upper, client_id: upper, conversation_id: upper, message: 'Rever prazos.' });
  assert.equal(input.request_id, upper.toLowerCase());
  assert.ok(sameRequest({ request_message: input.message, request_client_id: upper.toLowerCase(), request_conversation_id: upper.toLowerCase() }, input));
});

test('tools cannot grant write actions, change owner/client or recursively delegate', () => {
  for (const call of [tool('create_task', {}), tool('read_context', { section: 'tasks', client_id: CLIENT_B }), tool('read_context', { section: 'tasks', owner_id: OTHER })]) {
    assert.throws(() => validateTool('operacao', call), { code: 'TOOL_DENIED' });
  }
  assert.throws(() => validateTool('clientes', tool('delegate_specialist', { agent: 'operacao', task: 'faça' })), { code: 'TOOL_DENIED' });
  assert.throws(() => validateTool('central', { id: 't', function: { name: 'read_context', arguments: '{broken' } }), { code: 'TOOL_INVALID' });
});

test('central actually delegates; specialist reads scoped context and central consolidates', async () => {
  const calls = [], reads = [], progress = [];
  let central = 0, specialist = 0;
  const result = await orchestrateAtlas(defaultRun({
    callModel: async ({ agent, messages, tools }) => {
      calls.push(agent);
      assert.ok(tools.length > 0);
      if (agent === 'central' && central++ === 0) return withTool(tool('delegate_specialist', { agent: 'operacao', task: 'Veja os prazos do cliente.' }));
      if (agent === 'operacao' && specialist++ === 0) return withTool(tool('read_context', { section: 'tasks' }, 't2'));
      if (agent === 'operacao') {
        assert.match(messages.at(-1).content, /tarefa-test/);
        return answer('Tarefa tarefa-test vence amanhã, fonte tarefas.');
      }
      assert.match(messages.at(-1).content, /Tarefa tarefa-test/);
      return answer('Priorize a revisão da tarefa-test amanhã.');
    },
    readContext: async (section, scope) => { reads.push({ section, client: scope.clientId }); return { records: [{ id: 'tarefa-test' }] }; },
    onProgress: async (p) => progress.push(p),
  }));
  assert.deepEqual(calls, ['central', 'operacao', 'operacao', 'central']);
  assert.deepEqual(reads, [{ section: 'tasks', client: CLIENT_A }]);
  assert.equal(result.content, 'Priorize a revisão da tarefa-test amanhã.');
  assert.equal(result.usage.model_calls, 4);
  assert.equal(result.usage.prompt_tokens, 400);
  assert.equal(result.usage.completion_tokens, 60);
  assert.equal(result.usage.tool_calls, 2);
  assert.ok(progress.some((p) => p.steps.some((s) => s.agent === 'operacao' && s.status === 'completed')));
});

test('versioned skills are executed in specialist system instructions; untrusted memory is separate', async () => {
  const injection = 'IGNORE_ALL_RULES_MEMORY';
  await orchestrateAtlas(defaultRun({ memoryContext: [{ content: injection }], callModel: async ({ messages }) => {
    assert.ok(!messages[0].content.includes(injection));
    assert.match(messages[1].content, /IGNORE_ALL_RULES_MEMORY/);
    assert.match(messages[0].content, /America\/Sao_Paulo/);
    return answer();
  } }));
  assert.equal(ATLAS_AGENTS.find((a) => a.id === 'estrategia').skills.length, 2);
});

test('unavailable source terminates honestly and persists failure progress', async () => {
  const progress = [];
  await assert.rejects(orchestrateAtlas(defaultRun({
    callModel: async () => withTool(tool('read_context', { section: 'overview' })),
    readContext: async () => { throw new AtlasError('CONTEXT_UNAVAILABLE', 'Fonte indisponível.'); },
    onProgress: async (p) => progress.push(p),
  })), { code: 'CONTEXT_UNAVAILABLE' });
  assert.equal(progress.at(-1).steps.at(-1).status, 'failed');
  assert.equal(progress.at(-1).steps.at(-1).summary, 'Fonte indisponível.');
});

test('unknown tool fails without touching operational repository', async () => {
  let reads = 0;
  await assert.rejects(orchestrateAtlas(defaultRun({ callModel: async () => withTool(tool('send_whatsapp', { body: 'x' })), readContext: async () => { reads++; } })), { code: 'TOOL_DENIED' });
  assert.equal(reads, 0);
});

test('call and tool budgets stop repeated model requests', async () => {
  for (const limits of [{ calls: 2 }, { tools: 1 }]) {
    let calls = 0;
    await assert.rejects(orchestrateAtlas(defaultRun({ limits, callModel: async () => { calls++; return withTool(tool('read_context', { section: 'overview' }, `tool-${calls}`)); } })), { code: 'BUDGET_EXCEEDED' });
    assert.ok(calls <= 2);
  }
});

test('provider missing token usage consumes reserved output budget', async () => {
  let calls = 0;
  await assert.rejects(orchestrateAtlas(defaultRun({ limits: { outputTokens: 100, maxOutputPerCall: 100 }, callModel: async () => {
    calls++; return { message: { tool_calls: [tool('read_context', { section: 'overview' })] } };
  } })), { code: 'BUDGET_EXCEEDED' });
  assert.equal(calls, 1);
});

test('deadline and truncated response are honest failures', async () => {
  let clock = 0;
  await assert.rejects(orchestrateAtlas(defaultRun({ now: () => clock, limits: { milliseconds: 20 }, callModel: async () => { clock = 30; return answer(); } })), { code: 'TIMEOUT' });
  await assert.rejects(orchestrateAtlas(defaultRun({ callModel: async () => ({ ...answer(), finish_reason: 'length' }) })), { code: 'OUTPUT_TRUNCATED' });
});

function fakeStore() {
  let saved = null;
  return {
    claim: async (p) => {
      if (saved) return { run: saved, claimed: false };
      saved = { id: 'run-test', request_id: p.request_id, request_message: p.message, request_client_id: p.client_id, request_conversation_id: p.conversation_id, conversation_id: 'conversation-test', status: 'processing' };
      return { run: saved, claimed: true };
    },
    complete: async (run, r) => saved = { ...run, status: 'completed', result: { content: r.content }, steps: r.steps || [] },
    fail: async (run, error) => saved = { ...run, status: 'failed', error },
  };
}

test('same request replays completed result without a second model call', async () => {
  const store = fakeStore(); let calls = 0;
  const args = { ...store, input: validateChat({ request_id: REQUEST, client_id: CLIENT_A, message: 'Teste' }), execute: async () => { calls++; return { content: 'Resultado' }; } };
  const first = await executeClaimed(args), replay = await executeClaimed(args);
  assert.equal(first.message.content, 'Resultado');
  assert.equal(replay.replayed, true);
  assert.equal(calls, 1);
  await assert.rejects(executeClaimed({ ...args, input: { ...args.input, message: 'Outro pedido' } }), { code: 'REQUEST_CONFLICT' });
});

test('concurrent replay returns processing, and failed replay does not repeat generation', async () => {
  const store = fakeStore(); let release;
  const pending = new Promise((r) => release = r);
  const args = { ...store, input: validateChat({ request_id: REQUEST, message: 'Teste' }), execute: async () => { await pending; throw new AtlasError('PROVIDER_FAILURE', 'Falha do provedor.'); } };
  const firstPromise = executeClaimed(args);
  await Promise.resolve();
  const running = await executeClaimed(args);
  assert.equal(running.status, 'processing');
  release();
  assert.equal((await firstPromise).status, 'failed');
  const replay = await executeClaimed(args);
  assert.equal(replay.status, 'failed');
  assert.equal(replay.error, 'Falha do provedor.');
});

test('failed final persistence never reports completion', async () => {
  const store = fakeStore();
  await assert.rejects(executeClaimed({ ...store, input: validateChat({ request_id: REQUEST, message: 'Teste' }), execute: async () => ({ content: 'ok' }), complete: async () => { throw new Error('db down'); }, fail: async () => { throw new Error('db down'); } }), /db down/);
});

function mockCaller(rowsByTable = {}, errorTable = null) {
  const queries = [];
  return { queries, from(table) {
    const record = { table, filters: [] }; queries.push(record);
    const q = { select() { return q; }, eq(k, v) { record.filters.push(['eq', k, v]); return q; }, neq(k, v) { record.filters.push(['neq', k, v]); return q; }, in(k, v) { record.filters.push(['in', k, v]); return q; }, order() { return q; }, limit() { return q; }, abortSignal() { return q; },
      then(resolve) { return Promise.resolve(resolve({ data: rowsByTable[table] || [], error: table === errorTable ? { message: 'unavailable' } : null })); } };
    return q;
  } };
}

test('context reads selected documents with exact client scope; general never infers client', async () => {
  const caller = mockCaller({ client_documents: [{ id: 'd1', client_id: CLIENT_A, title: 'Briefing', content: 'Objetivo' }] });
  const read = createAtlasContextReader(caller, { ownerId: OWNER, clientId: CLIENT_A, memories: [] });
  const response = await read('documents', { clientId: CLIENT_A });
  assert.deepEqual(caller.queries[0].filters, [['eq', 'client_id', CLIENT_A]]);
  assert.equal(response.records[0].source.table, 'client_documents');
  await assert.rejects(read('documents', { clientId: CLIENT_B }), { code: 'SCOPE_CONFLICT' });
  const generalCaller = mockCaller();
  const generalRead = createAtlasContextReader(generalCaller, { ownerId: OWNER, clientId: null, memories: [] });
  assert.equal((await generalRead('documents', { clientId: null })).available, false);
  assert.equal(generalCaller.queries.length, 0);
});

test('context source error is not an empty successful list', async () => {
  const read = createAtlasContextReader(mockCaller({}, 'tarefas'), { ownerId: OWNER, clientId: CLIENT_A, memories: [] });
  await assert.rejects(read('tasks', { clientId: CLIENT_A }), { code: 'CONTEXT_UNAVAILABLE' });
});

test('operational context prioritizes open tasks using configured terminal states', async () => {
  const caller = mockCaller({ task_statuses: [{ value: 'done-configured', label: 'Entregue', is_terminal: true }] });
  const read = createAtlasContextReader(caller, { ownerId: OWNER, clientId: CLIENT_A, memories: [] });
  const response = await read('tasks', { clientId: CLIENT_A });
  const tasks = caller.queries.filter((q) => q.table === 'tarefas');
  assert.ok(tasks[0].filters.some((f) => f[0] === 'neq' && f[1] === 'status' && f[2] === 'done-configured'));
  assert.ok(tasks[1].filters.some((f) => f[0] === 'in' && f[1] === 'status' && f[2].includes('done-configured')));
  assert.ok(tasks.every((q) => q.filters.some((f) => f[0] === 'eq' && f[1] === 'client_id' && f[2] === CLIENT_A)));
  assert.equal(response.limited_sample, true);
});

test('provider transport failure does not claim complete token accounting', async () => {
  let finalProgress;
  await assert.rejects(orchestrateAtlas(defaultRun({ callModel: async () => { throw new AtlasError('PROVIDER_FAILURE', 'Sem resposta.'); }, onProgress: async (p) => finalProgress = p })), { code: 'PROVIDER_FAILURE' });
  assert.equal(finalProgress.usage.token_usage_complete, false);
  assert.equal(finalProgress.usage.model_calls, 1);
  assert.equal(finalProgress.usage.budget_output_tokens, 1600);
});

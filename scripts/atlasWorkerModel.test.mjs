import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { AtlasError } from '../supabase/functions/_shared/atlasCore.js';
import { runAtlasMission } from '../supabase/functions/_shared/atlasManager.js';

const worker = await readFile(new URL('./atlas-worker.mjs', import.meta.url), 'utf8');
const start = worker.indexOf('async function model(');
const end = worker.indexOf('\nasync function mission(', start);
assert.ok(start >= 0 && end > start, 'Worker model boundary must be available');

// Exercise the actual CLI transport without starting its database/worker loop.
const transport = fetch => vm.runInNewContext(`(${worker.slice(start, end).trim()})`, {
  fetch, AtlasError, env: { OPENAI_API_KEY: 'fixture-key', ATLAS_MISSION_MODEL: 'fixture-model' },
});
const completion = (message, status = 200) => ({
  ok: status === 200, status,
  json: async () => ({ choices: [{ message, finish_reason: message.tool_calls?.length ? 'tool_calls' : 'stop' }],
    model: 'fixture-model', usage: { prompt_tokens: 20, completion_tokens: 10 } }),
});

test('text-only calls omit empty tools and automatic tool choice', async () => {
  for (const tools of [undefined, []]) {
    let sent;
    const model = transport(async (_url, options) => {
      sent = JSON.parse(options.body);
      return completion({ role: 'assistant', content: 'Confirma a entrega?' });
    });
    await model({ messages: [{ role: 'user', content: 'Pergunte sobre a entrega.' }], tools, maxTokens: 500 });
    assert.equal(Object.hasOwn(sent, 'tools'), false);
    assert.equal(Object.hasOwn(sent, 'tool_choice'), false);
  }
});

test('tool calls preserve the configured model, authentication, signal and result usage', async () => {
  const tools = [{ type: 'function', function: { name: 'read_context', parameters: { type: 'object' } } }];
  const signal = new AbortController().signal;
  let sent;
  const model = transport(async (url, options) => {
    sent = JSON.parse(options.body);
    assert.equal(url, 'https://api.openai.com/v1/chat/completions');
    assert.equal(options.headers.Authorization, 'Bearer fixture-key');
    assert.equal(options.signal, signal);
    return completion({ role: 'assistant', content: 'Conferido.' });
  });
  const result = await model({ messages: [{ role: 'user', content: 'Confira.' }], tools, maxTokens: 600, signal });
  assert.deepEqual(sent.tools, tools);
  assert.equal(sent.tool_choice, 'auto');
  assert.equal(sent.model, 'fixture-model');
  assert.equal(sent.max_tokens, 600);
  assert.equal(result.usage.prompt_tokens, 20);
  assert.equal(result.message.content, 'Conferido.');
});

test('provider rejection retains a safe status code without reading its private body', async () => {
  const model = transport(async () => ({ ok: false, status: 400,
    json: async () => { throw new Error('A provider error body must not be copied'); } }));
  await assert.rejects(model({ messages: [], tools: [], maxTokens: 200 }), error => {
    assert.equal(error.code, 'PROVIDER_HTTP_400');
    assert.equal(error.name, 'AtlasError');
    assert.doesNotMatch(error.message, /fixture-key|private|provider error body/);
    return true;
  });
});

test('the separate question emitter reaches the internal consultation through the worker transport', async () => {
  const client = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const thread = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  let centralCalls = 0, internalCalls = 0;
  const call = (name, args) => ({ id: `call-${centralCalls}`, type: 'function', function: { name, arguments: JSON.stringify(args) } });
  const model = transport(async (_url, options) => {
    const body = JSON.parse(options.body);
    if (!body.tools?.length) {
      assert.equal(Object.hasOwn(body, 'tool_choice'), false);
      return completion({ role: 'assistant', content: 'Você consegue confirmar a entrega e mandar o link?' });
    }
    centralCalls++;
    if (centralCalls === 1) return completion({ role: 'assistant', content: null,
      tool_calls: [call('read_context', { section: 'client', client_id: client })] });
    if (centralCalls === 2) return completion({ role: 'assistant', content: null,
      tool_calls: [call('ask_internal', { client_id: client, subject: 'publicacao', question: 'Você consegue confirmar a entrega e mandar o link?' })] });
    return completion({ role: 'assistant', content: 'A pergunta ficou agendada para o próximo expediente.' });
  });
  const result = await runAtlasMission({ message: 'Confira a entrega.', clientId: client, memories: [],
    readContext: async () => ({ available: true, records: { client: { id: client, empresa: 'Cliente Exemplo' } } }),
    callModel: model,
    askInternal: async () => { internalCalls++; return { thread_id: thread, recipient: 'Pessoa Exemplo', state: 'scheduled' }; },
  });
  assert.equal(internalCalls, 1);
  assert.equal(result.consultation.thread_id, thread);
  assert.ok(result.steps.some(step => step.kind === 'internal_question' && step.status === 'pending'));
});

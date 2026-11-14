import assert from 'node:assert/strict';
import test from 'node:test';
import { budgetedAtlasExecutorModel } from '../../supabase/functions/_shared/atlasExecutorModelBudget.js';

test('teto recusado preserva pedido e impede chamada ao provedor', async () => {
  const calls = [];
  await assert.rejects(budgetedAtlasExecutorModel({ run: { id: 'run-qa' }, rpc: async (name, args) => { calls.push({ name, args }); return { reserved: false }; }, callModel: async () => assert.fail('Não pode chamar o provedor.') }, { messages: [], maxTokens: 100 }), error => error.code === 'DAILY_BUDGET_WAIT');
  assert.equal(calls.length, 1); assert.equal(calls[0].name, 'atlas_executor_model_reserve'); assert.equal(calls[0].args.p_run, 'run-qa');
});
test('reserva cobre bytes UTF8 e saída, preserva payload/modelo e finaliza uso uma única vez', async () => {
  const calls = [], payload = { messages: [{ role: 'user', content: 'Olá' }], tools: [], maxTokens: 100, model: 'modelo-configurado', provider: 'provedor-configurado' };
  const answer = { usage: { prompt_tokens: 20, completion_tokens: 10 }, message: { content: 'Resposta fictícia' } };
  const result = await budgetedAtlasExecutorModel({ run: { id: 'run-qa' }, rpc: async (name, args) => { calls.push({ name, args }); return { reserved: true }; }, callModel: async passed => { assert.equal(passed, payload); return answer; } }, payload);
  assert.equal(result, answer); assert.equal(calls.length, 2);
  assert.equal(calls[0].args.p_estimate, new TextEncoder().encode(JSON.stringify({ messages: payload.messages, tools: payload.tools })).length + 400);
  assert.equal(calls[1].name, 'atlas_model_finish'); assert.equal(calls[1].args.p_call, calls[0].args.p_call); assert.deepEqual(calls[1].args.p_usage, answer.usage);
});
test('falha ou uso desconhecido fecha a reserva com cobrança conservadora', async () => {
  for (const fails of [false, true]) {
    const calls = [];
    const task = budgetedAtlasExecutorModel({ run: { id: 'run-qa' }, rpc: async (name, args) => { calls.push({ name, args }); return { reserved: true }; }, callModel: async () => { if (fails) throw Error('Resposta perdida'); return { message: { content: 'Sem uso comprovado' } }; } }, { messages: [] });
    if (fails) await assert.rejects(task, /Resposta perdida/); else await task;
    assert.equal(calls.length, 2); assert.equal(calls[1].args.p_usage, null);
  }
});

test('cancelar a reserva interrompe a espera sem iniciar outra chamada de modelo', async () => {
  const controller = new AbortController(); let called = false; let reservedSignal;
  const pending = budgetedAtlasExecutorModel({ run: { id: 'run-qa' }, rpc: (_name, _args, options) => {
    reservedSignal = options?.signal; return new Promise(() => {});
  }, callModel: async () => { called = true; } }, { messages: [], signal: controller.signal });
  await Promise.resolve(); controller.abort();
  const outcome = await Promise.race([pending.then(() => 'resolved', error => error.code), new Promise(resolve => setTimeout(() => resolve('still-pending'), 20))]);
  assert.equal(outcome, 'CANCELLED');
  assert.equal(called, false); assert.equal(reservedSignal?.aborted, true);
});

test('finalização do orçamento tem prazo próprio e não declara cobrança concluída sem recibo', async t => {
  const timers = []; let finishSignal; let finishStarted;
  const started = new Promise(resolve => { finishStarted = resolve; });
  t.mock.method(globalThis, 'setTimeout', (callback, milliseconds) => { const timer = { callback, milliseconds }; timers.push(timer); return timer; });
  t.mock.method(globalThis, 'clearTimeout', () => {});
  const pending = budgetedAtlasExecutorModel({ run: { id: 'run-qa' }, rpc: (name, _args, options) => {
    if (name === 'atlas_executor_model_reserve') return { reserved: true };
    finishSignal = options?.signal; finishStarted(); return new Promise(() => {});
  }, callModel: async () => ({ usage: { prompt_tokens: 1, completion_tokens: 1 }, message: { content: 'Resposta' } }) }, { messages: [] });
  const rejected = assert.rejects(pending, error => error.code === 'BUDGET_LEDGER_UNAVAILABLE');
  await started;
  assert.ok(timers.some(timer => timer.milliseconds === 8000));
  timers.find(timer => timer.milliseconds === 8000).callback();
  await rejected;
  assert.equal(finishSignal.aborted, true);
});

test('mídia reserva grupo conservador128k sem cobrar bytes Base64 nem alterar mensagem', async () => {
  const estimates = [];
  for (const size of [100, 100000]) {
    const payload = { messages: [{ role: 'user', content: [{ type: 'text', text: 'Consulte o anexo.' }, { type: 'image_url', image_url: { url: 'data:image/png;base64,' + 'a'.repeat(size), detail: 'auto' } }, { type: 'file', file: { filename: 'arquivo.pdf', file_data: 'data:application/pdf;base64,' + 'b'.repeat(size) } }] }], maxTokens: 100 };
    await budgetedAtlasExecutorModel({ run: { id: 'run-qa' }, rpc: async (name, args) => { if (name === 'atlas_executor_model_reserve') estimates.push(args.p_estimate); return { reserved: true }; }, callModel: async passed => { assert.equal(passed, payload); return { message: { content: 'Anexos consultados.' } }; } }, payload);
  }
  assert.equal(estimates[0], estimates[1]); assert.ok(estimates[0] >= 128400); assert.ok(estimates[0] < 130000);
});

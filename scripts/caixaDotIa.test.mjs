import assert from 'node:assert/strict';
import {
  buildDotSystemPrompt,
  formatClienteResumo,
  formatTarefasResumo,
  historicoParaMensagens,
  parseToolCallArgs,
  sanitizeDotReply,
} from '../supabase/functions/_shared/caixaDotIa.js';

const prompt = buildDotSystemPrompt({
  ownerName: 'Ana',
  thread: { title: 'Prazo do relatório', kind: 'demanda', cliente_id: null, task_id: null },
  contextoBase: 'Tarefas: 1',
});
assert.match(prompt, /Dot/);
assert.match(prompt, /Ana/);
assert.match(prompt, /Prazo do relatório/);
assert.match(prompt, /Não envie WhatsApp/);

const hist = historicoParaMensagens([
  { role: 'system', body: 'Demanda MCP' },
  { role: 'user', body: 'O que falta?' },
  { role: 'dot', body: 'Falta o PDF.' },
  { role: 'user', body: '   ' },
]);
assert.equal(hist.length, 3);
assert.equal(hist[0].role, 'user');
assert.equal(hist[1].role, 'user');
assert.equal(hist[2].role, 'assistant');

assert.deepEqual(parseToolCallArgs('{"busca":"Ápice"}'), { busca: 'Ápice' });
assert.deepEqual(parseToolCallArgs('nao-json'), {});

assert.equal(sanitizeDotReply('  oi  '), 'oi');
assert.equal(sanitizeDotReply(''), '');

assert.match(formatClienteResumo({ id: '1', empresa: 'Loja', etapa: 'closed' }), /Loja/);
assert.match(formatTarefasResumo([]), /Nenhuma tarefa/);
assert.match(
  formatTarefasResumo([{ id: 'a', title: 'Arte', status: 'todo', due_date: '2026-10-10' }]),
  /Arte/
);

console.log('caixaDotIa.test.mjs OK');

/**
 * Regras de cor e ordem das tarefas por data + urgência.
 * Não conecta no banco.
 */
import {
  compareTasksByWorkOrder,
  daysUntilDue,
  formatDueWorkLabel,
  getDueTone,
  normalizeTaskPriority,
  sortTasksByWorkOrder,
} from '../src/lib/taskUrgency.js';

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error('FALHOU:', msg);
    failed += 1;
  }
}

const now = new Date(2026, 8, 9); // 9 set 2026

assert(normalizeTaskPriority('urgente') === 'urgent', 'urgente → urgent');
assert(normalizeTaskPriority('alta') === 'high', 'alta → high');
assert(normalizeTaskPriority('') === 'medium', 'vazio → medium');

assert(daysUntilDue('2026-09-09', now) === 0, 'hoje = 0');
assert(daysUntilDue('2026-09-08', now) === -1, 'ontem = -1');
assert(daysUntilDue('2026-09-12', now) === 3, 'em 3 dias = 3');

assert(getDueTone('2026-09-08', { now }) === 'overdue', 'atrasada = vermelho');
assert(getDueTone('2026-09-09', { now }) === 'overdue', 'hoje = vermelho');
assert(getDueTone('2026-09-10', { now }) === 'soon', 'amanhã = amarelo');
assert(getDueTone('2026-09-12', { now }) === 'soon', 'em 3 dias = amarelo');
assert(getDueTone('2026-09-13', { now }) === 'none', 'em 4 dias sem alerta');
assert(getDueTone('2026-09-08', { now, isTerminal: true }) === 'none', 'concluída não alerta');

assert(formatDueWorkLabel('2026-09-09', { now }).startsWith('Hoje'), 'rótulo hoje');
assert(formatDueWorkLabel('2026-09-08', { now }).includes('Atrasada'), 'rótulo atrasada');

const statusOptions = [
  { value: 'todo', is_terminal: false },
  { value: 'published', is_terminal: true },
];

const ordered = sortTasksByWorkOrder(
  [
    { id: 'far', title: 'Longe', due_date: '2026-09-20', priority: 'urgent', status: 'todo' },
    { id: 'today-med', title: 'Hoje média', due_date: '2026-09-09', priority: 'medium', status: 'todo' },
    { id: 'today-urg', title: 'Hoje urgente', due_date: '2026-09-09', priority: 'urgent', status: 'todo' },
    { id: 'late', title: 'Atrasada', due_date: '2026-09-07', priority: 'low', status: 'todo' },
    { id: 'nodate', title: 'Sem data', due_date: null, priority: 'urgent', status: 'todo' },
    { id: 'done', title: 'Publicada atrasada', due_date: '2026-09-01', priority: 'urgent', status: 'published' },
  ],
  { statusOptions, now }
).map((t) => t.id);

assert(ordered[0] === 'late', 'atrasada abre a fila');
assert(ordered[1] === 'today-urg', 'hoje urgente antes de hoje média');
assert(ordered[2] === 'today-med', 'hoje média depois da urgente');
assert(ordered[3] === 'far', 'data futura depois de hoje');
assert(ordered[4] === 'nodate', 'sem data no fim das abertas');
assert(ordered[5] === 'done', 'concluída por último mesmo atrasada');

assert(
  compareTasksByWorkOrder(
    { due_date: '2026-09-09', priority: 'low', status: 'todo' },
    { due_date: '2026-09-09', priority: 'high', status: 'todo' },
    { now }
  ) > 0,
  'mesma data: alta antes de baixa'
);

if (failed) {
  console.error(`\n${failed} falha(s) em urgência de tarefas`);
  process.exit(1);
}
console.log('OK urgência de tarefas');

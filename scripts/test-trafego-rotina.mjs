/**
 * Rotina fixa — testes sem banco.
 */
import { buildFazerAgoraQueue } from '../src/lib/trafegoFazerAgora.js';
import {
  buildCrmRoutineUrl,
  buildRotinaQueue,
  buildUpcomingWeeklyCards,
  buildWeeklyRoutineCards,
  crmCycleKey,
  isCrmMonday,
  isReportDueDay,
  isRoutineDemandRow,
  lastWeekRange,
  nextMonday,
  nextReportDue,
  partitionHojeBoard,
  reportCycleKey,
  waitingRowsFromBuckets,
  withoutWeeklyRoutineDemands,
} from '../src/lib/trafegoRotina.js';

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error('FALHOU:', msg);
    failed += 1;
  }
}

assert(isReportDueDay('2026-09-01'), '1º de setembro de 2026 é terça, então é o 1º dia útil');
assert(isReportDueDay('2026-09-15'), '15 de setembro de 2026 é terça, então é dia de relatório');
assert(!isReportDueDay('2026-09-16'), 'dia 16 deixou de ser relatório');
assert(!isReportDueDay('2026-09-02'), 'dia 2 não é relatório');
assert(!isReportDueDay('2026-11-01'), '1º de novembro de 2026 é domingo');
assert(isReportDueDay('2026-11-02'), '1º dia útil de novembro de 2026 é segunda');
assert(!isReportDueDay('2026-11-15'), '15 de novembro de 2026 é domingo');
assert(isReportDueDay('2026-11-16'), 'dia 15 útil de novembro de 2026 cai na segunda');
assert(isReportDueDay('2026-08-03'), '1º de agosto de 2026 é sábado; a demanda vai para segunda');
assert(!isReportDueDay('2026-08-01'), 'sábado não gera relatório');
assert(nextReportDue('2026-10-02') === '2026-10-15', 'depois do dia 1, o próximo relatório é o dia 15');
assert(nextMonday('2026-10-01') === '2026-10-05', 'quinta seguinte segunda é dia 5');
assert(reportCycleKey('2026-09-01') === 'report_15d:2026-09-01', 'cycle key report');

assert(!isCrmMonday('2026-09-01'), '2026-09-01 é terça SP, não segunda');
assert(isCrmMonday('2026-08-31'), '2026-08-31 é segunda SP');
assert(!isCrmMonday('2026-09-02'), 'terça não é CRM');

const weekMonday = lastWeekRange('2026-08-31');
assert(
  weekMonday.from === '2026-08-24' && weekMonday.to === '2026-08-30',
  `semana anterior (segunda): ${weekMonday.from}..${weekMonday.to}`
);

const weekTuesday = lastWeekRange('2026-09-01');
assert(
  weekTuesday.from === '2026-08-25' && weekTuesday.to === '2026-08-31',
  `semana anterior (terça): ${weekTuesday.from}..${weekTuesday.to}`
);

assert(crmCycleKey('2026-08-31').startsWith('crm_weekly:'), 'crm cycle key');

const rotinaRows = [
  {
    id: 't1',
    client_id: 'c1',
    client_empresa: 'Lali',
    title: 'Relatório quinzenal — Lali',
    due_date: '2026-09-01',
    generation_key: 'report_15d:2026-09-01',
    demand_type: 'relatorio',
  },
];
assert(isRoutineDemandRow(rotinaRows[0]), 'row rotina');
const rotinaQueue = buildRotinaQueue(rotinaRows);
assert(rotinaQueue.length === 1 && rotinaQueue[0].routineKind === 'report', 'rotina queue');

assert(withoutWeeklyRoutineDemands([
  { id: 'w1', generation_key: 'weekly_review:c1:2026-09-07' },
  { id: 'd1', generation_key: 'report_15d:2026-09-01' },
]).length === 1, 'filtra demanda da rotina semanal');

const weeklyCards = buildWeeklyRoutineCards([
  {
    id: 'r1',
    kind: 'review',
    client_id: 'c1',
    empresa: 'Lali Pizzaria',
    week_start: '2026-09-07',
    task_due_date: '2026-09-14',
    finalized_at: null,
    task_completed: false,
    revision: 0,
  },
  {
    id: 'o1',
    kind: 'optimization',
    client_id: 'c1',
    empresa: 'Lali Pizzaria',
    week_start: '2026-09-14',
    task_due_date: '2026-09-16',
    finalized_at: null,
    task_completed: false,
    revision: 0,
  },
  {
    id: 'done',
    kind: 'review',
    client_id: 'c2',
    empresa: 'Feita',
    week_start: '2026-08-31',
    finalized_at: '2026-09-08T12:00:00Z',
    task_completed: true,
  },
], '2026-09-18');
assert(weeklyCards.length === 2, 'só rotinas em aberto');
assert(weeklyCards[0].overdue && weeklyCards[0].routineKind === 'analysis', 'análise atrasada fica no quadro');
assert(weeklyCards[1].routineKind === 'optimization' && weeklyCards[1].href.includes('review=o1'), 'otimização aponta para a rotina');

const upcomingClients = [
  {
    id: 'c1',
    empresa: 'Lali Pizzaria',
    settings: { enabled: true, review_weekday: 1, optimization_enabled: true, optimization_weekday: 3 },
    next_due_on: '2026-09-21',
    next_optimization_due_on: '2026-09-23',
  },
  {
    id: 'c2',
    empresa: 'Ana Júlia',
    settings: { enabled: true, review_weekday: 1 },
    next_due_on: '2026-09-21',
  },
  {
    id: 'c3',
    empresa: 'Desligada',
    settings: { enabled: false, review_weekday: 1 },
    next_due_on: '2026-09-21',
  },
  {
    id: 'c4',
    empresa: 'Atrasada sem tarefa',
    settings: { enabled: true, review_weekday: 1 },
    next_due_on: '2026-09-14',
  },
];
const upcomingAnalysis = buildUpcomingWeeklyCards(upcomingClients, {
  openReviews: weeklyCards.map((item) => item.review),
  today: '2026-09-19',
  kind: 'analysis',
});
assert(upcomingAnalysis.length === 1 && upcomingAnalysis[0].clientId === 'c2', 'próxima análise só de quem não tem tarefa aberta');
assert(upcomingAnalysis[0].kind === 'upcoming' && upcomingAnalysis[0].reason.includes('21/09/2026'), 'cartão futuro não é tarefa');
assert(
  !buildUpcomingWeeklyCards(upcomingClients, {
    openReviews: weeklyCards.map((item) => item.review),
    today: '2026-09-19',
    kind: 'optimization',
  }).length,
  'otimização aberta some da prévia'
);
const dueToday = buildUpcomingWeeklyCards(
  [{ id: 'c9', empresa: 'Hoje', settings: { enabled: true, review_weekday: 1 }, next_due_on: '2026-09-19' }],
  { today: '2026-09-19', kind: 'analysis' }
);
assert(dueToday[0]?.reason.startsWith('Hoje'), 'prazo de hoje sem tarefa aparece na prévia');

const board = partitionHojeBoard({
  agoraQueue: [{ id: 'u1', title: 'Pixel' }],
  rotinaQueue,
  weeklyCards,
  waitingRows: [{ id: 'w', client_id: 'c9', client_empresa: 'Casa', title: 'Espera', generation_key: 'weekly_optimization:x' }],
  today: '2026-09-18',
});
assert(board.atrasado.some((item) => item.routineKind === 'analysis'), 'análise vencida vai para Atrasado');
assert(board.atrasado.some((item) => item.routineKind === 'optimization'), 'otimização vencida vai para Atrasado');
assert(board.atrasado.some((item) => item.routineKind === 'report'), 'relatório vencido vai para Atrasado');
assert(board.aFazer.length === 0, 'nada no prazo neste exemplo');
assert(board.aguardando.length === 0, 'otimização não vai para aguardando');

const noPrazo = partitionHojeBoard({
  weeklyCards: [
    { id: 'open', kind: 'weekly', routineKind: 'analysis', overdue: false, title: 'Sul', review: { task_status: 'todo' } },
    { id: 'go', kind: 'weekly', routineKind: 'optimization', overdue: false, title: 'JR', review: { task_status: 'alteracao' } },
  ],
  today: '2026-09-30',
});
assert(noPrazo.aFazer.length === 2 && noPrazo.atrasado.length === 0, 'rotina no prazo fica em A fazer');
assert(noPrazo.aFazer.find((item) => item.id === 'go')?.started, 'status fora de A Fazer marca em andamento');

const waiting = waitingRowsFromBuckets({
  aguardando_cliente: [{ id: 'w1', client_id: 'c1', client_empresa: 'Casa', title: 'Espera criativo' }],
  revisoes_48h: [{ id: 'r48', client_id: 'c2', client_empresa: 'Lali', title: 'Revisão 72h' }],
  publicacoes_pendentes: [{ id: 'p1', client_id: 'c3', client_empresa: 'Sul', title: 'Publicar feirão' }],
  demais: [{ id: 'd2', client_id: 'c4', client_empresa: 'JR', title: 'Ajuste CPA' }],
});
const boardWait = partitionHojeBoard({ waitingRows: waiting });
assert(boardWait.aguardando.length === 1, `só espera do cliente fica em Aguardando: ${boardWait.aguardando.length}`);
assert(boardWait.aguardando[0].waitKind === 'aguardando_cliente', 'Aguardando é o cliente');
assert(boardWait.aFazer.some((item) => item.waitKind === 'revisoes_48h'), 'revisão 48h é trabalho, fica em A fazer');
assert(boardWait.aFazer.some((item) => item.waitKind === 'publicacoes_pendentes'), 'publicação fica em A fazer');
assert(boardWait.aFazer.some((item) => item.waitKind === 'demais'), 'demanda aberta fica em A fazer');

const agora = buildFazerAgoraQueue({
  dayRows: [{ client: { id: 'c1', empresa: 'Lali' }, quality: { code: 'roas_irreal' }, totals: { spend: 100, purchases: 10, purchaseValue: 5000 } }],
  weekRows: [],
  atrasadas: [],
  vencemHoje: [],
  openDemands: rotinaRows,
});
assert(!agora.some((i) => i.clientId === 'c1'), 'Meta some quando rotina aberta');

const crmUrl = buildCrmRoutineUrl('abc-123', '2026-09-01');
assert(crmUrl.includes('cliente_id=abc-123'), 'crm url cliente');
assert(crmUrl.includes('comprou=pendente'), 'crm url filtro');
assert(crmUrl.includes('from=2026-08-25'), 'crm url from');

if (failed) {
  console.error(`${failed} teste(s) falharam`);
  process.exit(1);
}
console.log('OK rotina fixa');

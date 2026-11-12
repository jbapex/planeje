import assert from 'node:assert/strict';
import test from 'node:test';
import { buildRoutineSheetUrl, campaignDraft, campaignCost, campaignComparison, lastClosedWeek, shiftDate, saoPauloDate, displayDate, displayDay, displayStamp, metricNumber, reviewMetrics, reviewState, reviewDraft, reviewDraftSignature, reviewAutosavePlan, reviewAutosaveLabel, reviewFillView, validateReview, routineRows, automaticRoutineDrafts, automaticRoutineError, routineCadenceLook, groupRoutineClients } from '../src/lib/trafficWeeklyReview.js';
import { parsePaidTrafficRoute, paidTrafficPaths } from '../src/lib/paidTrafficRoutes.js';

test('closed week is Monday–Sunday and stable around month, year and São Paulo midnight', () => {
  assert.equal(lastClosedWeek('2026-09-17'), '2026-09-07');
  assert.equal(lastClosedWeek('2026-09-21'), '2026-09-14');
  assert.equal(lastClosedWeek('2026-03-01'), '2026-02-16');
  assert.equal(lastClosedWeek('2027-01-01'), '2026-12-21');
  assert.equal(saoPauloDate(new Date('2026-09-21T02:30:00Z')), '2026-09-20');
  assert.equal(displayDate('2026-09-21T02:30:00Z'), '20/09/2026');
  assert.equal(shiftDate('2026-12-28', 6), '2027-01-03');
});

test('ads conversions remain separate from contacts and allow fractional attribution', () => {
  const row = campaignDraft({ account_id: 'qa-account', account_name: 'QA', campaign_name: 'QA', conversion_label: 'Lead', spend: 100, messages: 10, conversions: 12.5 });
  const draft = { ...reviewDraft({}), metric_mode: 'campaign', campaign_metrics: [row], analysis: 'Conferido', action_mode: 'none' };
  assert.equal(validateReview(draft, true), '');
  assert.equal(campaignCost(row), 8);
  assert.equal(campaignCost({ spend: 100, conversions: 0 }), null);
  assert.match(validateReview({ ...draft, campaign_metrics: [row, { ...row, id: 'another' }] }, true), /Não repita/);
  assert.match(validateReview({ ...draft, campaign_metrics: [{ ...row, spend: '-1' }] }, true), /números/);
});
test('optimization requires a meaningful record, not fabricated metrics or changes', () => {
  const draft = { ...reviewDraft({ kind: 'optimization' }), analysis: 'Conferi saldo e campanhas. Não precisou alterar.', action_mode: 'none' };
  assert.equal(validateReview(draft, true), '');
  assert.match(validateReview({ ...draft, analysis: '' }, true), /análise/);
  const board = { clients: [{ id: 'c', empresa: 'QA', manager_id: 'new' }], reviews: [{ client_id: 'c', kind: 'optimization', assignee_ids: ['old'], task_due_date: '2026-09-14' }] };
  const rows = routineRows(board, { mine: true, userId: 'old' });
  assert.equal(rows.length, 1); assert.equal(rows[0].pending.length, 0); assert.equal(rows[0].optimizations.length, 1);
  assert.equal(reviewState(board.reviews[0], '2026-09-17').label, 'Otimização atrasada');
});
test('campaign comparison follows identity across rename and keeps conversion definition separate', () => {
  const row = campaignDraft({ account_id: 'qa-account', campaign_id: 'ads-1', campaign_name: 'Nome anterior', conversion_label: 'Lead', spend: 100, conversions: 10 });
  const history = [{ id: 'new', kind: 'review', finalized_at: 'date', metric_mode: 'campaign', campaign_metrics: [{ ...row, campaign_name: 'Nome novo' }] },
    { id: 'old', finalized_at: 'date', metric_mode: 'campaign', campaign_metrics: [row] },
    { id: 'opt', kind: 'optimization', finalized_at: 'date', metric_mode: 'campaign', campaign_metrics: [row] }];
  assert.equal(campaignComparison(history).weeks.length, 2);
  assert.equal(campaignComparison(history).rows.length, 1);
  history[0].campaign_metrics[0].conversion_label = 'Compra';
  assert.equal(campaignComparison(history).rows.length, 2);
});
test('missing numbers stay missing, zeros stay valid, negative and fractional counts are rejected', () => {
  assert.equal(metricNumber(''), null); assert.equal(metricNumber('0'), 0);
  assert.equal(metricNumber('1.234,56'), 1234.56); assert.equal(metricNumber('1234.56'), 1234.56);
  assert.ok(Number.isNaN(metricNumber('-10'))); assert.ok(Number.isNaN(metricNumber('2.5', true)));
  const draft = reviewDraft({});
  assert.match(validateReview(draft, true), /Informe/);
  Object.assign(draft, { investment: '0', contacts: '0', analysis: 'Campanha sem saldo, conferida.', action_mode: 'none' });
  assert.equal(validateReview(draft, true), '');
});
test('conversion and cost use valid denominators; no results is not a free conversion', () => {
  assert.deepEqual(reviewMetrics({ investment: 600, contacts: 30, results: 6 }), { costPerResult: 100, conversionRate: 20 });
  assert.deepEqual(reviewMetrics({ investment: 600, contacts: 30, results: 0 }), { costPerResult: null, conversionRate: 0 });
  assert.deepEqual(reviewMetrics({ investment: 0, contacts: 0, results: null }), { costPerResult: null, conversionRate: null });
  assert.deepEqual(reviewMetrics({ investment: NaN, contacts: NaN, results: NaN }), { costPerResult: null, conversionRate: null });
  assert.match(validateReview({ ...reviewDraft({}), contacts: '5', results: '6' }), /não pode superar/);
});
test('review completion stops lateness independently of outstanding successor task', () => {
  const r = { task_due_date: '2026-09-14', revision: 1 };
  assert.equal(reviewState(r, '2026-09-17').overdue, true);
  assert.equal(reviewState({ ...r, finalized_at: '2026-09-17T12:00:00Z', action_completed: false }, '2026-09-17').overdue, false);
});
test('next action requires its own owner and deadline, with no default fabricated action', () => {
  const draft = { ...reviewDraft({}), investment: '100', contacts: '5', analysis: 'Revisão conferida.', action_mode: 'create' };
  assert.match(validateReview(draft, true), /responsável e prazo/);
  draft.action_draft = { title: 'Rever criativo', due_date: '2026-09-18', assignee_id: 'person' };
  assert.equal(validateReview(draft, true), '');
  assert.match(validateReview({ ...draft, action_mode: 'link', action_task_id: '' }, true), /Escolha a tarefa/);
});
test('my routine follows canonical task assignees even when account manager changed; disabled tasks remain', () => {
  const board = { clients: [{ id: 'c', empresa: 'Loja', manager_id: 'new', settings: { enabled: false } }],
    reviews: [{ id: 'r', client_id: 'c', assignee_ids: ['old'], task_due_date: '2026-09-14', finalized_at: null },
      { id: 'r2', client_id: 'c', finalized_at: 'date', action_task_id: 'action', action_completed: false }] };
  const rows = routineRows(board, { userId: 'old', mine: true });
  assert.equal(rows.length, 1); assert.equal(rows[0].pending.length, 1); assert.equal(rows[0].actions.length, 1);
  assert.equal(routineRows(board, { userId: 'other', mine: true }).length, 0);
});
test('weekly route works in the published traffic module, with existing routes preserved', () => {
  assert.equal(paidTrafficPaths.rotina(), '/paid-traffic/rotina');
  assert.equal(parsePaidTrafficRoute('/paid-traffic/rotina').trafficTab, 'rotina');
  assert.equal(parsePaidTrafficRoute('/paid-traffic/hoje').trafficTab, 'hoje');
  assert.equal(parsePaidTrafficRoute('/paid-traffic/campaigns/kanban').trafficTab, 'campaigns');
  assert.equal(
    buildRoutineSheetUrl({ clientId: 'c1', weekStart: '2026-09-28', kind: 'review' }),
    '/paid-traffic/rotina?cliente=c1&semana=2026-09-28'
  );
  assert.equal(
    buildRoutineSheetUrl({ clientId: 'c1', weekStart: '2026-09-28', kind: 'optimization', reviewId: 'r1' }),
    '/paid-traffic/rotina?cliente=c1&semana=2026-09-28&tipo=optimization&review=r1'
  );
  assert.equal(
    buildRoutineSheetUrl({ clientId: 'c1', weekStart: '2026-09-28', kind: 'review', reviewId: 'r1', assistant: 'new' }),
    '/paid-traffic/rotina?cliente=c1&semana=2026-09-28&review=r1&assistant=new'
  );
});

test('archived clients remain in history and completed today schedules next week; action assignee sees routine', () => {
  const board = {clients: [{id: 'c', empresa: 'Loja', eligible: false, manager_id: 'new', next_due_on: '2026-09-17'}], reviews: [{client_id: 'c', finalized_at: '2026-09-17T12:00:00Z', task_due_date: '2026-09-17', assignee_ids: ['old']}]};
  assert.equal(routineRows(board).length, 0);
  const history = routineRows(board, {userId: 'old', mine: true, includeHistory: true});
  assert.equal(history.length, 1); assert.equal(history[0].next_due_on, '2026-09-24');
  board.reviews[0].action_task_id = 'a'; board.reviews[0].action_completed = false; board.reviews[0].action_assignee_ids = ['action-owner'];
  assert.equal(routineRows(board, {userId: 'action-owner', mine: true}).length, 1);
});
test('automatic weekly tasks stay opt-in per selected client', () => {
  const clients = [
    { id: 'ana', empresa: 'Ana Júlia', manager_id: 'rafa', eligible: true, settings: { enabled: true, starts_on: '2026-09-18', result_label: 'Mensagens' } },
    { id: 'lali', empresa: 'Lali', manager_id: 'rafa', eligible: true },
    { id: 'rio', empresa: 'Rio Sul', manager_id: null, eligible: true },
    { id: 'off', empresa: 'Encerrado', eligible: false, manager_id: 'rafa' },
  ];
  assert.equal(automaticRoutineError([], { reviewEnabled: true, optimizationEnabled: true }), 'Escolha pelo menos um cliente.');
  assert.equal(automaticRoutineError([{ clientId: 'lali' }], { reviewEnabled: false, optimizationEnabled: false }), 'Ligue a análise, a otimização, ou as duas.');
  const none = automaticRoutineDrafts({ clients, selectedIds: ['rio'], today: '2026-09-19' });
  assert.equal(none[0].missingAssignee, true);
  assert.match(automaticRoutineError(none, { reviewEnabled: true, optimizationEnabled: true }), /gestor/);
  const drafts = automaticRoutineDrafts({
    clients,
    selectedIds: ['ana', 'lali', 'off', 'missing'],
    reviewEnabled: true,
    reviewWeekday: 1,
    optimizationEnabled: true,
    optimizationWeekday: 3,
    today: '2026-09-19',
  });
  assert.equal(drafts.length, 2);
  assert.equal(drafts.find((d) => d.clientId === 'ana').starts_on, '2026-09-18');
  assert.equal(drafts.find((d) => d.clientId === 'ana').result_label, 'Mensagens');
  assert.equal(drafts.find((d) => d.clientId === 'lali').starts_on, '2026-09-19');
  assert.equal(drafts.every((d) => d.enabled && d.optimization_enabled && d.assignee === 'rafa'), true);
  assert.equal(automaticRoutineError(drafts, { reviewEnabled: true, optimizationEnabled: true }), '');
});

test('routine list hides off cadences and shortens the next due date', () => {
  assert.equal(displayDay('2026-09-21'), '21/09');
  assert.equal(routineCadenceLook({ enabled: false, kind: 'review' }), null);
  const scheduled = routineCadenceLook({
    enabled: true,
    nextDue: '2026-09-21',
    weekday: 1,
    today: '2026-09-19',
    kind: 'review',
  });
  assert.equal(scheduled.tag, 'Análise');
  assert.equal(scheduled.title, 'Seg');
  assert.equal(scheduled.detail, '21/09');
  assert.equal(scheduled.tone, 'scheduled');
  const open = routineCadenceLook({
    records: [{ kind: 'optimization', task_due_date: '2026-09-16' }],
    today: '2026-09-19',
    kind: 'optimization',
  });
  assert.equal(open.title, 'Atrasada');
  assert.equal(open.tone, 'late');
});

test('routine shelves separate late clients and keep the oldest delay first', () => {
  const today = '2026-10-01';
  const client = (empresa, pending, optimizations, next) => ({
    id: empresa,
    empresa,
    pending,
    optimizations,
    settings: { enabled: true, optimization_enabled: true, review_weekday: 1, optimization_weekday: 3 },
    next_due_on: next || '',
    next_optimization_due_on: '',
  });
  const lateOld = client('3 Irmãos', [{ kind: 'review', task_due_date: '2026-09-25' }], [{ kind: 'optimization', task_due_date: '2026-09-30' }]);
  const lateNew = client('Lali', [{ kind: 'review', task_due_date: '2026-09-28' }], []);
  const open = client('JR CAR', [{ kind: 'review', task_due_date: '2026-10-05' }], []);
  const next = client('Lovato', [], [], '2026-10-05');
  const off = client('Sem rotina', [], []);
  off.settings = { enabled: false, optimization_enabled: false };
  const grouped = groupRoutineClients([lateNew, next, lateOld, off, open], today, 'all');
  assert.deepEqual(grouped.shelves.map((shelf) => shelf.id), ['late', 'open', 'next', 'off']);
  assert.deepEqual(grouped.shelves[0].items.map((item) => item.client.empresa), ['3 Irmãos', 'Lali']);
  assert.equal(grouped.counts.late, 2);
  assert.equal(grouped.counts.review, 3);
  const onlyLate = groupRoutineClients([lateNew, next, lateOld, open], today, 'late');
  assert.deepEqual(onlyLate.shelves.map((shelf) => shelf.id), ['late']);
  const onlyOpt = groupRoutineClients([lateOld, open], today, 'optimization');
  assert.deepEqual(onlyOpt.shelves[0].items.map((item) => item.client.empresa), ['3 Irmãos']);
});

test('autosave grava o rascunho válido e linha incompleta não bloqueia o texto', () => {
  const draft = { ...reviewDraft({}), analysis: 'Fluxo melhorou', action_mode: 'none' };
  const saved = reviewDraftSignature(draft);
  assert.equal(reviewAutosavePlan({ draft, savedSignature: saved }).action, 'skip');
  const next = { ...draft, analysis: 'Fluxo melhorou bastante' };
  const plan = reviewAutosavePlan({ draft: next, savedSignature: saved });
  assert.equal(plan.action, 'save');
  assert.equal(plan.finalize, false);
  assert.equal(reviewAutosavePlan({ draft: next, savedSignature: saved, readonly: true }).action, 'skip');
  const broken = {
    ...next,
    metric_mode: 'campaign',
    campaign_metrics: [{ ...campaignDraft({ spend: '10' }), account_id: '', account_name: '', campaign_name: '' }],
  };
  const draftOk = reviewAutosavePlan({ draft: broken, savedSignature: saved });
  assert.equal(draftOk.action, 'save');
  const waiting = reviewAutosavePlan({ draft: broken, savedSignature: saved, finalize: true });
  assert.equal(waiting.action, 'wait');
  assert.match(waiting.reason, /conta/);
  const conclude = reviewAutosavePlan({ draft: { ...next, analysis: '' }, savedSignature: saved, finalize: true });
  assert.equal(conclude.action, 'wait');
  assert.equal(reviewAutosaveLabel('saved'), 'Salvo');
  assert.match(reviewAutosaveLabel('wait', waiting.reason), /conta/);
});

test('fill date is when the manager wrote, separate from the ads week', () => {
  assert.match(displayStamp('2026-09-23T03:18:00Z'), /23\/09\/2026 às 00:18/);
  const empty = reviewFillView([], { review: { revision: 0, week_start: '2026-09-14' } });
  assert.equal(empty.headline, 'Ainda não preenchido.');
  const actor = { full_name: 'Rafael' };
  const draft = (id, at, analysis, extra = {}) => ({
    id, event: 'draft', occurred_at: at, actor_id: 'rafa', actor,
    snapshot: { before: { analysis: '', campaign_metrics: [] }, after: { analysis, campaign_metrics: [], ...extra } },
  });
  const burst = reviewFillView([
    draft(1, '2026-09-23T03:12:00Z', 'Fluxo melhorou'),
    draft(2, '2026-09-23T03:20:00Z', 'Fluxo melhorou bastante'),
    draft(3, '2026-09-23T06:00:00Z', 'Fluxo melhorou bastante', { data_note: 'CRM conferido' }),
  ]);
  assert.equal(burst.lines.length, 2);
  assert.match(burst.headline, /Preenchido em 23\/09\/2026 às 00:12 · Rafael/);
  assert.match(burst.headline, /alterado em 23\/09\/2026 às 03:00/);
  assert.doesNotMatch(burst.headline, /observações/);
  assert.match(burst.lines[0].text, /observações/);
  const late = routineCadenceLook({
    records: [{ kind: 'review', task_due_date: '2026-09-21', revision: 2, updated_at: '2026-09-23T03:18:00Z' }],
    today: '2026-09-23',
    kind: 'review',
  });
  assert.equal(late.detail, '21/09 · alterada 23/09');
});

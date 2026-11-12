import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { onboardingOverview, onboardingDue, validateOnboardingTemplate, orderChecklistColumns, orderChecklistItems } from '../src/lib/clientOnboarding.js';

test('client and internal pendencies are derived from the current stage, not future work', () => {
  const run = { id: 'run', status: 'active' };
  const stages = [
    { onboarding_id: 'another', state: 'active', position: 1 },
    { id: 'last', onboarding_id: 'run', state: 'locked', position: 3, pending_side: 'internal' },
    { id: 'now', onboarding_id: 'run', state: 'active', position: 2, pending_side: 'client', task_id: 'task' },
    { id: 'first', onboarding_id: 'run', state: 'completed', position: 1 },
  ];
  const view = onboardingOverview(run, stages, [{ id: 'task', due_date: '2026-09-21' }]);
  assert.equal(view.side, 'client'); assert.equal(view.total, 3); assert.equal(view.progress, 33);
  assert.equal(view.task.due_date, '2026-09-21'); assert.equal(view.stages[0].id, 'first');
  assert.equal(onboardingOverview({ ...run, status: 'completed' }, stages).side, 'completed');
});
test('today is a due date, past dates alone are overdue; completion has no active deadline', () => {
  const now = new Date(2026, 8, 16, 23, 30);
  assert.equal(onboardingDue('2026-09-16', now).overdue, false);
  assert.equal(onboardingDue('2026-09-15', now).overdue, true);
  assert.equal(onboardingDue('2026-09-17', now).text, '17/09/2026');
  assert.equal(onboardingOverview({ id: 'r', status: 'completed' }, [{ onboarding_id: 'r', state: 'completed', position: 1 }]).current, null);
});
test('templates reject an empty sequence, missing titles and non-integer deadlines', () => {
  assert.ok(validateOnboardingTemplate({ name: 'Entry', stages: [] }));
  assert.ok(validateOnboardingTemplate({ name: 'Entry', stages: [{ title: '', pending_side: 'internal', sla_days: 1 }] }));
  for (const days of ['', -1, 1.5, 366]) assert.ok(validateOnboardingTemplate({ name: 'Entry', stages: [{ title: 'Action', pending_side: 'client', sla_days: days }] }));
  assert.equal(validateOnboardingTemplate({ name: 'Entry', stages: [{ title: 'Action', pending_side: 'client', sla_days: 0 }] }), '');
});
test('columns with an overdue or nearer open task come first', () => {
  const clients = [
    { id: 'done', empresa: '3 Irmãos' },
    { id: 'later', empresa: 'AgroMaster Sul' },
    { id: 'soon', empresa: 'Casa D' },
    { id: 'late', empresa: 'Ana' },
  ];
  const checklists = [
    { client_id: 'done', items: [{ is_completed: true, due_date: '2026-01-01T23:59:59.000Z' }] },
    { client_id: 'later', items: [{ is_completed: false, due_date: '2026-12-01T23:59:59.000Z' }] },
    { client_id: 'soon', items: [{ is_completed: false, due_date: '2026-10-03T23:59:59.000Z' }, { is_completed: false, due_date: '2026-11-01T23:59:59.000Z' }] },
    { client_id: 'late', items: [{ is_completed: true, due_date: '2026-01-01T23:59:59.000Z' }, { is_completed: false, due_date: '2026-05-13T23:59:59.000Z' }] },
  ];
  assert.deepEqual(orderChecklistColumns(clients, checklists).map((client) => client.id), ['late', 'soon', 'later', 'done']);
  assert.deepEqual(orderChecklistItems(checklists[2].items).map((item) => item.due_date.slice(0, 10)), ['2026-10-03', '2026-11-01']);
});
test('the onboarding page opens on the column checklist and a line becomes a task only when asked', () => {
  const page = readFileSync(new URL('../src/components/pages/Onboarding.jsx', import.meta.url), 'utf8');
  const columns = readFileSync(new URL('../src/components/onboarding/OnboardingLegacy.jsx', import.meta.url), 'utf8');
  const item = readFileSync(new URL('../src/components/onboarding/OnboardingTaskItemInline.jsx', import.meta.url), 'utf8');
  const sql = readFileSync(new URL('../supabase/migrations/20261002140000_onboarding_checklist_virar_tarefa.sql', import.meta.url), 'utf8');
  const mcp = readFileSync(new URL('../planeje-mcp/src/hubTools.ts', import.meta.url), 'utf8');
  assert.match(page, /if \(!stagesView\) return <OnboardingLegacy onOpenStages=/);
  assert.match(page, /className="onboarding-list"/);
  assert.match(page, /open_client_onboarding_stage/);
  assert.doesNotMatch(page, /onboarding-board/);
  assert.match(columns, /isClienteAtivoNaCarteira/);
  assert.match(columns, /Por etapas/);
  assert.match(columns, /type: 'onboarding'/);
  assert.match(item, /title="Virar tarefa"/);
  assert.match(sql, /DROP INDEX IF EXISTS public.client_onboarding_one_current_stage/);
  assert.match(sql, /CREATE FUNCTION public.open_client_onboarding_stage/);
  assert.doesNotMatch(sql, /activate_client_onboarding_stage\(v_next\)/);
  assert.doesNotMatch(sql, /activate_client_onboarding_stage\(v_first\)/);
  assert.match(mcp, /listar_checklist_onboarding/);
  assert.match(mcp, /adicionar_item_checklist/);
  assert.match(mcp, /virar_tarefa_checklist/);
  assert.match(mcp, /virar_tarefa_onboarding/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

// Load the actual engine and API resolver without bundling or contacting Supabase.
// Only module imports are redirected; executor and query-building code run unchanged.
const engineSource = await fs.readFile(new URL('../src/lib/workflow.js', import.meta.url), 'utf8');
const apiSource = await fs.readFile(new URL('../src/lib/operationalFunctionsApi.js', import.meta.url), 'utf8');
const rulesUrl = new URL('../src/lib/operationalWorkflow.js', import.meta.url).href;
const dateFnsUrl = import.meta.resolve('date-fns');
const dataUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
let instance = 0;
const copy = value => value == null ? value : structuredClone(value);

function memoryDb({ automations = [], tasks = [], functions = [], profiles = [], failRead, rpcError = null } = {}) {
  const tables = { task_automations: copy(automations), tarefas: copy(tasks), task_operational_functions: copy(functions), profiles: copy(profiles) };
  const operations = [];
  const client = {
    from(table) {
      const request = { table, operation: 'select', filters: [] };
      const query = {
        select(columns = '*') { request.columns = columns; return this; },
        eq(column, value) { request.filters.push(row => row[column] === value); return this; },
        in(column, values) { request.filters.push(row => values.includes(row[column])); return this; },
        order() { return this; },
        update(patch) { request.operation = 'update'; request.patch = copy(patch); return this; },
        single() { request.single = true; return this; },
        maybeSingle() { request.single = true; return this; },
        then(resolve, reject) {
          operations.push({ table, operation: request.operation, patch: copy(request.patch), columns: request.columns });
          const error = request.operation === 'select' ? failRead?.(request) : null;
          if (error) return Promise.resolve({ data: null, error }).then(resolve, reject);
          const rows = (tables[table] || []).filter(row => request.filters.every(filter => filter(row)));
          if (request.operation === 'update') rows.forEach(row => Object.assign(row, copy(request.patch)));
          return Promise.resolve({ data: copy(request.single ? rows[0] || null : rows), error: null }).then(resolve, reject);
        },
      };
      return query;
    },
    async rpc(name, params) {
      operations.push({ operation: 'rpc', name, params });
      assert.equal(name, 'move_task_to_social_media');
      if (rpcError) return { error: rpcError };
      const task = tables.tarefas.find(row => row.id === params.task_id);
      Object.assign(task, { type: 'social_media', status: 'completed', assignee_ids: [] });
      return { data: null, error: null };
    },
  };
  return { client, tables, operations, writes: () => operations.filter(op => op.operation !== 'select') };
}

async function loadEngine(t, db) {
  const key = `__planejeWorkflowTest${++instance}`;
  globalThis[key] = db.client;
  t.after(() => { delete globalThis[key]; });
  t.mock.method(console, 'error', () => {});
  t.mock.method(console, 'warn', () => {});
  const replaceClient = source => source.replace("import { supabase } from '@/lib/customSupabaseClient';", `const supabase = globalThis[${JSON.stringify(key)}];`);
  const apiUrl = dataUrl(replaceClient(apiSource));
  const source = replaceClient(engineSource)
    .replace("from 'date-fns'", `from ${JSON.stringify(dateFnsUrl)}`)
    .replace("from '@/lib/operationalWorkflow'", `from ${JSON.stringify(rulesUrl)}`)
    .replace("from '@/lib/operationalFunctionsApi'", `from ${JSON.stringify(apiUrl)}`);
  assert.ok(!source.includes("from '@/"), 'all runtime dependencies are explicitly redirected');
  return import(dataUrl(source));
}

const staff = id => ({ id, full_name: id, status: 'active', role: 'colaborador' });
const task = (id = 't1') => ({ id, type: 'post', status: 'review', priority: 'medium', operational_function_id: null, demand_type: null, demand_origin: null, sla_days: null, review_round: 0, assignee_ids: ['original'], status_history: [], stage_execution_history: [], post_date: '2026-09-15' });
const rule = (id, actions, config = {}) => ({ id, is_active: true, trigger_type: 'status_change', trigger_config: config, actions });
const event = { old_status: 'production', new_status: 'review' };
const functionAction = (mode = 'replace', id = 'validation') => ({ type: 'assign_function', config: { function_id: id, mode } });
const fn = occupants => ({ id: 'validation', name: 'Validação', is_active: true, assignee_ids: occupants });

test('real engine keeps legacy add/remove assignment and does not depend on new tables', async t => {
  const db = memoryDb({ tasks: [task()], automations: [rule('legacy', [
    { type: 'set_assignee', config: { assignee_ids: ['new', 'new'] } },
    { type: 'remove_assignee', config: { assignee_ids: ['original'] } },
    { type: 'change_priority', config: { priority: 'high' } },
  ])], failRead: request => ['task_operational_functions', 'profiles'].includes(request.table) ? new Error('new tables unavailable') : null });
  const engine = await loadEngine(t, db);
  const result = await engine.executeAutomation('t1', 'status_change', event);
  assert.equal(result.success, true);
  assert.deepEqual(db.tables.tarefas[0].assignee_ids, ['new']);
  assert.equal(db.tables.tarefas[0].priority, 'high');
  assert.equal(db.tables.tarefas[0].status_history.at(-1).automation, true);
  assert.ok(!db.operations.some(op => ['task_operational_functions', 'profiles'].includes(op.table)));
});

test('legacy previous-assignee return uses its old status history including user_id fallback', async t => {
  const row = task();
  row.status_history = [{ status: 'todo', assignee_ids: ['old'] }, { status: 'todo', user_id: 'planner' }];
  const db = memoryDb({ tasks: [row], automations: [rule('legacy', [{ type: 'reassign_previous', config: { from_status: 'todo' } }])] });
  const engine = await loadEngine(t, db);
  assert.equal((await engine.executeAutomation('t1', 'status_change', event)).success, true);
  assert.deepEqual(db.tables.tarefas[0].assignee_ids, ['planner']);
});

test('legacy remove-all continues to take precedence over previous-assignee return', async t => {
  const row = task();
  row.status_history = [{ status: 'todo', assignee_ids: ['planner'] }];
  const db = memoryDb({ tasks: [row], automations: [rule('legacy', [
    { type: 'remove_assignee', config: { assignee_ids: [] } },
    { type: 'reassign_previous', config: { from_status: 'todo' } },
  ])] });
  const engine = await loadEngine(t, db);
  assert.equal((await engine.executeAutomation('t1', 'status_change', event)).success, true);
  assert.deepEqual(db.tables.tarefas[0].assignee_ids, []);
});

for (const rpcError of [null, { message: 'RPC unavailable' }]) {
  test(`legacy move still transfers to Social completed (${rpcError ? 'update fallback' : 'RPC'})`, async t => {
    const db = memoryDb({ tasks: [task()], rpcError, automations: [rule('legacy', [
      { type: 'move_task', config: {} },
      { type: 'change_priority', config: { priority: 'high' } },
    ])] });
    const engine = await loadEngine(t, db);
    const result = await engine.executeAutomation('t1', 'status_change', event);
    assert.equal(result.success, true);
    assert.equal(db.tables.tarefas[0].type, 'social_media');
    assert.equal(db.tables.tarefas[0].status, 'completed');
    assert.deepEqual(db.tables.tarefas[0].assignee_ids, []);
    assert.equal(db.tables.tarefas[0].post_date, '2026-09-15');
    assert.equal(db.tables.tarefas[0].priority, 'high');
    assert.equal(result.results[0].result.updatedTask.status, 'completed');
    assert.equal(db.writes()[0].operation, 'update', 'non-move actions execute before the move');
  });
}

for (const invalidFunction of [null, { ...fn(['validator']), is_active: false }, fn([]), fn(['missing'])]) {
  test(`all matched rules preflight before any write when a later destination is ${JSON.stringify(invalidFunction)}`, async t => {
    const db = memoryDb({ tasks: [task()], profiles: [staff('validator')], functions: invalidFunction ? [invalidFunction] : [], automations: [
      rule('legacy-first', [{ type: 'change_status', config: { status: 'published' } }]),
      rule('valid-second', [functionAction('add', 'known')]),
      rule('invalid-last', [{ type: 'remove_assignee', config: { assignee_ids: [] } }, functionAction()]),
    ] });
    db.tables.task_operational_functions.push({ ...fn(['validator']), id: 'known' });
    const engine = await loadEngine(t, db);
    const result = await engine.executeAutomation('t1', 'status_change', event);
    assert.equal(result.success, false);
    assert.ok(result.error?.message);
    assert.deepEqual(db.writes(), [], 'even the earlier legacy status update must not execute');
    assert.deepEqual(db.tables.tarefas[0].assignee_ids, ['original']);
    assert.equal(db.tables.tarefas[0].status, 'review');
  });
}

for (const mode of ['add', 'replace']) {
  test(`real resolver/executor applies function ${mode} using current active occupants`, async t => {
    const db = memoryDb({ tasks: [task()], functions: [fn(['validator'])], profiles: [staff('validator')], automations: [rule('function', [functionAction(mode)])] });
    const engine = await loadEngine(t, db);
    assert.equal((await engine.executeAutomation('t1', 'status_change', event)).success, true);
    assert.deepEqual(db.tables.tarefas[0].assignee_ids, mode === 'add' ? ['original', 'validator'] : ['validator']);
    assert.equal(db.tables.tarefas[0].operational_function_id, 'validation');
    assert.equal(db.writes().length, 1, 'remove-all compilation does not persist an intermediate empty destination');
    assert.ok(db.writes()[0].patch.assignee_ids.length > 0);
  });
}

test('changing function occupants takes effect on the next task even with cached automation definitions', async t => {
  const db = memoryDb({ tasks: [task('t1'), task('t2')], functions: [fn(['validator'])], profiles: [staff('validator'), staff('replacement')], automations: [rule('function', [functionAction()])] });
  const engine = await loadEngine(t, db);
  await engine.executeAutomation('t1', 'status_change', event);
  db.tables.task_operational_functions[0].assignee_ids = ['replacement'];
  await engine.executeAutomation('t2', 'status_change', event);
  assert.deepEqual(db.tables.tarefas[0].assignee_ids, ['validator']);
  assert.deepEqual(db.tables.tarefas[1].assignee_ids, ['replacement']);
  assert.equal(db.operations.filter(op => op.table === 'task_automations').length, 1);
  assert.equal(db.operations.filter(op => op.table === 'task_operational_functions').length, 2);
});

test('real resolver returns the last producer who exited production, independently of todo and in-stage edits', async t => {
  const row = task();
  row.status_history = [{ status: 'todo', assignee_ids: ['planner'] }];
  row.stage_execution_history = [
    { from_status: 'todo', to_status: 'production', from_assignee_ids: ['planner'] },
    { from_status: 'production', to_status: 'review', from_assignee_ids: ['first-producer'] },
    { from_status: 'review', to_status: 'production', from_assignee_ids: ['validator'] },
    { from_status: 'production', to_status: 'review', from_assignee_ids: ['latest-producer'] },
    { from_status: 'production', to_status: 'production', from_assignee_ids: ['in-stage-change'] },
  ];
  const db = memoryDb({ tasks: [row], profiles: ['planner', 'first-producer', 'latest-producer', 'in-stage-change', 'validator'].map(staff), automations: [rule('producer', [
    { type: 'change_status', config: { status: 'production' } },
    { type: 'reassign_producer', config: { production_status: 'production' } },
  ])] });
  const engine = await loadEngine(t, db);
  assert.equal((await engine.executeAutomation('t1', 'status_change', event)).success, true);
  assert.deepEqual(db.tables.tarefas[0].assignee_ids, ['latest-producer']);
  assert.equal(db.tables.tarefas[0].status, 'production');
  assert.equal(db.writes().length, 1);
});

test('missing producer history or unavailable producer prevents prior matching writes', async t => {
  for (const history of [[], [{ from_status: 'production', to_status: 'review', from_assignee_ids: ['inactive'] }]]) {
    const row = task();
    row.stage_execution_history = history;
    const db = memoryDb({ tasks: [row], profiles: [{ ...staff('inactive'), status: 'inactive' }], automations: [
      rule('first', [{ type: 'remove_assignee', config: { assignee_ids: [] } }]),
      rule('return', [{ type: 'reassign_producer', config: { production_status: 'production' } }]),
    ] });
    const engine = await loadEngine(t, db);
    const result = await engine.executeAutomation('t1', 'status_change', event);
    assert.equal(result.success, false);
    assert.deepEqual(db.writes(), []);
  }
});

test('unmatched operational rules do not block or query dependencies for matched legacy rules', async t => {
  const db = memoryDb({ tasks: [task()], automations: [
    rule('matched', [{ type: 'set_assignee', config: { assignee_ids: ['new'] } }], { to_status: 'review' }),
    rule('unmatched', [functionAction('replace', 'missing')], { to_status: 'completed' }),
  ] });
  const engine = await loadEngine(t, db);
  const result = await engine.executeAutomation('t1', 'status_change', event);
  assert.equal(result.success, true);
  assert.equal(result.matchedCount, 1);
  assert.deepEqual(db.tables.tarefas[0].assignee_ids, ['original', 'new']);
  assert.ok(!db.operations.some(op => op.table === 'task_operational_functions'));
});

test('a resolver read error aborts all matching writes rather than degrading to empty assignments', async t => {
  const db = memoryDb({ tasks: [task()], functions: [fn(['validator'])], profiles: [staff('validator')], automations: [rule('function', [functionAction()])], failRead: request => request.table === 'profiles' ? new Error('database unavailable') : null });
  const engine = await loadEngine(t, db);
  const result = await engine.executeAutomation('t1', 'status_change', event);
  assert.equal(result.success, false);
  assert.equal(result.error.message, 'database unavailable');
  assert.deepEqual(db.writes(), []);
});

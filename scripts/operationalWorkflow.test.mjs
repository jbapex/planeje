import test from 'node:test';
import assert from 'node:assert/strict';
import { functionAssignees, producerAssignees, producerFunctionId, compileOperationalActions, actionConfigurationIssues } from '../src/lib/operationalWorkflow.js';

const profiles = ['planner', 'producer-a', 'producer-b', 'validator', 'traffic'].map(id => ({ id, status: 'active', role: 'colaborador' }));
const functions = [{ id: 'validation', name: 'Validação', assignee_ids: ['validator'], is_active: true }];
const trace = [
  { from_status: 'todo', to_status: 'production', from_assignee_ids: ['planner'] },
  { from_status: 'production', to_status: 'review', from_assignee_ids: ['producer-a'] },
  { from_status: 'review', to_status: 'production', from_assignee_ids: ['validator'] },
  { from_status: 'production', to_status: 'production', from_assignee_ids: ['producer-a'] },
  { from_status: 'production', to_status: 'review', from_assignee_ids: ['producer-b'] },
  { from_status: 'review', to_status: 'review', from_assignee_ids: ['validator'] },
];

test('function assignment deduplicates occupants and compiles add versus replace', () => {
  const fn = { ...functions[0], assignee_ids: ['validator', 'validator', 'traffic'] };
  assert.deepEqual(functionAssignees(fn, profiles), ['validator', 'traffic']);
  const make = mode => compileOperationalActions([{ type: 'assign_function', config: { function_id: fn.id, mode } }], { functions: [fn], profiles });
  assert.deepEqual(make('add'), [{ type: 'set_operational_function', config: { function_id: 'validation' } }, { type: 'set_assignee', config: { assignee_ids: ['validator', 'traffic'] } }]);
  assert.deepEqual(make('replace'), [{ type: 'set_operational_function', config: { function_id: 'validation' } }, { type: 'remove_assignee', config: { assignee_ids: [] } }, { type: 'set_assignee', config: { assignee_ids: ['validator', 'traffic'] } }]);
});

test('missing, inactive, empty or unavailable function occupants fail rather than resolve an empty destination', () => {
  for (const fn of [null, { ...functions[0], is_active: false }, { ...functions[0], assignee_ids: [] }, { ...functions[0], assignee_ids: ['missing'] }]) {
    assert.throws(() => functionAssignees(fn, profiles));
  }
  for (const invalid of [{ id: 'validator', status: 'inactive', role: 'colaborador' }, { id: 'validator', status: 'active', role: 'cliente' }]) {
    assert.throws(() => functionAssignees(functions[0], [invalid]), /indisponível/);
  }
});

test('return to producer selects the latest production exit, not todo owner or an intra-stage reassignment', () => {
  const latestWithReassignment = [...trace, { from_status: 'production', to_status: 'production', from_assignee_ids: ['traffic'] }];
  assert.deepEqual(producerAssignees(latestWithReassignment, 'production', profiles), ['producer-b']);
  assert.deepEqual(compileOperationalActions([{ type: 'reassign_producer', config: { production_status: 'production' } }], {
    functions, profiles, task: { stage_execution_history: latestWithReassignment },
  }), [{ type: 'remove_assignee', config: { assignee_ids: [] } }, { type: 'set_assignee', config: { assignee_ids: ['producer-b'] } }]);
});

test('return to producer restores the recorded operational function when available', () => {
  const withFunction = trace.map((entry, index) => index === 4 ? { ...entry, from_operational_function_id: 'design' } : entry);
  assert.equal(producerFunctionId(withFunction, 'production'), 'design');
  assert.deepEqual(compileOperationalActions([{ type: 'reassign_producer', config: { production_status: 'production' } }], {
    functions, profiles, task: { stage_execution_history: withFunction },
  })[0], { type: 'set_operational_function', config: { function_id: 'design' } });
});

test('workflow return selects the latest real production stage for each material', () => {
  const workflowTrace = [
    { from_status: 'roteiro', to_status: 'aprovacao_roteiro', from_assignee_ids: ['producer-a'], from_workflow_stage_kind: 'production', from_operational_function_id: 'script' },
    { from_status: 'aprovacao_roteiro', to_status: 'gravacao', from_assignee_ids: ['validator'], from_workflow_stage_kind: 'review' },
    { from_status: 'gravacao', to_status: 'edicao', from_assignee_ids: ['producer-a'], from_workflow_stage_kind: 'production', from_operational_function_id: 'recording' },
    { from_status: 'edicao', to_status: 'review', from_assignee_ids: ['producer-b'], from_workflow_stage_kind: 'production', from_operational_function_id: 'editing' },
    { from_status: 'review', to_status: 'josias', from_assignee_ids: ['validator'], from_workflow_stage_kind: 'review' },
  ];
  assert.deepEqual(producerAssignees(workflowTrace, '__last_workflow_production__', profiles), ['producer-b']);
  assert.equal(producerFunctionId(workflowTrace, '__last_workflow_production__'), 'editing');
  assert.deepEqual(actionConfigurationIssues([{ type: 'reassign_producer', config: { production_status: '__last_workflow_production__' } }], {
    functions, profiles, statusOptions: [],
  }), []);
});

test('a missing or inactive latest producer does not silently fall back to a prior producer', () => {
  assert.throws(() => producerAssignees([], 'production', profiles), /não tem registro/);
  assert.throws(() => producerAssignees(trace, '', profiles), /etapa de produção/);
  assert.throws(() => producerAssignees([...trace, { from_status: 'production', to_status: 'review', from_assignee_ids: [] }], 'production', profiles), /não tem registro/);
  assert.throws(() => producerAssignees(trace, 'production', profiles.filter(p => p.id !== 'producer-b')), /indisponível/);
});

test('legacy action configuration and order are preserved by compilation', () => {
  const actions = [
    { type: 'set_assignee', config: { assignee_ids: ['planner'] } },
    { type: 'remove_assignee', config: { assignee_ids: ['validator'] } },
    { type: 'reassign_previous', config: { from_status: 'todo' } },
    { type: 'move_task', config: { destination: 'social_media_completed' } },
  ];
  const result = compileOperationalActions(actions, { functions, profiles, task: {} });
  assert.deepEqual(result, actions);
  result.forEach((action, index) => assert.equal(action, actions[index]));
});

test('editor diagnostics reject incomplete new destinations and accept a fully configured return', () => {
  assert.ok(actionConfigurationIssues([{ type: 'assign_function', config: { function_id: 'missing', mode: 'invalid' } }], { functions, profiles }).length >= 2);
  assert.deepEqual(actionConfigurationIssues([{ type: 'reassign_producer', config: { production_status: 'production' } }], {
    functions, profiles, statusOptions: [{ value: 'production' }],
  }), []);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTeamProfilePatch, saveTeamProfileEdit, teamProfileStatusLabel } from '../src/lib/teamProfileEditor.js';

const original = { id: 'person-1', role: 'colaborador', status: 'pending', full_name: 'Pessoa de teste' };

test('activating a profile sends only status, preserving a permission changed elsewhere', async () => {
  let actualPatch;
  const result = await saveTeamProfileEdit(original, { role: original.role, status: 'active' }, async (id, patch) => {
    actualPatch = patch;
    return { data: { id, role: 'admin', status: 'active' }, error: null };
  });
  assert.deepEqual(actualPatch, { status: 'active' });
  assert.equal(result.profile.role, 'admin');
  assert.equal(result.changed, true);
});

test('changing only permission does not write the known registration status', () => {
  assert.deepEqual(buildTeamProfilePatch(original, { role: 'admin', status: 'pending' }), { role: 'admin' });
});

test('undefined, null and legacy statuses are retained when editing only permission', () => {
  for (const status of [undefined, null, '', 'legacy-value']) {
    assert.equal(teamProfileStatusLabel(status), 'Não definido');
    assert.deepEqual(buildTeamProfilePatch({ ...original, status }, { role: 'admin', status }), { role: 'admin' });
  }
});

test('an explicit registration choice can replace an unknown status without changing permission', () => {
  assert.deepEqual(buildTeamProfilePatch({ ...original, status: null }, { role: original.role, status: 'pending' }), { status: 'pending' });
});

test('changing both fields writes only those fields and ignores unrelated profile data', () => {
  assert.deepEqual(buildTeamProfilePatch(original, { role: 'admin', status: 'inactive', full_name: 'Outro nome', id: 'other' }), { role: 'admin', status: 'inactive' });
});

test('saving an unchanged form does not call the database', async () => {
  const result = await saveTeamProfileEdit(original, { ...original }, () => { throw new Error('Must not write'); });
  assert.equal(result.changed, false);
  assert.equal(result.profile, original);
});

test('invalid role or status fails before reaching the database', async () => {
  for (const draft of [{ role: 'invalid' }, { status: 'invalid' }]) {
    await assert.rejects(() => saveTeamProfileEdit(original, draft, () => { assert.fail('Must not write'); }), /válida/);
  }
});

test('a database error is surfaced and does not mutate the original or the draft', async () => {
  const draft = { role: 'admin', status: 'active' };
  const snapshot = structuredClone({ original, draft });
  await assert.rejects(() => saveTeamProfileEdit(original, draft, async () => ({ error: new Error('Permission denied'), data: null })), /Permission denied/);
  assert.deepEqual({ original, draft }, snapshot);
});

test('zero rows, wrong ID or unconfirmed values cannot produce success', async () => {
  for (const data of [null, { id: 'other', role: 'admin' }, { id: original.id, role: 'colaborador' }]) {
    await assert.rejects(() => saveTeamProfileEdit(original, { role: 'admin' }, async () => ({ data, error: null })), /confirmar/);
  }
});

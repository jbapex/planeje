import assert from 'node:assert/strict';
import { acceptTeamInvite, normalizeInviteEmail, usableTeamInvite, validateInviteInput } from '../supabase/functions/_shared/teamInvite.js';

const token = '11111111-1111-4111-8111-111111111111';
const owner = { id: '07d65b46-dd33-4ce6-a98f-8940374c534c', role: 'superadmin', status: 'active' };
const invite = { recipient_email: 'employee@example.invalid', role: 'colaborador', expires_at: '2100-01-01', consumed_at: null, used_by: null };
assert.equal(normalizeInviteEmail(' Employee@Example.invalid '), 'employee@example.invalid');
assert.equal(normalizeInviteEmail('employee'), null);
assert.ok(usableTeamInvite(invite, owner));
for (const patch of [{ consumed_at: new Date().toISOString() }, { used_by: 'someone' }, { expires_at: '2000-01-01' }, { recipient_email: null }, { role: 'superadmin' }]) {
  assert.equal(usableTeamInvite({ ...invite, ...patch }, owner), false);
}
assert.equal(usableTeamInvite(invite, { ...owner, status: 'pending' }), false);
assert.equal(usableTeamInvite(invite, { ...owner, id: 'another-admin' }), false);
assert.throws(() => validateInviteInput({ token: 'bad', action: 'inspect' }));
assert.throws(() => validateInviteInput({ token, action: 'accept', password: '123', full_name: 'A' }));

function fakeAdmin({ completeError = false, createError = false } = {}) {
  const calls = []; let claimed = false;
  return {
    calls,
    rpc: async (name, body) => {
      calls.push({ name, body });
      if (name === 'planeje_claim_team_invite') {
        if (claimed) return { error: { message: 'used' } };
        claimed = true;
        return { data: { id: 'invite-id', recipient_email: invite.recipient_email, role: invite.role } };
      }
      return completeError ? { error: { message: 'revoked' } } : { data: null };
    },
    auth: { admin: {
      createUser: async input => { calls.push({ name: 'create', input }); return createError ? { error: { message: 'duplicate' } } : { data: { user: { id: 'new-user' } } }; },
      deleteUser: async id => { calls.push({ name: 'delete', id }); return { error: null }; },
    } },
    from: () => ({ update: patch => ({ eq: () => ({ is: async () => { calls.push({ name: 'release', patch }); return { error: null }; } }) }) }),
  };
}
const body = { token, action: 'accept', full_name: ' Employee ', password: 'a-long-test-password', email: 'attacker@example.invalid', role: 'superadmin' };
const admin = fakeAdmin();
assert.deepEqual(await acceptTeamInvite(admin, body), { ok: true });
const creation = admin.calls.find(call => call.name === 'create').input;
assert.equal(creation.email, invite.recipient_email);
assert.deepEqual(creation.user_metadata, { full_name: 'Employee' });
assert.equal(creation.user_metadata.role, undefined);
await assert.rejects(() => acceptTeamInvite(admin, body), /já utilizado/);
assert.equal(admin.calls.filter(call => call.name === 'create').length, 1);
const racing = fakeAdmin();
const race = await Promise.allSettled([acceptTeamInvite(racing, body), acceptTeamInvite(racing, body)]);
assert.equal(race.filter(row => row.status === 'fulfilled').length, 1);
assert.equal(racing.calls.filter(call => call.name === 'create').length, 1);
const revoked = fakeAdmin({ completeError: true });
await assert.rejects(() => acceptTeamInvite(revoked, body), /concluir/);
assert.ok(revoked.calls.some(call => call.name === 'delete' && call.id === 'new-user'));
assert.ok(revoked.calls.some(call => call.name === 'release'));
const duplicate = fakeAdmin({ createError: true });
await assert.rejects(() => acceptTeamInvite(duplicate, body), /criar/);
assert.ok(!duplicate.calls.some(call => call.name === 'delete'));
console.log('teamInviteSecurity: input, role/email tampering, expiry, reuse, concurrency, revocation and failure cleanup passed');

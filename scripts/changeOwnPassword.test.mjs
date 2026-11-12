import assert from 'node:assert/strict';
import { changeOwnPassword } from '../src/lib/changeOwnPassword.js';

const input = {
  email: 'usuario@example.com',
  currentPassword: 'senha-antiga-123',
  newPassword: 'senha-nova-456',
  confirmPassword: 'senha-nova-456',
};

async function run(overrides = {}, signInError = null, updateError = null) {
  const calls = [];
  const supabase = {
    supabaseUrl: 'https://example.com',
    supabaseKey: 'public-key',
    auth: { updateUser: async (payload) => {
      calls.push(['update', payload]);
      return { error: updateError };
    } },
  };
  const createVerifier = (_url, _key, options) => {
    assert.equal(options.auth.persistSession, false);
    return { auth: {
      signInWithPassword: async (payload) => {
        calls.push(['verify', payload]);
        return { error: signInError };
      },
      signOut: async (options) => {
        calls.push(['signOut', options]);
        return { error: null };
      },
    } };
  };
  return { calls, action: () => changeOwnPassword({ ...input, ...overrides, supabase, createVerifier }) };
}

{
  const { calls, action } = await run();
  await action();
  assert.deepEqual(calls.map(([name]) => name), ['verify', 'signOut', 'update']);
  assert.deepEqual(calls[2][1], { password: input.newPassword });
}

{
  const { calls, action } = await run({}, { status: 400 });
  await assert.rejects(action, /senha atual está incorreta/);
  assert.deepEqual(calls.map(([name]) => name), ['verify']);
}

for (const [overrides, message] of [
  [{ currentPassword: '' }, /Informe sua senha atual/],
  [{ newPassword: 'curta', confirmPassword: 'curta' }, /pelo menos 8/],
  [{ confirmPassword: 'diferente' }, /não corresponde/],
  [{ newPassword: input.currentPassword, confirmPassword: input.currentPassword }, /diferente da atual/],
]) {
  const { calls, action } = await run(overrides);
  await assert.rejects(action, message);
  assert.equal(calls.length, 0);
}

console.log('changeOwnPassword: validação e fluxo de autenticação OK');

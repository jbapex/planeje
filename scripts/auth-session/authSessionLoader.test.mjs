import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuthSessionLoader, initialAuthState } from '../../src/lib/authSessionLoader.js';

const session = (id = 'a', token = id) => ({ user: { id }, access_token: token });
const profile = (id = 'a', extra = {}) => ({ id, role: 'superadmin', status: 'active', ...extra });
const flush = async () => { for (let i = 0; i < 24; i++) await Promise.resolve(); };
function harness({ stored = session(), sessionDelay = 0, plans = {} } = {}) {
  let now = 0, serial = 0, callback, inCallback = false, latest = initialAuthState(), unsubscribed = false;
  const jobs = new Map(), states = [], calls = [];
  const schedule = (fn, delay) => { const id = ++serial; jobs.set(id, { at: now + delay, fn }); return id; };
  const cancel = (id) => jobs.delete(id);
  const response = (table, id, signal) => {
    assert.equal(inCallback, false, 'Supabase query inside auth callback');
    const count = calls.filter(x => x.table === table).length; calls.push({ table, id, at: now });
    const plan = typeof plans[table] === 'function' ? plans[table]({ id, count }) : plans[table]?.[count] || {};
    return new Promise((resolve) => {
      if (plan.never) return;
      schedule(() => resolve({ data: table === 'profiles' ? profile(id) : [], error: null, ...plan.result }), plan.delay || 0);
    });
  };
  const client = {
    auth: {
      getSession: () => new Promise(resolve => schedule(() => resolve({ data: { session: stored }, error: null }), sessionDelay)),
      onAuthStateChange(fn) { callback = fn; return { data: { subscription: { unsubscribe() { unsubscribed = true; } } } }; },
    },
    from(table) {
      assert.equal(inCallback, false, 'Query builder inside auth callback');
      let id = 'a', signal;
      const q = { select: () => q, eq(_key, value) { id = value; return q; }, single: () => q, abortSignal(value) { signal = value; return q; }, then(a, b) { return response(table, id, signal).then(a, b); } };
      return q;
    },
  };
  const loader = createAuthSessionLoader(client, state => { latest = state; states.push(state); }, { schedule, cancel });
  return {
    loader, client, states, calls, get state() { return latest; }, get unsubscribed() { return unsubscribed; },
    setStored(value) { stored = value; },
    emit(event, value) { inCallback = true; try { return callback(event, value); } finally { inCallback = false; } },
    async tick(ms = 0) {
      const end = now + ms; await flush();
      for (let guard = 0; guard < 1000; guard++) {
        const due = [...jobs.entries()].filter(([, job]) => job.at <= end).sort((a,b) => a[1].at - b[1].at)[0];
        if (!due) { now = end; await flush(); if (![...jobs.values()].some(job => job.at <= end)) return; continue; }
        const [id, job] = due; jobs.delete(id); now = job.at; job.fn(); await flush();
      }
      throw new Error('Timer loop');
    },
  };
}
const cleanLoadingStates = h => assert.ok(h.states.every(s => !s.session || s.profile || s.loading || s.authError), 'Session without profile was presented as finished');

test('slow restore plus profile stays loading beyond the old 12-second watchdog', async () => {
  const h=harness({sessionDelay:6000,plans:{profiles:[{delay:7000}]}});h.loader.start();await h.tick(12000);
  assert.equal(h.state.loading,true);assert.equal(h.state.authError,null);await h.tick(1000);assert.equal(h.state.profile.id,'a');assert.equal(h.state.loading,false);cleanLoadingStates(h);h.loader.dispose();
});
test('login after an empty initial session does not flash a missing-profile error', async () => {
  const h=harness({stored:null,plans:{profiles:[{delay:2000}]}});h.loader.start();await h.tick();assert.equal(h.state.loading,false);
  assert.equal(h.emit('SIGNED_IN',session()),undefined);assert.equal(h.state.loading,true);assert.equal(h.calls.length,0);await h.tick(2000);assert.equal(h.state.profile.id,'a');cleanLoadingStates(h);h.loader.dispose();
});
test('SDK callbacks return synchronously and queries start in a later task', async () => {
  const h=harness({stored:null});h.loader.start();await h.tick();const result=h.emit('SIGNED_IN',session());assert.equal(result,undefined);assert.equal(h.calls.length,0);await h.tick();assert.equal(h.calls[0].table,'profiles');h.loader.dispose();
});
test('late profile from a previous user cannot overwrite the new identity', async () => {
  const h=harness({plans:{profiles:({id})=>({delay:id==='a'?5000:20})}});h.loader.start();await h.tick();h.emit('SIGNED_IN',session('b'));await h.tick(20);assert.equal(h.state.profile.id,'b');await h.tick(5000);assert.equal(h.state.profile.id,'b');assert.equal(h.state.session.user.id,'b');h.loader.dispose();
});
test('sign out clears access immediately and ignores an outstanding profile', async () => {
  const h=harness({plans:{profiles:[{delay:1000}]}});h.loader.start();await h.tick();h.emit('SIGNED_OUT',null);assert.equal(h.state.session,null);assert.equal(h.state.profile,null);await h.tick(1000);assert.equal(h.state.profile,null);assert.deepEqual(h.state.fieldPermissions,{});h.loader.dispose();
});
test('stale getSession result cannot replace a newer sign-in notification', async () => {
  const h=harness({stored:null,sessionDelay:1000});h.loader.start();h.emit('SIGNED_IN',session('b'));await h.tick();assert.equal(h.state.profile.id,'b');await h.tick(1000);assert.equal(h.state.profile.id,'b');h.loader.dispose();
});
test('INITIAL_SESSION and SIGNED_IN for the same session share one profile read', async () => {
  const h=harness({plans:{profiles:[{delay:100}]}});h.loader.start();h.emit('INITIAL_SESSION',session());h.emit('SIGNED_IN',session());await h.tick(100);assert.equal(h.calls.filter(x=>x.table==='profiles').length,1);assert.equal(h.state.profile.id,'a');h.loader.dispose();
});
test('token refresh keeps a loaded page while updating real profile and permissions', async () => {
  const h=harness({plans:{profiles:[{}, {delay:100,result:{data:profile('a',{status:'inactive'})}}]}});h.loader.start();await h.tick();h.emit('TOKEN_REFRESHED',session('a','renewed'));assert.equal(h.state.loading,false);assert.equal(h.state.profile.status,'active');await h.tick(100);assert.equal(h.state.profile.status,'inactive');h.loader.dispose();
});
test('one transient profile timeout retries without an error state', async () => {
  const h=harness({plans:{profiles:[{never:true},{}]}});h.loader.start();await h.tick(8000);assert.equal(h.state.profile.id,'a');assert.equal(h.states.some(s=>s.authError),false);h.loader.dispose();
});
test('a real timeout is bounded, and retry recovers without reloading the page', async () => {
  const h=harness({plans:{profiles:[{never:true},{never:true},{}]}});h.loader.start();await h.tick(16000);assert.equal(h.state.authError,'profile');assert.equal(h.state.loading,false);const retry=h.loader.refresh();await h.tick();assert.equal((await retry).id,'a');assert.equal(h.state.authError,null);h.loader.dispose();
});
test('missing profile is refused without inventing identity or retrying denial', async () => {
  const h=harness({plans:{profiles:[{result:{data:null,error:{code:'PGRST116',message:'No rows'}}}]}});h.loader.start();await h.tick();assert.equal(h.state.authError,'profile');assert.equal(h.state.profile,null);assert.equal(h.calls.length,1);h.loader.dispose();
});
test('permission denial remains an error and is not automatically retried', async () => {
  const h=harness({plans:{profiles:[{result:{data:null,status:403,error:{message:'Denied'}}}]}});h.loader.start();await h.tick();assert.equal(h.state.authError,'profile');assert.equal(h.calls.length,1);h.loader.dispose();
});
test('field permissions and individual overrides are still loaded from the database', async () => {
  const h=harness({plans:{client_field_permissions:[{result:{data:[{role:'colaborador',field_name:'valor',can_view:false}]}}],user_client_field_permissions:[{result:{data:[{field_name:'valor',can_view:true}]}}]}});h.loader.start();await h.tick();assert.equal(h.state.fieldPermissions.colaborador.valor,false);assert.equal(h.state.userFieldOverrides.valor,true);h.loader.dispose();
});
test('permission requests run together and wait before initial loading finishes', async () => {
  const h=harness({plans:{client_field_permissions:[{delay:7000}],user_client_field_permissions:[{delay:7000}]}});h.loader.start();await h.tick();assert.equal(h.calls.length,3);assert.equal(h.state.loading,true);await h.tick(7000);assert.equal(h.state.loading,false);h.loader.dispose();
});
test('failed optional field reads retain their existing empty fallback', async () => {
  const h=harness({plans:{client_field_permissions:[{result:{error:{message:'Offline'}}}],user_client_field_permissions:[{never:true}]}});h.loader.start();await h.tick(8000);assert.equal(h.state.profile.id,'a');assert.deepEqual(h.state.fieldPermissions,{});assert.deepEqual(h.state.userFieldOverrides,{});h.loader.dispose();
});
test('new identity clears previous user fields before reading its profile', async () => {
  const h=harness({plans:{profiles:[{}, {delay:500}],user_client_field_permissions:[{result:{data:[{field_name:'secret',can_view:true}]}}]}});h.loader.start();await h.tick();h.emit('SIGNED_IN',session('b'));assert.equal(h.state.profile,null);assert.deepEqual(h.state.userFieldOverrides,{});assert.equal(h.state.loading,true);await h.tick(500);assert.equal(h.state.profile.id,'b');h.loader.dispose();
});
test('dispose unsubscribes and prevents any late state writes', async () => {
  const h=harness({plans:{profiles:[{delay:1000}]}});h.loader.start();await h.tick();h.loader.dispose();const count=h.states.length;await h.tick(20000);assert.equal(h.states.length,count);assert.equal(h.unsubscribed,true);
});
test('session timeout can be retried and does not leave a permanent loading screen', async () => {
  const h=harness({sessionDelay:13000});h.loader.start();await h.tick(12000);assert.equal(h.state.authError,'session');assert.equal(h.state.loading,false);h.loader.refresh();await h.tick(13000);assert.equal(h.state.authError,'session');h.emit('SIGNED_IN',session());await h.tick();assert.equal(h.state.profile.id,'a');h.loader.dispose();
});
test('USER_UPDATED refreshes an existing session instead of trusting user metadata', async () => {
  const h=harness({plans:{profiles:[{}, {result:{data:profile('a',{role:'colaborador'})}}]}});h.loader.start();await h.tick();h.emit('USER_UPDATED',{...session(),user:{id:'a',user_metadata:{role:'superadmin'}}});await h.tick();assert.equal(h.state.profile.role,'colaborador');h.loader.dispose();
});
test('no stored session reaches the normal signed-out state', async () => {
  const h=harness({stored:null});h.loader.start();await h.tick();assert.equal(h.state.session,null);assert.equal(h.state.loading,false);assert.equal(h.state.authError,null);assert.equal(h.calls.length,0);h.loader.dispose();
});

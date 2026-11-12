import assert from 'node:assert/strict';
import { loadApprovedTeamUser, sameMcpActor } from '../src/accountAccess.js';

function client({ status='active', role='colaborador', missing=false, banned=null, error=false, profileMissing=false } = {} as any) {
  return { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({
    data: profileMissing ? null : { id:'fixture', full_name:'Fixture', role, status }, error: error ? {} : null,
  }) }) }) }), auth: { admin: { getUserById: async () => ({
    data: { user: missing ? null : { id:'fixture', email:'fixture@example.invalid', banned_until:banned } }, error:null,
  }) } } } as any;
}
for (const role of ['superadmin','admin','colaborador']) assert.equal((await loadApprovedTeamUser(client({role}), 'fixture'))?.role, role);
for (const opts of [{status:'pending'}, {status:'inactive'}, {role:'cliente'}, {missing:true}, {profileMissing:true}, {error:true},
  {banned:new Date(Date.now()+60_000).toISOString()}, {banned:'invalid'}]) assert.equal(await loadApprovedTeamUser(client(opts), 'fixture'),null);
assert.ok(await loadApprovedTeamUser(client({banned:new Date(Date.now()-60_000).toISOString()}), 'fixture'));
assert.equal(await loadApprovedTeamUser({ from: () => { throw new Error('offline'); } } as any, 'fixture'), null);
const a={type:'user',user_id:'one',role:'admin'};
assert.ok(sameMcpActor(a,{...a}));
assert.ok(!sameMcpActor(a,{...a,user_id:'two'}));
assert.ok(!sameMcpActor(a,{...a,role:'colaborador'}));
assert.ok(!sameMcpActor(a,{type:'admin_key'}));
assert.ok(sameMcpActor({type:'admin_key'},{type:'admin_key'}));
console.log('MCP_ACCOUNT_ACCESS_TESTS_PASSED');

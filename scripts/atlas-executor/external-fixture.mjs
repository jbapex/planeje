import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
export const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
export const clientId = uuid(1),actorId = uuid(2),sessionId = uuid(3),itemId = uuid(4);
export const objectId = '1234567890123',accountId = 'act_700';
export const before = { object_id:objectId,account_id:accountId,level:'adset',configured_status:'ACTIVE',api_version:'v25.0',currency:'BRL',currency_offset:100 };
const jwt = ['eyJhbGciOiJIUzI1NiJ9',Buffer.from(JSON.stringify({ role:'authenticated',sub:actorId,session_id:sessionId })).toString('base64url'),'synthetic-signature'].join('.');
export function externalFixture(options = {}) {
  const calls = [],steps = new Map();let denied = false,posted = false;
  const item = { id:itemId,owner_id:actorId,client_id:clientId,app:'gestor',kind:'proposal',action:'update_meta',revision:1,state:'proposed',payload:{ adAccountId:accountId,objectId,level:'adset',status:'PAUSED' },before:structuredClone(before) };
  const request = new Request('https://fixture.invalid/functions/v1/atlas-assistant',{ method:'POST',headers:{ Authorization:`Bearer ${jwt}` } });
  const envelope = () => ({ item:structuredClone(item),source_session_id:sessionId });
  const refresh = () => {
    const list = [...steps.values()];
    item.state = list.find(row => row.state === 'conflict') ? 'conflict' : list.find(row => row.state === 'failed') ? 'failed' : list.find(row => row.state === 'uncertain') ? 'uncertain' : list.length === (item.action === 'create_meta_campaign' ? 4 : 1) && list.every(row => row.state === 'completed') ? 'completed' : 'executing';
    item.result = { external:true,steps:list.map(({ step,state,receipt,error }) => ({ step,state,receipt,error })) };
  };
  const tables = { profiles:[{ id:actorId,role:'colaborador',status:'active' }],module_settings:[{ module_name:'paid_traffic',is_enabled:true }],user_module_permissions:[],clientes:[{ id:clientId,etapa:'closed' }],
    client_field_permissions:[],user_client_field_permissions:[],cliente_meta_accounts:[{ cliente_id:clientId,meta_account_id:'700',is_active:true }] };
  const send = (data,status = 200) => Response.json(data,{ status });
  const sdkFetch = async (input,init = {}) => {
    const url = new URL(input),name = url.pathname.split('/').at(-1),body = init.body ? JSON.parse(init.body) : null;
    assert.equal(url.origin,'https://fixture.invalid');calls.push({ kind:'sdk',name,body });
    if (url.pathname === '/auth/v1/user') return denied ? send({ message:'denied' },401) : send({ id:actorId });
    if (url.pathname.includes('/rpc/')) {
      if (denied || options.deny) return send({ code:'42501',message:'denied' },403);
      if (name === 'planeje_current_account_access' || name === 'central_trafego_can_access_client') return send(true);
      if (name === 'atlas_executor_external_approve') {
        if (item.state === 'proposed') { if (body.p_revision !== item.revision) return send({ code:'40001',message:'revision' },409);item.state = 'executing';item.decision = 'approve';item.revision++; }
        return send(envelope());
      }
      if (name === 'atlas_executor_external_status') return send(envelope());
      if (name === 'atlas_executor_external_get') { refresh();return send({ ...envelope(),steps:[...steps.values()] }); }
      if (name === 'atlas_executor_external_reserve') {
        const old = steps.get(body.p_step);if (old) return send({ ...old,claimed:false });
        const row = { step:body.p_step,state:'reserved',lease:uuid(10),expires_at:new Date(Date.now() + 180000).toISOString() };
        steps.set(body.p_step,row);return send({ ...row,claimed:true });
      }
      if (name === 'atlas_executor_external_finish') {
        const old = steps.get(body.p_step);assert.equal(body.p_lease,old.lease);
        if (options.finishLost) throw Error('lost database response');
        const row = { ...old,state:body.p_state,receipt:body.p_receipt,error:body.p_error };steps.set(body.p_step,row);refresh();return send({ ...row,item });
      }
      assert.fail(name);
    }
    if (name === 'atlas_execution_items') return send([item]);
    assert.ok(Object.hasOwn(tables,name),name);
    return send(tables[name].filter(row => [...url.searchParams].every(([key,value]) => !value.startsWith('eq.') || String(row[key]) === value.slice(3))));
  };
  const client = authorization => createClient('https://fixture.invalid','synthetic-public-key',{ auth:{ persistSession:false,autoRefreshToken:false },global:{ headers:{ Authorization:authorization },fetch:sdkFetch } });
  const caller = client(`Bearer ${jwt}`),service = client('Bearer synthetic-service');
  const readToken = async () => { calls.push({ kind:'token' });return 'synthetic-meta-secret'; };
  const graphFetch = async (input,init = {}) => {
    const url = new URL(input);assert.equal(url.origin,'https://graph.facebook.com');assert.ok([`/v25.0/${objectId}`,`/v25.0/${accountId}`].includes(url.pathname));
    if (url.pathname.endsWith(accountId)) { calls.push({ kind:'graph',method:'GET',path:url.pathname });return send({ id:accountId,account_id:'700',currency:options.currency || 'BRL' }); }
    const method = init.method || 'GET';calls.push({ kind:'graph',method });
    assert.equal(new Headers(init.headers).get('authorization'),'Bearer synthetic-meta-secret');
    if (method === 'POST') {
      posted = true;if (options.network) throw Error('synthetic-meta-secret');
      return send(options.post || { success:true },options.postStatus || 200);
    }
    const status = options.changedBefore && !posted ? 'ARCHIVED' : posted && !options.readbackMismatch ? 'PAUSED' : 'ACTIVE';
    if (options.revokeAfterRead && !posted) denied = true;
    if (posted && options.readbackFailure) throw Error('synthetic-meta-secret');
    return send({ id:objectId,account_id:'700',status,configured_status:status,campaign_id:'2234567890123',optimization_goal:'LEAD_GENERATION',daily_budget:'8000',lifetime_budget:'0' });
  };
  return { caller,service,createCaller:() => caller,request,readToken,graphFetch,calls,item,steps,revoke:() => { denied = true; },restore:() => { denied = false; },
    deps:{ caller,service,request,createCaller:() => caller,readToken,graphFetch,id:itemId,revision:1 } };
}

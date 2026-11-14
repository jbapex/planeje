import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';
import { createClient } from '@supabase/supabase-js';
import { requireMetaWriteScope,readMetaWriteObject,handleMetaWrite } from '../../supabase/functions/_shared/metaWriteAuthorization.js';

const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const clientId = uuid(1),actorId = uuid(2),sessionId = uuid(3),objectId = '1234567890123',accountId = 'act_700';
const token = (patch = {}) => ['eyJhbGciOiJIUzI1NiJ9',Buffer.from(JSON.stringify({ role:'authenticated',sub:actorId,session_id:sessionId,...patch })).toString('base64url'),'synthetic-signature'].join('.');
const body = patch => ({ cliente_id:clientId,adAccountId:accountId,objectId,level:'adset',status:'PAUSED',...patch });
const request = (payload,authorization = `Bearer ${token()}`) => new Request('https://fixture.invalid/functions/v1/meta-ads-api',{ method:'POST',headers:{ Authorization:authorization,'Content-Type':'application/json' },body:JSON.stringify({ action:'update-adset',...payload }) });
function fixture(options = {}) {
  const calls = [],role = options.role || 'colaborador';
  const tables = { profiles:[{ id:actorId,role,status:options.inactive ? 'inactive' : 'active' }],
    module_settings:[{ module_name:'paid_traffic',is_enabled:options.module !== false }],user_module_permissions:options.override === undefined ? [] : [{ user_id:actorId,module_name:'paid_traffic',is_enabled:options.override }],
    clientes:[{ id:clientId,etapa:'closed' }],cliente_meta_accounts:options.noLinks ? [] : [{ cliente_id:clientId,meta_account_id:'700',is_active:true }],
    client_field_permissions:[{ role,field_name:'meta_resumo',can_view:options.metrics !== false },{ role,field_name:'valor',can_view:options.spend !== false }],user_client_field_permissions:options.userFields || [] };
  const createCaller = authorization => {
    calls.push({ kind:'caller',authorization });
    return createClient('https://fixture.invalid','synthetic-public-key',{ auth:{ persistSession:false,autoRefreshToken:false },global:{ headers:{ Authorization:authorization },fetch:async (input,init = {}) => {
      const url = new URL(input);assert.equal(url.hostname,'fixture.invalid');calls.push({ kind:'sdk',url:url.pathname,headers:new Headers(init.headers),body:init.body ? JSON.parse(init.body) : null });
      const send = (data,status = 200) => Response.json(data,{ status });
      if (url.pathname === '/auth/v1/user') return options.badAuth ? send({ message:'private-auth-error' },401) : send({ id:actorId,user_metadata:{ role:'superadmin' } });
      if (url.pathname.endsWith('/planeje_current_account_access')) return send(options.session !== false);
      if (url.pathname.endsWith('/central_trafego_can_access_client')) return send(options.access !== false);
      const table = url.pathname.split('/').at(-1);assert.ok(Object.hasOwn(tables,table),table);
      if (options.failTable === table) return send({ message:'internal-secret' },503);
      let rows = tables[table].filter(row => [...url.searchParams].every(([key,value]) => !value.startsWith('eq.') || String(row[key]) === value.slice(3)));
      return send(rows);
    } } });
  };
  const readToken = async () => { calls.push({ kind:'token' });return 'synthetic-meta-secret'; };
  const graphFetch = async (input,init = {}) => {
    const url = new URL(input);assert.equal(url.origin,'https://graph.facebook.com');assert.equal(url.pathname,`/v25.0/${objectId}`);
    assert.equal(url.searchParams.has('access_token'),false);
    assert.equal(new Headers(init.headers).get('authorization'),'Bearer synthetic-meta-secret');
    const method = init.method || 'GET';calls.push({ kind:'graph',method,fields:url.searchParams.get('fields'),body:init.body?.toString() });
    if (options.network && method === 'POST') throw new Error('network synthetic-meta-secret');
    if (method === 'POST') return Response.json(options.post || { success:true },{ status:options.postStatus || 200 });
    if (options.revokeAfterRead) options.access = false;
    return Response.json(options.object || { id:objectId,account_id:'700',status:'ACTIVE',configured_status:'ACTIVE',campaign_id:'2234567890123',optimization_goal:'LEAD_GENERATION',daily_budget:'8000',lifetime_budget:'0' },{ status:options.getStatus || 200 });
  };
  const invoke = (payload = body(),authorization) => handleMetaWrite({ request:request(payload,authorization),body:payload,createCaller,readToken,graphFetch });
  return { createCaller,readToken,graphFetch,invoke,calls };
}

test('JWT real, sessão e escopo de tráfego autorizam antes de token ou Graph; colaborador preservado',async () => {
  const f = fixture();const result = await f.invoke();assert.equal(result.status,200);
  assert.equal((await result.json()).ok,true);
  assert.equal(f.calls.find(call => call.kind === 'caller').authorization,`Bearer ${token()}`);
  const firstToken = f.calls.findIndex(call => call.kind === 'token');
  assert.ok(firstToken > f.calls.findIndex(call => call.url === '/rest/v1/cliente_meta_accounts'));
  assert.deepEqual(f.calls.filter(call => call.kind === 'graph').map(call => call.method),['GET','POST']);
  assert.equal(new URLSearchParams(f.calls.find(call => call.method === 'POST' && call.kind === 'graph').body).get('status'),'PAUSED');
});

test('revogação durante a leitura Meta impede o POST legado', async () => {
  const f = fixture({ revokeAfterRead: true });
  const result = await f.invoke();
  assert.equal(result.status, 403);
  assert.equal(f.calls.some(call => call.kind === 'graph' && call.method === 'POST'), false);
});

test('sem JWT, service role, delegate e sessão ausente nunca leem token nem Graph',async () => {
  for (const authorization of ['',`Bearer ${token({ role:'service_role' })}`,`Bearer ${token({ planeje_server_delegate:'atlas' })}`,`Bearer ${token({ session_id:null })}`]) {
    const f = fixture();const response = await f.invoke(body(),authorization);assert.ok([401,403].includes(response.status));
    assert.equal(f.calls.some(call => ['token','graph'].includes(call.kind)),false);
  }
});

test('perfil, sessão, módulo, ACL, campos e vínculo revogados falham antes do token',async () => {
  for (const options of [{ role:'cliente' },{ inactive:true },{ badAuth:true },{ session:false },{ module:false },{ override:false },{ access:false },{ metrics:false },{ noLinks:true },{ failTable:'user_client_field_permissions' }]) {
    const f = fixture(options),response = await f.invoke();assert.ok(response.status >= 400,JSON.stringify(options));
    assert.equal(f.calls.some(call => ['token','graph'].includes(call.kind)),false,JSON.stringify(options));
    assert.doesNotMatch(JSON.stringify(await response.json()),/internal-secret|private-auth-error/);
  }
  const f = fixture({ spend:false });assert.equal((await f.invoke(body({ status:undefined,daily_budget:9000 }))).status,403);
  assert.equal(f.calls.some(call => call.kind === 'token'),false);
  const statusOnly = fixture({ spend:false });assert.equal((await statusOnly.invoke()).status,200);
  assert.doesNotMatch(statusOnly.calls.find(call => call.kind === 'graph').fields,/budget/);
});

test('vínculo prova a conta do objeto, compara conta explícita e nunca devolve dados estrangeiros',async () => {
  for (const object of [{ id:objectId,account_id:'800',campaign_id:'2234567890123',optimization_goal:'LEADS',status:'ACTIVE' },{ id:'999999999',account_id:'700',campaign_id:'2234567890123',optimization_goal:'LEADS',status:'ACTIVE' }]) {
    const f = fixture({ object });const result = await f.invoke();assert.equal(result.status,403);
    assert.equal(f.calls.some(call => call.kind === 'graph' && call.method === 'POST'),false);
    assert.doesNotMatch(JSON.stringify(await result.json()),/800|999999999/);
  }
  const f = fixture();assert.equal((await f.invoke(body({ adAccountId:'act_800' }))).status,403);
  assert.equal(f.calls.some(call => call.kind === 'token'),false);
  const legacy = fixture();assert.equal((await legacy.invoke(body({ adAccountId:undefined }))).status,200);
});

test('nível errado, resposta de leitura inválida e payload arbitrário nunca fazem POST',async () => {
  for (const object of [{ id:objectId,account_id:'700',objective:'OUTCOME_LEADS',status:'ACTIVE' },{ error:{ message:'synthetic-meta-secret' } }]) {
    const f = fixture({ object });const result = await f.invoke();assert.ok(result.status >= 400);
    assert.equal(f.calls.some(call => call.kind === 'graph' && call.method === 'POST'),false);
    assert.doesNotMatch(JSON.stringify(await result.json()),/synthetic-meta-secret/);
  }
  for (const patch of [{ objectId:'https://evil.invalid' },{ daily_budget:0 },{ daily_budget:100,lifetime_budget:200 },{ level:'campaign',daily_budget:100 },{ rpc:'unsafe' },{ cliente_id:undefined }]) {
    const f = fixture();assert.ok((await f.invoke(body(patch))).status >= 400);assert.equal(f.calls.some(call => call.kind === 'token'),false);
  }
});

test('resposta HTTP200 com error/okfalse e falha de transporte não afirmam sucesso nem vazam segredo',async () => {
  for (const options of [{ post:{ error:{ message:'token synthetic-meta-secret',code:200 } } },{ post:{ ok:false } },{ postStatus:500,post:{} },{ network:true }]) {
    const f = fixture(options),result = await f.invoke();const returned = await result.json();assert.equal(returned.ok,false);
    assert.doesNotMatch(JSON.stringify(returned),/synthetic-meta-secret/);
    assert.equal(f.calls.filter(call => call.kind === 'graph' && call.method === 'POST').length,1);
  }
});

test('helper de releitura retorna somente fotografia permitida depois de provar conta e nível',async () => {
  const f = fixture({ spend:false });
  const scope = await requireMetaWriteScope({ request:request(body()),body:body(),createCaller:f.createCaller });
  const before = await readMetaWriteObject({ scope,token:await f.readToken(),graphFetch:f.graphFetch });
  assert.equal(before.account_id,accountId);assert.equal(before.object_id,objectId);assert.equal(before.configured_status,'ACTIVE');
  assert.equal('daily_budget' in before,false);assert.equal('token' in before,false);
});

test('override pessoal nulo ou falso recusa o campo em vez de cair no padrão permissivo',async () => {
  for (const can_view of [null,false]) {
    const f = fixture({ userFields:[{ user_id:actorId,field_name:'meta_resumo',can_view }] });
    assert.equal((await f.invoke()).status,403);assert.equal(f.calls.some(call => call.kind === 'token'),false);
  }
});

test('cancelar depois da conferência impede iniciar POST',async () => {
  const f = fixture(),controller = new AbortController(),payload = body();
  const req = new Request('https://fixture.invalid/meta-ads-api',{ method:'POST',headers:{ Authorization:`Bearer ${token()}` },signal:controller.signal });
  const response = await handleMetaWrite({ request:req,body:payload,createCaller:f.createCaller,readToken:f.readToken,graphFetch:async (...args) => {
    const result = await f.graphFetch(...args);controller.abort();return result;
  } });
  assert.equal((await response.json()).ok,false);
  assert.equal(f.calls.some(call => call.kind === 'graph' && call.method === 'POST'),false);
});

test('caller legado envia cliente canônico e conta conhecida sem escolher a primeira em multi-conta',() => {
  const source = readFileSync(new URL('../../src/components/traffic/TrafegoDashboard.jsx',import.meta.url),'utf8');
  const write = source.slice(source.indexOf('const applyAdsetWrite'),source.indexOf('const detailDate'));
  assert.match(write,/cliente_id:\s*selectedClient\.id/);assert.match(write,/adAccountId/);
  assert.doesNotMatch(write,/accounts\?\.\[0\]|accounts\[0\]/);
});

test('ramo real do Edge autoriza antes do segredo e não entra no POST legado sem guarda',async () => {
  const { outputFiles:[bundle] } = await build({ entryPoints:[new URL('../../supabase/functions/meta-ads-api/index.ts',import.meta.url).pathname],bundle:true,platform:'node',format:'cjs',external:['https://*'],write:false });
  let handler,tokenReads = 0;const f = fixture();
  const context = vm.createContext({ URL,URLSearchParams,Response,Request,Headers,AbortController,AbortSignal,TextEncoder,TextDecoder,atob,btoa,setTimeout,clearTimeout,
    require:specifier => specifier.includes('/http/server.ts') ? { serve:callback => { handler = callback; } } : specifier.includes('supabase-js') ? { createClient:(_url,key,options) => key === 'fixture-anon' ? f.createCaller(options.global.headers.Authorization) : { rpc:async () => { tokenReads++;return { data:'synthetic-meta-secret' }; } } } : assert.fail(specifier),
    Deno:{ env:{ get:key => ({ SUPABASE_URL:'https://fixture.invalid',SUPABASE_ANON_KEY:'fixture-anon',SUPABASE_SERVICE_ROLE_KEY:'fixture-service' })[key] } },
    fetch:f.graphFetch,console:{ log:() => {},warn:() => {},error:() => {} },structuredClone });
  vm.runInContext(bundle.text,context);
  const denied = await handler(request(body(),''));assert.equal(denied.status,401);assert.equal(tokenReads,0);
  const valid = await handler(request(body()));assert.equal(valid.status,200);assert.equal((await valid.json()).ok,true);assert.equal(tokenReads,1);
});

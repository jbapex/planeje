import { spawnSync } from 'node:child_process';
import { mkdtempSync,readFileSync,rmSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
export { id,ids,literal,json } from './database-fixture.mjs';
import { id,ids,literal,json } from './database-fixture.mjs';
const file = name => readFileSync(new URL(`../../supabase/migrations/${name}.sql`,import.meta.url),'utf8');
function extract(source,name) {
  const offset = source.toLowerCase().indexOf(`create or replace function ${name}(`);
  assert.ok(offset >= 0,name);return source.slice(offset,source.indexOf('$$;',offset) + 3);
}
// Isolated copy of external-database-fixture's native schema/migration loader.
// Its own socket/port keeps the endpoint integration independent of publisher tests.
export function externalEdgeDatabaseFixture() {
  const work = mkdtempSync('/tmp/atlas-external-edge-db-'),dir = join(work,'data'),env = { PATH:process.env.PATH,LC_ALL:'C' };
  const psql = ['-X','-Aqt','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose','-h',work,'-p','55539','-U','atlas_external_edge_qa','-d','postgres'];
  let started = false,sequence = 4000;
  const run = (binary,args,input) => { const r = spawnSync(binary,args,{ input,env,encoding:'utf8',timeout:25000 });if (r.status || r.error) throw Error(r.stderr || r.error.message);return r.stdout.trim(); };
  const sql = input => run('psql',psql,input);
  const userSql = (statement,{ actor = ids.admin,session = ids.session,role = 'authenticated',delegate } = {}) => `BEGIN;SET LOCAL ROLE ${role};SET LOCAL test.uid=${literal(actor)};SET LOCAL request.jwt.claims=${literal(JSON.stringify({ role,sub:actor,...(session && { session_id:session }),...(delegate && { planeje_server_delegate:delegate }) }))};${statement};COMMIT;`;
  const user = (statement,options) => sql(userSql(statement,options));
  const serviceSql = statement => `BEGIN;SET LOCAL ROLE service_role;SET LOCAL test.uid='';SET LOCAL request.jwt.claims='{"role":"service_role"}';${statement};COMMIT;`;
  const service = statement => sql(serviceSql(statement));
  function proposal({ owner = ids.admin, action = 'update_meta',payload = { adAccountId:'act_700',objectId:'1234567890123',level:'adset',status:'PAUSED' },before = { object_id:'1234567890123',account_id:'act_700',level:'adset',configured_status:'ACTIVE',api_version:'v25.0',currency:'BRL',currency_offset:100 } } = {}) {
    const conversation = id(++sequence),runId = id(++sequence),item = id(++sequence);
    sql(`INSERT INTO public.atlas_conversations(id,owner_id,client_id,title) VALUES('${conversation}','${owner}','${ids.client}','Meta fictícia');
      INSERT INTO public.atlas_runs(id,owner_id,request_id,conversation_id,request_conversation_id,request_client_id,request_message,status,source_session_id)
      VALUES('${runId}','${owner}','${id(++sequence)}','${conversation}','${conversation}','${ids.client}','[Executor Planeje] Meta fictícia','completed','${owner === ids.admin ? ids.session : ids.otherSession}');
      INSERT INTO public.atlas_execution_items(id,owner_id,conversation_id,run_id,client_id,call_id,kind,app,action,title,payload,before,effect,state,specification)
      VALUES('${item}','${owner}','${conversation}','${runId}','${ids.client}','call','proposal','gestor',${literal(action)},'Meta fictícia',${json(payload)},${json(before)},'{"external":true}','proposed','{}')`);
    return { id:item,revision:1,run_id:runId,conversation_id:conversation };
  }
  const approve = (item,options) => JSON.parse(user(`SELECT public.atlas_executor_external_approve('${item.id}',${item.revision})`,options));
  const reserveStatement = (item,request,step = 'update') => `SELECT public.atlas_executor_external_reserve('${item.id}','${ids.session}',${literal(step)},${json(request)})`;
  const reserve = (item,request,step) => JSON.parse(service(reserveStatement(item,request,step)));
  const finish = (item,step,lease,state,receipt = null,error = null) => JSON.parse(service(`SELECT public.atlas_executor_external_finish('${item.id}','${ids.session}',${literal(step)},'${lease}',${literal(state)},${json(receipt)},${json(error)})`));
  function start() {
    run('initdb',['-D',dir,'-U','atlas_external_edge_qa','--auth-local=trust','--auth-host=reject','--no-locale','--encoding=UTF8']);
    run('pg_ctl',['-D',dir,'-l',join(work,'postgres.log'),'-o',`-k ${work} -p 55539 -c listen_addresses='' -c unix_socket_permissions=0700`,'-w','start']);started = true;
    assert.equal(sql('SHOW listen_addresses'),'');
    assert.equal(Math.floor(Number(sql('SHOW server_version_num')) / 10000),16);
    const fixture = readFileSync(new URL('../crm-ia/workspace.database.test.mjs',import.meta.url),'utf8').split('    sql(`')[1].split('    `);')[0].replace(/\$\{(\w+)\}/g,(_,key) => ids[key]);sql(fixture);
    sql(`CREATE SCHEMA planeje_private;CREATE TABLE auth.users(id uuid PRIMARY KEY,banned_until timestamptz);CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid,not_after timestamptz);
      CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
      CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$SELECT auth.jwt()->>'role'$$;
      INSERT INTO auth.users VALUES('${ids.admin}',NULL),('${ids.staff}',NULL);INSERT INTO auth.sessions VALUES('${ids.session}','${ids.admin}',NULL),('${ids.otherSession}','${ids.staff}',NULL);
      CREATE TABLE public.traffic_client_ops(client_id uuid,primary_assignee_id uuid);CREATE TABLE public.traffic_client_access(client_id uuid,profile_id uuid);
      CREATE TABLE public.client_field_permissions(role text,field_name text,can_view boolean);CREATE TABLE public.user_client_field_permissions(user_id uuid,field_name text,can_view boolean);
      CREATE TABLE public.cliente_meta_accounts(cliente_id uuid,meta_account_id text,is_active boolean);
      INSERT INTO public.cliente_meta_accounts VALUES('${ids.client}','700',true),('${ids.foreign}','800',true);
      INSERT INTO public.module_settings VALUES('assistant',true),('paid_traffic',true),('crm',true);GRANT SELECT ON public.profiles,public.clientes TO authenticated;`);
    const auth = file('20261013140451_invite_only_access');
    for (const name of ['private.planeje_live_session','private.planeje_approved_access','public.planeje_current_account_access']) sql(extract(auth,name));
    const traffic = file('20260826010000_central_trafego_fase1');
    for (const suffix of ['caller_role','is_admin','is_gestor','has_explicit_access','can_access_client']) sql(extract(traffic,`public.central_trafego_${suffix}`));
    sql(file('20261111041704_crm_ia_workspace'));sql(file('20261111043800_crm_ia_workspace_readings'));sql(file('20261009004301_atlas_personal_assistant'));
    sql(`UPDATE public.atlas_settings SET owner_id='${ids.admin}',enabled=true WHERE id='atlas'`);sql(file('20261112032940_atlas_executor'));
    sql(file('20261112043423_atlas_executor_external'));
    // Gate rows are synthetic. The actual item table/RLS and ledger grants stay untouched.
    sql('GRANT SELECT ON module_settings,user_module_permissions,client_field_permissions,user_client_field_permissions,cliente_meta_accounts TO authenticated');
  }
  function stop() { if (started) run('pg_ctl',['-D',dir,'-m','immediate','-w','stop']);rmSync(work,{ recursive:true,force:true }); }
  return { start,stop,sql,user,userSql,service,serviceSql,proposal,approve,reserve,reserveStatement,finish,psql,env };
}

const SQL_RPC = new Set(['planeje_current_account_access','central_trafego_can_access_client','atlas_executor_external_status','atlas_executor_external_approve','atlas_executor_external_reserve','atlas_executor_external_finish','atlas_executor_external_get']);
const TABLES = new Set(['atlas_settings','profiles','clientes','module_settings','user_module_permissions','client_field_permissions','user_client_field_permissions','cliente_meta_accounts','atlas_execution_items']);
const OBJECT_ID = '1234567890123';
const jwt = (actor,session) => ['eyJhbGciOiJIUzI1NiJ9',Buffer.from(JSON.stringify({ role:'authenticated',sub:actor,session_id:session })).toString('base64url'),'synthetic-signature'].join('.');

/** Only transport/auth are fixtures. Every operational RPC and item read executes native SQL. */
export function externalEdgeTransport(db,source,{ lostPost = false } = {}) {
  const calls = [],graph = [],logs = [];let handler,currentStatus = 'ACTIVE',loseNextPost = lostPost;
  const secret = 'synthetic-meta-system-token';
  const principals = new Map([
    [`Bearer ${jwt(ids.admin,ids.session)}`,{ actor:ids.admin,session:ids.session,role:'authenticated' }],
    [`Bearer ${jwt(ids.staff,ids.otherSession)}`,{ actor:ids.staff,session:ids.otherSession,role:'authenticated' }],
    [`Bearer ${jwt(ids.admin,ids.otherSession)}`,{ actor:ids.admin,session:ids.otherSession,role:'authenticated' }],
    ['Bearer fixture-service',{ role:'service_role' }],
  ]);
  const run = (principal,statement) => principal.role === 'service_role' ? db.service(statement) : db.user(statement,principal);
  const jsonResponse = (data,status = 200) => Response.json(data,{ status });
  const sdkFetch = async (input,init = {}) => {
    const url = new URL(input);assert.equal(url.origin,'https://fixture.invalid','No real Supabase transport is allowed');
    const principal = principals.get(new Headers(init.headers).get('authorization'));assert.ok(principal,'Only declared synthetic sessions are accepted');
    const resource = url.pathname.split('/').at(-1),body = init.body ? JSON.parse(init.body) : {};
    if (url.pathname === '/auth/v1/user') { assert.equal(principal.role,'authenticated');return jsonResponse({ id:principal.actor }); }
    try {
      if (url.pathname.startsWith('/rest/v1/rpc/')) {
        assert.ok(SQL_RPC.has(resource),`Unexpected RPC ${resource}`);
        assert.ok(Object.keys(body).every(key => /^p_[a-z_]+$/.test(key)));
        calls.push({ kind:'rpc',name:resource,role:principal.role,actor:principal.actor,session:principal.session,body });
        const args = Object.entries(body).map(([key,value]) => `${key}=>${value !== null && typeof value === 'object' ? json(value) : literal(value)}`).join(',');
        return jsonResponse(JSON.parse(run(principal,`SELECT to_jsonb(public.${resource}(${args}))`)));
      }
      assert.equal(init.method || 'GET','GET');assert.ok(TABLES.has(resource),resource);
      calls.push({ kind:'table',name:resource,role:principal.role,actor:principal.actor,session:principal.session });
      if (principal.role === 'service_role') assert.equal(resource,'atlas_settings','Service never reads the operational item');
      const filters = [];
      for (const [key,value] of url.searchParams) {
        if (key === 'select') continue;
        assert.match(key,/^[a-z_]+$/);
        if (value.startsWith('eq.')) filters.push(`t.${key}::text=${literal(value.slice(3))}`);
        else if (value.startsWith('in.(') && value.endsWith(')')) filters.push(`t.${key}::text IN(${value.slice(4,-1).split(',').map(literal).join(',')})`);
        else assert.fail(`Unexpected table filter ${key}`);
      }
      const rows = JSON.parse(run(principal,`SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) FROM public.${resource} t${filters.length ? ' WHERE '+filters.join(' AND ') : ''}`));
      return jsonResponse(rows);
    } catch (error) {
      // Translate only genuine PostgreSQL failures; unexpected fixture paths remain test failures.
      const code = error.message.match(/ERROR:\s+([0-9A-Z]{5}):/)?.[1];if (!code) throw error;
      return jsonResponse({ code,message:'Synthetic SQL boundary rejected this request.' },code === '42501' ? 403 : code === '40001' ? 409 : 400);
    }
  };
  const graphFetch = async (input,init = {}) => {
    const url = new URL(input),method = init.method || 'GET';
    assert.equal(url.origin,'https://graph.facebook.com','No provider/model/OAuth or external network is allowed');
    assert.equal(new Headers(init.headers).get('authorization'),`Bearer ${secret}`);assert.equal(url.searchParams.has('access_token'),false);assert.equal(init.redirect,'error');
    graph.push({ method,path:url.pathname,body:init.body?.toString() });
    if (url.pathname === '/v25.0/act_700') { assert.equal(method,'GET');return jsonResponse({ id:'act_700',account_id:'700',currency:'BRL' }); }
    assert.equal(url.pathname,`/v25.0/${OBJECT_ID}`);
    if (method === 'POST') {
      assert.deepEqual([...new URLSearchParams(init.body)],[['status','PAUSED']]);currentStatus = 'PAUSED';
      if (loseNextPost) { loseNextPost = false;throw Error('Synthetic lost POST response'); }
      return jsonResponse({ success:true });
    }
    assert.equal(method,'GET');
    return jsonResponse({ id:OBJECT_ID,account_id:'700',status:currentStatus,configured_status:currentStatus,campaign_id:'2234567890123',optimization_goal:'LINK_CLICKS' });
  };
  const context = vm.createContext({ URL,URLSearchParams,Response,Request,Headers,AbortController,AbortSignal,TextEncoder,TextDecoder,atob,btoa,structuredClone,crypto:webcrypto,setTimeout,clearTimeout,
    fetch:graphFetch,console:{ log:(...args) => logs.push(args),warn:(...args) => logs.push(args),error:(...args) => logs.push(args) },
    require:specifier => specifier.includes('/http/server.ts') ? { serve:callback => { handler = callback; } } : specifier.includes('supabase-js') ? { createClient:(url,key,options = {}) => {
      assert.equal(url,'https://fixture.invalid');assert.ok(['fixture-anon','fixture-service'].includes(key));
      return createClient(url,key,{ ...options,global:{ ...options.global,fetch:sdkFetch } });
    } } : assert.fail(`Unexpected VM import ${specifier}`),
    Deno:{ env:{ get:key => ({ SUPABASE_URL:'https://fixture.invalid',SUPABASE_ANON_KEY:'fixture-anon',SUPABASE_SERVICE_ROLE_KEY:'fixture-service',META_SYSTEM_USER_ACCESS_TOKEN:secret })[key] } },
  });
  vm.runInContext(source,context);assert.equal(typeof handler,'function');
  const send = async (body,{ actor = ids.admin,session = actor === ids.admin ? ids.session : ids.otherSession } = {}) => {
    const response = await handler(new Request('https://fixture.invalid/functions/v1/atlas-chat',{ method:'POST',headers:{ Authorization:`Bearer ${jwt(actor,session)}`,'Content-Type':'application/json' },body:JSON.stringify(body) }));
    return { status:response.status,body:await response.json() };
  };
  return { send,calls,graph,logs,posts:() => graph.filter(call => call.method === 'POST').length };
}

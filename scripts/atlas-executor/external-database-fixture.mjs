import { spawnSync } from 'node:child_process';
import { mkdtempSync,readFileSync,rmSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';
export { id,ids,literal,json } from './database-fixture.mjs';
import { id,ids,literal,json } from './database-fixture.mjs';
const file = name => readFileSync(new URL(`../../supabase/migrations/${name}.sql`,import.meta.url),'utf8');
function extract(source,name) {
  const offset = source.toLowerCase().indexOf(`create or replace function ${name}(`);
  assert.ok(offset >= 0,name);return source.slice(offset,source.indexOf('$$;',offset) + 3);
}
export function externalDatabaseFixture() {
  const work = mkdtempSync('/tmp/atlas-external-db-'),dir = join(work,'data'),env = { PATH:process.env.PATH,LC_ALL:'C' };
  const psql = ['-X','-Aqt','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose','-h',work,'-p','55536','-U','atlas_external_qa','-d','postgres'];
  let started = false,sequence = 4000;
  const run = (binary,args,input) => { const r = spawnSync(binary,args,{ input,env,encoding:'utf8',timeout:25000 });if (r.status || r.error) throw Error(r.stderr || r.error.message);return r.stdout.trim(); };
  const sql = input => run('psql',psql,input);
  const userSql = (statement,{ actor = ids.admin,session = ids.session,role = 'authenticated',delegate } = {}) => `BEGIN;SET LOCAL ROLE ${role};SET LOCAL test.uid=${literal(actor)};SET LOCAL request.jwt.claims=${literal(JSON.stringify({ role,sub:actor,...(session && { session_id:session }),...(delegate && { planeje_server_delegate:delegate }) }))};${statement};COMMIT;`;
  const user = (statement,options) => sql(userSql(statement,options));
  const serviceSql = statement => `BEGIN;SET LOCAL ROLE service_role;SET LOCAL test.uid='';SET LOCAL request.jwt.claims='{"role":"service_role"}';${statement};COMMIT;`;
  const service = statement => sql(serviceSql(statement));
  function proposal({ action = 'update_meta',payload = { adAccountId:'act_700',objectId:'1234567890123',level:'adset',status:'PAUSED' },before = { object_id:'1234567890123',account_id:'act_700',level:'adset',configured_status:'ACTIVE',api_version:'v25.0',currency:'BRL',currency_offset:100 } } = {}) {
    const conversation = id(++sequence),runId = id(++sequence),item = id(++sequence);
    sql(`INSERT INTO public.atlas_conversations(id,owner_id,client_id,title) VALUES('${conversation}','${ids.admin}','${ids.client}','Meta fictícia');
      INSERT INTO public.atlas_runs(id,owner_id,request_id,conversation_id,request_conversation_id,request_client_id,request_message,status,source_session_id)
      VALUES('${runId}','${ids.admin}','${id(++sequence)}','${conversation}','${conversation}','${ids.client}','[Executor Planeje] Meta fictícia','completed','${ids.session}');
      INSERT INTO public.atlas_execution_items(id,owner_id,conversation_id,run_id,client_id,call_id,kind,app,action,title,payload,before,effect,state,specification)
      VALUES('${item}','${ids.admin}','${conversation}','${runId}','${ids.client}','call','proposal','gestor',${literal(action)},'Meta fictícia',${json(payload)},${json(before)},'{"external":true}','proposed','{}')`);
    return { id:item,revision:1,run_id:runId,conversation_id:conversation };
  }
  const approve = (item,options) => JSON.parse(user(`SELECT public.atlas_executor_external_approve('${item.id}',${item.revision})`,options));
  const reserveStatement = (item,request,step = 'update') => `SELECT public.atlas_executor_external_reserve('${item.id}','${ids.session}',${literal(step)},${json(request)})`;
  const reserve = (item,request,step) => JSON.parse(service(reserveStatement(item,request,step)));
  const finish = (item,step,lease,state,receipt = null,error = null) => JSON.parse(service(`SELECT public.atlas_executor_external_finish('${item.id}','${ids.session}',${literal(step)},'${lease}',${literal(state)},${json(receipt)},${json(error)})`));
  function start() {
    run('initdb',['-D',dir,'-U','atlas_external_qa','--auth-local=trust','--auth-host=reject','--no-locale','--encoding=UTF8']);
    run('pg_ctl',['-D',dir,'-l',join(work,'postgres.log'),'-o',`-k ${work} -p 55536 -c listen_addresses='' -c unix_socket_permissions=0700`,'-w','start']);started = true;
    assert.equal(sql('SHOW listen_addresses'),'');
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
  }
  function stop() { if (started) run('pg_ctl',['-D',dir,'-m','immediate','-w','stop']);rmSync(work,{ recursive:true,force:true }); }
  return { start,stop,sql,user,userSql,service,serviceSql,proposal,approve,reserve,reserveStatement,finish,psql,env };
}

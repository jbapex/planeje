import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

export const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const OWNER = id(1), SESSION = id(2), CLIENT = id(3), RUN = id(4), CONVERSATION = id(5), JOB = id(6), LEASE = id(7);
export const literal = value => value === null ? 'NULL' : `'${String(value).replaceAll("'", "''")}'`;
const file = name => readFileSync(new URL(`../../${name}`, import.meta.url), 'utf8');
const migration = name => file(`supabase/migrations/${name}`);
function extract(source, start) {
  const offset = source.indexOf(start); assert.ok(offset >= 0, start);
  const end = source.indexOf('$$;', offset); assert.ok(end > offset, start);
  return source.slice(offset, end + 3);
}
export function budgetFixture() {
  const work = mkdtempSync('/tmp/atlas-executor-budget-'), dir = join(work, 'data'), env = { PATH: process.env.PATH, LC_ALL: 'C' };
  const psql = ['-X', '-Aqt', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose', '-h', work, '-p', '55535', '-U', 'executor_budget_qa', '-d', 'postgres'];
  let started = false;
  function run(binary, args, input) {
    const result = spawnSync(binary, args, { input, env, encoding: 'utf8', timeout: 25000 });
    if (result.error || result.status) throw Error(result.stderr?.trim() || result.error?.message || result.stdout);
    return result.stdout.trim();
  }
  const sql = input => run('psql', psql, input);
  const service = statement => sql(`BEGIN;SET LOCAL ROLE service_role;${statement};COMMIT;`);
  const reserve = (call, estimate, runId = RUN) => JSON.parse(service(`SELECT public.atlas_executor_model_reserve('${runId}','${call}',${estimate})`));
  const finish = (call, usage = null) => service(`SELECT public.atlas_model_finish('${call}',${usage === null ? 'NULL' : `${literal(JSON.stringify(usage))}::jsonb`})`);
  let sequence = 3000;
  function newRun({ message = '[Executor Planeje]\nPedido QA', status = 'processing', session = SESSION } = {}) {
    const conversation = id(++sequence), runId = id(++sequence);
    sql(`INSERT INTO public.atlas_conversations(id,owner_id,client_id,title) VALUES('${conversation}','${OWNER}','${CLIENT}','Pedido QA');
      INSERT INTO public.atlas_runs(id,owner_id,request_id,conversation_id,request_client_id,request_message,source_session_id,status)
      VALUES('${runId}','${OWNER}','${id(++sequence)}','${conversation}','${CLIENT}',${literal(message)},${literal(session)},${literal(status)});`);
    return runId;
  }
  function start() {
    run('initdb', ['-D', dir, '-U', 'executor_budget_qa', '--auth-local=trust', '--auth-host=reject', '--no-locale', '--encoding=UTF8']);
    run('pg_ctl', ['-D', dir, '-l', join(work, 'postgres.log'), '-o', `-k ${work} -p 55535 -c listen_addresses='' -c unix_socket_permissions=0700`, '-w', 'start']); started = true;
    assert.equal(sql('SHOW listen_addresses'), ''); assert.match(run('psql', ['--version']), /PostgreSQL\) 16\./);
    sql(`CREATE ROLE anon NOLOGIN;CREATE ROLE authenticated NOLOGIN;CREATE ROLE service_role NOLOGIN BYPASSRLS;
      CREATE SCHEMA auth;CREATE SCHEMA private;GRANT USAGE ON SCHEMA public,private,auth TO authenticated,service_role;
      CREATE TABLE auth.users(id uuid PRIMARY KEY,banned_until timestamptz);CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid REFERENCES auth.users(id),not_after timestamptz);
      CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(auth.jwt()->>'sub','')::uuid$$;
      CREATE TABLE public.profiles(id uuid PRIMARY KEY,role text,status text);CREATE TABLE public.clientes(id uuid PRIMARY KEY);
      CREATE TABLE public.module_settings(module_name text PRIMARY KEY,is_enabled boolean);CREATE TABLE public.user_module_permissions(user_id uuid,module_name text,is_enabled boolean);
      INSERT INTO auth.users VALUES('${OWNER}',NULL);INSERT INTO auth.sessions VALUES('${SESSION}','${OWNER}',NULL);
      INSERT INTO public.profiles VALUES('${OWNER}','admin','active');INSERT INTO public.clientes VALUES('${CLIENT}');
      INSERT INTO public.module_settings VALUES('assistant',true);GRANT SELECT ON public.profiles,public.clientes TO authenticated;`);
    sql(migration('20261009004301_atlas_personal_assistant.sql'));
    sql(`ALTER TABLE public.atlas_runs ADD COLUMN source_session_id uuid REFERENCES auth.sessions(id) ON DELETE SET NULL;`);
    const jobs = migration('20261009030813_atlas_manager_memory_jobs.sql');
    sql(jobs.match(/CREATE TABLE public\.atlas_jobs \([\s\S]*?\n\);/)[0]);
    sql(`ALTER TABLE public.atlas_jobs ADD COLUMN source_session_id uuid REFERENCES auth.sessions(id);
      CREATE TABLE public.atlas_team_threads(id uuid PRIMARY KEY,owner_id uuid);
      CREATE TABLE public.atlas_team_requests(id uuid PRIMARY KEY,thread_id uuid,state text,lease uuid,lease_until timestamptz,result jsonb,usage jsonb,thread_revision integer,message_id uuid,created_at timestamptz);
      CREATE TABLE public.atlas_team_messages(id uuid PRIMARY KEY,content text);
      CREATE TABLE public.atlas_event_config(owner_id uuid PRIMARY KEY,enabled boolean NOT NULL DEFAULT true);`);
    const sharedFixture = file('scripts/atlas-manager-integration/model-budget-fixture.sql');
    sql(sharedFixture.slice(0, sharedFixture.indexOf('INSERT INTO auth.users')));
    sql(extract(migration('20261018150153_atlas_manager_source_session_acl.sql'), 'CREATE FUNCTION private.atlas_source_session_exists'));
    sql('REVOKE ALL ON FUNCTION private.atlas_source_session_exists(uuid,uuid) FROM PUBLIC,anon,authenticated');
    const office = migration('20261015044353_atlas_office_manager.sql');
    sql(office.match(/CREATE TABLE public\.atlas_office_config \([\s\S]*?\n\);/)[0]);
    sql(extract(office, 'CREATE FUNCTION public.atlas_office_reserve(').replace('public.atlas_office_reserve(', 'public.atlas_office_reserve_before_events('));
    sql(extract(migration('20261017000743_atlas_event_production.sql'), 'CREATE FUNCTION public.atlas_office_reserve('));
    sql(migration('20261028213929_atlas_model_shared_budget.sql'));
    sql('GRANT EXECUTE ON FUNCTION private.atlas_source_session_exists(uuid,uuid) TO service_role');
    sql(`REVOKE ALL ON FUNCTION public.atlas_office_reserve(uuid,date,integer),public.atlas_office_reserve_before_events(uuid,date,integer) FROM PUBLIC,anon,authenticated;
      GRANT SELECT,INSERT,UPDATE ON ALL TABLES IN SCHEMA public TO service_role;
      GRANT EXECUTE ON FUNCTION public.atlas_office_reserve(uuid,date,integer),public.atlas_office_reserve_before_events(uuid,date,integer) TO service_role;
      UPDATE public.atlas_settings SET owner_id='${OWNER}',enabled=true WHERE id='atlas';
      INSERT INTO public.atlas_event_config(owner_id,usage_day,max_tokens_per_day) VALUES('${OWNER}',(now() AT TIME ZONE 'America/Sao_Paulo')::date,1000);
      INSERT INTO public.atlas_office_state(owner_id,usage_day) VALUES('${OWNER}',(now() AT TIME ZONE 'America/Sao_Paulo')::date);
      INSERT INTO public.atlas_office_config(id,owner_id,enabled,max_tokens_per_day,max_analyses_per_day) VALUES('atlas','${OWNER}',true,1000,10);
      INSERT INTO public.atlas_conversations(id,owner_id,client_id,title) VALUES('${CONVERSATION}','${OWNER}','${CLIENT}','Orçamento QA');
      INSERT INTO public.atlas_runs(id,owner_id,request_id,conversation_id,request_client_id,request_message,source_session_id)
        VALUES('${RUN}','${OWNER}','${id(8)}','${CONVERSATION}','${CLIENT}',E'[Executor Planeje]\\nPedido QA','${SESSION}');
      INSERT INTO public.atlas_jobs(id,owner_id,conversation_id,origin_run_id,client_id,title,task,status,lease_token,lease_until,source_session_id)
        VALUES('${JOB}','${OWNER}','${CONVERSATION}','${RUN}','${CLIENT}','Missão QA','Conferir QA','running','${LEASE}',clock_timestamp()+interval '5 minutes','${SESSION}');`);
    const fingerprints = sql("SELECT jsonb_object_agg(proname,md5(prosrc)||':'||proacl::text) FROM pg_proc WHERE oid IN('public.atlas_model_reserve(uuid,integer,uuid,uuid,uuid)'::regprocedure,'public.atlas_model_finish(uuid,jsonb)'::regprocedure)");
    sql(migration('20261112034525_atlas_executor_model_budget.sql'));
    assert.equal(sql("SELECT jsonb_object_agg(proname,md5(prosrc)||':'||proacl::text) FROM pg_proc WHERE oid IN('public.atlas_model_reserve(uuid,integer,uuid,uuid,uuid)'::regprocedure,'public.atlas_model_finish(uuid,jsonb)'::regprocedure)"), fingerprints);
  }
  function stop() { if (started) run('pg_ctl', ['-D', dir, '-m', 'immediate', '-w', 'stop']); rmSync(work, { recursive: true, force: true }); }
  return { start, stop, sql, service, reserve, finish, newRun, psql, env };
}

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

export const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const ids = { admin: id(1), staff: id(2), other: id(3), client: id(11), foreign: id(12), channel: id(21), hiddenChannel: id(22), contact: id(31), session: id(91), otherSession: id(92) };
export const literal = value => value === null ? 'NULL' : `'${String(value).replaceAll("'", "''")}'`;
export const json = value => `${literal(JSON.stringify(value))}::jsonb`;
const migration = file => readFileSync(new URL(`../../supabase/migrations/${file}`, import.meta.url), 'utf8');

export function databaseFixture({ port = 55533 } = {}) {
  assert.ok(Number.isInteger(port) && port >= 1024 && port <= 65535, 'Private fixture port');
  const work = mkdtempSync('/tmp/atlas-executor-db-'), dir = join(work, 'data');
  const env = { PATH: process.env.PATH, LC_ALL: 'C' };
  const psql = ['-X', '-Aqt', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose', '-h', work, '-p', String(port), '-U', 'atlas_executor_qa', '-d', 'postgres'];
  let started = false;
  function run(binary, args, input) {
    const result = spawnSync(binary, args, { input, env, encoding: 'utf8', timeout: 25000 });
    if (result.error || result.status) throw Error(result.stderr?.trim() || result.error?.message || result.stdout);
    return result.stdout.trim();
  }
  const sql = input => run('psql', psql, input);
  const claims = ({ actor = ids.admin, session = ids.session, role = 'authenticated', delegate } = {}) => ({ sub: actor, role, ...(session && { session_id: session }), ...(delegate && { planeje_server_delegate: delegate }) });
  const userSql = (statement, options = {}) => `BEGIN;SET LOCAL ROLE ${options.role || 'authenticated'};SET LOCAL test.uid=${literal(options.actor || ids.admin)};SET LOCAL request.jwt.claims=${literal(JSON.stringify(claims(options)))};${statement};COMMIT;`;
  const asUser = (statement, options) => sql(userSql(statement, options));
  const storeStatement = (runId, callId, item) => `SELECT public.atlas_executor_store(${literal(runId)}::uuid,${literal(callId)},${json(item)})`;
  const store = (runId, callId, item, options) => JSON.parse(asUser(storeStatement(runId, callId, item), options));
  const decideStatement = (item, decision, answers = {}, text = null, revision = item.revision) => `SELECT public.atlas_executor_decide(${literal(item.id)}::uuid,${revision},${literal(decision)},${json(answers)},${literal(text)})`;
  const decide = (item, decision, answers, text, options, revision) => JSON.parse(asUser(decideStatement(item, decision, answers, text, revision), options));
  let sequence = 1000;
  function newRun({ actor = ids.admin, client = ids.client, conversationClient = client, session = ids.session, message = '[Executor Planeje]\nPedido fictício', status = 'processing' } = {}) {
    const conversation = id(++sequence), run = id(++sequence);
    sql(`INSERT INTO public.atlas_conversations(id,owner_id,client_id,title) VALUES('${conversation}',${literal(actor)},${literal(conversationClient)},'Pedido fictício');
      INSERT INTO public.atlas_runs(id,owner_id,request_id,conversation_id,request_conversation_id,request_client_id,request_message,status,source_session_id)
      VALUES('${run}',${literal(actor)},'${id(++sequence)}','${conversation}','${conversation}',${literal(client)},${literal(message)},${literal(status)},${literal(session)});`);
    return { run, conversation };
  }
  function start() {
    run('initdb', ['-D', dir, '-U', 'atlas_executor_qa', '--auth-local=trust', '--auth-host=reject', '--no-locale', '--encoding=UTF8']);
    run('pg_ctl', ['-D', dir, '-l', join(work, 'postgres.log'), '-o', `-k ${work} -p ${port} -c listen_addresses='' -c unix_socket_permissions=0700`, '-w', 'start']);
    started = true;
    assert.equal(sql('SHOW listen_addresses'), '');
    assert.match(run('psql', ['--version']), /PostgreSQL\) 16\./);
    const fixture = readFileSync(new URL('../crm-ia/workspace.database.test.mjs', import.meta.url), 'utf8').split('    sql(`')[1].split('    `);')[0].replace(/\$\{(\w+)\}/g, (_, key) => ids[key]);
    sql(fixture);
    sql(`CREATE SCHEMA planeje_private;CREATE TABLE auth.users(id uuid PRIMARY KEY,banned_until timestamptz);
      CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid REFERENCES auth.users(id),not_after timestamptz);
      CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
      CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$SELECT auth.jwt()->>'role'$$;
      INSERT INTO auth.users(id) VALUES('${ids.admin}'),('${ids.staff}'),('${ids.other}');
      INSERT INTO auth.sessions(id,user_id) VALUES('${ids.session}','${ids.admin}'),('${ids.otherSession}','${ids.staff}');
      GRANT SELECT ON public.profiles,public.clientes TO authenticated;
      INSERT INTO public.module_settings VALUES('assistant',true),('crm',true);`);
    const auth = migration('20261013140451_invite_only_access.sql');
    for (const name of ['private.planeje_live_session', 'private.planeje_approved_access', 'public.planeje_current_account_access']) {
      const pattern = new RegExp(`create or replace function ${name.replaceAll('.', '\\.')}\\(\\)[\\s\\S]+?\\$\\$;`, 'i');
      const match = auth.match(pattern); assert.ok(match, name); sql(match[0]);
    }
    sql('GRANT EXECUTE ON FUNCTION private.planeje_live_session(),private.planeje_approved_access(),public.planeje_current_account_access() TO authenticated,service_role');
    sql(migration('20261111041704_crm_ia_workspace.sql'));
    sql(migration('20261111043800_crm_ia_workspace_readings.sql'));
    sql(migration('20261009004301_atlas_personal_assistant.sql'));
    sql(`UPDATE public.atlas_settings SET owner_id='${ids.admin}',enabled=true WHERE id='atlas';`);
    sql(migration('20261112032940_atlas_executor.sql'));
  }
  function stop() {
    if (started) run('pg_ctl', ['-D', dir, '-m', 'immediate', '-w', 'stop']);
    rmSync(work, { recursive: true, force: true });
  }
  return { start, stop, sql, asUser, store, storeStatement, decide, decideStatement, userSql, newRun, psql, env, work };
}

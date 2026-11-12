/**
 * Real Atlas migration/RLS tests in a new, disposable local PostgreSQL cluster.
 * Run: node scripts/atlasDatabase.test.mjs
 * Optional: ATLAS_PG_BIN=/path/to/postgresql/bin (PostgreSQL 16+).
 * No remote DSN, existing database, credentials, Docker or global service is used.
 * Supabase Auth/profile/client tables are minimal synthetic fixtures; this is not
 * a full production-schema or HTTP/PostgREST integration test.
 */
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const migration = join(root, 'supabase/migrations/20261009004301_atlas_personal_assistant.sql');
const candidates = [process.env.ATLAS_PG_BIN, '/opt/homebrew/opt/postgresql@16/bin', '/usr/lib/postgresql/16/bin', '/usr/lib/postgresql/17/bin'].filter(Boolean);
const bin = candidates.find((p) => ['initdb', 'pg_ctl', 'psql'].every((cmd) => existsSync(join(p, cmd))));
assert.ok(bin, 'PostgreSQL local não encontrado. Configure ATLAS_PG_BIN; nenhum servidor será instalado.');
assert.ok(readFileSync(migration, 'utf8').trim(), 'Migração Atlas vazia.');
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('PG')));
env.LC_ALL = 'C';
const workRoot = join(root, '.local/atlas-pg');
mkdirSync(workRoot, { recursive: true });
const work = mkdtempSync(join(workRoot, 'run-'));
const dataDir = join(work, 'data');
// A short, unique Unix socket path also avoids macOS sockaddr_un length limits.
const socketDir = mkdtempSync('/tmp/atlas-pg-');
const psqlArgs = ['-X', '-q', '-t', '-A', '-h', socketDir, '-p', '5432', '-U', 'atlas_test_operator', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'];
let cleaned = false;
let checks = 0;

function command(name, args, options = {}) {
  const result = spawnSync(join(bin, name), args, { env, encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024, ...options });
  if (result.error || result.status !== 0) throw new Error(`${name}: ${result.error?.message || result.stderr || result.stdout}`);
  return result.stdout.trim();
}
function cleanup() {
  if (cleaned) return;
  cleaned = true;
  if (existsSync(join(dataDir, 'postmaster.pid'))) {
    try { command('pg_ctl', ['-D', dataDir, '-m', 'immediate', '-w', 'stop']); }
    catch (error) { console.error('Falha no encerramento local:', error.message); process.exitCode = 1; return; }
  }
  rmSync(work, { recursive: true, force: true });
  rmSync(socketDir, { recursive: true, force: true });
}
process.once('exit', cleanup);
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { cleanup(); process.exit(signal === 'SIGINT' ? 130 : 143); });

const OWNER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const ADMIN = '33333333-3333-4333-8333-333333333333';
const CLIENT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CLIENT_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const PRIVATE_CLIENT = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const q = (value) => value == null ? 'NULL' : `'${String(value).replaceAll("'", "''")}'`;
const owner = { role: 'authenticated', uid: OWNER };
const other = { role: 'authenticated', uid: OTHER };
const admin = { role: 'authenticated', uid: ADMIN };
const anon = { role: 'anon', uid: null };
function wrapped(sql, actor = {}) {
  const { role, uid } = actor;
  assert.ok(!role || ['anon', 'authenticated', 'service_role'].includes(role));
  return `BEGIN; ${role ? `SET LOCAL ROLE ${role};` : ''}
    SET LOCAL request.jwt.claim.sub = ${q(uid || '')};
    SET LOCAL request.jwt.claims = ${q(JSON.stringify({ sub: uid || null, role: role || 'operator', user_metadata: { role: 'superadmin', atlas_owner: true } }))};
    ${sql}\nCOMMIT;`;
}
function sql(statement, actor) { return command('psql', psqlArgs, { input: wrapped(statement, actor) }); }
function json(statement, actor = owner) { return JSON.parse(sql(statement, actor)); }
function expectFailure(statement, actor, message) {
  assert.throws(() => sql(statement, actor), message);
  checks++;
}
function equal(statement, expected, actor = owner) { assert.equal(sql(statement, actor), String(expected)); checks++; }
function pass(label) { console.log(`PASS ${label}`); }
function claim(request, conversation = null, client = CLIENT_A, message = 'Analise as entregas do cliente.') {
  return `SELECT public.atlas_claim_run(${q(request)}, ${q(conversation)}, ${q(client)}, ${q(message)});`;
}
function finish(run, status = 'completed', content = 'Proposta com fonte.') {
  return `SELECT public.atlas_finish_run(${q(run)}, ${q(status)}, ${q(content)}, '[]', '{"model_calls":1}', NULL);`;
}
function saveMemory(content, client = CLIENT_A, replaces = null, confirmed = true) {
  return `SELECT public.atlas_save_memory(${q(content)}, ${q(client)}, ${confirmed}, ${q(replaces)});`;
}
function sqlAsync(statement, actor = owner) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(join(bin, 'psql'), psqlArgs, { env, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('exit', (code) => code === 0 ? resolvePromise(stdout.trim()) : reject(new Error(stderr)));
    child.stdin.end(wrapped(statement, actor));
  });
}

try {
  command('initdb', ['-D', dataDir, '-U', 'atlas_test_operator', '--auth-local=trust', '--auth-host=reject', '--no-locale', '--encoding=UTF8']);
  writeFileSync(join(dataDir, 'postgresql.auto.conf'), `listen_addresses = ''\nunix_socket_directories = '${socketDir}'\nunix_socket_permissions = 0700\nmax_connections = 12\nshared_buffers = '16MB'\n`);
  command('pg_ctl', ['-D', dataDir, '-l', join(work, 'postgres.log'), '-w', 'start']);
  equal('SHOW listen_addresses;', '', {});
  equal('SHOW data_directory;', dataDir, {});

  sql(`
    CREATE ROLE anon NOLOGIN;
    CREATE ROLE authenticated NOLOGIN;
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;
    GRANT USAGE ON SCHEMA auth, public TO anon, authenticated, service_role;
    GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
    CREATE TABLE public.profiles (id uuid PRIMARY KEY, role text NOT NULL, status text NOT NULL);
    CREATE TABLE public.clientes (id uuid PRIMARY KEY, viewer_id uuid NOT NULL);
    INSERT INTO public.profiles VALUES ('${OWNER}', 'admin', 'active'), ('${OTHER}', 'colaborador', 'active'), ('${ADMIN}', 'admin', 'active');
    INSERT INTO public.clientes VALUES ('${CLIENT_A}', '${OWNER}'), ('${CLIENT_B}', '${OWNER}'), ('${PRIVATE_CLIENT}', '${OTHER}');
    ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
    CREATE POLICY profile_self ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid());
    CREATE POLICY client_viewer ON public.clientes FOR SELECT TO authenticated USING (viewer_id = auth.uid());
    GRANT SELECT ON public.profiles, public.clientes TO authenticated;
    GRANT ALL ON public.profiles, public.clientes TO service_role;
    -- Exercise the older Supabase permissive defaults: the migration must revoke them.
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
  `);
  command('psql', [...psqlArgs, '-f', migration]);
  equal("SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND c.relname LIKE 'atlas_%' AND c.relrowsecurity;", 5, {});
  equal("SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname LIKE 'atlas_%' AND p.prosecdef;", 0, {});
  equal("SELECT owner_id IS NULL AND NOT enabled FROM public.atlas_settings WHERE id='atlas';", 't', {});
  equal('SELECT public.atlas_is_owner();', 'f');
  expectFailure(claim('10000000-0000-4000-8000-000000000001'), owner, /ATLAS_FORBIDDEN/);
  expectFailure(`UPDATE public.atlas_settings SET owner_id='${OTHER}', enabled=true;`, other, /permission denied/);
  expectFailure('SELECT * FROM public.atlas_settings;', anon, /permission denied/);
  pass('migration applies with restrictive grants, RLS, invoker RPCs and disabled/unassigned default');

  sql(`UPDATE public.atlas_settings SET owner_id='${OWNER}', enabled=true WHERE id='atlas';`);
  equal('SELECT public.atlas_is_owner();', 't');
  for (const actor of [other, admin]) {
    equal('SELECT public.atlas_is_owner();', 'f', actor);
    equal('SELECT count(*) FROM public.atlas_settings;', 0, actor);
    expectFailure(claim('10000000-0000-4000-8000-000000000002'), actor, /ATLAS_FORBIDDEN/);
    expectFailure(saveMemory('Tentativa indevida.'), actor, /ATLAS_FORBIDDEN/);
  }
  sql(`UPDATE public.profiles SET role='superadmin' WHERE id='${ADMIN}';`);
  equal('SELECT public.atlas_is_owner();', 'f', admin);
  expectFailure(claim('10000000-0000-4000-8000-000000000003'), admin, /ATLAS_FORBIDDEN/);
  sql(`UPDATE public.profiles SET role='admin' WHERE id='${ADMIN}';`);
  expectFailure(`UPDATE public.atlas_settings SET enabled=false;`, owner, /permission denied/);
  for (const status of ['inactive', 'blocked']) {
    sql(`UPDATE public.profiles SET status=${q(status)} WHERE id='${OWNER}';`);
    equal('SELECT public.atlas_is_owner();', 'f');
  }
  sql(`UPDATE public.profiles SET status='active', role='cliente' WHERE id='${OWNER}';`);
  equal('SELECT public.atlas_is_owner();', 'f');
  sql(`UPDATE public.profiles SET role='admin' WHERE id='${OWNER}';`);
  pass('owner identity cannot be replaced by another admin, user metadata, inactive profile or browser enrollment');

  const req = '10000000-0000-4000-8000-000000000010';
  const first = json(claim(req));
  assert.equal(first.claimed, true); checks++;
  const replay = json(claim(req));
  assert.equal(replay.claimed, false); assert.equal(replay.run.id, first.run.id); checks += 2;
  equal('SELECT count(*) FROM public.atlas_runs;', 1);
  equal('SELECT count(*) FROM public.atlas_conversations;', 1);
  equal('SELECT count(*) FROM public.atlas_messages;', 1);
  expectFailure(claim(req, null, CLIENT_A, 'Outro pedido.'), owner, /ATLAS_REQUEST_CONFLICT/);
  expectFailure(claim('10000000-0000-4000-8000-000000000011', null, PRIVATE_CLIENT), owner, /ATLAS_CLIENT_FORBIDDEN/);
  expectFailure(claim('10000000-0000-4000-8000-000000000012', first.run.conversation_id, CLIENT_B), owner, /ATLAS_SCOPE_CONFLICT/);
  expectFailure(claim('10000000-0000-4000-8000-000000000013', first.run.conversation_id), owner, /ATLAS_CONVERSATION_BUSY/);
  equal('SELECT count(*) FROM public.atlas_runs;', 1);
  expectFailure(`SELECT public.atlas_finish_run('${first.run.id}', 'completed', 'Resposta provisória', '{}', '{}', NULL);`, owner, /check constraint/);
  equal(`SELECT status FROM public.atlas_runs WHERE id='${first.run.id}';`, 'processing');
  equal('SELECT count(*) FROM public.atlas_messages;', 1);
  json(finish(first.run.id));
  json(finish(first.run.id));
  equal('SELECT count(*) FROM public.atlas_messages;', 2);
  equal(`SELECT status FROM public.atlas_runs WHERE id='${first.run.id}';`, 'completed');
  expectFailure(`UPDATE public.atlas_runs SET request_message='Alterado' WHERE id='${first.run.id}';`, owner, /ATLAS_IMMUTABLE_REQUEST/);
  expectFailure(`UPDATE public.atlas_messages SET content='Alterado';`, owner, /ATLAS_IMMUTABLE_MESSAGE/);
  expectFailure(`UPDATE public.atlas_conversations SET client_id='${CLIENT_B}';`, owner, /ATLAS_IMMUTABLE_SCOPE/);
  pass('run retry is idempotent, conflicting requests roll back, scope is fixed and completion is durable');

  const memory = json(saveMemory('Reservar três dias úteis para aprovação.'));
  expectFailure(saveMemory('Não confirmado.', CLIENT_A, null, false), owner, /ATLAS_MEMORY_CONFIRM_REQUIRED/);
  expectFailure(saveMemory('Cliente privado.', PRIVATE_CLIENT), owner, /ATLAS_CLIENT_FORBIDDEN/);
  expectFailure(saveMemory('Mudança de escopo.', CLIENT_B, memory.id), owner, /ATLAS_MEMORY_CONFLICT/);
  expectFailure(`UPDATE public.atlas_memories SET content='Apagar histórico';`, owner, /ATLAS_MEMORY_NEW_VERSION_REQUIRED/);
  const revision = json(saveMemory('Reservar quatro dias úteis para aprovação.', CLIENT_A, memory.id));
  assert.equal(revision.version, 2); assert.equal(revision.replaces_id, memory.id); checks += 2;
  equal(`SELECT state FROM public.atlas_memories WHERE id='${memory.id}';`, 'replaced');
  equal(`SELECT count(*) FROM public.atlas_memories WHERE state='active';`, 1);
  expectFailure(saveMemory('Revisão repetida.', CLIENT_A, memory.id), owner, /ATLAS_MEMORY_CONFLICT/);
  equal('SELECT count(*) FROM public.atlas_memories;', 2);

  // Force the INSERT half to fail after the predecessor UPDATE; both must roll back.
  sql(`CREATE FUNCTION public.atlas_test_fail_insert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'TEST_INSERT_FAILURE'; END $$;
    CREATE TRIGGER atlas_test_fail_insert BEFORE INSERT ON public.atlas_memories FOR EACH ROW EXECUTE FUNCTION public.atlas_test_fail_insert();`);
  expectFailure(saveMemory('Revisão que deve falhar.', CLIENT_A, revision.id), owner, /TEST_INSERT_FAILURE/);
  equal(`SELECT state FROM public.atlas_memories WHERE id='${revision.id}';`, 'active');
  equal('SELECT count(*) FROM public.atlas_memories;', 2);
  sql('DROP TRIGGER atlas_test_fail_insert ON public.atlas_memories; DROP FUNCTION public.atlas_test_fail_insert();');
  pass('memory revisions preserve history, refuse cross-client edits and roll back atomically on insertion failure');

  for (const table of ['atlas_conversations', 'atlas_runs', 'atlas_messages', 'atlas_memories']) {
    for (const actor of [other, admin]) {
      equal(`SELECT count(*) FROM public.${table};`, 0, actor);
      const field = table === 'atlas_memories' ? "state='revoked'" : table === 'atlas_conversations' ? "title='Invasão'" : table === 'atlas_messages' ? "content='Invasão'" : "status='failed'";
      equal(`WITH affected AS (UPDATE public.${table} SET ${field} RETURNING id) SELECT count(*) FROM affected;`, 0, actor);
      expectFailure(`DELETE FROM public.${table};`, actor, /permission denied/);
    }
    expectFailure(`SELECT * FROM public.${table};`, anon, /permission denied/);
    expectFailure(`DELETE FROM public.${table};`, owner, /permission denied/);
    expectFailure(`UPDATE public.${table} SET owner_id='${OTHER}';`, owner, /ATLAS_IMMUTABLE_OWNER|row-level security/);
  }
  expectFailure(`INSERT INTO public.atlas_conversations(owner_id,title) VALUES ('${OTHER}','Invasão');`, other, /row-level security/);
  expectFailure(`INSERT INTO public.atlas_memories(owner_id,content) VALUES ('${OWNER}','Invasão');`, admin, /row-level security/);
  expectFailure(finish(first.run.id), admin, /ATLAS_FORBIDDEN/);
  expectFailure(saveMemory('Invasão.', CLIENT_A, revision.id), other, /ATLAS_FORBIDDEN/);
  pass('other users, ordinary admins and anonymous callers cannot read or change private rows');

  // Actual concurrent connections contend for the same unique request claim.
  const concurrentRequest = '10000000-0000-4000-8000-000000000020';
  const claims = await Promise.all([sqlAsync(claim(concurrentRequest)), sqlAsync(claim(concurrentRequest))]);
  assert.deepEqual(claims.map((value) => JSON.parse(value).claimed).sort(), [false, true]); checks++;
  equal(`SELECT count(*) FROM public.atlas_runs WHERE request_id='${concurrentRequest}';`, 1);
  const completedConcurrent = JSON.parse(claims[0]).run;
  json(finish(completedConcurrent.id, 'failed', null));
  equal(`SELECT count(*) FROM public.atlas_messages WHERE run_id='${completedConcurrent.id}' AND role='assistant';`, 0);
  const edits = await Promise.allSettled([
    sqlAsync(saveMemory('Nova versão concorrente A.', CLIENT_A, revision.id)),
    sqlAsync(saveMemory('Nova versão concorrente B.', CLIENT_A, revision.id)),
  ]);
  assert.equal(edits.filter((r) => r.status === 'fulfilled').length, 1);
  assert.match(edits.find((r) => r.status === 'rejected').reason.message, /ATLAS_MEMORY_CONFLICT/); checks += 2;
  equal(`SELECT count(*) FROM public.atlas_memories WHERE replaces_id='${revision.id}';`, 1);
  equal(`SELECT count(*) FROM public.atlas_memories WHERE state='active';`, 1);
  pass('parallel request claims deduplicate and parallel memory revisions cannot fork history');

  const currentMemory = JSON.parse(edits.find((result) => result.status === 'fulfilled').value);
  equal(`WITH revoked AS (UPDATE public.atlas_memories SET state='revoked', revoked_at=now() WHERE id='${currentMemory.id}' RETURNING id) SELECT count(*) FROM revoked;`, 1);
  equal(`SELECT count(*) FROM public.atlas_memories WHERE state='active';`, 0);
  equal(`SELECT count(*) FROM public.atlas_memories;`, 3);
  expectFailure(`UPDATE public.atlas_memories SET state='active' WHERE id='${currentMemory.id}';`, owner, /ATLAS_MEMORY_TERMINAL/);
  expectFailure(saveMemory('Reativar memória revogada.', CLIENT_A, currentMemory.id), owner, /ATLAS_MEMORY_CONFLICT/);
  pass('memory revocation retains history and cannot silently reactivate an old rule');

  sql("UPDATE public.atlas_settings SET enabled=false WHERE id='atlas';");
  for (const table of ['atlas_conversations', 'atlas_runs', 'atlas_messages', 'atlas_memories']) equal(`SELECT count(*) FROM public.${table};`, 0);
  expectFailure(claim('10000000-0000-4000-8000-000000000099'), owner, /ATLAS_FORBIDDEN/);
  equal('SELECT count(*) FROM public.atlas_settings;', 1);
  pass('disabling Atlas removes private-data access and blocks new missions');
  // Evolution keeps all v1 records and ACLs while adding durable background work.
  sql(`CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT current_setting('request.jwt.claims',true)::jsonb->>'role' $$; GRANT EXECUTE ON FUNCTION auth.role() TO anon,authenticated,service_role;`);
  command('psql',[...psqlArgs,'-f',join(root,'supabase/migrations/20261009030813_atlas_manager_memory_jobs.sql')]);
  sql("UPDATE public.atlas_settings SET enabled=true WHERE id='atlas';");
  const service={role:'service_role',uid:null};
  const managerRun=json(claim('10000000-0000-4000-8000-000000000101',null,CLIENT_A,'Prefiro planejar sempre às sextas, sem inventar aprovações.')).run;
  const learned=json(`SELECT atlas_learn('${managerRun.id}','Planejar às sextas.','Prefiro planejar sempre às sextas','rotina',null);`);
  equal(`SELECT source FROM atlas_memories WHERE id='${learned.id}';`,'conversation');
  expectFailure(`SELECT atlas_learn('${managerRun.id}','Inventado.','Uma frase que não foi dita','rotina',null);`,owner,/ATLAS_MEMORY_SOURCE_INVALID/);
  equal(`SELECT count(*) FROM atlas_recall('planejar sextas','${CLIENT_B}') WHERE id='${learned.id}';`,0);
  const duplicate=json(`SELECT atlas_learn('${managerRun.id}','Planejar às sextas.','Prefiro planejar sempre às sextas','rotina',null);`);
  assert.equal(duplicate.id,learned.id);checks++;
  const job=json(`INSERT INTO atlas_jobs(owner_id,conversation_id,origin_run_id,client_id,title,task) VALUES('${OWNER}','${managerRun.conversation_id}','${managerRun.id}','${CLIENT_A}','Missão teste','Verificar dados de teste.') RETURNING row_to_json(atlas_jobs);`);
  for(const actor of [other,admin]) {
    equal('SELECT count(*) FROM atlas_jobs;',0,actor);
    expectFailure('SELECT atlas_worker_claim();',actor,/permission denied/);
  }
  expectFailure(`UPDATE atlas_jobs SET status='completed',result='Falso' WHERE id='${job.id}';`,owner,/permission denied/);
  const claimedJob=json('SELECT atlas_worker_claim();',service);
  assert.equal(claimedJob.id,job.id);checks++;
  equal('SELECT atlas_worker_claim() IS NULL;','t',service);
  equal(`SELECT atlas_worker_finish('${job.id}','00000000-0000-4000-8000-000000000000','completed','Resultado',null,'[]','{}');`,'f',service);
  equal(`SELECT atlas_worker_finish('${job.id}','${claimedJob.lease_token}','completed','Resultado testado',null,'[]','{"model_calls":1}');`,'t',service);
  equal(`SELECT atlas_worker_finish('${job.id}','${claimedJob.lease_token}','completed','Duplicado',null,'[]','{}');`,'f',service);
  equal(`SELECT count(*) FROM atlas_inbox WHERE job_id='${job.id}';`,1);
  equal('SELECT count(*) FROM atlas_inbox;',0,admin);
  expectFailure(`UPDATE atlas_inbox SET body='invasão';`,owner,/permission denied/);
  equal("WITH r AS(UPDATE atlas_inbox SET read_at=now() RETURNING id) SELECT count(*) FROM r;",1);
  json(finish(managerRun.id));
  const afterJob=json(claim('10000000-0000-4000-8000-000000000102',managerRun.conversation_id,CLIENT_A,'Podemos continuar conversando?'));
  assert.equal(afterJob.claimed,true);checks++;
  sql("UPDATE atlas_settings SET enabled=false WHERE id='atlas';");
  equal('SELECT count(*) FROM atlas_jobs;',0);
  equal('SELECT count(*) FROM atlas_inbox;',0);
  equal('SELECT atlas_worker_claim() IS NULL;','t',service);
  pass('manager memory provenance, scoped recall, queue leases, private inbox and revocation');
  command('psql',[...psqlArgs,'-f',join(root,'supabase/migrations/20261009032640_atlas_manager_proactive.sql')]);
  sql("UPDATE atlas_settings SET enabled=true WHERE id='atlas';");
  const auto=json("SELECT to_jsonb(atlas_enqueue_proactive('daily:2026-10-09','Revisão privada','Consultar dados',null));",service);
  assert.ok(auto);checks++;
  equal("SELECT atlas_enqueue_proactive('daily:2026-10-09','Revisão privada','Consultar dados',null);",auto,service);
  equal(`SELECT count(*) FROM atlas_messages WHERE conversation_id=(SELECT conversation_id FROM atlas_jobs WHERE id='${auto}');`,0);
  expectFailure("SELECT atlas_enqueue_proactive('intruso','Não','Não',null);",owner,/permission denied/);
  sql("UPDATE atlas_settings SET monitor_enabled=false WHERE id='atlas';");
  equal("SELECT atlas_enqueue_proactive('daily:2026-10-10','Não','Não',null) IS NULL;",'t',service);
  pass('proactive work is deduplicated, private, pausable and never invents user messages');


  // Production-like source links, deliberately separate from the private Atlas tables.
  sql(`CREATE TABLE atendimento_conversas(id uuid PRIMARY KEY,cliente_id uuid REFERENCES clientes(id),is_group boolean,bloqueada boolean DEFAULT false,archived_at timestamptz);
    CREATE TABLE cliente_whatsapp_inbox(id uuid PRIMARY KEY,conversation_id uuid REFERENCES atendimento_conversas(id),cliente_id uuid REFERENCES clientes(id),is_group boolean,type text,media_purged_at timestamptz,created_at timestamptz DEFAULT now());
    ALTER TABLE atendimento_conversas ENABLE ROW LEVEL SECURITY; ALTER TABLE cliente_whatsapp_inbox ENABLE ROW LEVEL SECURITY;
    CREATE POLICY group_visibility ON atendimento_conversas FOR SELECT TO authenticated USING (cliente_id IN(SELECT id FROM clientes));
    CREATE POLICY message_visibility ON cliente_whatsapp_inbox FOR SELECT TO authenticated USING (cliente_id IN(SELECT id FROM clientes));
    GRANT SELECT ON atendimento_conversas,cliente_whatsapp_inbox TO authenticated;
    GRANT ALL ON atendimento_conversas,cliente_whatsapp_inbox TO service_role;`);
  command('psql',[...psqlArgs,'-f',join(root,'supabase/migrations/20261009043258_atlas_group_audio_transcripts.sql')]);
  const group='44444444-4444-4444-8444-444444444444',audio='55555555-5555-4555-8555-555555555555',foreignGroup='66666666-6666-4666-8666-666666666666';
  sql(`INSERT INTO atendimento_conversas(id,cliente_id,is_group) VALUES('${group}','${CLIENT_A}',true),('${foreignGroup}','${PRIVATE_CLIENT}',true);
    INSERT INTO cliente_whatsapp_inbox(id,conversation_id,cliente_id,is_group,type) VALUES('${audio}','${group}','${CLIENT_A}',true,'audio');`);
  equal(`SELECT atlas_audio_enqueue(ARRAY['${group}'::uuid]);`,0,service);
  sql("UPDATE atlas_settings SET transcribe_group_audio=true,audio_since=now()-interval '1 day' WHERE id='atlas';");
  expectFailure(`SELECT atlas_audio_enqueue(ARRAY['${group}'::uuid]);`,owner,/permission denied/);
  equal(`SELECT atlas_audio_enqueue(ARRAY['${group}'::uuid]);`,1,service);
  equal(`SELECT atlas_audio_enqueue(ARRAY['${group}'::uuid]);`,0,service);
  for(const actor of [other,admin])equal('SELECT count(*) FROM atlas_audio_transcripts;',0,actor);
  equal('SELECT count(*) FROM atlas_audio_transcripts;',1);
  expectFailure("UPDATE atlas_audio_transcripts SET transcript='fake';",owner,/permission denied/);
  const audioJob=json('SELECT atlas_audio_claim();',service);
  equal('SELECT atlas_audio_claim() IS NULL;','t',service);
  equal(`SELECT atlas_audio_finish('${audio}','00000000-0000-4000-8000-000000000000','text');`,'f',service);
  sql("UPDATE atlas_settings SET transcribe_group_audio=false WHERE id='atlas';");
  equal(`SELECT atlas_audio_finish('${audio}','${audioJob.lease_token}','text');`,'f',service);
  sql("UPDATE atlas_settings SET transcribe_group_audio=true WHERE id='atlas'; UPDATE atlas_audio_transcripts SET lease_until=now()-interval '1 second';");
  const recovered=json('SELECT atlas_audio_claim();',service);
  assert.notEqual(recovered.lease_token,audioJob.lease_token);checks++;
  equal(`SELECT atlas_audio_finish('${audio}','${audioJob.lease_token}','old text');`,'f',service);
  expectFailure(`SELECT atlas_audio_finish('${audio}','${recovered.lease_token}','');`,service,/ATLAS_EMPTY_TRANSCRIPT/);
  sql(`UPDATE atendimento_conversas SET bloqueada=true WHERE id='${group}';`);
  equal('SELECT count(*) FROM atlas_audio_transcripts;',0);
  equal(`SELECT atlas_audio_finish('${audio}','${recovered.lease_token}','text');`,'f',service);
  sql(`UPDATE atendimento_conversas SET bloqueada=false WHERE id='${group}';`);
  equal(`SELECT atlas_audio_finish('${audio}','${recovered.lease_token}','Alinhar o material','test-model','sha','{"input_tokens":10}');`,'t',service);
  equal(`SELECT atlas_audio_finish('${audio}','${recovered.lease_token}','second result');`,'f',service);
  equal('SELECT transcript FROM atlas_audio_transcripts;','Alinhar o material');
  sql(`UPDATE cliente_whatsapp_inbox SET conversation_id='${foreignGroup}',cliente_id='${PRIVATE_CLIENT}' WHERE id='${audio}';`);
  equal('SELECT count(*) FROM atlas_audio_transcripts;',0);
  sql(`DELETE FROM cliente_whatsapp_inbox WHERE id='${audio}';`);
  equal('SELECT count(*) FROM atlas_audio_transcripts;',0,service);
  sql(`INSERT INTO cliente_whatsapp_inbox(id,conversation_id,cliente_id,is_group,type) VALUES('${audio}','${group}','${CLIENT_A}',true,'audio');`);
  equal(`SELECT atlas_audio_enqueue(ARRAY['${group}'::uuid]);`,1,service);
  sql(`UPDATE cliente_whatsapp_inbox SET media_purged_at=now() WHERE id='${audio}';`);
  equal('SELECT atlas_audio_claim() IS NULL;','t',service);
  equal('SELECT status FROM atlas_audio_transcripts;','unavailable');
  sql(`DELETE FROM cliente_whatsapp_inbox WHERE id='${audio}';`);
  pass('audio source provenance, owner privacy, pause, dedupe, lease recovery, blocked groups and cascade deletion');
  console.log(`Atlas PostgreSQL: ${checks} assertions passed on a disposable local cluster.`);
} finally {
  cleanup();
}

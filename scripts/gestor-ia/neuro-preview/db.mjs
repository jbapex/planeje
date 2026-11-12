import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
export const CLIENT = '9196d07f-f0a8-4eb2-9f9a-3dade28d4a69';
export const ACTOR = '00000000-0000-0000-0000-000000000001';
export const WEEK = '2026-11-09';
export const TODAY = '2026-11-16';
const env = { PATH: process.env.PATH, LANG: 'C', LC_ALL: 'C' };
export const literal = (value) => value == null ? 'NULL' : `'${String(value).replaceAll("'", "''")}'`;

function run(file, args, input) {
  try { return execFileSync(file, args, { input, env, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] }).trim(); }
  catch (error) {
    const detail = String(error.stderr || error.stdout || error.message);
    throw Object.assign(new Error(detail), { code: detail.match(/ERROR:\s+([A-Z0-9]{5}):/)?.[1] || 'XX000' });
  }
}

function canonicalFunction(file, name) {
  const source = readFileSync(path.join(ROOT, 'supabase/migrations', file), 'utf8');
  const escaped = name.replaceAll('.', '\\.');
  const match = source.match(new RegExp(`create(?: or replace)? function\\s+${escaped}\\s*\\(.*?\\bas\\s+(\\$\\w*\\$).*?\\1\\s*;`, 'is'));
  if (!match) throw new Error(`Missing canonical function: ${name}`);
  return match[0];
}

function connection(directory) {
  const bindir = path.dirname(run('/usr/bin/which', ['psql']));
  const command = ['-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose', '-h', directory, '-p', '55481', '-U', 'postgres', '-d', 'postgres'];
  const sql = (source) => run(path.join(bindir, 'psql'), command, source);
  return {
    directory, sql,
    postgresPid: Number(readFileSync(path.join(directory, 'pg/postmaster.pid'), 'utf8').split('\n')[0]),
    json(expression, role = 'authenticated') {
      if (!['authenticated', 'service_role', 'anon'].includes(role)) throw new Error('Unsupported preview role');
      const claims = role === 'authenticated' ? { sub: ACTOR, session_id: ACTOR, role } : {};
      const result = sql(`BEGIN; SET LOCAL ROLE ${role}; SET LOCAL request.jwt.claims=${literal(JSON.stringify(claims))}; SET LOCAL fixture.today=${literal(TODAY)}; SELECT to_jsonb((${expression})); COMMIT;`);
      return result ? JSON.parse(result) : null;
    },
  };
}

/** Attach only to a private cluster created by this preview, preserving its current review. */
export function attachPreviewDatabase(directory) {
  if (!/^\/tmp\/planeje-neuro-[a-zA-Z0-9]+$/.test(directory || '')) throw new Error('Expected owned Neuro preview socket directory');
  const info = statSync(directory);
  if (info.uid !== process.getuid() || (info.mode & 0o077) !== 0) throw new Error('Preview socket directory is not private');
  const db = connection(directory);
  if (db.sql('SHOW listen_addresses') !== '' || db.sql('SHOW data_directory') !== path.join(directory, 'pg')) throw new Error('Not a disposable Neuro preview cluster');
  return db;
}

/** No DSN is accepted: every invocation owns an empty cluster with no TCP listener. */
export function createPreviewDatabase() {
  const bindir = path.dirname(run('/usr/bin/which', ['psql']));
  const directory = mkdtempSync('/tmp/planeje-neuro-');
  const data = path.join(directory, 'pg');
  const port = '55481';
  let started = false;
  const command = [ '-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose', '-h', directory, '-p', port, '-U', 'postgres', '-d', 'postgres' ];
  const sql = (source) => run(path.join(bindir, 'psql'), command, source);
  const close = () => {
    if (started) run(path.join(bindir, 'pg_ctl'), ['-D', data, '-m', 'immediate', '-w', 'stop']);
    started = false;
    rmSync(directory, { recursive: true, force: true });
  };
  try {
    run(path.join(bindir, 'initdb'), ['-D', data, '-U', 'postgres', '--auth=trust', '--encoding=UTF8', '--no-locale']);
    run(path.join(bindir, 'pg_ctl'), ['-D', data, '-l', path.join(directory, 'postgres.log'), '-o', `-k ${directory} -p ${port} -c listen_addresses='' -c unix_socket_permissions=0700`, '-w', 'start']);
    started = true;
    sql(run('python3', [path.join(ROOT, 'scripts/gestor-ia/verify-routine-database.py'), '--schema']));
    sql(readFileSync(new URL('./fixture.sql', import.meta.url), 'utf8'));
    sql(canonicalFunction('20260917110000_traffic_campaigns_and_optimization.sql', 'public.traffic_routine_client_history'));
    sql('REVOKE ALL ON FUNCTION public.traffic_routine_client_history(uuid,text,date,integer) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.traffic_routine_client_history(uuid,text,date,integer) TO authenticated;');
    return { ...connection(directory), close };
  } catch (error) { close(); throw error; }
}

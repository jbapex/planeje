import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

test('harness SQL legado preserva worker/equipe após adicionar a origem executor', { timeout: 120000 }, t => {
  const path = fileURLToPath(new URL('../atlas-manager-integration/verify.py', import.meta.url));
  const needle = "  load('supabase/migrations/20261028213929_atlas_model_shared_budget.sql')";
  const setup = 'ALTER TABLE public.atlas_runs ADD COLUMN source_session_id uuid REFERENCES auth.sessions(id);ALTER TABLE auth.users ADD COLUMN banned_until timestamptz;ALTER TABLE auth.sessions ADD COLUMN not_after timestamptz;CREATE TABLE public.module_settings(module_name text PRIMARY KEY,is_enabled boolean);CREATE TABLE public.user_module_permissions(user_id uuid,module_name text,is_enabled boolean);';
  const addition = `\n  sql(${JSON.stringify(setup)})\n  load('supabase/migrations/20261112034525_atlas_executor_model_budget.sql')`;
  const script = `from pathlib import Path
path=Path(${JSON.stringify(path)})
source=path.read_text()
needle=${JSON.stringify(needle)}
assert source.count(needle)==1
source=source.replace(needle,needle+${JSON.stringify(addition)})
exec(compile(source,str(path),'exec'),{'__file__':str(path),'__name__':'__main__'})
`;
  const result = spawnSync('python3', ['-c', script], { encoding: 'utf8', timeout: 110000, env: { PATH: process.env.PATH, LC_ALL: 'C' }, maxBuffer: 1024 * 1024 });
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout.trim());
  assert.equal(report.production_access, false); assert.equal(report.provider_calls, 0);
  assert.ok(report.passed.some(label => label.includes('concurrent model calls cannot exceed the shared cap')));
  assert.ok(report.passed.some(label => label.includes('unknown usage conservatively charges its estimate')));
  t.diagnostic(`${report.checks} verificações SQL legadas passaram com a migration nova carregada.`);
});

"""Exercise the real save RPC/guard in disposable PostgreSQL; no DSN or production access."""
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[2]
env = {key: value for key, value in os.environ.items() if not key.startswith('PG')}
bindir = Path(shutil.which('psql')).parent


def run(args, **kwargs):
    result = subprocess.run([str(arg) for arg in args], text=True, capture_output=True, env=env, **kwargs)
    if result.returncode:
        raise AssertionError(result.stderr[-3000:] or result.stdout[-3000:])
    return result.stdout.strip()


with tempfile.TemporaryDirectory(prefix='traffic-save-', dir='/tmp') as directory:
    scratch = Path(directory)
    data = scratch / 'pg'
    run([bindir / 'initdb', '-D', data, '-U', 'postgres', '--auth=trust', '--encoding=UTF8', '--no-locale'])
    run([bindir / 'pg_ctl', '-D', data, '-l', scratch / 'postgres.log', '-o', f"-k {scratch} -p 55478 -c listen_addresses=''", '-w', 'start'])

    def sql(source):
        return run([bindir / 'psql', '-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1', '-h', scratch, '-p', '55478', '-U', 'postgres', '-d', 'postgres'], input=source)

    try:
        sql((Path(__file__).with_name('fixture.sql')).read_text())
        guard = (ROOT / 'supabase/migrations/20260917042100_traffic_weekly_task_edit_acl.sql').read_text()
        sql(guard)
        sql('CREATE TRIGGER weekly_guard BEFORE UPDATE ON public.tarefas FOR EACH ROW EXECUTE FUNCTION planeje_private.traffic_weekly_guard_task();')
        migrations = sorted((ROOT / 'supabase/migrations').glob('*_traffic_weekly_reopen_task.sql'))
        assert len(migrations) <= 1, 'Expected a single repair migration'
        target = migrations[0] if migrations else ROOT / 'supabase/migrations/20261006190000_traffic_weekly_edit_after_finalize.sql'
        sql(target.read_text())
        print(sql(Path(__file__).with_name('checks.sql').read_text()))
    finally:
        run([bindir / 'pg_ctl', '-D', data, '-m', 'immediate', '-w', 'stop'])

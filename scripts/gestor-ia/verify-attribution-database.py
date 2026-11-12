"""Run attribution contracts against canonical SQL in a private disposable PostgreSQL, without a DSN."""
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
ENV = {key: os.environ[key] for key in ('PATH', 'LANG', 'LC_ALL') if key in os.environ}
PSQL = shutil.which('psql')
assert PSQL, 'PostgreSQL tools are required on PATH'
BINDIR = Path(PSQL).parent


def run(args, **kwargs):
    return subprocess.run([str(arg) for arg in args], text=True, capture_output=True, env=ENV, cwd=ROOT, **kwargs)


def required(args, **kwargs):
    result = run(args, **kwargs)
    assert result.returncode == 0, (result.stderr or result.stdout)[-5000:]
    return result.stdout


def schema_sql():
    base = required([sys.executable, HERE / 'verify-routine-database.py', '--schema'])
    fixture = (HERE / 'attribution-database-fixture.sql').read_text()
    assert fixture.count('-- fixture: seed') == 1, 'Fixture must have one canonical-load boundary'
    prepare, seed = fixture.split('-- fixture: seed')
    canonical = '\n'.join((ROOT / 'supabase/migrations' / name).read_text() for name in (
        '20261016152632_mini_crm_message_automation.sql',
        '20260920040000_cliente_rastreamento_links.sql',
        '20260920050000_rastreamento_link_initial_message.sql',
        '20260920100000_rastreamento_link_whatsapp_open_mode.sql',
        '20260920110000_rastreamento_link_default_utm.sql',
    ))
    migration = ROOT / 'supabase/migrations/20261112145805_gestor_ia_atribuicao.sql'
    return '\n'.join((base, prepare, canonical, seed, migration.read_text()))


def main():
    if sys.argv[1:] == ['--schema']:
        print(schema_sql())
        return
    assert not sys.argv[1:], 'Supported option: --schema (synthetic SQL only)'
    checks = (HERE / 'attribution-database-checks.sql').read_text().split('-- case: ')[1:]
    assert len(checks) >= 10, 'Expected independent SQL behavior cases'
    failures = []
    with tempfile.TemporaryDirectory(prefix='gestor-attribution-', dir='/tmp') as directory:
        scratch = Path(directory)
        data = scratch / 'pg'
        started = False
        try:
            required([BINDIR / 'initdb', '-D', data, '-U', 'postgres', '--auth=trust', '--encoding=UTF8', '--no-locale'])
            required([BINDIR / 'pg_ctl', '-D', data, '-l', scratch / 'postgres.log', '-o',
                      f"-k {scratch} -p 55483 -c listen_addresses='' -c unix_socket_permissions=0700", '-w', 'start'])
            started = True
            args = [BINDIR / 'psql', '-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1', '-h', scratch,
                    '-p', '55483', '-U', 'postgres', '-d', 'postgres']
            required(args, input=schema_sql())
            for case in checks:
                name, statement = case.split('\n', 1)
                result = run(args, input='BEGIN;\n' + statement + '\nROLLBACK;')
                if result.returncode:
                    failures.append(name)
                    print(f'FAIL: {name}\n{result.stderr.strip()[-1800:]}', flush=True)
                else:
                    print(f'PASS: {name}', flush=True)
        finally:
            if started:
                required([BINDIR / 'pg_ctl', '-D', data, '-m', 'immediate', '-w', 'stop'])
    assert not failures, f'{len(failures)}/{len(checks)} SQL cases failed: ' + ', '.join(failures)
    print(f'PASS: {len(checks)} attribution SQL cases; private socket, no DSN or external calls')


if __name__ == '__main__':
    main()

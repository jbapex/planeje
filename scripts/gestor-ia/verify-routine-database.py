"""Verify routine SQL in disposable PostgreSQL over a private socket; never read a DSN."""
import os
import json
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import time

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
ENV = {key: value for key, value in os.environ.items() if not key.startswith('PG')}
BINDIR = Path(shutil.which('psql')).parent


def run(args, **kwargs):
    result = subprocess.run([str(arg) for arg in args], text=True, capture_output=True, env=ENV, **kwargs)
    if result.returncode:
        detail = result.stderr or result.stdout
        raise AssertionError(detail if len(detail)<4000 else detail[:2500]+'\n…\n'+detail[-1000:])
    return result.stdout.strip()


def function(file, name):
    source = (ROOT / 'supabase/migrations' / file).read_text()
    match = re.search(r'create(?: or replace)? function\s+' + re.escape(name) + r'\s*\(.*?\bas\s+(\$\w*\$).*?\1\s*;', source, re.I | re.S)
    assert match, f'Canonical function missing: {name}'
    return match[0]


def schema_sql():
    source = [(HERE / 'routine-database-fixture.sql').read_text()]
    functions = {
        '20261013140451_invite_only_access.sql': ['private.planeje_live_session', 'private.planeje_approved_access', 'public.planeje_current_account_access'],
        '20260826010000_central_trafego_fase1.sql': ['public.central_trafego_caller_role', 'public.central_trafego_is_admin', 'public.central_trafego_is_gestor', 'public.central_trafego_has_explicit_access', 'public.central_trafego_can_access_client'],
        '20260917041000_traffic_weekly_reviews.sql': ['planeje_private.traffic_weekly_staff', 'planeje_private.traffic_weekly_manager', 'public.can_use_traffic_weekly', 'planeje_private.traffic_weekly_can_edit', 'planeje_private.traffic_weekly_due_on'],
        '20260917110000_traffic_campaigns_and_optimization.sql': ['planeje_private.traffic_weekly_generate'],
        '20261109055603_gestor_ia_historico_decisoes.sql': ['private.gestor_ia_modulo_decisao'],
        '20260921140000_traffic_sheet_quotes_qualified.sql': ['planeje_private.traffic_routine_campaign_metrics'],
        '20260918100000_traffic_week_sheet.sql': ['public.start_traffic_week_record'],
        '20261027184719_traffic_weekly_reopen_task.sql': ['public.save_traffic_weekly_review'],
        '20260917042100_traffic_weekly_task_edit_acl.sql': ['planeje_private.traffic_weekly_guard_task'],
    }
    source.extend(function(file, name) for file, names in functions.items() for name in names)
    source.append('CREATE POLICY routine_reviews_read ON public.traffic_weekly_reviews FOR SELECT TO authenticated USING(public.can_use_traffic_weekly(client_id)); CREATE POLICY routine_history_read ON public.traffic_weekly_history FOR SELECT TO authenticated USING(public.can_use_traffic_weekly(client_id));')
    source.append('CREATE TRIGGER weekly_guard BEFORE UPDATE ON public.tarefas FOR EACH ROW EXECUTE FUNCTION planeje_private.traffic_weekly_guard_task();')
    source.append('REVOKE ALL ON FUNCTION public.save_traffic_weekly_review(uuid,integer,jsonb,boolean),public.start_traffic_week_record(uuid,date,text) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.save_traffic_weekly_review(uuid,integer,jsonb,boolean),public.start_traffic_week_record(uuid,date,text) TO authenticated,service_role;')
    source.append("INSERT INTO public.tarefas(id,client_id,status,assignee_ids) VALUES('00000000-0000-0000-0000-000000000088','9196d07f-f0a8-4eb2-9f9a-3dade28d4a69','completed',ARRAY['00000000-0000-0000-0000-000000000001'::uuid]); INSERT INTO public.traffic_weekly_reviews(client_id,task_id,week_start,result_label,finalized_at,finalized_by) VALUES('9196d07f-f0a8-4eb2-9f9a-3dade28d4a69','00000000-0000-0000-0000-000000000088','2026-11-02','Agendamentos',now(),'00000000-0000-0000-0000-000000000001');")
    migration, = (ROOT / 'supabase/migrations').glob('*_gestor_ia_routine_mcp.sql')
    source.append(migration.read_text())
    return '\n'.join(source)


if sys.argv[1:] == ['--schema']:
    print(schema_sql())
    sys.exit(0)
assert not sys.argv[1:], 'Supported option: --schema (synthetic SQL only)'


with tempfile.TemporaryDirectory(prefix='gestor-ia-db-', dir='/tmp') as directory:
    scratch = Path(directory)
    data = scratch / 'pg'
    run([BINDIR / 'initdb', '-D', data, '-U', 'postgres', '--auth=trust', '--encoding=UTF8', '--no-locale'])
    run([BINDIR / 'pg_ctl', '-D', data, '-l', scratch / 'postgres.log', '-o', f"-k {scratch} -p 55479 -c listen_addresses=''", '-w', 'start'])
    args = [BINDIR / 'psql', '-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1', '-h', scratch, '-p', '55479', '-U', 'postgres', '-d', 'postgres']

    def sql(source):
        return run(args, input=source)

    try:
        sql(schema_sql())
        print('\n'.join(line for line in sql((HERE / 'routine-database-checks.sql').read_text()).splitlines() if line.strip()))

        # Verify the real SQL lexer feeds the shared JS classifier without reimplementing confirmation in SQL.
        samples = [
            (['Agendamento confirmado para 13/11 às 14h. ClienteCorinaSecreta 5511999990011'], True),
            (['O agendamento ainda precisa ser confirmado para 13/11 às 14h', 'Sim'], False),
            (['Se confirmado o agendamento, será 13/11 às 14h', 'Sim'], False),
            (['Pode agendar a visita para 13/11 às 14h?', 'Sim'], True),
            (['Agendamento confirmado para 13/11 às 14h', 'Agendamento cancelado'], False),
            (['Marcela confirmo 13/11 às 14h'], False),
        ]
        cases = [{'messages': [{'text': value, 'direction': 'equipe' if index == 0 else 'lead', 'at': f'2026-11-12T12:0{index}:00Z', 'id': str(index)} for index, value in enumerate(messages)], 'scheduled': expected} for messages, expected in samples]
        projected = sql("SELECT jsonb_agg(jsonb_build_object('messages',(SELECT jsonb_agg(jsonb_set(message,'{text}',to_jsonb(planeje_private.gestor_ia_routine_signal_text(message->>'text')))) FROM jsonb_array_elements(sample->'messages') message),'scheduled',sample->'scheduled')) FROM jsonb_array_elements($fixture$" + json.dumps(cases) + "$fixture$::jsonb) sample;")
        run(['node', '--input-type=module', '-e', "import assert from 'node:assert/strict'; import {detectRoutineAppointment} from './src/lib/gestorIaRoutineSignals.js'; let input=''; for await (const chunk of process.stdin) input+=chunk; for (const sample of JSON.parse(input)) assert.equal(Boolean(detectRoutineAppointment(sample.messages)),sample.scheduled,JSON.stringify(sample));"], input=projected, cwd=ROOT)
        print('PASS: real SQL lexer + shared JS classifier (confirmation, pending/conditional, proposal, cancellation and names)')

        # Two real transactions contend for the same expected revision; only one may commit.
        prefix = "SET ROLE service_role; SET request.jwt.claims='{}'; "
        query = "SELECT public.gestor_ia_routine_mcp('00000000-0000-0000-0000-000000000001','save','9196d07f-f0a8-4eb2-9f9a-3dade28d4a69','2026-11-09','{\"revision\":7,\"linhas\":[],\"analise\":\"Concorrente\"}');"
        first = subprocess.Popen([str(arg) for arg in args], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, env=ENV)
        first.stdin.write('BEGIN; ' + prefix + query + f" RESET ROLE; COPY (SELECT 'locked') TO '{scratch / 'locked'}'; SET ROLE service_role; SELECT pg_sleep(1); COMMIT;")
        first.stdin.close()
        deadline = time.monotonic() + 10
        while not (scratch / 'locked').exists() and time.monotonic() < deadline:
            time.sleep(0.02)
        assert (scratch / 'locked').exists(), first.stderr.read()
        second = subprocess.run([str(arg) for arg in args], input=prefix + query, text=True, capture_output=True, env=ENV)
        first.wait(timeout=10)
        assert first.returncode == 0, first.stderr.read()
        assert second.returncode != 0 and 'versão' in second.stderr, second.stderr
        assert sql("SELECT revision FROM public.traffic_weekly_reviews WHERE client_id='9196d07f-f0a8-4eb2-9f9a-3dade28d4a69' AND week_start='2026-11-09'") == '8'
        print('PASS: real concurrent revision conflict (one commit, one rejection)')
    finally:
        run([BINDIR / 'pg_ctl', '-D', data, '-m', 'immediate', '-w', 'stop'])

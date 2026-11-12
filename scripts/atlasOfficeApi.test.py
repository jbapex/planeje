"""VPS-only PostgREST/RLS checks against the named disposable fixture database."""
import base64
import hashlib
import hmac
import json
import secrets
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

DB = 'atlas_office_test_20261015'
ROOT = Path('/root/planeje-releases/atlas-office-20261015-01')
NAME = 'planeje-atlas-office-rest-test'
BASE = 'http://127.0.0.1:15453'
A = '11111111-1111-4111-8111-111111111111'
B = '22222222-2222-4222-8222-222222222222'
C = '33333333-3333-4333-8333-333333333333'
P = '77777777-7777-4777-8777-777777777777'
Q = '88888888-8888-4888-8888-888888888888'
signing = secrets.token_urlsafe(48)
checks = []
started = False

def sql(statement):
    guarded = "DO $$ BEGIN ASSERT current_database()='" + DB + "';END $$;" + statement
    r = subprocess.run(['docker', 'exec', '-i', 'supabase-db', 'psql', '-X', '-q', '-At', '-U', 'supabase_admin', '-d', DB, '-v', 'ON_ERROR_STOP=1'], input=guarded, text=True, capture_output=True)
    assert r.returncode == 0, 'Fixture SQL failed; inspect privately.'
    return r.stdout.strip()

def token(user=A, role='authenticated', extra=None):
    enc = lambda v: base64.urlsafe_b64encode(json.dumps(v, separators=(',', ':')).encode()).rstrip(b'=')
    claims = {'role': role, 'iat': int(time.time()), 'exp': int(time.time()) + 600, 'iss': 'supabase', 'aud': 'authenticated'}
    if user:
        claims.update(sub=user, session_id=user)
    claims.update(extra or {})
    body = enc({'alg': 'HS256', 'typ': 'JWT'}) + b'.' + enc(claims)
    return (body + b'.' + base64.urlsafe_b64encode(hmac.new(signing.encode(), body, hashlib.sha256).digest()).rstrip(b'=')).decode()

def request(path, method='GET', data=None, user=A, role='authenticated', extra=None):
    headers = {'Authorization': 'Bearer ' + token(user, role, extra), 'Prefer': 'return=representation'}
    if data is not None:
        data = json.dumps(data).encode()
        headers['Content-Type'] = 'application/json'
    try:
        with urllib.request.urlopen(urllib.request.Request(BASE + path, data=data, method=method, headers=headers), timeout=15) as response:
            raw = response.read()
            return response.status, json.loads(raw) if raw else None
    except urllib.error.HTTPError as error:
        return error.code, json.loads(error.read())

def check(name, condition):
    assert condition, name
    checks.append(name)

def read_denied(response):
    # The production pre-request guard may reject earlier than table RLS.
    return response == (200, []) or response[0] in (401, 403)

try:
    check('disposable_database_only', sql('SELECT current_database()') == DB)
    check('external_notification_trigger_off_in_fixture', sql("SELECT tgenabled FROM pg_trigger WHERE tgrelid='public.tarefas'::regclass AND tgname='notificacao-tarefa'") == 'D')
    sql(f"INSERT INTO auth.sessions(id,user_id) VALUES('{A}','{A}') ON CONFLICT DO NOTHING; INSERT INTO atlas_office_proposals(id,owner_id,client_id,source_key,source_hash,title,description,task_type) VALUES('{P}','{A}','{C}','api-test','hash-a','Tarefa fictícia API','Somente teste isolado.','arte'); INSERT INTO atlas_office_questions(id,owner_id,client_id,source_key,question) VALUES('{Q}','{A}','{C}','api-test','Qual é a prioridade no teste?');")
    before = int(sql('SELECT count(*) FROM tarefas'))
    source = json.loads(subprocess.check_output(['docker', 'inspect', 'supabase-rest'], text=True))[0]
    original = dict(value.split('=', 1) for value in source['Config']['Env'])
    parts = urllib.parse.urlsplit(original['PGRST_DB_URI'])
    uri = urllib.parse.urlunsplit(parts._replace(path='/' + DB))
    runtime = {key: value for key, value in original.items() if key.startswith('PGRST_')}
    runtime.update(PGRST_DB_URI=uri, PGRST_JWT_SECRET=signing, PGRST_APP_SETTINGS_JWT_SECRET=signing, PGRST_SERVER_PORT='3000')
    config = ROOT / 'office-api-test.env'
    config.write_text(''.join(key + '=' + value + '\n' for key, value in runtime.items()))
    config.chmod(0o600)
    try:
        process = subprocess.run(['docker', 'run', '-d', '--name', NAME, '--network', 'supabase_default', '-p', '127.0.0.1:15453:3000', '--env-file', str(config), source['Config']['Image']], text=True, capture_output=True)
    finally:
        config.unlink()
    assert process.returncode == 0, 'Isolated REST startup failed.'
    started = True
    for _ in range(40):
        try:
            status, body = request('/atlas_office_config?select=id')
            if status == 200:
                break
        except (OSError, ValueError):
            pass
        time.sleep(.25)
    check('owner_can_read_config', status == 200 and body == [{'id': 'atlas'}])
    check('other_admin_cannot_read_office', request('/atlas_office_proposals', user=B) == (200, []))
    check('revoked_or_wrong_session_cannot_read', read_denied(request('/atlas_office_proposals', extra={'session_id': B})))
    check('anon_cannot_read', request('/atlas_office_proposals', user=None, role='anon')[0] in (401, 403))
    check('cannot_edit_ai_draft', request('/atlas_office_proposals?id=eq.' + P, 'PATCH', {'title': 'Changed'})[0] == 403)
    status, body = request('/atlas_office_proposals?id=eq.' + P, 'PATCH', {'state': 'rejected'}, extra={'planeje_server_delegate': 'atlas'})
    check('delegated_update_cannot_decide', status == 200 and body == [])
    decision = {'p_proposal_id': P, 'p_approve': True, 'p_confirmed': True}
    check('delegated_rpc_cannot_approve', request('/rpc/atlas_office_decide_proposal', 'POST', decision, extra={'planeje_server_delegate': 'atlas'})[0] == 403)
    check('other_admin_rpc_cannot_approve', request('/rpc/atlas_office_decide_proposal', 'POST', decision, user=B)[0] == 403)
    check('confirmation_required', request('/rpc/atlas_office_decide_proposal', 'POST', {**decision, 'p_confirmed': False})[0] == 403)
    check('no_task_before_human_confirmation', int(sql('SELECT count(*) FROM tarefas')) == before)
    status, body = request('/rpc/atlas_office_decide_proposal', 'POST', decision)
    check('owner_can_approve_real_task_table', status == 200 and body.get('task_id') and body.get('replayed') is False)
    task_id = body['task_id']
    check('created_task_bound_to_client_owner', sql(f"SELECT count(*) FROM tarefas WHERE id='{task_id}' AND client_id='{C}' AND owner_id='{A}'") == '1')
    status, body = request('/rpc/atlas_office_decide_proposal', 'POST', decision)
    check('approval_replay_is_idempotent', status == 200 and body.get('replayed') is True and body['task_id'] == task_id)
    check('only_one_fixture_task_created', int(sql('SELECT count(*) FROM tarefas')) == before + 1)
    answer = {'p_question_id': Q, 'p_answer': 'Priorizar briefing do cliente fictício API.'}
    check('delegate_cannot_save_human_confirmation', request('/rpc/atlas_office_answer', 'POST', answer, extra={'planeje_server_delegate': 'atlas'})[0] == 403)
    status, body = request('/rpc/atlas_office_answer', 'POST', answer)
    check('owner_can_answer_question', status == 200 and body.get('ok') is True and body.get('memory_id'))
    memory = body['memory_id']
    check('answer_memory_exact_client', sql(f"SELECT count(*) FROM atlas_memories WHERE id='{memory}' AND client_id='{C}' AND owner_id='{A}' AND source='user_confirmation'") == '1')
    status, body = request('/rpc/atlas_office_answer', 'POST', answer)
    check('answer_replay_is_idempotent', status == 200 and body.get('replayed') is True and body.get('memory_id') == memory)
    status, body = request('/tarefas?id=eq.' + task_id, 'DELETE')
    check('approved_task_can_be_deleted_normally', status == 200 and len(body) == 1)
    check('task_deletion_preserves_approval_audit', sql(f"SELECT count(*) FROM atlas_office_proposals WHERE id='{P}' AND state='approved' AND created_task_id='{task_id}'") == '1')
    status, body = request('/rpc/atlas_office_decide_proposal', 'POST', decision)
    check('deleted_task_is_not_recreated_on_replay', status == 200 and body.get('replayed') is True and int(sql('SELECT count(*) FROM tarefas')) == before)
    check('human_cannot_reserve_worker_budget', request('/rpc/atlas_office_reserve', 'POST', {'p_owner_id': A, 'p_day': '2026-10-15', 'p_tokens': 1000})[0] == 403)
    sql(f"DELETE FROM auth.sessions WHERE user_id='{A}'")
    check('session_revocation_takes_effect', read_denied(request('/atlas_office_proposals')))
    check('revoked_session_cannot_replay_approval', request('/rpc/atlas_office_decide_proposal', 'POST', decision)[0] == 403)
    check('legacy_monitor_unchanged', sql('SELECT monitor_enabled FROM atlas_settings') == 'f')
    print(json.dumps({'checks': len(checks), 'passed': True, 'database': DB, 'real_operational_writes': False, 'tests': checks}))
finally:
    if started:
        subprocess.run(['docker', 'rm', '-f', NAME], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

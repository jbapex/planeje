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

DB = 'atlas_dictation_test_20261015'
ROOT = Path('/root/planeje-releases/atlas-audio-status-20261015-01')
NAME = 'planeje-atlas-dictation-rest-test'
BASE = 'http://127.0.0.1:15454'
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
    source = json.loads(subprocess.check_output(['docker', 'inspect', 'supabase-rest'], text=True))[0]
    original = dict(value.split('=', 1) for value in source['Config']['Env'])
    parts = urllib.parse.urlsplit(original['PGRST_DB_URI'])
    uri = urllib.parse.urlunsplit(parts._replace(path='/' + DB))
    runtime = {key: value for key, value in original.items() if key.startswith('PGRST_')}
    runtime.update(PGRST_DB_URI=uri, PGRST_JWT_SECRET=signing, PGRST_APP_SETTINGS_JWT_SECRET=signing, PGRST_SERVER_PORT='3000')
    config = ROOT / 'dictation-api-test.env'
    config.write_text(''.join(key + '=' + value + '\n' for key, value in runtime.items()));config.chmod(0o600)
    try: process = subprocess.run(['docker','run','-d','--name',NAME,'--network','supabase_default','-p','127.0.0.1:15454:3000','--env-file',str(config),source['Config']['Image']],capture_output=True,text=True)
    finally: config.unlink()
    assert process.returncode==0,'Isolated REST startup failed.'
    started=True
    for _ in range(40):
        try:
            status,body=request('/atlas_dictations?select=id&limit=1')
            if status==200:break
        except (OSError,ValueError):pass
        time.sleep(.25)
    check('owner_can_read',status==200 and len(body)==1);job_id=body[0]['id']
    check('other_admin_cannot_read',request('/atlas_dictations',user=B)==(200,[]))
    check('delegate_cannot_read',request('/atlas_dictations',extra={'planeje_server_delegate':'atlas'})==(200,[]))
    check('session_required',read_denied(request('/atlas_dictations',extra={'session_id':None})))
    check('wrong_session_denied',read_denied(request('/atlas_dictations',extra={'session_id':B})))
    check('anonymous_denied',request('/atlas_dictations',user=None,role='anon')[0] in (401,403))
    check('human_cannot_update',request('/atlas_dictations?id=eq.'+job_id,'PATCH',{'transcript':'changed'})[0]==403)
    check('human_cannot_delete',request('/atlas_dictations?id=eq.'+job_id,'DELETE')[0]==403)
    check('human_cannot_insert',request('/atlas_dictations','POST',{'id':P,'owner_id':A,'content_hash':'a'*64,'size_bytes':100,'seconds':1})[0]==403)
    params={'p_owner_id':A,'p_id':P,'p_question_id':None,'p_hash':'a'*64,'p_size':100,'p_seconds':1}
    check('human_cannot_reserve',request('/rpc/atlas_dictation_reserve','POST',params)[0]==403)
    check('service_reservation_quota',request('/rpc/atlas_dictation_reserve','POST',params,user=None,role='service_role')==(200,{'state':'limited','fresh':False}))
    sql(f"DELETE FROM auth.sessions WHERE user_id='{A}'")
    check('revoked_session_denied',read_denied(request('/atlas_dictations')))
    check('no_tasks',sql('SELECT count(*) FROM tarefas')=='0')
    check('no_memory',sql('SELECT count(*) FROM atlas_memories')=='0')
    print(json.dumps({'checks':len(checks),'passed':True,'database':DB,'real_operational_writes':False,'tests':checks}))
finally:
    if started: subprocess.run(['docker','rm','-f',NAME],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)

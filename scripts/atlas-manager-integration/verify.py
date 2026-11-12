"""Real SQL/RLS tests in a fresh local Unix-socket PostgreSQL; never accepts a DSN."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

ROOT=Path(__file__).resolve().parents[2]
BASE=ROOT/'.local/atlas-manager-implementation'
BASE.mkdir(parents=True,exist_ok=True)
env={k:v for k,v in os.environ.items() if not k.startswith('PG')}
bindir=Path(shutil.which('psql')).parent
checks=[]

def run(args,**kwargs):
 result=subprocess.run([str(a) for a in args],text=True,capture_output=True,env=env,**kwargs)
 if result.returncode:raise AssertionError(result.stderr[-2500:] or result.stdout[-2500:])
 return result.stdout.strip()

with tempfile.TemporaryDirectory(prefix='pm-atlas-fixture-',dir='/tmp') as directory:
 scratch=Path(directory);data=scratch/'pg'
 run([bindir/'initdb','-D',data,'-U','postgres','--auth=trust','--encoding=UTF8','--no-locale'])
 run([bindir/'pg_ctl','-D',data,'-l',scratch/'postgres.log','-o',f"-k {scratch} -p 55477 -c listen_addresses='' -c max_connections=20",'-w','start'])
 def sql(value):return run([bindir/'psql','-X','-q','-At','-v','ON_ERROR_STOP=1','-h',scratch,'-p','55477','-U','postgres','-d','postgres'],input=value)
 def load(name):return sql((ROOT/name).read_text())
 def check(name,value):
  assert value,name
  checks.append(name)
 try:
  load('scripts/atlas-manager-integration/fixture.sql')
  load('supabase/migrations/20261009004301_atlas_personal_assistant.sql')
  load('supabase/migrations/20261009030813_atlas_manager_memory_jobs.sql')
  sql("CREATE FUNCTION private.atlas_demand_owner() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT public.atlas_is_owner() AND private.planeje_live_session() AND auth.jwt()->>'planeje_server_delegate' IS NULL $$;")
  guards=(ROOT/'supabase/migrations/20261016231835_atlas_event_context_guards.sql').read_text()
  start=guards.index('CREATE FUNCTION private.atlas_event_enabled(')
  sql(guards[start:guards.index('$$;',start)+3])
  load('supabase/migrations/20261016160546_atlas_team_conversations.sql')
  load('supabase/migrations/20261017002459_atlas_event_explicit_groups.sql')
  # The real title helper is copied from source, not replaced by an assertion mirror.
  title=(ROOT/'supabase/migrations/20261015234747_atlas_demand_client_task_title.sql').read_text()
  start=title.index('CREATE FUNCTION private.atlas_demand_task_title')
  sql(title[start:title.index('$$;',start)+3])
  load('supabase/migrations/20261017034308_atlas_manager_intake.sql')
  sql('GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;')
  migrations=sorted((ROOT/'supabase/migrations').glob('*_atlas_manager_operational_loop.sql'))
  assert len(migrations)==1,'Expected one new additive migration'
  sql(migrations[0].read_text())
  session_acl=sorted((ROOT/'supabase/migrations').glob('*_atlas_manager_source_session_acl.sql'))
  assert len(session_acl)==1,'Expected one source-session ACL correction'
  sql(session_acl[0].read_text())
  tests=Path(__file__).with_name('checks.sql')
  if tests.exists():
   output=sql(tests.read_text());checks.extend(line for line in output.splitlines() if line.startswith('PASS '))
  else:
   check('new memory scope RPC exists',sql("SELECT to_regprocedure('public.atlas_memory_team_scope(uuid,boolean)') IS NOT NULL;")=='t')
  print(json.dumps({'checks':len(checks),'passed':checks,'fixture':'fresh local PostgreSQL via Unix socket','production_access':False,'provider_calls':0}))
 finally:
  run([bindir/'pg_ctl','-D',data,'-m','immediate','-w','stop'])

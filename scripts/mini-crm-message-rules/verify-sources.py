"""New source catalog migration and RLS in a disposable local PostgreSQL. No DSN accepted."""
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[2]
BIN = Path(shutil.which('psql')).parent
ENV = {k: v for k, v in os.environ.items() if not k.startswith('PG')}

def run(args, **kwargs):
    result = subprocess.run(list(map(str, args)), text=True, capture_output=True, env=ENV, **kwargs)
    assert result.returncode == 0, result.stderr[-2000:]
    return result.stdout.strip()

with tempfile.TemporaryDirectory(prefix='planeje-sources-', dir='/tmp') as folder:
    scratch = Path(folder)
    data = scratch / 'pg'
    run([BIN/'initdb', '-D', data, '-U', 'postgres', '--auth=trust', '--encoding=UTF8', '--no-locale'])
    run([BIN/'pg_ctl', '-D', data, '-l', scratch/'pg.log', '-o', f"-k {scratch} -p 55478 -c listen_addresses=''", '-w', 'start'])
    def sql(value):
        return run([BIN/'psql', '-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1', '-h', scratch, '-p', '55478', '-U', 'postgres', '-d', 'postgres'], input=value)
    try:
        sql("""
create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;
create schema auth;grant usage on schema public,auth to authenticated,service_role;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('fixture.uid',true),'')::uuid$$;
create function public.planeje_current_account_access() returns boolean language sql stable as $$select current_setting('fixture.approved',true)='yes'$$;
create function public.cliente_atend_uid_nao_admin() returns uuid language sql stable as $$select null::uuid$$;
create table clientes(id uuid primary key);
create table profiles(id uuid primary key,role text,cliente_id uuid);
create table user_module_permissions(user_id uuid,module_name text,is_enabled boolean);
create table module_settings(module_name text,is_enabled boolean);
grant select on clientes,profiles,user_module_permissions,module_settings to authenticated;
create table cliente_whatsapp_webhook_log(cliente_id uuid,source text,raw_payload jsonb);
insert into clientes values('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002');
insert into profiles values('00000000-0000-0000-0000-000000000011','cliente','00000000-0000-0000-0000-000000000001');
insert into cliente_whatsapp_webhook_log values
('00000000-0000-0000-0000-000000000001','ingress','{"object":"whatsapp_business_account","entry":[{"changes":[{"field":"messages","value":{"metadata":{"phone_number_id":"111111","display_phone_number":"5511999999999"}}},{"field":"smb_message_echoes","value":{"metadata":{"phone_number_id":"222222","display_phone_number":"5511888888888"}}}]}]}'),
('00000000-0000-0000-0000-000000000002','chatvolt','{"channel":"zapperapi"}'),
('00000000-0000-0000-0000-000000000002','ingress','{"entry":null}');
""")
        # Existing access predicate is tested as shipped, without replacing its client/module logic.
        access = (ROOT/'supabase/migrations/20261016152632_mini_crm_message_automation.sql').read_text()
        sql(access[access.index('create function public.mini_crm_rules_access'):access.index('create table public.mini_crm_message_rules')])
        sql((ROOT/'supabase/migrations/20261026143800_mini_crm_webhook_sources.sql').read_text())
        assert sql('select count(*) from mini_crm_message_sources') == '3'
        assert sql("select count(*) from mini_crm_message_sources where id='ingress:meta_cloud:222222'") == '1'
        assert sql("select bool_and(not has_table_privilege(r,'mini_crm_message_sources',p)) from unnest(array['anon','authenticated']) r cross join unnest(array['INSERT','UPDATE','DELETE']) p") == 't'
        assert sql("select not has_table_privilege('anon','mini_crm_message_sources','SELECT')") == 't'
        assert sql("set role authenticated;set fixture.uid='00000000-0000-0000-0000-000000000011';set fixture.approved='yes';select count(*) from mini_crm_message_sources") == '2'
        assert sql("set role authenticated;set fixture.uid='00000000-0000-0000-0000-000000000011';set fixture.approved='no';select count(*) from mini_crm_message_sources") == '0'
        sql("insert into user_module_permissions values('00000000-0000-0000-0000-000000000011','mini_crm',false)")
        assert sql("set role authenticated;set fixture.uid='00000000-0000-0000-0000-000000000011';set fixture.approved='yes';select count(*) from mini_crm_message_sources") == '0'
        sql("set role service_role;insert into mini_crm_message_sources(cliente_id,id,name) values('00000000-0000-0000-0000-000000000002','ingress:meta_cloud:111111','Outro cliente');")
        assert sql("select count(*) from mini_crm_message_sources where id='ingress:meta_cloud:111111'") == '2'
        print('PASS 9 migration/seed/RLS checks; fresh Unix-socket PostgreSQL; no production access')
    finally:
        run([BIN/'pg_ctl', '-D', data, '-m', 'immediate', '-w', 'stop'])

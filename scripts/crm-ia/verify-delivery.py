"""Delivery claims on disposable PostgreSQL over a Unix socket. No DSN or network."""
from concurrent.futures import ThreadPoolExecutor
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[2]
BIN = Path(shutil.which('psql')).parent
ENV = {key: value for key, value in os.environ.items() if not key.startswith('PG')}
C = '10000000-0000-0000-0000-000000000001'
OTHER = '10000000-0000-0000-0000-000000000002'
CHANNEL = '20000000-0000-0000-0000-000000000001'
CONTACT = '30000000-0000-0000-0000-000000000001'
ACTOR = '40000000-0000-0000-0000-000000000001'
CONVERSATION = '50000000-0000-0000-0000-000000000001'
REVISION = '60000000-0000-0000-0000-000000000001'


def run(args, **kwargs):
    result = subprocess.run(list(map(str, args)), text=True, capture_output=True, env=ENV, **kwargs)
    assert result.returncode == 0, result.stderr[-1600:]
    return result.stdout.strip()


with tempfile.TemporaryDirectory(prefix='crm-ia-delivery-', dir='/tmp') as directory:
    scratch = Path(directory)
    data = scratch / 'pg'
    run([BIN/'initdb', '-D', data, '-U', 'postgres', '--auth=trust', '--encoding=UTF8', '--no-locale'])
    run([BIN/'pg_ctl', '-D', data, '-l', scratch/'pg.log', '-o', f"-k {scratch} -p 55479 -c listen_addresses=''", '-w', 'start'])

    def sql(statement):
        return run([BIN/'psql', '-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1', '-h', scratch, '-p', '55479', '-U', 'postgres', '-d', 'postgres'], input=statement)

    def call(name, args=''):
        return json.loads(sql(f'SET ROLE service_role; SELECT to_jsonb(public.{name}({args}));'))

    sequence = 0
    checks = 0

    def check(value, reason):
        global checks
        assert value, reason
        checks += 1

    def enqueue(kind='manual', extra=''):
        global sequence
        sequence += 1
        return sql(f"""INSERT INTO crm_ia_outbox(cliente_id,whatsapp_config_id,contact_id,kind,body,scheduled_at,created_by,request_id,config_revision,source_updated_at)
        SELECT '{C}','{CHANNEL}','{CONTACT}','{kind}','Synthetic delivery',clock_timestamp()-interval '1 minute','{ACTOR}',
        '70000000-0000-0000-0000-{sequence:012d}','{REVISION}',updated_at FROM cliente_atend_conversas WHERE id='{CONVERSATION}' RETURNING id;{extra}""")

    def claim(identifier):
        rows = call('crm_ia_delivery_claim', f"p_ids=>ARRAY['{identifier}']::uuid[]")
        return rows[0] if rows else None

    def recheck(row):
        return call('crm_ia_delivery_recheck', f"'{row['id']}','{row['claim_token']}'")

    try:
        sql(f"""
        CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
        CREATE SCHEMA planeje_private;
        CREATE TABLE clientes(id uuid PRIMARY KEY);
        CREATE TABLE profiles(id uuid PRIMARY KEY,role text,status text,cliente_id uuid);
        CREATE TABLE leads(id uuid PRIMARY KEY,cliente_id uuid);
        CREATE TABLE cliente_whatsapp_config(id uuid PRIMARY KEY,cliente_id uuid,provider text DEFAULT 'uazapi',archived_at timestamptz,token text DEFAULT 'synthetic',subdomain text DEFAULT 'fixture');
        CREATE TABLE cliente_whatsapp_contact(id uuid PRIMARY KEY,cliente_id uuid,from_jid text,phone text,last_message_at timestamptz,updated_at timestamptz DEFAULT now());
        CREATE TABLE cliente_whatsapp_inbox(cliente_id uuid,whatsapp_config_id uuid,chat_jid text,from_jid text,is_group boolean DEFAULT false,msg_timestamp timestamptz,created_at timestamptz DEFAULT now());
        CREATE TABLE cliente_atend_conversas(id uuid PRIMARY KEY,cliente_id uuid,contact_id uuid,status text DEFAULT 'entrada',ia_pausada boolean DEFAULT false,
          ia_respondeu_em timestamptz,setor_id uuid,ia_followup_passo integer DEFAULT 0,ia_followup_due_at timestamptz,status_at timestamptz,updated_at timestamptz DEFAULT now());
        CREATE TABLE cliente_atend_ia_agentes(id uuid PRIMARY KEY,cliente_id uuid,ativo boolean DEFAULT true,auto_responder boolean DEFAULT true,funil jsonb,updated_at timestamptz DEFAULT now());
        CREATE TABLE atendimento_conversas(id uuid PRIMARY KEY,cliente_id uuid,whatsapp_config_id uuid,chat_jid text,archived_at timestamptz,bloqueada boolean DEFAULT false);
        CREATE TABLE atendimento_conversa_planejamento(id uuid PRIMARY KEY,cliente_id uuid,conversation_id uuid,whatsapp_config_id uuid,chat_jid text,kind text,body text,
          status text DEFAULT 'pendente',scheduled_at timestamptz,completed_at timestamptz,error_message text,updated_at timestamptz DEFAULT now());
        CREATE TABLE crm_ia_config(cliente_id uuid PRIMARY KEY,data jsonb,revision uuid,updated_at timestamptz DEFAULT now());
        CREATE FUNCTION cliente_atend_loja_habilitada(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
        CREATE FUNCTION fixture_touch() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN new.updated_at=now();RETURN new;END $$;
        CREATE TRIGGER fixture_touch BEFORE UPDATE ON cliente_atend_conversas FOR EACH ROW EXECUTE FUNCTION fixture_touch();
        INSERT INTO clientes VALUES('{C}'),('{OTHER}');
        INSERT INTO profiles VALUES('{ACTOR}','superadmin','active',NULL);
        INSERT INTO cliente_whatsapp_config(id,cliente_id) VALUES('{CHANNEL}','{C}');
        INSERT INTO cliente_whatsapp_contact(id,cliente_id,from_jid,phone) VALUES('{CONTACT}','{C}','5511999999999@s.whatsapp.net','5511999999999');
        INSERT INTO cliente_atend_conversas(id,cliente_id,contact_id) VALUES('{CONVERSATION}','{C}','{CONTACT}');
        INSERT INTO crm_ia_config VALUES('{C}','{{"attendance":{{"auto_send":true}},"test_mode":{{"enabled":false,"phones":[]}}}}','{REVISION}',now());
        GRANT USAGE ON SCHEMA public,planeje_private TO service_role;
        GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
        """)
        sql((ROOT/'supabase/migrations/20261111041703_crm_ia_delivery_runtime.sql').read_text())
        check(sql("SELECT to_regclass('public.crm_ia_outbox') IS NOT NULL") == 't', 'durable outbox missing')
        check(sql("SELECT bool_and(NOT has_table_privilege(r,'crm_ia_outbox',p)) FROM unnest(ARRAY['anon','authenticated']) r CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE']) p") == 't', 'human table access must remain revoked')
        check(sql("SELECT NOT has_function_privilege('authenticated','crm_ia_delivery_claim(timestamp with time zone,uuid[])','EXECUTE')") == 't', 'claim must be service-only')
        identifier = enqueue()
        with ThreadPoolExecutor(max_workers=2) as pool:
            claimed = list(pool.map(lambda _: claim(identifier), range(2)))
        check(sum(row is not None for row in claimed) == 1, 'two consumers claimed one request')
        row = next(row for row in claimed if row)
        target = recheck(row)
        check(target['allowed'] and target['whatsapp_config_id'] == CHANNEL and target['to'] == '5511999999999@s.whatsapp.net', 'exact channel/target required')
        check(call('crm_ia_delivery_finish', f"'{row['id']}','{row['claim_token']}','sent','receipt',NULL"), 'receipt must finish own claim')
        check(claim(identifier) is None, 'sent request must not retry')
        check(not call('crm_ia_delivery_finish', f"'{row['id']}','00000000-0000-0000-0000-000000000000','failed',NULL,'rejected'"), 'forged claim finished a request')
        duplicate = sql(f"SELECT count(*) FROM crm_ia_outbox WHERE cliente_id='{C}' AND created_by='{ACTOR}' AND request_id='70000000-0000-0000-0000-000000000001'")
        sql(f"INSERT INTO crm_ia_outbox(cliente_id,whatsapp_config_id,contact_id,kind,body,scheduled_at,created_by,request_id) VALUES('{C}','{CHANNEL}','{CONTACT}','manual','Repeated request',now(),'{ACTOR}','70000000-0000-0000-0000-000000000001') ON CONFLICT(cliente_id,created_by,request_id) DO NOTHING")
        check(duplicate == '1' and sql('SELECT count(*) FROM crm_ia_outbox') == '1', 'idempotency key must remain unique')

        for mutate, restore, reason in [
            (f"UPDATE cliente_whatsapp_config SET archived_at=now() WHERE id='{CHANNEL}'", f"UPDATE cliente_whatsapp_config SET archived_at=NULL WHERE id='{CHANNEL}'", 'archived channel'),
            (f"UPDATE cliente_whatsapp_config SET cliente_id='{OTHER}' WHERE id='{CHANNEL}'", f"UPDATE cliente_whatsapp_config SET cliente_id='{C}' WHERE id='{CHANNEL}'", 'wrong client channel'),
            (f"UPDATE cliente_whatsapp_contact SET from_jid='120363@g.us' WHERE id='{CONTACT}'", f"UPDATE cliente_whatsapp_contact SET from_jid='5511999999999@s.whatsapp.net' WHERE id='{CONTACT}'", 'group target'),
            (f"UPDATE profiles SET status='inactive' WHERE id='{ACTOR}'", f"UPDATE profiles SET status='active' WHERE id='{ACTOR}'", 'revoked creator'),
        ]:
            row = claim(enqueue())
            sql(mutate)
            check(not recheck(row)['allowed'], reason + ' reached transport')
            sql(restore)

        for mutate, restore, reason in [
            (f"UPDATE cliente_atend_conversas SET ia_pausada=true WHERE id='{CONVERSATION}'", f"UPDATE cliente_atend_conversas SET ia_pausada=false WHERE id='{CONVERSATION}'", 'human pause'),
            (f"UPDATE cliente_whatsapp_contact SET last_message_at=clock_timestamp()+interval '1 second' WHERE id='{CONTACT}'", f"UPDATE cliente_whatsapp_contact SET last_message_at=NULL WHERE id='{CONTACT}'", 'new response'),
            (f"UPDATE crm_ia_config SET revision=gen_random_uuid() WHERE cliente_id='{C}'", f"UPDATE crm_ia_config SET revision='{REVISION}' WHERE cliente_id='{C}'", 'new config revision'),
            (f"UPDATE crm_ia_config SET data=jsonb_set(data,'{{attendance,auto_send}}','false') WHERE cliente_id='{C}'", f"UPDATE crm_ia_config SET data=jsonb_set(data,'{{attendance,auto_send}}','true') WHERE cliente_id='{C}'", 'autonomy off'),
        ]:
            row = claim(enqueue('followup'))
            sql(mutate)
            check(not recheck(row)['allowed'], reason + ' did not cancel auto delivery')
            sql(restore)

        sql(f"UPDATE crm_ia_config SET data=jsonb_set(data,'{{test_mode}}','{{\"enabled\":true,\"phones\":[]}}') WHERE cliente_id='{C}'")
        check(not recheck(claim(enqueue()))['allowed'], 'test mode without allowlist sent a manual request')
        sql(f"UPDATE crm_ia_config SET data=jsonb_set(data,'{{test_mode,phones}}','[\"+55 (11) 99999-9999\"]') WHERE cliente_id='{C}'")
        check(recheck(claim(enqueue()))['allowed'], 'normalized allowlisted number was blocked')
        sql(f"UPDATE crm_ia_config SET data=jsonb_set(data,'{{test_mode,enabled}}','false') WHERE cliente_id='{C}'")
        row = claim(enqueue())
        sql(f"UPDATE crm_ia_outbox SET claimed_at=clock_timestamp()-interval '10 minutes' WHERE id='{row['id']}'")
        check(claim(row['id']) is None and sql(f"SELECT status FROM crm_ia_outbox WHERE id='{row['id']}'") == 'uncertain', 'stale sending was retried')

        # Legacy reminders share the same claim/recheck protocol, retaining their exact conversation/channel.
        sql(f"INSERT INTO atendimento_conversas VALUES('{CONVERSATION}','{C}','{CHANNEL}','5511999999999@s.whatsapp.net',NULL,false)")
        sql(f"INSERT INTO atendimento_conversa_planejamento(id,cliente_id,conversation_id,whatsapp_config_id,chat_jid,kind,body,scheduled_at) VALUES('{CONVERSATION}','{C}','{CONVERSATION}','{CHANNEL}','5511999999999@s.whatsapp.net','lembrete_whatsapp','Legacy reminder',now()-interval '1 minute')")
        expected = sql(f"SELECT jsonb_build_object('updated_at',updated_at) FROM atendimento_conversa_planejamento WHERE id='{CONVERSATION}'")
        args = f"'reminder','{CONVERSATION}','{expected}'::jsonb"
        with ThreadPoolExecutor(max_workers=2) as pool:
            claims = list(pool.map(lambda _: call('crm_ia_legacy_delivery_claim', args), range(2)))
        check(sum(bool(item.get('claim_token')) for item in claims) == 1, 'legacy reminder claimed twice')
        legacy = next(item for item in claims if item.get('claim_token'))
        target = call('crm_ia_legacy_delivery_recheck', f"'reminder','{CONVERSATION}','{legacy['claim_token']}'")
        check(target['allowed'] and target['body'] == 'Legacy reminder' and target['whatsapp_config_id'] == CHANNEL, 'legacy reminder route changed')
        sql(f"UPDATE atendimento_conversa_planejamento SET status='cancelado' WHERE id='{CONVERSATION}'")
        check(not call('crm_ia_legacy_delivery_recheck', f"'reminder','{CONVERSATION}','{legacy['claim_token']}'")['allowed'], 'cancelled reminder reached transport')

        agent = '80000000-0000-0000-0000-000000000001'
        sql(f"INSERT INTO cliente_atend_ia_agentes VALUES('{agent}','{C}',true,true,'{{\"followup\":{{\"ativo\":true}}}}',now())")

        def legacy_followup_claim(with_channel=True):
            stored_channel = f"'{CHANNEL}'" if with_channel else 'NULL'
            sql(f"UPDATE cliente_atend_conversas SET ia_followup_due_at=now()-interval '1 minute',ia_followup_delivery_state='pending',ia_followup_whatsapp_config_id={stored_channel} WHERE id='{CONVERSATION}'")
            expected = sql(f"SELECT jsonb_build_object('updated_at',c.updated_at,'agent_id',a.id,'agent_updated_at',a.updated_at,'body','Legacy followup') FROM cliente_atend_conversas c CROSS JOIN cliente_atend_ia_agentes a WHERE c.id='{CONVERSATION}'")
            return call('crm_ia_legacy_delivery_claim', f"'followup','{CONVERSATION}','{expected}'::jsonb")

        legacy = legacy_followup_claim()
        check(call('crm_ia_legacy_delivery_recheck', f"'followup','{CONVERSATION}','{legacy['claim_token']}'")['allowed'], 'valid legacy followup blocked')
        second_channel = '20000000-0000-0000-0000-000000000002'
        sql(f"INSERT INTO cliente_whatsapp_config(id,cliente_id) VALUES('{second_channel}','{C}')")
        check(not legacy_followup_claim(False).get('claim_token'), 'legacy followup guessed a channel with two accounts')
        legacy = legacy_followup_claim()
        check(call('crm_ia_legacy_delivery_recheck', f"'followup','{CONVERSATION}','{legacy['claim_token']}'")['whatsapp_config_id'] == CHANNEL, 'stored channel was replaced by another account')
        sql(f"DELETE FROM cliente_whatsapp_config WHERE id='{second_channel}'")
        sql(f"UPDATE cliente_atend_conversas SET ia_pausada=true,ia_followup_due_at=NULL WHERE id='{CONVERSATION}'")
        call('crm_ia_legacy_delivery_finish', f"'followup','{CONVERSATION}','{legacy['claim_token']}','sent',NULL,'{{\"status\":\"entrada\",\"ia_pausada\":false,\"ia_followup_due_at\":\"2026-12-01T10:00:00Z\"}}'::jsonb")
        check(sql(f"SELECT ia_pausada AND ia_followup_due_at IS NULL FROM cliente_atend_conversas WHERE id='{CONVERSATION}'") == 't', 'delivery receipt overwrote a new human pause')
        sql(f"UPDATE cliente_atend_conversas SET ia_pausada=false WHERE id='{CONVERSATION}'")
        legacy = legacy_followup_claim()
        sql(f"UPDATE cliente_atend_ia_agentes SET updated_at=clock_timestamp() WHERE id='{agent}'")
        check(not call('crm_ia_legacy_delivery_recheck', f"'followup','{CONVERSATION}','{legacy['claim_token']}'")['allowed'], 'edited agent still sent legacy followup')
        legacy = legacy_followup_claim()
        sql(f"INSERT INTO cliente_whatsapp_inbox(cliente_id,whatsapp_config_id,chat_jid,msg_timestamp) VALUES('{C}','{CHANNEL}','5511999999999@s.whatsapp.net',clock_timestamp()+interval '1 second')")
        check(not call('crm_ia_legacy_delivery_recheck', f"'followup','{CONVERSATION}','{legacy['claim_token']}'")['allowed'], 'new inbound message was missed before conversation state update')
        check(sql("SELECT to_regprocedure('public.crm_ia_legacy_delivery_recover()') IS NOT NULL") == 't', 'legacy lease recovery is missing')
        sql(f"UPDATE atendimento_conversa_planejamento SET status='pendente',delivery_state='sending',delivery_claimed_at=clock_timestamp()-interval '10 minutes' WHERE id='{CONVERSATION}'")
        sql(f"UPDATE cliente_atend_conversas SET ia_followup_due_at=now()-interval '1 minute',ia_followup_delivery_state='sending',ia_followup_claimed_at=clock_timestamp()-interval '10 minutes' WHERE id='{CONVERSATION}'")
        recovered = call('crm_ia_legacy_delivery_recover')
        check(recovered == {'reminders': 1, 'followups': 1}, 'stale legacy claims were not recovered exactly once')
        check(call('crm_ia_legacy_delivery_recover') == {'reminders': 0, 'followups': 0}, 'recovery must never reopen a legacy claim')
        check(sql(f"SELECT ia_followup_delivery_state='uncertain' AND ia_followup_due_at IS NULL FROM cliente_atend_conversas WHERE id='{CONVERSATION}'") == 't', 'expired followup remained eligible')
        sql(f"GRANT USAGE ON SCHEMA public TO authenticated; GRANT UPDATE,SELECT ON cliente_atend_conversas TO authenticated;")
        sql(f"SET ROLE authenticated; UPDATE cliente_atend_conversas SET ia_followup_delivery_state='pending',ia_followup_claim_token=gen_random_uuid() WHERE id='{CONVERSATION}'")
        check(sql(f"SELECT ia_followup_delivery_state FROM cliente_atend_conversas WHERE id='{CONVERSATION}'") == 'uncertain', 'human client forged delivery metadata')
        sql("CREATE ROLE db_user NOLOGIN; GRANT USAGE ON SCHEMA public,planeje_private TO db_user; GRANT UPDATE,SELECT ON cliente_atend_conversas TO db_user; ALTER FUNCTION planeje_private.crm_ia_legacy_claim_guard() OWNER TO db_user;")
        sql(f"SET ROLE db_user; UPDATE cliente_atend_conversas SET ia_followup_delivery_state='pending' WHERE id='{CONVERSATION}'")
        check(sql(f"SELECT ia_followup_delivery_state FROM cliente_atend_conversas WHERE id='{CONVERSATION}'") == 'pending', 'migration owner cannot maintain claim state in QA')
        print(f'PASS {checks} delivery SQL checks; disposable PostgreSQL; Unix socket only')
    finally:
        run([BIN/'pg_ctl', '-D', data, '-m', 'immediate', '-w', 'stop'])

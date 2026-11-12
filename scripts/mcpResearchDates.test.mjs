import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

test('research date migration, historical batches, triggers and private grants execute in isolated PostgreSQL', () => {
  const bin = process.env.PLANEJE_TEST_PG_BIN || '/opt/homebrew/opt/postgresql@16/bin';
  const dir = mkdtempSync(join(tmpdir(), 'planeje-research-dates-'));
  const run = (name, args, input) => {
    const result = spawnSync(join(bin, name), args, { input, encoding: 'utf8', timeout: 30000 });
    assert.equal(result.status, 0, result.stderr || result.error?.message);
    return result.stdout;
  };
  const sql = input => run('psql', ['-X', '-h', dir, '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-Atq'], input);
  let started = false;
  try {
    run('initdb', ['-D', join(dir, 'data'), '-U', 'postgres', '-A', 'trust', '--no-locale', '--encoding=UTF8']);
    run('pg_ctl', ['-D', join(dir, 'data'), '-l', join(dir, 'server.log'), '-o', `-k ${dir} -c listen_addresses=''`, '-w', 'start']);
    started = true;
    sql(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema private; grant usage on schema private to service_role;
      create table clientes(id uuid primary key);
      create table cliente_whatsapp_inbox(id uuid primary key,cliente_id uuid references clientes,created_at timestamptz not null,msg_timestamp timestamptz,raw_payload jsonb);
      create table cliente_whatsapp_sent(id uuid primary key,cliente_id uuid references clientes,created_at timestamptz not null);
      create table cliente_whatsapp_webhook_log(id uuid primary key,cliente_id uuid references clientes,created_at timestamptz not null,raw_payload jsonb);
      insert into clientes values ('11111111-1111-4111-8111-111111111111');
      insert into cliente_whatsapp_webhook_log values ('22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111','2026-10-30T12:00:00Z',
        '{"entry":[{"messages":[{"timestamp":"2020-01-01T10:00:00-0300"},{"timestamp":"2026-10-01T10:00:00Z"}]}]}');`);
    sql(readFileSync('supabase/migrations/20261030035326_mcp_message_research_dates.sql', 'utf8'));
    assert.equal(sql(`select ready from mcp_message_research_state;`).trim(), 'f');
    sql(`do $$ begin perform private.mcp_finish_message_dates(); raise exception 'TEST_EXPECTED_INCOMPLETE';
      exception when raise_exception then if sqlerrm<>'Índice histórico incompleto' then raise; end if; end; $$;`);
    const first = sql(`select last_id,written from private.mcp_backfill_message_dates('cliente_whatsapp_webhook_log',null,1);`).trim();
    assert.equal(first, '22222222-2222-4222-8222-222222222222|1');
    sql(`select private.mcp_finish_message_dates();`);
    assert.equal(sql(`select ready from mcp_message_research_state;`).trim(), 't');
    assert.equal(sql(`select written from private.mcp_backfill_message_dates('cliente_whatsapp_webhook_log','22222222-2222-4222-8222-222222222222',1);`).trim(), '0');
    assert.equal(sql(`select event_start='2020-01-01T13:00:00Z',event_end='2026-10-30T12:00:00Z',event_window && tstzrange('2020-01-01','2020-01-02','[)') from mcp_message_research_dates;`).trim(), 't|t|t');
    assert.equal(sql(`select private.mcp_message_timestamp('2026-10-01 10:00:00-03')='2026-10-01T13:00:00Z',private.mcp_message_timestamp('2026-10-01 10:00:00') is null,private.mcp_message_timestamp('nonsense') is null;`).trim(), 't|t|t');
    sql(`update cliente_whatsapp_webhook_log set raw_payload='{"timestamp":"invalid"}';`);
    assert.equal(sql(`select event_start=created_at and event_end=created_at from mcp_message_research_dates;`).trim(), 't');
    sql(`insert into cliente_whatsapp_inbox values ('33333333-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111','2026-10-30','2026-10-01',null);
      insert into cliente_whatsapp_sent(id,cliente_id,created_at,sender_kind) values ('44444444-4444-4444-8444-444444444444','11111111-1111-4111-8111-111111111111','2026-10-30','automation');`);
    assert.equal(sql(`select count(*) from mcp_message_research_dates;`).trim(), '3');
    sql(`delete from cliente_whatsapp_webhook_log; delete from cliente_whatsapp_inbox; delete from cliente_whatsapp_sent;`);
    assert.equal(sql(`select count(*) from mcp_message_research_dates;`).trim(), '0');
    assert.equal(sql(`select has_table_privilege('authenticated','mcp_message_research_dates','select'),has_table_privilege('anon','mcp_message_research_dates','select'),has_table_privilege('service_role','mcp_message_research_dates','select'),has_function_privilege('authenticated','private.mcp_backfill_message_dates(text,uuid,integer)','execute');`).trim(), 'f|f|t|f');
  } finally {
    if (started) run('pg_ctl', ['-D', join(dir, 'data'), '-m', 'fast', '-w', 'stop']);
    rmSync(dir, { recursive: true, force: true });
  }
});

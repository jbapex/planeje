import assert from 'node:assert/strict';
import { execFile, spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

const work = mkdtempSync('/tmp/crm-manual-receipt-'), data = join(work, 'data');
const env = { PATH: process.env.PATH, LC_ALL: 'C' }, baseline = process.env.CRM_RECEIPT_BASELINE === '1';
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const context = Object.fromEntries(['admin', 'staff', 'other', 'client', 'foreign', 'channel', 'hiddenChannel', 'contact'].map((key, index) => [key, id([1, 2, 3, 11, 12, 21, 22, 31][index])]));
const { admin, staff, client, foreign, channel, contact } = context;
const psql = ['-X', '-Aqt', '-v', 'ON_ERROR_STOP=1', '-h', work, '-p', '55721', '-U', 'manual_receipt_qa', '-d', 'postgres'];
const migration = name => readFileSync(new URL(`../../supabase/migrations/${name}`, import.meta.url), 'utf8');
const quote = value => value === null ? 'NULL' : `'${String(value).replaceAll("'", "''")}'`;
const json = value => `${quote(JSON.stringify(value))}::jsonb`;
function run(binary, args, input) {
  const result = spawnSync(binary, args, { input, env, encoding: 'utf8', timeout: 25000 });
  if (result.error || result.status !== 0) throw Error(result.stderr?.trim() || result.error?.message || result.stdout);
  return result.stdout.trim();
}
const sql = input => run('psql', psql, input);
const rpc = (name, args) => JSON.parse(sql(`SET ROLE service_role;SET test.uid='';SELECT to_jsonb(public.${name}(${args}));`));
const conversation = (account = client) => JSON.parse(sql(`SELECT to_jsonb(c) FROM cliente_atend_conversas c WHERE cliente_id='${account}' AND contact_id='${contact}'`));
const box = key => JSON.parse(sql(`SELECT to_jsonb(o) FROM crm_ia_outbox o WHERE id='${key}'`));
const protectedState = c => { const copy = { ...c };delete copy.status;delete copy.status_at;delete copy.updated_at;return copy; };
const metadata = signature => sql(`SELECT jsonb_build_object('oid',oid,'owner',proowner,'definer',prosecdef,'language',prolang,'volatile',provolatile,'strict',proisstrict,'parallel',proparallel,'leakproof',proleakproof,'cost',procost,'rows',prorows,'acl',proacl::text,'config',proconfig,'args',pg_get_function_arguments(oid),'result',pg_get_function_result(oid)) FROM pg_proc WHERE oid='${signature}'::regprocedure`);
const signatures = ['public.crm_ia_delivery_start(text,uuid,uuid)', 'public.crm_ia_delivery_finish_base(uuid,uuid,text,text,text)'];
let sequence = 1000;
function enqueue(scheduledAt) {
  sql(`UPDATE cliente_atend_conversas SET status='esperando',status_at='2026-01-01T10:00Z',ia_pausada=true,assigned_to='${staff}',ia_followup_due_at='2099-01-01T10:00Z',crm_ia_runtime='{"active":true,"sentinel":"preservar"}',updated_at=clock_timestamp() WHERE cliente_id='${client}' AND contact_id='${contact}';`);
  return JSON.parse(sql(`SET ROLE authenticated;SET test.uid='${admin}';SELECT public.crm_ia_workspace('schedule_message','${client}',${json({ contact_id: contact, channel_id: channel, body: 'Resposta humana fictícia', request_id: id(++sequence), ...(scheduledAt && { scheduled_at: scheduledAt }) })})`));
}
const claim = row => rpc('crm_ia_delivery_claim', `p_ids=>ARRAY['${row.id}']::uuid[]`)[0];
const start = row => rpc('crm_ia_delivery_start', `'outbox','${row.id}','${row.claim_token}'`);
const finish = (row, status = 'sent', receipt = `receipt-${row.id}`, token = row.claim_token) => rpc('crm_ia_delivery_finish', `'${row.id}',${quote(token)},'${status}',${quote(receipt)},NULL`);
function inbound({ account = client, jid = '551199999999@s.whatsapp.net', chatJid = jid, group = false, role = 'service_role' } = {}) {
  const key = id(++sequence);
  sql(`SET ROLE ${role};INSERT INTO cliente_whatsapp_inbox(id,cliente_id,whatsapp_config_id,from_jid,chat_jid,body,message_id,is_group) VALUES('${key}','${account}','${channel}',${quote(jid)},${quote(chatJid)},'Entrada fictícia','inbound-${key}',${group});`);
  return key;
}

test('recibo humano encerra somente a espera da versão comprovada do transporte', async t => {
  let started = false;
  const previousFetch = globalThis.fetch;
  globalThis.fetch = () => { throw Error('Rede externa proibida na fixture de recibo.'); };
  try {
    run('initdb', ['-D', data, '-U', 'manual_receipt_qa', '--auth-local=trust', '--auth-host=reject', '--no-locale', '--encoding=UTF8']);
    run('pg_ctl', ['-D', data, '-l', join(work, 'postgres.log'), '-o', `-k ${work} -p 55721 -c listen_addresses='' -c unix_socket_permissions=0700`, '-w', 'start']);started = true;
    assert.equal(sql('SHOW listen_addresses'), '');
    const fixture = readFileSync(new URL('./workspace.database.test.mjs', import.meta.url), 'utf8').split('    sql(`')[1].split('    `);')[0].replace(/\$\{(\w+)\}/g, (_, key) => context[key]);
    sql(fixture.replace(/      CREATE TABLE public\.crm_ia_outbox\([^\n]+\n/, ''));
    sql(`CREATE SCHEMA planeje_private;CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid);
      CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT jsonb_build_object('sub',auth.uid())$$;
      ALTER TABLE profiles ADD COLUMN avatar_url text;
      ALTER TABLE cliente_whatsapp_contact ADD COLUMN last_message_at timestamptz,ADD COLUMN origin_source text DEFAULT 'nao_identificado',ADD COLUMN qualificado boolean,ADD COLUMN profile_pic_url text,ADD UNIQUE(cliente_id,from_jid);
      ALTER TABLE cliente_whatsapp_inbox ADD UNIQUE(cliente_id,message_id);
      ALTER TABLE cliente_whatsapp_sent ADD COLUMN sent_by uuid;
      ALTER TABLE leads ADD COLUMN qualificado boolean;ALTER TABLE cliente_atend_conversas ADD COLUMN ia_followup_passo integer DEFAULT 0;
      CREATE TABLE atendimento_usuario_acesso(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cliente_id uuid,user_id uuid,whatsapp_config_id uuid);
      CREATE TABLE atendimento_conversas(id uuid PRIMARY KEY,cliente_id uuid,whatsapp_config_id uuid,chat_jid text,archived_at timestamptz,bloqueada boolean DEFAULT false);
      ALTER TABLE cliente_whatsapp_inbox ADD COLUMN conversation_id uuid REFERENCES atendimento_conversas(id);
      CREATE TABLE atendimento_conversa_planejamento(id uuid PRIMARY KEY,cliente_id uuid,conversation_id uuid,whatsapp_config_id uuid,chat_jid text,kind text,body text,status text,scheduled_at timestamptz,completed_at timestamptz,error_message text,updated_at timestamptz DEFAULT now());
      GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;`);
    sql(migration('20260702120000_atendimento_send_requires_channel_access.sql'));
    sql(migration('20261006140000_atendimento_loja_modulo.sql').match(/create or replace function public\.cliente_atend_loja_habilitada\([\s\S]*?\$\$;/i)[0]);
    sql(migration('20260928230000_cliente_atend_inbox.sql').match(/create or replace function public\.cliente_atend_touch_updated_at\([\s\S]*?\$\$;/i)[0]);
    sql('CREATE TRIGGER cliente_atend_conversas_touch BEFORE UPDATE ON cliente_atend_conversas FOR EACH ROW EXECUTE FUNCTION public.cliente_atend_touch_updated_at()');
    const files = readdirSync(new URL('../../supabase/migrations/', import.meta.url));
    for (const file of files.filter(name => /^\d+_crm_ia_/.test(name) && name <= '20261112021544_crm_ia_capture_entry.sql').sort()) sql(migration(file));
    const before = signatures.map(metadata);
    if (!baseline) {
      const next = files.filter(name => name.endsWith('_crm_ia_manual_receipt.sql'));
      assert.equal(next.length, 1);sql(migration(next[0]));
    }
    sql(`INSERT INTO client_module_permissions(cliente_id,module_name,is_enabled) VALUES('${client}','atendimento_loja',true);
      INSERT INTO cliente_atend_conversas(cliente_id,contact_id,status,ia_pausada,assigned_to) VALUES('${client}','${contact}','esperando',true,'${staff}'),('${foreign}','${contact}','esperando',true,'${admin}');
      INSERT INTO crm_ia_config(cliente_id,data,updated_by) VALUES('${client}','{"attendance":{"auto_send":false},"test_mode":{"enabled":false,"phones":[]}}','${admin}');`);

    await t.test('partida captura versão uma vez sem mudar a conversa ou aceitar outro claim', () => {
      const row = claim(enqueue()), original = conversation();
      assert.equal(start(row), true);assert.deepEqual(conversation(), original);
      assert.equal(box(row.id).source_updated_at, original.updated_at);
      sql(`UPDATE cliente_atend_conversas SET updated_at=clock_timestamp() WHERE cliente_id='${client}' AND contact_id='${contact}'`);
      assert.equal(start(row), false);assert.equal(box(row.id).source_updated_at, original.updated_at);
      assert.equal(start({ ...row, claim_token: id(999) }), false);
    });
    await t.test('recibo manual confirmado encerra espera sem mexer em pausa, follow-up ou responsável', () => {
      const row = claim(enqueue());assert.equal(start(row), true);
      const original = conversation(), foreignBefore = conversation(foreign);
      assert.equal(finish(row), true);const after = conversation();
      assert.equal(after.status, 'entrada');assert.notEqual(after.status_at, original.status_at);
      assert.deepEqual(protectedState(after), protectedState(original));assert.deepEqual(conversation(foreign), foreignBefore);
      assert.equal(box(row.id).status, 'sent');assert.equal(finish(row), false);assert.deepEqual(conversation(), after);
    });
    await t.test('inbox persistida invalida a versão antes de ensure atualizar o atendimento', () => {
      const row = claim(enqueue());assert.equal(start(row), true);const beforeState = conversation();
      inbound();const afterInsert = conversation();
      assert.notEqual(afterInsert.updated_at, beforeState.updated_at);assert.deepEqual(protectedState(afterInsert), protectedState(beforeState));
      assert.equal(finish(row), true);assert.deepEqual(conversation(), afterInsert);assert.equal(conversation().status, 'esperando');
      assert.equal(sql(`WITH changed AS(UPDATE cliente_atend_conversas SET status='esperando' WHERE cliente_id='${client}' AND contact_id='${contact}' AND updated_at=${quote(afterInsert.updated_at)} RETURNING id) SELECT count(*) FROM changed`), '1');
    });
    await t.test('invalidar a versão não cria ficha, executa agente ou responde; grupo, outra conta, módulo desligado e replay não invalidam', () => {
      enqueue();const original = conversation(), foreignBefore = conversation(foreign);
      const count = sql('SELECT count(*) FROM cliente_atend_conversas'), runs = sql('SELECT count(*) FROM planeje_private.crm_ia_agent_runs'), queued = sql('SELECT count(*) FROM crm_ia_outbox');
      inbound({ group: true });inbound({ account: foreign });inbound({ jid: '5511888888888@s.whatsapp.net' });
      sql(`UPDATE client_module_permissions SET is_enabled=false WHERE cliente_id='${client}' AND module_name='atendimento_loja'`);
      inbound();sql(`UPDATE client_module_permissions SET is_enabled=true WHERE cliente_id='${client}' AND module_name='atendimento_loja'`);
      const config = sql(`SELECT to_jsonb(c) FROM crm_ia_config c WHERE cliente_id='${client}'`);
      sql(`DELETE FROM crm_ia_config WHERE cliente_id='${client}'`);inbound();
      sql(`INSERT INTO crm_ia_config SELECT * FROM jsonb_populate_record(NULL::crm_ia_config,${quote(config)}::jsonb)`);
      sql(`GRANT INSERT ON cliente_whatsapp_inbox TO authenticated`);inbound({ role: 'authenticated' });
      assert.deepEqual(conversation(), original);assert.deepEqual(conversation(foreign), foreignBefore);
      const key = inbound({ chatJid: null }), afterInsert = conversation();assert.notEqual(afterInsert.updated_at, original.updated_at);
      sql(`SET ROLE service_role;INSERT INTO cliente_whatsapp_inbox(id,cliente_id,whatsapp_config_id,from_jid,chat_jid,body,message_id,is_group) SELECT id,cliente_id,whatsapp_config_id,from_jid,chat_jid,'Replay fictício',message_id,is_group FROM cliente_whatsapp_inbox WHERE id='${key}' ON CONFLICT(cliente_id,message_id) DO UPDATE SET body=excluded.body;`);
      assert.deepEqual(conversation(), afterInsert);assert.equal(sql('SELECT count(*) FROM cliente_atend_conversas'), count);
      assert.equal(sql('SELECT count(*) FROM planeje_private.crm_ia_agent_runs'), runs);assert.equal(sql('SELECT count(*) FROM crm_ia_outbox'), queued);
    });
    await t.test('agendamento futuro não encerra espera antes do transporte', () => {
      const row = enqueue(new Date(Date.now() + 3600000).toISOString()), beforeState = conversation();
      assert.equal(claim(row), undefined);assert.equal(box(row.id).source_updated_at, null);assert.deepEqual(conversation(), beforeState);
    });
    await t.test('falha, incerteza, recibo ausente, transporte ausente e claim falso preservam espera', () => {
      for (const options of [{ status: 'failed' }, { status: 'uncertain' }, { receipt: null }, { receipt: '' }, { transport: false }, { token: id(998) }, { version: false }]) {
        const row = claim(enqueue());if (options.transport !== false) assert.equal(start(row), true);
        if (options.version === false) sql(`UPDATE crm_ia_outbox SET source_updated_at=NULL WHERE id='${row.id}'`);
        const original = conversation();
        assert.equal(finish(row, options.status || 'sent', Object.hasOwn(options, 'receipt') ? options.receipt : `receipt-${row.id}`, options.token || row.claim_token), !options.token);
        assert.deepEqual(conversation(), original, JSON.stringify(options));
      }
    });
    await t.test('entrada, responsável, pausa ou fechamento mais recentes nunca são sobrescritos', () => {
      for (const patch of ["status='esperando',status_at=clock_timestamp()", `assigned_to='${admin}'`, 'ia_pausada=false', "status='finalizado'", "status='entrada'"]) {
        const row = claim(enqueue());assert.equal(start(row), true);
        sql(`UPDATE cliente_atend_conversas SET ${patch},updated_at=clock_timestamp() WHERE cliente_id='${client}' AND contact_id='${contact}'`);
        const original = conversation();assert.equal(finish(row), true);assert.deepEqual(conversation(), original, patch);
      }
      const row = claim(enqueue());sql(`UPDATE cliente_atend_conversas SET status='finalizado',updated_at=clock_timestamp() WHERE cliente_id='${client}' AND contact_id='${contact}'`);
      assert.equal(start(row), true);const original = conversation();assert.equal(finish(row), true);assert.deepEqual(conversation(), original);
    });
    await t.test('tipos automáticos e recibos sem conversa não alteram outra ficha', () => {
      for (const kind of ['reply', 'followup', 'reminder', 'notification']) {
        const row = claim(enqueue());sql(`UPDATE crm_ia_outbox SET kind='${kind}' WHERE id='${row.id}'`);
        const original = conversation();assert.equal(finish(row), true);assert.deepEqual(conversation(), original, kind);
      }
      const row = claim(enqueue());assert.equal(start(row), true);
      sql(`DELETE FROM cliente_atend_conversas WHERE cliente_id='${client}' AND contact_id='${contact}'`);
      const original = conversation(foreign);assert.equal(finish(row), true);assert.deepEqual(conversation(foreign), original);
      sql(`INSERT INTO cliente_atend_conversas(cliente_id,contact_id,status,ia_pausada,assigned_to) VALUES('${client}','${contact}','esperando',true,'${staff}')`);
    });
    await t.test('WHERE reavalia a versão depois de aguardar uma atualização ainda não confirmada', async () => {
      const row = claim(enqueue());assert.equal(start(row), true);
      const owner = spawn('psql', psql, { env, stdio: ['pipe', 'pipe', 'pipe'] });let output = '', error = '';
      owner.stdout.on('data', chunk => { output += chunk; });owner.stderr.on('data', chunk => { error += chunk; });
      const wait = async condition => { const until = Date.now() + 8000;while (!condition()) { if (Date.now() > until) throw Error(`Concorrência não chegou ao estado esperado: ${error}`);await new Promise(resolve => setTimeout(resolve, 15)); } };
      try {
        owner.stdin.write(`BEGIN;INSERT INTO cliente_whatsapp_inbox(cliente_id,whatsapp_config_id,from_jid,chat_jid,body,message_id,is_group) VALUES('${client}','${channel}','551199999999@s.whatsapp.net','551199999999@s.whatsapp.net','Concorrência fictícia','concurrent-${row.id}',false);SELECT 'locked';\n`);
        await wait(() => output.includes('locked'));
        const pending = promisify(execFile)('psql', [...psql, '-c', `SET application_name='crm-receipt-finalizer-qa';SET ROLE service_role;SET test.uid='';SELECT public.crm_ia_delivery_finish('${row.id}','${row.claim_token}','sent','concurrent-receipt',NULL);`], { env, timeout: 15000, encoding: 'utf8' });
        await wait(() => sql("SELECT count(*) FROM pg_stat_activity WHERE application_name='crm-receipt-finalizer-qa' AND wait_event_type='Lock'") === '1');
        owner.stdin.write('COMMIT;SELECT \'committed\';\n');await wait(() => output.includes('committed'));
        assert.equal((await pending).stdout.trim(), 't');assert.equal(conversation().status, 'esperando');assert.equal(box(row.id).status, 'sent');
      } finally { owner.stdin.end();if (owner.exitCode === null) owner.kill('SIGTERM'); }
    });
    await t.test('FK real da inbox respeita ordem CRM → Atendimento usada por Atlas e notificações', async () => {
      enqueue();const canonical = id(990);
      sql(`INSERT INTO atendimento_conversas(id,cliente_id,whatsapp_config_id,chat_jid) VALUES('${canonical}','${client}','${channel}','551199999999@s.whatsapp.net')`);
      const connect = () => {
        const child = spawn('psql', psql, { env, stdio: ['pipe', 'pipe', 'pipe'] });let output = '', error = '';
        child.stdout.on('data', chunk => { output += chunk; });child.stderr.on('data', chunk => { error += chunk; });
        const done = new Promise(resolve => child.once('close', code => resolve({ code, output, error })));
        const waitFor = async text => { const until = Date.now() + 8000;while (!output.includes(text)) { if (child.exitCode !== null || Date.now() > until) throw Error(`Gate não alcançado: ${error}`);await new Promise(resolve => setTimeout(resolve, 15)); } };
        return { child, done, waitFor };
      };
      const owner = connect(), incoming = connect();
      try {
        owner.child.stdin.write(`BEGIN;SET LOCAL deadlock_timeout='100ms';SELECT 1 FROM cliente_atend_conversas WHERE cliente_id='${client}' AND contact_id='${contact}' FOR UPDATE;SELECT 'crm_locked';\n`);
        await owner.waitFor('crm_locked');
        incoming.child.stdin.end(`SET application_name='crm-receipt-fk-qa';BEGIN;SET LOCAL deadlock_timeout='100ms';SET LOCAL ROLE service_role;INSERT INTO cliente_whatsapp_inbox(cliente_id,whatsapp_config_id,from_jid,chat_jid,body,message_id,is_group,conversation_id) VALUES('${client}','${channel}','551199999999@s.whatsapp.net','551199999999@s.whatsapp.net','FK fictícia','receipt-fk-inbound',false,'${canonical}');COMMIT;SELECT 'inbox_committed';`);
        const until = Date.now() + 8000;
        while (sql("SELECT count(*) FROM pg_stat_activity WHERE application_name='crm-receipt-fk-qa' AND wait_event_type='Lock'") !== '1') {
          if (Date.now() > until) throw Error('Inbox não aguardou o lock da conversa.');await new Promise(resolve => setTimeout(resolve, 15));
        }
        owner.child.stdin.end(`SELECT 1 FROM atendimento_conversas WHERE id='${canonical}' FOR UPDATE;COMMIT;SELECT 'owner_committed';`);
        const results = await Promise.all([owner.done, incoming.done]);
        for (const result of results) assert.equal(result.code, 0, result.error);
        assert.match(results[0].output, /owner_committed/);assert.match(results[1].output, /inbox_committed/);
        assert.equal(sql("SELECT count(*) FROM cliente_whatsapp_inbox WHERE message_id='receipt-fk-inbound'"), '1');
      } finally {
        for (const process of [owner.child, incoming.child]) { process.stdin.end();if (process.exitCode === null) process.kill('SIGTERM'); }
      }
    });
    await t.test('assinaturas, OIDs, atributos e permissões dos RPCs são preservados', () => {
      assert.deepEqual(signatures.map(metadata), before);
      for (const signature of signatures) for (const role of ['anon', 'authenticated']) assert.equal(sql(`SELECT has_function_privilege('${role}','${signature}','EXECUTE')`), 'f');
      if (!baseline) {
        const helper = JSON.parse(metadata('private.crm_ia_inbound_revision()'));
        assert.equal(helper.owner, JSON.parse(before[0]).owner);assert.equal(helper.definer, false);assert.equal(helper.result, 'trigger');
        for (const role of ['anon', 'authenticated', 'service_role']) assert.equal(sql(`SELECT has_function_privilege('${role}','private.crm_ia_inbound_revision()','EXECUTE')`), 'f');
      }
    });
  } finally {
    globalThis.fetch = previousFetch;
    if (started) run('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop']);
    rmSync(work, { recursive: true, force: true });
  }
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { handleCrmIaMessage } from '../../supabase/functions/crm-ia/message.js';

const previousFetch = globalThis.fetch;
globalThis.fetch = () => { throw Error('Rede indisponível neste teste de banco.'); };
test.after(() => { globalThis.fetch = previousFetch; });

const work = mkdtempSync('/tmp/crm-conversation-controls-db-'), data = join(work, 'data'), env = { PATH: process.env.PATH, LC_ALL: 'C' };
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const context = Object.fromEntries(['admin', 'staff', 'other', 'client', 'foreign', 'channel', 'hiddenChannel', 'contact'].map((key, i) => [key, id([1, 2, 3, 11, 12, 21, 22, 31][i])]));
const { admin, staff, other, client, foreign, channel, hiddenChannel, contact } = context;
const quote = value => `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
function run(name, args, input) { const r = spawnSync(name, args, { input, env, encoding: 'utf8', timeout: 25000 }); if (r.error || r.status) throw new Error(r.stderr || r.error?.message); return r.stdout.trim(); }
const psql = ['-X', '-Aqt', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose', '-h', work, '-p', '55593', '-U', 'conversation_controls_qa', '-d', 'postgres'];
const sql = input => run('psql', psql, input);
const call = (action, payload = {}, uid = admin, target = client) => JSON.parse(sql(`BEGIN;SET LOCAL ROLE authenticated;SET LOCAL test.uid='${uid}';SELECT public.crm_ia_workspace('${action}','${target}',${quote(payload)});COMMIT;`));
const scope = { contact_id: contact, channel_id: channel };
function connection() {
  const process = spawn('psql', psql, { env, stdio: ['pipe', 'pipe', 'pipe'] }); let stderr = '', sequence = 0;
  process.stderr.on('data', chunk => { stderr += chunk; });
  const done = new Promise((resolve, reject) => { process.on('error', reject); process.on('exit', code => resolve({ code, stderr })); });
  return { process, done, get stderr() { return stderr; }, async query(statement) {
    const marker = `done_${++sequence}`;
    const output = new Promise((resolve, reject) => {
      let value = ''; const timer = setTimeout(() => { cleanup(); reject(Error('Fixture connection timed out')); }, 4000);
      function cleanup() { clearTimeout(timer); process.stdout.off('data', receive); process.off('exit', fail); }
      function receive(chunk) { value += chunk; if (value.includes(marker)) { cleanup(); resolve(value.split(marker)[0].trim()); } }
      function fail() { cleanup(); reject(Error(stderr || 'Fixture connection closed')); }
      process.stdout.on('data', receive); process.once('exit', fail);
    });
    process.stdin.write(`${statement};\n\\echo ${marker}\n`); return output;
  } };
}

test('controles de conversa preservam pessoa, cliente, canal e prova de entrega', async t => {
  let started = false;
  try {
    run('initdb', ['-D', data, '-U', 'conversation_controls_qa', '--auth-local=trust', '--auth-host=reject', '--no-locale', '--encoding=UTF8']);
    run('pg_ctl', ['-D', data, '-l', join(work, 'pg.log'), '-o', `-k ${work} -p 55593 -c listen_addresses='' -c unix_socket_permissions=0700`, '-w', 'start']); started = true;
    assert.equal(sql('SHOW listen_addresses'), '');
    const fixture = readFileSync(new URL('./workspace.database.test.mjs', import.meta.url), 'utf8').split('    sql(`')[1].split('    `);')[0].replace(/\$\{(\w+)\}/g, (_, name) => context[name]);
    sql(fixture.replace(/      CREATE TABLE public\.crm_ia_outbox\([^\n]+\n/, ''));
    sql(`CREATE SCHEMA planeje_private;CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid);
      CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT jsonb_build_object('sub',auth.uid())$$;
      ALTER TABLE cliente_whatsapp_contact ADD COLUMN last_message_at timestamptz,ADD COLUMN origin_source text DEFAULT 'nao_identificado',ADD COLUMN qualificado boolean;
      ALTER TABLE leads ADD COLUMN qualificado boolean;ALTER TABLE cliente_atend_conversas ADD COLUMN ia_followup_passo integer DEFAULT 0;
      CREATE TABLE atendimento_conversas(id uuid PRIMARY KEY,cliente_id uuid,whatsapp_config_id uuid,chat_jid text,archived_at timestamptz,bloqueada boolean DEFAULT false);
      CREATE TABLE atendimento_conversa_planejamento(id uuid PRIMARY KEY,cliente_id uuid,conversation_id uuid,whatsapp_config_id uuid,chat_jid text,kind text,body text,status text,scheduled_at timestamptz,completed_at timestamptz,error_message text,updated_at timestamptz DEFAULT now());
      GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;`);
    for (const file of ['20261111041703_crm_ia_delivery_runtime.sql', '20261111041704_crm_ia_workspace.sql', '20261111043800_crm_ia_workspace_readings.sql', '20261111044652_crm_ia_agent_runtime.sql', '20261111062101_crm_ia_calendar.sql', '20261111062548_crm_ia_voice.sql', '20261111072502_crm_ia_calendar_delivery.sql', '20261111075558_crm_ia_agent_template_contract.sql', '20261111090001_crm_ia_appointment_actions.sql', '20261111090002_crm_ia_agent_drafts_voice_modes.sql', '20261111090003_crm_ia_lead_tags.sql', '20261111101501_crm_ia_lead_profiles.sql', '20261111101502_crm_ia_lead_reads.sql', '20261111120001_crm_ia_internal_notifications.sql', '20261111120002_crm_ia_conversation_controls.sql','20261111162400_crm_ia_conversation_read_performance.sql']) {
      const url = new URL(`../../supabase/migrations/${file}`, import.meta.url);
      assert.equal(existsSync(url), true, `Migration obrigatória: ${file}`); sql(readFileSync(url, 'utf8'));
    }
    sql(`INSERT INTO cliente_atend_conversas(cliente_id,contact_id,status,ia_pausada,assigned_to) VALUES('${client}','${contact}','esperando',false,'${staff}');`);
    const lead = call('save_lead', { nome: 'Lead sintético', whatsapp: '551199999999', responsavel_id: staff });
    call('save_lead', { nome: 'Lead restrito', whatsapp: '551199999998', responsavel_id: admin });
    await t.test('feed conta toda a população autorizada e marca snapshot sem tocar conversa nem eventos posteriores', () => {
      const before = sql('SELECT to_jsonb(c) FROM cliente_atend_conversas c');
      const first = call('notifications', { limit: 1 }), again = call('notifications', { limit: 1, offset: 1 });
      assert.equal(first.total, 2); assert.equal(first.unread_count, 2); assert.equal(first.rows.length, 1);
      assert.equal(first.snapshot.id, again.snapshot.id); assert.equal(again.rows.length, 1);
      assert.equal(first.rows[0].type, 'lead_created'); assert.match(first.rows[0].id, /^lead_created:/);
      const late = call('save_lead', { nome: 'Evento posterior', whatsapp: '551199999997', responsavel_id: staff });
      const newSnapshot = call('notifications'); assert.notEqual(newSnapshot.snapshot.id, first.snapshot.id);
      const marked = call('mark_notifications_read', { snapshot_id: first.snapshot.id }); assert.equal(marked.marked, 2);
      assert.equal(call('mark_notifications_read', { snapshot_id: first.snapshot.id }).marked, 0);
      const after = call('notifications'); assert.equal(after.unread_count, 1); assert.equal(after.rows.find(r => r.lead_id === late.id).read, false);
      assert.equal(sql('SELECT to_jsonb(c) FROM cliente_atend_conversas c'), before);
      assert.equal(call('notifications', {}, staff).unread_count, 2);
      assert.throws(() => call('mark_notifications_read', { snapshot_id: first.snapshot.id }, staff), /snapshot|leitura/i);
      assert.throws(() => call('notifications', {}, other), /acesso/i); assert.throws(() => call('notifications', {}, staff, foreign), /acesso/i);
      assert.throws(() => call('mark_notifications_read', { snapshot_id: id(900) }), /snapshot|leitura/i);
      assert.equal(sql('SELECT count(*) FROM planeje_private.crm_ia_notification_snapshots'), '2');
    });
    await t.test('ACL alterada e evento retrodatado invalidam snapshot sem marcar registros novos', () => {
      const feed = call('notifications', {}, staff);
      sql(`UPDATE leads SET responsavel_id='${admin}' WHERE id='${lead.id}'`);
      assert.throws(() => call('mark_notifications_read', { snapshot_id: feed.snapshot.id }, staff), /snapshot|leitura|alterad/i);
      sql(`UPDATE leads SET responsavel_id='${staff}' WHERE id='${lead.id}'`);
      const original = call('notifications');
      sql(`INSERT INTO leads(cliente_id,nome,whatsapp,responsavel_id,created_at) VALUES('${client}','Retrodatado','551199999996','${staff}','2020-01-01')`);
      assert.throws(() => call('mark_notifications_read', { snapshot_id: original.snapshot.id }), /snapshot|leitura|alterad/i);
      assert.equal(call('notifications').rows.find(r => r.created_at.startsWith('2020')).read, false);
    });
    await t.test('contexto usa vínculo canônico e recusa ambiguidade, privado ou canal estrangeiro', () => {
      assert.equal(call('conversation_context', scope).lead.id, lead.id);
      sql(`INSERT INTO leads(cliente_id,nome,whatsapp,responsavel_id,crm_ia_contact_id) VALUES('${client}','Segundo vínculo','551199998888','${staff}','${contact}');UPDATE leads SET crm_ia_contact_id='${contact}' WHERE id='${lead.id}'`);
      const ambiguous = call('conversation_context', scope); assert.equal(ambiguous.status, 'ambiguous'); assert.equal(ambiguous.lead, null);
      sql(`DELETE FROM leads WHERE nome='Segundo vínculo'`);
      assert.throws(() => call('conversation_context', { ...scope, channel_id: hiddenChannel }), /acesso|canal/i);
      sql(`UPDATE cliente_atend_conversas SET privado=true,assigned_to='${admin}' WHERE contact_id='${contact}'`);
      assert.throws(() => call('conversation_context', scope, staff), /acesso|conversa/i);
      sql(`UPDATE cliente_atend_conversas SET privado=false,assigned_to='${staff}' WHERE contact_id='${contact}'`);
      sql(`UPDATE leads SET responsavel_id='${admin}' WHERE id='${lead.id}'`);
      assert.deepEqual(call('conversation_context', scope, staff), { status: 'unlinked', lead: null });
      sql(`UPDATE leads SET responsavel_id='${staff}' WHERE id='${lead.id}'`);
    });
    const agent = call('save_agent', { nome: 'Agente QA', funil: { crm_ia: { tipo: 'qualificacao' } } });
    const sent = id(701), outbox = id(702), runId = id(703);
    sql(`INSERT INTO planeje_private.crm_ia_agent_runs(id,cliente_id,channel_id,contact_id,lead_id,agent_id,actor_id,mode,message_id,snapshot,status,result) VALUES('${runId}','${client}','${channel}','${contact}','${lead.id}','${agent.id}','${admin}','responder','inbound-fixture','{}','queued','{"queued":true,"outbox_id":"${outbox}"}');
      INSERT INTO crm_ia_outbox(id,cliente_id,whatsapp_config_id,contact_id,lead_id,kind,body,scheduled_at,status,request_id,created_by,agent_run_id,provider_message_id) VALUES('${outbox}','${client}','${channel}','${contact}','${lead.id}','reply','Resposta sintética',now(),'sent','${runId}','${admin}','${runId}','provider-fixture');
      INSERT INTO cliente_whatsapp_sent(id,cliente_id,whatsapp_config_id,to_jid,chat_jid,body,message_id,sender_kind) VALUES('${sent}','${client}','${channel}','551199999999@s.whatsapp.net','551199999999@s.whatsapp.net','Resposta sintética','provider-fixture','automation');`);
    const flag = (extra = {}, uid = admin) => call('flag_ai_message', { ...scope, sent_id: sent, category: 'off_topic', ...extra }, uid);
    await t.test('flag prova envio, deduplica por pessoa e aplica edição versionada sem compartilhar observação', () => {
      const before = sql('SELECT to_jsonb(c) FROM cliente_atend_conversas c');
      let message = call('messages', scope).rows.find(r => r.id === sent); assert.equal(message.can_flag, true); assert.equal(message.my_flag, null);
      const first = flag({ note: 'Observação privada' }); assert.equal(first.actor_id, admin);
      assert.deepEqual(flag({ note: 'Observação privada' }), first);
      assert.throws(() => flag({ category: 'too_long', note: 'Alterada' }), /versão|alterad/i);
      const edited = flag({ category: 'too_long', note: 'Alterada', expected_updated_at: first.updated_at }); assert.notEqual(edited.updated_at, first.updated_at);
      assert.throws(() => flag({ category: 'other', expected_updated_at: first.updated_at }), /versão|alterad/i);
      message = call('messages', scope).rows.find(r => r.id === sent); assert.equal(message.my_flag.category, 'too_long');
      assert.equal(call('messages', scope, staff).rows.find(r => r.id === sent).my_flag, null);
      const own = flag({ note: 'Pessoa diferente' }, staff); assert.notEqual(own.id, edited.id);
      assert.equal(sql('SELECT to_jsonb(c) FROM cliente_atend_conversas c'), before);
      assert.throws(() => flag({ actor_id: staff }), /autor|ator/i); assert.throws(() => flag({ category: 'inventada' }), /categoria/i);
      assert.throws(() => flag({ note: 'x'.repeat(1001) }), /observação/i);
      assert.throws(() => flag({ note: { text: 'objeto' } }), /observação/i);
      assert.throws(() => flag({ created_by: staff }), /autor|ator/i);
      assert.throws(() => flag({ channel_id: hiddenChannel }), /acesso|canal/i);
      assert.throws(() => call('flag_ai_message', { ...scope, sent_id: sent, category: 'other' }, other), /acesso/i);
      assert.throws(() => call('flag_ai_message', { ...scope, sent_id: sent, category: 'other' }, admin, foreign), /acesso/i);
      for (const table of ['crm_ia_notification_snapshots', 'crm_ia_notification_reads', 'crm_ia_ai_message_flags']) assert.throws(() => sql(`BEGIN;SET LOCAL ROLE authenticated;SELECT * FROM planeje_private.${table};ROLLBACK;`), /permission denied/i);
    });
    await t.test('manual, lembrete, notification, uncertain e sender_kind isolado não provam IA', () => {
      for (const [key, status] of [['manual', 'sent'], ['reminder', 'sent'], ['notification', 'sent'], ['reply', 'uncertain']]) {
        sql(`ALTER TABLE crm_ia_outbox DISABLE TRIGGER USER;UPDATE crm_ia_outbox SET kind='${key}',status='${status}' WHERE id='${outbox}';ALTER TABLE crm_ia_outbox ENABLE TRIGGER USER;`);
        assert.equal(call('messages', scope).rows.find(r => r.id === sent).can_flag, false);
        assert.throws(() => flag(), /resposta|enviada|IA/i);
      }
      sql(`UPDATE crm_ia_outbox SET kind='reply',status='sent',provider_message_id='outro-provider' WHERE id='${outbox}'`);
      assert.throws(() => flag(), /resposta|enviada|IA/i);
      sql(`UPDATE crm_ia_outbox SET provider_message_id='provider-fixture' WHERE id='${outbox}';UPDATE planeje_private.crm_ia_agent_runs SET channel_id='${hiddenChannel}' WHERE id='${runId}'`);
      assert.throws(() => flag(), /resposta|enviada|IA/i);
      sql(`UPDATE planeje_private.crm_ia_agent_runs SET channel_id='${channel}' WHERE id='${runId}'`);
      sql(`INSERT INTO cliente_whatsapp_sent(id,cliente_id,whatsapp_config_id,to_jid,body,message_id,sender_kind) VALUES('${id(704)}','${client}','${channel}','551199999999@s.whatsapp.net','Manual com remetente forjado','provider-manual','automation')`);
      assert.equal(call('messages', scope).rows.find(r => r.id === id(704)).can_flag, false);
      assert.throws(() => flag({ sent_id: id(704) }), /resposta|enviada|IA/i);
      sql(`UPDATE crm_ia_outbox SET kind='followup' WHERE id='${outbox}';UPDATE planeje_private.crm_ia_agent_runs SET mode='followup' WHERE id='${runId}'`);
      assert.equal(call('messages', scope).rows.find(r => r.id === sent).can_flag, true);
      assert.equal(flag({ category: 'too_long', note: 'Alterada' }).category, 'too_long');
      sql(`UPDATE crm_ia_outbox SET kind='reply' WHERE id='${outbox}';UPDATE planeje_private.crm_ia_agent_runs SET mode='responder' WHERE id='${runId}'`);
    });
    await t.test('sent gravável pelas políticas legadas não permite forjar a prova da resposta', async t => {
      sql(`ALTER TABLE cliente_whatsapp_sent ADD COLUMN conversation_id uuid;ALTER TABLE cliente_whatsapp_sent ENABLE ROW LEVEL SECURITY;
        CREATE FUNCTION public.atendimento_user_can_access_conversation(uuid) RETURNS boolean LANGUAGE sql STABLE AS $$SELECT false$$;
        CREATE TABLE public.cliente_atend_membros(user_id uuid,cliente_id uuid,nivel text,ativo boolean,setor_ids uuid[] DEFAULT '{}');
        GRANT SELECT ON public.profiles TO authenticated;GRANT SELECT,INSERT,UPDATE,DELETE ON public.cliente_whatsapp_sent TO authenticated;`);
      const scopePolicy = readFileSync(new URL('../../supabase/migrations/20260701120000_atendimento_scope_inbox_access.sql', import.meta.url), 'utf8');
      sql(scopePolicy.match(/CREATE POLICY "cliente_whatsapp_sent_admin_colaborador"[\s\S]*?;/)[0]);
      const contactPolicy = readFileSync(new URL('../../supabase/migrations/20260928230000_cliente_atend_inbox.sql', import.meta.url), 'utf8');
      for (const [name, next] of [['cliente_atend_nivel_de', 'create or replace function public.cliente_atend_nivel('], ['cliente_atend_uid_restrito', 'create or replace function public.cliente_atend_pode_ver_contato_de'], ['cliente_atend_pode_ver_contato_de', 'create or replace function public.cliente_atend_pode_ver_contato('], ['cliente_atend_pode_ver_contato', 'create or replace function public.cliente_atend_contato_por_jid'], ['cliente_atend_contato_por_jid', '-- Guarda de membros']]) {
        const start = contactPolicy.indexOf('create or replace function public.' + name + '('), end = contactPolicy.indexOf(next, start + 1);
        assert.ok(start >= 0 && end > start, name); sql(contactPolicy.slice(start, end));
      }
      sql(contactPolicy.match(/create policy cliente_atend_restrito_sent[\s\S]*?;/)[0]);
      const write = statement => sql(`BEGIN;SET LOCAL ROLE authenticated;SET LOCAL test.uid='${staff}';${statement};COMMIT;`);
      const eligible = key => call('messages', scope, staff).rows.find(row => row.id === key)?.can_flag;
      await t.test('UPDATE autenticado com corpo falso perde can_flag e a mutação é recusada', () => {
        try {
          write(`UPDATE cliente_whatsapp_sent SET body='Corpo alterado pelo usuário' WHERE id='${sent}'`);
          assert.equal(sql(`SELECT body FROM cliente_whatsapp_sent WHERE id='${sent}'`), 'Corpo alterado pelo usuário');
          assert.equal(eligible(sent), false); assert.throws(() => flag({ category: 'other' }, staff), /42501/);
        } finally { write(`UPDATE cliente_whatsapp_sent SET body='Resposta sintética' WHERE id='${sent}'`); }
      });
      for (const [key, body] of [[id(705), 'Texto falso com recibo real'], [id(706), 'Resposta sintética']]) await t.test(`INSERT autenticado de ${key === id(705) ? 'corpo falso' : 'duplicata idêntica'} não ganha uma avaliação independente`, () => {
        try {
          write(`INSERT INTO cliente_whatsapp_sent(id,cliente_id,whatsapp_config_id,to_jid,chat_jid,body,message_id,sender_kind) VALUES('${key}','${client}','${channel}','551199999999@s.whatsapp.net','551199999999@s.whatsapp.net','${body}','provider-fixture','automation')`);
          assert.equal(eligible(key), false); assert.equal(eligible(sent), false);
          assert.throws(() => flag({ sent_id: key, category: 'other' }, staff), /42501/);
        } finally { write(`DELETE FROM cliente_whatsapp_sent WHERE id='${key}'`); }
      });
      await t.test('UPDATE de outra linha para duplicar provider e corpo também é ambíguo', () => {
        try {
          write(`UPDATE cliente_whatsapp_sent SET message_id='provider-fixture',body='Resposta sintética' WHERE id='${id(704)}'`);
          assert.equal(eligible(id(704)), false); assert.equal(eligible(sent), false);
          assert.throws(() => flag({ sent_id: id(704), category: 'other' }, staff), /42501/);
        } finally { write(`UPDATE cliente_whatsapp_sent SET message_id='provider-manual',body='Manual com remetente forjado' WHERE id='${id(704)}'`); }
      });
      await t.test('recibo único com corpo espelhado de voz continua elegível e preserva mídia', () => {
        try {
          sql(`UPDATE crm_ia_outbox SET voice_status='ready' WHERE id='${outbox}';INSERT INTO planeje_private.crm_ia_voice_deliveries(outbox_id,claim_token,settings,status,descriptor) VALUES('${outbox}','${id(707)}','{}','ready','{"media_type":"ptt","caption":"Resposta sintética"}')`);
          const message = call('messages', scope, staff).rows.find(row => row.id === sent);
          assert.equal(message.can_flag, true); assert.equal(message.voice_synthetic, true); assert.equal(message.media_type, 'ptt');
          assert.equal(flag({ category: 'off_topic', note: 'Pessoa diferente' }, staff).sent_id, sent);
        } finally { sql(`UPDATE crm_ia_outbox SET voice_status='off' WHERE id='${outbox}';DELETE FROM planeje_private.crm_ia_voice_deliveries WHERE outbox_id='${outbox}'`); }
      });
      await t.test('provider igual em outro cliente ou canal não torna o recibo atual ambíguo', () => {
        try {
          sql(`INSERT INTO cliente_whatsapp_config(id,cliente_id,name) VALUES('${id(708)}','${foreign}','Canal estrangeiro sintético');
            INSERT INTO cliente_whatsapp_sent(id,cliente_id,whatsapp_config_id,to_jid,body,message_id,sender_kind) VALUES('${id(709)}','${foreign}','${id(708)}','551199999999@s.whatsapp.net','Resposta sintética','provider-fixture','automation'),('${id(710)}','${client}','${hiddenChannel}','551199999999@s.whatsapp.net','Resposta sintética','provider-fixture','automation')`);
          assert.equal(eligible(sent), true);
        } finally { sql(`DELETE FROM cliente_whatsapp_sent WHERE id IN('${id(709)}','${id(710)}');DELETE FROM cliente_whatsapp_config WHERE id='${id(708)}'`); }
      });
      assert.throws(() => write(`UPDATE crm_ia_outbox SET body='forjado' WHERE id='${outbox}'`), /permission denied/i);
      assert.equal(eligible(sent), true);
    });
    await t.test('handler real reserva texto imediato, aceita retry pendente e não despacha novamente após sent', async () => {
      const requestId = id(802), payloads = []; let dispatched = 0;
      async function invoke(body = 'Texto imediato sintético') {
        return handleCrmIaMessage({ req: new Request('https://fixture.invalid/crm-ia', { method: 'POST', headers: { Authorization: 'Bearer fixture', 'Content-Type': 'application/json' }, body: JSON.stringify({ cliente_id: client, ...scope, body, request_id: requestId }) }),
          makeCaller: () => ({ auth: { getUser: async () => ({ data: { user: { id: staff } } }) }, rpc: async (_name, args) => {
            payloads.push(args.p_payload);
            try { return { data: call(args.p_action, args.p_payload, staff), error: null }; }
            catch (error) { return { data: null, error: { code: /42501/.test(error.message) ? '42501' : /40001/.test(error.message) ? '40001' : '22023', message: error.message } }; }
          } }), db: {}, send: () => assert.fail('Nenhum transporte real no teste'), dispatch: async ({ ids }) => {
            dispatched++;
            if (dispatched === 1) return { results: [{ id: ids[0], status: 'pending' }] };
            sql(`UPDATE crm_ia_outbox SET status='sent',provider_message_id='immediate-fixture',sent_at=clock_timestamp() WHERE id='${ids[0]}'`);
            return { results: [{ id: ids[0], status: 'sent' }] };
          } });
      }
      const first = await invoke(); assert.equal(first.status, 202, await first.clone().text());
      const reservation = await first.json(), state = sql('SELECT to_jsonb(c) FROM cliente_atend_conversas c');
      await new Promise(resolve => setTimeout(resolve, 25));
      const pendingRetry = await invoke(); assert.equal(pendingRetry.status, 200); assert.equal((await pendingRetry.json()).id, reservation.id);
      const sentRetry = await invoke(); assert.equal(sentRetry.status, 200); assert.deepEqual(await sentRetry.json(), { id: reservation.id, status: 'sent' });
      assert.equal(dispatched, 2); assert.equal(payloads.every(payload => !Object.hasOwn(payload, 'scheduled_at')), true);
      assert.equal(sql(`SELECT count(*) FROM crm_ia_outbox WHERE request_id='${requestId}'`), '1');
      assert.equal(sql('SELECT to_jsonb(c) FROM cliente_atend_conversas c'), state);
      const changed = await invoke('Outro texto com a mesma chave'); assert.equal(changed.status, 409); assert.equal(dispatched, 2);
      assert.throws(() => call('schedule_message', { ...scope, body: 'Fora da tolerância legada', scheduled_at: new Date(Date.now() - 130000).toISOString(), request_id: id(803) }), /22023/);
    });
    await t.test('produtor LIVE04 e rollback de runtime mantêm SQL15 compatível sem transporte real', async t => {
      const legacySource = readFileSync(new URL('./fixtures/message-live04.js', import.meta.url));
      assert.equal(createHash('sha256').update(legacySource).digest('hex'), '83e65cdd90d0214fc310adfea8ec3bf80764c79ff3b72863bbcedb9181f10f60');
      const bundled = join(work, 'message-live04.mjs');
      await build({ stdin: { contents: legacySource.toString(), resolveDir: fileURLToPath(new URL('../../supabase/functions/crm-ia/', import.meta.url)), sourcefile: 'message-live04.js' }, bundle: true, platform: 'node', format: 'esm', outfile: bundled });
      const legacyHandler = (await import(pathToFileURL(bundled).href)).handleCrmIaMessage;
      for (const [index, scenario] of [['legado após migration, antes de runtime', legacyHandler, legacyHandler], ['rollback simulado: novo antes, LIVE04 depois', handleCrmIaMessage, legacyHandler]].entries()) await t.test(scenario[0], async () => {
        const requestId = id(810 + index), payloads = []; let dispatched = 0;
        async function invoke(handler, text = 'Compatibilidade sintética') {
          return handler({ req: new Request('https://fixture.invalid/crm-ia', { method: 'POST', headers: { Authorization: 'Bearer fixture', 'Content-Type': 'application/json' }, body: JSON.stringify({ cliente_id: client, ...scope, body: text, request_id: requestId }) }),
            makeCaller: () => ({ auth: { getUser: async () => ({ data: { user: { id: staff } } }) }, rpc: async (_name, args) => {
              payloads.push(args.p_payload);
              try { return { data: call(args.p_action, args.p_payload, staff), error: null }; }
              catch (error) { return { error: { code: /42501/.test(error.message) ? '42501' : '40001', message: error.message } }; }
            } }), db: {}, send: () => assert.fail('Transporte real proibido na simulação de rollback'), dispatch: async ({ ids }) => {
              dispatched++; return { results: [{ id: ids[0], status: 'pending' }] };
            } });
        }
        const first = await invoke(scenario[1]); assert.equal(first.status, 202, await first.clone().text());
        const receipt = await first.json(), before = sql(`SELECT to_jsonb(o) FROM crm_ia_outbox o WHERE id='${receipt.id}'`), state = sql('SELECT to_jsonb(c) FROM cliente_atend_conversas c');
        await new Promise(resolve => setTimeout(resolve, 25));
        const pending = await invoke(scenario[2]); assert.equal(pending.status, 202, await pending.clone().text()); assert.deepEqual(await pending.json(), { id: receipt.id, status: 'pending' });
        assert.equal(sql(`SELECT to_jsonb(o) FROM crm_ia_outbox o WHERE id='${receipt.id}'`), before); assert.equal(sql('SELECT to_jsonb(c) FROM cliente_atend_conversas c'), state);
        const original = JSON.parse(before);
        assert.equal(payloads[1].scheduled_at !== payloads[0].scheduled_at, true, 'producer04 generates a fresh timestamp on retry');
        for (const status of ['sent', 'uncertain', 'cancelled']) {
          sql(`UPDATE crm_ia_outbox SET status='${status}' WHERE id='${receipt.id}'`);
          const replay = await invoke(scenario[2]); assert.deepEqual(await replay.json(), { id: receipt.id, status }); assert.equal(dispatched, 2);
          assert.equal(sql(`SELECT scheduled_at='${original.scheduled_at}'::timestamptz FROM crm_ia_outbox WHERE id='${receipt.id}'`), 't');
        }
        const changed = await invoke(scenario[2], 'Corpo alterado com a mesma chave'); assert.equal(changed.status, 409); assert.equal(dispatched, 2);
        assert.equal(sql(`SELECT count(*) FROM crm_ia_outbox WHERE request_id='${requestId}'`), '1');
        assert.equal(sql('SELECT to_jsonb(c) FROM cliente_atend_conversas c'), state);
      });
      await t.test('passado recente é imediato legado; fora da janela recusa; igualdade tardia é somente recibo', () => {
        const payload = { ...scope, body: 'Compatibilidade explícita', scheduled_at: new Date(Date.now() - 1000).toISOString(), request_id: id(812) };
        const saved = call('schedule_message', payload, staff);
        const before = sql(`SELECT to_jsonb(o) FROM crm_ia_outbox o WHERE id='${saved.id}'`), state = sql('SELECT to_jsonb(c) FROM cliente_atend_conversas c');
        assert.equal(call('schedule_message', { ...payload, scheduled_at: new Date(Date.now() - 500).toISOString() }, staff).id, saved.id);
        assert.equal(sql(`SELECT to_jsonb(o) FROM crm_ia_outbox o WHERE id='${saved.id}'`), before);
        assert.throws(() => call('schedule_message', { ...payload, scheduled_at: new Date(Date.now() - 130000).toISOString() }, staff), /40001/);
        sql(`UPDATE crm_ia_outbox SET scheduled_at=clock_timestamp()-interval '1 day',status='sent' WHERE id='${saved.id}'`);
        const aged = JSON.parse(sql(`SELECT to_jsonb(o) FROM crm_ia_outbox o WHERE id='${saved.id}'`));
        assert.equal(call('schedule_message', { ...payload, scheduled_at: aged.scheduled_at }, staff).id, saved.id);
        assert.equal(call('schedule_message', { ...payload, scheduled_at: new Date(Date.now() - 1000).toISOString() }, staff).status, 'sent');
        assert.deepEqual(JSON.parse(sql(`SELECT to_jsonb(o) FROM crm_ia_outbox o WHERE id='${saved.id}'`)), aged);
        assert.equal(sql('SELECT to_jsonb(c) FROM cliente_atend_conversas c'), state);
        assert.throws(() => call('schedule_message', { ...payload, request_id: id(813), scheduled_at: new Date(Date.now() - 130000).toISOString() }, staff), /22023/);
      });
      await t.test('alias legado não antecipa futuro, não atravessa ACL e não reinterpreta mídia como texto', () => {
        const future = { ...scope, body: 'Somente no futuro', scheduled_at: new Date(Date.now() + 3600000).toISOString(), request_id: id(814) };
        const item = call('schedule_message', future, staff), before = sql(`SELECT to_jsonb(o) FROM crm_ia_outbox o WHERE id='${item.id}'`);
        assert.throws(() => call('schedule_message', { ...future, scheduled_at: new Date(Date.now() - 1000).toISOString() }, staff), /40001/);
        assert.throws(() => call('schedule_message', { ...future, channel_id: hiddenChannel }, staff), /42501/);
        assert.equal(sql(`SELECT to_jsonb(o) FROM crm_ia_outbox o WHERE id='${item.id}'`), before);
        const media = { ...scope, body: 'Legenda sintética', request_id: id(815), media_descriptor: { hash: 'a'.repeat(64), media_type: 'document', size: 4, file_name: 'fixture.txt', mimetype: 'text/plain', caption: 'Legenda sintética' } };
        const prepared = call('prepare_media', media, staff);
        assert.throws(() => call('schedule_message', { ...scope, body: media.body, request_id: media.request_id, scheduled_at: new Date(Date.now() - 1000).toISOString() }, staff), /40001/);
        assert.equal(sql(`SELECT count(*) FROM crm_ia_outbox WHERE id='${prepared.id}'`), '1');
      });
    });
    await t.test('mesmo request_id com outro horário é conflito e replay não altera conversa', () => {
      const requestId = id(801), when = new Date(Date.now() + 3600000).toISOString();
      const payload = { ...scope, body: 'Programada sintética', scheduled_at: when, request_id: requestId };
      const first = call('schedule_message', payload), before = sql('SELECT to_jsonb(c) FROM cliente_atend_conversas c');
      assert.equal(call('schedule_message', payload).id, first.id); assert.equal(sql('SELECT to_jsonb(c) FROM cliente_atend_conversas c'), before);
      assert.throws(() => call('schedule_message', { ...payload, scheduled_at: new Date(Date.parse(when) + 60000).toISOString() }), /40001/);
      assert.equal(sql(`SELECT count(*) FROM crm_ia_outbox WHERE request_id='${requestId}'`), '1');
    });
    await t.test('flag revalida autor e canal depois de aguardar lock', async () => {
      for (const mutation of [`UPDATE profiles SET status='inactive' WHERE id='${staff}'`, `UPDATE cliente_whatsapp_config SET archived_at=now() WHERE id='${channel}'`, `UPDATE cliente_atend_conversas SET privado=true,assigned_to='${admin}' WHERE contact_id='${contact}'`]) {
        const blocker = connection(), worker = connection(), before = sql('SELECT to_jsonb(f) FROM planeje_private.crm_ia_ai_message_flags f ORDER BY actor_id');
        try {
          await blocker.query(`BEGIN;SELECT pg_advisory_xact_lock(hashtextextended('crm-ia:${client}',0));`);
          const pending = worker.query(`SET application_name='crm_flag_revoke';BEGIN;SET LOCAL ROLE authenticated;SET LOCAL test.uid='${staff}';SELECT public.crm_ia_workspace('flag_ai_message','${client}',${quote({ ...scope, sent_id: sent, category: 'other' })});COMMIT;`).catch(() => null);
          let blocked = false;
          for (let n = 0; n < 100 && !blocked; n++) { blocked = await blocker.query("SELECT pg_stat_clear_snapshot();SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='crm_flag_revoke' AND wait_event_type='Lock')") === 't'; if (!blocked) await new Promise(resolve => setTimeout(resolve, 10)); }
          assert.equal(blocked, true, worker.stderr);
          await blocker.query(`${mutation};COMMIT;`);
          worker.process.stdin.end(); await pending; const outcome = await worker.done; assert.notEqual(outcome.code, 0); assert.match(outcome.stderr, /acesso|indisponível/i);
          assert.equal(sql('SELECT to_jsonb(f) FROM planeje_private.crm_ia_ai_message_flags f ORDER BY actor_id'), before);
        } finally { blocker.process.stdin.end('ROLLBACK;\n'); worker.process.stdin.end(); await Promise.all([blocker.done, worker.done]); sql(`UPDATE profiles SET status='active' WHERE id='${staff}';UPDATE cliente_whatsapp_config SET archived_at=NULL WHERE id='${channel}';UPDATE cliente_atend_conversas SET privado=false,assigned_to='${staff}' WHERE contact_id='${contact}'`); }
      }
    });
    await t.test('duas edições concorrentes da mesma versão não sobrescrevem a primeira sinalização', async () => {
      const before = call('messages', scope).rows.find(r => r.id === sent).my_flag, blocker = connection(), worker = connection();
      const changed = { ...scope, sent_id: sent, category: 'incorrect_information', note: 'Primeiro escritor', expected_updated_at: before.updated_at };
      try {
        await blocker.query(`BEGIN;SET LOCAL ROLE authenticated;SET LOCAL test.uid='${admin}';SELECT public.crm_ia_workspace('flag_ai_message','${client}',${quote(changed)});`);
        const pending = worker.query(`SET application_name='crm_flag_cas';BEGIN;SET LOCAL ROLE authenticated;SET LOCAL test.uid='${admin}';SELECT public.crm_ia_workspace('flag_ai_message','${client}',${quote({ ...changed, category: 'wrong_tool', note: 'Segundo escritor' })});COMMIT;`).catch(() => null);
        const observer = connection();
        try {
          let blocked = false;
          for (let n = 0; n < 100 && !blocked; n++) { blocked = await observer.query("SELECT pg_stat_clear_snapshot();SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='crm_flag_cas' AND wait_event_type='Lock')") === 't'; if (!blocked) await new Promise(resolve => setTimeout(resolve, 10)); }
          assert.equal(blocked, true, worker.stderr);
        } finally { observer.process.stdin.end(); await observer.done; }
        await blocker.query('COMMIT;'); worker.process.stdin.end(); await pending;
        const outcome = await worker.done; assert.notEqual(outcome.code, 0); assert.match(outcome.stderr, /40001/);
        assert.equal(call('messages', scope).rows.find(r => r.id === sent).my_flag.note, 'Primeiro escritor');
      } finally { blocker.process.stdin.end('ROLLBACK;\n'); worker.process.stdin.end(); await Promise.all([blocker.done, worker.done]); }
    });
  } finally { if (started) run('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop']); rmSync(work, { recursive: true, force: true }); }
});

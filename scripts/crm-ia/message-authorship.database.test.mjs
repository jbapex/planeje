import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const work = mkdtempSync('/tmp/crm-message-authorship-'), data = join(work, 'data');
const env = { PATH: process.env.PATH, LC_ALL: 'C' };
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const context = Object.fromEntries(['admin', 'staff', 'other', 'client', 'foreign', 'channel', 'hiddenChannel', 'contact'].map((key, index) => [key, id([1, 2, 3, 11, 12, 21, 22, 31][index])]));
const { admin, staff, other, client, foreign, channel, hiddenChannel, contact } = context;
const scope = { contact_id: contact, channel_id: channel };
const sent = id(701), outbox = id(702), aiSent = id(711), aiOutbox = id(712), runId = id(713), otherContact = id(32), foreignContact = id(33), foreignChannel = id(23);
const contactAvatar = 'https://fixture.invalid/contact.png', userAvatar = 'https://fixture.invalid/staff.png';
const quote = value => `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
const psql = ['-X', '-Aqt', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose', '-h', work, '-p', '55618', '-U', 'message_authorship_qa', '-d', 'postgres'];
function run(binary, args, input) {
  const result = spawnSync(binary, args, { input, env, encoding: 'utf8', timeout: 25000 });
  if (result.error || result.status !== 0) throw Error(result.stderr?.trim() || result.error?.message || result.stdout);
  return result.stdout.trim();
}
const sql = input => run('psql', psql, input);
const call = (action = 'messages', payload = scope, actor = admin, target = client) => JSON.parse(sql(`BEGIN READ ONLY;SET LOCAL ROLE authenticated;SET LOCAL test.uid='${actor}';SELECT public.crm_ia_workspace('${action}','${target}',${quote(payload)});COMMIT;`));
const message = key => call().rows.find(row => row.id === key);
const published = ['20261111041703_crm_ia_delivery_runtime.sql', '20261111041704_crm_ia_workspace.sql', '20261111043800_crm_ia_workspace_readings.sql', '20261111044652_crm_ia_agent_runtime.sql', '20261111062101_crm_ia_calendar.sql', '20261111062548_crm_ia_voice.sql', '20261111072502_crm_ia_calendar_delivery.sql', '20261111075558_crm_ia_agent_template_contract.sql', '20261111090001_crm_ia_appointment_actions.sql', '20261111090002_crm_ia_agent_drafts_voice_modes.sql', '20261111090003_crm_ia_lead_tags.sql', '20261111101501_crm_ia_lead_profiles.sql', '20261111101502_crm_ia_lead_reads.sql', '20261111120001_crm_ia_internal_notifications.sql', '20261111120002_crm_ia_conversation_controls.sql', '20261111162400_crm_ia_conversation_read_performance.sql'];

test('autoria das mensagens usa recibo histórico e fotos dentro do escopo autorizado', async t => {
  let started = false;
  const previousFetch = globalThis.fetch;
  globalThis.fetch = () => { throw Error('Rede externa proibida nesta fixture.'); };
  try {
    run('initdb', ['-D', data, '-U', 'message_authorship_qa', '--auth-local=trust', '--auth-host=reject', '--no-locale', '--encoding=UTF8']);
    run('pg_ctl', ['-D', data, '-l', join(work, 'pg.log'), '-o', `-k ${work} -p 55618 -c listen_addresses='' -c unix_socket_permissions=0700`, '-w', 'start']);
    started = true;
    assert.equal(sql('SHOW listen_addresses'), '');
    const fixture = readFileSync(new URL('./workspace.database.test.mjs', import.meta.url), 'utf8').split('    sql(`')[1].split('    `);')[0].replace(/\$\{(\w+)\}/g, (_, key) => context[key]);
    sql(fixture.replace(/      CREATE TABLE public\.crm_ia_outbox\([^\n]+\n/, ''));
    sql(`CREATE SCHEMA planeje_private;CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid);
      CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT jsonb_build_object('sub',auth.uid())$$;
      ALTER TABLE profiles ADD COLUMN avatar_url text;
      ALTER TABLE cliente_whatsapp_contact ADD COLUMN last_message_at timestamptz,ADD COLUMN origin_source text DEFAULT 'nao_identificado',ADD COLUMN qualificado boolean,ADD COLUMN profile_pic_url text;
      ALTER TABLE cliente_whatsapp_sent ADD COLUMN sent_by uuid;
      ALTER TABLE leads ADD COLUMN qualificado boolean;ALTER TABLE cliente_atend_conversas ADD COLUMN ia_followup_passo integer DEFAULT 0;
      CREATE TABLE atendimento_conversas(id uuid PRIMARY KEY,cliente_id uuid,whatsapp_config_id uuid,chat_jid text,archived_at timestamptz,bloqueada boolean DEFAULT false);
      CREATE TABLE atendimento_conversa_planejamento(id uuid PRIMARY KEY,cliente_id uuid,conversation_id uuid,whatsapp_config_id uuid,chat_jid text,kind text,body text,status text,scheduled_at timestamptz,completed_at timestamptz,error_message text,updated_at timestamptz DEFAULT now());
      GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;`);
    for (const file of published) sql(readFileSync(new URL(`../../supabase/migrations/${file}`, import.meta.url), 'utf8'));
    const wrapperMetadata = name => JSON.parse(sql(`SELECT jsonb_build_object('owner',pg_get_userbyid(proowner),'definer',prosecdef,'config',proconfig,'args',pg_get_function_arguments(oid),'auth',has_function_privilege('authenticated',oid,'EXECUTE'),'anon',has_function_privilege('anon',oid,'EXECUTE'),'service',has_function_privilege('service_role',oid,'EXECUTE')) FROM pg_proc WHERE oid='public.${name}(text,uuid,jsonb)'::regprocedure`));
    const beforeMetadata = wrapperMetadata('crm_ia_workspace');
    const candidate = readdirSync(new URL('../../supabase/migrations/', import.meta.url)).filter(file => /^\d+_crm_ia_message_authorship\.sql$/.test(file));
    for (const file of candidate) sql(readFileSync(new URL(`../../supabase/migrations/${file}`, import.meta.url), 'utf8'));
    sql(`UPDATE profiles SET full_name='Pessoa remetente',avatar_url='${userAvatar}' WHERE id='${staff}';UPDATE profiles SET avatar_url='https://fixture.invalid/current.png' WHERE id='${admin}';
      UPDATE cliente_whatsapp_contact SET profile_pic_url='${contactAvatar}',mini_crm='{"contato_nome":"Contato autorizado"}' WHERE id='${contact}';
      INSERT INTO cliente_atend_conversas(cliente_id,contact_id,status,ia_pausada,assigned_to) VALUES('${client}','${contact}','esperando',true,'${admin}');
      INSERT INTO cliente_whatsapp_config(id,cliente_id,name) VALUES('${foreignChannel}','${foreign}','Canal alheio');
      INSERT INTO cliente_whatsapp_contact(id,cliente_id,from_jid,sender_name,profile_pic_url) VALUES('${otherContact}','${client}','551188888888@s.whatsapp.net','Outro contato','https://fixture.invalid/other-contact.png'),('${foreignContact}','${foreign}','551177777777@s.whatsapp.net','Contato alheio','https://fixture.invalid/foreign-contact.png');
      INSERT INTO crm_ia_outbox(id,cliente_id,whatsapp_config_id,contact_id,kind,body,scheduled_at,status,request_id,created_by,provider_message_id) VALUES('${outbox}','${client}','${channel}','${contact}','manual','Envio humano sintético',now(),'sent','${id(703)}','${staff}','human-receipt');
      INSERT INTO cliente_whatsapp_sent(id,cliente_id,whatsapp_config_id,to_jid,chat_jid,body,message_id,sender_kind,sent_by) VALUES('${sent}','${client}','${channel}','551199999999@s.whatsapp.net','551199999999@s.whatsapp.net','Envio humano sintético','human-receipt','human','${staff}');`);

    await t.test('recebida e estado/lista usam foto do contato autorizado e mantêm paginação', () => {
      const result = call(), incoming = result.rows.find(row => !row.from_me);
      assert.equal(incoming.sender_kind, 'contact');assert.equal(incoming.sender_name, 'Contato autorizado');assert.equal(incoming.avatar_url, contactAvatar);
      assert.equal(result.state.profile_pic_url, contactAvatar);
      const list = call('conversations', { ...scope, limit: 1 });
      assert.equal(list.rows.length, 1);assert.equal(list.rows[0].profile_pic_url, contactAvatar);
      const first = call('messages', { ...scope, offset: 0, limit: 1 }), second = call('messages', { ...scope, offset: 1, limit: 1 });
      assert.equal(first.total, result.total);assert.equal(second.total, result.total);assert.notEqual(first.rows[0].id, second.rows[0].id);
    });
    await t.test('humano vem do recibo/ator histórico, preservado mesmo após trocar atendente ou inativar remetente', () => {
      const row = message(sent);
      assert.equal(row.sender_kind, 'human');assert.equal(row.sender_name, 'Pessoa remetente');assert.equal(row.avatar_url, userAvatar);assert.equal(row.can_flag, false);
      sql(`UPDATE profiles SET status='inactive' WHERE id='${staff}';UPDATE cliente_atend_conversas SET assigned_to='${staff}' WHERE contact_id='${contact}'`);
      try { assert.equal(message(sent).sender_name, 'Pessoa remetente');assert.equal(message(sent).avatar_url, userAvatar); }
      finally { sql(`UPDATE profiles SET status='active' WHERE id='${staff}';UPDATE cliente_atend_conversas SET assigned_to='${admin}' WHERE contact_id='${contact}'`); }
    });
    await t.test('sent_by e sender_kind isolados não atribuem um usuário nem promovem automação a IA', () => {
      sql(`UPDATE cliente_whatsapp_sent SET sent_by='${admin}' WHERE id='${sent}'`);
      try { const row = message(sent);assert.equal(row.sender_kind, 'unknown');assert.equal(row.sender_name, null);assert.equal(row.avatar_url, null); }
      finally { sql(`UPDATE cliente_whatsapp_sent SET sent_by='${staff}' WHERE id='${sent}'`); }
      sql(`INSERT INTO cliente_whatsapp_sent(id,cliente_id,whatsapp_config_id,to_jid,body,message_id,sender_kind,sent_by) VALUES('${id(720)}','${client}','${channel}','551199999999@s.whatsapp.net','Legado manual','legacy-manual','human','${staff}'),('${id(721)}','${client}','${channel}','551199999999@s.whatsapp.net','Legado automático','legacy-auto','automation',NULL)`);
      assert.equal(message(id(720)).sender_kind, 'unknown');assert.equal(message(id(720)).sender_name, null);assert.equal(message(id(720)).avatar_url, null);
      assert.equal(message(id(721)).sender_kind, 'automation');assert.equal(message(id(721)).sender_name, 'Automação');assert.equal(message(id(721)).can_flag, false);assert.equal(message(id(721)).avatar_url, null);
    });
    await t.test('corpo ou recibo/cliente/canal/contato divergente não emprestam autoria humana', () => {
      for (const patch of [`body='Corpo adulterado'`, `provider_message_id='outro-recibo'`, `cliente_id='${foreign}',whatsapp_config_id='${foreignChannel}',contact_id='${foreignContact}'`, `whatsapp_config_id='${hiddenChannel}'`, `contact_id='${otherContact}'`, `status='uncertain'`]) {
        sql(`UPDATE crm_ia_outbox SET ${patch} WHERE id='${outbox}'`);
        try { const row = message(sent);assert.equal(row.sender_kind, 'unknown', patch);assert.equal(row.sender_name, null);assert.equal(row.avatar_url, null); }
        finally { sql(`UPDATE crm_ia_outbox SET body='Envio humano sintético',provider_message_id='human-receipt',cliente_id='${client}',whatsapp_config_id='${channel}',contact_id='${contact}',status='sent' WHERE id='${outbox}'`); }
      }
    });
    await t.test('duplicata na sent ou dois recibos válidos deixam a autoria desconhecida', () => {
      sql(`INSERT INTO cliente_whatsapp_sent(id,cliente_id,whatsapp_config_id,to_jid,body,message_id,sender_kind,sent_by) VALUES('${id(722)}','${client}','${channel}','551199999999@s.whatsapp.net','Envio humano sintético','human-receipt','human','${staff}')`);
      try { assert.equal(message(sent).sender_kind, 'unknown');assert.equal(message(id(722)).sender_kind, 'unknown'); }
      finally { sql(`DELETE FROM cliente_whatsapp_sent WHERE id='${id(722)}'`); }
      sql(`INSERT INTO crm_ia_outbox(id,cliente_id,whatsapp_config_id,contact_id,kind,body,scheduled_at,status,request_id,created_by,provider_message_id) VALUES('${id(723)}','${client}','${channel}','${contact}','manual','Envio humano sintético',now(),'sent','${id(724)}','${staff}','human-receipt')`);
      try {
        assert.equal(message(sent).sender_kind, 'unknown');assert.equal(message(sent).avatar_url, null);
        sql(`UPDATE crm_ia_outbox SET created_by='${admin}' WHERE id='${id(723)}'`);
        assert.equal(message(sent).sender_kind, 'unknown', 'dois atores com o mesmo recibo são ambíguos');
        sql(`UPDATE crm_ia_outbox SET body='Outro corpo com recibo duplicado' WHERE id='${id(723)}'`);
        assert.equal(message(sent).sender_kind, 'unknown', 'recibo duplicado não deixa escolher uma versão pelo corpo');
      }
      finally { sql(`DELETE FROM crm_ia_outbox WHERE id='${id(723)}'`); }
    });
    await t.test('IA mantém prova da outbox/run e não usa foto do responsável que autorizou a execução', () => {
      sql(`INSERT INTO crm_pipelines(id,cliente_id,nome) VALUES('${id(41)}','${client}','Funil QA');INSERT INTO crm_stages(id,pipeline_id,nome) VALUES('${id(51)}','${id(41)}','Entrada');
        INSERT INTO leads(id,cliente_id,nome,whatsapp,pipeline_id,stage_id,responsavel_id,crm_ia_contact_id) VALUES('${id(61)}','${client}','Lead QA','551199999999','${id(41)}','${id(51)}','${staff}','${contact}');
        INSERT INTO cliente_atend_ia_agentes(id,cliente_id,nome,instrucoes) VALUES('${id(81)}','${client}','Agente QA','INSTRUCAO_PRIVADA_NAO_EXIBIR');
        INSERT INTO planeje_private.crm_ia_agent_runs(id,cliente_id,channel_id,contact_id,lead_id,agent_id,actor_id,mode,message_id,snapshot,status,result) VALUES('${runId}','${client}','${channel}','${contact}','${id(61)}','${id(81)}','${admin}','responder','inbound-qa','{}','queued','{"queued":true,"outbox_id":"${aiOutbox}"}');
        INSERT INTO crm_ia_outbox(id,cliente_id,whatsapp_config_id,contact_id,lead_id,kind,body,scheduled_at,status,request_id,created_by,agent_run_id,provider_message_id) VALUES('${aiOutbox}','${client}','${channel}','${contact}','${id(61)}','reply','Resposta IA sintética',now(),'sent','${id(714)}','${admin}','${runId}','ai-receipt');
        INSERT INTO cliente_whatsapp_sent(id,cliente_id,whatsapp_config_id,to_jid,body,message_id,sender_kind) VALUES('${aiSent}','${client}','${channel}','551199999999@s.whatsapp.net','Resposta IA sintética','ai-receipt','automation')`);
      const row = message(aiSent);assert.equal(row.sender_kind, 'ai');assert.equal(row.sender_name, 'IA');assert.equal(row.avatar_url, null);assert.equal(row.can_flag, true);assert.equal(row.my_flag, null);
      assert.doesNotMatch(JSON.stringify(call()), /INSTRUCAO_PRIVADA|actor_id|claim_token|snapshot/);
      sql(`UPDATE crm_ia_outbox SET status='uncertain' WHERE id='${aiOutbox}'`);
      try { assert.equal(message(aiSent).sender_kind, 'automation');assert.equal(message(aiSent).can_flag, false); }
      finally { sql(`UPDATE crm_ia_outbox SET status='sent' WHERE id='${aiOutbox}'`); }
    });
    await t.test('ACL continua na leitura base; consulta não altera estado, não amplia roles e esconde o wrapper interno', () => {
      const before = sql('SELECT jsonb_agg(to_jsonb(c) ORDER BY id) FROM cliente_atend_conversas c');
      call();call('conversations', scope);
      assert.equal(sql('SELECT jsonb_agg(to_jsonb(c) ORDER BY id) FROM cliente_atend_conversas c'), before);
      sql(`UPDATE cliente_atend_conversas SET assigned_to='${staff}' WHERE contact_id='${contact}'`);
      try {
        assert.equal(call('workspace', {}, staff).permissions.manage, false);
        const readonly = call('messages', scope, staff).rows.find(row => row.id === sent);
        assert.equal(readonly.sender_name, 'Pessoa remetente');assert.equal(readonly.avatar_url, userAvatar);
      } finally { sql(`UPDATE cliente_atend_conversas SET assigned_to='${admin}' WHERE contact_id='${contact}'`); }
      assert.throws(() => call('messages', { ...scope, channel_id: hiddenChannel }), /42501|acesso/i);
      assert.throws(() => call('messages', { ...scope, channel_id: foreignChannel }), /42501|acesso/i);
      assert.throws(() => call('messages', scope, other), /42501|acesso/i);
      assert.throws(() => call('messages', scope, staff, foreign), /42501|acesso/i);
      sql(`UPDATE cliente_atend_conversas SET privado=true,assigned_to='${admin}' WHERE contact_id='${contact}'`);
      try { assert.throws(() => call('messages', scope, staff), /42501|acesso/i);assert.equal(call('conversations', {}, staff).rows.length, 0); }
      finally { sql(`UPDATE cliente_atend_conversas SET privado=false WHERE contact_id='${contact}'`); }
      assert.deepEqual(wrapperMetadata('crm_ia_workspace'), beforeMetadata);
      assert.throws(() => sql(`BEGIN;SET LOCAL ROLE anon;SELECT public.crm_ia_workspace('messages','${client}',${quote(scope)});ROLLBACK;`), /permission denied/);
      assert.throws(() => sql(`BEGIN;SET LOCAL ROLE authenticated;SELECT public.crm_ia_workspace_pre_message_authorship('messages','${client}',${quote(scope)});ROLLBACK;`), /permission denied/);
      assert.throws(() => sql('BEGIN;SET LOCAL ROLE authenticated;SELECT * FROM crm_ia_outbox;ROLLBACK;'), /permission denied/);
      assert.equal(call('workspace', {}).people.some(person => Object.hasOwn(person, 'avatar_url')), false, 'não ampliar o diretório global');
    });
  } finally {
    globalThis.fetch = previousFetch;
    if (started) run('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop']);
    rmSync(work, { recursive: true, force: true });
  }
});

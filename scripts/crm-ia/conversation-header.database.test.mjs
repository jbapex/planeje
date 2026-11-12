import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const work = mkdtempSync('/tmp/crm-conversation-header-'), data = join(work, 'data');
const env = { PATH: process.env.PATH, LC_ALL: 'C' };
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const context = Object.fromEntries(['admin', 'staff', 'other', 'client', 'foreign', 'channel', 'hiddenChannel', 'contact'].map((key, index) => [key, id([1, 2, 3, 11, 12, 21, 22, 31][index])]));
const { admin, staff, other, client, foreign, channel, hiddenChannel, contact } = context;
const unlinked = id(32), noPhone = id(33), historical = id(34), foreignContact = id(35), foreignChannel = id(23);
const human = id(701), humanOutbox = id(702), ai = id(711), aiOutbox = id(712), runId = id(713);
const scope = { contact_id: contact, channel_id: channel }, period = { since: '2026-11-10', until: '2026-11-10' };
const due = '2026-11-15T15:00:00.000Z', oldDue = '2026-11-20T18:00:00.000Z';
const phone = '551100001111', unlinkedPhone = '+55 (11) 88888-8888', historicalPhone = '5511777777777';
const psql = ['-X', '-Aqt', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose', '-h', work, '-p', '55653', '-U', 'conversation_header_qa', '-d', 'postgres'];
function run(binary, args, input) {
  const result = spawnSync(binary, args, { input, env, encoding: 'utf8', timeout: 25000 });
  if (result.error || result.status !== 0) throw Error(result.stderr?.trim() || result.error?.message || result.stdout);
  return result.stdout.trim();
}
const sql = statement => run('psql', psql, statement);
const quote = value => `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
const read = (action, payload = {}, actor = admin, target = client) => JSON.parse(sql(`BEGIN READ ONLY;SET LOCAL ROLE authenticated;SET LOCAL test.uid='${actor}';SELECT public.crm_ia_workspace('${action}','${target}',${quote(payload)});COMMIT;`));
const metadata = signature => JSON.parse(sql(`SELECT jsonb_build_object('oid',oid,'owner',proowner,'language',prolang,'definer',prosecdef,'volatile',provolatile,'strict',proisstrict,'parallel',proparallel,'leakproof',proleakproof,'cost',procost,'rows',prorows,'config',proconfig,'acl',proacl::text,'arguments',pg_get_function_arguments(oid),'result',pg_get_function_result(oid),'body_md5',md5(prosrc)) FROM pg_proc WHERE oid='${signature}'::regprocedure`));
const helpers = () => JSON.parse(sql(`SELECT jsonb_object_agg(n.nspname||'.'||p.proname,md5(p.prosrc)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname IN('crm_ia_role','crm_ia_client','crm_ia_contact','crm_ia_lead','crm_ia_channel','crm_ia_read','crm_ia_ai_message_source','crm_ia_conversation_rows')`));
const published = ['20261111041703_crm_ia_delivery_runtime.sql', '20261111041704_crm_ia_workspace.sql', '20261111043800_crm_ia_workspace_readings.sql', '20261111044652_crm_ia_agent_runtime.sql', '20261111062101_crm_ia_calendar.sql', '20261111062548_crm_ia_voice.sql', '20261111072502_crm_ia_calendar_delivery.sql', '20261111075558_crm_ia_agent_template_contract.sql', '20261111090001_crm_ia_appointment_actions.sql', '20261111090002_crm_ia_agent_drafts_voice_modes.sql', '20261111090003_crm_ia_lead_tags.sql', '20261111101501_crm_ia_lead_profiles.sql', '20261111101502_crm_ia_lead_reads.sql', '20261111120001_crm_ia_internal_notifications.sql', '20261111120002_crm_ia_conversation_controls.sql', '20261111162400_crm_ia_conversation_read_performance.sql', '20261111185514_crm_ia_message_authorship.sql', '20261111203128_crm_ia_conversation_access_performance.sql'];
function withoutHeader(action, result) {
  const copy = structuredClone(result);
  if (action === 'conversations') for (const row of copy.rows) { delete row.phone;delete row.followup_due_at; }
  if (action === 'messages' && copy.state) { delete copy.state.phone;delete copy.state.followup_due_at; }
  return copy;
}
const iso = value => new Date(value).toISOString();

test('cabeçalho recebe telefone/follow-up somente de contatos já autorizados', async t => {
  let started = false;
  const previousFetch = globalThis.fetch;
  globalThis.fetch = () => { throw Error('Rede externa proibida nesta fixture de cabeçalho.'); };
  try {
    run('initdb', ['-D', data, '-U', 'conversation_header_qa', '--auth-local=trust', '--auth-host=reject', '--no-locale', '--encoding=UTF8']);
    run('pg_ctl', ['-D', data, '-l', join(work, 'postgres.log'), '-o', `-k ${work} -p 55653 -c listen_addresses='' -c unix_socket_permissions=0700`, '-w', 'start']);started = true;
    assert.equal(sql('SHOW listen_addresses'), '');
    const fixture = readFileSync(new URL('./workspace.database.test.mjs', import.meta.url), 'utf8').split('    sql(`')[1].split('    `);')[0].replace(/\$\{(\w+)\}/g, (_, key) => context[key]);
    sql(fixture.replace(/      CREATE TABLE public\.crm_ia_outbox\([^\n]+\n/, ''));
    sql(`CREATE SCHEMA planeje_private;CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid);
      CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT jsonb_build_object('sub',auth.uid())$$;
      ALTER TABLE public.profiles ADD COLUMN avatar_url text;
      ALTER TABLE public.cliente_whatsapp_contact ADD COLUMN last_message_at timestamptz,ADD COLUMN origin_source text DEFAULT 'nao_identificado',ADD COLUMN qualificado boolean,ADD COLUMN profile_pic_url text;
      ALTER TABLE public.cliente_whatsapp_sent ADD COLUMN sent_by uuid;
      ALTER TABLE public.leads ADD COLUMN qualificado boolean;ALTER TABLE public.cliente_atend_conversas ADD COLUMN ia_followup_passo integer DEFAULT 0;
      CREATE TABLE public.atendimento_conversas(id uuid PRIMARY KEY,cliente_id uuid,whatsapp_config_id uuid,chat_jid text,archived_at timestamptz,bloqueada boolean DEFAULT false);
      CREATE TABLE public.atendimento_conversa_planejamento(id uuid PRIMARY KEY,cliente_id uuid,conversation_id uuid,whatsapp_config_id uuid,chat_jid text,kind text,body text,status text,scheduled_at timestamptz,completed_at timestamptz,error_message text,updated_at timestamptz DEFAULT now());
      GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;`);
    for (const file of published) sql(readFileSync(new URL(`../../supabase/migrations/${file}`, import.meta.url), 'utf8'));
    sql(`UPDATE public.profiles SET full_name='Pessoa remetente QA',avatar_url='https://fixture.invalid/person.png' WHERE id='${staff}';
      UPDATE public.cliente_whatsapp_contact SET phone='${phone}',profile_pic_url='https://fixture.invalid/contact.png' WHERE id='${contact}';
      UPDATE public.cliente_whatsapp_inbox SET created_at='2026-11-10T10:00Z',msg_timestamp='2026-11-10T10:00Z';
      INSERT INTO public.cliente_whatsapp_config(id,cliente_id,name) VALUES('${foreignChannel}','${foreign}','Canal alheio QA');
      INSERT INTO public.cliente_whatsapp_contact(id,cliente_id,from_jid,phone,sender_name,whatsapp_config_id) VALUES
        ('${unlinked}','${client}','unlinked-opaque@lid','${unlinkedPhone}','Contato sem lead QA','${channel}'),
        ('${noPhone}','${client}','123456789012345@lid',NULL,'Contato 551155555555 sem telefone QA','${channel}'),
        ('${historical}','${client}','5511777777777@s.whatsapp.net','${historicalPhone}','Histórico sem lead QA','${channel}'),
        ('${foreignContact}','${foreign}','5511666666666@s.whatsapp.net','5511666666666','Contato alheio QA','${foreignChannel}');
      INSERT INTO public.cliente_atend_conversas(cliente_id,contact_id,status,ia_pausada,assigned_to,ia_followup_due_at) VALUES
        ('${client}','${contact}','esperando',true,'${staff}','${due}'),('${client}','${unlinked}','entrada',false,'${staff}','${due}'),
        ('${client}','${historical}','entrada',false,'${staff}','${oldDue}'),('${foreign}','${contact}','entrada',false,'${admin}','2099-01-01T00:00Z');
      INSERT INTO public.cliente_whatsapp_inbox(cliente_id,whatsapp_config_id,from_jid,chat_jid,body,created_at,msg_timestamp) VALUES
        ('${client}','${channel}','unlinked-opaque@lid','unlinked-opaque@lid','Sem lead, mensagem sintética','2026-11-10T11:00Z','2026-11-10T11:00Z'),
        ('${client}','${channel}','123456789012345@lid','123456789012345@lid','Sem telefone, mensagem sintética','2026-11-10T11:00Z','2026-11-10T11:00Z'),
        ('${client}','${channel}','5511777777777@s.whatsapp.net','5511777777777@s.whatsapp.net','Histórico antigo sintético','2026-01-01T11:00Z','2026-01-01T11:00Z');
      INSERT INTO public.crm_pipelines(id,cliente_id,nome) VALUES('${id(41)}','${client}','Funil QA');INSERT INTO public.crm_stages(id,pipeline_id,nome) VALUES('${id(51)}','${id(41)}','Entrada');
      INSERT INTO public.leads(id,cliente_id,nome,whatsapp,pipeline_id,stage_id,responsavel_id,crm_ia_contact_id) VALUES('${id(61)}','${client}','Lead QA','551199999999','${id(41)}','${id(51)}','${staff}','${contact}');
      INSERT INTO public.cliente_atend_ia_agentes(id,cliente_id,nome,instrucoes) VALUES('${id(81)}','${client}','Agente QA','INSTRUCAO_PRIVADA_NAO_EXIBIR');
      INSERT INTO planeje_private.crm_ia_agent_runs(id,cliente_id,channel_id,contact_id,lead_id,agent_id,actor_id,mode,message_id,snapshot,status,result) VALUES('${runId}','${client}','${channel}','${contact}','${id(61)}','${id(81)}','${admin}','responder','inbound-qa','{}','queued','{"queued":true,"outbox_id":"${aiOutbox}"}');
      INSERT INTO public.crm_ia_outbox(id,cliente_id,whatsapp_config_id,contact_id,lead_id,kind,body,scheduled_at,status,request_id,created_by,agent_run_id,provider_message_id) VALUES
        ('${humanOutbox}','${client}','${channel}','${contact}',NULL,'manual','Resposta humana sintética','2026-11-10T12:00Z','sent','${id(703)}','${staff}',NULL,'human-header'),
        ('${aiOutbox}','${client}','${channel}','${contact}','${id(61)}','reply','Resposta IA sintética','2026-11-10T12:00Z','sent','${id(714)}','${admin}','${runId}','ai-header');
      INSERT INTO public.cliente_whatsapp_sent(id,cliente_id,whatsapp_config_id,to_jid,chat_jid,body,message_id,sender_kind,sent_by,created_at) VALUES
        ('${human}','${client}','${channel}','551199999999@s.whatsapp.net','551199999999@s.whatsapp.net','Resposta humana sintética','human-header','human','${staff}','2026-11-10T12:00Z'),
        ('${ai}','${client}','${channel}','551199999999@s.whatsapp.net','551199999999@s.whatsapp.net','Resposta IA sintética','ai-header','automation',NULL,'2026-11-10T12:01Z'),
        ('${id(720)}','${client}','${channel}','551199999999@s.whatsapp.net','551199999999@s.whatsapp.net','Legado humano sintético','legacy-header','human','${staff}','2026-11-10T12:02Z'),
        ('${id(721)}','${client}','${channel}','551199999999@s.whatsapp.net','551199999999@s.whatsapp.net','Legado automático sintético','legacy-auto-header','automation',NULL,'2026-11-10T12:03Z');
      GRANT EXECUTE ON FUNCTION public.crm_ia_workspace(text,uuid,jsonb) TO service_role;
      GRANT EXECUTE ON FUNCTION public.crm_ia_workspace(text,uuid,jsonb) TO authenticated WITH GRANT OPTION;`);
    const mainSignature = 'public.crm_ia_workspace(text,uuid,jsonb)', aliasSignature = 'public.crm_ia_workspace_pre_message_authorship(text,uuid,jsonb)';
    const beforeMain = metadata(mainSignature), beforeAlias = metadata(aliasSignature), beforeHelpers = helpers();
    const cases = [
      ['conversations', { ...period, limit: 2, offset: 0 }], ['conversations', { ...period, limit: 2, offset: 2 }],
      ['conversations', { ...period, ...scope }], ['messages', { ...scope, ...period }],
      ['messages', { contact_id: unlinked, channel_id: channel }], ['messages', { contact_id: historical, channel_id: channel, ...period }],
      ['workspace', {}], ['overview', period], ['usage', period], ['conversation_context', scope],
    ];
    const golden = cases.map(([action, payload]) => read(action, payload));
    const candidate = readdirSync(new URL('../../supabase/migrations/', import.meta.url)).filter(file => /^\d+_crm_ia_conversation_header\.sql$/.test(file));
    for (const file of candidate) sql(readFileSync(new URL(`../../supabase/migrations/${file}`, import.meta.url), 'utf8'));

    await t.test('lista e state do contato vinculado devolvem telefone cadastrado e follow-up da mesma conta', () => {
      assert.equal(read('conversation_context', scope).status, 'linked');
      const result = read('conversations', { ...period, ...scope });assert.equal(result.total, 1);assert.equal(result.rows.length, 1);
      assert.equal(result.rows[0].phone, phone);assert.equal(iso(result.rows[0].followup_due_at), due);
      const state = read('messages', { ...scope, ...period }).state;
      assert.equal(state.phone, phone);assert.equal(iso(state.followup_due_at), due);
    });
    await t.test('contato sem lead recebe telefone bruto e follow-up sem depender de conversation_context', () => {
      const selected = { contact_id: unlinked, channel_id: channel };
      assert.equal(read('conversation_context', selected).status, 'unlinked');
      const row = read('conversations', { ...period, ...selected }).rows[0];
      assert.equal(row.phone, unlinkedPhone);assert.equal(iso(row.followup_due_at), due);
      const state = read('messages', selected).state;assert.equal(state.phone, unlinkedPhone);assert.equal(iso(state.followup_due_at), due);
    });
    await t.test('state fora do período não ressuscita a conversa na lista e mantém os campos atuais', () => {
      const selected = { contact_id: historical, channel_id: channel, ...period };
      assert.equal(read('conversations', selected).total, 0);
      const result = read('messages', selected);assert.ok(result.rows.length);
      assert.equal(result.state.phone, historicalPhone);assert.equal(iso(result.state.followup_due_at), oldDue);
    });
    await t.test('autoria, fotos, paginação e envelopes externos permanecem integralmente iguais', () => {
      cases.forEach(([action, payload], index) => assert.deepEqual(withoutHeader(action, read(action, payload)), golden[index], `${action}:${JSON.stringify(payload)}`));
      const rows = read('messages', scope).rows;
      assert.equal(rows.find(row => row.id === human).sender_kind, 'human');assert.equal(rows.find(row => row.id === human).sender_name, 'Pessoa remetente QA');
      assert.equal(rows.find(row => row.id === ai).sender_kind, 'ai');assert.equal(rows.find(row => row.id === ai).can_flag, true);
      assert.equal(rows.find(row => row.id === id(720)).sender_kind, 'unknown');assert.equal(rows.find(row => row.id === id(721)).sender_kind, 'automation');
      assert.doesNotMatch(JSON.stringify(read('messages', scope)), /INSTRUCAO_PRIVADA|claim_token|snapshot/);
    });
    await t.test('telefone ausente continua nulo, sem inferir pelos dígitos de lid, nome ou telefone do lead', () => {
      const selected = { contact_id: noPhone, channel_id: channel };
      const state = read('messages', selected).state;assert.equal(state.phone, null);assert.equal(state.followup_due_at, null);
      const row = read('conversations', { ...period, ...selected }).rows[0];assert.equal(row.phone, null);assert.equal(row.followup_due_at, null);
      sql(`UPDATE public.cliente_whatsapp_contact SET phone=NULL WHERE id='${contact}'`);
      try { assert.equal(read('messages', scope).state.phone, null); }
      finally { sql(`UPDATE public.cliente_whatsapp_contact SET phone='${phone}' WHERE id='${contact}'`); }
    });
    await t.test('base autoriza antes de enriquecer, sem exposição por outro contato/canal/cliente ou privado', () => {
      for (const action of ['messages', 'conversations']) {
        for (const key of [hiddenChannel, foreignChannel]) assert.throws(() => read(action, { ...scope, channel_id: key }), /42501|acesso|canal/i);
        assert.throws(() => read(action, { ...scope, contact_id: foreignContact }), /42501|acesso|contato/i);
        assert.throws(() => read(action, scope, other), /42501|acesso/i);
        assert.throws(() => read(action, scope, staff, foreign), /42501|acesso/i);
      }
      assert.equal(read('workspace', {}, staff).permissions.manage, false);assert.equal(read('messages', scope, staff).state.phone, phone);
      sql(`UPDATE public.cliente_atend_conversas SET privado=true,assigned_to='${admin}' WHERE cliente_id='${client}' AND contact_id='${contact}'`);
      try {
        assert.throws(() => read('messages', scope, staff), /42501|acesso/i);
        assert.equal(read('conversations', period, staff).rows.some(row => row.contact_id === contact), false);
      } finally { sql(`UPDATE public.cliente_atend_conversas SET privado=false,assigned_to='${staff}' WHERE cliente_id='${client}' AND contact_id='${contact}'`); }
    });
    await t.test('CREATE OR REPLACE mantém OID, owner, atributos, ACL completa, alias17 e helpers18', () => {
      const after = metadata(mainSignature), { body_md5: oldBody, ...oldAttributes } = beforeMain, { body_md5: newBody, ...newAttributes } = after;
      assert.deepEqual(newAttributes, oldAttributes);assert.notEqual(newBody, oldBody);
      assert.deepEqual(metadata(aliasSignature), beforeAlias);assert.deepEqual(helpers(), beforeHelpers);
      assert.throws(() => sql(`SET ROLE anon;SELECT public.crm_ia_workspace('messages','${client}',${quote(scope)})`), /permission denied/);
      assert.throws(() => sql(`SET ROLE authenticated;SELECT public.crm_ia_workspace_pre_message_authorship('messages','${client}',${quote(scope)})`), /permission denied/);
    });
  } finally {
    globalThis.fetch = previousFetch;
    if (started) run('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop']);
    rmSync(work, { recursive: true, force: true });
  }
});

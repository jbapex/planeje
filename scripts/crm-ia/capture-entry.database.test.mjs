import assert from 'node:assert/strict';
import { execFile, spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

const work = mkdtempSync('/tmp/crm-capture-entry-'), data = join(work, 'data');
const env = { PATH: process.env.PATH, LC_ALL: 'C' }, baseline = process.env.CRM_CAPTURE_BASELINE === '1';
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const context = Object.fromEntries(['admin', 'staff', 'other', 'client', 'foreign', 'channel', 'hiddenChannel', 'contact'].map((key, index) => [key, id([1, 2, 3, 11, 12, 21, 22, 31][index])]));
const { admin, staff, other, client, foreign, channel, hiddenChannel, contact } = context;
const superadmin = id(4), colleague = id(5), pipeline = id(41), stage = id(51), foreignChannel = id(23);
const psql = ['-X', '-Aqt', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose', '-h', work, '-p', '55720', '-U', 'capture_entry_qa', '-d', 'postgres'];
const quote = value => value === null ? 'NULL' : `'${String(value).replaceAll("'", "''")}'`;
const json = value => `${quote(JSON.stringify(value))}::jsonb`;
const published = ['20261111041703_crm_ia_delivery_runtime.sql', '20261111041704_crm_ia_workspace.sql', '20261111043800_crm_ia_workspace_readings.sql', '20261111044652_crm_ia_agent_runtime.sql', '20261111062101_crm_ia_calendar.sql', '20261111062548_crm_ia_voice.sql', '20261111072502_crm_ia_calendar_delivery.sql', '20261111075558_crm_ia_agent_template_contract.sql', '20261111090001_crm_ia_appointment_actions.sql', '20261111090002_crm_ia_agent_drafts_voice_modes.sql', '20261111090003_crm_ia_lead_tags.sql', '20261111101501_crm_ia_lead_profiles.sql', '20261111101502_crm_ia_lead_reads.sql', '20261111120001_crm_ia_internal_notifications.sql', '20261111120002_crm_ia_conversation_controls.sql', '20261111162400_crm_ia_conversation_read_performance.sql', '20261111185514_crm_ia_message_authorship.sql', '20261111203128_crm_ia_conversation_access_performance.sql', '20261111220814_crm_ia_conversation_header.sql'];
const migration = name => readFileSync(new URL(`../../supabase/migrations/${name}`, import.meta.url), 'utf8');
function run(binary, args, input) {
  const result = spawnSync(binary, args, { input, env, encoding: 'utf8', timeout: 25000 });
  if (result.error || result.status !== 0) throw Error(result.stderr?.trim() || result.error?.message || result.stdout);
  return result.stdout.trim();
}
const sql = input => run('psql', psql, input);
const exec = promisify(execFile);
// execFile has no stdin option: independent concurrent clients use a bounded SQL command instead.
const queryAsync = async input => (await exec('psql', [...psql, '-c', input], { env, encoding: 'utf8', timeout: 15000 })).stdout.trim();
const intake = (row, text = 'Olá') => JSON.parse(sql(`SET ROLE service_role;SET test.uid='';SELECT public.crm_ia_agent_intake('${row.client || client}','${row.channel || channel}','${row.contact}',${quote(text)});`));
const captureStatement = row => `SELECT public.crm_ia_capture_inbound('${row.client || client}','${row.channel || channel}','${row.contact}',${quote(row.message)});`;
const capture = row => JSON.parse(sql(`SET ROLE service_role;SET test.uid='${other}';${captureStatement(row)}`));
const baseConfig = () => ({ attendance: { auto_send: false, restart_triage: true }, entry: { enabled: true, channels: [{ channel_id: channel, enabled: true, mode: 'all', pipeline_id: pipeline, stage_id: stage, tags: [' VIP ', 'Novo', 'VIP'] }] }, distribution: { enabled: true, sources: ['whatsapp'], include_unassigned: true, strategy: 'round_robin', people: [{ owner_id: admin, weight: 1, limit: 0 }] }, test_mode: { enabled: false, phones: [] } });
const configure = (settings = baseConfig(), actor = admin) => sql(`INSERT INTO public.crm_ia_config(cliente_id,data,updated_by) VALUES('${client}',${json(settings)},${quote(actor)}) ON CONFLICT(cliente_id) DO UPDATE SET data=excluded.data,updated_by=excluded.updated_by;`);
const lead = row => JSON.parse(sql(`SELECT coalesce((SELECT to_jsonb(l) FROM public.leads l WHERE cliente_id='${row.client || client}' AND crm_ia_contact_id='${row.contact}'),'null');`));
const protectedState = () => sql(`SELECT jsonb_build_object('conversations',(SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY id),'[]') FROM public.cliente_atend_conversas c),'runs',(SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY id),'[]') FROM planeje_private.crm_ia_agent_runs r),'outbox',(SELECT coalesce(jsonb_agg(to_jsonb(o) ORDER BY id),'[]') FROM public.crm_ia_outbox o),'usage',(SELECT coalesce(jsonb_agg(to_jsonb(l) ORDER BY id),'[]') FROM public.cliente_atend_ia_log l),'notifications',(SELECT count(*) FROM planeje_private.crm_ia_notification_events));`);
const commercialState = () => sql(`SELECT jsonb_build_object('leads',(SELECT coalesce(jsonb_agg(to_jsonb(l) ORDER BY id),'[]') FROM public.leads l),'turns',(SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY cliente_id),'[]') FROM planeje_private.crm_ia_distribution_state s));`);
let sequence = 1000;
function incoming(options = {}) {
  const n = ++sequence, row = { contact: id(n), phone: `5511${String(n).padStart(9, '0')}`, message: `capture-fixture-${n}`, channel, client, ...options };
  row.jid ||= `${row.phone}@s.whatsapp.net`;
  sql(`INSERT INTO public.cliente_whatsapp_contact(id,cliente_id,from_jid,phone,sender_name,whatsapp_config_id,origin_source) VALUES('${row.contact}','${row.client}',${quote(row.jid)},${quote(row.phone)},'Contato QA','${row.channel}',${quote(row.source || 'whatsapp')});
    INSERT INTO public.cliente_whatsapp_inbox(id,cliente_id,whatsapp_config_id,from_jid,chat_jid,message_id,body,type,is_group,raw_payload,created_at) VALUES('${id(n + 100000)}','${row.client}','${row.channel}',${quote(row.jid)},${quote(row.chat || row.jid)},${quote(row.message)},${quote(Object.hasOwn(options, 'body') ? options.body : 'Quero preço de um produto')},${quote(row.type || 'text')},${row.group === true},${json(row.raw || {})},clock_timestamp());`);
  return row;
}
const existingLead = (row, options = {}) => {
  const key = id(++sequence);
  sql(`INSERT INTO public.leads(id,cliente_id,nome,whatsapp,pipeline_id,stage_id,status_vida,responsavel_id,crm_ia_contact_id,etiquetas) VALUES('${key}','${row.client || client}','Lead QA',${quote(row.phone)},'${pipeline}','${stage}','ativo',${quote(options.owner ?? null)},${quote(options.link === false ? null : options.contact || row.contact)},'{Preservar}');`);
  return key;
};
const actorCanReadContact = (actor, row) => sql(`SET test.uid='${actor}';SELECT private.crm_ia_contact('${row.client || client}','${row.contact}');`) === 't';
const actorCanReadLead = (actor, key) => sql(`SET test.uid='${actor}';SELECT private.crm_ia_lead('${key}','${client}');`) === 't';
function expectSkipped(row, reason) {
  const before = commercialState(), human = protectedState(), result = capture(row);
  assert.equal(result.handled, true);assert.equal(result.captured, false);assert.equal(result.lead_id, null);
  if (reason) assert.equal(result.skipped, reason);else assert.equal(typeof result.skipped, 'string');
  assert.deepEqual(Object.keys(result).sort(), ['captured', 'handled', 'lead_id', 'skipped']);
  assert.equal(commercialState(), before);assert.equal(protectedState(), human);
  return result;
}
function connection() {
  const child = spawn('psql', psql, { env, stdio: ['pipe', 'pipe', 'pipe'] });
  let output = '', error = '';
  child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
  child.stdout.on('data', chunk => { output += chunk; });child.stderr.on('data', chunk => { error += chunk; });
  const waitFor = async marker => {
    const deadline = Date.now() + 8000;
    while (!output.includes(marker)) {
      if (child.exitCode !== null || Date.now() > deadline) throw Error(`Conexão QA não chegou a ${marker}: ${error}`);
      await new Promise(resolve => setTimeout(resolve, 15));
    }
  };
  return { child, waitFor };
}
async function waitBlocked(name, count) {
  const deadline = Date.now() + 8000;
  while (Number(sql(`SELECT count(*) FROM pg_stat_activity WHERE application_name=${quote(name)} AND wait_event='advisory';`)) !== count) {
    if (Date.now() > deadline) throw Error('Clientes QA não aguardaram o advisory lock esperado.');
    await new Promise(resolve => setTimeout(resolve, 15));
  }
}

test('captura usa entrada comprovada e preparação comercial única, sem automação nem ampliação de escopo', async t => {
  let started = false;
  const previousFetch = globalThis.fetch;
  globalThis.fetch = () => { throw Error('Rede externa proibida na fixture de captura.'); };
  try {
    run('initdb', ['-D', data, '-U', 'capture_entry_qa', '--auth-local=trust', '--auth-host=reject', '--no-locale', '--encoding=UTF8']);
    run('pg_ctl', ['-D', data, '-l', join(work, 'postgres.log'), '-o', `-k ${work} -p 55720 -c listen_addresses='' -c unix_socket_permissions=0700`, '-w', 'start']);started = true;
    assert.equal(sql('SHOW listen_addresses'), '');
    const fixture = readFileSync(new URL('./workspace.database.test.mjs', import.meta.url), 'utf8').split('    sql(`')[1].split('    `);')[0].replace(/\$\{(\w+)\}/g, (_, key) => context[key]);
    sql(fixture.replace(/      CREATE TABLE public\.crm_ia_outbox\([^\n]+\n/, ''));
    sql(`CREATE SCHEMA planeje_private;CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid);
      CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT jsonb_build_object('sub',auth.uid())$$;
      ALTER TABLE public.profiles ADD COLUMN avatar_url text;
      ALTER TABLE public.cliente_whatsapp_contact ADD COLUMN last_message_at timestamptz,ADD COLUMN origin_source text DEFAULT 'nao_identificado',ADD COLUMN qualificado boolean,ADD COLUMN profile_pic_url text,ADD UNIQUE(cliente_id,from_jid);
      ALTER TABLE public.cliente_whatsapp_inbox ADD UNIQUE(cliente_id,message_id);
      ALTER TABLE public.cliente_whatsapp_sent ADD COLUMN sent_by uuid;
      ALTER TABLE public.leads ADD COLUMN qualificado boolean;ALTER TABLE public.cliente_atend_conversas ADD COLUMN ia_followup_passo integer DEFAULT 0;
      CREATE TABLE public.atendimento_usuario_acesso(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cliente_id uuid,user_id uuid,whatsapp_config_id uuid);
      CREATE TABLE public.atendimento_conversas(id uuid PRIMARY KEY,cliente_id uuid,whatsapp_config_id uuid,chat_jid text,archived_at timestamptz,bloqueada boolean DEFAULT false);
      CREATE TABLE public.atendimento_conversa_planejamento(id uuid PRIMARY KEY,cliente_id uuid,conversation_id uuid,whatsapp_config_id uuid,chat_jid text,kind text,body text,status text,scheduled_at timestamptz,completed_at timestamptz,error_message text,updated_at timestamptz DEFAULT now());
      INSERT INTO public.profiles(id,role,status,full_name) VALUES('${superadmin}','superadmin','active','Super QA'),('${colleague}','colaborador','active','Colaborador QA');
      INSERT INTO public.cliente_whatsapp_config(id,cliente_id,name) VALUES('${foreignChannel}','${foreign}','Canal alheio QA');
      INSERT INTO public.client_module_permissions(cliente_id,module_name,is_enabled) VALUES('${client}','atendimento_loja',true),('${foreign}','atendimento_loja',true);
      GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;`);
    sql(migration('20260702120000_atendimento_send_requires_channel_access.sql'));
    sql(migration('20261006140000_atendimento_loja_modulo.sql').match(/create or replace function public\.cliente_atend_loja_habilitada\([\s\S]*?\$\$;/i)[0]);
    sql(migration('20260928230000_cliente_atend_inbox.sql').match(/create or replace function public\.cliente_atend_touch_updated_at\([\s\S]*?\$\$;/i)[0]);
    sql('CREATE TRIGGER cliente_atend_conversas_touch BEFORE UPDATE ON public.cliente_atend_conversas FOR EACH ROW EXECUTE FUNCTION public.cliente_atend_touch_updated_at()');
    for (const file of published) sql(migration(file));
    sql(`INSERT INTO public.crm_pipelines(id,cliente_id,nome) VALUES('${pipeline}','${client}','Funil QA');INSERT INTO public.crm_stages(id,pipeline_id,nome) VALUES('${stage}','${pipeline}','Entrada');
      GRANT EXECUTE ON FUNCTION public.crm_ia_agent_intake(uuid,uuid,uuid,text) TO service_role WITH GRANT OPTION;`);
    configure();
    const first = incoming();
    sql(`INSERT INTO public.cliente_atend_conversas(cliente_id,contact_id,status,ia_pausada,assigned_to,privado,crm_ia_runtime,ia_followup_due_at,ia_followup_delivery_state) VALUES('${client}','${first.contact}','finalizado',true,'${admin}',true,'{"active":true,"closed":true,"sentinel":"humano"}','2099-01-01T00:00Z','pending');`);
    assert.equal(sql('SELECT count(*) FROM public.cliente_atend_ia_agentes'), '0');
    const intakeSignature = 'public.crm_ia_agent_intake(uuid,uuid,uuid,text)';
    const attributes = () => sql(`SELECT to_jsonb(p)-'prosrc' FROM pg_proc p WHERE oid='${intakeSignature}'::regprocedure;`);
    const beforeAttributes = attributes();
    const coreOids = sql(`SELECT array_agg(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('private','planeje_private','public') AND (p.proname LIKE 'crm_ia_%' OR p.proname IN('atendimento_user_can_send_on_whatsapp_config','cliente_atend_loja_habilitada')) AND p.oid<>'${intakeSignature}'::regprocedure;`);
    const core = () => sql(`SELECT jsonb_agg(to_jsonb(p) ORDER BY oid) FROM pg_proc p WHERE oid=ANY('${coreOids}'::oid[]);`);
    const beforeCore = core();
    const legacy = sql(`SELECT pg_get_functiondef('${intakeSignature}'::regprocedure);`);
    sql(legacy.replace('CREATE OR REPLACE FUNCTION public.crm_ia_agent_intake(', 'CREATE FUNCTION private.capture_legacy_intake('));
    if (!baseline) {
      const candidates = readdirSync(new URL('../../supabase/migrations/', import.meta.url)).filter(file => /^\d+_crm_ia_capture_entry\.sql$/.test(file));
      assert.equal(candidates.length, 1, 'uma única migration inédita de captura');
      assert.ok(candidates[0].slice(0, 14) > '20261111220814');
      sql(migration(candidates[0]));
    }

    await t.test('auto_send=false e zero agentes ainda criam um lead com etiquetas e distribuição, sem tocar estado humano', () => {
      const human = protectedState();
      // RED comportamental: o comando CRM_CAPTURE_BASELINE=1 usa o intake real anterior,
      // com o mesmo texto comprovado; não simula a captura nem a ausência da RPC.
      const result = baseline ? intake(first, sql(`SELECT body FROM public.cliente_whatsapp_inbox WHERE message_id=${quote(first.message)};`)) : capture(first);
      if (baseline) assert.equal(result.skipped, 'disabled_or_owner');
      assert.equal(sql(`SELECT count(*) FROM public.leads WHERE crm_ia_contact_id='${first.contact}'`), '1', 'entrada ligada precisa capturar sem autonomia/agente');
      if (baseline) return;
      const saved = lead(first);assert.equal(result.captured, true);assert.equal(result.lead_id, saved.id);assert.equal(result.skipped, null);
      assert.deepEqual(Object.keys(result).sort(), ['captured', 'handled', 'lead_id', 'skipped']);
      assert.deepEqual(saved.etiquetas, ['VIP', 'Novo']);assert.equal(saved.responsavel_id, admin);assert.equal(saved.whatsapp, first.phone);
      assert.equal(protectedState(), human);assert.equal(sql(`SELECT turn FROM planeje_private.crm_ia_distribution_state WHERE cliente_id='${client}'`), '1');
      const commercial = commercialState();assert.deepEqual(capture(first), result);assert.equal(commercialState(), commercial);assert.equal(protectedState(), human);
      assert.equal(sql(`SET ROLE service_role;SET test.uid='${other}';${captureStatement(first)}SELECT auth.uid();`).split('\n').at(-1), other, 'captura não substitui a identidade da sessão');
    });
    if (baseline) return;

    await t.test('frase usa body do banco; captura all aceita áudio sem texto e nunca transcreve', () => {
      const settings = baseConfig();settings.entry.channels[0].mode = 'phrase';settings.entry.channels[0].phrase = 'VALOR';configure(settings);
      const matching = incoming({ body: 'Gostaria de conhecer o valor, por favor.' });assert.equal(capture(matching).captured, true);
      const mismatch = incoming({ body: 'Apenas uma saudação', raw: { body: 'VALOR' } });expectSkipped(mismatch, 'entry_disabled');
      expectSkipped({ ...mismatch, message: 'VALOR' }, 'message_changed');
      const audio = incoming({ body: null, type: 'audio' });expectSkipped(audio, 'entry_disabled');
      settings.entry.channels[0].mode = 'all';configure(settings);assert.equal(capture(audio).captured, true);
      assert.equal(sql('SELECT count(*) FROM public.cliente_atend_ia_log'), '0');assert.equal(sql('SELECT count(*) FROM public.crm_ia_outbox'), '0');
    });
    await t.test('sem configuração/entrada/canal/mensagem não há criação, vínculo, atribuição ou cancelamento', () => {
      assert.deepEqual(JSON.parse(sql('BEGIN READ ONLY;SET LOCAL ROLE service_role;SELECT public.crm_ia_capture_inbound(NULL,NULL,NULL,NULL);COMMIT;')), { handled: true, captured: false, lead_id: null, skipped: 'message_required' });
      const row = incoming();
      sql(`DELETE FROM public.crm_ia_config WHERE cliente_id='${client}'`);expectSkipped(row, 'capture_disabled');
      let settings = baseConfig();settings.entry.enabled = false;settings.distribution.enabled = false;configure(settings);expectSkipped(row, 'capture_disabled');
      settings = baseConfig();settings.entry.channels[0].enabled = false;settings.distribution.enabled = false;configure(settings);expectSkipped(row, 'capture_disabled');
      configure();for (const message of [null, '', ' ', 'x'.repeat(301)]) expectSkipped({ ...row, message }, 'message_required');
    });
    await t.test('mensagem deve ser atual, recebida e exata no cliente/canal/contato; grupo e eco falham fechados', () => {
      configure();const row = incoming();
      for (const wrong of [{ client: foreign }, { channel: foreignChannel }, { channel: hiddenChannel }, { contact }, { message: 'missing-provider-id' }]) expectSkipped({ ...row, ...wrong });
      const alien = incoming({ client: foreign, channel: foreignChannel });expectSkipped({ ...row, message: alien.message }, 'message_changed');
      const newer = `${row.message}-new`;
      sql(`INSERT INTO public.cliente_whatsapp_inbox(cliente_id,whatsapp_config_id,from_jid,chat_jid,message_id,body,created_at) VALUES('${client}','${channel}',${quote(row.jid)},${quote(row.jid)},${quote(newer)},'Mensagem nova',clock_timestamp());`);
      expectSkipped(row, 'message_changed');assert.equal(capture({ ...row, message: newer }).captured, true);
      const echo = incoming();sql(`DELETE FROM public.cliente_whatsapp_inbox WHERE message_id=${quote(echo.message)};INSERT INTO public.cliente_whatsapp_sent(cliente_id,whatsapp_config_id,to_jid,chat_jid,message_id,body) VALUES('${client}','${channel}',${quote(echo.jid)},${quote(echo.jid)},${quote(echo.message)},'Eco só na sent');`);expectSkipped(echo, 'message_changed');
      expectSkipped(incoming({ group: true }), 'message_changed');expectSkipped(incoming({ jid: '12345@g.us' }), 'scope');
      expectSkipped(incoming({ chat: '12345@g.us' }), 'message_changed');
      const unknownGroup = incoming();sql(`UPDATE public.cliente_whatsapp_inbox SET is_group=NULL WHERE message_id=${quote(unknownGroup.message)}`);expectSkipped(unknownGroup, 'message_changed');
      for (const patch of ["archived_at=now()", "provider='outro'", "token=''", "subdomain=''" ]) {
        sql(`UPDATE public.cliente_whatsapp_config SET ${patch} WHERE id='${channel}'`);
        try { expectSkipped(incoming(), 'scope'); }
        finally { sql(`UPDATE public.cliente_whatsapp_config SET archived_at=NULL,provider='uazapi',token='fixture-secret',subdomain='fixture' WHERE id='${channel}'`); }
      }
    });
    await t.test('classificação da inbox não é invertida por flags da mensagem citada no conteúdo', () => {
      configure();
      const quoted = incoming({ raw: { fromMe: false, isGroup: false, message: { extendedTextMessage: { contextInfo: { quotedMessage: { key: { fromMe: true }, context: { isGroup: true }, from_me: true, is_group: true } } } } } });
      assert.equal(capture(quoted).captured, true);assert.ok(lead(quoted)?.id);
    });
    await t.test('privado/responsible segue helpers CRM reais sem inventar sessão; admin não transpõe privado e superadmin respeita o canônico', () => {
      const row = incoming();sql(`INSERT INTO public.cliente_atend_conversas(cliente_id,contact_id,assigned_to,privado) VALUES('${client}','${row.contact}','${staff}',true);`);
      for (const actor of [admin, colleague]) { configure(baseConfig(), actor);assert.equal(actorCanReadContact(actor, row), false);expectSkipped(row, 'actor_scope');assert.equal(intake(row).skipped, 'disabled_or_owner'); }
      const automated = baseConfig();automated.attendance.auto_send = true;configure(automated, admin);assert.equal(intake(row).skipped, 'actor_scope');
      configure(baseConfig(), superadmin);assert.equal(actorCanReadContact(superadmin, row), true);assert.equal(capture(row).captured, true);
      const assigned = incoming();sql(`INSERT INTO public.cliente_atend_conversas(cliente_id,contact_id,assigned_to,privado) VALUES('${client}','${assigned.contact}','${staff}',false);`);
      configure(baseConfig(), staff);assert.equal(actorCanReadContact(staff, assigned), true);assert.equal(capture(assigned).captured, true);
      const absent = incoming();assert.equal(actorCanReadContact(staff, absent), false);expectSkipped(absent, 'actor_scope');
      sql(`UPDATE public.cliente_atend_conversas SET assigned_to='${admin}' WHERE contact_id='${assigned.contact}'`);
      assert.equal(actorCanReadContact(staff, assigned), false);expectSkipped(assigned, 'actor_scope');
      configure(baseConfig(), admin);assert.equal(capture(absent).captured, true);
      sql(`INSERT INTO public.user_module_access(user_id,module_name,access_level) VALUES('${admin}','crm','responsible');`);
      try { const unrestricted = incoming();assert.equal(actorCanReadContact(admin, unrestricted), true);assert.equal(capture(unrestricted).captured, true); }
      finally { sql(`DELETE FROM public.user_module_access WHERE user_id='${admin}'`); }
    });
    await t.test('ator/canal/módulos revogados e responsável da conta não dão acesso por chamada de serviço', () => {
      const row = incoming();
      for (const actor of [null, other]) { configure(baseConfig(), actor);expectSkipped(row, 'disabled_or_owner'); }
      configure();sql(`UPDATE public.profiles SET status='inactive' WHERE id='${admin}'`);
      try { expectSkipped(row, 'disabled_or_owner'); } finally { sql(`UPDATE public.profiles SET status='active' WHERE id='${admin}'`); }
      sql(`INSERT INTO public.user_module_permissions(user_id,module_name,is_enabled) VALUES('${admin}','crm',false)`);
      try { expectSkipped(row, 'disabled_or_owner'); } finally { sql(`DELETE FROM public.user_module_permissions`); }
      sql(`UPDATE public.client_module_permissions SET is_enabled=false WHERE cliente_id='${client}'`);
      try { expectSkipped(row, 'disabled_or_owner'); } finally { sql(`UPDATE public.client_module_permissions SET is_enabled=true WHERE cliente_id='${client}'`); }
      sql(`INSERT INTO public.atendimento_usuario_acesso(cliente_id,user_id,whatsapp_config_id) VALUES('${client}','${admin}','${hiddenChannel}')`);
      try { assert.equal(sql(`SELECT public.atendimento_user_can_send_on_whatsapp_config('${admin}','${client}','${channel}')`), 'f');expectSkipped(row, 'actor_scope');const settings = baseConfig();settings.attendance.auto_send = true;configure(settings);assert.equal(intake(row).skipped, 'actor_scope'); }
      finally { sql('DELETE FROM public.atendimento_usuario_acesso');configure(); }
      sql("INSERT INTO public.module_settings(module_name,is_enabled) VALUES('atendimento',false),('rastreamento',false)");
      try {
        expectSkipped(row, 'actor_scope');sql(`INSERT INTO public.user_module_permissions VALUES('${admin}','rastreamento',true)`);assert.equal(capture(row).captured, true);
      } finally { sql('DELETE FROM public.module_settings;DELETE FROM public.user_module_permissions'); }
      const staffContact = incoming();sql(`INSERT INTO public.cliente_atend_conversas(cliente_id,contact_id,assigned_to) VALUES('${client}','${staffContact.contact}','${staff}');INSERT INTO public.user_module_access VALUES('${staff}','clients','responsible');UPDATE public.clientes SET responsavel='${admin}' WHERE id='${client}'`);
      configure(baseConfig(), staff);
      try { assert.equal(actorCanReadContact(staff, staffContact), false);expectSkipped(staffContact, 'disabled_or_owner'); }
      finally { sql(`UPDATE public.clientes SET responsavel='${staff}' WHERE id='${client}';DELETE FROM public.user_module_access WHERE module_name='clients'`); }
    });
    await t.test('lead alheio e vínculo conflitante não são usados nem no intake; ambiguidade conta todos os leads', () => {
      const row = incoming();sql(`INSERT INTO public.cliente_atend_conversas(cliente_id,contact_id,assigned_to) VALUES('${client}','${row.contact}','${staff}')`);
      const key = existingLead(row, { owner: admin, link: false });configure(baseConfig(), staff);
      assert.equal(actorCanReadLead(staff, key), false);expectSkipped(row, 'lead_scope');
      const settings = baseConfig();settings.attendance.auto_send = true;configure(settings, staff);assert.equal(intake(row).skipped, 'lead_scope');
      const second = existingLead(row, { owner: staff });assert.equal(actorCanReadLead(staff, second), true);configure(baseConfig(), staff);expectSkipped(row, 'ambiguous_lead');
      configure();const bound = incoming(), otherContact = incoming();existingLead(bound, { contact: otherContact.contact, owner: admin });expectSkipped(bound, 'lead_contact_conflict');
      configure(settings);assert.equal(intake(bound).skipped, 'lead_contact_conflict');
      const foreignRow = incoming({ client: foreign, channel: foreignChannel, phone: row.phone });existingLead(foreignRow, { owner: admin });
      const isolated = incoming();configure();assert.equal(capture(isolated).captured, true);
    });
    await t.test('test_mode usa número cadastrado/confirmado, @lid opaco não vira telefone nem vincula por seus dígitos', () => {
      const row = incoming(), settings = baseConfig();settings.test_mode = { enabled: true, phones: ['5511000000000'] };configure(settings);expectSkipped(row, 'test_number_not_allowed');
      settings.test_mode.phones = [`+${row.phone}`];configure(settings);assert.equal(capture(row).captured, true);
      const lid = incoming({ jid: '998877665544332@lid', phone: null, body: null, type: 'audio' });
      settings.test_mode.phones = ['998877665544332'];configure(settings);expectSkipped(lid, 'test_number_not_allowed');
      const numerical = incoming({ phone: '998877665544332' }), known = existingLead(numerical, { owner: admin });
      configure();const history = sql(`SELECT to_jsonb(c) FROM public.cliente_whatsapp_contact c WHERE id='${lid.contact}'`);
      expectSkipped(lid, 'phone_unavailable');assert.equal(lead(lid), null);assert.equal(sql(`SELECT count(*) FROM public.leads WHERE id='${known}'`), '1');
      const automated = baseConfig();automated.attendance.auto_send = true;configure(automated);
      const before = commercialState();assert.equal(intake(lid).skipped, 'phone_unavailable');assert.equal(commercialState(), before);
      assert.equal(sql(`SELECT to_jsonb(c) FROM public.cliente_whatsapp_contact c WHERE id='${lid.contact}'`), history);
      const linked = incoming({ jid: '112233445566778@lid', phone: null }), linkedKey = existingLead({ ...linked, phone: '5511955554444' }, { owner: colleague });
      configure();assert.equal(capture(linked).lead_id, linkedKey);assert.equal(lead(linked).whatsapp, '5511955554444');assert.equal(lead(linked).responsavel_id, colleague);
      configure(automated);assert.equal(intake(linked).lead.id, linkedKey);assert.equal(lead(linked).whatsapp, '5511955554444');
      for (const phone of ['123456789', '1234567890123456']) {
        const invalid = incoming({ phone });configure();expectSkipped(invalid, 'phone_unavailable');configure(automated);
        const unchanged = commercialState();assert.equal(intake(invalid).skipped, 'phone_unavailable');assert.equal(commercialState(), unchanged);
      }
      configure();for (const phone of ['1234567890', '123456789012345']) assert.equal(capture(incoming({ phone })).captured, true);
      const withPhone = incoming({ jid: '77665544332211@lid', phone: '+55 (11) 98888-7777' });settings.test_mode.phones = ['5511988887777'];configure(settings);assert.equal(capture(withPhone).captured, true);assert.equal(lead(withPhone).whatsapp, '5511988887777');
      const telephone = incoming({ jid: '5511977776666@c.us', phone: null });configure();assert.equal(capture(telephone).captured, true);assert.equal(lead(telephone).whatsapp, '5511977776666');
    });
    await t.test('vínculo/owner/tags existentes e distribuição geral mantêm fontes, limites, fallback e não atribuídos', () => {
      configure();const owned = incoming(), key = existingLead(owned, { owner: colleague, link: false });
      const result = capture(owned);assert.equal(result.lead_id, key);assert.equal(lead(owned).responsavel_id, colleague);assert.deepEqual(lead(owned).etiquetas, ['Preservar']);
      const onlyDistribution = baseConfig();onlyDistribution.entry.enabled = false;configure(onlyDistribution);const existing = incoming();existingLead(existing, { link: false });assert.equal(capture(existing).captured, true);assert.equal(lead(existing).responsavel_id, admin);
      expectSkipped(incoming(), 'entry_disabled');
      const settings = baseConfig();settings.distribution.include_unassigned = false;configure(settings);const unassigned = incoming();existingLead(unassigned);assert.equal(capture(unassigned).captured, true);assert.equal(lead(unassigned).responsavel_id, null);
      settings.distribution.include_unassigned = true;settings.distribution.people[0].limit = 1;settings.distribution.fallback_owner_id = colleague;configure(settings);const fallback = incoming();assert.equal(capture(fallback).captured, true);assert.equal(lead(fallback).responsavel_id, colleague);
      settings.distribution.fallback_owner_id = other;configure(settings);const invalidFallback = incoming();assert.equal(capture(invalidFallback).captured, true);assert.equal(lead(invalidFallback).responsavel_id, null);
      settings.distribution.people = [{ owner_id: colleague, weight: 2, limit: 0 }];settings.distribution.sources = ['meta'];configure(settings);const excluded = incoming();assert.equal(capture(excluded).captured, true);assert.equal(lead(excluded).responsavel_id, null);
      const included = incoming({ source: 'meta_ads' });assert.equal(capture(included).captured, true);assert.equal(lead(included).responsavel_id, colleague);assert.equal(lead(included).origem, 'meta_ads');
      settings.distribution.strategy = 'least_loaded';settings.distribution.sources = ['site'];configure(settings);const site = incoming({ source: 'site' });assert.equal(capture(site).captured, true);assert.equal(lead(site).responsavel_id, colleague);
      settings.distribution.people = [{ owner_id: other, weight: 1, limit: 0 }];delete settings.distribution.fallback_owner_id;configure(settings);const invalidPerson = incoming({ source: 'site' });assert.equal(capture(invalidPerson).captured, true);assert.equal(lead(invalidPerson).responsavel_id, null);
      const capacity = Number(sql(`SELECT count(*) FROM public.leads WHERE cliente_id='${client}' AND responsavel_id='${colleague}' AND crm_ia_archived_at IS NULL AND coalesce(status_vida,'ativo')='ativo'`));
      settings.distribution.people = [{ owner_id: colleague, weight: 1, limit: capacity + 1 }];configure(settings);
      const available = incoming({ source: 'site' }), full = incoming({ source: 'site' });assert.equal(capture(available).captured, true);assert.equal(lead(available).responsavel_id, colleague);assert.equal(capture(full).captured, true);assert.equal(lead(full).responsavel_id, null);
      settings.distribution.strategy = 'round_robin';settings.distribution.people = [{ owner_id: staff, weight: 2, limit: 0 }, { owner_id: colleague, weight: 1, limit: 0 }];configure(settings);
      const turn = Number(sql(`SELECT turn FROM planeje_private.crm_ia_distribution_state WHERE cliente_id='${client}'`));
      for (let step = 0; step < 3; step++) { const weighted = incoming({ source: 'site' });assert.equal(capture(weighted).captured, true);assert.equal(lead(weighted).responsavel_id, [staff, staff, colleague][(turn + step) % 3]); }
      settings.distribution.strategy = 'least_loaded';settings.distribution.people = [{ owner_id: admin, weight: 1, limit: 0 }, { owner_id: colleague, weight: 2, limit: 0 }];configure(settings);
      const least = sql(`SELECT owner_id FROM (VALUES('${admin}'::uuid,1),('${colleague}'::uuid,2)) p(owner_id,weight) ORDER BY (SELECT count(*) FROM public.leads WHERE cliente_id='${client}' AND responsavel_id=p.owner_id AND crm_ia_archived_at IS NULL AND coalesce(status_vida,'ativo')='ativo')::numeric/p.weight,p.owner_id LIMIT 1`);
      const balanced = incoming({ source: 'site' });assert.equal(capture(balanced).captured, true);assert.equal(lead(balanced).responsavel_id, least);
    });
    await t.test('configuração inválida reverte atomicamente e não toca estado humano', () => {
      const settings = baseConfig();settings.entry.channels[0].stage_id = id(999998);configure(settings);const row = incoming(), before = commercialState(), human = protectedState();
      assert.throws(() => capture(row), /crm_ia_entry_scope/);assert.equal(commercialState(), before);assert.equal(protectedState(), human);
      settings.entry.channels[0].stage_id = stage;settings.entry.channels[0].tags = [{}];configure(settings);
      assert.throws(() => capture(row), /etiqueta/i);assert.equal(commercialState(), before);assert.equal(protectedState(), human);
    });
    await t.test('writer legado de responsável ganha antes do rowlock: captura preserva owner e não consome turno', async () => {
      configure();const row = incoming(), key = existingLead(row), beforeTurn = sql(`SELECT turn FROM planeje_private.crm_ia_distribution_state WHERE cliente_id='${client}'`);
      const locker = connection();let pending;
      try {
        // The legacy editor takes only this lead row lock, not the CRM account lock.
        locker.child.stdin.write(`BEGIN;UPDATE public.leads SET responsavel_id='${colleague}' WHERE id='${key}';SELECT 'OWNER_ROW_LOCK_READY';\n`);await locker.waitFor('OWNER_ROW_LOCK_READY');
        pending = queryAsync(`SET application_name='capture-owner-qa';SET ROLE service_role;${captureStatement(row)}`);
        const deadline = Date.now() + 8000;
        while (sql("SELECT count(*) FROM pg_stat_activity WHERE application_name='capture-owner-qa' AND wait_event IN('transactionid','tuple');") !== '1') {
          if (Date.now() > deadline) throw Error('Captura não aguardou o writer legado da linha de lead.');
          await new Promise(resolve => setTimeout(resolve, 15));
        }
        locker.child.stdin.write('COMMIT;\n');
        const result = JSON.parse(await pending);assert.equal(result.captured, true);assert.equal(result.lead_id, key);
        assert.equal(lead(row).responsavel_id, colleague, 'não sobrescrever o responsável escolhido no editor');
        assert.equal(sql(`SELECT turn FROM planeje_private.crm_ia_distribution_state WHERE cliente_id='${client}'`), beforeTurn, 'não avançar roleta quando o owner já foi definido');
        const moved = incoming(), movedKey = existingLead(moved, { link: false });
        locker.child.stdin.write(`BEGIN;UPDATE public.leads SET whatsapp='5511912349876' WHERE id='${movedKey}';SELECT 'MATCH_ROW_LOCK_READY';\n`);await locker.waitFor('MATCH_ROW_LOCK_READY');
        pending = queryAsync(`SET application_name='capture-match-qa';SET ROLE service_role;${captureStatement(moved)}`);
        const matchDeadline = Date.now() + 8000;
        while (sql("SELECT count(*) FROM pg_stat_activity WHERE application_name='capture-match-qa' AND wait_event IN('transactionid','tuple');") !== '1') {
          if (Date.now() > matchDeadline) throw Error('Captura não aguardou a alteração do vínculo por telefone.');
          await new Promise(resolve => setTimeout(resolve, 15));
        }
        locker.child.stdin.write('COMMIT;\n');
        const changed = JSON.parse(await pending);assert.equal(changed.captured, false);assert.equal(changed.skipped, 'lead_changed');assert.equal(lead(moved), null);
        assert.equal(sql(`SELECT crm_ia_contact_id IS NULL AND whatsapp='5511912349876' FROM public.leads WHERE id='${movedKey}'`), 't');
        assert.equal(sql(`SELECT turn FROM planeje_private.crm_ia_distribution_state WHERE cliente_id='${client}'`), beforeTurn);
      } finally { locker.child.stdin.end('ROLLBACK;\n\\q\n');if (pending) await Promise.allSettled([pending]); }
    });
    await t.test('concorrência espera o mesmo lock da conta: uma criação/atribuição e revogação/mensagem nova vistas após espera', async () => {
      configure();const row = incoming(), human = protectedState(), beforeTurn = Number(sql(`SELECT turn FROM planeje_private.crm_ia_distribution_state WHERE cliente_id='${client}'`));
      const locker = connection(), children = [];
      try {
        locker.child.stdin.write(`BEGIN;SELECT pg_advisory_xact_lock(hashtextextended('crm-ia:${client}',0));SELECT 'CAPTURE_LOCK_READY';\n`);await locker.waitFor('CAPTURE_LOCK_READY');
        for (let n = 0; n < 2; n++) children.push(queryAsync(`SET application_name='capture-concurrent-qa';SET ROLE service_role;${captureStatement(row)}`));
        await waitBlocked('capture-concurrent-qa', 2);locker.child.stdin.write('COMMIT;\n');
        const results = (await Promise.all(children)).map(value => JSON.parse(value));
        assert.equal(results[0].captured, true);assert.deepEqual(results[0], results[1]);assert.equal(sql(`SELECT count(*) FROM public.leads WHERE crm_ia_contact_id='${row.contact}'`), '1');
        assert.equal(Number(sql(`SELECT turn FROM planeje_private.crm_ia_distribution_state WHERE cliente_id='${client}'`)), beforeTurn + 1);assert.equal(protectedState(), human);
        for (const change of ['actor', 'message']) {
          const pending = incoming();locker.child.stdin.write(`BEGIN;SELECT pg_advisory_xact_lock(hashtextextended('crm-ia:${client}',0));SELECT 'WAIT_${change}';\n`);await locker.waitFor(`WAIT_${change}`);
          const result = queryAsync(`SET application_name='capture-recheck-qa';SET ROLE service_role;${captureStatement(pending)}`);children.push(result);
          await waitBlocked('capture-recheck-qa', 1);
          if (change === 'actor') locker.child.stdin.write(`UPDATE public.profiles SET status='inactive' WHERE id='${admin}';COMMIT;\n`);
          else locker.child.stdin.write(`INSERT INTO public.cliente_whatsapp_inbox(cliente_id,whatsapp_config_id,from_jid,chat_jid,message_id,body,created_at) VALUES('${client}','${channel}',${quote(pending.jid)},${quote(pending.jid)},'new-while-waiting','Nova mensagem',clock_timestamp());COMMIT;\n`);
          const checked = JSON.parse(await result);assert.equal(checked.captured, false);assert.equal(checked.skipped, change === 'actor' ? 'disabled_or_owner' : 'message_changed');assert.equal(lead(pending), null);
          sql(`UPDATE public.profiles SET status='active' WHERE id='${admin}'`);
        }
      } finally {
        locker.child.stdin.end('ROLLBACK;\n\\q\n');await Promise.allSettled(children);
      }
    });
    await t.test('configuração negativa não espera o rowlock do lead legado', async group => {
      for (const kind of ['capture-missing', 'capture-off', 'intake-off']) await group.test(kind, async () => {
        const settings = baseConfig();settings.entry.enabled = false;settings.distribution.enabled = false;configure(settings);
        if (kind === 'capture-missing') sql(`DELETE FROM public.crm_ia_config WHERE cliente_id='${client}'`);
        const row = incoming(), key = existingLead(row);
        sql(`INSERT INTO public.cliente_atend_conversas(cliente_id,contact_id,assigned_to,ia_followup_due_at,ia_followup_delivery_state,crm_ia_runtime) VALUES('${client}','${row.contact}','${admin}','2099-01-01T00:00Z','pending','{"active":true}')`);
        const commercial = commercialState(), human = protectedState(), locker = connection();let pending;
        try {
          locker.child.stdin.write(`BEGIN;SELECT id FROM public.leads WHERE id='${key}' FOR UPDATE;SELECT 'EARLY_DENY_ROW_READY';\n`);await locker.waitFor('EARLY_DENY_ROW_READY');
          const statement = kind === 'intake-off' ? `SELECT public.crm_ia_agent_intake('${client}','${channel}','${row.contact}','Olá');` : captureStatement(row);
          // The writer stays open until the call returns. Any attempt to lock its
          // lead fails deterministically; there is no wall-clock performance assertion.
          pending = queryAsync(`SET lock_timeout='200ms';SET ROLE service_role;${statement}`);
          const result = JSON.parse(await pending);assert.equal(result.skipped, kind === 'intake-off' ? 'disabled_or_owner' : 'capture_disabled');
          assert.equal(commercialState(), commercial);
          if (kind === 'intake-off') assert.equal(sql(`SELECT ia_followup_due_at IS NULL AND ia_followup_delivery_state='cancelled' FROM public.cliente_atend_conversas WHERE contact_id='${row.contact}'`), 't');
          else { assert.equal(result.captured, false);assert.equal(result.lead_id, null);assert.equal(protectedState(), human); }
        } finally { locker.child.stdin.end('ROLLBACK;\n\\q\n');if (pending) await Promise.allSettled([pending]);configure(); }
      });
    });
    await t.test('gates e fonte são atuais depois da espera pelo rowlock do lead', async group => {
      const cases = [
        ['actor-revoked', `UPDATE public.profiles SET status='inactive' WHERE id='${admin}'`, 'disabled_or_owner'],
        ['message-replaced', null, 'message_changed'],
        ['channel-archived', `UPDATE public.cliente_whatsapp_config SET archived_at=now() WHERE id='${channel}'`, 'scope'],
        ['channel-access-revoked', `INSERT INTO public.atendimento_usuario_acesso(cliente_id,user_id,whatsapp_config_id) VALUES('${client}','${admin}','${hiddenChannel}')`, 'actor_scope'],
        ['crm-module-revoked', `INSERT INTO public.user_module_permissions VALUES('${admin}','crm',false)`, 'disabled_or_owner'],
        ['attendance-tracking-revoked', "INSERT INTO public.module_settings VALUES('atendimento',false),('rastreamento',false)", 'actor_scope'],
        ['contact-private', null, 'actor_scope'],
        ['lead-responsible', null, 'lead_scope'],
        ['capture-config-disabled', null, 'capture_disabled'],
        ['test-mode-changed', null, 'test_number_not_allowed'],
      ];
      for (const [kind, change, skipped] of cases) await group.test(kind, async () => {
        const settings = baseConfig();settings.distribution.people = [{ owner_id: colleague, weight: 1, limit: 0 }];
        configure(settings, kind === 'lead-responsible' ? colleague : admin);
        const row = incoming(), key = existingLead(row, { link: false });
        sql(`INSERT INTO public.cliente_atend_conversas(cliente_id,contact_id,assigned_to) VALUES('${client}','${row.contact}','${kind === 'lead-responsible' ? colleague : admin}')`);
        const beforeTurn = sql(`SELECT coalesce((SELECT turn FROM planeje_private.crm_ia_distribution_state WHERE cliente_id='${client}'),0)`);
        const locker = connection();let pending;
        try {
          locker.child.stdin.write(`BEGIN;UPDATE public.leads SET observacoes=observacoes WHERE id='${key}';SELECT 'P1_ROW_READY';\n`);await locker.waitFor('P1_ROW_READY');
          pending = queryAsync(`SET application_name='capture-p1-qa';SET ROLE service_role;${captureStatement(row)}`);
          const deadline = Date.now() + 8000;
          while (sql("SELECT count(*) FROM pg_stat_activity WHERE application_name='capture-p1-qa' AND wait_event IN('transactionid','tuple')") !== '1') {
            if (Date.now() > deadline) throw Error(`Não aguardou rowlock em ${kind}`);
            await new Promise(resolve => setTimeout(resolve, 15));
          }
          if (change) sql(change);
          else if (kind === 'message-replaced') sql(`INSERT INTO public.cliente_whatsapp_inbox(cliente_id,whatsapp_config_id,from_jid,chat_jid,message_id,body,is_group,created_at) VALUES('${client}','${channel}',${quote(row.jid)},${quote(row.jid)},${quote(`${row.message}-latest`)},'Nova enquanto aguardava o lead',false,clock_timestamp())`);
          else if (kind === 'contact-private') sql(`UPDATE public.cliente_atend_conversas SET privado=true,assigned_to='${colleague}' WHERE contact_id='${row.contact}'`);
          else if (kind === 'lead-responsible') sql(`INSERT INTO public.user_module_access VALUES('${colleague}','crm','responsible')`);
          else if (kind === 'capture-config-disabled') { settings.entry.enabled = false;settings.distribution.enabled = false;configure(settings); }
          else if (kind === 'test-mode-changed') { settings.test_mode = { enabled: true, phones: [] };configure(settings); }
          if (kind === 'actor-revoked') assert.equal(sql(`SELECT private.crm_ia_agent_actor('${client}','${admin}')`), 'f');
          const human = protectedState();locker.child.stdin.write('COMMIT;\n');
          const result = JSON.parse(await pending);assert.equal(result.captured, false, `${kind} não pode vincular/distribuir depois da espera`);assert.equal(result.skipped, skipped);assert.equal(result.lead_id, null);
          assert.equal(sql(`SELECT crm_ia_contact_id IS NULL AND responsavel_id IS NULL FROM public.leads WHERE id='${key}'`), 't');
          assert.equal(sql(`SELECT coalesce((SELECT turn FROM planeje_private.crm_ia_distribution_state WHERE cliente_id='${client}'),0)`), beforeTurn);assert.equal(protectedState(), human);
        } finally {
          locker.child.stdin.end('ROLLBACK;\n\\q\n');if (pending) await Promise.allSettled([pending]);
          sql(`UPDATE public.profiles SET status='active' WHERE id='${admin}';UPDATE public.cliente_whatsapp_config SET archived_at=NULL WHERE id='${channel}';DELETE FROM public.atendimento_usuario_acesso;DELETE FROM public.module_settings;DELETE FROM public.user_module_permissions;DELETE FROM public.user_module_access WHERE user_id='${colleague}'`);configure();
        }
      });
    });
    await t.test('intake antigo mantém envelopes/gate/cancelamento/restart nos escopos válidos e helper só é alcançado pelos wrappers', () => {
      const settings = baseConfig();settings.attendance.auto_send = true;configure(settings);
      const row = incoming(), key = existingLead(row, { owner: admin });
      sql(`INSERT INTO public.cliente_atend_conversas(cliente_id,contact_id,assigned_to,ia_pausada,status) VALUES('${client}','${row.contact}','${admin}',false,'esperando')`);
      const golden = JSON.parse(sql(`SELECT private.capture_legacy_intake('${client}','${channel}','${row.contact}','Olá')`));
      assert.deepEqual(intake(row), golden);assert.equal(golden.lead.id, key);assert.equal(golden.actor_id, admin);
      const newRow = incoming(), automated = intake(newRow);assert.ok(automated.lead.id);assert.ok(automated.conversation.id);assert.deepEqual(automated.lead.etiquetas, ['VIP', 'Novo']);
      sql(`UPDATE public.cliente_atend_conversas SET crm_ia_runtime='{"closed":true}',status='finalizado',ia_pausada=false WHERE contact_id='${row.contact}'`);
      assert.equal(intake(row).conversation.crm_ia_runtime.closed, undefined);assert.equal(intake(row).conversation.status, 'esperando');
      configure();const human = protectedState();assert.equal(capture(first).captured, true);assert.equal(protectedState(), human);
      assert.equal(intake(first).skipped, 'disabled_or_owner');assert.equal(sql(`SELECT ia_followup_due_at IS NULL AND ia_followup_delivery_state='cancelled' FROM public.cliente_atend_conversas WHERE contact_id='${first.contact}'`), 't');
      assert.equal(attributes(), beforeAttributes);assert.equal(core(), beforeCore);
      const helper = 'private.crm_ia_prepare_entry(uuid,uuid,uuid,text,boolean,text)', entry = 'public.crm_ia_capture_inbound(uuid,uuid,uuid,text)';
      assert.equal(sql("SELECT to_regprocedure('private.crm_ia_prepare_entry(uuid,uuid,uuid,text,boolean)') IS NULL"), 't');
      for (const signature of [helper, entry]) {
        const properties = JSON.parse(sql(`SELECT jsonb_build_object('volatile',provolatile,'config',proconfig,'owner',proowner,'language',prolang) FROM pg_proc WHERE oid='${signature}'::regprocedure`));
        const original = JSON.parse(beforeAttributes);
        assert.equal(properties.volatile, 'v');assert.deepEqual(properties.config, original.proconfig);assert.equal(properties.owner, original.proowner);assert.equal(properties.language, original.prolang);
      }
      assert.equal(sql(`SELECT NOT prosecdef FROM pg_proc WHERE oid='${helper}'::regprocedure`), 't');assert.equal(sql(`SELECT prosecdef FROM pg_proc WHERE oid='${entry}'::regprocedure`), 't');
      for (const role of ['anon', 'authenticated', 'service_role']) assert.equal(sql(`SELECT has_function_privilege('${role}','${helper}','EXECUTE')`), 'f');
      for (const role of ['anon', 'authenticated']) {
        assert.equal(sql(`SELECT has_function_privilege('${role}','${entry}','EXECUTE')`), 'f');assert.throws(() => sql(`SET ROLE ${role};${captureStatement(first)}`), /permission denied/);
      }
      assert.equal(sql(`SELECT has_function_privilege('service_role','${entry}','EXECUTE')`), 't');
      assert.throws(() => sql(`SET ROLE service_role;SELECT private.crm_ia_prepare_entry('${client}','${channel}','${first.contact}','arbitrário',true,NULL)`), /permission denied/);
      assert.equal(sql(`SELECT bool_and(NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE')) FROM pg_proc p WHERE p.oid IN('${helper}'::regprocedure,'${entry}'::regprocedure)`), 't');
      assert.equal(sql('SELECT count(*) FROM public.crm_ia_outbox'), '0');assert.equal(sql('SELECT count(*) FROM planeje_private.crm_ia_agent_runs'), '0');assert.equal(sql('SELECT count(*) FROM public.cliente_atend_ia_log'), '0');
    });
  } finally {
    globalThis.fetch = previousFetch;
    if (started) run('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop']);
    rmSync(work, { recursive: true, force: true });
  }
});

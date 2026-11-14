import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

export const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const ids = { admin: id(1), staff: id(2), other: id(3), client: id(11), foreign: id(12), channel: id(21), hiddenChannel: id(22), contact: id(31), session: id(91), otherSession: id(92) };
export const literal = value => value === null || value === undefined ? 'NULL' : `'${String(value).replaceAll("'", "''")}'`;
export const json = value => `${literal(JSON.stringify(value))}::jsonb`;
const migration = file => readFileSync(new URL('../../supabase/migrations/' + file, import.meta.url), 'utf8');
export const deliveryMigration = '20261112043549_atlas_executor_crm_delivery.sql';

export function deliveryDatabase() {
  const work = mkdtempSync('/tmp/atlas-crm-delivery-'), data = join(work, 'data'), env = { PATH: process.env.PATH, LC_ALL: 'C' };
  const psql = ['-X', '-Aqt', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose', '-h', work, '-p', '55537', '-U', 'atlas_crm_delivery_qa', '-d', 'postgres'];
  let started = false; let sequence = 1000; let nativeBefore;
  function run(binary, args, input) {
    const result = spawnSync(binary, args, { input, env, encoding: 'utf8', timeout: 30000 });
    if (result.error || result.status !== 0) throw Error(result.stderr?.trim() || result.error?.message || result.stdout);
    return result.stdout.trim();
  }
  const sql = source => run('psql', psql, source);
  const userSql = (statement, options = {}) => `BEGIN;SET LOCAL ROLE ${options.role || 'authenticated'};SET LOCAL test.uid=${literal(options.actor || ids.admin)};SET LOCAL request.jwt.claims=${literal(JSON.stringify({ sub: options.actor || ids.admin, role: options.role || 'authenticated', ...(options.session !== null && { session_id: options.session || ids.session }), ...(options.delegate && { planeje_server_delegate: options.delegate }) }))};${statement};COMMIT;`;
  const asUser = (statement, options) => sql(userSql(statement, options));
  const asService = statement => sql(`BEGIN;SET LOCAL ROLE service_role;SET LOCAL test.uid='';SET LOCAL request.jwt.claims='{"role":"service_role"}';${statement};COMMIT;`);
  const nativeMetadata = () => JSON.parse(sql(`SELECT jsonb_agg(jsonb_build_object('attributes',to_jsonb(p)-'prosrc'-'prosqlbody',
    'unchanged_body',CASE WHEN p.proname<>'crm_ia_delivery_recheck_base' THEN p.prosrc END) ORDER BY p.oid) FROM pg_proc p WHERE p.oid IN(
    'public.crm_ia_delivery_claim(timestamptz,uuid[])'::regprocedure,'public.crm_ia_delivery_recheck(uuid,uuid)'::regprocedure,
    'public.crm_ia_delivery_recheck_base(uuid,uuid)'::regprocedure,'public.crm_ia_delivery_recheck_pre_voice(uuid,uuid)'::regprocedure,
    'public.crm_ia_delivery_recheck_pre_calendar(uuid,uuid)'::regprocedure,'public.crm_ia_delivery_recheck_pre_notifications(uuid,uuid)'::regprocedure,
    'public.crm_ia_delivery_actor_check(uuid,text)'::regprocedure,'public.crm_ia_delivery_start(text,uuid,uuid)'::regprocedure)`));
  const rpc = (name, args, options) => JSON.parse(asUser(`SELECT public.${name}(${Object.entries(args).map(([key, value]) => `${key}=>${value && typeof value === 'object' ? json(value) : literal(value)}`).join(',')})`, options));
  const context = () => rpc('atlas_executor_crm_delivery_context', { p_client: ids.client, p_contact: ids.contact, p_channel: ids.channel });
  function newRun() {
    const conversation = id(++sequence), run = id(++sequence);
    sql(`INSERT INTO atlas_conversations(id,owner_id,client_id,title) VALUES('${conversation}','${ids.admin}','${ids.client}','Mensagem sintética');
      INSERT INTO atlas_runs(id,owner_id,request_id,conversation_id,request_conversation_id,request_client_id,request_message,status,source_session_id)
      VALUES('${run}','${ids.admin}','${id(++sequence)}','${conversation}','${conversation}','${ids.client}','[Executor Planeje]\nEnvie uma mensagem de teste.','processing','${ids.session}');`);
    return run;
  }
  const store = prepared => rpc('atlas_executor_store', { p_run: newRun(), p_call_id: 'send-' + (++sequence), p_item: { kind: 'proposal', ...prepared } });
  const decideStatement = item => `SELECT public.atlas_executor_decide('${item.id}',${item.revision},'approve','{}',NULL)`;
  const decide = (item, options) => JSON.parse(asUser(decideStatement(item), options));
  const caller = { rpc: async (name, args) => { try { return { data: rpc(name, args), error: null }; } catch (error) { return { data: null, error: { message: error.message, code: /42501/.test(error.message) ? '42501' : '40001' } }; } } };
  function start() {
    run('initdb', ['-D', data, '-U', 'atlas_crm_delivery_qa', '--auth-local=trust', '--auth-host=reject', '--no-locale', '--encoding=UTF8']);
    run('pg_ctl', ['-D', data, '-l', join(work, 'postgres.log'), '-o', `-k ${work} -p 55537 -c listen_addresses='' -c unix_socket_permissions=0700`, '-w', 'start']); started = true;
    assert.equal(sql('SHOW listen_addresses'), ''); assert.equal(Math.floor(Number(sql('SHOW server_version_num')) / 10000), 16);
    const source = readFileSync(new URL('../crm-ia/workspace.database.test.mjs', import.meta.url), 'utf8').split('    sql(`')[1].split('    `);')[0].replace(/\$\{(\w+)\}/g, (_, name) => ids[name]);
    sql(source.replace(/      CREATE TABLE public\.crm_ia_outbox\([^\n]+\n/, ''));
    sql(`CREATE SCHEMA planeje_private;CREATE TABLE auth.users(id uuid PRIMARY KEY,banned_until timestamptz);CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid REFERENCES auth.users(id),not_after timestamptz);
      CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
      CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$SELECT auth.jwt()->>'role'$$;
      INSERT INTO auth.users(id) SELECT id FROM profiles;INSERT INTO auth.sessions(id,user_id) VALUES('${ids.session}','${ids.admin}'),('${ids.otherSession}','${ids.staff}');
      ALTER TABLE profiles ADD COLUMN avatar_url text;ALTER TABLE cliente_whatsapp_contact ADD COLUMN last_message_at timestamptz,ADD COLUMN origin_source text DEFAULT 'nao_identificado',ADD COLUMN qualificado boolean,ADD COLUMN profile_pic_url text;
      ALTER TABLE cliente_whatsapp_sent ADD COLUMN sent_by uuid;ALTER TABLE leads ADD COLUMN qualificado boolean;ALTER TABLE cliente_atend_conversas ADD COLUMN ia_followup_passo integer DEFAULT 0;
      CREATE TABLE atendimento_conversas(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cliente_id uuid,whatsapp_config_id uuid,chat_jid text,archived_at timestamptz,bloqueada boolean DEFAULT false,is_group boolean DEFAULT false,display_name text,updated_at timestamptz DEFAULT now(),UNIQUE(cliente_id,whatsapp_config_id,chat_jid));
      CREATE TABLE atendimento_conversa_planejamento(id uuid PRIMARY KEY,cliente_id uuid,conversation_id uuid,whatsapp_config_id uuid,chat_jid text,kind text,body text,status text,scheduled_at timestamptz,completed_at timestamptz,error_message text,updated_at timestamptz DEFAULT now());
      GRANT SELECT ON profiles,clientes TO authenticated;GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;INSERT INTO module_settings VALUES('assistant',true),('crm',true);`);
    const auth = migration('20261013140451_invite_only_access.sql');
    for (const name of ['private.planeje_live_session', 'private.planeje_approved_access', 'public.planeje_current_account_access']) {
      const match = auth.match(new RegExp(`create or replace function ${name.replaceAll('.', '\\.')}\\(\\)[\\s\\S]+?\\$\\$;`, 'i')); assert.ok(match, name); sql(match[0]);
    }
    sql('GRANT EXECUTE ON FUNCTION private.planeje_live_session(),private.planeje_approved_access(),public.planeje_current_account_access() TO authenticated,service_role');
    for (const file of ['20261111041703_crm_ia_delivery_runtime.sql', '20261111041704_crm_ia_workspace.sql', '20261111043800_crm_ia_workspace_readings.sql', '20261111044652_crm_ia_agent_runtime.sql', '20261111062101_crm_ia_calendar.sql', '20261111062548_crm_ia_voice.sql', '20261111072502_crm_ia_calendar_delivery.sql', '20261111075558_crm_ia_agent_template_contract.sql', '20261111090001_crm_ia_appointment_actions.sql', '20261111090002_crm_ia_agent_drafts_voice_modes.sql', '20261111090003_crm_ia_lead_tags.sql', '20261111101501_crm_ia_lead_profiles.sql', '20261111101502_crm_ia_lead_reads.sql', '20261111120001_crm_ia_internal_notifications.sql', '20261111120002_crm_ia_conversation_controls.sql', '20261111162400_crm_ia_conversation_read_performance.sql', '20261111185514_crm_ia_message_authorship.sql', '20261111203128_crm_ia_conversation_access_performance.sql', '20261111220814_crm_ia_conversation_header.sql']) sql(migration(file));
    const blocked = migration('20261008160000_atendimento_conversa_bloqueio.sql').split('CREATE OR REPLACE FUNCTION')[0]; sql(blocked);
    sql(migration('20261009004301_atlas_personal_assistant.sql')); sql(`UPDATE atlas_settings SET owner_id='${ids.admin}',enabled=true WHERE id='atlas';`);
    sql(migration('20261112032940_atlas_executor.sql')); nativeBefore = nativeMetadata(); sql(migration(deliveryMigration));
    sql(`INSERT INTO cliente_atend_conversas(cliente_id,contact_id,status,ia_pausada,assigned_to) VALUES('${ids.client}','${ids.contact}','esperando',false,'${ids.admin}');
      INSERT INTO atendimento_conversas(cliente_id,whatsapp_config_id,chat_jid,display_name) VALUES('${ids.client}','${ids.channel}','551199999999@s.whatsapp.net','Contato fictício');`);
  }
  function stop() { if (started) run('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop']); rmSync(work, { recursive: true, force: true }); }
  return { start, stop, sql, userSql, asUser, asService, rpc, caller, context, store, decide, decideStatement, psql, env, work, nativeMetadata, nativeBefore: () => nativeBefore };
}

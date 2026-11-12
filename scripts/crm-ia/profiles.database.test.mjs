import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const work = mkdtempSync('/tmp/crm-profiles-db-'), data = join(work, 'data'), env = { PATH: process.env.PATH, LC_ALL: 'C' };
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const context = Object.fromEntries(['admin', 'staff', 'other', 'client', 'foreign', 'channel', 'hiddenChannel', 'contact'].map((key, i) => [key, id([1, 2, 3, 11, 12, 21, 22, 31][i])]));
const { admin, staff, other, client, foreign, channel, hiddenChannel, contact } = context, pipeline = id(41), stage = id(51);
const quote = value => `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
function run(name, args, input) { const r = spawnSync(name, args, { input, env, encoding: 'utf8', timeout: 25000 }); if (r.error || r.status) throw new Error(r.stderr || r.error?.message); return r.stdout.trim(); }
const sql = input => run('psql', ['-X', '-Aqt', '-v', 'ON_ERROR_STOP=1', '-h', work, '-p', '55501', '-U', 'profiles_qa', '-d', 'postgres'], input);
const call = (action, payload = {}, uid = admin, target = client) => JSON.parse(sql(`BEGIN;SET LOCAL ROLE authenticated;SET LOCAL test.uid='${uid}';SELECT public.crm_ia_workspace('${action}','${target}',${quote(payload)});COMMIT;`));
const row = (table, key) => JSON.parse(sql(`SELECT to_jsonb(t) FROM ${table} t WHERE id='${key}'`));
const rpc = (name, args) => JSON.parse(sql(`SET ROLE service_role;SELECT to_jsonb(public.${name}(${args}));`));
const profile = (n = 1, patch = {}) => ({ id: id(100 + n), nome: ' Decidido ', cor: '#AABBCC', descricao: ' Quer contratar. ', pistas: [' Agora ', 'Agora'], actions: { owner_id: staff, tags: [' Perfil ', 'VIP', 'Perfil'] }, ...patch });
const rules = profiles => ({ crm_ia: { tipo: 'qualificacao', pipeline_id: pipeline, stage_ids: [stage], variaveis: [], profiles, destino: { tipo: 'humano' } } });
const ref = (agent, profileId = id(101)) => ({ agent_id: agent.id, id: profileId, agent_updated_at: agent.updated_at });
const migration = file => readFileSync(new URL(`../../supabase/migrations/${file}`, import.meta.url), 'utf8');
function legacyFunction(file, name) {
  const definition = migration(file).match(new RegExp(`create(?: or replace)? function ${name.replaceAll('.', '\\.')}\\([\\s\\S]*?\\$\\$;`, 'i'));
  assert.ok(definition, `missing legacy function ${name}`); return definition[0];
}
const direct = (uid, statement) => sql(`BEGIN;SET LOCAL ROLE authenticated;SET LOCAL test.uid='${uid}';${statement};ROLLBACK;`);
const summary = (uid, target = client) => JSON.parse(direct(uid, `SELECT coalesce(jsonb_agg(to_jsonb(a)),'[]') FROM public.cliente_atend_ia_agentes_resumo('${target}') a`));
function connection() {
  const child = spawn('psql', ['-X', '-Aqt', '-v', 'ON_ERROR_STOP=1', '-h', work, '-p', '55501', '-U', 'profiles_qa', '-d', 'postgres'], { env, stdio: ['pipe', 'pipe', 'pipe'] });
  let stderr = '', sequence = 0;
  child.stderr.on('data', chunk => { stderr += chunk; });
  const done = new Promise((resolve, reject) => { child.on('error', reject); child.on('close', code => resolve({ code, stderr })); });
  return { child, done, async query(statement) {
    const marker = `query_${++sequence}_done`;
    const output = new Promise((resolve, reject) => {
      let text = '';
      const timer = setTimeout(() => { cleanup(); reject(Error('Timed out waiting for profile fixture connection')); }, 3000);
      const receive = chunk => { text += chunk; if (text.includes(marker)) { cleanup(); resolve(text.split(marker)[0].trim()); } };
      const fail = () => { cleanup(); reject(Error(stderr || 'Profile fixture connection closed')); };
      function cleanup() { clearTimeout(timer); child.stdout.off('data', receive); child.off('close', fail); }
      child.stdout.on('data', receive); child.once('close', fail);
    });
    child.stdin.write(`${statement}\n\\echo ${marker}\n`); return output;
  } };
}

test('perfis publicados mantêm identidade, ACL, snapshots, histórico e CAS sem inflar gates', async t => {
  let started = false;
  try {
    run('initdb', ['-D', data, '-U', 'profiles_qa', '--auth-local=trust', '--auth-host=reject', '--no-locale', '--encoding=UTF8']);
    run('pg_ctl', ['-D', data, '-l', join(work, 'pg.log'), '-o', `-k ${work} -p 55501 -c listen_addresses='' -c unix_socket_permissions=0700`, '-w', 'start']); started = true;
    assert.equal(sql('SHOW listen_addresses'), '');
    const fixture = readFileSync(new URL('./workspace.database.test.mjs', import.meta.url), 'utf8').split('    sql(`')[1].split('    `);')[0].replace(/\$\{(\w+)\}/g, (_, name) => context[name]);
    sql(fixture.replace(/      CREATE TABLE public\.crm_ia_outbox\([^\n]+\n/, ''));
    sql(`CREATE SCHEMA planeje_private;CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid,not_after timestamptz);CREATE TABLE auth.users(id uuid PRIMARY KEY,banned_until timestamptz);
      CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT jsonb_build_object('sub',auth.uid(),'session_id',auth.uid())$$;
      CREATE TABLE cliente_atend_membros(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cliente_id uuid,user_id uuid,nivel text,ativo boolean DEFAULT true);
      INSERT INTO profiles(id,role,status,full_name,cliente_id) VALUES('${id(4)}','cliente','active','Admin da loja','${client}'),('${id(5)}','cliente','active','Supervisão','${client}'),('${id(6)}','superadmin','active','Gestão global',NULL),('${id(7)}','cliente','active','Outra loja','${foreign}');
      INSERT INTO auth.users(id) SELECT id FROM profiles;INSERT INTO auth.sessions(id,user_id) SELECT id,id FROM profiles;
      INSERT INTO cliente_atend_membros(cliente_id,user_id,nivel) VALUES('${client}','${other}','atendente'),('${client}','${id(4)}','admin'),('${client}','${id(5)}','supervisor'),('${foreign}','${id(7)}','admin');
      INSERT INTO client_module_permissions(cliente_id,module_name,is_enabled) VALUES('${client}','atendimento_loja',true),('${foreign}','atendimento_loja',true);
      ALTER TABLE cliente_whatsapp_contact ADD COLUMN last_message_at timestamptz,ADD COLUMN origin_source text DEFAULT 'nao_identificado',ADD COLUMN qualificado boolean;
      ALTER TABLE leads ADD COLUMN qualificado boolean;ALTER TABLE cliente_atend_conversas ADD COLUMN ia_followup_passo integer DEFAULT 0;
      CREATE TABLE atendimento_conversas(id uuid PRIMARY KEY,cliente_id uuid,whatsapp_config_id uuid,chat_jid text,archived_at timestamptz,bloqueada boolean DEFAULT false);
      CREATE TABLE atendimento_conversa_planejamento(id uuid PRIMARY KEY,cliente_id uuid,conversation_id uuid,whatsapp_config_id uuid,chat_jid text,kind text,body text,status text,scheduled_at timestamptz,completed_at timestamptz,error_message text,updated_at timestamptz DEFAULT now());
      GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;`);
    for (const name of ['private.planeje_live_session', 'private.planeje_approved_access', 'public.planeje_current_account_access']) sql(legacyFunction('20261013140451_invite_only_access.sql', name));
    for (const name of ['public.cliente_atend_loja_habilitada', 'public.cliente_atend_nivel_de']) sql(legacyFunction('20261006140000_atendimento_loja_modulo.sql', name));
    for (const name of ['public.cliente_atend_nivel', 'public.cliente_atend_is_membro', 'public.cliente_atend_is_admin', 'public.cliente_atend_is_superadmin']) sql(legacyFunction('20260928230000_cliente_atend_inbox.sql', name));
    sql('ALTER TABLE cliente_atend_ia_agentes ENABLE ROW LEVEL SECURITY;GRANT SELECT,INSERT,UPDATE,DELETE ON cliente_atend_ia_agentes TO authenticated');
    for (const name of ['cliente_atend_ia_agentes_select', 'cliente_atend_ia_agentes_write']) sql(migration('20260929040000_cliente_atend_ia.sql').match(new RegExp(`create policy ${name}\\b[\\s\\S]*?;`, 'i'))[0]);
    sql(migration('20261013140451_invite_only_access.sql').match(/execute format\('(create policy planeje_approved_account[^']+)'/i)[1].replace('%I', 'cliente_atend_ia_agentes'));
    for (const file of ['20261111041703_crm_ia_delivery_runtime.sql', '20261111041704_crm_ia_workspace.sql', '20261111043800_crm_ia_workspace_readings.sql', '20261111044652_crm_ia_agent_runtime.sql', '20261111062101_crm_ia_calendar.sql', '20261111062548_crm_ia_voice.sql', '20261111072502_crm_ia_calendar_delivery.sql', '20261111075558_crm_ia_agent_template_contract.sql', '20261111090001_crm_ia_appointment_actions.sql', '20261111090002_crm_ia_agent_drafts_voice_modes.sql', '20261111090003_crm_ia_lead_tags.sql']) sql(readFileSync(new URL(`../../supabase/migrations/${file}`, import.meta.url), 'utf8'));
    for (const file of ['20261111101501_crm_ia_lead_profiles.sql', '20261111101502_crm_ia_lead_reads.sql']) {
      sql(readFileSync(new URL(`../../supabase/migrations/${file}`, import.meta.url), 'utf8'));
    }
    sql(`INSERT INTO crm_pipelines(id,cliente_id,nome) VALUES('${pipeline}','${client}','Fixture');INSERT INTO crm_stages(id,pipeline_id,nome) VALUES('${stage}','${pipeline}','Entrada');
      INSERT INTO crm_ia_config(cliente_id,data,updated_by) VALUES('${client}','{"attendance":{"auto_send":true}}','${admin}');`);
    await t.test('publicação normaliza e restringe perfis; rascunho permanece privado sem efeitos', () => {
      assert.deepEqual(call('workspace').lead_profiles, []);
      const d = call('agent_draft', { pipeline_id: pipeline, tipo: 'qualificacao' });
      const saved = call('save_agent_draft', { pipeline_id: pipeline, tipo: 'qualificacao', revision: d.revision, data: { nome: '', funil: rules([profile(1, { descricao: '' })]) } });
      assert.equal(call('workspace').lead_profiles.length, 0);
      assert.throws(() => call('publish_agent_draft', { pipeline_id: pipeline, tipo: 'qualificacao', revision: saved.revision }), /perfil|identidade/i);
      assert.equal(sql('SELECT count(*) FROM cliente_atend_ia_agentes'), '0');
    });
    let agent = call('save_agent', { nome: 'Agente QA', auto_responder: true, funil: rules([profile()]) });
    await t.test('snapshots aceitam só referência explícita e versão publicada; omissão preserva e null limpa', () => {
      assert.equal(agent.funil.crm_ia.profiles[0].nome, 'Decidido');
      assert.equal(agent.funil.crm_ia.profiles[0].cor, '#aabbcc');
      assert.deepEqual(agent.funil.crm_ia.profiles[0].pistas, ['Agora']);
      assert.deepEqual(agent.funil.crm_ia.profiles[0].actions.tags, ['Perfil', 'VIP']);
      const meta = call('workspace', {}, staff).lead_profiles[0];
      assert.deepEqual(Object.keys(meta).sort(), ['agent_id', 'agent_updated_at', 'cor', 'id', 'nome', 'pipeline_id']);
      let lead = call('save_lead', { nome: 'Lead QA', whatsapp: '551199990001', pipeline_id: pipeline, stage_id: stage, responsavel_id: admin, etiquetas: ['Humano'], profile: ref(agent) });
      assert.equal(lead.crm_ia_profile.id, id(101)); assert.equal(lead.responsavel_id, staff); assert.deepEqual(lead.etiquetas, ['Humano', 'Perfil', 'VIP']);
      const snapshot = lead.crm_ia_profile;
      assert.throws(() => call('save_lead', { id: lead.id, expected_updated_at: lead.updated_at, crm_ia_profile: { ...snapshot, nome: 'Forjado' } }), /perfil/i);
      lead = call('save_lead', { id: lead.id, expected_updated_at: lead.updated_at, responsavel_id: admin, etiquetas: ['Escolha humana'] });
      lead = call('save_lead', { id: lead.id, expected_updated_at: lead.updated_at, profile: ref(agent) });
      assert.equal(lead.responsavel_id, admin); assert.deepEqual(lead.etiquetas, ['Escolha humana']); assert.deepEqual(lead.crm_ia_profile, snapshot);
      const detail = call('lead', { id: lead.id }); assert.equal(detail.profile_history.length, 1); assert.equal(detail.profile_history[0].to_profile.id, id(101));
      assert.equal(sql('SELECT count(*) FROM crm_funnel_events'), '0'); assert.equal(sql('SELECT count(*) FROM crm_lead_interacoes'), '0');
      assert.throws(() => call('save_lead', { id: lead.id, expected_updated_at: '2020-01-01', profile: null }), /versão|alterad/i);
      assert.throws(() => call('save_lead', { id: lead.id, expected_updated_at: lead.updated_at, profile: { ...ref(agent), agent_updated_at: '2020-01-01' } }), /perfil|versão|alterad/i);
      assert.throws(() => call('save_lead', { id: lead.id, expected_updated_at: lead.updated_at, profile: ref(agent, id(999)) }), /perfil/i);
      assert.throws(() => call('save_lead', { id: lead.id, expected_updated_at: lead.updated_at, profile: ref(agent) }, staff), /acesso|indisponível/i);
      assert.throws(() => call('save_lead', { id: lead.id, expected_updated_at: lead.updated_at, profile: ref(agent) }, admin, foreign), /acesso|indisponível/i);
      assert.throws(() => call('lead', { id: lead.id }, other), /acesso/i);
      lead = call('save_lead', { id: lead.id, expected_updated_at: lead.updated_at, profile: null });
      assert.equal(lead.crm_ia_profile, null); assert.equal(call('lead', { id: lead.id }).profile_history.length, 2);
    });
    await t.test('definições rejeitam ações externas, IDs duplicados, formatos e responsáveis revogados', () => {
      for (const profiles of [[profile(), profile()], [profile(1, { id: 'inventado' })], [profile(1, { cor: 'red' })], [profile(1, { descricao: '' })], [profile(1, { pistas: [1] })], [profile(1, { actions: { stage_id: stage } })], [profile(1, { actions: { tags: [{}] } })], [profile(1, { actions: { owner_id: other } })], Array.from({ length: 31 }, (_, n) => profile(n + 1))]) {
        assert.throws(() => call('save_agent', { id: agent.id, expected_updated_at: agent.updated_at, funil: rules(profiles) }), /perf(?:il|is)|pista|etiqueta|responsável/i);
        assert.equal(row('cliente_atend_ia_agentes', agent.id).updated_at, agent.updated_at);
      }
      assert.throws(() => call('save_agent', { nome: 'Retomada inválida', funil: { crm_ia: { ...rules([profile()]).crm_ia, tipo: 'followup' } } }), /perf(?:il|is)/i);
    });
    await t.test('SQL direto não pode forjar snapshots por GUC, e auditoria é append-only', () => {
      const lead = call('save_lead', { nome: 'Protegido', whatsapp: '551199990002', pipeline_id: pipeline, profile: ref(agent) });
      sql('GRANT SELECT,UPDATE,INSERT ON public.leads TO authenticated');
      for (const settings of ['', "SET LOCAL crm_ia.allow_profile_write='true';SET LOCAL request.jwt.claim.role='service_role';"]) {
        assert.throws(() => sql(`BEGIN;SET LOCAL ROLE authenticated;SET LOCAL test.uid='${admin}';${settings}UPDATE leads SET crm_ia_profile=NULL WHERE id='${lead.id}';COMMIT;`), /perfil|autorizad/i);
      }
      assert.throws(() => sql(`BEGIN;SET LOCAL ROLE authenticated;SET LOCAL test.uid='${admin}';INSERT INTO leads(nome,crm_ia_profile) VALUES('Forjado',${quote(lead.crm_ia_profile)});COMMIT;`), /perfil|autorizad/i);
      assert.equal(row('leads', lead.id).crm_ia_profile.id, id(101));
      assert.throws(() => sql('UPDATE planeje_private.crm_ia_profile_history SET source=source'), /acréscimo/i);
      assert.throws(() => sql('DELETE FROM planeje_private.crm_ia_profile_history'), /acréscimo/i);
      assert.equal(sql("SELECT has_table_privilege('authenticated','planeje_private.crm_ia_profile_history','select')"), 'f');
      for (const fn of ['private.crm_ia_apply_profile(uuid,uuid,jsonb,text,uuid,uuid)', 'public.crm_ia_workspace_pre_profiles(text,uuid,jsonb)', 'public.crm_ia_apply_agent_action_pre_profiles(uuid,jsonb,text,jsonb)']) assert.equal(sql(`SELECT has_function_privilege('authenticated','${fn}','execute')`), 'f');
    });
    await t.test('mudança aplica transferência autorizada e união de tags; mesmo perfil não desfaz humano', () => {
      const otherProfile = profile(2, { nome: 'Pronto', actions: { owner_id: admin, tags: ['VIP'] } });
      agent = call('save_agent', { id: agent.id, expected_updated_at: agent.updated_at, funil: rules([profile(), otherProfile]) });
      let lead = call('save_lead', { nome: 'Da equipe', whatsapp: '551199990003', pipeline_id: pipeline, profile: ref(agent) }, staff);
      assert.throws(() => call('save_lead', { id: lead.id, expected_updated_at: lead.updated_at, nome: 'Rollback', profile: ref(agent, otherProfile.id) }, staff), /gestão|transferir/i);
      assert.equal(row('leads', lead.id).nome, 'Da equipe'); assert.equal(row('leads', lead.id).updated_at, lead.updated_at);
      lead = call('save_lead', { id: lead.id, expected_updated_at: lead.updated_at, profile: ref(agent, otherProfile.id) }); assert.equal(lead.responsavel_id, admin);
      const full = Array.from({ length: 50 }, (_, i) => i === 0 ? 'VIP' : i === 1 ? 'Perfil' : `Tag${i}`);
      lead = call('save_lead', { id: lead.id, expected_updated_at: lead.updated_at, etiquetas: full, profile: ref(agent) });
      assert.equal(lead.etiquetas.length, 50);
    });
    await t.test('remoção conserva snapshot e metadados históricos sem autorizar nova atribuição', () => {
      let lead = call('save_lead', { nome: 'Histórico', whatsapp: '551199990004', pipeline_id: pipeline, profile: ref(agent) });
      agent = call('save_agent', { id: agent.id, expected_updated_at: agent.updated_at, funil: rules([]) });
      assert.equal(call('lead', { id: lead.id }).lead.crm_ia_profile.id, id(101));
      assert.equal(call('workspace', {}, staff).lead_profiles.find(p => p.id === id(101)).historical, true);
      assert.equal(call('workspace', {}, staff).lead_profiles.find(p => p.id === id(101)).pipeline_id, pipeline);
      assert.throws(() => call('save_lead', { id: lead.id, expected_updated_at: lead.updated_at, profile: ref(agent) }), /perfil/i);
      assert.equal(row('leads', lead.id).updated_at, lead.updated_at);
      agent = call('save_agent', { id: agent.id, expected_updated_at: agent.updated_at, funil: rules([profile()]) });
    });
    await t.test('modelos preservam critérios, regeneram IDs e desligam responsáveis, voz e autonomia', () => {
      const template = call('save_template', { nome: 'Modelo seguro', tipo: 'agent', data: agent });
      assert.notEqual(template.data.funil.crm_ia.profiles[0].id, id(101));
      assert.equal(template.data.funil.crm_ia.profiles[0].actions.owner_id, null);
      assert.deepEqual(template.data.funil.crm_ia.profiles[0].actions.tags, ['Perfil', 'VIP']);
      call('apply_template', { id: template.id, revision: template.revision });
      const copied = JSON.parse(sql(`SELECT to_jsonb(a) FROM cliente_atend_ia_agentes a WHERE id<>'${agent.id}'`));
      assert.notEqual(copied.funil.crm_ia.profiles[0].id, template.data.funil.crm_ia.profiles[0].id);
      assert.equal(copied.funil.crm_ia.profiles[0].actions.owner_id, null);
      assert.equal(copied.auto_responder, false); assert.equal(copied.funil.crm_ia.audio.enabled, false);
    });
    await t.test('perfil explícito usa o funil canônico após mover; omissão preserva snapshot entre funis', () => {
      const nextPipeline = id(42), nextStage = id(53), nextProfile = profile(3, { actions: { owner_id: null, tags: [] } });
      sql(`INSERT INTO crm_pipelines(id,cliente_id,nome) VALUES('${nextPipeline}','${client}','Segundo');INSERT INTO crm_stages(id,pipeline_id,nome) VALUES('${nextStage}','${nextPipeline}','Segunda entrada')`);
      const nextAgent = call('save_agent', { nome: 'Segundo agente', funil: { crm_ia: { ...rules([nextProfile]).crm_ia, pipeline_id: nextPipeline, stage_ids: [nextStage] } } });
      let lead = call('save_lead', { nome: 'Entre funis', whatsapp: '551199990005', pipeline_id: pipeline, stage_id: stage, profile: ref(agent) });
      assert.throws(() => call('save_lead', { id: lead.id, expected_updated_at: lead.updated_at, pipeline_id: nextPipeline, profile: ref(nextAgent, nextProfile.id) }), /etapa|perfil|funil/i);
      assert.equal(row('leads', lead.id).pipeline_id, pipeline);
      lead = call('save_lead', { id: lead.id, expected_updated_at: lead.updated_at, pipeline_id: nextPipeline, stage_id: nextStage, profile: ref(nextAgent, nextProfile.id) });
      assert.equal(lead.pipeline_id, nextPipeline); assert.equal(lead.crm_ia_profile.agent_id, nextAgent.id);
      const snapshot = lead.crm_ia_profile;
      lead = call('save_lead', { id: lead.id, expected_updated_at: lead.updated_at, pipeline_id: pipeline, stage_id: stage });
      assert.equal(lead.pipeline_id, pipeline); assert.deepEqual(lead.crm_ia_profile, snapshot);
      assert.equal(call('lead', { id: lead.id }).profile_history.length, 2);
      assert.equal(sql(`SELECT count(*) FROM crm_funnel_events WHERE lead_id='${lead.id}'`), '2');
    });
    await t.test('perfil do run é atômico, valida source, pausa, revogação e CAS e mantém recibo de replay', () => {
      let lead = call('save_lead', { nome: 'Runtime', whatsapp: '551199999999', pipeline_id: pipeline, stage_id: stage, responsavel_id: admin });
      sql(`INSERT INTO cliente_atend_conversas(cliente_id,contact_id,status,ia_pausada,assigned_to) VALUES('${client}','${contact}','entrada',false,'${staff}') ON CONFLICT(cliente_id,contact_id) DO UPDATE SET ia_pausada=false,status='entrada';`);
      let seq = 0;
      const begin = () => {
        const message = `profile-${++seq}`;
        const source = JSON.parse(sql(`WITH ins AS(INSERT INTO cliente_whatsapp_inbox(cliente_id,whatsapp_config_id,from_jid,chat_jid,message_id,type,body,created_at) SELECT '${client}','${channel}',from_jid,from_jid,'${message}','text','Quero contratar',clock_timestamp() FROM cliente_whatsapp_contact WHERE id='${contact}' RETURNING *) SELECT to_jsonb(ins) FROM ins`));
        const state = JSON.parse(sql(`SELECT to_jsonb(c) FROM cliente_atend_conversas c WHERE contact_id='${contact}'`)), current = row('leads', lead.id), cfg = JSON.parse(sql(`SELECT to_jsonb(c) FROM crm_ia_config c WHERE cliente_id='${client}'`));
        return rpc('crm_ia_agent_begin', `'${client}','${channel}','${contact}','${lead.id}','${agent.id}','responder','${message}',${quote({ actor_id: admin, config_revision: cfg.revision, agent_updated_at: agent.updated_at, lead_updated_at: current.updated_at, conversation_updated_at: state.updated_at, source_inbox_id: source.id, source_message_id: source.message_id, source_message_type: source.type })}`);
      };
      const apply = (job, action = { type: 'answer', profile_id: id(101) }) => rpc('crm_ia_apply_agent_action', `'${job.id}',${quote(action)},'Podemos continuar.','{}'`);
      const job = begin(); assert.equal(job.claimed, true);
      const result = apply(job); assert.equal(result.queued, true);
      lead = row('leads', lead.id); assert.equal(lead.crm_ia_profile.id, id(101)); assert.equal(lead.responsavel_id, staff);
      assert.equal(result.lead_updated_at, lead.updated_at); assert.deepEqual(apply(job), result);
      assert.equal(sql(`SELECT count(*) FROM planeje_private.crm_ia_profile_history WHERE lead_id='${lead.id}'`), '1');
      assert.equal(sql(`SELECT count(*) FROM crm_funnel_events WHERE lead_id='${lead.id}'`), '0');
      assert.equal(sql('SELECT count(*) FROM crm_lead_interacoes'), '0');
      const paused = begin(); sql(`UPDATE cliente_atend_conversas SET ia_pausada=true,updated_at=clock_timestamp() WHERE contact_id='${contact}'`);
      assert.equal(apply(paused).queued, false);
      sql(`UPDATE cliente_atend_conversas SET ia_pausada=false,updated_at=clock_timestamp() WHERE contact_id='${contact}'`);
      const stale = begin(); lead = call('save_lead', { id: lead.id, expected_updated_at: lead.updated_at, profile: null }); assert.equal(apply(stale).queued, false);
      const revoked = begin(); sql(`UPDATE profiles SET status='inactive' WHERE id='${staff}'`);
      assert.throws(() => apply(revoked), /responsável|acesso/i); assert.equal(row('leads', lead.id).crm_ia_profile, null);
      sql(`UPDATE profiles SET status='active' WHERE id='${staff}'`);
      const sourceChanged = begin(); sql(`UPDATE cliente_whatsapp_inbox SET message_id='changed' WHERE message_id='profile-${seq}'`);
      assert.throws(() => apply(sourceChanged), /source|fonte/i); assert.equal(row('leads', lead.id).crm_ia_profile, null);
      const invalid = begin(); assert.throws(() => apply(invalid, { type: 'answer', profile_id: id(999) }), /profile/);
      agent = call('save_agent', { id: agent.id, expected_updated_at: agent.updated_at, funil: { crm_ia: { ...rules([profile()]).crm_ia, audio: { enabled: true, input_enabled: false, voice: 'alloy', speed: 1, mode: 'always' } } } });
      const voiced = apply(begin()); assert.equal(voiced.queued, true);
      const claimed = rpc('crm_ia_delivery_claim', `p_ids=>ARRAY['${voiced.outbox_id}']::uuid[]`)[0];
      const allowed = rpc('crm_ia_delivery_recheck', `'${claimed.id}','${claimed.claim_token}'`); assert.equal(allowed.allowed, true); assert.equal(allowed.voice.enabled, true);
      assert.equal(sql(`SELECT agent_updated_at='${agent.updated_at}'::timestamptz FROM planeje_private.crm_ia_voice_authorizations WHERE agent_id='${agent.id}'`), 't');
      sql(`INSERT INTO crm_stages(id,pipeline_id,nome) VALUES('${id(52)}','${pipeline}','Qualificado');UPDATE cliente_atend_conversas SET ia_pausada=false,updated_at=clock_timestamp() WHERE contact_id='${contact}'`);
      agent = call('save_agent', { id: agent.id, expected_updated_at: agent.updated_at, funil: { crm_ia: { ...rules([profile()]).crm_ia, destino: { tipo: 'humano', stage_id: id(52) } } } });
      const qualified = apply(begin(), { type: 'qualify', profile_id: id(101) }); assert.equal(qualified.queued, true);
      lead = row('leads', lead.id); assert.equal(lead.stage_id, id(52)); assert.equal(lead.qualificado, true); assert.equal(qualified.lead_updated_at, lead.updated_at);
      assert.equal(sql(`SELECT count(*) FROM crm_funnel_events WHERE lead_id='${lead.id}'`), '1'); assert.equal(sql('SELECT count(*) FROM crm_lead_interacoes'), '0');
    });
    const legacyId = id(180), nullMarker = id(181), objectMarker = id(182), legacyRules = { destino_tipo: 'setor', destino_setor_id: id(190), perguntas: ['Pergunta legada'] };
    sql(`INSERT INTO cliente_atend_ia_agentes(id,cliente_id,nome,instrucoes,funil) VALUES('${legacyId}','${client}','Legado preservado','Instruções legadas',${quote(legacyRules)}),('${nullMarker}','${client}','Marker nulo','Privado','{"crm_ia":null}'),('${objectMarker}','${client}','Marker objeto','Privado','{"crm_ia":{}}');`);
    await t.test('políticas legadas reais não deixam membro extrair SELECT * nem funil dos agentes CRM', () => {
      for (const uid of [other, id(4), id(5)]) {
        const rows = JSON.parse(direct(uid, `SELECT coalesce(jsonb_agg(to_jsonb(a)),'[]') FROM cliente_atend_ia_agentes a WHERE cliente_id='${client}'`));
        assert.deepEqual(rows.map(a => a.id), [legacyId]);
        for (const key of [agent.id, nullMarker, objectMarker]) {
          assert.equal(direct(uid, `SELECT count(funil#>'{crm_ia,profiles}') FROM cliente_atend_ia_agentes WHERE id='${key}'`), '0');
          assert.equal(direct(uid, `SELECT count(*) FROM cliente_atend_ia_agentes WHERE id='${key}'`), '0');
        }
      }
      assert.equal(direct(staff, `SELECT count(*) FROM cliente_atend_ia_agentes WHERE id='${agent.id}'`), '0');
      assert.equal(JSON.parse(direct(id(6), `SELECT funil#>'{crm_ia,profiles}' FROM cliente_atend_ia_agentes WHERE id='${agent.id}'`))[0].id, id(101));
      assert.equal(JSON.parse(sql(`SET ROLE service_role;SELECT funil#>'{crm_ia,profiles}' FROM cliente_atend_ia_agentes WHERE id='${agent.id}'`))[0].id, id(101));
    });
    await t.test('resumo mantém os cinco campos e o funil legado para membro ou CRM autorizado sem prompts novos', () => {
      assert.throws(() => summary(staff), /acesso|indisponível/i, 'CRM access alone must not expose legacy funnel instructions to a non-member');
      for (const uid of [other, id(4), id(5), admin, id(6)]) {
        const rows = summary(uid);
        for (const a of rows) {
          assert.deepEqual(Object.keys(a).sort(), ['ativo', 'funil', 'id', 'nome', 'setor_ids']);
          assert.equal(Object.hasOwn(a.funil, 'crm_ia'), false);
        }
        assert.ok(rows.some(a => a.id === agent.id)); assert.ok(rows.some(a => a.id === nullMarker)); assert.ok(rows.some(a => a.id === objectMarker));
        assert.deepEqual(rows.find(a => a.id === legacyId).funil, legacyRules);
        assert.doesNotMatch(JSON.stringify(rows), /Quer contratar|"pistas"|"actions"|"descricao"/);
      }
      assert.equal(JSON.parse(direct(id(4), `SELECT to_jsonb(a) FROM cliente_atend_ia_agentes a WHERE id='${legacyId}'`)).instrucoes, 'Instruções legadas');
      assert.equal(direct(id(4), `UPDATE cliente_atend_ia_agentes SET nome='Legado editável' WHERE id='${legacyId}' RETURNING nome`), 'Legado editável');
      assert.ok(direct(id(4), `INSERT INTO cliente_atend_ia_agentes(cliente_id,nome,funil) VALUES('${client}','Novo legado','{}') RETURNING id`));
      assert.equal(direct(id(4), `DELETE FROM cliente_atend_ia_agentes WHERE id='${legacyId}' RETURNING id`), legacyId);
    });
    await t.test('RLS ALL impede criação, conversão, update, delete e upsert CRM por loja-admin', () => {
      for (const marker of [null, {}, rules([profile()]).crm_ia]) {
        assert.throws(() => direct(id(4), `INSERT INTO cliente_atend_ia_agentes(cliente_id,nome,funil) VALUES('${client}','Injeção',${quote({ crm_ia: marker })}) RETURNING id`), /row-level security|permission/i);
        assert.throws(() => direct(id(4), `UPDATE cliente_atend_ia_agentes SET funil=${quote({ ...legacyRules, crm_ia: marker })} WHERE id='${legacyId}' RETURNING id`), /row-level security|permission/i);
      }
      for (const key of [agent.id, nullMarker, objectMarker]) {
        assert.equal(direct(id(4), `UPDATE cliente_atend_ia_agentes SET funil=funil-'crm_ia' WHERE id='${key}' RETURNING id`), '');
        assert.equal(direct(id(4), `UPDATE cliente_atend_ia_agentes SET ativo=false WHERE id='${key}' RETURNING id`), '');
        assert.equal(direct(id(4), `DELETE FROM cliente_atend_ia_agentes WHERE id='${key}' RETURNING id`), '');
        assert.throws(() => direct(id(4), `INSERT INTO cliente_atend_ia_agentes(id,cliente_id,nome,funil) SELECT '${key}','${client}','Upsert CRM','{}' ON CONFLICT(id) DO UPDATE SET funil=excluded.funil RETURNING id`), /row-level security|permission/i);
      }
      assert.throws(() => direct(id(4), `INSERT INTO cliente_atend_ia_agentes(id,cliente_id,nome,funil) VALUES('${legacyId}','${client}','Upsert legado','{"crm_ia":{}}') ON CONFLICT(id) DO UPDATE SET funil=excluded.funil RETURNING id`), /row-level security|permission/i);
      assert.ok(row('cliente_atend_ia_agentes', agent.id).funil.crm_ia.profiles.length);
      assert.equal(direct(id(6), `UPDATE cliente_atend_ia_agentes SET ativo=ativo WHERE id='${agent.id}' RETURNING id`), '', 'existing legacy policy does not grant superadmin direct writes');
      assert.equal(sql(`BEGIN;SET LOCAL ROLE service_role;UPDATE cliente_atend_ia_agentes SET ativo=ativo WHERE id='${agent.id}' RETURNING id;ROLLBACK;`), agent.id);
      assert.ok(call('workspace').agents.find(a => a.id === agent.id).funil.crm_ia.profiles.length);
    });
    await t.test('resumo e policy revalidam sessão, status, membro, módulo e cliente sem ampliar permissões', () => {
      for (const target of [foreign, id(999)]) assert.throws(() => summary(other, target), /acesso|indisponível/i);
      assert.throws(() => summary(id(7)), /acesso|indisponível/i);
      assert.throws(() => summary(staff, foreign), /acesso|indisponível/i);
      const revoked = [
        [`UPDATE cliente_atend_membros SET ativo=false WHERE user_id='${other}'`, `UPDATE cliente_atend_membros SET ativo=true WHERE user_id='${other}'`, other],
        [`UPDATE profiles SET status='inactive' WHERE id='${other}'`, `UPDATE profiles SET status='active' WHERE id='${other}'`, other],
        [`UPDATE auth.sessions SET not_after=clock_timestamp()-interval '1 minute' WHERE user_id='${other}'`, `UPDATE auth.sessions SET not_after=NULL WHERE user_id='${other}'`, other],
        [`UPDATE auth.users SET banned_until=clock_timestamp()+interval '1 hour' WHERE id='${other}'`, `UPDATE auth.users SET banned_until=NULL WHERE id='${other}'`, other],
        [`UPDATE client_module_permissions SET is_enabled=false WHERE cliente_id='${client}'`, `UPDATE client_module_permissions SET is_enabled=true WHERE cliente_id='${client}'`, other],
        [`INSERT INTO user_module_permissions VALUES('${staff}','crm',false)`, `DELETE FROM user_module_permissions WHERE user_id='${staff}'`, staff],
        [`UPDATE profiles SET status='inactive' WHERE id='${id(6)}'`, `UPDATE profiles SET status='active' WHERE id='${id(6)}'`, id(6)],
      ];
      for (const [revoke, restore, uid] of revoked) {
        sql(revoke);
        try {
          assert.throws(() => summary(uid), /acesso|indisponível/i);
          assert.equal(direct(uid, `SELECT count(*) FROM cliente_atend_ia_agentes WHERE cliente_id='${client}'`), '0');
        } finally { sql(restore); }
      }
      sql(`INSERT INTO user_module_permissions VALUES('${id(6)}','crm',false)`);
      try {
        assert.equal(direct(id(6), `SELECT count(*) FROM cliente_atend_ia_agentes WHERE id='${agent.id}'`), '0');
        assert.ok(summary(id(6)).some(a => a.id === agent.id), 'legacy superadmin keeps metadata with CRM module disabled');
      } finally { sql(`DELETE FROM user_module_permissions WHERE user_id='${id(6)}'`); }
      assert.equal(sql("SELECT has_function_privilege('anon','public.cliente_atend_ia_agentes_resumo(uuid)','execute')"), 'f');
      assert.equal(sql("SELECT has_function_privilege('anon','private.crm_ia_agent_manager(uuid)','execute')"), 'f');
      assert.equal(sql("SELECT has_function_privilege('authenticated','private.crm_ia_agent_manager(uuid)','execute')"), 't');
    });
    await t.test('revogação durante lock do agente aborta atribuição e repetição do perfil', async t => {
      const cases = [
        { name: 'ator inativado', mutation: `UPDATE profiles SET status='inactive' WHERE id='${admin}'` },
        { name: 'ator fora da equipe CRM', mutation: `UPDATE profiles SET role='cliente',cliente_id='${client}' WHERE id='${admin}'` },
        { name: 'módulo CRM revogado', mutation: `INSERT INTO user_module_permissions VALUES('${admin}','crm',false)` },
        { name: 'mesmo perfil com ator inativado', same: true, mutation: `UPDATE profiles SET status='inactive' WHERE id='${admin}'` },
      ];
      for (const [index, scenario] of cases.entries()) await t.test(scenario.name, async () => {
        const lead = call('save_lead', { nome: 'Antes do lock', whatsapp: `55119997000${index}`, pipeline_id: pipeline, responsavel_id: admin, ...(scenario.same ? { profile: ref(agent) } : {}) });
        const before = row('leads', lead.id), blocker = connection(), worker = connection(), application = `crm_profile_revoke_${index}`;
        try {
          await blocker.query(`BEGIN;SELECT id FROM cliente_atend_ia_agentes WHERE id='${agent.id}' FOR UPDATE;`);
          const finished = worker.query(`SET application_name='${application}';BEGIN;SET LOCAL ROLE authenticated;SET LOCAL test.uid='${admin}';SELECT public.crm_ia_workspace('save_lead','${client}',${quote({ id: lead.id, expected_updated_at: lead.updated_at, nome: 'Não persistir', profile: ref(agent) })});COMMIT;`).catch(() => null);
          let blocked = false;
          for (let attempt = 0; attempt < 100 && !blocked; attempt++) {
            blocked = await blocker.query(`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='${application}' AND wait_event_type='Lock');`) === 't';
            if (!blocked) await new Promise(resolve => setTimeout(resolve, 10));
          }
          assert.equal(blocked, true, 'save_lead must wait on the source agent after its initial authorization');
          await blocker.query(`${scenario.mutation};COMMIT;`);
          worker.child.stdin.end(); await finished; const outcome = await worker.done;
          assert.notEqual(outcome.code, 0, 'revoked actor must not persist the save or profile after the agent lock');
          assert.match(outcome.stderr, /ator|acesso|indisponível/i); assert.deepEqual(row('leads', lead.id), before);
        } finally {
          blocker.child.stdin.end('ROLLBACK;\n'); worker.child.stdin.end(); await Promise.all([blocker.done, worker.done]);
          sql(`UPDATE profiles SET status='active',role='admin',cliente_id=NULL WHERE id='${admin}';DELETE FROM user_module_permissions WHERE user_id='${admin}'`);
        }
      });
    });
  } finally { if (started) run('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop']); rmSync(work, { recursive: true, force: true }); }
});

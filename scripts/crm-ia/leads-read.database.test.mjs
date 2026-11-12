import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const work = mkdtempSync('/tmp/crm-leads-read-db-'), data = join(work, 'data'), env = { PATH: process.env.PATH, LC_ALL: 'C' };
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const context = Object.fromEntries(['admin', 'staff', 'other', 'client', 'foreign', 'channel', 'hiddenChannel', 'contact'].map((key, i) => [key, id([1, 2, 3, 11, 12, 21, 22, 31][i])]));
const { admin, staff, other, client, foreign, channel, hiddenChannel, contact } = context, pipeline = id(41), stage = id(51);
const quote = value => `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
function run(name, args, input) { const r = spawnSync(name, args, { input, env, encoding: 'utf8', timeout: 25000 }); if (r.error || r.status) throw new Error(r.stderr || r.error?.message); return r.stdout.trim(); }
const psql = ['-X', '-Aqt', '-v', 'ON_ERROR_STOP=1', '-h', work, '-p', '55502', '-U', 'leads_read_qa', '-d', 'postgres'];
const sql = input => run('psql', psql, input);
const call = (action, payload = {}, uid = admin, target = client) => JSON.parse(sql(`BEGIN;SET LOCAL ROLE authenticated;SET LOCAL test.uid='${uid}';SELECT public.crm_ia_workspace('${action}','${target}',${quote(payload)});COMMIT;`));
const row = key => JSON.parse(sql(`SELECT to_jsonb(l) FROM leads l WHERE id='${key}'`));
const items = leads => leads.map(l => ({ id: l.id, expected_updated_at: l.updated_at }));

function connection(applicationName) {
  const process = spawn('psql', [...psql, '-v', `application_name=${applicationName}`], { env, stdio: ['pipe', 'pipe', 'pipe'] });
  let stderr = '', sequence = 0;
  process.stderr.on('data', chunk => { stderr += chunk; });
  const done = new Promise((resolve, reject) => { process.on('error', reject); process.on('exit', code => resolve({ code, stderr })); });
  return { process, done, async query(statement) {
    const marker = `query_${++sequence}_done`;
    const output = new Promise((resolve, reject) => {
      let text = '';
      const timer = setTimeout(() => { cleanup(); reject(Error('Timed out waiting for fixture connection')); }, 3000);
      const receive = chunk => { text += chunk; if (text.includes(marker)) { cleanup(); resolve(text.split(marker)[0].trim()); } };
      const fail = () => { cleanup(); reject(Error(stderr || 'Fixture connection closed')); };
      function cleanup() { clearTimeout(timer); process.stdout.off('data', receive); process.off('exit', fail); }
      process.stdout.on('data', receive); process.once('exit', fail);
    });
    process.stdin.write(`${statement}\n\\echo ${marker}\n`);
    return output;
  } };
}

test('leituras e lotes usam o mesmo escopo autorizado e versões antes de paginar ou gravar', async t => {
  let started = false;
  try {
    run('initdb', ['-D', data, '-U', 'leads_read_qa', '--auth-local=trust', '--auth-host=reject', '--no-locale', '--encoding=UTF8']);
    run('pg_ctl', ['-D', data, '-l', join(work, 'pg.log'), '-o', `-k ${work} -p 55502 -c listen_addresses='' -c unix_socket_permissions=0700`, '-w', 'start']); started = true;
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
    for (const file of ['20261111041703_crm_ia_delivery_runtime.sql', '20261111041704_crm_ia_workspace.sql', '20261111043800_crm_ia_workspace_readings.sql', '20261111044652_crm_ia_agent_runtime.sql', '20261111062101_crm_ia_calendar.sql', '20261111062548_crm_ia_voice.sql', '20261111072502_crm_ia_calendar_delivery.sql', '20261111075558_crm_ia_agent_template_contract.sql', '20261111090001_crm_ia_appointment_actions.sql', '20261111090002_crm_ia_agent_drafts_voice_modes.sql', '20261111090003_crm_ia_lead_tags.sql', '20261111101501_crm_ia_lead_profiles.sql']) sql(readFileSync(new URL(`../../supabase/migrations/${file}`, import.meta.url), 'utf8'));
    sql(readFileSync(new URL('../../supabase/migrations/20261111101502_crm_ia_lead_reads.sql', import.meta.url), 'utf8'));
    sql(`INSERT INTO crm_pipelines(id,cliente_id,nome) VALUES('${pipeline}','${client}','Fixture'),('${id(42)}','${foreign}','Externo');INSERT INTO crm_stages(id,pipeline_id,nome) VALUES('${stage}','${pipeline}','Entrada'),('${id(52)}','${id(42)}','Externo');
      INSERT INTO crm_ia_config(cliente_id,data,updated_by) VALUES('${client}','{"attendance":{"auto_send":false},"custom_fields":{"fields":[{"key":"budget","name":"Orçamento","type":"number"}]}}','${admin}');
      INSERT INTO cliente_whatsapp_contact(id,cliente_id,from_jid,phone,sender_name,whatsapp_config_id) VALUES('${id(32)}','${client}','551199999998@s.whatsapp.net','551199999998','Privado','${channel}'),('${id(33)}','${client}','551199999997@s.whatsapp.net','551199999997','Canal negado','${hiddenChannel}');
      INSERT INTO cliente_whatsapp_inbox(cliente_id,whatsapp_config_id,from_jid,chat_jid,body,created_at) VALUES('${client}','${channel}','551199999998@s.whatsapp.net','551199999998@s.whatsapp.net','Privado',clock_timestamp()),('${client}','${hiddenChannel}','551199999997@s.whatsapp.net','551199999997@s.whatsapp.net','Restrito',clock_timestamp());
      INSERT INTO cliente_atend_conversas(cliente_id,contact_id,status,ia_pausada,assigned_to,privado) VALUES('${client}','${contact}','esperando',false,'${staff}',false),('${client}','${id(32)}','esperando',false,'${other}',true),('${client}','${id(33)}','esperando',false,'${staff}',false);`);
    let a = call('save_lead', { nome: 'Alpha', whatsapp: '551199999999', pipeline_id: pipeline, stage_id: stage, responsavel_id: staff, valor: 100, origem: 'manual', etiquetas: ['VIP'] });
    let b = call('save_lead', { nome: 'Beta', whatsapp: '551199999998', pipeline_id: pipeline, stage_id: stage, responsavel_id: admin, valor: 200, origem: 'site', etiquetas: ['Geral'] });
    let c = call('save_lead', { nome: 'Gamma', whatsapp: '551199999997', pipeline_id: pipeline, responsavel_id: staff, valor: 300, etiquetas: ['VIP'] });
    const profile = { id: id(101), nome: 'Decidido', cor: '#aabbcc', descricao: 'Deseja contratar', pistas: [], actions: { owner_id: null, tags: [] } };
    const agent = call('save_agent', { nome: 'Qualificação QA', funil: { crm_ia: { tipo: 'qualificacao', pipeline_id: pipeline, stage_ids: [stage], profiles: [profile] } } });
    a = call('save_lead', { id: a.id, expected_updated_at: a.updated_at, profile: { agent_id: agent.id, id: profile.id, agent_updated_at: agent.updated_at } });
    await t.test('totais não mudam com página; privado, canal negado e falta de módulo não contaminam atendimento', () => {
      const first = call('leads', { limit: 1, offset: 0 }), second = call('leads', { limit: 1, offset: 1 });
      assert.equal(first.total, 3); assert.equal(first.rows.length, 1);
      assert.deepEqual(first.summary, { value: 600, ai: 1, waiting: 1 }); assert.deepEqual(second.summary, first.summary);
      assert.deepEqual(first.stage_totals, [{ stage_id: null, count: 1, value: 300 }, { stage_id: stage, count: 2, value: 300 }]); assert.deepEqual(second.stage_totals, first.stage_totals);
      const visible = call('leads', { limit: 200 });
      assert.equal(visible.rows.find(l => l.id === a.id).attendance, 'ai');
      for (const lead of [b, c]) { assert.equal(visible.rows.find(l => l.id === lead.id).attendance, null); assert.equal(visible.rows.find(l => l.id === lead.id).awaiting_since, null); }
      const staffView = call('leads', {}, staff); assert.equal(staffView.total, 2); assert.equal(staffView.summary.value, 400);
      assert.throws(() => call('leads', {}, staff, foreign), /acesso/i); assert.throws(() => call('leads', {}, other), /acesso/i);
      sql(`INSERT INTO user_module_permissions VALUES('${admin}','atendimento',false),('${admin}','rastreamento',false)`);
      const denied = call('leads'); assert.deepEqual(denied.summary, { value: 600, ai: null, waiting: null }); assert.equal(denied.coverage.conversations, 'unavailable');
      sql(`DELETE FROM user_module_permissions WHERE user_id='${admin}'`);
    });
    await t.test('etiqueta exata e par de perfil filtram linhas e agregados no mesmo recorte', () => {
      assert.equal(call('leads', { tag: 'VIP' }).total, 2); assert.equal(call('leads', { tag: 'vip' }).total, 0);
      const filtered = call('leads', { profile_agent_id: agent.id, profile_id: profile.id }); assert.equal(filtered.total, 1); assert.equal(filtered.summary.value, 100);
      assert.deepEqual(filtered.stage_totals, [{ stage_id: stage, count: 1, value: 100 }]);
      for (const filters of [{ profile_id: profile.id }, { profile_agent_id: agent.id }]) assert.throws(() => call('leads', filters), /perfil|par/i);
      assert.equal(call('leads', { pipeline_id: id(42) }).total, 0); assert.equal(call('leads', { stage_id: stage }).total, 2);
      assert.equal(call('leads', { origin: 'site' }).total, 1); assert.equal(call('leads', { owner_id: staff }).total, 2);
      assert.equal(call('leads', { search: 'Alpha' }).total, 1); assert.equal(call('leads', { since: '2020-01-01', until: '2020-01-02' }).total, 0);
    });
    await t.test('ficha conserva todos os pares autorizados e histórico só após ACL', () => {
      assert.equal(call('lead', { id: a.id }).conversations.length, 1);
      assert.equal(call('lead', { id: b.id }).conversations.length, 0); assert.equal(call('lead', { id: c.id }).conversations.length, 0);
      assert.throws(() => call('lead', { id: b.id }, staff), /acesso|indisponível/i);
      assert.equal(call('lead', { id: a.id }, staff).profile_history.length, 1);
    });
    await t.test('lotes exigem versões completas, aplicam ACL e são reversíveis e atômicos', () => {
      assert.throws(() => call('bulk_assign', { ids: [a.id], owner_id: admin }), /versão|alterad/i);
      const staleB = b; b = call('save_lead', { id: b.id, expected_updated_at: b.updated_at, nome: 'Beta revisado' });
      assert.throws(() => call('bulk_archive', { items: items([a, staleB]) }), /versão|alterad/i); assert.equal(row(a.id).crm_ia_archived_at, null);
      assert.throws(() => call('bulk_assign', { ids: [a.id, b.id], owner_id: admin, items: items([a, staleB]) }), /versão|alterad/i); assert.equal(row(a.id).responsavel_id, staff);
      assert.throws(() => call('bulk_archive', { items: items([a, b]) }, staff), /acesso|indisponível/i); assert.equal(row(a.id).crm_ia_archived_at, null);
      assert.throws(() => call('bulk_assign', { ids: [a.id], owner_id: staff, items: items([b]) }), /seleção|versão/i);
      assert.throws(() => call('bulk_archive', { items: Array.from({ length: 101 }, () => items([a])[0]) }), /100|seleção/i);
      call('bulk_assign', { ids: [a.id, b.id], owner_id: staff, items: items([a, b]) }); a = row(a.id); b = row(b.id); assert.equal(b.responsavel_id, staff);
      assert.throws(() => call('bulk_assign', { ids: [a.id], owner_id: admin, items: items([a]) }, staff), /gestão|transf/i);
      call('bulk_archive', { items: items([a, b]) }); a = row(a.id); b = row(b.id); assert.ok(a.crm_ia_archived_at); assert.ok(b.crm_ia_archived_at);
      assert.equal(call('leads', { archived: true }).total, 2);
      call('restore_lead', { id: a.id }); a = row(a.id); assert.equal(a.crm_ia_archived_at, null);
    });
    await t.test('importação por linha mantém perfil, campos e recibo; erro identifica linha e reverte tudo', () => {
      const before = sql('SELECT count(*) FROM leads');
      assert.throws(() => call('import_leads', { request_id: id(901), rows: [{ nome: 'Válida', whatsapp: '551199990009' }, { nome: 'Inválida', whatsapp: '551199990010', pipeline_id: pipeline, crm_ia_fields: { budget: 'abc' } }] }), /Linha 2.*número/is);
      assert.equal(sql('SELECT count(*) FROM leads'), before);
      const rows = [{ nome: 'CSV', whatsapp: '551199990011', pipeline_id: pipeline, stage_id: stage, responsavel_id: staff, crm_ia_fields: { budget: '42' }, profile: { agent_id: agent.id, id: profile.id, agent_updated_at: agent.updated_at } }];
      const result = call('import_leads', { request_id: id(902), rows }); assert.equal(result.created, 1); assert.deepEqual(call('import_leads', { request_id: id(902), rows }), result);
      const imported = call('leads', { search: '551199990011' }).rows[0]; assert.equal(imported.crm_ia_fields.budget, '42'); assert.equal(imported.crm_ia_profile.id, profile.id); assert.equal(imported.responsavel_id, staff);
      assert.throws(() => call('import_leads', { request_id: id(902), rows: [{ ...rows[0], nome: 'Alterado' }] }), /identificador/i);
      assert.equal(sql('SELECT count(*) FROM crm_ia_outbox'), '0');
    });
    await t.test('lote relê a versão depois de aguardar um escritor concorrente', async () => {
      c = row(c.id);
      const writer = spawn('psql', psql, { env, stdio: ['pipe', 'pipe', 'pipe'] });
      writer.stdin.end(`BEGIN;UPDATE leads SET nome='Concorrente',updated_at=clock_timestamp() WHERE id='${c.id}';SELECT 'held';SELECT pg_sleep(0.25);COMMIT;`);
      const done = new Promise((resolve, reject) => { writer.on('error', reject); writer.on('exit', code => code ? reject(Error(`writer exited ${code}`)) : resolve()); });
      await new Promise((resolve, reject) => { writer.stdout.once('data', resolve); writer.on('error', reject); });
      try { assert.throws(() => call('bulk_archive', { items: items([c]) }), /versão|alterad/i); } finally { await done; }
      assert.equal(row(c.id).nome, 'Concorrente'); assert.equal(row(c.id).crm_ia_archived_at, null);
    });
    await t.test('revogações durante espera de lock abortam o lote com duas conexões', async t => {
      const cases = [
        { name: 'responsável inativado', action: 'bulk_assign', owner: staff, owners: [admin], mutation: `UPDATE profiles SET status='inactive' WHERE id='${staff}'`, error: /responsável/i },
        { name: 'ator rebaixado sem permissão de transferência', action: 'bulk_assign', owner: staff, owners: [admin], mutation: `UPDATE profiles SET role='colaborador' WHERE id='${admin}'`, error: /gestão|transf/i },
        { name: 'ACL do primeiro lead revogada enquanto o último espera', action: 'bulk_assign', owner: admin, owners: [staff, admin], mutation: `UPDATE profiles SET role='colaborador' WHERE id='${admin}';INSERT INTO user_module_access VALUES('${admin}','crm','responsible')`, error: /acesso|indisponível/i },
        { name: 'ator inativado no arquivamento', action: 'bulk_archive', owners: [admin], mutation: `UPDATE profiles SET status='inactive' WHERE id='${admin}'`, error: /acesso|indisponível/i },
        { name: 'módulo CRM revogado no arquivamento', action: 'bulk_archive', owners: [admin], mutation: `INSERT INTO user_module_permissions VALUES('${admin}','crm',false)`, error: /acesso|indisponível/i },
      ];
      for (const [index, scenario] of cases.entries()) await t.test(scenario.name, async () => {
        const keys = scenario.owners.map((_, n) => id(1000 + index * 10 + n));
        sql(`INSERT INTO leads(id,cliente_id,nome,whatsapp,responsavel_id) VALUES ${keys.map((key, n) => `('${key}','${client}','Lock ${index}-${n}','55119998${String(index * 10 + n).padStart(4, '0')}','${scenario.owners[n]}')`).join(',')}`);
        const before = keys.map(row), payload = { items: items(before), ...(scenario.action === 'bulk_assign' ? { ids: keys, owner_id: scenario.owner } : {}) };
        const blocker = connection(`blocker_${index}`), worker = connection(`worker_${index}`), application = `crm_lead_revoke_${index}`;
        try {
          await blocker.query(`BEGIN;SELECT id FROM leads WHERE id='${keys.at(-1)}' FOR UPDATE;`);
          const finished = worker.query(`SET application_name='${application}';BEGIN;SET LOCAL ROLE authenticated;SET LOCAL test.uid='${admin}';SELECT public.crm_ia_workspace('${scenario.action}','${client}',${quote(payload)});COMMIT;`).catch(() => null);
          let blocked = false;
          for (let attempt = 0; attempt < 100 && !blocked; attempt++) {
            blocked = await blocker.query(`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='${application}' AND wait_event_type='Lock');`) === 't';
            if (!blocked) await new Promise(resolve => setTimeout(resolve, 10));
          }
          assert.equal(blocked, true, 'worker must pass initial authorization and wait on the selected lead');
          await blocker.query(`${scenario.mutation};COMMIT;`);
          worker.process.stdin.end(); await finished;
          const outcome = await worker.done;
          assert.notEqual(outcome.code, 0, 'revoked authority must prevent the whole batch');
          assert.match(outcome.stderr, scenario.error);
          assert.deepEqual(keys.map(row), before, 'denied batch must preserve every lead and version');
        } finally {
          blocker.process.stdin.end('ROLLBACK;\n'); worker.process.stdin.end();
          await Promise.all([blocker.done, worker.done]);
          sql(`UPDATE profiles SET status='active' WHERE id IN('${admin}','${staff}');UPDATE profiles SET role='admin' WHERE id='${admin}';DELETE FROM user_module_access WHERE user_id='${admin}';DELETE FROM user_module_permissions WHERE user_id='${admin}'`);
        }
      });
    });
  } finally { if (started) run('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop']); rmSync(work, { recursive: true, force: true }); }
});

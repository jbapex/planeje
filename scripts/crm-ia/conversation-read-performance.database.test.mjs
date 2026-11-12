import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const work = mkdtempSync('/tmp/crm-conversation-read-performance-'), data = join(work, 'data');
const env = { PATH: process.env.PATH, LC_ALL: 'C' };
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const context = Object.fromEntries(['admin', 'staff', 'other', 'client', 'foreign', 'channel', 'hiddenChannel', 'contact'].map((key, index) => [key, id([1, 2, 3, 11, 12, 21, 22, 31][index])]));
const { admin, staff, other, client, foreign, channel, hiddenChannel } = context;
const second = id(23), archived = id(24), foreignChannel = id(25), missingChannel = id(26);
const pipeline = id(41), stage = id(51), agent = id(81), superadmin = id(4);
const contact = n => id(100 + n), lead = n => id(200 + n), jid = n => `55119000${String(n).padStart(5, '0')}@s.whatsapp.net`;
const period = { since: '2026-11-10', until: '2026-11-10' };
// Fixed published sequence: loaders for other suites may already include the candidate migration.
const published = ['20261111041703_crm_ia_delivery_runtime.sql', '20261111041704_crm_ia_workspace.sql',
  '20261111043800_crm_ia_workspace_readings.sql', '20261111044652_crm_ia_agent_runtime.sql',
  '20261111062101_crm_ia_calendar.sql', '20261111062548_crm_ia_voice.sql',
  '20261111072502_crm_ia_calendar_delivery.sql', '20261111075558_crm_ia_agent_template_contract.sql',
  '20261111090001_crm_ia_appointment_actions.sql', '20261111090002_crm_ia_agent_drafts_voice_modes.sql',
  '20261111090003_crm_ia_lead_tags.sql', '20261111101501_crm_ia_lead_profiles.sql',
  '20261111101502_crm_ia_lead_reads.sql', '20261111120001_crm_ia_internal_notifications.sql',
  '20261111120002_crm_ia_conversation_controls.sql'];
const quote = value => value == null ? 'NULL' : typeof value === 'boolean' || typeof value === 'number' ? String(value) : `'${String(typeof value === 'object' ? JSON.stringify(value) : value).replaceAll("'", "''")}'`;
const psql = ['-X', '-Aqt', '-v', 'ON_ERROR_STOP=1', '-h', work, '-p', '55579', '-U', 'conversation_read_qa', '-d', 'postgres'];
function run(binary, args, input) {
  const result = spawnSync(binary, args, { input, env, encoding: 'utf8', timeout: 25000 });
  if (result.error || result.status !== 0) throw new Error(result.stderr?.trim() || result.error?.message || result.stdout);
  return result.stdout.trim();
}
const sql = statement => run('psql', psql, statement);
const read = (action, payload = {}, actor = admin, target = client) => JSON.parse(sql(`BEGIN;SET LOCAL ROLE authenticated;SET LOCAL test.uid='${actor}';SELECT public.crm_ia_workspace(${quote(action)},'${target}',${quote(payload)});COMMIT;`));
const metadata = () => JSON.parse(sql(`SELECT jsonb_build_object(
  'oid',p.oid,'owner',pg_get_userbyid(p.proowner),'language',l.lanname,'security_definer',p.prosecdef,
  'volatility',p.provolatile,'parallel',p.proparallel,'strict',p.proisstrict,'leakproof',p.proleakproof,
  'returns_set',p.proretset,'return_type',p.prorettype,'argument_types',p.proargtypes::text,
  'all_argument_types',p.proallargtypes::text,'argument_modes',p.proargmodes,'argument_names',p.proargnames,
  'config',p.proconfig,'acl',p.proacl::text,'cost',p.procost,'rows',p.prorows,
  'anonymous',has_function_privilege('anon',p.oid,'EXECUTE'),
  'authenticated',has_function_privilege('authenticated',p.oid,'EXECUTE'))
  FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.oid='private.crm_ia_conversation_rows(uuid)'::regprocedure`));

test('leitura preserva população/ACL e limita autorização por canal, sem relógio de desempenho', async t => {
  let started = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => assert.fail('rede externa proibida nesta fixture');
  try {
    run('initdb', ['-D', data, '-U', 'conversation_read_qa', '--auth-local=trust', '--auth-host=reject', '--no-locale', '--encoding=UTF8']);
    run('pg_ctl', ['-D', data, '-l', join(work, 'pg.log'), '-o', `-k ${work} -p 55579 -c listen_addresses='' -c unix_socket_permissions=0700 -c track_functions=all`, '-w', 'start']);
    started = true;
    assert.equal(sql('SHOW listen_addresses'), '');
    assert.equal(sql('SHOW track_functions'), 'all');
    // Keep the canonical schema and its unrelated rows. Private ACL helpers below are the real ones.
    const fixture = readFileSync(new URL('./workspace.database.test.mjs', import.meta.url), 'utf8')
      .split('    sql(' + String.fromCharCode(96))[1].split('    ' + String.fromCharCode(96) + ');')[0]
      .replace(/\$\{(\w+)\}/g, (_, key) => context[key]);
    sql(fixture.replace(/      CREATE TABLE public\.crm_ia_outbox\([^\n]+\n/, ''));
    sql(`CREATE SCHEMA planeje_private;CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid);
      CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT jsonb_build_object('sub',auth.uid())$$;
      ALTER TABLE public.cliente_whatsapp_contact ADD COLUMN last_message_at timestamptz,ADD COLUMN origin_source text DEFAULT 'nao_identificado',ADD COLUMN qualificado boolean;
      ALTER TABLE public.leads ADD COLUMN qualificado boolean DEFAULT false;
      ALTER TABLE public.cliente_atend_conversas ADD COLUMN ia_followup_passo integer DEFAULT 0;
      CREATE TABLE public.atendimento_conversas(id uuid PRIMARY KEY,cliente_id uuid,whatsapp_config_id uuid,chat_jid text,archived_at timestamptz,bloqueada boolean DEFAULT false);
      CREATE TABLE public.atendimento_conversa_planejamento(id uuid PRIMARY KEY,cliente_id uuid,conversation_id uuid,whatsapp_config_id uuid,chat_jid text,kind text,body text,status text,scheduled_at timestamptz,completed_at timestamptz,error_message text,updated_at timestamptz DEFAULT now());
      GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;`);
    for (const file of published) sql(readFileSync(new URL(`../../supabase/migrations/${file}`, import.meta.url), 'utf8'));
    sql(`ALTER TABLE public.cliente_atend_ia_log ADD COLUMN IF NOT EXISTS whatsapp_config_id uuid;
      CREATE TABLE public.qa_read_channel_denials(actor_id uuid,channel_id uuid,PRIMARY KEY(actor_id,channel_id));
      -- Only the external scope decision is synthetic; crm_ia_channel/client/role/module/contact/lead are unchanged.
      CREATE OR REPLACE FUNCTION public.atendimento_user_can_access_atendimento_scope(uuid,uuid,uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
        SELECT $3<>'${hiddenChannel}'::uuid AND NOT EXISTS(SELECT 1 FROM public.qa_read_channel_denials d WHERE d.actor_id=auth.uid() AND d.channel_id=$3)
      $$;
      INSERT INTO public.profiles(id,role,status,full_name) VALUES('${superadmin}','superadmin','active','Super QA');
      INSERT INTO public.cliente_whatsapp_config(id,cliente_id,name,archived_at) VALUES
        ('${second}','${client}','Segundo canal QA',NULL),('${archived}','${client}','Arquivado QA','2026-01-01'),
        ('${foreignChannel}','${foreign}','Canal de outra conta',NULL);
      INSERT INTO public.crm_pipelines(id,cliente_id,nome) VALUES('${pipeline}','${client}','Funil QA');
      INSERT INTO public.crm_stages(id,pipeline_id,nome,color) VALUES('${stage}','${pipeline}','Etapa QA','#123456');
      INSERT INTO public.cliente_atend_ia_agentes(id,cliente_id,nome,instrucoes,created_by) VALUES('${agent}','${client}','Agente QA','INSTRUCAO_NAO_PUBLICA','${admin}');
      INSERT INTO public.cliente_whatsapp_contact(id,cliente_id,from_jid,phone,sender_name,whatsapp_config_id)
        SELECT ('00000000-0000-4000-8000-'||lpad((100+n)::text,12,'0'))::uuid,'${client}',
          '55119000'||lpad(n::text,5,'0')||'@s.whatsapp.net','55119000'||lpad(n::text,5,'0'),'Caso '||n,'${hiddenChannel}' FROM generate_series(1,16) n;
      UPDATE public.cliente_whatsapp_contact SET from_jid='grupo@g.us' WHERE id='${contact(4)}';
      UPDATE public.cliente_whatsapp_contact SET from_jid='identidade-oculta@lid',phone=split_part('${jid(10)}','@',1) WHERE id='${contact(11)}';
      INSERT INTO public.cliente_atend_conversas(cliente_id,contact_id,status,status_at,ia_pausada,assigned_to,privado,ia_followup_due_at)
        SELECT '${client}',id,CASE WHEN id='${contact(3)}' THEN 'finalizado' WHEN id='${contact(1)}' THEN 'esperando' ELSE 'entrada' END,
          '2026-11-10T12:00Z',id='${contact(1)}',CASE WHEN id='${contact(3)}' THEN '${admin}'::uuid ELSE '${staff}'::uuid END,
          id IN('${contact(2)}','${contact(11)}'),CASE WHEN id='${contact(6)}' THEN '2026-11-10T20:00Z'::timestamptz END
        FROM public.cliente_whatsapp_contact WHERE id BETWEEN '${contact(1)}' AND '${contact(16)}';
      INSERT INTO public.leads(id,cliente_id,nome,whatsapp,email,origem,data_entrada,valor,pipeline_id,stage_id,responsavel_id,qualificado,crm_ia_contact_id)
        SELECT ('00000000-0000-4000-8000-'||lpad((200+n)::text,12,'0'))::uuid,'${client}','Lead QA '||n,'55119000'||lpad(n::text,5,'0'),
          'qa'||n||'@example.test',CASE WHEN n%2=0 THEN 'site' ELSE 'manual' END,'2026-11-10',n*10,'${pipeline}','${stage}',
          CASE WHEN n%2=0 THEN '${staff}'::uuid ELSE '${admin}'::uuid END,n%2=0,
          CASE WHEN n=10 THEN NULL ELSE ('00000000-0000-4000-8000-'||lpad((100+n)::text,12,'0'))::uuid END FROM generate_series(1,16) n;
      -- One explicit link wins over phone fallback; two explicit links remain ambiguous.
      INSERT INTO public.leads(id,cliente_id,nome,whatsapp,origem,data_entrada,pipeline_id,stage_id,responsavel_id,crm_ia_contact_id)
        VALUES('${id(290)}','${client}','Fallback extra',split_part('${jid(12)}','@',1),'manual','2026-11-10','${pipeline}','${stage}','${admin}',NULL),
          ('${id(291)}','${client}','Segundo explícito',split_part('${jid(13)}','@',1),'manual','2026-11-10','${pipeline}','${stage}','${admin}','${contact(13)}');
      INSERT INTO public.cliente_whatsapp_inbox(cliente_id,whatsapp_config_id,from_jid,chat_jid,body,msg_timestamp,created_at,message_id)
        SELECT '${client}',v.channel,c.from_jid,c.from_jid,'Recebida QA '||c.sender_name,'2026-11-10T12:00Z','2026-11-10T12:00Z','initial:'||c.id||':'||v.channel
        FROM public.cliente_whatsapp_contact c CROSS JOIN(VALUES('${channel}'::uuid),('${second}'::uuid)) v(channel)
        WHERE c.id BETWEEN '${contact(1)}' AND '${contact(16)}' AND c.id NOT IN('${contact(11)}','${contact(14)}','${contact(15)}');
      INSERT INTO public.cliente_whatsapp_inbox(cliente_id,whatsapp_config_id,from_jid,chat_jid,body,msg_timestamp,created_at,is_group,message_id) VALUES
        ('${client}','${channel}','${jid(1)}','${jid(1)}','GROUP_FORBIDDEN','2026-11-10T23:00Z','2026-11-10T23:00Z',true,'group'),
        ('${client}','${channel}','alias-de-transporte@lid','${jid(5)}','ALIAS_IN_CHAT','2026-11-10T14:00Z','2026-11-10T14:00Z',false,'alias-in-chat'),
        ('${client}','${channel}','${jid(5)}','outro-alias@lid','ALIAS_IN_FROM','2026-11-10T15:00Z','2026-11-10T15:00Z',false,'alias-in-from'),
        ('${client}','${channel}','${jid(6)}','${jid(6)}','NULL_TIMESTAMP_FALLBACK',NULL,'2026-11-10T18:00Z',false,'null-time'),
        ('${client}','${channel}','${jid(6)}','${jid(6)}','OLD_PROVIDER_TIME','2025-01-01T12:00Z','2026-11-11T12:00Z',false,'late-old'),
        ('${client}','${channel}','${jid(7)}','${jid(7)}','LATEST_OUTSIDE_PERIOD','2026-11-11T03:00Z','2026-11-11T03:00Z',false,'outside'),
        ('${client}','${hiddenChannel}','${jid(14)}','${jid(14)}','DENIED_FORBIDDEN','2026-11-10T12:00Z','2026-11-10T12:00Z',false,'denied'),
        ('${client}','${archived}','${jid(14)}','${jid(14)}','ARCHIVED_FORBIDDEN','2026-11-10T12:00Z','2026-11-10T12:00Z',false,'archived'),
        ('${client}',NULL,'${jid(14)}','${jid(14)}','NULL_CHANNEL_FORBIDDEN','2026-11-10T12:00Z','2026-11-10T12:00Z',false,'null-channel'),
        ('${client}','${missingChannel}','${jid(14)}','${jid(14)}','MISSING_CHANNEL_FORBIDDEN','2026-11-10T12:00Z','2026-11-10T12:00Z',false,'missing-channel'),
        ('${client}','${foreignChannel}','${jid(14)}','${jid(14)}','CROSS_TENANT_FORBIDDEN','2026-11-10T12:00Z','2026-11-10T12:00Z',false,'foreign-config'),
        ('${foreign}','${foreignChannel}','${jid(1)}','${jid(1)}','FOREIGN_TENANT_FORBIDDEN','2026-11-10T23:00Z','2026-11-10T23:00Z',false,'foreign-message');
      INSERT INTO public.cliente_whatsapp_inbox(id,cliente_id,whatsapp_config_id,from_jid,chat_jid,body,msg_timestamp,created_at,message_id) VALUES
        ('${id(8800)}','${client}','${channel}','${jid(8)}','${jid(8)}','TIE_INPUT','2026-11-10T16:00Z','2026-11-10T16:00Z','tie-input'),
        ('${id(8803)}','${client}','${channel}','${jid(9)}','${jid(9)}','HIGHER_UUID_INPUT','2026-11-10T16:00Z','2026-11-10T16:00Z','higher-input');
      INSERT INTO public.cliente_whatsapp_sent(id,cliente_id,whatsapp_config_id,to_jid,chat_jid,body,created_at,message_id) VALUES
        ('${id(8800)}','${client}','${channel}','${jid(8)}','${jid(8)}','TIE_SENT_WINS','2026-11-10T16:00Z','tie-sent'),
        ('${id(8802)}','${client}','${channel}','${jid(9)}','${jid(9)}','LOWER_UUID_SENT','2026-11-10T16:00Z','lower-sent'),
        ('${id(8810)}','${client}','${channel}','alias-sent@lid','${jid(15)}','ALIAS_SENT_CHAT','2026-11-10T16:00Z','alias-sent-chat'),
        ('${id(8811)}','${client}','${second}','${jid(15)}','outro-chat@lid','ALIAS_SENT_TO','2026-11-10T16:00Z','alias-sent-to');
      INSERT INTO public.crm_ia_appointments(cliente_id,lead_id,contact_id,owner_id,start_at,end_at,busy_start_at,busy_end_at,title,status,request_id,created_by)
        VALUES('${client}','${lead(1)}','${contact(1)}','${staff}','2026-11-10T15:00Z','2026-11-10T15:30Z','2026-11-10T15:00Z','2026-11-10T15:30Z','Compromisso QA','scheduled','${id(901)}','${admin}');
      INSERT INTO public.cliente_atend_ia_log(cliente_id,agente_id,contact_id,user_id,acao,tokens,whatsapp_config_id,created_at) VALUES
        ('${client}','${agent}','${contact(1)}','${admin}','responder',10,'${channel}','2026-11-10T12:00Z'),
        ('${client}','${agent}','${contact(1)}','${staff}','sugerir',20,'${second}','2026-11-10T12:00Z'),
        ('${client}','${agent}','${contact(1)}','${admin}','responder',999,'${hiddenChannel}','2026-11-10T12:00Z');
      CREATE INDEX qa_perf_inbox_from ON public.cliente_whatsapp_inbox(cliente_id,from_jid);
      CREATE INDEX qa_perf_inbox_chat ON public.cliente_whatsapp_inbox(cliente_id,chat_jid,created_at DESC);
      CREATE INDEX qa_perf_inbox_created ON public.cliente_whatsapp_inbox(cliente_id,created_at DESC);
      CREATE INDEX qa_perf_sent_to ON public.cliente_whatsapp_sent(cliente_id,to_jid);
      CREATE INDEX qa_perf_sent_chat ON public.cliente_whatsapp_sent(cliente_id,chat_jid,created_at DESC);
      CREATE INDEX qa_perf_sent_created ON public.cliente_whatsapp_sent(cliente_id,created_at DESC);
      CREATE INDEX qa_perf_contact_identity ON public.cliente_whatsapp_contact(cliente_id,from_jid);
      CREATE INDEX qa_perf_lead_entry ON public.leads(cliente_id,data_entrada DESC);
      ANALYZE;`);

    const conversation = (n, actor = admin, channelId = channel) => read('conversations', { ...period, contact_id: contact(n), channel_id: channelId }, actor);
    await t.test('golden tem grupos/ACL/aliases/ambiguidade e desempate antes de carregar a migração', () => {
      assert.throws(() => conversation(2), /acesso.*contato/i, 'admin cannot read a private conversation assigned to another person');
      assert.equal(conversation(2, staff).total, 1);
      assert.equal(conversation(2, superadmin).total, 1);
      assert.throws(() => conversation(3, staff), /acesso.*contato/i, 'responsible scope requires assignment');
      assert.throws(() => conversation(4), /acesso.*contato/i, 'group JID is not a contact conversation');
      assert.equal(conversation(7).total, 0, 'latest outside the period must not resurrect the older message');
      assert.equal(conversation(5).rows[0].last_message, 'ALIAS_IN_FROM');
      assert.equal(conversation(6).rows[0].last_message, 'NULL_TIMESTAMP_FALLBACK');
      assert.equal(conversation(8).rows[0].last_message, 'TIE_SENT_WINS');
      assert.equal(conversation(9).rows[0].last_message, 'HIGHER_UUID_INPUT');
      assert.equal(conversation(10).rows[0].lead_id, null, 'a hidden duplicate phone still makes fallback ambiguous');
      assert.equal(conversation(12).rows[0].lead_id, lead(12), 'one explicit link wins over fallback');
      assert.equal(conversation(13).rows[0].lead_id, null, 'two explicit leads are ambiguous');
      assert.equal(read('conversations', { ...period, contact_id: contact(14) }).total, 0);
      assert.equal(conversation(15).rows[0].last_message, 'ALIAS_SENT_CHAT');
      assert.equal(conversation(15, admin, second).rows[0].last_message, 'ALIAS_SENT_TO');
      const serialized = JSON.stringify(read('conversations', { ...period, limit: 200 }));
      assert.doesNotMatch(serialized, /FORBIDDEN|INSTRUCAO_NAO_PUBLICA/);
    });
    const filters = [{}, { contact_id: contact(1) }, { channel_id: second }, { owner_id: staff },
      { pipeline_id: pipeline }, { pipeline_id: pipeline, stage_id: stage, origin: 'site' }, { search: 'Caso 1' },
      ...['ai', 'human', 'resolved', 'waiting', 'followup'].map(attendance => ({ attendance })),
      { sort: 'name', limit: 2, offset: 1 }, { sort: 'oldest', limit: 2 }, { sort: 'value', limit: 2 },
      { since: '2026-11-11', until: '2026-11-11' }];
    const cases = [admin, staff].flatMap(actor => ['overview', 'conversations', 'usage'].flatMap(action => filters.map(filter => ({
      actor, action, payload: { ...period, ...filter },
    }))));
    cases.push({ actor: admin, action: 'lead', payload: { id: lead(1), channel_id: second } });
    const golden = cases.map(item => read(item.action, item.payload, item.actor));
    const before = metadata();
    assert.equal(before.security_definer, false); assert.equal(before.volatility, 's');
    assert.deepEqual(before.config, ['search_path=""']); assert.equal(before.anonymous, false); assert.equal(before.authenticated, false);
    sql(readFileSync(new URL('../../supabase/migrations/20261111162400_crm_ia_conversation_read_performance.sql', import.meta.url), 'utf8'));

    await t.test('OID, owner, atributos e grants permanecem exatamente iguais', () => {
      assert.deepEqual(metadata(), before);
      assert.throws(() => sql(`SET ROLE authenticated;SELECT count(*) FROM private.crm_ia_conversation_rows('${client}')`), /permission denied/);
    });
    await t.test('JSON completo permanece igual nos filtros e consumidores existentes', () => {
      for (let i = 0; i < cases.length; i++) {
        const item = cases[i];
        assert.deepEqual(read(item.action, item.payload, item.actor), golden[i], JSON.stringify(item));
      }
      t.diagnostic(`${cases.length} envelopes pré/pós comparados integralmente`);
    });
    await t.test('canal negado/arquivado e cliente sem permissão continuam fechados', () => {
      for (const channelId of [hiddenChannel, archived, missingChannel, foreignChannel]) {
        assert.throws(() => read('conversations', { ...period, channel_id: channelId }), /acesso|canal/i);
      }
      assert.throws(() => read('overview', period, staff, foreign), /acesso|conta/i);
      assert.throws(() => read('overview', period, other), /acesso|conta/i);
      assert.throws(() => read('lead', { id: lead(3) }, staff), /acesso|lead/i);
    });
    await t.test('revogação vale na próxima consulta e não há cache entre pedidos', () => {
      assert.equal(conversation(1, admin, second).total, 1);
      sql(`INSERT INTO public.qa_read_channel_denials VALUES('${admin}','${second}')`);
      assert.throws(() => conversation(1, admin, second), /acesso|canal/i);
      assert.equal(read('conversations', { ...period, contact_id: contact(1) }).rows.some(row => row.channel_id === second), false);
      sql(`DELETE FROM public.qa_read_channel_denials WHERE actor_id='${admin}' AND channel_id='${second}';UPDATE public.cliente_whatsapp_config SET archived_at=clock_timestamp() WHERE id='${second}'`);
      assert.throws(() => conversation(1, admin, second), /acesso|canal/i);
      sql(`UPDATE public.cliente_whatsapp_config SET archived_at=NULL WHERE id='${second}';INSERT INTO public.user_module_permissions VALUES('${admin}','atendimento',false),('${admin}','rastreamento',false)`);
      const unavailable = read('overview', period);
      assert.equal(unavailable.coverage.conversations, 'unavailable'); assert.equal(unavailable.totals.conversations, null);
      sql(`DELETE FROM public.user_module_permissions WHERE user_id='${admin}' AND module_name IN('atendimento','rastreamento')`);
      assert.equal(conversation(1, admin, second).total, 1);
    });
    await t.test('milhares de mensagens não multiplicam chamadas reais de autorização de canal', () => {
      const overview = read('overview', period);
      sql(`INSERT INTO public.cliente_whatsapp_inbox(cliente_id,whatsapp_config_id,from_jid,chat_jid,body,msg_timestamp,created_at,message_id)
        SELECT '${client}',CASE WHEN n%2=0 THEN '${channel}'::uuid ELSE '${second}'::uuid END,'${jid(1)}','${jid(1)}','Histórico antigo QA',
          '2025-01-01T12:00Z'::timestamptz+make_interval(secs=>n),'2025-01-01T12:00Z'::timestamptz+make_interval(secs=>n),'perf-history:'||n FROM generate_series(1,2000) n;
        INSERT INTO public.cliente_whatsapp_sent(cliente_id,whatsapp_config_id,to_jid,chat_jid,body,created_at,message_id)
        SELECT '${client}','${channel}','${jid(1)}','${jid(1)}','Histórico enviado QA','2025-01-02T12:00Z'::timestamptz+make_interval(secs=>n),'perf-sent-history:'||n FROM generate_series(1,1000) n;ANALYZE;`);
      // Each sql() starts a new backend. Ending the measured backend flushes its function stats;
      // a third backend then reads them, avoiding a cached statistics snapshot or a timing assertion.
      sql('SELECT pg_stat_reset()');
      const measured = read('overview', period);
      const calls = Number(sql(`SELECT coalesce((SELECT calls FROM pg_stat_user_functions WHERE funcid='private.crm_ia_channel(uuid,uuid,boolean)'::regprocedure),0)`));
      t.diagnostic(`crm_ia_channel: ${calls} chamadas reais para 3.000 mensagens históricas adicionais`);
      assert.deepEqual(measured, overview, 'old history does not change the latest conversation envelope');
      assert.ok(calls > 0 && calls <= 16, `expected 1..16 real channel ACL checks per overview, observed ${calls}`);
    });
  } finally {
    globalThis.fetch = originalFetch;
    try { if (started) run('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop']); }
    finally { rmSync(work, { recursive: true, force: true }); }
  }
});

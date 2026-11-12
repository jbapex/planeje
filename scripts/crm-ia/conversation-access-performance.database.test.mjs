import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const work = mkdtempSync('/tmp/crm-conversation-access-'), data = join(work, 'data');
const env = { PATH: process.env.PATH, LC_ALL: 'C' };
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const context = Object.fromEntries(['admin', 'staff', 'other', 'client', 'foreign', 'channel', 'hiddenChannel', 'contact'].map((key, index) => [key, id([1, 2, 3, 11, 12, 21, 22, 31][index])]));
const { admin, staff, other, client, foreign, channel, hiddenChannel } = context;
const superadmin = id(4), plain = id(5), limited = id(6), second = id(23), archived = id(24), foreignChannel = id(25);
const pipeline = id(41), stage = id(51), contact = n => id(1000 + n), lead = n => id(2000 + n);
const jid = n => `55119000${String(n).padStart(5, '0')}@s.whatsapp.net`;
const period = { since: '2026-11-10', until: '2026-11-10' };
const psql = ['-X', '-Aqt', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose', '-h', work, '-p', '55642', '-U', 'conversation_access_qa', '-d', 'postgres'];
function run(binary, args, input) {
  const result = spawnSync(binary, args, { input, env, encoding: 'utf8', timeout: 30000, maxBuffer: 8 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw Error(result.stderr?.trim() || result.error?.message || result.stdout);
  return result.stdout.trim();
}
const sql = statement => run('psql', psql, statement);
const quote = value => `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
const migration = file => readFileSync(new URL(`../../supabase/migrations/${file}`, import.meta.url), 'utf8');
function definition(file, name) {
  const found = migration(file).match(new RegExp(`create(?: or replace)? function ${name.replaceAll('.', '\\.')}\\([\\s\\S]*?\\$\\$;`, 'i'));
  assert.ok(found, name);return found[0];
}
const identity = actor => `SET LOCAL test.uid='${actor}';SET LOCAL ROLE authenticated;`;
const read = (action, payload = period, actor = admin, target = client) => JSON.parse(sql(`BEGIN READ ONLY;${identity(actor)}SELECT public.crm_ia_workspace('${action}','${target}',${quote(payload)});COMMIT;`));
const snapshot = (actor, target = client) => JSON.parse(sql(`BEGIN READ ONLY;${identity(actor)}SELECT public.qa_access_snapshot('${target}');COMMIT;`));
const metadata = () => JSON.parse(sql(`SELECT jsonb_build_object('oid',oid,'owner',proowner,'language',prolang,'definer',prosecdef,'volatile',provolatile,'strict',proisstrict,'parallel',proparallel,'leakproof',proleakproof,'cost',procost,'rows',prorows,'config',proconfig,'acl',proacl::text,'arguments',pg_get_function_arguments(oid),'result',pg_get_function_result(oid)) FROM pg_proc WHERE oid='private.crm_ia_conversation_rows(uuid)'::regprocedure`));
const helpers = () => JSON.parse(sql(`SELECT jsonb_object_agg(proname,md5(prosrc)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND proname IN('crm_ia_role','crm_ia_client','crm_ia_contact','crm_ia_lead','crm_ia_channel','planeje_live_session')`));
const published = ['20261111041703_crm_ia_delivery_runtime.sql', '20261111041704_crm_ia_workspace.sql', '20261111043800_crm_ia_workspace_readings.sql', '20261111044652_crm_ia_agent_runtime.sql', '20261111062101_crm_ia_calendar.sql', '20261111062548_crm_ia_voice.sql', '20261111072502_crm_ia_calendar_delivery.sql', '20261111075558_crm_ia_agent_template_contract.sql', '20261111090001_crm_ia_appointment_actions.sql', '20261111090002_crm_ia_agent_drafts_voice_modes.sql', '20261111090003_crm_ia_lead_tags.sql', '20261111101501_crm_ia_lead_profiles.sql', '20261111101502_crm_ia_lead_reads.sql', '20261111120001_crm_ia_internal_notifications.sql', '20261111120002_crm_ia_conversation_controls.sql', '20261111162400_crm_ia_conversation_read_performance.sql', '20261111185514_crm_ia_message_authorship.sql'];

function assertSnapshot(result) {
  assert.equal(result.equal, true, 'o envelope completo deve coincidir com o leitor16 usando os helpers escalares');
  const visible = new Set(result.rows.map(row => row.contact_id));
  for (const row of result.rows) {
    assert.equal(result.contacts[row.contact_id], true, `contato sem gate canônico: ${row.contact_id}`);
    if (row.lead_id) assert.equal(result.leads[row.lead_id], true, `lead sem gate canônico: ${row.lead_id}`);
  }
  for (let n = 20; n <= 550; n += 1) {
    assert.equal(visible.has(contact(n)), result.contacts[contact(n)], `completude do contato ${n}`);
    for (const row of result.rows.filter(item => item.contact_id === contact(n))) assert.equal(row.lead_id, result.leads[lead(n)] ? lead(n) : null, `gate de lead ${n}`);
  }
}

test('escopo de acesso do leitor mantém ACL e limita trabalho de sessão/role por consulta', async t => {
  let started = false;
  const previousFetch = globalThis.fetch;
  globalThis.fetch = () => { throw Error('Rede externa proibida nesta fixture de acesso.'); };
  try {
    run('initdb', ['-D', data, '-U', 'conversation_access_qa', '--auth-local=trust', '--auth-host=reject', '--no-locale', '--encoding=UTF8']);
    run('pg_ctl', ['-D', data, '-l', join(work, 'postgres.log'), '-o', `-k ${work} -p 55642 -c listen_addresses='' -c unix_socket_permissions=0700 -c track_functions=all`, '-w', 'start']);started = true;
    assert.equal(sql('SHOW listen_addresses'), '');assert.equal(sql('SHOW track_functions'), 'all');
    const fixture = readFileSync(new URL('./workspace.database.test.mjs', import.meta.url), 'utf8').split('    sql(`')[1].split('    `);')[0].replace(/\$\{(\w+)\}/g, (_, key) => context[key]);
    sql(fixture.replace(/      CREATE TABLE public\.crm_ia_outbox\([^\n]+\n/, ''));
    sql(`CREATE SCHEMA planeje_private;CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid,not_after timestamptz);CREATE TABLE auth.users(id uuid PRIMARY KEY,banned_until timestamptz);
      CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT jsonb_build_object('sub',auth.uid(),'session_id',auth.uid())$$;
      CREATE TABLE public.atlas_settings(id text PRIMARY KEY,owner_id uuid,enabled boolean);
      ALTER TABLE public.profiles ADD COLUMN avatar_url text;
      ALTER TABLE public.cliente_whatsapp_contact ADD COLUMN last_message_at timestamptz,ADD COLUMN origin_source text DEFAULT 'nao_identificado',ADD COLUMN qualificado boolean,ADD COLUMN profile_pic_url text;
      ALTER TABLE public.cliente_whatsapp_sent ADD COLUMN sent_by uuid;
      ALTER TABLE public.leads ADD COLUMN qualificado boolean;
      ALTER TABLE public.cliente_atend_conversas ADD COLUMN ia_followup_passo integer DEFAULT 0;
      CREATE TABLE public.atendimento_conversas(id uuid PRIMARY KEY,cliente_id uuid,whatsapp_config_id uuid,chat_jid text,archived_at timestamptz,bloqueada boolean DEFAULT false);
      CREATE TABLE public.atendimento_conversa_planejamento(id uuid PRIMARY KEY,cliente_id uuid,conversation_id uuid,whatsapp_config_id uuid,chat_jid text,kind text,body text,status text,scheduled_at timestamptz,completed_at timestamptz,error_message text,updated_at timestamptz DEFAULT now());
      INSERT INTO public.profiles(id,role,status,full_name) VALUES('${superadmin}','superadmin','active','Gestão global QA'),('${plain}','colaborador','active','Equipe sem restrição QA'),('${limited}','colaborador','active','Carteira responsável QA');
      INSERT INTO auth.users(id) SELECT id FROM public.profiles;INSERT INTO auth.sessions(id,user_id) SELECT id,id FROM public.profiles;
      INSERT INTO public.user_module_access VALUES('${limited}','clients','responsible'),('${limited}','crm','responsible');
      GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;`);
    for (const name of ['private.planeje_live_session', 'private.planeje_approved_access', 'public.planeje_current_account_access']) sql(definition('20261013140451_invite_only_access.sql', name));
    sql(definition('20261013152143_trusted_atlas_delegation.sql', 'private.planeje_live_session'));
    for (const file of published) sql(migration(file));
    sql(migration('20261111162400_crm_ia_conversation_read_performance.sql').replace('private.crm_ia_conversation_rows(', 'private.qa_conversation_rows_before_access('));
    sql(`REVOKE ALL ON FUNCTION private.qa_conversation_rows_before_access(uuid) FROM PUBLIC,anon,authenticated;
      CREATE TABLE public.qa_channel_denials(actor_id uuid,channel_id uuid,PRIMARY KEY(actor_id,channel_id));
      CREATE OR REPLACE FUNCTION public.atendimento_user_can_access_atendimento_scope(uuid,uuid,uuid) RETURNS boolean LANGUAGE sql STABLE AS $$SELECT $3<>'${hiddenChannel}'::uuid AND NOT EXISTS(SELECT 1 FROM public.qa_channel_denials d WHERE d.actor_id=auth.uid() AND d.channel_id=$3)$$;
      INSERT INTO public.cliente_whatsapp_config(id,cliente_id,name,archived_at) VALUES('${second}','${client}','Segundo canal QA',NULL),('${archived}','${client}','Arquivado QA','2026-01-01'),('${foreignChannel}','${foreign}','Canal alheio QA',NULL);
      INSERT INTO public.crm_pipelines(id,cliente_id,nome) VALUES('${pipeline}','${client}','Funil QA');INSERT INTO public.crm_stages(id,pipeline_id,nome) VALUES('${stage}','${pipeline}','Etapa QA');
      INSERT INTO public.cliente_whatsapp_contact(id,cliente_id,from_jid,phone,sender_name,whatsapp_config_id)
        SELECT ('00000000-0000-4000-8000-'||lpad((1000+n)::text,12,'0'))::uuid,'${client}',
          '55119000'||lpad(n::text,5,'0')||'@s.whatsapp.net','55119000'||lpad(n::text,5,'0'),'Contato QA '||n,'${hiddenChannel}' FROM generate_series(1,550) n;
      UPDATE public.cliente_whatsapp_contact SET from_jid='grupo@g.us' WHERE id='${contact(4)}';
      UPDATE public.cliente_whatsapp_contact SET from_jid='alias-oculto@lid',phone=split_part('${jid(10)}','@',1) WHERE id='${contact(11)}';
      UPDATE public.cliente_whatsapp_contact SET from_jid=NULL WHERE id='${contact(18)}';
      INSERT INTO public.cliente_atend_conversas(cliente_id,contact_id,status,ia_pausada,assigned_to,privado,ia_followup_due_at)
        SELECT '${client}',id,CASE WHEN id='${contact(3)}' THEN 'finalizado' WHEN id='${contact(1)}' THEN 'esperando' ELSE 'entrada' END,
          false,CASE WHEN (right(id::text,12)::bigint)%3=0 THEN '${admin}'::uuid ELSE '${staff}'::uuid END,
          id IN('${contact(2)}','${contact(11)}','${contact(19)}'),CASE WHEN id='${contact(6)}' THEN '2026-11-10T20:00Z'::timestamptz END
        FROM public.cliente_whatsapp_contact WHERE id BETWEEN '${contact(1)}' AND '${contact(550)}' AND id<>'${contact(5)}';
      UPDATE public.cliente_atend_conversas SET assigned_to='${staff}' WHERE contact_id='${contact(2)}';
      UPDATE public.cliente_atend_conversas SET assigned_to='${admin}' WHERE contact_id='${contact(11)}';
      UPDATE public.cliente_atend_conversas SET assigned_to=NULL WHERE contact_id='${contact(19)}';
      INSERT INTO public.leads(id,cliente_id,nome,whatsapp,pipeline_id,stage_id,responsavel_id,crm_ia_contact_id,valor,origem,data_entrada)
        SELECT ('00000000-0000-4000-8000-'||lpad((2000+n)::text,12,'0'))::uuid,'${client}','Lead QA '||n,'55119000'||lpad(n::text,5,'0'),'${pipeline}','${stage}',
          CASE WHEN n%2=0 THEN '${admin}'::uuid ELSE '${staff}'::uuid END,CASE WHEN n=10 THEN NULL ELSE ('00000000-0000-4000-8000-'||lpad((1000+n)::text,12,'0'))::uuid END,n,'site','2026-11-10' FROM generate_series(1,550) n;
      INSERT INTO public.leads(id,cliente_id,nome,whatsapp,pipeline_id,stage_id,responsavel_id,crm_ia_contact_id) VALUES
        ('${id(2901)}','${client}','Fallback extra QA',split_part('${jid(12)}','@',1),'${pipeline}','${stage}','${admin}',NULL),
        ('${id(2902)}','${client}','Duplicata explícita QA',split_part('${jid(13)}','@',1),'${pipeline}','${stage}','${admin}','${contact(13)}');
      INSERT INTO public.cliente_whatsapp_inbox(cliente_id,whatsapp_config_id,from_jid,chat_jid,body,msg_timestamp,created_at,message_id)
        SELECT '${client}',v.channel,c.from_jid,c.from_jid,'Última recebida QA','2026-11-10T12:00Z','2026-11-10T12:00Z','latest:'||c.id||':'||v.channel
        FROM public.cliente_whatsapp_contact c CROSS JOIN(VALUES('${channel}'::uuid),('${second}'::uuid)) v(channel) WHERE c.id BETWEEN '${contact(1)}' AND '${contact(550)}';
      INSERT INTO public.cliente_whatsapp_inbox(cliente_id,whatsapp_config_id,from_jid,chat_jid,body,msg_timestamp,created_at,message_id)
        SELECT '${client}','${channel}','55119000'||lpad((1+n%550)::text,5,'0')||'@s.whatsapp.net','55119000'||lpad((1+n%550)::text,5,'0')||'@s.whatsapp.net','Histórico sintético antigo',
          '2025-01-01T12:00Z'::timestamptz+make_interval(secs=>n),'2025-01-01T12:00Z'::timestamptz+make_interval(secs=>n),'old-in:'||n FROM generate_series(1,25000) n;
      INSERT INTO public.cliente_whatsapp_sent(cliente_id,whatsapp_config_id,to_jid,chat_jid,body,created_at,message_id)
        SELECT '${client}','${channel}','55119000'||lpad((1+n%550)::text,5,'0')||'@s.whatsapp.net','55119000'||lpad((1+n%550)::text,5,'0')||'@s.whatsapp.net','Histórico enviado sintético','2025-01-02T12:00Z'::timestamptz+make_interval(secs=>n),'old-out:'||n FROM generate_series(1,6000) n;
      INSERT INTO public.cliente_whatsapp_inbox(cliente_id,whatsapp_config_id,from_jid,chat_jid,body,msg_timestamp,created_at,message_id) VALUES
        ('${client}','${channel}','${jid(7)}','${jid(7)}','Última fora do período','2026-11-11T12:00Z','2026-11-11T12:00Z','future-latest'),
        ('${client}','${channel}','alias-transport@lid','${jid(8)}','Alias em chat','2026-11-10T14:00Z','2026-11-10T14:00Z','alias-chat'),
        ('${client}','${channel}','${jid(9)}','outro-alias@lid','Alias em origem','2026-11-10T14:00Z','2026-11-10T14:00Z','alias-from');
      CREATE FUNCTION public.qa_access_snapshot(p_client uuid) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
        WITH current_rows AS MATERIALIZED(SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.contact_id,c.channel_id),'[]') AS rows FROM private.crm_ia_conversation_rows(p_client) c),
        old_rows AS MATERIALIZED(SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.contact_id,c.channel_id),'[]') AS rows FROM private.qa_conversation_rows_before_access(p_client) c)
        SELECT jsonb_build_object('equal',c.rows IS NOT DISTINCT FROM o.rows,'rows',c.rows,
          'contacts',(SELECT jsonb_object_agg(x.id,private.crm_ia_contact(p_client,x.id)) FROM public.cliente_whatsapp_contact x WHERE x.cliente_id=p_client),
          'leads',(SELECT jsonb_object_agg(x.id,private.crm_ia_lead(x.id,p_client)) FROM public.leads x WHERE x.cliente_id=p_client)) FROM current_rows c,old_rows o
      $$;
      CREATE FUNCTION public.qa_access_count(p_client uuid) RETURNS bigint LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$SELECT count(*) FROM private.crm_ia_conversation_rows(p_client)$$;
      REVOKE ALL ON FUNCTION public.qa_access_snapshot(uuid),public.qa_access_count(uuid) FROM PUBLIC,anon;GRANT EXECUTE ON FUNCTION public.qa_access_snapshot(uuid),public.qa_access_count(uuid) TO authenticated;ANALYZE;`);
    const beforeMetadata = metadata(), beforeHelpers = helpers();
    const envelopeCases = [admin, superadmin, staff, plain].flatMap(actor => [{}, { search: 'Contato QA 1' }, { search: '11900000001' }].map(filter => ({ actor, action: 'conversations', payload: { ...period, ...filter, limit: 30 } })));
    envelopeCases.push({ actor: admin, action: 'overview', payload: period }, { actor: admin, action: 'usage', payload: period });
    const golden = envelopeCases.map(item => read(item.action, item.payload, item.actor));
    const candidate = readdirSync(new URL('../../supabase/migrations/', import.meta.url)).filter(file => /^\d+_crm_ia_conversation_access_performance\.sql$/.test(file));
    for (const file of candidate) sql(migration(file));

    await t.test('metadados, assinatura, grants e helpers canônicos permanecem intactos', () => {
      assert.deepEqual(metadata(), beforeMetadata);assert.deepEqual(helpers(), beforeHelpers);
      for (const role of ['anon', 'authenticated']) assert.throws(() => sql(`SET ROLE ${role};SELECT * FROM private.crm_ia_conversation_rows('${client}')`), /permission denied/);
    });
    await t.test('predicados por contato/lead coincidem com os escalares para todos os papéis e NULLs', () => {
      for (const actor of [admin, superadmin, staff, plain, limited, other]) assertSnapshot(snapshot(actor));
      const adminRows = snapshot(admin).rows, superRows = snapshot(superadmin).rows, staffRows = snapshot(staff).rows;
      assert.equal(adminRows.some(row => row.contact_id === contact(2)), false);assert.equal(superRows.some(row => row.contact_id === contact(2)), true);
      assert.equal(superRows.some(row => row.contact_id === contact(19)), true);assert.equal(staffRows.some(row => row.contact_id === contact(19)), false);
      for (const rows of [adminRows, superRows, staffRows]) assert.equal(rows.some(row => [contact(4), contact(18)].includes(row.contact_id)), false);
      assert.equal(staffRows.find(row => row.contact_id === contact(12)).lead_id, null, 'lead explícito sem acesso não vira outro lead por telefone');
      assert.equal(staffRows.find(row => row.contact_id === contact(10)).lead_id, null, 'telefone duplicado oculto permanece ambíguo');
      assert.equal(staffRows.find(row => row.contact_id === contact(13)).lead_id, null, 'dois vínculos explícitos não escolhem o visível');
    });
    await t.test('JSON dos consumidores, busca e regra de latest permanecem iguais', () => {
      envelopeCases.forEach((item, index) => assert.deepEqual(read(item.action, item.payload, item.actor), golden[index], `${item.actor}:${item.action}:${JSON.stringify(item.payload)}`));
      assert.equal(read('conversations', { ...period, contact_id: contact(7), channel_id: channel }).total, 0);
      for (const key of [hiddenChannel, archived, foreignChannel, id(99)]) assert.throws(() => read('conversations', { ...period, channel_id: key }), /acesso|canal/i);
      assert.throws(() => read('conversations', period, staff, foreign), /acesso|conta/i);assert.throws(() => read('conversations', period, other), /acesso/i);
    });
    await t.test('revogação na sessão e plano preparado do mesmo backend vale na próxima leitura', () => {
      const changes = [
        { actor: superadmin, patch: `UPDATE profiles SET role='admin' WHERE id='${superadmin}'`, restore: `UPDATE profiles SET role='superadmin' WHERE id='${superadmin}'`, check: row => !row.rows.some(item => item.contact_id === contact(2)) },
        { actor: staff, patch: `DELETE FROM auth.sessions WHERE user_id='${staff}'`, restore: `INSERT INTO auth.sessions(id,user_id) VALUES('${staff}','${staff}')`, check: row => row.rows.length === 0 },
        { actor: staff, patch: `UPDATE auth.users SET banned_until=now()+interval '1 day' WHERE id='${staff}'`, restore: `UPDATE auth.users SET banned_until=NULL WHERE id='${staff}'`, check: row => row.rows.length === 0 },
        { actor: staff, patch: `INSERT INTO user_module_permissions VALUES('${staff}','crm',false)`, restore: `DELETE FROM user_module_permissions WHERE user_id='${staff}' AND module_name='crm'`, check: row => row.rows.length === 0 },
        { actor: staff, patch: `INSERT INTO qa_channel_denials VALUES('${staff}','${second}')`, restore: `DELETE FROM qa_channel_denials WHERE actor_id='${staff}'`, check: row => row.rows.every(item => item.channel_id !== second) },
        { actor: plain, patch: `INSERT INTO user_module_access VALUES('${plain}','crm','responsible')`, restore: `DELETE FROM user_module_access WHERE user_id='${plain}'`, check: row => row.rows.length < snapshot(plain).rows.length },
      ];
      for (const change of changes) {
        const command = `SET test.uid='${change.actor}';SET ROLE authenticated;PREPARE qa_plan(uuid) AS SELECT public.qa_access_snapshot($1);EXECUTE qa_plan('${client}');RESET ROLE;${change.patch};SET ROLE authenticated;EXECUTE qa_plan('${client}');RESET ROLE;${change.restore};DEALLOCATE qa_plan;`;
        try {
          const [before, after] = sql(command).split('\n').map(line => JSON.parse(line));
          assertSnapshot(before);assertSnapshot(after);assert.ok(before.rows.length);assert.equal(change.check(after), true);
        } finally {
          if (change.restore.startsWith('INSERT INTO auth.sessions')) sql(`INSERT INTO auth.sessions(id,user_id) VALUES('${staff}','${staff}') ON CONFLICT DO NOTHING`);
          else sql(change.restore);
        }
      }
    });
    await t.test('centenas de contatos e milhares de mensagens não multiplicam role/sessão', () => {
      sql('SELECT pg_stat_reset()');
      const total = Number(sql(`BEGIN READ ONLY;${identity(admin)}SELECT public.qa_access_count('${client}');COMMIT;`));
      const stats = JSON.parse(sql(`SELECT coalesce(jsonb_object_agg(p.proname,s.calls),'{}') FROM pg_stat_user_functions s JOIN pg_proc p ON p.oid=s.funcid JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname IN('planeje_live_session','crm_ia_role','crm_ia_client','crm_ia_contact','crm_ia_lead','crm_ia_channel')`));
      t.diagnostic(`551 contatos, >31.000 mensagens, ${total} pares visíveis; chamadas reais: ${JSON.stringify(stats)}`);
      assert.ok(total > 900);
      for (const name of ['planeje_live_session', 'crm_ia_role']) assert.ok(stats[name] > 0 && stats[name] <= 64, `${name}: esperado1..64, observado${stats[name]}`);
      assert.equal(stats.crm_ia_contact || 0, 0);assert.equal(stats.crm_ia_lead || 0, 0);
      assert.ok(stats.crm_ia_channel > 0 && stats.crm_ia_channel <= 8);
    });
  } finally {
    globalThis.fetch = previousFetch;
    if (started) run('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop']);
    rmSync(work, { recursive: true, force: true });
  }
});

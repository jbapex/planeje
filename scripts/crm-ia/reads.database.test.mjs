import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const work = mkdtempSync('/tmp/planeje-crm-ia-reads-');
const data = join(work, 'data');
const env = { PATH: process.env.PATH, LC_ALL: 'C' };
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const [actor, client, foreign, channel, hiddenChannel, secondChannel, pipeline, stage, agent] = [1, 11, 12, 21, 22, 23, 41, 51, 81].map(id);
const firstContact = id(1001);
const firstLead = id(2001);
const period = { since: '2026-11-10', until: '2026-11-10' };
function run(binary, args, input) {
  const result = spawnSync(binary, args, { env, input, encoding: 'utf8', timeout: 20000 });
  if (result.error || result.status !== 0) throw new Error(result.stderr?.trim() || result.error?.message || result.stdout);
  return result.stdout.trim();
}
const sql = input => run('psql', ['-X', '-Aqt', '-v', 'ON_ERROR_STOP=1', '-h', work, '-p', '55488', '-U', 'crm_reads_qa', '-d', 'postgres'], input);
const json = value => JSON.stringify(value).replaceAll("'", "''");
const read = (action, payload = {}, target = client) => JSON.parse(sql(`BEGIN; SET LOCAL test.uid='${actor}'; SET LOCAL ROLE authenticated;
  SELECT public.read_crm_fixture('${action}','${target}','${json(payload)}'::jsonb); COMMIT;`));

test('leituras CRM IA consultam população real em banco descartável isolado', async t => {
  let started = false;
  try {
    run('initdb', ['-D', data, '-U', 'crm_reads_qa', '--auth-local=trust', '--auth-host=reject', '--no-locale', '--encoding=UTF8']);
    run('pg_ctl', ['-D', data, '-l', join(work, 'pg.log'), '-o', `-k ${work} -p 55488 -c listen_addresses='' -c unix_socket_permissions=0700`, '-w', 'start']);
    started = true;
    assert.equal(sql('SHOW listen_addresses'), '');
    sql(`
      CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;
      CREATE SCHEMA auth; CREATE SCHEMA private;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
      CREATE TABLE public.leads(id uuid PRIMARY KEY,cliente_id uuid,nome text,whatsapp text,email text,origem text,data_entrada date,
        valor numeric,pipeline_id uuid,stage_id uuid,responsavel_id uuid,qualificado boolean,crm_ia_contact_id uuid,crm_ia_archived_at timestamptz,
        created_at timestamptz,updated_at timestamptz,hidden boolean DEFAULT false);
      CREATE TABLE public.crm_pipelines(id uuid PRIMARY KEY,cliente_id uuid,nome text);
      CREATE TABLE public.crm_stages(id uuid PRIMARY KEY,pipeline_id uuid,nome text,color text,ordem integer);
      CREATE TABLE public.cliente_whatsapp_config(id uuid PRIMARY KEY,cliente_id uuid,secret_token text);
      CREATE TABLE public.cliente_whatsapp_contact(id uuid PRIMARY KEY,cliente_id uuid,from_jid text,phone text,sender_name text,
        mini_crm jsonb DEFAULT '{}',whatsapp_config_id uuid,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now(),hidden boolean DEFAULT false);
      CREATE TABLE public.cliente_whatsapp_inbox(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cliente_id uuid,whatsapp_config_id uuid,
        from_jid text,chat_jid text,body text,msg_timestamp timestamptz,created_at timestamptz,is_group boolean DEFAULT false);
      CREATE TABLE public.cliente_whatsapp_sent(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cliente_id uuid,whatsapp_config_id uuid,
        to_jid text,chat_jid text,body text,created_at timestamptz);
      CREATE TABLE public.cliente_atend_conversas(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cliente_id uuid,contact_id uuid,status text,
        status_at timestamptz,assigned_to uuid,ia_pausada boolean,ia_followup_due_at timestamptz,updated_at timestamptz,UNIQUE(cliente_id,contact_id));
      CREATE TABLE public.crm_funnel_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),lead_id uuid,stage_anterior_id uuid,stage_nova_id uuid,
        realizado_em timestamptz,user_id uuid,motivo_ganho_perdido text,metadados jsonb DEFAULT '{}');
      CREATE TABLE public.crm_ia_appointments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cliente_id uuid,lead_id uuid,contact_id uuid,owner_id uuid,
        start_at timestamptz,end_at timestamptz,title text,status text,updated_at timestamptz DEFAULT now());
      CREATE TABLE public.cliente_atend_ia_agentes(id uuid PRIMARY KEY,cliente_id uuid,nome text,instrucoes text);
      CREATE TABLE public.cliente_atend_ia_log(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cliente_id uuid,agente_id uuid,contact_id uuid,
        user_id uuid,acao text,tokens integer,whatsapp_config_id uuid,created_at timestamptz);
      CREATE FUNCTION private.crm_ia_role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT CASE WHEN auth.uid()='${actor}'::uuid THEN 'admin' END $$;
      CREATE FUNCTION private.crm_ia_client(uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT private.crm_ia_role() IS NOT NULL AND $1='${client}'::uuid $$;
      CREATE FUNCTION private.crm_ia_lead(uuid,uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
        SELECT private.crm_ia_client($2) AND EXISTS(SELECT 1 FROM public.leads WHERE id=$1 AND cliente_id=$2 AND NOT hidden) $$;
      CREATE FUNCTION private.crm_ia_contact(uuid,uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
        SELECT private.crm_ia_client($1) AND EXISTS(SELECT 1 FROM public.cliente_whatsapp_contact WHERE id=$2 AND cliente_id=$1 AND NOT hidden) $$;
      CREATE FUNCTION private.crm_ia_channel(uuid,uuid,boolean DEFAULT false) RETURNS boolean LANGUAGE sql STABLE AS $$
        SELECT private.crm_ia_client($1) AND EXISTS(SELECT 1 FROM public.cliente_whatsapp_config WHERE id=$2 AND cliente_id=$1 AND id<>'${hiddenChannel}'::uuid) $$;
      CREATE FUNCTION private.crm_ia_phone(text) RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT regexp_replace(split_part(coalesce($1,''),'@',1),'[^0-9]','','g') $$;
      INSERT INTO public.crm_pipelines VALUES ('${pipeline}','${client}','Funil sintético');
      INSERT INTO public.crm_stages VALUES ('${stage}','${pipeline}','Primeiro contato','#6366f1',0);
      INSERT INTO public.cliente_whatsapp_config VALUES ('${channel}','${client}','segredo-nao-retornar'),('${hiddenChannel}','${client}','segredo-oculto'),('${secondChannel}','${client}','outro-segredo');
      INSERT INTO public.cliente_whatsapp_contact(id,cliente_id,from_jid,phone,sender_name,whatsapp_config_id)
        SELECT ('00000000-0000-4000-8000-'||lpad((1000+n)::text,12,'0'))::uuid,'${client}',
          '5511999'||lpad(n::text,6,'0')||'@s.whatsapp.net','5511999'||lpad(n::text,6,'0'),'Contato '||n,'${hiddenChannel}' FROM generate_series(1,251) n;
      INSERT INTO public.leads(id,cliente_id,nome,whatsapp,email,origem,data_entrada,valor,pipeline_id,stage_id,responsavel_id,qualificado,crm_ia_contact_id,created_at,updated_at)
        SELECT ('00000000-0000-4000-8000-'||lpad((2000+n)::text,12,'0'))::uuid,'${client}','Lead '||n,'5511999'||lpad(n::text,6,'0'),
          'lead'||n||'@example.test',CASE WHEN n%2=0 THEN 'site' ELSE 'manual' END,'2026-11-10',10,'${pipeline}','${stage}','${actor}',n<=7,
          CASE WHEN n=1 THEN NULL ELSE ('00000000-0000-4000-8000-'||lpad((1000+n)::text,12,'0'))::uuid END,'2026-11-10T12:00:00Z','2026-11-10T12:00:00Z' FROM generate_series(1,251) n;
      INSERT INTO public.cliente_whatsapp_inbox(cliente_id,whatsapp_config_id,from_jid,chat_jid,body,msg_timestamp,created_at)
        SELECT '${client}','${channel}',from_jid,from_jid,'Recebida '||sender_name,'2026-11-10T12:00:00Z','2026-11-10T12:00:00Z' FROM public.cliente_whatsapp_contact;
      INSERT INTO public.cliente_whatsapp_sent(cliente_id,whatsapp_config_id,to_jid,chat_jid,body,created_at)
        SELECT '${client}','${channel}',from_jid,from_jid,'Resposta visível','2026-11-10T13:00:00Z' FROM public.cliente_whatsapp_contact WHERE id='${firstContact}';
      INSERT INTO public.cliente_whatsapp_inbox(cliente_id,whatsapp_config_id,from_jid,chat_jid,body,msg_timestamp,created_at)
        SELECT '${client}',v.channel,from_jid,from_jid,v.body,v.at,v.at FROM public.cliente_whatsapp_contact,
          (VALUES ('${hiddenChannel}'::uuid,'CONTEUDO-OCULTO','2026-11-10T23:00:00Z'::timestamptz),
                  ('${secondChannel}'::uuid,'Segundo canal','2026-11-10T14:00:00Z'::timestamptz)) v(channel,body,at) WHERE id='${firstContact}';
      INSERT INTO public.cliente_atend_conversas(cliente_id,contact_id,status,status_at,assigned_to,ia_pausada,updated_at)
        SELECT '${client}',id,CASE WHEN id='${firstContact}' THEN 'esperando' ELSE 'entrada' END,'2026-11-10T12:00:00Z',
          '${actor}',id='${firstContact}','2026-11-10T12:00:00Z' FROM public.cliente_whatsapp_contact;
      INSERT INTO public.leads(id,cliente_id,nome,data_entrada,valor,created_at,updated_at,hidden)
        VALUES ('${id(2990)}','${foreign}','CLIENTE-OCULTO','2026-11-10',999999,'2026-11-10T12:00Z','2026-11-10T12:00Z',false),
          ('${id(2991)}','${client}','LEAD-OCULTO','2026-11-10',999999,'2026-11-10T12:00Z','2026-11-10T12:00Z',true);
      INSERT INTO public.crm_funnel_events(lead_id,stage_nova_id,realizado_em,user_id) VALUES ('${firstLead}','${stage}','2026-11-10T12:00Z','${actor}');
      INSERT INTO public.crm_ia_appointments(cliente_id,lead_id,contact_id,owner_id,start_at,end_at,title,status)
        VALUES ('${client}','${firstLead}','${firstContact}','${actor}','2026-11-10T15:00Z','2026-11-10T15:30Z','Reunião sintética','scheduled'),
          ('${client}','${firstLead}','${firstContact}','${actor}','2026-11-10T16:00Z','2026-11-10T16:30Z','Cancelada','cancelled'),
          ('${foreign}','${id(2990)}',NULL,'${actor}','2026-11-10T15:00Z','2026-11-10T15:30Z','COMPROMISSO-OCULTO','scheduled');
      INSERT INTO public.cliente_atend_ia_agentes VALUES ('${agent}','${client}','Agente sintético','INSTRUCOES-NAO-RETORNAR');
      INSERT INTO public.cliente_atend_ia_log(cliente_id,agente_id,contact_id,user_id,acao,tokens,whatsapp_config_id,created_at) VALUES
        ('${client}','${agent}','${firstContact}','${actor}','responder',10,'${channel}','2026-11-10T12:00Z'),
        ('${client}','${agent}','${firstContact}','${actor}','responder',999,'${hiddenChannel}','2026-11-10T12:00Z'),
        ('${client}','${agent}','${firstContact}','${actor}','responder',20,NULL,'2026-11-10T12:00Z');
    `);
    sql(readFileSync(new URL('../../supabase/migrations/20261111043800_crm_ia_workspace_readings.sql', import.meta.url), 'utf8'));
    sql(readFileSync(new URL('../../supabase/migrations/20261111162400_crm_ia_conversation_read_performance.sql', import.meta.url), 'utf8'));
    sql(`CREATE FUNCTION public.read_crm_fixture(text,uuid,jsonb) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$ SELECT private.crm_ia_read($1,$2,$3) $$;
      GRANT EXECUTE ON FUNCTION public.read_crm_fixture(text,uuid,jsonb) TO authenticated;`);

    await t.test('agrega todos os leads e conversas sem aplicar limite da página', () => {
      const panel = read('overview', { ...period, limit: 2 });
      assert.deepEqual(panel.totals, { leads: 251, qualified: 7, conversations: 252, ai_conversations: 250, human_conversations: 2, appointments: 1, waiting: 2 });
      assert.deepEqual(panel.daily, [{ day: '2026-11-10', count: 251 }]);
      assert.equal(panel.stages[0].count, 251);
      assert.equal(panel.stages[0].value, 2510);
      assert.equal(panel.origins.reduce((sum, row) => sum + row.count, 0), 251);
      assert.equal(panel.waiting.length, 2);
      assert.deepEqual(panel.coverage.since, period.since);
      const serialized = JSON.stringify(panel);
      assert.ok(!/OCULTO|segredo/i.test(serialized));
    });
    await t.test('pagina conversas por canal real, sem depender do canal atual no contato', () => {
      const page = read('conversations', { ...period, limit: 2 });
      assert.equal(page.rows.length, 2);
      assert.equal(page.total, 252);
      const specific = read('conversations', { ...period, contact_id: firstContact, channel_id: channel });
      assert.equal(specific.total, 1);
      assert.equal(specific.rows[0].last_message, 'Resposta visível');
      assert.equal(specific.rows[0].lead_id, firstLead);
      assert.equal(specific.rows[0].attendance, 'human');
      assert.equal(read('conversations', { ...period, attendance: 'waiting' }).total, 2);
      assert.equal(read('conversations', { ...period, search: '5511999000001', channel_id: secondChannel }).total, 1);
      assert.equal(read('conversations', { ...period, pipeline_id: id(999) }).total, 0);
      assert.equal(read('conversations', { ...period, stage_id: stage, origin: 'site', owner_id: actor }).total, 125);
      assert.equal(read('conversations', { ...period, offset: 252, limit: 2 }).rows.length, 0);
    });
    await t.test('mantém detalhe e associação por telefone inequívocos', () => {
      const detail = read('lead', { id: firstLead, channel_id: secondChannel });
      assert.equal(detail.lead.id, firstLead);
      assert.equal(detail.lead.contact_id, firstContact);
      assert.equal(detail.lead.archived_at, null);
      assert.equal(detail.contact.id, firstContact);
      assert.equal(detail.conversation.channel_id, secondChannel);
      assert.equal(detail.events.length, 1);
      assert.equal(detail.appointments.length, 2);
      sql(`INSERT INTO public.cliente_whatsapp_contact(id,cliente_id,from_jid,phone,sender_name,hidden)
        VALUES ('${id(1999)}','${client}','outra-identidade@lid','5511999000001','Contato ambíguo',true)`);
      assert.equal(read('lead', { id: firstLead }).contact, null);
      assert.equal(read('conversations', { ...period, contact_id: firstContact, channel_id: channel }).rows[0].lead_id, null);
      sql(`DELETE FROM public.cliente_whatsapp_contact WHERE id='${id(1999)}'`);
    });
    await t.test('usa limites inclusivos da data em America/Sao_Paulo', () => {
      sql(`INSERT INTO public.cliente_whatsapp_sent(cliente_id,whatsapp_config_id,to_jid,body,created_at)
        SELECT '${client}','${secondChannel}',from_jid,'Início do dia BRT','2026-11-10T03:00:00Z' FROM public.cliente_whatsapp_contact WHERE id='${id(1002)}';
        INSERT INTO public.cliente_whatsapp_sent(cliente_id,whatsapp_config_id,to_jid,body,created_at)
        SELECT '${client}','${secondChannel}',from_jid,'Fora do dia BRT','2026-11-11T03:00:00Z' FROM public.cliente_whatsapp_contact WHERE id='${id(1003)}'`);
      const rows = read('conversations', { ...period, channel_id: secondChannel });
      assert.equal(rows.total, 2);
      assert.ok(rows.rows.some(row => row.contact_id === id(1002)));
      assert.ok(!rows.rows.some(row => row.contact_id === id(1003)));
    });
    await t.test('uso mede canais conhecidos e declara lacuna nos registros antigos', () => {
      const usage = read('usage', period);
      assert.equal(usage.responses, 1);
      assert.equal(usage.tokens, 10);
      assert.equal(usage.by_agent[0].nome, 'Agente sintético');
      assert.equal(usage.coverage.complete, false);
      assert.equal(usage.coverage.reason, 'channel_not_recorded');
      assert.equal(usage.limits, null);
      assert.ok(!JSON.stringify(usage).includes('INSTRUCOES-NAO-RETORNAR'));
      assert.equal(read('usage', { ...period, pipeline_id: id(999) }).responses, 0);
      assert.equal(read('usage', { ...period, pipeline_id: pipeline, attendance: 'waiting' }).responses, 1);
      sql('UPDATE public.cliente_atend_ia_log SET whatsapp_config_id=NULL');
      assert.equal(read('usage', { ...period, channel_id: channel }).responses, null);
    });
    await t.test('revalida gates, recusa entrada maliciosa e fecha execução direta', () => {
      assert.throws(() => read('overview', period, foreign), /acesso|conta/i);
      assert.throws(() => read('conversations', { ...period, channel_id: hiddenChannel }), /acesso|canal/i);
      assert.throws(() => read('lead', { id: id(2991) }), /acesso|lead/i);
      assert.equal(read('conversations', { ...period, search: "'; DROP TABLE public.leads; --", sort: 'name; DELETE FROM public.leads' }).total, 0);
      assert.throws(() => read('overview', { since: '2026-11-11', until: '2026-11-10' }), /período/i);
      assert.throws(() => read('conversations', { ...period, limit: '1; DROP TABLE leads' }), /integer|inválid/i);
      assert.throws(() => read('overview', []), /inválid/i);
      assert.equal(sql("SELECT has_function_privilege('authenticated','private.crm_ia_read(text,uuid,jsonb)','execute')"), 'f');
      assert.equal(sql("SELECT has_function_privilege('anon','private.crm_ia_read(text,uuid,jsonb)','execute')"), 'f');
      assert.equal(sql('SELECT count(*) FROM public.leads'), '253');
    });
    await t.test('ausência de canal autorizado não vira zero medido de atendimento', () => {
      sql(`CREATE OR REPLACE FUNCTION private.crm_ia_channel(uuid,uuid,boolean DEFAULT false) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$`);
      const panel = read('overview', period);
      assert.equal(panel.totals.leads, 251);
      assert.equal(panel.totals.conversations, null);
      assert.equal(panel.totals.ai_conversations, null);
      assert.equal(panel.totals.human_conversations, null);
      assert.equal(panel.totals.waiting, null);
      assert.equal(panel.coverage.conversations, 'unavailable');
    });
  } finally {
    if (started) run('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop']);
    rmSync(work, { recursive: true, force: true });
  }
});

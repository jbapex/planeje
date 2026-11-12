import assert from 'node:assert/strict';
import { execFile, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

const work = mkdtempSync('/tmp/planeje-crm-ia-db-');
const data = join(work, 'data');
const env = { PATH: process.env.PATH, LC_ALL: 'C' };
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const [admin, staff, other, client, foreign, channel, hiddenChannel, contact] = [1, 2, 3, 11, 12, 21, 22, 31].map(id);
function run(binary, args, input) {
  const r = spawnSync(binary, args, { env, input, encoding: 'utf8', timeout: 20000 });
  if (r.error || r.status !== 0) throw new Error(r.stderr?.trim() || r.error?.message || r.stdout);
  return r.stdout.trim();
}
const sql = input => run('psql', ['-X', '-Aqt', '-v', 'ON_ERROR_STOP=1', '-h', work, '-p', '55487', '-U', 'crm_qa', '-d', 'postgres'], input);
const asUser = (uid, statement) => sql(`BEGIN; SET LOCAL ROLE authenticated; SET LOCAL test.uid='${uid}'; ${statement}; COMMIT;`);
const call = (action, payload = {}, uid = admin, target = client) => JSON.parse(asUser(uid,
  `SELECT public.crm_ia_workspace('${action}',${target ? `'${target}'` : 'NULL'},'${JSON.stringify(payload).replaceAll("'", "''")}'::jsonb)`));

test('CRM IA mantém escopo, versões e registros comerciais no banco', async () => {
  let started = false;
  try {
    run('initdb', ['-D', data, '-U', 'crm_qa', '--auth-local=trust', '--auth-host=reject', '--no-locale', '--encoding=UTF8']);
    run('pg_ctl', ['-D', data, '-l', join(work, 'pg.log'), '-o', `-k ${work} -p 55487 -c listen_addresses='' -c unix_socket_permissions=0700`, '-w', 'start']);
    started = true;
    assert.equal(sql('SHOW listen_addresses'), '');
    sql(`
      CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
      CREATE SCHEMA auth; CREATE SCHEMA private;
      GRANT USAGE ON SCHEMA auth,private TO authenticated,service_role;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
      CREATE TABLE public.profiles(id uuid PRIMARY KEY,role text,status text,full_name text,cliente_id uuid,whatsapp text);
      CREATE TABLE public.clientes(id uuid PRIMARY KEY,empresa text,etapa text,responsavel text);
      CREATE TABLE public.module_settings(module_name text PRIMARY KEY,is_enabled boolean);
      CREATE TABLE public.user_module_permissions(user_id uuid,module_name text,is_enabled boolean);
      CREATE TABLE public.user_module_access(user_id uuid,module_name text,access_level text);
      CREATE TABLE public.client_module_permissions(cliente_id uuid,module_name text,is_enabled boolean,PRIMARY KEY(cliente_id,module_name));
      CREATE FUNCTION public.planeje_current_account_access() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND status='active') $$;
      CREATE FUNCTION private.planeje_staff_role() RETURNS text LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT role FROM public.profiles WHERE id=auth.uid() AND status='active' $$;
      CREATE FUNCTION public.cliente_atend_loja_habilitada(uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
      CREATE FUNCTION public.atendimento_user_can_access_atendimento_scope(uuid,uuid,uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT $3 <> '${hiddenChannel}'::uuid $$;
      CREATE FUNCTION public.atendimento_user_can_send_on_whatsapp_config(uuid,uuid,uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT $3 <> '${hiddenChannel}'::uuid $$;
      CREATE FUNCTION public.cliente_atend_pode_ver_contato_de(uuid,uuid,uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
      CREATE TABLE public.crm_pipelines(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cliente_id uuid,nome text,descricao text,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
      CREATE TABLE public.crm_stages(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),pipeline_id uuid,nome text,ordem integer DEFAULT 0,tipo text DEFAULT 'intermediaria',color text,tempo_max_horas integer,acoes_obrigatorias jsonb DEFAULT '[]',etapas_permitidas jsonb DEFAULT '[]',created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
      CREATE TABLE public.crm_produtos(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cliente_id uuid,name text,code text,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
      CREATE TABLE public.crm_servicos(LIKE public.crm_produtos INCLUDING ALL);
      CREATE TABLE public.leads(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cliente_id uuid,nome text,whatsapp text,email text,origem text,sub_origem text,data_entrada date DEFAULT current_date,agendamento timestamptz,status text NOT NULL DEFAULT 'novo',vendedor text,valor numeric DEFAULT 0,observacoes text,product_id uuid,custom_date_field date,profile_pic_url text,pipeline_id uuid,stage_id uuid,ultima_interacao timestamptz,proxima_acao timestamptz,status_vida text,stage_entered_at timestamptz,responsavel_id uuid,etiquetas text[] DEFAULT '{}',comercial_qualificado boolean DEFAULT false,comercial_comprou boolean DEFAULT false,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
      CREATE TABLE public.crm_funnel_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),lead_id uuid,stage_anterior_id uuid,stage_nova_id uuid,realizado_em timestamptz DEFAULT now(),user_id uuid,motivo_ganho_perdido text,metadados jsonb DEFAULT '{}');
      CREATE TABLE public.crm_lead_interacoes(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),lead_id uuid,cliente_id uuid,tipo text,descricao text,realizada_em timestamptz DEFAULT now(),user_id uuid,created_at timestamptz DEFAULT now());
      CREATE TABLE public.cliente_crm_settings(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cliente_id uuid UNIQUE,statuses jsonb DEFAULT '[]',origins text[],sellers text[],custom_fields_settings jsonb DEFAULT '{}');
      CREATE TABLE public.cliente_whatsapp_config(id uuid PRIMARY KEY,cliente_id uuid,name text,instance_status text,provider text DEFAULT 'uazapi',subdomain text DEFAULT 'fixture',token text DEFAULT 'fixture-secret',archived_at timestamptz,apicebot_token text);
      CREATE TABLE public.cliente_whatsapp_contact(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cliente_id uuid,from_jid text,phone text,sender_name text,whatsapp_config_id uuid,mini_crm jsonb DEFAULT '{}',created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
      CREATE TABLE public.cliente_whatsapp_inbox(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cliente_id uuid,whatsapp_config_id uuid,from_jid text,chat_jid text,phone text,body text,type text,msg_timestamp timestamptz,created_at timestamptz DEFAULT now(),is_group boolean DEFAULT false,message_id text,raw_payload jsonb,media_purged_at timestamptz);
      CREATE TABLE public.cliente_whatsapp_sent(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cliente_id uuid,whatsapp_config_id uuid,to_jid text,chat_jid text,body text,created_at timestamptz DEFAULT now(),message_id text,uazapi_internal_id text,sender_kind text);
      CREATE TABLE public.cliente_atend_conversas(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cliente_id uuid,contact_id uuid,status text DEFAULT 'entrada',status_at timestamptz DEFAULT now(),ia_pausada boolean DEFAULT true,ia_respondeu_em timestamptz,ia_followup_due_at timestamptz,assigned_to uuid,setor_id uuid,privado boolean DEFAULT false,etiqueta_ids uuid[] DEFAULT '{}',finalizado_at timestamptz,finalizado_by uuid,updated_by uuid,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now(),UNIQUE(cliente_id,contact_id));
      CREATE TABLE public.cliente_atend_ia_bases(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cliente_id uuid,nome text,conteudo text,created_by uuid,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
      CREATE TABLE public.cliente_atend_ia_agentes(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cliente_id uuid,nome text,objetivo text,instrucoes text,tom text,modelo text,base_ids uuid[] DEFAULT '{}',setor_ids uuid[] DEFAULT '{}',ativo boolean DEFAULT true,auto_responder boolean DEFAULT false,funil jsonb DEFAULT '{}',created_by uuid,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
      CREATE TABLE public.cliente_atend_ia_log(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cliente_id uuid,agente_id uuid,contact_id uuid,user_id uuid,acao text,modelo text,tokens integer,created_at timestamptz DEFAULT now());
      CREATE TABLE public.cliente_atend_respostas(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cliente_id uuid,titulo text,atalho text,texto text,updated_at timestamptz DEFAULT now());
      CREATE TABLE public.crm_ia_outbox(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cliente_id uuid,whatsapp_config_id uuid,contact_id uuid,lead_id uuid,kind text,body text,scheduled_at timestamptz,status text DEFAULT 'pending',request_id uuid,created_by uuid,attempts integer DEFAULT 0,claimed_at timestamptz,claim_token uuid,sent_at timestamptz,provider_message_id text,error_code text,source_updated_at timestamptz,config_revision uuid,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now(),UNIQUE(cliente_id,created_by,request_id));
      INSERT INTO public.profiles(id,role,status,full_name,cliente_id) VALUES ('${admin}','admin','active','Gestão fictícia',NULL),('${staff}','colaborador','active','Equipe fictícia',NULL),('${other}','cliente','active','Cliente fictício','${client}');
      INSERT INTO public.clientes VALUES ('${client}','Empresa fictícia','closed','${staff}'),('${foreign}','Outra empresa','closed','${admin}');
      INSERT INTO public.user_module_access VALUES ('${staff}','crm','responsible');
      INSERT INTO public.cliente_whatsapp_config(id,cliente_id,name,instance_status,apicebot_token) VALUES ('${channel}','${client}','Canal fictício','connected','segredo-fixture'),('${hiddenChannel}','${client}','Canal restrito','connected','nao-retornar');
      INSERT INTO public.cliente_whatsapp_contact(id,cliente_id,from_jid,phone,sender_name,whatsapp_config_id) VALUES ('${contact}','${client}','551199999999@s.whatsapp.net','551199999999','Contato fictício','${channel}');
      INSERT INTO public.cliente_whatsapp_inbox(cliente_id,whatsapp_config_id,from_jid,chat_jid,phone,body) VALUES ('${client}','${channel}','551199999999@s.whatsapp.net','551199999999@s.whatsapp.net','551199999999','mensagem visível'),('${client}','${hiddenChannel}','551199999999@s.whatsapp.net','551199999999@s.whatsapp.net','551199999999','mensagem restrita');
    `);
    sql(readFileSync(new URL('../../supabase/migrations/20261111041704_crm_ia_workspace.sql', import.meta.url), 'utf8'));
    sql(readFileSync(new URL('../../supabase/migrations/20261111043800_crm_ia_workspace_readings.sql', import.meta.url), 'utf8'));
    sql(readFileSync(new URL('../../supabase/migrations/20261111162400_crm_ia_conversation_read_performance.sql', import.meta.url), 'utf8'));
    const bootstrap = call('bootstrap', {}, admin, null);
    assert.equal(bootstrap.clients.length, 2);
    assert.equal(call('bootstrap', {}, staff, null).clients.length, 1);
    assert.throws(() => call('bootstrap', {}, other, null), /acesso/i);
    assert.throws(() => call('workspace', {}, staff, foreign), /acesso/i);
    const workspace = call('workspace');
    assert.equal(workspace.client.id, client);
    assert.equal(workspace.channels.length, 1);
    assert.ok(!JSON.stringify(workspace).includes('segredo-fixture'));
    const pipeline = call('save_pipeline', { nome: 'Comercial' });
    const stage = call('save_stage', { pipeline_id: pipeline.id, nome: 'Novo contato', color: '#6366f1', ordem: 0 });
    const won = call('save_stage', { pipeline_id: pipeline.id, nome: 'Venda fechada', color: '#22c55e', tipo: 'ganho', ordem: 1 });
    const lead = call('save_lead', { nome: 'Lead sintético', whatsapp: '551199999999', pipeline_id: pipeline.id, stage_id: stage.id });
    assert.equal(lead.cliente_id, client);
    assert.equal(call('leads', { search: 'sintético', limit: 10 }).total, 1);
    assert.equal(call('leads', { search: '', since: '', until: '', sort: '', qualified: '' }).total, 1);
    assert.equal(call('leads', { since: '2020-01-01', until: '2020-01-02' }).total, 0);
    const staffLead = call('save_lead', { nome: 'Oportunidade da equipe', whatsapp: '551199990000', pipeline_id: pipeline.id, stage_id: stage.id }, staff);
    assert.equal(staffLead.responsavel_id, staff);
    assert.throws(() => call('save_lead', { id: staffLead.id, expected_updated_at: staffLead.updated_at, responsavel_id: admin }, staff), /gestão|transferir/i);
    const opened = call('open_conversation', { id: staffLead.id, channel_id: channel, chat_jid: '551199990000@s.whatsapp.net' }, staff);
    assert.equal(opened.channel_id, channel);
    assert.equal(call('open_conversation', { id: staffLead.id, channel_id: channel, chat_jid: '551199990000@s.whatsapp.net' }, staff).contact_id, opened.contact_id);
    assert.equal(sql(`SELECT count(*) FROM public.cliente_whatsapp_contact WHERE id='${opened.contact_id}'`), '1');
    assert.equal(sql(`SELECT ia_pausada FROM public.cliente_atend_conversas WHERE contact_id='${opened.contact_id}'`), 't');
    assert.equal(call('queue').total, 0);
    assert.throws(() => call('open_conversation', { id: staffLead.id, channel_id: hiddenChannel, chat_jid: '551199990000@s.whatsapp.net' }, staff), /indisponível|acesso/i);
    call('archive_lead', { id: staffLead.id, expected_updated_at: call('lead', { id: staffLead.id }, staff).lead.updated_at }, staff);
    assert.throws(() => call('save_lead', { id: lead.id, nome: 'Conflito', expected_updated_at: '2020-01-01T00:00:00Z' }), /versão|alterad/i);
    assert.throws(() => call('move_lead', { id: lead.id, stage_id: won.id, expected_updated_at: lead.updated_at }), /motivo/i);
    const moved = call('move_lead', { id: lead.id, stage_id: won.id, reason: 'Contrato confirmado', expected_updated_at: lead.updated_at });
    assert.equal(moved.stage_id, won.id);
    assert.equal(sql(`SELECT count(*) FROM public.crm_funnel_events WHERE lead_id='${lead.id}'`), '1');
    assert.throws(() => call('move_lead', { id: lead.id, stage_id: won.id, reason: 'inválido', expected_updated_at: moved.updated_at }, admin, foreign), /indispon|acesso/i);
    const messages = call('messages', { contact_id: contact, channel_id: channel });
    assert.equal(messages.total, 1);
    assert.equal(messages.rows[0].body, 'mensagem visível');
    assert.throws(() => call('messages', { contact_id: contact, channel_id: hiddenChannel }), /canal|acesso/i);
    const config = call('save_config', { section: 'attendance', data: { auto_send: false }, revision: workspace.config.revision });
    assert.notEqual(config.revision, workspace.config.revision);
    assert.throws(() => call('save_config', { section: 'attendance', data: { auto_send: true }, revision: workspace.config.revision }), /versão|alterad/i);
    assert.throws(() => call('save_config', { section: 'attendance', data: {}, revision: config.revision }, staff), /gest|acesso/i);
    const queued = call('schedule_message', { contact_id: contact, channel_id: channel, body: 'Mensagem sintética', request_id: id(101), scheduled_at: new Date(Date.now() + 3600000).toISOString() });
    const again = call('schedule_message', { contact_id: contact, channel_id: channel, body: 'Mensagem sintética', request_id: id(101), scheduled_at: queued.scheduled_at });
    assert.equal(again.id, queued.id);
    assert.equal(call('queue').total, 1);
    call('cancel_message', { id: queued.id });
    assert.equal(call('queue').rows[0].status, 'cancelled');
    assert.throws(() => call('save_lead', { id: moved.id, nome: moved.nome, stage_id: stage.id, expected_updated_at: moved.updated_at, pipeline_id: id(999) }), /funil|etapa/i);
    const base = call('save_base', { nome: 'Base sintética', conteudo: 'Dados públicos da empresa fictícia.' });
    const agent = call('save_agent', { nome: 'Qualificação sintética', modelo: 'openai/gpt-4o-mini', base_ids: [base.id],
      funil: { crm_ia: { tipo: 'qualificacao', pipeline_id: pipeline.id, stage_ids: [stage.id], variaveis: [{ nome: 'Objetivo', pergunta: 'Qual é o objetivo?' }] } } });
    assert.equal(agent.auto_responder, false);
    assert.equal(agent.funil.crm_ia.tipo, 'qualificacao');
    assert.throws(() => call('save_agent', { nome: 'Inválido', base_ids: [id(999)], funil: agent.funil }), /base/i);
    const product = call('save_product', { name: 'Produto fictício', crm_ia_details: { description: 'Descrição', price: 50, active: true } });
    assert.equal(product.name, 'Produto fictício');
    assert.equal(call('workspace').products[0].crm_ia_details.price, 50);
    const overview = call('overview');
    assert.equal(overview.totals.leads, 1);
    assert.equal(overview.stages.find(x => x.id === won.id).count, 1);
    assert.ok(Array.isArray(call('conversations').rows));
    const human = call('save_conversation', { contact_id: contact, channel_id: channel, attendance: 'human' });
    assert.equal(human.ia_pausada, true);
    assert.throws(() => call('save_config', { section: 'attendance', data: { auto_send: true }, revision: config.revision }), /versão|alterad/i);
    const availability = call('save_config', { section: 'availability', revision: call('workspace').config.revision,
      data: { timezone: 'America/Sao_Paulo', duration_minutes: 30, interval_minutes: 30, min_notice_hours: 0,
        horizon_days: 60, max_per_day: 8, windows: [{ owner_id: admin, days: [0,1,2,3,4,5,6], start: '09:00', end: '18:00' }] } });
    const date = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
    const slots = call('slots', { date, owner_id: admin });
    assert.equal(slots.rows.length, 18);
    const appointment = call('save_appointment', { lead_id: lead.id, owner_id: admin, start_at: slots.rows[0].start_at,
      end_at: slots.rows[0].end_at, title: 'Reunião fictícia', request_id: id(102) });
    assert.equal(appointment.status, 'scheduled');
    assert.equal(call('slots', { date, owner_id: admin }).rows.length, 17);
    assert.throws(() => call('save_appointment', { lead_id: lead.id, owner_id: admin, start_at: slots.rows[0].start_at,
      end_at: slots.rows[0].end_at, title: 'Choque', request_id: id(103) }), /horário|disponível/i);
    call('cancel_appointment', { id: appointment.id, expected_updated_at: appointment.updated_at });
    assert.equal(call('slots', { date, owner_id: admin }).rows.length, 18);
    const concurrentSlot = call('slots', { date, owner_id: admin }).rows[1];
    const race = await Promise.allSettled([104, 105].map(n => promisify(execFile)('psql', ['-X', '-Aqt', '-v', 'ON_ERROR_STOP=1',
      '-h', work, '-p', '55487', '-U', 'crm_qa', '-d', 'postgres', '-c',
      `BEGIN; SET LOCAL ROLE authenticated; SET LOCAL test.uid='${admin}'; SELECT public.crm_ia_workspace('save_appointment','${client}','${JSON.stringify({
        lead_id: lead.id, owner_id: admin, ...concurrentSlot, title: 'Concorrente fictício', request_id: id(n),
      })}'::jsonb); COMMIT;`], { env, encoding: 'utf8', timeout: 10000 })));
    assert.equal(race.filter(x => x.status === 'fulfilled').length, 1);
    assert.equal(race.filter(x => x.status === 'rejected').length, 1);
    sql(`UPDATE public.cliente_atend_conversas SET assigned_to='${staff}' WHERE contact_id='${contact}'`);
    const privateSlot = call('slots', { date, owner_id: admin }).rows[2];
    const privateAppointment = call('save_appointment', { contact_id: contact, owner_id: admin, ...privateSlot, title: 'Compromisso que ficará privado', request_id: id(106) });
    sql(`UPDATE public.cliente_atend_conversas SET privado=true,assigned_to='${admin}' WHERE contact_id='${contact}'`);
    assert.equal(call('agenda', { since: date, until: date }, staff).rows.some(row => row.id === privateAppointment.id), false);
    assert.throws(() => call('save_appointment', { id: privateAppointment.id, expected_updated_at: privateAppointment.updated_at,
      owner_id: admin, ...privateSlot, title: 'Tentativa após revogação', request_id: id(107) }, staff), /indisponível|acesso/i);
    assert.throws(() => call('cancel_appointment', { id: privateAppointment.id, expected_updated_at: privateAppointment.updated_at }, staff), /indisponível|acesso/i);
    assert.throws(() => call('slots', { date, owner_id: admin, appointment_id: privateAppointment.id }, staff), /indisponível|acesso/i);
    assert.equal(sql(`SELECT status FROM public.crm_ia_appointments WHERE id='${privateAppointment.id}'`), 'scheduled');
    sql(`UPDATE public.cliente_atend_conversas SET privado=false WHERE contact_id='${contact}'`);
    const detail = call('lead', { id: lead.id });
    assert.equal(detail.contact.id, contact);
    assert.equal(detail.events.length, 1);
    const template = call('save_template', { nome: 'Modelo sintético', tipo: 'base', data: { nome: 'Base copiada', conteudo: 'Somente conteúdo autorizado', base_ids: [base.id], phone: 'nao-copiar' } });
    assert.ok(!('phone' in template.data));
    assert.equal(call('apply_template', { id: template.id, revision: template.revision }).ok, true);
    assert.equal(call('workspace').bases.length, 2);
    assert.equal(availability.data.attendance.auto_send, false);
    assert.equal(sql("SELECT has_function_privilege('anon','public.crm_ia_workspace(text,uuid,jsonb)','execute')"), 'f');
    sql(`UPDATE public.profiles SET status='pending' WHERE id='${admin}'`);
    assert.throws(() => call('workspace'), /acesso/i);
  } finally {
    if (started) run('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop']);
    rmSync(work, { recursive: true, force: true });
  }
});

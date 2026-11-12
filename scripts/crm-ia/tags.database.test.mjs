import assert from 'node:assert/strict';
import test from 'node:test';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';

const work=mkdtempSync('/tmp/crm-tags-db-'),data=join(work,'data'),env={PATH:process.env.PATH,LC_ALL:'C'};
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const context=Object.fromEntries(['admin','staff','other','client','foreign','channel','hiddenChannel','contact'].map((key,i)=>[key,id([1,2,3,11,12,21,22,31][i])]));
const {admin,staff,other,client,foreign,channel,hiddenChannel,contact}=context,pipeline=id(41),stage=id(51);
const quote=value=>`'${JSON.stringify(value).replaceAll("'","''")}'::jsonb`;
function run(name,args,input){const r=spawnSync(name,args,{input,env,encoding:'utf8',timeout:20000});if(r.error||r.status)throw new Error(r.stderr||r.error?.message);return r.stdout.trim();}
const sql=input=>run('psql',['-X','-Aqt','-v','ON_ERROR_STOP=1','-h',work,'-p','55500','-U','tags_qa','-d','postgres'],input);
const call=(action,payload={},uid=admin,target=client)=>JSON.parse(sql(`BEGIN;SET LOCAL ROLE authenticated;SET LOCAL test.uid='${uid}';SELECT public.crm_ia_workspace('${action}','${target}',${quote(payload)});COMMIT;`));
const intake=(channelId=channel,contactId=contact,target=client)=>JSON.parse(sql(`SET ROLE service_role;SELECT public.crm_ia_agent_intake('${target}','${channelId}','${contactId}','Olá')`));
const count=()=>sql('SELECT count(*) FROM leads');

test('etiquetas text[] persistem em captura, formulário e importação com ACL, CAS e transação',()=>{
 let started=false;
 try{
  run('initdb',['-D',data,'-U','tags_qa','--auth-local=trust','--auth-host=reject','--no-locale','--encoding=UTF8']);
  run('pg_ctl',['-D',data,'-l',join(work,'pg.log'),'-o',`-k ${work} -p 55500 -c listen_addresses='' -c unix_socket_permissions=0700`,'-w','start']);started=true;
  assert.equal(sql('SHOW listen_addresses'),'');
  const fixture=readFileSync(new URL('./workspace.database.test.mjs',import.meta.url),'utf8').split('    sql(`')[1].split('    `);')[0].replace(/\$\{(\w+)\}/g,(_,name)=>context[name]);
  sql(fixture.replace(/      CREATE TABLE public\.crm_ia_outbox\([^\n]+\n/,''));
  sql(`CREATE SCHEMA planeje_private;CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid);
   CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT jsonb_build_object('sub',auth.uid())$$;
   ALTER TABLE cliente_whatsapp_contact ADD COLUMN last_message_at timestamptz,ADD COLUMN origin_source text DEFAULT 'nao_identificado',ADD COLUMN qualificado boolean;
   ALTER TABLE leads ADD COLUMN qualificado boolean;ALTER TABLE cliente_atend_conversas ADD COLUMN ia_followup_passo integer DEFAULT 0;
   CREATE TABLE atendimento_conversas(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cliente_id uuid,whatsapp_config_id uuid,chat_jid text,archived_at timestamptz,bloqueada boolean DEFAULT false,is_group boolean DEFAULT false,display_name text,status text DEFAULT 'aguardando',fila_id uuid,assigned_to uuid,last_message_at timestamptz,last_customer_message_at timestamptz,awaiting_response_since timestamptz,unread_count integer DEFAULT 0,last_message_preview text,profile_pic_url text,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now(),UNIQUE(cliente_id,whatsapp_config_id,chat_jid));
   CREATE TABLE atendimento_conversa_planejamento(id uuid PRIMARY KEY,cliente_id uuid,conversation_id uuid,whatsapp_config_id uuid,chat_jid text,kind text,body text,status text,scheduled_at timestamptz,completed_at timestamptz,error_message text,updated_at timestamptz DEFAULT now());
   GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;`);
  let intakeOid;
  sql(readFileSync(new URL('../../supabase/migrations/20260928230000_cliente_atend_inbox.sql', import.meta.url), 'utf8').match(/create or replace function public\.cliente_atend_touch_updated_at\([\s\S]*?\$\$;/i)[0]);
    sql('CREATE TRIGGER cliente_atend_conversas_touch BEFORE UPDATE ON public.cliente_atend_conversas FOR EACH ROW EXECUTE FUNCTION public.cliente_atend_touch_updated_at()');
    for (const file of ['20261111041703_crm_ia_delivery_runtime.sql','20261111041704_crm_ia_workspace.sql','20261111043800_crm_ia_workspace_readings.sql','20261111044652_crm_ia_agent_runtime.sql','20261111062101_crm_ia_calendar.sql','20261111062548_crm_ia_voice.sql','20261111072502_crm_ia_calendar_delivery.sql','20261111075558_crm_ia_agent_template_contract.sql','20261111090001_crm_ia_appointment_actions.sql','20261111090002_crm_ia_agent_drafts_voice_modes.sql','20261111090003_crm_ia_lead_tags.sql','20261111101501_crm_ia_lead_profiles.sql','20261111101502_crm_ia_lead_reads.sql','20261111120001_crm_ia_internal_notifications.sql','20261111120002_crm_ia_conversation_controls.sql','20261111162400_crm_ia_conversation_read_performance.sql']){
   if(file.includes('090003'))intakeOid=sql("SELECT 'public.crm_ia_agent_intake(uuid,uuid,uuid,text)'::regprocedure::oid");
   sql(readFileSync(new URL(`../../supabase/migrations/${file}`,import.meta.url),'utf8'));
  }
  assert.equal(sql("SELECT 'public.crm_ia_agent_intake(uuid,uuid,uuid,text)'::regprocedure::oid"),intakeOid);
  sql(`INSERT INTO crm_pipelines(id,cliente_id,nome) VALUES('${pipeline}','${client}','Fixture');INSERT INTO crm_stages(id,pipeline_id,nome) VALUES('${stage}','${pipeline}','Entrada');
   INSERT INTO crm_ia_config(cliente_id,data,updated_by) VALUES('${client}',${quote({attendance:{auto_send:false},entry:{enabled:true,channels:[{channel_id:channel,enabled:true,mode:'all',pipeline_id:pipeline,stage_id:stage,tags:[' VIP ','Novo','VIP']}]}})},'${admin}');`);
  assert.equal(sql("SELECT data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='leads' AND column_name='etiquetas'"),'ARRAY');
  assert.equal(intake().skipped,'disabled_or_owner');assert.equal(count(),'0');
  sql(`UPDATE crm_ia_config SET data=jsonb_set(jsonb_set(data,'{attendance,auto_send}','true'),'{entry,enabled}','false') WHERE cliente_id='${client}'`);
  assert.equal(intake().skipped,'entry_disabled');assert.equal(count(),'0');
  sql(`UPDATE crm_ia_config SET data=jsonb_set(data,'{entry,enabled}','true') WHERE cliente_id='${client}'`);
  const captured=intake().lead;assert.deepEqual(captured.etiquetas,['VIP','Novo']);
  sql(`UPDATE crm_ia_config SET data=jsonb_set(data,'{entry,channels,0,tags}','["Não sobrescrever"]') WHERE cliente_id='${client}'`);
  assert.deepEqual(intake().lead.etiquetas,['VIP','Novo']);assert.equal(count(),'1');
  assert.throws(()=>intake(channel,contact,foreign),/scope|acesso/i);
  sql(`INSERT INTO cliente_whatsapp_contact(id,cliente_id,from_jid,phone,sender_name,whatsapp_config_id) VALUES('${id(32)}','${client}','551199999998@s.whatsapp.net','551199999998','Canal sem opt-in','${hiddenChannel}')`);
  assert.equal(intake(hiddenChannel,id(32)).lead,undefined);assert.equal(count(),'1');
  sql(`INSERT INTO cliente_whatsapp_contact(id,cliente_id,from_jid,phone,sender_name,whatsapp_config_id) VALUES('${id(33)}','${client}','551199999997@s.whatsapp.net','551199999997','Entrada inválida','${channel}');
   UPDATE crm_ia_config SET data=jsonb_set(data,'{entry,channels,0,tags}','[{"invalido":true}]') WHERE cliente_id='${client}'`);
  assert.throws(()=>intake(channel,id(33)),/etiqueta/i);assert.equal(count(),'1');
  sql(`UPDATE crm_ia_config SET data=jsonb_set(data,'{entry,channels,0,tags}','["Novo"]') WHERE cliente_id='${client}'`);
  let lead=call('save_lead',{nome:'Manual',whatsapp:'551199990001',pipeline_id:pipeline,stage_id:stage,responsavel_id:admin,etiquetas:[' A ','B','A']});
  assert.deepEqual(lead.etiquetas,['A','B']);assert.equal(sql(`SELECT pg_typeof(etiquetas)::text FROM leads WHERE id='${lead.id}'`),'text[]');
  assert.equal(sql(`SELECT updated_at='${lead.updated_at}'::timestamptz FROM leads WHERE id='${lead.id}'`),'t');
  const oldVersion=lead.updated_at;
  lead=call('save_lead',{id:lead.id,expected_updated_at:lead.updated_at,nome:'Nome revisado'});assert.deepEqual(lead.etiquetas,['A','B']);
  assert.throws(()=>call('save_lead',{id:lead.id,expected_updated_at:oldVersion,etiquetas:['stale']}),/versão|alterad/i);
  assert.throws(()=>call('save_lead',{id:lead.id,expected_updated_at:lead.updated_at,etiquetas:['forbidden']},staff),/acesso|indisponível/i);
  assert.throws(()=>call('save_lead',{id:lead.id,expected_updated_at:lead.updated_at,etiquetas:['foreign']},admin,foreign),/acesso|indisponível/i);
  assert.throws(()=>call('save_lead',{id:lead.id,expected_updated_at:lead.updated_at,etiquetas:[]},other),/acesso/i);
  lead=call('save_lead',{id:lead.id,expected_updated_at:lead.updated_at,etiquetas:[]});assert.deepEqual(lead.etiquetas,[]);
  const owned=call('save_lead',{nome:'Lead da equipe',whatsapp:'551199990009',etiquetas:['Equipe'],responsavel_id:admin},staff);
  assert.equal(owned.responsavel_id,staff);assert.deepEqual(owned.etiquetas,['Equipe']);
  assert.deepEqual(call('save_lead',{id:owned.id,expected_updated_at:owned.updated_at,etiquetas:['Própria']},staff).etiquetas,['Própria']);
  for(const bad of [null,'texto',{},[{}],[1],[['nested']],[''],['x'.repeat(101)],Array.from({length:51},(_,i)=>`tag${i}`)]){
   assert.throws(()=>call('save_lead',{id:lead.id,expected_updated_at:lead.updated_at,nome:'Não persistir',etiquetas:bad}),/etiqueta/i);
   assert.equal(sql(`SELECT nome FROM leads WHERE id='${lead.id}'`),'Nome revisado');assert.equal(sql(`SELECT updated_at='${lead.updated_at}'::timestamptz FROM leads WHERE id='${lead.id}'`),'t');
  }
  const maximum=Array.from({length:50},(_,i)=>String(i).padEnd(100,'x'));
  lead=call('save_lead',{id:lead.id,expected_updated_at:lead.updated_at,etiquetas:maximum});assert.deepEqual(lead.etiquetas,maximum);
  const request=id(80),rows=[{nome:'CSV com etiquetas',whatsapp:'551199990002',pipeline_id:pipeline,stage_id:stage,etiquetas:['CSV',' Entrada ']},{nome:'CSV sem etiquetas',whatsapp:'551199990003',pipeline_id:pipeline,stage_id:stage}];
  const beforeImport=Number(count());assert.equal(call('import_leads',{rows,request_id:request}).created,2);assert.equal(call('import_leads',{rows,request_id:request}).created,2);assert.equal(Number(count()),beforeImport+2);
  assert.deepEqual(JSON.parse(sql("SELECT to_json(etiquetas) FROM leads WHERE whatsapp='551199990002'")),['CSV','Entrada']);
  assert.deepEqual(JSON.parse(sql("SELECT to_json(etiquetas) FROM leads WHERE whatsapp='551199990003'")),[]);
  assert.equal(call('import_leads',{request_id:id(82),rows:[{nome:'Preservar existente',whatsapp:lead.whatsapp,etiquetas:[]}]}).preserved,1);
  assert.deepEqual(JSON.parse(sql(`SELECT to_json(etiquetas) FROM leads WHERE id='${lead.id}'`)),maximum);
  const before=count();assert.throws(()=>call('import_leads',{request_id:id(81),rows:[{nome:'Parcial',whatsapp:'551199990004'},{nome:'Inválido',whatsapp:'551199990005',etiquetas:[{}]}]}),/etiqueta/i);assert.equal(count(),before);
  assert.equal(sql('SELECT count(*) FROM crm_ia_outbox'),'0');
  assert.equal(sql("SELECT has_function_privilege('authenticated','public.crm_ia_workspace_pre_lead_tags(text,uuid,jsonb)','execute')"),'f');
  assert.equal(sql("SELECT has_function_privilege('anon','public.crm_ia_agent_intake(uuid,uuid,uuid,text)','execute')"),'f');
  assert.equal(sql("SELECT has_function_privilege('authenticated','public.crm_ia_agent_intake(uuid,uuid,uuid,text)','execute')"),'f');
  assert.equal(sql("SELECT has_function_privilege('authenticated','private.crm_ia_lead_tags(jsonb)','execute')"),'f');
 }finally{if(started)run('pg_ctl',['-D',data,'-m','immediate','-w','stop']);rmSync(work,{recursive:true,force:true});}
});

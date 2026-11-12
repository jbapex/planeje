import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
const work = mkdtempSync('/tmp/crm-notifications-'), data = join(work, 'data'), env = { PATH: process.env.PATH, LC_ALL: 'C' };
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const context = Object.fromEntries(['admin','staff','other','client','foreign','channel','hiddenChannel','contact'].map((k,i)=>[k,id([1,2,3,11,12,21,22,31][i])]));
const { admin, staff, client, channel, hiddenChannel } = context, pipeline=id(41), stage=id(51), agent=id(81);
const q = v => v == null ? 'NULL' : typeof v === 'boolean' || typeof v === 'number' ? String(v) : `'${String(typeof v === 'object' ? JSON.stringify(v) : v).replaceAll("'","''")}'`;
function run(bin,args,input) { const r=spawnSync(bin,args,{input,env,encoding:'utf8',timeout:25000});if(r.status!==0)throw Error(r.stderr||r.error?.message);return r.stdout.trim(); }
const args=['-X','-Aqt','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose','-h',work,'-p','55591','-U','notification_qa','-d','postgres'];
const sql=input=>run('psql',args,input);
const row=(table,key)=>JSON.parse(sql(`SELECT to_jsonb(t) FROM ${table} t WHERE id=${q(key)}`));
const contentState = value => { const { updated_at, ...content } = value;return content; };
const rpc=(name,params={})=>JSON.parse(sql(`SET ROLE service_role;SELECT to_jsonb(public.${name}(${Object.entries(params).map(([k,v])=>`${k}=>${k==='p_ids'?`ARRAY[${v.map(q)}]::uuid[]`:q(v)}`).join(',')}));`));
const call=(action,payload={},uid=admin)=>JSON.parse(sql(`BEGIN;SET LOCAL ROLE authenticated;SET LOCAL test.uid='${uid}';SELECT public.crm_ia_workspace(${q(action)},'${client}',${q(payload)});COMMIT;`));
function notesConsumer(databaseConnection=null) {
 const notesDb={from(table){assert.equal(table,'atendimento_conversa_notas');let payload;const query={insert(value){payload=value;return query;},select(){return query;},async single(){
  const statement=`BEGIN;SET LOCAL ROLE authenticated;SET LOCAL test.uid='${admin}';INSERT INTO atendimento_conversa_notas(cliente_id,conversation_id,autor_id,autor_nome,texto) VALUES(${q(payload.cliente_id)},${q(payload.conversation_id)},${q(payload.autor_id)},${q(payload.autor_nome)},${q(payload.texto)}) RETURNING to_jsonb(atendimento_conversa_notas);COMMIT;`;
  return{data:JSON.parse(databaseConnection?await databaseConnection.query(statement):sql(statement)),error:null};
 }};return query;}};
 const module={exports:{}},source=readFileSync(new URL('../../src/lib/atendimentoConversaNotas.js',import.meta.url),'utf8').replace(/^import[^\n]*\n/,'').replaceAll('export async function','async function');
 vm.runInNewContext(source+'\nmodule.exports={addConversaNota};',{supabase:notesDb,module});return module.exports.addConversaNota;
}
const notification=(recipient={type:'lead_owner',person_id:null,phone:null})=>({enabled:true,recipient});
const rules=extra=>({crm_ia:{tipo:'qualificacao',pipeline_id:pipeline,stage_ids:[stage],variaveis:[],destino:{tipo:'humano'},notification:notification(),...extra}});
let serial=0;
function fixture({kind='qualify',recipient=null,profile=false,sourceOverride={},keepAgent=false}={}) {
 const n=++serial, contact=id(100+n),lead=id(200+n),inbox=id(300+n),jid=`55110000${String(n).padStart(5,'0')}@s.whatsapp.net`;
 if(recipient==='source')recipient={type:'phone',phone:jid.split('@')[0]};
 sql(`${keepAgent?'':`UPDATE cliente_atend_ia_agentes SET funil=${q(rules({...(recipient&&{notification:notification(recipient)}),...(profile&&{profiles:[{id:id(901),nome:'Interessado',cor:'#123456',descricao:'Confirmado',pistas:[],actions:{owner_id:staff,tags:[]}}]}),...(kind==='book'&&{tipo:'agendamento',notification:{enabled:false,recipient:{type:'lead_owner'}},agendamento:{owner_id:admin,notify_owner:true,duration_minutes:30,interval_minutes:30}})}))},updated_at=clock_timestamp() WHERE id='${agent}';`}
 INSERT INTO cliente_whatsapp_contact(id,cliente_id,from_jid,phone,sender_name,whatsapp_config_id) VALUES('${contact}','${client}','${jid}',split_part('${jid}','@',1),'Fonte ${n}','${channel}');
 INSERT INTO leads(id,cliente_id,nome,whatsapp,pipeline_id,stage_id,crm_ia_contact_id,responsavel_id) VALUES('${lead}','${client}','Lead ${n}',split_part('${jid}','@',1),'${pipeline}','${stage}','${contact}','${admin}');
 INSERT INTO cliente_atend_conversas(cliente_id,contact_id,status,ia_pausada,assigned_to) VALUES('${client}','${contact}','esperando',false,'${admin}');
 INSERT INTO cliente_whatsapp_inbox(id,cliente_id,whatsapp_config_id,from_jid,chat_jid,body,type,message_id,msg_timestamp) VALUES('${inbox}','${client}','${channel}','${jid}','${jid}','Confirmo agendar','text','notification-${n}',clock_timestamp());`);
 const c=JSON.parse(sql(`SELECT to_jsonb(t) FROM cliente_atend_conversas t WHERE contact_id='${contact}'`)),l=row('leads',lead),a=row('cliente_atend_ia_agentes',agent),cfg=JSON.parse(sql(`SELECT to_jsonb(t) FROM crm_ia_config t WHERE cliente_id='${client}'`));
 const job=rpc('crm_ia_agent_begin',{p_client:client,p_channel:channel,p_contact:contact,p_lead:lead,p_agent:agent,p_mode:'responder',p_message:`notification-${n}`,p_expected:{actor_id:admin,config_revision:cfg.revision,agent_updated_at:a.updated_at,lead_updated_at:l.updated_at,conversation_updated_at:c.updated_at,last_text:'Confirmo agendar',source_inbox_id:inbox,source_message_id:`notification-${n}`,source_message_type:'text',...sourceOverride}});
 assert.equal(job.claimed,true);
 let slot={};if(kind==='book')slot=rpc('crm_ia_agent_slots',{p_client:client,p_agent:agent,p_lead:lead,p_date:new Date(Date.now()+((n%20)+2)*86400000).toISOString().slice(0,10)}).rows[0];
 const action={type:kind,...(kind==='qualify'||kind==='book'?{summary:'Necessidade confirmada, dados sintéticos.'}:{}),...(profile?{profile_id:id(901)}:{}),...slot};
 const result=rpc('crm_ia_apply_agent_action',{p_run:job.id,p_action:action,p_reply:'Resposta principal'});
 return {contact,lead,inbox,jid,job,result,action,conversation:c.id};
}
const legacyPayload=(f,patch={})=>({cliente_id:client,whatsapp_config_id:channel,chat_jid:f.jid,is_group:false,display_name:'Lead QA',status:'aguardando',fila_id:null,last_message_at:new Date().toISOString(),last_customer_message_at:null,awaiting_response_since:null,unread_count:0,last_message_preview:'Resumo interno',profile_pic_url:null,updated_at:new Date().toISOString(),...patch});
function finishMain(f,options={}) {
 const [claimed]=rpc('crm_ia_delivery_claim',{p_ids:[f.result.outbox_id]});assert.ok(claimed,'principal reservada');
 const claim={p_id:claimed.id,p_claim_token:claimed.claim_token};
 assert.equal(rpc('crm_ia_delivery_recheck',claim).allowed,true);
 assert.equal(rpc('crm_ia_delivery_start',{p_kind:'outbox',...claim}),true);
 assert.equal(rpc('crm_ia_delivery_finish',{...claim,p_status:'sent',p_message_id:`main-${serial}`,...options}),true);
 return JSON.parse(sql(`SELECT coalesce(json_agg(o),'[]') FROM crm_ia_outbox o WHERE kind='notification' AND agent_run_id='${f.job.id}'`));
}
function claimNotice(f) { const n=JSON.parse(sql(`SELECT to_jsonb(o) FROM crm_ia_outbox o WHERE kind='notification' AND agent_run_id='${f.job.id}'`));const [claim]=rpc('crm_ia_delivery_claim',{p_ids:[n.id]});assert.ok(claim);return {p_id:claim.id,p_claim_token:claim.claim_token}; }
function connection() {
 const child=spawn('psql',args,{env,stdio:['pipe','pipe','pipe']});let stderr='',seq=0;child.stderr.on('data',c=>stderr+=c);
 const done=new Promise(resolve=>child.on('close',code=>resolve({code,stderr})));
 return {child,done,query(statement){const marker=`done_${++seq}`;return new Promise((resolve,reject)=>{let output='';const timer=setTimeout(()=>{cleanup();reject(Error(stderr||'notification lock timeout'));},6000);const receive=c=>{output+=c;if(output.includes(marker)){cleanup();resolve(output.split(marker)[0].trim());}};function cleanup(){clearTimeout(timer);child.stdout.off('data',receive);}child.stdout.on('data',receive);child.stdin.write(`${statement}\n\\echo ${marker}\n`);});}};
}
async function blocked(pid) {
 for(let i=0;i<100;i++){if(sql(`SELECT wait_event_type='Lock' FROM pg_stat_activity WHERE pid=${pid}`)==='t')return;await new Promise(resolve=>setTimeout(resolve,20));}
 assert.fail('A consulta não aguardou o lock esperado');
}
test('avisos internos preservam fonte, destinatário, confirmação e tentativa única',async t=>{
 let started=false,warm;
 try {
  run('initdb',['-D',data,'-U','notification_qa','--auth-local=trust','--auth-host=reject','--no-locale','--encoding=UTF8']);run('pg_ctl',['-D',data,'-l',join(work,'pg.log'),'-o',`-k ${work} -p 55591 -c listen_addresses='' -c unix_socket_permissions=0700`,'-w','start']);started=true;assert.equal(sql('SHOW listen_addresses'),'');
  const fixtureSql=readFileSync(new URL('./workspace.database.test.mjs',import.meta.url),'utf8').split('    sql(`')[1].split('    `);')[0].replace(/\$\{(\w+)\}/g,(_,name)=>context[name]);sql(fixtureSql.replace(/      CREATE TABLE public\.crm_ia_outbox\([^\n]+\n/,''));
  sql(`CREATE SCHEMA planeje_private;CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid);CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS $$SELECT jsonb_build_object('sub',auth.uid())$$;
  ALTER TABLE cliente_whatsapp_contact ADD COLUMN last_message_at timestamptz,ADD COLUMN origin_source text DEFAULT 'nao_identificado',ADD COLUMN qualificado boolean;
  ALTER TABLE leads ADD COLUMN qualificado boolean;ALTER TABLE cliente_atend_conversas ADD COLUMN ia_followup_passo integer DEFAULT 0;
  CREATE TABLE atendimento_conversas(id uuid PRIMARY KEY,cliente_id uuid,whatsapp_config_id uuid,chat_jid text,archived_at timestamptz,bloqueada boolean DEFAULT false);
  CREATE TABLE atendimento_conversa_planejamento(id uuid PRIMARY KEY,cliente_id uuid,conversation_id uuid,whatsapp_config_id uuid,chat_jid text,kind text,body text,status text,scheduled_at timestamptz,completed_at timestamptz,error_message text,updated_at timestamptz DEFAULT now());GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;`);
  sql(`ALTER TABLE atendimento_conversas ALTER COLUMN id SET DEFAULT gen_random_uuid();ALTER TABLE atendimento_conversas ADD COLUMN is_group boolean DEFAULT false,ADD COLUMN display_name text,ADD COLUMN status text DEFAULT 'aguardando',ADD COLUMN fila_id uuid,ADD COLUMN assigned_to uuid,ADD COLUMN last_message_at timestamptz,ADD COLUMN last_customer_message_at timestamptz,ADD COLUMN awaiting_response_since timestamptz,ADD COLUMN unread_count integer DEFAULT 0,ADD COLUMN last_message_preview text,ADD COLUMN profile_pic_url text,ADD COLUMN created_at timestamptz DEFAULT now(),ADD COLUMN updated_at timestamptz DEFAULT now();CREATE UNIQUE INDEX notification_legacy_scope ON atendimento_conversas(cliente_id,whatsapp_config_id,chat_jid)`);
  sql(`GRANT SELECT ON public.profiles TO authenticated;CREATE FUNCTION public.atendimento_user_can_access_conversation(uuid) RETURNS boolean LANGUAGE sql AS $$SELECT false$$;
   CREATE TABLE auth.users(id uuid PRIMARY KEY);INSERT INTO auth.users VALUES('${admin}');
   ALTER TABLE atendimento_conversa_planejamento ADD CONSTRAINT notification_plan_parent FOREIGN KEY(conversation_id) REFERENCES atendimento_conversas(id) ON DELETE CASCADE;
   CREATE TABLE tarefas(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),title text,atendimento_conversation_id uuid REFERENCES atendimento_conversas(id) ON DELETE SET NULL);
   CREATE TABLE notification_future_child(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),conversation_id uuid REFERENCES atendimento_conversas(id) ON DELETE CASCADE,content text);`);
  sql(readFileSync(new URL('../../supabase/migrations/20261006223000_atendimento_conversa_notas.sql',import.meta.url),'utf8'));
  sql(readFileSync(new URL('../../supabase/migrations/20260702140000_atendimento_conversa_favorita.sql',import.meta.url),'utf8').match(/CREATE TABLE IF NOT EXISTS public\.atendimento_conversa_favorita\s*\([\s\S]*?\);/i)[0]);
  sql(readFileSync(new URL('../../supabase/migrations/20260928230000_cliente_atend_inbox.sql',import.meta.url),'utf8').match(/create or replace function public\.cliente_atend_touch_updated_at\([\s\S]*?\$\$;/i)[0]);
  sql('CREATE TRIGGER cliente_atend_conversas_touch BEFORE UPDATE ON public.cliente_atend_conversas FOR EACH ROW EXECUTE FUNCTION public.cliente_atend_touch_updated_at()');
  const files=['20261111041703_crm_ia_delivery_runtime.sql','20261111041704_crm_ia_workspace.sql','20261111043800_crm_ia_workspace_readings.sql','20261111044652_crm_ia_agent_runtime.sql','20261111062101_crm_ia_calendar.sql','20261111062548_crm_ia_voice.sql','20261111072502_crm_ia_calendar_delivery.sql','20261111075558_crm_ia_agent_template_contract.sql','20261111090001_crm_ia_appointment_actions.sql','20261111090002_crm_ia_agent_drafts_voice_modes.sql','20261111090003_crm_ia_lead_tags.sql','20261111101501_crm_ia_lead_profiles.sql','20261111101502_crm_ia_lead_reads.sql'];
  for(const file of files)sql(readFileSync(new URL(`../../supabase/migrations/${file}`,import.meta.url),'utf8'));
  warm=connection();
  await warm.query(`SET ROLE service_role;SELECT public.crm_ia_delivery_recheck('${id(9901)}','${id(9902)}');SELECT public.crm_ia_delivery_actor_check('${id(9901)}','outbox');SELECT public.crm_ia_delivery_start('outbox','${id(9901)}','${id(9902)}');SELECT public.crm_ia_voice_begin('${id(9901)}','${id(9902)}');SELECT public.crm_ia_delivery_finish('${id(9901)}','${id(9902)}','sent','fixture');`);
  const next=new URL('../../supabase/migrations/20261111120001_crm_ia_internal_notifications.sql',import.meta.url);if(existsSync(next))sql(readFileSync(next,'utf8'));
  sql(`INSERT INTO crm_pipelines(id,cliente_id,nome) VALUES('${pipeline}','${client}','Funil QA');INSERT INTO crm_stages(id,pipeline_id,nome) VALUES('${stage}','${pipeline}','Entrada');
  UPDATE profiles SET whatsapp=CASE WHEN id='${admin}' THEN '+55 (11) 00000-0001' WHEN id='${staff}' THEN '(11) 00000-0002' END;
  INSERT INTO crm_ia_config(cliente_id,data,updated_by) VALUES('${client}',${q({attendance:{auto_send:true},availability:{timezone:'America/Sao_Paulo',duration_minutes:30,interval_minutes:30,min_notice_hours:0,horizon_days:60,max_per_day:100,windows:[{owner_id:admin,days:[0,1,2,3,4,5,6],start:'08:00',end:'22:00'}]}})},'${admin}');
  INSERT INTO cliente_atend_ia_agentes(id,cliente_id,nome,ativo,auto_responder,created_by,funil) VALUES('${agent}','${client}','Agente QA',true,true,'${admin}',${q(rules())});`);
  t.afterEach(()=>sql("UPDATE crm_ia_outbox SET status='uncertain',error_code='fixture_finished' WHERE kind='notification' AND status='sending'"));
  await t.test('publicação rejeita destino forjado, estrangeiro e telefone inválido, rascunho permite incompleto',()=>{
   for(const recipient of [{type:'forged'},{type:'person',person_id:context.other},{type:'phone',phone:'123'}])assert.throws(()=>call('save_agent',{nome:'Inválido',funil:rules({notification:notification(recipient)})}),/destinat|pessoa|telefone/i);
   const d=call('agent_draft',{pipeline_id:pipeline,tipo:'qualificacao'});const saved=call('save_agent_draft',{pipeline_id:pipeline,tipo:'qualificacao',revision:d.revision,data:{nome:'Incompleto',funil:rules({notification:notification({type:'person'})})}});assert.ok(saved.revision);
  });
  await t.test('qualificação captura dono final do perfil e materializa somente após principal sent',()=>{
   const f=fixture({profile:true});assert.equal(row('leads',f.lead).responsavel_id,staff);
   assert.equal(sql(`SELECT count(*) FROM crm_ia_outbox WHERE kind='notification'`),'0');
   const [notice]=finishMain(f);assert.ok(notice);assert.equal(notice.contact_id,f.contact);assert.equal(notice.lead_id,f.lead);
   const claim=claimNotice(f),target=rpc('crm_ia_delivery_recheck',claim);assert.equal(target.allowed,true);assert.equal(target.to,'5511000000002@s.whatsapp.net');assert.equal(target.contact_id,f.contact);assert.ok(target.internal_notification.event_id);assert.equal(target.voice,undefined);
   const before=row('cliente_atend_conversas',f.conversation);assert.equal(rpc('crm_ia_delivery_start',{p_kind:'outbox',...claim}),true);assert.equal(rpc('crm_ia_delivery_start',{p_kind:'outbox',...claim}),false);
   assert.equal(rpc('crm_ia_delivery_finish',{...claim,p_status:'sent',p_message_id:'internal-provider'}),true);assert.deepEqual(row('cliente_atend_conversas',f.conversation),before);
   assert.equal(rpc('crm_ia_apply_agent_action',{p_run:f.job.id,p_action:f.action,p_reply:'replay'}).outbox_id,f.result.outbox_id);
   assert.equal(sql(`SELECT count(*) FROM crm_ia_outbox WHERE kind='notification' AND agent_run_id='${f.job.id}'`),'1');
  });
  await t.test('destinatário ausente não desfaz qualificação nem inventa contato',()=>{
   sql(`UPDATE profiles SET whatsapp=NULL WHERE id='${admin}'`);const before=sql('SELECT count(*) FROM cliente_whatsapp_contact'),f=fixture();assert.equal(finishMain(f).length,0);assert.equal(row('leads',f.lead).qualificado,true);
   assert.equal(Number(sql('SELECT count(*) FROM cliente_whatsapp_contact')),Number(before)+1);assert.match(sql(`SELECT error_code FROM planeje_private.crm_ia_notification_events WHERE run_id='${f.job.id}'`),/recipient/);sql(`UPDATE profiles SET whatsapp='5511000000001' WHERE id='${admin}'`);
  });
  await t.test('fonte ausente, forjada ou estrangeira não ganha aviso nem desfaz a conclusão',()=>{
   sql(`INSERT INTO cliente_whatsapp_inbox(id,cliente_id,whatsapp_config_id,chat_jid,from_jid,type,message_id) VALUES('${id(9802)}','${context.foreign}','${hiddenChannel}','5511000000000@s.whatsapp.net','5511000000000@s.whatsapp.net','text','foreign-source')`);
   for(const sourceOverride of [{source_inbox_id:null},{source_inbox_id:id(9801)},{source_message_id:'forged-source'},{source_inbox_id:id(9802),source_message_id:'foreign-source'}]){
    const f=fixture({sourceOverride});assert.equal(row('leads',f.lead).qualificado,true);assert.equal(finishMain(f).length,0);
   }
  });
  await t.test('pessoa explícita e outro número resolvem no servidor sem inferir responsável ou LID',()=>{
   const selected=fixture({profile:true,recipient:{type:'person',person_id:admin}});finishMain(selected);const chosen=rpc('crm_ia_delivery_recheck',claimNotice(selected));assert.equal(chosen.to,'5511000000001@s.whatsapp.net');assert.equal(chosen.internal_notification.recipient_person_id,admin);
   const explicit=fixture({recipient:{type:'phone',phone:'(11) 00000-0099'}});finishMain(explicit);const target=rpc('crm_ia_delivery_recheck',claimNotice(explicit));assert.equal(target.to,'5511000000099@s.whatsapp.net');assert.equal(target.internal_notification.recipient_person_id,null);
   sql(`UPDATE profiles SET whatsapp='5511000000001@lid' WHERE id='${admin}'`);const lid=fixture();assert.equal(finishMain(lid).length,0);sql(`UPDATE profiles SET whatsapp='5511000000001' WHERE id='${admin}'`);
  });
  await t.test('revogação somente do destinatário bloqueia envio sem desfazer a ação comercial',()=>{
   const f=fixture({profile:true,recipient:{type:'person',person_id:staff}});finishMain(f);const claim=claimNotice(f);sql(`UPDATE profiles SET status='inactive' WHERE id='${staff}'`);assert.equal(rpc('crm_ia_delivery_start',{p_kind:'outbox',...claim}),false);assert.equal(row('leads',f.lead).qualificado,true);sql(`UPDATE profiles SET status='active' WHERE id='${staff}'`);
  });
  await t.test('resposta incerta, sem transporte ou com ID sintético nunca materializa aviso',()=>{
   for(const receipt of [{status:'uncertain',message:null,start:true},{status:'sent',message:'no-transport',start:false},{status:'sent',message:'sent_123456789',start:true}]){
    const f=fixture(),[o]=rpc('crm_ia_delivery_claim',{p_ids:[f.result.outbox_id]}),claim={p_id:o.id,p_claim_token:o.claim_token};if(receipt.start)assert.equal(rpc('crm_ia_delivery_start',{p_kind:'outbox',...claim}),true);
    rpc('crm_ia_delivery_finish',{...claim,p_status:receipt.status,p_message_id:receipt.message});assert.equal(sql(`SELECT count(*) FROM crm_ia_outbox WHERE kind='notification' AND agent_run_id='${f.job.id}'`),'0');assert.equal(row('leads',f.lead).qualificado,true);
   }
  });
  await t.test('somente conclusão notifica e uma conclusão por ciclo',()=>{
   const answer=fixture({kind:'answer'});finishMain(answer);assert.equal(sql(`SELECT count(*) FROM planeje_private.crm_ia_notification_events WHERE run_id='${answer.job.id}'`),'0');
   const f=fixture();finishMain(f);sql(`UPDATE cliente_atend_conversas SET ia_pausada=false,status='entrada',updated_at=clock_timestamp() WHERE id='${f.conversation}'`);
   const c=row('cliente_atend_conversas',f.conversation),a=row('cliente_atend_ia_agentes',agent),l=row('leads',f.lead),cfg=JSON.parse(sql(`SELECT to_jsonb(c) FROM crm_ia_config c WHERE cliente_id='${client}'`));
   const second=rpc('crm_ia_agent_begin',{p_client:client,p_channel:channel,p_contact:f.contact,p_lead:f.lead,p_agent:agent,p_mode:'responder',p_message:'second-cycle-same',p_expected:{actor_id:admin,config_revision:cfg.revision,agent_updated_at:a.updated_at,lead_updated_at:l.updated_at,conversation_updated_at:c.updated_at}});assert.equal(second.claimed,true);
   rpc('crm_ia_apply_agent_action',{p_run:second.id,p_action:{type:'qualify'},p_reply:'mesmo ciclo'});assert.equal(sql(`SELECT count(*) FROM planeje_private.crm_ia_notification_events WHERE lead_id='${f.lead}'`),'1');
  });
  await t.test('reinício real da triagem cria outro ciclo sem repetir conclusão no ciclo antigo',()=>{
   const f=fixture();finishMain(f);const cycle=sql(`SELECT cycle_id FROM planeje_private.crm_ia_notification_cycles WHERE conversation_id='${f.conversation}'`);
   sql(`UPDATE crm_ia_config SET revision=gen_random_uuid(),data=data||${q({attendance:{auto_send:true,restart_triage:true},entry:{enabled:true,channels:[{channel_id:channel,enabled:true,pipeline_id:pipeline,stage_id:stage}]}})} WHERE cliente_id='${client}';UPDATE cliente_atend_conversas SET status='finalizado',ia_pausada=false,crm_ia_runtime=crm_ia_runtime||'{"closed":true}' WHERE id='${f.conversation}'`);
   const intake=rpc('crm_ia_agent_intake',{p_client:client,p_channel:channel,p_contact:f.contact,p_text:'Novo ciclo'});assert.equal(intake.conversation.ia_pausada,false);assert.notEqual(sql(`SELECT cycle_id FROM planeje_private.crm_ia_notification_cycles WHERE conversation_id='${f.conversation}'`),cycle);
   const source=JSON.parse(sql(`WITH inserted AS(INSERT INTO cliente_whatsapp_inbox(cliente_id,whatsapp_config_id,chat_jid,from_jid,type,message_id,body) VALUES('${client}','${channel}','${f.jid}','${f.jid}','text','restart-source','Novo ciclo') RETURNING *)SELECT to_jsonb(inserted) FROM inserted`)),a=row('cliente_atend_ia_agentes',agent);
   const job=rpc('crm_ia_agent_begin',{p_client:client,p_channel:channel,p_contact:f.contact,p_lead:f.lead,p_agent:agent,p_mode:'responder',p_message:source.message_id,p_expected:{actor_id:admin,config_revision:intake.config.revision,agent_updated_at:a.updated_at,lead_updated_at:intake.lead.updated_at,conversation_updated_at:intake.conversation.updated_at,source_inbox_id:source.id,source_message_id:source.message_id,source_message_type:source.type}});assert.equal(job.claimed,true);
   const result=rpc('crm_ia_apply_agent_action',{p_run:job.id,p_action:{type:'qualify',summary:'Segundo ciclo confirmado'},p_reply:'Confirmação'});assert.equal(finishMain({...f,job,result}).length,1);assert.equal(sql(`SELECT count(*) FROM planeje_private.crm_ia_notification_events WHERE lead_id='${f.lead}'`),'2');
  });
  await t.test('revalidação cancela inbound, humano, dono/telefone, agente/config e revogação',()=>{
   for(const mutation of [f=>`INSERT INTO cliente_whatsapp_inbox(cliente_id,whatsapp_config_id,chat_jid,from_jid,type,message_id) VALUES('${client}','${channel}','${f.jid}','${f.jid}','text','new-inbound')`,f=>`UPDATE cliente_atend_conversas SET ia_pausada=false,updated_at=clock_timestamp() WHERE id='${f.conversation}'`,f=>`UPDATE leads SET responsavel_id='${staff}',updated_at=clock_timestamp() WHERE id='${f.lead}'`,()=>`UPDATE profiles SET whatsapp='5511000000003' WHERE id='${admin}'`,()=>`UPDATE profiles SET status='inactive' WHERE id='${admin}'`,()=>`UPDATE crm_ia_config SET revision=gen_random_uuid() WHERE cliente_id='${client}'`,()=>`UPDATE cliente_atend_ia_agentes SET updated_at=clock_timestamp() WHERE id='${agent}'`]) {
    sql(`UPDATE profiles SET status='active',whatsapp='5511000000001' WHERE id='${admin}'`);const f=fixture();finishMain(f);const claim=claimNotice(f);sql(mutation(f));assert.equal(rpc('crm_ia_delivery_start',{p_kind:'outbox',...claim}),false);assert.equal(rpc('crm_ia_delivery_recheck',claim).allowed,false);
   }
   sql(`UPDATE profiles SET status='active',whatsapp='5511000000001' WHERE id='${admin}'`);
  });
  await t.test('mudanças durante locks de ator, telefone, fonte, dono e última autorização bloqueiam início',async()=>{
   const cases=[
    f=>({table:'profiles',key:admin,mutation:`UPDATE profiles SET status='inactive' WHERE id='${admin}'`}),
    f=>({table:'profiles',key:admin,mutation:`UPDATE profiles SET whatsapp='5511000000004' WHERE id='${admin}'`}),
    f=>({table:'leads',key:f.lead,mutation:`UPDATE leads SET responsavel_id='${staff}',updated_at=clock_timestamp() WHERE id='${f.lead}'`}),
    f=>({table:'cliente_atend_conversas',key:f.conversation,mutation:`UPDATE cliente_atend_conversas SET updated_at=clock_timestamp(),ia_pausada=false WHERE id='${f.conversation}'`}),
    f=>({table:'cliente_whatsapp_contact',key:f.contact,mutation:`UPDATE cliente_whatsapp_contact SET phone='5511000000005' WHERE id='${f.contact}'`}),
    f=>({table:'cliente_whatsapp_inbox',key:f.inbox,external:true,mutation:`INSERT INTO user_module_permissions(user_id,module_name,is_enabled) VALUES('${admin}','crm',false)`}),
    f=>({table:'cliente_whatsapp_inbox',key:f.inbox,external:true,mutation:`INSERT INTO cliente_whatsapp_inbox(cliente_id,whatsapp_config_id,chat_jid,from_jid,type,message_id) VALUES('${client}','${channel}','${f.jid}','${f.jid}','text','concurrent-inbound')`}),
   ];
   for(const makeCase of cases){
    sql(`UPDATE profiles SET status='active',whatsapp='5511000000001' WHERE id='${admin}';DELETE FROM user_module_permissions WHERE user_id='${admin}'`);
    const f=fixture();finishMain(f);const claim=claimNotice(f),change=makeCase(f),locker=connection(),worker=connection();
    try{
     await locker.query(`BEGIN;SELECT id FROM ${change.table} WHERE id='${change.key}' FOR UPDATE;`);
     const pid=Number(await worker.query('SELECT pg_backend_pid();'));
     const sending=worker.query(`SET ROLE service_role;SELECT public.crm_ia_delivery_start('outbox','${claim.p_id}','${claim.p_claim_token}');`);
     await blocked(pid);
     if(change.external){sql(change.mutation);await locker.query('COMMIT;');}else await locker.query(`${change.mutation};COMMIT;`);
     assert.equal(await sending,'f',change.table);
     assert.equal(sql(`SELECT count(*) FROM crm_ia_transport_claims WHERE source_id='${claim.p_id}'`),'0');
    }finally{locker.child.stdin.end();worker.child.stdin.end();await Promise.all([locker.done,worker.done]);}
   }
   sql(`UPDATE profiles SET status='active',whatsapp='5511000000001' WHERE id='${admin}';DELETE FROM user_module_permissions WHERE user_id='${admin}'`);
  });
  await t.test('duas reservas concorrentes disputam o mesmo aviso e replay não abre nova tentativa',async()=>{
   const f=fixture();const [notice]=finishMain(f),one=connection(),two=connection();
   try{const result=await Promise.all([one,two].map(c=>c.query(`SET ROLE service_role;SELECT public.crm_ia_delivery_claim(clock_timestamp(),ARRAY['${notice.id}']::uuid[]);`)));assert.equal(result.map(JSON.parse).flat().length,1);assert.deepEqual(rpc('crm_ia_delivery_claim',{p_ids:[notice.id]}),[]);assert.equal(row('crm_ia_outbox',notice.id).attempts,1);}finally{one.child.stdin.end();two.child.stdin.end();await Promise.all([one.done,two.done]);}
  });
  await t.test('dois avisos ao mesmo destinatário aguardam a mesma lease sem cancelar ou perder eco',async()=>{
   const f=fixture(),[first]=finishMain(f),g=fixture({keepAgent:true}),[second]=finishMain(g);
   sql(`INSERT INTO cliente_whatsapp_contact(id,cliente_id,from_jid,phone,sender_name,whatsapp_config_id) VALUES('${id(9401)}','${client}','5511000000001@s.whatsapp.net','5511000000001','Destinatário existente','${channel}');INSERT INTO cliente_atend_conversas(cliente_id,contact_id,status,ia_pausada,crm_ia_runtime,ia_followup_due_at) VALUES('${client}','${id(9401)}','esperando',false,'{"active":true}',clock_timestamp()+interval '1 hour')`);
   const destination=JSON.parse(sql(`SELECT to_jsonb(c) FROM cliente_atend_conversas c WHERE contact_id='${id(9401)}'`)),one=connection(),two=connection();let batch;
   try{const results=await Promise.all([one,two].map((c,i)=>c.query(`SET ROLE service_role;SELECT public.crm_ia_delivery_claim(clock_timestamp(),ARRAY['${i?second.id:first.id}']::uuid[]);`)));batch=results.map(JSON.parse).flat();}finally{one.child.stdin.end();two.child.stdin.end();await Promise.all([one.done,two.done]);}
   assert.equal(batch.length,1);const other=batch[0].id===first.id?second:first;assert.equal(row('crm_ia_outbox',other.id).status,'pending');assert.equal(row('crm_ia_outbox',other.id).attempts,0);
   for(let step=0;step<2;step++){
    const claimed=step?rpc('crm_ia_delivery_claim',{p_ids:[other.id]})[0]:batch[0];assert.ok(claimed);const claim={p_id:claimed.id,p_claim_token:claimed.claim_token};assert.equal(rpc('crm_ia_delivery_start',{p_kind:'outbox',...claim}),true);const before=row('cliente_atend_conversas',destination.id);
    assert.equal(rpc('crm_ia_notification_echo',{p_client:client,p_channel:channel,p_contact:id(9401),p_message:`serialized-echo-${step}`,p_expected:before.updated_at}).confirmed,false);assert.equal(row('cliente_atend_conversas',destination.id).ia_pausada,true);
    assert.equal(rpc('crm_ia_notification_note_receipt',{...claim,p_message:`serialized-echo-${step}`}).recorded,true);assert.deepEqual(contentState(row('cliente_atend_conversas',destination.id)),contentState(destination));rpc('crm_ia_delivery_finish',{...claim,p_status:'sent',p_message_id:`serialized-echo-${step}`});
   }
  });
  await t.test('novo inbound antes do finish principal não ganha exceção genérica de versão',()=>{
   const f=fixture();const [o]=rpc('crm_ia_delivery_claim',{p_ids:[f.result.outbox_id]});const claim={p_id:o.id,p_claim_token:o.claim_token};assert.equal(rpc('crm_ia_delivery_start',{p_kind:'outbox',...claim}),true);sql(`UPDATE cliente_atend_conversas SET updated_at=clock_timestamp() WHERE id='${f.conversation}'`);rpc('crm_ia_delivery_finish',{...claim,p_status:'sent',p_message_id:'main-stale'});assert.equal(sql(`SELECT count(*) FROM crm_ia_outbox WHERE kind='notification' AND agent_run_id='${f.job.id}'`),'0');
  });
  await t.test('fila protege gestão e fonte antes da contagem e separa destinatário do lead',()=>{
   const f=fixture();const [notice]=finishMain(f);const queue=call('queue',{contact_id:f.contact});assert.equal(queue.rows.length,2);const item=queue.rows.find(x=>x.id===notice.id);assert.equal(item.recipient_label,'Gestão fictícia');assert.equal(item.source_lead.id,f.lead);assert.equal(call('queue',{contact_id:f.contact},staff).total,0);
   sql(`UPDATE cliente_atend_conversas SET privado=true,assigned_to='${staff}' WHERE id='${f.conversation}'`);assert.equal(call('queue',{contact_id:f.contact}).total,0);
  });
  await t.test('lease expirada fica uncertain sem retry e finish não afeta silêncio',()=>{
   const f=fixture({recipient:'source'});finishMain(f);const claim=claimNotice(f),before=row('cliente_atend_conversas',f.conversation);assert.equal(rpc('crm_ia_delivery_start',{p_kind:'outbox',...claim}),true);
   const callback=rpc('crm_ia_notification_webhook_receipt',{p_client:client,p_channel:channel,p_jid:f.jid,p_message:'expired-callback'});assert.ok(callback.snapshot_id);
   sql(`UPDATE crm_ia_outbox SET claimed_at=clock_timestamp()-interval '10 minutes' WHERE id='${claim.p_id}';UPDATE planeje_private.crm_ia_notification_webhook_snapshots SET created_at=clock_timestamp()-interval '10 minutes' WHERE id='${callback.snapshot_id}'`);
   assert.deepEqual(rpc('crm_ia_delivery_claim',{p_ids:[claim.p_id]}),[]);const expired=row('crm_ia_outbox',claim.p_id);assert.equal(expired.status,'uncertain');assert.equal(expired.attempts,1);assert.equal(sql(`SELECT status||':'||error_code FROM planeje_private.crm_ia_notification_webhook_snapshots WHERE id='${callback.snapshot_id}'`),'stale:callback_incomplete');
   assert.deepEqual(row('cliente_atend_conversas',f.conversation),before);assert.equal(rpc('crm_ia_delivery_start',{p_kind:'outbox',...claim}),false);assert.equal(rpc('crm_ia_notification_note_receipt',{...claim,p_message:'expired-callback'}).recorded,false);
  });
  await t.test('backend aquecido valida aviso pelo recibo e funções anteriores nunca liberam contato fonte',async()=>{
   const f=fixture();finishMain(f);const claim=claimNotice(f);
   const target=JSON.parse(await warm.query(`SELECT public.crm_ia_delivery_recheck('${claim.p_id}','${claim.p_claim_token}');`));assert.equal(target.allowed,true);assert.equal(target.to,'5511000000001@s.whatsapp.net');assert.ok(target.internal_notification);
   assert.equal(await warm.query(`SELECT public.crm_ia_delivery_start('outbox','${claim.p_id}','${claim.p_claim_token}');`),'t');
   const old=rpc('crm_ia_delivery_recheck_base',claim);assert.equal(old.allowed,false,'base anterior não pode confundir notificação com resposta ao contato');
   const before=row('cliente_atend_conversas',f.conversation);assert.equal(await warm.query(`SELECT public.crm_ia_delivery_finish_pre_notifications('${claim.p_id}','${claim.p_claim_token}','sent','legacy-notice');`),'t');assert.deepEqual(row('cliente_atend_conversas',f.conversation),before);
   assert.equal(await warm.query(`SELECT public.crm_ia_voice_begin('${claim.p_id}','${claim.p_claim_token}')->>'allowed';`),'false');
   const second=fixture();finishMain(second);const stale=claimNotice(second);sql(`UPDATE profiles SET status='inactive' WHERE id='${admin}'`);
   assert.equal(await warm.query(`SELECT public.crm_ia_delivery_recheck_base('${stale.p_id}','${stale.p_claim_token}')->>'allowed';`),'false');assert.equal(await warm.query(`SELECT public.crm_ia_delivery_start('outbox','${stale.p_id}','${stale.p_claim_token}');`),'f');assert.equal(sql(`SELECT count(*) FROM crm_ia_transport_claims WHERE source_id='${stale.p_id}'`),'0');sql(`UPDATE profiles SET status='active' WHERE id='${admin}'`);
  });
  await t.test('eco antes do recibo pausa; só ID/claim exatos restauram main e liberam aviso',()=>{
   const f=fixture(),[o]=rpc('crm_ia_delivery_claim',{p_ids:[f.result.outbox_id]}),claim={p_id:o.id,p_claim_token:o.claim_token},before=row('cliente_atend_conversas',f.conversation);
   assert.equal(rpc('crm_ia_delivery_start',{p_kind:'outbox',...claim}),true);
   assert.equal(rpc('crm_ia_notification_echo',{p_client:client,p_channel:channel,p_contact:f.contact,p_message:'main-early',p_expected:before.updated_at}).handled,true);
   assert.equal(row('cliente_atend_conversas',f.conversation).ia_pausada,true);assert.notEqual(row('cliente_atend_conversas',f.conversation).updated_at,before.updated_at);
   assert.equal(rpc('crm_ia_notification_note_receipt',{...claim,p_message:'main-early'}).recorded,true);assert.deepEqual(contentState(row('cliente_atend_conversas',f.conversation)),contentState(before));assert.notEqual(row('cliente_atend_conversas',f.conversation).updated_at,before.updated_at);
   rpc('crm_ia_delivery_finish',{...claim,p_status:'sent',p_message_id:'main-early'});assert.equal(sql(`SELECT count(*) FROM crm_ia_outbox WHERE kind='notification' AND agent_run_id='${f.job.id}'`),'1');
  });
  await t.test('destinatário igual à fonte tem eco cedo/tardio sem efeito líquido em conversa/silêncio/versão',async()=>{
   const f=fixture({recipient:'source'});finishMain(f);const claim=claimNotice(f),before=row('cliente_atend_conversas',f.conversation);assert.equal(rpc('crm_ia_delivery_start',{p_kind:'outbox',...claim}),true);
   const args={p_client:client,p_channel:channel,p_contact:f.contact,p_message:'notice-early',p_expected:before.updated_at};assert.equal(rpc('crm_ia_notification_echo',args).handled,true);
   assert.equal(rpc('crm_ia_notification_note_receipt',{...claim,p_message:'notice-early'}).recorded,true);assert.deepEqual(contentState(row('cliente_atend_conversas',f.conversation)),contentState(before));const restored=row('cliente_atend_conversas',f.conversation);assert.notEqual(restored.updated_at,before.updated_at);
   assert.equal(rpc('crm_ia_delivery_finish',{...claim,p_status:'sent',p_message_id:'notice-early'}),true);assert.deepEqual(row('cliente_atend_conversas',f.conversation),restored);
   assert.equal(rpc('crm_ia_notification_echo',args).handled,true);assert.deepEqual(row('cliente_atend_conversas',f.conversation),restored);
   const warmResult=JSON.parse(await warm.query(`SELECT public.crm_ia_notification_echo('${client}','${channel}','${f.contact}','notice-early','${before.updated_at}');`));assert.equal(warmResult.handled,true);
   assert.equal(rpc('crm_ia_notification_echo',{...args,p_channel:hiddenChannel}).handled,false);
  });
  await t.test('sent precoce comprovado é preservado em privado, replay tardio é suprimido e histórico humano permanece',()=>{
   const f=fixture({recipient:'source'});finishMain(f);const claim=claimNotice(f);assert.equal(rpc('crm_ia_delivery_start',{p_kind:'outbox',...claim}),true);
   sql(`INSERT INTO cliente_whatsapp_sent(id,cliente_id,whatsapp_config_id,to_jid,chat_jid,message_id,body,created_at) VALUES
    ('${id(9501)}','${client}','${channel}','${f.jid}','${f.jid}','early-sent-provider','Histórico anterior, preservar','2000-01-01'),
    ('${id(9502)}','${client}','${channel}','${f.jid}','${f.jid}','early-sent-provider','Resumo interno',clock_timestamp()),
    ('${id(9503)}','${client}','${channel}','${f.jid}','${f.jid}','human-other-provider','Resumo interno',clock_timestamp()),
    ('${id(9504)}','${client}','${hiddenChannel}','${f.jid}','${f.jid}','early-sent-provider','Outro canal',clock_timestamp());`);
   const early=row('cliente_whatsapp_sent',id(9502));assert.equal(rpc('crm_ia_notification_note_receipt',{...claim,p_message:'early-sent-provider'}).recorded,true);
   assert.equal(sql(`SELECT count(*) FROM cliente_whatsapp_sent WHERE id='${id(9502)}'`),'0');assert.deepEqual(JSON.parse(sql(`SELECT record FROM planeje_private.crm_ia_notification_sent_archive WHERE sent_id='${id(9502)}'`)),early);
   for(const n of [9501,9503,9504])assert.ok(row('cliente_whatsapp_sent',id(n)));
   assert.equal(rpc('crm_ia_notification_webhook_receipt',{p_client:client,p_channel:channel,p_jid:f.jid,p_message:'early-sent-provider'}).notification,true);
   assert.equal(rpc('crm_ia_notification_webhook_receipt',{p_client:client,p_channel:hiddenChannel,p_jid:f.jid,p_message:'early-sent-provider'}).notification,false);
   sql(`INSERT INTO cliente_whatsapp_sent(id,cliente_id,whatsapp_config_id,to_jid,chat_jid,message_id,body) VALUES('${id(9505)}','${client}','${channel}','${f.jid}','${f.jid}','early-sent-provider','Outro texto, mesmo recibo')`);assert.equal(sql(`SELECT count(*) FROM cliente_whatsapp_sent WHERE id='${id(9505)}'`),'0');
   assert.equal(sql(`SELECT has_function_privilege('authenticated','public.crm_ia_notification_webhook_receipt(uuid,uuid,text,text)','EXECUTE')`),'f');
  });
  await t.test('snapshot/CAS legado repara preview/espera só com receipt e pós-write completos, inclusive receipt primeiro',()=>{
   for(const receiptFirst of [false,true]){
    const f=fixture({recipient:'source'});finishMain(f);const claim=claimNotice(f);rpc('crm_ia_delivery_start',{p_kind:'outbox',...claim});
    const legacy=JSON.parse(sql(`WITH inserted AS(INSERT INTO atendimento_conversas(cliente_id,whatsapp_config_id,chat_jid,status,last_message_preview,awaiting_response_since,unread_count,assigned_to) VALUES('${client}','${channel}','${f.jid}','aguardando','Mensagem real do lead',clock_timestamp(),3,'${staff}') RETURNING *)SELECT to_jsonb(inserted) FROM inserted`));
    const pending=rpc('crm_ia_notification_webhook_receipt',{p_client:client,p_channel:channel,p_jid:f.jid,p_message:`legacy-${receiptFirst}`});assert.equal(pending.notification,false);assert.ok(pending.snapshot_id);
    if(receiptFirst)rpc('crm_ia_notification_note_receipt',{...claim,p_message:`legacy-${receiptFirst}`});
    const write=rpc('crm_ia_notification_webhook_write',{p_snapshot:pending.snapshot_id,p_payload:legacyPayload(f)});
    if(receiptFirst){assert.equal(write.notification,true);assert.deepEqual(row('atendimento_conversas',legacy.id),legacy);}
    else{assert.ok(write.row);assert.equal(write.row.last_message_preview,'Resumo interno');rpc('crm_ia_notification_note_receipt',{...claim,p_message:`legacy-${receiptFirst}`});assert.deepEqual(contentState(row('atendimento_conversas',legacy.id)),contentState(legacy));assert.notEqual(row('atendimento_conversas',legacy.id).updated_at,legacy.updated_at);}
    rpc('crm_ia_delivery_finish',{...claim,p_status:'sent',p_message_id:`legacy-${receiptFirst}`});
   }
  });
  await t.test('snapshot legado preserva alteração humana de qualquer coluna/versão e interação posterior',()=>{
   for(const mutation of [f=>`UPDATE atendimento_conversas SET unread_count=8 WHERE chat_jid='${f.jid}'`,f=>`UPDATE atendimento_conversas SET assigned_to='${staff}',updated_at=clock_timestamp() WHERE chat_jid='${f.jid}'`,f=>`INSERT INTO cliente_whatsapp_inbox(cliente_id,whatsapp_config_id,chat_jid,from_jid,message_id,type,body) VALUES('${client}','${channel}','${f.jid}','${f.jid}','later-legacy-inbound','text','Resumo interno')`]){
    const f=fixture({recipient:'source'});finishMain(f);const claim=claimNotice(f);rpc('crm_ia_delivery_start',{p_kind:'outbox',...claim});sql(`INSERT INTO atendimento_conversas(cliente_id,whatsapp_config_id,chat_jid,last_message_preview) VALUES('${client}','${channel}','${f.jid}','Cliente')`);
    const pending=rpc('crm_ia_notification_webhook_receipt',{p_client:client,p_channel:channel,p_jid:f.jid,p_message:'legacy-human'}),write=rpc('crm_ia_notification_webhook_write',{p_snapshot:pending.snapshot_id,p_payload:legacyPayload(f)});assert.ok(write.row);sql(mutation(f));const human=row('atendimento_conversas',write.row.id);rpc('crm_ia_notification_note_receipt',{...claim,p_message:'legacy-human'});assert.deepEqual(row('atendimento_conversas',write.row.id),human);
   }
  });
  await t.test('CAS atômico detecta alteração sem timestamp; criação nova é preservada após receipt',()=>{
   const f=fixture({recipient:'source'});finishMain(f);const claim=claimNotice(f);rpc('crm_ia_delivery_start',{p_kind:'outbox',...claim});sql(`INSERT INTO atendimento_conversas(cliente_id,whatsapp_config_id,chat_jid,last_message_preview) VALUES('${client}','${channel}','${f.jid}','Cliente')`);
   const pending=rpc('crm_ia_notification_webhook_receipt',{p_client:client,p_channel:channel,p_jid:f.jid,p_message:'legacy-CAS'});sql(`UPDATE atendimento_conversas SET unread_count=9 WHERE chat_jid='${f.jid}'`);const result=rpc('crm_ia_notification_webhook_write',{p_snapshot:pending.snapshot_id,p_payload:legacyPayload(f)});assert.equal(result.conflict,true);assert.equal(sql(`SELECT last_message_preview FROM atendimento_conversas WHERE chat_jid='${f.jid}'`),'Cliente');rpc('crm_ia_delivery_finish',{...claim,p_status:'uncertain'});
   const g=fixture({recipient:'source'});finishMain(g);const second=claimNotice(g);rpc('crm_ia_delivery_start',{p_kind:'outbox',...second});const fresh=rpc('crm_ia_notification_webhook_receipt',{p_client:client,p_channel:channel,p_jid:g.jid,p_message:'legacy-new'}),created=rpc('crm_ia_notification_webhook_write',{p_snapshot:fresh.snapshot_id,p_payload:legacyPayload(g)});assert.ok(created.row);rpc('crm_ia_notification_note_receipt',{...second,p_message:'legacy-new'});assert.equal(sql(`SELECT count(*) FROM atendimento_conversas WHERE id='${created.row.id}'`),'1');assert.deepEqual(row('atendimento_conversas',created.row.id),created.row);assert.equal(sql(`SELECT status||':'||error_code FROM planeje_private.crm_ia_notification_webhook_snapshots WHERE id='${fresh.snapshot_id}'`),'stale:new_conversation_preserved');assert.deepEqual(JSON.parse(sql(`SELECT after_state FROM planeje_private.crm_ia_notification_webhook_snapshots WHERE id='${fresh.snapshot_id}'`)),created.row);
  });
  await t.test('nota real, plano, favorito e vínculos CASCADE/SET NULL preservam conversa nova sem tocar versão do pai',async()=>{
   const f=fixture({recipient:'source'});finishMain(f);const claim=claimNotice(f);rpc('crm_ia_delivery_start',{p_kind:'outbox',...claim});
   const pending=rpc('crm_ia_notification_webhook_receipt',{p_client:client,p_channel:channel,p_jid:f.jid,p_message:'children-receipt'}),write=rpc('crm_ia_notification_webhook_write',{p_snapshot:pending.snapshot_id,p_payload:legacyPayload(f)});assert.ok(write.row);
   const note=await notesConsumer()({conversationId:write.row.id,clienteId:client,texto:'  Nota humana posterior ao eco, preservar integralmente.  ',autorId:admin,autorNome:'Pessoa sintética'});assert.equal(note.texto,'Nota humana posterior ao eco, preservar integralmente.');
   sql(`INSERT INTO atendimento_conversa_planejamento(id,cliente_id,conversation_id,whatsapp_config_id,chat_jid,kind,body,status,scheduled_at) VALUES('${id(9701)}','${client}','${write.row.id}','${channel}','${f.jid}','lembrete_interno','Plano humano','pendente',clock_timestamp()+interval '1 hour');
    INSERT INTO atendimento_conversa_favorita(id,user_id,cliente_id,conversation_id) VALUES('${id(9702)}','${admin}','${client}','${write.row.id}');
    INSERT INTO tarefas(id,title,atendimento_conversation_id) VALUES('${id(9703)}','Tarefa humana','${write.row.id}');
    INSERT INTO notification_future_child(id,conversation_id,content) VALUES('${id(9704)}','${write.row.id}','Referência futura sem toque no pai');`);
   const related=[['atendimento_conversa_notas',note.id],['atendimento_conversa_planejamento',id(9701)],['atendimento_conversa_favorita',id(9702)],['tarefas',id(9703)],['notification_future_child',id(9704)]].map(([table,key])=>({table,key,before:row(table,key)}));
   assert.deepEqual(row('atendimento_conversas',write.row.id),write.row,'Filhos não avançam a versão do pai');
   assert.equal(rpc('crm_ia_notification_note_receipt',{...claim,p_message:'children-receipt'}).recorded,true);
   for(const child of related){assert.equal(sql(`SELECT count(*) FROM ${child.table} WHERE id='${child.key}'`),'1',child.table);assert.deepEqual(row(child.table,child.key),child.before);}
   assert.deepEqual(row('atendimento_conversas',write.row.id),write.row);assert.equal(sql(`SELECT error_code FROM planeje_private.crm_ia_notification_webhook_snapshots WHERE id='${pending.snapshot_id}'`),'new_conversation_preserved');
  });
  await t.test('nota real aguardando lock do pai sobrevive ao recibo concorrente',async()=>{
   const f=fixture({recipient:'source'});finishMain(f);const claim=claimNotice(f);rpc('crm_ia_delivery_start',{p_kind:'outbox',...claim});
   const pending=rpc('crm_ia_notification_webhook_receipt',{p_client:client,p_channel:channel,p_jid:f.jid,p_message:'concurrent-child'}),write=rpc('crm_ia_notification_webhook_write',{p_snapshot:pending.snapshot_id,p_payload:legacyPayload(f)}),locker=connection(),receiptWorker=connection(),noteWorker=connection();
   try{
    await locker.query(`BEGIN;SELECT id FROM atendimento_conversas WHERE id='${write.row.id}' FOR UPDATE;`);
    const receiptPid=Number(await receiptWorker.query('SELECT pg_backend_pid();')),writing=receiptWorker.query(`SET ROLE service_role;SELECT public.crm_ia_notification_note_receipt('${claim.p_id}','${claim.p_claim_token}','concurrent-child');`);await blocked(receiptPid);
    const notePid=Number(await noteWorker.query('SELECT pg_backend_pid();')),inserting=notesConsumer(noteWorker)({conversationId:write.row.id,clienteId:client,texto:'Nota concorrente confirmada pela pessoa',autorId:admin,autorNome:'Pessoa sintética'});await blocked(notePid);
    await locker.query('COMMIT;');const results=await Promise.allSettled([writing,inserting]);assert.equal(results[0].status,'fulfilled');assert.equal(results[1].status,'fulfilled',results[1].reason?.message);const note=results[1].value;assert.equal(row('atendimento_conversa_notas',note.id).texto,'Nota concorrente confirmada pela pessoa');assert.deepEqual(row('atendimento_conversas',write.row.id),write.row);
   }finally{locker.child.stdin.end();receiptWorker.child.stdin.end();noteWorker.child.stdin.end();await Promise.all([locker.done,receiptWorker.done,noteWorker.done]);}
  });
  await t.test('CAS aguarda lock real e não sobrescreve coluna humana alterada sem timestamp',async()=>{
   const f=fixture({recipient:'source'});finishMain(f);const claim=claimNotice(f);rpc('crm_ia_delivery_start',{p_kind:'outbox',...claim});sql(`INSERT INTO atendimento_conversas(cliente_id,whatsapp_config_id,chat_jid,last_message_preview) VALUES('${client}','${channel}','${f.jid}','Cliente real')`);
   const pending=rpc('crm_ia_notification_webhook_receipt',{p_client:client,p_channel:channel,p_jid:f.jid,p_message:'CAS-lock'}),locker=connection(),worker=connection();
   try{await locker.query(`BEGIN;SELECT id FROM atendimento_conversas WHERE chat_jid='${f.jid}' FOR UPDATE;`);const pid=Number(await worker.query('SELECT pg_backend_pid();')),writing=worker.query(`SET ROLE service_role;SELECT public.crm_ia_notification_webhook_write('${pending.snapshot_id}',${q(legacyPayload(f))});`);await blocked(pid);await locker.query(`UPDATE atendimento_conversas SET unread_count=11 WHERE chat_jid='${f.jid}';COMMIT;`);assert.equal(JSON.parse(await writing).conflict,true);assert.equal(sql(`SELECT last_message_preview FROM atendimento_conversas WHERE chat_jid='${f.jid}'`),'Cliente real');assert.equal(sql(`SELECT unread_count FROM atendimento_conversas WHERE chat_jid='${f.jid}'`),'11');}finally{locker.child.stdin.end();worker.child.stdin.end();await Promise.all([locker.done,worker.done]);}
  });
  await t.test('receipt antes do callback terminar defere segunda lease do mesmo alvo até fechar snapshot',()=>{
   const f=fixture(),[first]=finishMain(f),g=fixture({keepAgent:true}),[second]=finishMain(g),[claimed]=rpc('crm_ia_delivery_claim',{p_ids:[first.id,second.id]});assert.ok(claimed);const other=claimed.id===first.id?second:first,claim={p_id:claimed.id,p_claim_token:claimed.claim_token};rpc('crm_ia_delivery_start',{p_kind:'outbox',...claim});
   const pending=rpc('crm_ia_notification_webhook_receipt',{p_client:client,p_channel:channel,p_jid:'5511000000001@s.whatsapp.net',p_message:'delayed-callback'});assert.ok(pending.snapshot_id);rpc('crm_ia_notification_note_receipt',{...claim,p_message:'delayed-callback'});rpc('crm_ia_delivery_finish',{...claim,p_status:'sent',p_message_id:'delayed-callback'});assert.deepEqual(rpc('crm_ia_delivery_claim',{p_ids:[other.id]}),[]);assert.equal(row('crm_ia_outbox',other.id).attempts,0);
   assert.equal(rpc('crm_ia_notification_webhook_write',{p_snapshot:pending.snapshot_id,p_payload:legacyPayload({jid:'5511000000001@s.whatsapp.net'})}).notification,true);assert.equal(rpc('crm_ia_delivery_claim',{p_ids:[other.id]}).length,1);
   assert.equal(sql(`SELECT has_function_privilege('authenticated','public.crm_ia_notification_webhook_write(uuid,jsonb)','EXECUTE')`),'f');
  });
  await t.test('webhook_receipt e note_receipt reais concluem sem inversão entre advisory e FKs do snapshot',async()=>{
   const f=fixture({recipient:'source'});finishMain(f);const claim=claimNotice(f);rpc('crm_ia_delivery_start',{p_kind:'outbox',...claim});
   sql(`CREATE FUNCTION planeje_private.notification_snapshot_barrier() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN PERFORM pg_advisory_xact_lock(909912341);RETURN NEW;END$$;CREATE TRIGGER notification_snapshot_barrier BEFORE INSERT ON planeje_private.crm_ia_notification_webhook_snapshots FOR EACH ROW EXECUTE FUNCTION planeje_private.notification_snapshot_barrier();`);
   const locker=connection(),webhook=connection(),receipt=connection();let pending,recording;
   try{
    await locker.query('BEGIN;SELECT pg_advisory_xact_lock(909912341);');const webhookPid=Number(await webhook.query('SELECT pg_backend_pid();'));
    pending=webhook.query(`SET ROLE service_role;SELECT public.crm_ia_notification_webhook_receipt('${client}','${channel}','${f.jid}','real-lock-order');`).catch(error=>({error:error.message}));await blocked(webhookPid);
    const receiptPid=Number(await receipt.query('SELECT pg_backend_pid();'));recording=receipt.query(`SET ROLE service_role;SELECT public.crm_ia_notification_note_receipt('${claim.p_id}','${claim.p_claim_token}','real-lock-order');`).catch(error=>({error:error.message}));await blocked(receiptPid);
    assert.equal(sql(`SELECT ${webhookPid}=ANY(pg_blocking_pids(${receiptPid}))`),'t');assert.equal(sql(`SELECT count(*) FROM pg_locks WHERE pid=${webhookPid} AND locktype='advisory' AND granted`),'1');
    await locker.query('COMMIT;');const outcomes=await Promise.all([pending,recording]);assert.equal(outcomes.every(value=>typeof value==='string'),true,JSON.stringify(outcomes));assert.ok(JSON.parse(outcomes[0]).snapshot_id);assert.equal(JSON.parse(outcomes[1]).recorded,true);
    assert.equal(sql(`SELECT count(*) FROM planeje_private.crm_ia_notification_receipts WHERE outbox_id='${claim.p_id}'`),'1');assert.equal(row('crm_ia_outbox',claim.p_id).attempts,1);assert.equal(rpc('crm_ia_notification_note_receipt',{...claim,p_message:'real-lock-order'}).recorded,true);
   }finally{locker.child.stdin.end();webhook.child.stdin.end();receipt.child.stdin.end();await Promise.all([locker.done,webhook.done,receipt.done]);sql('DROP TRIGGER notification_snapshot_barrier ON planeje_private.crm_ia_notification_webhook_snapshots;DROP FUNCTION planeje_private.notification_snapshot_barrier();');}
  });
  await t.test('receipt relê claim, fonte e chave do evento após esperar a advisory, sem segunda chave',async()=>{
   for(const mutation of [
    (f,claim)=>`UPDATE crm_ia_outbox SET claim_token=gen_random_uuid() WHERE id='${claim.p_id}'`,
    (f,claim)=>`UPDATE crm_ia_outbox SET contact_id='${context.contact}' WHERE id='${claim.p_id}'`,
    (f,claim)=>`UPDATE planeje_private.crm_ia_notification_events SET recipient_to='5511000000777@s.whatsapp.net' WHERE outbox_id='${claim.p_id}'`,
    (f,claim)=>`UPDATE planeje_private.crm_ia_notification_events SET channel_id='${hiddenChannel}' WHERE outbox_id='${claim.p_id}'`,
    (f,claim)=>`UPDATE crm_ia_outbox SET contact_id='${context.contact}' WHERE id='${claim.p_id}';UPDATE planeje_private.crm_ia_notification_events SET contact_id='${context.contact}' WHERE outbox_id='${claim.p_id}'`,
   ]){
    const f=fixture({recipient:'source'});finishMain(f);const claim=claimNotice(f);rpc('crm_ia_delivery_start',{p_kind:'outbox',...claim});const locker=connection(),worker=connection();
    try{const holder=Number(await locker.query(`BEGIN;SELECT pg_advisory_xact_lock(hashtextextended('crm-ia-notification-echo:${client}:${channel}:${f.jid}',0));SELECT pg_backend_pid();`)),pid=Number(await worker.query('SELECT pg_backend_pid();'));
     const recording=worker.query(`SET ROLE service_role;SELECT public.crm_ia_notification_note_receipt('${claim.p_id}','${claim.p_claim_token}','changed-scope');`);await blocked(pid);assert.equal(sql(`SELECT ${holder}=ANY(pg_blocking_pids(${pid}))`),'t');
     sql(mutation(f,claim));await locker.query('COMMIT;');assert.equal(JSON.parse(await recording).recorded,false);assert.equal(sql(`SELECT count(*) FROM planeje_private.crm_ia_notification_receipts WHERE outbox_id='${claim.p_id}'`),'0');assert.equal(row('crm_ia_outbox',claim.p_id).attempts,1);
    }finally{locker.child.stdin.end();worker.child.stdin.end();await Promise.all([locker.done,worker.done]);}
   }
  });
  await t.test('receipt revalida evento depois do último lock e echo rejeita JID trocado enquanto espera fonte',async()=>{
   const f=fixture({recipient:'source'});finishMain(f);const claim=claimNotice(f);rpc('crm_ia_delivery_start',{p_kind:'outbox',...claim});const locker=connection(),worker=connection();
   try{
    await locker.query(`BEGIN;SELECT id FROM planeje_private.crm_ia_notification_events WHERE outbox_id='${claim.p_id}' FOR UPDATE;`);const pid=Number(await worker.query('SELECT pg_backend_pid();')),recording=worker.query(`SET ROLE service_role;SELECT public.crm_ia_notification_note_receipt('${claim.p_id}','${claim.p_claim_token}','last-lock-scope');`);await blocked(pid);
    await locker.query(`UPDATE planeje_private.crm_ia_notification_events SET recipient_to='5511000000778@s.whatsapp.net' WHERE outbox_id='${claim.p_id}';COMMIT;`);assert.equal(JSON.parse(await recording).recorded,false);
   }finally{locker.child.stdin.end();worker.child.stdin.end();await Promise.all([locker.done,worker.done]);}
   const g=fixture({recipient:'source'});finishMain(g);const notice=claimNotice(g);rpc('crm_ia_delivery_start',{p_kind:'outbox',...notice});const source=row('cliente_atend_conversas',g.conversation),holder=connection(),echo=connection();
   try{await holder.query(`BEGIN;SELECT id FROM cliente_atend_conversas WHERE id='${g.conversation}' FOR UPDATE;`);const pid=Number(await echo.query('SELECT pg_backend_pid();')),reading=echo.query(`SET ROLE service_role;SELECT public.crm_ia_notification_echo('${client}','${channel}','${g.contact}','changed-echo-source','${source.updated_at}');`);await blocked(pid);
    sql(`UPDATE cliente_whatsapp_contact SET from_jid='5511000000779@s.whatsapp.net' WHERE id='${g.contact}'`);await holder.query('COMMIT;');assert.equal(JSON.parse(await reading).handled,false);assert.deepEqual(row('cliente_atend_conversas',g.conversation),source);assert.equal(sql(`SELECT count(*) FROM planeje_private.crm_ia_notification_echoes WHERE contact_id='${g.contact}'`),'0');
   }finally{holder.child.stdin.end();echo.child.stdin.end();await Promise.all([holder.done,echo.done]);}
  });
  await t.test('webhook_write relê chave e vínculos do snapshot após a advisory antes de tocar conversa',async()=>{
   for(const mutation of [snapshot=>`UPDATE planeje_private.crm_ia_notification_webhook_snapshots SET to_jid='5511000000780@s.whatsapp.net' WHERE id='${snapshot}'`,snapshot=>`UPDATE planeje_private.crm_ia_notification_webhook_snapshots SET channel_id='${hiddenChannel}' WHERE id='${snapshot}'`]){
    const f=fixture({recipient:'source'});finishMain(f);const claim=claimNotice(f);rpc('crm_ia_delivery_start',{p_kind:'outbox',...claim});const snapshot=rpc('crm_ia_notification_webhook_receipt',{p_client:client,p_channel:channel,p_jid:f.jid,p_message:'changed-snapshot'}).snapshot_id;assert.ok(snapshot);
    const locker=connection(),worker=connection();
    try{const holder=Number(await locker.query(`BEGIN;SELECT pg_advisory_xact_lock(hashtextextended('crm-ia-notification-echo:${client}:${channel}:${f.jid}',0));SELECT pg_backend_pid();`)),pid=Number(await worker.query('SELECT pg_backend_pid();'));
     const writing=worker.query(`SET ROLE service_role;SELECT public.crm_ia_notification_webhook_write('${snapshot}',${q(legacyPayload(f))});`);await blocked(pid);assert.equal(sql(`SELECT ${holder}=ANY(pg_blocking_pids(${pid}))`),'t');
     sql(mutation(snapshot));await locker.query('COMMIT;');const result=JSON.parse(await writing);assert.equal(result.conflict,true);assert.equal(result.row,null);assert.equal(sql(`SELECT count(*) FROM atendimento_conversas WHERE chat_jid IN('${f.jid}','5511000000780@s.whatsapp.net')`),'0');assert.equal(sql(`SELECT after_state IS NULL FROM planeje_private.crm_ia_notification_webhook_snapshots WHERE id='${snapshot}'`),'t');
    }finally{locker.child.stdin.end();worker.child.stdin.end();await Promise.all([locker.done,worker.done]);}
   }
  });
  await t.test('eco não comprovado e mensagem humana/inbound posterior nunca são despausados pelo recibo',()=>{
   for(const variation of ['different-provider','human-after','inbound-after']){
    const f=fixture({recipient:'source'});finishMain(f);const claim=claimNotice(f),before=row('cliente_atend_conversas',f.conversation);assert.equal(rpc('crm_ia_delivery_start',{p_kind:'outbox',...claim}),true);
    rpc('crm_ia_notification_echo',{p_client:client,p_channel:channel,p_contact:f.contact,p_message:'candidate-provider',p_expected:before.updated_at});
    if(variation!=='different-provider')sql(`UPDATE cliente_atend_conversas SET updated_at=clock_timestamp(),ia_pausada=true,crm_ia_runtime=crm_ia_runtime||'${variation==='human-after'?'{"last_human_at":"2026-11-11T12:00:00Z"}':'{"last_inbound_id":"newer-message"}'}'::jsonb WHERE id='${f.conversation}'`);
    const paused=row('cliente_atend_conversas',f.conversation);assert.equal(rpc('crm_ia_notification_note_receipt',{...claim,p_message:variation==='different-provider'?'actual-notification':'candidate-provider'}).recorded,true);assert.deepEqual(row('cliente_atend_conversas',f.conversation),paused);rpc('crm_ia_delivery_finish',{...claim,p_status:'sent',p_message_id:variation==='different-provider'?'actual-notification':'candidate-provider'});assert.deepEqual(row('cliente_atend_conversas',f.conversation),paused);
   }
  });
  await t.test('recibo aguardando lock não restaura sobre humano concorrente',async()=>{
   const f=fixture({recipient:'source'});finishMain(f);const claim=claimNotice(f),before=row('cliente_atend_conversas',f.conversation);rpc('crm_ia_delivery_start',{p_kind:'outbox',...claim});rpc('crm_ia_notification_echo',{p_client:client,p_channel:channel,p_contact:f.contact,p_message:'locked-receipt',p_expected:before.updated_at});
   const locker=connection(),worker=connection();try{
    await locker.query(`BEGIN;SELECT id FROM cliente_atend_conversas WHERE id='${f.conversation}' FOR UPDATE;`);const pid=Number(await worker.query('SELECT pg_backend_pid();'));
    const writing=worker.query(`SET ROLE service_role;SELECT public.crm_ia_notification_note_receipt('${claim.p_id}','${claim.p_claim_token}','locked-receipt');`);await blocked(pid);await locker.query(`UPDATE cliente_atend_conversas SET updated_at=clock_timestamp(),ia_pausada=true,crm_ia_runtime=crm_ia_runtime||'{"last_human_at":"2026-11-11T13:00:00Z"}' WHERE id='${f.conversation}';COMMIT;`);const human=row('cliente_atend_conversas',f.conversation);assert.equal(JSON.parse(await writing).recorded,true);assert.deepEqual(row('cliente_atend_conversas',f.conversation),human);
   }finally{locker.child.stdin.end();worker.child.stdin.end();await Promise.all([locker.done,worker.done]);}
  });
  await t.test('Calendar pendente impede principal e aviso, book confirmado gera apenas aviso ao titular',()=>{
   const f=fixture({kind:'book'});const [notice]=finishMain(f);assert.ok(notice);assert.equal(sql(`SELECT recipient_person_id FROM planeje_private.crm_ia_notification_events WHERE run_id='${f.job.id}'`),admin);
   const copied=JSON.parse(sql(`SELECT private.crm_ia_template('agent',to_jsonb(a)) FROM cliente_atend_ia_agentes a WHERE id='${agent}'`));assert.equal(copied.funil.crm_ia.agendamento.notify_owner,false);assert.equal(copied.funil.crm_ia.notification.enabled,false);assert.equal(copied.funil.crm_ia.notification.recipient.person_id,null);assert.equal(copied.funil.crm_ia.notification.recipient.phone,null);
  });
  await t.test('Calendar externo exige recibo atual e alteração posterior invalida aviso',()=>{
   sql(`INSERT INTO planeje_private.crm_ia_calendar_connections(cliente_id,owner_id,encrypted_token,calendar_id,calendar_name,status,access_role,time_zone) VALUES('${client}','${admin}','fixture-encrypted','fixture-calendar','QA Calendar','connected','owner','America/Sao_Paulo');
    INSERT INTO planeje_private.crm_ia_calendar_busy(connection_id,connection_revision,since_at,until_at,busy,expires_at) SELECT id,revision,current_date,current_date+60,'[]',clock_timestamp()+interval '10 minutes' FROM planeje_private.crm_ia_calendar_connections;`);
   const f=fixture({kind:'book'});assert.deepEqual(rpc('crm_ia_delivery_claim',{p_ids:[f.result.outbox_id]}),[]);assert.equal(row('crm_ia_outbox',f.result.outbox_id).attempts,0);assert.equal(sql(`SELECT count(*) FROM crm_ia_outbox WHERE kind='notification' AND agent_run_id='${f.job.id}'`),'0');
   const [job]=rpc('crm_ia_calendar_service',{p_action:'claim',p_payload:{limit:50}});assert.equal(job.id,f.result.appointment.id);
   assert.equal(rpc('crm_ia_calendar_service',{p_action:'finish',p_payload:{id:job.id,lease:job.lease,status:'synced',receipt:{event_id:job.event_id,calendar_id:job.calendar_id,etag:'current-fixture',http_status:201}}}).status,'synced');
   assert.equal(finishMain(f).length,1);const claim=claimNotice(f);assert.equal(rpc('crm_ia_delivery_recheck',claim).allowed,true);
   sql(`UPDATE planeje_private.crm_ia_calendar_connections SET revision=gen_random_uuid()`);assert.equal(rpc('crm_ia_delivery_start',{p_kind:'outbox',...claim}),false);
  });
 } finally {if(warm){warm.child.stdin.end();await warm.done;}if(started)run('pg_ctl',['-D',data,'-m','immediate','-w','stop']);rmSync(work,{recursive:true,force:true});}
});

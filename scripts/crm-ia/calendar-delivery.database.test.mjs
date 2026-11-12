import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { dispatchCrmIaQueue } from '../../supabase/functions/_shared/crmIaDelivery.js';

const work=mkdtempSync('/tmp/crm-calendar-delivery-'),data=join(work,'data'),port='55497';
const env={PATH:process.env.PATH,LC_ALL:'C'};
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const context=Object.fromEntries(['admin','staff','other','client','foreign','channel','hiddenChannel','contact'].map((key,i)=>[key,id([1,2,3,11,12,21,22,31][i])]));
const {admin,client,channel}=context;
const quote=value=>value==null?'NULL':typeof value==='boolean'||typeof value==='number'?String(value):`'${String(typeof value==='object'?JSON.stringify(value):value).replaceAll("'","''")}'`;
const psql=['-X','-Aqt','-v','ON_ERROR_STOP=1','-h',work,'-p',port,'-U','calendar_delivery_qa','-d','postgres'];
function run(binary,args,input){const r=spawnSync(binary,args,{input,env,encoding:'utf8',timeout:25000});if(r.status!==0)throw new Error(r.stderr||r.error?.message);return r.stdout.trim();}
const sql=source=>run('psql',psql,source);
const rpc=(name,args={})=>JSON.parse(sql(`SET ROLE service_role;SELECT to_jsonb(public.${name}(${Object.entries(args).map(([key,value])=>`${key}=>${key==='p_ids'&&Array.isArray(value)?`ARRAY[${value.map(quote).join(',')}]::uuid[]`:quote(value)}`).join(',')}));`));
const workspace=(action,payload={})=>JSON.parse(sql(`BEGIN;SET LOCAL ROLE authenticated;SET LOCAL test.uid='${admin}';SELECT public.crm_ia_workspace('${action}','${client}',${quote(payload)});COMMIT;`));
const calendar=(action,payload={})=>rpc('crm_ia_calendar_service',{p_action:action,p_payload:payload});
const db={async rpc(name,args){try{return{data:rpc(name,args),error:null};}catch(error){return{data:null,error:{message:error.message}};}}};

test('Calendar reserva a confirmação até recibo atual, conserva claims e trata falha sem confirmar',async()=>{
 let started=false;
 try{
  run('initdb',['-D',data,'-U','calendar_delivery_qa','--auth-local=trust','--auth-host=reject','--no-locale','--encoding=UTF8']);
  run('pg_ctl',['-D',data,'-l',join(work,'pg.log'),'-o',`-k ${work} -p ${port} -c listen_addresses='' -c unix_socket_permissions=0700`,'-w','start']);started=true;
  assert.equal(sql('SHOW listen_addresses'),'');
  const fixture=readFileSync(new URL('./workspace.database.test.mjs',import.meta.url),'utf8').split('    sql(`')[1].split('    `);')[0].replace(/\$\{(\w+)\}/g,(_,name)=>context[name]);
  sql(fixture.replace(/      CREATE TABLE public\.crm_ia_outbox\([^\n]+\n/,''));
  sql(`CREATE SCHEMA planeje_private;CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid);
   CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT jsonb_build_object('sub',auth.uid())$$;
   ALTER TABLE cliente_whatsapp_contact ADD COLUMN last_message_at timestamptz,ADD COLUMN origin_source text DEFAULT 'nao_identificado',ADD COLUMN qualificado boolean;
   ALTER TABLE leads ADD COLUMN qualificado boolean;ALTER TABLE cliente_atend_conversas ADD COLUMN ia_followup_passo integer DEFAULT 0;
   CREATE TABLE atendimento_conversas(id uuid PRIMARY KEY,cliente_id uuid,whatsapp_config_id uuid,chat_jid text,archived_at timestamptz,bloqueada boolean DEFAULT false);
   CREATE TABLE atendimento_conversa_planejamento(id uuid PRIMARY KEY,cliente_id uuid,conversation_id uuid,whatsapp_config_id uuid,chat_jid text,kind text,body text,status text,scheduled_at timestamptz,completed_at timestamptz,error_message text,updated_at timestamptz DEFAULT now());
   GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;`);
  for(const file of ['20261111041703_crm_ia_delivery_runtime.sql','20261111041704_crm_ia_workspace.sql','20261111043800_crm_ia_workspace_readings.sql','20261111044652_crm_ia_agent_runtime.sql','20261111062101_crm_ia_calendar.sql','20261111062548_crm_ia_voice.sql'])sql(readFileSync(new URL(`../../supabase/migrations/${file}`,import.meta.url),'utf8'));
  const pipeline=id(41),stage=id(51),agent=id(81),nextAgent=id(82),date=sql("SELECT (current_date+2)::text");
  sql(`INSERT INTO crm_pipelines(id,cliente_id,nome) VALUES('${pipeline}','${client}','Fixture');INSERT INTO crm_stages(id,pipeline_id,nome) VALUES('${stage}','${pipeline}','Entrada');
   INSERT INTO crm_ia_config(cliente_id,data,updated_by) VALUES('${client}',${quote({attendance:{auto_send:true},availability:{timezone:'UTC',duration_minutes:30,interval_minutes:30,min_notice_hours:0,horizon_days:60,max_per_day:40,windows:[{owner_id:admin,days:[0,1,2,3,4,5,6],start:'08:00',end:'23:00'}]}})},'${admin}');
   INSERT INTO cliente_atend_ia_agentes(id,cliente_id,nome,auto_responder,created_by,funil) VALUES('${agent}','${client}','Agenda',true,'${admin}',${quote({crm_ia:{tipo:'agendamento',pipeline_id:pipeline,stage_ids:[stage],destino:{tipo:'agente',agente_id:nextAgent},agendamento:{owner_id:admin,duration_minutes:30,interval_minutes:30,reminders:[{valor:1,unidade:'horas'}]}}})}),
    ('${nextAgent}','${client}','Qualificação',true,'${admin}',${quote({crm_ia:{tipo:'qualificacao',pipeline_id:pipeline,stage_ids:[stage]}})});
   INSERT INTO planeje_private.crm_ia_calendar_connections(cliente_id,owner_id,encrypted_token,calendar_id,calendar_name,status,access_role,time_zone) VALUES('${client}','${admin}','fixture-encrypted','calendar-fixture','Agenda fictícia','connected','owner','UTC');
   INSERT INTO planeje_private.crm_ia_calendar_busy(connection_id,connection_revision,since_at,until_at,busy,expires_at) SELECT id,revision,'${date}T00:00Z','${date}T23:59:59Z','[]',clock_timestamp()+interval '10 minutes' FROM planeje_private.crm_ia_calendar_connections;`);
  let sequence=0;
  const book=()=>{
   const n=++sequence,contact=id(100+n),lead=id(200+n),jid=`551199999${String(n).padStart(3,'0')}@s.whatsapp.net`;
   sql(`INSERT INTO cliente_whatsapp_contact(id,cliente_id,from_jid,phone,sender_name,whatsapp_config_id) VALUES('${contact}','${client}','${jid}',split_part('${jid}','@',1),'Contato ${n}','${channel}');
    INSERT INTO leads(id,cliente_id,nome,whatsapp,pipeline_id,stage_id,crm_ia_contact_id,responsavel_id) VALUES('${lead}','${client}','Lead ${n}',split_part('${jid}','@',1),'${pipeline}','${stage}','${contact}','${admin}');
    INSERT INTO cliente_atend_conversas(cliente_id,contact_id,ia_pausada,status) VALUES('${client}','${contact}',false,'esperando');`);
   const state=rpc('crm_ia_agent_intake',{p_client:client,p_channel:channel,p_contact:contact,p_text:'Quero agendar'});
   const slot=rpc('crm_ia_agent_slots',{p_client:client,p_agent:agent,p_lead:lead,p_date:date}).rows[0];assert.ok(slot);
   const run=rpc('crm_ia_agent_begin',{p_client:client,p_channel:channel,p_contact:contact,p_lead:lead,p_agent:agent,p_mode:'responder',p_message:`booking-${n}`,
    p_expected:{actor_id:admin,config_revision:state.config.revision,lead_updated_at:state.lead.updated_at,conversation_updated_at:state.conversation.updated_at,agent_updated_at:sql(`SELECT updated_at FROM cliente_atend_ia_agentes WHERE id='${agent}'`),last_text:'Quero agendar'}});
   assert.equal(run.claimed,true);
   const result=rpc('crm_ia_apply_agent_action',{p_run:run.id,p_action:{type:'book',start_at:slot.start_at,end_at:slot.end_at},p_reply:'Não é um recibo',p_followup:{}});
   return{...result,run:run.id,contact,lead,jid,reminder:sql(`SELECT id FROM crm_ia_outbox WHERE appointment_id='${result.appointment.id}' AND kind='reminder'`)};
  };
  const finishCalendar=(item,status='synced')=>{
   const jobs=calendar('claim',{limit:20});
   const job=jobs.find(job=>job.id===item.appointment.id)||JSON.parse(sql(`SELECT to_jsonb(j)||jsonb_build_object('id',j.appointment_id,'calendar_id',j.claimed_calendar_id) FROM planeje_private.crm_ia_calendar_sync_jobs j WHERE appointment_id='${item.appointment.id}'`));
   return calendar('finish',{id:job.id,lease:job.lease,status,...(status==='synced'?{receipt:{event_id:job.event_id,calendar_id:job.calendar_id,etag:'fixture-receipt',http_status:201}}:{error_code:'fixture_failure'})});
  };
  const waiting=book();
  // Also exercise the migration's recovery of an intact booking already queued before installation.
  sql(readFileSync(new URL('../../supabase/migrations/20261111072502_crm_ia_calendar_delivery.sql',import.meta.url),'utf8'));
  assert.equal(rpc('crm_ia_delivery_claim',{p_ids:[waiting.outbox_id]}).length,0,'pending Calendar must not consume a WhatsApp lease');
  assert.equal(sql(`SELECT attempts FROM crm_ia_outbox WHERE id='${waiting.outbox_id}'`),'0');
  assert.equal(sql(`SELECT calendar_appointment_id FROM crm_ia_outbox WHERE id='${waiting.outbox_id}'`),waiting.appointment.id);
  assert.equal(sql(`SELECT appointment_id IS NULL FROM crm_ia_outbox WHERE id='${waiting.outbox_id}'`),'t','principal response must retain conversation source semantics');
  assert.equal(rpc('crm_ia_delivery_claim',{p_ids:[waiting.reminder],p_now:`${date}T23:00Z`}).length,0);
  assert.equal(finishCalendar(waiting).status,'synced');
  let sends=0;
  const delivered=await dispatchCrmIaQueue({db,ids:[waiting.outbox_id],send:async payload=>{sends++;assert.match(payload.body,/reservado/);return{ok:true,messageId:'calendar-receipt'};}});
  assert.equal(delivered.results[0].status,'sent');assert.equal(sends,1);
  const reminderClaims=rpc('crm_ia_delivery_claim',{p_ids:[waiting.reminder],p_now:`${date}T23:00Z`});assert.equal(reminderClaims.length,1);
  assert.equal(rpc('crm_ia_delivery_recheck',{p_id:waiting.reminder,p_claim_token:reminderClaims[0].claim_token}).allowed,true);
  const currentAgent=JSON.parse(sql(`SELECT to_jsonb(a) FROM cliente_atend_ia_agentes a WHERE id='${agent}'`));
  workspace('save_agent',{id:agent,expected_updated_at:currentAgent.updated_at,funil:{...currentAgent.funil,crm_ia:{...currentAgent.funil.crm_ia,audio:{enabled:true,voice:'alloy',speed:1}}}});
  const failed=book();finishCalendar(failed,'failed');
  const fallback=await dispatchCrmIaQueue({db,ids:[failed.outbox_id],generateVoice:async()=>assert.fail('calendar fallback must force text'),send:async payload=>{
   sends++;assert.match(payload.body,/não consegui confirmar/i);assert.doesNotMatch(payload.body,/horário reservado/i);assert.equal(payload.file,undefined);return{ok:true};}});
  assert.equal(fallback.results[0].status,'sent');
  assert.equal(sql(`SELECT ia_pausada FROM cliente_atend_conversas WHERE contact_id='${failed.contact}'`),'t');
  assert.equal(sql(`SELECT status FROM crm_ia_outbox WHERE id='${failed.reminder}'`),'cancelled');
  const before=sends;await dispatchCrmIaQueue({db,ids:[failed.outbox_id],send:async()=>{sends++;}});assert.equal(sends,before);
  for(const status of ['conflict','uncertain']){
   const item=book();finishCalendar(item,status);const claims=rpc('crm_ia_delivery_claim',{p_ids:[item.outbox_id]});assert.equal(claims.length,1,status);
   const target=rpc('crm_ia_delivery_recheck',{p_id:item.outbox_id,p_claim_token:claims[0].claim_token});assert.equal(target.allowed,true);assert.match(target.body,/não consegui confirmar/i);
   if(status==='uncertain'){
    assert.equal(rpc('crm_ia_delivery_finish',{p_id:item.outbox_id,p_claim_token:claims[0].claim_token,p_status:'sent',p_message_id:'honest-fallback'}),true);
    sql(`UPDATE planeje_private.crm_ia_calendar_sync_jobs SET next_attempt_at=clock_timestamp() WHERE appointment_id='${item.appointment.id}'`);
    assert.equal(finishCalendar(item).status,'synced');
    assert.equal(rpc('crm_ia_delivery_claim',{p_ids:[item.outbox_id]}).length,0,'later Google reconciliation must not resend a confirmation');
    assert.match(sql(`SELECT body FROM crm_ia_outbox WHERE id='${item.outbox_id}'`),/não consegui confirmar/i);
   }
  }
  const revised=book();finishCalendar(revised);
  sql(`UPDATE crm_ia_appointments SET updated_at=clock_timestamp(),start_at=start_at+interval '1 hour',end_at=end_at+interval '1 hour' WHERE id='${revised.appointment.id}'`);
  assert.equal(rpc('crm_ia_delivery_claim',{p_ids:[revised.outbox_id]}).length,0);
  assert.equal(sql(`SELECT status FROM crm_ia_outbox WHERE id='${revised.outbox_id}'`),'cancelled');
  for(const change of ['human','inbound']){
   const item=book();finishCalendar(item,'failed');
   if(change==='human')sql(`UPDATE cliente_atend_conversas SET ia_pausada=true,updated_at=clock_timestamp() WHERE contact_id='${item.contact}'`);
   else sql(`INSERT INTO cliente_whatsapp_inbox(cliente_id,whatsapp_config_id,from_jid,chat_jid,body,created_at) VALUES('${client}','${channel}','${item.jid}','${item.jid}','Nova mensagem',clock_timestamp())`);
   assert.equal(rpc('crm_ia_delivery_claim',{p_ids:[item.outbox_id]}).length,0,change);
   assert.equal(sql(`SELECT status FROM crm_ia_outbox WHERE id='${item.outbox_id}'`),'cancelled',change);
   assert.equal(sql(`SELECT calendar_fallback FROM crm_ia_outbox WHERE id='${item.outbox_id}'`),'f','stale context cannot even prepare fallback');
  }
  const revoked=book();sql(`UPDATE profiles SET status='inactive' WHERE id='${admin}'`);
  assert.equal(rpc('crm_ia_delivery_claim',{p_ids:[revoked.outbox_id]}).length,0);assert.equal(sql(`SELECT status FROM crm_ia_outbox WHERE id='${revoked.outbox_id}'`),'cancelled');
  sql(`UPDATE profiles SET status='active' WHERE id='${admin}'`);
  const queue=workspace('queue').rows.find(row=>row.id===waiting.outbox_id);assert.deepEqual(queue.calendar,{required:true,state:'ready',verified:true,reason:'google_receipt_current'});
  assert.equal(workspace('queue').rows.find(row=>row.id===failed.outbox_id).calendar_fallback,true);
  const agenda=workspace('agenda',{since:date,until:date}).rows.find(row=>row.id===waiting.appointment.id);assert.deepEqual(agenda.calendar,{required:true,state:'ready',verified:true,reason:'google_receipt_current'});
  const postClaim=book();finishCalendar(postClaim);const [lease]=rpc('crm_ia_delivery_claim',{p_ids:[postClaim.outbox_id]});assert.ok(lease);
  sql(`UPDATE planeje_private.crm_ia_calendar_connections SET revision=gen_random_uuid() WHERE cliente_id='${client}'`);
  assert.equal(rpc('crm_ia_delivery_recheck',{p_id:lease.id,p_claim_token:lease.claim_token}).allowed,false,'new connection revision invalidates a taken WhatsApp lease');
  assert.equal(sql(`SELECT calendar_fallback FROM crm_ia_outbox WHERE id='${postClaim.outbox_id}'`),'f','a claimed item can never be rewritten as fallback');
  assert.match(sql(`SELECT body FROM crm_ia_outbox WHERE id='${postClaim.outbox_id}'`),/reservado/);
  sql(`UPDATE planeje_private.crm_ia_calendar_busy SET connection_revision=(SELECT revision FROM planeje_private.crm_ia_calendar_connections WHERE cliente_id='${client}')`);
  const tenant=book(),foreignAppointment=id(999);
  sql(`INSERT INTO crm_ia_appointments(id,cliente_id,owner_id,start_at,end_at,busy_start_at,busy_end_at,title,request_id,created_by)
   VALUES('${foreignAppointment}','${context.foreign}','${admin}','${date}T08:00Z','${date}T08:30Z','${date}T08:00Z','${date}T08:30Z','Outro cliente',gen_random_uuid(),'${admin}');`);
  assert.throws(()=>sql(`UPDATE planeje_private.crm_ia_agent_runs SET result=jsonb_set(result,'{appointment,id}','"${foreignAppointment}"') WHERE id='${tenant.run}'`),/calendar_reply_scope/);
  sql(`UPDATE crm_ia_outbox SET calendar_appointment_id='${foreignAppointment}' WHERE id='${tenant.outbox_id}'`);
  assert.equal(rpc('crm_ia_delivery_claim',{p_ids:[tenant.outbox_id]}).length,0,'foreign appointment must never authorize a client message');
  assert.equal(sql(`SELECT status FROM crm_ia_outbox WHERE id='${tenant.outbox_id}'`),'cancelled');
  assert.equal(workspace('queue').rows.find(row=>row.id===tenant.outbox_id).calendar,undefined,'foreign calendar state must not leak through a malformed reference');
  const orphan=book();sql(`UPDATE crm_ia_outbox SET calendar_appointment_id=NULL,calendar_source_updated_at=NULL WHERE id='${orphan.outbox_id}'`);
  assert.equal(rpc('crm_ia_delivery_claim',{p_ids:[orphan.outbox_id]}).length,0,'a queued booking without a verified link must not bypass the receipt');
  for(const name of ['crm_ia_delivery_recheck_pre_calendar(uuid,uuid)','crm_ia_workspace_pre_calendar_delivery(text,uuid,jsonb)'])assert.equal(sql(`SELECT has_function_privilege('authenticated','public.${name}','execute')`),'f');
  const freshAgent=JSON.parse(sql(`SELECT to_jsonb(a) FROM cliente_atend_ia_agentes a WHERE id='${agent}'`));
  workspace('save_agent',{id:agent,expected_updated_at:freshAgent.updated_at,funil:{...freshAgent.funil,crm_ia:{...freshAgent.funil.crm_ia,agendamento:{...freshAgent.funil.crm_ia.agendamento,reminders:Array.from({length:30},(_,i)=>({valor:(i+1)/10,unidade:'horas'}))}}}});
  const blocked=book();
  const normal=id(901),media=id(902);
  sql(`INSERT INTO crm_ia_outbox(id,cliente_id,whatsapp_config_id,contact_id,kind,body,scheduled_at,request_id,created_by,media_descriptor)
   VALUES('${normal}','${client}','${channel}','${context.contact}','manual','Texto humano','${date}T23:00Z',gen_random_uuid(),'${admin}','{}'),
    ('${media}','${client}','${channel}','${context.contact}','manual','Imagem humana','${date}T23:00Z',gen_random_uuid(),'${admin}','{"hash":"fixture-media"}');`);
  const cron=rpc('crm_ia_delivery_claim',{p_now:`${date}T23:01Z`});
  assert.ok(cron.some(row=>row.id===normal),'30 pending Calendar reminders must not starve an unrelated message after LIMIT25');
  assert.ok(!cron.some(row=>row.id===media),'cron cannot take ephemeral media');
  assert.equal(sql(`SELECT sum(attempts) FROM crm_ia_outbox WHERE appointment_id='${blocked.appointment.id}'`),'0');
  assert.equal(rpc('crm_ia_delivery_claim',{p_ids:[media],p_now:`${date}T23:01Z`}).length,1,'explicit endpoint may claim its own ephemeral media');
  const batchIds=Array.from({length:40},(_,i)=>id(1000+i));
  sql(`INSERT INTO crm_ia_outbox(id,cliente_id,whatsapp_config_id,contact_id,kind,body,scheduled_at,request_id,created_by)
   SELECT unnest(ARRAY[${batchIds.map(quote).join(',')}]::uuid[]),'${client}','${channel}','${context.contact}','manual','Concorrência',clock_timestamp(),gen_random_uuid(),'${admin}'`);
  const statement=`BEGIN;SET LOCAL ROLE service_role;SELECT public.crm_ia_delivery_claim(clock_timestamp(),ARRAY[${batchIds.map(quote).join(',')}]::uuid[]);SELECT pg_sleep(0.2);COMMIT;`;
  const outcomes=await Promise.all([1,2].map(()=>promisify(execFile)('psql',[...psql,'-c',statement],{env,encoding:'utf8',timeout:10000})));
  const batches=outcomes.map(output=>JSON.parse(output.stdout.trim()));
  assert.ok(batches.every(rows=>rows.length<=25));assert.equal(batches.flat().length,40);assert.equal(new Set(batches.flat().map(row=>row.id)).size,40,'concurrent claims must be disjoint');
  const localOnly=book();sql(`UPDATE planeje_private.crm_ia_calendar_connections SET status='disconnected' WHERE cliente_id='${client}'`);
  const localLease=rpc('crm_ia_delivery_claim',{p_ids:[localOnly.outbox_id]});assert.equal(localLease.length,1,'an explicit local-only appointment needs no Google receipt');
  assert.equal(rpc('crm_ia_delivery_recheck',{p_id:localOnly.outbox_id,p_claim_token:localLease[0].claim_token}).allowed,true);
  const localState=workspace('queue',{contact_id:localOnly.contact}).rows.find(row=>row.id===localOnly.outbox_id).calendar;
  assert.equal(localState.required,false);assert.equal(localState.verified,false);assert.equal(localState.state,'disconnected');
 }finally{if(started)run('pg_ctl',['-D',data,'-m','immediate','-w','stop']);rmSync(work,{recursive:true,force:true});}
});

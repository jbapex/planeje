import assert from 'node:assert/strict';
import test from 'node:test';
import {spawn,spawnSync,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {dispatchCrmIaQueue,dispatchLegacyCrmIaQueue} from '../../supabase/functions/_shared/crmIaDelivery.js';
const work=mkdtempSync('/tmp/crm-appointments-'),data=join(work,'data'),env={PATH:process.env.PATH,LC_ALL:'C'};
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const ctx=Object.fromEntries(['admin','staff','other','client','foreign','channel','hiddenChannel','contact'].map((key,i)=>[key,id([1,2,3,11,12,21,22,31][i])]));
const {admin,staff,client,channel}=ctx,agent=id(81),pipeline=id(41),stage=id(51),base=id(61);
const quote=v=>v==null?'NULL':typeof v==='number'||typeof v==='boolean'?String(v):`'${String(typeof v==='object'?JSON.stringify(v):v).replaceAll("'","''")}'`;
function run(bin,args,input){const r=spawnSync(bin,args,{input,env,encoding:'utf8',timeout:25000});if(r.status!==0)throw Error(r.stderr||r.error?.message);return r.stdout.trim();}
const psql=['-X','-Aqt','-v','ON_ERROR_STOP=1','-h',work,'-p','55499','-U','appointment_qa','-d','postgres'];
const sql=input=>run('psql',psql,input);
const rpc=(name,args={})=>JSON.parse(sql(`SET ROLE service_role;SELECT to_jsonb(public.${name}(${Object.entries(args).map(([k,v])=>`${k}=>${k==='p_ids'&&Array.isArray(v)?`ARRAY[${v.map(quote).join(',')}]::uuid[]`:quote(v)}`).join(',')}));`));
function human(action,payload={},uid=admin,target=client){
 if(action==='save_conversation'&&!payload.expected_updated_at)payload={...payload,expected_updated_at:JSON.parse(sql(`SELECT to_jsonb(c) FROM cliente_atend_conversas c WHERE cliente_id='${target}' AND contact_id='${payload.contact_id}'`)).updated_at};
 return JSON.parse(sql(`BEGIN;SET LOCAL ROLE authenticated;SET LOCAL test.uid='${uid}';SELECT public.crm_ia_workspace('${action}','${target}',${quote(payload)});COMMIT;`));
}
const db={async rpc(name,args){try{return{data:rpc(name,args),error:null};}catch(error){return{data:null,error:{message:error.message}};}}};
db.from=table=>{
 let fields='*',single=false,patch=null,insert=null,order='',limit='';const filters=[];
 const query={select(value='*'){fields=value;return query;},eq(key,value){filters.push(`${key}=${quote(value)}`);return query;},is(key,value){filters.push(`${key} IS ${value===null?'NULL':quote(value)}`);return query;},
  in(key,values){filters.push(`${key} IN (${values.map(quote).join(',')})`);return query;},or(value){filters.push('('+value.split(',').map(part=>{const[key,,...text]=part.split('.');return `${key}=${quote(text.join('.'))}`;}).join(' OR ')+')');return query;},
  order(key,options={}){order=` ORDER BY ${key} ${options.ascending===false?'DESC':'ASC'}`;return query;},limit(n){limit=` LIMIT ${n}`;return query;},maybeSingle(){single=true;return query;},insert(value){insert=value;return query;},update(value){patch=value;return query;},then(resolve,reject){
   try{const where=filters.length?' WHERE '+filters.join(' AND '):'';
    if(insert)sql(`INSERT INTO ${table}(${Object.keys(insert).join(',')}) VALUES(${Object.values(insert).map(quote).join(',')})`);
    if(patch)sql(`UPDATE ${table} SET ${Object.entries(patch).map(([key,value])=>`${key}=${quote(value)}`).join(',')}${where}`);
    const rows=patch||insert?[]:JSON.parse(sql(`SELECT coalesce(json_agg(t),'[]') FROM(SELECT ${fields} FROM ${table}${where}${order}${limit}) t`));return Promise.resolve({data:single?rows[0]||null:rows,error:null}).then(resolve,reject);
   }catch(error){return Promise.resolve({data:null,error:{message:error.message}}).then(resolve,reject);}
  }};return query;
};
const calendar=(action,payload={})=>rpc('crm_ia_calendar_service',{p_action:action,p_payload:payload});
let sequence=0,sourceSeq=0;
const row=(table,key)=>JSON.parse(sql(`SELECT to_jsonb(t) FROM ${table} t WHERE id=${quote(key)}`));
function fixture({past=false}={}){
 const n=++sequence,contact=id(100+n),lead=id(200+n),appointment=id(300+n),jid=`5511999${String(n).padStart(5,'0')}@s.whatsapp.net`;
 sql(`INSERT INTO cliente_whatsapp_contact(id,cliente_id,from_jid,phone,sender_name,whatsapp_config_id) VALUES('${contact}','${client}','${jid}',split_part('${jid}','@',1),'Contato ${n}','${channel}');
 INSERT INTO leads(id,cliente_id,nome,whatsapp,pipeline_id,stage_id,crm_ia_contact_id,responsavel_id) VALUES('${lead}','${client}','Lead ${n}',split_part('${jid}','@',1),'${pipeline}','${stage}','${contact}','${admin}');
 INSERT INTO cliente_atend_conversas(cliente_id,contact_id,status,ia_pausada,crm_ia_runtime) VALUES('${client}','${contact}','esperando',false,'{"active":true}');
 INSERT INTO crm_ia_appointments(id,cliente_id,lead_id,contact_id,owner_id,start_at,end_at,busy_start_at,busy_end_at,title,request_id,created_by)
 VALUES('${appointment}','${client}','${lead}','${contact}','${admin}',${past?"clock_timestamp()-interval '2 hours'":`current_date+${n+2}+time '12:00'`},${past?"clock_timestamp()-interval '1 hour'":`current_date+${n+2}+time '12:30'`},${past?"clock_timestamp()-interval '2 hours'":`current_date+${n+2}+time '12:00'`},${past?"clock_timestamp()-interval '1 hour'":`current_date+${n+2}+time '12:30'`},'Consulta ${n}','${id(400+n)}','${staff}');`);
 return{contact,lead,appointment,jid,initial:row('crm_ia_appointments',appointment)};
}
function incoming(c,text,{time='valid',audio=false,transcript=null}={}){
 const message=`message-${++sourceSeq}`;
 const source=JSON.parse(sql(`WITH stamp AS(SELECT clock_timestamp() t),ins AS(INSERT INTO cliente_whatsapp_inbox(cliente_id,whatsapp_config_id,from_jid,chat_jid,body,type,message_id,msg_timestamp,created_at,raw_payload)
 SELECT '${client}','${channel}','${c.jid}','${c.jid}',${quote(audio?'[Áudio]':text)},'${audio?'audio':'text'}','${message}',${time==='historical'?"t-interval '1 hour'":'t'},t,
 ${time==='missing'?"'{}'::jsonb":time==='invalid'?"'{\"timestamp\":\"invalid\"}'::jsonb":time==='ambiguous'?"jsonb_build_object('messageTimestamp',extract(epoch from t)*1000,'timestamp',extract(epoch from t-interval '1 hour'))":`jsonb_build_object('messageTimestamp',extract(epoch from ${time==='historical'?"t-interval '1 hour'":'t'})*1000)`} FROM stamp RETURNING *)SELECT to_jsonb(ins) FROM ins;`));
 sql(`UPDATE cliente_atend_conversas SET status='esperando',updated_at=clock_timestamp(),crm_ia_runtime=crm_ia_runtime||jsonb_build_object('last_inbound_id','${message}','last_inbound_channel','${channel}') WHERE contact_id='${c.contact}';
 UPDATE cliente_whatsapp_contact SET last_message_at=${quote(source.created_at)} WHERE id='${c.contact}';`);
 if(transcript!==null)sql(`INSERT INTO planeje_private.crm_ia_audio_inputs(inbox_id,cliente_id,channel_id,contact_id,agent_id,message_id,snapshot,status,transcript)
 VALUES('${source.id}','${client}','${channel}','${c.contact}','${agent}','${message}','{}','completed',${quote(transcript)})`);
 return source;
}
function begin(c,source,{mode='responder',message=source.message_id,purpose=null}={}){
 const current=row('cliente_atend_ia_agentes',agent),conversation=JSON.parse(sql(`SELECT to_jsonb(t) FROM cliente_atend_conversas t WHERE contact_id='${c.contact}'`)),lead=row('leads',c.lead),config=JSON.parse(sql(`SELECT to_jsonb(t) FROM crm_ia_config t WHERE cliente_id='${client}'`));
 return rpc('crm_ia_agent_begin',{p_client:client,p_channel:channel,p_contact:c.contact,p_lead:c.lead,p_agent:agent,p_mode:mode,p_message:message,
 p_expected:{actor_id:admin,config_revision:config.revision,agent_updated_at:current.updated_at,lead_updated_at:lead.updated_at,conversation_updated_at:conversation.updated_at,concierge:true,last_text:'NÃO CONFIAR NO MODELO',source_inbox_id:source.id,source_message_id:source.message_id,source_message_type:source.type,...(purpose?{purpose}: {})}});
}
function propose(c,operation='cancel',times={}){
 const source=incoming(c,'Quero alterar meu compromisso'),job=begin(c,source);assert.equal(job.claimed,true);
 const result=rpc('crm_ia_apply_agent_action',{p_run:job.id,p_action:{type:'appointment_propose',operation,appointment_id:c.appointment,...times},p_reply:'Modelo não confirma nada',p_followup:{}});
 const proposal=JSON.parse(sql(`SELECT crm_ia_runtime->'pending_appointment_action' FROM cliente_atend_conversas WHERE contact_id='${c.contact}'`));
 return{job,result,proposal};
}
async function sent(question){const batch=await dispatchCrmIaQueue({db,ids:[question.result.outbox_id],send:async()=>({ok:true,messageId:`question-${sourceSeq}`})});assert.equal(batch.results[0].status,'sent');}
function apply(c,proposal,source){const job=begin(c,source);if(!job.claimed)return{...job,job};return{...rpc('crm_ia_apply_agent_action',{p_run:job.id,p_action:{type:'appointment_apply',confirmation_id:proposal.id},p_reply:'ignorado',p_followup:{}}),job};}
function recovery(c){const conv=JSON.parse(sql(`SELECT to_jsonb(c) FROM cliente_atend_conversas c WHERE contact_id='${c.contact}'`)),m=conv.crm_ia_runtime.no_show;return begin(c,{id:null,message_id:null,type:null},{mode:'followup',message:`no-show:${m.appointment_id}:${m.appointment_updated_at}:1`,purpose:'no_show'});}
function receipt(c,status='synced'){
 const job=calendar('claim',{limit:50}).find(j=>j.id===c.appointment);assert.ok(job,'Calendar owns the current version');
 return calendar('finish',{id:job.id,lease:job.lease,status,...(['synced','cancelled'].includes(status)?{receipt:{event_id:job.event_id,calendar_id:job.calendar_id,etag:'fixture-current',http_status:status==='cancelled'?204:201}}:{error_code:'fixture_failure'})});
}

test('ações existentes exigem confirmação real e preservam identidade/escopo',async t=>{
 let started=false;
 try{
  run('initdb',['-D',data,'-U','appointment_qa','--auth-local=trust','--auth-host=reject','--no-locale','--encoding=UTF8']);
  run('pg_ctl',['-D',data,'-l',join(work,'pg.log'),'-o',`-k ${work} -p 55499 -c listen_addresses='' -c unix_socket_permissions=0700`,'-w','start']);started=true;
  const f=readFileSync(new URL('./workspace.database.test.mjs',import.meta.url),'utf8').split('    sql(`')[1].split('    `);')[0].replace(/\$\{(\w+)\}/g,(_,name)=>ctx[name]);sql(f.replace(/      CREATE TABLE public\.crm_ia_outbox\([^\n]+\n/,''));
  sql(`CREATE SCHEMA planeje_private;CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid);CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS $$SELECT jsonb_build_object('sub',auth.uid())$$;
   ALTER TABLE cliente_whatsapp_contact ADD COLUMN last_message_at timestamptz,ADD COLUMN origin_source text DEFAULT 'nao_identificado',ADD COLUMN qualificado boolean;
   ALTER TABLE leads ADD COLUMN qualificado boolean;ALTER TABLE cliente_atend_conversas ADD COLUMN ia_followup_passo integer DEFAULT 0;ALTER TABLE cliente_whatsapp_sent ADD COLUMN sent_by uuid;
   CREATE TABLE atendimento_conversas(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cliente_id uuid,whatsapp_config_id uuid,chat_jid text,archived_at timestamptz,bloqueada boolean DEFAULT false,is_group boolean DEFAULT false,display_name text,status text DEFAULT 'aguardando',fila_id uuid,assigned_to uuid,last_message_at timestamptz,last_customer_message_at timestamptz,awaiting_response_since timestamptz,unread_count integer DEFAULT 0,last_message_preview text,profile_pic_url text,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now(),UNIQUE(cliente_id,whatsapp_config_id,chat_jid));
   CREATE TABLE atendimento_conversa_planejamento(id uuid PRIMARY KEY,cliente_id uuid,conversation_id uuid,whatsapp_config_id uuid,chat_jid text,kind text,body text,status text,scheduled_at timestamptz,completed_at timestamptz,error_message text,updated_at timestamptz DEFAULT now());GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;`);
  sql(readFileSync(new URL('../../supabase/migrations/20260928230000_cliente_atend_inbox.sql', import.meta.url), 'utf8').match(/create or replace function public\.cliente_atend_touch_updated_at\([\s\S]*?\$\$;/i)[0]);
    sql('CREATE TRIGGER cliente_atend_conversas_touch BEFORE UPDATE ON public.cliente_atend_conversas FOR EACH ROW EXECUTE FUNCTION public.cliente_atend_touch_updated_at()');
    for (const file of ['20261111041703_crm_ia_delivery_runtime.sql','20261111041704_crm_ia_workspace.sql','20261111043800_crm_ia_workspace_readings.sql','20261111044652_crm_ia_agent_runtime.sql','20261111062101_crm_ia_calendar.sql','20261111062548_crm_ia_voice.sql','20261111072502_crm_ia_calendar_delivery.sql','20261111075558_crm_ia_agent_template_contract.sql','20261111090001_crm_ia_appointment_actions.sql','20261111090002_crm_ia_agent_drafts_voice_modes.sql','20261111090003_crm_ia_lead_tags.sql','20261111101501_crm_ia_lead_profiles.sql','20261111101502_crm_ia_lead_reads.sql','20261111120001_crm_ia_internal_notifications.sql','20261111120002_crm_ia_conversation_controls.sql','20261111162400_crm_ia_conversation_read_performance.sql'])sql(readFileSync(new URL(`../../supabase/migrations/${file}`,import.meta.url),'utf8'));
  sql(`INSERT INTO crm_pipelines(id,cliente_id,nome) VALUES('${pipeline}','${client}','Funil');INSERT INTO crm_stages(id,pipeline_id,nome) VALUES('${stage}','${pipeline}','Atendimento');
   INSERT INTO cliente_atend_ia_bases(id,cliente_id,nome,conteudo,created_by) VALUES('${base}','${client}','Concierge','Informações sintéticas','${admin}');
   INSERT INTO crm_ia_config(cliente_id,data,updated_by) VALUES('${client}',${quote({attendance:{auto_send:true},concierge:{enabled:true,mode:'always',base_id:base,appointment_confirm:true,appointment_reschedule:true,appointment_cancel:true,no_show_recovery:true,no_show_delay_minutes:0,no_show_expire_hours:24},availability:{timezone:'America/Sao_Paulo',duration_minutes:30,interval_minutes:30,min_notice_hours:0,horizon_days:60,max_per_day:100,windows:[{owner_id:admin,days:[0,1,2,3,4,5,6],start:'08:00',end:'22:00'}]}})},'${admin}');
   INSERT INTO cliente_atend_ia_agentes(id,cliente_id,nome,ativo,auto_responder,created_by,funil) VALUES('${agent}','${client}','Concierge',true,true,'${admin}',${quote({crm_ia:{tipo:'agendamento',pipeline_id:pipeline,stage_ids:[stage],idiomas:['pt'],agendamento:{owner_id:admin,duration_minutes:30,interval_minutes:30,reminders:[{valor:1,unidade:'horas'}]}}})});`);
  await t.test('só um sim novo depois de pergunta SENT pode cancelar e replay conserva resultado',async()=>{
   const c=fixture(),q=propose(c);assert.equal(row('crm_ia_appointments',c.appointment).status,'scheduled');await sent(q);
   const result=apply(c,q.proposal,incoming(c,'Sim'));assert.equal(result.action,'appointment_cancel');
   const updated=row('crm_ia_appointments',c.appointment);assert.equal(updated.status,'cancelled');
   for(const field of ['id','request_id','created_by','owner_id'])assert.equal(updated[field],c.initial[field],field);
   assert.deepEqual(rpc('crm_ia_apply_agent_action',{p_run:result.job.id,p_action:{type:'appointment_apply',confirmation_id:q.proposal.id},p_reply:'replay'}).outbox_id,result.outbox_id);
  });
  await t.test('pergunta pendente, negativo, histórico, timestamp ausente/inválido/ambíguo e áudio sem ASR não alteram',async()=>{
   for(const [text,options,send] of [['Sim',{},false],['Não cancele',{},true],['Talvez',{},true],['Sim',{time:'historical'},true],['Sim',{time:'missing'},true],['Sim',{time:'invalid'},true],['Sim',{time:'ambiguous'},true],['Sim',{audio:true},true]]){
    const c=fixture(),q=propose(c);if(send)await sent(q);apply(c,q.proposal,incoming(c,text,options));assert.equal(row('crm_ia_appointments',c.appointment).status,'scheduled',JSON.stringify([text,options,send]));
   }
   const c=fixture(),q=propose(c);await sent(q);const result=apply(c,q.proposal,incoming(c,'[Áudio]',{audio:true,transcript:'Sim'}));assert.equal(result.action,'appointment_cancel');
  });
  await t.test('remarcação usa slots excluindo só o original e conserva request/creator/owner',async()=>{
   const c=fixture(),day=c.initial.start_at.slice(0,10),slots=rpc('crm_ia_appointment_slots',{p_client:client,p_channel:channel,p_contact:c.contact,p_lead:c.lead,p_agent:agent,p_actor:admin,p_appointment:c.appointment,p_date:day,p_expected:c.initial.updated_at});
   assert.ok(slots.rows.some(s=>s.start_at===c.initial.start_at),'old appointment is excluded from collision checks');
   const chosen=slots.rows.find(s=>new Date(s.start_at).getTime()!==new Date(c.initial.start_at).getTime());assert.ok(chosen);
   const q=propose(c,'reschedule',{start_at:chosen.start_at,end_at:chosen.end_at});await sent(q);const result=apply(c,q.proposal,incoming(c,'Confirmo remarcar'));
   assert.equal(result.action,'appointment_reschedule');const updated=row('crm_ia_appointments',c.appointment);assert.equal(new Date(updated.start_at).getTime(),new Date(chosen.start_at).getTime());
   for(const field of ['id','request_id','created_by','owner_id'])assert.equal(updated[field],c.initial[field]);
   const blocked=slots.rows.find(s=>new Date(s.start_at).getTime()!==new Date(chosen.start_at).getTime());
   const other=fixture();sql(`UPDATE crm_ia_appointments SET start_at=${quote(blocked.start_at)},end_at=${quote(blocked.end_at)},busy_start_at=${quote(blocked.start_at)},busy_end_at=${quote(blocked.end_at)},updated_at=clock_timestamp() WHERE id='${other.appointment}'`);
   const available=rpc('crm_ia_appointment_slots',{p_client:client,p_channel:channel,p_contact:c.contact,p_lead:c.lead,p_agent:agent,p_actor:admin,p_appointment:c.appointment,p_date:day,p_expected:updated.updated_at});assert.equal(available.rows.some(s=>new Date(s.start_at).getTime()===new Date(blocked.start_at).getTime()),false,'only the original is excluded, not another contact booking');
  });
  await t.test('marcação humana no_show após término arma uma tentativa e preserva pausa/versão',()=>{
   const c=fixture({past:true});sql(`UPDATE leads SET agendamento=${quote(c.initial.start_at)},proxima_acao=${quote(c.initial.start_at)} WHERE id='${c.lead}'`);const result=human('mark_appointment_no_show',{id:c.appointment,expected_updated_at:c.initial.updated_at,channel_id:channel});
   assert.equal(result.status,'no_show');assert.equal(result.recovery.armed,true);
   assert.equal(row('leads',c.lead).agendamento,null);assert.equal(row('leads',c.lead).proxima_acao,null);
   assert.equal(human('mark_appointment_no_show',{id:c.appointment,expected_updated_at:result.updated_at,channel_id:channel}).updated_at,result.updated_at,'repeat is idempotent');
   const conv=JSON.parse(sql(`SELECT to_jsonb(c) FROM cliente_atend_conversas c WHERE contact_id='${c.contact}'`));assert.equal(conv.crm_ia_runtime.no_show.appointment_id,c.appointment);
   const source=incoming(c,'Nova resposta');const before=begin(c,source,{mode:'followup',message:`no-show:${c.appointment}:${result.updated_at}:1`,purpose:'no_show'});assert.equal(before.claimed,false,'new inbound cancels recovery');
   const future=fixture();assert.throws(()=>human('mark_appointment_no_show',{id:future.appointment,expected_updated_at:future.initial.updated_at,channel_id:channel}),/término|encerr|termin|fim/i);
  });
  await t.test('recuperação de ausência tem propósito próprio, sem modelo nem nova reserva e uma só outbox',async()=>{
   const c=fixture({past:true}),mark=human('mark_appointment_no_show',{id:c.appointment,expected_updated_at:c.initial.updated_at,channel_id:channel});assert.equal(mark.recovery.armed,true);
   const job=recovery(c);assert.equal(job.claimed,true);const queued=rpc('crm_ia_apply_agent_action',{p_run:job.id,p_action:{type:'no_show_recover'},p_reply:'Não usar',p_followup:{}});
   const item=row('crm_ia_outbox',queued.outbox_id);assert.equal(item.kind,'followup');assert.equal(item.appointment_id,null);assert.equal(item.calendar_appointment_id,null);
   assert.equal(rpc('crm_ia_apply_agent_action',{p_run:job.id,p_action:{type:'no_show_recover'},p_reply:'replay'}).outbox_id,queued.outbox_id);
   let sends=0;const sent=await dispatchCrmIaQueue({db,ids:[item.id],send:async payload=>{sends++;assert.match(payload.body,/novo horário/);return{ok:true};}});assert.equal(sent.results[0].status,'sent');
   await dispatchCrmIaQueue({db,ids:[item.id],send:async()=>{sends++;return{ok:true};}});assert.equal(sends,1);assert.equal(row('crm_ia_appointments',c.appointment).status,'no_show');
   assert.equal(human('mark_appointment_no_show',{id:c.appointment,expected_updated_at:mark.updated_at,channel_id:channel}).recovery.armed,false);
  });
  await t.test('ausência opt-in, pausa, nova resposta, expiração, revogação e mudança da fonte cancelam antes de transporte',async()=>{
   for(const mutation of ['human','inbound','expiry','actor','appointment','config']){
    const c=fixture({past:true});human('mark_appointment_no_show',{id:c.appointment,expected_updated_at:c.initial.updated_at,channel_id:channel});const job=recovery(c);assert.equal(job.claimed,true);
    const queued=rpc('crm_ia_apply_agent_action',{p_run:job.id,p_action:{type:'no_show_recover'},p_reply:'',p_followup:{}});
    if(mutation==='human')human('save_conversation',{contact_id:c.contact,channel_id:channel,attendance:'human'});
    if(mutation==='inbound')incoming(c,'Olá');
    if(mutation==='expiry')sql(`UPDATE cliente_atend_conversas SET crm_ia_runtime=jsonb_set(crm_ia_runtime,'{no_show,expires_at}',to_jsonb(clock_timestamp()-interval '1 second')) WHERE contact_id='${c.contact}'`);
    if(mutation==='actor')sql(`UPDATE profiles SET status='inactive' WHERE id='${admin}'`);
    if(mutation==='appointment')sql(`UPDATE crm_ia_appointments SET status='cancelled',updated_at=clock_timestamp() WHERE id='${c.appointment}'`);
    if(mutation==='config')sql(`UPDATE crm_ia_config SET revision=gen_random_uuid() WHERE cliente_id='${client}'`);
    const batch=await dispatchCrmIaQueue({db,ids:[queued.outbox_id],send:async()=>assert.fail('stale recovery must never send')});assert.equal(batch.processed,0,mutation);assert.equal(row('crm_ia_outbox',queued.outbox_id).status,'cancelled');
    if(mutation==='actor')sql(`UPDATE profiles SET status='active' WHERE id='${admin}'`);
   }
   sql(`UPDATE crm_ia_config SET data=jsonb_set(data,'{concierge,no_show_recovery}','false') WHERE cliente_id='${client}'`);
   const disabled=fixture({past:true});assert.equal(human('mark_appointment_no_show',{id:disabled.appointment,expected_updated_at:disabled.initial.updated_at,channel_id:channel}).recovery.armed,false);
   sql(`UPDATE crm_ia_config SET data=jsonb_set(data,'{concierge,no_show_recovery}','true') WHERE cliente_id='${client}'`);
   const paused=fixture({past:true});human('save_conversation',{contact_id:paused.contact,channel_id:channel,attendance:'human'});assert.equal(human('mark_appointment_no_show',{id:paused.appointment,expected_updated_at:paused.initial.updated_at,channel_id:channel}).recovery.armed,false);
   const revoked=fixture({past:true});human('mark_appointment_no_show',{id:revoked.appointment,expected_updated_at:revoked.initial.updated_at,channel_id:channel});
   sql(`UPDATE crm_ia_config SET data=jsonb_set(data,'{concierge,no_show_recovery}','false') WHERE cliente_id='${client}'`);
   assert.ok(rpc('crm_ia_legacy_delivery_recover').no_show_cancelled>=1,'revoked jobs yield the due selection before intake');assert.equal(sql(`SELECT ia_followup_due_at IS NULL FROM cliente_atend_conversas WHERE contact_id='${revoked.contact}'`),'t');
   sql(`UPDATE crm_ia_config SET data=jsonb_set(data,'{concierge,no_show_recovery}','true') WHERE cliente_id='${client}'`);
  });
  await t.test('recover expirado não apaga uma nova marcação humana que venceu o lock da conversa',async()=>{
   const c=fixture({past:true});human('mark_appointment_no_show',{id:c.appointment,expected_updated_at:c.initial.updated_at,channel_id:channel});
   sql(`UPDATE cliente_atend_conversas SET crm_ia_runtime=jsonb_set(crm_ia_runtime,'{no_show,expires_at}',to_jsonb(clock_timestamp()-interval '1 second')) WHERE contact_id='${c.contact}'`);
   const next=JSON.parse(sql(`INSERT INTO crm_ia_appointments(cliente_id,contact_id,lead_id,owner_id,created_by,request_id,start_at,end_at,busy_start_at,busy_end_at,title)
    SELECT cliente_id,contact_id,lead_id,owner_id,created_by,gen_random_uuid(),clock_timestamp()-interval '4 hours',clock_timestamp()-interval '3 hours',clock_timestamp()-interval '4 hours',clock_timestamp()-interval '3 hours','Outro compromisso passado'
    FROM crm_ia_appointments WHERE id='${c.appointment}' RETURNING to_jsonb(crm_ia_appointments)`));
   const arm=spawn('psql',psql,{env:{...env,PGAPPNAME:'appointment-rearm'},stdio:['pipe','pipe','pipe']});let output='',errors='';
   arm.stdout.on('data',chunk=>{output+=chunk;});arm.stderr.on('data',chunk=>{errors+=chunk;});
   const finished=new Promise((resolve,reject)=>{arm.on('error',reject);arm.on('exit',code=>code===0?resolve():reject(new Error(errors||`psql ${code}`)));});
   const until=async predicate=>{for(let i=0;i<100;i++){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,20));}assert.fail('database synchronization did not become observable');};
   let cleanup;
   try{
    arm.stdin.write(`BEGIN;SET LOCAL ROLE authenticated;SET LOCAL test.uid='${admin}';SELECT crm_ia_workspace('mark_appointment_no_show','${client}',${quote({id:next.id,expected_updated_at:next.updated_at,channel_id:channel})});SELECT 'rearm-ready';\n`);
    await until(()=>output.includes('rearm-ready'));
    cleanup=promisify(execFile)('psql',[...psql,'-c','SET ROLE service_role;SELECT crm_ia_legacy_delivery_recover();'],{env:{...env,PGAPPNAME:'appointment-expired-cleanup'},encoding:'utf8',timeout:10000});
    await until(()=>sql("SELECT count(*) FROM pg_stat_activity WHERE application_name='appointment-expired-cleanup' AND wait_event_type='Lock'")==='1');
    arm.stdin.end('COMMIT;\n');await Promise.all([finished,cleanup]);
    const current=JSON.parse(sql(`SELECT to_jsonb(c) FROM cliente_atend_conversas c WHERE contact_id='${c.contact}'`));assert.equal(current.crm_ia_runtime.no_show.appointment_id,next.id);
    assert.notEqual(current.ia_followup_due_at,null,'CAS must preserve a newer valid recovery instead of clearing its due');assert.equal(current.ia_followup_delivery_state,'pending');
   }finally{if(arm.exitCode===null){arm.stdin.end('ROLLBACK;\n');await finished;}if(cleanup)await cleanup;}
  });
  await t.test('escopo do serviço, canais, responsável do lead e APIs privadas não ampliam acesso',()=>{
   const c=fixture();
   assert.equal(rpc('crm_ia_appointment_context',{p_client:ctx.foreign,p_channel:channel,p_contact:c.contact,p_lead:c.lead,p_actor:admin}).rows.length,0);
   assert.equal(rpc('crm_ia_appointment_context',{p_client:client,p_channel:ctx.hiddenChannel,p_contact:c.contact,p_lead:c.lead,p_actor:admin}).rows.length,0);
   sql(`INSERT INTO user_module_access VALUES('${staff}','crm','responsible');UPDATE cliente_atend_conversas SET assigned_to='${staff}' WHERE contact_id='${c.contact}'`);
   assert.equal(rpc('crm_ia_appointment_context',{p_client:client,p_channel:channel,p_contact:c.contact,p_lead:c.lead,p_actor:staff}).rows.length,0,'assigned conversation alone does not grant another lead');
   sql(`UPDATE leads SET responsavel_id='${staff}' WHERE id='${c.lead}'`);
   assert.equal(rpc('crm_ia_appointment_context',{p_client:client,p_channel:channel,p_contact:c.contact,p_lead:c.lead,p_actor:staff}).rows.length,1);
   assert.throws(()=>sql(`SET ROLE authenticated;SELECT crm_ia_appointment_context('${client}','${channel}','${c.contact}','${c.lead}','${admin}')`),/permission denied/);
   sql(`DELETE FROM user_module_access WHERE user_id='${staff}'`);
  });
  await t.test('origem contraditória, canal trocado e ASR de outra origem não provam sim',async()=>{
   for(const mutation of ['jid','channel','asr']){
    const c=fixture(),q=propose(c);await sent(q);const source=incoming(c,'Sim',{audio:mutation==='asr',transcript:mutation==='asr'?'Sim':null});
    if(mutation==='jid')sql(`UPDATE cliente_whatsapp_inbox SET chat_jid='5511000000001@s.whatsapp.net' WHERE id='${source.id}'`);
    if(mutation==='channel')sql(`UPDATE cliente_whatsapp_inbox SET whatsapp_config_id='${ctx.hiddenChannel}' WHERE id='${source.id}'`);
    if(mutation==='asr')sql(`UPDATE planeje_private.crm_ia_audio_inputs SET channel_id='${ctx.hiddenChannel}' WHERE inbox_id='${source.id}'`);
    if(mutation==='asr')assert.equal(apply(c,q.proposal,source).action,'answer');else assert.throws(()=>apply(c,q.proposal,source),/source_required/);
    assert.equal(row('crm_ia_appointments',c.appointment).status,'scheduled');
   }
  });
  await t.test('pergunta expirada, intervenção humana, CAS e compromissos indistinguíveis nunca alteram agenda',async()=>{
   const expiry=fixture(),q=propose(expiry);sql(`UPDATE cliente_atend_conversas SET crm_ia_runtime=jsonb_set(crm_ia_runtime,'{pending_appointment_action,expires_at}',to_jsonb(clock_timestamp()-interval '1 second')) WHERE contact_id='${expiry.contact}'`);
   assert.equal((await dispatchCrmIaQueue({db,ids:[q.result.outbox_id],send:async()=>assert.fail('expired question')})).processed,0);
   for(const mutation of ['human','source']){
    const c=fixture(),q=propose(c);await sent(q);
    if(mutation==='human'){human('save_conversation',{contact_id:c.contact,channel_id:channel,attendance:'human'});human('save_conversation',{contact_id:c.contact,channel_id:channel,attendance:'ai'});}
    else sql(`UPDATE crm_ia_appointments SET title='Revisado',updated_at=clock_timestamp() WHERE id='${c.appointment}'`);
    apply(c,q.proposal,incoming(c,'Sim'));assert.equal(row('crm_ia_appointments',c.appointment).status,'scheduled');
   }
   const c=fixture();sql(`INSERT INTO crm_ia_appointments(cliente_id,lead_id,contact_id,owner_id,start_at,end_at,busy_start_at,busy_end_at,title,request_id,created_by) SELECT cliente_id,lead_id,contact_id,'${staff}',start_at,end_at,busy_start_at,busy_end_at,title,gen_random_uuid(),created_by FROM crm_ia_appointments WHERE id='${c.appointment}'`);
   assert.throws(()=>propose(c),/ambiguous/);
  });
  await t.test('agenda aplica data civil BRT, resumo completo e paginação antes de enriquecer Calendar',()=>{
   const c=fixture();sql(`UPDATE crm_ia_appointments SET start_at='2030-02-03T02:30Z',end_at='2030-02-03T03:00Z' WHERE id='${c.appointment}'`);
   const day=human('agenda',{since:'2030-02-02',until:'2030-02-02',limit:1});assert.equal(day.total,1);assert.equal(day.rows[0].id,c.appointment);assert.equal(day.summary.scheduled,1);assert.equal(day.rows[0].calendar.required,false);
   assert.equal(human('agenda',{since:'2030-02-03',until:'2030-02-03'}).rows.some(a=>a.id===c.appointment),false);
   const all=human('agenda',{since:'2026-11-01',until:'2027-02-01',limit:1}),next=human('agenda',{since:'2026-11-01',until:'2027-02-01',limit:1,offset:1});assert.ok(all.total>1);assert.deepEqual(all.summary,next.summary);assert.equal(Object.values(all.summary).reduce((a,b)=>a+b,0),all.total);
  });
  await t.test('runtime real gera proposta/apply e fonte registrada; recuperação usa o mesmo runner sem modelo',async()=>{
   const output=join(work,'runtime.mjs');await build({entryPoints:['supabase/functions/_shared/crmIaRuntime.ts'],outfile:output,bundle:true,format:'esm',platform:'node'});const {runCrmIaAgent}=await import(pathToFileURL(output));
   const c=fixture(),source=incoming(c,'Quero cancelar o compromisso');
   const execute=(c,messageId,mode,action)=>runCrmIaAgent({db,clientId:client,channelId:channel,contactId:c.contact,messageId,mode,refreshCalendar:async()=>({required:false,fresh:true}),callModel:async()=>({resposta:JSON.stringify({text:'Não é consentimento',action})})});
   const proposal=await execute(c,source.message_id,'responder',{type:'appointment_propose',operation:'cancel',appointment_id:c.appointment});assert.equal(proposal.action,'appointment_propose');
   const run=row('planeje_private.crm_ia_agent_runs',sql(`SELECT agent_run_id FROM crm_ia_outbox WHERE id='${proposal.outbox_id}'`));assert.equal(run.snapshot.source_inbox_id,source.id);
   assert.equal(JSON.parse(sql(`SELECT crm_ia_runtime FROM cliente_atend_conversas WHERE contact_id='${c.contact}'`)).source_message_id,source.message_id);
   await sent({result:proposal});const yes=incoming(c,'Sim'),result=await execute(c,yes.message_id,'responder',{type:'appointment_apply',confirmation_id:proposal.confirmation_id});assert.equal(result.action,'appointment_cancel');
   const missed=fixture({past:true});human('mark_appointment_no_show',{id:missed.appointment,expected_updated_at:missed.initial.updated_at,channel_id:channel});const marker=JSON.parse(sql(`SELECT crm_ia_runtime->'no_show' FROM cliente_atend_conversas WHERE contact_id='${missed.contact}'`));
   const recovered=await runCrmIaAgent({db,clientId:client,channelId:channel,contactId:missed.contact,mode:'followup',messageId:`no-show:${marker.appointment_id}:${marker.appointment_updated_at}:1`,callModel:async()=>assert.fail('recovery cannot call model'),refreshCalendar:async()=>assert.fail('no new reservation')});assert.equal(recovered.action,'no_show_recover');
  });
  await t.test('concorrência serializa o mesmo consentimento e duas claims preservam envio único',async()=>{
   const c=fixture(),q=propose(c);await sent(q);const job=begin(c,incoming(c,'Sim')),query=`SET ROLE service_role;SELECT crm_ia_apply_agent_action('${job.id}','${JSON.stringify({type:'appointment_apply',confirmation_id:q.proposal.id})}','ignorado','{}');`;
   const invoke=()=>promisify(execFile)('psql',[...psql,'-c',query],{env,encoding:'utf8',timeout:25000});const results=await Promise.all([invoke(),invoke()]);const queued=results.map(r=>JSON.parse(r.stdout.trim()));assert.equal(queued[0].outbox_id,queued[1].outbox_id);
   let sends=0;const deliveries=await Promise.all([1,2].map(()=>dispatchCrmIaQueue({db,ids:[queued[0].outbox_id],send:async()=>{sends++;await new Promise(resolve=>setImmediate(resolve));return{ok:true};}})));assert.equal(sends,1);assert.equal(deliveries.reduce((n,r)=>n+r.processed,0),1);
  });
  await t.test('cancelamento aguarda DELETE atual; confirmação/remarcação esperam sync e falha usa texto honesto uma vez',async()=>{
   sql(`INSERT INTO planeje_private.crm_ia_calendar_connections(cliente_id,owner_id,encrypted_token,calendar_id,calendar_name,status,access_role,time_zone) VALUES('${client}','${admin}','fixture-only','calendar-fixture','Agenda QA','connected','owner','America/Sao_Paulo');
    INSERT INTO planeje_private.crm_ia_calendar_busy(connection_id,connection_revision,since_at,until_at,busy,expires_at) SELECT id,revision,current_date,current_date+100,'[]',clock_timestamp()+interval '10 minutes' FROM planeje_private.crm_ia_calendar_connections`);
   for(const operation of ['cancel','confirm']){
    const c=fixture(),q=propose(c,operation);await sent(q);const result=apply(c,q.proposal,incoming(c,'Sim'));
    assert.equal(result.action,`appointment_${operation}`);assert.equal(rpc('crm_ia_delivery_claim',{p_ids:[result.outbox_id]}).length,0);assert.equal(row('crm_ia_outbox',result.outbox_id).attempts,0);
    receipt(c,operation==='cancel'?'cancelled':'synced');const claims=rpc('crm_ia_delivery_claim',{p_ids:[result.outbox_id]});assert.equal(claims.length,1);assert.equal(rpc('crm_ia_delivery_recheck',{p_id:claims[0].id,p_claim_token:claims[0].claim_token}).allowed,true);
   }
   const failed=fixture(),q=propose(failed);await sent(q);const result=apply(failed,q.proposal,incoming(failed,'Sim'));receipt(failed,'uncertain');let sends=0;
   const batch=await dispatchCrmIaQueue({db,ids:[result.outbox_id],generateVoice:async()=>assert.fail('old voice must not survive fallback'),send:async payload=>{sends++;assert.match(payload.body,/não consegui confirmar/i);assert.doesNotMatch(payload.body,/foi cancelado/i);assert.equal(payload.file,undefined);return{ok:true};}});assert.equal(batch.results[0].status,'sent');assert.equal(row('crm_ia_outbox',result.outbox_id).calendar_fallback,true);
   await dispatchCrmIaQueue({db,ids:[result.outbox_id],send:async()=>{sends++;return{ok:true};}});assert.equal(sends,1);
  });
 }finally{if(started)run('pg_ctl',['-D',data,'-m','immediate','-w','stop']);rmSync(work,{recursive:true,force:true});}
});

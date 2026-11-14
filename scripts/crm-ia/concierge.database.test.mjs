import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { crmIaConciergeAvailable } from '../../supabase/functions/_shared/crmIaConcierge.js';
import { dispatchCrmIaQueue } from '../../supabase/functions/_shared/crmIaDelivery.js';
import { processCrmIaAudioInput } from '../../supabase/functions/_shared/crmIaVoice.js';
const work=mkdtempSync('/tmp/crm-concierge-db-'),data=join(work,'data'),env={PATH:process.env.PATH,LC_ALL:'C'};
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const context=Object.fromEntries(['admin','staff','other','client','foreign','channel','hiddenChannel','contact'].map((key,i)=>[key,id([1,2,3,11,12,21,22,31][i])]));
const {admin,staff,client,foreign,channel}=context,pipeline=id(41),entry=id(51),waiting=id(52),agent=id(81),base=id(61);
const quote=v=>v===null||v===undefined?'NULL':typeof v==='number'||typeof v==='boolean'?String(v):`'${String(typeof v==='object'?JSON.stringify(v):v).replaceAll("'","''")}'`;
function run(bin,args,input){const r=spawnSync(bin,args,{input,env,encoding:'utf8',timeout:30000});if(r.status!==0)throw Error(r.stderr||r.error?.message);return r.stdout.trim();}
const psql=['-X','-Aqt','-v','ON_ERROR_STOP=1','-h',work,'-p','55723','-U','concierge_qa','-d','postgres'];
const sql=input=>run('psql',psql,input);
const migration=name=>readFileSync(new URL(`../../supabase/migrations/${name}`,import.meta.url),'utf8');
const target='20261112130634_crm_ia_concierge_capabilities.sql';
const rpc=(name,args={})=>JSON.parse(sql(`SET ROLE service_role;SELECT to_jsonb(public.${name}(${Object.entries(args).map(([k,v])=>`${k}=>${k==='p_ids'&&Array.isArray(v)?`ARRAY[${v.map(quote).join(',')}]::uuid[]`:quote(v)}`).join(',')}));`));
const db={async rpc(name,args){try{return{data:rpc(name,args),error:null};}catch(error){return{data:null,error:{message:error.message}};}}};
const row=(table,key)=>JSON.parse(sql(`SELECT to_jsonb(t) FROM ${table} t WHERE id=${quote(key)}`));
const configuration=()=>JSON.parse(sql(`SELECT to_jsonb(t) FROM crm_ia_config t WHERE cliente_id='${client}'`));
let sequence=0;
function fixture({regular=false,body='Olá',audio=false}={}){
 const n=++sequence,contact=id(100+n),lead=id(200+n),appointment=id(300+n),message=`concierge-${n}`,jid=`5511888${String(n).padStart(6,'0')}@s.whatsapp.net`;
 sql(`INSERT INTO cliente_whatsapp_contact(id,cliente_id,from_jid,phone,sender_name,whatsapp_config_id) VALUES('${contact}','${client}','${jid}',split_part('${jid}','@',1),'Contato sintético','${channel}');
 INSERT INTO leads(id,cliente_id,nome,whatsapp,pipeline_id,stage_id,crm_ia_contact_id,responsavel_id) VALUES('${lead}','${client}','Lead sintético',split_part('${jid}','@',1),'${pipeline}','${regular?entry:waiting}','${contact}','${admin}');
 INSERT INTO cliente_atend_conversas(cliente_id,contact_id,status,ia_pausada,crm_ia_runtime) VALUES('${client}','${contact}','esperando',false,'{"active":true}');
 INSERT INTO crm_ia_appointments(id,cliente_id,lead_id,contact_id,owner_id,start_at,end_at,busy_start_at,busy_end_at,title,request_id,created_by)
 VALUES('${appointment}','${client}','${lead}','${contact}','${admin}',current_date+${n+2}+time '12:00',current_date+${n+2}+time '12:30',current_date+${n+2}+time '12:00',current_date+${n+2}+time '12:30','Compromisso sintético','${id(400+n)}','${staff}');`);
 const source=JSON.parse(sql(`WITH t AS(SELECT clock_timestamp() stamp), ins AS(INSERT INTO cliente_whatsapp_inbox(cliente_id,whatsapp_config_id,from_jid,chat_jid,body,type,message_id,msg_timestamp,created_at,raw_payload,is_group)
 SELECT '${client}','${channel}','${jid}','${jid}',${quote(body)},'${audio?'audio':'text'}','${message}',stamp,stamp,jsonb_build_object('messageTimestamp',extract(epoch FROM stamp)*1000),false FROM t RETURNING *)SELECT to_jsonb(ins) FROM ins`));
 return{contact,lead,appointment,jid,source};
}
function begin(c,patch={}){
 const a=row('cliente_atend_ia_agentes',agent),l=row('leads',c.lead),conv=JSON.parse(sql(`SELECT to_jsonb(t) FROM cliente_atend_conversas t WHERE contact_id='${c.contact}'`)),cfg=configuration();
 return rpc('crm_ia_agent_begin',{p_client:client,p_channel:channel,p_contact:c.contact,p_lead:c.lead,p_agent:agent,p_mode:'responder',p_message:c.source.message_id,
 p_expected:{actor_id:admin,config_revision:cfg.revision,agent_updated_at:a.updated_at,lead_updated_at:l.updated_at,conversation_updated_at:conv.updated_at,concierge:true,concierge_role:true,last_text:c.source.body,source_inbox_id:c.source.id,source_message_id:c.source.message_id,source_message_type:c.source.type,...patch}});
}
function incoming(c,body){
 const source=JSON.parse(sql(`WITH stamp AS(SELECT clock_timestamp() t),ins AS(INSERT INTO cliente_whatsapp_inbox(cliente_id,whatsapp_config_id,from_jid,chat_jid,body,type,message_id,msg_timestamp,created_at,raw_payload,is_group)
 SELECT '${client}','${channel}','${c.jid}','${c.jid}',${quote(body)},'text',gen_random_uuid()::text,t,t,jsonb_build_object('messageTimestamp',extract(epoch FROM t)*1000),false FROM stamp RETURNING *)SELECT to_jsonb(ins) FROM ins`));
 sql(`UPDATE cliente_atend_conversas SET status='esperando',updated_at=clock_timestamp() WHERE contact_id='${c.contact}'`);
 return{...c,source};
}
const apply=(job,action,reply='Texto do modelo')=>rpc('crm_ia_apply_agent_action',{p_run:job.id,p_action:action,p_reply:reply,p_followup:{}});
async function send(item,check=()=>{}){
 let calls=0,payload;
 const batch=await dispatchCrmIaQueue({db,ids:[item.outbox_id],send:async value=>{calls++;payload=value;return{ok:true,messageId:`receipt-${item.outbox_id}`};}});
 assert.equal(batch.results[0]?.status,'sent',JSON.stringify(batch));assert.equal(calls,1);
 check(payload);
 await dispatchCrmIaQueue({db,ids:[item.outbox_id],send:async()=>assert.fail('no retry')});
 assert.equal(row('crm_ia_outbox',item.outbox_id).attempts,1);
}

test('Concierge conserva escopo e permite seu percurso canônico fora da etapa',async t=>{
 let started=false;
 try{
  run('initdb',['-D',data,'-U','concierge_qa','--auth-local=trust','--auth-host=reject','--no-locale','--encoding=UTF8']);
  run('pg_ctl',['-D',data,'-l',join(work,'postgres.log'),'-o',`-k ${work} -p 55723 -c listen_addresses='' -c unix_socket_permissions=0700`,'-w','start']);started=true;
  assert.equal(sql('SHOW listen_addresses'),'');
    const bootstrap = readFileSync(new URL('./workspace.database.test.mjs', import.meta.url), 'utf8').split('    sql(`')[1].split('    `);')[0].replace(/\$\{(\w+)\}/g, (_, name) => context[name]);
    sql(bootstrap.replace(/      CREATE TABLE public\.crm_ia_outbox\([^\n]+\n/, ''));
    sql(`CREATE SCHEMA planeje_private;CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid);
      CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT jsonb_build_object('sub',auth.uid())$$;
      ALTER TABLE public.profiles ADD COLUMN avatar_url text;
      ALTER TABLE public.cliente_whatsapp_contact ADD COLUMN last_message_at timestamptz,ADD COLUMN origin_source text DEFAULT 'nao_identificado',ADD COLUMN qualificado boolean,ADD COLUMN profile_pic_url text,ADD UNIQUE(cliente_id,from_jid);
      ALTER TABLE public.cliente_whatsapp_inbox ADD UNIQUE(cliente_id,message_id);
      ALTER TABLE public.cliente_whatsapp_sent ADD COLUMN sent_by uuid;
      ALTER TABLE public.leads ADD COLUMN qualificado boolean;ALTER TABLE public.cliente_atend_conversas ADD COLUMN ia_followup_passo integer DEFAULT 0;
      CREATE TABLE public.atendimento_usuario_acesso(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cliente_id uuid,user_id uuid,whatsapp_config_id uuid);
      CREATE TABLE public.atendimento_conversas(id uuid PRIMARY KEY,cliente_id uuid,whatsapp_config_id uuid,chat_jid text,archived_at timestamptz,bloqueada boolean DEFAULT false);
      ALTER TABLE public.cliente_whatsapp_inbox ADD COLUMN conversation_id uuid REFERENCES public.atendimento_conversas(id);
      CREATE TABLE public.atendimento_conversa_planejamento(id uuid PRIMARY KEY,cliente_id uuid,conversation_id uuid,whatsapp_config_id uuid,chat_jid text,kind text,body text,status text,scheduled_at timestamptz,completed_at timestamptz,error_message text,updated_at timestamptz DEFAULT now());
      INSERT INTO public.client_module_permissions(cliente_id,module_name,is_enabled) VALUES('${client}','atendimento_loja',true),('${foreign}','atendimento_loja',true);
      GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
      CREATE FUNCTION public.cliente_atend_is_admin(uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role='admin' AND status='active')$$;
      CREATE FUNCTION public.cliente_atend_is_superadmin() RETURNS boolean LANGUAGE sql STABLE AS $$SELECT false$$;
      GRANT ALL ON public.cliente_atend_ia_bases TO authenticated,service_role;
      ALTER TABLE public.cliente_atend_ia_bases ENABLE ROW LEVEL SECURITY;`);
    sql(migration('20260929040000_cliente_atend_ia.sql').match(/create policy cliente_atend_ia_bases_admin\b[\s\S]*?;/i)[0]);
    sql(migration('20260928230000_cliente_atend_inbox.sql').match(/create or replace function public\.cliente_atend_touch_updated_at\([\s\S]*?\$\$;/i)[0]);
    sql('CREATE TRIGGER cliente_atend_ia_bases_touch BEFORE UPDATE ON public.cliente_atend_ia_bases FOR EACH ROW EXECUTE FUNCTION public.cliente_atend_touch_updated_at()');
    sql('CREATE TRIGGER cliente_atend_conversas_touch BEFORE UPDATE ON public.cliente_atend_conversas FOR EACH ROW EXECUTE FUNCTION public.cliente_atend_touch_updated_at()');
    sql(migration('20260702120000_atendimento_send_requires_channel_access.sql'));
    sql(migration('20261006140000_atendimento_loja_modulo.sql').match(/create or replace function public\.cliente_atend_loja_habilitada\([\s\S]*?\$\$;/i)[0]);
    const chain = readdirSync(new URL('../../supabase/migrations/', import.meta.url)).filter(name => /^\d+_crm_ia_/.test(name) && name <= '20261112095000_crm_ia_knowledge_sections.sql').sort();
    assert.equal(chain.length, 22);
    for (const file of chain) sql(migration(file));

  sql(`INSERT INTO crm_pipelines(id,cliente_id,nome) VALUES('${pipeline}','${client}','Funil sintético');INSERT INTO crm_stages(id,pipeline_id,nome) VALUES('${entry}','${pipeline}','Entrada'),('${waiting}','${pipeline}','Equipe');
   INSERT INTO cliente_atend_ia_bases(id,cliente_id,nome,conteudo,created_by) VALUES('${base}','${client}','Base sintética','Conhecimento autorizado','${admin}');
   INSERT INTO crm_ia_config(cliente_id,data,updated_by) VALUES('${client}',${quote({attendance:{auto_send:true},concierge:{enabled:true,mode:'always',base_id:base,faq_enabled:true,handoff_enabled:true,appointment_confirm:true,appointment_reschedule:true,appointment_cancel:true},availability:{timezone:'America/Sao_Paulo',duration_minutes:30,interval_minutes:30,min_notice_hours:0,horizon_days:60,max_per_day:100,windows:[{owner_id:admin,days:[0,1,2,3,4,5,6],start:'08:00',end:'22:00'}]}})},'${admin}');
   INSERT INTO cliente_atend_ia_agentes(id,cliente_id,nome,ativo,auto_responder,created_by,funil) VALUES('${agent}','${client}','Agente sintético',true,true,'${admin}',${quote({crm_ia:{tipo:'qualificacao',pipeline_id:pipeline,stage_ids:[entry],janelas:[],variaveis:[],audio:{enabled:false,input_enabled:false}}})});`);
  const previous=JSON.parse(sql(`SELECT jsonb_agg(jsonb_build_array(p.oid,p.proowner,p.proacl::text,p.prosecdef,p.proconfig,p.provolatile,p.proparallel) ORDER BY p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','private','planeje_private') AND p.proname LIKE 'crm_ia_%'`));
  const existingOids=previous.map(row=>row[0]).join(',');
  sql('CREATE ROLE concierge_default;ALTER DEFAULT PRIVILEGES GRANT EXECUTE ON FUNCTIONS TO concierge_default,authenticated,service_role');
  sql(migration(target));
  const original=configuration().data;
  const configure=patch=>sql(`UPDATE crm_ia_config SET data=${quote({...original,concierge:{...original.concierge,...patch}})},revision=gen_random_uuid(),updated_at=clock_timestamp() WHERE cliente_id='${client}'`);
  const approveInput=()=>{
   sql(`UPDATE cliente_atend_ia_agentes SET funil=jsonb_set(funil,'{crm_ia,audio}','{"enabled":false,"input_enabled":true,"voice":"alloy","speed":1}'),updated_at=clock_timestamp() WHERE id='${agent}';
    INSERT INTO planeje_private.crm_ia_voice_authorizations(agent_id,actor_id,agent_updated_at,settings) SELECT id,'${admin}',updated_at,funil#>'{crm_ia,audio}' FROM cliente_atend_ia_agentes WHERE id='${agent}'
    ON CONFLICT(agent_id) DO UPDATE SET agent_updated_at=excluded.agent_updated_at,settings=excluded.settings,actor_id=excluded.actor_id;`);
  };
  await t.test('legado regular continua aprovado e Concierge passa no claim real fora da etapa',()=>{
   const regular=fixture({regular:true});assert.equal(begin(regular,{concierge_role:false}).claimed,true);
   const support=fixture();assert.equal(begin(support).claimed,true);
   const legacy=fixture();assert.equal(begin(legacy,{concierge_role:false}).claimed,false);
  });
  await t.test('FAQ, repasse e opt-out percorrem apply e despacho sem ação comercial',async()=>{
   for(const [body,action,expected] of [['Qual o serviço?',{type:'answer'},/Texto do modelo/],['Quero humano',{type:'handoff'},/Vou encaminhar/],['Não quero mais',{type:'close'},/encerrado/]]){
    const c=fixture({body}),before=row('leads',c.lead),job=begin(c);assert.equal(job.claimed,true);
    const result=apply(job,action);assert.equal(result.queued,true);await send(result,p=>assert.match(p.body,expected));
    const after=row('leads',c.lead);for(const key of ['stage_id','pipeline_id','responsavel_id','qualificado','crm_ia_fields','crm_ia_profile'])assert.deepEqual(after[key],before[key]);
   }
  });
  await t.test('confirmar, remarcar e cancelar fora da etapa exigem pergunta enviada, consentimento e recibo',async()=>{
   for(const operation of ['confirm','reschedule','cancel']){
    const c=fixture(),initial=row('crm_ia_appointments',c.appointment),job=begin(c);assert.equal(job.claimed,true);
    let times={};
    if(operation==='reschedule'){
     assert.throws(()=>rpc('crm_ia_appointment_slots',{p_client:client,p_channel:channel,p_contact:c.contact,p_lead:c.lead,p_agent:agent,p_actor:admin,p_appointment:c.appointment,p_date:initial.start_at.slice(0,10),p_expected:initial.updated_at}),/slots_scope/,'old RPC remains strict');
     const slots=rpc('crm_ia_appointment_slots_for_run',{p_run:job.id,p_appointment:c.appointment,p_date:initial.start_at.slice(0,10),p_expected:initial.updated_at});
     assert.ok(slots.rows.length);const chosen=slots.rows.find(s=>Date.parse(s.start_at)!==Date.parse(initial.start_at));assert.ok(chosen);times={start_at:chosen.start_at,end_at:chosen.end_at};
    }
    const question=apply(job,{type:'appointment_propose',operation,appointment_id:c.appointment,...times});assert.equal(question.action,'appointment_propose');
    assert.deepEqual(row('crm_ia_appointments',c.appointment),initial);await send(question,p=>assert.match(p.body,/confirma/));
    const proposal=JSON.parse(sql(`SELECT crm_ia_runtime->'pending_appointment_action' FROM cliente_atend_conversas WHERE contact_id='${c.contact}'`));
    const response=incoming(c,'Sim'),confirmation=begin(response);assert.equal(confirmation.claimed,true);
    const result=apply(confirmation,{type:'appointment_apply',confirmation_id:proposal.id});assert.equal(result.action,`appointment_${operation}`);
    const after=row('crm_ia_appointments',c.appointment);for(const key of ['id','owner_id','request_id','created_by','lead_id','contact_id','cliente_id'])assert.equal(after[key],initial[key]);
    assert.equal(after.status,operation==='confirm'?'confirmed':operation==='cancel'?'cancelled':'scheduled');
    if(operation==='reschedule')assert.equal(Date.parse(after.start_at),Date.parse(times.start_at));
    await send(result,p=>assert.match(p.body,operation==='confirm'?/confirmada/:operation==='cancel'?/cancelado/:/remarcado/));
   }
  });
  await t.test('Google conectado retém resposta até recibo exato de sync ou DELETE, sem transporte real',async()=>{
   sql(`INSERT INTO planeje_private.crm_ia_calendar_connections(cliente_id,owner_id,encrypted_token,calendar_id,calendar_name,status,access_role,time_zone) VALUES('${client}','${admin}','fixture-only','calendar-fixture','Agenda sintética','connected','owner','America/Sao_Paulo');
    INSERT INTO planeje_private.crm_ia_calendar_busy(connection_id,connection_revision,since_at,until_at,busy,expires_at) SELECT id,revision,current_date,current_date+100,'[]',clock_timestamp()+interval '10 minutes' FROM planeje_private.crm_ia_calendar_connections`);
   const calendar=(action,payload)=>rpc('crm_ia_calendar_service',{p_action:action,p_payload:payload});
   for(const operation of ['confirm','reschedule','cancel']){
    const c=fixture(),job=begin(c);assert.equal(job.claimed,true);const appointment=row('crm_ia_appointments',c.appointment);let times={};
    if(operation==='reschedule'){
     const connection=calendar('connection',{client_id:client,owner_id:admin});
     assert.equal(calendar('busy',{client_id:client,owner_id:admin,revision:connection.revision,appointment_id:c.appointment,busy:[],since:new Date(Date.parse(appointment.start_at)-86400000).toISOString(),until:new Date(Date.parse(appointment.start_at)+86400000).toISOString()}).fresh,true);
     const slots=rpc('crm_ia_appointment_slots_for_run',{p_run:job.id,p_appointment:c.appointment,p_date:appointment.start_at.slice(0,10),p_expected:appointment.updated_at});assert.ok(slots.rows.length);
     times={start_at:slots.rows[0].start_at,end_at:slots.rows[0].end_at};
    }
    const question=apply(job,{type:'appointment_propose',operation,appointment_id:c.appointment,...times});await send(question);
    const proposal=JSON.parse(sql(`SELECT crm_ia_runtime->'pending_appointment_action' FROM cliente_atend_conversas WHERE contact_id='${c.contact}'`)),response=begin(incoming(c,'Sim'));
    assert.equal(response.claimed,true);const result=apply(response,{type:'appointment_apply',confirmation_id:proposal.id});assert.equal(result.action,`appointment_${operation}`);
    assert.equal(rpc('crm_ia_delivery_claim',{p_ids:[result.outbox_id]}).length,0);assert.equal(row('crm_ia_outbox',result.outbox_id).attempts,0);
    const sync=calendar('claim',{limit:50}).find(row=>row.id===c.appointment);assert.ok(sync);
    const status=operation==='cancel'?'cancelled':'synced';
    assert.ok(calendar('finish',{id:sync.id,lease:sync.lease,status,receipt:{event_id:sync.event_id,calendar_id:sync.calendar_id,etag:'fixture-version',http_status:operation==='cancel'?204:201}}));
    await send(result);
   }
   sql(`UPDATE planeje_private.crm_ia_calendar_connections SET status='disconnected',encrypted_token=NULL,revision=gen_random_uuid() WHERE cliente_id='${client}'`);
  });
  await t.test('nenhuma capacidade exige opt-out ou frase real; hints não autorizam resposta',async()=>{
   configure({faq_enabled:false,appointment_confirm:false,appointment_reschedule:false,appointment_cancel:false,handoff_phrases:['Falar com equipe']});
   try{
    for(const patch of [{},{last_text:'Pode parar',concierge_action:'close'},{last_text:'falar com equipe',concierge_action:'handoff'},{source_message_id:'forged'},{source_inbox_id:id(9999)}]){
     assert.equal(begin(fixture(),patch).claimed,false,JSON.stringify(patch));
    }
    for(const [body,type] of [['PÓDE PARAR','close'],['Quero falar com equipe agora','handoff']]){const c=fixture({body}),job=begin(c);assert.equal(job.claimed,true);await send(apply(job,{type}));}
    configure({faq_enabled:false,appointment_confirm:false,appointment_reschedule:false,appointment_cancel:false,handoff_enabled:false,handoff_phrases:['Falar com equipe']});
    assert.equal(begin(fixture({body:'Falar com equipe'})).claimed,false);
    assert.equal(begin(fixture({body:'Na\u0303o tenho interesse'})).claimed,true);
   }finally{configure({});}
  });
  await t.test('ação Concierge recusa campos comerciais e FAQ livre com agenda ligada',()=>{
   configure({faq_enabled:false,handoff_enabled:false});
   try{
    for(const action of [{type:'qualify'},{type:'book'},{type:'answer',values:{}},{type:'answer',profile_id:null},{type:'answer',summary:null},{type:'answer'},{type:'handoff'},{type:'close'}]){
     const c=fixture(),job=begin(c);assert.equal(job.claimed,true);const before=row('leads',c.lead);
     assert.throws(()=>apply(job,action),/concierge|profile_action|summary/);assert.deepEqual(row('leads',c.lead),before);assert.equal(sql(`SELECT count(*) FROM crm_ia_outbox WHERE agent_run_id='${job.id}'`),'0');
    }
    const c=fixture(),job=begin(c),result=apply(job,{type:'handoff',reason:'calendar_unavailable',system_handoff:true});assert.match(result.resposta,/Vou encaminhar/);
   }finally{configure({});}
  });
  await t.test('papel ausente, falso, string, Follow-up, manual e outro funil não recebem exceção',()=>{
   for(const patch of [{concierge_role:undefined},{concierge_role:false},{concierge_role:'true'},{concierge_role:null},{concierge:false,concierge_role:false}])assert.equal(begin(fixture(),patch).claimed,false);
   const old=row('cliente_atend_ia_agentes',agent);
   for(const patch of [{auto_responder:false},{ativo:false},{funil:{crm_ia:{...old.funil.crm_ia,tipo:'followup'}}},{funil:{crm_ia:{...old.funil.crm_ia,pipeline_id:id(999)}}}]){
    sql(`UPDATE cliente_atend_ia_agentes SET ${Object.entries(patch).map(([key,value])=>`${key}=${quote(value)}`).join(',')} WHERE id='${agent}'`);
    try{assert.equal(begin(fixture()).claimed,false);}finally{sql(`UPDATE cliente_atend_ia_agentes SET auto_responder=true,ativo=true,funil=${quote(old.funil)} WHERE id='${agent}'`);}
   }
   const c=fixture({regular:true});assert.equal(begin(c).claimed,false,'available regular prevents forged role');assert.equal(begin(c,{concierge_role:false}).claimed,true);
  });
  await t.test('claim e apply Concierge respeitam canal e lead autorizados antes de gerar resposta',()=>{
   const c=fixture();
   assert.equal(begin(c,{actor_id:staff}).claimed,false,'colaborador limitado a outro responsável não assume este lead');
   const own=fixture();sql(`UPDATE leads SET responsavel_id='${staff}',updated_at=clock_timestamp() WHERE id='${own.lead}';UPDATE cliente_atend_conversas SET assigned_to='${staff}',updated_at=clock_timestamp() WHERE contact_id='${own.contact}'`);
   assert.equal(begin(own,{actor_id:staff}).claimed,true,'colaborador autorizado conserva o percurso');
   sql(`INSERT INTO atendimento_usuario_acesso(cliente_id,user_id,whatsapp_config_id) VALUES('${client}','${admin}','${context.hiddenChannel}')`);
   try{assert.equal(begin(c).claimed,false,'ator perdeu o canal');}finally{sql(`DELETE FROM atendimento_usuario_acesso WHERE user_id='${admin}'`);}
   const current=fixture(),job=begin(current);assert.equal(job.claimed,true);
   sql(`INSERT INTO atendimento_usuario_acesso(cliente_id,user_id,whatsapp_config_id) VALUES('${client}','${admin}','${context.hiddenChannel}')`);
   try{assert.throws(()=>apply(job,{type:'answer'}),/concierge|scope|snapshot/);assert.equal(sql(`SELECT count(*) FROM crm_ia_outbox WHERE agent_run_id='${job.id}'`),'0');}
   finally{sql(`DELETE FROM atendimento_usuario_acesso WHERE user_id='${admin}'`);}
  });
  await t.test('revogação depois do claim ou antes do transporte conserva dados e não envia',async()=>{
   for(const change of ['config','human','source','agent']){
    const c=fixture(),job=begin(c);assert.equal(job.claimed,true);
    const result=apply(job,{type:'appointment_propose',operation:'cancel',appointment_id:c.appointment});
    if(change==='config')configure({appointment_cancel:false});
    if(change==='human')sql(`UPDATE cliente_atend_conversas SET ia_pausada=true,updated_at=clock_timestamp() WHERE contact_id='${c.contact}'`);
    if(change==='source')incoming(c,'Outra mensagem');
    if(change==='agent')sql(`UPDATE cliente_atend_ia_agentes SET auto_responder=false,updated_at=clock_timestamp() WHERE id='${agent}'`);
    const resultBatch=await dispatchCrmIaQueue({db,ids:[result.outbox_id],send:async()=>assert.fail('revoked must not send')});
    assert.equal(resultBatch.processed,0,change);assert.equal(row('crm_ia_outbox',result.outbox_id).status,'cancelled');assert.equal(row('crm_ia_appointments',c.appointment).status,'scheduled');
    configure({});sql(`UPDATE cliente_atend_ia_agentes SET auto_responder=true,updated_at=clock_timestamp() WHERE id='${agent}'`);
   }
  });
  await t.test('ASR novo, completed e failed transportam o mesmo pin sem repetir custo',async()=>{
   approveInput();
   for(const transcript of ['Não tenho interesse',null]){
    const c=fixture({audio:true}),args={p_client:client,p_channel:channel,p_contact:c.contact,p_message:c.source.message_id},job=rpc('crm_ia_audio_begin',args);
    assert.equal(job.allowed,true);assert.deepEqual(Object.keys(job.authorization).sort(),['agent_id','agent_updated_at','concierge_role','config_revision']);assert.equal(job.authorization.concierge_role,true);
    const claim={p_id:job.id,p_claim_token:job.claim_token};assert.equal(rpc('crm_ia_audio_recheck',claim).allowed,true);
    assert.equal(rpc('crm_ia_audio_complete',{...claim,p_transcript:transcript,p_error_code:transcript?null:'audio_unavailable'}),true);
    const cached=rpc('crm_ia_audio_begin',args);assert.equal(cached.cached,true);assert.deepEqual(cached.authorization,job.authorization);
    const result=await processCrmIaAudioInput({db,clientId:client,channelId:channel,contactId:c.contact,messageId:c.source.message_id,apiKey:'fixture',fetchImpl:async()=>assert.fail('cache must not download or bill')});
    assert.deepEqual(result.authorization,job.authorization);assert.equal(result.ok,!!transcript);
    configure({faq_enabled:false,handoff_enabled:false,appointment_confirm:false,appointment_reschedule:false,appointment_cancel:false});
    assert.equal(begin(c).claimed,false,'configuration revision after ASR invalidates authorization');
    configure({});
   }
  });
  await t.test('ASR bloqueia dono indevido antes do custo e conserva lead único ainda sem vínculo de contato',()=>{
   approveInput();const c=fixture({audio:true});
   sql(`UPDATE crm_ia_config SET updated_by='${staff}',revision=gen_random_uuid() WHERE cliente_id='${client}';UPDATE cliente_atend_conversas SET assigned_to='${staff}',updated_at=clock_timestamp() WHERE contact_id='${c.contact}'`);
   try{assert.equal(rpc('crm_ia_audio_begin',{p_client:client,p_channel:channel,p_contact:c.contact,p_message:c.source.message_id}).allowed,false);}
   finally{sql(`UPDATE crm_ia_config SET updated_by='${admin}',revision=gen_random_uuid() WHERE cliente_id='${client}'`);}
   const unlinked=fixture({audio:true});sql(`UPDATE leads SET crm_ia_contact_id=NULL,updated_at=clock_timestamp() WHERE id='${unlinked.lead}'`);
   const job=rpc('crm_ia_audio_begin',{p_client:client,p_channel:channel,p_contact:unlinked.contact,p_message:unlinked.source.message_id});assert.equal(job.allowed,true);
   assert.equal(row('leads',unlinked.lead).crm_ia_contact_id,null,'ouvir não captura nem vincula antecipadamente');
  });
  await t.test('claim regular não reutiliza ASR ouvido no papel Concierge',()=>{
   approveInput();const c=fixture({audio:true}),job=rpc('crm_ia_audio_begin',{p_client:client,p_channel:channel,p_contact:c.contact,p_message:c.source.message_id});assert.equal(job.authorization.concierge_role,true);
   assert.equal(rpc('crm_ia_audio_complete',{p_id:job.id,p_claim_token:job.claim_token,p_transcript:'Olá'}),true);
   sql(`UPDATE leads SET stage_id='${entry}',updated_at=clock_timestamp() WHERE id='${c.lead}'`);
   assert.equal(begin(c,{concierge_role:false}).claimed,false);
  });
  await t.test('zero geração ainda permite opt-out transcrito e falha confirmada responde só com texto fixo',async()=>{
   configure({faq_enabled:false,handoff_enabled:false,appointment_confirm:false,appointment_reschedule:false,appointment_cancel:false});approveInput();
   try{
    for(const transcript of ['Na\u0303o tenho interesse','Olá',null]){
     const c=fixture({audio:true}),job=rpc('crm_ia_audio_begin',{p_client:client,p_channel:channel,p_contact:c.contact,p_message:c.source.message_id});assert.equal(job.allowed,true);
     assert.equal(rpc('crm_ia_audio_complete',{p_id:job.id,p_claim_token:job.claim_token,p_transcript:transcript,p_error_code:transcript?null:'audio_unavailable'}),true);
     const response=begin(c,{last_text:'HINT QUE NÃO AUTORIZA'});assert.equal(response.claimed,transcript!=='Olá');
     if(response.claimed){
      const queued=apply(response,transcript?{type:'close'}:{type:'answer',server_answer:'audio_failure'},'CANARY_MODEL');
      await send(queued,p=>{assert.doesNotMatch(p.body,/CANARY_MODEL/);assert.match(p.body,transcript?/encerrado/:/Pode escrever/);});
     }
    }
   }finally{configure({});}
  });
  await t.test('cache histórico sem papel, lease perdida e prioridade nova não liberam áudio',()=>{
   approveInput();
   const args=c=>({p_client:client,p_channel:channel,p_contact:c.contact,p_message:c.source.message_id});
   const old=fixture({audio:true}),oldJob=rpc('crm_ia_audio_begin',args(old));assert.equal(oldJob.allowed,true);
   assert.equal(rpc('crm_ia_audio_complete',{p_id:oldJob.id,p_claim_token:oldJob.claim_token,p_transcript:'Preservar histórico'}),true);
   sql(`UPDATE planeje_private.crm_ia_audio_inputs SET snapshot=snapshot-'concierge_role' WHERE id='${oldJob.id}'`);
   assert.equal(rpc('crm_ia_audio_begin',args(old)).allowed,false);assert.equal(row('planeje_private.crm_ia_audio_inputs',oldJob.id).transcript,'Preservar histórico');
   const expired=fixture({audio:true}),expiredJob=rpc('crm_ia_audio_begin',args(expired));assert.equal(expiredJob.allowed,true);
   sql(`UPDATE planeje_private.crm_ia_audio_inputs SET created_at=clock_timestamp()-interval '6 minutes' WHERE id='${expiredJob.id}'`);
   assert.equal(rpc('crm_ia_audio_complete',{p_id:expiredJob.id,p_claim_token:expiredJob.claim_token,p_transcript:'Tardio'}),false);
   const c=fixture({audio:true}),job=rpc('crm_ia_audio_begin',args(c));assert.equal(job.allowed,true);
   const originalAgent=row('cliente_atend_ia_agentes',agent),replacement=id(901);
   sql(`INSERT INTO cliente_atend_ia_agentes(id,cliente_id,nome,ativo,auto_responder,created_by,funil) VALUES('${replacement}','${client}','Prioridade regular',true,true,'${admin}',${quote({crm_ia:{...originalAgent.funil.crm_ia,stage_ids:[waiting],audio:{enabled:false,input_enabled:false}}})})`);
   try{
    assert.equal(rpc('crm_ia_audio_recheck',{p_id:job.id,p_claim_token:job.claim_token}).allowed,false);
    assert.equal(rpc('crm_ia_audio_begin',args(c)).allowed,false,'does not fall back to an ASR-approved agent when the selected regular lacks opt-in');
   }finally{sql(`DELETE FROM cliente_atend_ia_agentes WHERE id='${replacement}'`);}
  });
  await t.test('transcrição de outro agente, papel, revisão ou fonte não prova opt-out',()=>{
   configure({faq_enabled:false,appointment_confirm:false,appointment_reschedule:false,appointment_cancel:false});approveInput();
   try{
    for(const mutation of ["snapshot=snapshot-'concierge_role'",`snapshot=jsonb_set(snapshot,'{config_revision}',to_jsonb('${id(999)}'::text))`,"snapshot=jsonb_set(snapshot,'{concierge_role}','false')","snapshot=jsonb_set(snapshot,'{agent_updated_at}',to_jsonb(clock_timestamp()+interval '1 second'))"]){
     const c=fixture({audio:true}),job=rpc('crm_ia_audio_begin',{p_client:client,p_channel:channel,p_contact:c.contact,p_message:c.source.message_id});assert.equal(job.allowed,true);
     assert.equal(rpc('crm_ia_audio_complete',{p_id:job.id,p_claim_token:job.claim_token,p_transcript:'Pode parar'}),true);
     sql(`UPDATE planeje_private.crm_ia_audio_inputs SET ${mutation} WHERE id='${job.id}'`);assert.equal(begin(c).claimed,false,mutation);
    }
   }finally{configure({});}
  });
  await t.test('horário, exceção e espera têm os mesmos limites no JS e no SQL',()=>{
   const windows=[{owner_id:admin,days:[4],start:'08:00',end:'18:00'}];
   for(const now of ['2026-11-12T10:59:59Z','2026-11-12T11:00:00Z','2026-11-12T20:59:59Z','2026-11-12T21:00:00Z'])
    for(const extra of [{},{availability:{exceptions:[{owner_id:admin,date:'2026-11-12',blocked:true}]}},{availability:{exceptions:[{owner_id:admin,date:'2026-11-12',start:'19:00',end:'20:00'}]}},{runtime:{last_human_at:'2026-11-12T20:50:00Z'}},{runtime:{last_human_at:false}},{availability:{timezone:''}},{availability:{windows:[]}}]){
     const data={concierge:{enabled:true},availability:{timezone:'America/Sao_Paulo',windows,...extra.availability}},runtime=extra.runtime||{};
     const expected=crmIaConciergeAvailable({config:data,lead:{responsavel_id:admin},conversation:{crm_ia_runtime:runtime},now});
     const actual=sql(`SELECT private.crm_ia_concierge_available(${quote(data)},'${admin}',${quote(runtime)},${quote(now)})`)==='t';assert.equal(actual,expected,JSON.stringify({now,extra}));
    }
  });
  await t.test('flags novas inválidas são recusadas em escrita e nada muda após erro',()=>{
   for(const key of ['faq_enabled','handoff_enabled'])for(const value of ['true',null,1]){
    const old=configuration();const statement=`BEGIN;UPDATE crm_ia_config SET data=jsonb_set(data,'{concierge,${key}}',${quote(value===null?'null':JSON.stringify(value))}::jsonb) WHERE cliente_id='${client}';ROLLBACK;`;
    assert.throws(()=>sql(statement),/Concierge|boolean/);assert.deepEqual(configuration(),old);
   }
  });
  await t.test('funções existentes preservam OID owner e ACL',()=>{
   assert.deepEqual(JSON.parse(sql(`SELECT jsonb_agg(jsonb_build_array(p.oid,p.proowner,p.proacl::text,p.prosecdef,p.proconfig,p.provolatile,p.proparallel) ORDER BY p.oid) FROM pg_proc p WHERE p.oid IN (${existingOids})`)),previous);
  });
  await t.test('helpers e RPC novo removem privilégios herdados além da role de serviço',()=>{
   const functions=JSON.parse(sql(`SELECT jsonb_agg(jsonb_build_object('name',p.proname,'owner',pg_get_userbyid(p.proowner),'grantees',(SELECT coalesce(jsonb_agg(coalesce(r.rolname,'PUBLIC')),'[]') FROM aclexplode(p.proacl) a LEFT JOIN pg_roles r ON r.oid=a.grantee WHERE a.grantee<>p.proowner))) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.proname IN ('crm_ia_concierge_config_guard','crm_ia_concierge_available','crm_ia_agent_window_at','crm_ia_inbound_agent','crm_ia_concierge_role','crm_ia_concierge_source','crm_ia_concierge_deterministic','crm_ia_concierge_faq','crm_ia_appointment_slots_for_run')`));
   assert.equal(functions.length,9);for(const fn of functions){assert.equal(fn.owner,'concierge_qa');assert.deepEqual(fn.grantees,fn.name==='crm_ia_appointment_slots_for_run'?['service_role']:[]);}
  });
 }finally{if(started)run('pg_ctl',['-D',data,'-m','immediate','-w','stop']);rmSync(work,{recursive:true,force:true});}
});

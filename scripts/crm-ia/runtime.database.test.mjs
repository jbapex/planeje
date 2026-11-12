import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { dispatchCrmIaQueue } from '../../supabase/functions/_shared/crmIaDelivery.js';
const work = mkdtempSync('/tmp/crm-agent-db-'), data = join(work, 'data');
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const context = Object.fromEntries(['admin','staff','other','client','foreign','channel','hiddenChannel','contact'].map((name, i) => [name, id([1,2,3,11,12,21,22,31][i])]));
const { admin, client, channel, contact } = context;
const env = { PATH: process.env.PATH, LC_ALL: 'C' };
function run(binary, args, input) { const result = spawnSync(binary, args, { env, input, encoding: 'utf8', timeout: 25000 }); if (result.status !== 0) throw new Error(result.stderr || result.error?.message); return result.stdout.trim(); }
const sql = source => run('psql', ['-X','-Aqt','-v','ON_ERROR_STOP=1','-h',work,'-p','55489','-U','agent_qa','-d','postgres'], source);
const json = value => JSON.stringify(value).replaceAll("'", "''");
const rpc = (name, args) => JSON.parse(sql(`SET ROLE service_role; SELECT to_jsonb(public.${name}(${args}));`));
const receive = messageId => sql(`INSERT INTO cliente_whatsapp_inbox(cliente_id,whatsapp_config_id,from_jid,chat_jid,body,type,message_id,msg_timestamp,created_at,raw_payload)
  SELECT '${client}','${channel}',from_jid,from_jid,'Mensagem sintética recebida','text','${messageId}',clock_timestamp(),clock_timestamp(),jsonb_build_object('messageTimestamp',extract(epoch FROM clock_timestamp())*1000)
  FROM cliente_whatsapp_contact WHERE id='${contact}' AND cliente_id='${client}'`);

test('typed runtime applies canonical actions and outbox together, rejecting stale or cross-client state', async () => {
  let started = false;
  try {
    run('initdb', ['-D',data,'-U','agent_qa','--auth-local=trust','--auth-host=reject','--no-locale','--encoding=UTF8']);
    run('pg_ctl', ['-D',data,'-l',join(work,'pg.log'),'-o',`-k ${work} -p 55489 -c listen_addresses='' -c unix_socket_permissions=0700`,'-w','start']); started = true;
    // Reuse the canonical workspace's synthetic schema, rather than a second CRM fixture model.
    const fixture = readFileSync(new URL('./workspace.database.test.mjs', import.meta.url), 'utf8').split('    sql(`')[1].split('    `);')[0].replace(/\$\{(\w+)\}/g, (_, name) => context[name]);
    sql(fixture.replace(/      CREATE TABLE public\.crm_ia_outbox\([^\n]+\n/, ''));
    sql(`CREATE SCHEMA planeje_private;CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid);
      ALTER TABLE cliente_whatsapp_config ADD COLUMN IF NOT EXISTS provider text DEFAULT 'uazapi',ADD COLUMN IF NOT EXISTS archived_at timestamptz,ADD COLUMN IF NOT EXISTS token text DEFAULT 'synthetic',ADD COLUMN IF NOT EXISTS subdomain text DEFAULT 'fixture';
      ALTER TABLE cliente_whatsapp_contact ADD COLUMN IF NOT EXISTS last_message_at timestamptz,ADD COLUMN IF NOT EXISTS origin_source text DEFAULT 'nao_identificado';
      ALTER TABLE leads ADD COLUMN IF NOT EXISTS qualificado boolean;ALTER TABLE cliente_whatsapp_contact ADD COLUMN IF NOT EXISTS qualificado boolean;
      ALTER TABLE cliente_atend_conversas ADD COLUMN IF NOT EXISTS ia_followup_due_at timestamptz,ADD COLUMN IF NOT EXISTS ia_followup_passo integer DEFAULT 0;
      CREATE TABLE atendimento_conversas(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cliente_id uuid,whatsapp_config_id uuid,chat_jid text,archived_at timestamptz,bloqueada boolean DEFAULT false,is_group boolean DEFAULT false,display_name text,status text DEFAULT 'aguardando',fila_id uuid,assigned_to uuid,last_message_at timestamptz,last_customer_message_at timestamptz,awaiting_response_since timestamptz,unread_count integer DEFAULT 0,last_message_preview text,profile_pic_url text,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now(),UNIQUE(cliente_id,whatsapp_config_id,chat_jid));
      CREATE TABLE atendimento_conversa_planejamento(id uuid PRIMARY KEY,cliente_id uuid,conversation_id uuid,whatsapp_config_id uuid,chat_jid text,kind text,body text,status text,scheduled_at timestamptz,completed_at timestamptz,error_message text,updated_at timestamptz DEFAULT now());
      GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;`);
    sql(readFileSync(new URL('../../supabase/migrations/20260928230000_cliente_atend_inbox.sql', import.meta.url), 'utf8').match(/create or replace function public\.cliente_atend_touch_updated_at\([\s\S]*?\$\$;/i)[0]);
    sql('CREATE TRIGGER cliente_atend_conversas_touch BEFORE UPDATE ON public.cliente_atend_conversas FOR EACH ROW EXECUTE FUNCTION public.cliente_atend_touch_updated_at()');
    for (const file of ['20261111041703_crm_ia_delivery_runtime.sql','20261111041704_crm_ia_workspace.sql','20261111043800_crm_ia_workspace_readings.sql','20261111044652_crm_ia_agent_runtime.sql','20261111062101_crm_ia_calendar.sql','20261111062548_crm_ia_voice.sql','20261111072502_crm_ia_calendar_delivery.sql','20261111075558_crm_ia_agent_template_contract.sql','20261111090001_crm_ia_appointment_actions.sql','20261111090002_crm_ia_agent_drafts_voice_modes.sql','20261111090003_crm_ia_lead_tags.sql','20261111101501_crm_ia_lead_profiles.sql','20261111101502_crm_ia_lead_reads.sql','20261111120001_crm_ia_internal_notifications.sql','20261111120002_crm_ia_conversation_controls.sql','20261111162400_crm_ia_conversation_read_performance.sql']) sql(readFileSync(new URL(`../../supabase/migrations/${file}`, import.meta.url), 'utf8'));
    assert.equal(sql("SELECT to_regprocedure('public.crm_ia_agent_intake(uuid,uuid,uuid,text)') IS NOT NULL"), 't', 'typed runtime SQL missing');
    const pipeline = id(41), stage = id(51), next = id(52), agent = id(81);
    sql(`INSERT INTO crm_pipelines(id,cliente_id,nome) VALUES('${pipeline}','${client}','Fixture');
      INSERT INTO crm_stages(id,pipeline_id,nome) VALUES('${stage}','${pipeline}','Entrada'),('${next}','${pipeline}','Qualificado');
      INSERT INTO crm_ia_config(cliente_id,data,updated_by) VALUES('${client}','${json({ attendance:{auto_send:true},entry:{enabled:true,channels:[{channel_id:channel,enabled:true,mode:'all',pipeline_id:pipeline,stage_id:stage,tags:['entrada']}]},distribution:{enabled:true,strategy:'round_robin',sources:['whatsapp'],people:[{owner_id:admin,weight:1,limit:10}]}})}','${admin}');
      INSERT INTO cliente_atend_ia_agentes(id,cliente_id,nome,auto_responder,created_by,funil) VALUES('${agent}','${client}','Fixture',true,'${admin}','${json({crm_ia:{tipo:'qualificacao',pipeline_id:pipeline,stage_ids:[stage],variaveis:[{nome:'cidade'}],destino:{tipo:'humano',stage_id:next}}})}');`);
    const prepared = rpc('crm_ia_agent_intake', `'${client}','${channel}','${contact}','Olá'`);
    assert.equal(prepared.lead.pipeline_id,pipeline); assert.equal(prepared.lead.responsavel_id,admin);
    assert.equal(rpc('crm_ia_agent_intake', `'${client}','${channel}','${contact}','Olá'`).lead.id,prepared.lead.id);
    const begin = (key, state=prepared) => rpc('crm_ia_agent_begin', `'${client}','${channel}','${contact}','${state.lead.id}','${agent}','responder','${key}','${json({config_revision:state.config.revision,lead_updated_at:state.lead.updated_at,conversation_updated_at:state.conversation.updated_at,agent_updated_at:sql(`SELECT updated_at FROM cliente_atend_ia_agentes WHERE id='${agent}'`),actor_id:admin,last_text:'Quero agendar'})}'`);
    const job=begin('message-1'); assert.equal(job.claimed,true); assert.equal(begin('message-1').claimed,false);
    const action = rpc('crm_ia_apply_agent_action', `'${job.id}','${json({type:'qualify',values:{cidade:'São Paulo'}})}','Resposta sintética','{}'`);
    assert.equal(action.queued,true); assert.ok(action.outbox_id);
    assert.equal(sql(`SELECT stage_id FROM leads WHERE id='${prepared.lead.id}'`),next);
    assert.equal(sql(`SELECT qualificado FROM leads WHERE id='${prepared.lead.id}'`),'t','qualification must reach the canonical commercial flag');
    assert.equal(sql(`SELECT count(*) FROM crm_funnel_events WHERE lead_id='${prepared.lead.id}'`),'1');
    assert.equal(sql(`SELECT ia_pausada FROM cliente_atend_conversas WHERE contact_id='${contact}'`),'t');
    assert.equal(rpc('crm_ia_apply_agent_action', `'${job.id}','${json({type:'qualify',values:{cidade:'São Paulo'}})}','Resposta sintética','{}'`).outbox_id,action.outbox_id);
    assert.equal(sql('SELECT count(*) FROM crm_ia_outbox'),'1');
    assert.equal(sql("SELECT has_function_privilege('authenticated','crm_ia_apply_agent_action(uuid,jsonb,text,jsonb)','execute')"),'f');
    assert.throws(()=>rpc('crm_ia_agent_intake',`'${context.foreign}','${channel}','${contact}','Olá'`),/scope|canal|contato/i);
    const claimed=rpc('crm_ia_delivery_claim','');
    assert.equal(rpc('crm_ia_delivery_recheck',`'${action.outbox_id}','${claimed[0].claim_token}'`).allowed,true,'own committed handoff must still deliver its final response');
    sql(`UPDATE cliente_atend_conversas SET updated_at=clock_timestamp() WHERE contact_id='${contact}'`);
    assert.equal(rpc('crm_ia_delivery_recheck',`'${action.outbox_id}','${claimed[0].claim_token}'`).allowed,false,'later human update must cancel response');
    const quote = value => value == null ? 'NULL' : typeof value === 'boolean' || typeof value === 'number' ? String(value) : `'${String(typeof value === 'object' ? JSON.stringify(value) : value).replaceAll("'", "''")}'`;
    const db = { async rpc(name,args) { return { data:rpc(name,Object.entries(args).map(([key,value])=>`${key}=>${key==='p_ids' && Array.isArray(value)?`ARRAY[${value.map(quote).join(',')}]::uuid[]`:quote(value)}`).join(',')),error:null }; }, from(table) {
      const filters=[];let fields='*',ordering='',limit='',single=false,insert=null,patch=null;
      const query={select(value){fields=value;return query;},eq(key,value){filters.push(`${key}=${quote(value)}`);return query;},is(key){filters.push(`${key} IS NULL`);return query;},
        in(key,values){filters.push(`${key} IN (${values.map(quote).join(',')})`);return query;},or(value){filters.push('('+value.split(',').map(part=>{const [key,,...text]=part.split('.');return `${key}=${quote(text.join('.'))}`;}).join(' OR ')+')');return query;},
        order(key,options={}){ordering=` ORDER BY ${key} ${options.ascending===false?'DESC':'ASC'}`;return query;},limit(n){limit=` LIMIT ${n}`;return query;},
        maybeSingle(){single=true;return query;},insert(value){insert=value;return query;},update(value){patch=value;return query;},then(resolve,reject){try{
          if(patch){sql(`UPDATE ${table} SET ${Object.entries(patch).map(([key,value])=>`${key}=${quote(value)}`).join(',')}${filters.length?' WHERE '+filters.join(' AND '):''}`);return Promise.resolve({data:null,error:null}).then(resolve,reject);}
          if(insert){sql(`INSERT INTO ${table}(${Object.keys(insert).join(',')}) VALUES(${Object.values(insert).map(quote).join(',')})`);return Promise.resolve({data:null,error:null}).then(resolve,reject);}
          const value=JSON.parse(sql(`SELECT coalesce(json_agg(t),'[]') FROM(SELECT ${fields} FROM ${table}${filters.length?' WHERE '+filters.join(' AND '):''}${ordering}${limit}) t`));
          return Promise.resolve({data:single?value[0]||null:value,error:null}).then(resolve,reject);
        }catch(error){return Promise.reject(error).then(resolve,reject);}}};return query;
    }};
    const output=join(work,'runtime.mjs');await build({entryPoints:['supabase/functions/_shared/crmIaRuntime.ts'],outfile:output,bundle:true,format:'esm',platform:'node'});
    const {runCrmIaAgent}=await import(pathToFileURL(output));let modelCalls=0;
    const suggestion=await runCrmIaAgent({db,clientId:client,contactId:contact,channelId:channel,agentId:agent,mode:'sugerir',callModel:async(model,messages)=>{
      modelCalls++;assert.match(JSON.stringify(messages),/mensagem visível/);assert.ok(!JSON.stringify(messages).includes('mensagem restrita'));assert.ok(!JSON.stringify(messages).includes('Ápice'));
      return {resposta:'{"text":"Resposta sintética","action":{"type":"answer"}}',tokens:3};}});
    assert.equal(suggestion.preview,true);assert.equal(modelCalls,1);assert.equal(sql('SELECT count(*) FROM crm_ia_outbox'),'1','suggestion must never queue transport');
    receive('new-message');
    const paused=await runCrmIaAgent({db,clientId:client,contactId:contact,channelId:channel,mode:'responder',messageId:'new-message',callModel:async()=>{throw Error('must not call model');}});
    assert.equal(paused.skipped,'human_or_disabled');
    sql(`UPDATE cliente_atend_conversas SET ia_pausada=false,status='esperando',updated_at=clock_timestamp() WHERE contact_id='${contact}';
      UPDATE crm_ia_config SET data=jsonb_set(data,'{availability}','${json({timezone:'America/Sao_Paulo',duration_minutes:30,interval_minutes:30,min_notice_hours:0,horizon_days:60,max_per_day:8,windows:[{owner_id:admin,days:[0,1,2,3,4,5,6],start:'09:00',end:'18:00'}]})}'),revision=gen_random_uuid() WHERE cliente_id='${client}';
      UPDATE cliente_atend_ia_agentes SET funil='${json({crm_ia:{tipo:'agendamento',pipeline_id:pipeline,stage_ids:[next],destino:{tipo:'humano'},agendamento:{owner_id:admin,duration_minutes:45,interval_minutes:45,reminders:[{valor:1,unidade:'horas'}]}}})}',updated_at=clock_timestamp() WHERE id='${agent}'`);
    const fresh=rpc('crm_ia_agent_intake',`'${client}','${channel}','${contact}','Quero agendar'`);
    const date=new Date(Date.now()+2*86400000).toISOString().slice(0,10);
    const slot=rpc('crm_ia_agent_slots',`'${client}','${agent}','${fresh.lead.id}','${date}'`).rows[0];
    assert.equal(new Date(slot.end_at)-new Date(slot.start_at),45*60000,'agent duration override must reach the booking engine');
    const bookingJob=begin('message-booking',fresh);
    const booked=rpc('crm_ia_apply_agent_action',`'${bookingJob.id}','${json({type:'book',start_at:slot.start_at,end_at:slot.end_at})}','Texto sem valor de recibo','{}'`);
    assert.ok(booked.appointment?.id);assert.match(booked.resposta,/reservado/);
    assert.equal(sql(`SELECT count(*) FROM crm_ia_outbox WHERE kind='reminder'`),'1','booking must schedule its configured reminder');
    sql(`UPDATE cliente_atend_conversas SET ia_pausada=false,status='esperando',updated_at=clock_timestamp() WHERE contact_id='${contact}';
      UPDATE cliente_atend_ia_agentes SET funil='${json({crm_ia:{tipo:'qualificacao',pipeline_id:pipeline,stage_ids:[next],variaveis:[],destino:{tipo:'humano'}}})}',updated_at=clock_timestamp() WHERE id='${agent}';
      INSERT INTO cliente_atend_ia_agentes(id,cliente_id,nome,ativo,auto_responder,created_by,funil) VALUES('${id(82)}','${client}','Retomada',true,true,'${admin}','${json({crm_ia:{tipo:'followup',pipeline_id:pipeline,stage_ids:[next],cadencia:[{valor:1,unidade:'horas'},{valor:1,unidade:'dias'}],destino:{tipo:'humano'}}})}');`);
    receive('typed-reply');
    const reply=await runCrmIaAgent({db,clientId:client,contactId:contact,channelId:channel,mode:'responder',messageId:'typed-reply',callModel:async()=>({resposta:'{"text":"Podemos seguir com seu atendimento.","action":{"type":"answer"}}',tokens:2})});
    assert.equal(reply.queued,true);
    assert.equal(sql("SELECT to_regprocedure('public.crm_ia_agent_note_api_echo(uuid,uuid,uuid,text,timestamp with time zone)') IS NOT NULL"),'t','early API echoes need exact receipt reconciliation');
    const payloads=[];await dispatchCrmIaQueue({db,ids:[reply.outbox_id],send:async payload=>{payloads.push(payload);
      const echoVersion=sql(`SELECT updated_at FROM cliente_atend_conversas WHERE contact_id='${contact}'`);
      assert.equal(rpc('crm_ia_agent_note_api_echo',`'${client}','${channel}','${contact}','receipt-typed','${echoVersion}'`),true);
      assert.equal(sql(`SELECT ia_pausada FROM cliente_atend_conversas WHERE contact_id='${contact}'`),'t','unproven API echo must pause conservatively');
      return{ok:true,messageId:'receipt-typed'};}});
    assert.equal(payloads.length,1);assert.equal(payloads[0].whatsapp_config_id,channel);
    assert.equal(sql(`SELECT ia_followup_due_at IS NOT NULL FROM cliente_atend_conversas WHERE contact_id='${contact}'`),'t','followup begins only after a delivery receipt');
    assert.equal(sql(`SELECT ia_pausada FROM cliente_atend_conversas WHERE contact_id='${contact}'`),'f','matching automation receipt must undo only its own provisional echo pause');
    sql(`UPDATE cliente_atend_conversas SET ia_followup_due_at=clock_timestamp()-interval '1 minute',crm_ia_runtime=jsonb_set(crm_ia_runtime,'{silence_started_at}',to_jsonb(clock_timestamp()-interval '2 hours')),updated_at=clock_timestamp() WHERE contact_id='${contact}'`);
    const retake=await runCrmIaAgent({db,clientId:client,contactId:contact,channelId:channel,mode:'followup',messageId:'typed-followup',callModel:async(model,messages)=>{assert.match(JSON.stringify(messages),/retomada no silêncio/);return{resposta:'{"text":"Ainda podemos ajudar com sua solicitação?","action":{"type":"answer"}}',tokens:2};}});
    assert.equal(retake.queued,true);
    let attempts=0;const ambiguous=async()=>{attempts++;throw Error('synthetic timeout');};
    await dispatchCrmIaQueue({db,ids:[retake.outbox_id],send:ambiguous});await dispatchCrmIaQueue({db,ids:[retake.outbox_id],send:ambiguous});
    assert.equal(attempts,1);assert.equal(sql(`SELECT status FROM crm_ia_outbox WHERE id='${retake.outbox_id}'`),'uncertain');
    assert.equal(sql(`SELECT ia_followup_due_at IS NULL FROM cliente_atend_conversas WHERE contact_id='${contact}'`),'t','uncertain followup cannot schedule another attempt');
    sql(`UPDATE cliente_atend_conversas SET ia_followup_due_at=clock_timestamp()-interval '1 minute',ia_followup_delivery_state='pending' WHERE contact_id='${contact}';
      UPDATE cliente_atend_ia_agentes SET funil=jsonb_set(funil,'{crm_ia,janelas}','[{"dias":[],"inicio":"09:00","fim":"18:00"}]') WHERE id='${id(82)}'`);
    const deferred=await runCrmIaAgent({db,clientId:client,contactId:contact,channelId:channel,mode:'followup',messageId:'outside-window',callModel:async()=>{throw Error('outside hours must not call model');}});
    assert.equal(deferred.skipped,'outside_hours');assert.equal(sql(`SELECT ia_followup_due_at>clock_timestamp() FROM cliente_atend_conversas WHERE contact_id='${contact}'`),'t','outside-hours jobs must yield their place to other due clients');
    sql(`UPDATE cliente_atend_ia_agentes SET funil=jsonb_set(funil,'{crm_ia,janelas}','[]') WHERE id='${id(82)}';
      UPDATE cliente_atend_conversas SET ia_followup_due_at=clock_timestamp()-interval '1 minute',ia_followup_delivery_state='pending',updated_at=clock_timestamp() WHERE contact_id='${contact}'`);
    await assert.rejects(()=>runCrmIaAgent({db,clientId:client,contactId:contact,channelId:channel,mode:'followup',messageId:'malformed-action',callModel:async()=>({resposta:'{"text":"Inválido","action":{"type":"drop"}}'})}),/invalid_action/);
    assert.equal(sql("SELECT status FROM planeje_private.crm_ia_agent_runs WHERE message_id='malformed-action'"),'failed','parse errors must close the whole generation lease');
    assert.equal(sql(`SELECT ia_followup_due_at IS NULL FROM cliente_atend_conversas WHERE contact_id='${contact}'`),'t','parse errors must clear the stale due row');
    sql(`UPDATE cliente_atend_conversas SET ia_followup_due_at=clock_timestamp()-interval '1 minute',ia_followup_delivery_state='pending',updated_at=clock_timestamp() WHERE contact_id='${contact}'`);
    const expiring=rpc('crm_ia_agent_intake',`'${client}','${channel}','${contact}','Olá'`);
    const lease=rpc('crm_ia_agent_begin',`'${client}','${channel}','${contact}','${expiring.lead.id}','${id(82)}','followup','expired-model','${json({actor_id:admin,config_revision:expiring.config.revision,lead_updated_at:expiring.lead.updated_at,conversation_updated_at:expiring.conversation.updated_at,agent_updated_at:sql(`SELECT updated_at FROM cliente_atend_ia_agentes WHERE id='${id(82)}'`)})}'`);
    assert.equal(lease.claimed,true);sql(`UPDATE planeje_private.crm_ia_agent_runs SET created_at=clock_timestamp()-interval '10 minutes' WHERE id='${lease.id}'`);
    assert.equal(rpc('crm_ia_legacy_delivery_recover','').agent_runs,1,'crashed model leases must expire without retrying');
    assert.equal(sql(`SELECT status FROM planeje_private.crm_ia_agent_runs WHERE id='${lease.id}'`),'failed');
    assert.equal(sql(`SELECT status FROM planeje_private.crm_ia_agent_runs WHERE id='${bookingJob.id}'`),'queued','cleanup must preserve an already committed action/outbox');
    receive('human-after-echo');
    const raced=await runCrmIaAgent({db,clientId:client,contactId:contact,channelId:channel,mode:'responder',messageId:'human-after-echo',callModel:async()=>({resposta:'{"text":"Resposta antes do humano.","action":{"type":"answer"}}'})});
    await dispatchCrmIaQueue({db,ids:[raced.outbox_id],send:async()=>{
      const version=sql(`SELECT updated_at FROM cliente_atend_conversas WHERE contact_id='${contact}'`);
      rpc('crm_ia_agent_note_api_echo',`'${client}','${channel}','${contact}','receipt-raced','${version}'`);
      sql(`UPDATE cliente_atend_conversas SET ia_pausada=true,updated_at=clock_timestamp()+interval '1 millisecond' WHERE contact_id='${contact}'`);
      return {ok:true,messageId:'receipt-raced'};
    }});
    assert.equal(sql(`SELECT ia_pausada FROM cliente_atend_conversas WHERE contact_id='${contact}'`),'t','receipt must never undo a later human intervention');
  } finally { if(started) run('pg_ctl',['-D',data,'-m','immediate','-w','stop']); rmSync(work,{recursive:true,force:true}); }
});

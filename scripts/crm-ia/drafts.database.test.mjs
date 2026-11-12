import assert from 'node:assert/strict';
import test from 'node:test';
import {execFile,spawnSync} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {promisify} from 'node:util';

const work=mkdtempSync('/tmp/crm-drafts-db-'),data=join(work,'data'),env={PATH:process.env.PATH,LC_ALL:'C'};
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const context=Object.fromEntries(['admin','staff','other','client','foreign','channel','hiddenChannel','contact'].map((key,i)=>[key,id([1,2,3,11,12,21,22,31][i])]));
const {admin,staff,client,foreign,channel,hiddenChannel,contact}=context,editor=id(4),pipeline=id(41),stage=id(51);
const quote=value=>`'${JSON.stringify(value).replaceAll("'","''")}'::jsonb`;
const literal=value=>value===null?'NULL':typeof value==='object'?quote(value):typeof value==='boolean'||typeof value==='number'?String(value):`'${String(value).replaceAll("'","''")}'`;
function run(name,args,input){const r=spawnSync(name,args,{input,env,encoding:'utf8',timeout:20000});if(r.error||r.status)throw new Error(r.stderr||r.error?.message);return r.stdout.trim();}
const sql=input=>run('psql',['-X','-Aqt','-v','ON_ERROR_STOP=1','-h',work,'-p','55500','-U','draft_qa','-d','postgres'],input);
const call=(action,payload={},uid=admin,scope=client)=>JSON.parse(sql(`BEGIN;SET LOCAL ROLE authenticated;SET LOCAL test.uid='${uid}';SELECT public.crm_ia_workspace('${action}','${scope}',${quote(payload)});COMMIT;`));
const rpc=(name,args)=>JSON.parse(sql(`SET ROLE service_role;SELECT to_jsonb(public.${name}(${Object.entries(args).map(([key,value])=>`${key}=>${literal(value)}`).join(',')}));`));
const asyncExec=promisify(execFile);
const settings={enabled:true,input_enabled:false,voice:'alloy',speed:1};

test('rascunhos isolam editor/cliente, CAS e publicação; mirror revalida inbox antes do custo',async()=>{
 let started=false;
 try{
  run('initdb',['-D',data,'-U','draft_qa','--auth-local=trust','--auth-host=reject','--no-locale','--encoding=UTF8']);
  run('pg_ctl',['-D',data,'-l',join(work,'pg.log'),'-o',`-k ${work} -p 55500 -c listen_addresses='' -c unix_socket_permissions=0700`,'-w','start']);started=true;
  const fixture=readFileSync(new URL('./workspace.database.test.mjs',import.meta.url),'utf8').split('    sql(`')[1].split('    `);')[0].replace(/\$\{(\w+)\}/g,(_,name)=>context[name]);
  sql(fixture.replace(/      CREATE TABLE public\.crm_ia_outbox\([^\n]+\n/,''));
  sql(`CREATE SCHEMA planeje_private;CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid);
   CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT jsonb_build_object('sub',auth.uid())$$;
   INSERT INTO profiles(id,role,status) VALUES('${editor}','admin','active');
   ALTER TABLE cliente_atend_ia_agentes ADD CONSTRAINT cliente_atend_ia_agentes_tom_check CHECK(tom IN('cordial','formal','descontraido'));
   ALTER TABLE cliente_whatsapp_contact ADD COLUMN last_message_at timestamptz,ADD COLUMN origin_source text DEFAULT 'nao_identificado',ADD COLUMN qualificado boolean;
   ALTER TABLE leads ADD COLUMN qualificado boolean;ALTER TABLE cliente_atend_conversas ADD COLUMN ia_followup_passo integer DEFAULT 0;
   CREATE TABLE atendimento_conversas(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cliente_id uuid,whatsapp_config_id uuid,chat_jid text,archived_at timestamptz,bloqueada boolean DEFAULT false,is_group boolean DEFAULT false,display_name text,status text DEFAULT 'aguardando',fila_id uuid,assigned_to uuid,last_message_at timestamptz,last_customer_message_at timestamptz,awaiting_response_since timestamptz,unread_count integer DEFAULT 0,last_message_preview text,profile_pic_url text,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now(),UNIQUE(cliente_id,whatsapp_config_id,chat_jid));
   CREATE TABLE atendimento_conversa_planejamento(id uuid PRIMARY KEY,cliente_id uuid,conversation_id uuid,whatsapp_config_id uuid,chat_jid text,kind text,body text,status text,scheduled_at timestamptz,completed_at timestamptz,error_message text,updated_at timestamptz DEFAULT now());
   GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;`);
  sql(readFileSync(new URL('../../supabase/migrations/20260928230000_cliente_atend_inbox.sql', import.meta.url), 'utf8').match(/create or replace function public\.cliente_atend_touch_updated_at\([\s\S]*?\$\$;/i)[0]);
    sql('CREATE TRIGGER cliente_atend_conversas_touch BEFORE UPDATE ON public.cliente_atend_conversas FOR EACH ROW EXECUTE FUNCTION public.cliente_atend_touch_updated_at()');
    for (const file of ['20261111041703_crm_ia_delivery_runtime.sql','20261111041704_crm_ia_workspace.sql','20261111043800_crm_ia_workspace_readings.sql','20261111044652_crm_ia_agent_runtime.sql','20261111062101_crm_ia_calendar.sql','20261111062548_crm_ia_voice.sql','20261111072502_crm_ia_calendar_delivery.sql','20261111075558_crm_ia_agent_template_contract.sql','20261111090001_crm_ia_appointment_actions.sql','20261111090002_crm_ia_agent_drafts_voice_modes.sql','20261111090003_crm_ia_lead_tags.sql','20261111101501_crm_ia_lead_profiles.sql','20261111101502_crm_ia_lead_reads.sql','20261111120001_crm_ia_internal_notifications.sql','20261111120002_crm_ia_conversation_controls.sql','20261111162400_crm_ia_conversation_read_performance.sql'])sql(readFileSync(new URL(`../../supabase/migrations/${file}`,import.meta.url),'utf8'));
  sql(`INSERT INTO crm_pipelines(id,cliente_id,nome) VALUES('${pipeline}','${client}','Fixture');INSERT INTO crm_stages(id,pipeline_id,nome) VALUES('${stage}','${pipeline}','Entrada');
   INSERT INTO crm_ia_config(cliente_id,data,updated_by) VALUES('${client}',${quote({attendance:{auto_send:true},entry:{enabled:true,channels:[{channel_id:channel,enabled:true,mode:'all',pipeline_id:pipeline,stage_id:stage}]}})},'${admin}');`);
  const scope={tipo:'qualificacao',pipeline_id:pipeline},rules={tipo:'qualificacao',pipeline_id:pipeline,stage_ids:[stage]};
  const first=call('agent_draft',scope);assert.equal(first.draft,null);assert.ok(first.revision);
  const incomplete=call('save_agent_draft',{...scope,revision:first.revision,data:{nome:'',auto_responder:true,funil:{crm_ia:{...rules,audio:{...settings,mode:'mirror'}}}}});
  assert.equal(sql('SELECT count(*) FROM cliente_atend_ia_agentes'),'0');assert.equal(sql('SELECT count(*) FROM planeje_private.crm_ia_voice_authorizations'),'0');
  assert.equal(call('agent_draft',scope,editor).draft,null);
  assert.throws(()=>call('agent_draft',scope,staff),/gestão|acesso/i);
  assert.throws(()=>call('agent_draft',scope,admin,foreign),/funil|acesso/i);
  assert.throws(()=>call('save_agent_draft',{...scope,revision:first.revision,data:{nome:'tardio'}}),/versão|rascunho|alterad/i);
  assert.throws(()=>call('publish_agent_draft',{...scope,revision:incomplete.revision}),/nome|identidade/i);
  assert.ok(call('agent_draft',scope).draft);
  const ready=call('save_agent_draft',{...scope,revision:incomplete.revision,data:{nome:'Agente publicado',tom:'entusiasmado',ativo:true,auto_responder:true,funil:{crm_ia:{...rules,audio:{...settings,mode:'mirror'}}}}});
  assert.throws(()=>sql(`BEGIN;SET LOCAL ROLE authenticated;SET LOCAL test.uid='${admin}';SELECT public.crm_ia_workspace(NULL,'${client}',${quote({...scope,revision:ready.revision})});COMMIT;`),/ação|action/i);
  const published=call('publish_agent_draft',{...scope,revision:ready.revision});let agent=published.agent;
  assert.equal(agent.tom,'entusiasmado');assert.equal(agent.funil.crm_ia.audio.mode,'mirror');
  assert.equal(sql(`SELECT agent_updated_at='${agent.updated_at}'::timestamptz FROM planeje_private.crm_ia_voice_authorizations WHERE agent_id='${agent.id}'`),'t');
  assert.throws(()=>call('publish_agent_draft',{...scope,revision:ready.revision}),/versão|rascunho|alterad/i);
  assert.throws(()=>call('save_agent_draft',{...scope,revision:ready.revision,data:{nome:'ressuscitado'}}),/versão|rascunho|alterad/i);
  assert.equal(sql('SELECT count(*) FROM cliente_atend_ia_agentes'),'1');
  const target={agent_id:agent.id},opened=call('agent_draft',target);
  const costProof=sql(`SELECT to_jsonb(v) FROM planeje_private.crm_ia_voice_authorizations v WHERE agent_id='${agent.id}'`),configRevision=sql(`SELECT revision FROM crm_ia_config WHERE cliente_id='${client}'`);
  const saved=call('save_agent_draft',{...target,revision:opened.revision,data:{nome:'Privado não publicado'}});
  assert.equal(call('agent_draft',target).draft.payload.nome,'Privado não publicado');assert.equal(call('agent_draft',target,editor).draft,null);
  assert.equal(sql(`SELECT nome FROM cliente_atend_ia_agentes WHERE id='${agent.id}'`),'Agente publicado');
  assert.equal(sql(`SELECT to_jsonb(v) FROM planeje_private.crm_ia_voice_authorizations v WHERE agent_id='${agent.id}'`),costProof);
  assert.equal(sql(`SELECT revision FROM crm_ia_config WHERE cliente_id='${client}'`),configRevision);
  assert.throws(()=>call('save_agent_draft',{...target,revision:saved.revision,data:{nome:'Outro editor'}},editor),/versão|rascunho|alterad/i);
  const race=await Promise.allSettled(['A','B'].map(name=>asyncExec('psql',['-X','-Aqt','-v','ON_ERROR_STOP=1','-h',work,'-p','55500','-U','draft_qa','-d','postgres','-c',
   `BEGIN;SET LOCAL ROLE authenticated;SET LOCAL test.uid='${admin}';SELECT public.crm_ia_workspace('save_agent_draft','${client}',${quote({...target,revision:saved.revision,data:{nome:`Concorrência ${name}`}})});COMMIT;`],{env,timeout:20000})));
  assert.equal(race.filter(result=>result.status==='fulfilled').length,1);assert.equal(race.filter(result=>result.status==='rejected').length,1);
  const winner=call('agent_draft',target);assert.match(winner.draft.payload.nome,/Concorrência [AB]/);
  call('discard_agent_draft',{...target,revision:winner.revision});
  assert.throws(()=>call('save_agent_draft',{...target,revision:saved.revision,data:{nome:'atrasado'}}),/versão|rascunho|alterad/i);
  const reopened=call('agent_draft',target),stale=call('save_agent_draft',{...target,revision:reopened.revision,data:{nome:'Base antiga'}});
  agent=call('save_agent',{id:agent.id,expected_updated_at:agent.updated_at,nome:'Outro editor'});
  assert.throws(()=>call('publish_agent_draft',{...target,revision:stale.revision}),/versão|publicad|alterad/i);
  assert.equal(call('agent_draft',target).draft.payload.nome,'Base antiga');
  assert.throws(()=>call('agent_draft',target,admin,foreign),/acesso|indisponível/i);
  assert.equal(sql("SELECT has_table_privilege('authenticated','planeje_private.crm_ia_agent_drafts','select')"),'f');
  assert.equal(sql("SELECT has_function_privilege('authenticated','public.crm_ia_workspace_pre_agent_drafts(text,uuid,jsonb)','execute')"),'f');
  // Legacy JSON is retained byte-for-byte, including its cost authorization settings.
  agent=call('save_agent',{id:agent.id,expected_updated_at:agent.updated_at,tom:'descontraido',funil:{crm_ia:{...rules,audio:settings}}});
  assert.deepEqual(agent.funil.crm_ia.audio,settings);
  agent=call('save_agent',{id:agent.id,expected_updated_at:agent.updated_at,tom:'direto',funil:{crm_ia:{...rules,audio:{...settings,mode:'mirror'}}}});
  const prepare=(message,type='audio',proofPatch={})=>{
   sql(`UPDATE cliente_atend_conversas SET ia_pausada=false,status='em_atendimento',updated_at=clock_timestamp() WHERE contact_id='${contact}';
    INSERT INTO cliente_whatsapp_inbox(cliente_id,whatsapp_config_id,from_jid,chat_jid,body,type,message_id) VALUES('${client}','${channel}','551199999999@s.whatsapp.net','551199999999@s.whatsapp.net','Mensagem','${type}','${message}');`);
   const inbox=JSON.parse(sql(`SELECT to_jsonb(i) FROM cliente_whatsapp_inbox i WHERE message_id='${message}'`));
   const intake=rpc('crm_ia_agent_intake',{p_client:client,p_channel:channel,p_contact:contact,p_text:'Mensagem'});
   const args={p_client:client,p_channel:channel,p_contact:contact,p_lead:intake.lead.id,p_agent:agent.id,p_mode:'responder',p_message:message,
    p_expected:{config_revision:intake.config.revision,lead_updated_at:intake.lead.updated_at,conversation_updated_at:intake.conversation.updated_at,agent_updated_at:agent.updated_at,actor_id:admin,source_inbox_id:inbox.id,source_message_id:message,source_message_type:type}};
   const job=rpc('crm_ia_agent_begin',args);assert.equal(job.claimed,true);
   const reply=rpc('crm_ia_apply_agent_action',{p_run:job.id,p_action:{type:'answer'},p_reply:'Resposta',p_followup:{}});
   if(Object.keys(proofPatch).length)sql(`UPDATE planeje_private.crm_ia_agent_runs SET snapshot=snapshot||${quote(proofPatch)} WHERE id='${job.id}'`);
   return {id:reply.outbox_id,inbox,run:job.id};
  };
  const mirrored=prepare('mirror-audio');assert.equal(JSON.parse(sql(`SELECT private.crm_ia_voice_settings('${mirrored.id}')`)).mode,'mirror');
  const textOnly=prepare('mirror-text-only','text');
  const textClaim=JSON.parse(sql(`SET ROLE service_role;SELECT public.crm_ia_delivery_claim(p_ids=>ARRAY['${textOnly.id}']::uuid[])`))[0];assert.ok(textClaim);
  const textTarget=rpc('crm_ia_delivery_recheck',{p_id:textOnly.id,p_claim_token:textClaim.claim_token});assert.equal(textTarget.allowed,true);assert.equal(textTarget.voice,undefined);
  for(const [message,type,patch]of [['text','text',{}],['wrong-channel','audio',{source_inbox_id:id(999)}],['wrong-id','audio',{source_message_id:'other'}],['wrong-type','audio',{source_message_type:'text'}]]){
   const item=prepare(message,type,patch);assert.equal(sql(`SELECT private.crm_ia_voice_settings('${item.id}') IS NULL`),'t');
  }
  for(const alias of ['voicemessage','audiomessage','voicenote']){const item=prepare(`alias-${alias}`,alias);assert.equal(sql(`SELECT private.crm_ia_voice_settings('${item.id}') IS NOT NULL`),'t');}
  const old=prepare('old-valid-audio'),newText=prepare('new-text-source','text',{source_inbox_id:old.inbox.id,source_message_id:'old-valid-audio',source_message_type:'audio'});
  assert.equal(sql(`SELECT private.crm_ia_voice_settings('${newText.id}') IS NULL`),'t');
  for(const raw of [{fromMe:true},{message:{from_me:'true'}}]){const item=prepare(`echo-${JSON.stringify(raw).length}`);sql(`UPDATE cliente_whatsapp_inbox SET raw_payload=${quote(raw)} WHERE id='${item.inbox.id}'`);assert.equal(sql(`SELECT private.crm_ia_voice_settings('${item.id}') IS NULL`),'t');}
  const followup=prepare('followup-source');
  sql(`UPDATE planeje_private.crm_ia_agent_runs SET mode='followup' WHERE id='${followup.run}';UPDATE cliente_atend_conversas SET crm_ia_runtime=crm_ia_runtime||${quote({source_inbox_id:followup.inbox.id,source_message_id:'followup-source',source_message_type:'audio'})} WHERE contact_id='${contact}'`);
  assert.equal(sql(`SELECT private.crm_ia_voice_settings('${followup.id}') IS NOT NULL`),'t');
  sql(`UPDATE cliente_atend_conversas SET crm_ia_runtime=crm_ia_runtime||'{"source_message_id":"changed"}' WHERE contact_id='${contact}'`);
  assert.equal(sql(`SELECT private.crm_ia_voice_settings('${followup.id}') IS NULL`),'t');
  sql(`UPDATE cliente_whatsapp_inbox SET whatsapp_config_id='${hiddenChannel}' WHERE id='${mirrored.inbox.id}'`);
  assert.equal(sql(`SELECT private.crm_ia_voice_settings('${mirrored.id}') IS NULL`),'t');
  const cost=prepare('mirror-cost-proof'),costClaim=JSON.parse(sql(`SET ROLE service_role;SELECT public.crm_ia_delivery_claim(p_ids=>ARRAY['${cost.id}']::uuid[])`))[0];assert.ok(costClaim);
  assert.equal(rpc('crm_ia_delivery_recheck',{p_id:cost.id,p_claim_token:costClaim.claim_token}).voice.mode,'mirror');
  sql(`DELETE FROM planeje_private.crm_ia_voice_authorizations WHERE agent_id='${agent.id}'`);
  assert.equal(rpc('crm_ia_voice_begin',{p_id:cost.id,p_claim_token:costClaim.claim_token}).allowed,false);
 }finally{if(started)run('pg_ctl',['-D',data,'-m','immediate','-w','stop']);rmSync(work,{recursive:true,force:true});}
});

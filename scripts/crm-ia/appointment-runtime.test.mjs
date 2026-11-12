import assert from 'node:assert/strict';
import test from 'node:test';
import {build} from 'esbuild';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
const folder=await mkdtemp(join(tmpdir(),'crm-appointment-runtime-')),output=join(folder,'runtime.mjs');
await build({entryPoints:['supabase/functions/_shared/crmIaRuntime.ts'],outfile:output,bundle:true,format:'esm',platform:'node'});
const {runCrmIaAgent}=await import(pathToFileURL(output));
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const clientId=id(11),contactId=id(31),channelId=id(21),ownerId=id(1),agentId=id(81),appointmentId=id(91),stamp='2026-11-11T10:00:00Z';
function fixture({noShow=false,followup=false,ambiguous=false}={}){
 const calls=[],source={id:id(101),message_id:'inbound-real',type:'voicenote',body:'[Áudio]',from_jid:'5511000000000@s.whatsapp.net',chat_jid:'5511000000000@s.whatsapp.net',created_at:stamp};
 const rules={tipo:followup?'followup':'agendamento',pipeline_id:id(41),stage_ids:[id(51)],agendamento:{owner_id:id(2)}};
 const agent={id:agentId,nome:'Concierge QA',modelo:'openai/gpt-4o-mini',ativo:true,auto_responder:true,updated_at:stamp,funil:{crm_ia:rules}};
 const lead={id:id(61),pipeline_id:rules.pipeline_id,stage_id:rules.stage_ids[0],responsavel_id:ownerId,updated_at:stamp};
 const marker={state:'pending',appointment_id:appointmentId,appointment_updated_at:stamp,agent_id:agentId,actor_id:ownerId};
 const conversation={id:id(71),updated_at:stamp,crm_ia_runtime:{source_inbox_id:source.id,source_message_id:source.message_id,source_message_type:source.type,...(noShow?{no_show:marker}:{})}};
 const contact={id:contactId,from_jid:'5511000000000@s.whatsapp.net'},config={revision:id(201),data:{attendance:{auto_send:true},concierge:{enabled:true,mode:'always',base_id:id(301),appointment_confirm:true,appointment_reschedule:true,appointment_cancel:true,no_show_recovery:true},availability:{timezone:'America/Sao_Paulo'}}};
 const appointment={id:appointmentId,title:'Consulta QA',start_at:'2026-11-15T15:00:00Z',end_at:'2026-11-15T15:30:00Z',updated_at:stamp,status:'scheduled',owner_id:ownerId};
 const rows={cliente_atend_ia_agentes:[agent],crm_ia_config:[config],cliente_whatsapp_contact:[contact],cliente_whatsapp_config:[{id:channelId}],leads:[lead],cliente_atend_conversas:[conversation],cliente_whatsapp_inbox:[source],cliente_whatsapp_sent:[],clientes:[{empresa:'QA'}],cliente_atend_ia_bases:[{id:id(301),nome:'FAQ',conteudo:'Base QA'}]};
 const slots=[{start_at:'2026-11-16T15:00:00Z',end_at:'2026-11-16T15:30:00Z'}];
 const db={from(table){let single=false;const q={select(){return q;},eq(){return q;},is(){return q;},or(){return q;},order(){return q;},limit(){return q;},in(){return q;},insert(){return q;},update(){return q;},maybeSingle(){single=true;return q;},then(resolve,reject){const values=rows[table]||[];return Promise.resolve({data:single?values[0]||null:values}).then(resolve,reject);}};return q;},async rpc(name,args){calls.push({name,args});
  if(name==='crm_ia_agent_intake')return{data:{lead,conversation,contact,config,actor_id:ownerId}};
  if(name==='crm_ia_audio_context')return{data:[{inbox_id:source.id,transcript:'Quero remarcar'}]};
  if(name==='crm_ia_agent_begin')return{data:{claimed:true,id:id(401)}};
  if(name==='crm_ia_appointment_context')return{data:{rows:[appointment,...(ambiguous?[{...appointment,id:id(92)}]:[])],proposal:null}};
  if(name==='crm_ia_appointment_slots')return{data:{rows:slots}};
  if(name==='crm_ia_apply_agent_action')return{data:{queued:true,action:args.p_action.type}};
  if(name==='crm_ia_agent_fail')return{data:null};
  assert.fail(name);
 }};
 return{db,calls,source,conversation,slots,appointment,rows,async execute(options={}){return runCrmIaAgent({db,clientId,channelId,contactId,messageId:source.message_id,mode:noShow||followup?'followup':'responder',now:'2026-11-11T15:00:00Z',processAudioInput:async()=>({ok:true,transcript:'Quero remarcar'}),refreshCalendar:async args=>{calls.push({name:'busy',args});return{required:true,fresh:true};},callModel:async(_model,messages)=>{calls.push({name:'model',messages});return{resposta:JSON.stringify({text:'Proposta do modelo',action:{type:'appointment_propose',operation:'reschedule',appointment_id:appointmentId,...slots[0]}})};},...options});}};
}
test('origem real compõe snapshot e remarcação usa owner antigo e ignora apenas compromisso escolhido',async()=>{
 const f=fixture();await f.execute();const begin=f.calls.find(c=>c.name==='crm_ia_agent_begin').args;
 assert.equal(begin.p_expected.source_inbox_id,f.source.id);assert.equal(begin.p_expected.source_message_id,f.source.message_id);assert.equal(begin.p_expected.source_message_type,'voicenote');
 assert.equal(begin.p_expected.concierge,true);assert.equal(f.calls.find(c=>c.name==='busy').args.ownerId,ownerId);
 const slots=f.calls.find(c=>c.name==='crm_ia_appointment_slots').args;assert.equal(slots.p_appointment,appointmentId);assert.equal(slots.p_expected,stamp);
 assert.ok(f.calls.findIndex(c=>c.name==='crm_ia_agent_begin')<f.calls.findIndex(c=>c.name==='busy'));
 assert.doesNotMatch(f.calls.find(c=>c.name==='model').messages[0].content,/owner_id/);
 assert.equal(f.calls.find(c=>c.name==='crm_ia_apply_agent_action').args.p_action.type,'appointment_propose');
});
test('followup usa source persistida; recuperação no_show não consome modelo nem anuncia reserva',async()=>{
 const f=fixture({followup:true});await f.execute({callModel:async()=>({resposta:'{"text":"Retomada","action":{"type":"answer"}}'})});
 assert.equal(f.calls.find(c=>c.name==='crm_ia_agent_begin').args.p_expected.source_inbox_id,f.source.id);
 const recovery=fixture({noShow:true});const result=await recovery.execute({callModel:async()=>assert.fail('no model for a one-shot recovery')});
 assert.equal(result.action,'no_show_recover');assert.equal(recovery.calls.some(c=>c.name==='busy'),false);assert.equal(recovery.calls.find(c=>c.name==='crm_ia_agent_begin').args.p_expected.purpose,'no_show');
});
test('origem trocada, ambiguidade e preview não causam alterações',async()=>{
 const stale=fixture();assert.equal((await stale.execute({messageId:'old'})).skipped,'source_message_changed');assert.equal(stale.calls.length,0);
 const wrongJid=fixture();wrongJid.source.chat_jid='5511000000001@s.whatsapp.net';assert.equal((await wrongJid.execute()).skipped,'source_jid_changed');assert.equal(wrongJid.calls.length,0);
 const ambiguous=fixture({ambiguous:true});await ambiguous.execute();assert.equal(ambiguous.calls.find(c=>c.name==='crm_ia_apply_agent_action').args.p_action.type,'handoff');
 const preview=fixture();await preview.execute({mode:'testar',agentId,previewMessages:[{role:'user',content:'Olá'}],callModel:async()=>({resposta:'{"text":"Teste","action":{"type":"answer"}}'})});
 assert.equal(preview.calls.some(c=>c.name==='crm_ia_agent_begin'||c.name==='crm_ia_apply_agent_action'||c.name==='busy'),false);
});
test.after(()=>rm(folder,{recursive:true,force:true}));

import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
const folder=await mkdtemp('/tmp/planeje-concierge-runtime-'),output=join(folder,'runtime.mjs');
await build({entryPoints:['supabase/functions/_shared/crmIaRuntime.ts'],outfile:output,bundle:true,format:'esm',platform:'node'});
const {runCrmIaAgent}=await import(pathToFileURL(output));
after(()=>rm(folder,{recursive:true,force:true}));
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,stamp='2026-11-12T10:00:00Z';
const client=id(1),channel=id(2),contact=id(3),owner=id(4),agentId=id(5),pipeline=id(6),entry=id(7),waiting=id(8),appointment=id(9),run=id(10);
function fixture({settings={},regular=false,body='Olá',appointments=1}={}) {
  const calls=[];
  const rules={tipo:'qualificacao',pipeline_id:pipeline,stage_ids:[entry],variaveis:[{nome:'CANARY_VARIABLE'}],profiles:[{id:'known-profile'}],gatilhos:['gatilho emprestado'],desinteresse:'humano',janelas:[]};
  const agent={id:agentId,ativo:true,auto_responder:true,updated_at:stamp,nome:'Transporte QA',modelo:'openai/gpt-4o-mini',instrucoes:'CANARY_INSTRUCTION',funil:{crm_ia:rules}};
  const lead={id:id(11),cliente_id:client,pipeline_id:pipeline,stage_id:regular?entry:waiting,responsavel_id:owner,updated_at:stamp};
  const person={id:contact,cliente_id:client,from_jid:'5511000000000@s.whatsapp.net'};
  const conversation={id:id(12),cliente_id:client,contact_id:contact,updated_at:stamp,crm_ia_runtime:{}};
  const config={revision:id(13),data:{attendance:{auto_send:true},concierge:{enabled:true,mode:'always',base_id:id(14),faq_enabled:true,handoff_enabled:true,...settings},availability:{timezone:'America/Sao_Paulo'}}};
  const source={id:id(15),message_id:'message-qa',body,type:'text',from_jid:person.from_jid,chat_jid:person.from_jid,created_at:stamp};
  const appointmentRows=Array.from({length:appointments},(_,i)=>({id:i? id(20+i):appointment,title:`Compromisso verificado ${i+1}`,start_at:`2026-11-${15+i}T15:00:00Z`,end_at:`2026-11-${15+i}T15:30:00Z`,status:'scheduled',owner_id:owner,updated_at:stamp}));
  const slots=[{start_at:'2026-11-17T15:00:00Z',end_at:'2026-11-17T15:30:00Z'}];
  const rows={cliente_atend_ia_agentes:[agent],crm_ia_config:[config],cliente_whatsapp_contact:[person],cliente_whatsapp_config:[{id:channel}],leads:[lead],cliente_atend_conversas:[conversation],cliente_whatsapp_inbox:[source],cliente_whatsapp_sent:[],clientes:[{empresa:'Empresa QA'}],cliente_atend_ia_bases:[{id:id(14),nome:'Base QA',conteudo:'CANARY_KNOWLEDGE'}],crm_produtos:[{name:'CANARY_CATALOG'}],crm_servicos:[],cliente_atend_ia_log:[]};
  const db={from(table){assert.ok(Object.hasOwn(rows,table),`Unexpected table ${table}`);calls.push({name:'table',table});let single=false;const ordering=[];const q={select(){return q;},eq(){return q;},is(){return q;},or(){return q;},in(){return q;},order(key){ordering.push(key);return q;},limit(){return q;},insert(value){calls.push({name:'insert',table,value});return q;},update(value){calls.push({name:'update',table,value});return q;},maybeSingle(){single=true;return q;},then(resolve,reject){return Promise.resolve({data:single?rows[table][0]||null:[...rows[table]].sort((a,b)=>{for(const key of ordering){const comparison=String(a[key]??'').localeCompare(String(b[key]??''));if(comparison)return comparison;}return 0;})}).then(resolve,reject);}};return q;},async rpc(name,args){ if (name === 'crm_ia_runtime_access') return { data: { allowed: true }, error: null };calls.push({name,args});
    if(name==='crm_ia_agent_intake')return{data:{lead,conversation,contact:person,config,actor_id:owner}};
    if(name==='crm_ia_audio_context')return{data:[{inbox_id:source.id,transcript:'Transcrição sintética'}]};
    if(name==='crm_ia_agent_begin')return{data:{claimed:true,id:run}};
    if(name==='crm_ia_appointment_context')return{data:{rows:appointmentRows,proposal:null}};
    if(name==='crm_ia_appointment_slots'||name==='crm_ia_appointment_slots_for_run')return{data:{rows:slots}};
    if(name==='crm_ia_apply_agent_action')return{data:{queued:true,action:args.p_action.type}};
    if(name==='crm_ia_agent_fail')return{data:null};
    assert.fail(`Unexpected RPC ${name}`);
  }};
  return {calls,config,rows,slots,appointmentRows,execute:({action={type:'answer'},text='Resposta sintética',callModel,refreshCalendar,processAudioInput}={})=>runCrmIaAgent({db,clientId:client,channelId:channel,contactId:contact,messageId:source.message_id,mode:'responder',now:'2026-11-12T15:00:00Z',processAudioInput,callModel:callModel|| (async(_model,messages)=>{calls.push({name:'model',messages});return{resposta:JSON.stringify({text,action})};}),refreshCalendar:refreshCalendar|| (async args=>{calls.push({name:'busy',args});return{required:true,fresh:true};})})};
}
const applied=f=>f.calls.find(call=>call.name==='crm_ia_apply_agent_action')?.args;

test('Qualificação com agenda Sempre mantém contrato de variáveis e papel regular',async()=>{
  const f=fixture({regular:true,settings:{appointment_confirm:true}});await f.execute();
  const prompt=f.calls.find(call=>call.name==='model').messages[0].content;
  assert.match(prompt,/CANARY_VARIABLE|CANARY_INSTRUCTION/);assert.doesNotMatch(prompt,/Você atua como Concierge/);
  assert.equal(f.calls.find(call=>call.name==='crm_ia_agent_begin').args.p_expected.concierge_role,false);
});
test('Concierge fora da etapa declara papel no claim sem usar catálogo comercial',async()=>{
  const f=fixture();await f.execute();
  assert.equal(f.calls.find(call=>call.name==='crm_ia_agent_begin').args.p_expected.concierge_role,true);
  assert.equal(f.calls.some(call=>call.table==='crm_produtos'||call.table==='crm_servicos'),false);
});
test('FAQ desligada permite agenda sem ler base e recusa texto livre do modelo',async()=>{
  const f=fixture({settings:{faq_enabled:false,appointment_confirm:true}});
  await assert.rejects(f.execute({text:'CANARY_UNTRUSTED'}),/crm_ia_concierge_faq_disabled/);
  assert.equal(f.calls.some(call=>call.table==='cliente_atend_ia_bases'),false);assert.equal(applied(f),undefined);
});
test('agenda desligada não consulta contexto ou slots',async()=>{
  const f=fixture();await f.execute();
  assert.equal(f.calls.some(call=>['crm_ia_appointment_context','crm_ia_appointment_slots','crm_ia_appointment_slots_for_run','busy'].includes(call.name)),false);
});
test('operação de remarcação desligada recusa antes de consultar calendário',async()=>{
  const f=fixture({settings:{appointment_confirm:true}});
  await assert.rejects(f.execute({action:{type:'appointment_propose',operation:'reschedule',appointment_id:appointment,...f.slots[0]}}),/crm_ia_appointment_unavailable/);
  assert.equal(f.calls.some(call=>['busy','crm_ia_appointment_slots','crm_ia_appointment_slots_for_run'].includes(call.name)),false);assert.equal(applied(f),undefined);
});
test('resposta do Concierge não carrega campos, perfil ou resumo do agente emprestado',async()=>{
  for(const extra of [{values:{CANARY_VARIABLE:'x'}},{values:null},{profile_id:'known-profile'},{summary:'CANARY_SUMMARY'}]){
    const f=fixture();await assert.rejects(f.execute({action:{type:'answer',...extra}}),/crm_ia_concierge/);assert.equal(applied(f),undefined);
  }
});
test('motivo técnico inventado pelo modelo não contorna repasse desligado',async()=>{
  const f=fixture({settings:{handoff_enabled:false}});
  await assert.rejects(f.execute({action:{type:'handoff',reason:'calendar_unavailable'}}),/crm_ia_concierge_handoff_disabled/);assert.equal(applied(f),undefined);
});
test('somente recuperação não gera resposta inbound ou agenda',async()=>{
  const f=fixture({settings:{faq_enabled:false,handoff_enabled:false,no_show_recovery:true}});
  const result=await f.execute({callModel:async()=>assert.fail('No chat model for no-show-only inbound')});
  assert.equal(result.skipped,'concierge_no_inbound_capabilities');assert.equal(applied(f),undefined);assert.equal(f.calls.some(call=>call.name==='crm_ia_agent_begin'),false);
});
test('opt-out no Concierge fecha sem herdar desinteresse humano nem chamar modelo',async()=>{
  const f=fixture({body:'Não tenho interesse. Pode parar de enviar.',settings:{faq_enabled:false,handoff_enabled:false}});
  await f.execute({callModel:async()=>assert.fail('Opt-out is deterministic')});assert.equal(applied(f)?.p_action.type,'close');assert.equal(applied(f)?.p_reply,'');
});
test('repasse determinístico usa só frases publicadas do Concierge',async()=>{
  const f=fixture({body:'Quero falar com a equipe',settings:{faq_enabled:false,handoff_phrases:['falar com a equipe']}});
  await f.execute({callModel:async()=>assert.fail('Handoff is deterministic')});assert.equal(applied(f)?.p_action.type,'handoff');
  const borrowed=fixture({body:'gatilho emprestado',settings:{faq_enabled:false}});assert.equal((await borrowed.execute({callModel:async()=>assert.fail('Borrowed trigger must not act')})).skipped,'concierge_no_inbound_capabilities');
});
test('pergunta de agenda sem FAQ usa somente texto produzido pelo servidor',async()=>{
  for(const question of ['choose_appointment','choose_operation','date']) {
    const f=fixture({settings:{faq_enabled:false,appointment_reschedule:true}});
    await f.execute({text:'CANARY_UNTRUSTED',action:{type:'appointment_question',question}});
    assert.equal(applied(f)?.p_action.type,'answer');assert.ok(applied(f)?.p_reply);assert.doesNotMatch(applied(f)?.p_reply,/CANARY_UNTRUSTED|00000000/);
  }
});
test('sem compromisso pergunta de agenda não inventa registro ou repasse',async()=>{
  const f=fixture({appointments:0,settings:{faq_enabled:false,appointment_confirm:true}});
  await f.execute({action:{type:'appointment_question',question:'choose_appointment'}});
  assert.equal(applied(f)?.p_action.type,'answer');assert.match(applied(f)?.p_reply,/Não encontrei compromissos/);
});
test('slots do papel Concierge são vinculados ao run real',async()=>{
  const f=fixture({settings:{faq_enabled:false,appointment_reschedule:true}});
  await f.execute({action:{type:'slots',appointment_id:appointment,date:'2026-11-17'},text:'CANARY_UNTRUSTED'});
  const slots=f.calls.find(call=>call.name==='crm_ia_appointment_slots_for_run');assert.equal(slots?.args.p_run,run);assert.equal(slots?.args.p_appointment,appointment);
  assert.equal(f.calls.some(call=>call.name==='crm_ia_appointment_slots'),false);assert.doesNotMatch(applied(f)?.p_reply,/CANARY_UNTRUSTED/);
});
test('Concierge não consulta calendário sem compromisso autorizado no pedido de slots',async()=>{
  for(const appointment_id of [undefined,id(999)]){
    const f=fixture({settings:{faq_enabled:false,appointment_reschedule:true}});
    await assert.rejects(f.execute({action:{type:'slots',date:'2026-11-17',...(appointment_id?{appointment_id}:{})}}),/crm_ia_appointment_unavailable/);
    assert.equal(f.calls.some(call=>call.name==='busy'),false);assert.equal(applied(f),undefined);
  }
});
test('Qualificação com ferramentas não consulta remarcação desligada',async()=>{
  const f=fixture({regular:true,settings:{appointment_confirm:true}});
  await assert.rejects(f.execute({action:{type:'slots',date:'2026-11-17',appointment_id:appointment}}),/crm_ia_appointment_unavailable/);
  assert.equal(f.calls.some(call=>call.name==='busy'),false);assert.equal(applied(f),undefined);
});
test('marcador técnico do modelo é recusado mesmo com repasse permitido',async()=>{
  const f=fixture();await assert.rejects(f.execute({action:{type:'handoff',reason:'calendar_unavailable',system_handoff:true}}),/crm_ia_concierge_action_unavailable/);assert.equal(applied(f),undefined);
});
test('falha real de calendário preserva repasse técnico com autorização de repasse desligada',async()=>{
  const f=fixture({settings:{faq_enabled:false,handoff_enabled:false,appointment_reschedule:true}});
  await f.execute({action:{type:'slots',date:'2026-11-17',appointment_id:appointment},refreshCalendar:async()=>{throw Error('Synthetic unavailable calendar');}});
  assert.equal(applied(f)?.p_action.type,'handoff');assert.equal(applied(f)?.p_action.system_handoff,true);assert.equal(applied(f)?.p_action.reason,'calendar_unavailable');
});
test('data inexistente ou fora de formato não chega ao provedor de calendário',async()=>{
  for(const date of ['2026-02-30','2026-99-01','amanhã']){
    const f=fixture({settings:{faq_enabled:false,appointment_reschedule:true}});
    await assert.rejects(f.execute({action:{type:'slots',date,appointment_id:appointment}}),/crm_ia_appointment_date_invalid/);
    assert.equal(f.calls.some(call=>call.name==='busy'),false);assert.equal(applied(f),undefined);
  }
});
test('pedido de data com vários compromissos pergunta qual, sem consultar slots',async()=>{
  const f=fixture({appointments:2,settings:{faq_enabled:false,appointment_reschedule:true}});
  await f.execute({action:{type:'appointment_question',question:'date'}});
  assert.match(applied(f)?.p_reply,/Compromisso verificado 1/);assert.match(applied(f)?.p_reply,/Compromisso verificado 2/);
  assert.equal(applied(f)?.p_action.type,'answer');assert.equal(f.calls.some(call=>call.name==='busy'),false);
});
test('compromissos visualmente iguais seguem repasse técnico verificado',async()=>{
  const f=fixture({appointments:2,settings:{faq_enabled:false,handoff_enabled:false,appointment_confirm:true}});
  Object.assign(f.appointmentRows[1],{...f.appointmentRows[0],id:id(30)});
  await f.execute({action:{type:'appointment_question',question:'choose_appointment'}});
  assert.equal(applied(f)?.p_action.type,'handoff');assert.equal(applied(f)?.p_action.system_handoff,true);assert.equal(applied(f)?.p_action.reason,'appointment_ambiguous');
});
test('pergunta de operação mostra somente as operações autorizadas',async()=>{
  const f=fixture({settings:{faq_enabled:false,appointment_cancel:true}});
  await f.execute({action:{type:'appointment_question',question:'choose_operation'}});
  assert.match(applied(f)?.p_reply,/cancelar/);assert.doesNotMatch(applied(f)?.p_reply,/confirmar|remarcar/);
});
test('questão desconhecida ou remarcação desativada não produz resposta ou consulta',async()=>{
  for(const question of ['invented','date']){
    const f=fixture({settings:{faq_enabled:false,appointment_confirm:true}});
    await assert.rejects(f.execute({action:{type:'appointment_question',question}}),/crm_ia_concierge_question_unavailable/);
    assert.equal(applied(f),undefined);assert.equal(f.calls.some(call=>call.name==='busy'),false);
  }
});
test('flags inválidas de agenda não ativam ferramentas e handoff ausente conserva o legado',async()=>{
  for(const value of [null,'true',1]){
    const f=fixture({settings:{faq_enabled:false,handoff_enabled:false,appointment_confirm:value,appointment_reschedule:value,appointment_cancel:value}});
    assert.equal((await f.execute({callModel:async()=>assert.fail('Invalid calendar flag must not generate')})).skipped,'concierge_no_inbound_capabilities');
    assert.equal(f.calls.some(call=>call.name==='crm_ia_appointment_context'||call.name==='busy'),false);
  }
  const legacy=fixture({body:'falar com a equipe',settings:{faq_enabled:false,handoff_phrases:['falar com a equipe']}});
  delete legacy.config.data.concierge.handoff_enabled;
  await legacy.execute({callModel:async()=>assert.fail('Published phrase is deterministic')});assert.equal(applied(legacy)?.p_action.type,'handoff');
});
test('base removida desliga FAQ efetiva e conserva somente a agenda autorizada',async()=>{
  const f=fixture({settings:{appointment_cancel:true}});f.rows.cliente_atend_ia_bases=[];
  await f.execute({action:{type:'appointment_question',question:'choose_operation'}});
  const prompt=f.calls.find(call=>call.name==='model').messages[0].content;
  assert.doesNotMatch(prompt,/CANARY_KNOWLEDGE|CANARY_INSTRUCTION|CANARY_CATALOG/);assert.match(applied(f)?.p_reply,/cancelar/);
  const unavailable=fixture();unavailable.rows.cliente_atend_ia_bases=[];
  assert.equal((await unavailable.execute({callModel:async()=>assert.fail('Missing FAQ must not generate')})).skipped,'concierge_no_inbound_capabilities');
  assert.equal(unavailable.calls.some(call=>call.name==='crm_ia_agent_begin'),false);
});

const audioPin=f=>({agent_id:agentId,agent_updated_at:stamp,config_revision:f.config.revision,concierge_role:true});
function audioFixture(settings={}){const f=fixture({settings});f.rows.cliente_whatsapp_inbox[0].type='audio';return f;}
test('ASR exige mesmo pin após intake, sem perder microssegundos ou trocar de papel',async()=>{
  for(const patch of [null,{agent_id:id(999)},{agent_updated_at:'2026-11-12T10:00:00.000001Z'},{config_revision:id(998)},{concierge_role:false}]){
    const f=audioFixture();const result=await f.execute({processAudioInput:async()=>({ok:true,transcript:'Olá',...(patch===null?{}:{authorization:{...audioPin(f),...patch}})}),callModel:async()=>assert.fail('stale pin must not call model')});
    assert.equal(result.skipped,'audio_context_changed');assert.equal(applied(f),undefined);assert.equal(f.calls.some(c=>c.name==='crm_ia_agent_begin'),false);
  }
  const f=audioFixture();await f.execute({processAudioInput:async()=>({ok:true,transcript:'Olá',authorization:{...audioPin(f),agent_updated_at:'2026-11-12T07:00:00.000000-03:00'}})});assert.equal(applied(f)?.p_action.type,'answer');
});
test('prioridade regular muda após ASR: consulta agentes novos e não empresta outro papel',async()=>{
  const f=audioFixture();const result=await f.execute({processAudioInput:async()=>{
    const authorization=audioPin(f),old=f.rows.cliente_atend_ia_agentes[0];
    f.rows.cliente_atend_ia_agentes=[{...old,id:id(997),funil:{crm_ia:{...old.funil.crm_ia,stage_ids:[waiting]}}},old];
    return{ok:true,transcript:'Olá',authorization};
  },callModel:async()=>assert.fail('new priority invalidates pin')});
  assert.equal(result.skipped,'audio_context_changed');assert.equal(applied(f),undefined);
});
test('nova mensagem entre ASR e histórico cancela antes de claim e modelo',async()=>{
  const f=audioFixture();const result=await f.execute({processAudioInput:async()=>{
    f.rows.cliente_whatsapp_inbox.unshift({...f.rows.cliente_whatsapp_inbox[0],id:id(996),message_id:'new-message',type:'text',body:'Nova mensagem'});
    return{ok:true,transcript:'Anterior',authorization:audioPin(f)};
  },callModel:async()=>assert.fail('old hook must not answer new source')});
  assert.equal(result.skipped,'source_message_changed');assert.equal(f.calls.some(c=>c.name==='crm_ia_agent_begin'),false);
});
test('falha ASR confirmada usa texto fixo com FAQ desligada e sem modelo ou agenda',async()=>{
  const f=audioFixture({faq_enabled:false,handoff_enabled:false});
  const result=await f.execute({processAudioInput:async()=>({ok:false,error:'audio_unavailable',authorization:audioPin(f)}),callModel:async()=>assert.fail('fixed server answer')});
  assert.equal(result.queued,true);assert.match(applied(f).p_reply,/Pode escrever/);assert.equal(applied(f).p_action.server_answer,'audio_failure');
  assert.equal(f.calls.some(c=>['busy','crm_ia_appointment_context'].includes(c.name)||c.table==='cliente_atend_ia_bases'),false);
});
test('modelo não pode declarar resposta de servidor para contornar FAQ',async()=>{
  for(const server_answer of ['audio_failure','slots','appointment_question',true]){
    const f=fixture({settings:{faq_enabled:false,appointment_confirm:true}});
    await assert.rejects(f.execute({action:{type:'answer',server_answer}}),/crm_ia_concierge_action_unavailable/);assert.equal(applied(f),undefined);
  }
});
test('opt-out e pedido humano têm prioridade e não consultam a agenda',async()=>{
  for(const body of ['Não tenho interesse em remarcar amanhã. Pode parar.','Quero falar com equipe para remarcar amanhã']){
    const f=fixture({body,settings:{appointment_reschedule:true,handoff_phrases:['falar com equipe']}});
    await f.execute({callModel:async()=>assert.fail('deterministic'),refreshCalendar:async()=>assert.fail('deterministic must not consult Google')});
    assert.equal(applied(f)?.p_action.type,body.startsWith('Não')?'close':'handoff');
    assert.equal(f.calls.some(c=>['busy','crm_ia_appointment_context','crm_ia_appointment_slots_for_run'].includes(c.name)),false);
  }
});

test('agentes empatados por criação escolhem o mesmo ID do SQL, inclusive após ASR',async()=>{
  for(const audio of [false,true]){
    const f=audio?audioFixture():fixture(),original=f.rows.cliente_atend_ia_agentes[0],lowest=id(4);
    f.rows.cliente_atend_ia_agentes=[{...original,created_at:stamp},{...original,id:lowest,created_at:stamp}];
    const result=await f.execute({processAudioInput:async()=>({ok:true,transcript:'Olá',authorization:{...audioPin(f),agent_id:lowest}})});
    assert.equal(result.queued,true);assert.equal(f.calls.find(c=>c.name==='crm_ia_agent_begin').args.p_agent,lowest);
  }
});
test('opt-out ao fim do áudio autorizado completo não desaparece no corte do histórico',async()=>{
  const f=audioFixture({faq_enabled:false,handoff_enabled:false});
  const result=await f.execute({processAudioInput:async()=>({ok:true,transcript:'x'.repeat(6000)+' Pode parar',authorization:audioPin(f)}),callModel:async()=>assert.fail('opt-out must not call model')});
  assert.equal(result.queued,true);assert.equal(applied(f)?.p_action.type,'close');assert.match(f.calls.find(c=>c.name==='crm_ia_agent_begin').args.p_expected.last_text,/Pode parar$/);
});

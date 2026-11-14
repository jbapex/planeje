import assert from 'node:assert/strict';
import test from 'node:test';
import { selectCrmIaAgent, buildCrmIaPrompt } from '../../supabase/functions/_shared/crmIaAgent.js';

const now='2026-11-12T15:00:00Z', owner='owner-a';
const lead={pipeline_id:'sales',stage_id:'waiting',responsavel_id:owner};
const agent=(patch={})=>({id:'qualification',ativo:true,auto_responder:true,nome:'Olívia',instrucoes:'CANARY_INSTRUCTION',funil:{crm_ia:{tipo:'qualificacao',pipeline_id:'sales',stage_ids:['entry'],variaveis:[{nome:'CANARY_VARIABLE'}],janelas:[]}},...patch});
const config=(patch={})=>({attendance:{auto_send:true},knowledge:{concierge_base_id:'company'},concierge:{enabled:true,mode:'always'},availability:{timezone:'America/Sao_Paulo',windows:[{owner_id:owner,days:[4],start:'09:00',end:'18:00'}]},...patch});
const select=(args={})=>selectCrmIaAgent({agents:[agent()],lead,conversation:{},config:config(),now,...args});
const window=(start,end,who=owner)=>({owner_id:who,days:[4],start,end});

test('Concierge assume etapa sem agente usando somente agente autônomo do mesmo funil',()=>{
  const result=select();assert.equal(result.agent?.id,'qualification');assert.equal(result.concierge,true);
  for(const wrong of [agent({ativo:false}),agent({auto_responder:false}),agent({funil:{crm_ia:{tipo:'followup',pipeline_id:'sales',stage_ids:['waiting']}}}),agent({funil:{crm_ia:{tipo:'qualificacao',pipeline_id:'foreign',stage_ids:['entry']}}})]) assert.equal(select({agents:[wrong]}).agent,null);
});
test('agente regular disponível vence Concierge mesmo fora do horário da equipe',()=>{
  const a=agent({funil:{crm_ia:{tipo:'qualificacao',pipeline_id:'sales',stage_ids:['waiting'],janelas:[]}}});
  const c=config({concierge:{enabled:true,mode:'outside_hours'},availability:{timezone:'America/Sao_Paulo',windows:[window('07:00','08:00')]}});
  const result=select({agents:[a],config:c});assert.equal(result.agent?.id,a.id);assert.equal(result.concierge,false);
});
test('Fora do horário não assume dentro da equipe nem sem horário conhecido',()=>{
  for(const windows of [[window('09:00','18:00')],[],[window('07:00','08:00','other')]]) {
    const c=config({concierge:{enabled:true,mode:'outside_hours'},availability:{timezone:'America/Sao_Paulo',windows}});
    assert.equal(select({config:c}).agent,null);
  }
});
test('Fora do horário respeita abertura inclusiva e fechamento exclusivo',()=>{
  const c=config({concierge:{enabled:true,mode:'outside_hours'},availability:{timezone:'America/Sao_Paulo',windows:[window('09:00','18:00')]}});
  for(const [instant,want] of [['2026-11-12T11:59:59Z',true],['2026-11-12T12:00:00Z',false],['2026-11-12T20:59:59Z',false],['2026-11-12T21:00:00Z',true]]) assert.equal(select({config:c,now:instant}).concierge,want,instant);
});
test('exceção por data substitui a janela semanal e dia bloqueado é conhecido',()=>{
  const common={timezone:'America/Sao_Paulo',windows:[window('09:00','18:00')]};
  for(const [exceptions,want] of [[[{owner_id:owner,date:'2026-11-12',blocked:true}],true],[[{owner_id:owner,date:'2026-11-12',blocked:false,start:'11:00',end:'13:00'}],false],[[{owner_id:owner,date:'2026-11-12',blocked:false,start:'13:00',end:'15:00'}],true]]) {
    const c=config({concierge:{enabled:true,mode:'outside_hours'},availability:{...common,exceptions}});assert.equal(select({config:c}).concierge,want);
  }
});
test('lead sem responsável usa equipe aberta se qualquer agenda estiver no horário',()=>{
  const c=config({concierge:{enabled:true,mode:'outside_hours'},availability:{timezone:'America/Sao_Paulo',windows:[window('07:00','08:00'),window('09:00','18:00','other')]}});
  assert.equal(select({lead:{...lead,responsavel_id:null},config:c}).agent,null);
  c.availability.exceptions=[{owner_id:'other',date:'2026-11-12',blocked:true}];assert.equal(select({lead:{...lead,responsavel_id:null},config:c}).concierge,true);
});
test('espera humana e pausa continuam impedindo atuação sem invalidar zero minutos',()=>{
  const human='2026-11-12T14:50:00Z';
  assert.equal(select({conversation:{ia_pausada:true}}).agent,null);
  assert.equal(select({conversation:{status:'finalizado'}}).agent,null);
  assert.equal(select({conversation:{crm_ia_runtime:{last_human_at:human}},now:'2026-11-12T14:59:59Z'}).agent,null);
  assert.equal(select({conversation:{crm_ia_runtime:{last_human_at:human}}}).concierge,true);
  const c=config();c.concierge.human_wait_minutes=0;assert.equal(select({config:c,conversation:{crm_ia_runtime:{last_human_at:now}}}).concierge,true);
  for(const stamp of ['bad-time','2026-11-12T15:01:00Z']) assert.equal(select({conversation:{crm_ia_runtime:{last_human_at:stamp}}}).agent,null);
});
test('modo ausente usa Fora do horário e valores inválidos não liberam fallback',()=>{
  assert.equal(select({config:config({concierge:{enabled:true}})}).agent,null);
  for(const mode of ['other',false,5]) assert.equal(select({config:config({concierge:{enabled:true,mode}})}).agent,null);
  for(const wait of [-1,'10',null,0.5,10081]) assert.equal(select({config:config({concierge:{enabled:true,mode:'always',human_wait_minutes:wait}})}).agent,null);
});
test('Concierge de agenda não precisa emprestar base e não captura followup',()=>{
  const c=config({knowledge:{},concierge:{enabled:true,mode:'always',faq_enabled:false,appointment_reschedule:true}});
  assert.equal(select({config:c}).concierge,true);assert.equal(select({config:c,mode:'followup'}).agent,null);
});
test('prompt Concierge não transporta variáveis, instruções comerciais ou catálogo do agente',()=>{
  const prompt=buildCrmIaPrompt({agent:agent(),concierge:true,config:config(),bases:[{nome:'Base',conteudo:'CANARY_KNOWLEDGE'}],products:[{name:'CANARY_CATALOG'}]});
  assert.match(prompt,/CANARY_KNOWLEDGE/);assert.doesNotMatch(prompt,/CANARY_INSTRUCTION|CANARY_VARIABLE|CANARY_CATALOG/);
});
test('FAQ false ou inválida retira conhecimento mesmo se o chamador enviar uma base',()=>{
  for(const faq_enabled of [false,null,'false',1]) {
    const c=config();c.concierge.faq_enabled=faq_enabled;
    const prompt=buildCrmIaPrompt({agent:agent(),concierge:true,config:c,bases:[{nome:'Base',conteudo:'CANARY_KNOWLEDGE'}]});assert.doesNotMatch(prompt,/CANARY_KNOWLEDGE/);
  }
});
test('Qualificação regular conserva instruções, variáveis e base com ferramentas habilitadas',()=>{
  const prompt=buildCrmIaPrompt({agent:agent(),config:config(),bases:[{nome:'Base',conteudo:'CANARY_KNOWLEDGE'}],products:[{name:'CANARY_CATALOG'}]});
  for(const value of ['CANARY_INSTRUCTION','CANARY_VARIABLE','CANARY_KNOWLEDGE','CANARY_CATALOG']) assert.ok(prompt.includes(value));
  assert.match(prompt,/Somente na Qualificação/);
});
test('fallback não empresta agente órfão quando não existe lead ou funil',()=>{
  const orphan=agent({funil:{crm_ia:{tipo:'qualificacao',stage_ids:[]}}});
  assert.equal(select({agents:[orphan],lead:null}).agent,null);
});
test('agenda desligada não leva contexto ou slots fornecidos pelo chamador ao modelo',()=>{
  const c=config({concierge:{enabled:true,faq_enabled:true}});
  const prompt=buildCrmIaPrompt({agent:agent(),concierge:true,config:c,appointments:[{title:'CANARY_APPOINTMENT'}],slots:[{start_at:'CANARY_SLOT'}]});
  assert.doesNotMatch(prompt,/CANARY_APPOINTMENT|CANARY_SLOT/);
});
test('FAQ desligada não instrui o modelo a usar answer como formato padrão',()=>{
  const c=config({concierge:{enabled:true,faq_enabled:false,appointment_reschedule:true}});
  const prompt=buildCrmIaPrompt({agent:agent(),concierge:true,config:c});
  assert.doesNotMatch(prompt,/"action":\{"type":"answer"\}/);assert.match(prompt,/appointment_question/);
});
test('fuso vazio e timestamp humano não textual não viram defaults permissivos',()=>{
  for(const timezone of ['',false,0,'Invalid/Zone']) assert.equal(select({config:config({availability:{timezone}})}).agent,null);
  for(const last_human_at of [false,0,{},[]]) assert.equal(select({conversation:{crm_ia_runtime:{last_human_at}}}).agent,null);
});

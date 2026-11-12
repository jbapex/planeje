import assert from 'node:assert/strict';
import test from 'node:test';
import { parseCrmIaModelResult,validateCrmIaAction,buildCrmIaPrompt } from '../../supabase/functions/_shared/crmIaAgent.js';
const appointment={id:'00000000-0000-4000-8000-000000000091',updated_at:'2026-11-11T12:00:00Z',start_at:'2026-11-14T12:00:00Z',end_at:'2026-11-14T12:30:00Z',status:'scheduled',title:'Consulta'};
const config={concierge:{enabled:true,appointment_confirm:true,appointment_reschedule:true,appointment_cancel:true}};
test('parser aceita proposta/apply sem transformar declaração do modelo em consentimento',()=>{
 for(const action of [{type:'appointment_propose',operation:'cancel',appointment_id:appointment.id},{type:'appointment_apply',confirmation_id:appointment.id}]){
  assert.equal(parseCrmIaModelResult(JSON.stringify({text:'Pergunta',action})).action.type,action.type);
  assert.doesNotThrow(()=>validateCrmIaAction({action,appointments:[appointment],proposal:{id:appointment.id},config}));
 }
 assert.throws(()=>validateCrmIaAction({action:{type:'appointment_propose',operation:'cancel',appointment_id:'foreign'},appointments:[appointment],config}),/appointment/);
 assert.throws(()=>validateCrmIaAction({action:{type:'appointment_propose',operation:'cancel',appointment_id:appointment.id},appointments:[appointment],config:{concierge:{enabled:true}}}),/appointment/);
});
test('prompt oferece só compromissos autorizados e manda aguardar pergunta/consentimento do servidor',()=>{
 const prompt=buildCrmIaPrompt({agent:{nome:'Concierge',funil:{crm_ia:{tipo:'agendamento'}}},config,appointments:[appointment],concierge:true});
 assert.match(prompt,/appointment_propose/);assert.match(prompt,/appointment_apply/);assert.match(prompt,/confirmação.*servidor|servidor.*confirmação/);
 assert.match(prompt,/Consulta/);
});

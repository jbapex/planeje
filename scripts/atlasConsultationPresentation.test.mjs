import test from 'node:test';
import assert from 'node:assert/strict';
import {atlasConversationTimeline,atlasMissionStatus} from '../src/components/atlas/atlasPresentation.js';
import {ownerIntakeThread,demandPhase,demandNextStep} from '../src/lib/atlasDemandPresentation.js';

test('team consultation stays visible in its source conversation and opens exact thread',()=>{
 const jobs=[{id:'j',conversation_id:'origin',status:'waiting_team',result:'Aguardando Executor Exemplo.',created_at:'2026-10-19T11:00:00Z',steps:[{kind:'internal_question',thread_id:'thread'}]},{id:'other',conversation_id:'private-other',status:'waiting_team',result:'PRIVATE'}];
 const timeline=atlasConversationTimeline([],jobs,'origin');
 assert.equal(timeline.length,1);assert.match(timeline[0].content,/Aguardando Executor/);assert.deepEqual(timeline[0].thread_ids,['thread']);
 assert.equal(atlasMissionStatus(jobs[0]),'Aguardando equipe');
});
test('returned answer replaces pending result without implying task completion',()=>{
 const j={id:'j',conversation_id:'origin',status:'completed',result:'Executor informou: ainda em edição.',finished_at:'2026-10-19T12:00:00Z',steps:[{kind:'internal_question',thread_id:'thread'}]};
 assert.equal(atlasConversationTimeline([],[j],'origin')[0].content,j.result);
 assert.equal(atlasMissionStatus(j),'Resposta recebida');
});
test('cancelled or failed consultation preserves outcome rather than an invented answer',()=>{
 const timeline=atlasConversationTimeline([],[{id:'j',conversation_id:'origin',status:'cancelled',title:'Consulta'},{id:'f',conversation_id:'origin',status:'failed',title:'Consulta',error:'Contexto mudou.',result:'Parte já apurada.'}],'origin');
 assert.match(timeline.find(m=>m.job_id==='j').content,/cancelada/);
 assert.match(timeline.find(m=>m.job_id==='f').content,/Parte já apurada/);
});
test('retry offers only the original owner message from the same conversation and run',()=>{
 const jobs=[{id:'j',origin_run_id:'run',conversation_id:'origin',status:'failed',title:'Consulta',task:'Model generated task'}];
 const messages=[{role:'user',run_id:'run',content:'Confira a publicação da Aurora.'}];
 assert.equal(atlasConversationTimeline(messages,jobs,'origin').find(m=>m.job_id)?.retry_message,messages[0].content);
 assert.equal(atlasConversationTimeline([],jobs,'origin')[0].retry_message,undefined);
 assert.equal(atlasConversationTimeline([{role:'assistant',run_id:'run',content:'Generated'}],jobs,'origin')[1]?.retry_message,undefined);
 assert.equal(atlasConversationTimeline(messages,jobs,'other').some(m=>m.job_id),false);
 assert.equal(atlasConversationTimeline([{role:'user',content:'Unrelated'}],[{...jobs[0],origin_run_id:undefined}],'origin').find(m=>m.job_id)?.retry_message,null);
});
test('queued and running jobs show actual progress without claiming a result',()=>{
 for(const status of ['queued','running']) {
  const [message]=atlasConversationTimeline([],[{id:'j',conversation_id:'origin',status,title:'Consulta'}],'origin');
  assert.equal(message.job_status,status);assert.match(message.content,/conferindo/);assert.equal(message.retry_message,null);
 }
});
test('owner instruction uses robot conversation instead of requesting another manual handoff',()=>{
 const demand={state:'proposed',proposal:{source:'atlas_owner_intake',thread_id:'11111111-1111-4111-8111-111111111111'}};
 assert.equal(ownerIntakeThread(demand),demand.proposal.thread_id);assert.equal(demandPhase(demand),'Conversa registrada no Atlas');assert.match(demandNextStep(demand),/robô/);
 assert.equal(demandPhase({...demand,proposal:{source:'owner_manual'}}),'Aguardando aprovação');
 assert.equal(ownerIntakeThread({...demand,proposal:{...demand.proposal,thread_id:'javascript:bad'}}),null);
});

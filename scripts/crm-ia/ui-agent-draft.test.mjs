import assert from 'node:assert/strict';
import test from 'node:test';
import {createAgentDraftSession} from '../../src/components/crm-ia/crmIaAgentDraft.js';

test('autosave serializa alterações e publicar usa a última revisão sem chamar save_agent',async()=>{
 const calls=[],pending=[];
 const session=createAgentDraftSession({scope:{agent_id:'a'},api:async(action,payload)=>{
  calls.push([action,payload]);if(action==='agent_draft')return {revision:'r0',draft:null};
  if(action==='save_agent_draft')return new Promise(resolve=>pending.push(resolve));
  return {published:true,agent:{id:'a'}};
 }});
 await session.load();session.change({nome:'primeiro'});const writing=session.flush();
 session.change({nome:'último'});assert.equal(pending.length,1);
 pending.shift()({revision:'r1'});await new Promise(resolve=>setImmediate(resolve));assert.equal(pending.length,1);
 pending.shift()({revision:'r2'});await writing;await session.publish();
 assert.deepEqual(calls.map(([action])=>action),['agent_draft','save_agent_draft','save_agent_draft','publish_agent_draft']);
 assert.equal(calls[2][1].revision,'r1');assert.equal(calls[3][1].revision,'r2');assert.equal(calls[2][1].data.nome,'último');
 await session.dispose();
});
test('dispose persiste a última edição no escopo antigo e ignora resposta visual tardia',async()=>{
 const states=[],calls=[];let finish;
 const session=createAgentDraftSession({scope:{agent_id:'old'},onState:value=>states.push(value),api:async(action,payload)=>{
  calls.push([action,payload]);return action==='agent_draft'?{revision:'old-r',draft:null}:new Promise(resolve=>{finish=resolve;});
 }});
 await session.load();session.change({nome:'Conta antiga'});const closed=session.dispose(),visible=states.length;
 finish({revision:'old-next'});await closed;
 assert.equal(states.length,visible);assert.equal(calls[1][1].agent_id,'old');assert.equal(calls[1][1].data.nome,'Conta antiga');
});
test('conflito preserva edição local e descartar aguarda gravação antes de tombstone',async()=>{
 let fail=true;const calls=[];
 const session=createAgentDraftSession({scope:{tipo:'qualificacao',pipeline_id:'p'},api:async(action,payload)=>{
  calls.push([action,payload]);if(action==='agent_draft')return {revision:'r0',draft:null};
  if(action==='save_agent_draft'&&fail)throw new Error('Falha temporária de rede');
  return {revision:'r1',discarded:true};
 }});
 await session.load();session.change({nome:'Preservado'});await assert.rejects(session.flush(),/Falha/);
 assert.equal(session.current().data.nome,'Preservado');fail=false;await session.discard();
 assert.equal(calls.at(-1)[0],'discard_agent_draft');assert.equal(calls.at(-1)[1].revision,'r1');await session.dispose();
});
test('CAS recusado mantém a edição local e aguarda revisão sem repetir autosave inválido',async()=>{
 let saves=0;const session=createAgentDraftSession({scope:{agent_id:'a'},api:async action=>{
  if(action==='agent_draft')return {revision:'r0',draft:null};saves++;throw Object.assign(new Error('Conflito de revisão'),{code:'40001'});
 }});
 await session.load();session.change({nome:'Primeiro'});await assert.rejects(session.flush(),/Conflito/);
 session.change({nome:'Última edição preservada'});await assert.rejects(session.flush(),/Conflito/);
 assert.equal(saves,1);assert.equal(session.current().data.nome,'Última edição preservada');await session.dispose().catch(()=>{});
});
test('publicação e descarte sem recibo explícito não fecham a sessão como concluída',async()=>{
 const session=createAgentDraftSession({scope:{agent_id:'a'},api:async action=>action==='agent_draft'?{revision:'r0',draft:null}:action==='save_agent_draft'?{revision:'r1'}:{}});
 await session.load();session.change({nome:'Preservado'});await assert.rejects(session.publish(),/confirmada/);await assert.rejects(session.discard(),/confirmado/);
 assert.equal(session.current().data.nome,'Preservado');await session.dispose();
});

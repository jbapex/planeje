import assert from 'node:assert/strict';
import test from 'node:test';
import {createCrmPreview,PREVIEW_IDS as ids} from './preview/fixture.js';
const A=ids.clientA,B=ids.clientB;
test('prévia usa totais completos e os mesmos filtros de tags, perfil e qualificação',async()=>{
 const p=createCrmPreview(),all=await p.request('leads',A,{limit:100}),one=await p.request('leads',A,{limit:1}),two=await p.request('leads',A,{limit:1,offset:1});
 assert.equal(one.total,all.total);assert.deepEqual(one.summary,two.summary);assert.deepEqual(one.stage_totals,two.stage_totals);
 assert.equal(one.summary.value,all.rows.reduce((sum,row)=>sum+row.valor,0));
 assert.equal((await p.request('leads',A,{tag:'inexistente'})).total,0);
 assert.equal((await p.request('leads',A,{qualified:'true'})).total,2);
 const profiles=(await p.request('workspace',A)).lead_profiles;assert.ok(profiles.length);
 await assert.rejects(p.request('leads',A,{profile_id:profiles[0].id}),/perfil/i);
});
test('prévia preserva perfil/histórico sem fabricar avanço, valida fonte e devolve canais exatos',async()=>{
 const p=createCrmPreview(),workspace=await p.request('workspace',A),meta=workspace.lead_profiles[0],row=(await p.request('leads',A)).rows[0];
 const before=await p.request('lead',A,{id:row.id});
 const saved=await p.request('save_lead',A,{id:row.id,expected_updated_at:row.updated_at,profile:{agent_id:meta.agent_id,id:meta.id,agent_updated_at:meta.agent_updated_at}});
 assert.equal(saved.crm_ia_profile.id,meta.id);assert.ok(saved.etiquetas.includes('Demonstração'));assert.ok(saved.etiquetas.includes('Interesse'));
 const after=await p.request('lead',A,{id:row.id});assert.equal(after.events.length,before.events.length);assert.equal(after.profile_history.length,1);assert.equal(after.conversations.length,2);assert.equal(after.lead.attendance,'human');
 assert.ok(after.conversations.every(chat=>chat.contact_id===ids.contactA));
 assert.equal((await p.request('leads',A,{profile_id:meta.id,profile_agent_id:meta.agent_id,tag:'Interesse'})).total,1);
 const foreign=(await p.request('workspace',B)).lead_profiles[0];
 await assert.rejects(p.request('save_lead',A,{id:saved.id,expected_updated_at:saved.updated_at,profile:{agent_id:foreign.agent_id,id:foreign.id,agent_updated_at:foreign.agent_updated_at}}),/perfil/i);
 await assert.rejects(p.request('save_lead',A,{id:saved.id,expected_updated_at:saved.updated_at,crm_ia_profile:{id:'forjado'}}),/perfil/i);
 const clean=await p.request('save_lead',A,{id:saved.id,expected_updated_at:saved.updated_at,profile:null});assert.equal(clean.crm_ia_profile,null);assert.ok(clean.etiquetas.includes('Interesse'));
});
test('lote da prévia rejeita versão concorrente antes de atribuir ou arquivar qualquer lead',async()=>{
 const p=createCrmPreview(),rows=(await p.request('leads',A)).rows.slice(0,2),items=rows.map(row=>({id:row.id,expected_updated_at:row.updated_at}));
 await p.request('save_lead',A,{...items[0],nome:'Mudança concorrente'});
 for(const action of ['bulk_assign','bulk_archive'])await assert.rejects(p.request(action,A,{ids:items.map(row=>row.id),items,owner_id:ids.otherPerson}),/versão/i);
 assert.equal((await p.request('lead',A,{id:rows[1].id})).lead.responsavel_id,rows[1].responsavel_id);
 assert.equal((await p.request('leads',A)).total,3);
 const fresh=(await p.request('leads',A)).rows.slice(0,2).map(row=>({id:row.id,expected_updated_at:row.updated_at}));
 await p.request('bulk_archive',A,{items:fresh});assert.equal((await p.request('leads',A)).total,1);assert.equal((await p.request('leads',A,{archived:true})).total,2);
 assert.equal((await p.request('queue',A)).total,1);
});
test('cópia sintética preserva agenda, recria perfis e desliga a execução',async()=>{
 const p=createCrmPreview(),agent=(await p.request('workspace',A)).agents[0];
 const source={...agent,funil:{...agent.funil,crm_ia:{...agent.funil.crm_ia,agendamento:{duration_minutes:45,owner_id:ids.person,title:'Assunto copiado',location_type:'online'}}}};
 const template=await p.request('save_template',A,{nome:'Modelo sintético',tipo:'agent',data:source});
 await p.request('apply_template',A,{id:template.id,revision:template.revision,target_client_id:B});
 const copied=(await p.request('workspace',B)).agents.at(-1),rules=copied.funil.crm_ia;
 assert.equal(copied.ativo,false);assert.equal(copied.auto_responder,false);assert.equal(rules.audio.enabled,false);
 assert.equal(rules.agendamento.duration_minutes,45);assert.equal(rules.agendamento.owner_id,undefined);assert.equal(rules.agendamento.title,'Assunto copiado');assert.equal(rules.agendamento.location_type,'online');
 assert.notEqual(rules.profiles[0].id,agent.funil.crm_ia.profiles[0].id);assert.equal(rules.profiles[0].actions.owner_id,null);
});

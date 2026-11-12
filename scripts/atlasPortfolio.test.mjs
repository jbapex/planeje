import test from 'node:test';
import assert from 'node:assert/strict';
import {createManagerReader} from '../supabase/functions/_shared/atlasManagerContext.js';
const A='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',B='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',G='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
function fixture(tables){return {from(table){let rows=[...(tables[table]||[])],columns=null,single=false;const q={select(fields){columns=fields;return q},eq(k,v){rows=rows.filter(r=>r[k]===v);return q},neq(k,v){rows=rows.filter(r=>r[k]!==v);return q},in(k,v){rows=rows.filter(r=>v.includes(r[k]));return q},is(k,v){rows=rows.filter(r=>(r[k]??null)===v);return q},order(){return q},limit(n){rows=rows.slice(0,n);return q},abortSignal(){return q},single(){single=true;return q},maybeSingle(){single=true;return q},then(resolve,reject){const result=columns&&columns!=='*'?rows.map(r=>Object.fromEntries(columns.split(',').filter(k=>k in r).map(k=>[k,r[k]]))):rows;return Promise.resolve({data:single?result[0]||null:result,error:null}).then(resolve,reject)}};return q}}}
function data(){return {clientes:[{id:B,empresa:'Antigo',etapa:'lost',meta_resumo:{spend:200}},{id:A,empresa:'Atual',etapa:'closed',entregaveis:{whatsapp_grupo:{conversation_id:'active-group',wa_cliente_id:G}},meta_resumo:{spend:100}},{id:G,empresa:'JB APEX',etapa:'prospect'}],task_statuses:[{value:'done',is_terminal:true}],tarefas:[{id:'old-task',client_id:B,status:'open',title:'Old'},{id:'active-task',client_id:A,status:'open',title:'Current'}],projetos:[{id:'old-plan',client_id:B},{id:'active-plan',client_id:A}],atendimento_conversas:[{id:'old-group',cliente_id:G,display_name:'Antigo',is_group:true,bloqueada:false,archived_at:null},{id:'active-group',cliente_id:G,display_name:'Atual',is_group:true,bloqueada:false,archived_at:null},{id:'unknown-group',cliente_id:G,display_name:'Outro que saiu',is_group:true,bloqueada:false,archived_at:null}],traffic_weekly_reviews:[{id:'old-review',client_id:B},{id:'active-review',client_id:A}],traffic_checkup_runs:[],campaign_plans:[]}}
test('all default operational sources exclude lost/prospect clients before limiting rows',async()=>{
 const reader=createManagerReader(fixture(data()),{ownerId:'owner'});
 assert.deepEqual((await reader('portfolio')).records.map(c=>c.id),[A]);
 assert.deepEqual((await reader('overview')).records.map(c=>c.id),['active-task']);
 assert.deepEqual((await reader('plans')).records.projects.map(c=>c.id),['active-plan']);
 const traffic=await reader('traffic');assert.deepEqual(traffic.records.accounts.map(c=>c.id),[A]);assert.deepEqual(traffic.records.reviews.map(c=>c.id),['active-review']);
 const groups=await reader('conversations');assert.deepEqual(groups.records.map(c=>c.id),['active-group']);assert.deepEqual(groups.excluded_conversation_ids,['old-group','unknown-group']);
 assert.equal((await reader('conversation',{referenceId:'old-group'})).available,false);
 assert.equal((await reader('conversation',{referenceId:'active-group'})).available,true);
 assert.equal((await reader('results',{clientId:B})).available,false);
});
test('empty closed portfolio is empty, never silently replaced by former clients',async()=>{
 const tables=data();tables.clientes.find(c=>c.id===A).etapa='lost';const reader=createManagerReader(fixture(tables),{ownerId:'owner'});
 assert.deepEqual((await reader('portfolio')).records,[]);assert.deepEqual((await reader('tasks')).records,[]);assert.deepEqual((await reader('conversations')).records,[]);
});
test('a matching group name never authorizes reading messages without explicit binding',async()=>{
 const tables=data();tables.clientes.find(c=>c.id===A).entregaveis={};
 const reader=createManagerReader(fixture(tables),{ownerId:'owner'});
 assert.deepEqual((await reader('conversations')).records,[]);
 assert.equal((await reader('conversation',{referenceId:'active-group'})).available,false);
});
test('publication evidence is scoped to client tasks and distinguished from live verification',async()=>{
 const tables=data();tables.task_channel_publications=[{id:'p1',task_id:'active-task',channel:'instagram',destination:'feed',status:'published',meta_post_id:'platform-id',evidence_url:'https://instagram.com/p/example',published_on:'2026-10-16',updated_at:'2026-10-16T12:00:00Z'},{id:'p2',task_id:'old-task',status:'published',evidence_url:'PRIVATE_OTHER_CLIENT'}];
 const reader=createManagerReader(fixture(tables),{ownerId:'owner'});const result=await reader('publications',{clientId:A});
 assert.equal(result.available,true);assert.equal(result.records.length,1);assert.equal(result.records[0].id,'p1');assert.equal(result.records[0].external_verification,false);assert.equal(result.records[0].evidence_level,'platform_record');assert.match(result.note,/verifica/i);
});
import {atlasAlertOutsidePortfolio} from '../supabase/functions/_shared/atlasMonitor.js';
test('isolated question source exposes only operational fields and explicitly shared client knowledge',async()=>{
 const tables=data();tables.clientes.find(c=>c.id===A).limite_meta='PRIVATE_FINANCE';
 tables.atlas_memories=[{owner_id:'owner',client_id:A,state:'active',team_shared:true,content:'Conhecimento liberado.'},{owner_id:'owner',client_id:A,state:'active',team_shared:false,content:'PRIVATE_MEMORY'},{owner_id:'owner',client_id:B,state:'active',team_shared:true,content:'OTHER_CLIENT'},{owner_id:'owner',client_id:A,state:'revoked',team_shared:true,content:'REVOKED_MEMORY'}];
 const reader=createManagerReader(fixture(tables),{ownerId:'owner'}),result=await reader('internal_question',{clientId:A,referenceId:'active-task'});
 assert.equal(result.available,true);assert.match(JSON.stringify(result),/Conhecimento liberado/);assert.doesNotMatch(JSON.stringify(result),/PRIVATE_|OTHER_CLIENT|REVOKED/);
 assert.equal((await reader('internal_question',{clientId:A,referenceId:'old-task'})).available,false);
});
test('obsolete monitoring alerts retire only with positive evidence, never source failure/truncation',()=>{
 const old={source_key:'trafego:old:budget',client_id:B};
 assert.equal(atlasAlertOutsidePortfolio(old,{available:false},{}),false);
 assert.equal(atlasAlertOutsidePortfolio(old,{available:true,portfolio_complete:false,active_client_ids:[]},{}),false);
 assert.equal(atlasAlertOutsidePortfolio(old,{available:true,portfolio_complete:true,active_client_ids:[A]},{}),true);
 assert.equal(atlasAlertOutsidePortfolio({source_key:'atendimento:unknown-group:date'},{},{available:true,excluded_conversation_ids:['unknown-group']}),true);
});

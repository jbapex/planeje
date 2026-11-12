import test from 'node:test';
import assert from 'node:assert/strict';
import {clientOperation,officeClientCards,loadOfficeClientHouse,officeClientDestination,clientLogoUrl} from '../src/lib/atlasOfficeClients.js';
const fixture=()=>({office:{clients:[{id:'a',empresa:'Aurora'},{id:'b',empresa:'Ateliê'},{id:'c',empresa:'Lírio'}],tasks:[{id:'t1',client_id:'a',title:'Campanha',done:false,assignee_ids:['p'],deadline_flags:['Vencida']},{id:'t2',client_id:'a',done:true,assignee_ids:['x'],deadline_flags:['Vencida']}],profiles:[{id:'p',full_name:'Ana Exemplo'}],projects:[{id:'project',client_id:'a'}]},client_house:{complete:true,clients:[{id:'a',etiquetas:['Ápice Noivas']},{id:'b',etiquetas:['jb-apex']},{id:'c',etiquetas:[]}],labels:[],demands:[{id:'d1',client_id:'a',state:'linked',task_id:'t1'},{id:'d2',client_id:'a',state:'archived'}]},questions:[{id:'q',client_id:'a',state:'open'}],proposals:[],client_states:[]});
test('classification uses explicit labels, including catalog keys and normalized spellings',()=>{
 for(const tag of ['Ápice Noivas','apice-noivas','  ÁPICE  NOIVAS  ',{nome:'Ápice Noivas'}])assert.equal(clientOperation({etiquetas:[tag]}),'apice');
 assert.equal(clientOperation({etiquetas:['jb_apex']}),'jb');
 assert.equal(clientOperation({etiquetas:['operation-a']},[{chave:'operation-a',nome:'JB Apex'}]),'jb');
});
test('missing, irrelevant and conflicting labels remain unclassified regardless of client niche',()=>{
 for(const c of [null,{empresa:'Loja Noivas',etiquetas:[]},{etiquetas:['VIP','Meta Ads']},{etiquetas:['Ápice Noivas','JB Apex']},{etiquetas:null}])assert.equal(clientOperation(c),'unclassified');
});
test('portfolio and accent-insensitive search combine without changing source records',()=>{
 const d=fixture(),before=structuredClone(d);assert.deepEqual(officeClientCards(d,{operation:'apice'}).map(c=>c.id),['a']);
 assert.deepEqual(officeClientCards(d,{search:'atelie'}).map(c=>c.id),['b']);assert.equal(officeClientCards(d,{operation:'apice',search:'Lírio'}).length,0);assert.deepEqual(d,before);
});
test('client summary reflects original open tasks, actual assignees, source due flags and linked demand',()=>{
 const card=officeClientCards(fixture()).find(c=>c.id==='a');assert.equal(card.tasks.length,1);assert.equal(card.late,1);assert.deepEqual(card.people,[{id:'p',name:'Ana Exemplo'}]);assert.equal(card.demands.length,1);assert.equal(card.projects[0].id,'project');assert.equal(card.state,'Aguarda sua orientação');
});
test('client status distinguishes proposals, actual analysis and errors',()=>{
 const d=fixture();d.questions=[];d.proposals=[{client_id:'a',state:'pending'}];assert.equal(officeClientCards(d).find(c=>c.id==='a').state,'Repasse para aprovar');
 d.proposals=[];d.client_states=[{client_id:'a',status:'analyzing'}];assert.equal(officeClientCards(d).find(c=>c.id==='a').state,'Atlas analisando');
 d.client_states[0].status='error';assert.equal(officeClientCards(d).find(c=>c.id==='a').state,'Análise precisa de atenção');
});
test('an unavailable demand source is not represented as zero demands or a classified portfolio',()=>{
 const d=fixture();d.client_house={complete:false};const card=officeClientCards(d).find(c=>c.id==='a');assert.equal(card.demands,null);assert.equal(card.operation,'unclassified');assert.equal(card.tasks.length,1);
});
test('navigation permits only currently visible closed clients and existing client tabs',()=>{
 const d=fixture();assert.equal(officeClientDestination(d,'a','arquivos'),'/clients/a?aba=arquivos');
 assert.throws(()=>officeClientDestination(d,'unknown','resumo'));assert.throws(()=>officeClientDestination(d,'a','https://invalid.example'));assert.throws(()=>officeClientDestination(d,'a','admin'));
});
function callerFor(tables,{fail,dropClient=false,failSecondPage=false}={}){
 const calls=[];return {calls,from(table){const call={table};calls.push(call);let rows=tables[table]||[];const q={select(fields){call.fields=fields;return q;},in(key,values){call.ids=values;rows=rows.filter(r=>values.includes(r[key]));return q;},eq(key,value){rows=rows.filter(r=>r[key]===value);return q;},order(){return q;},range(a,b){return Promise.resolve(fail===table||failSecondPage&&table==='clientes'&&a>=500?{data:null,error:{code:'denied'}}:{data:(dropClient&&table==='clientes'?[]:rows).slice(a,b+1),error:null});}};return q;}};
}
test('house data uses the authenticated caller, closed-client scope and bounded metadata reads',async()=>{
 const db=callerFor({clientes:[{id:'a',etapa:'closed',etiquetas:['JB Apex']},{id:'old',etapa:'prospect'}],atlas_demands:[{id:'d',client_id:'a',state:'draft'},{id:'other',client_id:'old'}],cliente_etiquetas:[]});
 const result=await loadOfficeClientHouse(db,['a','a']);assert.equal(result.complete,true);assert.equal(result.clients.length,1);assert.equal(result.demands.length,1);
 assert.deepEqual(db.calls.find(c=>c.table==='clientes').ids,['a']);assert.equal(db.calls.find(c=>c.table==='atlas_demands').fields,'id,client_id,state,task_id');
 assert.ok(db.calls.every(c=>!c.fields.includes('*')&&!/secret|password|token/.test(c.fields)));
});
test('read errors and clients no longer visible fail closed; no operational mutation exists',async()=>{
 for(const table of ['clientes','cliente_etiquetas','atlas_demands'])await assert.rejects(()=>loadOfficeClientHouse(callerFor({clientes:[{id:'a',etapa:'closed'}]},{fail:table}),['a']));
 await assert.rejects(()=>loadOfficeClientHouse(callerFor({},{dropClient:true}),['a']),/carteira mudou/);
 assert.equal((await loadOfficeClientHouse({from(){assert.fail();}},[])).complete,true);
});
test('all pages are collected; a second-page failure never produces partial success',async()=>{
 const ids=Array.from({length:501},(_,i)=>String(i));const rows=ids.map(id=>({id,etapa:'closed'}));const db=callerFor({clientes:rows});assert.equal((await loadOfficeClientHouse(db,ids)).clients.length,501);
 assert.equal(db.calls.filter(c=>c.table==='clientes').length,2);
 await assert.rejects(()=>loadOfficeClientHouse(callerFor({clientes:rows},{failSecondPage:true}),ids));
});

test('registered logo passes through the scoped metadata read and client card',async()=>{
 const db=callerFor({clientes:[{id:'a',etapa:'closed',etiquetas:[],logo_urls:['https://example.com/logo.png']}],atlas_demands:[],cliente_etiquetas:[]});
 const extra=await loadOfficeClientHouse(db,['a']);assert.equal(db.calls.find(c=>c.table==='clientes').fields,'id,etiquetas,logo_urls');
 const d=fixture();d.client_house=extra;assert.equal(officeClientCards(d).find(c=>c.id==='a').logo_url,'https://example.com/logo.png');
});
test('missing and unsafe logos fall back without inventing or executing an image source',()=>{
 for(const value of [null,{}, {logo_urls:[]},{logo_urls:['']},{logo_urls:['javascript:alert(1)']},{logo_urls:['data:text/html,test']},{logo_urls:['https://user:password@example.com/a.png']}])assert.equal(clientLogoUrl(value),null);
 assert.equal(clientLogoUrl({logo_urls:['/storage/v1/object/public/logo/a.png']}),'/storage/v1/object/public/logo/a.png');
});

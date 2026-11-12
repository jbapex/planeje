import test from 'node:test';
import assert from 'node:assert/strict';
import { validateDialogue, runAtlasMission, converseAtlas } from '../supabase/functions/_shared/atlasManager.js';
import { buildAtlasAlerts,businessWaitMinutes,isBusinessTime } from '../supabase/functions/_shared/atlasMonitor.js';
import { atlasSnapshotInfo,scrubAtlasData,atlasMonthlyFees } from '../supabase/functions/_shared/atlasManagerContext.js';
const A='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',B='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
test('automatic memory requires literal user evidence and filters credentials',()=>{
 const raw={reply:'Entendi',memories:[{content:'Preferir sexta.',quote:'Prefiro sexta'},{content:'Inventar dado.',quote:'Não foi dito'},{content:'senha: segredo',quote:'Prefiro sexta'}]};
 assert.equal(validateDialogue(raw,'Prefiro sexta para planejar.',[],null,[]).memories.length,1);
 assert.throws(()=>validateDialogue({reply:'Ok',mission:{task:'Leia',client_id:B}},'Leia',[],A,[{id:B}]),/selecionado/);
});
test('promised investigation creates work and never duplicates a pending investigation',async()=>{
 const args={message:'Confira as mensalidades.',history:[],memories:[],clients:[],clientId:null,callModel:async()=>({message:{content:JSON.stringify({reply:'Vou realizar a nova consulta com o especialista Financeiro.',mission:null,memories:[]})},usage:{prompt_tokens:10,completion_tokens:10},model:'test'})};
 assert.ok((await converseAtlas({...args,jobs:[]})).mission);
 assert.equal((await converseAtlas({...args,jobs:[{status:'running'}]})).mission,null);
 const recall=await converseAtlas({...args,message:'Até que horas a Poliana trabalha?',jobs:[],callModel:async()=>({message:{content:JSON.stringify({reply:'Poliana trabalha até as 16h.',mission:null,memories:[]})},usage:{prompt_tokens:10,completion_tokens:10},model:'test'})});assert.equal(recall.mission,null);
});
test('progress question reuses a waiting consultation even if the model proposes another mission',async()=>{
 const result=await converseAtlas({message:'E a resposta, já conseguiu?',history:[],memories:[],clients:[],clientId:null,jobs:[{status:'waiting_team',result:'Aguardando resposta de Conta Exemplo.'}],callModel:async()=>({message:{content:JSON.stringify({reply:'Vou consultar a equipe de novo.',mission:{title:'Nova consulta',task:'Perguntar novamente'},memories:[]})},model:'test'})});
 assert.equal(result.mission,null);assert.match(result.reply,/Aguardando resposta de Conta Exemplo/);
});
test('explicit new operational instruction requires durable work but a hypothetical idea does not',async()=>{
 const args={history:[],memories:[],clients:[],clientId:null,jobs:[],callModel:async()=>({message:{content:JSON.stringify({reply:'Entendi a ideia.',mission:null,memories:[]})},model:'test'})};
 assert.ok((await converseAtlas({...args,message:'Preciso criar uma campanha para o cliente.'})).mission);
 assert.equal((await converseAtlas({...args,message:'E se a gente criasse uma campanha para o cliente?'})).mission,null);
});
test('business response clock pauses nights and weekends',()=>{
 assert.equal(businessWaitMinutes('2026-10-09T16:50:00-03:00',new Date('2026-10-12T08:10:00-03:00')),20);
 assert.equal(isBusinessTime(new Date('2026-10-10T10:00:00-03:00')),false);
 assert.equal(isBusinessTime(new Date('2026-10-09T17:00:00-03:00')),false);
});
test('monitor does not infer healthy campaigns from old snapshots or notify resolved groups',()=>{
 const now=new Date('2026-10-09T10:00:00-03:00');
 const c={id:A,empresa:'Fictício',etapa:'closed',limite_meta:100,meta_resumo:{spend:120,activeCount:0,period:{since:'2026-10-01',until:'2026-10-09'},syncedAt:'2026-10-08T12:00:00Z'}};
 const old=buildAtlasAlerts({now,traffic:[c],conversations:[{id:B,is_group:true,status:'resolvido',awaiting_response_since:'2026-10-09T08:00:00-03:00'}]});
 assert.equal(old.length,1);assert.match(old[0].source_key,/freshness/);
 c.meta_resumo.syncedAt=now.toISOString();const current=buildAtlasAlerts({now,traffic:[c]});assert.equal(current.length,1);assert.match(current[0].source_key,/budget/);
 assert.equal(atlasSnapshotInfo({...c.meta_resumo,period:{since:'2026-09-01'}},now).current,false);
 assert.deepEqual(buildAtlasAlerts({now:new Date('2026-10-10T10:00:00-03:00'),traffic:[c]}),[]);
});
test('structured source data excludes nested secrets',()=>{assert.deepEqual(scrubAtlasData({name:'ok',password:'secret',rows:[{token:'secret',value:1}]}),{name:'ok',rows:[{value:1}]});});
test('monthly ranking sums installments before truncation and separates actual receipt',()=>{
 const rows=[{id:'a1',cliente_id:A,origem:'mensalidade',grupo:'receita',status:'previsto',valor:1000,data_caixa:'2026-10-20'},
 {id:'a2',cliente_id:A,origem:'mensalidade',grupo:'receita',status:'recebido',valor:1000,data_caixa:'2026-10-05'},
 {id:'cancel',cliente_id:B,origem:'mensalidade',grupo:'receita',status:'cancelado',valor:9000},
 {id:'manual',cliente_id:B,origem:'manual',grupo:'receita',status:'recebido',valor:8000},
 {id:'b1',cliente_id:B,origem:'mensalidade',grupo:'receita',status:'previsto',valor:1500,data_caixa:'2026-10-15'}];
 const fees=atlasMonthlyFees(rows,[{id:A,empresa:'Cliente A'},{id:B,empresa:'Cliente B'}]);
 assert.equal(fees[0].client_id,A);assert.equal(fees[0].monthly_total,2000);assert.equal(fees[0].received,1000);assert.equal(fees[0].outstanding,1000);assert.equal(fees[0].earliest_outstanding_due,'2026-10-20');assert.deepEqual(fees[0].source_ids,['a1','a2']);assert.equal(fees[1].monthly_total,1500);
});
const tool=(name,args)=>({id:crypto.randomUUID(),type:'function',function:{name,arguments:JSON.stringify(args)}});
const answer=(content,tools)=>({message:{role:'assistant',content,tool_calls:tools},usage:{prompt_tokens:20,completion_tokens:10,prompt_tokens_details:{cached_tokens:4}},model:'test'});
test('missing information opens a persisted internal consultation after reading sources',async()=>{
 let calls=0,asks=0;
 const result=await runAtlasMission({message:'O vídeo foi postado?',clientId:A,memories:[],readContext:async()=>({available:true,records:[]}),askInternal:async(args)=>{asks++;assert.equal(args.client_id,A);return {thread_id:B,recipient:'Executor Exemplo',state:'scheduled',scheduled_at:'2026-10-19T11:00:00Z'};},callModel:async({tools})=>{
  if(!tools.length)return answer('Você consegue confirmar a entrega e mandar o link?');
  assert.ok(tools.some(t=>t.function.name==='ask_internal'));
  if(++calls===1)return answer(null,[tool('read_context',{section:'client',client_id:A})]);
  if(calls===2)return answer(null,[tool('ask_internal',{client_id:A,task_id:null,person_id:null,question:'Você consegue confirmar se o vídeo foi postado e mandar o link?'})]);
  return answer('A consulta ficou agendada para o próximo expediente, sem confirmação de postagem.');
 }});
 assert.equal(asks,1);assert.equal(result.consultation.thread_id,B);assert.ok(result.steps.some(s=>s.kind==='internal_question'&&s.status==='pending'));
});
test('internal question is unavailable in read-only missions and cannot bypass source scope',async()=>{
 await runAtlasMission({message:'Leia',clientId:A,memories:[],readContext:async()=>({}),callModel:async({tools})=>{assert.ok(!tools.some(t=>t.function.name==='ask_internal'));return answer('Consulta.');}});
 await assert.rejects(runAtlasMission({message:'Confira',clientId:A,memories:[],readContext:async()=>({}),askInternal:async()=>{throw new Error('must not run');},callModel:async()=>answer(null,[tool('ask_internal',{client_id:B,question:'Como está?'})])}),/fora do cliente/);
});
test('private credentials cannot be sent in an internal question',async()=>{
 for(const invalid of [{question:'Confira token=SECRET_PRIVATE_VALUE da campanha.'},{question:'Consegue confirmar o andamento?',subject:'PRIVATE_FREEFORM_SUBJECT'}]){
  let calls=0;
  await assert.rejects(runAtlasMission({message:'Confira',clientId:A,memories:[],readContext:async()=>({available:true}),askInternal:async()=>{throw new Error('must not run');},callModel:async()=>++calls===1?answer(null,[tool('read_context',{section:'client',client_id:A})]):answer(null,[tool('ask_internal',{client_id:A,...invalid})])}),/pergunta operacional/);
 }
});
test('an owner instruction can open operational clarification using the same internal tool',async()=>{
 let calls=0;
 await runAtlasMission({message:'Preciso organizar uma campanha.',ownerInstruction:'Preciso organizar uma campanha.',clientId:A,memories:[],readContext:async()=>({available:true}),askInternal:async args=>{assert.equal(args.mode,'organize');return {thread_id:B,recipient:'Conta Exemplo',state:'awaiting_reply'};},callModel:async({tools})=>{
  if(!tools.length)return answer('Vamos alinhar a campanha contratada: qual é a ação e quem pode executar?');
  if(++calls===1)return answer(null,[tool('read_context',{section:'client',client_id:A})]);
  if(calls===2)return answer(null,[tool('ask_internal',{client_id:A,mode:'organize',question:'Precisamos alinhar a campanha contratada e quem vai executar.'})]);
  return answer('Registrei o alinhamento com a conta.');
 }});
});
test('private memory cannot be copied into an internal question',async()=>{
 let calls=0;
 await assert.rejects(runAtlasMission({message:'Confira a tarefa.',clientId:A,memories:[{client_id:A,content:'PRIVATE FINANCIAL FACT must stay with the owner.'}],readContext:async()=>({available:true}),askInternal:async()=>{throw new Error('must not run');},callModel:async()=>++calls===1?answer(null,[tool('read_context',{section:'client',client_id:A})]):answer(null,[tool('ask_internal',{client_id:A,question:'PRIVATE FINANCIAL FACT must stay with the owner. Pode conferir?'})])}),/privad/);
});
test('internal emitter never receives private mission text, paraphrased question or specialist opinion',async()=>{
 let calls=0;
 const result=await runAtlasMission({message:'PRIVATE_OWNER_CONTEXT',clientId:A,memories:[{content:'A conta vai encerrar por margem negativa.',client_id:A}],readContext:async(section)=>({available:true,records:section==='internal_question'?{client:{empresa:'Aurora'},task:{title:'Vídeo'}}:[]}),askInternal:async(args)=>{assert.equal(args.question,'Consegue confirmar o andamento do vídeo e a previsão?');return {thread_id:B,recipient:'Conta',state:'awaiting_reply'};},callModel:async({messages,tools})=>{
  if(!tools.length){const content=JSON.stringify(messages);assert.doesNotMatch(content,/PRIVATE_OWNER_CONTEXT|margem negativa|rescisão|prejuízo/);assert.equal(JSON.parse(messages[1].content).subject,'publicacao');return answer('Consegue confirmar o andamento do vídeo e a previsão?');}
  if(++calls===1)return answer(null,[tool('read_context',{section:'client',client_id:A})]);
  if(calls===2)return answer(null,[tool('ask_internal',{client_id:A,subject:'publicacao',question:'Entrega antes da rescisão por prejuízo da conta?'})]);
  return answer('Pergunta interna registrada.');
 }});
 assert.equal(result.usage.model_calls,4);
});
test('specialist can delegate, persist real parent links, read then consolidate',async()=>{
 let calls=0,reads=0;const results=[answer(null,[tool('delegate_specialist',{agent:'trafego',task:'Verifique'})]),answer(null,[tool('delegate_specialist',{agent:'resultados',task:'Cruze'})]),answer(null,[tool('read_context',{section:'results',client_id:A})]),answer('Resultado verificado'),answer('Parecer tráfego'),answer('Consolidação')];
 const result=await runAtlasMission({message:'Leia',clientId:A,memories:[],callModel:async()=>{calls++;return results.shift();},readContext:async()=>{reads++;return {available:true,source:'fixture'};}});
 assert.match(result.content,/^Consolidação/);assert.match(result.content,/Fontes consultadas/);assert.equal(reads,1);assert.equal(calls,6);assert.ok(result.steps.some(s=>s.agent==='resultados'&&s.parent==='trafego'));assert.equal(result.usage.cached_tokens,24);
});
test('mission refuses source scope changes and recursive delegation',async()=>{
 await assert.rejects(runAtlasMission({message:'Leia',clientId:A,memories:[],callModel:async()=>answer(null,[tool('read_context',{section:'client',client_id:B})]),readContext:async()=>{throw new Error('should not run');}}),/fora do cliente/);
 let count=0;await assert.rejects(runAtlasMission({message:'Leia',clientId:A,memories:[],callModel:async()=>++count===1?answer(null,[tool('delegate_specialist',{agent:'trafego',task:'Leia'})]):answer(null,[tool('delegate_specialist',{agent:'trafego',task:'Recurse'})]),readContext:async()=>({})}),/não permitida/);
});
test('failed reads remain unavailable rather than zero in the model tool result',async()=>{
 let calls=0;await runAtlasMission({message:'Leia',clientId:A,memories:[],callModel:async({messages})=>{if(++calls===1)return answer(null,[tool('read_context',{section:'overview'})]);assert.equal(JSON.parse(messages.at(-1).content).available,false);return answer('Fonte indisponível');},readContext:async()=>({available:false,reason:'failure'})});
});
test('invalid model identifiers can be corrected without dropping the mission',async()=>{
 let calls=0,reads=0;
 const result=await runAtlasMission({message:'Confira',clientId:null,memories:[],callModel:async({messages})=>{
  calls++;
  if(calls===1)return answer(null,[tool('read_context',{section:'portfolio',client_id:'agência'})]);
  if(calls===2){assert.equal(JSON.parse(messages.at(-1).content).invalid_arguments,true);return answer(null,[tool('read_context',{section:'portfolio',client_id:null})]);}
  return answer('Consulta corrigida');
 },readContext:async(section,{clientId})=>{reads++;assert.equal(clientId,null);return {available:true};}});
 assert.equal(reads,1);assert.equal(calls,3);assert.ok(result.steps.some(s=>s.kind==='tool_error'));assert.match(result.content,/Consulta corrigida/);
});

test('actual operational questions cannot silently turn into generic management advice',async()=>{
 for(const message of ['Como estão as demandas para hoje?','Como está o meu tráfego hoje?','Como foram as conversas de ontem?']) {
  const result=await converseAtlas({message,history:[],memories:[],clients:[],clientId:null,jobs:[],callModel:async()=>answer(JSON.stringify({reply:'Confira tarefas e verifique os clientes.',mission:null,memories:[]}))});
  assert.ok(result.mission);assert.match(result.mission.task,new RegExp(message.slice(0,-1).replace(/[?]/g,'')));
 }
});

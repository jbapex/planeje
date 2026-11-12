import test from 'node:test';
import assert from 'node:assert/strict';
import { runAtlasMission } from '../supabase/functions/_shared/atlasManager.js';

const A='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',B='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const tool=(name,args)=>({id:crypto.randomUUID(),type:'function',function:{name,arguments:JSON.stringify(args)}});
const answer=(content,tool_calls)=>({message:{role:'assistant',content,tool_calls},usage:{prompt_tokens:20,completion_tokens:10},model:'fixture'});
const ask=()=>tool('ask_internal',{client_id:A,subject:'andamento',question:'Consegue confirmar o andamento das entregas?'});

test('a premature internal question recovers by consulting the specialist before contacting the team',async()=>{
 let calls=0;
 const order=[];
 const result=await runAtlasMission({message:'Confira as demandas e busque com o responsável o que faltar.',clientId:A,memories:[],
  callModel:async({messages,tools})=>{
   if(!tools.length)return answer('Consegue confirmar o andamento da entrega registrada?');
   switch(++calls){
    case 1:return answer(null,[ask()]);
    case 2:assert.equal(JSON.parse(messages.at(-1).content).source_required,true);return answer(null,[tool('delegate_specialist',{agent:'operacao',task:'Consulte as tarefas deste cliente e identifique o que falta confirmar.'})]);
    case 3:return answer(null,[tool('read_context',{section:'tasks',client_id:A})]);
    case 4:return answer('Há uma entrega sem confirmação; consulte a conta.');
    case 5:return answer(null,[ask()]);
    default:return answer('Pergunta registrada para a conta; aguardando confirmação.');
   }
  },
  readContext:async(section,{clientId})=>{assert.equal(clientId,A);order.push(section);return {available:true,records:{title:'Entrega registrada'}};},
  askInternal:async()=>{order.push('contact');return {thread_id:B,recipient:'Conta Exemplo',state:'scheduled'};},
 });
 assert.deepEqual(order,['tasks','internal_question','contact']);
 assert.equal(result.consultation.thread_id,B);
 assert.equal(result.steps.filter(s=>s.kind==='internal_question').length,1);
 assert.equal(result.steps.some(s=>s.kind==='error'),false);
 assert.equal(result.usage.model_calls,7);
 assert.equal(result.usage.tool_calls,4);
});

test('a refused question in a parallel tool batch does not discard the following source read',async()=>{
 let calls=0,contacts=0;
 const result=await runAtlasMission({message:'Confira a entrega.',clientId:A,memories:[],
  callModel:async({messages,tools})=>{
   if(!tools.length)return answer('Consegue confirmar a entrega registrada?');
   if(++calls===1)return answer(null,[ask(),tool('read_context',{section:'client',client_id:A})]);
   if(calls===2){assert.equal(messages.filter(m=>m.role==='tool').length,2);return answer(null,[ask()]);}
   return answer('Pergunta registrada.');
  },readContext:async()=>({available:true,records:[]}),
  askInternal:async()=>{contacts++;return {thread_id:B,recipient:'Conta Exemplo',state:'scheduled'};},
 });
 assert.equal(contacts,1);
 assert.equal(result.consultation.thread_id,B);
});

test('unavailable or other-client sources cannot unlock team contact',async()=>{
 for(const [target,available] of [[A,false],[B,true]]){
  let calls=0,contacts=0;
  const result=await runAtlasMission({message:'Confira a entrega.',clientId:null,memories:[],
   callModel:async({messages})=>{
    if(++calls===1)return answer(null,[tool('read_context',{section:'client',client_id:target})]);
    if(calls===2)return answer(null,[ask()]);
    assert.equal(JSON.parse(messages.at(-1).content).source_required,true);
    return answer('Não há fonte disponível deste cliente para perguntar à equipe.');
   },readContext:async()=>({available,records:[]}),askInternal:async()=>{contacts++;},
  });
  assert.equal(contacts,0);
  assert.equal(result.consultation,null);
 }
});

test('repeated premature questions remain bounded by the existing model and tool budgets',async()=>{
 for(const limits of [{calls:2},{tools:2}]){
  let contacts=0,modelCalls=0,reads=0;
  await assert.rejects(runAtlasMission({message:'Confira a entrega.',clientId:A,memories:[],limits,
   callModel:async()=>{modelCalls++;return answer(null,[ask()]);},
   readContext:async()=>{reads++;return {available:true};},askInternal:async()=>{contacts++;},
  }),error=>{assert.equal(error.code,'BUDGET_EXCEEDED');return true;});
  assert.equal(contacts,0);assert.equal(reads,0);assert.equal(modelCalls,limits.calls||3);
 }
});

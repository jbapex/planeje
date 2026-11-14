import assert from 'node:assert/strict';
import test from 'node:test';
import { createClient } from '@supabase/supabase-js';
const clientId = '00000000-0000-4000-8000-000000000011';
const fixture = () => {
  const requests=[];
  const caller=createClient('https://fixture.invalid','synthetic-public-key',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async (value,options={})=>{
    const url=new URL(value);assert.equal(url.hostname,'fixture.invalid');requests.push(url.pathname);
    assert.equal(url.pathname,'/rest/v1/rpc/atlas_squad_automation_manual_access');
    return new Response('true',{headers:{'content-type':'application/json'}});
  }}});
  return {caller,requests};
};

test('manual executa IA real do callback orçado sem ferramentas e registra saída do passo',async()=>{
  const {runManualSquadAutomation}=await import('../../supabase/functions/_shared/atlasExecutorAutomation.js');
  const f=fixture(),progress=[];
  const result=await runManualSquadAutomation({caller:f.caller,clientId,plan:{version:1,recipe:'squad_manual',name:'Demonstração',steps:[{id:'answer',type:'ai',instruction:'Retorne Demonstração'}]},
    callModel:async payload=>{assert.equal(Object.hasOwn(payload,'tools'),false);assert.equal(payload.maxTokens,2200);return {message:{content:'Demonstração'},usage:{prompt_tokens:10,completion_tokens:2},model:'fixture-model'};},onProgress:async state=>progress.push(state)});
  assert.equal(result.state,'completed');assert.equal(result.output,'Demonstração');assert.equal(result.steps[0].state,'completed');assert.equal(result.steps[0].output,'Demonstração');
  assert.equal(result.usage.model_calls,1);assert.equal(result.usage.prompt_tokens,10);assert.ok(progress.some(state=>state.steps[0].state==='running'));
});

const api=()=>import('../../supabase/functions/_shared/atlasExecutorAutomation.js');
const manual=steps=>({version:1,recipe:'squad_manual',name:'Fluxo fictício',steps});
test('condição falsa registra saída e não chama IA posterior',async()=>{
  const {runManualSquadAutomation}=await api();let calls=0;
  const result=await runManualSquadAutomation({caller:fixture().caller,plan:manual([{id:'source',type:'result',text:'baixo'},{id:'gate',type:'condition',source:{step_id:'source'},operator:'eq',value:'alto'},{id:'unused',type:'ai',instruction:'Nunca executar'}]),callModel:async()=>{calls++;}});
  assert.equal(result.state,'completed');assert.equal(result.output,false);assert.equal(result.steps[2].state,'skipped');assert.equal(calls,0);
});
test('plano rejeita ciclos, escritas, escopo injetado, passos demais e caminhos de protótipo',async()=>{
  const {validateManualSquadAutomation}=await api();
  for(const steps of [[{id:'a',type:'write',app:'crm',action:'save_lead'}],[{id:'a',type:'ai',instruction:'x',input_steps:['a']}],[{id:'a',type:'read',app:'financeiro',view:'overview'}],[{id:'a',type:'read',app:'crm',view:'overview',input:{client_id:clientId}}],Array.from({length:9},(_,i)=>({id:'a'+i,type:'result',text:'x'})),[{id:'a',type:'result',text:'x'},{id:'b',type:'condition',source:{step_id:'a',path:['__proto__']},operator:'exists'}]])assert.throws(()=>validateManualSquadAutomation(manual(steps)));
});
test('modelo não recebe ferramentas e tentativa de ferramenta falha sem transporte',async()=>{
  const {runManualSquadAutomation}=await api();
  const result=await runManualSquadAutomation({caller:fixture().caller,plan:manual([{id:'a',type:'ai',instruction:'x'}]),callModel:async()=>({message:{content:'x',tool_calls:[{function:{name:'send_message'}}]}})});
  assert.equal(result.state,'failed');assert.equal(result.error.code,'PROVIDER_INVALID');assert.equal(result.usage.token_usage_complete,false);assert.equal(result.usage.budget_output_tokens,2200);
});
test('uso ausente consome limite conservador e a oitava chamada não ocorre',async()=>{
  const {runManualSquadAutomation}=await api(),budgets=[];
  const result=await runManualSquadAutomation({caller:fixture().caller,plan:manual(Array.from({length:8},(_,i)=>({id:'a'+i,type:'ai',instruction:'x'}))),callModel:async request=>{budgets.push(request.maxTokens);return {message:{content:'ok'}};}});
  assert.equal(result.state,'failed');assert.equal(result.error.code,'BUDGET_EXCEEDED');assert.deepEqual(budgets,[2200,2200,2200,2200,2200,2200,800]);assert.equal(result.usage.budget_output_tokens,14000);
});
test('revogação entre passos bloqueia chamada de modelo seguinte',async()=>{
  const {runManualSquadAutomation}=await api();let access=0,calls=0;
  const caller={rpc:()=>Promise.resolve({data:++access===1,error:null})};
  const result=await runManualSquadAutomation({caller,plan:manual([{id:'a',type:'result',text:'primeiro'},{id:'b',type:'ai',instruction:'x'}]),callModel:async()=>{calls++;}});
  assert.equal(result.state,'failed');assert.equal(result.error.code,'ATLAS_FORBIDDEN');assert.equal(result.steps[0].output,'primeiro');assert.equal(calls,0);
});
test('cancelamento encerra callback que não respeita sinal sem retry',async()=>{
  const {runManualSquadAutomation}=await api(),controller=new AbortController();let calls=0;
  const result=await runManualSquadAutomation({caller:fixture().caller,signal:controller.signal,plan:manual([{id:'a',type:'ai',instruction:'x'}]),callModel:async()=>{calls++;controller.abort();return new Promise(()=>{});}});
  assert.equal(result.state,'cancelled');assert.equal(calls,1);assert.equal(result.usage.token_usage_complete,false);
});
test('rascunho para Executar Agora exige proposta e revisão exatas, sem gravar definição',async()=>{
  const {manualPlanFromAutomationProposal}=await api();
  const item={kind:'proposal',app:'atlas',action:'save_automation',state:'proposed',revision:2,payload:{id:null,revision:null,recipe:'squad_manual',config:manual([{id:'a',type:'ai',instruction:'Retorne Demonstração'}])}};
  assert.equal(manualPlanFromAutomationProposal(item,{revision:2}).steps[0].instruction,'Retorne Demonstração');
  for(const changed of [{revision:1},{state:'completed'},{action:'activate_automation'},{app:'crm'}])assert.throws(()=>manualPlanFromAutomationProposal({...item,...changed},{revision:2}));
});
test('preparação de Salvar manual só lê snapshot e oferece cards revisáveis',async()=>{
  const {prepareExecutorAutomation}=await api(),calls=[];
  const caller={rpc:(name,args)=>{calls.push({name,args});return Promise.resolve({data:{automation:null,source:{},version:'a'.repeat(32)},error:null});}};
  const plan=manual([{id:'answer',type:'ai',instruction:'Retorne Demonstração'}]);
  const result=await prepareExecutorAutomation(caller,{app:'atlas',clientId:null,action:'save_automation',input:{recipe:'squad_manual',config:plan}});
  assert.equal(result.payload.recipe,'squad_manual');assert.equal(result.effect.enables_autonomy,false);assert.equal(result.preview.flow.nodes[0].type,'trigger');assert.equal(result.preview.flow.nodes[1].id,'answer');
  assert.ok(calls.every(call=>call.name==='atlas_squad_automation_snapshot'));
});
test('resolver Executar Agora só aceita ponteiro de proposta/revisão e Marca exatas',async()=>{
 const {prepareSquadAutomationRun}=await api(),plan=manual([{id:'a',type:'result',text:'ok'}]);let calls=0;
 const item={id:'00000000-0000-4000-8000-000000000071',kind:'proposal',app:'atlas',action:'save_automation',state:'proposed',client_id:clientId,revision:3,payload:{recipe:'squad_manual',config:plan}};
 const caller={rpc:(name,args)=>{assert.equal(name,'atlas_squad_item');assert.equal(args.p_write,true);calls++;return Promise.resolve({data:item,error:null});}};
 assert.equal((await prepareSquadAutomationRun(caller,{clientId,proposalId:item.id,revision:3})).plan.name,'Fluxo fictício');
 await assert.rejects(()=>prepareSquadAutomationRun(caller,{clientId:null,proposalId:item.id,revision:3}));
 await assert.rejects(()=>prepareSquadAutomationRun(caller,{clientId,proposalId:item.id,automationId:item.id,revision:3}));assert.equal(calls,2);
});
test('manual não lê memórias, filas ou jobs do Office',async()=>{
 const {validateManualSquadAutomation}=await api();
 for(const [app,view] of [['gestor','memory'],['cs','group_requests'],['cs','group_activity']])assert.throws(()=>validateManualSquadAutomation(manual([{id:'read',type:'read',app,view,input:{}}])),error=>error.code==='TOOL_DENIED');
});
test('cards de CS preservam áudio e regras omitidas da fonte atual',async()=>{
 const {prepareExecutorAutomation}=await api(),group='00000000-0000-4000-8000-000000000013';
 const caller={rpc:()=>Promise.resolve({data:{automation:null,source:{snapshot:{reading:{include_audio:true,transcribe_new_audio:false},task_moves:{enabled:true},task_creation:{enabled:false},task_context:{enabled:false}}},version:'a'.repeat(32)},error:null})};
 const result=await prepareExecutorAutomation(caller,{app:'cs',clientId,action:'save_automation',input:{recipe:'cs_group_tasks',config:{name:'Grupo fictício',conversation_id:group}}});
 assert.equal(result.payload.config.include_audio,true);assert.equal(result.payload.config.moves,true);assert.match(result.preview.flow.nodes[2].description,/Áudio: incluído/);
});

test('leitura indisponível não vira zero e não dispara o próximo modelo',async()=>{
 const {runManualSquadAutomation}=await api();let modelCalls=0;
 const caller={rpc:name=>Promise.resolve(name==='atlas_squad_automation_manual_access'?{data:true,error:null}:{data:null,error:{code:'42501'}})};
 const result=await runManualSquadAutomation({caller,clientId,plan:manual([{id:'read',type:'read',app:'crm',view:'overview'},{id:'ai',type:'ai',instruction:'Resuma a fonte'}]),callModel:async()=>{modelCalls++;}});
 assert.equal(result.state,'failed');assert.equal(result.error.code,'SOURCE_UNAVAILABLE');assert.equal(result.steps[0].state,'failed');assert.equal(result.steps[1].state,'skipped');assert.equal(modelCalls,0);assert.equal(result.output,null);
});
test('leitura nativa fornece condição numérica e contexto real para IA',async()=>{
 const {runManualSquadAutomation}=await api();
 const caller={rpc:name=>Promise.resolve({data:name==='atlas_squad_automation_manual_access'?true:{totals:{leads:5}},error:null})};
 const result=await runManualSquadAutomation({caller,clientId,plan:manual([{id:'read',type:'read',app:'crm',view:'overview'},{id:'gate',type:'condition',source:{step_id:'read',path:['data','totals','leads']},operator:'gt',value:2},{id:'ai',type:'ai',instruction:'Resuma',input_steps:['read']}]),callModel:async payload=>{assert.match(payload.messages[1].content,/"leads":5/);return {message:{content:'Cinco leads'},usage:{prompt_tokens:10,completion_tokens:3}};}});
 assert.equal(result.state,'completed');assert.equal(result.steps[1].output,true);assert.equal(result.output,'Cinco leads');assert.equal(result.usage.tool_calls,1);
});
test('leitura de automação remove credenciais legadas da fonte antes de entrar no contexto',async()=>{
 const {readExecutorAutomation}=await api();
 const caller={rpc:()=>Promise.resolve({data:{automations:[],source:{agent:{funil:{legacy:{api_token:'synthetic-secret-not-for-model'}}}}},error:null})};
 const result=await readExecutorAutomation(caller,{app:'crm',clientId,view:'automations'});assert.doesNotMatch(JSON.stringify(result),/synthetic-secret-not-for-model/);
});
test('ativação de follow-up declara envio futuro como efeito externo da autonomia',async()=>{
 const {prepareExecutorAutomation}=await api(),automationId='00000000-0000-4000-8000-000000000077';
 const config={name:'Follow-up fictício',pipeline_id:'00000000-0000-4000-8000-000000000078',stage_ids:['00000000-0000-4000-8000-000000000079'],cadence:[{valor:1,unidade:'horas'}]};
 const caller={rpc:()=>Promise.resolve({data:{automation:{id:automationId,revision:1,state:'saved',recipe:'crm_followup',config},source:{ready:true,available:true},version:'a'.repeat(32)},error:null})};
 const result=await prepareExecutorAutomation(caller,{app:'crm',clientId,action:'activate_automation',input:{id:automationId}});assert.equal(result.effect.enables_autonomy,true);assert.equal(result.effect.external,true);
});

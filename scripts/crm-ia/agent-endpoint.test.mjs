import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const folder=await mkdtemp(join(tmpdir(),'crm-agent-endpoint-')),output=join(folder,'endpoint.mjs');
const originalFetch=globalThis.fetch,originalDeno=globalThis.Deno;
const client='00000000-0000-4000-8000-000000000011',agentId='00000000-0000-4000-8000-000000000081';
let allowed=true,status='active',role='admin',visible=false,authorizations=0,models=0,historyReads=0;
const agent={id:agentId,cliente_id:client,nome:'Aurora',modelo:'openai/gpt-4o-mini',ativo:true,auto_responder:false,base_ids:[],funil:{crm_ia:{tipo:'qualificacao',pipeline_id:'pipeline',stage_ids:['stage'],variaveis:[],idiomas:['pt']}}};
const db={auth:{async getUser(){return{data:{user:{id:'actor'}},error:null};}},async rpc(name){if(name==='cliente_atend_loja_habilitada')return{data:true,error:null};if(name==='cliente_atend_nivel_de')return{data:'atendente',error:null};if(name==='cliente_atend_pode_ver_contato_de')return{data:visible,error:null};assert.equal(name,'crm_ia_workspace');authorizations++;return{data:{allowed,manage:true},error:null};},from(table){
 if(table==='cliente_whatsapp_inbox'||table==='cliente_whatsapp_sent')historyReads++;
 const rows=table==='profiles'?[{id:'actor',role,status,cliente_id:client}]:table==='cliente_atend_ia_agentes'?[agent]:table==='crm_ia_config'?[{cliente_id:client,data:{},revision:'rev'}]:table==='clientes'?[{id:client,empresa:'Aurora'}]
  :table==='leads'?[{id:'lead',pipeline_id:'pipeline',stage_id:'stage',crm_ia_fields:{}}]:table==='cliente_whatsapp_contact'?[{id:'contact',from_jid:'5511999999999@s.whatsapp.net'}]:table==='cliente_whatsapp_config'?[{id:'channel'}]
  :table==='cliente_whatsapp_inbox'?[{id:'private',body:'CONTEUDO RESTRITO',created_at:'2026-11-11T12:00:00Z'}]:[];
 let single=false;const q={select(){return q;},eq(){return q;},is(){return q;},or(){return q;},order(){return q;},limit(){return q;},in(){return q;},insert(){return q;},maybeSingle(){single=true;return q;},then(resolve,reject){return Promise.resolve({data:single?rows[0]||null:rows,error:null}).then(resolve,reject);}};return q;}};
globalThis.__crmAgentDb=db;
globalThis.Deno={env:{get:name=>({SUPABASE_URL:'https://fixture.invalid',SUPABASE_SERVICE_ROLE_KEY:'fixture-service',SUPABASE_ANON_KEY:'fixture-anon',OPENAI_API_KEY:'fixture-model'})[name]}};
globalThis.fetch=async url=>{assert.equal(url,'https://api.openai.com/v1/chat/completions');models++;return new Response(JSON.stringify({choices:[{message:{content:'{"text":"Como posso ajudar?","action":{"type":"answer"}}'}}],usage:{total_tokens:3}}));};
await build({entryPoints:['supabase/functions/atendimento-ia/index.ts'],outfile:output,bundle:true,format:'esm',platform:'node',plugins:[{name:'isolated-edge',setup(builder){builder.onResolve({filter:/^https:\/\//},({path})=>({path,namespace:'fixture'}));builder.onLoad({filter:/.*/,namespace:'fixture'},({path})=>({contents:path.includes('supabase-js')?'export const createClient=()=>globalThis.__crmAgentDb;':'export const serve=handler=>globalThis.__crmAgentHandler=handler;'}));}}]});
await import(pathToFileURL(output));
const invoke=(patch={})=>globalThis.__crmAgentHandler(new Request('https://fixture.invalid/atendimento-ia',{method:'POST',headers:{Authorization:'Bearer fixture-user','Content-Type':'application/json'},body:JSON.stringify({acao:'testar',cliente_id:client,agente_id:agentId,mensagens:[{role:'user',content:'Olá'}],...patch})}));
test('active staff may preview a typed agent only after workspace authorization, with no WhatsApp',async()=>{const response=await invoke();assert.equal(response.status,200);const data=await response.json();assert.equal(data.preview,true);assert.ok(authorizations>0);assert.equal(models,1);});
test('denied or inactive staff never reach the model',async()=>{allowed=false;const count=models;assert.equal((await invoke()).status,403);allowed=true;status='pending';assert.equal((await invoke()).status,403);assert.equal(models,count);status='active';});
test('a client attendant cannot read or suggest on a private conversation assigned to another person',async()=>{role='cliente';visible=false;const beforeModels=models,beforeHistory=historyReads;const response=await invoke({acao:'sugerir',contact_id:'00000000-0000-4000-8000-000000000031',whatsapp_config_id:'00000000-0000-4000-8000-000000000021'});assert.equal(response.status,403);assert.equal(models,beforeModels);assert.equal(historyReads,beforeHistory);role='admin';});
test.after(async()=>{globalThis.fetch=originalFetch;globalThis.Deno=originalDeno;delete globalThis.__crmAgentDb;delete globalThis.__crmAgentHandler;await rm(folder,{recursive:true,force:true});});

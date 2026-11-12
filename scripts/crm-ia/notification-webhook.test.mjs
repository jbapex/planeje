import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { build } from 'esbuild';
const result=await build({entryPoints:['supabase/functions/uazapi-inbox-webhook/index.ts'],bundle:true,write:false,format:'cjs',platform:'node',plugins:[{name:'offline-webhook',setup(b){b.onResolve({filter:/^https:\/\//},a=>({path:a.path,namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path.includes('/http/server.ts')?'export const serve=handler=>globalThis.handler=handler;':'export const createClient=()=>globalThis.db;'}));}}]});
const client='00000000-0000-4000-8000-000000000011',channel='00000000-0000-4000-8000-000000000021',jid='5511000000000@s.whatsapp.net';
async function invoke({confirmed=true,api=true,fromMe=true,existing=false,message='fixture-provider',candidate=false,receiptAtWrite=false}={}){
 const reads=[],writes=[],calls=[];
 const db={async rpc(name,args){calls.push({name,args:JSON.parse(JSON.stringify(args))});if(name==='crm_ia_notification_webhook_receipt')return{data:{notification:confirmed,...(candidate&&{notification:false,snapshot_id:'snapshot'})}};if(name==='crm_ia_notification_webhook_write'){if(receiptAtWrite)return{data:{notification:true}};throw Error('fixture-atomic-write');}if(name==='caixa_dono_padrao_conversa')return{data:null};throw Error(`RPC externo proibido: ${name}`);},from(table){reads.push(table);const query={select(){return query;},eq(){return query;},limit(){return query;},maybeSingle(){return Promise.resolve({data:table==='cliente_whatsapp_config'?{id:channel,webhook_secret:'fixture'}:table==='atendimento_conversas'&&existing?{id:'existing',status:'em_atendimento',unread_count:0}:null});},upsert(value){writes.push({table,value:JSON.parse(JSON.stringify(value))});throw Error('fixture-first-write');},insert(value){writes.push({table,value});throw Error('fixture-first-write');}};return query;}};
 const context={db,handler:null,Deno:{env:{get:name=>name==='SUPABASE_URL'?'https://fixture.invalid':name==='SUPABASE_SERVICE_ROLE_KEY'?'fixture-service':undefined}},Response,Request,Headers,URL,TextEncoder,TextDecoder,Uint8Array,console:{log(){},error(){}},crypto:globalThis.crypto,setTimeout,clearTimeout,fetch:async()=>new Response('{}')};vm.runInNewContext(result.outputFiles[0].text,context);
 let response,error;try{response=await context.handler(new Request(`https://fixture.invalid/webhook?cliente_id=${client}&secret=fixture`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({event:'messages',data:{messageid:message,fromMe,wasSentByApi:api,chatid:jid,text:'Mesmo texto de uma pessoa',type:'text'}})}));}catch(failure){error=failure;}
 return{response,error,reads,writes,calls};
}
test('receipt exato encerra webhook real antes de sent, contato ou atendimento, existente ou não',async()=>{
 for(const existing of [true,false])for(let repeat=0;repeat<2;repeat++){
  const r=await invoke({existing});assert.equal(r.response?.status,200);assert.equal(r.error,undefined);assert.equal(r.writes.length,0);assert.equal(r.reads.includes('cliente_whatsapp_contact'),false);assert.deepEqual(r.calls.find(c=>c.name==='crm_ia_notification_webhook_receipt')?.args,{p_client:client,p_channel:channel,p_jid:jid,p_message:'fixture-provider'});
 }
});
test('eco sem receipt, humano com mesmo texto e inbound seguem caminho conservador',async()=>{
 for(const options of [{confirmed:false},{api:false},{fromMe:false}]){const r=await invoke(options);assert.equal(r.error?.message,'fixture-first-write');assert.equal(r.writes[0].table,'atendimento_conversas');if(options.api===false||options.fromMe===false)assert.equal(r.calls.some(c=>c.name==='crm_ia_notification_webhook_receipt'),false);}
});

test('callback candidato usa RPC atômica com payload legado, sem upsert paralelo',async()=>{const r=await invoke({candidate:true,existing:true});assert.equal(r.error?.message,'fixture-atomic-write');assert.equal(r.writes.length,0);const write=r.calls.find(c=>c.name==='crm_ia_notification_webhook_write');assert.equal(write.args.p_snapshot,'snapshot');assert.equal(write.args.p_payload.cliente_id,client);assert.equal(write.args.p_payload.whatsapp_config_id,channel);assert.equal(write.args.p_payload.chat_jid,jid);assert.equal(write.args.p_payload.last_message_preview,'Mesmo texto de uma pessoa');});
test('receipt entre snapshot e escrita suprime callback real antes de qualquer mutação',async()=>{for(const existing of [true,false]){const r=await invoke({candidate:true,receiptAtWrite:true,existing});assert.equal(r.response?.status,200);assert.equal(r.writes.length,0);assert.equal(r.reads.includes('cliente_whatsapp_contact'),false);}});

import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { build } from 'esbuild';
const result=await build({entryPoints:[new URL('../../supabase/functions/uazapi-send-message/index.ts',import.meta.url).pathname],bundle:true,write:false,format:'cjs',platform:'node',plugins:[{name:'offline-edge-runtime',setup(b){b.onResolve({filter:/^https:\/\//},args=>({path:args.path,namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:args.path.includes('/http/server.ts')?'export const serve=handler=>globalThis.handler=handler;':'export const createClient=()=>globalThis.db;'}));}}]});
const body={origem:'crm-ia',outbox_id:'outbox',claim_token:'claim',cliente_id:'client',whatsapp_config_id:'channel',contact_id:'source',to:'5511000000000@s.whatsapp.net',body:'Resumo interno'};
async function invoke(patch={},options={}){
 const calls=[],queries=[];let checks=0;
 const db={async rpc(name,args){calls.push(name);if(name==='crm_ia_delivery_recheck')return{data:{allowed:!(options.revoked&&++checks===3),id:body.outbox_id,claim_token:body.claim_token,cliente_id:body.cliente_id,whatsapp_config_id:body.whatsapp_config_id,contact_id:body.contact_id,to:body.to,body:body.body,...(!options.noProof&&{internal_notification:{event_id:'event',source_contact_id:body.contact_id,to:body.to}})}};if(name==='crm_ia_delivery_actor_check')return{data:{allowed:true,human:false,actor_id:'actor'}};if(name==='crm_ia_notification_note_receipt'){assert.deepEqual(JSON.parse(JSON.stringify(args)),{p_id:'outbox',p_claim_token:'claim',p_message:'provider-fixture'});return{data:{handled:true,recorded:true}};}if(name==='crm_ia_delivery_start'||name==='cliente_atend_loja_habilitada')return{data:true};assert.fail(name);},from(table){queries.push(table);const query={select(){return query;},eq(){return query;},like(){return query;},limit(){return query;},insert(){assert.fail(`Aviso não grava ${table}`);},maybeSingle(){return Promise.resolve({data:table==='cliente_whatsapp_config'?{id:'channel',subdomain:'fixture',token:'fixture-token'}:null});}};return query;}};
 const fetches=[];const context={db,handler:null,Deno:{env:{get:name=>name==='SUPABASE_URL'?'https://fixture.invalid':name==='SUPABASE_SERVICE_ROLE_KEY'?'fixture-service':undefined}},Response,Request,Headers,TextEncoder,TextDecoder,Uint8Array,console,crypto:globalThis.crypto,fetch:async(url,init)=>{fetches.push({url,payload:JSON.parse(init.body)});return new Response(JSON.stringify({success:true,messageid:'provider-fixture'}),{status:200,headers:{'Content-Type':'application/json'}});}};
 vm.runInNewContext(result.outputFiles[0].text,context);
 const response=await context.handler(new Request('https://fixture.invalid/send',{method:'POST',headers:{Authorization:'Bearer fixture-service','Content-Type':'application/json'},body:JSON.stringify({...body,...patch})}));
 return{response,json:await response.json(),fetches,calls,queries};
}
test('aviso textual usa destino SQL sem contato falso nem histórico/echo da fonte',async()=>{
 const result=await invoke();assert.equal(result.response.status,200);assert.equal(result.fetches.length,1);assert.match(result.fetches[0].url,/\/send\/text$/);assert.deepEqual(result.fetches[0].payload,{number:'5511000000000',text:'Resumo interno'});assert.equal(result.json.sent_row_id,null);
 assert.equal(result.queries.includes('cliente_whatsapp_contact'),false);assert.equal(result.queries.includes('cliente_whatsapp_sent'),false);assert.equal(result.queries.includes('atendimento_conversas'),false);assert.equal(result.calls.filter(name=>name==='crm_ia_delivery_recheck').length,3);
 assert.equal(result.calls.includes('crm_ia_notification_note_receipt'),true);
});
test('última revalidação após consulta do canal bloqueia fetch se revogada',async()=>{const r=await invoke({}, {revoked:true});assert.equal(r.response.status,403);assert.equal(r.fetches.length,0);});
test('body forjado, mídia, citação, reação e troca de destino não chegam ao fetch',async()=>{
 for(const patch of [{internal:true},{file:'AA==',media_type:'image'},{forward:true},{replyid:'message'},{action:'react'},{to:'5511000000001@s.whatsapp.net'},{whatsapp_config_id:'other'},{contact_id:'other'},{to_jid:body.to},{text:body.body}]){const r=await invoke(patch);assert.equal(r.response.status,403,JSON.stringify(patch));assert.equal(r.fetches.length,0);}
 const r=await invoke({internal:true},{noProof:true});assert.equal(r.response.status,403);assert.equal(r.fetches.length,0);
});

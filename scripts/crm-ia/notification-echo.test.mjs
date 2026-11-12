import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const scratch=await mkdtemp('/tmp/crm-notification-echo-'),output=join(scratch,'caller.mjs');
await build({entryPoints:['supabase/functions/uazapi-inbox-webhook/lojaIaAutoReply.ts'],bundle:true,format:'esm',platform:'node',outfile:output});
const {ensureLojaAtendConversa}=await import(pathToFileURL(output));
const client='00000000-0000-4000-8000-000000000011',channel='00000000-0000-4000-8000-000000000021',contact='00000000-0000-4000-8000-000000000031';
function fixture({handled=true,failure=false,active=true}={}){
 const calls=[],patches=[],conversation={id:'conversation',cliente_id:client,contact_id:contact,status:'esperando',ia_pausada:false,updated_at:'2026-11-11T10:00:00Z',crm_ia_runtime:{active}};
 const db={async rpc(name,args){calls.push({name,args});if(name==='cliente_atend_loja_habilitada')return{data:true};if(name==='crm_ia_notification_echo')return failure?{error:{message:'fixture failure'}}:{data:{handled}};if(name==='crm_ia_agent_note_api_echo')return{data:false};assert.fail(name);},from(table){let patch=null;const query={select(){return query;},eq(){return query;},order(){return query;},limit(){return query;},update(value){patch=value;return query;},insert(value){patches.push(value);return query;},maybeSingle(){return Promise.resolve({data:table==='cliente_atend_conversas'?structuredClone(conversation):{data:{attendance:{pause_on_human:true}}}});},then(resolve,reject){if(patch)patches.push(patch);return Promise.resolve({data:table==='cliente_whatsapp_sent'?[]:null}).then(resolve,reject);}};return query;}};
 return{calls,patches,conversation,run:extra=>ensureLojaAtendConversa({supabase:db,clienteId:client,contactId:contact,fromMe:true,sentByApi:true,messageId:'provider-id',whatsappConfigId:channel,...extra})};
}
test('eco comprovado sai antes da pausa e chama SQL com ID, canal, contato e versão, sem texto',async()=>{
 const f=fixture();await f.run();assert.equal(f.patches.length,0);assert.deepEqual(f.calls.find(c=>c.name==='crm_ia_notification_echo')?.args,{p_client:client,p_channel:channel,p_contact:contact,p_message:'provider-id',p_expected:f.conversation.updated_at});
});
test('sem prova ou falha de consulta mantém pausa humana; corpo/tempo não autorizam eco',async()=>{
 for(const options of [{handled:false},{failure:true}]){const f=fixture(options);await f.run();assert.equal(f.patches.length,1);assert.equal(f.patches[0].ia_pausada,true);}
 const human=fixture();await human.run({sentByApi:false});assert.equal(human.calls.some(c=>c.name==='crm_ia_notification_echo'),false);assert.equal(human.patches[0].ia_pausada,true);
});
test('consulta estrita também cobre destinatário existente fora do runtime IA',async()=>{const f=fixture({active:false});await f.run();assert.equal(f.patches.length,0);assert.equal(f.calls.some(c=>c.name==='crm_ia_notification_echo'),true);});
test.after(async()=>rm(scratch,{recursive:true,force:true}));

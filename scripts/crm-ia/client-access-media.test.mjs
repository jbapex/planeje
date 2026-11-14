import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { build } from 'esbuild';
import { handleCrmIaMessage } from '../../supabase/functions/crm-ia/message.js';

const client='00000000-0000-4000-8000-000000000011',contact='00000000-0000-4000-8000-000000000031',channel='00000000-0000-4000-8000-000000000021';
const body={origem:'crm-ia',cliente_id:client,contact_id:contact,whatsapp_config_id:channel,message_id:'media_1794500000000',media_kind:'audio'};
const request=payload=>new Request('https://fixture.invalid/uazapi-download-media',{method:'POST',headers:{Authorization:'Bearer fixture-user','Content-Type':'application/json'},body:JSON.stringify(payload)});

test('CRM facade forwards exact media scope while preserving the customer JWT',async()=>{
  const response=await handleCrmIaMessage({req:request({...body,mode:'media_get',channel_id:channel}),db:{},
    makeCaller:()=>({auth:{getUser:async()=>({data:{user:{id:'person'}}})},rpc:async()=>({data:{allowed:true,chat_jid:'551199999999@s.whatsapp.net'}})}),
    download:async(payload,authorization)=>{assert.equal(payload.origem,'crm-ia');assert.equal(payload.contact_id,contact);assert.equal(payload.whatsapp_config_id,channel);assert.equal(authorization,'Bearer fixture-user');return{url:'data:audio/mpeg;base64,AA=='};}});
  assert.equal(response.status,200);
});

test('media download authorizes a CRM customer for the exact stored message, without generic access',async t=>{
  const folder=await mkdtemp('/tmp/crm-media-access-'),output=join(folder,'download.mjs');
  const previous={fetch:globalThis.fetch,Deno:globalThis.Deno};
  let role='cliente',status='active',allowed=true,providerOk=true,providerCalls=[],configReads=0,authorizations=0;
  const reset=()=>{role='cliente';status='active';allowed=true;providerOk=true;providerCalls=[];configReads=0;authorizations=0;};
  try{
    globalThis.Deno={env:{get:name=>({SUPABASE_URL:'https://fixture.invalid',SUPABASE_SERVICE_ROLE_KEY:'fixture-service',SUPABASE_ANON_KEY:'fixture-anon'})[name]}};
    globalThis.__crmMediaClient=(url,key,options)=>{
      assert.equal(url,'https://fixture.invalid');
      if(key==='fixture-anon')assert.equal(options.global.headers.Authorization,'Bearer fixture-user');
      return {auth:{getUser:async()=>({data:{user:{id:'person'}}})},async rpc(name,args){
        assert.equal(key,'fixture-anon');assert.equal(name,'crm_ia_workspace');assert.equal(args.p_action,'authorize_media');assert.equal(args.p_client_id,client);
        assert.deepEqual(args.p_payload,{contact_id:contact,channel_id:channel,message_id:body.message_id});authorizations++;
        return {data:{allowed,chat_jid:'551199999999@s.whatsapp.net'},error:null};
      },from(table){
        assert.equal(key,'fixture-service');
        const data=table==='profiles'?{cliente_id:client,role,status}:table==='cliente_whatsapp_config'?{id:channel,subdomain:'fixture',token:'fixture-token'}:assert.fail(table);
        if(table==='cliente_whatsapp_config')configReads++;
        const query={select(){return query;},eq(){return query;},order(){return query;},limit(){return query;},single(){return query;},maybeSingle(){return query;},then(resolve,reject){return Promise.resolve({data,error:null}).then(resolve,reject);}};return query;
      }};
    };
    globalThis.fetch=async(url,options)=>{assert.ok(url==='https://fixture.uazapi.com/message/download'||url==='https://fixture.uazapi.com/message/find');providerCalls.push({url,body:JSON.parse(options.body)});return new Response(JSON.stringify(providerOk?{base64:'AA==',mimetype:'audio/mpeg'}:{error:'fixture missing',messages:[]}),{status:providerOk?200:404});};
    await build({entryPoints:['supabase/functions/uazapi-download-media/index.ts'],outfile:output,bundle:true,format:'esm',platform:'node',plugins:[{name:'isolated-media',setup(b){b.onResolve({filter:/^https:\/\//},({path})=>({path,namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},({path})=>({contents:path.includes('supabase-js')?'export const createClient=(...args)=>globalThis.__crmMediaClient(...args);':'export const serve=handler=>globalThis.__crmMediaDownload=handler;'}));}}]});
    await import(pathToFileURL(output));
    const invoke=(payload=body)=>globalThis.__crmMediaDownload(request(payload));
    await t.test('licensed customer media reaches only its exact channel and message',async()=>{reset();assert.equal((await invoke()).status,200);assert.equal(authorizations,1);assert.equal(providerCalls.length,1);assert.equal(providerCalls[0].body.id,body.message_id);});
    await t.test('denial, inactive login and foreign account never read credentials or call provider',async()=>{
      for(const change of [()=>{allowed=false;},()=>{status='pending';},()=>{}]){
        reset();change();const payload=status==='active'&&allowed?{...body,cliente_id:'00000000-0000-4000-8000-000000000099'}:body;
        assert.equal((await invoke(payload)).status,403);assert.equal(configReads,0);assert.equal(providerCalls.length,0);
      }
    });
    await t.test('generic customer or additional message IDs never borrow a valid proof',async()=>{
      for(const payload of [{...body,origem:undefined},{...body,message_ids:['another-message']},{...body,id:'another-message'}]){reset();assert.ok([400,403].includes((await invoke(payload)).status));assert.equal(providerCalls.length,0);}
    });
    await t.test('CRM does not substitute an audio by approximate timestamp',async()=>{reset();providerOk=false;assert.equal((await invoke()).status,502);assert.ok(providerCalls.length>0);assert.ok(providerCalls.every(call=>call.url.endsWith('/message/download')&&call.body.id===body.message_id));});
    await t.test('existing staff download remains available',async()=>{reset();role='admin';assert.equal((await invoke({...body,origem:undefined})).status,200);assert.equal(authorizations,0);});
  }finally{
    globalThis.fetch=previous.fetch;globalThis.Deno=previous.Deno;delete globalThis.__crmMediaClient;delete globalThis.__crmMediaDownload;await rm(folder,{recursive:true,force:true});
  }
});

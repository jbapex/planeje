import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp,writeFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join,resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const directory=await mkdtemp(join(tmpdir(),'planeje-google-client-'));
const calls=[],toasts=[];let response;
globalThis.__googleClientFixture={functions:{invoke:async(name,{body})=>{calls.push({name,body});return {data:response,error:null};}}};
try {
  const result=await build({entryPoints:['src/lib/googleConversions.js'],bundle:true,format:'esm',platform:'node',write:false,
    alias:{'@':resolve('src')},plugins:[{name:'fixture',setup(b){
      b.onResolve({filter:/^@\/lib\/(customSupabaseClient|metaConversions)$/},args=>({path:args.path,namespace:'fixture'}));
      b.onLoad({filter:/.*/,namespace:'fixture'},({path})=>({contents:path.endsWith('customSupabaseClient')
        ? 'export const supabase=globalThis.__googleClientFixture;'
        : 'export const trackingDataFromLeadOrContact=(lead,contact)=>contact?.tracking_data||lead?.tracking_data||{};',loader:'js'}));
    }}]});
  const file=join(directory,'client.mjs');await writeFile(file,result.outputFiles[0].text);
  const {sendGoogleConversionForComercialChange:send}=await import(pathToFileURL(file).href);
  const input={clienteId:'fixture-client',patch:{qualificado:true},contact:{id:'fixture-contact',tracking_data:{gclid:'fixture-gclid'}},showToast:t=>toasts.push(t)};
  response={success:false,accepted:true,pending:true};let sent=await send(input);
  assert.equal(sent.sent,false);assert.equal(sent.pending,true);assert.match(toasts.at(-1).title,/processamento/);assert.equal(calls.at(-1).body.eventName,'QualifiedLead');
  const count=toasts.length;response={success:false,pending:true,idempotent:true};await send(input);assert.equal(toasts.length,count);
  response={success:false,error:{message:'DATAMANAGER_REAUTHORIZE'}};sent=await send(input);assert.equal(sent.sent,false);assert.match(toasts.at(-1).description,/REAUTHORIZE/);
  response={success:true};sent=await send(input);assert.equal(sent.sent,true);
  const countBefore=calls.length;await send({...input,contact:{tracking_data:{}}});assert.equal(calls.length,countBefore,'no GCLID means no transport');
  console.log('googleConversionsClient.test.mjs: 5 cases passed');
} finally {delete globalThis.__googleClientFixture;await rm(directory,{recursive:true,force:true});}

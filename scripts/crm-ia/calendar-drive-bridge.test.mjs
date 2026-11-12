import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import {build} from 'esbuild';
test('callback Drive encaminha só state Calendar e mantém callback Drive legado',async()=>{
 const {outputFiles:[file]}=await build({entryPoints:[new URL('../../supabase/functions/google-drive-api/index.ts',import.meta.url).pathname],bundle:true,platform:'node',format:'cjs',external:['https://*'],write:false});
 let handler;const reads=[];
 const service={rpc:async()=>({data:null}),from(table){reads.push(table);assert.equal(table,'google_drive_oauth_state');const query={select(){return query;},eq(){return query;},maybeSingle:async()=>({data:null})};return query;}};
 const values={SUPABASE_URL:'https://fixture.invalid',SUPABASE_SERVICE_ROLE_KEY:'fixture-service',GOOGLE_CALENDAR_CLIENT_ID:'fixture.apps.googleusercontent.com',GOOGLE_CALENDAR_CLIENT_SECRET:'fixture-secret',GOOGLE_CALENDAR_REDIRECT_URI:'https://fixture.invalid/functions/v1/google-drive-api'};
 vm.runInNewContext(file.text,{require:name=>name.includes('supabase-js')?{createClient:()=>service}:{serve:callback=>{handler=callback;}},
  Deno:{env:{get:name=>values[name]}},Request,Response,URL,URLSearchParams,crypto,TextEncoder,TextDecoder,Uint8Array,btoa,atob,AbortSignal,
  fetch:async()=>assert.fail('callback falso não pode consultar Google')});
 const calendar=await handler(new Request('https://fixture.invalid/functions/v1/google-drive-api?state=crmcal1.invalid.invalid&code=fixture'));
 assert.equal(calendar.status,400);assert.equal((await calendar.json()).error,'calendar_state_invalid');assert.deepEqual(reads,[]);
 const legacy=await handler(new Request('https://fixture.invalid/functions/v1/google-drive-api?state=legacy-state&code=fixture'));
 assert.equal(legacy.status,400);assert.match(await legacy.text(),/State inválido/);assert.deepEqual(reads,['google_drive_oauth_state']);
});

import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const client = '00000000-0000-4000-8000-000000000001';
const other = '00000000-0000-4000-8000-000000000002';
const action = 'customers/1234567890/conversionActions/321';
const missingEventSource = {error:{code:400,status:'INVALID_ARGUMENT',message:'There was a problem with the request.',details:[{
  '@type':'type.googleapis.com/google.rpc.BadRequest',fieldViolations:[{field:'events.events[0].event_source',reason:'REQUIRED_FIELD_MISSING'}],
}]}};
const originalFetch = globalThis.fetch;
const originalDeno = globalThis.Deno;
let db, calls, role, active, failure, response, statusResponse, oauthResponse;
let counter = 0;
const env = { SUPABASE_URL: 'https://fixture.invalid', SUPABASE_ANON_KEY: 'fixture-anon',
  SUPABASE_SERVICE_ROLE_KEY: 'fixture-service', GOOGLE_ADS_CLIENT_ID: 'fixture-client',
  GOOGLE_ADS_CLIENT_SECRET: 'fixture-secret', GOOGLE_ADS_REFRESH_TOKEN: 'fixture-refresh',
  GOOGLE_ADS_LOGIN_CUSTOMER_ID: '9876543210',GOOGLE_DATA_MANAGER_PROJECT_ID:'planeje-fixture' };
globalThis.Deno = { env: { get: key => env[key] } };
globalThis.__googleFixtureClient = {
  auth: { getUser: async token => token === 'user-fixture' ? {data:{user:{id:'fixture-user'}},error:null} : {data:{user:null},error:{message:'invalid'}} },
  rpc: async name => ({data: name === 'planeje_current_account_access' ? active : null, error:null}),
  from(table) {
    let predicates = [], single = false, verb = 'select', value, count;
    let sorting;
    const q = {
      select() {return q;}, eq(k,v) {predicates.push(r=>k.includes('->>')?r[k.split('->>')[0]]?.[k.split('->>')[1]]===v:r[k]===v);return q;},
      in(k,v) {predicates.push(r=>v.includes(r[k]));return q;},
      is(k,v) {predicates.push(r=>(r[k]??null)===v);return q;},
      order(k,{ascending}={}) {sorting={k,ascending};return q;}, limit(v) {count=v;return q;},
      maybeSingle() {single=true;return q;}, single() {single=true;return q;},
      insert(v) {verb='insert';value=v;return q;}, update(v) {verb='update';value=v;return q;},
      then(resolve,reject) {return Promise.resolve().then(()=>{
        if(failure===`${table}:${verb}`) return {data:null,error:{message:'fixture persistence failed'}};
        const all=table==='profiles' ? [{id:'fixture-user',role,cliente_id:client}] : (db[table]||=[]);
        let rows=all.filter(r=>predicates.every(p=>p(r)));
        if(sorting) rows.sort((a,b)=>String(a[sorting.k]||'').localeCompare(String(b[sorting.k]||''))*(sorting.ascending?1:-1));
        if(count!=null)rows=rows.slice(0,count);
        if(verb==='insert') {
          if(value.id&&all.some(r=>r.id===value.id))return {data:null,error:{code:'23505',message:'fixture primary key conflict'}};
          const row={id:`log-${++counter}`,created_at:new Date().toISOString(),...value};all.push(row);rows=[row];
        }
        if(verb==='update') rows.forEach(r=>Object.assign(r,value));
        return {data:single?rows[0]||null:rows,error:null};
      }).then(resolve,reject);},
    };return q;
  },
};
globalThis.fetch = async (url,options={}) => {
  url=String(url);const body=options.body ? String(options.body) : '';
  calls.push({url,options,body:body&&options.headers?.['Content-Type']==='application/json'?JSON.parse(body):body});
  if(url==='https://oauth2.googleapis.com/token') return Response.json(oauthResponse);
  if(url==='https://datamanager.googleapis.com/v1/events:ingest') {
    if (!JSON.parse(body).events.every(event => event.eventSource)) return Response.json(missingEventSource, {status:400});
    if(response instanceof Error)throw response;
    return Response.json(response?.body??{requestId:'fixture-request'}, {status:response?.status??200});
  }
  if(url.startsWith('https://datamanager.googleapis.com/v1/requestStatus:retrieve?')) {
    if(statusResponse instanceof Error)throw statusResponse;
    return Response.json(statusResponse);
  }
  if(url.includes(':uploadClickConversions')) return Response.json({partialFailureError:{message:'New integrations must use Data Manager API'}});
  throw new Error(`Unexpected transport: ${url}`);
};
const directory=await mkdtemp(join(tmpdir(),'planeje-google-conversions-'));
try {
  const compiled=await build({entryPoints:['supabase/functions/google-ads-api/index.ts'],bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent',plugins:[{
    name:'fixture-google-transports',setup(b) {
      b.onResolve({filter:/^https:\/\//},args=>({path:args.path,namespace:'fixture'}));
      b.onLoad({filter:/.*/,namespace:'fixture'},({path})=>({contents:path.includes('http/server')
        ? 'export const serve=fn=>{globalThis.__googleFixtureHandler=fn;};'
        : 'export const createClient=()=>globalThis.__googleFixtureClient;',loader:'js'}));
    },
  }]});
  const path=join(directory,'handler.mjs');await writeFile(path,compiled.outputFiles[0].text);await import(pathToFileURL(path).href);
  const reset=()=>{
    db={cliente_whatsapp_contact:[{id:'fixture-contact',cliente_id:client}],leads:[],cliente_google_ads_accounts:[{id:'account-fixture',cliente_id:client,is_active:true,google_customer_id:'1234567890',conversions_enabled:true,
      conv_action_lead:action,conv_action_qualified:'customers/1234567890/conversionActions/322',conv_action_purchase:'customers/1234567890/conversionActions/323'}],google_conversion_event_log:[]};
    calls=[];role='superadmin';active=true;failure='';response=null;
    oauthResponse={access_token:'fixture-access',refresh_token:'fixture-refresh',scope:'https://www.googleapis.com/auth/adwords https://www.googleapis.com/auth/datamanager'};
    statusResponse={requestStatusPerDestination:[{destination:{operatingAccount:{accountType:'GOOGLE_ADS',accountId:'1234567890'},productDestinationId:'321'},requestStatus:'SUCCESS',eventsIngestionStatus:{recordCount:'1'}}]};
  };
  const invoke=async(body,token='user-fixture')=>{
    const res=await globalThis.__googleFixtureHandler(new Request('https://fixture.invalid/functions/v1/google-ads-api',{
      method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify(body),
    }));return {status:res.status,data:await res.json()};
  };
  const payload={action:'upload-click-conversion',clienteId:client,contactId:'fixture-contact',gclid:'fixture-gclid',eventName:'LeadSubmitted',conversionDateTime:'2026-10-27T10:00:00Z'};
  let cases=0;
  reset();let result=await invoke(payload,'');assert.equal(result.status,401,'anonymous conversion must be refused');assert.equal(calls.length,0);cases++;
  reset();result=await invoke(payload);assert.equal(result.data.pending,true,'ingestion is pending, not completed');assert.equal(result.data.success,false);
  assert.equal(calls.some(c=>c.url.includes(':uploadClickConversions')),false);
  const upload=calls.find(c=>c.url.endsWith('/events:ingest'));assert.ok(upload);
  assert.equal(upload.options.headers['x-goog-user-project'],'planeje-fixture','REST request declares the configured quota project');
  assert.deepEqual(upload.body.destinations,[{operatingAccount:{accountType:'GOOGLE_ADS',accountId:'1234567890'},loginAccount:{accountType:'GOOGLE_ADS',accountId:'9876543210'},productDestinationId:'321'}]);
  assert.equal(upload.body.events[0].eventTimestamp,'2026-10-27T10:00:00.000Z');
  assert.equal(upload.body.events[0].eventSource,'MESSAGE','WhatsApp CRM events must declare their message origin');
  assert.deepEqual(upload.body.events[0].adIdentifiers,{gclid:'fixture-gclid'});assert.ok(upload.body.events[0].transactionId);
  assert.equal(upload.body.events[0].userData,undefined);assert.equal(upload.body.consent,undefined);
  assert.equal(db.google_conversion_event_log[0].google_response.requestId,'fixture-request');cases++;
  const sendCount=()=>calls.filter(c=>c.url.endsWith('/events:ingest')).length;
  const makePending=async()=>{await invoke(payload);return db.google_conversion_event_log.at(-1);};
  const lookup=(row,op='get-conversion-status',clienteId=client)=>({action:op,clienteId,eventId:row.id});
  const due=row=>{row.google_response.nextCheckAt='2020-01-01T00:00:00Z';};

  result=await invoke({...payload,force:true});assert.equal(result.data.pending,true);assert.equal(sendCount(),1,'pending conversion cannot be forced');cases++;
  reset();role='cliente';result=await invoke({...payload,clienteId:other});assert.equal(result.status,403);assert.equal(calls.length,0);cases++;
  reset();active=false;result=await invoke(payload);assert.equal(result.status,403);assert.equal(calls.length,0);cases++;
  reset();result=await invoke(payload,'invalid');assert.equal(result.status,401);assert.equal(calls.length,0);cases++;
  reset();role='cliente';result=await invoke(payload);assert.equal(result.data.pending,true);cases++;
  reset();result=await invoke(payload,'fixture-service');assert.equal(result.data.pending,true);cases++;
  reset();role='colaborador';result=await invoke({action:'exchange-oauth-code',code:'fixture-code'});assert.equal(result.status,403);assert.equal(calls.length,0);cases++;
  reset();result=await invoke({...payload,contactId:'foreign-contact'});assert.equal(result.data.success,false);assert.equal(sendCount(),0,'contact must belong to requested client');cases++;
  reset();result=await invoke({...payload,customerId:'7777777777'});assert.equal(result.data.success,false);assert.equal(sendCount(),0);cases++;
  reset();result=await invoke({...payload,conversionAction:'customers/7777777777/conversionActions/999'});assert.equal(result.data.success,false);assert.equal(sendCount(),0);cases++;
  reset();db.cliente_google_ads_accounts[0].conversions_enabled=false;result=await invoke(payload);assert.equal(result.data.success,false);assert.equal(sendCount(),0);assert.equal(db.google_conversion_event_log.length,1,'configuration block is audited');cases++;
  reset();failure='google_conversion_event_log:select';result=await invoke(payload);assert.equal(result.data.success,false);assert.equal(sendCount(),0);cases++;
  reset();failure='google_conversion_event_log:insert';result=await invoke(payload);assert.equal(result.data.success,false);assert.equal(sendCount(),0);cases++;
  reset();result=await invoke({...payload,conversionDateTime:'invalid'});assert.equal(result.data.success,false);assert.equal(sendCount(),0);cases++;
  reset();result=await invoke({...payload,eventName:'Unknown'});assert.equal(result.data.success,false);assert.equal(sendCount(),0);cases++;
  reset();result=await invoke({...payload,eventName:'Purchase',value:258.7,currencyCode:'BRL'});assert.equal(result.data.pending,true);
  assert.equal(calls.find(c=>c.url.endsWith('/events:ingest')).body.events[0].conversionValue,258.7);cases++;
  reset();result=await invoke({...payload,eventName:'Purchase',value:-1});assert.equal(result.data.success,false);assert.equal(sendCount(),0);cases++;
  reset();response={status:403,body:{error:{message:'Insufficient authentication scopes',details:[{reason:'ACCESS_TOKEN_SCOPE_INSUFFICIENT'}]}}};
  result=await invoke(payload);assert.match(result.data.error.message,/Autorize novamente/);assert.equal(db.google_conversion_event_log[0].success,false);cases++;
  reset();response={status:403,body:{error:{message:'API is disabled',details:[{reason:'SERVICE_DISABLED'}]}}};result=await invoke(payload);assert.match(result.data.error.message,/Ative a Data Manager/);cases++;
  reset();response={body:{}};result=await invoke(payload);assert.equal(result.data.success,false);assert.equal(result.data.uncertain,true);assert.equal(db.google_conversion_event_log[0].google_response.phase,'uncertain');cases++;
  reset();failure='google_conversion_event_log:update';result=await invoke(payload);assert.equal(result.data.success,false);assert.equal(result.data.uncertain,true);assert.equal(db.google_conversion_event_log[0].success,false);cases++;
  reset();let row=await makePending();const before=calls.length;result=await invoke(lookup(row));assert.equal(result.data.pending,true);
  assert.equal(calls.filter(c=>c.url.includes('requestStatus:retrieve')).length,0,'early status query is throttled');assert.equal(calls.length,before+1);cases++;
  due(row);result=await invoke(lookup(row));assert.equal(result.data.success,true);assert.equal(db.google_conversion_event_log[0].success,true);
  result=await invoke({...payload,force:true});assert.equal(result.data.idempotent,true);assert.equal(sendCount(),1);cases++;
  reset();row=await makePending();due(row);statusResponse={requestStatusPerDestination:[{destination:row.google_response.destination,requestStatus:'PROCESSING'}]};
  result=await invoke(lookup(row));assert.equal(result.data.pending,true);assert.equal(row.success,false);assert.ok(Date.parse(row.google_response.nextCheckAt)>Date.now());cases++;
  reset();row=await makePending();due(row);statusResponse={requestStatusPerDestination:[{destination:row.google_response.destination,requestStatus:'FAILED',errorInfo:{errorCounts:[{reason:'PROCESSING_ERROR_REASON_INVALID_GCLID',recordCount:'1'}]}}]};
  result=await invoke(lookup(row));assert.equal(result.data.success,false);assert.equal(row.google_response.phase,'failed');assert.match(row.error_message,/INVALID_GCLID/);cases++;
  reset();row=await makePending();due(row);statusResponse={requestStatusPerDestination:[{destination:{operatingAccount:{accountId:'7777777777'},productDestinationId:'321'},requestStatus:'SUCCESS'}]};
  result=await invoke(lookup(row));assert.equal(result.data.pending,true);assert.equal(row.success,false);assert.match(row.google_response.lastCheckError,/destino esperado/);cases++;
  reset();row=await makePending();due(row);statusResponse={};result=await invoke(lookup(row));assert.equal(result.data.pending,true);assert.equal(row.success,false);cases++;
  reset();row=await makePending();result=await invoke(lookup(row,'get-conversion-status',other));assert.equal(result.data.error.code,'EVENT_NOT_FOUND');assert.equal(calls.filter(c=>c.url.includes('requestStatus:retrieve')).length,0);cases++;
  reset();row={id:'legacy-failure',cliente_id:client,gclid:'fixture-gclid',event_name:'LeadSubmitted',conversion_action:action,customer_id:'1234567890',created_at:'2026-10-27T09:20:00Z',success:false,error_message:'New integrations must use Data Manager API'};
  db.google_conversion_event_log.push(row);result=await invoke(lookup(row,'retry-click-conversion'));
  assert.equal(result.data.pending,true);assert.equal(calls.find(c=>c.url.endsWith('/events:ingest')).body.events[0].eventTimestamp,'2026-10-27T09:20:00.000Z');assert.equal(row.error_message,'New integrations must use Data Manager API','old log remains immutable');cases++;
  reset();response=new Error('network timeout');await invoke({...payload,eventName:'Purchase',value:150});row=db.google_conversion_event_log.at(-1);const identity=row.google_response.event.transactionId;
  response=null;result=await invoke({...lookup(row,'retry-click-conversion'),value:900,conversionDateTime:'2030-01-01'});assert.equal(result.data.pending,true);
  const retried=calls.filter(c=>c.url.endsWith('/events:ingest')).at(-1).body.events[0];assert.equal(retried.conversionValue,150);assert.equal(retried.transactionId,identity);assert.equal(retried.eventTimestamp,'2026-10-27T10:00:00.000Z');
  result=await invoke({...payload,eventName:'Purchase',value:150});assert.equal(result.data.eventId,db.google_conversion_event_log.at(-1).id,'latest active attempt supersedes uncertain predecessor');cases++;
  reset();await Promise.all([invoke(payload),invoke(payload)]);const ids=calls.filter(c=>c.url.endsWith('/events:ingest')).map(c=>c.body.events[0].transactionId);assert.equal(new Set(ids).size,1,'concurrent requests share one Google conversion identity');cases++;
  reset();db.google_conversion_event_log.push({id:'legacy-success',cliente_id:client,gclid:'fixture-gclid',event_name:'Lead',success:true});result=await invoke({...payload,force:true});assert.equal(result.data.idempotent,true);assert.equal(sendCount(),0);cases++;
  reset();oauthResponse.scope='https://www.googleapis.com/auth/adwords';result=await invoke({action:'exchange-oauth-code',code:'fixture-code'});assert.equal(result.data.error?.code,'OAUTH_SCOPES_REQUIRED');assert.equal(result.data.refreshToken,undefined);cases++;
  reset();result=await invoke({action:'exchange-oauth-code',code:'fixture-code'});assert.equal(result.data.refreshToken,'fixture-refresh');cases++;
  reset();failure='google_conversion_event_log:update';await invoke(payload);row=db.google_conversion_event_log[0];row.google_response.submittedAt='2020-01-01T00:00:00Z';failure='';result=await invoke(lookup(row,'retry-click-conversion'));assert.equal(result.data.pending,true,'a stale interrupted send is recoverable with its original identity');cases++;
  reset();db.cliente_google_ads_accounts[0].conversions_enabled=false;await invoke(payload);db.cliente_google_ads_accounts[0].conversions_enabled=true;result=await invoke(payload);assert.equal(result.data.pending,true,'an earlier configuration block must not permanently prevent new real events');cases++;
  reset();env.GOOGLE_DATA_MANAGER_PROJECT_ID='';result=await invoke(payload);assert.equal(sendCount(),0);assert.match(result.data.error.message,/projeto Google Cloud/i);assert.equal(db.google_conversion_event_log.length,1);env.GOOGLE_DATA_MANAGER_PROJECT_ID='planeje-fixture';cases++;
  reset();row=await makePending();due(row);statusResponse=new Error('network timeout');result=await invoke(lookup(row));assert.equal(result.data.pending,true);assert.equal(row.success,false);assert.match(row.google_response.lastCheckError,/network timeout/);cases++;
  reset();row=await makePending();due(row);statusResponse.requestStatusPerDestination[0].eventsIngestionStatus.recordCount='0';result=await invoke(lookup(row));assert.equal(result.data.pending,true);assert.equal(row.success,false,'SUCCESS without the submitted record cannot be confirmed');cases++;
  reset();row={id:'legacy-latest',cliente_id:client,gclid:'fixture-gclid',event_name:'LeadSubmitted',conversion_action:action,customer_id:'1234567890',created_at:'2026-10-27T09:25:00Z',success:false,error_message:'New integrations must use Data Manager API'};
  db.google_conversion_event_log.push({...row,id:'legacy-first',created_at:'2026-10-27T09:20:00Z'},row);await invoke(lookup(row,'retry-click-conversion'));
  assert.equal(calls.find(c=>c.url.endsWith('/events:ingest')).body.events[0].eventTimestamp,'2026-10-27T09:20:00.000Z','legacy duplicate attempts share the first recorded event time');cases++;
  reset();row=await makePending();due(row);await Promise.all([invoke(lookup(row)),invoke(lookup(row))]);
  assert.equal(calls.filter(c=>c.url.includes('requestStatus:retrieve')).length,1,'concurrent status checks must claim the backoff window before contacting Google');cases++;
  reset();response={status:503,body:{error:{message:'The service is currently unavailable.'}}};await invoke(payload);row=db.google_conversion_event_log[0];response=null;
  result=await invoke(lookup(row,'retry-click-conversion'));assert.equal(result.data.pending,true,'a temporary HTTP error remains retryable even if Google omits status from its message');cases++;
  reset();await Promise.all([invoke({...payload,eventName:'Purchase',value:150}),invoke({...payload,eventName:'Purchase',value:900,conversionDateTime:'2026-10-27T11:00:00Z'})]);
  const concurrent=calls.filter(c=>c.url.endsWith('/events:ingest'));assert.equal(concurrent.length,1,'only the atomic initial reservation may ingest the first conversion');
  const frozen=db.google_conversion_event_log[0].google_response.event;assert.equal(concurrent[0].body.events[0].conversionValue,frozen.conversionValue);assert.equal(concurrent[0].body.events[0].eventTimestamp,frozen.eventTimestamp);cases++;
  reset();response={status:400,body:missingEventSource};await invoke(payload);row=db.google_conversion_event_log[0];
  delete row.google_response.event.eventSource;
  const missingSourceSnapshot=structuredClone(row);response=null;
  result=await invoke(lookup(row,'retry-click-conversion'));assert.equal(result.data.pending,true,'the known missing event_source rejection is recoverable');
  const sourceRecovered=calls.filter(c=>c.url.endsWith('/events:ingest')).at(-1).body.events[0];
  assert.deepEqual(sourceRecovered,{...missingSourceSnapshot.google_response.event,eventSource:'MESSAGE'});
  assert.deepEqual(row,missingSourceSnapshot,'repair must not mutate the rejected historical snapshot');cases++;
  reset();response={status:400,body:{error:{...missingEventSource.error,details:[{fieldViolations:[{field:'events.events[0].event_timestamp',reason:'REQUIRED_FIELD_MISSING'}]}]}}};
  await invoke(payload);row=db.google_conversion_event_log[0];result=await invoke(lookup(row,'retry-click-conversion'));
  assert.equal(result.data.error.code,'RETRY_NOT_ALLOWED');assert.equal(sendCount(),1,'other invalid fields remain non-retryable');cases++;
  reset();response={status:503,body:{error:{message:'The service is currently unavailable.'}}};await invoke(payload);row=db.google_conversion_event_log[0];
  row.google_response.event.eventSource='WEB';response=null;result=await invoke(lookup(row,'retry-click-conversion'));
  assert.equal(result.data.pending,true);assert.equal(calls.filter(c=>c.url.endsWith('/events:ingest')).at(-1).body.events[0].eventSource,'WEB','an existing event source remains unchanged');cases++;
  console.log(`googleDataManager.test.mjs: ${cases} cases passed`);
} finally {
  globalThis.fetch=originalFetch;globalThis.Deno=originalDeno;
  delete globalThis.__googleFixtureClient;delete globalThis.__googleFixtureHandler;
  await rm(directory,{recursive:true,force:true});
}

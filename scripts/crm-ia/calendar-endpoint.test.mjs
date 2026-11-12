import assert from 'node:assert/strict';
import test from 'node:test';
import {handleCalendarRequest,handleCalendarCallback,loadCalendarConfig} from '../../supabase/functions/_shared/crmIaCalendarHandler.js';
import {signCalendarState,calendarHash,CALENDAR_SCOPES,sealCalendarToken,calendarEventId} from '../../supabase/functions/_shared/crmIaCalendar.js';
const owner='00000000-0000-4000-8000-000000000001',client='00000000-0000-4000-8000-000000000011';
const config={clientId:'fixture.apps.googleusercontent.com',clientSecret:'fixture-secret-calendar',redirectUri:'https://fixture.invalid/functions/v1/google-drive-api',appOrigin:'https://fixture.invalid',dedicated:false};
test('origem de retorno usa configuração Drive fixa e independe do host callback',async()=>{
 const env=name=>({GOOGLE_DRIVE_CLIENT_ID:config.clientId,GOOGLE_DRIVE_CLIENT_SECRET:config.clientSecret,
  GOOGLE_DRIVE_REDIRECT_URI:'https://callback.example.test/functions/v1/google-drive-api',GOOGLE_DRIVE_APP_ORIGIN:'https://app.example.test'})[name];
 const settings=await loadCalendarConfig({rpc:async()=>({data:null})},{env,supabaseUrl:'https://untrusted.invalid'});
 assert.equal(settings.appOrigin,'https://app.example.test');assert.equal(settings.redirectUri,'https://callback.example.test/functions/v1/google-drive-api');assert.equal(settings.configured,true);
});
test('configuração Calendar incompleta não muda de cliente OAuth e desconectar local não depende dela',async()=>{
 const env=name=>({GOOGLE_CALENDAR_CLIENT_ID:'partial.apps.googleusercontent.com',GOOGLE_DRIVE_CLIENT_ID:config.clientId,GOOGLE_DRIVE_CLIENT_SECRET:config.clientSecret,
  SUPABASE_URL:'https://fixture.invalid',SUPABASE_ANON_KEY:'anon',SUPABASE_SERVICE_ROLE_KEY:'service'})[name];
 const settings=await loadCalendarConfig({rpc:async()=>({data:null})},{env,supabaseUrl:'https://fixture.invalid'});assert.equal(settings.configured,false);
 const actions=[],caller={auth:{getUser:async()=>({data:{user:{id:owner}}})},rpc:async(_,args)=>{actions.push(args.p_action);return {data:{status:args.p_action==='disconnect'?'disconnected':'connected'}};}};
 const result=await handleCalendarRequest(new Request('https://fixture.invalid',{method:'POST',headers:{Authorization:'Bearer fixture'},body:JSON.stringify({action:'disconnect',client_id:client})}),
  {createClient:(_,key)=>key==='service'?{rpc:async()=>assert.fail('sem transporte')}:caller,env,config:settings,fetchImpl:async()=>assert.fail('sem Google')});
 assert.equal(result.status,200);assert.ok(actions.includes('disconnect'));
});
test('callback falso, replay e conta diferente não criam grant nem consultam Google',async()=>{
 let calls=0;
 const service={async rpc(){calls++;return {error:{code:'state_invalid'}};}};
 const bad=await handleCalendarCallback(new Request(config.redirectUri+'?state=crmcal1.falso.falso&code=fixture'),{service,config,fetchImpl:async()=>assert.fail('Google não autorizado')});
 assert.equal(bad.status,400);assert.equal(calls,0);
 const nonce=crypto.randomUUID(),state=await signCalendarState(nonce,config);
 const used=await handleCalendarCallback(new Request(config.redirectUri+`?state=${state}&code=fixture`),{service,config,fetchImpl:async()=>assert.fail('Nonce não autorizado')});
 assert.equal(used.status,400);assert.equal(calls,1);
});
test('callback só entrega code/state no fragmento da origem fixa, sem consumir nonce ou consultar Google',async()=>{
 const state=await signCalendarState(crypto.randomUUID(),config),actions=[];
 const service={async rpc(_,args){actions.push(args.p_action);assert.equal(args.p_action,'nonce_info');return {data:{cliente_id:client,oauth_client_id:config.clientId,redirect_uri:config.redirectUri}};}};
 const result=await handleCalendarCallback(new Request(config.redirectUri+`?state=${state}&code=fixture-code&return_origin=https://untrusted.invalid`),
  {service,config,fetchImpl:async()=>assert.fail('callback não troca code')});
 assert.equal(result.status,303);const location=new URL(result.headers.get('Location'));
 assert.equal(location.origin,config.appOrigin);assert.equal(location.search,'');
 const params=new URLSearchParams(location.hash.split('?')[1]);assert.equal(params.get('calendar_code'),'fixture-code');assert.equal(params.get('calendar_state'),state);
 assert.equal(params.get('aba'),'google_calendar');assert.equal(params.get('cliente'),client);assert.deepEqual(actions,['nonce_info']);
});
test('finalize exige sessão dona antes de consumir nonce/trocar code e persiste somente token cifrado',async()=>{
 const nonce=crypto.randomUUID(),state=await signCalendarState(nonce,config),hash=await calendarHash(nonce),saved=[],order=[];
 const caller={auth:{getUser:async()=>({data:{user:{id:owner}}})},rpc:async(_,args)=>{order.push(args.p_action);return {data:args.p_action==='finalize_claim'?{nonce_hash:hash,cliente_id:client,owner_id:owner,oauth_client_id:config.clientId,redirect_uri:config.redirectUri}:{status:'disconnected'}};}};
 const service={rpc:async(_,args)=>{assert.equal(args.p_action,'grant');saved.push(args.p_payload);return {data:{status:'awaiting_calendar',revision:client}};}};
 const env=name=>({SUPABASE_URL:'https://fixture.invalid',SUPABASE_ANON_KEY:'anon',SUPABASE_SERVICE_ROLE_KEY:'service'})[name];
 const request=()=>new Request('https://fixture.invalid/functions/v1/crm-ia-calendar',{method:'POST',headers:{Authorization:'Bearer fixture'},body:JSON.stringify({action:'finalize',client_id:client,state,code:'fixture-code'})});
 const result=await handleCalendarRequest(request(),{createClient:(_,key)=>key==='service'?service:caller,env,config,fetchImpl:async url=>{
  assert.ok(order.includes('finalize_claim'));order.push('google');return new Response(JSON.stringify(url.includes('/token')?
   {access_token:'fixture-access',refresh_token:'fixture-refresh',scope:CALENDAR_SCOPES.join(' ')}:{id:'google-fixture',email:'owner@example.test',verified_email:true}));}});
 assert.equal(result.status,200);assert.equal((await result.json()).status,'awaiting_calendar');assert.equal(saved.length,1);assert.ok(!saved[0].encrypted_token.includes('fixture-refresh'));
 const denied={...caller,rpc:async(_,args)=>args.p_action==='finalize_claim'?{error:{code:'42501'}}:{data:{status:'disconnected'}}};
 const rejected=await handleCalendarRequest(request(),{createClient:(_,key)=>key==='service'?service:denied,env,config,fetchImpl:async()=>assert.fail('outra sessão não pode trocar code')});
 assert.equal(rejected.status,403);assert.equal(saved.length,1);
});
test('endpoint exige sessão e não conecta por outro staff nem conta sem gate CRM',async()=>{
 const service={rpc:async()=>assert.fail('serviço não deve executar')};
 const caller={auth:{getUser:async()=>({data:{user:{id:owner}}})},rpc:async()=>({error:{code:'42501'}})};
 const createClient=(_,key)=>key==='service'?service:caller;
 const env=name=>({SUPABASE_URL:'https://fixture.invalid',SUPABASE_ANON_KEY:'anon',SUPABASE_SERVICE_ROLE_KEY:'service'})[name];
 const request=body=>new Request('https://fixture.invalid/functions/v1/crm-ia-calendar',{method:'POST',headers:{Authorization:'Bearer fixture'},body:JSON.stringify(body)});
 assert.equal((await handleCalendarRequest(request({action:'connect-start',client_id:client,owner_id:client}),{createClient,env,config})).status,403);
 assert.equal((await handleCalendarRequest(request({action:'connect-start',client_id:client}),{createClient,env,config})).status,403);
 assert.equal((await handleCalendarRequest(new Request('https://fixture.invalid',{method:'POST'}),{createClient,env,config})).status,401);
});
test('busy sem calendário obrigatório retorna sem configuração ou requisição Google',async()=>{
 const caller={auth:{getUser:async()=>({data:{user:{id:owner}}})},rpc:async()=>({data:{required:false,status:'disconnected',fresh:false,busy:null}})};
 const env=name=>({SUPABASE_URL:'https://fixture.invalid',SUPABASE_ANON_KEY:'anon',SUPABASE_SERVICE_ROLE_KEY:'service'})[name];
 const result=await handleCalendarRequest(new Request('https://fixture.invalid',{method:'POST',headers:{Authorization:'Bearer fixture'},body:JSON.stringify({action:'busy',client_id:client})}),
  {createClient:(_,key)=>key==='service'?{rpc:async()=>assert.fail('não deve ler credencial')}:caller,env,fetchImpl:async()=>assert.fail('não deve consultar Google')});
 assert.equal(result.status,200);assert.equal((await result.json()).required,false);
});
test('busy reconfere caller após Google e não entrega recorte se acesso foi revogado',async()=>{
 let gates=0,saved=false;
 const connection={id:client,required:true,oauth_client_id:config.clientId,encrypted_token:await sealCalendarToken('fixture-refresh',config,{client,owner}),status:'connected',calendar_id:'fixture-calendar',time_zone:'UTC',revision:client};
 const caller={auth:{getUser:async()=>({data:{user:{id:owner}}})},rpc:async()=>++gates===1?{data:{required:true,status:'connected'}}:{error:{code:'42501'}}};
 const service={rpc:async(_,args)=>{if(args.p_action==='busy_target')return {data:connection};if(args.p_action==='busy'){saved=true;return {data:{fresh:true,busy:[]}};}assert.fail(args.p_action);}};
 const env=name=>({SUPABASE_URL:'https://fixture.invalid',SUPABASE_ANON_KEY:'anon',SUPABASE_SERVICE_ROLE_KEY:'service'})[name];
 const result=await handleCalendarRequest(new Request('https://fixture.invalid',{method:'POST',headers:{Authorization:'Bearer fixture'},
  body:JSON.stringify({action:'busy',client_id:client,since:'2026-11-12T00:00Z',until:'2026-11-13T00:00Z'})}),
 {createClient:(_,key)=>key==='service'?service:caller,env,config,fetchImpl:async url=>new Response(JSON.stringify(url.includes('/token')?{access_token:'fixture'}:{calendars:{'fixture-calendar':{busy:[]}}}))});
 assert.equal(saved,true);assert.equal(gates,2);assert.equal(result.status,403);assert.equal((await result.json()).busy,undefined);
});
test('busy de edição exclui apenas evento marcado do compromisso autorizado e salva versão do recorte',async()=>{
 const appointment='00000000-0000-4000-8000-000000000051',event_id=calendarEventId(appointment),saved=[];
 const connection={id:client,required:true,ignore_event_id:event_id,appointment_id:appointment,oauth_client_id:config.clientId,encrypted_token:await sealCalendarToken('fixture-refresh',config,{client,owner}),status:'connected',calendar_id:'fixture-calendar',time_zone:'UTC',revision:client};
 const caller={auth:{getUser:async()=>({data:{user:{id:owner}}})},rpc:async(_,args)=>{
  assert.equal(args.p_payload.appointment_id,appointment);return {data:{ignore_event_id:event_id,appointment_id:appointment}};}};
 const service={rpc:async(_,args)=>{if(args.p_action==='busy_target')return {data:connection};if(args.p_action==='busy'){saved.push(args.p_payload);return {data:{fresh:true,busy:args.p_payload.busy}};}assert.fail(args.p_action);}};
 const createClient=(_,key)=>key==='service'?service:caller,env=name=>({SUPABASE_URL:'https://fixture.invalid',SUPABASE_ANON_KEY:'anon',SUPABASE_SERVICE_ROLE_KEY:'service'})[name];
 const result=await handleCalendarRequest(new Request('https://fixture.invalid/functions/v1/crm-ia-calendar',{method:'POST',headers:{Authorization:'Bearer fixture'},
  body:JSON.stringify({action:'busy',client_id:client,appointment_id:appointment,since:'2026-11-12T00:00Z',until:'2026-11-13T00:00Z'})}),{createClient,env,config,fetchImpl:async url=>{
   if(url.includes('/token'))return new Response(JSON.stringify({access_token:'fixture'}));
   if(url.includes('/events?'))return new Response(JSON.stringify({items:[]}));
   if(url.includes(`/events/${event_id}`))return new Response(JSON.stringify({id:event_id,extendedProperties:{private:{planejeAppointment:appointment,planejeConnection:client}}}));
   assert.fail(`Busy não deve incluir o próprio evento: ${url}`);
  }});
 assert.equal(result.status,200);assert.equal(saved[0].appointment_id,appointment);assert.deepEqual(saved[0].busy,[]);
});

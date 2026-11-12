import assert from 'node:assert/strict';
import test from 'node:test';
import { calendarEventId, sealCalendarToken, openCalendarToken, signCalendarState, verifyCalendarState,
  calendarRequest, fetchCalendarBusy, syncCalendarJob, drainCalendarJobs,refreshCalendarBusy } from '../../supabase/functions/_shared/crmIaCalendar.js';

const client='00000000-0000-4000-8000-000000000011',owner='00000000-0000-4000-8000-000000000012',appointment='00000000-0000-4000-8000-000000000021';
const config={clientId:'fixture.apps.googleusercontent.com',clientSecret:'fixture-secret-for-offline-tests',redirectUri:'https://fixture.invalid/functions/v1/google-drive-api'};
const target={id:appointment,cliente_id:client,owner_id:owner,calendar_id:'fixture@example.test',connection_id:client,event_id:calendarEventId(appointment),
  source_version:'2026-11-11T10:00:00Z',connection_revision:owner,lease:owner,desired_action:'upsert',status:'pending',
  start_at:'2026-11-12T15:00:00Z',end_at:'2026-11-12T15:30:00Z',busy_start_at:'2026-11-12T15:00:00Z',busy_end_at:'2026-11-12T15:30:00Z'};
const event={id:target.event_id,etag:'"v1"',start:{dateTime:target.start_at},end:{dateTime:target.end_at},extendedProperties:{private:{planejeAppointment:appointment,planejeConnection:client}}};
const response=(body,status=200)=>new Response(body===null?null:JSON.stringify(body),{status});
test('refresh do runtime sem conexão preserva agenda local e não pede token nem JWT',async()=>{
 const calls=[];
 const result=await refreshCalendarBusy({db:{rpc:async(_,args)=>{calls.push(args);return {data:{required:false,status:'disconnected'}};}},config:{},clientId:client,ownerId:owner,date:'2026-11-12',
  fetchImpl:async()=>assert.fail('não deve consultar Google')});
 assert.equal(result.required,false);assert.deepEqual(calls.map(row=>row.p_action),['busy_target']);
 assert.equal(calls[0].p_payload.owner_id,owner);
});

test('state assinado e token cifrado não aceitam falsificação ou troca de conta',async()=>{
  const nonce=crypto.randomUUID(),state=await signCalendarState(nonce,config);
  assert.equal(await verifyCalendarState(state,config),nonce);
  assert.equal(await verifyCalendarState(state+'x',config),null);
  assert.equal(await verifyCalendarState(state,{...config,clientSecret:'outro'}),null);
  const sealed=await sealCalendarToken('refresh-fixture',config,{client,owner});
  assert.ok(!sealed.includes('refresh-fixture'));
  assert.equal(await openCalendarToken(sealed,config,{client,owner}),'refresh-fixture');
  await assert.rejects(openCalendarToken(sealed,config,{client:owner,owner}));
  assert.match(calendarEventId(appointment),/^[0-9a-v]{5,1024}$/);
});
test('busy externo com erro por calendário nunca vira lista livre',async()=>{
  const fetchImpl=async()=>response({calendars:{[target.calendar_id]:{errors:[{reason:'notFound'}]}}});
  await assert.rejects(fetchCalendarBusy({token:'fixture',calendarId:target.calendar_id,since:target.start_at,until:target.end_at,fetchImpl}),/calendar_busy_unavailable/);
});
test('busy de reagendamento exclui só evento próprio e trata dia inteiro no fuso',async()=>{
  const busy=await fetchCalendarBusy({token:'fixture',calendarId:target.calendar_id,since:'2026-11-12T00:00Z',until:'2026-11-14T00:00Z',
    ignoreEventId:event.id,timeZone:'America/Sao_Paulo',fetchImpl:async()=>response({items:[event,{id:'outside',start:{date:'2026-11-12'},end:{date:'2026-11-13'}}]})});
  assert.deepEqual(busy,[{start:'2026-11-12T03:00:00.000Z',end:'2026-11-13T03:00:00.000Z'}]);
});
test('404 cria evento de ID fixo, genérico e sem dados privados',async()=>{
  const requests=[];
  const receipt=await syncCalendarJob(target,{token:'fixture',recheck:async()=>true,fetchImpl:async(url,init={})=>{
    requests.push({url,init});
    if(url.includes('/freeBusy'))return response({calendars:{[target.calendar_id]:{busy:[]}}});
    if(init.method==='POST'){const body=JSON.parse(init.body);assert.equal(body.id,event.id);assert.equal(body.summary,'Compromisso Planeje');
      assert.ok(!('description'in body));assert.ok(!('attendees'in body));return response(event,201);}
    return response({},404);
  }});
  assert.equal(receipt.status,'synced');assert.equal(receipt.receipt.event_id,event.id);
  assert.equal(requests.filter(row=>row.init.method==='POST'&&!row.url.includes('freeBusy')).length,1);
});
test('409 só confirma evento reconhecido e não sobrescreve evento externo',async()=>{
  for(const own of [true,false]){
    let gets=0;
    const result=await syncCalendarJob(target,{token:'fixture',recheck:async()=>true,fetchImpl:async(url,init={})=>{
      if(url.includes('/freeBusy'))return response({calendars:{[target.calendar_id]:{busy:[]}}});
      if(init.method==='POST')return response({},409);
      return ++gets===1?response({},404):response(own?event:{...event,extendedProperties:{}});
    }});
    assert.equal(result.status,own?'synced':'conflict');
  }
});
test('timeout de escrita fica incerto e tentativa posterior só consulta o ID existente',async()=>{
  let writes=0;
  const fetchImpl=async(url,init={})=>{
    if(url.includes('/freeBusy'))return response({calendars:{[target.calendar_id]:{busy:[]}}});
    if(init.method==='POST'){writes++;throw new Error('timeout');}return response({},404);
  };
  assert.equal((await syncCalendarJob(target,{token:'fixture',recheck:async()=>true,fetchImpl})).status,'uncertain');
  assert.equal((await syncCalendarJob({...target,reconcile_only:true},{token:'fixture',recheck:async()=>true,fetchImpl})).status,'uncertain');
  assert.equal(writes,1);
});
test('busy, versão alterada e ETag externo impedem escrita',async()=>{
  for(const mode of ['busy','version','etag']){
    let writes=0;
    const result=await syncCalendarJob({...target,...(mode==='etag'?{start_at:'2026-11-12T15:10:00Z',receipt:{etag:'"old"'}}:{})},{token:'fixture',recheck:async()=>mode!=='version',fetchImpl:async(url,init={})=>{
      if(init.method&&init.method!=='GET'&&!url.includes('/freeBusy'))writes++;
      if(url.includes('/freeBusy'))return response({calendars:{[target.calendar_id]:{busy:[{start:target.start_at,end:target.end_at}]}}});
      return mode==='etag'?response(event):response({},404);
    }});
    assert.ok(['conflict','cancelled'].includes(result.status));assert.equal(writes,0);
  }
});
test('ETag editado no Google não é adotado por horário igual nem permite reagendamento posterior',async()=>{
  const edited={...event,etag:'"v2"',summary:'Título editado pelo proprietário'};
  const writes=[];
  const fetchImpl=async(_,init={})=>{if(init.method&&init.method!=='GET')writes.push(init);return response(edited);};
  const previous={...target,receipt:{etag:event.etag}};
  const observed=await syncCalendarJob(previous,{token:'fixture',recheck:async()=>true,fetchImpl});
  assert.equal(observed.status,'conflict');assert.equal(observed.error_code,'external_event_changed');
  assert.equal(observed.receipt,undefined);
  const rescheduled=await syncCalendarJob({...previous,start_at:'2026-11-12T16:00:00Z',end_at:'2026-11-12T16:30:00Z'},
    {token:'fixture',recheck:async()=>true,fetchImpl});
  assert.equal(rescheduled.status,'conflict');assert.equal(writes.length,0);
  assert.equal(edited.summary,'Título editado pelo proprietário');
});
test('evento sem recibo só é reconciliado após escrita ambígua',async()=>{
  for(const reconcile_only of [false,true]){
    const result=await syncCalendarJob({...target,reconcile_only},{token:'fixture',recheck:async()=>true,fetchImpl:async()=>response(event)});
    assert.equal(result.status,reconcile_only?'synced':'conflict');
  }
});
test('reselect usa o recibo e ID existentes para renovar prova sem duplicar evento',async()=>{
 const requests=[];
 const result=await syncCalendarJob({...target,connection_revision:crypto.randomUUID(),receipt:{etag:event.etag,source_version:target.source_version}},
  {token:'fixture',recheck:async()=>true,fetchImpl:async(url,init={})=>{requests.push({url,method:init.method||'GET'});return response(event);}});
 assert.equal(result.status,'synced');assert.equal(result.receipt.etag,event.etag);assert.equal(result.receipt.event_id,target.event_id);
 assert.equal(requests.length,1);assert.equal(requests[0].method,'GET');
});
test('cancelar exige metadados próprios; 404 é recibo de ausência e DELETE usa If-Match',async()=>{
  for(const mode of ['missing','own','foreign']){
    let deletes=0;
    const result=await syncCalendarJob({...target,desired_action:'delete',receipt:{etag:event.etag}},{token:'fixture',recheck:async()=>true,fetchImpl:async(_,init={})=>{
      if(init.method==='DELETE'){deletes++;assert.equal(init.headers['If-Match'],event.etag);return response(null,204);}
      return mode==='missing'?response({},404):response(mode==='own'?event:{...event,extendedProperties:{}});
    }});
    assert.equal(result.status,mode==='foreign'?'conflict':'cancelled');assert.equal(deletes,mode==='own'?1:0);
  }
});
test('erros de provedor são sanitizados e nunca devolvem conteúdo privado',async()=>{
  await assert.rejects(calendarRequest('https://fixture.invalid',{fetchImpl:async()=>response({secret:'NAO-EXIBIR'},403)}),error=>error.message==='calendar_http_403');
});
test('erro 5xx após escrever é ambíguo e recibo sem ETag não confirma',async()=>{
  const result=await syncCalendarJob(target,{token:'fixture',recheck:async()=>true,fetchImpl:async(url,init={})=>{
    if(url.includes('/freeBusy'))return response({calendars:{[target.calendar_id]:{busy:[]}}});
    return init.method==='POST'?response({},503):response({},404);
  }});
  assert.equal(result.status,'uncertain');
  const noEtag=await syncCalendarJob(target,{token:'fixture',recheck:async()=>true,fetchImpl:async()=>response({...event,etag:null})});
  assert.notEqual(noEtag.status,'synced');
});
test('falha de renovação antes de escrever encerra reserva sem fingir transporte',async()=>{
  const encrypted_token=await sealCalendarToken('fixture-refresh',config,{client,owner}),actions=[];
  const db={async rpc(_,args){actions.push(args);if(args.p_action==='claim')return {data:[{...target,encrypted_token}]};
    if(args.p_action==='check')return {data:{allowed:true}};if(args.p_action==='finish')return {data:{status:args.p_payload.status}};}};
  const result=await drainCalendarJobs({db,config,fetchImpl:async()=>response({},400)});
  assert.equal(result[0].status,'failed');assert.ok(actions.some(row=>row.p_action==='finish'));
});
test('drain do scheduler não afirma sincronização sem persistir recibo',async()=>{
  const encrypted_token=await sealCalendarToken('fixture-refresh',config,{client,owner});
  const calls=[];
  const db={async rpc(_,args){calls.push(args);if(args.p_action==='claim')return {data:[{...target,encrypted_token,receipt:{etag:event.etag}}]};
    if(args.p_action==='check')return {data:{allowed:true}};
    if(args.p_action==='finish')return {error:{code:'fixture'}};
    assert.fail(args.p_action);}};
  const results=await drainCalendarJobs({db,config,fetchImpl:async(url)=>url.includes('/token')?response({access_token:'fixture'}):response(event)});
  assert.equal(results[0].status,'uncertain');assert.ok(calls.some(row=>row.p_action==='finish'));
});

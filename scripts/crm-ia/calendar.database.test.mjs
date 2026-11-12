import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import test from 'node:test';
const work=mkdtempSync('/tmp/planeje-calendar-db-'),dir=join(work,'data');
const env={PATH:process.env.PATH,LC_ALL:'C'};
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const [owner,other,client,foreign,session,lead,contact,appointment]=[1,2,11,12,21,31,41,51].map(id);
function run(name,args,input){const r=spawnSync(name,args,{input,env,encoding:'utf8',timeout:20000});if(r.error||r.status)throw new Error(r.stderr||r.error?.message||r.stdout);return r.stdout.trim();}
const sql=input=>run('psql',['-X','-Aqt','-v','ON_ERROR_STOP=1','-h',work,'-p','55490','-U','calendar_qa','-d','postgres'],input);
const call=(name,action,payload={},uid=null,sessionId=session)=>JSON.parse(sql(`BEGIN;${uid?`SET LOCAL ROLE authenticated;SET LOCAL test.uid='${uid}';SET LOCAL test.session='${sessionId}';`:''}
 SELECT public.${name}('${action}','${JSON.stringify(payload).replaceAll("'","''")}'::jsonb);COMMIT;`));
test('Calendar mantém nonce, owners, busy e versões no PostgreSQL descartável',()=>{
 let started=false;
 try{
  run('initdb',['-D',dir,'-U','calendar_qa','--auth-local=trust','--auth-host=reject','--no-locale','--encoding=UTF8']);
  run('pg_ctl',['-D',dir,'-l',join(work,'pg.log'),'-o',`-k ${work} -p 55490 -c listen_addresses='' -c unix_socket_permissions=0700`,'-w','start']);started=true;
  sql(`CREATE ROLE anon NOLOGIN;CREATE ROLE authenticated NOLOGIN;CREATE ROLE service_role NOLOGIN;
   CREATE SCHEMA auth;CREATE SCHEMA private;CREATE SCHEMA planeje_private;
   CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('test.uid',true),'')::uuid$$;
   CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT jsonb_build_object('sub',auth.uid(),'session_id',nullif(current_setting('test.session',true),''))$$;
   CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid);INSERT INTO auth.sessions VALUES('${session}','${owner}'),('${id(22)}','${other}'),('${id(23)}','${owner}');
   CREATE TABLE public.profiles(id uuid PRIMARY KEY,role text,status text);INSERT INTO public.profiles VALUES('${owner}','admin','active'),('${other}','colaborador','active');
   CREATE TABLE public.clientes(id uuid PRIMARY KEY,responsavel text);INSERT INTO public.clientes VALUES('${client}','${owner}'),('${foreign}','${other}');
   CREATE TABLE public.user_module_access(user_id uuid,module_name text,access_level text);
   CREATE TABLE public.leads(id uuid PRIMARY KEY,cliente_id uuid,responsavel_id uuid);INSERT INTO public.leads VALUES('${lead}','${client}','${owner}');
   CREATE TABLE public.cliente_atend_conversas(cliente_id uuid,contact_id uuid,privado boolean,assigned_to uuid);
   CREATE TABLE public.cliente_whatsapp_contact(id uuid,cliente_id uuid);INSERT INTO public.cliente_whatsapp_contact VALUES('${contact}','${client}');
   CREATE TABLE public.crm_ia_config(cliente_id uuid PRIMARY KEY,data jsonb);
   INSERT INTO public.crm_ia_config VALUES('${client}',jsonb_build_object('availability',jsonb_build_object('timezone','UTC','duration_minutes',30,'interval_minutes',30,'buffer_before',15,'buffer_after',10,'min_notice_hours',0,'max_per_day',8,'windows',jsonb_build_array(jsonb_build_object('owner_id','${owner}','days',jsonb_build_array(0,1,2,3,4,5,6),'start','09:00','end','11:00')))));
   CREATE TABLE public.crm_ia_appointments(id uuid PRIMARY KEY,cliente_id uuid,owner_id uuid,lead_id uuid,contact_id uuid,start_at timestamptz,end_at timestamptz,busy_start_at timestamptz,busy_end_at timestamptz,status text,updated_at timestamptz);
   CREATE FUNCTION private.crm_ia_client(uuid) RETURNS boolean LANGUAGE sql STABLE AS $$SELECT $1='${client}'::uuid AND auth.uid() IN('${owner}'::uuid,'${other}'::uuid)$$;
   CREATE FUNCTION private.crm_ia_agent_actor(uuid,uuid) RETURNS boolean LANGUAGE sql STABLE AS $$SELECT $1='${client}'::uuid AND EXISTS(SELECT 1 FROM public.profiles WHERE id=$2 AND status='active')$$;
   CREATE FUNCTION private.crm_ia_lead(uuid,uuid) RETURNS boolean LANGUAGE sql STABLE AS $$SELECT EXISTS(SELECT 1 FROM public.leads WHERE id=$1 AND cliente_id=$2)$$;
   GRANT USAGE ON SCHEMA auth TO authenticated;`);
  const workspaceSql=readFileSync(new URL('../../supabase/migrations/20261111041704_crm_ia_workspace.sql',import.meta.url),'utf8');
  sql(workspaceSql.match(/CREATE FUNCTION private\.crm_ia_availability\([\s\S]+?\$\$;/)[0]);
  const baseline=workspaceSql.match(/CREATE FUNCTION private\.crm_ia_slots\([\s\S]+?END \$\$;/)[0];
  sql(baseline);const slotsOid=sql("SELECT 'private.crm_ia_slots(uuid,uuid,date,uuid,jsonb)'::regprocedure::oid");
  sql(readFileSync(new URL('../../supabase/migrations/20261111062101_crm_ia_calendar.sql',import.meta.url),'utf8'));
  assert.equal(sql("SELECT 'private.crm_ia_slots(uuid,uuid,date,uuid,jsonb)'::regprocedure::oid"),slotsOid);
  const auth=(action,payload={},uid=owner,sessionId=session)=>call('crm_ia_calendar_workspace',action,{client_id:client,...payload},uid,sessionId);
  const service=(action,payload={})=>call('crm_ia_calendar_service',action,payload);
  sql(`INSERT INTO public.crm_ia_appointments VALUES('${id(50)}','${client}','${owner}','${lead}','${contact}','2026-11-12T18:00Z','2026-11-12T18:30Z','2026-11-12T18:00Z','2026-11-12T18:30Z','scheduled','2026-11-11T11:00Z')`);
  const hash='a'.repeat(64);
  auth('begin',{nonce_hash:hash,oauth_client_id:'fixture',redirect_uri:'https://fixture.invalid/callback'});
  assert.equal(service('nonce_info',{nonce_hash:hash}).cliente_id,client);
  assert.equal(service('nonce_info',{nonce_hash:hash}).cliente_id,client);
  assert.throws(()=>auth('finalize_claim',{nonce_hash:hash},other,id(22)),/nonce|state/i);
  assert.throws(()=>auth('finalize_claim',{nonce_hash:hash},owner,id(23)),/nonce|state/i);
  const claimed=auth('finalize_claim',{nonce_hash:hash});assert.equal(claimed.owner_id,owner);
  assert.throws(()=>auth('finalize_claim',{nonce_hash:hash}),/nonce|state/i);
  auth('begin',{nonce_hash:'c'.repeat(64),oauth_client_id:'fixture',redirect_uri:'https://fixture.invalid/callback'});
  sql("UPDATE planeje_private.crm_ia_calendar_oauth_nonces SET expires_at=clock_timestamp()-interval '1 second' WHERE nonce_hash='"+'c'.repeat(64)+"'");
  assert.throws(()=>auth('finalize_claim',{nonce_hash:'c'.repeat(64)}),/nonce|state/i);
  const grant=service('grant',{nonce_hash:hash,encrypted_token:'v1.fixture.encrypted',google_subject:'fixture-google',google_email:'fixture@example.test',scopes:['fixture']});
  assert.equal(grant.status,'awaiting_calendar');
  assert.throws(()=>auth('status',{owner_id:other}),/owner|propriet|acesso/i);
  assert.throws(()=>auth('begin',{client_id:foreign,nonce_hash:'b'.repeat(64)}),/acesso/i);
  assert.ok(!JSON.stringify(auth('status')).includes('v1.fixture.encrypted'));
  service('select',{client_id:client,owner_id:owner,revision:grant.revision,calendar_id:'fixture-calendar',time_zone:'America/Sao_Paulo',calendar_name:'Agenda',access_role:'owner'});
  let connection=service('connection',{client_id:client,owner_id:owner});
  const reselect=()=>{connection=service('connection',{client_id:client,owner_id:owner});
   const selected=service('select',{client_id:client,owner_id:owner,revision:connection.revision,calendar_id:connection.calendar_id,time_zone:connection.time_zone,calendar_name:'Agenda',access_role:'owner'});
   connection={...connection,...selected};return selected;};
  const storedJob=()=>JSON.parse(sql(`SELECT to_jsonb(q) FROM planeje_private.crm_ia_calendar_sync_jobs q WHERE appointment_id='${appointment}'`));
  const guard=(start,end)=>JSON.parse(sql(`SELECT private.crm_ia_calendar_slot_guard('${client}','${owner}','${start}','${end}')`));
  assert.equal(guard('2026-11-12T15:00Z','2026-11-12T15:30Z').verified,false);
  service('busy',{client_id:client,owner_id:owner,revision:connection.revision,since:'2026-11-12T00:00Z',until:'2026-11-13T00:00Z',busy:[{start:'2026-11-12T15:00Z',end:'2026-11-12T16:00Z'}]});
  assert.equal(auth('busy').busy.length,1);
  assert.equal(guard('2026-11-12T15:00Z','2026-11-12T15:30Z').free,false);
  assert.equal(guard('2026-11-12T16:00Z','2026-11-12T16:30Z').free,true);
  const future=sql("SELECT ((clock_timestamp() AT TIME ZONE 'UTC')::date+1)::text"),futureEnd=sql("SELECT ((clock_timestamp() AT TIME ZONE 'UTC')::date+2)::text");
  service('busy',{client_id:client,owner_id:owner,revision:connection.revision,since:`${future}T00:00Z`,until:`${futureEnd}T00:00Z`,busy:[{start:`${future}T09:15Z`,end:`${future}T09:45Z`}]});
  const slots=JSON.parse(sql(`SELECT private.crm_ia_slots('${client}','${owner}','${future}')`));assert.equal(slots.total,2);assert.match(new Date(slots.rows[0].start_at).toISOString(),/T10:00:00/);
  for(const rules of [{interval_minutes:0},{duration_minutes:0},{duration_minutes:721},{interval_minutes:721},{buffer_before:-1},{buffer_after:241},{min_notice_hours:-1},{horizon_days:0},{max_per_day:201}]){
   assert.throws(()=>sql(`SET statement_timeout='200ms';SELECT private.crm_ia_slots('${client}','${owner}','${future}',NULL,'${JSON.stringify(rules)}')`),
    failure=>/crm_ia_availability_invalid/.test(failure.message)&&!/statement timeout/.test(failure.message));
  }
  for(const key of ['interval_minutes','duration_minutes']){
   sql(`UPDATE public.crm_ia_config SET data=jsonb_set(data,'{availability,${key}}','0') WHERE cliente_id='${client}'`);
   assert.throws(()=>sql(`SET statement_timeout='200ms';SELECT private.crm_ia_slots('${client}','${owner}','${future}')`),
    failure=>/crm_ia_availability_invalid/.test(failure.message)&&!/statement timeout/.test(failure.message));
   sql(`UPDATE public.crm_ia_config SET data=jsonb_set(data,'{availability,${key}}','30') WHERE cliente_id='${client}'`);
  }
  sql(`UPDATE public.crm_ia_config SET data=jsonb_set(data,'{availability,exceptions}','${JSON.stringify([{owner_id:owner,date:future,blocked:true}])}') WHERE cliente_id='${client}'`);
  assert.equal(JSON.parse(sql(`SELECT private.crm_ia_slots('${client}','${owner}','${future}')`)).total,0);
  sql(`UPDATE public.crm_ia_config SET data=jsonb_set(jsonb_set(data,'{availability,timezone}','"America/Sao_Paulo"'),'{availability,exceptions}','${JSON.stringify([{owner_id:owner,date:future,blocked:false,start:'09:30',end:'10:30'}])}') WHERE cliente_id='${client}'`);
  const exceptionSlots=JSON.parse(sql(`SELECT private.crm_ia_slots('${client}','${owner}','${future}')`));assert.equal(exceptionSlots.total,2);assert.match(new Date(exceptionSlots.rows[0].start_at).toISOString(),/T12:30:00/);
  sql(`UPDATE public.crm_ia_config SET data=jsonb_set(jsonb_set(data,'{availability,timezone}','"UTC"'),'{availability,exceptions}','[]') WHERE cliente_id='${client}'`);
  sql(`INSERT INTO public.crm_ia_appointments VALUES('${appointment}','${client}','${owner}','${lead}','${contact}','2026-11-12T15:00Z','2026-11-12T15:30Z','2026-11-12T15:00Z','2026-11-12T15:30Z','scheduled','2026-11-11T12:00Z')`);
  const jobs=service('claim');assert.equal(jobs.length,1);const job=jobs[0];
  assert.equal(service('check',{id:job.id,lease:job.lease}).allowed,true);
  assert.equal(service('claim').length,0);
  sql(`UPDATE public.crm_ia_appointments SET start_at='2026-11-12T16:00Z',updated_at='2026-11-11T12:01Z' WHERE id='${appointment}'`);
  assert.equal(service('check',{id:job.id,lease:job.lease}).allowed,false);
  assert.equal(service('finish',{id:job.id,lease:job.lease,status:'synced',receipt:{event_id:job.event_id,calendar_id:job.calendar_id,etag:'v1',http_status:201}}).status,'pending');
  const next=service('claim')[0];assert.ok(next);assert.notEqual(next.lease,job.lease);
  assert.equal(service('finish',{id:next.id,lease:next.lease,status:'synced',receipt:{event_id:next.event_id,calendar_id:next.calendar_id,etag:'v2',http_status:200}}).status,'synced');
  assert.equal(JSON.parse(sql(`SELECT private.crm_ia_calendar_confirmation('${appointment}')`)).confirmed,true);
  assert.equal(JSON.parse(sql(`SET TIMEZONE='UTC';SELECT private.crm_ia_calendar_confirmation('${appointment}')`)).confirmed,true);
  const syncedReceipt=storedJob().receipt,sourceVersion=storedJob().desired_version;
  for(const prior of ['synced','failed','disconnected']){
   sql(`UPDATE planeje_private.crm_ia_calendar_sync_jobs SET status='${prior}',attempts=6 WHERE appointment_id='${appointment}'`);
   const priorReceipt=storedJob().receipt;
   reselect();assert.equal(storedJob().status,'pending');assert.deepEqual(storedJob().receipt,priorReceipt);
   assert.equal(storedJob().desired_version,sourceVersion);assert.equal(storedJob().attempts,0);
   assert.equal(JSON.parse(sql(`SELECT private.crm_ia_calendar_confirmation('${appointment}')`)).verified,false);
   const retried=service('claim');assert.equal(retried.length,1);assert.equal(retried[0].event_id,next.event_id);assert.equal(retried[0].receipt.etag,'v2');
   service('finish',{id:retried[0].id,lease:retried[0].lease,status:'synced',receipt:{event_id:next.event_id,calendar_id:next.calendar_id,etag:'v2',http_status:200}});
   assert.equal(JSON.parse(sql(`SELECT private.crm_ia_calendar_confirmation('${appointment}')`)).verified,true);
  }
  // Existing work is requeued; selecting a calendar never backfills old appointments.
  assert.equal(sql(`SELECT count(*) FROM planeje_private.crm_ia_calendar_sync_jobs WHERE appointment_id='${id(50)}'`),'0');
  reselect();const inflight=service('claim')[0];reselect();
  assert.equal(storedJob().status,'claimed');assert.equal(storedJob().lease,inflight.lease);
  assert.equal(service('check',{id:inflight.id,lease:inflight.lease}).allowed,false);assert.equal(service('claim').length,0);
  // A write with no receipt cannot be moved to a different target while its outcome is unknown.
  for(const status of ['claimed','uncertain']){
   sql(`UPDATE planeje_private.crm_ia_calendar_sync_jobs SET status='${status}',receipt=NULL,uncertain_write=${status==='uncertain'} WHERE appointment_id='${appointment}'`);
   assert.throws(()=>service('select',{client_id:client,owner_id:owner,revision:connection.revision,calendar_id:'different-calendar',time_zone:'UTC',access_role:'owner'}),/existing_events_require_resolution/);
  }
  sql(`UPDATE planeje_private.crm_ia_calendar_sync_jobs SET status='claimed',receipt='${JSON.stringify(syncedReceipt)}',uncertain_write=false WHERE appointment_id='${appointment}'`);
  assert.equal(service('finish',{id:inflight.id,lease:inflight.lease,status:'synced',receipt:{event_id:inflight.event_id,calendar_id:inflight.calendar_id,etag:'v2',http_status:200}}).status,'pending');
  const reconciled=service('claim')[0];assert.equal(reconciled.receipt.etag,'v2');
  service('finish',{id:reconciled.id,lease:reconciled.lease,status:'synced',receipt:{event_id:reconciled.event_id,calendar_id:reconciled.calendar_id,etag:'v2',http_status:200}});
  reselect();const lost=service('claim')[0];reselect();
  sql(`UPDATE planeje_private.crm_ia_calendar_sync_jobs SET lease_until=clock_timestamp()-interval '1 second' WHERE appointment_id='${appointment}'`);
  const uncertain=service('claim')[0];assert.equal(uncertain.reconcile_only,true);assert.notEqual(uncertain.lease,lost.lease);assert.equal(uncertain.receipt.etag,'v2');
  service('finish',{id:uncertain.id,lease:uncertain.lease,status:'synced',receipt:{event_id:uncertain.event_id,calendar_id:uncertain.calendar_id,etag:'v2',http_status:200}});
  sql(`UPDATE public.crm_ia_appointments SET status='cancelled',updated_at='2026-11-11T12:02Z' WHERE id='${appointment}'`);
  const cancel=service('claim')[0];assert.equal(cancel.desired_action,'delete');
  assert.equal(service('finish',{id:cancel.id,lease:cancel.lease,status:'cancelled',receipt:{event_id:cancel.event_id,calendar_id:cancel.calendar_id,etag:'v2',http_status:204}}).status,'cancelled');
  const cancelled=JSON.parse(sql(`SELECT private.crm_ia_calendar_confirmation('${appointment}')`));
  assert.equal(cancelled.cancelled,true);assert.equal(cancelled.confirmed,false);assert.equal(cancelled.verified,true);assert.equal(cancelled.state,'ready');
  sql(`UPDATE planeje_private.crm_ia_calendar_sync_jobs SET claimed_revision=gen_random_uuid() WHERE appointment_id='${appointment}'`);
  assert.equal(JSON.parse(sql(`SELECT private.crm_ia_calendar_confirmation('${appointment}')`)).verified,false);
  sql(`UPDATE planeje_private.crm_ia_calendar_sync_jobs SET claimed_revision='${connection.revision}' WHERE appointment_id='${appointment}'`);
  sql(`INSERT INTO public.crm_ia_appointments SELECT '${id(52)}',cliente_id,owner_id,lead_id,contact_id,start_at,end_at,busy_start_at,busy_end_at,'scheduled',updated_at FROM public.crm_ia_appointments WHERE id='${appointment}'`);
  const beforeRevoke=service('claim')[0];assert.ok(beforeRevoke);
  auth('disconnect');assert.equal(auth('status').status,'disconnected');
  assert.equal(service('check',{id:beforeRevoke.id,lease:beforeRevoke.lease}).allowed,false);
  assert.equal(service('finish',{id:beforeRevoke.id,lease:beforeRevoke.lease,status:'synced',receipt:{event_id:beforeRevoke.event_id,calendar_id:beforeRevoke.calendar_id,etag:'observed-before-revoke',http_status:201}}).status,'disconnected');
  assert.equal(auth('busy').fresh,false);
  assert.equal(guard('2026-11-12T16:00Z','2026-11-12T16:30Z').required,false);
  auth('begin',{nonce_hash:'d'.repeat(64),oauth_client_id:'fixture',redirect_uri:'https://fixture.invalid/callback'});
  auth('finalize_claim',{nonce_hash:'d'.repeat(64)});
  const reconnect=service('grant',{nonce_hash:'d'.repeat(64),encrypted_token:'v1.fixture.reconnected',google_subject:'fixture-google',google_email:'fixture@example.test',scopes:['fixture']});
  assert.equal(reconnect.status,'awaiting_calendar');reselect();
  const afterReconnect=service('claim'),resumed=afterReconnect.find(row=>row.id===beforeRevoke.id);
  assert.ok(resumed);assert.equal(resumed.receipt.etag,'observed-before-revoke');assert.equal(resumed.event_id,beforeRevoke.event_id);
  for(const row of afterReconnect)service('finish',{id:row.id,lease:row.lease,status:row.desired_action==='delete'?'cancelled':'synced',receipt:{event_id:row.event_id,calendar_id:row.calendar_id,etag:row.receipt.etag,http_status:row.desired_action==='delete'?404:200}});
  assert.equal(JSON.parse(sql(`SELECT private.crm_ia_calendar_confirmation('${beforeRevoke.id}')`)).verified,true);
  assert.equal(sql(`SELECT count(*) FROM planeje_private.crm_ia_calendar_sync_jobs WHERE appointment_id='${id(50)}'`),'0');
  // Resolve earlier managed events before moving a different, provably unwritten job.
  sql(`UPDATE public.crm_ia_appointments SET status='cancelled',updated_at=updated_at+interval '1 minute' WHERE id='${beforeRevoke.id}'`);
  for(const row of service('claim'))service('finish',{id:row.id,lease:row.lease,status:'cancelled',receipt:{event_id:row.event_id,calendar_id:row.calendar_id,etag:row.receipt.etag,http_status:404}});
  sql(`INSERT INTO public.crm_ia_appointments SELECT '${id(55)}',cliente_id,owner_id,lead_id,contact_id,start_at,end_at,busy_start_at,busy_end_at,'scheduled',updated_at FROM public.crm_ia_appointments WHERE id='${beforeRevoke.id}'`);
  const preTransport=service('claim')[0];assert.equal(preTransport.id,id(55));
  service('finish',{id:preTransport.id,lease:preTransport.lease,status:'failed',error_code:'calendar_access_unavailable'});
  connection=service('connection',{client_id:client,owner_id:owner});
  const different={client_id:client,owner_id:owner,revision:connection.revision,calendar_id:'different-calendar',time_zone:'UTC',access_role:'owner'};
  assert.throws(()=>sql(`BEGIN;UPDATE planeje_private.crm_ia_calendar_sync_jobs SET status='uncertain',uncertain_write=true WHERE appointment_id='${preTransport.id}';
   SELECT public.crm_ia_calendar_service('select','${JSON.stringify(different)}');COMMIT;`),/existing_events_require_resolution/);
  const jobCount=sql('SELECT count(*) FROM planeje_private.crm_ia_calendar_sync_jobs');
  service('select',different);
  const moved=service('claim');assert.equal(moved.length,1);assert.equal(moved[0].id,preTransport.id);
  assert.equal(moved[0].event_id,preTransport.event_id);assert.equal(moved[0].calendar_id,'different-calendar');assert.equal(moved[0].receipt,null);
  assert.equal(moved[0].source_version,preTransport.source_version);assert.equal(moved[0].owner_id,owner);assert.equal(moved[0].cliente_id,client);
  assert.equal(moved[0].encrypted_token,preTransport.encrypted_token);assert.equal(moved[0].reconcile_only,false);
  assert.equal(sql('SELECT count(*) FROM planeje_private.crm_ia_calendar_sync_jobs'),jobCount);
  assert.equal(sql(`SELECT count(*) FROM planeje_private.crm_ia_calendar_sync_jobs WHERE appointment_id='${id(50)}'`),'0');
  assert.equal(sql("SELECT has_function_privilege('authenticated','public.crm_ia_calendar_service(text,jsonb)','execute')"),'f');
  assert.equal(sql("SELECT has_table_privilege('authenticated','planeje_private.crm_ia_calendar_connections','select')"),'f');
 }finally{if(started)run('pg_ctl',['-D',dir,'-m','immediate','-w','stop']);rmSync(work,{recursive:true,force:true});}
});

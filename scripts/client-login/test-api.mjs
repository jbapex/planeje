// Only runs against the isolated CS network. No production credentials/data.
import {readFile,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
const require=createRequire('/opt/planeje-staging/source/node_modules/.client-login-test.cjs');
const {createClient:sdk}=require('@supabase/supabase-js');
const keys=JSON.parse(await readFile('/opt/planeje-cs-integration/keys.json','utf8'));
const accounts=JSON.parse(await readFile('/opt/planeje-cs-integration/test-access.json','utf8'));
const BASE='http://client-login-fixture.invalid',C1='11111111-1111-4111-8111-111111110101',C2='11111111-1111-4111-8111-111111110102',STORE='a2396b48-2d2f-4b4b-adfd-3a4043b320e6';
let storeSeeded=false;
let fault='',lastCreated,transportCount=0;
const internalFetch=async(url,options={})=>{
 const p=new URL(String(url));transportCount++;
 if(p.pathname.startsWith('/auth/v1/')){
  if(fault==='cleanup'&&options.method==='DELETE')return new Response('{"msg":"synthetic cleanup failure"}',{status:500,headers:{'Content-Type':'application/json'}});
  const r=await fetch('http://planeje-cs-auth:9999'+p.pathname.slice(8)+p.search,options);
  if(p.pathname==='/auth/v1/admin/users'&&options.method==='POST'&&r.ok)lastCreated=(await r.clone().json()).id;
  return r;
 }
 if(p.pathname.startsWith('/rest/v1/')){
  if(lastCreated&&((fault==='read'&&p.pathname.endsWith('/profiles')&&options.method==='GET')||(['write','cleanup'].includes(fault)&&p.pathname.endsWith('/profiles')&&options.method==='POST')))return new Response('{"message":"synthetic profile failure"}',{status:500,headers:{'Content-Type':'application/json'}});
  return fetch('http://planeje-cs-rest:3000'+p.pathname.slice(8)+p.search,options);
 }
 throw Error('External transport disabled');
};
const client=(url,key,options={})=>sdk(url,key,{...options,global:{fetch:internalFetch,headers:{...(options.global?.headers||{})}},auth:{persistSession:false,autoRefreshToken:false}});
globalThis.__clientLoginCreate=client;
globalThis.Deno={env:{get:k=>({SUPABASE_URL:BASE,SUPABASE_ANON_KEY:keys.anon,SUPABASE_SERVICE_ROLE_KEY:keys.service})[k]}};
await import('./handler.mjs');
const service=client(BASE,keys.service),ids=new Set(),sessions=[],checks=[],contactIds=[];
const check=(name,ok)=>{if(!ok)throw Error('CHECK FAILED: '+name);checks.push(name);};
const email=()=>`fixture-client-${randomUUID()}@example.invalid`,password=()=>randomUUID();
const login=async(e,p)=>{const c=client(BASE,keys.anon);const r=await c.auth.signInWithPassword({email:e,password:p});if(r.data.session)sessions.push(c);return {...r,c};};
const request=async(body,token)=>{const r=await globalThis.__clientLoginHandler(new Request(BASE+'/admin-client-user',{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)}));const data=await r.json();check('response_no_store',r.headers.get('Cache-Control')==='no-store');check('safe_response',!JSON.stringify(data).includes(keys.service)&&!JSON.stringify(data).includes(body.password||'SECRET_SENTINEL'));return {status:r.status,data};};
const seed=async({role='colaborador',status='pending',cliente_id=null,marker=false,userMarker=false}={})=>{const e=email(),p=password();const r=await service.auth.admin.createUser({email:e,password:p,email_confirm:true,...(marker?{app_metadata:{planeje_provisioning_role:'cliente'}}:{}),user_metadata:{role:userMarker?'cliente':role,full_name:'Conta FICTÍCIA'}});check('seed_auth',!r.error);const id=r.data.user.id;ids.add(id);const q=await service.from('profiles').update({role,status,cliente_id}).eq('id',id);check('seed_profile',!q.error);return {id,email:e,password:p};};
try{
 const owner=await login(accounts.owner.email,accounts.owner.password);check('owner_login',!owner.error);const token=owner.data.session.access_token;
 const staff=await login(accounts.staff.email,accounts.staff.password);check('staff_login',!staff.error);
 let body={email:email(),password:password(),full_name:'Cliente FICTÍCIO',cliente_id:C1};
 let r=await request(body);check('anonymous_denied',r.status===401);
 r=await request(body,keys.anon);check('anon_key_denied',r.status===401);
 r=await request(body,staff.data.session.access_token);check('staff_denied',r.status===403);
 r=await request({...body,cliente_id:'bad'},token);check('bad_client_id_denied',r.status===400);
 r=await request({...body,cliente_id:'99999999-9999-4999-8999-999999999999'},token);check('missing_client_denied',r.status===404);
 r=await request(body,token);check('new_client_created',r.status===200&&r.data.ok&&!r.data.linked_existing);const id=r.data.user_id;ids.add(id);
 let profile=await service.from('profiles').select('role,status,cliente_id,full_name,allowed_pages').eq('id',id).single();check('new_profile_linked',profile.data.role==='cliente'&&profile.data.cliente_id===C1&&profile.data.status==='pending');
 let signed=await login(body.email,body.password);check('created_login_works',!signed.error);
 let allowed=await signed.c.rpc('planeje_current_account_access');check('new_client_approved',allowed.data===true);
 const contacts=[{id:randomUUID(),cliente_id:C1,from_jid:randomUUID()+'@s.whatsapp.net',phone:'5511000000001',sender_name:'Lead FICTÍCIO'},{id:randomUUID(),cliente_id:C2,from_jid:randomUUID()+'@s.whatsapp.net',phone:'5511000000002',sender_name:'Outro lead FICTÍCIO'}];const inserted=await service.from('cliente_whatsapp_contact').insert(contacts);check('seed_synthetic_contacts',!inserted.error);contactIds.push(...contacts.map(c=>c.id));let clients=await signed.c.from('cliente_whatsapp_contact').select('id,cliente_id').in('id',contactIds);check('mini_crm_contact_rls_scope',!clients.error&&clients.data.length===1&&clients.data[0].cliente_id===C1);
 r=await request({...body,cliente_id:C2,password:password()},token);check('other_client_conflict',r.status===409&&r.data.error.includes('outro cliente'));
 signed=await login(body.email,body.password);check('other_client_password_unchanged',!signed.error);
 const nextPassword=password();r=await request({...body,password:nextPassword},token);check('same_client_relink',r.status===200&&r.data.linked_existing&&r.data.already_linked);
 signed=await login(body.email,nextPassword);check('same_client_new_password_works',!signed.error);
 for(const opts of [{role:'colaborador',status:'active'},{role:'colaborador',status:'pending',userMarker:true},{role:'colaborador',status:'pending',marker:true},{role:'superadmin',status:'active'}]){
  const x=await seed(opts);r=await request({...body,email:x.email,password:password()},token);check('internal_or_old_partial_denied',r.status===409);signed=await login(x.email,x.password);check('internal_password_unchanged',!signed.error);profile=await service.from('profiles').select('role,status,cliente_id').eq('id',x.id).single();check('internal_role_unchanged',profile.data.role===opts.role&&profile.data.cliente_id===null);
 }
 const pending=await seed({role:'superadmin'});signed=await login(pending.email,pending.password);r=await request({...body,email:email()},signed.data.session.access_token);check('pending_admin_denied',r.status===403);
 // Store admin keeps its own create/password flow and rejects duplicate emails.
 const priorStore=await service.from('clientes').select('id').eq('id',STORE);check('store_fixture_id_unused',!priorStore.error&&!priorStore.data.length);const createStore=await service.from('clientes').insert({id:STORE,empresa:'Loja FICTÍCIA de teste de login'});check('seed_store_client',!createStore.error);storeSeeded=true;const store=await seed({role:'cliente',cliente_id:STORE});let q=await service.from('cliente_atend_membros').insert({cliente_id:STORE,user_id:store.id,nivel:'admin',ativo:true,setor_ids:[],nome:'Administrador FICTÍCIO',email:store.email});check('seed_store_admin',!q.error);
 signed=await login(store.email,store.password);const storeToken=signed.data.session.access_token;
 const storeBody={...body,cliente_id:STORE,acao:'loja_criar',email:email(),password:password(),nivel:'atendente'};
 r=await request(storeBody,storeToken);check('store_can_create',r.status===200&&r.data.membro.nivel==='atendente');const storeUser=r.data.user_id;ids.add(storeUser);
 profile=await service.from('profiles').select('role,cliente_id,allowed_pages').eq('id',storeUser).single();check('store_profile_pages_preserved',profile.data.role==='cliente'&&profile.data.cliente_id===STORE&&JSON.stringify(profile.data.allowed_pages)===JSON.stringify(['atendimento','mini-crm','calendario']));
 r=await request(storeBody,storeToken);check('store_duplicate_denied',r.status===409);
 r=await request({...storeBody,cliente_id:C2,email:email()},storeToken);check('store_other_client_denied',r.status===403);
 const storePass=password();r=await request({acao:'loja_senha',user_id:storeUser,cliente_id:STORE,password:storePass},storeToken);check('store_password_change',r.status===200);signed=await login(storeBody.email,storePass);check('store_new_password_works',!signed.error);
 // Real Auth + DB, with only the failing transport response replaced.
 for(const f of ['read','write','cleanup']){
  lastCreated=null;fault=f;r=await request({...body,email:email()},token);const failedId=lastCreated;check('failed_create_id_recorded',!!failedId);ids.add(failedId);fault='';check('failure_is_reported',r.status===(f==='read'||f==='cleanup'?500:400));const u=await service.auth.admin.getUserById(failedId);check(f==='cleanup'?'cleanup_failure_keeps_explicit_pending_account':'failed_new_account_removed',f==='cleanup'?!!u.data.user:!u.data.user);const p=await service.from('profiles').select('id').eq('id',failedId);check('profile_cleanup_cascades',f==='cleanup'?p.data.length===1:p.data.length===0);
 }
 await owner.c.auth.signOut({scope:'local'});r=await request({...body,email:email()},token);check('revoked_session_denied',[401,403].includes(r.status));
 await writeFile('/task/api-verification.json',JSON.stringify({passed:checks.length,checks,production_writes:0,external_messages:0,transport_count:transportCount},null,2));console.log(JSON.stringify({passed:checks.length,production_writes:0,external_messages:0}));
}finally{fault='';if(contactIds.length){const d=await service.from('cliente_whatsapp_contact').delete().in('id',contactIds);if(d.error)throw Error('Synthetic contact cleanup failed');}for(const c of sessions)await c.auth.signOut({scope:'local'});for(const id of ids){const exists=await service.auth.admin.getUserById(id);if(exists.data.user){const member=await service.from('cliente_atend_membros').select('nivel').eq('user_id',id).maybeSingle();if(storeSeeded&&member.data?.nivel==='admin')continue;await service.from('cliente_atend_membros').delete().eq('user_id',id);const d=await service.auth.admin.deleteUser(id);if(d.error)throw Error('Synthetic account cleanup failed');}}if(storeSeeded)console.log('Disposable store teardown requires the isolated SQL runner (last-admin guard).');}

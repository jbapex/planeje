// Disposable records on the isolated CS network; transport cannot reach real services.
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { fetchMiniCrmObservations, saveMiniCrmObservation } from '../../src/lib/miniCrmObservations.js';
const require = createRequire('/opt/planeje-staging/source/node_modules/.notes-fixture.cjs');
const { createClient } = require('@supabase/supabase-js');
const keys = JSON.parse(await readFile('/opt/planeje-cs-integration/keys.json','utf8'));
const accounts = JSON.parse(await readFile('/opt/planeje-cs-integration/test-access.json','utf8'));
const transport = (url, options) => { const u = new URL(String(url));
 if (u.pathname.startsWith('/auth/v1/')) return fetch('http://planeje-cs-auth:9999'+u.pathname.slice(8)+u.search,options);
 if (u.pathname.startsWith('/rest/v1/')) return fetch('http://planeje-cs-rest:3000'+u.pathname.slice(8)+u.search,options);
 throw Error('External transport blocked'); };
const client = key => createClient('http://notes-fixture.invalid',key,{global:{fetch:transport},auth:{persistSession:false,autoRefreshToken:false}});
const service=client(keys.service),anon=client(keys.anon),sessions=[],checks=[];
const check=(name,ok)=>{ if(!ok)throw Error('CHECK FAILED: '+name);checks.push(name); };
const login=async(email,password)=>{ const c=client(keys.anon),r=await c.auth.signInWithPassword({email,password});check('sign_in',!r.error);sessions.push(c);return c; };
const fixtureFile='/task/fixture-private.json';
if(process.argv[2]==='prepare') {
 const f={clients:[randomUUID(),randomUUID()],contacts:[randomUUID(),randomUUID()],users:[]};
 check('seed_clients',!(await service.from('clientes').insert(f.clients.map((id,i)=>({id,empresa:`Loja FICTÍCIA observações ${i}`,nicho:'Loja de noivas'})))).error);
 for(const [role,cid,status] of [['cliente',f.clients[0],'pending'],['cliente',f.clients[1],'pending'],['colaborador',null,'active']]){
  const email=`notes-${randomUUID()}@example.invalid`,password=randomUUID();const r=await service.auth.admin.createUser({email,password,email_confirm:true,app_metadata:{planeje_provisioning_role:role},user_metadata:{full_name:'Pessoa FICTÍCIA observações'}});check('seed_auth',!r.error);
  const id=r.data.user.id;f.users.push({id,email,password});check('seed_profile',!(await service.from('profiles').update({role,cliente_id:cid,status,full_name:'Pessoa FICTÍCIA observações'}).eq('id',id)).error);
 }
 check('seed_module_denial',!(await service.from('user_module_permissions').upsert({user_id:f.users[2].id,module_name:'mini_crm',is_enabled:false},{onConflict:'user_id,module_name'})).error);
 const seed=await service.from('cliente_whatsapp_contact').insert(f.contacts.map((id,i)=>({id,cliente_id:f.clients[i],from_jid:`notes-${id}@s.whatsapp.net`,phone:`551100000000${i}`,sender_name:'Lead FICTÍCIO observações',origin_source:'site',utm_source:'Linktree',mini_crm:{status:'Novo Lead',observacao:'Observação anterior FICTÍCIA',vendedor:'Consultora FICTÍCIA',_planeje_message_status:{manual:false,lastStatus:'Novo Lead'}}})));check('seed_contacts',!seed.error);
 await writeFile(fixtureFile,JSON.stringify(f),{mode:0o600});console.log(JSON.stringify({prepared:true,clients:f.clients.length,contacts:f.contacts.length,users:f.users.length}));
} else {
 const f=JSON.parse(await readFile(fixtureFile,'utf8'));const [cid,otherCid]=f.clients,[contactId,otherId]=f.contacts;
 const read=async()=>{const r=await service.from('cliente_whatsapp_contact').select('*').eq('id',contactId).single();check('read_contact',!r.error);return r.data;};
 const history=async(c=service)=>{const r=await c.from('mini_crm_observation_history').select('*').eq('cliente_id',cid).eq('contact_id',contactId);check('read_history',!r.error);return r.data;};
 try {
  const own=await login(f.users[0].email,f.users[0].password),other=await login(f.users[1].email,f.users[1].password),disabled=await login(f.users[2].email,f.users[2].password),owner=await login(accounts.owner.email,accounts.owner.password),staff=await login(accounts.staff.email,accounts.staff.password);
  for(let attempt=0;attempt<6;attempt++){const r=await own.rpc('mini_crm_save_observation',{p_cliente_id:cid,p_contact_id:contactId,p_body:'',p_request_id:randomUUID()});if(r.error?.code!=='PGRST202'){check('schema_visible',r.error?.code==='22023');break;}if(attempt===5)throw Error('Schema cache not refreshed');await new Promise(r=>setTimeout(r,500));}
  const initial=await read();check('legacy_text_unchanged',initial.mini_crm.observacao==='Observação anterior FICTÍCIA');check('no_legacy_backfill_writes',(await history()).length===0);
  const params={clienteId:cid,contactId,body:'Primeira observação FICTÍCIA',requestId:randomUUID()};
  const first=await saveMiniCrmObservation(own,params);check('own_pending_client_can_save',first.mini_crm.observacao===params.body);
  let rows=await history();check('legacy_preserved_once',rows.filter(n=>n.kind==='legacy'&&n.body===initial.mini_crm.observacao&&n.created_at===null&&n.author_id===null).length===1);
  check('server_author_and_date',rows.some(n=>n.id===params.requestId&&n.author_id===f.users[0].id&&n.author_name==='Pessoa FICTÍCIA observações'&&n.created_at));
  await saveMiniCrmObservation(own,params);check('retry_idempotent',(await history()).length===2);
  await saveMiniCrmObservation(own,{...params,requestId:randomUUID()});check('new_intent_same_text_is_new_note',(await history()).length===3);
  const second={...params,body:'Segunda observação FICTÍCIA',requestId:randomUUID()};await saveMiniCrmObservation(own,second);
  const retried=await saveMiniCrmObservation(own,params);check('old_retry_preserves_newer_note',retried.mini_crm.observacao===second.body&&(await history()).length===4);
  let r=await own.rpc('mini_crm_save_observation',{p_cliente_id:cid,p_contact_id:contactId,p_body:'Texto diferente',p_request_id:params.requestId});check('request_cannot_change_body',!!r.error);
  r=await other.rpc('mini_crm_save_observation',{p_cliente_id:cid,p_contact_id:contactId,p_body:'Forjada',p_request_id:randomUUID()});check('other_client_cannot_save',!!r.error);
  r=await own.rpc('mini_crm_save_observation',{p_cliente_id:cid,p_contact_id:otherId,p_body:'Forjada',p_request_id:randomUUID()});check('contact_client_mismatch_denied',!!r.error);
  r=await anon.rpc('mini_crm_save_observation',{p_cliente_id:cid,p_contact_id:contactId,p_body:'Forjada',p_request_id:randomUUID()});check('anonymous_save_denied',!!r.error);
  r=await disabled.rpc('mini_crm_save_observation',{p_cliente_id:cid,p_contact_id:contactId,p_body:'Forjada',p_request_id:randomUUID()});check('disabled_module_save_denied',!!r.error);
  r=await other.from('mini_crm_observation_history').select('*').eq('cliente_id',cid);check('other_client_history_denied',r.error||!r.data.length);
  r=await disabled.from('mini_crm_observation_history').select('*').eq('cliente_id',cid);check('disabled_module_history_denied',r.error||!r.data.length);
  r=await anon.from('mini_crm_observation_history').select('*');check('anonymous_history_denied',!!r.error);
  for(const c of [owner,staff])check('authorized_team_history',!(await c.from('mini_crm_observation_history').select('id').eq('contact_id',contactId)).error);
  r=await own.from('mini_crm_observation_history').insert({cliente_id:cid,contact_id:contactId,body:'Forjada',author_name:'Outra pessoa'});check('forged_author_insert_denied',!!r.error);
  r=await own.from('mini_crm_observation_history').update({body:'Reescrita'}).eq('id',params.requestId);check('history_update_denied',!!r.error);
  r=await own.from('mini_crm_observation_history').delete().eq('id',params.requestId);check('history_delete_denied',!!r.error);
  await Promise.all([
   saveMiniCrmObservation(own,{...params,body:'Nota simultânea A',requestId:randomUUID()}),
   saveMiniCrmObservation(staff,{...params,body:'Nota simultânea B',requestId:randomUUID()}),
   own.rpc('mini_crm_patch_contact',{p_cliente_id:cid,p_contact_id:contactId,p_patch:{status:'Agendado',data_agendamento:'2026-11-13',data_agendamento_hora:'15:30'}}).then(r=>check('concurrent_patch_saved',!r.error)),
  ]);
  rows=await history();check('both_concurrent_notes_preserved',['Nota simultânea A','Nota simultânea B'].every(body=>rows.some(n=>n.body===body)));
  let contact=await read();check('other_fields_preserved',contact.mini_crm.status==='Agendado'&&contact.mini_crm.data_agendamento==='2026-11-13'&&contact.mini_crm.data_agendamento_hora==='15:30'&&contact.mini_crm.vendedor===initial.mini_crm.vendedor&&contact.utm_source==='Linktree');
  check('no_commercial_side_effect',!contact.qualificado&&!contact.comprou&&!contact.valor_venda);
  const autoBefore=contact.mini_crm._planeje_message_status;await saveMiniCrmObservation(own,{...params,body:'Só uma nota',requestId:randomUUID()});contact=await read();check('note_preserves_automation',JSON.stringify(contact.mini_crm._planeje_message_status)===JSON.stringify(autoBefore));
  r=await own.rpc('mini_crm_patch_contact',{p_cliente_id:cid,p_contact_id:contactId,p_patch:{observacao:'Editor anterior'}});check('legacy_editor_still_works',!r.error&&(await history()).some(n=>n.body==='Editor anterior'));
  r=await own.rpc('mini_crm_patch_contact',{p_cliente_id:cid,p_contact_id:contactId,p_patch:{observacao:null}});check('clear_preserves_history',!r.error&&(await history()).some(n=>n.kind==='cleared')&&(await history()).some(n=>n.body===params.body));
  for(const body of ['', 'x'.repeat(10001)]){r=await own.rpc('mini_crm_save_observation',{p_cliente_id:cid,p_contact_id:contactId,p_body:body,p_request_id:randomUUID()});check('invalid_body_rejected',r.error?.code==='22023');}
  for(let i=0;i<23;i++)await saveMiniCrmObservation(own,{...params,body:`Observação paginada ${i}`,requestId:randomUUID()});
  const page1=await fetchMiniCrmObservations(own,{clienteId:cid,contactId});const page2=await fetchMiniCrmObservations(own,{clienteId:cid,contactId,offset:20});
  check('pagination_not_truncated',page1.rows.length===20&&page1.hasMore&&page2.rows.length>0&&!page2.hasMore);
  const ids=[...page1.rows,...page2.rows].map(n=>n.id);check('pagination_no_duplicates',new Set(ids).size===ids.length&&ids.length===(await history()).length);
  check('legacy_at_end',page2.rows.at(-1).kind==='legacy');
  const signed=await own.auth.getSession();await own.auth.signOut({scope:'local'});const revoked=client(keys.anon);revoked.rest.headers.Authorization=`Bearer ${signed.data.session.access_token}`;r=await revoked.from('mini_crm_observation_history').select('*').eq('contact_id',contactId);check('revoked_session_no_history',r.error||!r.data.length);
  const deleted=await service.auth.admin.deleteUser(f.users[0].id);check('delete_fixture_author',!deleted.error);
  rows=await history();check('author_snapshot_survives_account_removal',rows.some(n=>n.id===params.requestId&&n.author_id===null&&n.author_name==='Pessoa FICTÍCIA observações'));
  const result={passed:checks.length,checks,external_transports:0,production_writes:0};await writeFile('/task/api-verification.json',JSON.stringify(result,null,2));console.log(JSON.stringify({passed:checks.length,production_writes:0,external_transports:0}));
 } finally {
  for(const c of sessions)await c.auth.signOut({scope:'local'});
  const d=await service.from('cliente_whatsapp_contact').delete().in('id',f.contacts);if(d.error)throw Error('Fixture contact cleanup failed');
  for(const u of f.users)await service.auth.admin.deleteUser(u.id);
  const d2=await service.from('clientes').delete().in('id',f.clients);if(d2.error)throw Error('Fixture client cleanup failed');
  const left=await service.from('mini_crm_observation_history').select('id').in('contact_id',f.contacts);if(left.error||left.data.length)throw Error('Fixture history cleanup failed');
  await unlink(fixtureFile);
 }
}

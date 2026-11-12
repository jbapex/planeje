// Only disposable CS fixtures. Credentials and sessions remain on its isolated network.
import {readFile,writeFile} from 'node:fs/promises';import {createRequire} from 'node:module';import {randomUUID} from 'node:crypto';
import {saveContactName} from '../../src/lib/leadIdentity.js';
const require=createRequire('/opt/planeje-staging/source/node_modules/.lead-name.cjs');const {createClient}=require('@supabase/supabase-js');
const keys=JSON.parse(await readFile('/opt/planeje-cs-integration/keys.json','utf8')),accounts=JSON.parse(await readFile('/opt/planeje-cs-integration/test-access.json','utf8'));
const transport=(url,options)=>{const u=new URL(String(url));if(u.pathname.startsWith('/auth/v1/'))return fetch('http://planeje-cs-auth:9999'+u.pathname.slice(8)+u.search,options);if(u.pathname.startsWith('/rest/v1/'))return fetch('http://planeje-cs-rest:3000'+u.pathname.slice(8)+u.search,options);throw Error('External transport rejected');};
const client=(key)=>createClient('http://lead-name-fixture.invalid',key,{global:{fetch:transport},auth:{persistSession:false,autoRefreshToken:false}}),service=client(keys.service),clients=[randomUUID(),randomUUID()],id=randomUUID(),otherId=randomUUID(),users=[],sessions=[],checks=[];
const check=(name,ok)=>{if(!ok)throw Error('CHECK FAILED: '+name);checks.push(name)};
const login=async(email,password)=>{const c=client(keys.anon);const r=await c.auth.signInWithPassword({email,password});check('login',!r.error);sessions.push(c);return c;};
try{
 check('clients_seed',!(await service.from('clientes').insert(clients.map((id,i)=>({id,empresa:`Cliente FICTÍCIO nome ${i}`})))).error);
 const mini={status:'Agendado',data_agendamento:'2026-11-13',data_agendamento_hora:'15:00',observacao:'Preservar',_planeje_message_status:{manual:false,lastStatus:'Agendado',lastMessageId:'fixture'}};
 const original={id,cliente_id:clients[0],sender_name:'Nome original',phone:'5511000000001',from_jid:'fixture-'+id+'@s.whatsapp.net',mini_crm:mini,origin_source:'site',utm_source:'Linktree',tracking_data:{planeje_link_id:'fixture-link'}};
 check('contacts_seed',!(await service.from('cliente_whatsapp_contact').insert([original,{...original,id:otherId,cliente_id:clients[1],from_jid:'other-'+id+'@s.whatsapp.net'}])).error);
 const email=`rename-${randomUUID()}@example.invalid`,password=randomUUID();const seed=await service.auth.admin.createUser({email,password,email_confirm:true,app_metadata:{planeje_provisioning_role:'cliente'}});check('auth_seed',!seed.error);users.push(seed.data.user.id);
 check('customer_profile',!(await service.from('profiles').update({role:'cliente',status:'pending',cliente_id:clients[0]}).eq('id',seed.data.user.id)).error);
 const customer=await login(email,password),owner=await login(accounts.owner.email,accounts.owner.password);
 let renamed=await saveContactName(customer,{clienteId:clients[0],contactId:id,name:' Maria   Oliveira '});check('customer_can_rename',renamed.sender_name==='Maria Oliveira'&&renamed.mini_crm.contato_nome==='Maria Oliveira');
 let r=await service.from('cliente_whatsapp_contact').select('*').eq('id',id).single();check('status_and_date_preserved',r.data.mini_crm.status===mini.status&&r.data.mini_crm.data_agendamento===mini.data_agendamento&&r.data.mini_crm.data_agendamento_hora==='15:00');check('automation_not_paused',r.data.mini_crm._planeje_message_status.manual===false);check('notes_preserved',r.data.mini_crm.observacao==='Preservar');check('phone_and_routing_preserved',r.data.phone===original.phone&&r.data.from_jid===original.from_jid);check('utm_and_attribution_preserved',r.data.utm_source==='Linktree'&&r.data.tracking_data.planeje_link_id==='fixture-link');check('no_commercial_change',!r.data.qualificado&&!r.data.comprou&&!r.data.valor_venda);
 let denied=false;try{await saveContactName(customer,{clienteId:clients[1],contactId:otherId,name:'Não permitido'})}catch{denied=true}check('other_client_denied',denied);
 denied=false;try{await saveContactName(customer,{clienteId:clients[0],contactId:otherId,name:'Não permitido'})}catch{denied=true}check('mismatched_contact_denied',denied);
 renamed=await saveContactName(owner,{clienteId:clients[0],contactId:id,name:'Maria Oliveira Revisada'});check('owner_can_rename',renamed.sender_name==='Maria Oliveira Revisada');
 check('empty_mini_seed',!(await service.from('cliente_whatsapp_contact').update({mini_crm:{}}).eq('id',otherId)).error);
 renamed=await saveContactName(owner,{clienteId:clients[1],contactId:otherId,name:'Outro nome'});check('empty_mini_supported',renamed.mini_crm.contato_nome==='Outro nome');
 await writeFile('/task/api-verification.json',JSON.stringify({passed:checks.length,checks,production_writes:0,external_messages:0},null,2));console.log(JSON.stringify({passed:checks.length,production_writes:0,external_messages:0}));
}finally{for(const c of sessions)await c.auth.signOut({scope:'local'});await service.from('cliente_whatsapp_contact').delete().in('id',[id,otherId]);for(const u of users)await service.auth.admin.deleteUser(u);const q=await service.from('clientes').delete().in('id',clients);if(q.error)throw Error('Fixture cleanup failed');}

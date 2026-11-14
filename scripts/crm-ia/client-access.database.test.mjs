import assert from 'node:assert/strict';
import { execFile, spawn, spawnSync } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
const work=mkdtempSync('/tmp/crm-client-access-'),data=join(work,'data');
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const context=Object.fromEntries(['admin','staff','other','client','foreign','channel','hiddenChannel','contact'].map((name,i)=>[name,id([1,2,3,11,12,21,22,31][i])]));
const {admin,staff,other,client,foreign,channel,contact}=context, customer=id(4), disabled=id(5), second=id(6), foreignChannel=id(23);
const env={PATH:process.env.PATH,LC_ALL:'C'};
function run(binary,args,input){const result=spawnSync(binary,args,{env,input,encoding:'utf8',timeout:25000});if(result.status!==0)throw Error(result.stderr||result.error?.message);return result.stdout.trim();}
const dbArgs=['-X','-Aqt','-v','ON_ERROR_STOP=1','-h',work,'-p','55731','-U','client_access_qa','-d','postgres'];
const sql=source=>run('psql',dbArgs,source);
const migration=name=>readFileSync(new URL(`../../supabase/migrations/${name}`,import.meta.url),'utf8');
const quote=value=>`'${JSON.stringify(value).replaceAll("'","''")}'::jsonb`;
const call=(action,payload={},actor=admin,target=client)=>JSON.parse(sql(`BEGIN;SET LOCAL ROLE authenticated;SET LOCAL test.uid='${actor}';SELECT public.crm_ia_workspace('${action}',${target?`'${target}'`:'NULL'},${quote(payload)});COMMIT;`));
const access=(action,payload={},target=client,actor=admin)=>JSON.parse(sql(`BEGIN;SET LOCAL ROLE authenticated;SET LOCAL test.uid='${actor}';SELECT public.crm_ia_access_admin('${action}','${target}',${quote(payload)});COMMIT;`));

test('CRM IA requires explicit account and individual access without changing identity or canonical channels',async t=>{
 let started=false;
 try{
  run('initdb',['-D',data,'-U','client_access_qa','--auth-local=trust','--auth-host=reject','--no-locale','--encoding=UTF8']);
  run('pg_ctl',['-D',data,'-l',join(work,'postgres.log'),'-o',`-k ${work} -p 55731 -c listen_addresses='' -c unix_socket_permissions=0700`,'-w','start']);started=true;
  assert.equal(sql('SHOW listen_addresses'),'');
    const bootstrap = readFileSync(new URL('./workspace.database.test.mjs', import.meta.url), 'utf8').split('    sql(`')[1].split('    `);')[0].replace(/\$\{(\w+)\}/g, (_, name) => context[name]);
    sql(bootstrap.replace(/      CREATE TABLE public\.crm_ia_outbox\([^\n]+\n/, ''));
    sql(`CREATE SCHEMA planeje_private;CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid);
      CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT jsonb_build_object('sub',auth.uid())$$;
      ALTER TABLE public.profiles ADD COLUMN avatar_url text;
      ALTER TABLE public.cliente_whatsapp_contact ADD COLUMN last_message_at timestamptz,ADD COLUMN origin_source text DEFAULT 'nao_identificado',ADD COLUMN qualificado boolean,ADD COLUMN profile_pic_url text,ADD UNIQUE(cliente_id,from_jid);
      ALTER TABLE public.cliente_whatsapp_inbox ADD UNIQUE(cliente_id,message_id);
      ALTER TABLE public.cliente_whatsapp_sent ADD COLUMN sent_by uuid;
      ALTER TABLE public.leads ADD COLUMN qualificado boolean;ALTER TABLE public.cliente_atend_conversas ADD COLUMN ia_followup_passo integer DEFAULT 0;
      CREATE TABLE public.atendimento_usuario_acesso(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cliente_id uuid,user_id uuid,whatsapp_config_id uuid);
      CREATE TABLE public.atendimento_conversas(id uuid PRIMARY KEY,cliente_id uuid,whatsapp_config_id uuid,chat_jid text,archived_at timestamptz,bloqueada boolean DEFAULT false);
      ALTER TABLE public.cliente_whatsapp_inbox ADD COLUMN conversation_id uuid REFERENCES public.atendimento_conversas(id);
      CREATE TABLE public.atendimento_conversa_planejamento(id uuid PRIMARY KEY,cliente_id uuid,conversation_id uuid,whatsapp_config_id uuid,chat_jid text,kind text,body text,status text,scheduled_at timestamptz,completed_at timestamptz,error_message text,updated_at timestamptz DEFAULT now());
      INSERT INTO public.client_module_permissions(cliente_id,module_name,is_enabled) VALUES('${client}','atendimento_loja',true),('${foreign}','atendimento_loja',true);
      GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
      CREATE FUNCTION public.cliente_atend_is_admin(uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role='admin' AND status='active')$$;
      CREATE FUNCTION public.cliente_atend_is_superadmin() RETURNS boolean LANGUAGE sql STABLE AS $$SELECT false$$;
      GRANT ALL ON public.cliente_atend_ia_bases TO authenticated,service_role;
      ALTER TABLE public.cliente_atend_ia_bases ENABLE ROW LEVEL SECURITY;`);
    sql(migration('20260929040000_cliente_atend_ia.sql').match(/create policy cliente_atend_ia_bases_admin\b[\s\S]*?;/i)[0]);
    sql(migration('20260928230000_cliente_atend_inbox.sql').match(/create or replace function public\.cliente_atend_touch_updated_at\([\s\S]*?\$\$;/i)[0]);
    sql('CREATE TRIGGER cliente_atend_ia_bases_touch BEFORE UPDATE ON public.cliente_atend_ia_bases FOR EACH ROW EXECUTE FUNCTION public.cliente_atend_touch_updated_at()');
    sql('CREATE TRIGGER cliente_atend_conversas_touch BEFORE UPDATE ON public.cliente_atend_conversas FOR EACH ROW EXECUTE FUNCTION public.cliente_atend_touch_updated_at()');
    sql(migration('20260702120000_atendimento_send_requires_channel_access.sql'));
    sql(migration('20261006140000_atendimento_loja_modulo.sql').match(/create or replace function public\.cliente_atend_loja_habilitada\([\s\S]*?\$\$;/i)[0]);
    sql(`ALTER TABLE public.profiles ADD COLUMN allowed_pages jsonb;
      ALTER TABLE public.client_module_permissions ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
      CREATE TABLE auth.users(id uuid PRIMARY KEY,email text);
      CREATE TABLE public.cliente_atend_membros(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cliente_id uuid,user_id uuid,nivel text,ativo boolean DEFAULT true,setor_ids uuid[] DEFAULT '{}',nome text,email text,created_by uuid,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now(),UNIQUE(cliente_id,user_id));
      CREATE TABLE public.cliente_atend_setores(id uuid PRIMARY KEY,cliente_id uuid,nome text);
      UPDATE public.profiles SET role='superadmin' WHERE id='${admin}';
      INSERT INTO public.profiles(id,role,status,full_name,cliente_id) VALUES('${customer}','cliente','active','Pessoa A','${client}'),('${disabled}','cliente','inactive','Inativa A','${client}'),('${second}','cliente','active','Pessoa B','${foreign}');
      INSERT INTO auth.users VALUES('${customer}','a@fixture.invalid'),('${second}','b@fixture.invalid');
      INSERT INTO public.cliente_whatsapp_config(id,cliente_id,name,provider,instance_status) VALUES('${foreignChannel}','${foreign}','Canal B','uazapi','connected');`);
    for(const name of ['cliente_atend_nivel_de','cliente_atend_pode_ver_contato_de']){
      sql(migration('20260928230000_cliente_atend_inbox.sql').match(new RegExp(`create or replace function public\\.${name}\\([\\s\\S]*?\\$\\$;`,'i'))[0]);
    }
    sql(migration('20260929010000_cliente_atend_niveis.sql').match(/create or replace function public\.cliente_atend_membros_sync_pages\([\s\S]*?\$\$;/i)[0]);
    sql('CREATE TRIGGER cliente_atend_membros_sync_pages_trg AFTER INSERT OR UPDATE ON public.cliente_atend_membros FOR EACH ROW EXECUTE FUNCTION public.cliente_atend_membros_sync_pages()');
    for(const file of readdirSync(new URL('../../supabase/migrations/',import.meta.url)).filter(name=>/^\d+_crm_ia_/.test(name)).sort())sql(migration(file));
    await t.test('default denied even with an existing CRM configuration',()=>{
      assert.equal(call('bootstrap',{},admin,null).clients.length,0);
      assert.throws(()=>call('workspace'),/acesso|habilitad/i);
    });
    await t.test('only agency superadmin explicitly enables one account, keeping autonomy off',()=>{
      assert.throws(()=>access('set_enabled',{enabled:true},client,staff),/acesso|admin/i);
      const before=access('status');
      const enabled=access('set_enabled',{enabled:true,expected_updated_at:before.updated_at});
      assert.equal(enabled.enabled,true);
      assert.deepEqual(call('bootstrap',{},admin,null).clients.map(row=>row.id),[client]);
      assert.equal(call('workspace').config.data.attendance.auto_send,false);
      assert.equal(sql(`SELECT count(*) FROM public.cliente_whatsapp_config WHERE cliente_id='${client}'`),'2','no new connection');
      assert.throws(()=>access('set_enabled',{enabled:false,expected_updated_at:before.updated_at}),/versão|alterad/i);
    });
    await t.test('page null, missing/inactive member and inactive profile never imply CRM access',()=>{
      for(const person of [other,customer,disabled,second])assert.throws(()=>call('workspace',{},person),/acesso/i);
      const current=access('status');
      const saved=access('save_member',{user_id:customer,nivel:'atendente',allowed_pages:['crm-ia'],expected_revision:current.members.find(row=>row.user_id===customer).revision});
      assert.equal(saved.members.find(row=>row.user_id===customer).nivel,'atendente');
      assert.equal(sql(`SELECT role||':'||cliente_id::text FROM public.profiles WHERE id='${customer}'`),`cliente:${client}`);
      assert.equal(call('workspace',{},customer).client.id,client);
      assert.throws(()=>call('workspace',{},customer,foreign),/acesso/i);
      assert.throws(()=>call('messages',{contact_id:contact,channel_id:foreignChannel},customer),/acesso|canal/i);
      const workspace=call('workspace',{},customer);
      assert.deepEqual(workspace.people.map(row=>row.id),[customer]);
      assert.equal(workspace.permissions.operate,true);assert.equal(workspace.permissions.manage,false);
      assert.deepEqual(workspace.agents,[]);assert.deepEqual(workspace.bases,[]);assert.deepEqual(workspace.templates,[]);
      assert.throws(()=>call('save_config',{section:'attendance',data:{auto_send:true}},customer),/gestão|acesso/i);
      sql(`UPDATE public.profiles SET allowed_pages=NULL WHERE id='${customer}'`);
      assert.throws(()=>call('workspace',{},customer),/acesso/i);
      sql(`UPDATE public.profiles SET allowed_pages='["crm-ia"]' WHERE id='${customer}';UPDATE public.cliente_atend_membros SET ativo=false WHERE user_id='${customer}'`);
      assert.throws(()=>call('workspace',{},customer),/acesso/i);
    });
    await t.test('customer operations keep canonical tenant, owner, sector and private checks',()=>{
      const state=access('status');
      access('save_member',{user_id:customer,nivel:'atendente',allowed_pages:['crm-ia'],expected_revision:state.members.find(row=>row.user_id===customer).revision});
      const lead=call('save_lead',{nome:'Lead A',whatsapp:'551199990001'},customer);
      assert.equal(lead.cliente_id,client);assert.equal(lead.responsavel_id,customer);
      assert.throws(()=>call('save_lead',{id:lead.id,nome:lead.nome,whatsapp:lead.whatsapp,expected_updated_at:lead.updated_at,responsavel_id:second},customer),/responsável|acesso/i);
      sql(`INSERT INTO public.cliente_atend_conversas(cliente_id,contact_id,assigned_to,privado) VALUES('${client}','${contact}','${staff}',true)`);
      assert.throws(()=>call('messages',{contact_id:contact,channel_id:channel},customer),/acesso/i);
      assert.equal(call('conversations',{},customer).rows.length,0);
      sql(`UPDATE public.cliente_atend_conversas SET assigned_to='${customer}' WHERE contact_id='${contact}'`);
      assert.equal(call('messages',{contact_id:contact,channel_id:channel},customer).rows.length,1);
      const supervisor=access('status');
      access('save_member',{user_id:customer,nivel:'admin',allowed_pages:['crm-ia'],expected_revision:supervisor.members.find(row=>row.user_id===customer).revision});
      assert.throws(()=>call('save_pipeline',{nome:'Escalada global'},customer),/gestão|acesso/i);
    });
    await t.test('conflicting owner aliases cannot transfer an attendant lead',()=>{
      let state=access('status');access('save_member',{user_id:other,nivel:'admin',allowed_pages:['crm-ia'],expected_revision:state.members.find(row=>row.user_id===other).revision});
      state=access('status');access('save_member',{user_id:customer,nivel:'atendente',allowed_pages:['crm-ia'],expected_revision:state.members.find(row=>row.user_id===customer).revision});
      const lead=call('leads',{search:'Lead A'},customer).rows[0];
      try{assert.throws(()=>call('save_lead',{id:lead.id,expected_updated_at:lead.updated_at,owner_id:customer,responsavel_id:other},customer),/responsável|conflit|transfer/i);}
      finally{sql(`UPDATE public.leads SET responsavel_id='${customer}' WHERE id='${lead.id}'`);const after=access('status');access('save_member',{user_id:customer,nivel:'admin',allowed_pages:['crm-ia'],expected_revision:after.members.find(row=>row.user_id===customer).revision});}
    });
    await t.test('conflicting owner aliases cannot escape the customer roster',()=>{
      const lead=call('leads',{search:'Lead A'},customer).rows[0];
      try{assert.throws(()=>call('save_lead',{id:lead.id,expected_updated_at:lead.updated_at,owner_id:customer,responsavel_id:admin},customer),/responsável|conflit|acesso/i);}
      finally{sql(`UPDATE public.leads SET responsavel_id='${customer}' WHERE id='${lead.id}'`);}
    });
    await t.test('own canonical delivery can start, while a later revocation preserves an already started receipt',()=>{
      const queued=call('schedule_message',{contact_id:contact,channel_id:channel,body:'Transporte somente em fixture',scheduled_at:new Date(Date.now()+60000).toISOString(),request_id:id(501)},customer);
      const claims=JSON.parse(sql(`SET ROLE service_role;SELECT public.crm_ia_delivery_claim(clock_timestamp()+interval '2 minutes',ARRAY['${queued.id}']::uuid[])`));
      assert.equal(claims.length,1);
      const gate=JSON.parse(sql(`SET ROLE service_role;SELECT public.crm_ia_delivery_recheck('${queued.id}','${claims[0].claim_token}')`));
      assert.equal(gate.allowed,true);assert.equal(gate.whatsapp_config_id,channel);assert.equal(gate.cliente_id,client);
      assert.equal(sql(`SET ROLE service_role;SELECT public.crm_ia_delivery_start('outbox','${queued.id}','${claims[0].claim_token}')`),'t');
      const state=access('status');access('set_enabled',{enabled:false,expected_updated_at:state.updated_at});
      assert.equal(sql(`SELECT status FROM public.crm_ia_outbox WHERE id='${queued.id}'`),'sending');
      sql(`SET ROLE service_role;SELECT public.crm_ia_delivery_finish('${queued.id}','${claims[0].claim_token}','sent','fixture-receipt',NULL)`);
      assert.equal(sql(`SELECT status||':'||provider_message_id FROM public.crm_ia_outbox WHERE id='${queued.id}'`),'sent:fixture-receipt');
      const off=access('status');access('set_enabled',{enabled:true,expected_updated_at:off.updated_at});
    });
    await t.test('agency configures a local member calendar and the customer books and cancels within that account',()=>{
      const date=new Date(Date.now()+2*86400000).toISOString().slice(0,10);
      const cfg=call('workspace').config;
      call('save_config',{section:'availability',revision:cfg.revision,data:{timezone:'America/Sao_Paulo',duration_minutes:30,interval_minutes:30,min_notice_hours:0,horizon_days:60,max_per_day:10,
        windows:[{owner_id:customer,days:[0,1,2,3,4,5,6],start:'09:00',end:'17:00'}]}});
      const slots=call('slots',{owner_id:customer,date},customer).rows;
      assert.ok(slots.length>0);
      const linked=call('save_lead',{nome:'Contato com agenda',whatsapp:'551199999999'},customer);
      assert.equal(sql(`SELECT private.crm_ia_appointment_actor('${client}','${channel}','${contact}','${linked.id}','${customer}')`),'t');
      const appointment=call('save_appointment',{owner_id:customer,lead_id:linked.id,contact_id:contact,...slots[0],title:'Somente fixture',request_id:id(502)},customer);
      assert.equal(appointment.owner_id,customer);assert.equal(appointment.cliente_id,client);
      call('cancel_appointment',{id:appointment.id,expected_updated_at:appointment.updated_at},customer);
      assert.equal(sql(`SELECT status FROM public.crm_ia_appointments WHERE id='${appointment.id}'`),'cancelled');
    });
    await t.test('role demotion while waiting for a CRM lock sanitizes the response using the new role',async()=>{
      sql(`UPDATE public.profiles SET role='admin',allowed_pages='["crm-ia"]',cliente_id='${client}' WHERE id='${staff}';
        INSERT INTO public.cliente_atend_membros(cliente_id,user_id,nivel,ativo) VALUES('${client}','${staff}','admin',true);
        UPDATE public.crm_ia_config SET data=data||'{"knowledge":{"canary":"PRIVATE_CONFIGURATION"}}' WHERE cliente_id='${client}'`);
      const holder=spawn('psql',dbArgs,{env,stdio:['pipe','pipe','pipe']});
      try{
        await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('fixture lock timeout')),5000);holder.once('error',reject);holder.stdout.on('data',chunk=>{if(chunk.toString().includes('ACCESS_READY')){clearTimeout(timer);resolve();}});holder.stdin.write(`BEGIN;SELECT pg_advisory_xact_lock(hashtextextended('crm-ia:${client}',0));\n\\echo ACCESS_READY\n`);});
        const pending=promisify(execFile)('psql',[...dbArgs,'-c',`BEGIN;SET LOCAL ROLE authenticated;SET LOCAL test.uid='${staff}';SET LOCAL application_name='crm-access-race';SELECT public.crm_ia_workspace('workspace','${client}','{}');COMMIT;`],{env,encoding:'utf8',timeout:10000});
        let waiting=false;
        for(let attempt=0;attempt<100;attempt++){if(sql("SELECT count(*) FROM pg_stat_activity WHERE application_name='crm-access-race' AND wait_event_type='Lock'")==='1'){waiting=true;break;}await new Promise(resolve=>setTimeout(resolve,20));}
        assert.equal(waiting,true,'fixture request must actually wait behind the lock');
        sql(`UPDATE public.profiles SET role='cliente' WHERE id='${staff}'`);
        holder.stdin.end('COMMIT;\n\\q\n');
        const result=JSON.parse((await pending).stdout.trim());
        assert.equal(result.permissions.customer,true);assert.equal(result.permissions.configure,false);
        assert.equal(result.people.some(row=>row.id===admin),false);assert.equal(JSON.stringify(result).includes('PRIVATE_CONFIGURATION'),false);
      }finally{if(holder.exitCode===null)holder.kill('SIGTERM');sql(`UPDATE public.profiles SET role='colaborador',cliente_id=NULL,allowed_pages=NULL WHERE id='${staff}'`);}
    });
    await t.test('runtime authorizes explicit members and rechecks entitlement before cost or transport',()=>{
      const runtime=()=>JSON.parse(sql(`SET ROLE service_role;SELECT public.crm_ia_runtime_access('${client}','${customer}','sugerir','${contact}','${channel}')`));
      assert.equal(runtime().allowed,true);
      sql(`INSERT INTO public.crm_ia_outbox(cliente_id,whatsapp_config_id,contact_id,kind,body,scheduled_at,created_by,request_id) VALUES('${client}','${channel}','${contact}','manual','Não enviar',clock_timestamp(),'${customer}','${id(500)}')`);
      const state=access('status');access('set_enabled',{enabled:false,expected_updated_at:state.updated_at});
      assert.equal(runtime().allowed,false);
      assert.equal(sql(`SELECT status FROM public.crm_ia_outbox WHERE request_id='${id(500)}'`),'cancelled');
      assert.equal(call('bootstrap',{},admin,null).clients.length,0);
      assert.throws(()=>call('workspace',{},customer),/acesso/i);
      const off=access('status');access('set_enabled',{enabled:true,expected_updated_at:off.updated_at});
      assert.equal(sql(`SELECT status FROM public.crm_ia_outbox WHERE request_id='${id(500)}'`),'cancelled','reactivation never revives old messages');
      sql(`UPDATE public.clientes SET etapa='lost' WHERE id='${client}'`);
      assert.equal(runtime().allowed,true,'commercial stage does not silently revoke an explicit CRM license');
      assert.equal(call('workspace',{},customer).client.id,client);
      assert.equal(sql(`SELECT etapa FROM public.clientes WHERE id='${client}'`),'lost','licensing never changes commercial status');
    });
    await t.test('service authorization is never callable by a customer or anonymous role',()=>{
      for(const role of ['anon','authenticated']){
        assert.equal(sql(`SELECT has_function_privilege('${role}','public.crm_ia_runtime_access(uuid,uuid,text,uuid,uuid)','execute')`),'f');
        assert.equal(sql(`SELECT has_function_privilege('${role}','public.crm_ia_delivery_actor_check(uuid,text)','execute')`),'f');
      }
      assert.equal(sql(`SELECT has_function_privilege('anon','public.crm_ia_access_admin(text,uuid,jsonb)','execute')`),'f');
      assert.equal(sql(`SELECT has_function_privilege('authenticated','private.crm_ia_member(uuid,uuid)','execute')`),'f');
    });
 }finally{if(started)run('pg_ctl',['-D',data,'-m','immediate','-w','stop']);rmSync(work,{recursive:true,force:true});}
});

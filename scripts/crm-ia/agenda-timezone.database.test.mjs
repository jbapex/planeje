import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { readAgendaCalendar } from '../../src/components/crm-ia/crmIaAgendaRead.js';

const work=mkdtempSync('/tmp/crm-agenda-timezone-'), data=join(work,'data');
const env={PATH:process.env.PATH,LC_ALL:'C'};
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const context=Object.fromEntries(['admin','staff','other','client','foreign','channel','hiddenChannel','contact'].map((key,index)=>[key,id([1,2,3,11,12,21,22,31][index])]));
const {admin,staff,client,foreign}=context;
const psql=['-X','-Aqt','-v','ON_ERROR_STOP=1','-h',work,'-p','55724','-U','agenda_timezone_qa','-d','postgres'];
const migration=name=>readFileSync(new URL(`../../supabase/migrations/${name}`,import.meta.url),'utf8');
const target='20261112235345_crm_ia_agenda_default_timezone.sql';
const quote=value=>`'${String(typeof value==='object'?JSON.stringify(value):value).replaceAll("'","''")}'`;
function run(binary,args,input){const r=spawnSync(binary,args,{input,env,encoding:'utf8',timeout:30000});if(r.status!==0)throw Error(r.stderr||r.error?.message);return r.stdout.trim();}
const sql=input=>run('psql',psql,input);
const value=input=>JSON.parse(sql(input));
const substitute=text=>text.replace(/\$\{(\w+)\}/g,(_,key)=>{assert.ok(context[key],key);return context[key];});
const human=(payload,account=client,uid=admin)=>value(`BEGIN;SET LOCAL ROLE authenticated;SET LOCAL test.uid='${uid}';SELECT public.crm_ia_workspace('agenda','${account}',${quote(payload)}::jsonb);COMMIT;`);
const read=(payload,account=client)=>readAgendaCalendar(async(action,input)=>{assert.equal(action,'agenda');return human(input,account);},payload);
const config=data=>sql(`INSERT INTO crm_ia_config(cliente_id,data,updated_by) VALUES('${client}',${quote(data)}::jsonb,'${admin}') ON CONFLICT(cliente_id) DO UPDATE SET data=excluded.data`);
const catalog=()=>value(`SELECT jsonb_object_agg(p.oid::text,jsonb_build_object('metadata',(to_jsonb(p)-'prosrc'-'proargdefaults')||jsonb_build_object('arguments',pg_get_function_arguments(p.oid)),'body',md5(p.prosrc))) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('public','private','planeje_private') AND p.proname LIKE 'crm_ia_%'`);

test('agenda canônica usa o fuso padrão sem exigir cadastro de disponibilidade',async t=>{
  let started=false;
  const fetchBefore=globalThis.fetch;
  globalThis.fetch=()=>{throw Error('Rede externa proibida na fixture de fuso.');};
  try{
    run('initdb',['-D',data,'-U','agenda_timezone_qa','--auth-local=trust','--auth-host=reject','--no-locale','--encoding=UTF8']);
    run('pg_ctl',['-D',data,'-l',join(work,'postgres.log'),'-o',`-k ${work} -p 55724 -c listen_addresses='' -c unix_socket_permissions=0700`,'-w','start']);started=true;
    assert.equal(sql('SHOW listen_addresses'),'');
    const base=readFileSync(new URL('./workspace.database.test.mjs',import.meta.url),'utf8').split('    sql(`')[1].split('    `);')[0];
    sql(substitute(base).replace(/      CREATE TABLE public\.crm_ia_outbox\([^\n]+\n/,''));
    // Reuse the current schema fixture; this test never dispatches or connects a provider.
    const setup=readFileSync(new URL('./concierge.database.test.mjs',import.meta.url),'utf8').split('    sql(`CREATE SCHEMA planeje_private;')[1].split('`);')[0];
    sql(substitute('CREATE SCHEMA planeje_private;'+setup));
    sql(migration('20260929040000_cliente_atend_ia.sql').match(/create policy cliente_atend_ia_bases_admin\b[\s\S]*?;/i)[0]);
    sql(migration('20260928230000_cliente_atend_inbox.sql').match(/create or replace function public\.cliente_atend_touch_updated_at\([\s\S]*?\$\$;/i)[0]);
    sql('CREATE TRIGGER cliente_atend_ia_bases_touch BEFORE UPDATE ON public.cliente_atend_ia_bases FOR EACH ROW EXECUTE FUNCTION public.cliente_atend_touch_updated_at()');
    sql('CREATE TRIGGER cliente_atend_conversas_touch BEFORE UPDATE ON public.cliente_atend_conversas FOR EACH ROW EXECUTE FUNCTION public.cliente_atend_touch_updated_at()');
    sql(migration('20260702120000_atendimento_send_requires_channel_access.sql'));
    sql(migration('20261006140000_atendimento_loja_modulo.sql').match(/create or replace function public\.cliente_atend_loja_habilitada\([\s\S]*?\$\$;/i)[0]);
    const chain=readdirSync(new URL('../../supabase/migrations/',import.meta.url)).filter(name=>/^\d+_crm_ia_/.test(name)&&name<='20261112130634_crm_ia_concierge_capabilities.sql').sort();
    assert.equal(chain.length,23);for(const name of chain)sql(migration(name));
    sql(`INSERT INTO crm_ia_appointments(id,cliente_id,owner_id,start_at,end_at,busy_start_at,busy_end_at,title,request_id,created_by) VALUES
      ('${id(301)}','${client}','${admin}','2026-01-02T01:00Z','2026-01-02T01:30Z','2026-01-02T01:00Z','2026-01-02T01:30Z','Primeiro','${id(401)}','${staff}'),
      ('${id(302)}','${client}','${admin}','2026-01-02T04:00Z','2026-01-02T04:30Z','2026-01-02T04:00Z','2026-01-02T04:30Z','Segundo','${id(402)}','${staff}'),
      ('${id(303)}','${foreign}','${admin}','2026-01-02T01:00Z','2026-01-02T01:30Z','2026-01-02T01:00Z','2026-01-02T01:30Z','Outra conta','${id(403)}','${staff}');`);
    const before=catalog();
    sql('CREATE ROLE agenda_default;ALTER DEFAULT PRIVILEGES GRANT EXECUTE ON FUNCTIONS TO agenda_default,authenticated,service_role');
    sql(migration(target));

    await t.test('sem configuração, o dia civil e a leitura completa incluem só o compromisso correto',async()=>{
      const result=await read({since:'2026-01-01',until:'2026-01-01'});
      assert.equal(result.timezone,'America/Sao_Paulo');assert.equal(result.complete,true);
      assert.deepEqual(result.rows.map(row=>row.id),[id(301)]);assert.equal(result.total,1);
      assert.deepEqual(result.summary,{scheduled:1,confirmed:0,cancelled:0,no_show:0});
      assert.equal(await sql(`SELECT count(*) FROM crm_ia_config WHERE cliente_id='${client}'`),'0');
    });
    await t.test('seção ausente ou fuso nulo usa o mesmo padrão sem alterar a configuração',async()=>{
      for(const data of [{attendance:{auto_send:false}},{availability:{}},{availability:{timezone:null}}]){
        config(data);const result=await read({since:'2026-01-01',until:'2026-01-01'});
        assert.equal(result.timezone,'America/Sao_Paulo');assert.equal(result.total,1);
        assert.deepEqual(value(`SELECT data FROM crm_ia_config WHERE cliente_id='${client}'`),data);
      }
    });
    await t.test('fuso configurado, responsável e resumo antes de paginar permanecem canônicos',async()=>{
      config({availability:{timezone:'America/New_York'}});
      const result=human({since:'2026-01-01',until:'2026-01-01',offset:0,limit:1});
      assert.equal(result.timezone,'America/New_York');assert.equal(result.total,2);assert.equal(result.rows.length,1);assert.equal(result.summary.scheduled,2);
      const empty=await read({since:'2026-01-01',until:'2026-01-01',owner_id:staff});assert.equal(empty.total,0);
    });
    await t.test('isolamento por conta, módulo e período inválido continuam aplicados',async()=>{
      const other=await read({since:'2026-01-01',until:'2026-01-01'},foreign);assert.deepEqual(other.rows.map(row=>row.id),[id(303)]);
      assert.throws(()=>human({since:'2026-01-01',until:'2026-01-01'},foreign,staff),/Sem acesso/);
      assert.throws(()=>human({since:'2026-01-03',until:'2026-01-01'}),/Período inválido/);
      sql("INSERT INTO module_settings(module_name,is_enabled) VALUES('crm',false)");
      assert.throws(()=>human({since:'2026-01-01',until:'2026-01-01'},foreign),/Sem acesso/);
    });
    await t.test('somente um corpo muda, OIDs/ACL/atributos ficam iguais e repetição é recusada',()=>{
      const after=catalog();assert.deepEqual(Object.keys(after),Object.keys(before));
      const changed=Object.keys(after).filter(key=>after[key].body!==before[key].body);assert.equal(changed.length,1);
      for(const key of Object.keys(after))assert.deepEqual(after[key].metadata,before[key].metadata);
      assert.throws(()=>sql(migration(target)),/crm_ia_agenda_timezone_source_changed/);assert.deepEqual(catalog(),after);
    });
  }finally{
    globalThis.fetch=fetchBefore;
    if(started)run('pg_ctl',['-D',data,'-m','immediate','-w','stop']);
    rmSync(work,{recursive:true,force:true});
  }
});

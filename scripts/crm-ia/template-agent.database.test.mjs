import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
const work=mkdtempSync('/tmp/crm-agent-template-'),data=join(work,'data');
const env={PATH:process.env.PATH,LC_ALL:'C'},id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const context=Object.fromEntries(['admin','staff','other','client','foreign','channel','hiddenChannel','contact'].map((key,i)=>[key,id([1,2,3,11,12,21,22,31][i])]));
const {admin,client,foreign,staff}=context;
const quote=value=>value==null?'NULL':typeof value==='boolean'||typeof value==='number'?String(value):`'${String(typeof value==='object'?JSON.stringify(value):value).replaceAll("'","''")}'`;
function run(binary,args,input){const r=spawnSync(binary,args,{input,env,encoding:'utf8',timeout:25000});if(r.status!==0)throw new Error(r.stderr||r.error?.message);return r.stdout.trim();}
const sql=source=>run('psql',['-X','-Aqt','-v','ON_ERROR_STOP=1','-h',work,'-p','55498','-U','template_qa','-d','postgres'],source);
const call=(action,payload={},target=client,actor=admin)=>JSON.parse(sql(`BEGIN;SET LOCAL ROLE authenticated;SET LOCAL test.uid='${actor}';SELECT public.crm_ia_workspace('${action}','${target}',${quote(payload)});COMMIT;`));
const destination=id(82),pipeline=id(41),stage=id(51),base=id(61);
const schedule={title:'Consulta inicial',instructions:'Prepare as dúvidas sobre o atendimento.',location_type:'online',location:'Sala virtual',duration_minutes:45,interval_minutes:60,
 buffer_before:0,buffer_after:10,min_notice_hours:0,max_future_days:120,daily_limit:12,reminders:[{valor:2,unidade:'horas'},{valor:1,unidade:'dias'}]};

test('modelo preserva contrato do agente ao copiar entre clientes, com autonomia e custos desligados',async t=>{
 let started=false;
 try{
  run('initdb',['-D',data,'-U','template_qa','--auth-local=trust','--auth-host=reject','--no-locale','--encoding=UTF8']);
  run('pg_ctl',['-D',data,'-l',join(work,'pg.log'),'-o',`-k ${work} -p 55498 -c listen_addresses='' -c unix_socket_permissions=0700`,'-w','start']);started=true;
  assert.equal(sql('SHOW listen_addresses'),'');
  const fixture=readFileSync(new URL('./workspace.database.test.mjs',import.meta.url),'utf8').split('    sql(`')[1].split('    `);')[0].replace(/\$\{(\w+)\}/g,(_,name)=>context[name]);
  sql(fixture.replace(/      CREATE TABLE public\.crm_ia_outbox\([^\n]+\n/,''));
  sql(`CREATE SCHEMA planeje_private;CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid);
   CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT jsonb_build_object('sub',auth.uid())$$;
   ALTER TABLE cliente_whatsapp_contact ADD COLUMN last_message_at timestamptz,ADD COLUMN origin_source text DEFAULT 'nao_identificado',ADD COLUMN qualificado boolean;
   ALTER TABLE leads ADD COLUMN qualificado boolean;ALTER TABLE cliente_atend_conversas ADD COLUMN ia_followup_passo integer DEFAULT 0;
   CREATE TABLE atendimento_conversas(id uuid PRIMARY KEY,cliente_id uuid,whatsapp_config_id uuid,chat_jid text,archived_at timestamptz,bloqueada boolean DEFAULT false);
   CREATE TABLE atendimento_conversa_planejamento(id uuid PRIMARY KEY,cliente_id uuid,conversation_id uuid,whatsapp_config_id uuid,chat_jid text,kind text,body text,status text,scheduled_at timestamptz,completed_at timestamptz,error_message text,updated_at timestamptz DEFAULT now());
   GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;`);
  for(const file of ['20261111041703_crm_ia_delivery_runtime.sql','20261111041704_crm_ia_workspace.sql','20261111043800_crm_ia_workspace_readings.sql','20261111044652_crm_ia_agent_runtime.sql','20261111062101_crm_ia_calendar.sql','20261111062548_crm_ia_voice.sql','20261111072502_crm_ia_calendar_delivery.sql'])sql(readFileSync(new URL(`../../supabase/migrations/${file}`,import.meta.url),'utf8'));
  sql(`INSERT INTO crm_ia_config(cliente_id,data,updated_by) VALUES('${client}','{"attendance":{"auto_send":true}}','${admin}'),('${foreign}','{"attendance":{"auto_send":false}}','${admin}');
   INSERT INTO crm_pipelines(id,cliente_id,nome) VALUES('${pipeline}','${client}','Origem');INSERT INTO crm_stages(id,pipeline_id,nome) VALUES('${stage}','${pipeline}','Entrada');
   INSERT INTO cliente_atend_ia_bases(id,cliente_id,nome,conteudo,created_by) VALUES('${base}','${client}','Base de origem','Conteúdo de exemplo','${admin}');
   INSERT INTO cliente_atend_ia_agentes(id,cliente_id,nome,funil,created_by) VALUES('${destination}','${client}','Destino de origem','{}','${admin}');`);
  const source=call('save_agent',{nome:'Agenda de exemplo',objetivo:'Conferir preferências',instrucoes:'Faça uma pergunta por vez.',tom:'cordial',modelo:'openai/gpt-4o-mini',base_ids:[base],ativo:true,auto_responder:true,
   funil:{crm_ia:{tipo:'agendamento',pipeline_id:pipeline,stage_ids:[stage],idiomas:['pt-BR','en'],audio:{enabled:true,input_enabled:true,voice:'cedar',speed:1.25},
    variaveis:[{nome:'cidade',pergunta:'Em qual cidade?',owner_id:staff}],gatilhos:['quero um atendente'],janelas:[{dias:[1,2],inicio:'08:00',fim:'18:00',channel_id:context.channel}],
    cadencia:[{valor:2,unidade:'horas',contact_id:context.contact}],destino:{tipo:'agente',agente_id:destination,stage_id:stage,message:'Vou encaminhar para a equipe.'},
    mensagem_fora_horario:'A equipe volta no próximo horário.',desinteresse:'humano',channel_id:context.channel,contact_id:context.contact,
    agendamento:{...schedule,owner_id:staff,calendar_id:'must-not-cross-client',reminders:schedule.reminders.map(row=>({...row,channel_id:context.channel}))}}}});
  const original=sql(`SELECT to_jsonb(a) FROM cliente_atend_ia_agentes a WHERE id='${source.id}'`);
  const originalProof=sql(`SELECT to_jsonb(v) FROM planeje_private.crm_ia_voice_authorizations v WHERE agent_id='${source.id}'`);
  const oid=sql("SELECT 'private.crm_ia_template(text,jsonb)'::regprocedure::oid"),workspaceOid=sql("SELECT 'public.crm_ia_workspace(text,uuid,jsonb)'::regprocedure::oid");
  const legacyId=id(91),legacyData={nome:'Legado',funil:{crm_ia:{tipo:'agendamento',agendamento:{assunto:'Assunto legado',instrucoes:'Instruções legadas',local:'presencial',horizon_days:90,max_per_day:6,interval_minutes:30}}}};
  sql(`INSERT INTO crm_ia_templates(id,owner_id,nome,tipo,data) VALUES('${legacyId}','${admin}','Legado','agent',${quote(legacyData)})`);
  sql(readFileSync(new URL('../../supabase/migrations/20261111075558_crm_ia_agent_template_contract.sql',import.meta.url),'utf8'));
  assert.equal(sql("SELECT 'private.crm_ia_template(text,jsonb)'::regprocedure::oid"),oid);
  assert.equal(sql("SELECT 'public.crm_ia_workspace(text,uuid,jsonb)'::regprocedure::oid"),workspaceOid);
  assert.equal(sql(`SELECT to_jsonb(a) FROM cliente_atend_ia_agentes a WHERE id='${source.id}'`),original,'migration must not rewrite source agents');
  await t.test('exportar e aplicar preserva configurações sem transportar vínculos ou custo',()=>{
   const template=call('save_template',{nome:'Modelo de agenda',nicho:'Serviços',tipo:'agent',data:{...source,whatsapp_config_id:context.channel,owner_id:staff}});
   assert.deepEqual(template.data.funil.crm_ia.agendamento,schedule);
   assert.deepEqual(template.data.funil.crm_ia.variaveis,[{nome:'cidade',pergunta:'Em qual cidade?'}]);
   assert.deepEqual(template.data.funil.crm_ia.janelas,[{dias:[1,2],inicio:'08:00',fim:'18:00'}]);
   assert.deepEqual(template.data.funil.crm_ia.cadencia,[{valor:2,unidade:'horas'}]);
   assert.deepEqual(template.data.funil.crm_ia.destino,{tipo:'humano',message:'Vou encaminhar para a equipe.'});
   assert.equal(template.data.funil.crm_ia.mensagem_fora_horario,source.funil.crm_ia.mensagem_fora_horario);
   assert.equal(template.data.funil.crm_ia.desinteresse,'humano');
   for(const key of [context.channel,context.contact,staff,pipeline,stage,base,destination,'must-not-cross-client'])assert.equal(JSON.stringify(template.data).includes(key),false,key);
   call('apply_template',{id:template.id,revision:template.revision,target_client_id:foreign});
   const copied=JSON.parse(sql(`SELECT to_jsonb(a) FROM cliente_atend_ia_agentes a WHERE cliente_id='${foreign}' AND nome='Agenda de exemplo'`));
   assert.deepEqual(copied.funil.crm_ia.agendamento,schedule);
   assert.equal(copied.ativo,false);assert.equal(copied.auto_responder,false);assert.deepEqual(copied.base_ids,[]);assert.deepEqual(copied.setor_ids,[]);
   assert.equal(copied.funil.crm_ia.pipeline_id,null);assert.deepEqual(copied.funil.crm_ia.stage_ids,[]);
   assert.deepEqual(copied.funil.crm_ia.audio,{enabled:false,input_enabled:false,voice:'cedar',speed:1.25});
   assert.equal(sql(`SELECT count(*) FROM planeje_private.crm_ia_voice_authorizations WHERE agent_id='${copied.id}'`),'0');
   assert.equal(sql(`SELECT data#>>'{attendance,auto_send}' FROM crm_ia_config WHERE cliente_id='${foreign}'`),'false');
   assert.equal(sql(`SELECT to_jsonb(a) FROM cliente_atend_ia_agentes a WHERE id='${source.id}'`),original,'copy must not change source');
   assert.equal(sql(`SELECT to_jsonb(v) FROM planeje_private.crm_ia_voice_authorizations v WHERE agent_id='${source.id}'`),originalProof);
   assert.throws(()=>call('apply_template',{id:template.id,revision:id(999),target_client_id:foreign}),/alterad|indispon/i);
   assert.throws(()=>call('apply_template',{id:template.id,revision:template.revision,target_client_id:foreign},client,staff),/gestão|acesso/i);
  });
  await t.test('intervalo zero/negativo e overrides fora do contrato são recusados antes de salvar',()=>{
   for(const patch of [{interval_minutes:0},{interval_minutes:-1},{duration_minutes:0},{buffer_before:-1},{buffer_after:241},{min_notice_hours:-1},{max_future_days:367},{daily_limit:201},{location_type:'inventado'},{reminders:[{valor:0,unidade:'horas'}]}]){
    const current=JSON.parse(sql(`SELECT to_jsonb(a) FROM cliente_atend_ia_agentes a WHERE id='${source.id}'`));
    assert.throws(()=>call('save_agent',{id:source.id,expected_updated_at:current.updated_at,funil:{crm_ia:{...current.funil.crm_ia,agendamento:{...schedule,...patch}}}}),/agendamento|disponibilidade|interval|agenda/i,JSON.stringify(patch));
   }
   const targetAgent=JSON.parse(sql(`SELECT to_jsonb(a) FROM cliente_atend_ia_agentes a WHERE cliente_id='${foreign}' ORDER BY created_at LIMIT 1`));
   const updated=call('save_agent',{id:targetAgent.id,expected_updated_at:targetAgent.updated_at,funil:{crm_ia:{...targetAgent.funil.crm_ia,agendamento:{...schedule,buffer_before:0,min_notice_hours:0,reminders:[]}}}},foreign);
   assert.deepEqual(updated.funil.crm_ia.agendamento,{...schedule,buffer_before:0,min_notice_hours:0,reminders:[]});
  });
  await t.test('legado é normalizado só na cópia, preservando limpeza explícita e outros tipos',()=>{
   const legacy=JSON.parse(sql(`SELECT to_jsonb(t) FROM crm_ia_templates t WHERE id='${legacyId}'`));
   call('apply_template',{id:legacyId,revision:legacy.revision,target_client_id:foreign});
   const copied=JSON.parse(sql(`SELECT funil#>'{crm_ia,agendamento}' FROM cliente_atend_ia_agentes WHERE cliente_id='${foreign}' AND nome='Legado'`));
   assert.deepEqual(copied,{title:'Assunto legado',instructions:'Instruções legadas',location_type:'presencial',max_future_days:90,daily_limit:6,interval_minutes:30});
   assert.deepEqual(JSON.parse(sql(`SELECT data FROM crm_ia_templates WHERE id='${legacyId}'`)),legacyData);
   const cleared=call('save_template',{nome:'Limpeza explícita',tipo:'agent',data:{nome:'Limpo',funil:{crm_ia:{tipo:'agendamento',agendamento:{assunto:'Não ressuscitar',title:'',instructions:'',local:'online',location_type:'',min_notice_hours:0,buffer_before:0,horizon_days:90,max_future_days:null,reminders:[]}}}}});
   assert.deepEqual(cleared.data.funil.crm_ia.agendamento,{title:'',instructions:'',location_type:'',min_notice_hours:0,buffer_before:0,max_future_days:null,reminders:[]});
   const baseTemplate=call('save_template',{nome:'Base genérica',tipo:'base',data:{nome:'Conteúdo',conteudo:'Texto de referência',contact_id:context.contact}});
   assert.deepEqual(baseTemplate.data,{nome:'Conteúdo',conteudo:'Texto de referência'});
   const pipelineTemplate=call('save_template',{nome:'Funil genérico',tipo:'pipeline',data:{nome:'Modelo',stages:[{id:stage,pipeline_id:pipeline,nome:'Entrada',color:'#123456',tipo:'intermediaria',icon:'star'}]}});
   assert.deepEqual(pipelineTemplate.data,{nome:'Modelo',stages:[{nome:'Entrada',color:'#123456',tipo:'intermediaria',ordem:0,icon:'star'}]});
  });
  assert.equal(sql("SELECT has_function_privilege('authenticated','private.crm_ia_template(text,jsonb)','execute')"),'f');
 }finally{if(started)run('pg_ctl',['-D',data,'-m','immediate','-w','stop']);rmSync(work,{recursive:true,force:true});}
});

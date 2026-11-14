import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync,readFileSync,readdirSync,rmSync } from 'node:fs';
import { join } from 'node:path';
import { id,literal,json } from './database-fixture.mjs';
export { id,json } from './database-fixture.mjs';
export const nativeIds = Object.fromEntries(Object.entries({ owner:1,collaborator:2,anotherAdmin:3,client:11,tenant:12,group:13,channel:14,otherChannel:15,secondGroup:16,session:91,otherSession:92 }).map(([key,value]) => [key,id(value)]));
const migrations = new URL('../../supabase/migrations/',import.meta.url);
const file = name => readFileSync(new URL(name,migrations),'utf8');
function definition(source,name) {
  const start = source.toLowerCase().search(new RegExp(`create(?: or replace)? function ${name.replaceAll('.','\\.')}\\(`,'i'));
  const end = source.indexOf('$$;',start);assert.ok(start >= 0 && end > start,name);return source.slice(start,end + 3);
}
function table(source,name) {
  const start = source.indexOf(`CREATE TABLE public.${name} (`),end = source.indexOf('\n);',start);
  assert.ok(start >= 0 && end > start,name);return source.slice(start,end + 3);
}

/** Native CS functions and triggers; only existing reading harness auth/channel boundaries are fixtures. */
export function squadNativeDatabaseFixture() {
  const work = mkdtempSync('/tmp/atlas-squad-native-db-'),dir = join(work,'data'),env = { PATH:process.env.PATH,LC_ALL:'C' };
  const psql = ['-X','-Aqt','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose','-h',work,'-p','55538','-U','atlas_squad_native_qa','-d','postgres'];
  let started = false,sequence = 8000;
  const run = (binary,args,input) => { const r = spawnSync(binary,args,{ input,env,encoding:'utf8',timeout:25000 });if (r.error || r.status) throw Error(r.stderr || r.error?.message);return r.stdout.trim(); };
  const sql = input => run('psql',psql,input);
  const userSql = (statement,{ actor = nativeIds.owner,session = nativeIds.session } = {}) => `BEGIN;SET LOCAL ROLE authenticated;SET LOCAL test.uid=${literal(actor)};SET LOCAL request.jwt.claims=${literal(JSON.stringify({ role:'authenticated',sub:actor,session_id:session }))};${statement};COMMIT;`;
  const user = (statement,options) => sql(userSql(statement,options));
  const snapshot = (group = nativeIds.group) => JSON.parse(user(`SELECT public.atlas_executor_cs_reading_snapshot('${nativeIds.client}',${literal(group)}::uuid)`));
  const reading = () => JSON.parse(user(`SELECT public.cs_ia_get_reading('${nativeIds.client}')`));
  function store(action,payload,before = null) {
    const conversation = id(++sequence),runId = id(++sequence);
    sql(`INSERT INTO public.atlas_conversations(id,owner_id,client_id,title) VALUES('${conversation}','${nativeIds.owner}','${nativeIds.client}','CS nativo fictício');
      INSERT INTO public.atlas_runs(id,owner_id,request_id,conversation_id,request_conversation_id,request_client_id,request_message,status,source_session_id)
      VALUES('${runId}','${nativeIds.owner}','${id(++sequence)}','${conversation}','${conversation}','${nativeIds.client}','[Executor Planeje] CS nativo fictício','processing','${nativeIds.session}')`);
    return JSON.parse(user(`SELECT public.atlas_executor_store('${runId}','${id(++sequence)}',${json({ kind:'proposal',app:'cs',action,title:'Alteração fictícia de CS',payload,before,preview:{},effect:{},links:[] })})`));
  }
  const decisionStatement = (item,decision = 'approve') => `SELECT public.atlas_executor_decide('${item.id}',${item.revision},${literal(decision)})`;
  const decide = (item,decision,options) => JSON.parse(user(decisionStatement(item,decision),options));
  function start() {
    run('initdb',['-D',dir,'-U','atlas_squad_native_qa','--auth-local=trust','--auth-host=reject','--no-locale','--encoding=UTF8']);
    run('pg_ctl',['-D',dir,'-l',join(work,'postgres.log'),'-o',`-k ${work} -p 55538 -c listen_addresses='' -c unix_socket_permissions=0700`,'-w','start']);started = true;
    assert.equal(sql('SHOW listen_addresses'),'');
    const readingTest = readFileSync(new URL('../cs-ia/reading.database.test.mjs',import.meta.url),'utf8');
    const start = readingTest.indexOf('  sql(`\n    CREATE ROLE') + '  sql(`'.length,end = readingTest.indexOf('\n  `);',start);
    assert.ok(start > 0 && end > start);
    const bootstrap = readingTest.slice(start,end).replace(/\$\{([^}]+)\}/g,(_,key) => key.startsWith('id(') ? id(Number(key.slice(3,-1))) : key === 'teamSender' ? '5511900000101@s.whatsapp.net' : (assert.ok(nativeIds[key],key),nativeIds[key]));
    sql(bootstrap);
    sql(`CREATE SCHEMA planeje_private;CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid,not_after timestamptz);
      ALTER TABLE public.profiles ADD COLUMN cliente_id uuid;
      INSERT INTO auth.sessions VALUES('${nativeIds.session}','${nativeIds.owner}',NULL),('${nativeIds.otherSession}','${nativeIds.collaborator}',NULL);
      CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
      CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$SELECT auth.jwt()->>'role'$$;
      INSERT INTO public.module_settings VALUES('assistant',true),('clients',true),('atendimento',true),('tasks',true);
      CREATE TABLE public.cliente_whatsapp_config(id uuid PRIMARY KEY,cliente_id uuid,provider text,name text,archived_at timestamptz);
      INSERT INTO public.cliente_whatsapp_config VALUES('${nativeIds.channel}','${nativeIds.tenant}','uazapi','Canal fictício',NULL),('${nativeIds.otherChannel}','${nativeIds.tenant}','uazapi','Outro canal',NULL);
      CREATE FUNCTION public.atendimento_user_can_access_atendimento_scope(p_client uuid,p_queue uuid,p_channel uuid) RETURNS boolean LANGUAGE sql STABLE AS $$SELECT NOT EXISTS(SELECT 1 FROM public.atendimento_usuario_acesso a WHERE a.user_id=auth.uid() AND a.cliente_id=p_client) OR EXISTS(SELECT 1 FROM public.atendimento_usuario_acesso a WHERE a.user_id=auth.uid() AND a.cliente_id=p_client AND a.whatsapp_config_id=p_channel)$$;
      ALTER TABLE public.cliente_whatsapp_grupo ADD COLUMN display_name text,ADD COLUMN updated_at timestamptz DEFAULT clock_timestamp();
      GRANT SELECT ON public.cliente_whatsapp_config TO authenticated;
      CREATE TABLE public.gestor_ia_metas_campanha(id uuid);CREATE TABLE public.gestor_ia_decisoes(id uuid);`);
    const names = readdirSync(migrations);
    for (const suffix of ['_atlas_group_audio_transcripts.sql','_cliente_whatsapp_sent_ack_status.sql','_atendimento_grupo_ia_analise.sql','_cs_ia_radar.sql','_cs_ia_conversation_readings.sql','_cs_ia_team_response_times.sql','_cs_ia_whatsapp_task_start.sql','_cs_ia_group_audio.sql','_cs_ia_atlas_group_requests.sql','_cs_ia_atlas_group_activity.sql']) {
      const name = names.find(name => name.endsWith(suffix));assert.ok(name,suffix);sql(file(name));
    }
    sql(file('20261109084300_cs_ia_group_binding.sql'));
    sql(definition(file('20261109092358_cs_ia_group_labels.sql'),'private.cs_ia_group_label_editable'));
    sql(file('20261109100351_cs_ia_inventory_group_members.sql'));
    sql(file('20261109150718_cs_ia_channel_following.sql'));sql(file('20261109150722_cs_ia_channel_reading.sql'));sql(file('20261109152645_cs_ia_task_controls.sql'));
    const creation = file('20261109154825_cs_ia_whatsapp_task_creation.sql');
    sql('ALTER TABLE private.cs_ia_reading_config ADD COLUMN task_create_since timestamptz');
    for (const name of ['private.cs_ia_clear_task_creation_on_reading_change','private.cs_ia_task_creation_since','private.cs_ia_task_creation_options','public.cs_ia_task_creation_options']) sql(definition(creation,name));
    sql('CREATE TRIGGER cs_ia_clear_task_creation_on_reading_change BEFORE UPDATE ON private.cs_ia_reading_config FOR EACH ROW EXECUTE FUNCTION private.cs_ia_clear_task_creation_on_reading_change()');
    const context = file('20261109160256_cs_ia_whatsapp_task_context.sql');sql(context.slice(0,context.indexOf('CREATE FUNCTION private.cs_ia_task_message_actor')) + 'COMMIT;');
    sql(file('20261109161636_cs_ia_analysis_controls.sql'));
    const atlas = file('20261009004301_atlas_personal_assistant.sql');
    for (const name of ['atlas_conversations','atlas_runs','atlas_memories']) sql(table(atlas,name));
    sql(definition(atlas,'public.atlas_is_owner').replace('CREATE FUNCTION','CREATE OR REPLACE FUNCTION'));
    const auth = file('20261013140451_invite_only_access.sql');
    for (const name of ['private.planeje_live_session','private.planeje_approved_access','public.planeje_current_account_access']) sql(definition(auth,name));
    sql(file('20261112032940_atlas_executor.sql'));sql(file('20261112034446_atlas_executor_squad.sql'));
    sql(`UPDATE public.cs_ia_settings SET task_board_enabled=true,task_automation_enabled=true WHERE id=1;
      INSERT INTO public.atendimento_conversas(id,cliente_id,whatsapp_config_id,chat_jid,is_group,bloqueada,display_name)
      VALUES('${nativeIds.secondGroup}','${nativeIds.tenant}','${nativeIds.channel}','segundo-ficticio@g.us',true,false,'Segundo grupo fictício')`);
  }
  function stop() { if (started) run('pg_ctl',['-D',dir,'-m','immediate','-w','stop']);rmSync(work,{ recursive:true,force:true }); }
  return { start,stop,sql,user,userSql,snapshot,reading,store,decide,decisionStatement,psql,env,work };
}

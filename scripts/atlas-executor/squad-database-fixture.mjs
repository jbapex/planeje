import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
export { id, ids, literal, json } from './database-fixture.mjs';
import { id, ids, literal, json } from './database-fixture.mjs';

const migration = name => readFileSync(new URL(`../../supabase/migrations/${name}.sql`, import.meta.url),'utf8');
function definition(source,name) {
  const start = source.toLowerCase().search(new RegExp(`create(?: or replace)? function ${name.replaceAll('.','\\.')}\\(`,'i'));
  const end = source.indexOf('$$;',start);
  assert.ok(start >= 0 && end > start,`Definição ${name}`);
  return source.slice(start,end + 3);
}
export function squadDatabaseFixture() {
  const work = mkdtempSync('/tmp/atlas-squad-db-'),dir = join(work,'data'),env = { PATH:process.env.PATH,LC_ALL:'C' };
  const psql = ['-X','-Aqt','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose','-h',work,'-p','55534','-U','atlas_squad_qa','-d','postgres'];
  let started = false,sequence = 2000;
  const run = (binary,args,input) => {
    const result = spawnSync(binary,args,{ input,env,encoding:'utf8',timeout:25000 });
    if (result.error || result.status) throw Error(result.stderr?.trim() || result.error?.message || result.stdout);
    return result.stdout.trim();
  };
  const sql = statement => run('psql',psql,statement);
  const userSql = (statement,{ actor = ids.admin,session = ids.session,role = 'authenticated',delegate } = {}) => `BEGIN;SET LOCAL ROLE ${role};SET LOCAL test.uid=${literal(actor)};
    SET LOCAL request.jwt.claims=${literal(JSON.stringify({ sub:actor,role,...(session && { session_id:session }),...(delegate && { planeje_server_delegate:delegate }) }))};${statement};COMMIT;`;
  const asUser = (statement,options) => sql(userSql(statement,options));
  function newRun() {
    const conversation = id(++sequence),runId = id(++sequence);
    sql(`INSERT INTO public.atlas_conversations(id,owner_id,client_id,title) VALUES('${conversation}','${ids.admin}','${ids.client}','Squad fictício');
      INSERT INTO public.atlas_runs(id,owner_id,request_id,conversation_id,request_conversation_id,request_client_id,request_message,status,source_session_id)
      VALUES('${runId}','${ids.admin}','${id(++sequence)}','${conversation}','${conversation}','${ids.client}','[Executor Planeje] Squad QA','processing','${ids.session}')`);
    return runId;
  }
  const store = (app,action,payload,before = null,extra = {}) => JSON.parse(asUser(`SELECT public.atlas_executor_store('${newRun()}','${id(++sequence)}',${json({ kind:'proposal',app,action,title:'Proposta Squad fictícia',payload,before,preview:{},effect:{},links:[],...extra })})`));
  const decide = (item,options) => JSON.parse(asUser(`SELECT public.atlas_executor_decide('${item.id}',${item.revision},'approve')`,options));
  function start() {
    run('initdb',['-D',dir,'-U','atlas_squad_qa','--auth-local=trust','--auth-host=reject','--no-locale','--encoding=UTF8']);
    run('pg_ctl',['-D',dir,'-l',join(work,'postgres.log'),'-o',`-k ${work} -p 55534 -c listen_addresses='' -c unix_socket_permissions=0700`,'-w','start']);
    started = true; assert.equal(sql('SHOW listen_addresses'),'');
    const fixture = readFileSync(new URL('../crm-ia/workspace.database.test.mjs',import.meta.url),'utf8').split('    sql(`')[1].split('    `);')[0].replace(/\$\{(\w+)\}/g,(_,key) => ids[key]);
    sql(fixture);
    sql(`CREATE SCHEMA planeje_private;CREATE TABLE auth.users(id uuid PRIMARY KEY,banned_until timestamptz);
      CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid REFERENCES auth.users(id),not_after timestamptz);
      CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
      CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$SELECT auth.jwt()->>'role'$$;
      INSERT INTO auth.users(id) VALUES('${ids.admin}'),('${ids.staff}'),('${ids.other}');
      INSERT INTO auth.sessions(id,user_id) VALUES('${ids.session}','${ids.admin}'),('${ids.otherSession}','${ids.staff}');
      GRANT SELECT ON public.profiles,public.clientes TO authenticated;
      INSERT INTO public.module_settings VALUES('assistant',true),('crm',true),('clients',true),('atendimento',true),('paid_traffic',true),('reports',true),('tasks',true);
      CREATE TABLE public.client_field_permissions(role text,field_name text,can_view boolean);
      CREATE TABLE public.user_client_field_permissions(user_id uuid,field_name text,can_view boolean);
      CREATE TABLE public.fixture_traffic_acl(actor uuid,client uuid);
      INSERT INTO public.fixture_traffic_acl VALUES('${ids.admin}','${ids.client}'),('${ids.staff}','${ids.client}');
      CREATE FUNCTION public.central_trafego_can_access_client(p_cliente_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$SELECT EXISTS(SELECT 1 FROM public.fixture_traffic_acl WHERE actor=auth.uid() AND client=p_cliente_id)$$;
      CREATE TABLE public.cliente_meta_accounts(id uuid DEFAULT gen_random_uuid(),cliente_id uuid,meta_account_id text,is_active boolean);
      INSERT INTO public.cliente_meta_accounts(cliente_id,meta_account_id,is_active) VALUES('${ids.client}','700',true),('${ids.foreign}','800',true);
      CREATE TABLE public.tarefas(id uuid PRIMARY KEY,client_id uuid,type text,status text,assignee_ids uuid[]);
      CREATE TABLE public.task_statuses(value text,is_terminal boolean);
      CREATE TABLE public.gestor_ia_meta_cache(cliente_id uuid,conta_id text,janela text,dados jsonb,lido_em timestamptz);
      CREATE TABLE public.fixture_cs_calls(id bigint GENERATED ALWAYS AS IDENTITY,action text,payload jsonb);
      CREATE TABLE private.cs_ia_reading_config(client_id uuid PRIMARY KEY,revision uuid NOT NULL DEFAULT gen_random_uuid(),enabled boolean DEFAULT true,
        enabled_at timestamptz DEFAULT clock_timestamp(),task_moves_revision uuid,task_moves_since timestamptz,task_create_since timestamptz,task_context_since timestamptz,
        owner_id uuid,conversation_id uuid,channel_id uuid,wa_client_id uuid,group_jid text,include_audio boolean DEFAULT false,transcribe_audio_since timestamptz);
      INSERT INTO private.cs_ia_reading_config(client_id,owner_id,conversation_id,channel_id,wa_client_id,group_jid) VALUES('${ids.client}','${ids.admin}','${id(301)}','${ids.channel}','${ids.client}','fixture@g.us');
      CREATE FUNCTION private.cs_ia_user_task_module(p_user uuid,p_module text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$SELECT coalesce((SELECT is_enabled FROM public.user_module_permissions WHERE user_id=p_user AND module_name=p_module),(SELECT is_enabled FROM public.module_settings WHERE module_name=p_module),true)$$;
      CREATE FUNCTION private.cs_ia_owner_visible() RETURNS boolean LANGUAGE sql STABLE AS $$SELECT true$$;
      CREATE FUNCTION public.cs_ia_get_reading(p_client_id uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER AS $$
        SELECT jsonb_build_object('enabled',c.enabled,'include_audio',c.include_audio,'transcribe_new_audio',c.transcribe_audio_since IS NOT NULL,
          'conversation_id',c.conversation_id,'status','waiting','can_configure',true,'can_pause',true) FROM private.cs_ia_reading_config c WHERE client_id=p_client_id$$;
      CREATE FUNCTION public.cs_ia_reading_settings(p_client_id uuid,p_enabled boolean,p_include_audio boolean,p_conversation_id uuid,p_transcribe_audio boolean DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$BEGIN
        INSERT INTO public.fixture_cs_calls(action,payload) VALUES('reading',jsonb_build_array(p_client_id,p_enabled,p_include_audio,p_conversation_id,p_transcribe_audio));
        UPDATE private.cs_ia_reading_config SET enabled=p_enabled,include_audio=p_include_audio,revision=gen_random_uuid(),transcribe_audio_since=CASE WHEN p_transcribe_audio THEN clock_timestamp() END WHERE client_id=p_client_id;
        RETURN public.cs_ia_get_reading(p_client_id);END$$;
      CREATE FUNCTION public.cs_ia_group_binding(p_client_id uuid) RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT jsonb_build_object('version','binding-version','conversationId','${id(301)}')$$;
      CREATE FUNCTION public.cs_ia_set_group_binding(p_client_id uuid,p_conversation_id uuid,p_wa_client_id uuid,p_channel_id uuid,p_group_jid text,p_version text) RETURNS boolean LANGUAGE plpgsql AS $$BEGIN
        INSERT INTO public.fixture_cs_calls(action,payload) VALUES('binding',jsonb_build_array(p_client_id,p_conversation_id,p_wa_client_id,p_channel_id,p_group_jid,p_version));RETURN true;END$$;`);
    const auth = migration('20261013140451_invite_only_access');
    for (const name of ['private.planeje_live_session','private.planeje_approved_access','public.planeje_current_account_access']) sql(definition(auth,name));
    sql(migration('20261111041704_crm_ia_workspace'));
    sql(migration('20261111043800_crm_ia_workspace_readings'));
    sql(migration('20261009004301_atlas_personal_assistant'));
    sql(`UPDATE public.atlas_settings SET owner_id='${ids.admin}',enabled=true WHERE id='atlas'`);
    const cs = migration('20261109044132_cs_ia_radar');
    sql(cs.slice(cs.indexOf('CREATE TABLE public.cs_ia_settings'),cs.indexOf('CREATE TABLE public.cs_ia_daily')));
    for (const name of ['private.cs_ia_module_enabled','private.cs_ia_role','private.cs_ia_client_scope','private.cs_ia_client_exists','private.cs_ia_touch_relationship']) sql(definition(cs,name));
    sql(`CREATE TRIGGER cs_ia_relationship_updated BEFORE UPDATE ON public.cs_ia_relationships FOR EACH ROW EXECUTE FUNCTION private.cs_ia_touch_relationship();
      ALTER TABLE public.cs_ia_settings ENABLE ROW LEVEL SECURITY;ALTER TABLE public.cs_ia_relationships ENABLE ROW LEVEL SECURITY;
      GRANT SELECT,UPDATE ON public.cs_ia_settings TO authenticated;GRANT SELECT,INSERT,UPDATE ON public.cs_ia_relationships TO authenticated;`);
    const task = migration('20261109152645_cs_ia_task_controls'); sql(task.slice(0,task.indexOf('CREATE OR REPLACE FUNCTION private.cs_ia_task_move_options')) + 'COMMIT;');
    const analysis = migration('20261109161636_cs_ia_analysis_controls'); sql(analysis.slice(0,analysis.indexOf('CREATE FUNCTION private.cs_ia_sync_analysis_controls')) + 'COMMIT;');
    sql(definition(analysis,'private.cs_ia_sync_analysis_controls'));
    sql(`CREATE TRIGGER cs_ia_sync_analysis_controls BEFORE UPDATE OF reading_enabled,transcription_enabled ON public.cs_ia_analysis_settings FOR EACH ROW EXECUTE FUNCTION private.cs_ia_sync_analysis_controls();`);
    sql(migration('20261109150718_cs_ia_channel_following'));
    sql(migration('20261109055932_cs_ia_team_structure'));
    for (const kind of ['move','creation','context']) {
      const timestamp = { move:'task_moves_since',creation:'task_create_since',context:'task_context_since' }[kind];
      sql(`CREATE FUNCTION public.cs_ia_task_${kind}_options(p_client_id uuid,p_conversation_id uuid,p_enabled boolean DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql AS $$DECLARE active boolean;BEGIN
        IF p_enabled IS NOT NULL THEN
          INSERT INTO public.fixture_cs_calls(action,payload) VALUES('${kind}',jsonb_build_array(p_client_id,p_conversation_id,p_enabled));
          UPDATE private.cs_ia_reading_config SET ${timestamp}=CASE WHEN p_enabled THEN clock_timestamp() END WHERE client_id=p_client_id;
        END IF;
        SELECT ${timestamp} IS NOT NULL INTO active FROM private.cs_ia_reading_config WHERE client_id=p_client_id;
        RETURN jsonb_build_object('enabled',active,'can_configure',true,'can_revoke',true);END$$;`);
    }
    sql(migration('20261109041624_gestor_ia_metas_campanha'));
    sql(migration('20261109053900_gestor_ia_metas_trafego_engajamento'));
    sql(migration('20261109081857_gestor_ia_metas_alcance_video_perfil'));
    sql(migration('20261109091216_gestor_ia_ajuste_meta'));
    sql(migration('20261109055603_gestor_ia_historico_decisoes'));
    sql(migration('20261109070936_gestor_ia_agenda_decisoes'));
    const agenda = migration('20261109092400_gestor_ia_agenda_planos');sql(agenda.slice(0,agenda.indexOf('alter table private.gestor_ia_aprendizados')));
    sql(definition(migration('20261109111500_gestor_ia_arquivo_pdf'),'private.gestor_ia_pode_arquivar_pdf'));
    sql(migration('20261109115300_gestor_ia_modelos_relatorio'));
    const portal = migration('20261109123500_gestor_ia_portal_metricas');
    sql(portal.slice(0,portal.indexOf('create function private.gestor_ia_escopo_metricas_portal')) + 'COMMIT;');
    for (const name of ['public.gestor_ia_consultar_metricas_portal','public.gestor_ia_configurar_metricas_portal']) sql(definition(portal,name));
    sql(`GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA private TO authenticated;GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;`);
    sql(migration('20261112032940_atlas_executor'));
  }
  function apply() { sql(migration('20261112034446_atlas_executor_squad')); }
  function stop() { if (started) run('pg_ctl',['-D',dir,'-m','immediate','-w','stop']);rmSync(work,{ recursive:true,force:true }); }
  return { start,apply,stop,sql,asUser,userSql,store,decide,psql,env,work };
}

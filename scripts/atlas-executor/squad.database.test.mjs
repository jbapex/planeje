import assert from 'node:assert/strict';
import test from 'node:test';
import { execFile,spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { squadDatabaseFixture, id, ids, json } from './squad-database-fixture.mjs';

const SETTINGS = ['healthy_min','result_min','attention_min','score_drop','quiet_days','critical_quiet_days','start_hour','end_hour','weekends','radar_enabled'];
const select = (db,table,fields,where = 'true') => JSON.parse(db.sql(`SELECT private.atlas_executor_squad_pick(to_jsonb(s),ARRAY[${fields.map(value => `'${value}'`).join(',')}]) FROM ${table} s WHERE ${where}`));
const forbidden = action => assert.throws(action,/\b42501\b/);
const exec = promisify(execFile);

test('dispatcher Squad usa serviços oficiais e CAS no PostgreSQL privado',async t => {
  const db = squadDatabaseFixture();
  try {
    db.start();db.apply();
    await t.test('aprovação grava saúde manual e replay mantém recibo único',() => {
      const item = db.store('cs','set_health',{ data:{ manual_status:'critico' },expected:null });
      const result = db.decide(item);
      assert.equal(result.state,'completed');assert.equal(result.result.manual_status,'critico');
      assert.equal(db.sql(`SELECT manual_status FROM public.cs_ia_relationships WHERE client_id='${ids.client}'`),'critico');
      assert.deepEqual(db.decide(item).result,result.result);
    });
    await t.test('versão de consentimento detecta ABA mesmo quando flags e timestamp voltam ao anterior',() => {
      const snapshot = () => JSON.parse(db.asUser(`SELECT public.atlas_executor_cs_reading_snapshot('${ids.client}','${id(301)}')`));
      const before = snapshot();
      assert.equal(db.sql('SELECT count(*) FROM public.fixture_cs_calls'),'0');
      db.sql(`UPDATE private.cs_ia_reading_config SET task_create_since=clock_timestamp() WHERE client_id='${ids.client}';
        UPDATE private.cs_ia_reading_config SET task_create_since=NULL WHERE client_id='${ids.client}'`);
      const after = snapshot();
      assert.deepEqual(after.reading,before.reading);assert.deepEqual(after.task_creation,before.task_creation);
      assert.notEqual(after.version,before.version);
    });
    await t.test('regras e controles CS preservam outros campos e disparam versões nativas',() => {
      let before = select(db,'public.cs_ia_settings',SETTINGS,'id=1');
      const item = db.store('cs','save_settings',{ data:{ ...before,quiet_days:4 },expected:before });
      assert.equal(db.decide(item).state,'completed');assert.equal(db.sql('SELECT quiet_days||\',\'||start_hour FROM public.cs_ia_settings WHERE id=1'),'4,8');
      before = select(db,'public.cs_ia_settings',['task_board_enabled','task_automation_enabled','task_controls_version'],'id=1');
      const controls = db.store('cs','save_task_controls',{ data:{ task_board_enabled:true,task_automation_enabled:true },expected:before });
      const taskResult = db.decide(controls);assert.equal(taskResult.state,'completed');assert.notEqual(taskResult.result.task_controls_version,before.task_controls_version);
      before = select(db,'public.cs_ia_analysis_settings',['reading_enabled','transcription_enabled','version'],'id=1');
      const analysis = db.store('cs','save_analysis_settings',{ data:{ reading_enabled:true,transcription_enabled:false },expected:before });
      const result = db.decide(analysis);assert.equal(result.state,'completed');assert.notEqual(result.result.version,before.version);
    });
    await t.test('fotografia velha, campos extras e tipo inválido nunca sobrescrevem controles',() => {
      const before = select(db,'public.cs_ia_settings',SETTINGS,'id=1');
      const stale = db.store('cs','save_settings',{ data:{ ...before,quiet_days:5 },expected:before });
      db.sql('UPDATE public.cs_ia_settings SET quiet_days=6 WHERE id=1');
      assert.equal(db.decide(stale).state,'conflict');assert.equal(db.sql('SELECT quiet_days FROM public.cs_ia_settings WHERE id=1'),'6');
      for (const data of [{ ...before,owner_id:ids.staff },{ ...before,quiet_days:'5' }]) {
        const current = select(db,'public.cs_ia_settings',SETTINGS,'id=1');
        const result = db.decide(db.store('cs','save_settings',{ data,expected:current }));
        assert.equal(result.state,'failed');assert.equal(db.sql('SELECT quiet_days FROM public.cs_ia_settings WHERE id=1'),'6');
      }
    });
    await t.test('canal usa serviço nativo com versão e acesso da instância',() => {
      const version = db.sql(`SELECT version FROM private.cs_ia_channel_state('${ids.channel}','${ids.client}')`);
      const pause = db.store('cs','set_channel_following',{ p_channel_id:ids.channel,p_enabled:false,p_version:version });
      assert.equal(db.decide(pause).state,'completed');assert.equal(db.sql(`SELECT starts_at IS NULL FROM private.cs_ia_channel_state('${ids.channel}','${ids.client}')`),'t');
      const stale = db.store('cs','set_channel_following',{ p_channel_id:ids.channel,p_enabled:true,p_version:version });
      assert.equal(db.decide(stale).state,'conflict');
      const hidden = db.store('cs','set_channel_following',{ p_channel_id:ids.hiddenChannel,p_enabled:false,p_version:'x' });
      forbidden(() => db.decide(hidden));
      assert.equal(db.sql(`SELECT state FROM public.atlas_execution_items WHERE id='${hidden.id}'`),'proposed');
    });
    await t.test('equipe usa cargos e vínculos nativos e recusa versões concorrentes',() => {
      const label = db.decide(db.store('cs','save_team_label',{ p_id:null,p_kind:'cargo',p_name:'Sucesso do cliente',p_archived:false,p_version:null }));
      assert.equal(label.state,'completed');const saved = label.result;
      const person = db.decide(db.store('cs','save_team_person',{ p_profile_id:ids.staff,p_label_ids:[saved.id],p_expected_ids:[] }));
      assert.equal(person.state,'completed');assert.equal(person.result,ids.staff);
      const stale = db.store('cs','save_team_label',{ p_id:saved.id,p_kind:'cargo',p_name:'Outro nome',p_archived:false,p_version:id(999) });
      assert.equal(db.decide(stale).state,'conflict');
      const changed = db.store('cs','save_team_person',{ p_profile_id:ids.staff,p_label_ids:[],p_expected_ids:[] });
      assert.equal(db.decide(changed).state,'conflict');
    });
    await t.test('grupo e quatro consentimentos despacham assinaturas exatas sem mutação no snapshot',() => {
      const bind = db.store('cs','set_group_binding',{ p_client_id:ids.client,p_conversation_id:id(301),p_wa_client_id:ids.client,p_channel_id:ids.channel,p_group_jid:'fixture@g.us',p_version:'binding-version' });
      assert.equal(db.decide(bind).state,'completed');
      const count = Number(db.sql('SELECT count(*) FROM public.fixture_cs_calls'));
      for (const action of ['configure_reading','configure_task_moves','configure_task_creation','configure_task_context']) {
        const before = JSON.parse(db.asUser(`SELECT public.atlas_executor_cs_reading_snapshot('${ids.client}','${id(301)}')`));
        assert.equal(Number(db.sql('SELECT count(*) FROM public.fixture_cs_calls')),count + ['configure_reading','configure_task_moves','configure_task_creation','configure_task_context'].indexOf(action));
        const payload = { p_client_id:ids.client,p_conversation_id:id(301),p_enabled:true,...(action === 'configure_reading' ? { p_include_audio:true,p_transcribe_audio:false } : {}) };
        const result = db.decide(db.store('cs',action,payload,before));assert.equal(result.state,'completed',JSON.stringify(result.error));
      }
      assert.deepEqual(JSON.parse(db.sql("SELECT payload FROM public.fixture_cs_calls WHERE action='binding' ORDER BY id DESC LIMIT 1")),[ids.client,id(301),ids.client,ids.channel,'fixture@g.us','binding-version']);
    });
    await t.test('ABA e revogação após preparar bloqueiam consentimento sem executar dublê',() => {
      const before = JSON.parse(db.asUser(`SELECT public.atlas_executor_cs_reading_snapshot('${ids.client}','${id(301)}')`));
      const item = db.store('cs','configure_task_creation',{ p_client_id:ids.client,p_conversation_id:id(301),p_enabled:false },before);
      const count = db.sql('SELECT count(*) FROM public.fixture_cs_calls');
      db.sql(`UPDATE private.cs_ia_reading_config SET task_context_since=NULL WHERE client_id='${ids.client}';
        UPDATE private.cs_ia_reading_config SET task_context_since=clock_timestamp() WHERE client_id='${ids.client}'`);
      assert.equal(db.decide(item).state,'conflict');assert.equal(db.sql('SELECT count(*) FROM public.fixture_cs_calls'),count);
      forbidden(() => db.asUser(`SELECT public.atlas_executor_cs_reading_snapshot('${ids.client}','${id(302)}')`));
      forbidden(() => db.asUser(`SELECT public.atlas_executor_cs_reading_snapshot('${ids.client}','${id(301)}')`,{ delegate:'atlas' }));
    });
    let savedGoal;
    await t.test('meta nova, edição com CAS e ajuste usam funções nativas e conta vinculada',() => {
      const payload = { p_client_id:ids.client,p_account_id:'act_700',p_goal_id:null,p_name:'Meta Squad',p_objective:'leads',p_scope:'campaigns',p_campaign_ids:['501'],
        p_cost_cents:1200,p_budget_cents:90000,p_result_target:75,p_is_active:true,p_is_primary:true };
      const item = db.store('gestor','save_goal',payload);const created = db.decide(item);
      assert.equal(created.state,'completed',JSON.stringify(created.error));savedGoal = created.result;
      assert.equal(db.decide(item).result.id,savedGoal.id);
      const edit = db.store('gestor','save_goal',{ ...payload,p_goal_id:savedGoal.id,p_name:'Nome revisado' },savedGoal);
      db.sql(`UPDATE public.gestor_ia_metas_campanha SET budget_cents=91000,updated_at=clock_timestamp() WHERE id='${savedGoal.id}'`);
      assert.equal(db.decide(edit).state,'conflict');assert.equal(db.sql(`SELECT name FROM public.gestor_ia_metas_campanha WHERE id='${savedGoal.id}'`),'Meta Squad');
      const current = JSON.parse(db.sql(`SELECT to_jsonb(g) FROM public.gestor_ia_metas_campanha g WHERE id='${savedGoal.id}'`));
      const adjusted = db.decide(db.store('gestor','adjust_goal',{ p_client_id:ids.client,p_account_id:'act_700',p_goal_id:savedGoal.id,p_expected_updated_at:current.updated_at,p_budget_cents:100000,p_result_target:null }));
      assert.equal(adjusted.state,'completed');assert.equal(adjusted.result.cost_cents,1200);assert.equal(adjusted.result.budget_cents,100000);
      const foreignAccount = db.store('gestor','save_goal',{ ...payload,p_account_id:'act_800' });forbidden(() => db.decide(foreignAccount));
    });
    await t.test('agenda nativa preserva dono/sessão real e versão; modelos e portal persistem oficialmente',() => {
      const agenda = db.decide(db.store('gestor','configure_agenda',{ p_client_id:ids.client,p_account_id:'act_700',p_enabled:true,p_run_time:'07:15',p_weekdays:[1,3],p_categories:['custo'],p_revision:null }));
      assert.equal(agenda.state,'completed',JSON.stringify(agenda.error));assert.equal(agenda.result.owner_id,ids.admin);
      const stale = db.store('gestor','configure_agenda',{ p_client_id:ids.client,p_account_id:'act_700',p_enabled:false,p_run_time:'07:15',p_weekdays:[1],p_categories:['custo'],p_revision:0 });
      assert.equal(db.decide(stale).state,'conflict');
      const configured = { name:'Relatório Squad',window_key:'last7',metrics:['spend','result'],tone:'Objetivo',compare_previous:true,include_creatives:false,include_routine:true };
      forbidden(() => db.store('gestor','save_report_model',{ p_id:null,p_revision:0,p_config:configured }));
      db.sql("INSERT INTO public.client_field_permissions VALUES('admin','meta_resumo',true),('admin','valor',true)");
      const report = db.decide(db.store('gestor','save_report_model',{ p_id:null,p_revision:0,p_config:configured }));
      assert.equal(report.state,'completed',JSON.stringify(report.error));
      const clientModel = db.decide(db.store('gestor','set_client_report_model',{ p_client_id:ids.client,p_model_id:report.result.id,p_revision:0 }));
      assert.equal(clientModel.state,'completed');assert.equal(clientModel.result.model_id,report.result.id);
      const portal = db.decide(db.store('gestor','configure_portal_metrics',{ p_client_id:ids.client,p_shared:true,p_objective:'leads',p_revision:0 }));
      assert.equal(portal.state,'completed',JSON.stringify(portal.error));assert.equal(portal.result.shared,true);
      assert.equal(db.sql(`SELECT shared FROM private.gestor_ia_metricas_portal WHERE client_id='${ids.client}'`),'t');
    });
    await t.test('decisão aplica transições nativas com dono/cliente/revisão e verifica tarefa oficial',() => {
      const record = JSON.parse(db.asUser(`INSERT INTO public.gestor_ia_decisoes(client_id,source_key,origin,title,payload) VALUES('${ids.client}','qa','note','Decisão Squad','{}') RETURNING to_jsonb(gestor_ia_decisoes)`));
      let before = select(db,'public.gestor_ia_decisoes',['id','revision','status','task_id','verdict','verdict_note'],`id='${record.id}'`);
      const approval = db.decide(db.store('gestor','update_decision',{ data:{ status:'approved',task_id:null,verdict:null,verdict_note:null },expected:before }));
      assert.equal(approval.state,'completed');assert.equal(approval.result.revision,2);assert.equal(approval.result.history.length,1);
      before = select(db,'public.gestor_ia_decisoes',['id','revision','status','task_id','verdict','verdict_note'],`id='${record.id}'`);
      const invalid = db.decide(db.store('gestor','update_decision',{ data:{ status:'approved',task_id:null,verdict:'improved',verdict_note:'Ainda não executado' },expected:before }));
      assert.equal(invalid.state,'failed');assert.equal(db.sql(`SELECT revision FROM public.gestor_ia_decisoes WHERE id='${record.id}'`),'2');
      const task = id(401);db.sql(`INSERT INTO public.tarefas VALUES('${task}','${ids.client}','paid_traffic','completed',ARRAY['${ids.admin}']::uuid[]);INSERT INTO public.task_statuses VALUES('completed',true)`);
      const linked = db.decide(db.store('gestor','update_decision',{ data:{ status:'approved',task_id:task,verdict:null,verdict_note:null },expected:before }));
      assert.equal(linked.state,'completed');assert.equal(linked.result.task_id,task);
    });
    await t.test('dispatcher fixo recusa campos de escopo, conta revogada, gestão revogada e operação arbitrária',() => {
      assert.throws(() => db.store('gestor','configure_portal_metrics',{ p_client_id:ids.foreign,p_shared:false,p_objective:null,p_revision:1 }),/22023|42501/);
      const item = db.store('gestor','configure_portal_metrics',{ p_client_id:ids.client,p_shared:false,p_objective:null,p_revision:1 });
      db.sql(`UPDATE public.atlas_execution_items SET payload=jsonb_set(payload,'{p_client_id}',${json(ids.foreign)}) WHERE id='${item.id}'`);
      forbidden(() => db.decide(item));assert.equal(db.sql(`SELECT state FROM public.atlas_execution_items WHERE id='${item.id}'`),'proposed');
      const before = select(db,'public.cs_ia_settings',SETTINGS,'id=1');const role = db.store('cs','save_settings',{ data:before,expected:before });
      db.sql(`UPDATE public.profiles SET role='colaborador' WHERE id='${ids.admin}'`);forbidden(() => db.decide(role));
      db.sql(`UPDATE public.profiles SET role='admin' WHERE id='${ids.admin}'`);
      const extra = db.store('gestor','configure_portal_metrics',{ p_client_id:ids.client,p_shared:false,p_objective:null,p_revision:1,rpc:'arbitrary' });
      assert.equal(db.decide(extra).state,'failed');assert.equal(db.sql(`SELECT shared FROM private.gestor_ia_metricas_portal WHERE client_id='${ids.client}'`),'t');
      const denied = db.store('gestor','adjust_goal',{ p_client_id:ids.client,p_account_id:'act_700',p_goal_id:savedGoal.id,p_expected_updated_at:savedGoal.updated_at,p_budget_cents:100001,p_result_target:null });
      db.sql(`DELETE FROM public.fixture_traffic_acl WHERE actor='${ids.admin}' AND client='${ids.client}'`);forbidden(() => db.decide(denied));
      db.sql(`INSERT INTO public.fixture_traffic_acl VALUES('${ids.admin}','${ids.client}')`);
      forbidden(() => db.asUser(`SELECT private.atlas_executor_dispatch(NULL::public.atlas_execution_items)`));
    });
    await t.test('falha depois de efeito parcial reverte mutação e preserva erro genérico no recibo',() => {
      db.sql(`CREATE FUNCTION public.squad_fixture_fail() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN
        INSERT INTO public.fixture_cs_calls(action,payload) VALUES('partial','{}');RAISE EXCEPTION 'detalhe-interno-nao-exibir';END$$;
        CREATE TRIGGER squad_fixture_fail AFTER INSERT ON private.cs_ia_team_labels FOR EACH ROW WHEN(NEW.name='Falha atômica') EXECUTE FUNCTION public.squad_fixture_fail()`);
      const count = db.sql('SELECT count(*) FROM public.fixture_cs_calls');
      const result = db.decide(db.store('cs','save_team_label',{ p_id:null,p_kind:'squad',p_name:'Falha atômica',p_archived:false,p_version:null }));
      assert.equal(result.state,'failed');assert.equal(db.sql("SELECT count(*) FROM private.cs_ia_team_labels WHERE name='Falha atômica'"),'0');
      assert.equal(db.sql('SELECT count(*) FROM public.fixture_cs_calls'),count);assert.equal(JSON.stringify(result.error).includes('detalhe-interno'),false);
    });
    await t.test('revogar CS durante espera em lock dos controles impede escrita depois do lock',async () => {
      const before = select(db,'public.cs_ia_settings',SETTINGS,'id=1');
      const item = db.store('cs','save_settings',{ data:{ ...before,quiet_days:5 },expected:before });
      const gate = spawn('psql',db.psql,{ env:db.env,stdio:['pipe','pipe','pipe'] });
      let output = '';gate.stdout.setEncoding('utf8');gate.stdout.on('data',text => { output += text; });
      const until = async predicate => {
        const deadline = Date.now() + 8000;
        while (!predicate()) { if (Date.now() > deadline) assert.fail('Lock QA não observado.');await new Promise(resolve => setTimeout(resolve,15)); }
      };
      try {
        gate.stdin.write("BEGIN;SELECT id FROM public.cs_ia_settings WHERE id=1 FOR UPDATE;SELECT 'LOCKED';\n");await until(() => output.includes('LOCKED'));
        const pending = exec('psql',[...db.psql,'-c',`SET application_name='squad-revoke-lock';${db.userSql(`SELECT public.atlas_executor_decide('${item.id}',${item.revision},'approve')`)}`],{ env:db.env,encoding:'utf8',timeout:15000 }).then(result => ({ result }),error => ({ error }));
        await until(() => db.sql("SELECT count(*) FROM pg_stat_activity WHERE application_name='squad-revoke-lock' AND wait_event_type='Lock'") === '1');
        db.sql(`INSERT INTO public.user_module_permissions VALUES('${ids.admin}','atendimento',false)`);gate.stdin.end('COMMIT;\n');
        const outcome = await pending;assert.match(outcome.error?.stderr || '',/42501/);
        assert.equal(db.sql('SELECT quiet_days FROM public.cs_ia_settings WHERE id=1'),String(before.quiet_days));
        assert.equal(db.sql(`SELECT state FROM public.atlas_execution_items WHERE id='${item.id}'`),'proposed');
      } finally { if (!gate.stdin.writableEnded) gate.stdin.end('ROLLBACK;\n');gate.kill();db.sql(`DELETE FROM public.user_module_permissions WHERE user_id='${ids.admin}' AND module_name='atendimento'`); }
    });
  } finally { db.stop(); }
});

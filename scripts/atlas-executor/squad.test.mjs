import assert from 'node:assert/strict';
import test from 'node:test';
import { createClient } from '@supabase/supabase-js';
import { EXECUTOR_SQUAD_CATALOG, readExecutorSquad, prepareExecutorSquad } from '../../supabase/functions/_shared/atlasExecutorSquad.js';

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const clientId = id(1), actorId = id(2), groupId = id(3), channelId = id(4), tenantId = id(5), goalId = id(6), modelId = id(7), decisionId = id(8);
const stamp = '2026-11-12T12:30:00.123456+00:00', revision = id(9);
const setting = { id: 1, healthy_min: 75, result_min: 55, attention_min: 35, score_drop: 15, quiet_days: 3, critical_quiet_days: 7,
  start_hour: 8, end_hour: 18, weekends: false, radar_enabled: false, task_board_enabled: true, task_automation_enabled: false, task_controls_version: revision };
const goal = { id: goalId, client_id: clientId, account_id: 'act_700', name: 'Meta atual', objective: 'leads', scope: 'campaigns', campaign_ids: ['501'],
  cost_cents: 1200, budget_cents: 90000, result_target: 75, is_active: true, is_primary: true, updated_at: stamp };
const model = { id: modelId, name: 'Semanal', revision: 3, window_key: 'last7', metrics: ['spend','result','cost'], tone: 'Objetivo', compare_previous: true, include_creatives: false, include_routine: true };
function fixture(options = {}) {
  const calls = [], profile = { id: actorId, role: options.role || 'admin', status: 'active' };
  const row = { client_id: clientId, client_name: 'Cliente fictício', group_status: 'linked', conversation_id: groupId, wa_client_id: tenantId, channel_id: channelId, group_jid: 'fixture@g.us', manual_status: null, score: 75, signal: 'em_dia' };
  const tables = { profiles: [profile], clientes: [{ id: clientId, empresa: 'Cliente fictício', etapa: 'closed', created_at: stamp }], module_settings: [], user_module_permissions: [],
    client_field_permissions: [{ role: profile.role, field_name: 'valor', can_view: options.spend !== false }], user_client_field_permissions: [],
    cs_ia_settings: [setting], cs_ia_analysis_settings: [{ id: 1, reading_enabled: true, transcription_enabled: false, version: revision }],
    cs_ia_relationships: [{ client_id: clientId, manual_status: null, updated_at: stamp }], cs_ia_daily: [],
    cliente_meta_accounts: [{ cliente_id: clientId, meta_account_id: '700', meta_account_name: 'Conta fictícia', is_active: true }],
    gestor_ia_metas_campanha: [goal], gestor_ia_modelos_relatorio: [model], gestor_ia_modelos_por_cliente: [{ client_id: clientId, model_id: modelId, revision: 2 }],
    gestor_ia_agendas: [{ id: id(10), owner_id: actorId, client_id: clientId, account_id: 'act_700', enabled: false, run_time: '06:30:00', weekdays: [1,3,5], categories: ['custo','verba'], revision: 4 }],
    gestor_ia_decisoes: [{ id: decisionId, owner_id: actorId, client_id: clientId, status: 'pending', task_id: null, verdict: null, verdict_note: null, revision: 2, title: 'Revisar conta' }],
    atlas_settings: [{ id: 'atlas', owner_id: actorId, enabled: true }], atlas_memories: [], traffic_weekly_reviews: [], ...options.tables };
  const rpc = { planeje_current_account_access: true, atlas_is_owner: true, central_trafego_can_access_client: !options.deny,
    gestor_ia_pode_usar_metas: true, cs_ia_radar: [row], cs_ia_radar_snapshot: [row], cs_ia_connection_summary: [{ id: channelId, following: false, version: 'channel-version', can_configure: true }],
    cs_ia_group_binding: { version: 'binding-version', status: 'linked', conversationId: groupId, groupName: 'Grupo' },
    cs_ia_get_reading: { enabled: true, include_audio: true, transcribe_new_audio: false, can_configure: true, can_pause: true, status: 'waiting', conversation_id: groupId },
    cs_ia_task_move_options: { enabled: false, can_configure: true }, cs_ia_task_creation_options: { enabled: false, can_configure: true }, cs_ia_task_context_options: { enabled: false, can_configure: true },
    cs_ia_team_structure: { labels: [{ id: id(11), kind: 'cargo', name: 'CS', archived: false, version: revision }], assignments: [] },
    cs_ia_team_response_times: [], cs_ia_group_inventory: [], cs_ia_reading_signals: [], cs_ia_client_sources: { items: [], totals: { leads: 0 } },
    cs_ia_portfolio_segments: [], cs_ia_churn_list: [], cs_ia_atlas_group_requests: [], cs_ia_atlas_group_activity: { scan: null, job: null },
    gestor_ia_listar_pdfs: [], traffic_routine_client_history: [],
    gestor_ia_consultar_metricas_portal: { shared: false, objective: null, revision: 2 }, traffic_weekly_board: { clients: [{ id: clientId }, { id: id(99) }], reviews: [] },
    ...options.rpc };
  if (!Object.hasOwn(rpc,'atlas_executor_cs_reading_snapshot')) rpc.atlas_executor_cs_reading_snapshot = () => ({ reading:rpc.cs_ia_get_reading,
    task_moves:rpc.cs_ia_task_move_options,task_creation:rpc.cs_ia_task_creation_options,task_context:rpc.cs_ia_task_context_options,version:'a'.repeat(32) });
  const caller = createClient('https://fixture.invalid', 'synthetic-public-key', { auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: 'Bearer synthetic-session' }, fetch: async (value, init = {}) => {
      const url = new URL(value), method = init.method || 'GET', body = init.body ? JSON.parse(init.body) : null;
      assert.equal(url.hostname, 'fixture.invalid');
      calls.push({ path: url.pathname, method, body, query: Object.fromEntries(url.searchParams), authorization: new Headers(init.headers).get('authorization') });
      const send = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
      if (url.pathname === '/auth/v1/user') return send({ id: actorId });
      if (url.pathname.startsWith('/functions/v1/')) return send(options.edge ? options.edge(body) : { reading: { period: body.time_range, fetchedAt: stamp }, accounts: [] });
      if (url.pathname.startsWith('/rest/v1/rpc/')) {
        const name = url.pathname.split('/').at(-1);
        assert.ok(Object.hasOwn(rpc, name), `Preparação chamou RPC não permitida: ${name}`);
        let result = structuredClone(typeof rpc[name] === 'function' ? rpc[name](body) : rpc[name]);
        if (result?.code) return send(result, 403);
        if (Array.isArray(result)) result = filterRows(result, url);
        return send(result);
      }
      assert.equal(method, 'GET', 'Preparação não pode alterar tabelas');
      const table = url.pathname.split('/').at(-1);
      assert.ok(Object.hasOwn(tables, table), `Tabela não permitida: ${table}`);
      const rows = filterRows(structuredClone(tables[table]), url);
      return send(new Headers(init.headers).get('accept')?.includes('vnd.pgrst.object') ? rows[0] || null : rows);
    } } });
  return { caller, calls, tables, row };
}
function filterRows(rows, url) {
  for (const [key, value] of url.searchParams) if (value.startsWith('eq.')) rows = rows.filter(row => String(row[key]) === value.slice(3));
  const offset = Number(url.searchParams.get('offset') || 0), limit = Number(url.searchParams.get('limit') || 1000);
  return rows.slice(offset, offset + limit);
}
const scope = (app, extra) => ({ app, clientId, ...extra });

test('catálogo fechado descreve operações reais, campos e efeitos sem prometer Meta legado', () => {
  for (const operation of EXECUTOR_SQUAD_CATALOG) {
    assert.ok(['cs','gestor'].includes(operation.app)); assert.ok(['read','write'].includes(operation.mode));
    assert.ok(operation.name && operation.title && operation.description && operation.operation);
    assert.ok(Array.isArray(operation.fields));
  }
  assert.ok(EXECUTOR_SQUAD_CATALOG.some(item => item.app === 'gestor' && item.name === 'configure_agenda'));
  assert.equal(EXECUTOR_SQUAD_CATALOG.some(item => /meta.*(?:update|create)|create_campaign/.test(item.name)), false);
});

test('leitura CS mantém cliente, consulta, links e estado indisponível distinto de vazio', async () => {
  const f = fixture();
  const reading = await readExecutorSquad(f.caller, scope('cs', { view: 'radar' }));
  assert.equal(reading.available, true); assert.deepEqual(reading.data, [f.row]); assert.equal(reading.client_id, clientId);
  assert.ok(reading.queried_at); assert.match(reading.links[0].href, /cs-ia/);
  assert.ok(f.calls.every(call => call.authorization === 'Bearer synthetic-session'));
  const denied = await readExecutorSquad(fixture({ deny: true }).caller, scope('gestor', { view: 'goals' }));
  assert.equal(denied.available, false); assert.equal(denied.data, null);
});

test('consultar opções de tarefas nunca grava consentimento, usa NULL explícito', async () => {
  const f = fixture();
  const result = await readExecutorSquad(f.caller, scope('cs', { view: 'task_rules' }));
  assert.equal(result.available, true);
  const calls = f.calls.filter(call => /cs_ia_task_(?:move|creation|context)_options/.test(call.path));
  assert.equal(calls.length, 3);
  for (const call of calls) assert.deepEqual(call.body, { p_client_id: clientId, p_conversation_id: groupId, p_enabled: null });
});

test('métricas salvas do colaborador sem valor usam somente Edge segura e não atualização Meta', async () => {
  const f = fixture({ role: 'colaborador', spend: false });
  const result = await readExecutorSquad(f.caller, scope('gestor', { view: 'metrics', input: { account_id: '700', since: '2026-11-01', until: '2026-11-07' } }));
  assert.equal(result.available, true);
  const calls = f.calls.filter(call => call.path.startsWith('/functions'));
  assert.deepEqual(calls.map(call => call.body), [{ action: 'get-gestor-metrics', cliente_id: clientId, ad_account_id: 'act_700', time_range: { since: '2026-11-01', until: '2026-11-07' } }]);
});

test('regras CS alteram apenas pedido, preservam resto e fixam fotografia para CAS', async () => {
  const f = fixture();
  const proposal = await prepareExecutorSquad(f.caller, scope('cs', { action: 'save_settings', input: { quiet_days: 4 } }));
  assert.equal(proposal.operation, 'cs.update_settings'); assert.equal(proposal.payload.data.quiet_days, 4);
  assert.equal(proposal.payload.data.end_hour, 18); assert.equal(proposal.payload.expected.quiet_days, 3);
  assert.equal(proposal.preview.before.quiet_days, 3); assert.equal(proposal.preview.after.quiet_days, 4);
  assert.equal(setting.quiet_days, 3); assert.equal(proposal.effect.enables_autonomy, false);
});

test('controle global CS e consentimentos identificam autonomia sem mutar durante preparo', async () => {
  const f = fixture();
  const controls = await prepareExecutorSquad(f.caller, scope('cs', { action: 'save_task_controls', input: { task_automation_enabled: true } }));
  assert.equal(controls.payload.expected.task_controls_version, revision); assert.equal(controls.effect.enables_autonomy, true);
  const reading = await prepareExecutorSquad(f.caller, scope('cs', { action: 'configure_reading', input: { transcribe_new_audio: true } }));
  assert.deepEqual(reading.payload, { p_client_id: clientId, p_enabled: true, p_include_audio: true, p_conversation_id: groupId, p_transcribe_audio: true });
  assert.equal(reading.effect.external, true); assert.equal(reading.effect.enables_autonomy, true);
  assert.equal(reading.before.version,'a'.repeat(32));
  assert.equal(reading.before.reading.enabled,true);
  assert.deepEqual(f.calls.find(call => call.path.endsWith('/atlas_executor_cs_reading_snapshot'))?.body,{ p_client_id:clientId,p_conversation_id:groupId });
});

test('canal e vínculo usam versões atuais e comprovam grupo por identidade completa', async () => {
  const f = fixture({ rpc: { cs_ia_group_inventory: [{ id: groupId, wa_cliente_id: tenantId, whatsapp_config_id: channelId, chat_jid: 'fixture@g.us' }] } });
  const channel = await prepareExecutorSquad(f.caller, scope('cs', { action: 'set_channel_following', input: { channel_id: channelId, enabled: true } }));
  assert.deepEqual(channel.payload, { p_channel_id: channelId, p_enabled: true, p_version: 'channel-version' });
  const binding = await prepareExecutorSquad(f.caller, scope('cs', { action: 'set_group_binding', input: { conversation_id: groupId } }));
  assert.deepEqual(binding.payload, { p_client_id: clientId, p_conversation_id: groupId, p_wa_client_id: tenantId, p_channel_id: channelId, p_group_jid: 'fixture@g.us', p_version: 'binding-version' });
});

test('meta editada preserva campos e principal, versão vem da fonte atual', async () => {
  const f = fixture();
  const proposal = await prepareExecutorSquad(f.caller, scope('gestor', { action: 'save_goal', input: { id: goalId, name: 'Novo nome' } }));
  assert.equal(proposal.operation, 'gestor_ia_salvar_meta'); assert.equal(proposal.payload.p_name, 'Novo nome');
  assert.equal(proposal.payload.p_budget_cents, 90000); assert.equal(proposal.payload.p_is_primary, true);
  assert.deepEqual(proposal.payload.p_campaign_ids, ['501']); assert.equal(proposal.before.updated_at, stamp);
  assert.equal(goal.name, 'Meta atual');
  const adjusted = await prepareExecutorSquad(f.caller, scope('gestor', { action: 'adjust_goal', input: { id: goalId, budget_cents: 100000 } }));
  assert.equal(adjusted.payload.p_expected_updated_at, stamp); assert.equal(adjusted.payload.p_result_target, null);
  await assert.rejects(prepareExecutorSquad(f.caller, scope('gestor', { action: 'adjust_goal', input: { id: goalId, budget_cents: 1, result_target: 2 } })));
});

test('agenda preserva dias/categorias omitidos, revisão e efeitos IA são explícitos', async () => {
  const f = fixture();
  const proposal = await prepareExecutorSquad(f.caller, scope('gestor', { action: 'configure_agenda', input: { account_id: '700', run_time: '07:15' } }));
  assert.equal(proposal.payload.p_revision, 4); assert.deepEqual(proposal.payload.p_categories, ['custo','verba']);
  assert.deepEqual(proposal.payload.p_weekdays, [1,3,5]); assert.equal(proposal.payload.p_enabled, false);
  const ai = await prepareExecutorSquad(f.caller, scope('gestor', { action: 'configure_agenda', input: { account_id: '700', enabled: true, categories: ['ia'] } }));
  assert.equal(ai.effect.enables_autonomy, true); assert.equal(ai.effect.external, true);
});

test('modelos preservam indicadores e vínculos de cliente usam revisão atual', async () => {
  const f = fixture();
  const proposal = await prepareExecutorSquad(f.caller, scope('gestor', { action: 'save_report_model', input: { id: modelId, tone: 'Direto' } }));
  assert.equal(proposal.payload.p_revision, 3); assert.deepEqual(proposal.payload.p_config.metrics, model.metrics);
  assert.equal(proposal.payload.p_config.include_routine, true); assert.equal(proposal.payload.p_config.tone, 'Direto');
  const clientModel = await prepareExecutorSquad(f.caller, scope('gestor', { action: 'set_client_report_model', input: { model_id: null } }));
  assert.deepEqual(clientModel.payload, { p_client_id: clientId, p_model_id: null, p_revision: 2 });
});

test('decisão fixa revisão e mantém efeitos de aprovação distintos de execução da campanha', async () => {
  const f = fixture();
  const proposal = await prepareExecutorSquad(f.caller, scope('gestor', { action: 'update_decision', input: { id: decisionId, status: 'approved' } }));
  assert.equal(proposal.operation, 'gestor.update_decision'); assert.equal(proposal.payload.expected.revision, 2);
  assert.equal(proposal.payload.data.status, 'approved'); assert.equal(proposal.effect.external, false);
  assert.equal(proposal.payload.data.task_id, null);
});

test('portal exige campo valor e gestão, configura revisão sem publicar no preparo', async () => {
  const f = fixture();
  const proposal = await prepareExecutorSquad(f.caller, scope('gestor', { action: 'configure_portal_metrics', input: { shared: true, objective: 'leads' } }));
  assert.deepEqual(proposal.payload, { p_client_id: clientId, p_shared: true, p_objective: 'leads', p_revision: 2 });
  assert.equal(proposal.effect.external, true);
  await assert.rejects(prepareExecutorSquad(fixture({ spend: false }).caller, scope('gestor', { action: 'configure_portal_metrics', input: { shared: true, objective: 'leads' } })));
});

test('fontes da rotina e memória preservam cliente e cobertura limitada', async () => {
  const f = fixture({ tables: { atlas_memories: [{ id: id(12), owner_id: actorId, client_id: clientId, state: 'active', content: 'Fato. token=secret-value', version: 1 }] } });
  const routine = await readExecutorSquad(f.caller, scope('gestor', { view: 'routine' }));
  assert.equal(routine.data.clients.length, 1); assert.equal(routine.data.clients[0].id, clientId);
  const memory = await readExecutorSquad(f.caller, scope('gestor', { view: 'memory' }));
  assert.equal(memory.data[0].content.includes('secret-value'), false); assert.equal(memory.coverage.complete, false);
});

test('operação desconhecida, escopo injetado, segredo, versão velha e vínculo revogado falham fechados', async () => {
  const f = fixture();
  for (const input of [{ client_id: id(99) }, { p_action: 'unsafe' }, { token: 'secret' }, { tone: 'Bearer secret-value' }]) {
    await assert.rejects(prepareExecutorSquad(f.caller, scope('gestor', { action: 'save_report_model', input })));
  }
  await assert.rejects(prepareExecutorSquad(f.caller, scope('gestor', { action: 'save_goal', input: { id: goalId, expected_updated_at: '2020-01-01T00:00:00Z', name: 'X' } })));
  await assert.rejects(prepareExecutorSquad(fixture({ rpc: { gestor_ia_pode_usar_metas: false } }).caller, scope('gestor', { action: 'save_goal', input: { id: goalId, name: 'X' } })));
  await assert.rejects(prepareExecutorSquad(f.caller, scope('gestor', { action: 'update_meta', input: {} })));
  const unknown = await readExecutorSquad(f.caller, scope('gestor', { view: 'unknown' }));
  assert.equal(unknown.available, false);
  await assert.rejects(prepareExecutorSquad(fixture({ role: 'colaborador' }).caller, scope('cs', { action: 'set_health', input: { manual_status: 'critico' } })));
});

test('demais leituras catalogadas usam fontes nativas e páginas limitadas sem mutação', async () => {
  const f = fixture();
  const inputs = { sources:{ source:'crm' },response_times:{ days:7 },groups:{ status:'unlinked' },reports:{ since:'2026-11-01',until:'2026-11-07' },
    report_reading:{ since:'2026-11-01',until:'2026-11-07' },portal_preview:{ objective:'leads' },routine_history:{ before:'2026-11-09' } };
  for (const operation of EXECUTOR_SQUAD_CATALOG.filter(item => item.mode === 'read' && !['metrics'].includes(item.name))) {
    const reading = await readExecutorSquad(f.caller,scope(operation.app,{ view:operation.name,input:inputs[operation.name] || {} }));
    assert.equal(reading.available,true, `${operation.app}.${operation.name}: ${reading.reason}`);
  }
  assert.equal(f.calls.some(call => !['GET','POST'].includes(call.method)),false);
  assert.equal(f.calls.some(call => call.body?.p_enabled !== undefined && call.body.p_enabled !== null),false);
});

test('saúde, equipe e regras de tarefas preparam argumentos oficiais e versões completas', async () => {
  const f = fixture();
  const health = await prepareExecutorSquad(f.caller,scope('cs',{ action:'set_health',input:{ manual_status:'critico' } }));
  assert.deepEqual(health.payload,{ data:{ manual_status:'critico' },expected:{ manual_status:null,updated_at:stamp } });
  const label = await prepareExecutorSquad(f.caller,scope('cs',{ action:'save_team_label',input:{ id:id(11),name:'Pós-venda' } }));
  assert.deepEqual(label.payload,{ p_id:id(11),p_kind:'cargo',p_name:'Pós-venda',p_archived:false,p_version:revision });
  const person = await prepareExecutorSquad(f.caller,scope('cs',{ action:'save_team_person',input:{ profile_id:actorId,label_ids:[id(11)] } }));
  assert.deepEqual(person.payload,{ p_profile_id:actorId,p_label_ids:[id(11)],p_expected_ids:[] });
  for (const action of ['configure_task_moves','configure_task_creation','configure_task_context']) {
    const result = await prepareExecutorSquad(f.caller,scope('cs',{ action,input:{ enabled:true } }));
    assert.deepEqual(result.payload,{ p_client_id:clientId,p_conversation_id:groupId,p_enabled:true });
    assert.equal(result.before.version,'a'.repeat(32));
  }
  const analysis = await prepareExecutorSquad(f.caller,scope('cs',{ action:'save_analysis_settings',input:{ transcription_enabled:true } }));
  assert.deepEqual(analysis.payload,{ data:{ reading_enabled:true,transcription_enabled:true },expected:{ reading_enabled:true,transcription_enabled:false,version:revision } });
});

test('fontes malformadas não viram leitura disponível', async () => {
  const broken = await readExecutorSquad(fixture({ rpc:{ cs_ia_client_sources:{} } }).caller,scope('cs',{ view:'sources',input:{ source:'crm' } }));
  assert.equal(broken.available,false);
});

test('permissão explícita de canal negada não prepara alteração', async () => {
  await assert.rejects(prepareExecutorSquad(fixture({ rpc:{ cs_ia_connection_summary:[{ id:channelId,following:false,version:'v',can_configure:false }] } }).caller,
    scope('cs',{ action:'set_channel_following',input:{ channel_id:channelId,enabled:true } })));
});

test('horário com segundos não é truncado para parecer válido', async () => {
  await assert.rejects(prepareExecutorSquad(fixture().caller,scope('gestor',{ action:'configure_agenda',input:{ account_id:'700',run_time:'07:15:59' } })));
});

test('consentimento sem versão opaca autoritativa é recusado antes de revisar',async () => {
  const f = fixture({ rpc:{ atlas_executor_cs_reading_snapshot:{ reading:{ enabled:true },version:null } } });
  await assert.rejects(prepareExecutorSquad(f.caller,scope('cs',{ action:'configure_reading',input:{ enabled:false } })));
});

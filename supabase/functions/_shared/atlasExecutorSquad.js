import { AtlasError, optionalUuid } from './atlasCore.js';

const SETTINGS = ['healthy_min','result_min','attention_min','score_drop','quiet_days','critical_quiet_days','start_hour','end_hour','weekends','radar_enabled'];
const TASK_CONTROLS = ['task_board_enabled','task_automation_enabled'];
const GOALS = ['name','objective','scope','campaign_ids','cost_cents','budget_cents','result_target','is_active','is_primary'];
const MODELS = ['name','window_key','metrics','tone','compare_previous','include_creatives','include_routine'];
const DECISIONS = ['status','task_id','verdict','verdict_note'];
const OBJECTIVES = ['leads','mensagens','compras','trafego','alcance','engajamento','video','perfil_instagram'];
const METRICS = ['reach','impressions','clicks','result','cost','spend','messages','leads','ctr','cpc'];
const READS = {
  cs: {
    radar: ['cs_ia_radar_snapshot', []], health: ['cs_ia_radar_snapshot', []], history: ['cs_ia_daily', []],
    sources: ['cs_ia_client_sources', ['source']], team: ['cs_ia_team_structure', []], response_times: ['cs_ia_team_response_times', ['days']],
    groups: ['cs_ia_group_inventory', ['status','after']], connections: ['cs_ia_connection_summary', []], settings: ['cs_ia_settings', []],
    analysis_settings: ['cs_ia_analysis_settings', []], reading: ['cs_ia_get_reading', []], reading_signals: ['cs_ia_reading_signals', []],
    group_binding: ['cs_ia_group_binding', []], task_rules: ['cs_ia_task_move_options', []],
    segments: ['cs_ia_portfolio_segments', []], churn: ['cs_ia_churn_list', []],
    group_requests: ['cs_ia_atlas_group_requests', []], group_activity: ['cs_ia_atlas_group_activity', []],
  },
  gestor: {
    accounts: ['gestor-ia-meta', []], metrics: ['gestor-ia-meta', ['account_id','since','until']],
    goals: ['gestor_ia_metas_campanha', ['account_id']], agenda: ['gestor_ia_agendas', ['account_id']],
    decisions: ['gestor_ia_decisoes', []], reports: ['gestor_ia_listar_pdfs', ['since','until','reviewed','offset']],
    report_reading: ['gestor-ia-meta', ['account_id','since','until','compare']], report_models: ['gestor_ia_modelos_relatorio', []],
    client_report_model: ['gestor_ia_modelos_por_cliente', []], memory: ['atlas_memories', []], routine: ['traffic_weekly_board', []],
    routine_history: ['traffic_routine_client_history', ['before','limit']],
    portal: ['gestor_ia_consultar_metricas_portal', []], portal_preview: ['gestor-ia-meta', ['objective']],
  },
};
const WRITES = {
  cs: {
    set_health: ['cs.update_relationship', ['manual_status']], save_settings: ['cs.update_settings', SETTINGS],
    save_task_controls: ['cs.update_task_controls', [...TASK_CONTROLS,'version']],
    save_analysis_settings: ['cs.update_analysis_settings', ['reading_enabled','transcription_enabled','version']],
    set_channel_following: ['cs_ia_set_channel_following', ['channel_id','enabled','version']],
    set_group_binding: ['cs_ia_set_group_binding', ['conversation_id','version']],
    configure_reading: ['cs_ia_reading_settings', ['enabled','include_audio','transcribe_new_audio','conversation_id']],
    configure_task_moves: ['cs_ia_task_move_options', ['enabled']], configure_task_creation: ['cs_ia_task_creation_options', ['enabled']],
    configure_task_context: ['cs_ia_task_context_options', ['enabled']],
    save_team_label: ['cs_ia_save_team_label', ['id','kind','name','archived','version']],
    save_team_person: ['cs_ia_save_team_person', ['profile_id','label_ids']],
  },
  gestor: {
    save_goal: ['gestor_ia_salvar_meta', ['id','account_id','expected_updated_at',...GOALS]],
    adjust_goal: ['gestor_ia_ajustar_meta', ['id','expected_updated_at','budget_cents','result_target']],
    configure_agenda: ['gestor_ia_configurar_agenda', ['account_id','enabled','run_time','weekdays','categories','revision']],
    save_report_model: ['gestor_ia_salvar_modelo_relatorio', ['id','revision',...MODELS]],
    set_client_report_model: ['gestor_ia_configurar_modelo_cliente', ['model_id','revision']],
    update_decision: ['gestor.update_decision', ['id','revision',...DECISIONS]],
    configure_portal_metrics: ['gestor_ia_configurar_metricas_portal', ['shared','objective','revision']],
  },
};
const TITLES = {
  radar: 'Radar de CS', health: 'Saúde do cliente', history: 'Diário de saúde', sources: 'Fontes da ficha', team: 'Equipe de CS', response_times: 'Tempos de resposta',
  groups: 'Inventário de grupos', connections: 'Acompanhamento dos canais', settings: 'Regras do radar', analysis_settings: 'Controles globais de leitura',
  reading: 'Leitura autorizada do grupo', reading_signals: 'Sinais das conversas', group_binding: 'Grupo vinculado', task_rules: 'Regras de tarefas por WhatsApp',
  segments: 'Segmentos da carteira', churn: 'Relacionamentos encerrados', group_requests: 'Pedidos do grupo no Atlas', group_activity: 'Fila Atlas do grupo',
  accounts: 'Contas Meta salvas', metrics: 'Métricas Meta salvas', goals: 'Metas de campanha', agenda: 'Agenda de decisões', decisions: 'Decisões de tráfego',
  reports: 'PDFs salvos', report_reading: 'Leitura salva para relatório', report_models: 'Modelos de relatório', client_report_model: 'Modelo do cliente',
  memory: 'Memória Atlas do cliente', routine: 'Rotina semanal', routine_history: 'Histórico da rotina', portal: 'Compartilhamento de métricas', portal_preview: 'Prévia das métricas do portal',
  set_health: 'Alterar saúde manual', save_settings: 'Alterar regras do radar', save_task_controls: 'Alterar controles de tarefas',
  save_analysis_settings: 'Alterar controles de análise', set_channel_following: 'Alterar acompanhamento do canal', set_group_binding: 'Alterar grupo vinculado',
  configure_reading: 'Alterar leitura e áudio do grupo', configure_task_moves: 'Alterar movimentação por comando', configure_task_creation: 'Alterar criação de tarefas',
  configure_task_context: 'Alterar movimentação pelo contexto', save_team_label: 'Salvar cargo ou squad', save_team_person: 'Alterar organização da pessoa',
  save_goal: 'Salvar meta de campanha', adjust_goal: 'Ajustar cenário da meta', configure_agenda: 'Configurar agenda de decisões',
  save_report_model: 'Salvar modelo de relatório', set_client_report_model: 'Alterar modelo do cliente', update_decision: 'Atualizar decisão registrada',
  configure_portal_metrics: 'Alterar métricas no portal',
};
const NOTES = {
  metrics: 'Leitura salva; account_id, since e until obrigatórios. Não coleta Meta.',
  sources: 'source: crm ou arquivos. Fonte resumida: até cinco itens, não arquivo integral.',
  groups: 'status: unlinked ou archived; after é cursor UUID. Inventário autorizado, não apenas o cliente atual.',
  task_rules: 'Consulta as três autorizações com p_enabled NULL; nunca concede consentimento.',
  memory: 'Até 50 versões ativas recentes do titular; não representa todo o arquivo.',
  save_goal: 'Valores monetários em centavos, positivos; objetivo/scope/campaign_ids devem ser coerentes. Edição preserva omitidos; principal desmarca outra meta principal do cliente. Usa fotografia atual para CAS.',
  adjust_goal: 'id obrigatório; exatamente um de budget_cents ou result_target positivo. Usa updated_at atual como versão.',
  configure_agenda: 'account_id obrigatório, horário HH:MM de Brasília, weekdays ISO 1–7, categories: escala,custo,verba,criativo,ia,descoberta. Preserva omitidos e revisão atual; exige sessão real e titular Atlas.',
  configure_reading: 'Preserva opções omitidas; grupo deve ser o vínculo atual. Fotografia opaca versionada impede reutilizar consentimento alterado. Áudio/transcrição podem gerar custo.',
  set_channel_following: 'channel_id e enabled obrigatórios; usa versão atual. Reativar redefine marcos temporais das leituras.',
  set_group_binding: 'conversation_id UUID ou NULL para remover. Resolve canal, tenant e JID da fonte autorizada e fixa a versão atual.',
  save_team_label: 'kind cargo ou squad; name 2–60; nova entrada sem id/version. Edição usa versão atual.',
  save_team_person: 'profile_id e label_ids UUID; fixa vínculos anteriores esperados. Um cargo por pessoa.',
  save_report_model: 'name 1–80, window_key last7|lastWeek|month|lastMonth, metrics únicos, tone até 240 e três booleans. Preserva omitidos e revisão.',
  set_client_report_model: 'model_id UUID ou NULL. Fixa revisão do vínculo atual.',
  update_decision: 'id obrigatório. Atualiza somente status/task_id/verdict/verdict_note com revisão atual; não executa campanha nem conclui tarefa.',
  configure_portal_metrics: 'shared boolean; objective entre os oito objetivos. Fixa revisão atual; compartilhar expõe números ao cliente.',
};
export const EXECUTOR_SQUAD_CATALOG = Object.entries({ read: READS, write: WRITES }).flatMap(([mode, apps]) =>
  Object.entries(apps).flatMap(([app, entries]) => Object.entries(entries).map(([name, [operation, fields]]) => ({
    app, mode, name, operation, title: TITLES[name], fields,
    description: NOTES[name] || `${TITLES[name]}. Usa fonte oficial e permissões atuais; campos omitidos são preservados na preparação.`,
  }))));

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value) && [Object.prototype,null].includes(Object.getPrototypeOf(value));
const pick = (value, fields) => Object.fromEntries(fields.filter(key => Object.hasOwn(value || {}, key)).map(key => [key,value[key]]));
const secretKey = /secret|password|senha|authorization|service_role|(?:^|_)token(?:$|_)|raw_payload|^__proto__$|^constructor$|^prototype$/i;
const secretText = /\b(?:sk-[a-z0-9_-]{12,}|eyJ[a-z0-9_.-]{30,}|Bearer\s+\S+)|\b(?:senha|password|api.?key|token)\s*[:=]\s*\S+/gi;
const fail = (message, code = 'INVALID_INPUT', status = 400) => { throw new AtlasError(code, message, status); };
function uuid(value, label, required = true) {
  const result = optionalUuid(value, label);
  if (required && !result) fail(`Informe ${label}.`);
  return result;
}
function inputFor(input, fields) {
  if (!object(input) || JSON.stringify(input).length > 18000 || Object.keys(input).some(key => !fields.includes(key))) fail('Campos não permitidos nesta operação do Squad.');
  const check = (value, depth = 0) => {
    if (depth > 5) fail('Conteúdo do Squad muito profundo.');
    if (typeof value === 'string' && value.replace(secretText, '[segredo removido]') !== value) fail('Não inclua credenciais no pedido.');
    if (Array.isArray(value)) value.forEach(item => check(item, depth + 1));
    else if (object(value)) for (const [key,item] of Object.entries(value)) {
      if (secretKey.test(key) || /^(?:client_id|cliente_id|clientId|rpc|sql|table|p_action|p_payload)$/i.test(key)) fail('Escopo ou credencial não permitido.');
      check(item, depth + 1);
    }
    else if (value !== null && !['string','number','boolean','undefined'].includes(typeof value)) fail('Valor inválido.');
    if (typeof value === 'number' && !Number.isFinite(value)) fail('Número inválido.');
  };
  check(input);
  return structuredClone(input);
}
function sanitize(value, state, depth = 0) {
  if (depth > 10) { state.truncated = true; return '[conteúdo limitado]'; }
  if (typeof value === 'string') { if (value.length > 12000) state.truncated = true; return value.slice(0,12000).replace(secretText,'[segredo removido]'); }
  if (Array.isArray(value)) { if (value.length > 200) state.truncated = true; return value.slice(0,200).map(item => sanitize(item,state,depth + 1)); }
  if (object(value)) return Object.fromEntries(Object.entries(value).filter(([key]) => !secretKey.test(key)).map(([key,item]) => [key,sanitize(item,state,depth + 1)]));
  return value;
}
async function query(request, signal) {
  signal?.throwIfAborted();
  const { data,error } = await (signal && request.abortSignal ? request.abortSignal(signal) : request);
  signal?.throwIfAborted();
  if (error) fail('A fonte oficial está indisponível.', error.code === '42501' ? 'SQUAD_FORBIDDEN' : 'CONTEXT_UNAVAILABLE', error.code === '42501' ? 403 : 502);
  return data;
}
const rpc = (caller,name,payload,signal) => query(caller.rpc(name,payload),signal);
const one = (caller,table,fields,filters,signal) => query(filters(caller.from(table).select(fields)).maybeSingle(),signal);
async function rows(request,signal) {
  const data = await query(request,signal);
  if (!Array.isArray(data)) fail('Lista oficial incompleta.','CONTEXT_UNAVAILABLE',502);
  return data;
}
const accountId = value => typeof value === 'string' && /^(act_)?\d{1,32}$/.test(value) ? `act_${value.replace(/^act_/,'')}` : fail('Conta Meta inválida.');
function period(input) {
  for (const key of ['since','until']) {
    const value = input[key], date = new Date(`${value}T12:00:00Z`);
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0,10) !== value) fail('Escolha um período válido.');
  }
  if (input.since > input.until || Date.parse(input.until) - Date.parse(input.since) > 366 * 86400000) fail('Período inválido.');
  return pick(input,['since','until']);
}
function boolean(value,label) { if (typeof value !== 'boolean') fail(`Revise ${label}.`); return value; }
function text(value,label,max,min = 1) {
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max || /[\p{C}]/u.test(value)) fail(`Revise ${label}.`);
  return value.trim();
}
function integer(value,label,min = 1,max = 2147483647) { if (!Number.isSafeInteger(value) || value < min || value > max) fail(`Revise ${label}.`); return value; }
function expected(input,key,current) { if (Object.hasOwn(input,key) && input[key] !== current) fail('A fonte mudou. Atualize e prepare uma nova proposta.','CONFLICT',409); }
const links = (app,clientId,view) => [{ label: `Abrir no ${app === 'cs' ? 'CS IA' : 'Gestor IA'}`, href: app === 'cs'
  ? clientId ? `/cs-ia/clientes/${encodeURIComponent(clientId)}${view === 'goals' ? '?aba=metas' : ''}` : '/cs-ia/hoje'
  : clientId ? `/gestor-ia/clientes/${encodeURIComponent(clientId)}?tab=${({ agenda:'decisoes',goals:'metas',memory:'memoria',reports:'relatorios',report_models:'relatorios' })[view] || 'resumo'}` : '/gestor-ia' }];

async function authorize(caller,app,clientId,signal) {
  const active = await rpc(caller,'planeje_current_account_access',{},signal);
  if (active !== true) fail('Sessão ativa necessária.','SQUAD_FORBIDDEN',403);
  signal?.throwIfAborted();
  const { data: auth,error } = await caller.auth.getUser();
  if (error || !auth?.user?.id) fail('Sessão inválida.','SQUAD_FORBIDDEN',403);
  const actorId = auth.user.id;
  const profile = await one(caller,'profiles','id,role,status',q => q.eq('id',actorId),signal);
  if (profile?.status !== 'active' || !['admin','superadmin','colaborador'].includes(profile.role)) fail('Acesso da equipe necessário.','SQUAD_FORBIDDEN',403);
  const module = async name => {
    const [global,personal] = await Promise.all([
      one(caller,'module_settings','is_enabled',q => q.eq('module_name',name),signal),
      one(caller,'user_module_permissions','is_enabled',q => q.eq('module_name',name).eq('user_id',actorId),signal),
    ]);
    if ((personal?.is_enabled ?? global?.is_enabled ?? true) !== true) fail('Módulo indisponível para esta sessão.','SQUAD_FORBIDDEN',403);
  };
  await Promise.all((app === 'cs' ? ['clients','atendimento'] : ['paid_traffic']).map(module));
  let csRow;
  if (clientId) {
    if (app === 'cs') {
      const data = await rows(caller.rpc('cs_ia_radar').eq('client_id',clientId).limit(1),signal);
      csRow = data.find(row => row.client_id === clientId);
      if (!csRow) fail('Cliente fora da carteira CS atual.','SQUAD_FORBIDDEN',403);
    } else {
      if (await rpc(caller,'central_trafego_can_access_client',{ p_cliente_id:clientId },signal) !== true) fail('Cliente fora da carteira de tráfego.','SQUAD_FORBIDDEN',403);
      const client = await one(caller,'clientes','id,etapa',q => q.eq('id',clientId).eq('etapa','closed'),signal);
      if (client?.id !== clientId) fail('Cliente ativo indisponível.','SQUAD_FORBIDDEN',403);
    }
  }
  const manage = () => { if (!['admin','superadmin'].includes(profile.role)) fail('Somente a gestão pode configurar esta operação.','SQUAD_FORBIDDEN',403); };
  const field = async (name,fallback = true) => {
    if (profile.role === 'superadmin') return;
    const [base,personal] = await Promise.all([
      one(caller,'client_field_permissions','can_view',q => q.eq('role',profile.role).eq('field_name',name),signal),
      one(caller,'user_client_field_permissions','can_view',q => q.eq('user_id',actorId).eq('field_name',name),signal),
    ]);
    if ((personal?.can_view ?? base?.can_view ?? fallback) !== true) fail('Campo indisponível para esta sessão.','SQUAD_FORBIDDEN',403);
  };
  const atlas = async () => {
    await module('assistant');
    if (await rpc(caller,'atlas_is_owner',{},signal) !== true) fail('Titular Atlas necessário.','SQUAD_FORBIDDEN',403);
    const config = await one(caller,'atlas_settings','enabled',q => q.eq('owner_id',actorId),signal);
    if (config?.enabled !== true) fail('Atlas indisponível.','SQUAD_FORBIDDEN',403);
  };
  const report = async () => { manage(); await Promise.all([module('reports'),field('meta_resumo'),field('valor',false)]); };
  const goal = async () => { manage(); if (!clientId || await rpc(caller,'gestor_ia_pode_usar_metas',{ p_client_id:clientId },signal) !== true) fail('Metas indisponíveis neste escopo.','SQUAD_FORBIDDEN',403); };
  return { actorId,profile,csRow,module,manage,field,atlas,report,goal };
}
async function linkedAccount(caller,clientId,value,signal) {
  const account = accountId(value);
  const data = await rows(caller.from('cliente_meta_accounts').select('cliente_id,meta_account_id,meta_account_name,is_active').eq('cliente_id',clientId).eq('is_active',true).in('meta_account_id',[account,account.slice(4)]),signal);
  if (!data.some(row => row.cliente_id === clientId && row.is_active === true && accountId(row.meta_account_id) === account)) fail('Conta Meta não vinculada ao cliente.','SQUAD_FORBIDDEN',403);
  return account;
}
function groupArgs(clientId,row) {
  if (row?.group_status !== 'linked') fail('Confira o vínculo atual do grupo.');
  return { p_client_id:clientId,p_conversation_id:uuid(row.conversation_id,'conversation_id'),p_wa_client_id:uuid(row.wa_client_id,'wa_client_id'),p_channel_id:uuid(row.channel_id,'channel_id') };
}
async function meta(caller,body,signal) {
  signal?.throwIfAborted();
  const { data,error } = await caller.functions.invoke('gestor-ia-meta',{ body,signal });
  signal?.throwIfAborted();
  if (error || data?.error || !object(data)) fail('Leitura Meta salva indisponível.','CONTEXT_UNAVAILABLE',502);
  return data;
}
async function readingSnapshot(caller,clientId,conversationId,signal) {
  const result = await rpc(caller,'atlas_executor_cs_reading_snapshot',{ p_client_id:clientId,p_conversation_id:conversationId ?? null },signal);
  if (!object(result?.reading) || typeof result.version !== 'string' || !/^[a-f0-9]{32}$/.test(result.version)) fail('Versão atual dos consentimentos indisponível.','CONTEXT_UNAVAILABLE',502);
  return result;
}

export async function readExecutorSquad(caller,{ app,clientId,view,input = {},signal }) {
  if (!Object.hasOwn(READS,app)) fail('Aplicativo do Squad inválido.','TOOL_DENIED',403);
  clientId = uuid(clientId,'client_id',false);
  const result = { app,view,client_id:clientId,queried_at:new Date().toISOString(),available:false,data:null,links:links(app,clientId,view) };
  if (!Object.hasOwn(READS[app],view)) return { ...result,reason:'Esta leitura ainda não tem contrato disponível.' };
  input = inputFor(input,READS[app][view][1]);
  const globalViews = app === 'cs' ? ['radar','segments','churn','team','response_times','groups','connections','settings','analysis_settings'] : ['report_models'];
  if (!clientId && !globalViews.includes(view)) fail('Selecione um cliente para esta leitura.');
  let complete = true;
  try {
    const access = await authorize(caller,app,clientId,signal);
    let data;
    if (app === 'cs') {
      if (['radar','health','segments','churn','connections','reading_signals'].includes(view)) {
        const operation = READS.cs[view][0], key = ['connections','churn'].includes(view) ? 'id' : 'client_id';
        let request = caller.rpc(operation).order(key).limit(201);
        if (clientId && !['connections'].includes(view)) request = request.eq('client_id',clientId);
        data = await rows(request,signal); complete = data.length < 201;
      } else if (view === 'history') {
        data = await rows(caller.from('cs_ia_daily').select('operational_date,captured_at,score,health,signal,factors').eq('client_id',clientId).order('operational_date',{ ascending:false }).limit(90),signal); complete = false;
      } else if (view === 'settings') data = await one(caller,'cs_ia_settings',['id',...SETTINGS,...TASK_CONTROLS,'task_controls_version'].join(','),q => q.eq('id',1),signal);
      else if (view === 'analysis_settings') data = await one(caller,'cs_ia_analysis_settings','id,reading_enabled,transcription_enabled,version',q => q.eq('id',1),signal);
      else if (view === 'sources') {
        if (!['crm','arquivos'].includes(input.source)) fail('Escolha crm ou arquivos.');
        data = await rpc(caller,'cs_ia_client_sources',{ p_client_id:clientId,p_source:input.source },signal); complete = false;
        if (!Array.isArray(data?.items) || input.source === 'crm' && !object(data.totals)) fail('Fonte resumida incompleta.','CONTEXT_UNAVAILABLE',502);
      } else if (view === 'team') data = await rpc(caller,'cs_ia_team_structure',{},signal);
      else if (view === 'response_times') {
        if (![7,30].includes(input.days)) fail('Escolha 7 ou 30 dias.');
        data = await rpc(caller,'cs_ia_team_response_times',{ p_days:input.days },signal);
      } else if (view === 'groups') {
        if (!['unlinked','archived'].includes(input.status || 'unlinked')) fail('Estado do inventário inválido.');
        data = await rpc(caller,'cs_ia_group_inventory',{ p_status:input.status || 'unlinked',p_after:uuid(input.after,'after',false) },signal); complete = false;
      } else if (view === 'reading' || view === 'group_binding') data = await rpc(caller,READS.cs[view][0],{ p_client_id:clientId },signal);
      else if (view === 'task_rules') {
        await access.module('tasks'); groupArgs(clientId,access.csRow);
        data = Object.fromEntries(await Promise.all(['move','creation','context'].map(async kind => [kind,await rpc(caller,`cs_ia_task_${kind}_options`,{ p_client_id:clientId,p_conversation_id:access.csRow.conversation_id,p_enabled:null },signal)])));
      } else data = await rpc(caller,READS.cs[view][0],groupArgs(clientId,access.csRow),signal);
    } else {
      if (['accounts','metrics','report_reading','portal_preview'].includes(view)) {
        await access.field('meta_resumo');
        if (['report_reading','portal_preview'].includes(view)) await access.report();
        const body = { action:({ accounts:'get-gestor-accounts-overview',metrics:'get-gestor-metrics',report_reading:'get-gestor-report-reading',portal_preview:'get-gestor-portal-metrics-preview' })[view],cliente_id:clientId };
        if (view === 'metrics' || input.account_id) body.ad_account_id = await linkedAccount(caller,clientId,input.account_id,signal);
        if (['metrics','report_reading'].includes(view)) body.time_range = period(input);
        if (view === 'report_reading' && input.compare !== undefined) body.compare = boolean(input.compare,'comparação');
        if (view === 'portal_preview') { if (!OBJECTIVES.includes(input.objective)) fail('Objetivo inválido.'); body.objective = input.objective; }
        data = await meta(caller,body,signal); complete = false;
      } else if (view === 'goals') {
        await access.goal();
        let request = caller.from('gestor_ia_metas_campanha').select(['id','client_id','account_id',...GOALS,'updated_at'].join(',')).eq('client_id',clientId);
        if (input.account_id) request = request.eq('account_id',await linkedAccount(caller,clientId,input.account_id,signal));
        data = await rows(request.order('id').limit(201),signal); complete = data.length < 201;
      } else if (view === 'agenda') {
        access.manage(); await access.atlas();
        let request = caller.from('gestor_ia_agendas').select('id,client_id,account_id,enabled,run_time,weekdays,categories,revision,last_day,last_run_at,last_state,last_count').eq('owner_id',access.actorId).eq('client_id',clientId);
        if (input.account_id) request = request.eq('account_id',await linkedAccount(caller,clientId,input.account_id,signal));
        data = await rows(request.order('id').limit(201),signal); complete = data.length < 201;
      } else if (view === 'decisions') {
        await Promise.all([access.field('meta_resumo'),access.field('valor')]);
        data = await rows(caller.from('gestor_ia_decisoes').select('id,client_id,source_key,origin,title,payload,status,task_id,verdict,verdict_note,history,revision,created_at').eq('owner_id',access.actorId).eq('client_id',clientId).order('id').limit(201),signal); complete = data.length < 201;
      } else if (view === 'reports') {
        await access.report(); period(input);
        data = await rpc(caller,'gestor_ia_listar_pdfs',{ p_client_id:clientId,p_since:input.since,p_until:input.until,p_reviewed:input.reviewed === undefined ? null : boolean(input.reviewed,'revisão'),p_offset:integer(input.offset ?? 0,'página',0,100000) },signal); complete = false;
      } else if (view === 'report_models') {
        await access.report(); data = await rows(caller.from('gestor_ia_modelos_relatorio').select(['id','revision',...MODELS].join(',')).order('name').order('id').limit(201),signal); complete = data.length < 201;
      } else if (view === 'client_report_model') {
        await access.report(); data = await one(caller,'gestor_ia_modelos_por_cliente','model_id,revision',q => q.eq('client_id',clientId),signal) || { model_id:null,revision:0 };
      } else if (view === 'memory') {
        await access.atlas();
        data = await rows(caller.from('atlas_memories').select('id,content,source,state,created_at,confirmed_at,learning_kind,team_shared,version,replaces_id').eq('owner_id',access.actorId).eq('client_id',clientId).eq('state','active').order('created_at',{ ascending:false }).order('id').limit(50),signal); complete = false;
      } else if (view === 'routine') {
        const board = await rpc(caller,'traffic_weekly_board',{},signal);
        if (!Array.isArray(board?.clients) || !Array.isArray(board?.reviews)) fail('Rotina incompleta.','CONTEXT_UNAVAILABLE',502);
        data = { ...board,clients:board.clients.filter(row => row.id === clientId),reviews:board.reviews.filter(row => row.client_id === clientId) };
      } else if (view === 'routine_history') {
        const before = input.before;
        if (typeof before !== 'string' || !Number.isFinite(Date.parse(before))) fail('Data de corte inválida.');
        data = await rpc(caller,'traffic_routine_client_history',{ p_client:clientId,p_kind:'review',p_before:before,p_limit:integer(input.limit ?? 30,'limite',1,30) },signal); complete = false;
      } else { await access.report(); data = await rpc(caller,'gestor_ia_consultar_metricas_portal',{ p_client_id:clientId },signal); }
    }
    if (data === null || data === undefined) fail('A fonte não devolveu um estado disponível.','CONTEXT_UNAVAILABLE',502);
    const state = { truncated:false };
    return { ...result,available:true,data:sanitize(data,state),coverage:{ complete:complete && !state.truncated,truncated:state.truncated,...(input.since ? { period:pick(input,['since','until']) } : {}) } };
  } catch (error) {
    if (signal?.aborted) throw error;
    if (error.code === 'INVALID_INPUT') throw error;
    return { ...result,reason:'Fonte oficial indisponível neste escopo; ausência de acesso não significa dados vazios.',code:error.code || 'CONTEXT_UNAVAILABLE' };
  }
}

export async function prepareExecutorSquad(caller,{ app,clientId,action,input = {},signal }) {
  if (!Object.hasOwn(WRITES,app) || !Object.hasOwn(WRITES[app],action)) fail('Esta ação não tem contrato de preparação no Squad.','TOOL_DENIED',403);
  input = inputFor(input,WRITES[app][action][1]);
  clientId = uuid(clientId,'client_id',false);
  const globalActions = ['save_settings','save_task_controls','save_analysis_settings','set_channel_following','save_team_label','save_team_person','save_report_model'];
  if (!clientId && !globalActions.includes(action)) fail('Selecione um cliente para esta ação.');
  const access = await authorize(caller,app,clientId,signal);
  if (action !== 'update_decision') access.manage();
  let before = null,payload,after,external = false,autonomy = false;
  if (app === 'cs') {
    if (action === 'set_health') {
      if (![null,'saudavel','resultado','atencao','critico'].includes(input.manual_status)) fail('Situação manual inválida.');
      const row = await one(caller,'cs_ia_relationships','manual_status,updated_at',q => q.eq('client_id',clientId),signal);
      before = row ? pick(row,['manual_status','updated_at']) : null; after = { manual_status:input.manual_status };
      payload = { data:after,expected:before };
    } else if (['save_settings','save_task_controls','save_analysis_settings'].includes(action)) {
      const analysis = action === 'save_analysis_settings', fields = analysis ? ['reading_enabled','transcription_enabled'] : action === 'save_task_controls' ? TASK_CONTROLS : SETTINGS;
      const versionKey = analysis ? 'version' : action === 'save_task_controls' ? 'task_controls_version' : null;
      const current = await one(caller,analysis ? 'cs_ia_analysis_settings' : 'cs_ia_settings',['id',...fields,...(versionKey ? [versionKey] : [])].join(','),q => q.eq('id',1),signal);
      if (current?.id !== 1) fail('Configuração atual indisponível.','CONTEXT_UNAVAILABLE',502);
      before = pick(current,[...fields,...(versionKey ? [versionKey] : [])]); after = { ...pick(current,fields),...pick(input,fields) };
      if (versionKey) expected(input,'version',before[versionKey]);
      if (action === 'save_settings') {
        for (const key of SETTINGS.slice(0,8)) integer(after[key],key,0,100);
        const s = after;
        if (!(s.healthy_min <= 100 && s.healthy_min > s.result_min && s.result_min > s.attention_min && s.attention_min >= 1 && s.score_drop >= 1 && s.quiet_days >= 1 && s.critical_quiet_days > s.quiet_days && s.critical_quiet_days <= 90 && s.start_hour >= 0 && s.start_hour < s.end_hour && s.end_hour <= 24)) fail('Confira faixas, gatilhos e expediente.');
        boolean(s.weekends,'fins de semana'); boolean(s.radar_enabled,'radar'); autonomy = !before.radar_enabled && s.radar_enabled;
      } else {
        fields.forEach(key => boolean(after[key],key));
        autonomy = fields.some(key => after[key] && !before[key]); external = analysis && autonomy;
      }
      payload = { data:after,expected:before };
    } else if (action === 'set_channel_following') {
      const channel = uuid(input.channel_id,'channel_id'); boolean(input.enabled,'acompanhamento');
      const channels = await rows(caller.rpc('cs_ia_connection_summary').eq('id',channel).limit(1),signal);
      const current = channels.find(row => row.id === channel);
      const version = current?.version;
      if (current?.can_configure !== true || typeof version !== 'string') fail('Canal ou versão indisponível.','SQUAD_FORBIDDEN',403);
      expected(input,'version',version); before = current; after = { enabled:input.enabled };
      payload = { p_channel_id:channel,p_enabled:input.enabled,p_version:version }; autonomy = input.enabled && current.following !== true;
    } else if (action === 'set_group_binding') {
      before = await rpc(caller,'cs_ia_group_binding',{ p_client_id:clientId },signal);
      if (typeof before?.version !== 'string') fail('Versão do vínculo indisponível.','CONTEXT_UNAVAILABLE',502);
      expected(input,'version',before.version);
      if (!Object.hasOwn(input,'conversation_id')) fail('Informe o grupo ou NULL para remover o vínculo.');
      const conversation = uuid(input.conversation_id,'conversation_id',false);
      let source;
      if (conversation) {
        if (access.csRow?.conversation_id === conversation && access.csRow.group_status === 'linked') source = { id:conversation,wa_cliente_id:access.csRow.wa_client_id,whatsapp_config_id:access.csRow.channel_id,chat_jid:access.csRow.group_jid };
        else {
          const inventory = await rpc(caller,'cs_ia_group_inventory',{ p_status:'unlinked',p_after:null },signal);
          source = inventory?.find(row => row.id === conversation);
        }
        if (!source) fail('Grupo não encontrado na fonte autorizada.','SQUAD_FORBIDDEN',403);
      }
      payload = { p_client_id:clientId,p_conversation_id:conversation,p_wa_client_id:source ? uuid(source.wa_cliente_id,'wa_client_id') : null,p_channel_id:source ? uuid(source.whatsapp_config_id,'channel_id') : null,p_group_jid:source?.chat_jid || null,p_version:before.version };
      after = { conversation_id:conversation,wa_client_id:payload.p_wa_client_id,channel_id:payload.p_channel_id,group_jid:payload.p_group_jid };
    } else if (action === 'configure_reading') {
      await access.atlas(); before = await readingSnapshot(caller,clientId,access.csRow?.conversation_id,signal);
      const reading = before.reading;
      if (!reading.status || !(reading.can_configure || reading.can_pause)) fail('Leitura indisponível para configuração.','SQUAD_FORBIDDEN',403);
      after = { ...pick(reading,['enabled','include_audio','transcribe_new_audio']),...pick(input,['enabled','include_audio','transcribe_new_audio']) };
      ['enabled','include_audio','transcribe_new_audio'].forEach(key => boolean(after[key],key));
      const conversation = uuid(reading.conversation_id,'conversation_id',after.enabled);
      expected(input,'conversation_id',conversation);
      if (after.transcribe_new_audio && !(after.enabled && after.include_audio)) fail('Transcrição exige leitura e áudio habilitados.');
      if (!after.enabled) { after.include_audio = false; after.transcribe_new_audio = false; }
      payload = { p_client_id:clientId,p_enabled:after.enabled,p_include_audio:after.include_audio,p_conversation_id:conversation,p_transcribe_audio:after.transcribe_new_audio };
      autonomy = ['enabled','transcribe_new_audio'].some(key => after[key] && !reading[key]); external = autonomy;
    } else if (action.startsWith('configure_task_')) {
      await Promise.all([access.atlas(),access.module('tasks')]); groupArgs(clientId,access.csRow); boolean(input.enabled,'regra de tarefas');
      before = await readingSnapshot(caller,clientId,access.csRow.conversation_id,signal);
      const rule = before[({ configure_task_moves:'task_moves',configure_task_creation:'task_creation',configure_task_context:'task_context' })[action]];
      if (!(rule?.can_configure || !input.enabled && rule?.can_revoke)) fail('Regra indisponível; confira leitura e automação globais.','SQUAD_FORBIDDEN',403);
      after = { enabled:input.enabled }; payload = { p_client_id:clientId,p_conversation_id:access.csRow.conversation_id,p_enabled:input.enabled }; autonomy = input.enabled && !rule.enabled;
    } else {
      const structure = await rpc(caller,'cs_ia_team_structure',{},signal);
      if (!Array.isArray(structure?.labels) || !Array.isArray(structure?.assignments)) fail('Equipe indisponível.','CONTEXT_UNAVAILABLE',502);
      if (action === 'save_team_label') {
        const recordId = uuid(input.id,'id',false);
        before = recordId ? structure.labels.find(row => row.id === recordId) : null;
        if (recordId && !before) fail('Cargo ou squad indisponível.','SQUAD_FORBIDDEN',403);
        after = { ...pick(before,['kind','name','archived']),...pick(input,['kind','name','archived']) };
        if (!['cargo','squad'].includes(after.kind) || before && after.kind !== before.kind) fail('Tipo do cadastro inválido.');
        after.name = text(after.name,'nome',60,2); after.archived = boolean(after.archived ?? false,'arquivado');
        if (!before && after.archived) fail('Novo cadastro deve começar ativo.');
        expected(input,'version',before?.version ?? null);
        payload = { p_id:recordId,p_kind:after.kind,p_name:after.name,p_archived:after.archived,p_version:before?.version ?? null };
      } else {
        const person = uuid(input.profile_id,'profile_id');
        const profile = await one(caller,'profiles','id,role,status',q => q.eq('id',person),signal);
        if (profile?.status !== 'active' || !['admin','superadmin','colaborador'].includes(profile.role)) fail('Pessoa ativa indisponível.');
        if (!Array.isArray(input.label_ids) || input.label_ids.length > 64 || new Set(input.label_ids).size !== input.label_ids.length) fail('Vínculos inválidos.');
        input.label_ids.forEach(value => uuid(value,'label_id'));
        before = structure.assignments.filter(row => row.profile_id === person).map(row => row.label_id).sort();
        const selected = input.label_ids.map(value => structure.labels.find(row => row.id === value));
        if (selected.some(row => !row || row.archived && !before.includes(row.id)) || selected.filter(row => row.kind === 'cargo').length > 1) fail('Escolha um cargo e squads disponíveis.');
        after = input.label_ids.slice().sort(); payload = { p_profile_id:person,p_label_ids:after,p_expected_ids:before };
      }
    }
  } else if (action === 'save_goal' || action === 'adjust_goal') {
    await access.goal();
    const recordId = uuid(input.id,'id',action === 'adjust_goal');
    before = recordId ? await one(caller,'gestor_ia_metas_campanha',['id','client_id','account_id',...GOALS,'updated_at'].join(','),q => q.eq('id',recordId).eq('client_id',clientId),signal) : null;
    if (recordId && (before?.id !== recordId || before.client_id !== clientId)) fail('Meta indisponível neste cliente.','SQUAD_FORBIDDEN',403);
    if (before) expected(input,'expected_updated_at',before.updated_at);
    const account = await linkedAccount(caller,clientId,input.account_id || before?.account_id,signal);
    if (before && before.account_id !== account) fail('Preserve a conta original da meta.');
    if (action === 'adjust_goal') {
      if (!before.is_active || (input.budget_cents == null) === (input.result_target == null)) fail('Ajuste um valor positivo de uma meta ativa.');
      for (const key of ['budget_cents','result_target']) if (input[key] != null) integer(input[key],key);
      payload = { p_client_id:clientId,p_account_id:account,p_goal_id:recordId,p_expected_updated_at:before.updated_at,p_budget_cents:input.budget_cents ?? null,p_result_target:input.result_target ?? null };
      after = { ...pick(before,GOALS),...pick(input,['budget_cents','result_target']) };
    } else {
      after = { ...(before ? pick(before,GOALS) : { scope:'objective',campaign_ids:[],budget_cents:null,result_target:null,is_active:true,is_primary:false }),...pick(input,GOALS) };
      after.name = text(after.name,'nome da meta',80);
      if (!OBJECTIVES.includes(after.objective) || !['account','objective','campaigns'].includes(after.scope)) fail('Objetivo ou abrangência inválidos.');
      if (!Array.isArray(after.campaign_ids) || new Set(after.campaign_ids).size !== after.campaign_ids.length || (after.scope === 'campaigns' ? after.campaign_ids.length < 1 || after.campaign_ids.length > 100 || after.campaign_ids.some(value => typeof value !== 'string' || !/^\d{1,32}$/.test(value)) : after.campaign_ids.length !== 0)) fail('Campanhas da meta inválidas.');
      integer(after.cost_cents,'custo alvo');
      for (const key of ['budget_cents','result_target']) if (after[key] !== null) integer(after[key],key);
      boolean(after.is_active,'meta ativa'); boolean(after.is_primary,'meta principal');
      payload = { p_client_id:clientId,p_account_id:account,p_goal_id:recordId,...Object.fromEntries(GOALS.map(key => [`p_${key}`,after[key]])) };
    }
  } else if (action === 'configure_agenda') {
    await Promise.all([access.atlas(),access.field('meta_resumo'),access.field('valor')]);
    const account = await linkedAccount(caller,clientId,input.account_id,signal);
    before = await one(caller,'gestor_ia_agendas','id,enabled,run_time,weekdays,categories,revision',q => q.eq('owner_id',access.actorId).eq('client_id',clientId).eq('account_id',account),signal);
    expected(input,'revision',before?.revision ?? null);
    after = { ...(before ? pick(before,['enabled','run_time','weekdays','categories']) : { enabled:false,run_time:'06:30',weekdays:[1,3,5],categories:['escala','criativo','custo','verba'] }),...pick(input,['enabled','run_time','weekdays','categories']) };
    if (!Object.hasOwn(input,'run_time')) after.run_time = after.run_time?.slice(0,5);
    boolean(after.enabled,'agenda');
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(after.run_time || '') || !Array.isArray(after.weekdays) || !after.weekdays.length || after.weekdays.length > 7 || after.weekdays.some(value => !Number.isInteger(value) || value < 1 || value > 7) || new Set(after.weekdays).size !== after.weekdays.length || !Array.isArray(after.categories) || after.categories.length > 6 || new Set(after.categories).size !== after.categories.length || after.categories.some(value => !['escala','custo','verba','criativo','ia','descoberta'].includes(value))) fail('Dias, horário ou categorias inválidos.');
    payload = { p_client_id:clientId,p_account_id:account,p_enabled:after.enabled,p_run_time:after.run_time,p_weekdays:after.weekdays,p_categories:after.categories,p_revision:before?.revision ?? null };
    autonomy = after.enabled && (!before?.enabled || after.categories.some(value => ['ia','descoberta'].includes(value) && !before?.categories?.includes(value)));
    external = after.enabled && after.categories.some(value => ['ia','descoberta'].includes(value));
  } else if (action === 'save_report_model' || action === 'set_client_report_model') {
    await access.report();
    if (action === 'save_report_model') {
      const recordId = uuid(input.id,'id',false);
      before = recordId ? await one(caller,'gestor_ia_modelos_relatorio',['id','revision',...MODELS].join(','),q => q.eq('id',recordId),signal) : null;
      if (recordId && before?.id !== recordId) fail('Modelo indisponível.','SQUAD_FORBIDDEN',403);
      expected(input,'revision',before?.revision ?? 0);
      after = { ...(before ? pick(before,MODELS) : { name:'',window_key:'last7',metrics:['spend','result','cost'],tone:'',compare_previous:true,include_creatives:false,include_routine:true }),...pick(input,MODELS) };
      after.name = text(after.name,'nome do modelo',80); after.tone = text(after.tone,'tom',240,0).replace(/\s+/g,' ');
      if (!['last7','lastWeek','month','lastMonth'].includes(after.window_key) || !Array.isArray(after.metrics) || !after.metrics.length || new Set(after.metrics).size !== after.metrics.length || after.metrics.some(value => !METRICS.includes(value))) fail('Janela ou indicadores inválidos.');
      ['compare_previous','include_creatives','include_routine'].forEach(key => boolean(after[key],key));
      payload = { p_id:recordId,p_revision:before?.revision ?? 0,p_config:after };
    } else {
      if (!Object.hasOwn(input,'model_id')) fail('Informe o modelo ou NULL para remover.');
      const model = uuid(input.model_id,'model_id',false);
      if (model && !(await one(caller,'gestor_ia_modelos_relatorio','id',q => q.eq('id',model),signal))) fail('Modelo indisponível.');
      before = await one(caller,'gestor_ia_modelos_por_cliente','model_id,revision',q => q.eq('client_id',clientId),signal) || { model_id:null,revision:0 };
      expected(input,'revision',before.revision); after = { model_id:model };
      payload = { p_client_id:clientId,p_model_id:model,p_revision:before.revision };
    }
  } else if (action === 'update_decision') {
    await Promise.all([access.field('meta_resumo'),access.field('valor')]);
    const recordId = uuid(input.id,'id');
    before = await one(caller,'gestor_ia_decisoes',['id','revision',...DECISIONS].join(','),q => q.eq('id',recordId).eq('owner_id',access.actorId).eq('client_id',clientId),signal);
    if (before?.id !== recordId) fail('Decisão indisponível.','SQUAD_FORBIDDEN',403);
    expected(input,'revision',before.revision); after = { ...pick(before,DECISIONS),...pick(input,DECISIONS) };
    if (!['pending','approved','dismissed'].includes(after.status) || after.verdict !== null && !['improved','not_improved','inconclusive'].includes(after.verdict)) fail('Estado da decisão inválido.');
    if (after.task_id !== null) { uuid(after.task_id,'task_id'); await access.module('tasks'); }
    if (after.verdict_note !== null) after.verdict_note = text(after.verdict_note,'observação',800,0);
    const statusChanged = before.status !== after.status, taskChanged = before.task_id !== after.task_id, verdictChanged = before.verdict !== after.verdict || before.verdict_note !== after.verdict_note;
    if (statusChanged && (!(before.status === 'pending' && ['approved','dismissed'].includes(after.status) || after.status === 'pending') || after.task_id !== null || after.verdict !== null || after.verdict_note !== null) || taskChanged && (after.status !== 'approved' || verdictChanged || before.verdict !== null && after.task_id !== null) || verdictChanged && (after.status !== 'approved' || before.verdict !== null || after.verdict === null || after.task_id === null)) fail('Transição de decisão inválida; use a etapa oficial.');
    payload = { data:after,expected:before };
  } else {
    await access.report(); before = await rpc(caller,'gestor_ia_consultar_metricas_portal',{ p_client_id:clientId },signal);
    if (typeof before?.shared !== 'boolean' || !Number.isInteger(before.revision)) fail('Compartilhamento atual indisponível.','CONTEXT_UNAVAILABLE',502);
    expected(input,'revision',before.revision); after = { ...pick(before,['shared','objective']),...pick(input,['shared','objective']) };
    boolean(after.shared,'compartilhamento');
    if (after.objective !== null && !OBJECTIVES.includes(after.objective) || after.shared && after.objective === null) fail('Escolha um objetivo para compartilhar.');
    payload = { p_client_id:clientId,p_shared:after.shared,p_objective:after.objective,p_revision:before.revision }; external = true;
  }
  signal?.throwIfAborted();
  return { app,action,operation:WRITES[app][action][0],client_id:clientId,title:TITLES[action],effect:{ type:external ? 'external_configuration' : 'configuration',external,enables_autonomy:autonomy },payload,before,preview:{ before,after },links:links(app,clientId,action) };
}

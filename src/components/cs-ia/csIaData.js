import { confirmCsTaskClient, isCsBoardTask } from '../../lib/csIaTaskNavigation.js';
import { isCompletedCsAtlasResponse } from '../../lib/csIaAtlasDraft.js';

const STAFF_ROLES = ['superadmin', 'admin', 'colaborador'];
const RADAR_PAGE_SIZE = 200;

export function canUseCsIa(profile, modules) {
  return Boolean(profile?.id && profile.status === 'active' && STAFF_ROLES.includes(profile.role) &&
    modules?.clients === true && modules?.atendimento === true);
}

export function canManageCsIa(profile, modules) {
  return canUseCsIa(profile, modules) && profile.role !== 'colaborador';
}

async function loadCsRows(db, rpc, key, failure) {
  const rows = [];
  let cursor;
  for (;;) {
    let query = db.rpc(rpc).order(key).limit(RADAR_PAGE_SIZE);
    if (cursor) query = query.gt(key, cursor);
    const { data, error } = await query;
    if (error || !Array.isArray(data)) throw new Error(failure, { cause: error });
    rows.push(...data);
    if (data.length < RADAR_PAGE_SIZE) return rows;
    const next = data.at(-1)?.[key];
    if (!next || next === cursor) throw new Error(failure);
    cursor = next;
  }
}

export function loadCsRadar(db) {
  return loadCsRows(db, 'cs_ia_radar_snapshot', 'client_id', 'Não foi possível carregar o radar de CS.');
}

export function loadCsConnectionSummary(db) {
  return loadCsRows(db, 'cs_ia_connection_summary', 'id', 'Não foi possível consultar os canais do CS.').catch((error) => {
    throw Object.assign(error, { accessDenied: true });
  });
}

export async function saveCsChannelFollowing(db, channelId, following, version) {
  const { data, error } = await db.rpc('cs_ia_set_channel_following', {
    p_channel_id: channelId, p_enabled: following, p_version: version,
  });
  if (error?.code === '40001') throw new Error('O acompanhamento mudou em outra sessão. Confira o estado atual.');
  if (error || data !== following) throw new Error('Não foi possível confirmar a alteração do acompanhamento.', { cause: error });
}

export function loadCsSegments(db) {
  return loadCsRows(db, 'cs_ia_portfolio_segments', 'client_id', 'Não foi possível consultar os segmentos da carteira.');
}

export function loadCsChurn(db) {
  return loadCsRows(db, 'cs_ia_churn_list', 'id', 'Não foi possível consultar as contas encerradas.');
}

export async function loadCsClientSource(db, clientId, source) {
  const { data, error } = await db.rpc('cs_ia_client_sources', { p_client_id: clientId, p_source: source });
  if (error || !Array.isArray(data?.items) || (source === 'crm' && !data.totals)) {
    throw new Error('Não foi possível consultar a fonte deste cliente.', { cause: error });
  }
  return data;
}

export function loadCsReadingSignals(db) {
  return loadCsRows(db, 'cs_ia_reading_signals', 'client_id', 'Não foi possível consultar os sinais da leitura de conversas.');
}

export async function loadCsTasks(db, clientIds, { assigneeId } = {}) {
  const scope = [...new Set(clientIds)].sort();
  if (!scope.length) return { tasks: [], statuses: [], people: [] };
  const failure = 'Não foi possível consultar as tarefas deste recorte.';

  async function list() {
    const rows = [];
    for (let offset = 0; offset < scope.length; offset += 50) {
      const clients = scope.slice(offset, offset + 50);
      const allowed = new Set(clients);
      let cursor;
      for (;;) {
        let page = db.from('tarefas').select('id,client_id,title,type,status,priority,created_at,due_date,post_date,production_delivered_at,stage_due_at,assignee_ids');
        page = (clients.length === 1 ? page.eq('client_id', clients[0]) : page.in('client_id', clients)).order('id').limit(RADAR_PAGE_SIZE);
        if (assigneeId) page = page.contains('assignee_ids', [assigneeId]);
        if (cursor) page = page.gt('id', cursor);
        const { data, error } = await page;
        if (error || !Array.isArray(data) || data.some((task) => !allowed.has(task.client_id) ||
            (assigneeId && !task.assignee_ids?.includes(assigneeId)))) throw new Error(failure, { cause: error });
        rows.push(...data.filter(isCsBoardTask));
        if (data.length < RADAR_PAGE_SIZE) break;
        const next = data.at(-1)?.id;
        if (!next || next === cursor) throw new Error(failure);
        cursor = next;
      }
    }
    return rows;
  }

  const [tasks, statusResult] = await Promise.all([list(), db.from('task_statuses').select('value,label,is_terminal,sort_order').order('sort_order')]);
  if (statusResult.error || !Array.isArray(statusResult.data)) throw new Error(failure, { cause: statusResult.error });
  const ids = [...new Set(tasks.flatMap((task) => task.assignee_ids || []).filter(Boolean))];
  const people = [];
  for (let offset = 0; offset < ids.length; offset += 100) {
    const { data, error } = await db.from('profiles').select('id,full_name').in('id', ids.slice(offset, offset + 100)).neq('role', 'cliente');
    if (error) throw new Error(failure, { cause: error });
    people.push(...(data || []));
  }
  const origins = new Map();
  for (let offset = 0; offset < tasks.length; offset += RADAR_PAGE_SIZE) {
    const batch = new Set(tasks.slice(offset, offset + RADAR_PAGE_SIZE).map(({ id }) => id));
    const { data, error } = await db.rpc('cs_ia_task_origins', { p_task_ids: [...batch] });
    if (error || !Array.isArray(data) || data.some(row => !batch.has(row?.task_id) || !['atlas', 'cs_whatsapp'].includes(row.origin))) {
      return { tasks, statuses: statusResult.data, people, originsAvailable: false };
    }
    data.forEach(({ task_id, origin }) => origins.set(task_id, origin));
  }
  return { tasks: tasks.map(task => origins.has(task.id) ? { ...task, origin: origins.get(task.id) } : task),
    statuses: statusResult.data, people };
}

function csGroupTeamArgs({ client_id, conversation_id, wa_client_id, channel_id, group_jid }) {
  return { p_client_id: client_id, p_conversation_id: conversation_id, p_wa_client_id: wa_client_id,
    p_channel_id: channel_id, p_group_jid: group_jid };
}

export async function loadCsGroupTeam(db, scope) {
  const { data, error } = await db.rpc('cs_ia_group_team', csGroupTeamArgs(scope));
  if (error || !Array.isArray(data)) throw new Error('Não foi possível consultar a classificação do grupo.', { cause: error });
  return data;
}

export async function saveCsGroupTeam(db, scope, senderJids, isTeam) {
  const { data, error } = await db.rpc('cs_ia_mark_group_team', {
    ...csGroupTeamArgs(scope), p_sender_jids: senderJids, p_is_team: isTeam,
  });
  if (error || !Array.isArray(data)) throw new Error('Não foi possível salvar a classificação. Confira o vínculo e tente novamente.', { cause: error });
  return data;
}

export async function loadCsReading(db, clientId) {
  if (!clientId) throw new Error('Selecione um cliente da carteira.');
  const { data, error } = await db.rpc('cs_ia_get_reading', { p_client_id: clientId });
  if (error || !data?.status) throw new Error('Não foi possível consultar a leitura de conversas.', { cause: error });
  return data;
}

export async function saveCsReading(db, clientId, values) {
  const transcribe = values?.transcribe_new_audio;
  if (!clientId || typeof values?.enabled !== 'boolean' || typeof values.include_audio !== 'boolean' ||
    values.enabled && !values.conversation_id || transcribe !== undefined && typeof transcribe !== 'boolean' ||
    transcribe && (!values.enabled || !values.include_audio)) {
    throw new Error('Confira as opções da leitura de conversas.');
  }
  const { data, error } = await db.rpc('cs_ia_reading_settings', {
    p_client_id: clientId, p_enabled: values.enabled, p_include_audio: values.enabled && values.include_audio,
    p_conversation_id: values.conversation_id ?? null,
    ...(transcribe === undefined ? {} : { p_transcribe_audio: transcribe }),
  });
  if (error?.code === '22023') throw new Error('O grupo mudou. Atualize a leitura e confira o vínculo.', { cause: error });
  if (error || !data?.status || data.enabled !== values.enabled ||
    transcribe !== undefined && data.transcribe_new_audio !== transcribe) {
    throw new Error('Não foi possível salvar as opções de leitura.', { cause: error });
  }
  return data;
}

export async function closeCsRelationship(db, clientId, reason) {
  const normalized = typeof reason === 'string' ? reason.trim() : '';
  if (!clientId || !normalized || normalized.length > 1000) throw new Error('Informe um motivo com até 1.000 caracteres.');
  const { data, error } = await db.rpc('cs_ia_close_relationship', { p_client_id: clientId, p_reason: normalized });
  if (error || !data?.id || data.client_id !== clientId) throw new Error('Não foi possível confirmar o encerramento. Atualize a carteira e tente novamente.', { cause: error });
  return data;
}

export async function loadCsPeople(db, profile, rows) {
  let query = db.from('profiles').select('id,full_name').in('role', STAFF_ROLES).eq('status', 'active');
  if (profile.role === 'colaborador') {
    const ids = [...new Set([profile.id, ...rows.map((row) => row.owner_id).filter(Boolean)])];
    query = query.in('id', ids);
  }
  const { data, error } = await query.order('full_name');
  if (error) throw new Error('Não foi possível carregar a equipe de CS.', { cause: error });
  return data || [];
}

export async function loadCsTeamStructure(db) {
  const { data, error } = await db.rpc('cs_ia_team_structure');
  if (error || !Array.isArray(data?.labels) || !Array.isArray(data?.assignments)) {
    throw new Error('Não foi possível consultar a organização da equipe.', { cause: error });
  }
  return data;
}

export async function loadCsResponseTimes(db, days) {
  if (![7, 30].includes(days)) throw new Error('Escolha um período de 7 ou 30 dias.');
  const { data, error } = await db.rpc('cs_ia_team_response_times', { p_days: days });
  if (error || !Array.isArray(data)) throw new Error('Não foi possível consultar os tempos de resposta.', { cause: error });
  return data;
}

async function csTaskRuleOptions(db, row, enabled, rpc, label) {
  if (!row?.client_id || !row.conversation_id || row.group_status !== 'linked') {
    throw new Error(`Confira o vínculo com o grupo antes de configurar a ${label}.`);
  }
  const { data, error } = await db.rpc(rpc, {
    p_client_id: row.client_id, p_conversation_id: row.conversation_id, p_enabled: enabled,
  });
  if (error || typeof data?.enabled !== 'boolean' || typeof data.can_configure !== 'boolean' || enabled !== null && data.enabled !== enabled) {
    throw new Error(`Não foi possível confirmar a regra de ${label}. Atualize e confira o vínculo.`, { cause: error });
  }
  return data;
}

export const csTaskMoveOptions = (db, row, enabled = null) =>
  csTaskRuleOptions(db, row, enabled, 'cs_ia_task_move_options', 'movimentação');
export const csTaskCreationOptions = (db, row, enabled = null) =>
  csTaskRuleOptions(db, row, enabled, 'cs_ia_task_creation_options', 'criação');
export const csTaskContextOptions = (db, row, enabled = null) =>
  csTaskRuleOptions(db, row, enabled, 'cs_ia_task_context_options', 'movimentação pelo contexto');

export async function loadCsDemandAccess(db) {
  const { data, error } = await db.rpc('atlas_demand_access');
  if (error) throw new Error('Não foi possível conferir o acesso às Demandas do Atlas.', { cause: error });
  return data === true;
}

export async function loadCsAtlasDemandReference(db, { ownerId, clientId, runId, conversationId }) {
  const unavailable = () => new Error('Não foi possível abrir esta resposta do Atlas para o cliente da ficha.');
  const authorized = async () => {
    const [demand, client] = await Promise.all([loadCsDemandAccess(db), confirmCsTaskClient(db, clientId)]);
    return demand && client;
  };
  if (!(await authorized())) throw unavailable();
  const { data: run, error } = await db.from('atlas_runs').select('id,owner_id,request_client_id,conversation_id,status,steps,result')
    .eq('id', runId).eq('owner_id', ownerId).eq('request_client_id', clientId).eq('conversation_id', conversationId)
    .eq('status', 'completed').maybeSingle();
  const text = typeof run?.result?.content === 'string' ? run.result.content.trim() : '';
  if (error || run?.id !== runId || run.owner_id !== ownerId || run.request_client_id !== clientId ||
      run.conversation_id !== conversationId || !isCompletedCsAtlasResponse(run) || !text || text.length > 20000 || !(await authorized())) {
    throw unavailable();
  }
  return text;
}

export async function loadCsAtlasAutomation(db, ownerId) {
  const [config, policy] = await Promise.all([
    db.from('atlas_event_config').select('enabled,mode,client_ids').eq('owner_id', ownerId).maybeSingle(),
    db.from('atlas_manager_policy').select('enabled,create_after_clarification').eq('owner_id', ownerId).maybeSingle(),
  ]);
  if (config.error || policy.error || (config.data && !Array.isArray(config.data.client_ids))) {
    throw new Error('Não foi possível consultar as regras de automação do Atlas.', { cause: config.error || policy.error });
  }
  return { config: config.data, policy: policy.data };
}

function csAtlasGroupArgs(row) {
  if (!row?.client_id || !row.conversation_id || !row.wa_client_id || !row.channel_id || row.group_status !== 'linked') {
    throw new Error('Confira o vínculo do grupo para consultar os pedidos.');
  }
  return { p_client_id: row.client_id, p_conversation_id: row.conversation_id,
    p_wa_client_id: row.wa_client_id, p_channel_id: row.channel_id };
}

export async function loadCsAtlasGroupRequests(db, row) {
  const { data, error } = await db.rpc('cs_ia_atlas_group_requests', csAtlasGroupArgs(row));
  if (error || !Array.isArray(data)) throw new Error('Não foi possível consultar os pedidos deste grupo. Confira o acesso e atualize.', { cause: error });
  return data;
}

export async function loadCsAtlasGroupActivity(db, row) {
  const { data, error } = await db.rpc('cs_ia_atlas_group_activity', csAtlasGroupArgs(row));
  if (error || !data || !Object.hasOwn(data, 'scan') || !Object.hasOwn(data, 'job')) {
    throw new Error('Não foi possível consultar a fila do Atlas para este grupo.', { cause: error });
  }
  return data;
}

export async function saveCsDemand(db, clientId, value, isCurrent) {
  const { client_id, title, context, source_url, request_id } = value;
  if (!clientId || client_id !== clientId || !isCurrent() || !(await confirmCsTaskClient(db, clientId)) || !isCurrent()) {
    throw new Error('A ficha mudou de escopo. Atualize a carteira e prepare a demanda novamente.');
  }
  const { data, error } = await db.rpc('atlas_demand_action', {
    p_action: 'create', p_data: { client_id, title, context, source_url, request_id },
  });
  if (error || !data?.demand?.id || data.demand.client_id !== clientId) {
    throw new Error('Não foi possível confirmar a demanda. Confira o acesso e tente novamente.', { cause: error });
  }
  return data.demand;
}

function teamWriteError(error) {
  if (error?.code === '40001') return new Error('O cadastro mudou. Feche e reabra a edição para ver os dados atuais.', { cause: error });
  if (error?.code === '23505') return new Error('Já existe um cadastro com este nome. Confira também os arquivados.', { cause: error });
  return new Error('Não foi possível salvar. Confira a equipe e tente novamente.', { cause: error });
}

export async function saveCsTeamLabel(db, draft) {
  const name = draft.name.trim();
  if (name.length < 2 || name.length > 60) throw new Error('Informe um nome de 2 a 60 caracteres.');
  const { data, error } = await db.rpc('cs_ia_save_team_label', {
    p_id: draft.id || null, p_kind: draft.kind, p_name: name, p_archived: draft.archived, p_version: draft.version || null,
  });
  if (error || !data?.id || (draft.id && data.id !== draft.id) || data.kind !== draft.kind || data.archived !== draft.archived || data.name !== name) {
    throw teamWriteError(error);
  }
}

export async function saveCsTeamPerson(db, profileId, labelIds, expectedIds) {
  const { data, error } = await db.rpc('cs_ia_save_team_person', {
    p_profile_id: profileId, p_label_ids: labelIds, p_expected_ids: expectedIds,
  });
  if (error || data !== profileId) throw teamWriteError(error);
}

export async function loadCsHistory(db, clientId) {
  if (!clientId) throw new Error('Selecione um cliente da carteira.');
  const [client, daily] = await Promise.all([
    db.from('clientes').select('id,created_at').eq('id', clientId).eq('etapa', 'closed').maybeSingle(),
    db.from('cs_ia_daily').select('operational_date,captured_at,score,health,signal,factors')
      .eq('client_id', clientId).order('operational_date', { ascending: false }).limit(90),
  ]);
  if (client.error || client.data?.id !== clientId || daily.error || !Array.isArray(daily.data)) {
    throw new Error('Não foi possível consultar o histórico deste cliente.', { cause: client.error || daily.error });
  }
  return { daily: daily.data, createdAt: client.data.created_at ?? null };
}

export async function saveCsStatus(db, clientId, status) {
  if (!clientId || ![null, 'saudavel', 'resultado', 'atencao', 'critico'].includes(status)) {
    throw new Error('Escolha uma situação de acompanhamento válida.');
  }
  const { data, error } = await db.from('cs_ia_relationships').upsert({ client_id: clientId, manual_status: status }, { onConflict: 'client_id' })
    .select('client_id,manual_status').single();
  if (error || data?.client_id !== clientId || data.manual_status !== status) {
    throw new Error('Não foi possível salvar a situação do cliente.', { cause: error });
  }
}

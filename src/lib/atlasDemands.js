import { supabase, supabaseAnonKey } from '@/lib/customSupabaseClient';
import { getSupabaseFunctionsBaseUrl } from '@/lib/supabaseFunctions';

export const ATLAS_DEMAND_PILOT = import.meta.env.VITE_ATLAS_DEMAND_PILOT === 'true';
export const ATLAS_DEMANDS_ENABLED = ATLAS_DEMAND_PILOT || import.meta.env.VITE_ATLAS_DEMANDS_ENABLED === 'true';
export async function demandRpc(name, args = {}) {
  const { data, error } = await supabase.rpc(name, args);
  if (error) { const failure = new Error(error.message || 'Não foi possível confirmar a ação.'); failure.code = error.code; throw failure; }
  return data;
}

export async function loadAtlasDemandReview(demand) {
  const args = { p_id: demand.id };
  const [context, schedule] = await Promise.all([demandRpc('atlas_demand_context', args), demandRpc('atlas_demand_schedule_context', args)]);
  if (context.demand.revision !== demand.revision || schedule.demand_revision !== demand.revision) {
    throw Object.assign(new Error('A demanda mudou. Atualize antes de revisar.'), { code: 'PT409' });
  }
  return { ...context, schedule };
}

export async function loadAtlasConversationDemands({ ownerId, clientId, requestIds }) {
  if (!ownerId || !clientId || !requestIds.length || await demandRpc('atlas_demand_access') !== true) return null;
  const { data, error } = await supabase.from('atlas_demands')
    .select('id,request_id,client_id,state,revision,task_id')
    .eq('owner_id', ownerId).eq('client_id', clientId).in('request_id', requestIds);
  if (error || !Array.isArray(data)) throw new Error('Não foi possível conferir as propostas desta conversa.');
  const taskIds = [...new Set(data.filter(row => row.state === 'linked' && row.task_id).map(row => row.task_id))];
  if (!taskIds.length) return data;
  const { data: tasks, error: taskError } = await supabase.from('tarefas').select('id').eq('client_id', clientId).in('id', taskIds);
  if (taskError || !Array.isArray(tasks)) throw new Error('Não foi possível confirmar as tarefas vinculadas.');
  const available = new Set(tasks.map(task => task.id));
  return data.map(row => ({ ...row, task_available: available.has(row.task_id) }));
}
async function all(table, fields, configure = q => q) {
  const rows = [];
  for (let offset = 0; offset < 30000; offset += 500) {
    const { data, error } = await configure(supabase.from(table).select(fields)).range(offset, offset + 499);
    if (error) throw new Error(`Não foi possível consultar ${table}. Os dados não foram considerados vazios.`);
    rows.push(...data);
    if (data.length < 500) return rows;
  }
  throw new Error('Consulta incompleta. Reduza o recorte antes de continuar.');
}
export async function loadDemands(clientId = null) {
  const manager = await demandRpc('atlas_demand_access');
  if (!manager) {
    const [queue, statuses, updates] = await Promise.all([demandRpc('atlas_demand_team_queue'), all('task_statuses', 'value,label,is_terminal', q => q.order('sort_order').order('id')), all('atlas_task_updates', '*')]);
    return { manager: false, statuses, updates, queue: queue.filter(item => !clientId || item.client_id === clientId).map(item => ({ ...item, status_label: statuses.find(s => s.value === item.status)?.label || 'Situação a conferir' })) };
  }
  const scoped = q => clientId ? q.eq('client_id', clientId) : q;
  const [demands, clients, people, tasks, statuses, projects] = await Promise.all([
    all('atlas_demands', '*', q => scoped(q).order('updated_at', { ascending: false }).order('id')),
    all('clientes', 'id,empresa,etiquetas,etapa', q => q.eq('etapa', 'closed').order('empresa').order('id')),
    all('profiles', 'id,full_name,role,status', q => q.eq('status', 'active').in('role', ['superadmin', 'admin', 'colaborador']).order('full_name').order('id')),
    all('tarefas', '*', q => scoped(q).order('created_at', { ascending: false }).order('id')),
    all('task_statuses', 'id,value,label,is_terminal,is_initial', q => q.order('sort_order').order('id')),
    all('projetos', 'id,name,client_id,status', q => scoped(q).order('created_at', { ascending: false }).order('id')),
  ]);
  const taskIds = [...new Set(demands.map(d => d.task_id).filter(Boolean))];
  const comments = [];
  const events = [];
  for (let index = 0; index < taskIds.length; index += 100) comments.push(...await all('task_comments', 'id,task_id,user_id,content,created_at', q => q.in('task_id', taskIds.slice(index, index + 100)).order('created_at').order('id')));
  for (let index = 0; index < demands.length; index += 100) events.push(...await all('atlas_demand_events', '*', q => q.in('demand_id', demands.slice(index, index + 100).map(d => d.id)).order('created_at').order('id')));
  const updates = [];
  for (let index = 0; index < taskIds.length; index += 100) updates.push(...await all('atlas_task_updates', '*', q => q.in('task_id', taskIds.slice(index, index + 100))));
  const followup = ATLAS_DEMAND_PILOT ? null : (await all('atlas_office_state', 'followup_checked_at,followup_error'))[0] || null;
  return { manager: true, demands, clients, people, tasks, statuses, projects, comments, events, updates, followup };
}
async function aiCall(body, signal) {
  const { data } = await supabase.auth.getSession();
  if (!data?.session?.access_token) throw new Error('Sua sessão expirou. Entre novamente.');
  const response = await fetch(getSupabaseFunctionsBaseUrl() + '/atlas-demand-ai', {
    method: 'POST', headers: { 'Content-Type': 'application/json', apikey: supabaseAnonKey, Authorization: 'Bearer ' + data.session.access_token },
    body: JSON.stringify(body), signal,
  });
  const value = await response.json();
  if (!response.ok || !value.ok) { const error = new Error(value.error || 'A análise não foi concluída.'); error.status = response.status; throw error; }
  return value;
}
export async function analyzeDemand(demandId, requestId, signal) {
  let value = await aiCall({ action: 'analyze', demand_id: demandId, request_id: requestId }, signal);
  for (let attempt = 0; value.state === 'processing' && attempt < 25; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 2000));
    if (signal?.aborted) throw new DOMException('Cancelado', 'AbortError');
    value = await aiCall({ action: 'status', request_id: requestId }, signal);
  }
  if (value.state !== 'completed') throw new Error('Análise ainda em andamento. Atualize antes de repetir.');
  return value;
}

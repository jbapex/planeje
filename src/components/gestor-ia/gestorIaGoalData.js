import { CLIENT_TRAFFIC_GOAL_FIELDS, saveClienteForm } from '@/lib/clienteSave';
import { canUseGestorIa } from './gestorIaAccess';

export const VOLUME_GOAL_LABELS = { leads_goal: 'Leads', agendamentos_goal: 'Agendamentos', vendas_goal: 'Vendas' };
export const TRAFFIC_GOAL_LABELS = {
  objetivo_meta: 'Objetivo de tráfego',
  meta_custo_mensagem: 'Custo por mensagem alvo (R$)',
  meta_custo_compra: 'Custo por compra alvo (R$)',
  roas_alvo: 'ROAS alvo (×)',
  limite_meta: 'Limite de gasto Meta (R$)',
};
export const TRAFFIC_GOAL_OBJECTIVES = { mensagens: 'Mensagens', compras: 'Compras', misto: 'Mensagens e compras' };
const VOLUME_FIELDS = Object.keys(VOLUME_GOAL_LABELS);
const MONTH_COLUMNS = ['client_id', 'reference_month', ...VOLUME_FIELDS].join(',');

export function editableTrafficGoalFields(client, canViewField) {
  return CLIENT_TRAFFIC_GOAL_FIELDS.filter((key) => Object.hasOwn(client, key) && canViewField?.(key) === true &&
    (key !== 'limite_meta' || canViewField('valor') === true));
}

export function validGoalMonth(month) {
  return typeof month === 'string' && /^[1-9]\d{3}-(0[1-9]|1[0-2])-01$/.test(month);
}

async function authorizeGoal(db, { profile, modules, client }, module) {
  if (!canUseGestorIa(profile, modules) || !['superadmin', 'admin'].includes(profile.role) || modules[module] !== true ||
      typeof client?.id !== 'string' || !client.id || client.etapa !== 'closed') throw new Error('Sem acesso às metas deste cliente.');
  const [session, access, active] = await Promise.all([
    db.rpc('planeje_current_account_access'),
    db.rpc('central_trafego_can_access_client', { p_cliente_id: client.id }),
    db.from('clientes').select('id').eq('id', client.id).eq('etapa', 'closed').maybeSingle(),
  ]);
  if (session.error || session.data !== true || access.error || access.data !== true || active.error || active.data?.id !== client.id) {
    throw new Error('Cliente indisponível para editar metas.');
  }
}

function goalChanges(fields, draft, previous, integer) {
  const changes = {};
  for (const key of fields) {
    if (!Object.hasOwn(draft, key)) continue;
    const raw = draft[key];
    const invalidType = raw != null && !['number', 'string'].includes(typeof raw);
    const text = String(raw ?? '').trim();
    if (!invalidType && text === String(previous[key] ?? '').trim()) continue;
    const value = !text ? null : key === 'objetivo_meta' ? text : Number(text.replace(',', '.'));
    const invalidValue = value !== null && (key === 'objetivo_meta'
      ? !Object.hasOwn(TRAFFIC_GOAL_OBJECTIVES, value)
      : !Number.isFinite(value) || value < 0 || integer && (!Number.isInteger(value) || value > 2147483647));
    if (invalidType || invalidValue) {
      throw new Error(key === 'objetivo_meta' ? 'Escolha um objetivo de tráfego válido.' : integer ? 'Use números inteiros maiores ou iguais a zero.' : 'Use números maiores ou iguais a zero.');
    }
    if (String(value ?? '') !== String(previous[key] ?? '')) changes[key] = value;
  }
  return changes;
}

export async function saveGestorTrafficGoals(db, scope) {
  const { client, canViewField, draft } = scope;
  await authorizeGoal(db, scope, 'clients');
  const clientData = goalChanges(editableTrafficGoalFields(client, canViewField), draft, client, false);
  if (!Object.keys(clientData).length) return;
  const { data, error } = await saveClienteForm({ clientData, editingClient: client, isNew: false, trafficGoalsOnly: true });
  if (error || data?.id !== client.id) throw new Error('Não foi possível salvar a meta de tráfego.');
}

export async function loadGestorMonthlyGoals(db, scope) {
  if (!validGoalMonth(scope.month)) throw new Error('Escolha um mês válido.');
  await authorizeGoal(db, scope, 'reports');
  const { data, error } = await db.from('client_result_goals').select(MONTH_COLUMNS)
    .eq('client_id', scope.client.id).eq('reference_month', scope.month).maybeSingle();
  if (error) throw new Error('Não foi possível consultar as metas do mês.');
  return data || {};
}

export async function saveGestorMonthlyGoals(db, scope) {
  const { client, month, draft, previous } = scope;
  if (!validGoalMonth(month)) throw new Error('Escolha um mês válido.');
  await authorizeGoal(db, scope, 'reports');
  const changes = goalChanges(VOLUME_FIELDS, draft, previous, true);
  if (!Object.keys(changes).length) return previous;
  const { data, error } = await db.from('client_result_goals').upsert({
    client_id: client.id, reference_month: month, ...changes, updated_at: new Date().toISOString(),
  }, { onConflict: 'client_id,reference_month' }).select(MONTH_COLUMNS).single();
  if (error || data?.client_id !== client.id || data?.reference_month !== month) throw new Error('Não foi possível salvar as metas do mês.');
  return data;
}

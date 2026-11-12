import { dateRange } from '../../lib/trafficPerformanceReport.js';
import { MEDIA_GOAL_OBJECTIVES, parseMediaGoalDraft } from './gestorIaMediaGoalModel.js';
import { normalizeInsight } from './gestorIaMetricModel.js';

const fields = 'id,client_id,account_id,name,objective,scope,campaign_ids,cost_cents,budget_cents,result_target,is_active,is_primary,updated_at';
export const goalAccountId = (account) => account?.startsWith('act_') ? account : `act_${account || ''}`;
export const MEDIA_GOAL_SUMMARY_FIELDS = 'id,client_id,account_id,name,objective,scope,campaign_ids,cost_cents,budget_cents,result_target,is_active,is_primary';

export async function loadGestorGoalReadings(db, goalIds, period, signal) {
  const timeRange = dateRange(period?.since, period?.until);
  if (!timeRange) throw new Error('Escolha um período válido.');
  const { data, error } = await db.functions.invoke('gestor-ia-meta', { signal, body: {
    action: 'get-gestor-goal-readings', goal_ids: goalIds, time_range: { since: timeRange.since, until: timeRange.until },
  } });
  if (error || !Array.isArray(data?.readings)) {
    const denied = [401, 403, 404].includes(error?.context?.status);
    throw Object.assign(new Error(denied ? 'Acesso à leitura Meta indisponível.' : 'Progresso das metas indisponível.'), { accessDenied: denied });
  }
  return Object.fromEntries(data.readings.map(({ goalId, accountId, reading }) => {
    const range = dateRange(reading?.period?.since, reading?.period?.until);
    if (reading && !range) throw new Error('Janela salva inválida.');
    const campaigns = reading?.campaigns || [];
    const partial = reading?.partial === true || campaigns.some(campaign => !campaign.insights?.data?.length);
    return [goalId, { accountId, reading: range ? { period: { since: range.since, until: range.until },
      fetchedAt: reading.fetchedAt, account: normalizeInsight(reading.accountRows?.[0]), campaigns, partial,
      derived: reading.derived === true, campaignMetricsPartial: reading.campaignMetricsPartial ?? partial,
    } : { fetchedAt: null } }];
  }));
}

export function linkedMediaGoals(goals, accounts) {
  if (goals === null || accounts === null) return null;
  const linked = new Set((accounts || []).map(({ meta_account_id }) => goalAccountId(meta_account_id)));
  return (goals || []).filter(({ account_id, objective }) => linked.has(account_id) && Object.hasOwn(MEDIA_GOAL_OBJECTIVES, objective));
}

export async function loadMediaGoals(db, clientId) {
  const { data, error } = await db.from('gestor_ia_metas_campanha').select(fields).eq('client_id', clientId)
    .order('is_primary', { ascending: false }).order('is_active', { ascending: false }).order('name');
  if (error || !Array.isArray(data)) throw new Error('Não foi possível consultar as metas de campanha.');
  return data;
}

export async function saveMediaGoal(db, { clientId, accountId, goalId, draft, adjustment, updatedAt }) {
  const values = parseMediaGoalDraft(draft);
  const account = goalAccountId(accountId);
  const scope = { p_client_id: clientId, p_account_id: account, p_goal_id: goalId || null };
  const { data, error } = adjustment ? await db.rpc('gestor_ia_ajustar_meta', {
    ...scope, p_expected_updated_at: updatedAt,
    p_budget_cents: adjustment === 'budget' ? values.budget_cents : null,
    p_result_target: adjustment === 'volume' ? values.result_target : null,
  }) : await db.rpc('gestor_ia_salvar_meta', {
    ...scope,
    ...Object.fromEntries(Object.entries(values).map(([key, value]) => [`p_${key}`, value])),
  });
  if (adjustment && error?.code === '40001') {
    throw Object.assign(new Error('A meta mudou. Feche o painel e abra o cenário novamente.'), { conflict: true });
  }
  const saved = Array.isArray(data) ? data[0] : data;
  if (error || saved?.client_id !== clientId || saved.account_id !== account) throw new Error('Não foi possível salvar a meta nesta conta.');
  return saved;
}

import { MEDIA_GOAL_OBJECTIVES } from '../components/gestor-ia/gestorIaMediaGoalModel.js';
import { dateRange } from './trafficPerformanceReport.js';

export const PORTAL_PERFORMANCE_OBJECTIVES = Object.fromEntries(Object.entries(MEDIA_GOAL_OBJECTIVES).map(([key, spec]) =>
  [key, key === 'alcance' ? { ...spec, volume: 'Impressões', resultKey: 'impressions' } : spec]));
export const PORTAL_PERFORMANCE_REASONS = {
  NO_ACCOUNTS: 'Sem contas Meta disponíveis para esta leitura.',
  NO_COMMON_READING: 'Aguardando dias com leitura em comum nas contas Meta.',
  MIXED_CURRENCY: 'As contas da leitura usam moedas diferentes.',
};

const validState = (row) => typeof row?.shared === 'boolean' && Number.isSafeInteger(row.revision) && row.revision >= 0 &&
  (row.objective === null && !row.shared || Object.hasOwn(PORTAL_PERFORMANCE_OBJECTIVES, row.objective));

export async function loadPortalPerformanceSetting(db, clientId) {
  const { data, error } = await db.rpc('gestor_ia_consultar_metricas_portal', { p_client_id: clientId });
  if (error || !validState(data)) throw new Error('Não foi possível consultar o compartilhamento.');
  return data;
}

export async function savePortalPerformanceSetting(db, clientId, shared, objective, revision) {
  const { data, error } = await db.rpc('gestor_ia_configurar_metricas_portal', { p_client_id: clientId,
    p_shared: shared, p_objective: objective, p_revision: revision });
  if (error?.code === '40001') throw new Error('O compartilhamento mudou em outra tela. Confira o estado atual.');
  if (error || !validState(data) || data.shared !== shared || data.revision !== revision + 1 || data.objective !== objective) {
    throw new Error('Não foi possível confirmar o compartilhamento. Confira o estado atual.');
  }
  return data;
}

function validMeasures(values) {
  return Number.isSafeInteger(values?.measuredDays) && values.measuredDays >= 0 && ['spend','result','cost'].every((key) =>
    values[key] === null || Number.isFinite(values[key]) && values[key] >= 0);
}

export async function loadPortalPerformance(db, clientId, objective) {
  const body = objective ? { action: 'get-gestor-portal-metrics-preview', cliente_id: clientId, objective } : { action: 'get-gestor-portal-metrics' };
  const { data, error } = await db.functions.invoke('gestor-ia-meta', { body });
  const p = data?.performance;
  const validPerformance = p && Object.hasOwn(PORTAL_PERFORMANCE_OBJECTIVES, p.objective) && /^[A-Z]{3}$/.test(p.currency) &&
    dateRange(p.period?.since, p.period?.until) && Number.isFinite(Date.parse(p.fetchedAt)) && validMeasures(p.total) &&
    Array.isArray(p.weeks) && p.weeks.length > 0 && p.weeks.length <= 4 && p.weeks.every((week) => dateRange(week.since, week.until) && validMeasures(week));
  if (error || (data?.shared !== false && (data?.shared !== true || data.clientId !== clientId ||
      (p === null ? !Object.hasOwn(PORTAL_PERFORMANCE_REASONS, data.reason) : !validPerformance)))) {
    throw new Error('Não foi possível consultar os números do portal.');
  }
  return data;
}

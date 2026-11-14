import { canUseGestorIa } from './gestorIaAccess';
import { normalizeRoutineWeek } from '@/lib/gestorIaRoutine';
import { buildRoutineCohortReport } from '@/lib/gestorIaCohorts';

const denied = () => Object.assign(new Error('Acesso ao Rastreamento e à rotina deste cliente necessário.'), { accessDenied: true });

export async function loadRoutineCohorts(db, { profile, modules, clientId, weekStart, signal }) {
  if (!canUseGestorIa(profile, modules) || modules.rastreamento !== true) throw denied();
  if (!clientId || normalizeRoutineWeek(weekStart) !== weekStart) throw new Error('Escolha cliente e semana válidos.');
  const authorize = async () => {
    const { data, error } = await db.rpc('central_trafego_can_access_client', { p_cliente_id: clientId }).abortSignal(signal);
    if (error || data !== true) throw denied();
  };
  await authorize();
  const { data, error } = await db.rpc('gestor_ia_cohort_data', { p_client: clientId, p_week: weekStart, p_actor: null }).abortSignal(signal);
  if (error?.code === '42501') throw denied();
  if (error || data?.cliente_id !== clientId || data?.semana !== weekStart) throw new Error('Não foi possível consultar as coortes. Tente novamente.');
  let report;
  try { report = buildRoutineCohortReport(data); }
  catch { throw new Error('Não foi possível consultar as coortes. Tente novamente.'); }
  await authorize();
  return report;
}

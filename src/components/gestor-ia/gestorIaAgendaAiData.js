import { decisionPayload } from './gestorIaDecisionLog';

export const GESTOR_AGENDA_AI_ENABLED = import.meta.env?.VITE_GESTOR_IA_AGENDA_AI_ENABLED === 'true';

const states = new Set(['queued', 'reserved', 'ready', 'empty', 'failed', 'limited', 'account_used', 'superseded']);

export async function loadAgendaAiStatus(db, agendaId) {
  const { data, error } = await db.rpc('gestor_ia_status_agenda_ia', { p_agenda_id: agendaId });
  if (error || (data && (!states.has(data.state) || !Number.isSafeInteger(data.discoveries) || !Number.isSafeInteger(data.plans)))) {
    throw new Error('Análise da agenda indisponível.');
  }
  return data;
}

export async function loadAgendaPlan(db, decisionId) {
  const { data, error } = await db.rpc('gestor_ia_plano_do_aviso', { p_decision_id: decisionId });
  if (error || (data && !states.has(data.state))) throw new Error('Plano da agenda indisponível.');
  if (!data) return null;
  if (data.state !== 'ready') return { state: data.state };
  const { detail, steps, days, verification } = decisionPayload({ ...data.plan, detail: data.plan?.hypothesis });
  if (!detail || !steps.length || !days || !verification) throw new Error('Plano da agenda indisponível.');
  const learningVersion = Number.isInteger(data.learningVersion) && data.learningVersion > 0 ? data.learningVersion : null;
  return { state: 'ready', completedAt: data.completedAt, learningVersion,
    plan: { hypothesis: detail, steps, days, verification, usedMemory: data.plan.usedMemory === true } };
}

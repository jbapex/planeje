import { isTerminalTaskStatus } from '../../lib/taskUrgency.js';
import { dateRange } from '../../lib/trafficPerformanceReport.js';
import { decisionMemoryReference, MAX_DECISION_MEMORIES } from '../../../supabase/functions/gestor-ia-decisions/memory.js';

const TABLE = 'gestor_ia_decisoes';
const COLUMNS = 'id,client_id,source_key,origin,title,payload,status,task_id,verdict,verdict_note,history,revision,created_at';
const canceled = new Set(['canceled', 'cancelled', 'cancelado', 'cancelada', 'archived', 'arquivado', 'arquivada']);
export const DECISION_ORIGINS = { ai: 'Sugestão da IA', signal: 'Regra do Planeje', note: 'Nota' };
export const DECISION_VERDICTS = { improved: 'Melhorou', not_improved: 'Não melhorou', inconclusive: 'Inconclusivo' };
export const DECISION_EVIDENCE = { spend: 'Investimento', leads: 'Leads', messages: 'Conversas', purchases: 'Compras na Meta', impressions: 'Impressões', clicks: 'Cliques',
  landingPageViews: 'Visitas à página', postEngagements: 'Interações na publicação', cost: 'Custo por resultado', previousCost: 'Custo no recorte anterior',
  target: 'Custo alvo', projectedSpend: 'Investimento projetado', budget: 'Verba da meta', flaggedSpend: 'Investido nos itens sinalizados',
  previousSpend: 'Investimento no recorte anterior', previousResults: 'Resultados no recorte anterior', recentSpend: 'Investido nos últimos 3 dias fechados',
  ctr: 'CTR de link', previousCtr: 'CTR de link anterior', frequency: 'Frequência no último dia', previousFrequency: 'Frequência no último dia anterior' };
export const DECISION_ENTITY_LEVELS = { ad: 'Anúncio', adset: 'Conjunto', campaign: 'Campanha', account: 'Conta' };
const text = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const measure = (value) => Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER ? value : null;

function readEntityEvidence(input) {
  if (!Array.isArray(input)) return [];
  return input.filter((row) => Object.hasOwn(DECISION_ENTITY_LEVELS, row?.level) && text(row.name, 120) && measure(row.spend) !== null)
    .slice(0, 6).map((row) => {
      const dailyResults = Array.isArray(row.dailyResults) && row.dailyResults.length === 3 && row.dailyResults.every((value) => measure(value) !== null)
        ? row.dailyResults : null;
      const dailyCosts = Array.isArray(row.dailyCosts) && row.dailyCosts.length === 3 ? row.dailyCosts.map(measure) : null;
      return { level: row.level, name: text(row.name, 120).replace(/[\p{C}]/gu, ' '), spend: row.spend,
        results: measure(row.results), cost: measure(row.cost), frequency: measure(row.frequency), ctr: measure(row.ctr), previousCtr: measure(row.previousCtr),
        ...(dailyResults && dailyCosts && { dailyResults, dailyCosts }) };
    });
}

const subjectNames = (rows) => rows.filter(({ level }) => level === 'ad' || level === 'adset')
  .map(({ level, name }) => `${DECISION_ENTITY_LEVELS[level]} · ${name}`).join(' / ');

export function decisionPayload(input = {}) {
  const item = input || {};
  const entityEvidence = readEntityEvidence(item.entityEvidence);
  const period = dateRange(item.period?.since, item.period?.until);
  const comparisonPeriod = entityEvidence.length || item.agendaDiscovery === true ? dateRange(item.comparisonPeriod?.since, item.comparisonPeriod?.until) : null;
  const evidence = Array.isArray(item.evidence) ? item.evidence.filter((row) => Object.hasOwn(DECISION_EVIDENCE, row?.key) &&
    (row.key !== 'flaggedSpend' || entityEvidence.length) && measure(row.value) !== null).slice(0, 4).map(({ key, value }) => ({ key, value })) : [];
  const memoryEvidence = Array.isArray(item.memoryEvidence)
    ? item.memoryEvidence.map(decisionMemoryReference).filter(Boolean).slice(0, MAX_DECISION_MEMORIES) : [];
  const campaignId = typeof item.measurement?.campaignId === 'string' && /^\d{1,32}$/.test(item.measurement.campaignId) ? item.measurement.campaignId : null;
  const adId = item.agendaDiscovery === true && item.kind === 'criativo' && campaignId && typeof item.measurement?.adId === 'string' &&
    /^\d{1,32}$/.test(item.measurement.adId) ? item.measurement.adId : null;
  const accountId = typeof item.measurement?.accountId === 'string' && /^act_\d{1,32}$/.test(item.measurement.accountId) ? item.measurement.accountId : null;
  const objective = ['leads', 'mensagens', 'compras', 'trafego', 'engajamento', 'alcance'].includes(item.measurement?.objective) ? item.measurement.objective : null;
  const agendaLearningId = typeof item.agendaLearningId === 'string' && /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(item.agendaLearningId) ? item.agendaLearningId : null;
  return {
    detail: text(item.detail, 800), source: text(item.source, 140), kind: text(item.kind, 32),
    period, syncedAt: text(item.syncedAt, 32),
    currency: /^[A-Z]{3}$/.test(item.currency || '') ? item.currency : '', evidence, memoryEvidence,
    ...(entityEvidence.length && { entityEvidence }),
    ...(period && comparisonPeriod?.until < period.since && { comparisonPeriod }),
    ...(agendaLearningId && { agendaLearningId }),
    ...(item.agendaDiscovery === true && { agendaDiscovery: true,
      learningVersion: Number.isSafeInteger(item.learningVersion) && item.learningVersion > 0 ? item.learningVersion : null }),
    ...(adId && { discoveryAd: text(item.discoveryAd, 120).replace(/[\p{C}]/gu, ' ') }),
    measurement: { ...(campaignId && { campaignId }), ...(adId && { adId }), ...(accountId && { accountId }), ...(objective && { objective }) },
    steps: Array.isArray(item.steps) ? item.steps.slice(0, 3).map((step) => text(step, 180)).filter(Boolean) : [],
    verification: text(item.verification, 240), days: [3, 7, 14].includes(item.days) ? item.days : null,
    rank: Number.isFinite(item.rank) ? item.rank : null,
  };
}

export function aiDecisionRows(clientId, analysis) {
  return analysis.suggestions.map((suggestion) => {
    const payload = decisionPayload({ ...suggestion, detail: suggestion.why, period: analysis.period, syncedAt: analysis.syncedAt, currency: analysis.currency });
    const source = payload.measurement.campaignId ? `campanha:${payload.measurement.campaignId}` : payload.source;
    const key = JSON.stringify([payload.syncedAt, payload.period?.since, payload.period?.until, source, payload.kind,
      payload.evidence.map(({ key }) => key).sort(), ...(payload.measurement.accountId ? [payload.measurement.accountId] : [])]);
    const context = payload.memoryEvidence.length && /^[0-9a-f]{64}$/.test(analysis.memoryContext || '') ? `:${analysis.memoryContext}` : '';
    return { client_id: clientId, origin: 'ai', source_key: `ai:${key}${context}`, title: text(suggestion.title, 110), payload };
  });
}

export function signalDecisionRow(clientId, action, summary) {
  const payload = decisionPayload({ detail: action.detail || action.action, source: action.action, period: summary.period, syncedAt: summary.syncedAt,
    currency: summary.currency, rank: action.rank, evidence: ['spend', 'messages', 'leads'].map((key) => ({ key,
      value: typeof summary[key] === 'string' && summary[key].trim() ? Number(summary[key]) : summary[key] })) });
  return { client_id: clientId, origin: 'signal', source_key: `signal:${action.code}:${payload.period?.since || ''}:${payload.period?.until || ''}`, title: action.title, payload };
}

export function isDecisionTaskComplete(task, statuses) {
  const status = String(task?.status || '').trim();
  return !canceled.has(status.toLowerCase()) && isTerminalTaskStatus(status, statuses);
}

export function decisionLane(record, task, statuses) {
  if (record.status === 'dismissed' || record.verdict) return 'resolved';
  if (record.status !== 'approved') return 'pending';
  return isDecisionTaskComplete(task, statuses) ? 'verdict' : 'approved';
}

export function decisionTaskDraft(record, ownerId, plan) {
  const { detail, steps, verification, days, discoveryAd, entityEvidence = [] } = decisionPayload(record.payload);
  const subjects = discoveryAd ? `Anúncio · ${discoveryAd}` : subjectNames(entityEvidence);
  const actions = (plan?.steps || steps).map((step, i) => `${i + 1}. ${step}`);
  const lines = plan
    ? [`Hipótese da IA\n${plan.hypothesis.slice(0, 140)}`, ...actions, `Verificar em ${plan.days} dias após a ação.\n${plan.verification}`, subjects,
      detail !== plan.hypothesis && detail]
    : [detail, subjects, ...actions, verification && (days ? `Em ${days} dias após a ação: ${verification}` : verification)];
  const description = [DECISION_ORIGINS[record.origin], ...lines].filter(Boolean).join('\n').slice(0, 1000);
  return { gestorIa: true, backOnClose: true, draftOwnerId: ownerId, draftClientId: record.client_id,
    draftDecision: { title: record.title, description }, gestorIaDecision: { id: record.id, revision: record.revision } };
}

export function decisionMemoryDraft(record, ownerId) {
  const observation = text(record.verdict_note, 800);
  if (!record.id || !ownerId || !Object.hasOwn(DECISION_VERDICTS, record.verdict) || !observation) return null;
  const { period, discoveryAd, entityEvidence = [] } = decisionPayload(record.payload);
  const content = [`Decisão de tráfego: ${record.title}`, `Veredito registrado: ${DECISION_VERDICTS[record.verdict]}.`,
    `Observação: ${observation}`, discoveryAd ? `Anúncio · ${discoveryAd}` : subjectNames(entityEvidence),
    period && `Recorte que motivou a decisão: ${period.since} a ${period.until}.`].filter(Boolean).join('\n');
  return { gestorDecisionMemory: { ownerId, clientId: record.client_id, content, decisionId: record.id, revision: record.revision } };
}

export function readDecisionMemoryDraft(state, clientId, ownerId) {
  const draft = state?.gestorDecisionMemory;
  if (!ownerId || !clientId || draft?.ownerId !== ownerId || draft?.clientId !== clientId ||
    typeof draft.content !== 'string' || !draft.content.trim() || draft.content.length > 4000) return null;
  const hasSource = typeof draft.decisionId === 'string' && draft.decisionId.length > 0 && draft.decisionId.length <= 80 &&
    Number.isSafeInteger(draft.revision) && draft.revision > 0;
  return { content: draft.content.trim(), ...(hasSource && { decisionId: draft.decisionId, revision: draft.revision }) };
}

async function readDecisionRows(db, ownerId) {
  const rows = [];
  for (;;) {
    const request = db.from(TABLE).select(COLUMNS).eq('owner_id', ownerId).order('id').limit(200);
    const lastId = rows.at(-1)?.id;
    const { data, error } = await (lastId ? request.gt('id', lastId) : request);
    if (error || !Array.isArray(data)) throw Object.assign(new Error('Histórico de decisões indisponível.'), { accessDenied: error?.code === '42501' });
    if (!data.length) return rows;
    rows.push(...data);
  }
}

export async function loadDecisionLog(db, ownerId, canUseTasks) {
  const loadStatuses = async () => canUseTasks ? db.from('task_statuses').select('value,label,is_terminal') : null;
  const [rows, statuses] = await Promise.all([readDecisionRows(db, ownerId), loadStatuses()]);
  return { rows, statuses: statuses?.data || [], statusesError: Boolean(statuses?.error) };
}

export async function saveDecisionRows(db, rows) {
  if (!rows.length) return;
  const { error } = await db.from(TABLE).upsert(rows, { onConflict: 'owner_id,client_id,source_key', ignoreDuplicates: true });
  if (error) throw new Error('Não foi possível guardar as decisões.');
}

export async function findDecision(db, ownerId, draft) {
  const { data, error } = await db.from(TABLE).select(COLUMNS).eq('owner_id', ownerId).eq('client_id', draft.client_id)
    .eq('source_key', draft.source_key).maybeSingle();
  if (error || !data?.id || data.client_id !== draft.client_id) throw new Error('Não foi possível confirmar o registro da decisão.');
  return data;
}

export async function updateDecision(db, record, patch) {
  const { data, error } = await db.from(TABLE).update(patch).eq('id', record.id).eq('revision', record.revision).select(COLUMNS).maybeSingle();
  if (error?.code === '23514' || error?.code === '42501') throw new Error(error.message);
  if (error) throw new Error('Não foi possível atualizar a decisão.');
  if (data?.id !== record.id || !Number.isInteger(data?.revision)) throw new Error('A decisão mudou em outra tela. Confira o quadro e tente novamente.');
  return data;
}

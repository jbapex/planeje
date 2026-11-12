import { tryUuid } from './centralTrafego.js';

const PURPOSES = {
  analysis: 'Analise a saúde do relacionamento e proponha o próximo passo.',
  approach: 'Prepare um rascunho de abordagem para este cliente.',
  meeting: 'Prepare uma pauta de reunião com este cliente.',
};

const SIGNALS = {
  critico: 'Crítico',
  resposta_pendente: 'Resposta pendente',
  inatividade: 'Inatividade do grupo',
  queda: 'Queda de saúde',
  atencao: 'Atenção',
  sem_grupo: 'Sem grupo',
  sem_dados: 'Sem dados suficientes',
  cancelamento: 'Possível cancelamento',
  reclamacao: 'Reclamação na conversa',
  pedido_sem_solucao: 'Pedido sem solução',
  retorno_cliente: 'Retorno do cliente pendente no grupo',
  saida_participante: 'Saída de participante',
  em_dia: 'Em dia',
};

const dateFormat = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo',
});
const MAX_MESSAGE_LENGTH = 12000;
export const CS_ATLAS_TRIAGE_TAG = 'Triagem do CS IA\n\n';
export const CS_ATLAS_CLIENT_TAG = 'Ficha do CS IA\n\n';
export const CS_ATLAS_CLIENT_SOURCE = 'cs_ia_client';
export const CS_ATLAS_MESSAGE_LIMIT = MAX_MESSAGE_LENGTH - Math.max(CS_ATLAS_TRIAGE_TAG.length, CS_ATLAS_CLIENT_TAG.length);

function radarEvidence(row) {
  const name = typeof row.client_name === 'string' ? row.client_name.trim().replace(/\s+/g, ' ') : '';
  const activity = typeof row.last_activity_at === 'string' ? Date.parse(row.last_activity_at) : NaN;
  const departure = row.group_status === 'linked' ? Date.parse(row.group_departure_at) : NaN;
  const signal = row.signal === 'sem_grupo' && row.group_status === 'unavailable'
    ? 'Acesso ao grupo indisponível'
    : Object.hasOwn(SIGNALS, row.signal) && SIGNALS[row.signal];
  return [
    'Fonte dos indicadores: radar do CS IA no Planeje.',
    name && `Cliente selecionado: ${name}.`,
    Number.isFinite(row.score) && row.score >= 0 && row.score <= 100 && `Saúde: ${row.score}/100.`,
    signal && `Sinal: ${signal}.`,
    row.awaiting_since && Number.isFinite(row.wait_minutes) && row.wait_minutes >= 0 && `Espera no expediente: ${row.wait_minutes} min.`,
    Number.isFinite(activity) && `Última atividade do grupo: ${dateFormat.format(activity)} (Brasília).`,
    Number.isFinite(departure) && `Saída de participante registrada em ${dateFormat.format(departure)} (Brasília).`,
  ];
}

export function buildCsDemandDraft(row) {
  return {
    title: 'Acompanhar relacionamento com o cliente',
    context: [...radarEvidence(row), 'Confira a situação atual, indique o próximo passo e proponha um responsável e prazo para revisão.']
      .filter(Boolean).join('\n').slice(0, MAX_MESSAGE_LENGTH),
  };
}

export function csAtlasCreationRule(row, { config, policy }) {
  if (row.group_status !== 'linked') return 'unavailable';
  if (!config?.enabled) return 'paused';
  if (!config.client_ids.includes(row.client_id)) return 'outside';
  return config.mode === 'assist' && policy?.enabled && policy.create_after_clarification ? 'authorized' : 'review';
}

export function buildCsAtlasDraft({ ownerId, row, purpose, question = '' }) {
  const clientId = row?.client_id;
  const request = purpose === 'question'
    ? typeof question === 'string' && question.trim()
    : Object.hasOwn(PURPOSES, purpose) && PURPOSES[purpose];
  if (typeof ownerId !== 'string' || !ownerId.trim() || typeof clientId !== 'string' || !clientId.trim() || !request) return null;

  const message = [
    request,
    ...radarEvidence(row),
    'Separe observações de hipóteses e sinalize dados ausentes. Elabore apenas um rascunho para revisão.',
  ].filter(Boolean).join('\n');
  return message.length <= CS_ATLAS_MESSAGE_LIMIT ? { csDraft: { ownerId, clientId, message } } : null;
}

export function buildCsTriageDraft({ ownerId, clientCount, signals }) {
  if (typeof ownerId !== 'string' || !ownerId.trim() || !Number.isSafeInteger(clientCount) || clientCount < 0 || !Array.isArray(signals)) return null;
  const counts = new Map();
  for (const signal of signals) {
    if (typeof signal === 'string' && signal !== 'em_dia' && Object.hasOwn(SIGNALS, signal)) counts.set(signal, (counts.get(signal) || 0) + 1);
  }
  const summary = [...counts].map(([signal, count]) => `${SIGNALS[signal]} (${count})`);
  const message = [
    'Quais clientes da carteira de CS devo tratar hoje e o que eu faço primeiro?',
    `Carteira autorizada · ${clientCount} ${clientCount === 1 ? 'cliente' : 'clientes'} na abertura.`,
    summary.length ? `Sinais do radar na abertura · ${summary.join(', ')}.` : 'O radar não retornou sinais de acompanhamento na abertura.',
    'Use o radar atual para propor uma ordem de atendimento e o próximo passo de cada caso. Indique lacunas.',
  ].join('\n');
  return { csDraft: { ownerId, clientId: '', scope: 'portfolio', message } };
}

export function readCsAtlasDraft({ state, ownerId, base }) {
  const draft = state?.csDraft;
  if (base?.enabled !== true || typeof ownerId !== 'string' || !ownerId.trim() || draft?.ownerId !== ownerId ||
      typeof draft.message !== 'string' || draft.message.length > CS_ATLAS_MESSAGE_LIMIT || !draft.message.trim()) return null;

  if (draft.scope === 'portfolio') return draft.clientId === '' ? { clientId: '', message: draft.message.trim(), csScope: 'portfolio' } : null;
  if (typeof draft.clientId !== 'string' || !draft.clientId.trim() || !Array.isArray(base.clients) ||
      !base.clients.some((client) => client?.id === draft.clientId)) return null;

  return { clientId: draft.clientId, message: draft.message.trim(), csScope: 'client' };
}

export function isCompletedCsAtlasResponse(run) {
  return run?.status === 'completed' && Array.isArray(run.steps) &&
    run.steps.some(step => step?.kind === 'source' && step.section === CS_ATLAS_CLIENT_SOURCE && step.status === 'completed');
}

export function readCsAtlasDemandReference(state, ownerId, clientId) {
  const reference = state?.csAtlasDemand;
  if (!ownerId || !clientId || reference?.ownerId !== ownerId || reference.clientId !== clientId) return null;
  const runId = tryUuid(reference.runId), conversationId = tryUuid(reference.conversationId);
  return runId && conversationId ? { ownerId, clientId, runId, conversationId } : null;
}

export function csAtlasDemandLink({ ownerId, clientId, conversationId, run }) {
  if (!isCompletedCsAtlasResponse(run)) return null;
  const reference = readCsAtlasDemandReference({ csAtlasDemand: { ownerId, clientId, conversationId, runId: run.id } }, ownerId, clientId);
  return reference ? { to: `/cs-ia/clientes/${encodeURIComponent(clientId)}?aba=tarefas`, state: { csAtlasDemand: reference } } : null;
}

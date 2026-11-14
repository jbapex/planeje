import { EXECUTOR_AGENTS } from '../../../supabase/functions/_shared/atlasExecutor.js';
import { OWNER, CLIENT } from './session.js';

const KEY = 'planeje:executor-preview:' + OWNER;
const fresh = () => ({ owner: OWNER, conversations: [], records: {}, requests: {}, calls: [], writes: 0, decisions: 0, faults: {} });
const read = () => { try { const value = JSON.parse(localStorage.getItem(KEY)); return value?.owner === OWNER ? value : fresh(); } catch { return fresh(); } };
const write = state => localStorage.setItem(KEY, JSON.stringify(state));
const clone = value => structuredClone(value);
const now = () => new Date().toISOString();
const identify = () => crypto.randomUUID();
const record = (state, action, payload) => state.calls.push({ action, payload: payload === undefined ? null : clone(payload) });
let nextHold = false; let releaseHeld;
const fields = [
  { id: 'empresa', label: 'Empresa', type: 'text', required: true, maxLength: 120 },
  { id: 'nome', label: 'Nome do agente', type: 'text', required: true, maxLength: 120 },
  { id: 'tom', label: 'Tom de atendimento', type: 'select', required: true, options: [{ value: 'profissional', label: 'Profissional' }, { value: 'cordial', label: 'Cordial' }, { value: 'direto', label: 'Direto' }] },
  { id: 'objetivo', label: 'Objetivo do agente', type: 'textarea', required: true, maxLength: 1200 },
  { id: 'variaveis', label: 'Variáveis úteis', type: 'multiselect', required: true, options: [{ value: 'nome', label: 'Nome do contato' }, { value: 'servico', label: 'Serviço procurado' }, { value: 'horario', label: 'Horário desejado' }] },
  { id: 'etapa', label: 'Etapa de entrada', type: 'select', required: true, options: [{ value: 'novo', label: 'Novo contato' }, { value: 'qualificacao', label: 'Qualificação' }] },
];
function findItem(state, itemId) {
  for (const record of Object.values(state.records)) { const item = record.interactions.find(item => item.id === itemId); if (item) return { item, history: record }; }
  throw new Error('Item sintético não localizado.');
}
function events(stage, itemId) {
  const add = (agent, kind, status, summary, app = agent) => ({ agent, parent: agent === 'central' ? null : 'central', app, kind, status, summary, at: now() });
  return [
    add('central', 'coordination', 'running', 'Fixture: pedido recebido pelo Atlas.', 'atlas'),
    add('crm', 'delegation', 'running', 'Fixture: CRM IA chamado para a configuração.'),
    add('crm', 'read', 'running', 'Fixture: consultando a configuração local.'),
    { ...add('crm', 'read', 'completed', 'Fixture: configuração sintética consultada.'), source: { available: true, synthetic: true } },
    add('cs', 'delegation', 'running', 'Fixture: CS IA chamado para conferir o contexto.'),
    add('cs', 'read', 'completed', 'Fixture: contexto sintético de relacionamento consultado.'),
    add('cs', 'answer', 'completed', 'Fixture: parecer do CS IA registrado.'),
    add('gestor', 'delegation', 'running', 'Fixture: Gestor IA chamado para conferir a revisão.'),
    add('gestor', 'read', 'completed', 'Fixture: critérios sintéticos de revisão consultados.'),
    add('gestor', 'answer', 'completed', 'Fixture: parecer do Gestor IA registrado.'),
    { ...add('crm', stage === 'question' ? 'question' : stage === 'proposal' ? 'approval' : 'answer', stage === 'done' ? 'completed' : 'waiting', stage === 'question' ? 'Aguardando suas seis respostas.' : stage === 'proposal' ? 'Aguardando sua revisão explícita.' : 'Fixture: recibo relido e configuração sintética conferida.'), ...(itemId && { item_id: itemId }) },
    ...(stage === 'done' ? [add('central', 'answer', 'completed', 'Fixture: resultado consolidado sem operação real.', 'atlas')] : []),
  ];
}
function makeItem(history, runId, kind, data) {
  const item = { id: identify(), owner_id: OWNER, client_id: history.conversation.client_id, conversation_id: history.conversation.id, run_id: runId, revision: 1,
    kind, app: 'crm', action: 'save_agent', state: kind === 'question' ? 'awaiting_input' : 'proposed', resume_request_id: identify(), created_at: now(), ...data };
  history.interactions.push(item); return item;
}
function summary(history) {
  const latest = history.interactions.at(-1);
  if (latest?.state === 'rejected') return 'Demonstração sintética: proposta recusada. Nenhuma alteração foi registrada, e a análise pode continuar.';
  if (latest?.state === 'cancelled') return 'Demonstração sintética: etapa cancelada. Nenhuma alteração foi registrada.';
  if (latest?.decision === 'text') return 'Demonstração sintética: resposta em texto registrada. Nenhuma aprovação foi inferida e nenhuma alteração foi executada.';
  return 'Demonstração sintética: recibo salvo e configuração relida. CRM IA, CS IA e Gestor IA concluíram esta simulação; nenhum banco, provedor ou cliente real foi acionado.';
}

export const createAtlasRequestId = identify;
export async function bootstrapAtlas() {
  const state = read(); record(state, 'bootstrap'); write(state);
  return { ok: true, configured: true, enabled: true, agents: EXECUTOR_AGENTS, executor_agents: EXECUTOR_AGENTS,
    clients: [{ id: CLIENT, empresa: 'Aurora · cliente sintético' }], conversations: state.conversations, jobs: [], inbox: [], memories: [], preferences: { auto_memory: false, monitor_enabled: false, transcribe_group_audio: false } };
}
export async function loadAtlasHistory(conversationId) {
  const state = read(); record(state, 'history', { conversation_id: conversationId }); write(state);
  const history = state.records[conversationId]; if (!history) throw new Error('Conversa sintética não encontrada.');
  return clone({ ok: true, ...history });
}
export async function loadAtlasProgress(requestId) {
  const state = read(); record(state, 'progress', { request_id: requestId }); write(state);
  const run = Object.values(state.records).flatMap(history => history.runs).find(run => run.request_id === requestId);
  return { ok: true, run: clone(run || null) };
}
export async function sendAtlasMessage(payload) {
  let state = read(); record(state, 'chat', payload); write(state);
  if (payload.executor !== true) throw new Error('Esta fixture cobre somente o Conversar executor.');
  if (state.requests[payload.request_id]) return clone({ ...state.requests[payload.request_id], replayed: true });
  if (payload.client_id !== CLIENT) throw new Error('Selecione Aurora · cliente sintético no contexto.');
  const conversationId = payload.conversation_id || identify(); const runId = identify();
  if (!state.records[conversationId]) {
    const conversation = { id: conversationId, owner_id: OWNER, client_id: CLIENT, title: 'Configuração sintética do agente', updated_at: now() };
    state.conversations.unshift(conversation);
    state.records[conversationId] = { conversation, messages: [], runs: [], jobs: [], interactions: [], objective: payload.message };
  }
  const history = state.records[conversationId];
  let item; let stage = 'done'; let content;
  if (payload.executor_reply) {
    const previous = findItem(state, payload.executor_reply).item;
    if (previous.conversation_id !== conversationId || previous.resume_request_id !== payload.request_id || ['awaiting_input', 'proposed'].includes(previous.state)) throw new Error('Retomada sintética inválida.');
    if (state.faults.resume) { state.faults.resume--; write(state); throw new Error('Falha sintética na continuação; o recibo continua salvo.'); }
    if (previous.kind === 'question' && previous.decision === 'answer') {
      stage = 'proposal'; item = makeItem(history, runId, 'proposal', {
        title: 'Revisar configuração do agente sintético', payload: clone(previous.answers),
        preview: { before: { nome: 'Recepção sintética atual', tom: 'Cordial' }, after: clone(previous.answers) },
        effect: { type: 'configuration', external: false, enables_autonomy: false },
        links: [{ label: 'Abrir agente sintético no CRM IA', href: '/crm-ia/agentes?cliente=' + CLIENT }],
      });
      content = 'Demonstração sintética: preparei a proposta. Revise os dados; somente Aprovar e executar registra a alteração local.';
    } else content = summary(history);
  } else if (!history.interactions.length) {
    stage = 'question'; item = makeItem(history, runId, 'question', { title: 'Configurar agente · seis perguntas sintéticas', description: 'Demonstração local: estas respostas ficam somente neste navegador.', fields });
    content = 'Demonstração sintética: o Squad consultou as fontes locais. Complete as seis perguntas para preparar a revisão.';
  } else content = summary(history);
  const steps = events(stage, item?.id);
  const response = { ok: true, status: 'completed', request_id: payload.request_id, run_id: runId, conversation_id: conversationId, steps, message: { role: 'assistant', content } };
  const run = { id: runId, request_id: payload.request_id, status: nextHold ? 'processing' : 'completed', steps: nextHold ? steps.slice(0, 10) : steps, created_at: now(), result: content, executor_objective: history.objective };
  history.runs.unshift(run);
  history.messages.push({ id: identify(), role: 'user', content: payload.executor_reply ? 'Continue a partir da decisão sintética registrada.' : payload.message, run_id: runId, created_at: now() }, { id: identify(), role: 'assistant', content, run_id: runId, created_at: now() });
  history.conversation.updated_at = now();
  state.requests[payload.request_id] = response;
  write(state);
  if (nextHold) {
    nextHold = false;
    await new Promise(resolve => { releaseHeld = resolve; });
    releaseHeld = null;
    state = read(); const stored = state.records[conversationId].runs.find(row => row.id === runId); stored.status = 'completed'; stored.steps = steps; write(state);
  }
  return clone(response);
}
export async function respondAtlasInteraction(payload) {
  const state = read(); record(state, 'respond', payload);
  if (Object.keys(payload).some(key => !['id', 'revision', 'decision', 'answers', 'text'].includes(key))) throw new Error('Payload sintético não permitido.');
  const { item } = findItem(state, payload.id);
  if (!['awaiting_input', 'proposed'].includes(item.state)) { if (item.decision !== payload.decision) throw new Error('Outra decisão já foi registrada.'); write(state); return { ok: true, item: clone(item), replayed: true }; }
  if (item.revision !== payload.revision) throw new Error('A revisão sintética mudou.');
  if (state.faults.before) { state.faults.before--; write(state); throw new Error('Falha sintética antes de registrar. As respostas foram preservadas.'); }
  item.decision = payload.decision;
  item.state = payload.decision === 'reject' ? 'rejected' : payload.decision === 'cancel' ? 'cancelled' : 'completed';
  item.answers = payload.answers || (payload.text ? { resposta_livre: payload.text } : {});
  item.revision++;
  state.decisions++;
  if (payload.decision === 'approve') {
    state.writes++;
    item.result = { summary: 'Recibo sintético: configuração local registrada uma única vez.', id: identify(), confirmed: true, synthetic: true };
  }
  const lost = Boolean(state.faults.lost); if (lost) state.faults.lost--;
  write(state);
  if (lost) throw Object.assign(new Error('Resposta perdida de propósito na fixture; confira o histórico.'), { code: 'ATLAS_NETWORK_ERROR' });
  return { ok: true, item: clone(item) };
}

export const loadAtlasInbox = async () => ({ ok: true, items: [], worker: null });
export async function reconcileAtlasInteraction() { throw new Error('Esta demonstração não usa transporte externo.'); }
export const markAtlasInbox = async () => ({ ok: true });
export const setAtlasPreferences = async () => ({ ok: true });
export const cancelAtlasJob = async () => ({ ok: true });
export const saveAtlasMemory = async () => { throw new Error('Memória real indisponível na demonstração sintética.'); };
export const revokeAtlasMemory = saveAtlasMemory;
export const setAtlasMemoryTeamScope = saveAtlasMemory;
export const connectAtlasVoice = async () => { throw new Error('Voz real desativada na demonstração sintética.'); };
export const invokeAtlasOffice = async () => { throw new Error('Escritório real desativado na demonstração sintética.'); };

window.__atlasExecutorPreview = {
  snapshot: () => clone(read()),
  reset: () => { releaseHeld?.(); nextHold = false; localStorage.removeItem(KEY); window.location.hash = '#/assistant/atlas?view=conversation'; window.location.reload(); },
  fault: (kind, count = 1) => { if (!['before', 'lost', 'resume'].includes(kind)) throw new Error('Falha desconhecida.'); const state = read(); state.faults[kind] = count; write(state); },
  holdNext: () => { nextHold = true; }, release: () => releaseHeld?.(),
  conversationUrl: () => '/assistant/atlas?view=conversation' + (read().conversations[0] ? '&conversation=' + read().conversations[0].id : ''),
};

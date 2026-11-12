import { ATLAS_SKILL_CATALOG } from '../../supabase/functions/_shared/atlasSkillCatalog.js';
const now = '2026-10-09T01:00:00Z';
const clients = [{ id: '11111111-1111-4111-8111-111111111111', empresa: 'Cliente de demonstração' }];
const agents = [
  { id: 'central', name: 'Atlas', role: 'Coordena pedidos, contexto e resultados.', skill_version: '1.0' },
  { id: 'clientes', name: 'Clientes', role: 'Reúne alinhamentos, preferências e o contexto de cada cliente.', skill_version: '1.0' },
  { id: 'operacao', name: 'Operação', role: 'Identifica decisões pendentes e investiga bloqueios nas entregas.', skill_version: '1.0' },
  { id: 'estrategia', name: 'Estratégia e criação', role: 'Desenvolve ideias e campanhas a partir de um briefing.', skill_version: '1.0' },
].map(agent => ({ ...agent, skills: Object.values(ATLAS_SKILL_CATALOG).filter(skill => skill.agent === agent.id) }));
const conversations = [{ id: '22222222-2222-4222-8222-222222222222', title: 'Organizar as prioridades da semana', client_id: null, updated_at: now }];
const records = new Map([[conversations[0].id, { messages: [{ id: 'sample-1', role: 'user', content: 'Como podemos organizar as prioridades?', created_at: now }, { id: 'sample-2', role: 'assistant', content: 'Esta é uma resposta de demonstração. Podemos separar decisões pendentes, entregas próximas e ideias para desenvolver. Nenhum dado real foi consultado.', created_at: now }], runs: [] }]]);
const memories = [];
const requests = new Map();
const mode = new URLSearchParams(window.location.search).get('case');
const delay = () => new Promise(resolve => setTimeout(resolve, 90));
window.__atlasTest = { calls: [], queue: [], requests, records, releaseProcessing: false };
function record(action, payload) { window.__atlasTest.calls.push({ action, payload }); }
export const createAtlasRequestId = () => crypto.randomUUID();
export async function bootstrapAtlas() {
  record('bootstrap'); await delay();
  if (mode === 'unauthenticated') throw Object.assign(new Error('Sessão expirada.'), { code: 'UNAUTHENTICATED' });
  if (mode === 'forbidden') throw Object.assign(new Error('Acesso reservado.'), { code: 'ATLAS_FORBIDDEN' });
  if (mode === 'unconfigured') throw Object.assign(new Error('Não configurado.'), { code: 'ATLAS_NOT_CONFIGURED' });
  if (mode === 'error') throw new Error('Erro simulado da conexão.');
  return { ok: true, configured: true, enabled: mode !== 'disabled', agents, clients, conversations: [...conversations], memories: [...memories] };
}
export async function loadAtlasHistory(id) {
  record('history', { conversation_id: id }); await delay();
  const data = records.get(id) || { messages: [], runs: [] };
  if (window.__atlasTest.releaseProcessing) data.runs.forEach(run => { if (run.status === 'processing') run.status = 'completed'; });
  return structuredClone({ ok: true, conversation: conversations.find(item => item.id === id), ...data });
}
export async function sendAtlasMessage(payload) {
  record('chat', structuredClone(payload)); await delay();
  if (requests.has(payload.request_id)) return structuredClone({ ...requests.get(payload.request_id), replayed: true });
  const next = window.__atlasTest.queue.shift();
  const conversationId = payload.conversation_id || crypto.randomUUID();
  if (!conversations.some(item => item.id === conversationId)) conversations.unshift({ id: conversationId, title: payload.message.slice(0,55), client_id: payload.client_id, updated_at: new Date().toISOString() });
  const runId = crypto.randomUUID();
  const status = next === 'failed' ? 'failed' : next === 'processing' ? 'processing' : 'completed';
  const steps = [{ agent: 'central', skill_version: '1.0', kind: 'coordination', status: 'running', summary: 'Pedido organizado para esta demonstração local.' }, { agent: 'operacao', skill_version: '1.0', kind: 'delegation', status: 'running', summary: 'Consulta ao especialista nesta demonstração.' }, { agent: 'operacao', skill_version: '1.0', kind: 'read', status: 'completed', summary: 'Resposta de teste da interface; nenhuma consulta ao Planeje foi executada.' }];
  if (status === 'completed') steps.push({ agent: 'operacao', kind: 'answer', status: 'completed', summary: 'Parecer recebido na demonstração.' }, { agent: 'central', kind: 'answer', status: 'completed', summary: 'Resposta consolidada na demonstração.' });
  const response = { ok: status !== 'failed', request_id: payload.request_id, conversation_id: conversationId, run_id: runId, status, steps, message: status === 'completed' ? { role: 'assistant', content: 'Entendi seu pedido. Esta resposta demonstra a conversa do Atlas e o registro de uma missão. Na versão conectada, o contexto será consultado no Planeje e os especialistas serão acionados conforme a necessidade.' } : undefined, error: status === 'failed' ? 'O provedor falhou nesta simulação controlada.' : null };
  const data = records.get(conversationId) || { messages: [], runs: [] };
  data.messages.push({ id: crypto.randomUUID(), role: 'user', content: payload.message, created_at: new Date().toISOString(), run_id: runId });
  if (response.message) data.messages.push({ ...response.message, id: crypto.randomUUID(), created_at: new Date().toISOString(), run_id: runId });
  data.runs.push({ id: runId, status, steps, error: response.error, created_at: new Date().toISOString() }); records.set(conversationId, data); requests.set(payload.request_id, response);
  if (next === 'network') throw Object.assign(new Error('Falha de rede simulada. O pedido foi recebido; sua resposta ainda não foi confirmada.'), { code: 'ATLAS_NETWORK_ERROR' });
  return structuredClone(response);
}
export async function saveAtlasMemory({ content, clientId, replacesId }) { record('save_memory', { content, client_id: clientId, confirmed: true, replaces_id: replacesId }); await delay(); const previous = memories.find(item => item.id === replacesId); const memory = { id: crypto.randomUUID(), content, client_id: clientId, created_at: new Date().toISOString(), replaces_id: replacesId, version: previous ? previous.version + 1 : 1 }; if (previous) memories.splice(memories.indexOf(previous), 1); memories.unshift(memory); return { ok: true, memory }; }
export async function revokeAtlasMemory(id) { record('revoke_memory', { memory_id: id }); await delay(); const index = memories.findIndex(item => item.id === id); if (index >= 0) memories.splice(index, 1); return { ok: true }; }

export async function connectAtlasVoice() { if (new URLSearchParams(location.search).has("voice")) return { sdp: "v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111" }; throw new Error("A voz real fica disponível após conectar o provedor. Esta prévia usa apenas dados de demonstração."); }

export async function loadAtlasProgress(requestId) { return { ok: true, run: null }; }
// Manager additions remain local fixtures; never invoke production from this preview.
export async function cancelAtlasJob(id) { record('cancel_job',{id}); return {ok:true,cancelled:true}; }
export async function markAtlasInbox(id,archive=false) { record('mark_inbox',{id,archive}); return {ok:true}; }
export async function setAtlasPreferences(preferences) { record('preferences',preferences); return {ok:true}; }
export async function loadAtlasInbox() { return {ok:true,items:[],worker:null}; }

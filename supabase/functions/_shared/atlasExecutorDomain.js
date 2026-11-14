import { sanitize } from './atlasExecutorCrmValidation.js';
import { AtlasError, optionalUuid } from './atlasCore.js';

// Presentation only: callers validate the original record before projecting; execution stays in native SQL.
export const executorPresentation = value => sanitize(value, { truncated: false });

export const SQUAD_DOMAIN = 'squad';
export const SQUAD_MODES = Object.freeze(['chat', 'automation']);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const fail = (message, code = 'INVALID_INPUT', status = 400) => { throw new AtlasError(code, message, status); };
const uuid = (value, name, required = true) => { const id = optionalUuid(value, name); if (required && !id) fail(`Informe ${name}.`); return id; };
function fields(value, allowed) { if (!object(value) || Object.keys(value).some(key => !allowed.includes(key))) fail('Campos não permitidos no domínio Squad.'); }
async function rpc(caller, name, args, signal) {
  signal?.throwIfAborted();
  const query = caller.rpc(name, args);
  const { data, error } = await (signal && query.abortSignal ? query.abortSignal(signal) : query);
  signal?.throwIfAborted();
  if (error) {
    if (error.code === '42501') fail('Este contexto não está disponível no Squad atual.', 'SQUAD_FORBIDDEN', 403);
    if (error.code === '40001' || /ATLAS_(?:REQUEST|SCOPE)_CONFLICT/.test(error.message || '')) fail('O contexto, modo ou identidade do pedido mudou. Abra o contexto correto.', 'SCOPE_CONFLICT', 409);
    if (error.code === '22023') fail('Confira os campos do pedido Squad.');
    fail('Não foi possível confirmar o contexto Squad. Consulte o histórico antes de repetir.', 'STORAGE_FAILURE', 503);
  }
  if (!object(data)) fail('A fonte não confirmou o domínio Squad.', 'STORAGE_FAILURE', 503);
  return data;
}
function conversation(data, { conversationId, clientId, ownerId, mode } = {}) {
  if (!object(data) || data.domain !== SQUAD_DOMAIN || !SQUAD_MODES.includes(data.mode)) fail('Este contexto pertence ao Office ou a outro domínio.', 'SQUAD_FORBIDDEN', 403);
  if (conversationId && data.id !== conversationId || ownerId && data.owner_id !== ownerId || clientId !== undefined && data.client_id !== clientId || mode && data.mode !== mode) fail('A conversa retornou outro escopo.', 'SCOPE_CONFLICT', 403);
  return data;
}
function run(data, { runId, clientId, ownerId } = {}) {
  if (!object(data) || data.domain !== SQUAD_DOMAIN || !SQUAD_MODES.includes(data.mode) || !Array.isArray(data.attachment_ids)) fail('A execução não pertence ao Squad.', 'SQUAD_FORBIDDEN', 403);
  if (runId && data.id !== runId || ownerId && data.owner_id !== ownerId || clientId !== undefined && data.request_client_id !== clientId) fail('A execução retornou outro escopo.', 'SCOPE_CONFLICT', 403);
  return data;
}

export async function claimSquadRun(caller, raw) {
  fields(raw, ['requestId', 'conversationId', 'clientId', 'message', 'mode', 'attachmentIds', 'signal']);
  const { requestId, conversationId = null, clientId = null, message, mode = 'chat', attachmentIds = [], signal } = raw;
  if (!SQUAD_MODES.includes(mode) || typeof message !== 'string' || !message.startsWith('[Executor Planeje]\n') || message.length > 12000
    || !Array.isArray(attachmentIds) || attachmentIds.length > 4 || new Set(attachmentIds).size !== attachmentIds.length) fail('Confira o modo, a mensagem e os anexos do Squad.');
  const ids = attachmentIds.map(id => uuid(id, 'anexo'));
  const client = uuid(clientId, 'marca', false), id = uuid(requestId, 'pedido'), context = uuid(conversationId, 'conversa', false);
  const data = await rpc(caller, 'atlas_squad_claim_run', { p_request_id: id, p_conversation_id: context, p_client_id: client, p_message: message, p_mode: mode, p_attachment_ids: ids }, signal);
  if (typeof data.claimed !== 'boolean' || !object(data.run) || data.run.request_id !== id || data.run.request_client_id !== client) fail('O claim Squad não foi confirmado.', 'STORAGE_FAILURE', 503);
  conversation(data.conversation, { conversationId: data.run.conversation_id, clientId: client, mode });
  return data;
}

export async function requireSquadConversation(caller, scope) {
  const { conversationId, clientId, ownerId, mode, signal } = scope;
  const id = uuid(conversationId, 'conversa');
  return conversation(await rpc(caller, 'atlas_squad_conversation', { p_conversation_id: id }, signal), { conversationId: id, ...(clientId !== undefined && { clientId: uuid(clientId, 'marca', false) }), ownerId, mode });
}
export async function loadSquadRun(caller, { runId, clientId, ownerId, signal }) {
  const id = uuid(runId, 'execução');
  return run(await rpc(caller, 'atlas_squad_run', { p_run_id: id }, signal), { runId: id, clientId, ownerId });
}
export async function loadSquadItem(caller, { itemId, ownerId, forWrite = false, signal }) {
  const id = uuid(itemId, 'item');
  if (typeof forWrite !== 'boolean') fail('Operação do item inválida.');
  const data = await rpc(caller, 'atlas_squad_item', { p_id: id, p_write: forWrite }, signal);
  if (data.id !== id || ownerId && data.owner_id !== ownerId) fail('O item não pertence ao histórico Squad autorizado.', 'SQUAD_FORBIDDEN', 403);
  return executorPresentation(data);
}
export async function loadSquadHistory(caller, { conversationId, ownerId, clientId, signal }) {
  const id = uuid(conversationId, 'conversa');
  const data = await rpc(caller, 'atlas_squad_history', { p_conversation_id: id }, signal);
  conversation(data.conversation, { conversationId: id, ownerId, clientId });
  if (data.domain !== SQUAD_DOMAIN || !['messages', 'runs', 'interactions'].every(key => Array.isArray(data[key]))) fail('O histórico Squad está incompleto.', 'STORAGE_FAILURE', 503);
  if (data.interactions.some(item => item.conversation_id !== id || item.client_id !== data.conversation.client_id || ownerId && item.owner_id !== ownerId)) fail('O histórico retornou item de outro escopo.', 'SCOPE_CONFLICT', 403);
  return { domain: SQUAD_DOMAIN, conversation: data.conversation, messages: data.messages.map(executorPresentation), runs: data.runs.map(executorPresentation), interactions: data.interactions.map(executorPresentation), attachments: Array.isArray(data.attachments) ? data.attachments : [], coverage: data.coverage || {} };
}
export async function loadSquadBootstrap(caller, { clientId = null, signal } = {}) {
  const client = uuid(clientId, 'marca', false), data = await rpc(caller, 'atlas_squad_bootstrap', { p_client_id: client }, signal);
  if (data.domain !== SQUAD_DOMAIN || !['agents', 'clients', 'conversations', 'knowledge'].every(key => Array.isArray(data[key]))) fail('A base Squad está incompleta.', 'STORAGE_FAILURE', 503);
  data.conversations.forEach(row => conversation(row, { clientId: client }));
  if (data.knowledge.some(row => row.client_id !== client)) fail('O conhecimento pertence a outra marca.', 'SCOPE_CONFLICT', 403);
  return { domain: SQUAD_DOMAIN, agents: data.agents, clients: data.clients, conversations: data.conversations, knowledge: data.knowledge,
    knowledge_coverage: data.knowledge_coverage || {}, preferences: data.preferences || {}, limits: data.limits || {}, budget: data.budget || {} };
}
export async function loadSquadProgress(caller, { requestId, ownerId, signal }) {
  const id = uuid(requestId, 'pedido'), data = await rpc(caller, 'atlas_squad_progress', { p_request_id: id }, signal);
  if (data.run === null) return { run: null };
  run(data.run, { ownerId });
  if (data.run.request_id !== id) fail('O progresso pertence a outro pedido.', 'SCOPE_CONFLICT', 403);
  return { run: data.run };
}

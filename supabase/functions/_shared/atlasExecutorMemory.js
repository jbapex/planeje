import { AtlasError, optionalUuid } from './atlasCore.js';

const fail = message => { throw new AtlasError('INVALID_INPUT', message); };
const uuid = value => optionalUuid(value, 'conhecimento');
const fields = (input, allowed) => {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !allowed.includes(key))) fail('Campos não permitidos no conhecimento.');
};
export const EXECUTOR_MEMORY_CATALOG = Object.freeze([
  { app: 'atlas', mode: 'read', name: 'knowledge', title: 'Consultar conhecimento', fields: ['id', 'limit', 'offset'], description: 'Conhecimento próprio do Squad no escopo exato da marca atual ou geral da agência. ID opcional consulta a versão exata; limit inteiro de1a40, offset inteiro>=0; padrão40/0. Não consulta Office, memórias/RAG/jobs antigos nem faz fallback para geral.' },
  { app: 'atlas', mode: 'write', name: 'save_knowledge', title: 'Ensinar ou corrigir conhecimento', fields: ['content', 'replaces_id'], required: ['content'], description: 'Propor conhecimento de até4000 caracteres. Correção exige replaces_id de conhecimento ativo do escopo atual. Aprovar cria nova versão própria do Squad com origem no recibo confirmado; não copia para Office nem publica no CRM.' },
  { app: 'atlas', mode: 'write', name: 'revoke_knowledge', title: 'Retirar conhecimento', fields: ['id'], required: ['id'], description: 'Propor retirada de conhecimento ativo do escopo atual; preserva histórico e versões.' },
]);
const links = [{ label: 'Abrir conhecimento do Squad', href: '/assistant/atlas?view=conversation&tab=knowledge' }];
async function snapshot(caller, clientId, id, signal, limit = 40, offset = 0) {
  signal?.throwIfAborted();
  const query = caller.rpc('atlas_squad_knowledge_snapshot', { p_client_id: clientId, p_id: id, p_limit: limit, p_offset: offset });
  const { data, error } = await (signal && query.abortSignal ? query.abortSignal(signal) : query);
  signal?.throwIfAborted();
  if (error || !Array.isArray(data?.rows) || !Number.isSafeInteger(data.total) || data.total < data.rows.length) throw new AtlasError('CONTEXT_UNAVAILABLE', 'Não foi possível consultar o conhecimento autorizado.', 503);
  if (data.rows.some(row => row.client_id !== clientId || id && row.id !== id)) throw new AtlasError('SCOPE_CONFLICT', 'O conhecimento pertence a outro escopo.', 403);
  return data;
}
export async function readExecutorMemory(caller, { clientId = null, view, input = {}, signal }) {
  if (view !== 'knowledge') fail('Fonte de conhecimento inválida.');
  fields(input, ['id', 'limit', 'offset']);
  const limit = input.limit ?? 40, offset = input.offset ?? 0;
  if (!Number.isInteger(limit) || limit < 1 || limit > 40 || !Number.isSafeInteger(offset) || offset < 0) fail('Paginação do conhecimento inválida.');
  const data = await snapshot(caller, clientId, uuid(input.id), signal, limit, offset);
  return { app: 'atlas', view, client_id: clientId, available: true, queried_at: new Date().toISOString(), data, coverage: { complete: offset === 0 && data.rows.length === data.total, total: data.total, limit, offset }, links };
}
export async function prepareExecutorMemory(caller, { clientId = null, action, input = {}, signal }) {
  if (!['save_knowledge', 'revoke_knowledge'].includes(action)) fail('Ação de conhecimento inválida.');
  fields(input, action === 'save_knowledge' ? ['content', 'replaces_id'] : ['id']);
  const id = uuid(action === 'save_knowledge' ? input.replaces_id : input.id);
  if (action === 'revoke_knowledge' && !id) fail('Selecione o conhecimento a retirar.');
  const data = await snapshot(caller, clientId, id, signal);
  const before = id ? data.rows.find(row => row.id === id && row.state === 'active') : null;
  if (id && !before) fail('Este conhecimento não está ativo no escopo atual.');
  const content = typeof input.content === 'string' ? input.content.trim() : '';
  if (action === 'save_knowledge' && (!content || content.length > 4000)) fail('Escreva um conhecimento de até4.000 caracteres.');
  return { app: 'atlas', action, client_id: clientId, title: action === 'save_knowledge' ? before ? 'Corrigir conhecimento do Squad' : 'Ensinar o Squad' : 'Retirar conhecimento do Squad',
    payload: action === 'save_knowledge' ? { content, replaces_id: id, expected_version: before?.version ?? null } : { id, expected_version: before.version }, before,
    preview: { before: before ? { Conhecimento: before.content, Versão: before.version } : null, after: action === 'save_knowledge' ? { Conhecimento: content, Versão: (before?.version || 0) + 1 } : { Conhecimento: before.content, Situação: 'Retirado; histórico preservado' } },
    effect: { type: 'knowledge', external: false, enables_autonomy: false }, links };
}

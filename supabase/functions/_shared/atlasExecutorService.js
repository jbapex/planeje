import { AtlasError, optionalUuid } from './atlasCore.js';
import { runAtlasExecutor, validateExecutorQuestion, validateExecutorAnswers } from './atlasExecutor.js';
import { EXECUTOR_CATALOG, readExecutorApp, prepareExecutorAction } from './atlasExecutorCatalog.js';
import { loadSquadHistory, loadSquadItem, loadSquadRun, executorPresentation } from './atlasExecutorDomain.js';
import { readExecutorMemory } from './atlasExecutorMemory.js';
import { atlasExecutorMessageBody } from '../../../src/lib/atlasExecutorRequest.js';
import { decideExecutorExternal, reconcileExecutorExternal } from './atlasExecutorExternal.js';

const fail = (message, code = 'INVALID_INPUT', status = 400) => { throw new AtlasError(code, message, status); };
const uuid = (value, name) => { const id = optionalUuid(value, name); if (!id) fail(`Informe ${name}.`); return id; };
const checkResult = ({ data, error }) => {
  if (error) fail(error.code === '42501' ? 'O acesso a este item não está mais disponível.' : error.code === '40001' ? 'Este item mudou. Atualize o histórico antes de continuar.' : 'Não foi possível confirmar esta etapa. Consulte o histórico antes de repetir.', error.code || 'STORAGE_FAILURE', error.code === '42501' ? 403 : error.code === '40001' ? 409 : 503);
  return data;
};
const rpc = async (caller, name, args, signal) => {
  signal?.throwIfAborted();
  const request = caller.rpc(name, args);
  return checkResult(await (signal && request.abortSignal ? request.abortSignal(signal) : request));
};

export async function loadExecutorItems(caller, { ownerId, conversationId, signal }) {
  return (await loadSquadHistory(caller, { ownerId: uuid(ownerId, 'titular'), conversationId, signal })).interactions;
}

async function itemFor(caller, ownerId, itemId, forWrite = false) {
  return loadSquadItem(caller, { ownerId: uuid(ownerId, 'titular'), itemId, forWrite });
}

export async function decideExecutorItem(caller, raw, integrations = {}) {
  if (!raw || Object.keys(raw).some(key => !['ownerId', 'id', 'revision', 'decision', 'answers', 'text'].includes(key))) fail('A decisão recebeu campos não permitidos.');
  const { ownerId, id, revision, decision, answers = {}, text = null } = raw;
  if (!Number.isInteger(revision) || revision < 1 || !['answer', 'text', 'approve', 'reject', 'cancel'].includes(decision)) fail('Decisão inválida.');
  const item = await itemFor(caller, ownerId, id, true);
  const allowed = item.kind === 'question' ? ['answer', 'text', 'cancel'] : ['approve', 'reject', 'cancel'];
  if (!allowed.includes(decision)) fail('Esta decisão não corresponde ao item.');
  if (decision === 'answer') validateExecutorAnswers({ title: item.title, description: item.description || undefined, fields: item.fields }, answers);
  else if (!answers || typeof answers !== 'object' || Array.isArray(answers) || Object.keys(answers).length) fail('Esta decisão não aceita respostas adicionais.');
  if (decision === 'text') {
    if (typeof text !== 'string' || !text.trim() || text.length > 12000) fail('Escreva uma resposta de até12.000 caracteres.');
  } else if (text !== null) fail('Esta decisão não aceita texto adicional.');
  const result = decision === 'approve' && item.app === 'gestor' && ['update_meta', 'create_meta_campaign'].includes(item.action)
    ? await decideExecutorExternal({ ...integrations, caller, id: item.id, revision })
    : await rpc(caller, 'atlas_executor_decide', { p_id: item.id, p_revision: revision, p_decision: decision, p_answers: answers, p_text: text });
  if (!result?.id || result.id !== item.id || result.owner_id !== ownerId) fail('A decisão não foi confirmada no histórico.', 'STORAGE_FAILURE', 503);
  return executorPresentation(result);
}

export async function reconcileExecutorItem(caller, raw, integrations = {}) {
  if (!raw || Object.keys(raw).some(key => !['ownerId', 'id'].includes(key))) fail('A conferência recebeu campos não permitidos.');
  const item = await itemFor(caller, raw.ownerId, raw.id, true);
  if (item.app !== 'gestor' || !['update_meta', 'create_meta_campaign'].includes(item.action) || !['executing', 'uncertain', 'completed'].includes(item.state)) fail('Este item não permite conferência externa.');
  const result = await reconcileExecutorExternal({ ...integrations, caller, id: item.id });
  if (result?.id !== item.id || result.owner_id !== raw.ownerId || result.conversation_id !== item.conversation_id) fail('O resultado não foi confirmado no histórico autorizado.', 'STORAGE_FAILURE', 503);
  return executorPresentation(result);
}

export async function loadExecutorContinuation(caller, { ownerId, id, conversationId, requestId }) {
  const item = await itemFor(caller, ownerId, id);
  if (item.conversation_id !== conversationId || item.resume_request_id !== requestId || ['awaiting_input', 'proposed', 'executing', 'uncertain'].includes(item.state)) fail('A retomada exige uma decisão e resultado confirmados no histórico.', 'SCOPE_CONFLICT', 409);
  const origin = await loadSquadRun(caller, { runId: item.run_id, ownerId, clientId: item.client_id });
  if (!origin || origin.id !== item.run_id || origin.owner_id !== ownerId || origin.conversation_id !== item.conversation_id || typeof origin.request_message !== 'string') fail('O objetivo original não foi localizado no histórico.', 'ATLAS_FORBIDDEN', 403);
  const decision = { answer: 'Respondi às perguntas', text: 'Respondi por texto', approve: 'Aprovei a proposta', reject: 'Recusei a proposta', cancel: 'Cancelei esta etapa' }[item.decision] || 'Retomei esta etapa';
  return { request_id: item.resume_request_id, conversation_id: item.conversation_id, client_id: item.client_id, executor: true, mode: origin.mode, origin_run_id: origin.id,
    message: `${decision}: ${item.title}.`, objective: origin.executor_objective || atlasExecutorMessageBody(origin.request_message), item };
}

export async function runExecutorRequest({ caller, ownerId, run, input, attachmentContext = { metadata: [], contentParts: [], coverage: [] }, callModel, onProgress, signal, integrations = {} }) {
  const current = await loadSquadRun(caller, { runId: run.id, ownerId, clientId: input.client_id, signal });
  if (current.conversation_id !== run.conversation_id || input.mode !== undefined && input.mode !== current.mode) fail('O modo ou a conversa não corresponde ao Squad.', 'SCOPE_CONFLICT', 409);
  const history = await loadSquadHistory(caller, { ownerId, conversationId: current.conversation_id, clientId: input.client_id, signal });
  const knowledge = await readExecutorMemory(caller, { clientId: input.client_id, view: 'knowledge', signal });
  const { metadata, contentParts, coverage = [] } = attachmentContext;
  if (!Array.isArray(metadata) || metadata.length > 4 || new Set(metadata.map(row => row.id)).size !== metadata.length || !Array.isArray(contentParts)
    || metadata.some(row => row.owner_id !== ownerId || row.client_id !== input.client_id || row.conversation_id !== current.conversation_id || row.state !== 'uploaded')
    || current.attachment_ids.some(id => !metadata.some(row => row.id === id))) fail('O contexto dos anexos não pertence ao Squad atual.', 'SCOPE_CONFLICT', 403);
  for (const originId of new Set(metadata.map(row => row.run_id))) {
    const origin = originId === current.id ? current : await loadSquadRun(caller, { runId: originId, ownerId, clientId: input.client_id, signal });
    if (origin.conversation_id !== current.conversation_id || metadata.some(row => row.run_id === originId && !origin.attachment_ids.includes(row.id))) fail('A origem dos anexos não foi confirmada.', 'SCOPE_CONFLICT', 403);
  }
  const save = async (callId, specification) => {
    const item = await rpc(caller, 'atlas_executor_store', { p_run: run.id, p_call_id: callId, p_item: specification }, signal);
    if (!item?.id || item.run_id !== run.id || item.owner_id !== ownerId || item.conversation_id !== run.conversation_id || item.client_id !== input.client_id) fail('O item não foi confirmado no escopo da execução.', 'STORAGE_FAILURE', 503);
    return executorPresentation(item);
  };
  const message = input.executor_objective ? `Retome este pedido original: ${input.executor_objective}\n\nDecisão humana atual: ${input.question}\nUse o item e recibo confirmados no contexto, confira o resultado e continue sem reaplicar ações concluídas.` : input.question;
  return runAtlasExecutor({ message, history: history.messages.filter(entry => entry.run_id !== current.id).map(entry => ({ ...entry, content: atlasExecutorMessageBody(entry.content) })), clientId: input.client_id, mode: current.mode,
    knowledge: knowledge.data.rows, knowledgeCoverage: knowledge.coverage, attachments: metadata, attachmentCoverage: coverage, attachmentContentParts: contentParts, interactions: history.interactions.map(executorPresentation),
    catalog: EXECUTOR_CATALOG, callModel, onProgress, signal,
    readApp: scope => readExecutorApp(caller, scope, integrations),
    prepareAction: async ({ call_id, ...scope }) => {
      const prepared = await prepareExecutorAction(caller, scope, integrations);
      return save(call_id, { kind: 'proposal', ...prepared });
    },
    requestInput: async ({ call_id, app, client_id, agent: _agent, action, ...question }) => {
      const form = validateExecutorQuestion({ ...question, ...(action && { action }) });
      return save(call_id, { kind: 'question', app, client_id, title: form.title, ...(form.description && { description: form.description }),
        fields: form.fields, ...(form.action && { action: form.action.action }) });
    },
  });
}

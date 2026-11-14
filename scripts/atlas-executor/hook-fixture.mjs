export const OWNER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const CLIENT = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
export const OTHER_CLIENT = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
export const CONVERSATION = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
export const OTHER_CONVERSATION = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
export const ITEM = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
export const RESUME = '11111111-1111-4111-8111-111111111111';

export const proposedItem = (overrides = {}) => ({ id: ITEM, revision: 2, kind: 'proposal', app: 'crm',
  action: 'save_pipeline', client_id: CLIENT, conversation_id: CONVERSATION, title: 'Revisar funil fictício', state: 'proposed',
  payload: { nome: 'Comercial fictício' }, before: null, preview: { after: { nome: 'Comercial fictício' } }, ...overrides });
export const completedItem = (overrides = {}) => proposedItem({ state: 'completed',
  decision: 'approve', result: { id: 'native-fixture', confirmed: true }, resume_request_id: RESUME, ...overrides });
export const deferred = () => { let resolve; let reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };

export function createFixture() {
  const history = (id, client, items) => ({ ok: true, conversation: { id, client_id: client, title: 'Conversa fictícia' }, messages: [], runs: [], jobs: [], interactions: items });
  return {
    sequence: 0, attachmentRequests: new Map(),
    base: { ok: true, enabled: true, configured: true,
      agents: [{ id: 'central', name: 'Atlas legado' }, { id: 'clientes', name: 'Clientes legado' }],
      executor_agents: [{ id: 'central', name: 'Atlas executor' }, { id: 'crm', name: 'CRM IA' }, { id: 'cs', name: 'CS IA' }, { id: 'gestor', name: 'Gestor IA' }],
      clients: [{ id: CLIENT, empresa: 'Aurora fictícia' }, { id: OTHER_CLIENT, empresa: 'Nebulosa fictícia' }], conversations: [], jobs: [], memories: [],
    },
    records: new Map([[CONVERSATION, history(CONVERSATION, CLIENT, [proposedItem()])],
      [OTHER_CONVERSATION, history(OTHER_CONVERSATION, OTHER_CLIENT, [proposedItem({ id: '22222222-2222-4222-8222-222222222222', conversation_id: OTHER_CONVERSATION, client_id: OTHER_CLIENT })])]]),
    calls: { bootstrap: [], history: [], progress: [], send: [], respond: [], reconcile: [], manual: [], upload: [] }, handlers: {},
    persist(item, conversationId = CONVERSATION) {
      const record = this.records.get(conversationId);
      record.interactions = [structuredClone(item), ...record.interactions.filter(current => current.id !== item.id)];
      return structuredClone(item);
    },
  };
}

const fixture = () => globalThis.__atlasExecutorHook;
const record = (kind, payload) => { const current = fixture(); current.calls[kind].push(structuredClone(payload)); return current; };
export const createAtlasRequestId = () => `33333333-3333-4333-8333-${(++fixture().sequence).toString(16).padStart(12, '0')}`;
export async function bootstrapAtlas() {
  const current = record('bootstrap', {});
  return current.handlers.bootstrap ? current.handlers.bootstrap() : structuredClone(current.base);
}
export async function loadAtlasHistory(id) {
  const current = record('history', id);
  if (current.handlers.history) return current.handlers.history(id);
  return structuredClone(current.records.get(id));
}
export async function loadAtlasProgress(id) {
  record('progress', id); return { ok: true, run: null };
}
export async function sendAtlasMessage(payload) {
  const current = record('send', payload);
  if (current.handlers.send) return current.handlers.send(payload);
  const conversationId = payload.conversation_id || CONVERSATION;
  const runId = `44444444-4444-4444-8444-${(++current.sequence).toString(16).padStart(12, '0')}`;
  const history = current.records.get(conversationId);
  history.conversation.client_id = payload.client_id || null;
  history.runs.unshift({ id: runId, request_id: payload.request_id, status: 'completed', steps: [] });
  return { ok: true, status: 'completed', conversation_id: conversationId, run_id: runId, message: { role: 'assistant', content: 'Análise fictícia registrada.' }, steps: [] };
}
export async function respondAtlasInteraction(payload) {
  const current = record('respond', payload);
  if (current.handlers.respond) return current.handlers.respond(payload);
  const previous = current.records.get(CONVERSATION).interactions.find(item => item.id === payload.id);
  const state = payload.decision === 'reject' ? 'rejected' : payload.decision === 'cancel' ? 'cancelled' : 'completed';
  const item = current.persist({ ...previous, state, decision: payload.decision, answers: payload.answers, resume_request_id: RESUME,
    result: payload.decision === 'approve' ? { id: 'native-fixture', confirmed: true } : null });
  return { ok: true, item };
}
export async function reconcileAtlasInteraction(id) {
  const current = record('reconcile', id);
  if (current.handlers.reconcile) return current.handlers.reconcile(id);
  return { ok: true, item: current.persist(completedItem({ app: 'gestor', action: 'update_meta' })) };
}

export async function uploadAtlasMessageAttachments({ files, requestId }) {
  const current = fixture(); current.calls.upload.push({ requestId, ids: files.map(file => file.id) });
  for (const file of files) {
    if (current.attachmentRequests.has(file.id) && current.attachmentRequests.get(file.id) !== requestId) throw new Error('Attachment IDs are request-bound');
    current.attachmentRequests.set(file.id, requestId);
  }
  return [];
}
export async function runAtlasAutomation(payload) { fixture().calls.manual.push(structuredClone(payload)); return sendAtlasMessage(payload); }

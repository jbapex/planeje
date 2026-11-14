import assert from 'node:assert/strict';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import * as stream from 'node:stream';

export const id = value => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
export const OWNER = id(1), CLIENT = id(2), CONVERSATION = id(3), SESSION = id(4), INITIAL = id(10);
export const OBJECTIVE = 'Crie um funil comercial no CRM IA.';
export const NAME = 'Comercial QA fictício';
export const question = { title: 'Nome do funil', fields: [{ id: 'nome', label: 'Nome', type: 'text', required: true }], action: { app: 'crm', action: 'save_pipeline' } };
export const call = (name, args, callId) => ({ content: null, tool_calls: [{ id: callId, type: 'function', function: { name, arguments: JSON.stringify(args) } }] });
export const answer = content => ({ content });
export const scenario = () => [
  call('call_agent', { agent: 'crm', task: 'Crie um funil comercial no CRM IA.' }, 'delegate-question'),
  call('ask_user', question, 'question-name'),
  call('call_agent', { agent: 'crm', task: 'Crie o funil com o nome informado na resposta registrada.' }, 'delegate-prepare'),
  call('read_app', { app: 'crm', view: 'workspace', input: {} }, 'read-before'),
  call('prepare_action', { app: 'crm', action: 'save_pipeline', input: { nome: NAME } }, 'prepare-pipeline'),
  call('call_agent', { agent: 'crm', task: 'Confira no CRM o funil do recibo, sem repetir a criação.' }, 'delegate-check'),
  call('read_app', { app: 'crm', view: 'workspace', input: {} }, 'read-after'),
  answer('O funil Comercial QA fictício está registrado e foi conferido no CRM.'),
  answer('O funil Comercial QA fictício foi criado e conferido no CRM IA.'),
];

export function createEdgeFixture(source, replies = scenario()) {
  const fixture = { calls: [], provider: [], replies: [...replies], errors: [], runs: new Map(), items: new Map(), conversations: new Map(), messages: [], pipelines: [],
    stored: new Map(), decisions: 0, nativeWrites: 0, budgetAllowed: true, userId: OWNER, reservations: new Map(), squadRuns: new Set(), attachments: [], knowledge: [], automations: new Map(), timers: [], virtualTimers: false, downloads: 0, hangDownloads: false, hangSecrets: false, secretReads: 0 };
  let handler; let realm;
  const clone = value => JSON.parse(JSON.stringify(value));
  const result = data => ({ data: realm(JSON.stringify(data)), error: null });
  const denied = (code = '42501', message = 'fixture scope denied') => ({ data: null, error: { code, message } });
  const squadRun = value => ({ ...clone(value), domain: 'squad', mode: value.mode || 'chat', attachment_ids: value.attachment_ids || [] });
  const fail = message => { fixture.errors.push(message); throw new Error(message); };
  const rows = table => table === 'profiles' ? [{ id: fixture.userId, role: 'admin', status: 'active' }]
    : table === 'clientes' ? [{ id: CLIENT, empresa: 'Conta QA fictícia', etapa: 'closed' }]
      : table === 'atlas_runs' ? [...fixture.runs.values()] : table === 'atlas_execution_items' ? [...fixture.items.values()]
        : table === 'atlas_conversations' ? [...fixture.conversations.values()] : table === 'atlas_messages' ? fixture.messages
          : ['atlas_jobs', 'atlas_memories', 'atlas_inbox', 'atlas_worker_state'].includes(table) ? [] : fail('Unexpected caller table: ' + table);
  function query(table, role = 'caller') {
    const filters = []; let patch; let projection; let limit; let ordering;
    const execute = single => {
      let selected = (role === 'admin' ? [{ id: 'atlas', owner_id: OWNER, enabled: true, auto_memory: false }] : rows(table)).filter(row => filters.every(test => test(row)));
      if (patch) selected.forEach(row => Object.assign(row, clone(patch)));
      if (ordering) selected.sort((left, right) => String(left[ordering.key] || '').localeCompare(String(right[ordering.key] || '')) * (ordering.ascending ? 1 : -1));
      if (limit !== undefined) selected = selected.slice(0, limit);
      if (projection && projection !== '*') selected = selected.map(row => Object.fromEntries(projection.split(',').map(key => key.trim()).filter(key => key in row).map(key => [key, row[key]])));
      return result(single ? selected[0] || null : selected);
    };
    const builder = {
      select(fields = '*') { projection = fields; return builder; },
      update(value) { fixture.calls.push({ role, kind: 'update', table, value: clone(value) }); patch = value; return builder; },
      eq(key, value) { filters.push(row => row[key] === value); return builder; },
      neq(key, value) { filters.push(row => row[key] !== value); return builder; },
      is(key, value) { filters.push(row => (row[key] ?? null) === value); return builder; },
      lt(key, value) { filters.push(row => row[key] < value); return builder; },
      in(key, values) { filters.push(row => values.includes(row[key])); return builder; },
      or() { assert.equal(table, 'atlas_memories'); return builder; },
      order(key, options = {}) { ordering = { key, ascending: options.ascending !== false }; return builder; },
      limit(value) { limit = value; return builder; },
      maybeSingle() { return Promise.resolve(execute(true)); }, single() { return Promise.resolve(execute(true)); },
      then(resolve, reject) { return Promise.resolve(execute(false)).then(resolve, reject); },
    };
    return builder;
  }
  const caller = {
    storage: { from(bucket) { assert.equal(bucket, 'atlas-executor-attachments'); return { download: async path => { fixture.downloads++; if (fixture.hangDownloads) return new Promise(() => {}); const row = fixture.attachments.find(item => item.path === path); return { data: row ? new Blob([row.bytes]) : null, error: row ? null : { code: '404' } }; } }; } },
    auth: { getUser: async () => ({ data: { user: { id: fixture.userId } }, error: null }) },
    from(table) { fixture.calls.push({ role: 'caller', kind: 'from', table }); return query(table); },
    async rpc(name, args) {
      fixture.calls.push({ role: 'caller', kind: 'rpc', name, args: clone(args) });
      if (name === 'atlas_squad_expire_abandoned') return result(0);
      if (name === 'atlas_squad_office_context') return [...fixture.conversations.values()].some(row => row.id === args.p_conversation && row.domain === 'squad') || fixture.squadRuns.has(args.p_request) ? denied() : result({ allowed: true });
      if (name === 'atlas_squad_office_conversations') return result([...fixture.conversations.values()].filter(row => row.domain !== 'squad'));
      if (name === 'atlas_squad_bootstrap') return result({ domain: 'squad', agents: ['central','crm','cs','gestor'].map(id => ({ id })), clients: [{ id: CLIENT, empresa: 'Conta QA fictícia' }], conversations: [...fixture.conversations.values()].filter(row => row.domain === 'squad' && row.client_id === args.p_client_id), knowledge: fixture.knowledge.filter(row => row.client_id === args.p_client_id), preferences: {}, limits: {}, budget: {} });
      if (name === 'atlas_squad_knowledge_snapshot') return result({ rows: fixture.knowledge.filter(row => row.client_id === args.p_client_id && (!args.p_id || row.id === args.p_id)), total: fixture.knowledge.filter(row => row.client_id === args.p_client_id && (!args.p_id || row.id === args.p_id)).length });
      if (name === 'atlas_squad_run') { const run = fixture.runs.get(args.p_run_id); return run && fixture.squadRuns.has(run.id) && run.owner_id === fixture.userId ? result(squadRun(run)) : denied(); }
      if (name === 'atlas_squad_progress') { const run = fixture.runs.get(args.p_request_id); return !run ? result({ run: null }) : fixture.squadRuns.has(run.id) && run.owner_id === fixture.userId ? result({ run: squadRun(run) }) : denied(); }
      if (name === 'atlas_squad_item') { const item = fixture.items.get(args.p_id); return item && item.owner_id === fixture.userId && fixture.squadRuns.has(item.run_id) ? result(item) : denied(); }
      if (name === 'atlas_squad_history') {
        const conversation = fixture.conversations.get(args.p_conversation_id);
        if (!conversation || conversation.domain !== 'squad' || conversation.owner_id !== fixture.userId) return denied();
        return result({ domain: 'squad', conversation, messages: fixture.messages.filter(row => row.conversation_id === conversation.id && fixture.squadRuns.has(row.run_id)).map(row => ({ ...row, attachments: row.role === 'user' ? fixture.attachments.filter(file => file.run_id === row.run_id).map(({ id, name, mime, size, run_id }) => ({ id, name, mime, size, run_id })) : [] })), runs: [...fixture.runs.values()].filter(row => row.conversation_id === conversation.id && fixture.squadRuns.has(row.id)).map(squadRun), interactions: [...fixture.items.values()].filter(row => row.conversation_id === conversation.id && fixture.squadRuns.has(row.run_id)) });
      }
      if (name === 'atlas_executor_attachment_context') return result(fixture.attachments.filter(row => row.client_id === args.p_client && row.conversation_id === args.p_conversation));
      if (name === 'atlas_squad_automation_manual_access') return result(true);
      if (name === 'atlas_squad_automation_snapshot') { const row = fixture.automations.get(args.p_id); return row && row.client_id === args.p_client_id && (row.app || 'atlas') === args.p_app ? result({ automation: row }) : denied(); }
      if (name === 'atlas_recall') return result([]);
      if (name === 'crm_ia_workspace') {
        if (args.p_action === 'bootstrap') return result({ clients: [{ id: CLIENT, empresa: 'Conta QA fictícia' }] });
        assert.equal(args.p_action, 'workspace', 'Preparation must not call a native mutation'); assert.equal(args.p_client_id, CLIENT);
        return result({ client: { id: CLIENT, empresa: 'Conta QA fictícia' }, pipelines: fixture.pipelines, stages: [], agents: [], bases: [], products: [], people: [], channels: [], templates: [],
          config: { revision: 1, data: {} }, permissions: { manage: true }, provisioned: true });
      }
      if (name === 'atlas_claim_run' || name === 'atlas_squad_claim_run') {
        const previous = fixture.runs.get(args.p_request_id);
        const squad = name === 'atlas_squad_claim_run';
        if (previous) {
          if (squad && (!fixture.squadRuns.has(previous.id) || previous.mode !== args.p_mode || JSON.stringify(previous.attachment_ids) !== JSON.stringify(args.p_attachment_ids))) return denied('40001', 'ATLAS_REQUEST_CONFLICT');
          return result({ claimed: false, run: previous, ...(squad && { conversation: fixture.conversations.get(previous.conversation_id) }) });
        }
        if (squad && args.p_conversation_id && fixture.conversations.get(args.p_conversation_id)?.domain !== 'squad') return denied();
        if (squad && args.p_conversation_id && fixture.conversations.get(args.p_conversation_id)?.mode !== args.p_mode) return denied('40001', 'ATLAS_SCOPE_CONFLICT');
        const conversationId = args.p_conversation_id || (fixture.conversations.has(CONVERSATION) ? id(10000 + fixture.conversations.size) : CONVERSATION);
        fixture.conversations.set(conversationId, { id: conversationId, owner_id: OWNER, client_id: args.p_client_id, title: OBJECTIVE, updated_at: new Date().toISOString(), ...(squad && { domain: 'squad', mode: args.p_mode }) });
        const run = { id: args.p_request_id, owner_id: OWNER, source_session_id: SESSION, request_id: args.p_request_id, conversation_id: conversationId,
          request_conversation_id: args.p_conversation_id, request_client_id: args.p_client_id, request_message: args.p_message, status: 'processing', created_at: new Date().toISOString(), steps: [] };
        if (squad) { run.mode = args.p_mode; run.attachment_ids = args.p_attachment_ids; fixture.squadRuns.add(run.id); }
        fixture.runs.set(run.id, run); return result({ claimed: true, run, ...(squad && { conversation: fixture.conversations.get(conversationId) }) });
      }
      if (name === 'atlas_finish_run' || name === 'atlas_squad_finish_run') {
        const run = fixture.runs.get(args.p_run_id); assert.ok(run);
        Object.assign(run, { status: args.p_status, result: { content: args.p_content }, error: args.p_error, steps: clone(args.p_steps), usage: clone(args.p_usage) });
        fixture.messages.push({ id: 'user-' + run.id, owner_id: OWNER, conversation_id: run.conversation_id, run_id: run.id, role: 'user', content: run.request_message, created_at: new Date().toISOString() });
        if (args.p_content) fixture.messages.push({ id: 'assistant-' + run.id, owner_id: OWNER, conversation_id: run.conversation_id, run_id: run.id, role: 'assistant', content: args.p_content, created_at: new Date().toISOString() });
        return result(run);
      }
      if (name === 'atlas_executor_store') {
        const run = fixture.runs.get(args.p_run); assert.ok(run); assert.equal(run.source_session_id, SESSION); assert.equal(run.status, 'processing');
        assert.equal(typeof args.p_call_id, 'string'); assert.ok(args.p_call_id.length);
        const key = args.p_run + ':' + args.p_call_id;
        if (fixture.stored.has(key)) return result(fixture.items.get(fixture.stored.get(key)));
        const index = fixture.items.size;
        const item = { ...clone(args.p_item), id: id(50 + index), owner_id: OWNER, conversation_id: run.conversation_id, client_id: run.request_client_id,
          run_id: run.id, revision: 1, state: args.p_item.kind === 'question' ? 'awaiting_input' : 'proposed', resume_request_id: id(150 + index), created_at: new Date().toISOString() };
        fixture.items.set(item.id, item); fixture.stored.set(key, item.id); return result(item);
      }
      if (name === 'atlas_executor_decide') {
        const item = fixture.items.get(args.p_id); assert.ok(item);
        if (!['awaiting_input', 'proposed'].includes(item.state)) { assert.equal(item.decision, args.p_decision); return result(item); }
        assert.equal(args.p_revision, item.revision);
        fixture.decisions++;
        if (args.p_decision === 'approve') {
          assert.equal(item.kind, 'proposal'); assert.equal(item.action, 'save_pipeline');
          const pipeline = { ...clone(item.payload), id: id(90), cliente_id: item.client_id, updated_at: new Date().toISOString() };
          fixture.pipelines.push(pipeline); fixture.nativeWrites++;
          item.result = { id: pipeline.id, nome: pipeline.nome, confirmed: true };
        }
        Object.assign(item, { state: args.p_decision === 'reject' ? 'rejected' : args.p_decision === 'cancel' ? 'cancelled' : 'completed', revision: item.revision + 1, decision: args.p_decision, answers: clone(args.p_answers) });
        return result(item);
      }
      return fail('Unexpected caller RPC: ' + name);
    },
  };
  const admin = {
    from(table) { fixture.calls.push({ role: 'admin', kind: 'from', table }); if (table !== 'atlas_settings') fail('Privileged operational table: ' + table); return query(table, 'admin'); },
    async rpc(name, args) {
      fixture.calls.push({ role: 'admin', kind: 'rpc', name, args: clone(args) });
      if (name === 'get_encrypted_secret') { assert.equal(args.p_secret_name, 'OPENAI_API_KEY'); fixture.secretReads++; if (fixture.hangSecrets) return new Promise(() => {}); return result('fixture-provider-key'); }
      if (name === 'atlas_executor_model_reserve') {
        const run = fixture.runs.get(args.p_run); assert.equal(run?.source_session_id, SESSION); assert.equal(run?.owner_id, OWNER); assert.ok(args.p_estimate > 0);
        if (fixture.budgetAllowed) fixture.reservations.set(args.p_call, { run_id: args.p_run });
        return result({ reserved: fixture.budgetAllowed });
      }
      if (name === 'atlas_model_finish') { assert.ok(fixture.reservations.has(args.p_call)); fixture.reservations.get(args.p_call).usage = clone(args.p_usage); return result({ ok: true }); }
      return fail('Privileged operational RPC: ' + name);
    },
  };
  const env = { SUPABASE_URL: 'https://fixture.invalid', SUPABASE_ANON_KEY: 'fixture-anon', SUPABASE_SERVICE_ROLE_KEY: 'fixture-service', ATLAS_MODEL: 'gpt-4o-mini' };
  const context = vm.createContext({
    require: spec => {
      if (spec === 'stream') return stream;
      if (spec.includes('supabase-js')) return { createClient: (_, key) => key === env.SUPABASE_ANON_KEY ? caller : key === env.SUPABASE_SERVICE_ROLE_KEY ? admin : fail('Unknown client key') };
      if (spec.includes('/http/server.ts')) return { serve: callback => { handler = callback; } };
      return fail('Unexpected external import: ' + spec);
    },
    Deno: { env: { get: key => env[key] } }, Blob, DOMException, atob, btoa, AbortController, AbortSignal, setTimeout: (callback, milliseconds, ...args) => { if (fixture.virtualTimers) { const timer = { callback, milliseconds }; fixture.timers.push(timer); return timer; } return setTimeout(callback, milliseconds, ...args); }, clearTimeout: timer => { if (!fixture.timers.includes(timer)) clearTimeout(timer); }, Response, URL, URLSearchParams, TextEncoder, TextDecoder, crypto: webcrypto,
    // Native host clones cross realms; JSON records must retain the VM's Object.prototype.
    structuredClone: value => value === undefined ? undefined : realm(JSON.stringify(structuredClone(value))),
    fetch: async (url, init) => {
      assert.equal(url, 'https://api.openai.com/v1/chat/completions'); assert.equal(init.headers.Authorization, 'Bearer fixture-provider-key');
      const request = JSON.parse(init.body); fixture.provider.push(request); assert.equal(request.model, 'gpt-4o-mini');
      const next = fixture.replies.shift(); if (!next) return fail('Unexpected model call without a scripted reply');
      const message = typeof next === 'function' ? next(request, fixture) : next;
      return new Response(JSON.stringify({ model: 'gpt-4o-mini', choices: [{ message, finish_reason: 'stop' }], usage: { prompt_tokens: 20, completion_tokens: 10 } }));
    },
  });
  realm = vm.runInContext('text => JSON.parse(text)', context);
  vm.runInContext(source, context);
  assert.equal(typeof handler, 'function');
  fixture.send = async (body, userId = OWNER, { signal } = {}) => {
    fixture.userId = userId;
    const response = await handler(new Request('https://fixture.invalid/atlas-chat', { method: 'POST', signal, headers: { Authorization: 'Bearer fixture-session', 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
    return { status: response.status, body: await response.json() };
  };
  fixture.seedContinuation = () => {
    fixture.conversations.set(CONVERSATION, { id: CONVERSATION, owner_id: OWNER, client_id: CLIENT, title: OBJECTIVE, domain: 'squad', mode: 'chat' });
    fixture.squadRuns.add(INITIAL);
    fixture.runs.set(INITIAL, { id: INITIAL, owner_id: OWNER, conversation_id: CONVERSATION, source_session_id: SESSION, request_id: INITIAL, request_client_id: CLIENT, mode: 'chat', attachment_ids: [], request_message: '[Executor Planeje]\n' + OBJECTIVE, executor_objective: OBJECTIVE, status: 'completed' });
    const item = { id: id(50), owner_id: OWNER, conversation_id: CONVERSATION, client_id: CLIENT, run_id: INITIAL, revision: 2, kind: 'question', app: 'crm', state: 'completed', title: question.title,
      fields: question.fields, decision: 'answer', answers: { nome: NAME }, resume_request_id: id(150), created_at: new Date().toISOString() };
    fixture.items.set(item.id, item); return item;
  };
  return fixture;
}

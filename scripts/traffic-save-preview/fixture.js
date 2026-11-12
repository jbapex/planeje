// Only synthetic records. No production client, credentials, or transport.
export const supabaseUrl = 'https://fixture.invalid';
export const supabaseAnonKey = 'fixture';
const user = { id: 'person' };
export const useAuth = () => ({ user, profile: { role: 'admin' } });
const params = new URLSearchParams(location.search);
const kind = params.get('kind') || 'optimization';
const makeRecord = () => ({
  id: 'review-1', client_id: 'client-1', empresa: 'Cliente fictício', kind,
  week_start: '2026-10-19', task_due_date: '2026-10-22', task_id: 'task-1',
  can_edit: true, revision: 1, metric_mode: 'client', investment: 100, contacts: 10,
  analysis: 'Análise inicial', action_mode: 'none', campaign_metrics: [],
  finalized_at: params.has('finalized') ? '2026-10-23T12:00:00Z' : null,
});
const state = window.trafficFixture = {
  record: params.has('new') ? null : makeRecord(), calls: [], saves: [], fail: '', finalizeFail: '', delay: 0, hang: false,
  boardDelay: 0, release: null,
};
const client = { id: 'client-1', empresa: 'Cliente fictício', manager_id: 'person', eligible: true, accounts: [], settings: { enabled: true, optimization_enabled: true }, next_due_on: '2026-11-02', next_optimization_due_on: '2026-10-28' };
const board = () => ({ today: '2026-10-27', can_manage: true, clients: [client], reviews: state.record ? [state.record] : [], team: [{ id: 'person', full_name: 'Pessoa fictícia' }] });
function request(run) {
  let signal;
  return {
    abortSignal(value) { signal = value; return this; },
    then(resolve, reject) { return Promise.resolve().then(() => run(signal)).then(resolve, reject); },
  };
}
function pause(ms, signal) {
  return new Promise((resolve, reject) => {
    const timer = ms >= 0 ? setTimeout(resolve, ms) : null;
    const abort = () => { clearTimeout(timer); reject(new Error('AbortError')); };
    if (signal?.aborted) abort();
    else signal?.addEventListener('abort', abort, { once: true });
    state.release = resolve;
  });
}
export const supabase = {
  auth: { getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
  rpc(name, args) {
    return request(async signal => {
      state.calls.push({ name, args });
      if (name === 'traffic_weekly_board') { const data = structuredClone(board()); if (state.boardDelay) await pause(state.boardDelay, signal); return { data }; }
      if (name === 'central_trafego_hoje') return { data: { clients: [client], team: [] } };
      if (name === 'central_trafego_ensure_routine_demands') return { data: null };
      if (name === 'traffic_routine_client_history') return { data: state.record ? [structuredClone(state.record)] : [] };
      if (name === 'start_traffic_week_record') { state.record ||= { ...makeRecord(), revision: 0 }; return { data: state.record.id }; }
      if (name === 'save_traffic_weekly_review') {
        if (state.hang || state.delay) await pause(state.hang ? -1 : state.delay, signal);
        if (state.fail) return { error: { message: state.fail } };
        if (args.p_finalize && state.finalizeFail) return { error: { message: state.finalizeFail } };
        if (args.p_revision !== state.record.revision) return { error: { message: 'Outra pessoa atualizou esta revisão. Reabra para conferir a versão atual.' } };
        // Mirrors the existing SQL's finalized short circuit and revision guard.
        if (state.record.finalized_at && args.p_finalize) return { data: state.record.id };
        state.record = { ...state.record, ...args.p_data, revision: state.record.revision + 1, finalized_at: args.p_finalize ? '2026-10-27T12:00:00Z' : null, task_completed: args.p_finalize || state.record.task_completed };
        state.saves.push(structuredClone(args));
        return { data: state.record.id };
      }
      throw new Error(`Unexpected fixture RPC: ${name}`);
    });
  },
  from(table) {
    const data = table === 'clientes' ? [client] : table === 'traffic_weekly_reviews' ? state.record : [];
    const query = { then(resolve, reject) { return Promise.resolve({ data }).then(resolve, reject); } };
    return new Proxy(query, { get(target, key) { return key === 'then' ? target.then.bind(target) : () => new Proxy(query, this); } });
  },
};

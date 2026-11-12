export const initialAuthState = () => ({
  user: null, session: null, profile: null, fieldPermissions: {}, userFieldOverrides: {},
  loading: true, authError: null,
});

// Session notifications must return before another Supabase request starts.
// A revision also prevents an older request from restoring a signed-out user.
export function createAuthSessionLoader(client, onChange, {
  fetchTimeoutMs = 8000, sessionTimeoutMs = 12000,
  schedule = setTimeout, cancel = clearTimeout,
} = {}) {
  let state = initialAuthState();
  let revision = 0;
  let disposed = false;
  let subscription;
  let queued;
  let queuedResolve;
  let pendingKey = null;
  const requests = new Set();
  const current = (run) => !disposed && run === revision;
  const publish = (patch, run = revision) => {
    if (!current(run)) return;
    state = { ...state, ...patch };
    onChange(state);
  };
  const next = () => {
    revision += 1;
    if (queued !== undefined) cancel(queued);
    queued = undefined; queuedResolve?.(null); queuedResolve = null;
    requests.forEach((controller) => controller.abort());
    pendingKey = null;
    return revision;
  };
  const request = async (operation, timeoutMs) => {
    const controller = new AbortController();
    requests.add(controller);
    let timer;
    try {
      return await new Promise((resolve, reject) => {
        controller.signal.addEventListener('abort', () => reject(new Error('Consulta interrompida')), { once: true });
        timer = schedule(() => {
          reject(new Error('Tempo de consulta esgotado'));
          controller.abort();
        }, timeoutMs);
        Promise.resolve().then(() => operation(controller.signal)).then(resolve, reject);
      });
    } finally {
      cancel(timer); requests.delete(controller);
    }
  };
  const dataFrom = (result) => {
    if (result.error) throw Object.assign(new Error(result.error.message), result.error, { status: result.status });
    return result.data;
  };
  const hydrate = async (run, session) => {
    const userId = session.user.id;
    try {
      let profile;
      // One automatic retry handles a short network failure without an error flash.
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          profile = dataFrom(await request((signal) => client.from('profiles').select('*').eq('id', userId).single().abortSignal(signal), fetchTimeoutMs));
          if (!profile || profile.id !== userId) throw Object.assign(new Error('Perfil indisponível'), { code: 'PGRST116' });
          break;
        } catch (error) {
          if (!current(run)) return null;
          if (attempt || ['PGRST116', '42501'].includes(error.code) || [401, 403].includes(error.status)) throw error;
        }
      }
      if (!current(run)) return null;
      const results = await Promise.allSettled([
        request((signal) => client.from('client_field_permissions').select('*').abortSignal(signal), fetchTimeoutMs).then(dataFrom),
        request((signal) => client.from('user_client_field_permissions').select('field_name, can_view').eq('user_id', userId).abortSignal(signal), fetchTimeoutMs).then(dataFrom),
      ]);
      if (!current(run)) return null;
      const fieldPermissions = {}, userFieldOverrides = {};
      if (results[0].status === 'fulfilled') (results[0].value || []).forEach((row) => {
        (fieldPermissions[row.role] ||= {})[row.field_name] = row.can_view;
      });
      if (results[1].status === 'fulfilled') (results[1].value || []).forEach((row) => {
        userFieldOverrides[row.field_name] = row.can_view === true;
      });
      pendingKey = null;
      publish({ profile, fieldPermissions, userFieldOverrides, loading: false, authError: null }, run);
      return profile;
    } catch {
      if (current(run)) {
        pendingKey = null;
        publish({ profile: null, fieldPermissions: {}, userFieldOverrides: {}, loading: false, authError: 'profile' }, run);
      }
      return null;
    }
  };
  const acceptSession = (session, { force = false } = {}) => {
    if (disposed) return Promise.resolve(null);
    const user = session?.user ?? null;
    const key = user ? `${user.id}:${session.access_token}` : null;
    if (!force && key && (pendingKey === key || (state.profile?.id === user.id && state.session?.access_token === session.access_token))) {
      publish({ session, user });
      return Promise.resolve(state.profile);
    }
    const run = next();
    if (!user) {
      publish({ ...initialAuthState(), loading: false }, run);
      return Promise.resolve(null);
    }
    const sameUser = state.profile?.id === user.id;
    publish({
      session, user, authError: null, loading: !sameUser,
      ...(sameUser ? {} : { profile: null, fieldPermissions: {}, userFieldOverrides: {} }),
    }, run);
    pendingKey = key;
    return new Promise((resolve) => {
      queuedResolve = resolve;
      queued = schedule(() => {
        queued = undefined; queuedResolve = null;
        if (current(run)) void hydrate(run, session).then(resolve);
        else resolve(null);
      }, 0);
    });
  };
  const restore = async () => {
    const run = next();
    publish({ loading: true, authError: null }, run);
    try {
      const data = dataFrom(await request(() => client.auth.getSession(), sessionTimeoutMs));
      if (current(run)) return acceptSession(data.session);
    } catch {
      if (current(run)) publish({ ...initialAuthState(), loading: false, authError: 'session' }, run);
    }
    return null;
  };
  return {
    start() {
      const before = revision;
      const result = client.auth.onAuthStateChange((event, session) => {
        if (['INITIAL_SESSION', 'SIGNED_IN', 'SIGNED_OUT', 'TOKEN_REFRESHED', 'USER_UPDATED'].includes(event)) {
          void acceptSession(session, { force: event === 'USER_UPDATED' });
        }
      });
      subscription = result.data.subscription;
      if (before === revision) void restore();
    },
    refresh: () => state.session ? acceptSession(state.session, { force: true }) : restore(),
    dispose() {
      disposed = true; next(); subscription?.unsubscribe();
    },
  };
}

export const SOCIAL_TASK_TYPES = ['post', 'reels', 'story', 'social_media'];

/** Keyset pagination: dates may tie and new rows must not shift an offset. */
export async function fetchAllSocialRows(makeQuery, {
  signal,
  pageSize = 1000,
  maxPages = 10000,
} = {}) {
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 1000) {
    throw new Error('Tamanho de página inválido.');
  }
  const rows = [];
  let afterId = null;
  for (let page = 0; page < maxPages; page += 1) {
    if (signal?.aborted) throw new Error('Carregamento cancelado.');
    let query = makeQuery().order('id', { ascending: true }).limit(pageSize);
    if (afterId !== null) query = query.gt('id', afterId);
    if (signal) query = query.abortSignal(signal);
    const { data, error } = await query;
    if (error) throw error;
    const chunk = data || [];
    // Do not stop on a short page: the server may impose a smaller row cap.
    if (!chunk.length) return rows;
    for (const row of chunk) {
      if (!row.id || (afterId !== null && String(row.id) <= afterId)) {
        throw new Error('Não foi possível avançar na lista. Tente novamente.');
      }
      afterId = String(row.id);
      rows.push(row);
    }
  }
  throw new Error('A lista excedeu o limite de páginas. Tente novamente.');
}

export function linkSocialPublications(publications, tasks, users) {
  const taskById = new Map((tasks || []).map((task) => [task.id, task]));
  const userById = new Map((users || []).map((user) => [user.id, user]));
  return (publications || []).map((publication) => ({
    ...publication,
    task: publication.task || taskById.get(publication.task_id) || null,
    assignee: publication.assignee || userById.get(publication.assignee_id) || null,
  }));
}

export async function fetchSocialMediaData(client, { signal } = {}) {
  const page = (query) => fetchAllSocialRows(query, { signal });
  const [clients, tasks, projects, users, statusOptions, publications] = await Promise.all([
    page(() => client.from('clientes').select('id, empresa, logo_urls')),
    page(() => client.from('tarefas').select('*, clientes(id, empresa), projetos(name)').in('type', SOCIAL_TASK_TYPES)),
    page(() => client.from('projetos').select('id, name, client_id, status')),
    page(() => client.from('profiles').select('id, full_name, avatar_url, status, role').neq('role', 'cliente')),
    page(() => client.from('task_statuses').select('*')),
    page(() => client.from('task_channel_publications').select('*')),
  ]);
  const linked = linkSocialPublications(publications, tasks, users);
  // IDs drive pagination; presentation keeps newest dates first, with ID ties.
  tasks.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')) || String(a.id).localeCompare(String(b.id)));
  linked.sort((a, b) => String(a.scheduled_for || '').localeCompare(String(b.scheduled_for || '')) || String(a.id).localeCompare(String(b.id)));
  statusOptions.sort((a, b) => (a.sort_order ?? Infinity) - (b.sort_order ?? Infinity) || String(a.id).localeCompare(String(b.id)));
  return { clients, tasks, projects, users, statusOptions, publications: linked };
}

/** Latest request wins; even an adapter ignoring abort cannot leave loading on. */
export function createSocialMediaLoader({ load, onData, onError, onLoading, timeoutMs = 90000 }) {
  let generation = 0;
  let currentController = null;
  let disposed = false;
  let queued = false;

  function cancel() {
    generation += 1;
    currentController?.abort();
    currentController = null;
  }

  async function run(options = {}) {
    if (disposed) return false;
    if (options.coalesce && currentController) {
      queued = true;
      return false;
    }
    cancel();
    queued = false;
    const request = generation;
    const controller = new AbortController();
    currentController = controller;
    const isCurrent = () => !disposed && request === generation;
    let timedOut = false;
    let rejectAbort;
    const aborted = new Promise((_, reject) => { rejectAbort = reject; });
    const onAbort = () => rejectAbort(new Error('Carregamento cancelado.'));
    controller.signal.addEventListener('abort', onAbort, { once: true });
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    onLoading(true);
    try {
      const data = await Promise.race([load(controller.signal), aborted]);
      if (!isCurrent()) return false;
      onData(data);
      return true;
    } catch (error) {
      if (isCurrent()) {
        onError(timedOut ? new Error('O carregamento demorou demais. Tente novamente.') : error);
      }
      return false;
    } finally {
      clearTimeout(timer);
      controller.signal.removeEventListener('abort', onAbort);
      if (isCurrent()) {
        // Also stop other parallel reads when one of them fails.
        controller.abort();
        currentController = null;
        onLoading(false);
        if (queued && !disposed) {
          queued = false;
          void run();
        }
      }
    }
  }

  return {
    run,
    cancel,
    dispose() {
      disposed = true;
      const wasLoading = currentController !== null;
      cancel();
      if (wasLoading) onLoading(false);
    },
  };
}

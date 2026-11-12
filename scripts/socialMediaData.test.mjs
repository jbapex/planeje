import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchAllSocialRows, fetchSocialMediaData, createSocialMediaLoader, linkSocialPublications } from '../src/lib/socialMediaData.js';

const uuid = index => `00000000-0000-0000-0000-${String(index).padStart(12, '0')}`;

function fakeClient(tables, { cap = 1000, fail } = {}) {
  const requests = [];
  return {
    requests,
    from(table) {
      const request = { table, predicates: [] };
      const query = {
        select(columns) { request.select = columns; return this; },
        order(column, options) { request.order = [column, options]; return this; },
        limit(limit) { request.limit = limit; return this; },
        gt(column, value) { request.after = value; request.predicates.push(row => row[column] > value); return this; },
        in(column, values) { request.predicates.push(row => values.includes(row[column])); return this; },
        neq(column, value) { request.predicates.push(row => row[column] !== value); return this; },
        abortSignal(signal) { request.signal = signal; return this; },
        then(resolve, reject) {
          requests.push(request);
          assert.deepEqual(request.order, ['id', { ascending: true }]);
          const error = fail?.(request);
          let data = [];
          if (!error) {
            data = (tables[table] || []).filter(row => request.predicates.every(predicate => predicate(row)))
              .slice().sort((a, b) => a.id.localeCompare(b.id)).slice(0, Math.min(cap, request.limit));
          }
          return Promise.resolve({ data, error }).then(resolve, reject);
        },
      };
      return query;
    },
  };
}

function socialFixture(size = 1176) {
  const tarefas = Array.from({ length: size }, (_, i) => ({
    id: uuid(i + 1), title: `Post ${i + 1}`, type: 'social_media', status: 'completed',
    created_at: '2026-09-11T10:00:00Z', post_date: '2026-09-15',
    client_id: uuid(1), clientes: { id: uuid(1), empresa: 'Cliente A' }, projetos: { name: 'Projeto A' },
  })).reverse();
  return {
    tarefas: [...tarefas, { id: uuid(size + 1), type: 'design' }],
    clientes: [{ id: uuid(1), empresa: 'Cliente A' }],
    projetos: [{ id: uuid(1), name: 'Projeto A', client_id: uuid(1), status: 'active' }],
    profiles: [{ id: uuid(1), role: 'admin', full_name: 'Operador' }, { id: uuid(2), role: 'cliente' }],
    task_statuses: [{ id: uuid(1), sort_order: 2, value: 'completed' }, { id: uuid(2), sort_order: 1, value: 'scheduled' }],
  };
}

for (const cap of [1000, 250]) {
  test(`loads 1176 same-date social tasks without gaps or duplicates with server cap ${cap}`, async () => {
    const client = fakeClient(socialFixture(), { cap });
    const result = await fetchSocialMediaData(client);
    assert.equal(result.tasks.length, 1176);
    assert.equal(new Set(result.tasks.map(task => task.id)).size, 1176);
    assert.deepEqual(result.tasks.map(task => task.id), Array.from({ length: 1176 }, (_, i) => uuid(i + 1)));
    assert.equal(result.tasks.at(-1).id, uuid(1176), 'the task outside the original first 1000 is visible');
    assert.equal(result.tasks.at(-1).post_date, '2026-09-15', 'calendar and relationship fields are preserved');
    assert.equal(result.tasks.at(-1).clientes.empresa, 'Cliente A');
    assert.equal(result.tasks.at(-1).status, 'completed');
    assert.equal(result.clients.length, 1);
    assert.equal(result.projects[0].name, 'Projeto A');
    assert.deepEqual(result.users.map(user => user.full_name), ['Operador']);
    assert.deepEqual(result.statusOptions.map(status => status.value), ['scheduled', 'completed']);
    assert.equal(client.requests.filter(request => request.table === 'tarefas').length, Math.ceil(1176 / cap) + 1);
  });
}

test('presentation uses newest creation date with ID tie-break, independent from paging', async () => {
  const tables = socialFixture(3);
  tables.tarefas.find(task => task.id === uuid(2)).created_at = '2026-09-12T10:00:00Z';
  const result = await fetchSocialMediaData(fakeClient(tables, { cap: 1 }));
  assert.deepEqual(result.tasks.map(task => task.id), [uuid(2), uuid(1), uuid(3)]);
});

test('new low-ID inserts between pages do not shift offsets or duplicate existing tasks', async () => {
  const tables = socialFixture(1176);
  let inserted = false;
  const client = fakeClient(tables, { fail(request) {
    if (request.table === 'tarefas' && request.after && !inserted) {
      inserted = true;
      tables.tarefas.push({ ...tables.tarefas[0], id: uuid(0) });
    }
    return null;
  } });
  const result = await fetchSocialMediaData(client);
  assert.equal(result.tasks.length, 1176);
  assert.equal(new Set(result.tasks.map(task => task.id)).size, 1176);
  const refreshed = await fetchSocialMediaData(client);
  assert.equal(refreshed.tasks.length, 1177, 'next refresh includes the new row before the cursor');
});

test('failure on the second page ends loading, preserves prior data and retry loads everything', async () => {
  let offline = true;
  const client = fakeClient(socialFixture(), { fail: request => request.table === 'tarefas' && request.after && offline ? new Error('offline') : null });
  const loading = [];
  const errors = [];
  const data = [];
  const loader = createSocialMediaLoader({
    load: signal => fetchSocialMediaData(client, { signal }),
    onLoading: value => loading.push(value), onError: error => errors.push(error.message), onData: value => data.push(value),
  });
  assert.equal(await loader.run(), false);
  assert.deepEqual(loading, [true, false]);
  assert.deepEqual(errors, ['offline']);
  assert.equal(data.length, 0, 'partial pages never replace the current UI state');
  offline = false;
  assert.equal(await loader.run(), true);
  assert.deepEqual(loading, [true, false, true, false]);
  assert.equal(data.length, 1);
  assert.equal(data[0].tasks.length, 1176);
  loader.dispose();
});

test('latest request wins when an older adapter ignores cancellation', async () => {
  const pending = [];
  const data = [];
  const loading = [];
  const errors = [];
  const loader = createSocialMediaLoader({
    load: signal => new Promise(resolve => pending.push({ resolve, signal })),
    onData: value => data.push(value), onError: error => errors.push(error), onLoading: value => loading.push(value),
  });
  const old = loader.run();
  const current = loader.run();
  assert.equal(pending[0].signal.aborted, true);
  pending[1].resolve('current');
  assert.equal(await current, true);
  pending[0].resolve('stale');
  assert.equal(await old, false);
  assert.deepEqual(data, ['current']);
  assert.deepEqual(errors, []);
  assert.deepEqual(loading, [true, true, false]);
  loader.dispose();
});

test('unmount aborts work and prevents every subsequent UI callback', async () => {
  let resolve;
  const events = [];
  const loader = createSocialMediaLoader({
    load: () => new Promise(done => { resolve = done; }),
    onData: value => events.push(['data', value]), onError: error => events.push(['error', error]), onLoading: value => events.push(['loading', value]),
  });
  const request = loader.run();
  loader.dispose();
  resolve('late data');
  assert.equal(await request, false);
  assert.equal(await loader.run(), false);
  assert.deepEqual(events, [['loading', true], ['loading', false]]);
});

test('a stalled adapter times out, clears loading and can be retried', async () => {
  const loading = [];
  const errors = [];
  let stalled = true;
  const loader = createSocialMediaLoader({
    load: () => stalled ? new Promise(() => {}) : Promise.resolve('recovered'), timeoutMs: 10,
    onData: value => assert.equal(value, 'recovered'), onError: error => errors.push(error.message), onLoading: value => loading.push(value),
  });
  assert.equal(await loader.run(), false);
  assert.match(errors[0], /demorou demais/);
  assert.deepEqual(loading, [true, false]);
  stalled = false;
  assert.equal(await loader.run(), true);
  assert.deepEqual(loading, [true, false, true, false]);
  loader.dispose();
});

test('a non-advancing server cursor fails visibly instead of looping or duplicating rows', async () => {
  const client = fakeClient({ tarefas: [{ id: uuid(1) }] });
  const makeQuery = () => {
    const query = client.from('tarefas').select('*');
    query.gt = () => query;
    return query;
  };
  await assert.rejects(fetchAllSocialRows(makeQuery), /avançar/);
  assert.equal(client.requests.length, 2);
});

test('a configured page budget bounds even a continuously growing table', async () => {
  const client = fakeClient(socialFixture(10));
  await assert.rejects(fetchAllSocialRows(() => client.from('tarefas').select('*'), { pageSize: 1, maxPages: 2 }), /limite de páginas/);
  assert.equal(client.requests.length, 2);
});

test('coalesce does not abort the in-flight load and runs once more after', async () => {
  const pending = [];
  const data = [];
  const loading = [];
  const loader = createSocialMediaLoader({
    load: () => new Promise(resolve => pending.push(resolve)),
    onData: value => data.push(value),
    onError: () => {},
    onLoading: value => loading.push(value),
  });
  const first = loader.run();
  assert.equal(await loader.run({ coalesce: true }), false);
  assert.equal(pending.length, 1);
  pending[0]('first');
  assert.equal(await first, true);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(pending.length, 2);
  pending[1]('second');
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.deepEqual(data, ['first', 'second']);
  loader.dispose();
});

test('publications link to already loaded tasks without a nested join', async () => {
  const tables = socialFixture(2);
  tables.task_channel_publications = [{
    id: uuid(9),
    task_id: uuid(1),
    assignee_id: uuid(1),
    status: 'failed',
    scheduled_for: '2026-09-21',
  }];
  const result = await fetchSocialMediaData(fakeClient(tables));
  assert.equal(result.publications[0].task.title, 'Post 1');
  assert.equal(result.publications[0].assignee.full_name, 'Operador');
  assert.equal(linkSocialPublications([{ id: 'p', task_id: uuid(2) }], result.tasks, result.users)[0].task.title, 'Post 2');
});

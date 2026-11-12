import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const requireMcp = createRequire(new URL('../planeje-mcp/package.json', import.meta.url));
const tsxPackageUrl = pathToFileURL(requireMcp.resolve('tsx/package.json'));
// Use the package's ESM export: require.resolve selects the CommonJS condition.
const tsxPackage = requireMcp('tsx/package.json');
const { register } = await import(new URL(tsxPackage.exports['./esm/api'].import.default, tsxPackageUrl));
register();
const { createClient } = requireMcp('@supabase/supabase-js');
const { loadTarefasPagina, loadSolicitacoes, loadProjetosPendentes } = await import('../planeje-mcp/src/clienteDossie.ts');
const { registerPlanejeTools } = await import('../planeje-mcp/src/tools.ts');
const { registerHubTools } = await import('../planeje-mcp/src/hubTools.ts');
const ACTOR = '10000000-0000-4000-8000-000000000001';
const OTHER = '10000000-0000-4000-8000-000000000002';
const CLIENT = '20000000-0000-4000-8000-000000000001';
const ITEM = '30000000-0000-4000-8000-000000000001';
const actor = { type: 'user', user_id: ACTOR, role: 'colaborador' };

// Exercise the installed SDK's URL serialization and response decoding. No real transport.
function fixture(handler) {
  const requests = [];
  const db = createClient('https://fixture.invalid', 'fixture-only', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, options = {}) => {
      const url = new URL(String(input));
      assert.equal(url.host, 'fixture.invalid');
      const request = { url, table: url.pathname.split('/').at(-1), method: options.method ?? 'GET', body: options.body ? JSON.parse(options.body) : null };
      // Account/module fixtures are shared by the new central gate; domain assertions stay below.
      if (url.pathname.startsWith('/auth/v1/admin/users/')) return new Response(JSON.stringify({ id: ACTOR }));
      if (request.table === 'profiles' && url.searchParams.get('id') === `eq.${ACTOR}`) return new Response(JSON.stringify({ id: ACTOR, full_name: 'Equipe fictícia', role: actor.role, status: 'active' }));
      if (['module_settings', 'user_module_permissions', 'user_module_access'].includes(request.table)) return new Response('[]');
      requests.push(request);
      const result = await handler(request);
      return result instanceof Response ? result : new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } });
    } },
  });
  return { db, requests };
}
function callbacks(registerTools, db, who = actor) {
  const tools = new Map();
  registerTools({ registerTool: (name, _schema, callback) => tools.set(name, callback) }, db, {}, who);
  return tools;
}
function hub(db, who = actor) {
  const tools = new Map();
  registerHubTools({ registerTool: (name, _schema, callback) => tools.set(name, callback) }, db, who);
  return tools;
}
const content = (result) => JSON.parse(result.content[0].text);
const unavailableColumn = () => new Response(JSON.stringify({ message: 'optional column unavailable', code: '42703' }), { status: 400, headers: { 'Content-Type': 'application/json' } });

for (const fallback of [false, true]) {
  test(`tasks retain full/minimal projection, client/status/search/date filters (fallback=${fallback})`, async () => {
    const { db, requests } = fixture(({ table, url }) => {
      if (table === 'clientes') return [{ id: CLIENT, empresa: 'Empresa fictícia' }];
      assert.equal(table, 'tarefas');
      const full = url.searchParams.get('select').includes('briefing_estado');
      if (fallback && full) return unavailableColumn();
      return [{ id: 'task', client_id: CLIENT, title: 'Planejar', due_date: '2000-01-01', status: 'todo', ...(full ? { briefing_estado: 'pronto' } : {}) }];
    });
    const result = await loadTarefasPagina(db, { cliente_id: CLIENT, atrasadas: true, busca: 'Plano', limite: 7 });
    assert.equal(result.tarefas[0].client_id, CLIENT);
    assert.equal(result.tarefas[0].empresa, 'Empresa fictícia');
    assert.equal(result.tarefas[0].atrasada, true);
    assert.ok(result.tarefas[0].dias_atraso > 0);
    const reads = requests.filter((r) => r.table === 'tarefas');
    assert.equal(reads.length, fallback ? 2 : 1);
    for (const { url, method } of reads) {
      assert.equal(method, 'GET');
      assert.equal(url.searchParams.get('client_id'), `eq.${CLIENT}`);
      assert.equal(url.searchParams.get('status'), 'neq.completed');
      assert.equal(url.searchParams.get('title'), 'ilike.%Plano%');
      assert.equal(url.searchParams.get('due_date'), `lt.${result.hoje}`);
      assert.equal(url.searchParams.get('limit'), '7');
      assert.equal(url.searchParams.get('order'), 'due_date.asc');
    }
    assert.equal('briefing_estado' in result.tarefas[0], !fallback);
  });

  test(`requests preserve public fields and fallback filters (fallback=${fallback})`, async () => {
    const { db, requests } = fixture(({ table, url }) => {
      if (table === 'clientes') return [{ id: CLIENT, empresa: 'Empresa fictícia' }];
      assert.equal(table, 'solicitacoes');
      const full = url.searchParams.get('select').includes('description');
      if (fallback && full) return unavailableColumn();
      return [{ id: 'request', client_id: CLIENT, title: 'Pedido', status: 'aberta', ...(full ? { description: 'Contexto' } : {}) }];
    });
    const result = await loadSolicitacoes(db, { cliente_id: CLIENT, limite: 4 });
    assert.equal(result.solicitacoes[0].empresa, 'Empresa fictícia');
    assert.equal('description' in result.solicitacoes[0], !fallback);
    const reads = requests.filter((r) => r.table === 'solicitacoes');
    assert.equal(reads.length, fallback ? 2 : 1);
    for (const { url } of reads) {
      assert.equal(url.searchParams.get('client_id'), `eq.${CLIENT}`);
      assert.equal(url.searchParams.get('limit'), '4');
      assert.equal(url.searchParams.get('order'), 'created_at.desc');
    }
  });
}

test('existing project client_id excludes that client from pending plans', async () => {
  const { db } = fixture(({ table, url }) => {
    if (table === 'projetos') return [{ id: 'project', client_id: CLIENT, name: 'Plano', status: 'todo' }];
    if (table === 'project_plan_skips') return [];
    if (table === 'clientes' && url.searchParams.has('id')) return [{ id: CLIENT, empresa: 'Empresa' }];
    if (table === 'clientes') return [{ id: CLIENT, empresa: 'Empresa', etapa: 'closed' }, { id: OTHER, empresa: 'Outra', etapa: 'closed' }];
    assert.fail(`Unexpected table ${table}`);
  });
  const result = await loadProjetosPendentes(db, { mes: '2026-10' });
  assert.equal(result.projetos_do_mes[0].client_id, CLIENT);
  assert.deepEqual(result.sem_plano_automatico.map((r) => r.id), [OTHER]);
});

for (const tool of ['ajustar_item_checklist', 'virar_tarefa_checklist']) {
  for (const scenario of ['missing', 'forbidden', 'existing', 'allowed']) {
    test(`${tool}: ${scenario} item keeps authorization and task linkage`, async () => {
      const linked = scenario === 'existing';
      const { db, requests } = fixture(({ table, method }) => {
        if (table === 'module_settings' || table === 'user_module_permissions') return [];
        if (table === 'client_checklists' && method === 'GET') return { id: 'check', client_id: CLIENT, items: scenario === 'missing' ? [] : [{ id: ITEM, title: 'Título', assignee_id: scenario === 'forbidden' ? OTHER : ACTOR, task_id: linked ? 'task-existing' : null, note: 'Nota' }] };
        if (table === 'tarefas' && method === 'POST') return { id: 'task-new' };
        if (method === 'PATCH') return [];
        assert.fail(`Unexpected request ${method} ${table}`);
      });
      const result = await hub(db).get(tool)({ checklist_id: 'check', item_id: ITEM, titulo: 'Novo título' });
      const writes = requests.filter((r) => r.method !== 'GET');
      if (scenario === 'missing' || scenario === 'forbidden') {
        assert.equal(result.isError, true);
        assert.match(result.content[0].text, scenario === 'missing' ? /Item não encontrado/ : /Só o responsável/);
        assert.equal(writes.length, 0);
      } else if (linked && tool === 'virar_tarefa_checklist') {
        assert.equal(content(result).tarefa_id, 'task-existing');
        assert.equal(writes.length, 0);
      } else {
        assert.equal(result.isError, undefined);
        if (tool === 'virar_tarefa_checklist') {
          const task = writes.find((r) => r.table === 'tarefas');
          assert.equal(task.body.client_id, CLIENT);
          assert.deepEqual(task.body.assignee_ids, [ACTOR]);
          assert.equal(task.body.owner_id, ACTOR);
          assert.equal(content(result).tarefa_id, 'task-new');
        }
        const checklist = writes.find((r) => r.table === 'client_checklists');
        assert.equal(checklist.body.items[0].assignee_id, ACTOR);
        if (linked) assert.equal(checklist.body.items[0].task_id, 'task-existing');
      }
    });
  }
}

for (const scenario of ['exact', 'soft', 'none', 'ambiguous-exact', 'ambiguous-soft']) {
  test(`demand recipient resolution: ${scenario}`, async () => {
    const person = { id: OTHER, full_name: 'Pessoa fictícia', role: 'colaborador' };
    const { db, requests } = fixture(({ table, url, body }) => {
      if (table === 'profiles') {
        const soft = url.searchParams.get('full_name').includes('%');
        if (scenario === 'none' || (!soft && ['soft', 'ambiguous-soft'].includes(scenario))) return [];
        return scenario.startsWith('ambiguous') ? [person, { ...person, id: CLIENT }] : [person];
      }
      if (table === 'caixa_dot_threads') return { id: 'thread', ...body };
      if (table === 'caixa_dot_messages') return { id: 'message' };
      assert.fail(`Unexpected table ${table}`);
    });
    const result = await callbacks(registerPlanejeTools, db).get('criar_demanda_caixa')({ nome: 'Pessoa', titulo: 'Pedido', corpo: 'Texto' });
    const writes = requests.filter((r) => r.method !== 'GET');
    if (scenario === 'none' || scenario.startsWith('ambiguous')) {
      assert.equal(result.isError, true);
      assert.equal(writes.length, 0);
    } else {
      assert.equal(content(result).owner_id, OTHER);
      assert.equal(content(result).owner_name, person.full_name);
      assert.equal(writes.length, 2);
      assert.equal(writes[0].body.owner_id, OTHER);
    }
    for (const { url } of requests.filter((r) => r.table === 'profiles')) {
      assert.equal(url.searchParams.get('role'), 'in.(superadmin,admin,colaborador)');
      assert.equal(url.searchParams.get('select'), 'id,full_name,role,status');
      assert.equal(url.searchParams.get('limit'), '5');
    }
  });
}

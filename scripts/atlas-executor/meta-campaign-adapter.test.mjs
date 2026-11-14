import assert from 'node:assert/strict';
import test from 'node:test';
import { createClient } from '@supabase/supabase-js';
import { EXECUTOR_META_CAMPAIGN_CATALOG, readExecutorMetaCampaign, prepareExecutorMetaCampaign, createMetaCampaignTransport, reconcileMetaCampaignReceipt } from '../../supabase/functions/_shared/atlasExecutorMetaCampaign.js';
import { requireMetaCampaignScope, readMetaWriteObject } from '../../supabase/functions/_shared/metaWriteAuthorization.js';
import { executeMetaCampaignPlan } from '../../supabase/functions/_shared/atlasMetaCampaign.js';

const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const clientId = uuid(1), actorId = uuid(2), sessionId = uuid(3), accountId = 'act_700', pageId = '222222', hash = 'a'.repeat(32), now = '2026-11-12T15:00:00Z';
const jwt = patch => ['eyJhbGciOiJIUzI1NiJ9', Buffer.from(JSON.stringify({ role: 'authenticated', sub: actorId, session_id: sessionId, ...patch })).toString('base64url'), 'synthetic-signature'].join('.');
const human = () => ({ account_id: accountId, campaign_name: 'Café ☕', adset_name: 'Público', creative_name: 'Imagem', ad_name: 'Visite', objective: 'OUTCOME_TRAFFIC', special_category: 'none', budget: { type: 'daily', amount: '10.50' }, countries: ['BR'], start_time: '2027-01-01T12:00:00Z', creative: { mode: 'image', page_id: pageId, image_hash: hash, url: 'https://example.test/cafe', message: 'Café', headline: 'Conheça' } });
function fixture(options = {}) {
  const calls = [], tables = {
    profiles: [{ id: actorId, role: options.role || 'colaborador', status: options.inactive ? 'inactive' : 'active' }],
    module_settings: [{ is_enabled: options.module !== false }], user_module_permissions: [],
    clientes: [{ id: clientId }], cliente_meta_accounts: options.noLinks ? [] : [{ cliente_id: clientId, meta_account_id: '700', is_active: true }],
    client_field_permissions: [{ field_name: 'meta_resumo', can_view: options.metrics !== false }, { field_name: 'valor', can_view: options.money !== false }], user_client_field_permissions: [],
  };
  const authorization = `Bearer ${jwt(options.claims)}`;
  const caller = createClient('https://fixture.invalid', 'synthetic-public-key', { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: authorization }, fetch: async (input, init = {}) => {
    const url = new URL(input); assert.equal(url.origin, 'https://fixture.invalid'); calls.push({ kind: 'sdk', path: url.pathname });
    if (url.pathname === '/auth/v1/user') return Response.json({ id: actorId });
    if (url.pathname.endsWith('/planeje_current_account_access')) return Response.json(options.session !== false);
    if (url.pathname.endsWith('/central_trafego_can_access_client')) return Response.json(options.access !== false);
    assert.ok(Object.hasOwn(tables, url.pathname.split('/').at(-1)), url.pathname);
    return Response.json(tables[url.pathname.split('/').at(-1)]);
  } } });
  const deps = { request: new Request('https://fixture.invalid', { headers: { Authorization: authorization } }), now,
    readToken: async () => { calls.push({ kind: 'token' }); return 'synthetic-meta-secret'; },
    graphFetch: async (input, init = {}) => {
      const url = new URL(input); assert.equal(url.origin, 'https://graph.facebook.com'); assert.equal(url.searchParams.has('access_token'), false);
      assert.equal(new Headers(init.headers).get('authorization'), 'Bearer synthetic-meta-secret'); assert.equal(init.redirect, 'error');
      calls.push({ kind: 'graph', path: url.pathname, query: Object.fromEntries(url.searchParams), method: init.method || 'GET', body: init.body?.toString() });
      if (options.graph) { const custom = options.graph(url, init, calls); if (custom) return custom; }
      if (url.pathname === '/v25.0/act_700') return Response.json({ id: accountId, account_id: '700', name: 'Conta Café', currency: options.currency || 'BRL', account_status: 1, user_tasks: ['ADVERTISE'] });
      if (url.pathname === '/v25.0/act_700/promote_pages') return Response.json({ data: [{ id: '111111', name: 'Outra Página' }, { id: pageId, name: 'Página Café' }] });
      if (url.pathname === `/v25.0/${pageId}/ads_posts`) return options.proof === false ? Response.json({ error: { code: 200, message: 'synthetic-meta-secret' } }) : Response.json({ data: [{ id: `${pageId}_333333`, from: { id: pageId }, is_eligible_for_promotion: true, promotable_id: `${pageId}_333333`, message: 'Café ☕', attachments: { data: [{ unshimmed_url: 'https://example.test/cafe', media_type: 'link' }] } }] });
      if (url.pathname === '/v25.0/act_700/adimages') return Response.json({ data: [{ hash, account_id: '700', status: 'ACTIVE', name: 'Café.jpg' }] });
      if (init.method === 'POST') return Response.json({ id: '555555' });
      if (url.pathname === '/v25.0/555555') return Response.json({ id: '555555', account_id: '700', status: 'PAUSED', objective: 'OUTCOME_TRAFFIC' });
      assert.fail(`GET não previsto: ${url.pathname}`);
    },
  };
  const prepare = (input = human()) => prepareExecutorMetaCampaign(caller, { clientId, action: 'create_meta_campaign', input }, deps);
  const read = (input = { account_id: accountId, page_id: pageId }) => readExecutorMetaCampaign(caller, { clientId, view: 'meta_creation_assets', input }, deps);
  return { caller, deps, calls, prepare, read };
}

test('catálogo descreve limites reais e os campos humanos, sem provas ou Graph JSON', () => {
  assert.equal(EXECUTOR_META_CAMPAIGN_CATALOG.length, 2);
  const write = EXECUTOR_META_CAMPAIGN_CATALOG.find(row => row.mode === 'write');
  assert.equal(write.name, 'create_meta_campaign'); assert.match(write.description, /Traffic|Tráfego/i); assert.match(write.description, /WhatsApp/);
  assert.ok(write.fields.includes('creative')); assert.ok(!write.fields.includes('authorizedAssets'));
});

test('guard novo mantém sessão, cliente, campos e conta antes de qualquer segredo', async () => {
  const f = fixture(); const scope = await requireMetaCampaignScope({ request: f.deps.request, body: { cliente_id: clientId, adAccountId: accountId }, caller: f.caller });
  assert.equal(scope.client_id, clientId); assert.equal(scope.account_id, accountId); assert.equal(scope.budget, true); assert.equal(f.calls.some(row => row.kind === 'token'), false);
  const prepared = await f.prepare(); const first = f.calls.findIndex(row => row.kind === 'token');
  assert.ok(first > f.calls.findIndex(row => row.path === '/rest/v1/cliente_meta_accounts')); assert.equal(prepared.payload.plan.budget_minor, '1050');
  assert.equal(prepared.app, 'gestor'); assert.equal(prepared.client_id, clientId); assert.equal(prepared.action, 'create_meta_campaign'); assert.equal(prepared.effect.starts_delivery, false); assert.equal(prepared.effect.external, true);
  assert.ok(prepared.preview.before && prepared.preview.after); assert.equal(prepared.preview.after.entrega, 'Pausada'); assert.doesNotMatch(JSON.stringify(prepared.preview), /object_story_spec|link_data|OUTCOME_TRAFFIC/);
  assert.equal(prepared.links[0].href, `/gestor-ia/clientes/${clientId}?conta=${accountId}`);
  assert.equal(f.calls.some(row => row.method === 'POST'), false); assert.doesNotMatch(JSON.stringify(prepared), /synthetic-meta-secret|Bearer/);
});

test('sessão, role, módulo, campos, cliente e vínculos revogados não acessam token', async () => {
  for (const options of [{ role: 'cliente' }, { inactive: true }, { module: false }, { money: false }, { metrics: false }, { noLinks: true }, { access: false }, { session: false }, { claims: { role: 'service_role' } }, { claims: { planeje_server_delegate: 'atlas' } }, { claims: { session_id: null } }]) {
    const f = fixture(options); await assert.rejects(f.prepare(), undefined, JSON.stringify(options)); assert.equal(f.calls.some(row => row.kind === 'token' || row.kind === 'graph'), false, JSON.stringify(options));
  }
});

test('revogar acesso entre páginas da Meta impede leituras seguintes com o token global', async () => {
  const options = { graph: url => { if (url.pathname === '/v25.0/act_700') options.access = false; } };
  const f = fixture(options);
  await assert.rejects(f.read());
  assert.deepEqual(f.calls.filter(row => row.kind === 'graph').map(row => row.path), ['/v25.0/act_700']);
});

test('seleção exata nunca usa primeira conta/Página e recusa campos ou provas do modelo', async () => {
  for (const mutate of [data => { data.account_id = 'act_999'; }, data => { data.cliente_id = uuid(9); }, data => { data.rpc = 'get_encrypted_secret'; }, data => { data.authorizedAssets = {}; }, data => { data.creative.tasks = ['ADVERTISE']; }, data => { data.creative.page_id = '../me'; }]) {
    const f = fixture(), input = human(); mutate(input); await assert.rejects(f.prepare(input)); assert.equal(f.calls.some(row => row.kind === 'token'), false);
  }
  const f = fixture(); const prepared = await f.prepare(); assert.equal(prepared.payload.plan.input.creative.page_id, pageId); assert.equal(f.calls.some(row => row.path === '/v25.0/111111/ads_posts'), false);
});

test('fonte de ativos exige vínculo atual, proof ADVERTISE, moeda e propriedade da imagem', async () => {
  const f = fixture(); const read = await f.read(); assert.equal(read.available, true); assert.equal(read.data.account.currency, 'BRL'); assert.equal(read.data.pages.find(row => row.id === pageId).can_advertise, true);
  assert.equal(read.data.images[0].hash, hash); assert.equal(read.data.posts[0].id, `${pageId}_333333`); assert.equal(read.coverage.max_pages, 3);
  const absent = fixture({ proof: false }); const unavailable = await absent.read(); assert.equal(unavailable.available, false); assert.match(unavailable.data.reason, /Página|permiss/i); assert.doesNotMatch(JSON.stringify(unavailable), /synthetic-meta-secret/);
  await assert.rejects(absent.prepare());
  for (const data of [{ account_id: '999', hash, status: 'ACTIVE' }, { account_id: '700', hash, status: 'DELETED' }]) {
    const bad = fixture({ graph: url => url.pathname.endsWith('/adimages') && Response.json({ data: [data] }) }); await assert.rejects(bad.prepare());
  }
});

test('moeda vem da conta; ISO não redefine offsets Meta e moeda divergente falha', async () => {
  const f = fixture({ currency: 'JPY' }), input = human(); input.budget.amount = '1000'; const yen = await f.prepare(input); assert.equal(yen.payload.plan.currency_offset, 1); assert.equal(yen.payload.plan.budget_minor, '1000');
  input.currency = 'BRL'; await assert.rejects(f.prepare(input));
});

test('post existente usa fonte corrente, destino website e elegibilidade, sem confiar em payload', async () => {
  const f = fixture(), input = human(); input.creative = { mode: 'post', page_id: pageId, post_id: `${pageId}_333333` };
  const prepared = await f.prepare(input); assert.equal(prepared.payload.plan.assets.posts[0].url, 'https://example.test/cafe');
  for (const mutation of [row => { row.from.id = '999999'; }, row => { row.is_eligible_for_promotion = false; }, row => { row.attachments.data[0].unshimmed_url = 'https://127.0.0.1/'; }, row => { row.promotable_id = `${pageId}_444444`; }]) {
    const bad = fixture({ graph: url => { if (!url.pathname.endsWith('/ads_posts')) return null; const row = { id: `${pageId}_333333`, from: { id: pageId }, is_eligible_for_promotion: true, promotable_id: `${pageId}_333333`, attachments: { data: [{ unshimmed_url: 'https://example.test/cafe', media_type: 'link' }] } }; mutation(row); return Response.json({ data: [row] }); } });
    await assert.rejects(bad.prepare(input));
  }
});

test('paginação ignora URL next externa, segue cursor apenas no caminho fixo e relata limite', async () => {
  const f = fixture({ graph: url => url.pathname.endsWith('/promote_pages') && Response.json({ data: [{ id: pageId, name: 'Página' }], paging: { next: 'https://evil.invalid/?access_token=secret', cursors: { after: `cursor-${url.searchParams.get('after') || '1'}` } } }) });
  const read = await f.read(); assert.equal(read.available, true); assert.equal(read.coverage.pages.complete, false); assert.equal(read.coverage.pages.pages, 3);
  assert.ok(f.calls.filter(row => row.path?.endsWith('/promote_pages')).every(row => row.path === '/v25.0/act_700/promote_pages'));
});

test('aprovação revalida ownership, proof e moeda; nunca executa plano vencido', async () => {
  const f = fixture(), plan = (await f.prepare()).payload.plan;
  for (const options of [{ noLinks: true }, { proof: false }, { currency: 'USD' }]) {
    const stale = fixture(options); await assert.rejects(createMetaCampaignTransport(stale.caller, { clientId, plan }, stale.deps)); assert.equal(stale.calls.some(row => row.method === 'POST'), false);
  }
});

test('transporte fixa host/conta/versão, formata estruturas e só relê IDs recebidos da Meta', async () => {
  const f = fixture(), plan = (await f.prepare()).payload.plan, callGraph = await createMetaCampaignTransport(f.caller, { clientId, plan }, f.deps);
  const campaign = { name: plan.input.campaign_name, objective: 'OUTCOME_TRAFFIC', buying_type: 'AUCTION', status: 'PAUSED', special_ad_categories: [], is_adset_budget_sharing_enabled: false };
  for (const request of [{ method: 'POST', path: '/v25.0/act_999/campaigns', body: {} }, { method: 'POST', path: 'https://evil.invalid/', body: {} }, { method: 'GET', path: '/v25.0/999999' }, { method: 'POST', path: '/v25.0/act_700/campaigns', body: { status: 'ACTIVE' } }, { method: 'POST', path: '/v25.0/act_700/campaigns', body: { ...campaign, access_token: 'foreign' } }, { method: 'POST', path: '/v25.0/act_700/campaigns', body: { ...campaign, objective: 'OUTCOME_SALES' } }]) await assert.rejects(callGraph(request));
  const result = await callGraph({ method: 'POST', path: '/v25.0/act_700/campaigns', body: campaign });
  assert.equal(result.data.id, '555555'); assert.equal((await callGraph({ method: 'GET', path: '/v25.0/555555', query: { fields: 'id,account_id,status,objective' } })).data.status, 'PAUSED');
  const posted = f.calls.find(row => row.method === 'POST'); assert.equal(new URLSearchParams(posted.body).get('special_ad_categories'), '[]'); assert.equal(new URLSearchParams(posted.body).get('name'), 'Café ☕');
});

test('Request.signal não elimina prazo de leitura e cancelamento é propagado ao fetch combinado', async () => {
  const controller = new AbortController(); let called = 0, fetchSignal;
  await assert.rejects(readMetaWriteObject({ scope: { object_id: '123456789', level: 'campaign', accounts: [accountId], account_id: accountId }, token: 'synthetic', signal: controller.signal,
    graphFetch: async (_url, options) => { called++; fetchSignal = options.signal; controller.abort(); options.signal.throwIfAborted(); } }));
  assert.equal(called, 1); assert.notEqual(fetchSignal, controller.signal); assert.equal(fetchSignal.aborted, true);
});

test('planner real usa transporte autorizado e recibos nas quatro etapas sem duplicar POST', async () => {
  const ids = { campaigns: '100001', adsets: '100002', adcreatives: '100003', ads: '100004' }, created = new Map();
  const f = fixture({ graph: (url, options) => {
    if (options.method === 'POST') {
      const edge = url.pathname.split('/').at(-1), data = Object.fromEntries(new URLSearchParams(options.body));
      created.set(ids[edge], { edge, data }); return Response.json({ id: ids[edge] });
    }
    const saved = created.get(url.pathname.split('/').at(-1));
    if (!saved) return null;
    return Response.json({ id: url.pathname.split('/').at(-1), account_id: '700', ...(saved.edge !== 'adcreatives' && { status: 'PAUSED' }),
      ...(saved.edge === 'campaigns' && { objective: 'OUTCOME_TRAFFIC' }), ...(saved.edge === 'adsets' && { campaign_id: ids.campaigns }), ...(saved.edge === 'ads' && { adset_id: ids.adsets, creative: { id: ids.adcreatives } }) });
  } });
  const prepared = await f.prepare(), callGraph = await createMetaCampaignTransport(f.caller, { clientId, plan: prepared.payload.plan }, f.deps), rows = new Map();
  const callbacks = { reserveStep: async spec => { if (rows.has(spec.step)) return { ...rows.get(spec.step), claimed: false }; rows.set(spec.step, { state: 'reserved' }); return { state: 'reserved', claimed: true }; }, finishStep: async item => { rows.set(item.step, item); return item; } };
  const first = await executeMetaCampaignPlan({ plan: prepared.payload.plan, callGraph, ...callbacks }); assert.equal(first.state, 'completed'); assert.equal(created.size, 4);
  const replay = await executeMetaCampaignPlan({ plan: prepared.payload.plan, callGraph, ...callbacks }); assert.equal(replay.state, 'completed'); assert.equal(f.calls.filter(row => row.method === 'POST').length, 4);
});

test('reconciliação relê somente receipt conhecido e confirma pais, estado e propriedade sem POST', async () => {
  const f = fixture(), plan = (await f.prepare()).payload.plan;
  const receipt = { id: '555555', account_id: accountId, step: 'campaign', verified: false };
  const confirmed = await reconcileMetaCampaignReceipt(f.caller, { clientId, plan, step: 'campaign', receipt }, f.deps);
  assert.deepEqual(confirmed, { state: 'completed', receipt: { ...receipt, verified: true } }); assert.equal(f.calls.some(row => row.method === 'POST'), false);
  const afterStart = { ...f.deps, now: '2027-02-01T00:00:00Z' };
  assert.equal((await reconcileMetaCampaignReceipt(f.caller, { clientId, plan, step: 'campaign', receipt }, afterStart)).state, 'completed');
  await assert.rejects(createMetaCampaignTransport(f.caller, { clientId, plan }, afterStart));
  const bad = fixture({ graph: url => url.pathname === '/v25.0/555555' && Response.json({ id: '555555', account_id: '999', status: 'PAUSED', objective: 'OUTCOME_TRAFFIC' }) });
  const uncertain = await reconcileMetaCampaignReceipt(bad.caller, { clientId, plan, step: 'campaign', receipt }, bad.deps); assert.equal(uncertain.state, 'uncertain'); assert.deepEqual(uncertain.receipt, receipt); assert.equal(bad.calls.some(row => row.method === 'POST'), false);
  await assert.rejects(reconcileMetaCampaignReceipt(f.caller, { clientId, plan, step: 'ad', receipt: { ...receipt, step: 'ad' } }, f.deps));
  await assert.rejects(reconcileMetaCampaignReceipt(f.caller, { clientId, plan, step: 'campaign', receipt: { ...receipt, id: '../me' } }, f.deps));
});

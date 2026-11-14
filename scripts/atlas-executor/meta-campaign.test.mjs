import assert from 'node:assert/strict';
import test from 'node:test';
import { validateMetaCampaignPlan, executeMetaCampaignPlan } from '../../supabase/functions/_shared/atlasMetaCampaign.js';

const accountId = 'act_123456789', pageId = '22222222', hash = 'a'.repeat(32), postId = `${pageId}_33333333`;
const now = '2026-11-12T12:00:00Z';
const source = (currency = 'BRL') => ({ accountId, currency, now, authorizedAssets: { account_id: accountId,
  pages: [{ id: pageId, source: 'promote_pages', can_advertise: true }], images: [{ hash, account_id: '123456789', status: 'ACTIVE' }],
  posts: [{ id: postId, page_id: pageId, url: 'https://example.test/oferta', promotable: true }] } });
function input() {
  return { campaign_name: 'Campanha São João', adset_name: 'Público BR', creative_name: 'Imagem Café', ad_name: 'Oferta café', objective: 'OUTCOME_TRAFFIC',
    special_category: 'none', budget: { type: 'daily', amount: '10.50' }, countries: ['BR'], age_min: 25, age_max: 65, gender: 'all',
    start_time: '2026-12-01T12:00:00-03:00', end_time: '2026-12-15T12:00:00-03:00',
    creative: { mode: 'image', page_id: pageId, image_hash: hash, url: 'https://example.test/oferta?utm_source=meta', message: 'Café para você ☕', headline: 'Conheça a oferta', description: 'Confira os detalhes', call_to_action: 'LEARN_MORE' } };
}
function fixture(plan, overrides = {}) {
  const calls = [], rows = new Map(), finished = [], ids = { campaign: '1001', adset: '1002', creative: '1003', ad: '1004' };
  const requestById = new Map();
  const options = { plan,
    async reserveStep({ step, request }) {
      const row = rows.get(step);
      if (row) { assert.deepEqual(row.request, request); return { ...row, claimed: false }; }
      const claimed = { state: 'reserved', lease: `lease-${step}`, request }; rows.set(step, claimed); return { ...claimed, claimed: true };
    },
    async finishStep({ step, lease, ...result }) {
      assert.equal(lease, `lease-${step}`); finished.push({ step, ...result });
      const row = { ...rows.get(step), ...result }; rows.set(step, row); return row;
    },
    async callGraph(request) {
      calls.push(request);
      if (overrides.callGraph) return overrides.callGraph(request, calls.length);
      if (request.method === 'POST') {
        const step = { campaigns: 'campaign', adsets: 'adset', adcreatives: 'creative', ads: 'ad' }[request.path.split('/').at(-1)];
        requestById.set(ids[step], { step, body: request.body }); return { ok: true, status: 200, data: { id: ids[step] } };
      }
      const id = request.path.split('/').at(-1), saved = requestById.get(id);
      assert.ok(saved, 'Releitura só pode usar ID recebido da criação.');
      return { ok: true, status: 200, data: { id, account_id: '123456789', ...(saved.step !== 'creative' && { status: 'PAUSED' }),
        ...(saved.step === 'campaign' && { objective: 'OUTCOME_TRAFFIC' }), ...(saved.step === 'adset' && { campaign_id: ids.campaign }), ...(saved.step === 'ad' && { adset_id: ids.adset, creative: { id: ids.creative } }) } };
    },
  };
  return { options, calls, rows, finished, ids };
}

test('plano usa a moeda da conta, valores decimais exatos e prévia das quatro criações pausadas', () => {
  const plan = validateMetaCampaignPlan(input(), source());
  assert.equal(plan.api_version, 'v25.0'); assert.equal(plan.account_id, accountId); assert.equal(plan.currency, 'BRL');
  assert.equal(plan.budget_minor, '1050'); assert.equal(plan.currency_offset, 100);
  assert.equal(plan.preview.starts_delivery, false); assert.equal(plan.preview.entities.length, 4);
  assert.ok(plan.preview.entities.filter(row => row.type !== 'creative').every(row => row.status === 'PAUSED'));
  assert.equal(plan.input.creative.message, 'Café para você ☕');
  assert.equal(JSON.stringify(plan).includes('access_token'), false);
});

test('offsets Meta diferenciam moedas sem subunidades e não assumem as casas ISO', () => {
  const yen = input(); yen.budget.amount = '1500'; assert.equal(validateMetaCampaignPlan(yen, source('JPY')).budget_minor, '1500');
  yen.budget.amount = '1.50'; assert.throws(() => validateMetaCampaignPlan(yen, source('JPY')));
  const bhd = input(); bhd.budget.amount = '1.25'; assert.equal(validateMetaCampaignPlan(bhd, source('BHD')).budget_minor, '125');
  const brl = input(); brl.budget.amount = '0.29'; assert.equal(validateMetaCampaignPlan(brl, source()).budget_minor, '29');
  brl.budget.amount = '1,25'; assert.equal(validateMetaCampaignPlan(brl, source()).budget_minor, '125');
});

test('objetivos e categorias sem implementação declaram lacunas e campos condicionais', () => {
  for (const objective of ['OUTCOME_LEADS', 'OUTCOME_SALES', 'OUTCOME_ENGAGEMENT']) {
    const data = input(); data.objective = objective;
    assert.throws(() => validateMetaCampaignPlan(data, source()), error => error.code === 'META_OBJECTIVE_UNSUPPORTED' && error.message.length > 30);
  }
  const data = input(); data.special_category = 'housing';
  assert.throws(() => validateMetaCampaignPlan(data, source()), error => error.code === 'META_CATEGORY_UNSUPPORTED');
  const lifetime = input(); lifetime.budget.type = 'lifetime'; delete lifetime.end_time;
  assert.throws(() => validateMetaCampaignPlan(lifetime, source()), /fim|end_time/i);
});

test('escopo, IDs, URL Graph, dinheiro ambíguo e campos desconhecidos não entram no plano', () => {
  const mutations = [data => { data.account_id = 'act_999'; }, data => { data.status = 'ACTIVE'; }, data => { data.campaign_id = '999'; },
    data => { data.creative.page_id = '../me'; }, data => { data.creative.url = 'javascript:alert(1)'; }, data => { data.creative.url = 'https://user:pass@example.test'; },
    data => { data.creative.url = 'https://127.0.0.1/admin'; }, data => { data.creative.image_url = 'https://outside.test/pixel'; },
    data => { data.budget.amount = '1e3'; }, data => { data.budget.amount = 19.99; }, data => { data.budget.amount = '-1'; },
    data => { data.budget.amount = '999999999999999999999999999'; }, data => { data.budget.amount = '0'; },
    data => { data.currency = 'USD'; }, data => { data.age_min = 17; }, data => { data.age_max = 24; }, data => { data.countries = ['../me']; }];
  for (const mutate of mutations) { const data = input(); mutate(data); assert.throws(() => validateMetaCampaignPlan(data, source())); }
});

test('Página, imagem e post precisam de provas da conta vindas do servidor', () => {
  for (const mutate of [proof => { proof.authorizedAssets.account_id = 'act_999'; }, proof => { proof.authorizedAssets.pages[0].can_advertise = false; },
    proof => { proof.authorizedAssets.pages[0].source = 'user_payload'; }, proof => { proof.authorizedAssets.images[0].account_id = '999'; }, proof => { proof.authorizedAssets.images[0].status = 'DELETED'; }]) {
    const proof = source(); mutate(proof); assert.throws(() => validateMetaCampaignPlan(input(), proof));
  }
  const data = input(); data.creative = { mode: 'post', page_id: pageId, post_id: postId };
  const valid = validateMetaCampaignPlan(data, source()); assert.equal(valid.input.creative.post_id, postId);
  const proof = source(); proof.authorizedAssets.posts[0].page_id = '999'; assert.throws(() => validateMetaCampaignPlan(data, proof));
  data.creative.tasks = ['ADVERTISE']; assert.throws(() => validateMetaCampaignPlan(data, source()));
});

test('execução cria quatro entidades, relê propriedade/estado e usa somente IDs dos recibos', async () => {
  const plan = validateMetaCampaignPlan(input(), source()), f = fixture(plan), result = await executeMetaCampaignPlan(f.options);
  assert.equal(result.state, 'completed'); assert.equal(result.starts_delivery, false);
  const posts = f.calls.filter(row => row.method === 'POST');
  assert.deepEqual(posts.map(row => row.path), ['/v25.0/act_123456789/campaigns', '/v25.0/act_123456789/adsets', '/v25.0/act_123456789/adcreatives', '/v25.0/act_123456789/ads']);
  assert.equal(posts[0].body.status, 'PAUSED'); assert.equal(posts[0].body.is_adset_budget_sharing_enabled, false);
  assert.equal(posts[1].body.status, 'PAUSED'); assert.equal(posts[1].body.campaign_id, '1001'); assert.equal(posts[1].body.daily_budget, '1050');
  assert.deepEqual(posts[1].body.targeting.publisher_platforms, ['facebook']); assert.deepEqual(posts[1].body.targeting.facebook_positions, ['feed']);
  assert.equal(posts[1].body.targeting.targeting_automation.advantage_audience, 0);
  assert.equal(posts[2].body.object_story_spec.page_id, pageId); assert.equal(posts[2].body.object_story_spec.link_data.image_hash, hash);
  assert.equal(posts[3].body.status, 'PAUSED'); assert.equal(posts[3].body.adset_id, '1002'); assert.deepEqual(posts[3].body.creative, { creative_id: '1003' });
  assert.deepEqual(result.entities, { campaign_id: '1001', adset_id: '1002', creative_id: '1003', ad_id: '1004' });
  assert.equal(f.calls.filter(row => row.method === 'GET').length, 4); assert.ok(f.finished.every(row => row.receipt.verified === true));
});

test('post existente reutiliza object_story_id sem editar ou publicar outro conteúdo', async () => {
  const data = input(); data.creative = { mode: 'post', page_id: pageId, post_id: postId };
  const f = fixture(validateMetaCampaignPlan(data, source())); await executeMetaCampaignPlan(f.options);
  const request = f.calls.find(row => row.path.endsWith('/adcreatives') && row.method === 'POST');
  assert.deepEqual(request.body, { name: 'Imagem Café', object_story_id: postId });
});

test('retomada e duplo clique reaproveitam recibos concluídos e não repetem POST', async () => {
  const f = fixture(validateMetaCampaignPlan(input(), source()));
  const first = await executeMetaCampaignPlan(f.options), count = f.calls.length;
  const replay = await executeMetaCampaignPlan(f.options);
  assert.equal(replay.state, 'completed'); assert.deepEqual(replay.entities, first.entities); assert.equal(f.calls.length, count);
  const busy = fixture(validateMetaCampaignPlan(input(), source())); busy.rows.set('campaign', { state: 'reserved', request: { method: 'POST', path: '/v25.0/act_123456789/campaigns', body: { name: 'Campanha São João', objective: 'OUTCOME_TRAFFIC', buying_type: 'AUCTION', special_ad_categories: [], is_adset_budget_sharing_enabled: false, status: 'PAUSED' } } });
  const waiting = await executeMetaCampaignPlan(busy.options); assert.equal(waiting.state, 'pending'); assert.equal(busy.calls.length, 0);
});

test('erro Graph explícito em HTTP200 falha e mantém campanha já criada sem repetição', async () => {
  const f = fixture(validateMetaCampaignPlan(input(), source())); const original = f.options.callGraph;
  f.options.callGraph = async request => request.method === 'POST' && request.path.endsWith('/adsets') ? { ok: true, status: 200, data: { error: { code: 100, message: 'access_token=segredo-nao-retornar' } } } : original(request);
  const result = await executeMetaCampaignPlan(f.options);
  assert.equal(result.state, 'failed'); assert.equal(result.entities.campaign_id, '1001'); assert.equal(result.entities.adset_id, undefined);
  assert.ok(!JSON.stringify(result).includes('segredo-nao-retornar'));
  const count = f.calls.length; await executeMetaCampaignPlan(f.options); assert.equal(f.calls.length, count);
});

test('timeout, 5xx, id inválido e releitura divergente ficam incertos sem POST automático', async () => {
  for (const mode of ['timeout', 'server', 'bad-id', 'wrong-account', 'active']) {
    const f = fixture(validateMetaCampaignPlan(input(), source())); const original = f.options.callGraph;
    f.options.callGraph = async request => {
      if (mode === 'timeout') throw Error('token=segredo');
      if (mode === 'server') return { ok: false, status: 503, data: { error: { code: 2 } } };
      if (mode === 'bad-id') return { ok: true, status: 200, data: { id: '../me' } };
      if (request.method === 'GET') { const result = await original(request); if (mode === 'wrong-account') result.data.account_id = '999'; else result.data.status = 'ACTIVE'; return result; }
      return original(request);
    };
    const result = await executeMetaCampaignPlan(f.options); assert.equal(result.state, 'uncertain', mode);
    const count = f.calls.length; await executeMetaCampaignPlan(f.options); assert.equal(f.calls.length, count, mode);
    assert.ok(!JSON.stringify(result).includes('segredo'));
  }
});

test('perda da persistência após criação interrompe etapas seguintes sem fingir recibo durável', async () => {
  const f = fixture(validateMetaCampaignPlan(input(), source())); f.options.finishStep = async () => { throw Error('DB indisponível'); };
  const result = await executeMetaCampaignPlan(f.options); assert.equal(result.state, 'uncertain');
  assert.equal(f.calls.filter(row => row.method === 'POST').length, 1);
  await executeMetaCampaignPlan(f.options); assert.equal(f.calls.filter(row => row.method === 'POST').length, 1);
});

test('plano adulterado, recibo forjado e aborto não enviam criação', async () => {
  const plan = validateMetaCampaignPlan(input(), source());
  plan.path = '/v25.0/me'; const bad = fixture(plan); await assert.rejects(executeMetaCampaignPlan(bad.options)); assert.equal(bad.calls.length, 0);
  const clean = validateMetaCampaignPlan(input(), source()), f = fixture(clean);
  f.options.reserveStep = async () => ({ claimed: false, state: 'completed', receipt: { id: '../me', account_id: accountId, step: 'campaign', verified: true } });
  await assert.rejects(executeMetaCampaignPlan(f.options)); assert.equal(f.calls.length, 0);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(executeMetaCampaignPlan({ ...fixture(clean).options, signal: controller.signal }));
});

test('datas civis inválidas não são normalizadas silenciosamente para outro dia', () => {
  const start = input(); start.start_time = '2027-02-30T12:00:00Z'; start.end_time = '2027-03-05T12:00:00Z';
  assert.throws(() => validateMetaCampaignPlan(start, source()));
  const end = input(); end.start_time = '2027-02-20T12:00:00Z'; end.end_time = '2027-02-29T12:00:00Z';
  assert.throws(() => validateMetaCampaignPlan(end, source()));
});

test('retomada incerta preserva ID conhecido para reconciliação somente por leitura', async () => {
  const f = fixture(validateMetaCampaignPlan(input(), source())); const original = f.options.callGraph;
  f.options.callGraph = async request => { if (request.method === 'GET') throw Error('Leitura indisponível'); return original(request); };
  const first = await executeMetaCampaignPlan(f.options), count = f.calls.length;
  assert.deepEqual(first.pending_receipt, { id: '1001', account_id: accountId, step: 'campaign', verified: false });
  const replay = await executeMetaCampaignPlan(f.options);
  assert.deepEqual(replay.pending_receipt, first.pending_receipt); assert.equal(f.calls.length, count);
});

test('duas execuções simultâneas clamam cada etapa uma vez e moeda total/gênero seguem plano', async () => {
  const data = input(); data.budget = { type: 'lifetime', amount: '100.01' }; data.gender = 'women';
  const f = fixture(validateMetaCampaignPlan(data, source()));
  const results = await Promise.all([executeMetaCampaignPlan(f.options), executeMetaCampaignPlan(f.options)]);
  assert.deepEqual(results.map(result => result.state).sort(), ['completed', 'pending']);
  const posts = f.calls.filter(row => row.method === 'POST'); assert.equal(posts.length, 4);
  assert.equal(posts[1].body.lifetime_budget, '10001'); assert.equal(posts[1].body.daily_budget, undefined); assert.deepEqual(posts[1].body.targeting.genders, [2]);
});

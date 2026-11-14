import { AtlasError } from './atlasCore.js';
import { META_CAMPAIGN_API_VERSION, validateMetaCampaignPlan } from './atlasMetaCampaign.js';
import { requireMetaCampaignScope } from './metaWriteAuthorization.js';

const GRAPH = 'https://graph.facebook.com';
const MAX_PAGES = 3, PAGE_SIZE = 50;
const HUMAN_FIELDS = ['campaign_name', 'adset_name', 'creative_name', 'ad_name', 'objective', 'special_category', 'budget', 'currency', 'countries', 'age_min', 'age_max', 'gender', 'start_time', 'end_time', 'creative'];
const READ_FIELDS = ['account_id', 'page_id', 'image_hash', 'post_id'];
const POST_FIELDS = 'id,from,message,is_eligible_for_promotion,promotable_id,attachments{unshimmed_url,media_type}';
const POST_EDGES = ['campaigns', 'adsets', 'adcreatives', 'ads'];
const ID = /^[1-9]\d{0,29}$/, HASH = /^[a-f\d]{32}$/i;
const fail = (message, code = 'META_CAMPAIGN_INPUT', status = 400) => { throw new AtlasError(code, message, status); };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const keys = (value, allowed) => { if (!object(value) || Object.keys(value).some(key => !allowed.includes(key))) fail('O pedido contém campos não permitidos para esta criação Meta.'); };
const account = value => typeof value === 'string' && /^(act_)?[1-9]\d{0,29}$/.test(value) ? `act_${value.replace(/^act_/, '')}` : null;
const sourceFail = message => fail(message || 'A fonte atual da Meta está indisponível. Confira a conta e os ativos no Gestor de Tráfego.', 'META_CREATION_SOURCE', 502);
const proofFail = () => sourceFail('A permissão atual de anunciar pela Página não foi comprovada. Confira o acesso à Página no Meta Business Suite e no Gestor de Tráfego.');
const links = (clientId, accountId) => [{ label: 'Abrir Gestor de Tráfego', href: `/gestor-ia/clientes/${encodeURIComponent(clientId)}?conta=${encodeURIComponent(accountId)}` }];
const canonical = value => Array.isArray(value) ? value.map(canonical) : object(value) ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const same = (left, right) => JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));

async function graphResponse(graphFetch, url, options, signals, milliseconds) {
  const controller = new AbortController(), listeners = [];
  const timer = setTimeout(() => controller.abort(new Error('meta_deadline')), milliseconds);
  try {
    for (const signal of signals.filter(Boolean)) {
      const cancel = () => controller.abort(signal.reason);
      if (signal.aborted) cancel();
      else { signal.addEventListener('abort', cancel, { once: true }); listeners.push([signal, cancel]); }
    }
    controller.signal.throwIfAborted();
    const response = await graphFetch(url, { ...options, signal: controller.signal });
    return { ok: response.ok, status: response.status, data: await response.json() };
  } finally { clearTimeout(timer); for (const [signal, cancel] of listeners) signal.removeEventListener('abort', cancel); }
}

export const EXECUTOR_META_CAMPAIGN_CATALOG = Object.freeze([
  { app: 'gestor', mode: 'read', name: 'meta_creation_assets', title: 'Consultar ativos para campanha Meta', fields: READ_FIELDS, required: ['account_id'],
    description: 'Conta Meta vinculada exata, moeda, Páginas e imagens atuais. Informe page_id escolhido para provar permissão atual de anunciar e consultar posts; image_hash/post_id restringem a seleção exata. Até três páginas de 50 registros por fonte; cobertura explícita. Não escolhe o primeiro ativo.' },
  { app: 'gestor', mode: 'write', name: 'create_meta_campaign', title: 'Criar campanha Meta pausada', fields: ['account_id', ...HUMAN_FIELDS], required: ['account_id', 'campaign_name', 'adset_name', 'creative_name', 'ad_name', 'objective', 'special_category', 'budget', 'countries', 'start_time', 'creative'],
    description: 'Primeiro consulte meta_creation_assets. Cobertura inicial: Tráfego/OUTCOME_TRAFFIC para Website, Facebook Feed, clique no link, audiência manual; categoria explícita none. budget={type:daily|lifetime,amount:texto decimal}, lifetime exige end_time. creative=image com page_id,image_hash,url,message,headline; ou post com page_id,post_id. Identidades e moeda são conferidas no servidor; nenhuma prova, token ou Graph JSON é aceito. Cria campanha/conjunto/criativo/anúncio pausados; ativação separada. Leads, vendas, WhatsApp, Instagram, categorias especiais e uploads não estão implementados.' },
]);

function selection(input, writing = false) {
  keys(input, writing ? ['account_id', ...HUMAN_FIELDS] : READ_FIELDS);
  const accountId = account(input.account_id);
  if (!accountId) fail('Escolha a conta Meta vinculada exata.');
  const creative = writing ? input.creative : input;
  if (writing) {
    keys(creative, creative?.mode === 'image' ? ['mode', 'page_id', 'image_hash', 'url', 'message', 'headline', 'description', 'call_to_action'] : ['mode', 'page_id', 'post_id']);
    if (!['image', 'post'].includes(creative.mode)) fail('Escolha imagem da conta ou post existente.');
  }
  const pageId = creative.page_id, imageHash = creative.image_hash, postId = creative.post_id;
  if (pageId != null && (typeof pageId !== 'string' || !ID.test(pageId)) || writing && !pageId) fail('Escolha a Página exata por identificação válida.');
  if (imageHash != null && (typeof imageHash !== 'string' || !HASH.test(imageHash))) fail('Escolha o hash exato da imagem da conta.');
  if (postId != null && (typeof postId !== 'string' || !pageId || !new RegExp(`^${pageId}_[1-9]\\d{0,29}$`).test(postId))) fail('Escolha o post exato pertencente à Página.');
  return { accountId, pageId, imageHash, postId };
}

async function authorized(caller, scope, selected, deps) {
  const request = deps.request || (typeof deps.requestAuthorization === 'string' ? { headers: new Headers({ Authorization: deps.requestAuthorization }) } : null);
  if (!request?.headers || !caller || typeof deps.readToken !== 'function' || typeof deps.graphFetch !== 'function') fail('A integração autenticada de criação Meta está indisponível.', 'META_CREATION_UNAVAILABLE', 503);
  scope.signal?.throwIfAborted();
  await requireMetaCampaignScope({ request, body: { cliente_id: scope.clientId, adAccountId: selected.accountId }, caller });
  scope.signal?.throwIfAborted();
  const token = await deps.readToken();
  if (typeof token !== 'string' || !token) fail('Credencial Meta indisponível no servidor.', 'META_CREATION_UNAVAILABLE', 503);
  const clean = value => typeof value === 'string' ? value.split(token).join('[segredo removido]').replace(/[\u0000-\u001f]/g, ' ').slice(0, 200) : '';
  const get = async (path, query) => {
    scope.signal?.throwIfAborted();
    await requireMetaCampaignScope({ request, body: { cliente_id: scope.clientId, adAccountId: selected.accountId }, caller });
    scope.signal?.throwIfAborted();
    let response;
    try {
      response = await graphResponse(deps.graphFetch, `${GRAPH}/${META_CAMPAIGN_API_VERSION}/${path}?${new URLSearchParams(query)}`, { method: 'GET', headers: { Authorization: `Bearer ${token}` }, redirect: 'error' }, [scope.signal], 10000);
    } catch { sourceFail(); }
    if (!response.ok || response.data?.error || !object(response.data)) sourceFail();
    return response.data;
  };
  return { token, get, clean };
}

async function pageList(get, path, query = {}) {
  const rows = [], seen = new Set(); let after, complete = true, pages = 0;
  for (; pages < MAX_PAGES;) {
    const data = await get(path, { ...query, limit: String(PAGE_SIZE), ...(after && { after }) }); pages++;
    if (!Array.isArray(data.data) || data.data.length > PAGE_SIZE) sourceFail();
    rows.push(...data.data);
    if (!data.paging?.next) { complete = true; break; }
    complete = false;
    const cursor = data.paging?.cursors?.after;
    if (typeof cursor !== 'string' || !cursor || cursor.length > 2048 || seen.has(cursor)) break;
    seen.add(cursor); after = cursor;
  }
  return { rows, coverage: { pages, complete, returned: rows.length } };
}
function postAsset(row, pageId, clean) {
  if (!object(row) || !new RegExp(`^${pageId}_[1-9]\\d{0,29}$`).test(row.id || '') || row.from?.id !== pageId || row.is_eligible_for_promotion !== true || row.promotable_id !== row.id) return null;
  const attachments = row.attachments?.data;
  if (!Array.isArray(attachments) || attachments.length !== 1 || attachments[0].media_type !== 'link') return null;
  let url;
  try { url = new URL(attachments[0].unshimmed_url); } catch { return null; }
  if (url.protocol !== 'https:' || url.username || url.password || !url.hostname.includes('.') || /^[\d.]+$/.test(url.hostname) || url.hostname.includes(':') || /(^|\.)(local|localhost|internal)$/.test(url.hostname) || url.hostname === 'graph.facebook.com' || [...url.searchParams.keys()].some(key => /token|password|senha|secret|api.?key/i.test(key))) return null;
  return { id: row.id, page_id: pageId, url: url.toString(), promotable: true, ...(row.message && { message: clean(row.message) }) };
}

async function loadAssets(caller, scope, selected, deps) {
  const auth = await authorized(caller, scope, selected, deps), { get, clean } = auth;
  const current = await get(selected.accountId, { fields: 'id,account_id,name,currency,account_status,user_tasks' });
  if (account(current.id) !== selected.accountId || account(current.account_id) !== selected.accountId || current.account_status !== 1 || !Array.isArray(current.user_tasks) || !current.user_tasks.some(task => ['ADVERTISE', 'MANAGE'].includes(task)) || typeof current.currency !== 'string' || !/^[A-Z]{3}$/.test(current.currency)) sourceFail('A conta, moeda ou permissão atual de anunciar na Meta não foi comprovada. Confira a conta no Gestor de Tráfego.');
  const pagesSource = await pageList(get, `${selected.accountId}/promote_pages`, { fields: 'id,name' });
  const pages = [...new Map(pagesSource.rows.filter(row => ID.test(row?.id || '')).map(row => [row.id, { id: row.id, name: clean(row.name), source: 'promote_pages', can_advertise: false }])).values()];
  let posts = [], postsCoverage = { pages: 0, complete: false, returned: 0, reason: 'Escolha page_id para conferir a permissão atual e os posts da Página.' };
  if (selected.pageId) {
    const page = pages.find(row => row.id === selected.pageId);
    if (!page) proofFail();
    let postSource;
    // The documented ads_posts edge requires the current ADVERTISE task, unlike historical promote_pages membership.
    try { postSource = await pageList(get, `${selected.pageId}/ads_posts`, { fields: POST_FIELDS }); } catch { proofFail(); }
    page.can_advertise = true;
    posts = postSource.rows.map(row => postAsset(row, selected.pageId, clean)).filter(Boolean);
    postsCoverage = { ...postSource.coverage, supported: posts.length, limitation: 'Somente post elegível de link HTTPS, com promotable_id igual ao ID; remapeamento de post e outros formatos exigem outro contrato.' };
    if (selected.postId) { posts = posts.filter(row => row.id === selected.postId); if (posts.length !== 1) sourceFail('O post selecionado não foi encontrado com elegibilidade, Página e destino website comprovados nesta cobertura. Confira o post no Gestor de Anúncios.'); }
  }
  const imagesSource = await pageList(get, `${selected.accountId}/adimages`, { fields: 'hash,account_id,status,name', ...(selected.imageHash && { hashes: JSON.stringify([selected.imageHash]) }) });
  const images = imagesSource.rows.filter(row => row?.hash && HASH.test(row.hash) && account(row.account_id) === selected.accountId && row.status === 'ACTIVE' && (!selected.imageHash || row.hash === selected.imageHash)).map(row => ({ hash: row.hash, account_id: selected.accountId, status: 'ACTIVE', name: clean(row.name) }));
  if (selected.imageHash && images.length !== 1) sourceFail('A imagem selecionada não foi comprovada como ativa e pertencente à conta Meta.');
  return { auth, account: { id: selected.accountId, name: clean(current.name), currency: current.currency }, pages, images, posts,
    coverage: { max_pages: MAX_PAGES, page_size: PAGE_SIZE, pages: pagesSource.coverage, images: imagesSource.coverage, posts: postsCoverage } };
}

export async function readExecutorMetaCampaign(caller, { clientId, view, input = {}, signal }, deps = {}) {
  if (view !== 'meta_creation_assets') fail('Esta consulta Meta não está disponível.', 'TOOL_DENIED', 403);
  const selected = selection(input), queriedAt = new Date(deps.now || Date.now()).toISOString();
  try {
    const source = await loadAssets(caller, { clientId, signal }, selected, deps);
    return { app: 'gestor', view, client_id: clientId, queried_at: queriedAt, available: true, data: { account: source.account, pages: source.pages, images: source.images, posts: source.posts }, coverage: source.coverage, links: links(clientId, selected.accountId) };
  } catch (error) {
    if (error.code !== 'META_CREATION_SOURCE' && error.code !== 'META_CREATION_UNAVAILABLE') throw error;
    return { app: 'gestor', view, client_id: clientId, queried_at: queriedAt, available: false, data: { reason: error.message }, links: links(clientId, selected.accountId) };
  }
}

export async function prepareExecutorMetaCampaign(caller, { clientId, action, input = {}, signal }, deps = {}) {
  if (action !== 'create_meta_campaign') fail('Esta criação Meta não está disponível.', 'TOOL_DENIED', 403);
  const selected = selection(input, true), source = await loadAssets(caller, { clientId, signal }, selected, deps);
  const { account_id: _account, ...human } = input;
  const plan = validateMetaCampaignPlan(human, { accountId: selected.accountId, currency: source.account.currency, authorizedAssets: { account_id: selected.accountId, pages: source.pages, images: source.images, posts: source.posts }, now: deps.now || Date.now() });
  const before = { conta: source.account.name || selected.accountId, moeda: source.account.currency, novas_entidades: 0 };
  const after = { conta: before.conta, objetivo: 'Tráfego para website', entrega: 'Pausada', orcamento: { valor: plan.input.budget.amount, moeda: plan.currency, periodo: plan.input.budget.type === 'daily' ? 'Diário' : 'Total do período' },
    publico: { paises: plan.input.countries, idade_minima: plan.input.age_min, idade_maxima: plan.input.age_max, genero: { all: 'Todos', men: 'Homens', women: 'Mulheres' }[plan.input.gender], posicionamento: 'Feed do Facebook' },
    inicio: plan.input.start_time, fim: plan.input.end_time || null, pagina: source.pages.find(row => row.id === selected.pageId)?.name || selected.pageId,
    criativo: plan.input.creative.mode === 'image' ? { formato: 'Imagem existente da conta', texto: plan.input.creative.message, titulo: plan.input.creative.headline, destino: plan.input.creative.url } : { formato: 'Post existente da Página', identificacao: plan.input.creative.post_id, destino: plan.assets.posts[0].url },
    criacoes: plan.preview.entities.map(row => ({ tipo: { campaign: 'Campanha', adset: 'Conjunto', creative: 'Criativo', ad: 'Anúncio' }[row.type], nome: row.name, entrega: row.type === 'creative' ? 'Sem entrega própria' : 'Pausada' })), observacao: plan.preview.cost };
  return { app: 'gestor', action, client_id: clientId, title: `Criar campanha pausada: ${plan.input.campaign_name}`, description: 'Cria campanha, conjunto, criativo e anúncio na conta Meta escolhida. A entrega fica pausada; ativação exige outra aprovação.',
    effect: { type: 'advertising_creation', external: true, enables_autonomy: false, starts_delivery: false, cost: plan.preview.cost }, payload: { plan }, before: { account: source.account, assets_checked_at: plan.prepared_at, coverage: source.coverage }, preview: { before, after }, links: links(clientId, selected.accountId) };
}

function approvedBody(plan, edge, body) {
  const input = plan.input, creative = input.creative;
  if (edge === 'campaigns') return { name: input.campaign_name, objective: 'OUTCOME_TRAFFIC', buying_type: 'AUCTION', special_ad_categories: [], is_adset_budget_sharing_enabled: false, status: 'PAUSED' };
  if (edge === 'adsets') {
    if (typeof body.campaign_id !== 'string' || !ID.test(body.campaign_id)) return null;
    return { name: input.adset_name, campaign_id: body.campaign_id, [`${input.budget.type}_budget`]: plan.budget_minor, optimization_goal: 'LINK_CLICKS', billing_event: 'IMPRESSIONS', bid_strategy: 'LOWEST_COST_WITHOUT_CAP', destination_type: 'WEBSITE',
      targeting: { geo_locations: { countries: input.countries }, age_min: input.age_min, age_max: input.age_max, publisher_platforms: ['facebook'], facebook_positions: ['feed'], targeting_automation: { advantage_audience: 0 }, ...(input.gender !== 'all' && { genders: [input.gender === 'men' ? 1 : 2] }) },
      start_time: input.start_time, ...(input.end_time && { end_time: input.end_time }), status: 'PAUSED' };
  }
  if (edge === 'adcreatives') return creative.mode === 'post' ? { name: input.creative_name, object_story_id: creative.post_id } : { name: input.creative_name, object_story_spec: { page_id: creative.page_id, link_data: { image_hash: creative.image_hash, link: creative.url, message: creative.message, name: creative.headline, ...(creative.description != null && { description: creative.description }), call_to_action: { type: creative.call_to_action, value: { link: creative.url } } } } };
  if (typeof body.adset_id !== 'string' || !ID.test(body.adset_id) || !object(body.creative) || typeof body.creative.creative_id !== 'string' || !ID.test(body.creative.creative_id)) return null;
  return { name: input.ad_name, adset_id: body.adset_id, creative: { creative_id: body.creative.creative_id }, status: 'PAUSED' };
}

async function checkedPlan(caller, { clientId, plan, signal }, deps, requireFuture = true) {
  if (!object(plan) || plan.kind !== 'meta_campaign_v1' || plan.api_version !== META_CAMPAIGN_API_VERSION || !object(plan.input)) fail('O plano Meta aprovado está inválido.');
  const selected = selection({ account_id: plan.account_id, ...plan.input }, true), source = await loadAssets(caller, { clientId, signal }, selected, deps);
  const rebuilt = validateMetaCampaignPlan(plan.input, { accountId: selected.accountId, currency: source.account.currency, authorizedAssets: { account_id: selected.accountId, pages: source.pages, images: source.images, posts: source.posts }, now: plan.prepared_at });
  if (!same(plan, rebuilt) || requireFuture && Date.parse(plan.input.start_time) <= new Date(deps.now || Date.now()).getTime()) fail('A conta, ativos, moeda ou programação mudaram. Prepare outra proposta antes de criar.', 'META_PLAN_STALE', 409);
  return { selected, source, rebuilt };
}

/** Only the typed planner and receipt ledger may call this token-bound transport. */
export async function createMetaCampaignTransport(caller, { clientId, plan, signal }, deps = {}) {
  const { selected, source, rebuilt } = await checkedPlan(caller, { clientId, plan, signal }, deps);
  const returnedIds = new Set();
  return async ({ method, path, body, query, signal: callSignal }) => {
    const posted = POST_EDGES.some(edge => path === `/${META_CAMPAIGN_API_VERSION}/${selected.accountId}/${edge}`);
    if (method === 'POST' ? !posted || !object(body) || !same(body, approvedBody(rebuilt, path.split('/').at(-1), body)) || query != null
      : method !== 'GET' || !returnedIds.has(path?.split('/').at(-1)) || path !== `/${META_CAMPAIGN_API_VERSION}/${path?.split('/').at(-1)}` || body != null || !object(query) || Object.keys(query).some(key => key !== 'fields') || typeof query.fields !== 'string' || !/^[a-z_,{}]+$/.test(query.fields)) fail('O transporte Meta recebeu caminho ou campos não autorizados.', 'META_TRANSPORT_DENIED', 403);
    signal?.throwIfAborted(); callSignal?.throwIfAborted();
    const response = await graphResponse(deps.graphFetch, `${GRAPH}${path}${method === 'GET' ? `?${new URLSearchParams(query)}` : ''}`, { method, headers: { Authorization: `Bearer ${source.auth.token}`, ...(method === 'POST' && { 'Content-Type': 'application/x-www-form-urlencoded' }) }, ...(method === 'POST' && { body: new URLSearchParams(Object.fromEntries(Object.entries(body).map(([key, value]) => [key, typeof value === 'object' ? JSON.stringify(value) : String(value)]))) }), redirect: 'error' }, [signal, callSignal], method === 'POST' ? 15000 : 10000);
    if (method === 'POST' && response.ok && !response.data?.error && ID.test(response.data?.id || '')) returnedIds.add(response.data.id);
    return response;
  };
}

/** receipt and receipts must come from the server ledger, never model input. This helper cannot POST. */
export async function reconcileMetaCampaignReceipt(caller, { clientId, plan, step, receipt, receipts = {}, signal }, deps = {}) {
  const steps = ['campaign', 'adset', 'creative', 'ad'];
  const valid = (row, name, verified) => object(row) && Object.keys(row).every(key => ['id', 'account_id', 'step', 'verified'].includes(key)) && typeof row.id === 'string' && ID.test(row.id) && row.account_id === plan?.account_id && row.step === name && row.verified === verified;
  if (!steps.includes(step) || !valid(receipt, step, false) || !object(receipts) || Object.keys(receipts).some(name => !steps.includes(name) || !valid(receipts[name], name, true))) fail('O recibo Meta conhecido não corresponde à etapa aprovada.');
  if (step === 'adset' && !receipts.campaign || step === 'ad' && (!receipts.adset || !receipts.creative)) fail('Os recibos das etapas anteriores são necessários para conferir esta criação.');
  const { source } = await checkedPlan(caller, { clientId, plan, signal }, deps, false);
  const fields = { campaign: 'id,account_id,status,objective', adset: 'id,account_id,status,campaign_id', creative: 'id,account_id', ad: 'id,account_id,status,adset_id,creative{id}' }[step];
  const uncertain = { state: 'uncertain', receipt: { ...receipt }, error: { code: 'META_RECONCILIATION_UNCONFIRMED', message: 'A criação conhecida não foi confirmada. Confira o objeto na Meta e preserve o recibo; nenhuma criação foi repetida.' } };
  let data;
  try { data = await source.auth.get(receipt.id, { fields }); } catch { return uncertain; }
  if (data.id !== receipt.id || account(data.account_id) !== plan.account_id || step !== 'creative' && data.status !== 'PAUSED' || step === 'campaign' && data.objective !== 'OUTCOME_TRAFFIC'
    || step === 'adset' && data.campaign_id !== receipts.campaign.id || step === 'ad' && (data.adset_id !== receipts.adset.id || data.creative?.id !== receipts.creative.id)) return uncertain;
  return { state: 'completed', receipt: { ...receipt, verified: true } };
}

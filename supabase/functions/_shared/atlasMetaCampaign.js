import { AtlasError } from './atlasCore.js';

export const META_CAMPAIGN_API_VERSION = 'v25.0';
const OFFSET_ONE = new Set('CLP COP CRC HUF ISK IDR JPY KRW PYG TWD VND'.split(' '));
const OFFSET_HUNDRED = new Set('AED ARS AUD BDT BGN BHD BOB BRL CAD CHF CNY CZK DKK DZD EGP EUR GBP GTQ HKD HNL HRK ILS INR JOD KES LKR LVL LTL MOP MXN MYR NGN NIO NOK NZD PEN PHP PKR PLN QAR RON RSD RUB SAR SEK SGD SKK THB TRY UAH USD UYU VEF VES ZAR FBZ'.split(' '));
const COUNTRIES = new Set('AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS XK YE YT ZA ZM ZW'.split(' '));
const INPUT_KEYS = ['campaign_name', 'adset_name', 'creative_name', 'ad_name', 'objective', 'special_category', 'budget', 'currency', 'countries', 'age_min', 'age_max', 'gender', 'start_time', 'end_time', 'creative'];
const PLAN_KEYS = ['kind', 'api_version', 'account_id', 'currency', 'currency_offset', 'budget_minor', 'input', 'assets', 'prepared_at', 'preview'];
const CTA = new Set(['LEARN_MORE', 'SHOP_NOW', 'SIGN_UP', 'CONTACT_US', 'GET_QUOTE', 'APPLY_NOW', 'BOOK_TRAVEL', 'DOWNLOAD']);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const fail = (message, code = 'META_PLAN_INVALID') => { throw new AtlasError(code, message); };
function keys(value, allowed) {
  if (!object(value) || Object.keys(value).some(key => !allowed.includes(key))) fail('O pedido possui campos que esta criação de anúncio não aceita.');
}
function text(value, label, max = 200) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /\b(?:Bearer\s+\S+|sk-[a-z0-9_-]{12,}|(?:access_token|senha|password|api.?key)\s*[:=]\s*\S+)/i.test(value)) fail(`Revise ${label}.`);
  return value.trim();
}
function entityId(value) {
  if (typeof value !== 'string' || !/^[1-9]\d{0,29}$/.test(value)) fail('A identificação do ativo Meta é inválida.');
  return value;
}
function account(value) {
  return `act_${entityId(typeof value === 'string' ? value.replace(/^act_/, '') : value)}`;
}
function website(value) {
  text(value, 'o endereço do site', 2048);
  let url;
  try { url = new URL(value); } catch { fail('Informe um endereço HTTPS válido para o site.'); }
  if (url.protocol !== 'https:' || url.username || url.password || !url.hostname.includes('.') || /(^|\.)(localhost|local|internal)$/.test(url.hostname)
    || /^[\d.]+$/.test(url.hostname) || url.hostname.includes(':') || url.hostname === 'graph.facebook.com'
    || [...url.searchParams.keys()].some(key => /token|password|senha|secret|api.?key/i.test(key))) fail('Use um site HTTPS público, sem credenciais no endereço.');
  return url.toString();
}
function timestamp(value, label) {
  if (typeof value !== 'string' || !/T.+(?:Z|[+-]\d{2}:\d{2})$/i.test(value) || !Number.isFinite(Date.parse(value))) fail(`Informe ${label} com data, horário e fuso.`);
  const date = value.slice(0, 10), civil = new Date(`${date}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(civil.getTime()) || civil.toISOString().slice(0, 10) !== date) fail(`A data de ${label} não existe no calendário.`);
  return value;
}
function money(value, offset) {
  if (typeof value === 'number' && !Number.isSafeInteger(value)) fail('Informe o orçamento decimal como texto para preservar o valor exato.');
  const amount = typeof value === 'string' || typeof value === 'number' ? String(value) : '';
  const match = /^(0|[1-9]\d{0,15})(?:[.,](\d{1,2}))?$/.exec(amount);
  if (!match || offset === 1 && match[2]) fail('Revise o orçamento e as subdivisões da moeda da conta.');
  const minor = BigInt(match[1]) * BigInt(offset) + BigInt(offset === 100 ? (match[2] || '').padEnd(2, '0') : '0');
  if (minor <= 0n || minor > BigInt(Number.MAX_SAFE_INTEGER)) fail('O orçamento está fora do intervalo permitido.');
  return { amount: amount.replace(',', '.'), minor: minor.toString() };
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (object(value)) return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
const same = (left, right) => JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));

export function validateMetaCampaignPlan(raw, { accountId, currency, authorizedAssets, now = Date.now() }) {
  keys(raw, INPUT_KEYS);
  const accountIdFixed = account(accountId);
  if (!object(authorizedAssets) || account(authorizedAssets.account_id) !== accountIdFixed) fail('Os ativos não foram conferidos para esta conta de anúncios.', 'META_ASSET_FORBIDDEN');
  if (typeof currency !== 'string' || !(OFFSET_ONE.has(currency) || OFFSET_HUNDRED.has(currency))) fail('A moeda da conta não tem conversão Meta conhecida.');
  if (raw.currency != null && raw.currency !== currency) fail('O orçamento deve usar a moeda atual da conta de anúncios.');
  if (raw.objective !== 'OUTCOME_TRAFFIC') {
    const needs = { OUTCOME_LEADS: 'Leads exige destino e formulário ou evento de conversão autorizados.', OUTCOME_SALES: 'Vendas exige pixel ou catálogo e evento de conversão autorizados.', OUTCOME_ENGAGEMENT: 'Engajamento exige destino e identidade de mensagens ou publicação compatíveis.' };
    fail(`${needs[raw.objective] || 'Esse objetivo exige outro contrato de criação.'} Esta etapa implementa somente tráfego para website.`, 'META_OBJECTIVE_UNSUPPORTED');
  }
  if (raw.special_category !== 'none') fail('Categorias especiais exigem segmentação e declarações próprias. Esta criação aceita somente a opção explícita sem categoria especial.', 'META_CATEGORY_UNSUPPORTED');
  keys(raw.budget, ['type', 'amount']);
  if (!['daily', 'lifetime'].includes(raw.budget.type)) fail('Escolha orçamento diário ou total do período.');
  const offset = OFFSET_ONE.has(currency) ? 1 : 100, amount = money(raw.budget.amount, offset);
  const input = Object.fromEntries(['campaign_name', 'adset_name', 'creative_name', 'ad_name'].map(key => [key, text(raw[key], 'os nomes da campanha e dos anúncios')]));
  Object.assign(input, { objective: 'OUTCOME_TRAFFIC', special_category: 'none', budget: { type: raw.budget.type, amount: amount.amount } });
  if (!Array.isArray(raw.countries) || !raw.countries.length || raw.countries.length > 25 || raw.countries.some(code => typeof code !== 'string' || !COUNTRIES.has(code)) || new Set(raw.countries).size !== raw.countries.length) fail('Escolha de um a 25 países válidos, sem repetição.');
  input.countries = [...raw.countries]; input.age_min = raw.age_min ?? 18; input.age_max = raw.age_max ?? 65; input.gender = raw.gender ?? 'all';
  if (!Number.isInteger(input.age_min) || !Number.isInteger(input.age_max) || input.age_min < 18 || input.age_max > 65 || input.age_min > input.age_max || !['all', 'men', 'women'].includes(input.gender)) fail('Revise idade e gênero do público.');
  const clock = new Date(now);
  if (!Number.isFinite(clock.getTime())) fail('O horário de preparação não pôde ser conferido.');
  input.start_time = timestamp(raw.start_time, 'o início');
  if (Date.parse(input.start_time) <= clock.getTime()) fail('Escolha um início futuro para a programação.');
  if (raw.end_time != null) input.end_time = timestamp(raw.end_time, 'o fim');
  if (raw.budget.type === 'lifetime' && !input.end_time) fail('Orçamento total exige data e horário de fim.');
  if (input.end_time && Date.parse(input.end_time) <= Date.parse(input.start_time)) fail('O fim deve ocorrer depois do início.');
  if (!object(raw.creative) || !['image', 'post'].includes(raw.creative.mode)) fail('Escolha imagem da conta ou post existente da Página.');
  const pageId = entityId(raw.creative.page_id);
  const page = authorizedAssets.pages?.find(row => row.id === pageId && row.source === 'promote_pages' && row.can_advertise === true);
  if (!page) fail('A permissão atual de anunciar por esta Página não foi comprovada na conta.', 'META_ASSET_FORBIDDEN');
  const assets = { account_id: accountIdFixed, pages: [{ id: pageId, source: 'promote_pages', can_advertise: true }] };
  if (raw.creative.mode === 'image') {
    keys(raw.creative, ['mode', 'page_id', 'image_hash', 'url', 'message', 'headline', 'description', 'call_to_action']);
    const hash = raw.creative.image_hash;
    if (typeof hash !== 'string' || !/^[a-f\d]{32}$/i.test(hash)) fail('Escolha uma imagem já cadastrada nesta conta.');
    const image = authorizedAssets.images?.find(row => row.hash === hash && account(row.account_id) === accountIdFixed && row.status === 'ACTIVE');
    if (!image) fail('A imagem não foi comprovada como ativa e pertencente à conta.', 'META_ASSET_FORBIDDEN');
    const cta = raw.creative.call_to_action || 'LEARN_MORE'; if (!CTA.has(cta)) fail('A chamada para ação escolhida não está disponível nesta criação.');
    input.creative = { mode: 'image', page_id: pageId, image_hash: hash, url: website(raw.creative.url), message: text(raw.creative.message, 'o texto do anúncio', 2000), headline: text(raw.creative.headline, 'o título do anúncio', 255),
      ...(raw.creative.description != null && { description: text(raw.creative.description, 'a descrição', 255) }), call_to_action: cta };
    assets.images = [{ hash, account_id: accountIdFixed, status: 'ACTIVE' }];
  } else {
    keys(raw.creative, ['mode', 'page_id', 'post_id']);
    const postId = raw.creative.post_id;
    if (typeof postId !== 'string' || !new RegExp(`^${pageId}_[1-9]\\d{0,29}$`).test(postId)) fail('O post deve pertencer à Página escolhida.');
    const post = authorizedAssets.posts?.find(row => row.id === postId && row.page_id === pageId && row.promotable === true);
    if (!post) fail('O post da Página não foi autorizado para reutilização.', 'META_ASSET_FORBIDDEN');
    input.creative = { mode: 'post', page_id: pageId, post_id: postId };
    assets.posts = [{ id: postId, page_id: pageId, url: website(post.url), promotable: true }];
  }
  const preview = { account_id: accountIdFixed, objective: 'Tráfego para website', starts_delivery: false,
    entities: [['campaign', input.campaign_name], ['adset', input.adset_name], ['creative', input.creative_name], ['ad', input.ad_name]].map(([type, name]) => ({ type, name, ...(type !== 'creative' && { status: 'PAUSED' }) })),
    budget: { type: input.budget.type, amount: input.budget.amount, currency, minor: amount.minor, offset },
    audience: { countries: input.countries, age_min: input.age_min, age_max: input.age_max, gender: input.gender, placement: 'Facebook Feed', expansion: false },
    start_time: input.start_time, end_time: input.end_time || null,
    creative: input.creative.mode === 'image' ? { ...input.creative } : { ...input.creative, url: assets.posts[0].url },
    effect: input.creative.mode === 'image' ? 'Cria um criativo e uma publicação não publicada da Página, usando a imagem já existente na conta.' : 'Cria um criativo que reutiliza o post existente, sem editar seu conteúdo.',
    cost: 'A criação permanece pausada. Ativar a entrega exige outra aprovação; orçamento diário admite a flexibilidade de gasto definida pela Meta.' };
  return { kind: 'meta_campaign_v1', api_version: META_CAMPAIGN_API_VERSION, account_id: accountIdFixed, currency, currency_offset: offset, budget_minor: amount.minor, input, assets, prepared_at: clock.toISOString(), preview };
}

function requestFor(plan, step, ids) {
  const input = plan.input, creative = input.creative;
  const targeting = { geo_locations: { countries: input.countries }, age_min: input.age_min, age_max: input.age_max, publisher_platforms: ['facebook'], facebook_positions: ['feed'], targeting_automation: { advantage_audience: 0 },
    ...(input.gender !== 'all' && { genders: [input.gender === 'men' ? 1 : 2] }) };
  const campaign = { name: input.campaign_name, objective: 'OUTCOME_TRAFFIC', buying_type: 'AUCTION', special_ad_categories: [], is_adset_budget_sharing_enabled: false, status: 'PAUSED' };
  const adset = { name: input.adset_name, campaign_id: ids.campaign_id, [input.budget.type === 'daily' ? 'daily_budget' : 'lifetime_budget']: plan.budget_minor,
    optimization_goal: 'LINK_CLICKS', billing_event: 'IMPRESSIONS', bid_strategy: 'LOWEST_COST_WITHOUT_CAP', destination_type: 'WEBSITE', targeting, start_time: input.start_time, ...(input.end_time && { end_time: input.end_time }), status: 'PAUSED' };
  const story = creative.mode === 'image' ? { object_story_spec: { page_id: creative.page_id, link_data: { image_hash: creative.image_hash, link: creative.url, message: creative.message, name: creative.headline,
    ...(creative.description && { description: creative.description }), call_to_action: { type: creative.call_to_action, value: { link: creative.url } } } } } : { object_story_id: creative.post_id };
  const body = { campaign, adset, creative: { name: input.creative_name, ...story }, ad: { name: input.ad_name, adset_id: ids.adset_id, creative: { creative_id: ids.creative_id }, status: 'PAUSED' } }[step];
  const edge = { campaign: 'campaigns', adset: 'adsets', creative: 'adcreatives', ad: 'ads' }[step];
  return { method: 'POST', path: `/${META_CAMPAIGN_API_VERSION}/${plan.account_id}/${edge}`, body };
}
function durableReceipt(receipt, plan, step) {
  if (!object(receipt) || receipt.account_id !== plan.account_id || receipt.step !== step || receipt.verified !== true) fail('O recibo persistido da criação Meta não confirmou o escopo.', 'META_RECEIPT_INVALID');
  entityId(receipt.id); return receipt;
}
function accepted(response) {
  return response?.ok === true && Number.isInteger(response.status) && response.status >= 200 && response.status < 300 && object(response.data) && !response.data.error;
}
function definitive(response) {
  const error = response?.data?.error;
  return object(error) && error.is_transient !== true && response.status >= 200 && response.status < 500 && [10, 100, 102, 104, 190, 200, 2500, 294, 368].includes(error.code);
}
function verified(data, plan, step, id, ids) {
  if (!object(data) || data.id !== id || account(data.account_id) !== plan.account_id || step !== 'creative' && data.status !== 'PAUSED') return false;
  if (step === 'campaign') return data.objective === 'OUTCOME_TRAFFIC';
  if (step === 'adset') return data.campaign_id === ids.campaign_id;
  if (step === 'ad') return data.adset_id === ids.adset_id && data.creative?.id === ids.creative_id;
  return true;
}

export async function executeMetaCampaignPlan({ plan, callGraph, reserveStep, finishStep, signal }) {
  signal?.throwIfAborted();
  keys(plan, PLAN_KEYS);
  const rebuilt = validateMetaCampaignPlan(plan.input, { accountId: plan.account_id, currency: plan.currency, authorizedAssets: plan.assets, now: plan.prepared_at });
  if (!same(plan, rebuilt) || typeof callGraph !== 'function' || typeof reserveStep !== 'function' || typeof finishStep !== 'function') fail('O plano aprovado de criação Meta foi alterado ou está incompleto.');
  const entities = {}, receipts = {};
  const result = (state, extra = {}) => ({ state, account_id: plan.account_id, starts_delivery: false, entities: { ...entities }, receipts: { ...receipts }, ...extra });
  for (const step of ['campaign', 'adset', 'creative', 'ad']) {
    signal?.throwIfAborted();
    const request = requestFor(plan, step, entities), claim = await reserveStep({ step, account_id: plan.account_id, request });
    if (!object(claim) || typeof claim.claimed !== 'boolean') fail('O ledger não confirmou a reserva da etapa Meta.', 'META_RECEIPT_INVALID');
    if (!claim.claimed) {
      if (claim.state === 'completed') { const receipt = durableReceipt(claim.receipt, plan, step); entities[`${step}_id`] = receipt.id; receipts[step] = receipt; continue; }
      if (!['reserved', 'failed', 'uncertain'].includes(claim.state)) fail('O ledger retornou um estado de criação inválido.', 'META_RECEIPT_INVALID');
      let pendingReceipt;
      if (claim.state === 'uncertain' && claim.receipt) {
        const receipt = claim.receipt;
        if (!object(receipt) || receipt.account_id !== plan.account_id || receipt.step !== step || typeof receipt.verified !== 'boolean') fail('O recibo parcial não confirmou o escopo da criação.', 'META_RECEIPT_INVALID');
        pendingReceipt = { id: entityId(receipt.id), account_id: plan.account_id, step, verified: receipt.verified };
      }
      return result(claim.state === 'reserved' ? 'pending' : claim.state, { blocked_step: step, ...(pendingReceipt && { pending_receipt: pendingReceipt }), error: { code: 'META_STEP_BLOCKED', message: 'A etapa já possui registro. Confira o resultado antes de qualquer nova criação.' } });
    }
    if (claim.state !== 'reserved') fail('O ledger não concedeu uma reserva nova para a criação.', 'META_RECEIPT_INVALID');
    const stop = async (state, code, message, receipt) => {
      try {
        const saved = await finishStep({ step, lease: claim.lease, state, ...(receipt && { receipt }), error: { code, message } });
        if (saved?.state === state) return result(state, { blocked_step: step, error: { code, message }, ...(receipt && { pending_receipt: receipt }) });
      } catch { /* A missing durable response never authorizes another POST. */ }
      return result('uncertain', { blocked_step: step, error: { code: 'META_RECEIPT_UNCONFIRMED', message: 'A gravação do recibo não foi confirmada. Confira a Meta e o histórico antes de continuar.' }, ...(receipt && { pending_receipt: receipt }) });
    };
    let response;
    try { signal?.throwIfAborted(); response = await callGraph({ ...request, signal }); }
    catch { return stop('uncertain', 'META_TRANSPORT_UNCERTAIN', 'A resposta da criação Meta não foi confirmada. Não repita o envio automaticamente.'); }
    if (!accepted(response)) return stop(definitive(response) ? 'failed' : 'uncertain', 'META_GRAPH_REJECTED', 'A Meta não confirmou esta criação. As etapas já concluídas foram preservadas.');
    let id;
    try { id = entityId(response.data.id); } catch { return stop('uncertain', 'META_ID_UNCONFIRMED', 'A Meta não retornou uma identificação válida para a criação.'); }
    const candidate = { id, account_id: plan.account_id, step, verified: false };
    try {
      const fields = { campaign: 'id,account_id,status,objective', adset: 'id,account_id,status,campaign_id', creative: 'id,account_id', ad: 'id,account_id,status,adset_id,creative{id}' }[step];
      const read = await callGraph({ method: 'GET', path: `/${META_CAMPAIGN_API_VERSION}/${id}`, query: { fields }, signal });
      if (!accepted(read) || !verified(read.data, plan, step, id, entities)) return stop('uncertain', 'META_VERIFICATION_UNCONFIRMED', 'A releitura não confirmou conta, vínculos e estado pausado da entidade criada.', candidate);
    } catch { return stop('uncertain', 'META_VERIFICATION_UNCONFIRMED', 'A releitura da entidade criada não foi confirmada.', candidate); }
    const receipt = { ...candidate, verified: true };
    try {
      const saved = await finishStep({ step, lease: claim.lease, state: 'completed', receipt });
      const persisted = saved?.state === 'completed' ? durableReceipt(saved.receipt, plan, step) : null;
      if (!persisted || !same(persisted, receipt)) return result('uncertain', { blocked_step: step, pending_receipt: candidate, error: { code: 'META_RECEIPT_UNCONFIRMED', message: 'O recibo da criação não foi confirmado no histórico.' } });
    } catch { return result('uncertain', { blocked_step: step, pending_receipt: candidate, error: { code: 'META_RECEIPT_UNCONFIRMED', message: 'O recibo da criação não foi confirmado no histórico.' } }); }
    entities[`${step}_id`] = id; receipts[step] = receipt;
  }
  return result('completed');
}

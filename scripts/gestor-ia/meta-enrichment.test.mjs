import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { build, transform } from 'esbuild';
import { createClient } from '@supabase/supabase-js';

const helpers = await import('../../supabase/functions/_shared/metaAdEnrichment.js').catch((error) => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return {};
  throw error;
});
const ad = { id: '90001', name: 'Anúncio fictício', account_id: '700', campaign: { id: '10001', name: 'Campanha fictícia', account_id: '700' }, adset: { id: '20001', name: 'Conjunto fictício' } };
const details = { ad, accountName: 'Conta fictícia' };
const tracking = { source_id: '90001', planeje_link_origin: 'site', utm_source: 'Linktree', ctwaClid: 'preservar', thumbnailURL: 'https://fixture.invalid/original.jpg',
  meta_ad_details: { accountName: 'Conta original', fetched_at: '2026-11-01T00:00:00Z', ad: { id: '90001', name: 'Nome original', campaign: { name: 'Campanha anterior' }, adset: { name: 'Conjunto anterior' }, thumbnail_url: 'https://fixture.invalid/persistida.jpg' } }, meta_ad_details_history: [{ preserved: true }] };

test('a action devolve IDs e conta sem perder miniatura e nomes', async () => {
  const source = await readFile(new URL('../../supabase/functions/meta-ads-api/index.ts', import.meta.url), 'utf8');
  const block = source.slice(source.indexOf('    if (action === "get-ad-by-id")'), source.indexOf('    // --- Lead Ads'));
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const code = await transform(`async function run() { const action = 'get-ad-by-id'; ${block} }`, { loader: 'ts' });
  const handler = new AsyncFunction('body', 'metaToken', 'fetch', 'supabase', 'supabaseUrl', 'corsHeaders', 'persistAdThumbnail', 'largeCreativeThumbnailUrl', 'bestVideoPreviewUrl', 'metaAdIdentity', 'META_AD_IDENTITY_FIELDS', `${code.code}; return run();`);
  const calls = [];
  const response = await handler({ adId: '90001' }, 'fixture-token', async (url) => {
    calls.push(new URL(url));
    return Response.json(calls.length === 1 ? ad : { name: 'Conta fictícia' });
  }, {}, 'https://fixture.invalid', {}, async () => 'https://fixture.invalid/thumb.jpg', async () => null, async () => null,
  helpers.metaAdIdentity, helpers.META_AD_IDENTITY_FIELDS);
  const payload = await response.json();
  assert.equal(payload.ad.campaign.id, '10001');
  assert.equal(payload.ad.campaign.account_id, '700');
  assert.equal(payload.ad.adset.id, '20001');
  assert.equal(payload.ad.account_id, '700');
  assert.equal(payload.ad.name, 'Anúncio fictício');
  assert.equal(payload.ad.thumbnail_url, 'https://fixture.invalid/thumb.jpg');
  assert.equal(payload.accountName, 'Conta fictícia');
  assert.ok(calls[0].searchParams.get('fields').includes('campaign{id,name,account_id}'));
  assert.ok(calls[0].searchParams.get('fields').includes('adset{id,name}'));
});

test('merge completa identidade sem trocar primeiro toque, nomes, miniatura ou histórico', () => {
  assert.equal(typeof helpers.mergeMetaAdEnrichment, 'function');
  const before = structuredClone(tracking);
  const result = helpers.mergeMetaAdEnrichment(tracking, details, '2026-11-12T00:00:00Z');
  assert.equal(result.status, 'changed');
  assert.equal(result.tracking.meta_ad_details.ad.campaign.id, '10001');
  assert.equal(result.tracking.meta_ad_details.ad.adset.id, '20001');
  assert.equal(result.tracking.meta_ad_details.ad.account_id, '700');
  assert.equal(result.tracking.meta_ad_details.ad.name, 'Nome original');
  assert.equal(result.tracking.meta_ad_details.ad.campaign.name, 'Campanha anterior');
  assert.equal(result.tracking.meta_ad_details.ad.thumbnail_url, before.meta_ad_details.ad.thumbnail_url);
  assert.equal(result.tracking.meta_ad_details.accountName, 'Conta original');
  assert.equal(result.tracking.meta_ad_details.fetched_at, '2026-11-01T00:00:00Z');
  for (const key of ['source_id', 'planeje_link_origin', 'utm_source', 'ctwaClid', 'thumbnailURL', 'meta_ad_details_history']) assert.deepEqual(result.tracking[key], before[key]);
  assert.deepEqual(tracking, before);
  assert.equal(helpers.mergeMetaAdEnrichment(result.tracking, details, '2026-11-13T00:00:00Z').status, 'unchanged');
});

test('IDs existentes contraditórios e respostas incompletas nunca alteram tracking', () => {
  assert.equal(typeof helpers.mergeMetaAdEnrichment, 'function');
  for (const patch of [{ ad_id: '90002' }, { sourceID: '90002' }, { account_id: 'act_701' }, { campaign_id: '10002' }, { campaignId: '10002' }, { adset_id: '20002' }, { meta_ad_details: { ad: { account_id: '701' } } }, { meta_ad_details: { ad: { campaign_id: '10002' } } }]) {
    const current = { ...tracking, ...patch };
    assert.equal(helpers.mergeMetaAdEnrichment(current, details).status, 'conflict');
  }
  for (const invalid of [{ ...ad, id: '90001/?access_token=bad' }, { ...ad, account_id: '701' }, { ...ad, campaign: { name: 'Sem ID' } }, { ...ad, adset: null }]) {
    assert.equal(helpers.mergeMetaAdEnrichment(tracking, { ad: invalid }).status, 'invalid');
  }
  assert.equal(helpers.mergeMetaAdEnrichment({ source_id: '90001', account_id: 'act_700' }, details).status, 'changed');
  assert.deepEqual(helpers.metaAdIds({ source_id: '90001', ad_id: '90001', meta_ad_details: { ad: { id: '90001' } } }), ['90001']);
});

const bundled = await build({ entryPoints: ['src/lib/funilMetaCreative.js'], bundle: true, write: false, format: 'esm', platform: 'node', define: { 'import.meta.env': '{}' },
  plugins: [{ name: 'fixture-client', setup(builder) {
    builder.onResolve({ filter: /customSupabaseClient$/ }, () => ({ path: 'fixture-client', namespace: 'fixture' }));
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export const supabase={from:(...args)=>globalThis.__metaDb.from(...args),functions:{invoke:(...args)=>globalThis.__metaDb.functions.invoke(...args)}};' }));
    builder.onResolve({ filter: /^@\// }, ({ path }) => ({ path: new URL(`../../src/${path.slice(2)}.js`, import.meta.url).pathname }));
  } }],
});
const browser = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);
function browserDb({ deny = false, stale = false, linked = true, trackingData = tracking } = {}) {
  const row = { id: '00000000-0000-4000-8000-000000000001', cliente_id: '00000000-0000-4000-8000-000000000002', tracking_data: structuredClone(trackingData), updated_at: '2026-11-12T00:00:00Z' };
  const calls = [], writes = [];
  globalThis.__metaDb = createClient('https://fixture.invalid', 'fixture-key', { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: async (input, init = {}) => {
    const url = new URL(input); assert.equal(url.hostname, 'fixture.invalid');
    calls.push({ url, method: init.method || 'GET' });
    assert.equal(url.searchParams.has('tracking_data'), false, 'JSON pessoal nunca entra na URL');
    if (url.pathname.includes('/functions/')) return Response.json(details);
    if (url.pathname.endsWith('/cliente_meta_accounts')) {
      assert.equal(url.searchParams.get('cliente_id'), `eq.${row.cliente_id}`);
      assert.equal(url.searchParams.get('is_active'), 'eq.true');
      return Response.json(linked ? [{ meta_account_id: 'act_700' }] : []);
    }
    assert.equal(url.searchParams.get('id'), `eq.${row.id}`);
    assert.equal(url.searchParams.get('cliente_id'), `eq.${row.cliente_id}`);
    if (init.method !== 'PATCH') return Response.json(row);
    assert.equal(url.searchParams.get('updated_at'), 'eq.2026-11-12T00:00:00Z');
    if (deny) return Response.json({ code: '42501', message: 'fixture denied' }, { status: 403 });
    if (stale) return Response.json(null);
    const patch = JSON.parse(init.body); writes.push(patch); Object.assign(row, patch);
    return Response.json({ id: row.id });
  } } });
  return { row, calls, writes };
}

test('helper de criativo mantém identidade completa e reutiliza a mesma consulta', async () => {
  const fixture = browserDb(); browser.clearMetaAdCreativeCache();
  const first = await browser.fetchMetaAdCreative('90001');
  assert.deepEqual(first.ad, ad);
  assert.equal(first.accountName, 'Conta fictícia');
  assert.equal(first.name, 'Anúncio fictício');
  assert.equal(await browser.fetchMetaAdCreative('90001'), first);
  assert.equal(fixture.calls.filter(({ url }) => url.pathname.includes('/functions/')).length, 1);
});

test('persistência da ficha completa só campos ausentes, usa CAS e é idempotente', async () => {
  assert.equal(typeof browser.persistContactMetaAdIdentity, 'function');
  const fixture = browserDb();
  const options = { clienteId: fixture.row.cliente_id, contactId: fixture.row.id, ...details };
  assert.equal(await browser.persistContactMetaAdIdentity(options), true);
  assert.equal(fixture.writes.length, 1);
  assert.equal(fixture.row.tracking_data.meta_ad_details.ad.campaign.id, '10001');
  assert.equal(fixture.row.tracking_data.utm_source, 'Linktree');
  assert.equal(await browser.persistContactMetaAdIdentity(options), false);
  assert.equal(fixture.writes.length, 1);
});

test('ficha sem permissão, com versão concorrente ou conta não vinculada não grava', async () => {
  assert.equal(typeof browser.persistContactMetaAdIdentity, 'function');
  for (const mode of [{ deny: true }, { stale: true }, { linked: false }]) {
    const fixture = browserDb(mode);
    assert.equal(await browser.persistContactMetaAdIdentity({ clienteId: fixture.row.cliente_id, contactId: fixture.row.id, ...details }), false);
    assert.equal(fixture.writes.length, 0);
  }
});

test('efeito atual da ficha aproveita a resposta já consultada e cancela escrita após fechar', async () => {
  const source = await readFile(new URL('../../src/components/crm/RastreamentoLeadFicha.jsx', import.meta.url), 'utf8');
  const marker = source.indexOf('const current = ficha.creative.thumbnailUrl');
  const effect = source.slice(source.lastIndexOf('  useEffect(() => {', marker), source.indexOf('\n  useEffect(() => {', marker));
  const mount = new Function('useEffect', 'setThumbnailUrl', 'ficha', 'open', 'contact', 'clienteId', 'fetchMetaAdCreative', 'persistContactMetaAdIdentity', 'supabase', effect);
  for (const close of [false, true]) {
    const fixture = browserDb(); browser.clearMetaAdCreativeCache();
    let cleanup;
    mount((run) => { cleanup = run(); }, () => {}, { showCreative: true, creative: { adId: '90001', thumbnailUrl: '' } }, true,
      fixture.row, fixture.row.cliente_id, browser.fetchMetaAdCreative, browser.persistContactMetaAdIdentity, globalThis.__metaDb);
    if (close) cleanup();
    await new Promise(setImmediate);
    assert.equal(fixture.calls.filter(({ url }) => url.pathname.includes('/functions/')).length, 1);
    assert.equal(fixture.writes.length, close ? 0 : 1);
  }
});

test('ficha não promove identidade de outro evento quando o contato não tem anúncio comprovado', async () => {
  const fixture = browserDb({ trackingData: { utm_source: 'Linktree' } });
  assert.equal(await browser.persistContactMetaAdIdentity({ clienteId: fixture.row.cliente_id, contactId: fixture.row.id, ...details }), false);
  assert.equal(fixture.writes.length, 0);
});

test('adId contraditório recusa merge e impede gravação na ficha', async () => {
  const trackingData = { source_id: '90001', adId: '90002' };
  assert.equal(helpers.mergeMetaAdEnrichment(trackingData, details).status, 'conflict');
  const fixture = browserDb({ trackingData });
  assert.equal(await browser.persistContactMetaAdIdentity({ clienteId: fixture.row.cliente_id, contactId: fixture.row.id, ...details }), false);
  assert.equal(fixture.writes.length, 0);
});

test('adId como único identificador pode completar a identidade sem alterar o alias', async () => {
  assert.deepEqual(helpers.metaAdIds({ adId: '90001' }), ['90001']);
  const fixture = browserDb({ trackingData: { adId: '90001', utm_source: 'Linktree' } });
  assert.equal(await browser.persistContactMetaAdIdentity({ clienteId: fixture.row.cliente_id, contactId: fixture.row.id, ...details }), true);
  assert.equal(fixture.row.tracking_data.adId, '90001');
  assert.equal(fixture.row.tracking_data.meta_ad_details.ad.id, '90001');
});

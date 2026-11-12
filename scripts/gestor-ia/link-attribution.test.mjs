import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { createClient } from '@supabase/supabase-js';
import * as message from '../../supabase/functions/_shared/rastreamentoMessageAttribution.js';
import { recordedOriginSource, trackingFromMatchedClick as fromJsClick } from '../../src/lib/rastreamentoTrackableLink.js';

const compiled = await build({ entryPoints: ['supabase/functions/_shared/rastreamentoTrackableLink.ts'], bundle: true, platform: 'node', format: 'esm', write: false, logLevel: 'silent' });
const deno = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'));
const link = { id: 'link-one', cliente_id: 'client-one', is_active: true, whatsapp_config_id: 'channel-one',
  initial_message: 'Olá! Vim deste link e gostaria de mais informações.', default_origin: 'meta_ads', default_utm_source: 'Linktree',
  campaign_id: '10001', campaign_name: 'Campanha fictícia', adset_id: '20001', adset_name: 'Conjunto fictício' };
const snapshot = { platform: 'meta', campaign_id: '10001', campaign_name: 'Campanha fictícia', adset_id: '20001', adset_name: 'Conjunto fictício' };

test('snapshot aceita só plataforma, IDs numéricos até 32 caracteres e nomes até 500', () => {
  assert.equal(typeof message.linkAttributionSnapshot, 'function');
  assert.deepEqual(message.linkAttributionSnapshot(link), snapshot);
  for (const [origin, platform] of [['meta_ads', 'meta'], ['google_ads', 'google'], ['site', 'site']]) {
    assert.deepEqual(message.linkAttributionSnapshot({ default_origin: origin }), { platform });
  }
  assert.deepEqual(message.linkAttributionSnapshot({ platform: 'meta', campaign_id: ' 123 ', campaign_name: ' Nome ', adset_id: '9'.repeat(32), adset_name: 'x'.repeat(500), raw_secret: 'ignored' }),
    { platform: 'meta', campaign_id: '123', campaign_name: 'Nome', adset_id: '9'.repeat(32), adset_name: 'x'.repeat(500) });
  for (const bad of ['act_123', 'abc', '9'.repeat(33), 123, { id: '123' }]) {
    const safe = message.linkAttributionSnapshot({ default_origin: 'meta_ads', campaign_id: bad, adset_id: bad, campaign_name: 'x'.repeat(501), adset_name: {} });
    assert.deepEqual(safe, { platform: 'meta' });
  }
  assert.equal(message.linkAttributionSnapshot({ platform: 'unexpected' }), null);
});

test('mensagem congela configuração atual mesmo com metadados incoming e preserva first-touch no merge', () => {
  const incoming = { utm_source: 'outra', analysis_labels: ['preservar'], planeje_link_attribution: { platform: 'google', campaign_id: '99999' } };
  const tracked = message.trackingFromInitialMessageLink(link, incoming, { messageId: 'fixture-message', recordedAt: '2026-11-12T00:00:00Z' });
  assert.deepEqual(tracked.planeje_link_attribution, snapshot);
  assert.equal(tracked.planeje_link_origin, 'meta_ads');
  assert.equal(tracked.utm_source, 'Linktree');
  assert.deepEqual(tracked.analysis_labels, ['preservar']);
  const changed = { ...link, campaign_id: '10002', adset_name: 'Editado depois' };
  const later = message.trackingFromInitialMessageLink(changed);
  assert.equal(tracked.planeje_link_attribution.campaign_id, '10001');
  assert.equal(later.planeje_link_attribution.campaign_id, '10002');
  const existing = { origin_source: 'site', tracking_data: { planeje_link_id: 'earlier', planeje_link_attribution: { platform: 'site' } } };
  assert.equal(message.mergeContactAttributionMetadata(existing, tracked), existing.tracking_data);
  assert.deepEqual(message.trackingFromInitialMessageLink({ ...link, campaign_id: null, campaign_name: null, adset_id: null, adset_name: null }).planeje_link_attribution, { platform: 'meta' });
});

test('lookup de mensagem carrega quatro campos e continua isolado por cliente e canal', async () => {
  const calls = [];
  const db = createClient('https://fixture.invalid', 'fixture-key', { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: async (input) => {
    const url = new URL(input); calls.push(url);
    assert.equal(url.searchParams.get('cliente_id'), 'eq.client-one');
    assert.equal(url.searchParams.get('is_active'), 'eq.true');
    const columns = url.searchParams.get('select').replaceAll(' ', '').split(',');
    return Response.json([Object.fromEntries(columns.map((key) => [key, link[key]]))]);
  } } });
  const options = { clienteId: 'client-one', whatsappConfigId: 'channel-one', message: link.initial_message };
  const found = await message.lookupInitialMessageLink(db, options);
  assert.equal(found.campaign_id, '10001');
  assert.equal(found.campaign_name, 'Campanha fictícia');
  assert.equal(found.adset_id, '20001');
  assert.equal(found.adset_name, 'Conjunto fictício');
  assert.equal(await message.lookupInitialMessageLink(db, { ...options, whatsappConfigId: 'other-channel' }), null);
  assert.equal(message.findInitialMessageLink([{ ...link, cliente_id: 'other-client' }], options), null);
  assert.equal(calls.length, 2);
});

test('matchers JS e TS copiam somente snapshot do clique e clonam a configuração histórica', () => {
  for (const fromClick of [(click, existing) => fromJsClick(click, { keepExisting: existing }), deno.trackingFromMatchedClick]) {
    const click = { id: 'click-one', cliente_id: 'client-one', link_id: 'link-one', match_code: 'PJ-ABC234', origin_resolved: 'google_ads', gclid: 'fixture-google', link_attribution: structuredClone(snapshot) };
    const result = fromClick(click, { analysis_labels: ['preservar'] });
    assert.deepEqual(result.planeje_link_attribution, snapshot);
    assert.notEqual(result.planeje_link_attribution, click.link_attribution);
    assert.equal(result.planeje_link_origin, 'google_ads');
    assert.deepEqual(result.analysis_labels, ['preservar']);
    click.link_attribution.campaign_id = '10002';
    assert.equal(result.planeje_link_attribution.campaign_id, '10001');
    assert.equal(fromClick({ ...click, link_attribution: null }).planeje_link_attribution, undefined);
    assert.equal(fromClick({ ...click, link_attribution: undefined }).planeje_link_attribution, undefined);
  }
});

test('claim atômico devolve snapshot selecionado do clique, sem consultar link editado', async () => {
  const click = { id: 'click-one', cliente_id: 'client-one', link_id: 'link-one', match_code: 'PJ-ABC234', origin_resolved: 'meta_ads', matched_at: null, link_attribution: snapshot };
  const db = createClient('https://fixture.invalid', 'fixture-key', { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: async (input, init = {}) => {
    const url = new URL(input);
    assert.ok(url.pathname.endsWith('/cliente_rastreamento_link_clicks'));
    if (init.method === 'PATCH') {
      assert.equal(url.searchParams.get('id'), 'eq.click-one');
      assert.equal(url.searchParams.get('matched_at'), 'is.null');
      Object.assign(click, JSON.parse(init.body));
    } else assert.equal(url.searchParams.get('match_code'), 'eq.PJ-ABC234');
    const columns = url.searchParams.get('select').replaceAll(' ', '').split(',');
    return Response.json(Object.fromEntries(columns.map((key) => [key, click[key]])));
  } } });
  const claimed = await deno.claimTrackableClickMatch(db, { matchCode: 'PJ-ABC234', clienteId: 'client-one', fromJid: 'fixture@s.whatsapp.net' });
  assert.deepEqual(claimed.link_attribution, snapshot);
  assert.equal(await deno.claimTrackableClickMatch(db, { matchCode: 'PJ-ABC234', clienteId: 'other-client', fromJid: 'other@s.whatsapp.net' }), null);
});

test('origem congelada prevalece no Linktree; Google e CTWA preservam precedência', () => {
  const row = { origin_source: 'meta_ads', utm_source: 'Linktree', tracking_data: { planeje_link_id: 'link-one', planeje_link_origin: 'meta_ads' } };
  const cases = [[row, 'meta_ads'], [{ ...row, origin_source: 'site', tracking_data: { ...row.tracking_data, planeje_link_origin: 'site' } }, 'site'],
    [{ ...row, origin_source: 'google_ads' }, 'google_ads'], [{ ...row, tracking_data: { ...row.tracking_data, gclid: 'fixture-google' } }, 'google_ads'],
    [{ ...row, origin_source: 'site' }, 'meta_ads'], [{ ...row, tracking_data: { ...row.tracking_data, planeje_link_origin: 'site' } }, 'site'],
    [{ ...row, tracking_data: { ...row.tracking_data, planeje_link_origin: 'site', ctwaClid: 'fixture-ctwa' } }, 'meta_ads'],
    [{ ...row, tracking_data: { planeje_link_id: 'link-one' } }, 'meta_ads']];
  for (const [contact, expected] of cases) assert.equal(recordedOriginSource(contact), expected);
});

test('redirect congela configuração salva; parâmetros públicos não injetam campanha nem conjunto', async () => {
  let handler;
  const inserts = [];
  const db = createClient('https://fixture.invalid', 'fixture-key', { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: async (input, init = {}) => {
    const url = new URL(input);
    assert.equal(url.hostname, 'fixture.invalid');
    if (url.pathname.endsWith('/cliente_rastreamento_links')) {
      assert.equal(url.searchParams.get('slug'), 'eq.fixture');
      const stored = { ...link, slug: 'fixture', destination_phone: '5511000000001', append_match_code: true };
      const columns = url.searchParams.get('select').replaceAll(' ', '').split(',');
      return Response.json(Object.fromEntries(columns.map((key) => [key, stored[key]])));
    }
    assert.ok(url.pathname.endsWith('/cliente_rastreamento_link_clicks'));
    assert.equal(init.method, 'POST'); inserts.push(JSON.parse(init.body)); return Response.json(null, { status: 201 });
  } } });
  globalThis.__linkRedirect = { serve: (callback) => { handler = callback; }, db };
  const built = await build({ entryPoints: ['supabase/functions/rastreamento-link-redirect/index.ts'], bundle: true, platform: 'node', format: 'esm', write: false,
    plugins: [{ name: 'isolated', setup(builder) {
      builder.onResolve({ filter: /^https:/ }, ({ path }) => ({ path, namespace: 'fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({ contents: path.includes('server.ts') ? 'export const serve = globalThis.__linkRedirect.serve;' : 'export const createClient = () => globalThis.__linkRedirect.db;' }));
    } }], logLevel: 'silent' });
  const originalDeno = globalThis.Deno;
  globalThis.Deno = { env: { get: (key) => ({ SUPABASE_URL: 'https://fixture.invalid', SUPABASE_SERVICE_ROLE_KEY: 'fixture' })[key] } };
  try {
    await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'));
    const response = await handler(new Request('https://fixture.invalid/r/fixture?gclid=fixture-google&campaign_id=99999&adset_id=99998&campaign_name=PUBLIC&adset_name=PUBLIC'));
    assert.equal(response.status, 302);
    assert.deepEqual(inserts[0].link_attribution, snapshot);
    assert.equal(inserts[0].origin_resolved, 'google_ads');
    assert.equal(inserts[0].link_attribution.platform, 'meta');
    assert.ok(response.headers.get('Location').startsWith('https://wa.me/'));
  } finally { globalThis.Deno = originalDeno; delete globalThis.__linkRedirect; }
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createClient } from '@supabase/supabase-js';

const script = await import('./backfill-meta-attribution.mjs').catch((error) => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return {};
  throw error;
});
const clientId = '00000000-0000-4000-8000-000000000002';
const options = { clientId, since: '2026-11-09', until: '2026-11-15', limit: 100, apply: false };
const ad = { id: '90001', name: 'Anúncio fictício', account_id: '700', campaign: { id: '10001', name: 'Campanha fictícia', account_id: '700' }, adset: { id: '20001', name: 'Conjunto fictício' } };
const contact = (index, patch = {}) => ({ id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`, cliente_id: clientId, first_seen_at: '2026-11-10T12:00:00Z', updated_at: '2026-11-12T00:00:00Z', origin_source: 'site',
  tracking_data: { source_id: '90001', utm_source: 'Linktree', owner_phone: 'PRIVATE-FIXTURE', meta_ad_details: { ad: { name: 'Nome salvo', thumbnail_url: 'https://fixture.invalid/thumb.jpg' } } }, ...patch });

function fixture(rows, { linked = true, stale = false, deny = false, graphError = null } = {}) {
  const calls = [], writes = [], graphCalls = [];
  const db = createClient('https://fixture.invalid', 'fixture-key', { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: async (input, init = {}) => {
    const url = new URL(input); assert.equal(url.hostname, 'fixture.invalid'); calls.push({ url, method: init.method || 'GET' });
    assert.equal(url.searchParams.has('tracking_data'), false);
    assert.equal(url.searchParams.get('cliente_id'), `eq.${clientId}`);
    if (url.pathname.endsWith('/cliente_meta_accounts')) {
      assert.equal(url.searchParams.get('is_active'), 'eq.true');
      return Response.json(linked ? [{ meta_account_id: 'act_700' }] : []);
    }
    assert.ok(url.pathname.endsWith('/cliente_whatsapp_contact'));
    if (init.method === 'PATCH') {
      const row = rows.find((entry) => `eq.${entry.id}` === url.searchParams.get('id'));
      assert.equal(url.searchParams.get('updated_at'), `eq.${row.updated_at}`);
      if (deny) return Response.json({ message: 'PRIVATE-FIXTURE' }, { status: 403 });
      if (stale) return Response.json(null);
      const patch = JSON.parse(init.body); writes.push(patch); Object.assign(row, patch);
      return Response.json({ id: row.id });
    }
    assert.equal(url.searchParams.get('first_seen_at'), 'gte.2026-11-09T00:00:00.000-03:00');
    assert.deepEqual(url.searchParams.getAll('first_seen_at'), ['gte.2026-11-09T00:00:00.000-03:00', 'lte.2026-11-15T23:59:59.999-03:00']);
    return Response.json(rows.slice(0, Number(url.searchParams.get('limit'))));
  } } });
  const fetchGraph = async (input, init) => {
    const url = new URL(input); graphCalls.push(url);
    assert.equal(url.origin, 'https://graph.facebook.com');
    assert.equal(url.pathname, '/v24.0/90001');
    assert.equal(url.searchParams.has('access_token'), false);
    assert.equal(init.headers.Authorization, 'Bearer fixture-meta-token');
    assert.equal(init.method, 'GET');
    assert.equal(init.redirect, 'error');
    assert.ok(url.searchParams.get('fields').includes('campaign{id,name,account_id}'));
    if (graphError instanceof Error) throw graphError;
    return Response.json(graphError || ad, { status: graphError ? 429 : 200 });
  };
  return { db, rows, calls, writes, graphCalls, fetchGraph, readToken: async () => 'fixture-meta-token' };
}

test('CLI exige UUID e datas válidas, limita lote e mantém dry-run padrão', () => {
  assert.equal(typeof script.parseBackfillArgs, 'function');
  const args = ['--cliente', clientId, '--since', '2026-11-09', '--until', '2026-11-15'];
  assert.deepEqual(script.parseBackfillArgs(args), options);
  assert.equal(script.parseBackfillArgs([...args, '--apply']).apply, true);
  for (const invalid of [[], args.slice(2), [...args, '--limit', '0'], [...args, '--limit', '501'], [...args, '--limit', '1x'], [...args, '--secret', 'secret'], [...args, '--apply', '--apply'], ['--cliente', clientId, '--since', '2026-02-30', '--until', '2026-03-01'], ['--cliente', clientId, '--since', '2026-01-01', '--until', '2026-11-01']]) assert.throws(() => script.parseBackfillArgs(invalid));
});

test('dry-run consulta anúncio único por lote sem gravar dados ou miniaturas', async () => {
  assert.equal(typeof script.runBackfillMetaAttribution, 'function');
  const f = fixture([contact(1), contact(2)]), before = structuredClone(f.rows);
  const report = await script.runBackfillMetaAttribution({ ...f, options });
  assert.equal(report.eligible, 2);
  assert.equal(report.updated, 0);
  assert.equal(f.graphCalls.length, 1);
  assert.equal(f.writes.length, 0);
  assert.deepEqual(f.rows, before);
  assert.ok(Object.values(report).every((value) => typeof value === 'number'));
  assert.equal(JSON.stringify(report).includes('PRIVATE-FIXTURE'), false);
});

test('apply preenche IDs sem trocar primeiro toque e repetição não grava novamente', async () => {
  assert.equal(typeof script.runBackfillMetaAttribution, 'function');
  const f = fixture([contact(1)]);
  const report = await script.runBackfillMetaAttribution({ ...f, options: { ...options, apply: true } });
  assert.equal(report.updated, 1);
  assert.equal(f.rows[0].origin_source, 'site');
  assert.equal(f.rows[0].tracking_data.utm_source, 'Linktree');
  assert.equal(f.rows[0].tracking_data.owner_phone, 'PRIVATE-FIXTURE');
  assert.equal(f.rows[0].tracking_data.meta_ad_details.ad.thumbnail_url, 'https://fixture.invalid/thumb.jpg');
  assert.equal(f.rows[0].tracking_data.meta_ad_details.ad.name, 'Nome salvo');
  assert.equal(f.rows[0].tracking_data.meta_ad_details.ad.campaign.id, '10001');
  const again = await script.runBackfillMetaAttribution({ ...f, options: { ...options, apply: true } });
  assert.equal(again.updated, 0);
  assert.equal(f.writes.length, 1);
  assert.equal(f.graphCalls.length, 1);
});

test('conta alheia, conflito de IDs, CAS e recusa de edição não escrevem', async () => {
  assert.equal(typeof script.runBackfillMetaAttribution, 'function');
  for (const mode of [{ linked: false }, { stale: true }, { deny: true }]) {
    const f = fixture([contact(1)], mode);
    const report = await script.runBackfillMetaAttribution({ ...f, options: { ...options, apply: true } });
    assert.equal(report.updated, 0);
    assert.equal(f.writes.length, 0);
  }
  const f = fixture([contact(1, { tracking_data: { source_id: '90001', ad_id: '90002' } }), contact(2, { tracking_data: { source_id: '90001', account_id: '701' } })]);
  const report = await script.runBackfillMetaAttribution({ ...f, options: { ...options, apply: true } });
  assert.equal(report.conflicts, 2);
  assert.equal(f.writes.length, 0);
});

test('rate limit interrompe novas buscas; mensagens de provedor nunca entram no relatório', async () => {
  assert.equal(typeof script.runBackfillMetaAttribution, 'function');
  for (const graphError of [{ error: { code: 4, message: 'PRIVATE-FIXTURE fixture-meta-token https://secret.invalid' } }, new Error('PRIVATE-FIXTURE fixture-meta-token https://secret.invalid')]) {
    const f = fixture([contact(1), contact(2)], { graphError });
    const report = await script.runBackfillMetaAttribution({ ...f, options: { ...options, apply: true } });
    assert.equal(report.updated, 0);
    assert.equal(f.graphCalls.length, 1);
    assert.ok(Object.values(report).every((value) => typeof value === 'number'));
    assert.ok(report.rateLimited + report.failed > 0);
  }
});

test('lote limitado informa truncamento e recusa opções inválidas antes da rede', async () => {
  assert.equal(typeof script.runBackfillMetaAttribution, 'function');
  const f = fixture([contact(1), contact(2)]);
  const report = await script.runBackfillMetaAttribution({ ...f, options: { ...options, limit: 1 } });
  assert.equal(report.scanned, 1);
  assert.equal(report.truncated, 1);
  let network = 0;
  await assert.rejects(script.runBackfillMetaAttribution({ db: { from() { network++; throw Error('network'); } }, options: { ...options, clientId: 'invalid' } }));
  assert.equal(network, 0);
});

test('429 sem JSON interrompe o lote antes de consultar outro anúncio', async () => {
  const f = fixture([contact(1), contact(2, { tracking_data: { source_id: '90002' } })]);
  let calls = 0;
  const report = await script.runBackfillMetaAttribution({ ...f, options, fetchGraph: async () => {
    calls++; return new Response('PRIVATE-FIXTURE', { status: 429 });
  } });
  assert.equal(calls, 1);
  assert.equal(report.rateLimited, 1);
});

test('CLI rejeita chaves herdadas em vez de aceitá-las como opções', () => {
  assert.throws(() => script.parseBackfillArgs(['--cliente', clientId, '--since', '2026-11-09', '--until', '2026-11-15', '__proto__', 'value']));
});

test('backfill aceita adId isolado e recusa source_id/adId contraditórios sem gravar o conflito', async () => {
  const f = fixture([contact(1, { tracking_data: { adId: '90001' } }), contact(2, { tracking_data: { source_id: '90001', adId: '90002' } })]);
  const before = structuredClone(f.rows[1]);
  const report = await script.runBackfillMetaAttribution({ ...f, options: { ...options, apply: true } });
  assert.equal(report.conflicts, 1);
  assert.equal(report.updated, 1);
  assert.equal(f.rows[0].tracking_data.meta_ad_details.ad.id, '90001');
  assert.deepEqual(f.rows[1], before);
  assert.equal(f.writes.length, 1);
});

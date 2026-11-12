import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createClient } from '@supabase/supabase-js';
import * as report from '../src/lib/crmRelatorioGoogle.js';
import { buildLeadFicha } from '../src/lib/rastreamentoLeadFicha.js';

const period = { since: '2026-10-01', until: '2026-10-28' };
const at = '2026-10-20T15:00:00Z';
const contact = (id, extra = {}) => ({ id, phone: `55119800000${id}`, origin_source: 'site', first_seen_at: at, last_message_at: at, ...extra });

test('Site counts first recorded origin, deduplicates linked leads and preserves commercial state', () => {
  assert.equal(typeof report.buildSiteReportRows, 'function', 'Site report is missing');
  const contacts = [contact('01', { utm_source: ' chatgpt.com ', qualificado: false }), contact('02'),
    contact('03', { origin_source: 'google_ads', utm_source: 'google' }), contact('04', { origin_source: 'meta_ads' }),
    contact('05', { utm_source: 'Linktree', tracking_data: { gclid: 'later-google' } }),
    contact('06', { last_message_at: '2026-10-29T03:00:00Z' })];
  const leads = [{ id: 'linked', whatsapp: contacts[0].phone, origem: 'Site', qualificado: true, comprou: true, valor: 100 },
    { id: 'imported', whatsapp: '5511990000099', origem: 'Site', tracking_data: { utm_source: 'chatgpt.com', gclid: 'later-google' }, created_at: at }];
  const before = JSON.stringify({ contacts, leads });
  const data = report.buildSiteReportRows(contacts, leads, period);
  assert.equal(data.rows.length, 4);
  assert.equal(data.rows[0].qualificado, true);
  assert.equal(data.trackingRows.length, 4, 'first-message cohort includes Site contact with later activity');
  assert.equal(report.buildGoogleReportRows([], [leads[1]], period).rows.length, 0, 'explicit first Site excludes later Google signal');
  assert.equal(JSON.stringify({ contacts, leads }), before);
});

test('Source cards count unique leads, filter metrics and keep empty/reserved sources distinct', () => {
  assert.equal(typeof report.summarizeSiteReport, 'function', 'Source summary is missing');
  const data = report.buildSiteReportRows([contact('11', { utm_source: ' chatgpt.com ', comprou: true, valor_venda: 80 }),
    contact('12', { tracking_data: { utm_source: 'chatgpt.com' } }), contact('13'),
    contact('14', { utm_source: '__all__' }), contact('15', { utm_source: 'ChatGPT.com' })], [], period);
  const result = report.summarizeSiteReport(data);
  assert.equal(result.summary.leads, 5);
  assert.equal(result.sources.find(row => row.name === 'chatgpt.com').leads, 2);
  assert.equal(result.sources.find(row => row.name === 'Sem source informado').leads, 1);
  const selected = report.summarizeSiteReport(data, 'source:chatgpt.com');
  assert.equal(selected.rows.length, 2); assert.equal(selected.summary.leads, 2);
  assert.equal(selected.summary.vendas, 1); assert.equal(selected.summary.valorTotal, 80);
  assert.equal(selected.sources.length, result.sources.length, 'other source cards remain available');
  assert.equal(report.summarizeSiteReport(data, 'source:__all__').rows.length, 1);
  assert.equal(report.summarizeSiteReport(data, 'missing').summary.leads, 0);
  assert.equal(report.summarizeSiteReport({ rows: [], trackingRows: [] }).sources.length, 0);
});

test('Legacy Site origins stay Site in the ficha despite later Meta signals', () => {
  const tracking = { utm_source: 'chatgpt.com', ctwaClid: 'fixture-later-meta', source_id: '123456' };
  const cases = [report.buildSiteReportRows([contact('31', { origin_source: 'nao_identificado', tracking_data: { ...tracking, planeje_link_origin: 'site' } })], [], period),
    report.buildSiteReportRows([], [{ id: 'legacy', nome: 'Fixture Site', whatsapp: '5511990000032', origem: 'Site', tracking_data: tracking, created_at: at }], period)];
  for (const data of cases) {
    assert.equal(data.rows.length, 1);
    const row = data.rows[0], ficha = buildLeadFicha({ contact: row._contactRow, lead: row._leadRef });
    assert.equal(ficha.originKind, 'site');
    assert.equal(ficha.showCreative, false, 'Site must not request Meta creative');
    assert.equal(ficha.showCapiJourney, false, 'Site must not expose Meta CAPI journey');
  }
});

test('Site reader is tenant-scoped, completely paginated and never reads Ads accounts or APIs', async () => {
  assert.equal(typeof report.fetchSiteTrackingReport, 'function', 'Site reader is missing');
  let requests = 0, fail = false;
  const all = [contact('21'), contact('22', { utm_source: 'chatgpt.com' }), contact('23')];
  const client = createClient('https://fixture.invalid', 'fixture-key', { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: async (input, init) => {
    requests += 1;
    const url = new URL(input), table = url.pathname.split('/').at(-1);
    assert.equal(url.hostname, 'fixture.invalid'); assert.equal(init.method, 'GET');
    assert.ok(['cliente_whatsapp_contact', 'leads'].includes(table), 'no account or function calls');
    assert.equal(url.searchParams.get('cliente_id'), 'eq.site-fixture');
    if (fail) return new Response(JSON.stringify({ message: 'Fixture error' }), { status: 500 });
    const rows = table === 'leads' ? [] : all;
    const offset = Number(url.searchParams.get('offset') || 0), page = rows.slice(offset, offset + 1);
    return new Response(JSON.stringify(page), { headers: { 'Content-Type': 'application/json', 'Content-Range': `${offset}-${offset + page.length - 1}/${rows.length}` } });
  } } });
  const data = await report.fetchSiteTrackingReport(client, { clienteId: 'site-fixture', ...period });
  assert.equal(data.rows.length, 3);
  fail = true; await assert.rejects(report.fetchSiteTrackingReport(client, { clienteId: 'site-fixture', ...period }));
  const count = requests; await assert.rejects(report.fetchSiteTrackingReport(client, { clienteId: '', ...period }));
  assert.equal(requests, count);
});

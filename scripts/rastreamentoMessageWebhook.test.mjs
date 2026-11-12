import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { hasStoredContactAttribution } from '../supabase/functions/_shared/rastreamentoMessageAttribution.js';

const message = 'Olá! Vim do perfil e gostaria de agendar uma visita. [Não apagar]';
const client = 'client-fixture', channel = 'channel-fixture', jid = '5511987654321@s.whatsapp.net';
const link = { id: 'link-fixture', cliente_id: client, whatsapp_config_id: channel, is_active: true,
  initial_message: message, default_origin: 'site', default_utm_source: 'Linktree', default_utm_medium: 'clique',
  default_utm_campaign: 'visitas_ao_perfil' };
let db, conversions, outbound;
globalThis.Deno = { env: { get: (key) => ({ SUPABASE_URL: 'https://fixture.invalid', SUPABASE_SERVICE_ROLE_KEY: 'fixture' })[key] } };
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url) => {
  outbound.push(String(url));
  return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
};
globalThis.__fixtureClient = { rpc: async (name, args) => {
  if (name !== 'persist_ingress_contact_attribution') return { data: null, error: null };
  const rows = db.cliente_whatsapp_contact ||= [];
  let current = rows.find(row => row.cliente_id === args.p_cliente_id && row.from_jid === args.p_from_jid);
  const contact = structuredClone(args.p_contact), keep = {};
  if (hasStoredContactAttribution(current)) {
    for (const key of ['origin_source','utm_source','utm_medium','utm_campaign','utm_content','utm_term','tracking_data']) keep[key] = current[key] ?? null;
  } else contact.tracking_data = { ...current?.tracking_data, ...contact.tracking_data };
  for (const key of ['sender_name','profile_pic_url','phone']) {
    if (!contact[key] || key === 'sender_name' && contact.sender_name_is_fallback && current?.sender_name) contact[key] = current?.[key] || contact[key] || null;
  }
  delete contact.sender_name_is_fallback;
  if (!current) { current = { id: `contact-${rows.length}`, cliente_id: args.p_cliente_id, from_jid: args.p_from_jid }; rows.push(current); }
  Object.assign(current, contact, keep);
  const history = db.contact_attribution_history ||= [];
  for (const evidence of args.p_evidences) {
    if (!history.some(row => row.cliente_id === args.p_cliente_id && row.from_jid === args.p_from_jid && row.event_key === evidence.event_key)) {
      history.push({ ...structuredClone(evidence), cliente_id: args.p_cliente_id, from_jid: args.p_from_jid });
    }
  }
  return { data: structuredClone(current), error: null };
}, from(table) {
  let filters = [], single = false, action = '', values;
  const q = {
    select() { return q; }, eq(k, v) { filters.push((r) => r[k] === v); return q; },
    is(k, v) { filters.push((r) => (r[k] ?? null) === v); return q; },
    in(k, v) { filters.push((r) => v.includes(r[k])); return q; }, neq() { return q; },
    or() { return q; }, order() { return q; }, limit() { return q; },
    maybeSingle() { single = true; return q; }, single() { single = true; return q; },
    insert(v) { action = 'insert'; values = v; return q; }, upsert(v) { action = 'upsert'; values = v; return q; },
    update(v) { action = 'update'; values = v; return q; },
    then(resolve, reject) { return Promise.resolve().then(() => {
      const all = db[table] ||= [];
      let rows = all.filter((r) => filters.every((f) => f(r)));
      if (action === 'insert' || action === 'upsert') {
        const existing = action === 'upsert' ? all.find((r) => r.cliente_id === values.cliente_id &&
          (values.from_jid ? r.from_jid === values.from_jid : values.message_id ? r.message_id === values.message_id : false)) : null;
        const row = existing || { id: `${table}-${all.length}` };
        Object.assign(row, values); if (!existing) all.push(row); rows = [row];
      } else if (action === 'update') rows.forEach((r) => Object.assign(r, values));
      return { data: single ? rows[0] || null : rows, error: null };
    }).then(resolve, reject); },
  }; return q;
} };
globalThis.__fixtureConversion = (options) => { conversions.push(options); return Promise.resolve(); };

const stubs = {
  'server.ts': 'export const serve = handler => { globalThis.__fixtureHandler = handler; };',
  'supabase-js@2': 'export const createClient = () => globalThis.__fixtureClient;',
  'persistAdThumbnail.ts': 'export const attachStoredThumbnail = async (_, tracking) => tracking;',
  'applyRastreamentoConversion.ts': 'export const extractChatLabelsFromPayload = () => []; export const applyRastreamentoConversionFromWebhook = options => globalThis.__fixtureConversion(options);',
  'lojaIaAutoReply.ts': 'export const ensureLojaAtendConversa = async () => null; export const maybeLojaIaAutoReply = async () => null;',
  'googleAdsClickConversion.ts': 'export const maybeSendGoogleLeadSubmitted = async () => null;',
};
const plugin = { name: 'isolated-transports', setup(builder) {
  builder.onResolve({ filter: /.*/ }, (args) => {
    const key = Object.keys(stubs).find((suffix) => args.path.endsWith(suffix));
    return key ? { path: key, namespace: 'stub' } : null;
  });
  builder.onLoad({ filter: /.*/, namespace: 'stub' }, ({ path }) => ({ contents: stubs[path], loader: 'js' }));
} };
let cases = 0;
const directory = await mkdtemp(join(tmpdir(), 'planeje-utm-webhook-'));
try {
  for (const route of ['uazapi-inbox-webhook', 'crm-ingress-webhook']) {
    const built = await build({ entryPoints: [`supabase/functions/${route}/index.ts`], bundle: true,
      platform: 'node', format: 'esm', write: false, plugins: [plugin], logLevel: 'silent' });
    const compiled = join(directory, route + '.mjs');
    await writeFile(compiled, built.outputFiles[0].text);
    await import(pathToFileURL(compiled).href);
    for (const scenario of ['new', 'metadata', 'ambiguous', 'existing-meta', 'different-text']) {
      db = { clientes: [{ id: client, ingress_webhook_secret: 'fixture-secret' }],
        cliente_whatsapp_config: [{ id: channel, cliente_id: client, webhook_secret: 'fixture-secret', name: 'Canal' }],
        cliente_rastreamento_links: scenario === 'ambiguous' ? [link, { ...link, id: 'duplicate' }] : [link],
        cliente_whatsapp_contact: scenario === 'metadata' ? [{ id: 'existing', cliente_id: client, from_jid: jid,
          origin_source: 'nao_identificado', tracking_data: { owner_phone: '5511999999999', analysis_labels: ['keep'] } }]
          : scenario === 'existing-meta' ? [{ id: 'existing', cliente_id: client, from_jid: jid, origin_source: 'meta_ads', tracking_data: { ctwaClid: 'real-click' } }] : [],
      }; conversions = []; outbound = [];
      const body = route === 'uazapi-inbox-webhook'
        ? { event: 'messages', message: { chatid: jid, sender: jid, text: scenario === 'different-text' ? 'Olá, tudo bem?' : message,
          messageid: 'fixture-msg', type: 'text', fromMe: false }, owner: '5511999999999' }
        : { phone: '5511987654321', message: scenario === 'different-text' ? 'Olá, tudo bem?' : message,
          message_id: 'fixture-msg', name: 'Contato de teste', timestamp: '2026-10-14T15:00:00Z' };
      const req = new Request(`https://fixture.invalid/${route}?cliente_id=${client}&channel_id=${channel}&secret=fixture-secret`, {
        method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' },
      });
      const response = await globalThis.__fixtureHandler(req);
      assert.equal(response.status, 200, `${route} / ${scenario}: ${await response.text()}`);
      const contact = db.cliente_whatsapp_contact.find((r) => r.from_jid === jid);
      assert.ok(contact, `${route} / ${scenario}: contact missing`);
      if (['new', 'metadata'].includes(scenario)) {
        assert.equal(contact.utm_source, 'Linktree', `${route} / ${scenario}`);
        assert.equal(contact.utm_campaign, 'visitas_ao_perfil');
        assert.equal(contact.tracking_data.planeje_link_match_method, 'initial_message');
        assert.equal(contact.tracking_data.planeje_click_id, undefined);
        assert.equal(contact.tracking_data.ctwaClid, undefined);
        if (scenario === 'metadata') assert.deepEqual(contact.tracking_data.analysis_labels, ['keep']);
      } else if (scenario === 'existing-meta') {
        assert.equal(contact.tracking_data.ctwaClid, 'real-click');
        assert.equal(contact.utm_source ?? null, null);
      } else assert.equal(contact.utm_source ?? null, null);
      assert.ok(outbound.every((url) => ['fixture.invalid', '127.0.0.1'].includes(new URL(url).hostname)),
        `${route}: unexpected transport destination`);
      cases++;
    }
  }
  console.log(`PASS ${cases} isolated webhook attribution cases`);
} catch (error) {
  console.error(error.name + ': ' + error.message);
  process.exitCode = 1;
} finally { globalThis.fetch = originalFetch; await rm(directory, { recursive: true, force: true }); }

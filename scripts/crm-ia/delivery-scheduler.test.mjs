import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { sealCalendarToken } from '../../supabase/functions/_shared/crmIaCalendar.js';

const folder = await mkdtemp(join(tmpdir(), 'crm-ia-scheduler-'));
const output = join(folder, 'scheduler.mjs');
const originalFetch = globalThis.fetch;
const originalDeno = globalThis.Deno;
globalThis.Deno = { env: { get: name => ({ ATENDIMENTO_PLANEJAMENTO_CRON_SECRET: 'fixture', SUPABASE_URL: 'https://fixture.invalid', SUPABASE_SERVICE_ROLE_KEY: 'fixture-service' })[name] } };
await build({ entryPoints: ['supabase/functions/atendimento-planejamento-scheduler/index.ts'], outfile: output, bundle: true, format: 'esm', platform: 'node', plugins: [{ name: 'isolate-edge', setup(builder) {
  builder.onResolve({ filter: /^https:\/\// }, ({ path }) => ({ path, namespace: 'fixture-edge' }));
  builder.onLoad({ filter: /.*/, namespace: 'fixture-edge' }, ({ path }) => ({ contents: path.includes('supabase-js')
    ? 'export const createClient=()=>globalThis.__deliveryDb;'
    : 'export const serve=handler=>globalThis.__deliveryHandler=handler;' }));
} }] });
await import(pathToFileURL(output));

const client = '10000000-0000-0000-0000-000000000001';
const channel = '20000000-0000-0000-0000-000000000002';
const contact = '30000000-0000-0000-0000-000000000001';
const conversation = '50000000-0000-0000-0000-000000000001';
const stamp = new Date(Date.now() - 60000).toISOString();

function database() {
  const trace = [];
  const reminder = { id: 'reminder', cliente_id: client, conversation_id: conversation, whatsapp_config_id: channel, chat_jid: '5511999999999@s.whatsapp.net', body: 'Reminder fixture', scheduled_at: stamp, updated_at: stamp, status: 'pendente', kind: 'lembrete_whatsapp', delivery_state: 'pending' };
  const followup = { id: conversation, cliente_id: client, contact_id: contact, status: 'entrada', ia_pausada: false, setor_id: null, ia_followup_due_at: stamp, ia_followup_passo: 0, ia_followup_whatsapp_config_id: channel, updated_at: stamp, ia_followup_delivery_state: 'pending' };
  const agent = { id: 'agent', cliente_id: client, nome: 'Synthetic', ativo: true, auto_responder: true, setor_ids: [], updated_at: stamp, funil: { followup: { ativo: true, passos: [{ horas: 1, mensagem: 'Followup fixture' }] } } };
  const rows = { atendimento_conversa_planejamento: [reminder], cliente_atend_conversas: [followup], cliente_atend_ia_agentes: [agent], cliente_whatsapp_contact: [{ id: contact, from_jid: '5511999999999@s.whatsapp.net' }] };
  return { rows, trace, from(table) {
    const filters = []; let patch = null;
    const query = { select() { return query; }, update(value) { patch = value; return query; }, eq(key, value) { filters.push(row => row[key] === value); return query; },
      neq(key, value) { filters.push(row => row[key] !== value); return query; }, not(key) { filters.push(row => row[key] != null); return query; },
      lte(key, value) { filters.push(row => row[key] <= value); return query; }, order() { return query; }, limit() { return query; },
      maybeSingle() { return query.then(result => ({ ...result, data: result.data[0] || null })); },
      then(resolve, reject) { const selected = (rows[table] || []).filter(row => filters.every(filter => filter(row))); if (patch) selected.forEach(row => Object.assign(row, patch)); return Promise.resolve({ data: structuredClone(selected), error: null }).then(resolve, reject); } };
    return query;
  }, async rpc(name, args) {
    trace.push(name);
    if (name === 'get_encrypted_secret') return { data: null, error: null };
    if (name === 'crm_ia_calendar_service') { assert.equal(args.p_action, 'claim'); return { data: [], error: null }; }
    if (name === 'cliente_atend_loja_habilitada') return { data: true, error: null };
    if (name === 'crm_ia_delivery_claim') return { data: [], error: null };
    if (name === 'crm_ia_legacy_delivery_recover') return { data: { reminders: 0, followups: 0 }, error: null };
    const row = args.p_kind === 'reminder' ? reminder : followup;
    const stateKey = args.p_kind === 'reminder' ? 'delivery_state' : 'ia_followup_delivery_state';
    if (name === 'crm_ia_legacy_delivery_claim') {
      if (row[stateKey] !== 'pending') return { data: {}, error: null };
      row[stateKey] = 'sending'; row.claim_token = `claim-${args.p_kind}`;
      return { data: { id: row.id, claim_token: row.claim_token }, error: null };
    }
    if (name === 'crm_ia_legacy_delivery_recheck') return { data: { allowed: row[stateKey] === 'sending', cliente_id: client, whatsapp_config_id: channel, conversation_id: conversation, to: reminder.chat_jid, body: args.p_kind === 'reminder' ? reminder.body : 'Followup fixture' }, error: null };
    assert.equal(name, 'crm_ia_legacy_delivery_finish');
    row[stateKey] = args.p_status;
    if (args.p_kind === 'reminder') row.status = args.p_status === 'sent' ? 'concluido' : 'falhou';
    else if (args.p_status === 'sent') Object.assign(row, args.p_patch);
    else row.ia_followup_due_at = null;
    return { data: true, error: null };
  } };
}

test('two scheduler ticks claim legacy reminder and followup before sending on the stored channel', async () => {
  globalThis.__deliveryDb = database(); const sent = [];
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'https://fixture.invalid/functions/v1/uazapi-send-message');
    sent.push(JSON.parse(options.body));
    await new Promise(resolve => setImmediate(resolve));
    return new Response(JSON.stringify({ success: true, message_id: `receipt-${sent.length}` }));
  };
  const invoke = () => globalThis.__deliveryHandler(new Request('https://fixture.invalid/scheduler', { method: 'POST', headers: { 'x-atendimento-planejamento-secret': 'fixture' } }));
  const responses = await Promise.all([invoke(), invoke()]);
  assert.ok(responses.every(response => response.status === 200));
  assert.equal(sent.length, 2, 'one reminder and one followup, even with concurrent ticks');
  assert.ok(sent.every(payload => payload.whatsapp_config_id === channel));
  assert.equal(sent.find(payload => payload.planning_id === 'reminder')?.origem, 'atendimento-planejamento');
  assert.equal(sent.find(payload => payload.followup_conversation_id === conversation)?.origem, 'atendimento-ia');
  assert.ok(sent.every(payload => payload.claim_token));
  assert.ok(globalThis.__deliveryDb.trace.indexOf('crm_ia_calendar_service') >= 0);
  assert.ok(globalThis.__deliveryDb.trace.indexOf('crm_ia_calendar_service') < globalThis.__deliveryDb.trace.indexOf('crm_ia_delivery_claim'));
});

test('tick entrega legado antes do Google e aborta a sincronização lenta sem bloquear a fila CRM', async () => {
  const db = database(), rpc = db.rpc;
  const config = { clientId: 'fixture.apps.googleusercontent.com', clientSecret: 'fixture-calendar-secret' };
  const encrypted_token = await sealCalendarToken('fixture-refresh', config, { client, owner: 'fixture-owner' });
  db.rpc = async (name, args) => {
    if (name === 'get_encrypted_secret') return { data: ({ GOOGLE_DRIVE_CLIENT_ID: config.clientId, GOOGLE_DRIVE_CLIENT_SECRET: config.clientSecret })[args.p_secret_name] || null };
    if (name === 'crm_ia_calendar_service') {
      db.trace.push(name);
      if (args.p_action === 'claim') { assert.equal(args.p_payload.limit, 1); return { data: [{ id: 'calendar-job', lease: 'calendar-lease', cliente_id: client, owner_id: 'fixture-owner', encrypted_token }] }; }
      if (args.p_action === 'check') return { data: { allowed: true } };
      assert.equal(args.p_action, 'finish'); assert.equal(args.p_payload.status, 'failed'); return { data: { status: 'failed' } };
    }
    return rpc(name, args);
  };
  globalThis.__deliveryDb = db;
  let aborted = false, legacySent = 0;
  const originalTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (callback, milliseconds, ...args) => originalTimeout(callback, milliseconds === 12000 ? 5 : milliseconds, ...args);
  globalThis.fetch = async (url, options) => {
    if (url === 'https://fixture.invalid/functions/v1/uazapi-send-message') { legacySent++; return Response.json({ success: true, message_id: `legacy-${legacySent}` }); }
    assert.equal(url, 'https://oauth2.googleapis.com/token'); assert.equal(legacySent, 2);
    // Exercise a deadline that expires during setup, before fetch registers its listener.
    await new Promise(resolve => originalTimeout(resolve, 10));
    assert.equal(options.signal.aborted, true, 'the scheduler deadline must abort even before fetch starts');
    return new Promise((_, reject) => {
      const abort = () => { aborted = true; reject(options.signal.reason); };
      if (options.signal.aborted) abort();
      else options.signal.addEventListener('abort', abort, { once: true });
    });
  };
  try {
    const response = await globalThis.__deliveryHandler(new Request('https://fixture.invalid/scheduler', { method: 'POST', headers: { 'x-atendimento-planejamento-secret': 'fixture' } }));
    assert.equal(response.status, 200); assert.equal(aborted, true);
    assert.ok(db.trace.lastIndexOf('crm_ia_legacy_delivery_finish') < db.trace.indexOf('crm_ia_calendar_service'));
    assert.ok(db.trace.indexOf('crm_ia_calendar_service') < db.trace.indexOf('crm_ia_delivery_claim'));
  } finally { globalThis.setTimeout = originalTimeout; }
});

test('recuperação no_show reutiliza followup no canal fixado e chave determinística da versão, sem transporte legado', async () => {
  const db = database(), row = db.rows.cliente_atend_conversas[0];
  db.rows.atendimento_conversa_planejamento = [];
  Object.assign(row, { crm_ia_runtime: { active: true, no_show: { state: 'pending', appointment_id: 'appointment-fixture', appointment_updated_at: stamp } } });
  globalThis.__deliveryDb = db;
  const generated = [];
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'https://fixture.invalid/functions/v1/atendimento-ia');
    const payload = JSON.parse(options.body); generated.push(payload);
    assert.equal(payload.acao, 'followup'); assert.equal(payload.whatsapp_config_id, channel);
    assert.equal(payload.message_id, `no-show:appointment-fixture:${stamp}:1`);
    row.ia_followup_due_at = null;
    return Response.json({ queued: true });
  };
  const invoke = () => globalThis.__deliveryHandler(new Request('https://fixture.invalid/scheduler', { method: 'POST', headers: { 'x-atendimento-planejamento-secret': 'fixture' } }));
  assert.equal((await invoke()).status, 200); assert.equal((await invoke()).status, 200);
  assert.equal(generated.length, 1); assert.equal(db.trace.includes('crm_ia_legacy_delivery_claim'), false);
});

test.after(async () => {
  globalThis.fetch = originalFetch; globalThis.Deno = originalDeno;
  delete globalThis.__deliveryDb; delete globalThis.__deliveryHandler;
  await rm(folder, { recursive: true, force: true });
});

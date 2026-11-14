import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const work = await mkdtemp('/tmp/crm-capture-webhook-');
const output = join(work, 'webhook.mjs');
await build({ entryPoints: ['supabase/functions/uazapi-inbox-webhook/lojaIaAutoReply.ts'], outfile: output, bundle: true, format: 'esm', platform: 'node' });
const { maybeLojaIaAutoReply } = await import(pathToFileURL(output));
const originalFetch = globalThis.fetch;
const client = '10000000-0000-4000-8000-000000000011';
const channel = '10000000-0000-4000-8000-000000000021';
const contact = '10000000-0000-4000-8000-000000000031';
const jid = '5511999999999@s.whatsapp.net';

function fixture({ typed = false, captureError = null, captureThrows = false, skipped = null, missingChannel = false, missingContact = false } = {}) {
  const calls = [];
  const db = {
    async rpc(name, args) {
      if (name !== 'crm_ia_capture_inbound') return { data: true, error: null };
      calls.push({ kind: 'capture', args });
      if (captureThrows) throw Error('Synthetic source unavailable');
      return { data: { handled: true, captured: !skipped, lead_id: skipped ? null : 'synthetic-lead', skipped }, error: captureError };
    },
    from(table) {
      const rows = table === 'cliente_whatsapp_config' ? (missingChannel ? [] : [{ id: channel, cliente_id: client, provider: 'uazapi', archived_at: null }])
        : table === 'cliente_whatsapp_contact' ? (missingContact ? [] : [{ id: contact, cliente_id: client, from_jid: jid }])
          : table === 'cliente_atend_conversas' ? [{ id: 'conversation', cliente_id: client, contact_id: contact, status: 'esperando', ia_pausada: true, updated_at: '2026-11-11T10:00:00Z' }]
            : table === 'cliente_atend_ia_agentes' ? (typed ? [{ id: 'agent', cliente_id: client, ativo: true, auto_responder: true, funil: { crm_ia: { tipo: 'qualificacao' } } }] : []) : [];
      const filters = [];
      const query = {
        select() { return query; },
        eq(key, value) { filters.push(row => row[key] === value); return query; },
        is(key, value) { return query.eq(key, value); },
        order() { return query; },
        maybeSingle() { return query.then(result => ({ ...result, data: result.data[0] || null })); },
        then(resolve, reject) { return Promise.resolve({ data: rows.filter(row => filters.every(filter => filter(row))), error: null }).then(resolve, reject); },
      };
      return query;
    },
  };
  globalThis.fetch = async (url, init) => {
    assert.equal(url, 'https://fixture.invalid/functions/v1/atendimento-ia', 'Nenhum transporte real é permitido.');
    calls.push({ kind: 'response_runtime', payload: JSON.parse(init.body) });
    return Response.json({ typed: true, skipped: 'human_or_disabled', queued: false });
  };
  return {
    calls,
    run: patch => maybeLojaIaAutoReply({ supabase: db, supabaseUrl: 'https://fixture.invalid', serviceKey: 'fixture', clienteId: client,
      contactJid: jid, isGroup: false, fromMe: false, bodyText: 'Texto recebido sintético', whatsappConfigId: channel, messageId: 'provider-inbound', ...patch }),
  };
}

test('entrada chega à captura sem agente e não chama resposta/modelo/transporte', async () => {
  const f = fixture(); await f.run();
  assert.deepEqual(f.calls, [{ kind: 'capture', args: { p_client: client, p_channel: channel, p_contact: contact, p_message: 'provider-inbound' } }]);
});

test('captura usa só o ID confirmado e não depende de texto, transcrição ou agente', async () => {
  const f = fixture(); await f.run({ bodyText: '' });
  assert.equal(f.calls.length, 1);assert.equal(f.calls[0].kind, 'capture');
  assert.deepEqual(Object.keys(f.calls[0].args).sort(), ['p_channel', 'p_client', 'p_contact', 'p_message']);
  assert.equal(f.calls[0].args.p_message, 'provider-inbound');
});

test('grupo, eco, ID ausente e escopo não resolvido não chamam captura', async () => {
  for (const patch of [{ isGroup: true }, { fromMe: true }, { messageId: undefined }]) {
    const f = fixture(); await f.run(patch);assert.deepEqual(f.calls, []);
  }
  for (const options of [{ missingChannel: true }, { missingContact: true }]) {
    const f = fixture(options); await f.run();assert.deepEqual(f.calls, []);
  }
});

test('erro de captura impede resposta por caminho incerto, sem fallback ou repetição', async () => {
  for (const options of [{ captureError: { message: 'Synthetic source unavailable' } }, { captureThrows: true }]) {
    const f = fixture({ typed: true, ...options }); await f.run();
    assert.equal(f.calls.length, 1);assert.equal(f.calls[0].kind, 'capture');
  }
});

test('mensagem antiga, ausente ou escopo recusado não chegam à resposta', async () => {
  for (const skipped of ['message_changed', 'message_required', 'scope']) {
    const f = fixture({ typed: true, skipped }); await f.run();
    assert.equal(f.calls.length, 1);assert.equal(f.calls[0].kind, 'capture');
  }
});

test('captura desligada não desliga o caminho de resposta já autorizado', async () => {
  const f = fixture({ typed: true, skipped: 'capture_disabled' }); await f.run();
  assert.deepEqual(f.calls.map(item => item.kind), ['capture', 'response_runtime']);
  assert.equal(f.calls[1].payload.message_id, 'provider-inbound');
  assert.equal(f.calls[1].payload.whatsapp_config_id, channel);
});

test.after(async () => { globalThis.fetch = originalFetch; await rm(work, { recursive: true, force: true }); });

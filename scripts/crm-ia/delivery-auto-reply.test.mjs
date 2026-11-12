import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const folder = await mkdtemp(join(tmpdir(), 'crm-ia-auto-reply-'));
const output = join(folder, 'reply.mjs');
await build({ entryPoints: ['supabase/functions/uazapi-inbox-webhook/lojaIaAutoReply.ts'], outfile: output, bundle: true, format: 'esm', platform: 'node' });
const { maybeLojaIaAutoReply } = await import(pathToFileURL(output));
const originalFetch = globalThis.fetch;
const client = '10000000-0000-0000-0000-000000000001', channel = '20000000-0000-0000-0000-000000000002', contact = '30000000-0000-0000-0000-000000000001';
const stamp = '2026-11-11T10:00:00.000Z';

function fixture({ afterModel, afterSend } = {}) {
  const conversation = { id: 'conversation', cliente_id: client, contact_id: contact, status: 'esperando', ia_pausada: false, updated_at: stamp };
  const agent = { id: 'agent', cliente_id: client, nome: 'Fixture', ativo: true, auto_responder: true, setor_ids: [], funil: { followup: { ativo: true, passos: [{ horas: 1, mensagem: 'Synthetic followup' }] } } };
  const payloads = [];
  const db = { async rpc() { return { data: true, error: null }; }, from(table) {
    const rows = table === 'cliente_atend_conversas' ? [conversation] : table === 'cliente_atend_ia_agentes' ? [agent]
      : table === 'cliente_whatsapp_config' ? [{ id: channel, cliente_id: client, archived_at: null, provider: 'uazapi' }]
      : [{ id: contact, cliente_id: client, from_jid: '5511999999999@s.whatsapp.net' }];
    const filters = []; let patch = null;
    const query = { select() { return query; }, eq(key, value) { filters.push(row => row[key] === value); return query; }, is(key, value) { filters.push(row => row[key] === value); return query; },
      update(value) { patch = value; return query; }, order() { return query; }, limit() { return query; },
      maybeSingle() { return query.then(result => ({ ...result, data: result.data[0] || null })); },
      then(resolve, reject) { const selected = rows.filter(row => filters.every(filter => filter(row))); if (patch) selected.forEach(row => Object.assign(row, patch)); return Promise.resolve({ data: structuredClone(selected), error: null }).then(resolve, reject); } };
    return query;
  } };
  globalThis.fetch = async (url, options) => {
    const payload = JSON.parse(options.body); payloads.push({ url, payload });
    if (url.endsWith('/atendimento-ia')) {
      afterModel?.(conversation);
      return new Response(JSON.stringify({ ok: true, resposta: 'Synthetic reply', agente: { id: agent.id, funil: agent.funil } }));
    }
    assert.ok(url.endsWith('/uazapi-send-message'));
    afterSend?.(conversation);
    return new Response(JSON.stringify({ success: true, message_id: 'receipt' }));
  };
  return { conversation, payloads, run: () => maybeLojaIaAutoReply({ supabase: db, supabaseUrl: 'https://fixture.invalid', serviceKey: 'fixture', clienteId: client, contactJid: '5511999999999@s.whatsapp.net', isGroup: false, fromMe: false, bodyText: 'Synthetic incoming', whatsappConfigId: channel }) };
}

test('reply generation and next followup preserve the originating channel', async () => {
  const f = fixture(); await f.run();
  assert.equal(f.payloads[0].payload.whatsapp_config_id, channel, 'context endpoint must receive the exact channel');
  assert.equal(f.conversation.ia_followup_whatsapp_config_id, channel);
  assert.equal(f.conversation.ia_followup_delivery_state, 'pending');
});

test('human pause while the model runs prevents transport', async () => {
  const f = fixture({ afterModel: conversation => Object.assign(conversation, { ia_pausada: true, updated_at: '2026-11-11T10:00:01.000Z' }) });
  await f.run();
  assert.equal(f.payloads.filter(item => item.url.endsWith('/uazapi-send-message')).length, 0);
  assert.equal(f.conversation.ia_pausada, true);
});

test('a human pause during transport is preserved by the reply write', async () => {
  const f = fixture({ afterSend: conversation => Object.assign(conversation, { ia_pausada: true, updated_at: '2026-11-11T10:00:02.000Z' }) });
  await f.run();
  assert.equal(f.conversation.ia_pausada, true);
  assert.equal(f.conversation.updated_at, '2026-11-11T10:00:02.000Z');
});

test.after(async () => { globalThis.fetch = originalFetch; await rm(folder, { recursive: true, force: true }); });

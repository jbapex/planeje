import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const folder = await mkdtemp('/tmp/crm-voice-webhook-'), output = join(folder, 'helper.mjs');
const client = '00000000-0000-4000-8000-000000000011', channel = '00000000-0000-4000-8000-000000000021', contact = '00000000-0000-4000-8000-000000000031';
const jid = '551199999999@s.whatsapp.net', originalFetch = globalThis.fetch;
await build({ entryPoints: ['supabase/functions/uazapi-inbox-webhook/lojaIaAutoReply.ts'], outfile: output, bundle: true, format: 'esm', platform: 'node' });
const { maybeLojaIaAutoReply } = await import(pathToFileURL(output));
function database(type) { return { async rpc() { return { data: true }; }, from(table) {
  const rows = table === 'cliente_whatsapp_config' ? [{ id: channel, cliente_id: client, provider: 'uazapi', archived_at: null }]
    : table === 'cliente_whatsapp_contact' ? [{ id: contact, cliente_id: client, from_jid: jid }]
      : table === 'cliente_atend_ia_agentes' ? [{ id: 'agent', ativo: true, auto_responder: true, cliente_id: client, funil: { crm_ia: { tipo: 'qualificacao' } } }]
        : table === 'cliente_whatsapp_inbox' ? [{ type, message_id: 'voice-inbound', cliente_id: client, whatsapp_config_id: channel, is_group: false, from_jid: jid, chat_jid: jid }] : [];
  const filters = []; const q = { select() { return q; }, eq(key, value) { filters.push(row => row[key] === value); return q; }, is(key, value) { return q.eq(key, value); }, or() { return q; }, order() { return q; },
    maybeSingle() { return q.then(result => ({ data: result.data[0] || null })); }, then(resolve,reject) { return Promise.resolve({ data: rows.filter(row => filters.every(filter => filter(row))) }).then(resolve,reject); } };return q;
} }; }
test('mensagem de voz sem body chega ao runtime pelo ID e canal exatos; imagem/grupo/eco não', async () => {
  const calls = [];
  globalThis.fetch = async (url, init) => { assert.equal(url, 'https://fixture.invalid/functions/v1/atendimento-ia');calls.push(JSON.parse(init.body));return Response.json({ typed: true, skipped: 'fixture' }); };
  const run = (type, patch = {}) => maybeLojaIaAutoReply({ supabase: database(type), supabaseUrl: 'https://fixture.invalid', serviceKey: 'fixture', clienteId: client,
    contactJid: jid, isGroup: false, fromMe: false, bodyText: '', whatsappConfigId: channel, messageId: 'voice-inbound', ...patch });
  await run('audio');
  assert.deepEqual(calls, [{ acao: 'responder', cliente_id: client, contact_id: contact, whatsapp_config_id: channel, message_id: 'voice-inbound' }]);
  await run('image');await run('audio', { isGroup: true });await run('audio', { fromMe: true });
  assert.equal(calls.length, 1);
});
test.after(async () => { globalThis.fetch = originalFetch;await rm(folder,{ recursive:true,force:true }); });

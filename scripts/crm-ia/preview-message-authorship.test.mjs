import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import test from 'node:test';
import { createCrmPreview, PREVIEW_IDS as ids } from './preview/fixture.js';

const scope = { contact_id: ids.contactA, channel_id: ids.channelA };
const humanId = '81111111-1111-4111-8111-111111111111';
const legacyId = '82111111-1111-4111-8111-111111111111';
const automationId = '83111111-1111-4111-8111-111111111111';
const mismatchedBodyId = '84111111-1111-4111-8111-111111111111';
const mismatchedChannelId = '85111111-1111-4111-8111-111111111111';
const setup = state => createCrmPreview({ state: state || 'autoria-mensagens', now: '2026-11-11T12:00:00Z' });
const previousFetch = globalThis.fetch;
globalThis.fetch = async () => { throw Error('Rede externa bloqueada no cenário sintético de autoria.'); };

test('cenário expõe autor humano comprovado, IA e fotos locais sem usar o atendente atual', async () => {
  const p = setup(), messages = await p.request('messages', ids.clientA, { ...scope, limit: 50 });
  const human = messages.rows.find(row => row.id === humanId);
  assert.ok(human, 'Resposta humana comprovada presente na página recente.');
  assert.equal(human.sender_kind, 'human'); assert.equal(human.sender_name, 'Luana de demonstração');
  assert.equal(human.can_flag, false); assert.equal(human.my_flag, null);
  assert.match(human.avatar_url, /src\/assets\/cs-ia\/cs-ia-avatar-v1\.png$/);
  assert.ok(existsSync(new URL(human.avatar_url)));
  const incoming = messages.rows.find(row => !row.from_me);
  assert.equal(incoming.sender_kind, 'contact'); assert.equal(incoming.sender_name, 'Pessoa fictícia Alfa');
  assert.match(incoming.avatar_url, /src\/assets\/crm-ia\/crm-ia-avatar-v1\.png$/);
  assert.ok(existsSync(new URL(incoming.avatar_url)));
  assert.notEqual(incoming.avatar_url, human.avatar_url);
  const conversation = (await p.request('conversations', ids.clientA, scope)).rows[0];
  assert.equal(conversation.profile_pic_url, incoming.avatar_url); assert.equal(messages.state.profile_pic_url, incoming.avatar_url);
  const ai = messages.rows.find(row => row.can_flag);
  assert.ok(ai); assert.equal(ai.sender_kind, 'ai'); assert.equal(ai.sender_name, 'IA'); assert.equal(ai.avatar_url, null);
  const raw = p.snapshot().accounts.find(account => account.client.id === ids.clientA);
  const sent = raw.messages.find(row => row.id === humanId);
  const receipt = raw.queue.find(row => row.provider_message_id === sent.message_id);
  assert.equal(receipt.kind, 'manual'); assert.equal(receipt.status, 'sent'); assert.equal(receipt.agent_run_id, null);
  assert.equal(receipt.created_by, sent.sent_by); assert.equal(receipt.cliente_id, ids.clientA);
  assert.equal(receipt.contact_id, scope.contact_id); assert.equal(receipt.whatsapp_config_id, scope.channel_id);
  assert.equal(receipt.body, sent.body); assert.equal(sent.cliente_id, ids.clientA);
  await p.request('save_conversation', ids.clientA, { ...scope, attendance: 'human', assigned_to: ids.otherPerson, expected_updated_at: conversation.updated_at });
  p.profile.id = ids.otherPerson;
  const refreshed = await p.request('messages', ids.clientA, scope);
  assert.equal(refreshed.rows.find(row => row.id === humanId).sender_name, 'Luana de demonstração');
  assert.equal(refreshed.state.assigned_to, ids.otherPerson);
  assert.equal((await p.request('workspace', ids.clientA)).config.data.attendance.auto_send, false);
});

test('legado e provas falsas não recebem nome ou foto de uma pessoa nem permissão de sinalizar IA', async () => {
  const p = setup(), { rows } = await p.request('messages', ids.clientA, { ...scope, limit: 50 });
  for (const id of [legacyId, mismatchedBodyId, mismatchedChannelId]) {
    const row = rows.find(row => row.id === id); assert.ok(row, id);
    assert.equal(row.sender_kind, 'unknown', id); assert.equal(row.sender_name, null, id); assert.equal(row.avatar_url, null, id);
    assert.equal(row.can_flag, false, id);
    await assert.rejects(p.request('flag_ai_message', ids.clientA, { ...scope, sent_id: id, category: 'other' }), error => error.code === '42501');
  }
  const automation = rows.find(row => row.id === automationId);
  assert.ok(automation); assert.equal(automation.sender_kind, 'automation'); assert.equal(automation.sender_name, 'Automação'); assert.equal(automation.avatar_url, null);
  const raw = p.snapshot().accounts.find(account => account.client.id === ids.clientA);
  for (const [id, field] of [[mismatchedBodyId, 'body'], [mismatchedChannelId, 'whatsapp_config_id']]) {
    const sent = raw.messages.find(row => row.id === id), receipt = raw.queue.find(row => row.provider_message_id === sent.message_id);
    assert.ok(receipt); assert.equal(sent.sent_by, ids.person); assert.notEqual(receipt[field], field === 'body' ? sent.body : scope.channel_id);
  }
});

test('histórico tem duas páginas cronológicas sem repetição e mantém canal e conta separados', async () => {
  const p = setup(), recent = await p.request('messages', ids.clientA, { ...scope, offset: 0, limit: 50 });
  assert.equal(recent.total, 64); assert.equal(recent.rows.length, 50);
  const older = await p.request('messages', ids.clientA, { ...scope, offset: 50, limit: 50 });
  assert.equal(older.total, 64); assert.equal(older.rows.length, 14);
  assert.equal(new Set([...recent.rows, ...older.rows].map(row => row.id)).size, 64);
  for (const page of [recent, older]) assert.deepEqual(page.rows.map(row => row.created_at), page.rows.map(row => row.created_at).sort());
  assert.ok(older.rows.at(-1).created_at < recent.rows[0].created_at);
  const second = await p.request('messages', ids.clientA, { ...scope, channel_id: ids.channelA2 });
  assert.equal(second.total, 1); assert.equal(second.rows[0].body, 'Mensagem sintética exclusiva do segundo canal.');
  assert.equal(second.rows[0].sender_kind, 'contact'); assert.equal(second.state.channel_id, ids.channelA2);
  await assert.rejects(p.request('messages', ids.clientB, scope), error => error.code === '42501');
  await assert.rejects(p.request('messages', ids.clientA, { ...scope, channel_id: ids.channelB }), error => error.code === '42501');
  const other = await p.request('messages', ids.clientB, { contact_id: ids.contactB, channel_id: ids.channelB });
  assert.equal(other.total, 2); assert.equal(other.rows.find(row => row.from_me).sender_kind, 'unknown');
});

test('cenários anteriores preservam IDs e a prova usada na sinalização de IA', async () => {
  const ready = setup('ready'), raw = ready.snapshot().accounts.find(account => account.client.id === ids.clientA);
  assert.deepEqual(raw.messages.map(row => row.id), ['00000000-0000-4000-8000-0000000003eb', '00000000-0000-4000-8000-0000000003ec', '00000000-0000-4000-8000-0000000003ed']);
  const controls = setup('controles-conversa'), before = await controls.request('messages', ids.clientA, scope);
  const ai = before.rows.find(row => row.can_flag); assert.ok(ai); assert.equal(ai.sender_kind, 'ai');
  const flag = await controls.request('flag_ai_message', ids.clientA, { ...scope, sent_id: ai.id, category: 'too_long', note: 'Observação sintética.' });
  const after = (await controls.request('messages', ids.clientA, scope)).rows.find(row => row.id === ai.id);
  assert.equal(after.can_flag, true); assert.equal(after.my_flag.id, flag.id);
  for (const state of ['origem-ia-adulterada', 'origem-ia-duplicada']) {
    const invalid = await setup(state).request('messages', ids.clientA, scope);
    assert.ok(invalid.rows.filter(row => row.from_me).every(row => row.sender_kind === 'automation' && !row.can_flag));
  }
});

test.after(() => { globalThis.fetch = previousFetch; });

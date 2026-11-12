import assert from 'node:assert/strict';
import test from 'node:test';
import { createCrmPreview, PREVIEW_IDS as ids } from './preview/fixture.js';

const A = ids.clientA, B = ids.clientB;
const scope = { contact_id: ids.contactA, channel_id: ids.channelA };
const setup = () => createCrmPreview({ state: 'controles-conversa', now: '2026-11-11T12:00:00Z' });

test('feed da prévia preserva snapshot integral e eventos posteriores, por pessoa e conta', async () => {
  const p = setup(), first = await p.request('notifications', A, { limit: 1 });
  assert.equal(first.rows.length, 1); assert.equal(first.total, 3); assert.equal(first.unread_count, 3);
  assert.equal((await p.request('notifications', A, { offset: 1, limit: 1 })).snapshot.id, first.snapshot.id);
  assert.equal((await p.request('mark_notifications_read', A, { snapshot_id: first.snapshot.id })).marked, 3);
  const newer = await p.request('save_lead', A, { nome: 'Novo registro fictício', whatsapp: '5511000000033' });
  assert.equal((await p.request('mark_notifications_read', A, { snapshot_id: first.snapshot.id })).marked, 0);
  const after = await p.request('notifications', A);
  assert.equal(after.unread_count, 1); assert.equal(after.rows.find(row => row.lead_id === newer.id).read, false);
  await assert.rejects(p.request('mark_notifications_read', B, { snapshot_id: first.snapshot.id }), error => error.code === '40001');
  p.profile.id = ids.otherPerson;
  assert.equal((await p.request('notifications', A)).unread_count, 4);
});

test('contexto da prévia usa vínculo explícito único e não escolhe entre oportunidades ambíguas', async () => {
  const p = setup(), context = await p.request('conversation_context', A, scope);
  assert.equal(context.status, 'linked'); assert.equal(context.lead.id, ids.leadA);
  await assert.rejects(p.request('conversation_context', B, scope), error => error.code === '42501');
  const second = await p.request('save_lead', A, { nome: 'Segunda oportunidade fictícia', whatsapp: context.lead.whatsapp });
  await p.request('open_conversation', A, { id: second.id, expected_updated_at: second.updated_at, channel_id: ids.channelA, chat_jid: `${second.whatsapp}@s.whatsapp.net` });
  assert.deepEqual(await p.request('conversation_context', A, scope), { status: 'ambiguous', lead: null });
  assert.equal((await p.request('conversations', A, scope)).rows[0].lead_id, null);
});

test('sinalização sintética exige recibo IA, preserva pessoa e compara versão', async () => {
  const p = setup(), before = await p.request('messages', A, scope);
  const ai = before.rows.find(row => row.can_flag), incoming = before.rows.find(row => !row.from_me);
  assert.ok(ai); assert.equal(ai.my_flag, null);
  const payload = { ...scope, sent_id: ai.id, category: 'too_long', note: 'Observação fictícia.' };
  const saved = await p.request('flag_ai_message', A, payload);
  assert.equal((await p.request('flag_ai_message', A, payload)).updated_at, saved.updated_at);
  assert.equal((await p.request('messages', A, scope)).rows.find(row => row.id === ai.id).my_flag.note, payload.note);
  await assert.rejects(p.request('flag_ai_message', A, { ...payload, note: 'Alteração sem versão' }), error => error.code === '40001');
  await assert.rejects(p.request('flag_ai_message', A, { ...payload, sent_id: incoming.id }), error => error.code === '42501');
  await assert.rejects(p.request('flag_ai_message', A, { ...payload, category: 'inventada' }), /categoria/i);
  await assert.rejects(p.request('flag_ai_message', A, { ...payload, actor_id: ids.otherPerson }), /autor|dados|campo/i);
  p.profile.id = ids.otherPerson;
  assert.equal((await p.request('messages', A, scope)).rows.find(row => row.id === ai.id).my_flag, null);
});

test('prévia recusa corpo adulterado e ID do provedor duplicado na sinalização', async () => {
  for (const state of ['origem-ia-adulterada', 'origem-ia-duplicada']) {
    const p = createCrmPreview({ state, now: '2026-11-11T12:00:00Z' });
    const messages = await p.request('messages', A, scope);
    const outgoing = messages.rows.filter(row => row.from_me);
    assert.ok(outgoing.length); assert.ok(outgoing.every(row => row.can_flag === false));
    await assert.rejects(p.request('flag_ai_message', A, { ...scope, sent_id: outgoing[0].id, category: 'other' }), error => error.code === '42501');
    assert.ok(outgoing.every(row => row.sender_kind === 'automation'), 'A origem legada continua visível como automação.');
  }
});

test('horário divergente não reutiliza tentativa, enquanto repetição idêntica conserva a fila', async () => {
  const p = setup(), payload = { ...scope, request_id: '88888888-8888-4888-8888-888888888888', body: 'Texto fictício sem transporte.', scheduled_at: '2026-11-18T12:00:00Z' };
  const saved = await p.request('schedule_message', A, payload);
  assert.equal((await p.request('schedule_message', A, { ...payload, scheduled_at: '2026-11-18T09:00:00-03:00' })).id, saved.id);
  await assert.rejects(p.request('schedule_message', A, { ...payload, scheduled_at: '2026-11-19T12:00:00Z' }), error => error.code === '40001');
});

test('prévia mantém compatibilidade do imediato legado sem alterar ou duplicar reserva', async () => {
  const p = setup(), payload = { ...scope, request_id: '99999999-9999-4999-8999-999999999999', body: 'Imediato sintético legado.', scheduled_at: '2026-11-11T11:59:59Z' };
  const before = (await p.request('queue', A)).total;
  const saved = await p.request('schedule_message', A, payload);
  const replay = await p.request('schedule_message', A, { ...payload, scheduled_at: '2026-11-11T11:59:59.500Z' });
  assert.deepEqual(replay, saved); assert.equal((await p.request('queue', A)).total, before + 1);
  await assert.rejects(p.request('schedule_message', A, { ...payload, scheduled_at: '2026-11-12T12:00:00Z' }), error => error.code === '40001');
  await assert.rejects(p.request('schedule_message', A, { ...payload, request_id: '77777777-7777-4777-8777-777777777777', scheduled_at: '2026-11-11T11:57:59Z' }), /data/i);
});

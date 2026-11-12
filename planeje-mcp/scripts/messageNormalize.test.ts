import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeMessageRow } from '../src/messageNormalize.js';

const CLIENT = '10000000-0000-4000-8000-000000000001';
const LOG = 'cliente_whatsapp_webhook_log';
const INBOX = 'cliente_whatsapp_inbox';
const SENT = 'cliente_whatsapp_sent';
const PHONE = '5511999990000';
const JID = PHONE + '@s.whatsapp.net';
const CREATED = '2026-10-29T12:00:00.000000Z';
const row = (raw_payload: unknown, extra = {}) => ({ id: 'row-id', created_at: CREATED, raw_payload, ...extra });
const normalize = (payload: unknown, extra = {}) => normalizeMessageRow(LOG, row(payload, extra), CLIENT);

test('explicit-zone timestamps accept SQL spacing and compact offsets without guessing absent zones', () => {
  for (const value of ['2026-10-01 10:00:00-0300', '2026-10-01T10:00:00-03']) {
    const [m] = normalize({ eventType: 'USER_MESSAGE_RECEIVED', userMessage: 'hi', createdAt: value });
    assert.equal(m!.horario_origem, 'provedor');
    assert.equal(Date.parse(m!.em), Date.parse('2026-10-01T13:00:00Z'));
  }
  const [unknown] = normalize({ eventType: 'USER_MESSAGE_RECEIVED', userMessage: 'hi', createdAt: '2026-10-01 10:00:00' });
  assert.equal(unknown!.horario_origem, 'registro');
  assert.equal(normalize({ eventType: 'USER_MESSAGE_RECEIVED', userMessage: 'hi', createdAt: '2026-02-30T10:00:00Z' })[0]!.horario_origem, 'registro');
});

test('authorship uses persisted server evidence, never API transport or null sender as proof of automation', () => {
  const outgoing = (extra: Record<string, unknown>) => normalizeMessageRow(SENT, row(null, { body: 'hi', ...extra }), CLIENT)[0]!;
  assert.equal(outgoing({ sent_by: 'actor' }).autoria.tipo, 'humano');
  assert.equal(outgoing({ sender_kind: 'automation' }).autoria.tipo, 'automacao');
  assert.equal(outgoing({ sender_kind: 'automation', sent_by: 'actor' }).autoria.tipo, 'nao_identificado');
  assert.equal(outgoing({ sent_by: null }).autoria.tipo, 'nao_identificado');
  assert.equal(normalize({ body: 'hi', fromMe: true, wasSentByApi: true })[0]!.autoria.tipo, 'nao_identificado');
});

test('canonical rows preserve full body, legacy aliases and explicit metadata without raw payload or credentials', () => {
  const body = '  original\n' + 'x'.repeat(12000) + '\n  end';
  const input = row({ token: 'secret', arbitrary: 'secret' }, { body, type: 'text', phone: PHONE,
    from_jid: JID, sender_name: 'Fixture', message_id: 'provider-id', msg_timestamp: '2026-10-28T10:00:00.123456Z',
    conversation_id: 'conversation', sender_jid: JID, sent_by: 'user-id', ack_status: 'read', token: 'secret' });
  const [message] = normalizeMessageRow(INBOX, input, CLIENT);
  assert.equal(message!.texto, body);
  assert.equal(message!.em, '2026-10-28T10:00:00.123456Z');
  assert.equal(message!.horario_origem, 'provedor');
  assert.equal(message!.message_id, 'provider-id');
  assert.equal(message!.phone, PHONE);
  assert.equal(message!.from_jid, JID);
  assert.equal(message!.type, 'text');
  assert.equal(message!.sender_name, 'Fixture');
  assert.equal(message!.created_at, CREATED);
  assert.ok(!JSON.stringify(message).includes('secret'));
  const [sent] = normalizeMessageRow(SENT, { ...input, msg_timestamp: undefined, raw_payload: null }, CLIENT);
  assert.equal(sent!.lado, 'equipe');
  assert.equal(sent!.sent_by, 'user-id');
  assert.equal(sent!.ack_status, 'read');
  assert.equal(sent!.texto, body);
});

test('Chatvolt emits lead and team speech with stable indices, but never blocked/noted/system events', () => {
  const payload = { eventType: 'AGENT_USER_MESSAGE', userPhoneNumber: PHONE, userMessage: '  pergunta  ',
    agentResponse: '  resposta  ', messageId: 'same-event-id', createdAt: '2026-10-01T10:00:00Z', channel: 'zapperapi' };
  const messages = normalize(payload);
  assert.deepEqual(messages.map(m => [m.lado, m.texto, m.evento_indice]), [['lead', '  pergunta  ', 0], ['equipe', '  resposta  ', 1]]);
  assert.ok(messages.every(m => m.canal === 'zapperapi' && m.provedor === 'chatvolt' && m.em === payload.createdAt));
  assert.equal(normalize({ ...payload, eventType: 'USER_MESSAGE_RECEIVED' }).length, 1);
  assert.equal(normalize({ ...payload, eventType: 'AGENT_MESSAGE_SENDED' })[0]!.texto, payload.agentResponse);
  for (const eventType of ['AGENT_MESSAGE_BLOCKED', 'AGENT_MESSAGE_NOTED', 'STEP_ENTERED', 'NPS_INTERACTION']) {
    assert.deepEqual(normalize({ ...payload, eventType }), []);
  }
});

test('disabled Chatvolt control response never becomes team speech or steals the incoming audio', () => {
  const payload = { eventType: 'AGENT_USER_MESSAGE', channel: 'zapperapi', userPhoneNumber: PHONE, messageId: 'input',
    userMessage: 'incoming transcription', agentResponse: '#ai-disabled', isAiEnabled: false,
    attachments: [{ url: 'https://cdn.example.invalid/input.ogg', mimeType: 'audio/ogg' }] };
  const messages = normalize(payload);
  assert.equal(messages.length, 1);
  assert.equal(messages[0]!.lado, 'lead');
  assert.equal(messages[0]!.tipo, 'audio');
  assert.equal(messages[0]!.anexos.length, 1);
  assert.equal(normalizeMessageRow(INBOX, row(payload, { message_id: 'input', body: 'incoming transcription', type: 'text' }), CLIENT)[0]!.tipo, 'audio');
  assert.deepEqual(normalizeMessageRow(SENT, row(payload, { message_id: 'input', body: '#ai-disabled' }), CLIENT), []);
  const literal = normalize({ ...payload, eventType: 'AGENT_MESSAGE_SENDED', agentResponse: 'Use #ai-disabled neste exemplo' });
  assert.equal(literal[0]!.texto, 'Use #ai-disabled neste exemplo');
  assert.equal(normalize({ ...payload, agentResponse: 'Use #ai-disabled neste exemplo' })[1]!.texto, 'Use #ai-disabled neste exemplo');
});

test('attachments of a combined Chatvolt response remain event evidence when their speaker is unproven', () => {
  const messages = normalize({ eventType: 'AGENT_USER_MESSAGE', userMessage: 'question', agentResponse: 'reply', isAiEnabled: true,
    attachments: [{ mimeType: 'audio/ogg', url: 'https://cdn.example.invalid/voice.ogg' }] });
  assert.equal(messages.length, 2);
  assert.ok(messages.every(m => m.anexos.length === 0 && m.tipo === 'text'));
  assert.ok(messages.every(m => m.contexto_chatvolt!.anexos_nao_atribuidos.length === 1));
  const purged = normalize({ eventType: 'AGENT_USER_MESSAGE', userMessage: 'q', agentResponse: 'r', _mediaPurged: true,
    attachments: [{ mimeType: 'audio/ogg', url: 'https://cdn.example.invalid/voice.ogg' }] });
  assert.ok(purged.every(m => m.contexto_chatvolt!.anexos_nao_atribuidos.length === 0));
});

test('Chatvolt exposes allowlisted context without treating an assignee or enabled flag as message authorship', () => {
  const base = { eventType: 'AGENT_MESSAGE_SENDED', agentResponse: 'Reply', channel: 'whatsapp', isAiEnabled: false,
    agentId: 'ai', agentName: 'Assistant', assignee: 'assigned-user', assigneeName: 'Assigned person', token: 'secret' };
  const [manual] = normalize(base);
  assert.equal(manual!.autoria.tipo, 'nao_identificado');
  assert.equal(manual!.contexto_chatvolt!.responsavel_atribuido!.id, 'assigned-user');
  assert.equal(manual!.contexto_chatvolt!.ia_habilitada, false);
  const [ai] = normalize({ ...base, eventType: 'AGENT_USER_MESSAGE', isAiEnabled: true });
  assert.equal(ai!.autoria.tipo, 'automacao');
  assert.ok(!JSON.stringify(manual).includes('secret'));
});

test('phone-less Chatvolt keeps exact conversation and organization for caller resolution, never owner phone', () => {
  const [message] = normalize({ eventType: 'AGENT_MESSAGE_FOLLOW_UP', agentResponse: 'Reply', conversationId: 'external-conv',
    organizationId: 'external-org', owner: PHONE, createdAt: 'invalid', channel: 'whatsapp' });
  assert.equal(message!.telefone, null);
  assert.equal(message!.chat_jid, null);
  assert.equal(message!.conversation_id, 'external-conv');
  assert.equal(message!.chatvolt_organization_id, 'external-org');
  assert.equal(message!.em, CREATED);
  assert.equal(message!.horario_origem, 'registro');
  assert.equal(message!.message_id, null);
});

function meta(messages: unknown[], echoes: unknown[] = []) {
  return { object: 'whatsapp_business_account', entry: [{ changes: [
    { field: 'messages', value: { metadata: { phone_number_id: 'account-id' },
      contacts: [{ wa_id: PHONE, profile: { name: 'Lead' } }], messages } },
    { field: 'smb_message_echoes', value: { message_echoes: echoes } },
    { field: 'messages', value: { statuses: [{ id: 'status-id', status: 'delivered' }] } },
  ] }] };
}
test('Meta batches retain every received message and echo with provider IDs, direction and original timestamp', () => {
  const payload = meta([
    { id: 'wamid.1', from: PHONE, type: 'text', text: { body: '  one\n  ' }, timestamp: '1790848800' },
    { id: 'wamid.2', from: PHONE, type: 'audio', audio: { id: 'media-1', mime_type: 'audio/ogg' }, timestamp: 1790848800000 },
  ], [{ id: 'wamid.3', to: PHONE, type: 'template', template: { f3_rendered_text: 'Full template' }, timestamp: '1790848801' }]);
  const messages = normalize(payload);
  assert.deepEqual(messages.map(m => [m.message_id, m.lado, m.evento_indice]), [['wamid.1', 'lead', 0], ['wamid.2', 'lead', 1], ['wamid.3', 'equipe', 2]]);
  assert.equal(messages[0]!.texto, '  one\n  ');
  assert.equal(messages[0]!.em, '2026-10-01T10:00:00.000Z');
  assert.equal(messages[0]!.remetente, 'Lead');
  assert.equal(messages[1]!.tipo, 'audio');
  assert.equal(messages[1]!.anexos[0]!.id, 'media-1');
  assert.equal(messages[1]!.anexos[0]!.url, null);
  assert.equal(messages[2]!.texto, 'Full template');
  assert.ok(messages.every(m => m.canal === 'whatsapp' && m.provedor === 'meta_cloud'));
});

test('Meta multimedia and interactive replies retain safe attachment metadata without signed API credentials', () => {
  const payload = meta([{ from: PHONE, id: 'photo', type: 'image', image: { id: 'media', caption: 'Full caption',
    mime_type: 'image/jpeg', f3_media_url: 'https://cdn.example.invalid/photo.jpg', f3_media_url_expires_at: '2026-11-01T00:00:00Z', token: 'secret' } },
  { from: PHONE, id: 'interactive', type: 'interactive', interactive: { button_reply: { id: 'yes', title: 'Confirmar' } } }]);
  const messages = normalize(payload);
  assert.equal(messages[0]!.anexos[0]!.url, 'https://cdn.example.invalid/photo.jpg');
  assert.equal(messages[0]!.anexos[0]!.expira_em, '2026-11-01T00:00:00Z');
  assert.equal(messages[1]!.texto, 'Confirmar');
  assert.ok(!JSON.stringify(messages).includes('secret'));
  for (const url of ['http://cdn.example.invalid/a', 'javascript:alert(1)', 'https://user:secret@example.invalid/a', 'https://cdn.example.invalid/a?access_token=secret']) {
    const [message] = normalize({ eventType: 'AGENT_MESSAGE_SENDED', agentResponse: 'File',
      attachments: [{ url, mimeType: 'application/pdf', name: 'file.pdf', secret: 'secret' }] });
    assert.equal(message!.anexos[0]!.url, null);
    assert.ok(!JSON.stringify(message).includes('secret'));
  }
});

test('Uazapi wrappers, nested provider IDs, fromMe and groups preserve identity without mistaking group or LID for phone', () => {
  const message = { chatid: '120000000000000@g.us', sender_lid: '999999999999999@lid', sender_pn: JID,
    senderName: 'Member', messageid: '3EB0PROVIDER', id: 'r12345678', fromMe: true,
    content: { caption: 'Group image', mimetype: 'image/jpeg', URL: 'https://cdn.example.invalid/group.jpg' }, type: 'image' };
  for (const payload of [{ event: 'messages', message }, { EventType: 'messages', data: { message } }]) {
    const [entry] = normalize(payload, { source: 'uazapi' });
    assert.equal(entry!.message_id, '3EB0PROVIDER');
    assert.equal(entry!.lado, 'equipe');
    assert.equal(entry!.is_group, true);
    assert.equal(entry!.chat_jid, '120000000000000@g.us');
    assert.equal(entry!.sender_jid, '999999999999999@lid');
    assert.equal(entry!.telefone, PHONE);
    assert.equal(entry!.tipo, 'image');
    assert.equal(entry!.texto, 'Group image');
    assert.equal(entry!.anexos[0]!.url, 'https://cdn.example.invalid/group.jpg');
  }
  const [lid] = normalize({ event: 'messages', data: { key: { remoteJid: '999999999999999@lid', id: '3EB0KEY' },
    message: { conversation: 'No phone' } } }, { source: 'uazapi' });
  assert.equal(lid!.telefone, null);
  assert.equal(lid!.chat_jid, '999999999999999@lid');
});

test('Uazapi internal and synthetic IDs never become provider IDs and collisions remain separate rows', () => {
  for (const id of ['r1234567', 'sent_1790848800000', `${JID}_1790848800000`]) {
    const [message] = normalize({ event: 'messages', id, message: { text: 'Same text' } }, { source: 'uazapi' });
    assert.equal(message!.message_id, null);
    const [canonical] = normalizeMessageRow(SENT, row(null, { message_id: id, body: 'Same text' }), CLIENT);
    assert.equal(canonical!.message_id, null);
  }
  const one = normalizeMessageRow(SENT, row(null, { id: 'one', body: 'same', message_id: 'valid-provider' }), CLIENT)[0]!;
  const two = normalizeMessageRow(SENT, row(null, { id: 'two', body: 'same', message_id: 'other-provider' }), CLIENT)[0]!;
  assert.notEqual(one.id, two.id);
  assert.equal(one.message_id, 'valid-provider');
  assert.equal(two.message_id, 'other-provider');
});

test('status, acknowledgment, connection and protocol-only payloads never become spoken messages', () => {
  for (const payload of [{ event: 'messages_update', data: { status: 'read', text: 'not speech' } },
    { EventType: 'connection', message: { text: 'not speech' } },
    { event: 'ack', body: 'not speech' }, { event: 'messages', message: { protocolMessage: { type: 'REVOKE' } } },
    { event: 'messages', data: { status: 'read', key: { id: 'provider' } } }, meta([]), null, []]) {
    assert.deepEqual(normalize(payload), []);
  }
});

test('canonical batch enrichment matches provider ID and never attaches another recipient media or sender', () => {
  const payload = meta([
    { id: 'one', from: PHONE, timestamp: '1790848800', type: 'image', image: { id: 'one-media', caption: 'First' } },
    { id: 'two', from: '5511888880000', timestamp: '1790848801', type: 'audio', audio: { id: 'two-media' } },
  ]);
  const [message] = normalizeMessageRow(INBOX, row(payload, { message_id: 'two', body: 'stored', phone: '5511888880000' }), CLIENT);
  assert.equal(message!.anexos[0]!.id, 'two-media');
  assert.equal(message!.texto, 'stored');
  assert.equal(message!.em, '2026-10-01T10:00:01.000Z');
  const [ambiguous] = normalizeMessageRow(INBOX, row(payload, { body: 'stored without identity' }), CLIENT);
  assert.deepEqual(ambiguous!.anexos, []);
  assert.equal(ambiguous!.telefone, null);
});

test('invalid or absent original timestamps use stored registration time, never the current clock', () => {
  const payload = { eventType: 'USER_MESSAGE_RECEIVED', userMessage: 'Body', createdAt: 'invalid' };
  const [log] = normalize(payload);
  assert.equal(log!.em, CREATED);
  assert.equal(log!.horario_origem, 'registro');
  const [canonical] = normalizeMessageRow(INBOX, row(payload, { body: 'Body', msg_timestamp: '2026-10-29T12:01:00Z' }), CLIENT);
  assert.equal(canonical!.em, CREATED);
  assert.equal(canonical!.horario_origem, 'registro');
  const [numeric] = normalize({ event: 'messages', timestamp: 1790848800, message: 'Text' }, { source: 'uazapi' });
  assert.equal(numeric!.em, '2026-10-01T10:00:00.000Z');
});

test('uppercase Uazapi events retain speech and structural acknowledgments stay excluded', () => {
  const [message] = normalize({ eventType: 'MESSAGES', data: { messageid: 'provider', message: { text: 'Spoken' } } });
  assert.equal(message!.texto, 'Spoken');
  assert.deepEqual(normalize({ data: { update: { status: 'read' }, body: 'status detail', key: { fromMe: true } } }), []);
});

test('canonical provider IDs keep meaningful namespaces and media-only previews retain their kind', () => {
  const [message] = normalizeMessageRow(INBOX, row({ eventType: 'USER_MESSAGE_RECEIVED', messageId: 'chat:provider',
    userMessage: 'Speech', channel: 'whatsapp' }, { message_id: 'chat:provider', body: 'Speech' }), CLIENT);
  assert.equal(message!.message_id, 'chat:provider');
  assert.equal(message!.provedor, 'chatvolt');
  const [sent] = normalizeMessageRow(SENT, row(null, { message_id: 'meta:provider', body: '[Áudio] note.ogg' }), CLIENT);
  assert.equal(sent!.message_id, 'meta:provider');
  assert.equal(sent!.tipo, 'audio');
  const [audio] = normalizeMessageRow(INBOX, row(null, { body: '[ptt]', type: 'ptt' }), CLIENT);
  assert.equal(audio!.tipo, 'audio');
  assert.equal(audio!.type, 'ptt');
});

test('Uazapi IDs with different full prefixes never collapse to a shared suffix', () => {
  const first = normalize({ event: 'messages', id: 'prefix-one:suffix', message: 'same' })[0]!;
  const second = normalize({ event: 'messages', id: 'prefix-two:suffix', message: 'same' })[0]!;
  assert.equal(first.message_id, 'prefix-one:suffix');
  assert.equal(second.message_id, 'prefix-two:suffix');
});

test('Zapper is the stored Chatvolt channel and preserves outbound file evidence with no embedded credential', () => {
  const [message] = normalize({ eventType: 'AGENT_MESSAGE_SENDED', channel: 'zapperapi', userPhoneNumber: PHONE,
    messageId: 'zapper:sent', agentResponse: 'Proposta completa', createdAt: '2026-10-01T10:00:00Z',
    attachments: [{ url: 'https://cdn.example.invalid/proposta.pdf#access_token=secret', mimeType: 'application/pdf', name: 'proposta.pdf' }] },
  { source: 'chatvolt' });
  assert.equal(message!.provedor, 'chatvolt');
  assert.equal(message!.canal, 'zapperapi');
  assert.equal(message!.lado, 'equipe');
  assert.equal(message!.message_id, 'zapper:sent');
  assert.equal(message!.anexos[0]!.url, 'https://cdn.example.invalid/proposta.pdf');
  assert.equal(message!.anexos[0]!.nome, 'proposta.pdf');
  assert.ok(!JSON.stringify(message).includes('secret'));
});

test('phone normalization never manufactures numbers from arbitrary identifiers or device suffixes', () => {
  const [unknown] = normalize({ eventType: 'USER_MESSAGE_RECEIVED', userMessage: 'Text', userPhoneNumber: 'customer-5511999990000' });
  assert.equal(unknown!.telefone, null);
  const [device] = normalize({ event: 'messages', key: { remoteJid: '5511999990000:4@s.whatsapp.net', id: 'provider' },
    message: { text: 'Text' } });
  assert.equal(device!.telefone, PHONE);
});

test('Uazapi uses the WhatsApp channel independently from its provider and instance name', () => {
  for (const extra of [{}, { instanceName: 'Sales-instance' }, { data: { instanceName: 'Support-instance', message: 'Speech' } }]) {
    const [message] = normalize({ event: 'messages', message: 'Speech', ...extra });
    assert.equal(message!.canal, 'whatsapp');
    assert.equal(message!.provedor, 'uazapi');
  }
  const [canonical] = normalizeMessageRow(INBOX, row(null, { body: 'Speech', message_id: 'unknown' }), CLIENT);
  assert.equal(canonical!.canal, null);
});

test('stored Uazapi stanza is promoted only when its own raw payload proves the full provider ID', () => {
  for (const payload of [{ event: 'messages', id: 'instance:3EB0ID', message: { text: 'Full speech' } },
    { event: 'messages', data: { id: 'instance:3EB0ID', message: { text: 'Full speech' } } }]) {
    const [log] = normalize(payload);
    assert.equal(log!.message_id, 'instance:3EB0ID');
    assert.equal(log!.message_id_armazenado, '3EB0ID');
    const [canonical] = normalizeMessageRow(INBOX, row(payload, { message_id: '3EB0ID', body: 'Stored speech' }), CLIENT);
    assert.equal(canonical!.message_id, 'instance:3EB0ID');
    assert.equal(canonical!.message_id_armazenado, '3EB0ID');
    assert.equal(canonical!.canal, 'whatsapp');
    const [unproven] = normalizeMessageRow(INBOX, row(null, { message_id: '3EB0ID', body: 'Stored speech' }), CLIENT);
    assert.equal(unproven!.message_id, '3EB0ID');
    const [foreign] = normalizeMessageRow(INBOX, row(payload, { message_id: 'other:3EB0ID', body: 'Stored speech' }), CLIENT);
    assert.equal(foreign!.message_id, 'other:3EB0ID');
  }
});

test('Uazapi legacy aliases follow ingress precedence but do not collapse distinct complete IDs', () => {
  const first = { event: 'messages', id: 'first:shared', messageid: 'different', message: { text: 'Speech' } };
  const second = { event: 'messages', id: 'second:shared', message: { text: 'Speech' } };
  const normalized = [first, second].map(payload => normalizeMessageRow(INBOX, row(payload, { message_id: 'shared', body: 'Stored' }), CLIENT)[0]!);
  assert.deepEqual(normalized.map(message => message.message_id), ['first:shared', 'second:shared']);
  assert.deepEqual(normalized.map(message => message.message_id_armazenado), ['shared', 'shared']);
  const [nestedOnly] = normalize({ event: 'messages', message: { messageid: 'nested-provider', text: 'Speech' } });
  assert.equal(nestedOnly!.message_id, 'nested-provider');
  assert.equal(nestedOnly!.message_id_armazenado, null, 'legacy ingress did not read nested message.messageid');
  const [fallback] = normalize({ event: 'messages', message: { key: { id: 'outer-key' }, text: 'Outer' }, data: { message: { text: 'Inner' } } });
  assert.equal(fallback!.message_id_armazenado, 'outer-key', 'legacy fallback also checks the original body message key');
  for (const id of ['r1234567', 'instance:sent_1790848800000', `${JID}_1790848800000`]) {
    assert.equal(normalize({ event: 'messages', id, message: 'Speech' })[0]!.message_id_armazenado, null);
  }
});

test('legacy Uazapi aliases never reinterpret Chatvolt or Meta message IDs', () => {
  const payloads = [{ eventType: 'USER_MESSAGE_RECEIVED', userMessage: 'Speech', messageId: 'chat:provider', channel: 'zapperapi' },
    meta([{ id: 'meta:provider', from: PHONE, type: 'text', text: { body: 'Speech' } }])];
  for (const payload of payloads) {
    const [log] = normalize(payload);
    assert.equal(log!.message_id_armazenado, null);
    const [canonical] = normalizeMessageRow(INBOX, row(payload, { message_id: 'provider', body: 'Stored' }), CLIENT);
    assert.equal(canonical!.message_id, 'provider');
    assert.equal(canonical!.message_id_armazenado, 'provider');
  }
});

test('Meta batch items never inherit another item phone or conversation from the stored envelope', () => {
  const payload = meta([
    { id: 'identified', from: PHONE, type: 'text', text: { body: 'First lead' } },
    { id: 'unknown', type: 'text', text: { body: 'Unknown lead' } },
  ]);
  const messages = normalize(payload, { from_jid: JID, phone: PHONE, conversation_id: 'first-conversation' });
  assert.equal(messages[0]!.telefone, PHONE);
  assert.equal(messages[0]!.chat_jid, JID);
  assert.equal(messages[1]!.telefone, null);
  assert.equal(messages[1]!.chat_jid, null);
  assert.equal(messages[1]!.from_jid, null);
  assert.equal(messages[1]!.conversation_id, null);
});

test('a filtered Meta item or single missing recipient never makes envelope identity safe', () => {
  const unknown = { id: 'unknown', type: 'text', text: { body: 'Unknown lead' } };
  for (const payload of [meta([{ id: 'status', from: PHONE, type: 'status' }, unknown]), meta([unknown]), meta([], [unknown])]) {
    const [message] = normalize(payload, { from_jid: JID, phone: PHONE, conversation_id: 'first-conversation' });
    assert.equal(message!.telefone, null);
    assert.equal(message!.chat_jid, null);
    assert.equal(message!.conversation_id, null);
  }
  const [singleEvent] = normalize({ eventType: 'AGENT_MESSAGE_SENDED', agentResponse: 'Reply' }, { from_jid: JID });
  assert.equal(singleEvent!.telefone, PHONE);
  assert.equal(singleEvent!.chat_jid, JID);
});

test('media purge markers suppress attachments in canonical rows and logs without inventing a purge date', () => {
  const payload = { eventType: 'USER_MESSAGE_RECEIVED', userMessage: 'Caption', userPhoneNumber: PHONE,
    attachments: [{ url: 'https://cdn.example.invalid/image.jpg', mimeType: 'image/jpeg' }] };
  for (const source of [LOG, INBOX, SENT]) {
    for (const marker of ['timestamp', 'payload']) {
      const input = row({ ...payload, ...(marker === 'payload' ? { _mediaPurged: true } : {}) },
        { body: 'Caption', media_purged_at: marker === 'timestamp' ? CREATED : null });
      const [message] = normalizeMessageRow(source, input, CLIENT);
      assert.equal(message!.midia_expurgada, true);
      assert.deepEqual(message!.anexos, []);
      assert.equal(message!.media_purged_at, marker === 'timestamp' ? CREATED : null);
    }
  }
  const [available] = normalize(payload);
  assert.equal(available!.midia_expurgada, false);
  assert.equal(available!.anexos.length, 1);
  const [purged] = normalizeMessageRow(INBOX, row({ _mediaPurged: true }, { body: '[Áudio]' }), CLIENT);
  assert.equal(purged!.midia_expurgada, true);
  assert.equal(purged!.media_purged_at, null);
});

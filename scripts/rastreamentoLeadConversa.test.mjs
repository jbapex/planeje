import assert from 'node:assert/strict';
import {
  auditDayLabel,
  auditDownloadIds,
  auditMediaKind,
  auditTimeLabel,
  buildLeadConversaAudit,
  filterLeadConversaByChannel,
  chatvoltTeamSpeech,
  leadAttachmentFiles,
  leadConversaChannels,
  chatJidsFromDigits,
  leadPhoneDigits,
  messageAuditPreview,
  phoneDigitCandidates,
} from '../src/lib/rastreamentoLeadConversa.js';
import { leadPhotoUrl } from '../src/lib/rastreamentoLeadFicha.js';

assert.equal(leadPhoneDigits({ phone: '+55 41 9852-9773' }, {}), '554198529773');
assert.deepEqual(phoneDigitCandidates('554198529773').sort(), ['4198529773', '554198529773'].sort());
assert.ok(chatJidsFromDigits('554198529773').includes('554198529773@s.whatsapp.net'));

assert.equal(messageAuditPreview('Oi', 'chat'), 'Oi');
assert.equal(messageAuditPreview('', 'image'), 'Imagem');
assert.equal(auditMediaKind('[Áudio]', ''), 'audio');
assert.equal(auditMediaKind('[ptt]', 'ptt'), 'audio');
assert.equal(auditMediaKind('[Figurinha]', 'sticker'), 'image');
assert.equal(auditMediaKind('', 'voice'), 'audio');
assert.equal(messageAuditPreview('[Figurinha]', ''), 'Figurinha');
assert.equal(auditMediaKind('Oi', 'chat'), 'text');
assert.deepEqual(
  auditDownloadIds({ wa_message_id: 'ABC123', message_id: 'jid_1', uazapi_internal_id: '' }),
  ['ABC123', 'jid_1']
);

const now = new Date('2026-09-19T15:00:00-03:00');
assert.equal(auditDayLabel('2026-09-19T12:00:00-03:00', now), 'Hoje');
assert.match(auditTimeLabel('2026-09-19T14:48:00-03:00'), /^\d{2}:\d{2}$/);

const audit = buildLeadConversaAudit({
  inboxRows: [
    { id: 1, body: 'Bom dia', msg_timestamp: '2026-09-19T09:55:00-03:00', is_group: false, from_jid: '554198529773@s.whatsapp.net' },
    { id: 2, body: 'grupo', msg_timestamp: '2026-09-19T09:56:00-03:00', is_group: true },
  ],
  sentRows: [
    { id: 9, body: 'Olá', created_at: '2026-09-19T10:00:00-03:00', to_jid: '554198529773@s.whatsapp.net' },
  ],
}, now);
assert.equal(audit.inboundCount, 1);
assert.equal(audit.outboundCount, 1);
assert.equal(audit.items.filter((item) => item.type === 'msg').map((item) => item.side).join(','), 'lead,equipe');

const withAudio = buildLeadConversaAudit({
  inboxRows: [
    { id: 3, body: '[ptt]', type: 'ptt', msg_timestamp: '2026-09-19T11:00:00-03:00', is_group: false, wa_message_id: 'AABBCC', message_id: 'jid_99', chat_jid: '5541@s.whatsapp.net', whatsapp_config_id: 'cfg-1' },
  ],
  sentRows: [
    { id: 4, body: '[Áudio]', created_at: '2026-09-19T11:05:00-03:00', message_id: '5541@s.whatsapp.net_1790541109692', chat_jid: '5541@s.whatsapp.net', whatsapp_config_id: 'cfg-1' },
  ],
}, now);
const audioItems = withAudio.items.filter((item) => item.type === 'msg');
assert.equal(audioItems[0].kind, 'audio');
assert.deepEqual(audioItems[0].downloadMessageIds, ['AABBCC', 'jid_99']);
assert.equal(audioItems[1].kind, 'audio');
assert.equal(audioItems[1].side, 'equipe');
assert.equal(audioItems[1].chatJid, '5541@s.whatsapp.net');
assert.equal(audioItems[1].mediaPurged, false);

assert.equal(leadPhotoUrl({ profile_pic_url: 'https://img/lead.jpg' }), 'https://img/lead.jpg');
assert.equal(leadPhotoUrl({}, {}, ['', 'https://img/extra.jpg']), 'https://img/extra.jpg');
assert.equal(leadPhotoUrl({}, {}), '');

const doisCanais = buildLeadConversaAudit({
  inboxRows: [
    { id: 10, body: 'no oficial', msg_timestamp: '2026-09-19T09:00:00-03:00', is_group: false, ingress_channel: 'whatsapp' },
    { id: 11, body: 'no zapper', msg_timestamp: '2026-09-19T09:10:00-03:00', is_group: false, ingress_channel: 'zapperapi' },
    { id: 12, body: 'de novo oficial', msg_timestamp: '2026-09-19T09:20:00-03:00', is_group: false, channel: 'whatsapp' },
  ],
}, now);
const canais = leadConversaChannels(doisCanais);
assert.deepEqual(canais.map((item) => item.key), ['whatsapp', 'zapperapi']);
assert.equal(canais[0].label, 'WhatsApp oficial');
assert.equal(canais[1].label, 'Zapper');
const comFoto = buildLeadConversaAudit({
  inboxRows: [
    {
      id: 20,
      body: '📸',
      type: 'text',
      msg_timestamp: '2026-09-19T12:00:00-03:00',
      is_group: false,
      media_files: [{ url: 'https://cdn.example/foto.jpeg', mimeType: 'image/jpeg', name: 'foto' }],
    },
    {
      id: 21,
      body: 'veja',
      type: 'text',
      msg_timestamp: '2026-09-19T12:01:00-03:00',
      is_group: false,
      media_files: [{ url: 'http://inseguro/foto.jpeg', mimeType: 'image/jpeg' }],
    },
    {
      id: 22,
      body: '📄',
      type: 'text',
      msg_timestamp: '2026-09-19T12:02:00-03:00',
      is_group: false,
      raw_payload: { attachments: [{ url: 'https://cdn.example/arq.pdf', mimeType: 'application/pdf', name: 'arq' }] },
    },
  ],
}, now);
const fotos = comFoto.items.filter((item) => item.type === 'msg');
assert.equal(fotos[0].kind, 'image');
assert.equal(fotos[0].mediaUrl, 'https://cdn.example/foto.jpeg');
assert.equal(fotos[0].body, '');
assert.equal(fotos[0].mediaPurged, false);
assert.equal(fotos[1].kind, 'text');
assert.equal(fotos[1].mediaUrl, '');
assert.equal(fotos[1].body, 'veja');
assert.equal(fotos[2].kind, 'document');
assert.equal(fotos[2].mediaFiles[0].url, 'https://cdn.example/arq.pdf');
const stickerAudit = buildLeadConversaAudit({ inboxRows: [{ id: 'sticker', type: 'sticker', body: '[Figurinha]',
  media_files: [{url:'https://cdn.example/sticker.webp',mimeType:'image/webp'}],msg_timestamp:now.toISOString() },
{ id: 'removed',type:'image',media_purged_at:now.toISOString(),media_files:[{url:'https://cdn.example/removed.jpg',mimeType:'image/jpeg'}] }] },now);
assert.equal(stickerAudit.items.find(item=>item.id==='in-sticker').kind,'sticker');
assert.equal(stickerAudit.items.find(item=>item.id==='in-removed').mediaPurged,true);
assert.equal(leadAttachmentFiles({ media_files: [{ url: 'javascript:alert(1)', mimeType: 'image/png' }] }).length, 0);

assert.equal(chatvoltTeamSpeech({ eventType: 'USER_MESSAGE_RECEIVED', userMessage: 'oi', agentResponse: 'não' }), null);
assert.equal(chatvoltTeamSpeech({ eventType: 'AGENT_MESSAGE_BLOCKED', agentResponse: 'bloqueada' }), null);
const falaEquipe = chatvoltTeamSpeech({
  eventType: 'AGENT_MESSAGE_SENDED',
  agentResponse: 'Posso ajudar',
  channel: 'zapperapi',
  messageId: 'ag-1',
});
assert.equal(falaEquipe.text, 'Posso ajudar');
assert.equal(falaEquipe.channel, 'zapperapi');

const comEquipe = buildLeadConversaAudit({
  inboxRows: [
    { id: 30, body: 'Tem essa bomba?', msg_timestamp: '2026-09-19T15:58:00-03:00', is_group: false, ingress_channel: 'zapperapi' },
  ],
  teamLogRows: [
    {
      id: 'log-1',
      created_at: '2026-09-19T15:59:00-03:00',
      from_jid: '5541@s.whatsapp.net',
      raw_payload: {
        eventType: 'AGENT_MESSAGE_SENDED',
        agentResponse: 'Temos sim',
        channel: 'zapperapi',
        createdAt: '2026-09-19T15:59:00-03:00',
        messageId: 'ag-1',
      },
    },
    {
      id: 'log-2',
      created_at: '2026-09-19T16:00:00-03:00',
      raw_payload: {
        eventType: 'AGENT_MESSAGE_SENDED',
        agentResponse: 'No oficial',
        channel: 'whatsapp',
        createdAt: '2026-09-19T16:00:00-03:00',
        messageId: 'ag-2',
      },
    },
    {
      id: 'log-3',
      created_at: '2026-09-19T16:01:00-03:00',
      raw_payload: { eventType: 'USER_MESSAGE_RECEIVED', userMessage: 'já está na entrada', agentResponse: '' },
    },
  ],
  sentRows: [
    { id: 8, body: 'já gravada', created_at: '2026-09-19T16:02:00-03:00', message_id: 'ag-2', channel: 'whatsapp' },
  ],
}, now);
const equipe = comEquipe.items.filter((item) => item.type === 'msg');
assert.deepEqual(equipe.map((item) => item.side), ['lead', 'equipe', 'equipe']);
assert.equal(equipe[1].body, 'Temos sim');
assert.equal(equipe[2].body, 'já gravada');
const soOficial = filterLeadConversaByChannel(comEquipe, 'whatsapp', now);
assert.deepEqual(
  soOficial.items.filter((item) => item.type === 'msg').map((item) => item.body),
  ['já gravada'],
);

const soZapper = filterLeadConversaByChannel(doisCanais, 'zapperapi', now);
assert.deepEqual(
  soZapper.items.filter((item) => item.type === 'msg').map((item) => item.body),
  ['no zapper'],
);
assert.equal(soZapper.inboundCount, 1);

// Catches missing Meta echoes without routing them through the Chatvolt parser.
const metaEcho = { id: 'wamid.echo-fixture', to: '5511000000001', from: '5511000000000',
  timestamp: '1789831260', type: 'text', text: { body: 'Resposta da empresa' } };
const echoRow = { id: 'meta-log-1', created_at: '2026-10-23T16:00:00Z', meta_echo: metaEcho };
const withMeta = buildLeadConversaAudit({
  inboxRows: [{ id: 'fixture-in', body: 'Pergunta do cliente', is_group: false, msg_timestamp: '2026-09-19T15:20:00Z' }],
  teamLogRows: [echoRow],
}, now);
assert.equal(withMeta.outboundCount, 1, 'Meta echo must appear as the company reply');
assert.deepEqual(withMeta.items.filter((item) => item.type === 'msg').map((item) => item.body),
  ['Pergunta do cliente', 'Resposta da empresa']);
const metaReply = withMeta.items.find((item) => item.side === 'equipe');
assert.equal(metaReply.at, '2026-09-19T15:21:00.000Z');
assert.equal(metaReply.chatJid, '5511000000001@s.whatsapp.net');

const echoHistory = (echoes, extra = {}) => buildLeadConversaAudit({ ...extra,
  teamLogRows: echoes.map((echo, index) => ({ ...echoRow, id: `echo-${index}`, meta_echo: echo })),
}, now).items.filter((item) => item.type === 'msg');
assert.equal(echoHistory([metaEcho, metaEcho]).length, 1, 'retries must not duplicate the reply');
assert.equal(echoHistory([metaEcho], { sentRows: [{ id: 'already-saved', message_id: metaEcho.id, body: 'Resposta da empresa', created_at: metaReply.at }] }).length, 1);
for (const [type, content, expected] of [
  ['template', { name: 'fixture', f3_rendered_text: 'Olá, podemos ajudar?' }, 'Olá, podemos ajudar?'],
  ['interactive', { type: 'button', body: { text: 'Confirma o horário?' } }, 'Confirma o horário?'],
  ['document', { filename: 'proposta.pdf' }, 'proposta.pdf'],
]) assert.equal(echoHistory([{ ...metaEcho, type, text: undefined, [type]: content }])[0].body, expected);
const image = { ...metaEcho, type: 'image', text: undefined,
  image: { caption: 'Foto enviada', mime_type: 'image/jpeg', f3_media_url: 'https://example.invalid/photo.jpg' } };
assert.equal(echoHistory([image])[0].mediaFiles[0].url, 'https://example.invalid/photo.jpg');
for (const url of ['javascript:alert(1)', 'http://example.invalid/photo', 'https://user:secret@example.invalid/photo']) {
  assert.equal(echoHistory([{ ...image, image: { ...image.image, f3_media_url: url } }])[0].mediaFiles.length, 0);
}
assert.equal(echoHistory([{ ...image, image: { ...image.image, f3_media_url_expires_at: '2026-09-18T00:00:00Z' } }])[0].mediaFiles.length, 0);
assert.equal(echoHistory([{ ...metaEcho, timestamp: 'bad' }, { ...metaEcho, to: '' }, { ...metaEcho, id: '' }, { ...metaEcho, type: 'status' }]).length, 0);
const mixedChannels = buildLeadConversaAudit({
  inboxRows: [{ id: 'meta-in', body: 'Pergunta no oficial', is_group: false, meta_product: 'whatsapp', msg_timestamp: '2026-09-19T15:20:00Z' }],
  teamLogRows: [echoRow, { id: 'zapper-fixture', raw_payload: { eventType: 'AGENT_MESSAGE_SENDED',
    agentResponse: 'Resposta no Zapper', channel: 'zapperapi', messageId: 'zapper-fixture', createdAt: '2026-09-19T15:22:00Z' } }],
}, now);
assert.deepEqual(filterLeadConversaByChannel(mixedChannels, 'whatsapp', now).items.filter((item) => item.type === 'msg').map((item) => item.body),
  ['Pergunta no oficial', 'Resposta da empresa'], 'official channel must keep both sides of the Meta conversation');
assert.deepEqual(filterLeadConversaByChannel(mixedChannels, 'zapperapi', now).items.filter((item) => item.type === 'msg').map((item) => item.body), ['Resposta no Zapper']);
const persistedMeta = buildLeadConversaAudit({
  inboxRows: [{ id: 'meta-in', body: 'Pergunta no oficial', is_group: false, meta_product: 'whatsapp', msg_timestamp: '2026-09-19T15:20:00Z' }],
  sentRows: [{ id: 'persisted-meta', message_id: metaEcho.id, body: 'Resposta já gravada', created_at: metaReply.at }],
  teamLogRows: [echoRow, { id: 'zapper-fixture', raw_payload: { eventType: 'AGENT_MESSAGE_SENDED',
    agentResponse: 'Resposta no Zapper', channel: 'zapperapi', messageId: 'zapper-fixture', createdAt: '2026-09-19T15:22:00Z' } }],
}, now);
assert.deepEqual(filterLeadConversaByChannel(persistedMeta, 'whatsapp', now).items.filter((item) => item.type === 'msg').map((item) => item.body),
  ['Pergunta no oficial', 'Resposta já gravada'], 'a persisted reply replacing the echo must retain the official channel');

console.log('PASS rastreamento lead conversa');

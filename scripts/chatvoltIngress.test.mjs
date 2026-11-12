import assert from 'node:assert/strict';
import { isChatvoltPayload, readChatvoltPayload } from '../supabase/functions/_shared/chatvoltIngress.js';

const lead = {
  eventType: 'USER_MESSAGE_RECEIVED',
  userPhoneNumber: '+55 (11) 98888-7777',
  userName: 'Ana',
  userMessage: 'Quero o vestido',
  messageId: 'wamid.1',
  createdAt: '2026-10-08T18:00:00.000Z',
  channel: 'whatsapp',
  ctwaAttributions: [
    { ctwaClid: 'clid-1', sourceId: '6993', sourceType: 'facebook', sourceUrl: 'https://fb.example/ad' },
  ],
};

assert.equal(isChatvoltPayload(lead), true);
const read = readChatvoltPayload(lead);
assert.equal(read.phone, '5511988887777');
assert.equal(read.name, 'Ana');
assert.equal(read.messageText, 'Quero o vestido');
assert.equal(read.ctwaClid, 'clid-1');
assert.equal(read.sourceId, '6993');
assert.equal(read.isGroup, false);

const agentOnly = readChatvoltPayload({
  eventType: 'AGENT_MESSAGE_SENDED',
  userPhoneNumber: '5511999990000',
  agentResponse: 'Olá, sou o agente',
  userMessage: 'não deve entrar',
});
assert.equal(agentOnly.messageText, '');
assert.equal(agentOnly.phone, '5511999990000');
assert.equal(agentOnly.fromMe, true);
assert.equal(read.fromMe, false);

const both = readChatvoltPayload({
  eventType: 'AGENT_USER_MESSAGE',
  userPhoneNumber: '5511988880000',
  userMessage: 'Oi',
  agentResponse: 'Resposta',
});
assert.equal(both.messageText, 'Oi');
assert.equal(both.fromMe, false);

const followUp = readChatvoltPayload({
  eventType: 'AGENT_MESSAGE_FOLLOW_UP',
  userPhoneNumber: '5511977770000',
  agentResponse: 'Ainda posso ajudar?',
  tags: ['QUALIFICAÇÃO', { name: 'ORÇAMENTO' }, ''],
});
assert.equal(followUp.fromMe, true);
assert.equal(followUp.messageText, '');
assert.deepEqual(followUp.labels, ['QUALIFICAÇÃO', 'ORÇAMENTO']);

assert.equal(isChatvoltPayload({ phone: '5511', message: 'oi' }), false);
assert.equal(isChatvoltPayload({}), false);
assert.equal(readChatvoltPayload({ eventType: 'STEP_ENTERED' }).messageText, '');

console.log('chatvoltIngress.test.mjs ok');

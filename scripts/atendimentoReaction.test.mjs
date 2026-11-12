import assert from 'node:assert/strict';
import {
  isClientAcknowledgment,
  isUazapiReactionInbound,
} from '../supabase/functions/_shared/atendimentoClientAck.js';

const payload = {
  message: {
    type: 'reaction',
    messageType: 'ReactionMessage',
    text: '🙏',
    reaction: '3EB09EF465EB44FB4151C3',
    content: {
      key: { ID: '3EB09EF465EB44FB4151C3', fromMe: false },
      text: '🙏',
    },
  },
};

assert.equal(isUazapiReactionInbound(payload, payload.message), true);
assert.equal(isClientAcknowledgment({ body: '🙏', type: 'reaction' }), true);
assert.equal(isUazapiReactionInbound({ type: 'text' }, { type: 'text', text: 'Favor editar o vídeo acima.' }), false);

console.log('atendimento reaction: ok');

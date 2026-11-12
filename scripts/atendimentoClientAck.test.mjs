import assert from 'node:assert/strict';
import { isClientAcknowledgment } from '../supabase/functions/_shared/atendimentoClientAck.js';

assert.equal(isClientAcknowledgment({ body: '👍' }), true);
assert.equal(isClientAcknowledgment({ body: '🙏' }), true);
assert.equal(isClientAcknowledgment({ type: 'ReactionMessage', body: '🙏' }), true);
assert.equal(isClientAcknowledgment({ body: '👍🏻' }), true);
assert.equal(isClientAcknowledgment({ body: '👌' }), true);
assert.equal(isClientAcknowledgment({ body: 'ok' }), true);
assert.equal(isClientAcknowledgment({ body: 'Ok!' }), true);
assert.equal(isClientAcknowledgment({ body: 'obrigado' }), true);
assert.equal(isClientAcknowledgment({ body: 'valeu' }), true);
assert.equal(isClientAcknowledgment({ body: 'perfeito' }), true);
assert.equal(isClientAcknowledgment({ type: 'reaction', body: '' }), true);
assert.equal(isClientAcknowledgment({ body: '[reaction]' }), true);

assert.equal(isClientAcknowledgment({ body: 'cadê o vídeo?' }), false);
assert.equal(isClientAcknowledgment({ body: 'ok, me manda o link' }), false);
assert.equal(isClientAcknowledgment({ body: 'Favor editar o video acima.' }), false);
assert.equal(isClientAcknowledgment({ body: '' }), false);
assert.equal(isClientAcknowledgment({}), false);

console.log('atendimento client ack: ok');

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';

test('real outgoing persistence labels the server-authenticated automation branch and the human branch', () => {
  const source = readFileSync('supabase/functions/uazapi-send-message/index.ts', 'utf8');
  const expression = source.match(/const insertBase = (\{[\s\S]*?\n  \});/);
  assert.ok(expression);
  for (const isIaAuto of [true, false]) {
    const data = runInNewContext(`(${expression[1]})`, { clienteId: 'fixture', chatJid: 'fixture', config: { id: 'fixture' },
      conversationId: 'fixture', isIaAuto, user: isIaAuto ? null : { id: 'human' }, messageId: 'provider', sentPreview: 'text' });
    assert.equal(data.sender_kind, isIaAuto ? 'automation' : 'human');
    assert.equal(data.sent_by, isIaAuto ? null : 'human');
  }
});

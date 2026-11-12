import assert from 'node:assert/strict';
import { lastActivityByContact, mergeThreadWithNotes } from '../src/lib/atendimentoLojaThread.js';

const items = [
  { id: 'd', type: 'day', label: 'Ontem' },
  { id: 'a', type: 'msg', side: 'lead', body: 'oi', at: '2026-09-28T12:00:00Z' },
  { id: 'b', type: 'msg', side: 'equipe', body: 'olá', at: '2026-09-28T12:05:00Z' },
];
const notas = [
  { id: 'n1', autor_id: 'u1', autor_nome: 'Ana', texto: 'cliente quer vestido', created_at: '2026-09-28T12:02:00Z' },
  { id: 'n2', autor_id: 'u1', autor_nome: null, texto: 'retornar', created_at: '2026-09-29T09:00:00Z' },
];
const merged = mergeThreadWithNotes(items, notas, new Date('2026-09-29T12:00:00Z'));
const bubbles = merged.filter((i) => i.type !== 'day');
assert.deepEqual(
  bubbles.map((i) => i.id),
  ['a', 'note-n1', 'b', 'note-n2'],
  'nota entra na ordem do tempo'
);
assert.equal(bubbles[1].side, 'nota');
assert.equal(bubbles[1].autor, 'Ana');
assert.equal(bubbles[3].autor, 'Atendente', 'nota sem nome mostra Atendente');
assert.equal(merged.filter((i) => i.type === 'day').length, 2, 'separador de dia refeito');
assert.equal(mergeThreadWithNotes([], []).length, 0);

const act = lastActivityByContact(
  [{ id: 'c1', from_jid: '554195252559@s.whatsapp.net', phone: '554195252559' }, { id: 'c2', phone: '5511999990000' }],
  [
    { from_jid: '554195252559@s.whatsapp.net', msg_timestamp: '2026-09-28T10:00:00Z' },
    { from_jid: '554195252559@s.whatsapp.net', msg_timestamp: '2026-09-28T11:00:00Z' },
    { from_jid: '120363@g.us', is_group: true, msg_timestamp: '2026-09-28T12:00:00Z' },
  ],
  [{ chat_jid: '554195252559@s.whatsapp.net', created_at: '2026-09-28T10:30:00Z' }]
);
assert.equal(act.get('c1').lastInboundAt, '2026-09-28T11:00:00Z');
assert.equal(act.get('c1').lastOutboundAt, '2026-09-28T10:30:00Z');
assert.deepEqual(act.get('c2'), { lastInboundAt: null, lastOutboundAt: null });

console.log('atendimentoLojaThread: ok');

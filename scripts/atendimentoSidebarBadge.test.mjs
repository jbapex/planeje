import assert from 'node:assert/strict';
import { computeSidebarBadge } from '../src/lib/atendimentoSidebarBadge.js';

const abertas = [
  { status: 'aguardando', unread_count: 1, is_group: false, chat_jid: '554195252559@s.whatsapp.net' },
  { status: 'aguardando', unread_count: 0, is_group: true, chat_jid: '120363146772214281@g.us' },
  { status: 'aguardando', unread_count: 9, is_group: true, chat_jid: '120363407429097469@g.us' },
  { status: 'aguardando', unread_count: 12, is_group: true, chat_jid: '120363045772073363@g.us' },
  { status: 'aguardando', unread_count: 0, is_group: true, chat_jid: '120363424379133366@g.us' },
];

const resolvidasComNaoLidas = [
  { status: 'resolvido', unread_count: 8, display_name: 'MKT JB 3 irmão' },
  { status: 'resolvido', unread_count: 15, display_name: 'Parceria JB' },
  { status: 'resolvido', unread_count: 30, display_name: 'Ray Agencia' },
  { status: 'resolvido', unread_count: 9, display_name: 'Eu' },
];

const tudo = computeSidebarBadge([...abertas, ...resolvidasComNaoLidas, { status: 'resolvido', unread_count: 0 }, { status: 'em_atendimento', unread_count: 0 }, { status: 'aguardando', bloqueada: true, unread_count: 4 }]);
assert.equal(tudo.badgeTotal, 5);

const emAtendimentoNova = computeSidebarBadge([{ status: 'em_atendimento', unread_count: 2 }]);
assert.equal(emAtendimentoNova.badgeTotal, 1);

console.log('atendimentoSidebarBadge: ok');

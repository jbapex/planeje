import assert from 'node:assert/strict';
import {
  jidParaContatoLoja,
  patchLojaConversaOnMessage,
  isEcoDaIa,
  JANELA_ECO_IA_MS,
} from '../supabase/functions/_shared/atendimentoLojaInbox.js';

assert.equal(jidParaContatoLoja({ chatJid: '5511999990000@s.whatsapp.net' }), '5511999990000@s.whatsapp.net');
assert.equal(jidParaContatoLoja({ fromMe: true, chatJid: '5511999990000@s.whatsapp.net' }), '5511999990000@s.whatsapp.net', 'saída da loja também precisa do contato');
assert.equal(jidParaContatoLoja({ fromJid: '5511999990000@s.whatsapp.net' }), '5511999990000@s.whatsapp.net');
assert.equal(jidParaContatoLoja({ isGroup: true, chatJid: '120363@g.us' }), null);
assert.equal(jidParaContatoLoja({ chatJid: 'unknown' }), null);
assert.equal(jidParaContatoLoja({ chatJid: '' }), null);

const t = '2026-09-29T15:00:00.000Z';
assert.deepEqual(patchLojaConversaOnMessage({ fromMe: false, nowIso: t }), {
  status: 'esperando',
  status_at: t,
  ia_pausada: false,
  ia_followup_passo: 0,
  ia_followup_due_at: null,
});
assert.deepEqual(patchLojaConversaOnMessage({ fromMe: true, nowIso: t }), {
  status: 'entrada',
  status_at: t,
  ia_pausada: true,
  ia_followup_passo: 0,
  ia_followup_due_at: null,
});
assert.deepEqual(
  patchLojaConversaOnMessage({
    fromMe: true,
    existing: { status: 'esperando', ia_pausada: false },
    nowIso: t,
  }),
  { status: 'entrada', status_at: t, ia_pausada: true, ia_followup_passo: 0, ia_followup_due_at: null },
  'equipe respondeu: Entrada e pausa da IA'
);
assert.deepEqual(
  patchLojaConversaOnMessage({
    fromMe: false,
    existing: { status: 'entrada', ia_pausada: true },
    nowIso: t,
  }),
  { status: 'esperando', status_at: t, ia_followup_passo: 0, ia_followup_due_at: null },
  'contato falou de novo: Esperando; não desfaz ia_pausada'
);
assert.deepEqual(
  patchLojaConversaOnMessage({
    fromMe: false,
    existing: { status: 'finalizado', ia_pausada: false },
    nowIso: t,
  }),
  { status: 'esperando', status_at: t, ia_followup_passo: 0, ia_followup_due_at: null },
  'mensagem nova reabre finalizada em Esperando'
);
assert.deepEqual(
  patchLojaConversaOnMessage({
    fromMe: true,
    existing: { status: 'finalizado', ia_pausada: false },
    nowIso: t,
  }),
  { ia_pausada: true, ia_followup_passo: 0, ia_followup_due_at: null },
  'saída em finalizada não reabre sozinha'
);

const iaEm = '2026-09-29T14:59:50.000Z';
assert.equal(
  isEcoDaIa({
    fromMe: true,
    existing: { ia_respondeu_em: iaEm },
    nowIso: t,
  }),
  true,
  'fromMe logo depois da IA é eco'
);
assert.equal(
  isEcoDaIa({
    fromMe: true,
    existing: { ia_respondeu_em: new Date(Date.parse(t) - JANELA_ECO_IA_MS - 1).toISOString() },
    nowIso: t,
  }),
  false,
  'fromMe depois da janela não é eco'
);
assert.deepEqual(
  patchLojaConversaOnMessage({
    fromMe: true,
    existing: { status: 'entrada', ia_pausada: false, ia_respondeu_em: iaEm },
    nowIso: t,
  }),
  { status: 'entrada', status_at: t },
  'eco da IA: Entrada sem pausar o automático'
);
assert.deepEqual(
  patchLojaConversaOnMessage({
    fromMe: true,
    existing: { status: 'entrada', ia_pausada: true, ia_respondeu_em: iaEm },
    nowIso: t,
  }),
  { status: 'entrada', status_at: t },
  'eco não desfaz pausa que a equipe já gravou'
);

console.log('atendimentoLojaInbox: ok');

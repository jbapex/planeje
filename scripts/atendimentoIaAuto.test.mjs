import assert from 'node:assert/strict';
import { decidirAutoResposta, patchAposRespostaIa, IA_AUTO_COOLDOWN_MS } from '../supabase/functions/_shared/atendimentoIaAuto.js';
import { escolherAgente } from '../supabase/functions/_shared/atendimentoIaPrompt.js';

const agora = Date.parse('2026-09-29T12:00:00.000Z');
const autoOn = { id: 'luna', nome: 'Luna', ativo: true, auto_responder: true, setor_ids: [] };
const autoOff = { id: 'luna', nome: 'Luna', ativo: true, auto_responder: false, setor_ids: [] };
const baseOk = {
  clienteHabilitada: true,
  fromMe: false,
  isGroup: false,
  hasText: true,
  conversa: { status: 'esperando', ia_pausada: false },
  agentes: [autoOn],
  nowMs: agora,
};

assert.equal(decidirAutoResposta({ ...baseOk, clienteHabilitada: false }).reason, 'nao_apice');
assert.equal(decidirAutoResposta({ ...baseOk, clienteHabilitada: false }).ok, false);

const desligado = decidirAutoResposta({ ...baseOk, agentes: [autoOff] });
assert.equal(desligado.ok, false);
assert.equal(desligado.reason, 'desligado', 'interruptor desligado → não responde');
assert.equal(desligado.agente, null);

assert.equal(decidirAutoResposta({ ...baseOk, agentes: [] }).reason, 'desligado');
assert.equal(decidirAutoResposta({ ...baseOk, agentes: [{ ...autoOn, ativo: false }] }).reason, 'desligado');

const ligado = decidirAutoResposta(baseOk);
assert.equal(ligado.ok, true);
assert.equal(ligado.reason, 'responder');
assert.equal(ligado.agente.id, 'luna');

assert.equal(decidirAutoResposta({ ...baseOk, fromMe: true }).reason, 'from_me');
assert.equal(decidirAutoResposta({ ...baseOk, isGroup: true }).reason, 'grupo');
assert.equal(decidirAutoResposta({ ...baseOk, hasText: false }).reason, 'sem_texto');
assert.equal(decidirAutoResposta({ ...baseOk, conversa: { status: 'finalizado', ia_pausada: false } }).reason, 'finalizada');
assert.equal(decidirAutoResposta({ ...baseOk, conversa: { status: 'esperando', ia_pausada: true } }).reason, 'humano');
assert.equal(
  decidirAutoResposta({
    ...baseOk,
    conversa: { status: 'esperando', ia_pausada: false, ia_respondeu_em: new Date(agora - 3000).toISOString() },
  }).reason,
  'anti_loop'
);
assert.equal(
  decidirAutoResposta({
    ...baseOk,
    conversa: { status: 'esperando', ia_pausada: false, ia_respondeu_em: new Date(agora - IA_AUTO_COOLDOWN_MS - 1).toISOString() },
  }).ok,
  true
);
assert.equal(decidirAutoResposta({ ...baseOk, conversa: null }).ok, true, 'primeira mensagem sem ficha ainda pode responder');
assert.equal(
  decidirAutoResposta({
    ...baseOk,
    conversa: { status: 'esperando', ia_pausada: false, assigned_to: 'alguem' },
  }).ok,
  true,
  'conversa atribuída sem pausa da IA ainda pode responder',
);
assert.equal(
  decidirAutoResposta({
    ...baseOk,
    conversa: { status: 'entrada', ia_pausada: true, assigned_to: 'alguem' },
  }).reason,
  'humano',
  'equipe já falou (ia_pausada) → não responde neste número',
);

assert.equal(escolherAgente([autoOff, autoOn], { soAutoResponder: true }).id, 'luna');
assert.equal(escolherAgente([autoOff], { soAutoResponder: true }), null);
assert.equal(escolherAgente([autoOff], {}).id, 'luna', 'Sugerir continua usando agente ativo mesmo com automático desligado');

const transfer = patchAposRespostaIa({
  action: 'transfer',
  funil: { destino_tipo: 'setor', destino_setor_id: '11111111-1111-1111-1111-111111111111' },
  nowIso: '2026-09-29T12:00:00.000Z',
});
assert.equal(transfer.status, 'esperando');
assert.equal(transfer.ia_pausada, true);
assert.equal(transfer.setor_id, '11111111-1111-1111-1111-111111111111');
assert.equal(transfer.ia_respondeu_em, '2026-09-29T12:00:00.000Z');

const segue = patchAposRespostaIa({ action: null, nowIso: '2026-09-29T12:00:00.000Z' });
assert.equal(segue.status, 'entrada');
assert.equal(segue.ia_pausada, false);
assert.equal(segue.ia_respondeu_em, '2026-09-29T12:00:00.000Z');
assert.equal(segue.ia_followup_due_at, null);

const segueComFollow = patchAposRespostaIa({
  action: null,
  funil: { followup: { ativo: true, passos: [{ horas: 4, mensagem: 'Ainda por aí?' }] } },
  nowIso: '2026-09-29T12:00:00.000Z',
});
assert.equal(segueComFollow.ia_pausada, false);
assert.equal(segueComFollow.ia_followup_passo, 0);
assert.equal(segueComFollow.ia_followup_due_at, '2026-09-29T16:00:00.000Z');

assert.equal(transfer.ia_followup_due_at, null);

console.log('atendimentoIaAuto: ok');

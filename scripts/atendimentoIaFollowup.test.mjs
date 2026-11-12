import assert from 'node:assert/strict';
import {
  defaultFollowupNoivas,
  defaultFunilNoivas,
  normalizeFollowup,
  normalizeFunil,
} from '../supabase/functions/_shared/atendimentoIaPrompt.js';
import {
  decidirFollowupEnvio,
  patchAposFollowupEnviado,
  patchFollowupAgendar,
  patchFollowupCancel,
} from '../supabase/functions/_shared/atendimentoIaFollowup.js';

assert.equal(defaultFollowupNoivas().ativo, false);
assert.equal(defaultFollowupNoivas().passos.length, 2);
assert.equal(normalizeFunil(defaultFunilNoivas()).followup.ativo, false);

const vazio = normalizeFollowup({ ativo: true, passos: [{ horas: 4, mensagem: '  ' }] });
assert.equal(vazio.ativo, false, 'sem texto não liga');
assert.equal(vazio.passos.length, 0);

const ok = normalizeFollowup({
  ativo: true,
  passos: [
    { horas: 0.1, mensagem: 'Oi, ainda está aí?' },
    { horas: 200, mensagem: 'Segundo' },
    { horas: 8, mensagem: '' },
    { horas: 12, mensagem: 'Terceiro extra' },
  ],
});
assert.equal(ok.ativo, true);
assert.equal(ok.passos.length, 3);
assert.equal(ok.passos[0].horas, 0.25);
assert.equal(ok.passos[1].horas, 168);

const agora = Date.parse('2026-09-29T16:00:00.000Z');
const funilOn = {
  followup: { ativo: true, passos: [{ horas: 4, mensagem: 'Ainda por aí?' }, { horas: 24, mensagem: 'Lembrete 2' }] },
};
const agendado = patchFollowupAgendar({ funil: funilOn, passo: 0, nowMs: agora });
assert.equal(agendado.ia_followup_passo, 0);
assert.equal(agendado.ia_followup_due_at, '2026-09-29T20:00:00.000Z');
assert.deepEqual(patchFollowupAgendar({ funil: defaultFunilNoivas(), nowMs: agora }), patchFollowupCancel());

const conversaDue = {
  status: 'entrada',
  ia_pausada: false,
  ia_followup_passo: 0,
  ia_followup_due_at: '2026-09-29T16:00:00.000Z',
};
assert.equal(decidirFollowupEnvio({ clienteHabilitada: false, conversa: conversaDue, funil: funilOn, nowMs: agora }).reason, 'nao_apice');
assert.equal(
  decidirFollowupEnvio({
    clienteHabilitada: true,
    conversa: { ...conversaDue, ia_pausada: true },
    funil: funilOn,
    nowMs: agora,
  }).reason,
  'humano'
);
assert.equal(
  decidirFollowupEnvio({
    clienteHabilitada: true,
    conversa: conversaDue,
    funil: defaultFunilNoivas(),
    nowMs: agora,
  }).reason,
  'desligado'
);
assert.equal(
  decidirFollowupEnvio({
    clienteHabilitada: true,
    conversa: { ...conversaDue, ia_followup_due_at: '2026-09-29T16:01:00.000Z' },
    funil: funilOn,
    nowMs: agora,
  }).reason,
  'ainda_nao'
);
const enviar = decidirFollowupEnvio({ clienteHabilitada: true, conversa: conversaDue, funil: funilOn, nowMs: agora });
assert.equal(enviar.ok, true);
assert.equal(enviar.mensagem, 'Ainda por aí?');
assert.equal(enviar.passo, 0);

const depois1 = patchAposFollowupEnviado({ funil: funilOn, passoEnviado: 0, nowIso: '2026-09-29T16:00:00.000Z' });
assert.equal(depois1.ia_pausada, false);
assert.equal(depois1.ia_followup_passo, 1);
assert.equal(depois1.ia_followup_due_at, '2026-09-30T16:00:00.000Z');

const depois2 = patchAposFollowupEnviado({ funil: funilOn, passoEnviado: 1, nowIso: '2026-09-29T16:00:00.000Z' });
assert.equal(depois2.ia_followup_due_at, null);
assert.equal(depois2.ia_followup_passo, 0);

console.log('atendimentoIaFollowup: ok');

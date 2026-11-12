import assert from 'node:assert/strict';
import {
  avisoEsperaVisivelPara,
  dedupeAguardandoAviso,
  etapaAvisoEspera,
  mesclarAvisosGrupoNaCaixa,
  nomeGrupoAviso,
  normalizarAvisoEspera,
} from '../src/lib/atendimentoAvisoEspera.js';

const cfg = normalizarAvisoEspera(null);
assert.equal(cfg.habilitado, true);
assert.equal(cfg.primeiroMinutos, 10);
assert.equal(cfg.repetirMinutos, 10);

const custom = normalizarAvisoEspera({ habilitado: false, primeiro_minutos: 15, repetir_minutos: 5 });
assert.equal(custom.habilitado, false);
assert.equal(custom.primeiroMinutos, 15);
assert.equal(custom.repetirMinutos, 5);
assert.equal(normalizarAvisoEspera({ primeiro_minutos: 0, repetir_minutos: 999 }).primeiroMinutos, 1);
assert.equal(normalizarAvisoEspera({ primeiro_minutos: 0, repetir_minutos: 999 }).repetirMinutos, 240);

const dez = cfg;
assert.equal(etapaAvisoEspera(9 * 60000, dez), null);
assert.equal(etapaAvisoEspera(10 * 60000, dez), 0);
assert.equal(etapaAvisoEspera(19 * 60000, dez), 0);
assert.equal(etapaAvisoEspera(20 * 60000, dez), 1);
assert.equal(etapaAvisoEspera(35 * 60000, dez), 2);
assert.equal(etapaAvisoEspera(60 * 60000, custom), null);

assert.equal(avisoEsperaVisivelPara({ role: 'superadmin', userId: 'a', assignedTo: 'b' }), true);
assert.equal(avisoEsperaVisivelPara({ role: 'admin', userId: 'a', assignedTo: 'b' }), true);
assert.equal(avisoEsperaVisivelPara({ role: 'colaborador', userId: 'poliana', assignedTo: 'poliana' }), true);
assert.equal(avisoEsperaVisivelPara({ role: 'colaborador', userId: 'poliana', assignedTo: null }), true);
assert.equal(avisoEsperaVisivelPara({ role: 'colaborador', userId: 'poliana', assignedTo: 'rafa' }), false);
assert.equal(avisoEsperaVisivelPara({ role: 'cliente', userId: 'loja', assignedTo: null }), false);

const grupos = dedupeAguardandoAviso([
  { id: '1', is_group: true, chat_jid: 'g1', display_name: 'MKT Ana', awaiting_response_since: '2026-10-08T12:00:00Z' },
  { id: '2', is_group: true, chat_jid: 'g1', display_name: '5511999999999', awaiting_response_since: '2026-10-08T11:00:00Z' },
  { id: '3', is_group: false, chat_jid: 'p1', display_name: 'Cruzeiro do Sul', awaiting_response_since: '2026-10-08T10:00:00Z' },
]);
assert.deepEqual(grupos.map((row) => row.id), ['2']);
assert.equal(nomeGrupoAviso(grupos[0]), 'MKT Ana');
assert.equal(nomeGrupoAviso({ display_name: '120363' }), 'Grupo');

const caixa = mesclarAvisosGrupoNaCaixa(
  [{ id: 'p1', origem: 'conversa', fila: 'cliente_sem_resposta', conversation_id: 'g-aberto' }],
  [
    { id: 'g-aberto', nome: 'Já na caixa', tempo: '10 min', chatJid: 'a', status: 'em_atendimento', clienteId: 'c1', responsavel: 'Ana' },
    { id: 'g-novo', nome: 'RIO SUL - MKT', tempo: '12 min', chatJid: 'b', status: 'aguardando', clienteId: 'c1', responsavel: 'Poliana', since: '2026-10-08T10:00:00Z' },
  ],
);
assert.deepEqual(caixa.map((item) => item.conversation_name), ['RIO SUL - MKT', undefined]);
assert.equal(caixa[0].aviso_grupo, true);
assert.equal(caixa[0].last_message_preview, 'Há 12 min sem resposta');
assert.equal(caixa[0].empresa, 'Poliana');

console.log('atendimentoAvisoEspera: ok');

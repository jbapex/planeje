import assert from 'node:assert/strict';
import {
  atalhoDigitado,
  caixaDaConversa,
  caixasDaConversa,
  isAtendimentoLojaHabilitada,
  hasAtendimentoPagePermission,
  nivelEfetivo,
  normalizeAtalho,
  permissoesDoNivel,
  podeAbrirConfiguracao,
  podeVerConversa,
} from '../src/lib/atendimentoLojaAcesso.js';

const APICE = 'a2396b48-2d2f-4b4b-adfd-3a4043b320e6';
const OUTRA = '11111111-2222-3333-4444-555555555555';

assert.equal(isAtendimentoLojaHabilitada(APICE), true);
assert.equal(isAtendimentoLojaHabilitada(OUTRA), false);
assert.equal(isAtendimentoLojaHabilitada(null), false);
assert.equal(isAtendimentoLojaHabilitada(OUTRA, true), true);
assert.equal(isAtendimentoLojaHabilitada(APICE, false), false);

// Nível efetivo
assert.equal(nivelEfetivo({ nivel: 'admin', ativo: true }, APICE), 'admin');
assert.equal(nivelEfetivo({ nivel: 'atendente', ativo: false }, APICE), null);
assert.equal(nivelEfetivo({ nivel: 'admin', ativo: true }, OUTRA), null);
assert.equal(nivelEfetivo({ nivel: 'admin', ativo: true, cliente_id: OUTRA }, APICE), null);
assert.equal(nivelEfetivo(null, APICE), null);
assert.equal(nivelEfetivo({ nivel: 'admin', ativo: true, cliente_id: OUTRA }, OUTRA, { lojaHabilitada: true }), 'admin');
assert.equal(nivelEfetivo(null, OUTRA, { lojaHabilitada: true, implicitAdmin: true }), 'admin');
assert.equal(nivelEfetivo(null, APICE, { lojaHabilitada: false, implicitAdmin: true }), null);

assert.equal(hasAtendimentoPagePermission(null, APICE), true);
assert.equal(hasAtendimentoPagePermission(null, OUTRA), false);
assert.equal(hasAtendimentoPagePermission(['atendimento'], OUTRA), true);

// Permissões por nível
const pa = permissoesDoNivel('admin');
const ps = permissoesDoNivel('supervisor');
const pt = permissoesDoNivel('atendente');
assert.equal(pa.gerenciarUsuarios && pa.configurarIA && pa.verPrivadas, true);
assert.equal(ps.verTodas && ps.transferir && ps.configurarRespostas && ps.configurarEtiquetas, true);
assert.equal(ps.gerenciarUsuarios || ps.configurarIA || ps.verPrivadas, false);
assert.equal(pt.enviar, true);
assert.equal(
  pt.verTodas || pt.configurarRespostas || pt.configurarEtiquetas || pt.configurarSetores || pt.gerenciarUsuarios || pt.configurarIA,
  false
);
assert.equal(permissoesDoNivel(null).enviar, false);
assert.equal(podeAbrirConfiguracao('admin'), true);
assert.equal(podeAbrirConfiguracao('supervisor'), true);
assert.equal(podeAbrirConfiguracao('atendente'), false);

// Visibilidade (mesma regra do SQL cliente_atend_pode_ver_contato_de)
const eu = 'user-eu';
const outro = 'user-outro';
const setorA = 'setor-a';
const setorB = 'setor-b';
assert.equal(podeVerConversa({ nivel: 'admin', userId: eu, conversa: { privado: true, assigned_to: outro } }), true);
assert.equal(podeVerConversa({ nivel: 'supervisor', userId: eu, conversa: null }), true);
assert.equal(podeVerConversa({ nivel: 'supervisor', userId: eu, conversa: { privado: true, assigned_to: outro } }), false);
assert.equal(podeVerConversa({ nivel: 'supervisor', userId: eu, conversa: { privado: true, assigned_to: eu } }), true);
assert.equal(podeVerConversa({ nivel: 'atendente', userId: eu, conversa: null }), false);
assert.equal(podeVerConversa({ nivel: 'atendente', userId: eu, conversa: { assigned_to: eu } }), true);
assert.equal(podeVerConversa({ nivel: 'atendente', userId: eu, conversa: { assigned_to: outro, setor_id: setorA }, setorIds: [setorA] }), true);
assert.equal(podeVerConversa({ nivel: 'atendente', userId: eu, conversa: { assigned_to: outro, setor_id: setorB }, setorIds: [setorA] }), false);
assert.equal(
  podeVerConversa({ nivel: 'atendente', userId: eu, conversa: { assigned_to: outro, setor_id: setorA, privado: true }, setorIds: [setorA] }),
  false
);
assert.equal(podeVerConversa({ nivel: null, userId: eu, conversa: { assigned_to: eu } }), false);

// Caixas
const t0 = '2026-09-28T10:00:00Z';
const t1 = '2026-09-28T11:00:00Z';
const t2 = '2026-09-28T12:00:00Z';
// Caixas no jeito do Umbler: Esperando = última mensagem do contato; Entrada = já respondida.
assert.equal(caixaDaConversa({ lastInboundAt: t1, lastOutboundAt: t0 }), 'esperando');
assert.equal(caixaDaConversa({ lastInboundAt: t0, lastOutboundAt: t1 }), 'entrada');
assert.equal(caixaDaConversa({ lastInboundAt: t0 }), 'esperando', 'primeiro contato sem resposta');
assert.deepEqual(
  caixasDaConversa({ lastInboundAt: t1, lastOutboundAt: t0 }),
  { entrada: true, esperando: true, finalizados: false, reaberta: false },
  'respondida uma vez e com mensagem nova do contato: nas duas caixas'
);
assert.deepEqual(caixasDaConversa({ lastInboundAt: t0 }), { entrada: false, esperando: true, finalizados: false, reaberta: false });
assert.equal(caixaDaConversa({ conversa: { status: 'finalizado', status_at: t1 }, lastInboundAt: t0, lastOutboundAt: t0 }), 'finalizados');
assert.equal(caixaDaConversa({ conversa: { status: 'finalizado', status_at: t1 }, lastInboundAt: t2, lastOutboundAt: t0 }), 'esperando');
assert.equal(caixasDaConversa({ conversa: { status: 'finalizado', status_at: t1 }, lastInboundAt: t2, lastOutboundAt: t0 }).reaberta, true);
assert.equal(caixaDaConversa({ conversa: { status: 'esperando', status_at: t1 }, lastInboundAt: t0, lastOutboundAt: t0 }), 'esperando', 'marcada à mão');
assert.equal(caixaDaConversa({ conversa: { status: 'esperando', status_at: t1 }, lastInboundAt: t0, lastOutboundAt: t2 }), 'entrada', 'respondeu depois de marcar');
assert.equal(caixaDaConversa({ conversa: { status: 'entrada', status_at: t2 }, lastInboundAt: t0, lastOutboundAt: t1 }), 'entrada');

// Atalhos
assert.equal(normalizeAtalho('/Olá Mundo'), 'olamundo');
assert.equal(normalizeAtalho('preco-vestido'), 'preco-vestido');
assert.equal(atalhoDigitado('/pre'), 'pre');
assert.equal(atalhoDigitado('/'), '');
assert.equal(atalhoDigitado('oi /pre'), null);

console.log('PASS atendimento loja acesso');

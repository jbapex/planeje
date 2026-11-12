import assert from 'node:assert/strict';
import {
  buildSystemPrompt,
  defaultFunilNoivas,
  destinoFunilLabel,
  escolherAgente,
  historicoParaMensagens,
  IA_FUNIL_ACTION_JSON,
  IA_INSTRUCOES_NOIVAS,
  IA_MAX_BASE_CHARS,
  IA_OBJETIVO_NOIVAS,
  mensagensDeTeste,
  normalizeFunil,
  parseIaAction,
  proximaAcaoFunil,
  stripFunilInstrucoes,
  withFunilInstrucoes,
} from '../supabase/functions/_shared/atendimentoIaPrompt.js';

const agente = { nome: 'Luna', objetivo: 'Agendar prova de vestido', instrucoes: 'Ofereça horário de sábado.', tom: 'formal' };
const prompt = buildSystemPrompt({
  agente,
  bases: [{ nome: 'Horários', conteudo: 'Seg a sáb, 9h às 18h.' }],
  lojaNome: 'Ápice Noivas',
  contatoNome: 'Josias',
});
assert.match(prompt, /Luna/);
assert.match(prompt, /Ápice Noivas/);
assert.match(prompt, /formal e objetivo/);
assert.match(prompt, /### Horários\nSeg a sáb/);
assert.match(prompt, /nunca invente/);
assert.match(prompt, /já se chama Josias/);
assert.match(prompt, /NÃO pergunte como te chamar/);
assert.match(prompt, /uma pergunta/);
assert.match(prompt, /Não ofereça ligação/);

const tomDesconhecido = buildSystemPrompt({ agente: { nome: 'X', tom: 'gritando' } });
assert.match(tomDesconhecido, /cordial e acolhedor/);

const grande = buildSystemPrompt({
  agente,
  bases: [
    { nome: 'A', conteudo: 'a'.repeat(IA_MAX_BASE_CHARS - 10) },
    { nome: 'B', conteudo: 'b'.repeat(500) },
    { nome: 'C', conteudo: 'c'.repeat(500) },
  ],
});
assert.equal((grande.match(/b/g) || []).length >= 10, true);
assert.equal(grande.includes('### C'), false, 'base além do limite fica de fora');

const hist = historicoParaMensagens({
  inboxRows: [
    { body: 'Oi', created_at: '2026-09-28T10:00:00Z' },
    { body: '  ', created_at: '2026-09-28T10:01:00Z' },
    { body: 'Tem horário sábado?', msg_timestamp: '2026-09-28T10:05:00Z' },
  ],
  sentRows: [{ body: 'Olá! Tudo bem?', created_at: '2026-09-28T10:02:00Z' }],
});
assert.deepEqual(hist, [
  { role: 'user', content: 'Oi' },
  { role: 'assistant', content: 'Olá! Tudo bem?' },
  { role: 'user', content: 'Tem horário sábado?' },
]);
assert.equal(
  historicoParaMensagens({
    sentRows: [{ body: '*Atendente:*\nOla tudo bem?', created_at: '2026-09-28T10:02:00Z' }],
  })[0].content,
  '(O atendente da loja escreveu) Ola tudo bem?'
);
assert.equal(
  historicoParaMensagens({ inboxRows: Array.from({ length: 30 }, (_, i) => ({ body: `m${i}`, created_at: new Date(2026, 8, 1, 0, i).toISOString() })) }).length,
  20
);

assert.deepEqual(mensagensDeTeste([{ role: 'system', content: 'ignore' }, { role: 'user', content: 'oi' }, { role: 'assistant', content: '' }]), [
  { role: 'user', content: 'oi' },
]);

const agentes = [
  { id: 'a', ativo: false, setor_ids: [] },
  { id: 'b', ativo: true, setor_ids: ['vendas'] },
  { id: 'c', ativo: true, setor_ids: [] },
];
assert.equal(escolherAgente(agentes, { setorId: 'vendas' }).id, 'b');
assert.equal(escolherAgente(agentes, { setorId: 'outro' }).id, 'c');
assert.equal(escolherAgente(agentes, {}).id, 'c');
assert.equal(escolherAgente(agentes, { agenteId: 'a' }), null, 'agente desligado não responde');
assert.equal(escolherAgente([{ id: 'x', ativo: false }], {}), null);
assert.equal(
  escolherAgente(
    [
      { id: 'off', ativo: true, auto_responder: false, setor_ids: [] },
      { id: 'on', ativo: true, auto_responder: true, setor_ids: [] },
    ],
    { soAutoResponder: true }
  ).id,
  'on'
);
assert.equal(escolherAgente([{ id: 'off', ativo: true, auto_responder: false, setor_ids: [] }], { soAutoResponder: true }), null);

const funil = {
  perguntas: ['Qual é o seu nome?', 'Qual é a data do casamento?'],
  criterio: 'informou nome e data do casamento',
  destino_tipo: 'setor',
  destino_setor_id: '11111111-1111-1111-1111-111111111111',
  mensagem_transicao: 'Vou te passar para a consultora.',
};
assert.deepEqual(normalizeFunil({ perguntas: ['  Nome  ', '', 'Data'], destino_tipo: 'humano' }).perguntas, ['Nome', 'Data']);
assert.equal(destinoFunilLabel(funil, [{ id: funil.destino_setor_id, nome: 'Geral' }]), 'o setor Geral');
assert.equal(destinoFunilLabel({ destino_tipo: 'proximo' }), 'o próximo atendente');

const padraoNoivas = defaultFunilNoivas();
assert.equal(padraoNoivas.perguntas.length, 6);
assert.match(padraoNoivas.perguntas[0], /nome da loja/);
assert.match(padraoNoivas.perguntas.join(' '), /noivas, festas ou os dois/);
assert.match(padraoNoivas.perguntas.join(' '), /WhatsApp ou tráfego/);
assert.match(padraoNoivas.perguntas.join(' '), /Mini CRM/);
assert.match(padraoNoivas.perguntas.join(' '), /atendente da Ápice/);
assert.match(padraoNoivas.criterio, /nicho/);
assert.match(padraoNoivas.mensagem_transicao, /atendente da Ápice/);
assert.doesNotMatch(padraoNoivas.perguntas.join(' '), /vestido/);
assert.doesNotMatch(padraoNoivas.mensagem_transicao, /prova/);
assert.match(IA_OBJETIVO_NOIVAS, /atendente da Ápice/);
assert.match(IA_OBJETIVO_NOIVAS, /agência/);
assert.doesNotMatch(IA_OBJETIVO_NOIVAS, /qualificar a noiva/);
assert.match(IA_INSTRUCOES_NOIVAS, /agência de lojas de noivas e festas/);
assert.match(IA_INSTRUCOES_NOIVAS, /atendente da Ápice/);
assert.doesNotMatch(IA_INSTRUCOES_NOIVAS, /suporte técnico/);
assert.match(IA_INSTRUCOES_NOIVAS, /Não venda vestido/);
assert.match(IA_INSTRUCOES_NOIVAS, /como te chamar/);
assert.match(IA_INSTRUCOES_NOIVAS, /Uma pergunta por mensagem/);
assert.match(IA_INSTRUCOES_NOIVAS, /Não ofereça ligação/);

const promptFunil = buildSystemPrompt({
  agente: { ...agente, funil },
  lojaNome: 'Ápice Noivas',
});
assert.match(promptFunil, /Qualificar/);
assert.match(promptFunil, /Qual é a data do casamento/);
assert.match(promptFunil, /informou nome e data/);
assert.match(promptFunil, /action":"transfer"/);
assert.match(promptFunil, /NÃO escreva essa linha JSON/);
assert.match(promptFunil, /agência de lojas de noivas e festas/);
assert.match(promptFunil, /atendente da Ápice/);
assert.match(promptFunil, /nunca "suporte"/);
assert.match(promptFunil, /critério JÁ fechou/);
assert.match(promptFunil, /Nunca atrase a transferência/);
assert.match(promptFunil, /Não ofereça prova de vestido/);
assert.match(promptFunil, /uma pergunta por mensagem/);
assert.match(promptFunil, /nunca invente nicho/);
assert.match(promptFunil, /não ofereça ligação/);

const noivasFecha = proximaAcaoFunil(defaultFunilNoivas(), [
  { role: 'user', content: 'Oi, sou da loja Recife Noivas, em Recife, nicho noivas' },
]);
assert.equal(noivasFecha.action, 'transfer');
assert.equal(noivasFecha.reason, 'qualificado');

const noivaNaoFecha = proximaAcaoFunil(defaultFunilNoivas(), [
  { role: 'user', content: 'Oi, meu casamento é em 12/12/2026, em Recife' },
]);
assert.equal(noivaNaoFecha.action, 'perguntar');

const incompleto = proximaAcaoFunil(funil, [{ role: 'user', content: 'Oi, vocês abrem sábado?' }]);
assert.equal(incompleto.action, 'perguntar');
assert.equal(incompleto.etapa, 'qualificando');

const completo = proximaAcaoFunil(funil, [
  { role: 'user', content: 'Oi' },
  { role: 'assistant', content: 'Qual é o seu nome?' },
  { role: 'user', content: 'Ana Silva, casamento 12/12/2026' },
]);
assert.equal(completo.action, 'transfer');
assert.equal(completo.reason, 'qualificado');

const comJson = parseIaAction('Vou te passar para a consultora agora.\n{"action":"transfer","reason":"qualificado"}');
assert.equal(comJson.action, 'transfer');
assert.equal(comJson.reason, 'qualificado');
assert.equal(comJson.texto, 'Vou te passar para a consultora agora.');
assert.equal(parseIaAction('Qual é a data do casamento?').action, null);

const viaJsonAssistente = proximaAcaoFunil(funil, [
  { role: 'user', content: 'Oi' },
  { role: 'assistant', content: `Certo. ${IA_FUNIL_ACTION_JSON}` },
]);
assert.equal(viaJsonAssistente.etapa, 'aguardando_atendente');

const espelhado = withFunilInstrucoes('Cumprimente pelo nome.', funil);
assert.match(espelhado, /<!--funil-ia-->/);
assert.equal(stripFunilInstrucoes(espelhado), 'Cumprimente pelo nome.');

console.log('atendimentoIaPrompt: ok');

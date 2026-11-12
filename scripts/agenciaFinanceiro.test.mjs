import assert from 'node:assert/strict';
import {
  buildMensalidadeLancamento,
  buildMensalidadeLancamentos,
  splitMensalidadeValor,
  cashDateForMensalidade,
  canSettle,
  findCategoriaMensalidade,
  formatMoneyBr,
  formatMonthLabel,
  mensalidadesToCreate,
  rebalanceMensalidadesParceladas,
  clienteCobraNoMes,
  mensalidadeForaDaEntrada,
  agruparCobrancasParaTabela,
  monthStart,
  normalizeDiaCobranca,
  settleStatusForGrupo,
  shiftMonth,
  shouldGenerateMensalidade,
  summarizeCaixa,
  summarizeDre,
  dataMandarBoleto,
  situacaoCobranca,
  vencimentoMensalidade,
  dataRecebimentoMensalidade,
  clientEntradaNaBase,
  folhaTotal,
  splitSalario,
  partePagamento,
  partePagamentoBruta,
  validarDescontoFolha,
  buildFolhaLancamento,
  buildValeLancamento,
  equipeChaveOrdenacao,
  folhaCamposFromLancamentoStatus,
  folhaParteFromDescricao,
  folhaPagamentoLiquidado,
  folhaValeLiquidado,
  patchFolhaFromLancamentos,
  isCategoriaSalario,
  descricaoFolhaParte,
  grupoUsaColaborador,
  isOrigemFolha,
  grupoAceitaFixo,
  mesesDaRecorrencia,
  recorrenciaAtivaNoMes,
  buildRecorrenciaLancamento,
  recorrenciasToCreate,
  folhasToCreate,
  civilToday,
  civilDueDate,
  margemResultado,
  naCompetencia,
  resumoCaixaPeriodo,
  saldoPendenteCents,
  validarLiquidacao,
  efeitoCaixaLiquidacao,
  prazoTitulo,
  servicoProntoParaAtivar,
  ocorrenciasDoServico,
  ocorrenciasAEmitir,
  valorNaCompetencia,
  movimentoConsolidado,
  fromCents,
  buildFaturamentoAno,
  buildClientesNovosAno,
  totalSerie,
  mesesDoAnoParaGrafico,
} from '../src/lib/agenciaFinanceiro.js';

assert.equal(monthStart('2026-10-15'), '2026-10-01');
assert.equal(monthStart('2026-10'), '2026-10-01');
assert.equal(shiftMonth('2026-10-01', -1), '2026-09-01');
assert.equal(shiftMonth('2026-10-01', 1), '2026-11-01');
assert.equal(formatMonthLabel('2026-10-01'), 'Outubro de 2026');

assert.equal(normalizeDiaCobranca(10), 10);
assert.equal(normalizeDiaCobranca(29), null);
assert.equal(normalizeDiaCobranca(''), null);
assert.equal(cashDateForMensalidade('2026-10-01', 5), '2026-10-05');
assert.equal(cashDateForMensalidade('2026-10-01', null), null);

assert.equal(shouldGenerateMensalidade({ etapa: 'closed', valor: 1500 }), true);
assert.equal(shouldGenerateMensalidade({ etapa: 'prospect', valor: 1500 }), false);
assert.equal(shouldGenerateMensalidade({ etapa: 'closed', valor: 0 }), false);

const cat = findCategoriaMensalidade([
  { id: 'a', nome: 'Serviço avulso', grupo: 'receita', ativa: true },
  { id: 'b', nome: 'Mensalidade', grupo: 'receita', ativa: true },
]);
assert.equal(cat.id, 'b');

const mensalidade = buildMensalidadeLancamento({
  client: { id: 'c1', empresa: 'Ápice', etapa: 'closed', valor: 2500, dia_cobranca: 10 },
  mesRef: '2026-10-15',
  categoriaId: 'b',
});
assert.deepEqual(mensalidade, {
  competencia: '2026-10-01',
  data_caixa: '2026-10-10',
  grupo: 'receita',
  categoria_id: 'b',
  cliente_id: 'c1',
  descricao: 'Mensalidade — Ápice',
  valor: 2500,
  origem: 'mensalidade',
  status: 'previsto',
  parcela_mensalidade: 1,
});

const duas = buildMensalidadeLancamentos({
  client: {
    id: 'c4',
    empresa: 'Teste',
    etapa: 'closed',
    valor: 3000,
    dia_cobranca: 5,
    cobranca_parcelada: true,
    dia_cobranca_2: 20,
  },
  mesRef: '2026-10-01',
  categoriaId: 'b',
});
assert.equal(duas.length, 2);
assert.equal(duas[0].valor, 1500);
assert.equal(duas[1].valor, 1500);
assert.equal(duas[0].data_caixa, '2026-10-05');
assert.equal(duas[1].data_caixa, '2026-10-20');
assert.deepEqual(splitMensalidadeValor(2501), { parcela1: 1250.5, parcela2: 1250.5 });

const toCreate = mensalidadesToCreate({
  clients: [
    { id: 'c1', empresa: 'Ápice', etapa: 'closed', valor: 2500, dia_cobranca: 10 },
    { id: 'c2', empresa: 'JR', etapa: 'closed', valor: 1800 },
    { id: 'c3', empresa: 'Lead', etapa: 'prospect', valor: 900 },
  ],
  existingLancamentos: [
    { origem: 'mensalidade', status: 'previsto', cliente_id: 'c1' },
  ],
  mesRef: '2026-10-01',
  categoriaId: 'b',
});
assert.equal(toCreate.length, 1);
assert.equal(toCreate[0].cliente_id, 'c2');

const lancamentos = [
  { grupo: 'receita', status: 'previsto', valor: 2500 },
  { grupo: 'receita', status: 'recebido', valor: 1800 },
  { grupo: 'custo', status: 'previsto', valor: 400 },
  { grupo: 'despesa', status: 'pago', valor: 1200 },
  { grupo: 'repasse', status: 'recebido', valor: 3000 },
  { grupo: 'repasse', status: 'pago', valor: 3000 },
  { grupo: 'receita', status: 'cancelado', valor: 999 },
];

assert.deepEqual(summarizeDre(lancamentos), {
  receita: 4300,
  custo: 400,
  despesa: 1200,
  resultado: 2700,
});

assert.deepEqual(summarizeCaixa(lancamentos), {
  aReceber: 2500,
  recebido: 4800,
  aPagar: 400,
  pago: 4200,
});

assert.equal(canSettle({ status: 'previsto' }), true);
assert.equal(canSettle({ status: 'recebido' }), false);
assert.equal(settleStatusForGrupo('receita'), 'recebido');
assert.equal(settleStatusForGrupo('despesa'), 'pago');

const brl = formatMoneyBr(9300).replace(/\s/g, ' ');
assert.equal(brl, 'R$ 9.300,00');

assert.equal(dataMandarBoleto('2026-10-10'), '2026-10-05');
assert.equal(dataMandarBoleto('2026-10-03'), '2026-10-01');
assert.equal(situacaoCobranca({ status: 'previsto', data_caixa: '2026-10-05', boleto_em: null }, '2026-10-06').situacao, 'atrasado');
assert.equal(situacaoCobranca({ status: 'previsto', data_caixa: '2026-10-10', boleto_em: null }, '2026-10-06').boleto, 'mandar');
assert.equal(situacaoCobranca({ status: 'recebido', data_caixa: '2026-10-05', boleto_em: '2026-10-01' }, '2026-10-06').situacao, 'pago');
assert.equal(
  vencimentoMensalidade(
    { status: 'recebido', data_caixa: '2026-10-03', competencia: '2026-10-01', origem: 'mensalidade' },
    10,
  ),
  '2026-10-10',
);
assert.equal(dataRecebimentoMensalidade({ status: 'recebido', data_caixa: '2026-10-03' }), '2026-10-03');
assert.equal(
  situacaoCobranca(
    { origem: 'mensalidade', status: 'recebido', data_caixa: '2026-10-03', competencia: '2026-10-01' },
    '2026-10-06',
    10,
  ).vence,
  '2026-10-10',
);
assert.equal(folhaTotal({ salario: 3000, extras: 200 }), 3200);
assert.equal(folhaTotal({ salario: 3000, extras: 200, desconto: 200 }), 3000);
const partes = splitSalario(3000, 40);
assert.equal(partes.vale, 1200);
assert.equal(partes.pagamento, 1800);
assert.equal(partes.pctPagamento, 60);
assert.equal(splitSalario(100, 33).vale, 33);
assert.equal(splitSalario(100, 33).pagamento, 67);
assert.equal(partePagamento({ salario: 3000, pct_vale: 40, extras: 200 }), 2000);
assert.equal(partePagamentoBruta({ salario: 2500, pct_vale: 40, extras: 200 }), 1700);
assert.equal(partePagamento({ salario: 2500, pct_vale: 40, extras: 200, desconto: 200 }), 1500);
assert.equal(splitSalario(2500, 40).vale, 1000);
assert.equal(validarDescontoFolha({ salario: 2500, pct_vale: 40, extras: 200, desconto: 200, desconto_motivo: 'falta' }).ok, true);
assert.equal(validarDescontoFolha({ salario: 2500, pct_vale: 40, extras: 200, desconto: 200, desconto_motivo: '' }).ok, false);
assert.equal(validarDescontoFolha({ salario: 2500, pct_vale: 40, extras: 200, desconto: 1800, desconto_motivo: 'falta' }).ok, false);
assert.equal(
  validarDescontoFolha(
    { salario: 2500, pct_vale: 40, extras: 0, desconto: 100, desconto_motivo: 'falta' },
    { pagamentoPago: true, descontoAnterior: 0 },
  ).ok,
  false,
);
const lancComDesconto = buildFolhaLancamento({
  folha: { salario: 2500, pct_vale: 40, extras: 200, desconto: 200, status: 'previsto', dia_pagamento: 5 },
  mesRef: '2026-10-01',
  categoriaId: 'sal',
  nome: 'Ana',
});
assert.equal(lancComDesconto.valor, 1500);
assert.equal(
  buildValeLancamento({
    folha: { salario: 2500, pct_vale: 40, extras: 200, desconto: 200, vale_status: 'previsto', dia_vale: 20 },
    mesRef: '2026-10-01',
    categoriaId: 'sal',
    nome: 'Ana',
  }).valor,
  1000,
);
const valeLanc = buildValeLancamento({
  folha: { vale: 800, vale_status: 'previsto', dia_vale: 15 },
  mesRef: '2026-10-01',
  categoriaId: 'sal',
  nome: 'Ana',
});
assert.equal(valeLanc.descricao, 'Vale — Ana');
assert.equal(valeLanc.valor, 800);
assert.equal(valeLanc.data_caixa, '2026-11-15');
assert.equal(buildValeLancamento({ folha: { vale: 0 }, mesRef: '2026-10-01', categoriaId: 'sal', nome: 'Ana' }), null);
const ordPag = equipeChaveOrdenacao(
  { salario: 2500, pct_vale: 40, extras: 0, status: 'previsto', vale_status: 'previsto', dia_pagamento: 5, dia_vale: 20 },
  '2026-10-01',
);
const ordSoVale = equipeChaveOrdenacao(
  { salario: 2500, pct_vale: 40, extras: 0, status: 'pago', vale_status: 'previsto', dia_pagamento: 5, dia_vale: 20 },
  '2026-10-01',
);
assert.equal(ordPag.prioridade, 0);
assert.equal(ordPag.iso, '2026-10-05');
assert.equal(ordSoVale.prioridade, 1);
assert.equal(ordSoVale.iso, '2026-11-20');
assert.equal(folhaParteFromDescricao('Vale — Ana'), 'vale');
assert.equal(folhaParteFromDescricao('Salário — Ana'), 'pagamento');
assert.equal(folhaParteFromDescricao('Vale — Ana — Cancelado: erro'), 'vale');
assert.equal(isCategoriaSalario({ nome: 'Salário', grupo: 'despesa' }), true);
assert.equal(isCategoriaSalario({ nome: 'Aluguel', grupo: 'despesa' }), false);
assert.equal(descricaoFolhaParte('vale', 'Ana'), 'Vale — Ana');
assert.equal(descricaoFolhaParte('pagamento', 'Ana'), 'Salário — Ana');
assert.equal(grupoUsaColaborador('despesa'), true);
assert.equal(grupoUsaColaborador('receita'), false);
const lancMapFix = new Map([
  ['l-vale', { status: 'cancelado' }],
  ['l-pag', { status: 'pago', data_caixa: '2026-10-01' }],
]);
const folhaJosias = {
  status: 'pago',
  pago_em: '2026-10-01',
  vale_status: 'pago',
  vale_pago_em: '2026-10-01',
  lancamento_id: 'l-pag',
  vale_lancamento_id: 'l-vale',
};
assert.equal(folhaValeLiquidado(folhaJosias, lancMapFix), false);
assert.equal(folhaPagamentoLiquidado(folhaJosias, lancMapFix), true);
assert.deepEqual(patchFolhaFromLancamentos(folhaJosias, lancMapFix), {
  vale_status: 'previsto',
  vale_pago_em: null,
});
assert.deepEqual(folhaCamposFromLancamentoStatus('pagamento', 'previsto', null), {
  status: 'previsto',
  pago_em: null,
});
assert.deepEqual(folhaCamposFromLancamentoStatus('vale', 'pago', '2026-11-05'), {
  vale_status: 'pago',
  vale_pago_em: '2026-11-05',
});
const folhaLanc = buildFolhaLancamento({
  folha: { salario: 3000, extras: 0, status: 'pago', pago_em: '2026-10-05' },
  mesRef: '2026-10-01',
  categoriaId: 'sal',
  nome: 'Ana',
});
assert.equal(folhaLanc.origem, 'folha');
assert.equal(folhaLanc.status, 'pago');
assert.equal(folhaLanc.valor, 3000);
assert.equal(folhaLanc.descricao, 'Salário — Ana');
const folhaParte = buildFolhaLancamento({
  folha: { salario: 3000, extras: 0, pct_vale: 40, status: 'previsto', dia_pagamento: 20 },
  mesRef: '2026-10-01',
  categoriaId: 'sal',
  nome: 'Ana',
});
assert.equal(folhaParte.valor, 1800);
assert.equal(folhaParte.data_caixa, '2026-10-20');
const novas = folhasToCreate({
  contratos: [
    { profile_id: 'a', ativo: true, salario: 2000, extras: 100, funcao: 'Design', forma: 'pix', dia_pagamento: 5 },
    { profile_id: 'b', ativo: false, salario: 1000 },
    { profile_id: 'a', ativo: true, salario: 2000 },
  ],
  existingFolha: [{ profile_id: 'c' }],
  mesRef: '2026-10-01',
});
assert.equal(novas.length, 1);
assert.equal(novas[0].profile_id, 'a');
assert.equal(novas[0].competencia, '2026-10-01');
assert.equal(novas[0].dia_pagamento, 5);
const segunda = folhasToCreate({
  contratos: [
    { profile_id: 'a', ativo: true, salario: 2000, extras: 100, funcao: 'Design', forma: 'pix', dia_pagamento: 5 },
  ],
  existingFolha: [{ profile_id: 'c' }, ...novas],
  mesRef: '2026-10-01',
});
assert.equal(segunda.length, 0);

assert.equal(situacaoCobranca({ status: 'previsto', data_caixa: null }, '2026-10-06').situacao, 'sem_vencimento');

const entrada = clientEntradaNaBase({ inicio_na_base: '2026-03-15', created_at: '2025-01-01' });
assert.equal(entrada.getMonth(), 2);
assert.equal(clientEntradaNaBase({ created_at: '2026-08-01T12:00:00Z' }).getFullYear(), 2026);
assert.equal(
  vencimentoMensalidade(
    { competencia: '2026-10-01', status: 'previsto', parcela_mensalidade: 2 },
    10,
    25,
  ),
  '2026-10-25',
);
assert.equal(civilDueDate('2026-02-01', 31), '2026-02-28');
assert.equal(civilDueDate('2024-02-01', 31), '2024-02-29');
assert.equal(civilToday(new Date('2026-10-01T02:30:00Z')), '2026-09-30');

const maison = {
  id: 'srv-maison',
  cliente_id: 'maison',
  descricao: 'Gestão',
  estado: 'rascunho',
  valor: 2500,
  inicio: '2026-10-01',
  periodicidade: 'mensal',
  dia_cobranca: 10,
  parcelas: 6,
  modo: 'recorrente',
};
assert.equal(ocorrenciasDoServico(maison).length, 0);
assert.equal(
  mensalidadesToCreate({
    clients: [{ id: 'maison', empresa: 'Maison teste', etapa: 'closed', valor: 2500, dia_cobranca: 10 }],
    existingLancamentos: [],
    mesRef: '2026-10-01',
    categoriaId: 'b',
  }).length,
  1,
);

const maisonAtivo = { ...maison, estado: 'ativo' };
const seis = ocorrenciasDoServico(maisonAtivo, { ateMes: '2027-03-01' });
assert.equal(seis.length, 6);
assert.equal(seis.reduce((sum, item) => sum + item.valor, 0), 15000);
const primeira = ocorrenciasAEmitir({ servicos: [maisonAtivo], existentes: [], mesRef: '2026-10-01' });
const repetida = ocorrenciasAEmitir({
  servicos: [maisonAtivo],
  existentes: primeira.map((item) => ({ chave: item.chave, status: 'previsto' })),
  mesRef: '2026-10-01',
});
assert.equal(primeira.length, 1);
assert.equal(repetida.length, 0);

const parcelado = ocorrenciasDoServico({ ...maisonAtivo, modo: 'parcelado', id: 'srv-parcela' }, { ateMes: '2027-03-01' });
const receitaParcelada = parcelado.filter((item) => item.reconheceReceita).reduce((sum, item) => sum + item.valor, 0);
assert.equal(receitaParcelada, 2500);
assert.equal(parcelado.length, 6);

const titulo = { bruto: 2500, desconto: 0, acrescimos: 0 };
const baixa1 = validarLiquidacao(titulo, [], 1000);
assert.equal(baixa1.ok, true);
assert.equal(baixa1.quita, false);
assert.equal(fromCents(baixa1.saldoDepoisCents), 1500);
const liquidacoes = [{ valor_obrigacao: 1000, status: 'valido' }];
const baixa2 = validarLiquidacao(titulo, liquidacoes, 1500);
assert.equal(baixa2.quita, true);
assert.equal(saldoPendenteCents(titulo, [...liquidacoes, { valor_obrigacao: 1500, status: 'valido' }]), 0);
assert.equal(validarLiquidacao(titulo, liquidacoes, 2000).ok, false);
assert.equal(prazoTitulo({ saldoCents: 150000, vencimento: '2026-10-02', today: '2026-10-03' }), 'atrasado');
assert.equal(prazoTitulo({ saldoCents: 150000, vencimento: '2026-10-03', today: '2026-10-03' }), 'vence_hoje');
assert.equal(prazoTitulo({ saldoCents: 150000, vencimento: null, today: '2026-10-03' }), 'sem_vencimento');

const baseMeses = [
  { grupo: 'receita', status: 'recebido', valor: 3500, competencia: '2026-09-01' },
  { grupo: 'receita', status: 'previsto', valor: 39200, competencia: '2026-10-01' },
];
assert.equal(summarizeDre(naCompetencia(baseMeses, '2026-10-01')).receita, 39200);
assert.equal(summarizeDre(naCompetencia(baseMeses, '2026-09-01')).receita, 3500);
const caixaOutubro = summarizeCaixa([
  { grupo: 'receita', status: 'recebido', valor: 3500 },
  { grupo: 'receita', status: 'previsto', valor: 39200 },
  { grupo: 'despesa', status: 'pago', valor: 3000 },
  { grupo: 'despesa', status: 'previsto', valor: 15400 },
]);
assert.equal(caixaOutubro.recebido, 3500);
assert.equal(caixaOutubro.aReceber, 39200);
assert.equal(caixaOutubro.pago, 3000);
assert.equal(caixaOutubro.aPagar, 15400);

const outubro = summarizeDre([
  { grupo: 'receita', status: 'previsto', valor: 42700 },
  { grupo: 'despesa', status: 'previsto', valor: 15400 },
  { grupo: 'despesa', status: 'pago', valor: 3000 },
]);
assert.equal(outubro.receita, 42700);
assert.equal(outubro.custo + outubro.despesa, 18400);
assert.equal(outubro.resultado, 24300);
assert.equal(margemResultado(outubro), 56.91);
assert.equal(margemResultado({ receita: 0, resultado: 0 }), null);
const caixaResumo = resumoCaixaPeriodo({ saldoAbertura: 1000, entradas: 3500, saidas: 3000 });
assert.equal(caixaResumo.movimentoLiquido, 500);
assert.equal(caixaResumo.saldoFinal, 1500);
assert.equal(resumoCaixaPeriodo({ entradas: 3500, saidas: 3000 }).saldoFinal, null);

const taxa = efeitoCaixaLiquidacao({ valorObrigacao: 1000, taxaRetida: 30 });
assert.equal(taxa.quitaCents, 100000);
assert.equal(taxa.entraCaixaCents, 97000);
assert.equal(taxa.taxaCents, 3000);
const estorno = saldoPendenteCents(titulo, [
  { valor_obrigacao: 2500, status: 'estornado' },
]);
assert.equal(estorno, 250000);

const repasse = summarizeDre([
  { grupo: 'repasse', status: 'recebido', valor: 1000 },
  { grupo: 'repasse', status: 'pago', valor: 1000 },
]);
assert.equal(repasse.resultado, 0);
const consolidado = movimentoConsolidado([
  { natureza: 'transferencia', direcao: 'saida', valor: 500 },
  { natureza: 'transferencia', direcao: 'entrada', valor: 500 },
  { natureza: 'operacional', direcao: 'entrada', valor: 1000 },
  { natureza: 'operacional', direcao: 'saida', valor: 1000 },
]);
assert.equal(consolidado.liquido, 0);

assert.equal(valorNaCompetencia({ valor: 3000, valor_anterior: 2500, vigencia_valor: '2026-11-01' }, '2026-10-01'), 2500);
assert.equal(valorNaCompetencia({ valor: 3000, valor_anterior: 2500, vigencia_valor: '2026-11-01' }, '2026-11-01'), 3000);
assert.equal(servicoProntoParaAtivar({ cliente_id: 'x', descricao: 'Gestão', valor: 100, inicio: '2026-10-01', periodicidade: 'mensal' }).ok, true);
assert.equal(servicoProntoParaAtivar({ estado: 'rascunho' }).ok, false);

const hoje = new Date('2026-10-15T12:00:00');
assert.equal(mesesDoAnoParaGrafico(2026, hoje).length, 10);
const serieFin = buildFaturamentoAno(
  [
    { competencia: '2026-10-01', grupo: 'receita', valor: 3000, status: 'previsto', origem: 'mensalidade' },
    { competencia: '2026-10-01', grupo: 'despesa', valor: 500, status: 'pago', origem: 'manual' },
    { competencia: '2026-09-01', grupo: 'receita', valor: 2000, status: 'recebido', origem: 'manual' },
    { competencia: '2026-10-01', grupo: 'repasse', valor: 999, status: 'recebido', origem: 'manual' },
    { competencia: '2026-10-01', grupo: 'receita', valor: 100, status: 'cancelado', origem: 'manual' },
  ],
  2026,
  hoje,
);
const out = serieFin.find((row) => row.key === '2026-10');
assert.equal(out.faturamento, 3000);
assert.equal(out.mensalidade, 3000);
assert.equal(out.resultado, 2500);
assert.equal(totalSerie(serieFin, 'faturamento'), 5000);

const serieCli = buildClientesNovosAno(
  [
    { etapa: 'closed', created_at: '2026-09-12T10:00:00Z' },
    { etapa: 'prospect', created_at: '2026-10-02T10:00:00Z' },
    { etapa: 'closed', created_at: '2026-08-01T10:00:00Z' },
  ],
  2026,
  hoje,
);
assert.equal(serieCli.find((r) => r.key === '2026-09').contratos, 1);
assert.equal(serieCli.find((r) => r.key === '2026-10').novos, 1);
assert.equal(serieCli.find((r) => r.key === '2026-10').contratos, 0);
assert.equal(serieCli[serieCli.length - 1].carteira, 2);

const mapParcelado = new Map([['c1', { cobranca_parcelada: true }]]);
const rowsCob = [
  { id: 'a', cliente_id: 'c1', parcela_mensalidade: 1 },
  { id: 'b', cliente_id: 'c1', parcela_mensalidade: 2 },
  { id: 'c', cliente_id: 'c2', parcela_mensalidade: 1 },
];
const mapSimples = new Map([['c2', { cobranca_parcelada: false }]]);
const cliEntrada = { id: 'c9', etapa: 'closed', valor: 1000, inicio_na_base: '2026-06-15' };
assert.equal(clienteCobraNoMes(cliEntrada, '2026-05-01'), false);
assert.equal(clienteCobraNoMes(cliEntrada, '2026-06-01'), true);
assert.equal(
  mensalidadeForaDaEntrada(cliEntrada, { origem: 'mensalidade', status: 'previsto', competencia: '2026-04-01' }),
  true,
);

const patches = rebalanceMensalidadesParceladas({
  clients: [{ id: 'c1', cobranca_parcelada: true, etapa: 'closed', valor: 4000 }],
  lancamentos: [
    { id: 'l1', cliente_id: 'c1', origem: 'mensalidade', status: 'previsto', competencia: '2026-10-01', parcela_mensalidade: 1, valor: 4000 },
    { id: 'l2', cliente_id: 'c1', origem: 'mensalidade', status: 'recebido', competencia: '2026-10-01', parcela_mensalidade: 2, valor: 2000 },
  ],
  mesRef: '2026-10-01',
});
assert.equal(patches.length, 1);
assert.equal(patches[0].id, 'l1');
assert.equal(patches[0].valor, 2000);

const blocos = agruparCobrancasParaTabela(rowsCob, new Map([...mapParcelado, ...mapSimples]));
assert.equal(blocos.length, 2);
assert.equal(blocos[0].kind, 'dupla');
assert.equal(blocos[0].p1.id, 'a');
assert.equal(blocos[0].p2.id, 'b');
assert.equal(blocos[1].kind, 'single');
assert.equal(blocos[1].row.id, 'c');

assert.equal(isOrigemFolha({ origem: 'folha' }), true);
assert.equal(isOrigemFolha({ origem: 'manual' }), false);
assert.equal(grupoAceitaFixo('despesa'), true);
assert.equal(grupoAceitaFixo('receita'), false);

assert.deepEqual(
  mesesDaRecorrencia({ inicioMes: '2026-10-01', quantosMeses: 3 }),
  ['2026-10-01', '2026-11-01', '2026-12-01'],
);
assert.deepEqual(
  mesesDaRecorrencia({ inicioMes: '2026-10-01', quantosMeses: 12, terminaEm: '2026-11-15' }),
  ['2026-10-01', '2026-11-01'],
);

const recAluguel = {
  id: 'r1',
  ativa: true,
  grupo: 'despesa',
  categoria_id: 'cat-aluguel',
  descricao: 'Aluguel — Sala',
  valor: 2500,
  dia_vencimento: 5,
  fornecedor_id: 'f1',
  termina_em: '2026-12-01',
};
assert.equal(recorrenciaAtivaNoMes(recAluguel, '2026-12-01'), true);
assert.equal(recorrenciaAtivaNoMes(recAluguel, '2027-01-01'), false);
assert.equal(recorrenciaAtivaNoMes({ ...recAluguel, ativa: false }, '2026-10-01'), false);

const payloadRec = buildRecorrenciaLancamento({ recorrencia: recAluguel, mesRef: '2026-10-15' });
assert.deepEqual(payloadRec, {
  competencia: '2026-10-01',
  data_caixa: '2026-10-05',
  grupo: 'despesa',
  categoria_id: 'cat-aluguel',
  cliente_id: null,
  profile_id: null,
  fornecedor_id: 'f1',
  recorrencia_id: 'r1',
  descricao: 'Aluguel — Sala',
  valor: 2500,
  origem: 'manual',
  status: 'previsto',
});

const faltamRec = recorrenciasToCreate({
  recorrencias: [recAluguel, { ...recAluguel, id: 'r2', termina_em: null }],
  existingLancamentos: [
    { recorrencia_id: 'r1', competencia: '2026-10-01', status: 'previsto' },
  ],
  mesRef: '2026-10-01',
});
assert.equal(faltamRec.length, 1);
assert.equal(faltamRec[0].recorrencia_id, 'r2');

console.log('agenciaFinanceiro.test.mjs: ok');

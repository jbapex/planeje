/** Financeiro da agência: DRE gerencial e caixa (regras puras). */

export const FIN_GROUPS = ['receita', 'custo', 'despesa', 'repasse'];
export const FIN_STATUSES = ['previsto', 'recebido', 'pago', 'cancelado'];
export const FIN_ORIGINS = ['mensalidade', 'manual', 'folha'];
export const FOLHA_FORMAS = ['pix', 'transferencia', 'dinheiro', 'outro'];

export const SEED_CATEGORIES = [
  { nome: 'Mensalidade', grupo: 'receita', ordem: 10 },
  { nome: 'Serviço avulso', grupo: 'receita', ordem: 20 },
  { nome: 'Outras receitas', grupo: 'receita', ordem: 30 },
  { nome: 'Freela', grupo: 'custo', ordem: 10 },
  { nome: 'Ferramenta do cliente', grupo: 'custo', ordem: 20 },
  { nome: 'Salário', grupo: 'despesa', ordem: 10 },
  { nome: 'Aluguel', grupo: 'despesa', ordem: 20 },
  { nome: 'Software', grupo: 'despesa', ordem: 30 },
  { nome: 'Imposto', grupo: 'despesa', ordem: 40 },
  { nome: 'Outras despesas', grupo: 'despesa', ordem: 50 },
  { nome: 'Mídia do cliente', grupo: 'repasse', ordem: 10 },
];

export const GROUP_LABELS = {
  receita: 'Receita',
  custo: 'Custo',
  despesa: 'Despesa',
  repasse: 'Repasse',
};

export const STATUS_LABELS = {
  previsto: 'Previsto',
  recebido: 'Recebido',
  pago: 'Pago',
  cancelado: 'Cancelado',
};

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** Primeiro dia do mês em YYYY-MM-01. */
export function monthStart(value = new Date()) {
  if (typeof value === 'string') {
    const m = value.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?/);
    if (m) return `${m[1]}-${m[2]}-01`;
  }
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) {
    const now = new Date();
    return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-01`;
  }
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-01`;
}

export function shiftMonth(mesRef, delta = 0) {
  const base = monthStart(mesRef);
  const [y, m] = base.split('-').map(Number);
  const d = new Date(y, m - 1 + Number(delta || 0), 1);
  return monthStart(d);
}

export function formatMonthLabel(mesRef, locale = 'pt-BR') {
  const base = monthStart(mesRef);
  const [y, m] = base.split('-').map(Number);
  const d = new Date(y, m - 1, 1);
  const label = d.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function moneyAmount(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const raw = String(value).trim();
  if (!raw) return null;
  const normalized = raw.includes(',')
    ? raw.replace(/\./g, '').replace(',', '.')
    : raw;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

export function formatMoneyBr(value) {
  const amount = moneyAmount(value);
  if (amount == null) return 'R$ 0,00';
  return amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** Dia 1–28 ou null. */
export function normalizeDiaCobranca(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 28) return null;
  return n;
}

/** Data de caixa YYYY-MM-DD a partir do dia de cobrança; sem dia → null. */
export function cashDateForMensalidade(mesRef, diaCobranca) {
  const dia = normalizeDiaCobranca(diaCobranca);
  if (!dia) return null;
  const base = monthStart(mesRef);
  const [y, m] = base.split('-').map(Number);
  return `${y}-${pad2(m)}-${pad2(dia)}`;
}

export function isClienteAtivoFinanceiro(client) {
  return String(client?.etapa || '') === 'closed';
}

/** Cliente ativo (fechado) com mensalidade maior que zero. */
export function shouldGenerateMensalidade(client) {
  if (!isClienteAtivoFinanceiro(client)) return false;
  const v = moneyAmount(client?.valor);
  return v != null && v > 0;
}

/** Cobrança do mês só depois da entrada na base (início na base ou criação do cadastro). */
export function clienteCobraNoMes(client, mesRef) {
  if (!shouldGenerateMensalidade(client)) return false;
  const entrada = clientEntradaNaBase(client);
  if (!entrada) return true;
  return monthStart(mesRef) >= monthStart(entrada);
}

export function mensalidadeForaDaEntrada(client, lancamento) {
  if (!client || lancamento?.origem !== 'mensalidade' || lancamento.status === 'cancelado') return false;
  const entrada = clientEntradaNaBase(client);
  if (!entrada) return false;
  return monthStart(lancamento.competencia) < monthStart(entrada);
}

/** Previstas criadas antes da entrada do cliente (ex.: ao voltar meses no Financeiro). */
export function mensalidadesPrevistasAntesEntrada({ clients, lancamentos }) {
  const byId = new Map((clients || []).map((c) => [c.id, c]));
  return (lancamentos || [])
    .filter((l) => l.origem === 'mensalidade' && l.status === 'previsto')
    .filter((l) => {
      const client = byId.get(l.cliente_id);
      return client && mensalidadeForaDaEntrada(client, l);
    })
    .map((l) => l.id);
}

export function mensalidadeParcelasDoCliente(client) {
  if (client?.cobranca_parcelada) return [1, 2];
  return [1];
}

/** Divide o valor mensal em duas parcelas (centavos ímpares: 1ª recebe o arredondamento). */
export function splitMensalidadeValor(total) {
  const cents = Math.round((moneyAmount(total) || 0) * 100);
  if (cents <= 0) return { parcela1: 0, parcela2: 0 };
  const p1 = Math.floor(cents / 2);
  return { parcela1: p1 / 100, parcela2: (cents - p1) / 100 };
}

export function findCategoriaMensalidade(categorias) {
  const list = categorias || [];
  return (
    list.find((c) => c.ativa !== false && c.grupo === 'receita' && String(c.nome || '').toLowerCase() === 'mensalidade')
    || list.find((c) => c.ativa !== false && c.grupo === 'receita')
    || null
  );
}

export function buildMensalidadeLancamento({ client, mesRef, categoriaId, parcela = 1 }) {
  const valorTotal = moneyAmount(client?.valor);
  if (!client?.id || !categoriaId || valorTotal == null || valorTotal <= 0) return null;
  const parcelas = mensalidadeParcelasDoCliente(client);
  const n = Number(parcela) === 2 ? 2 : 1;
  if (!parcelas.includes(n)) return null;
  const duas = parcelas.length > 1;
  const { parcela1, parcela2 } = splitMensalidadeValor(valorTotal);
  const valorParcela = duas ? (n === 2 ? parcela2 : parcela1) : valorTotal;
  if (!(valorParcela > 0)) return null;
  const competencia = monthStart(mesRef);
  const empresa = String(client.empresa || client.nome_contato || 'Cliente').trim() || 'Cliente';
  const dia = n === 2 ? client.dia_cobranca_2 : client.dia_cobranca;
  const sufixo = duas ? (n === 2 ? ' (2ª parcela)' : ' (1ª parcela)') : '';
  return {
    competencia,
    data_caixa: cashDateForMensalidade(competencia, dia),
    grupo: 'receita',
    categoria_id: categoriaId,
    cliente_id: client.id,
    descricao: `Mensalidade — ${empresa}${sufixo}`.slice(0, 200),
    valor: Math.round(valorParcela * 100) / 100,
    origem: 'mensalidade',
    status: 'previsto',
    parcela_mensalidade: n,
  };
}

/** Uma ou duas linhas de mensalidade para o cliente no mês. */
export function buildMensalidadeLancamentos({ client, mesRef, categoriaId }) {
  return mensalidadeParcelasDoCliente(client)
    .map((parcela) => buildMensalidadeLancamento({ client, mesRef, categoriaId, parcela }))
    .filter(Boolean);
}

/** Mensalidades que ainda faltam criar no mês (ignora canceladas e já existentes). */
function mensalidadeSlotKey(clienteId, parcela) {
  return `${clienteId}:${parcela || 1}`;
}

/** Corrige metades quando o cliente tem duas parcelas (ex.: 1ª ficou com valor integral antes da 2ª). */
export function rebalanceMensalidadesParceladas({ clients, lancamentos, mesRef }) {
  const competencia = monthStart(mesRef);
  const patches = [];
  const cents = (v) => Math.round((moneyAmount(v) || 0) * 100);
  for (const client of clients || []) {
    if (!client?.cobranca_parcelada || !clienteCobraNoMes(client, competencia)) continue;
    const { parcela1, parcela2 } = splitMensalidadeValor(client.valor);
    const rows = (lancamentos || []).filter(
      (l) =>
        l.cliente_id === client.id &&
        l.origem === 'mensalidade' &&
        l.status !== 'cancelado' &&
        monthStart(l.competencia) === competencia,
    );
    const p1 = rows.find((r) => Number(r.parcela_mensalidade) !== 2) || null;
    const p2 = rows.find((r) => Number(r.parcela_mensalidade) === 2) || null;
    if (!p1 && !p2) continue;
    if (p1 && cents(p1.valor) !== cents(parcela1)) patches.push({ id: p1.id, valor: parcela1 });
    if (p2 && cents(p2.valor) !== cents(parcela2)) patches.push({ id: p2.id, valor: parcela2 });
  }
  return patches;
}

export function mensalidadesToCreate({ clients, existingLancamentos, mesRef, categoriaId }) {
  if (!categoriaId) return [];
  const competencia = monthStart(mesRef);
  const existing = new Set(
    (existingLancamentos || [])
      .filter((l) => l.origem === 'mensalidade' && l.status !== 'cancelado' && l.cliente_id)
      .map((l) => mensalidadeSlotKey(l.cliente_id, l.parcela_mensalidade)),
  );
  const out = [];
  (clients || []).forEach((client) => {
    if (!clienteCobraNoMes(client, competencia)) return;
    for (const parcela of mensalidadeParcelasDoCliente(client)) {
      if (existing.has(mensalidadeSlotKey(client.id, parcela))) continue;
      const row = buildMensalidadeLancamento({ client, mesRef: competencia, categoriaId, parcela });
      if (row) out.push(row);
    }
  });
  return out;
}

export function isActiveLancamento(lancamento) {
  return lancamento && lancamento.status !== 'cancelado';
}

function sumBy(list, pred) {
  return Math.round(
    (list || []).reduce((sum, item) => (pred(item) ? sum + (moneyAmount(item.valor) || 0) : sum), 0) * 100,
  ) / 100;
}

/** DRE pela competência: repasse fica de fora; cancelado sai. */
export function summarizeDre(lancamentos) {
  const active = (lancamentos || []).filter(isActiveLancamento);
  const receita = sumBy(active, (l) => l.grupo === 'receita');
  const custo = sumBy(active, (l) => l.grupo === 'custo');
  const despesa = sumBy(active, (l) => l.grupo === 'despesa');
  return {
    receita,
    custo,
    despesa,
    resultado: Math.round((receita - custo - despesa) * 100) / 100,
  };
}

/**
 * Caixa do mês:
 * - A receber: receita prevista
 * - Recebido: receita/repasse recebidos
 * - A pagar: custo/despesa/repasse previstos
 * - Pago: custo/despesa/repasse pagos
 */
export function summarizeCaixa(lancamentos) {
  const active = (lancamentos || []).filter(isActiveLancamento);
  return {
    aReceber: sumBy(active, (l) => l.grupo === 'receita' && l.status === 'previsto'),
    recebido: sumBy(active, (l) => (l.grupo === 'receita' || l.grupo === 'repasse') && l.status === 'recebido'),
    aPagar: sumBy(active, (l) => (l.grupo === 'custo' || l.grupo === 'despesa' || l.grupo === 'repasse') && l.status === 'previsto'),
    pago: sumBy(active, (l) => (l.grupo === 'custo' || l.grupo === 'despesa' || l.grupo === 'repasse') && l.status === 'pago'),
  };
}

export function defaultStatusForGrupo(grupo) {
  if (grupo === 'receita') return 'previsto';
  if (grupo === 'repasse') return 'previsto';
  return 'previsto';
}

export function settleStatusForGrupo(grupo) {
  if (grupo === 'receita') return 'recebido';
  return 'pago';
}

export function canSettle(lancamento) {
  return isActiveLancamento(lancamento) && lancamento.status === 'previsto';
}

/** Dia para mandar o boleto: 5 dias antes do vencimento, sem sair do mês. */
export function dataMandarBoleto(dataCaixa) {
  if (!dataCaixa || !/^\d{4}-\d{2}-\d{2}$/.test(String(dataCaixa))) return null;
  const [y, m, d] = String(dataCaixa).split('-').map(Number);
  const dt = new Date(y, m - 1, d - 5);
  if (dt.getMonth() !== m - 1 || dt.getFullYear() !== y) return `${y}-${pad2(m)}-01`;
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
}

/**
 * Cobrança da mensalidade.
 * situacao: pago | atrasado | a_receber
 * boleto: enviado | mandar | aguardar
 */
/** Vencimento previsto da mensalidade (não confundir com data em que entrou no caixa). */
export function vencimentoMensalidade(lancamento, diaCobranca, diaCobranca2) {
  if (lancamento?.vencimento) return lancamento.vencimento;
  const parcela = Number(lancamento?.parcela_mensalidade) === 2 ? 2 : 1;
  const dia = parcela === 2 ? diaCobranca2 : diaCobranca;
  if (lancamento?.status === 'previsto' && lancamento?.data_caixa) return lancamento.data_caixa;
  return cashDateForMensalidade(lancamento?.competencia, dia);
}

/** Data em que o valor entrou no caixa (só quando já recebido). */
export function dataRecebimentoMensalidade(lancamento) {
  if (lancamento?.status !== 'recebido') return null;
  return lancamento?.data_caixa || null;
}

export function situacaoCobranca(lancamento, todayIso, diaCobranca, diaCobranca2) {
  const today = String(todayIso || '').slice(0, 10);
  const vence =
    lancamento?.origem === 'mensalidade'
      ? vencimentoMensalidade(lancamento, diaCobranca, diaCobranca2)
      : lancamento?.data_caixa || null;
  const pago = lancamento?.status === 'recebido';
  const semDia = !pago && !vence;
  const atrasado = !pago && lancamento?.status === 'previsto' && Boolean(vence) && vence < today;
  const mandarEm = dataMandarBoleto(vence);
  let boleto = 'aguardar';
  if (lancamento?.boleto_em) boleto = 'enviado';
  else if (!pago && mandarEm && today && today >= mandarEm) boleto = 'mandar';
  else if (!pago && !vence) boleto = 'mandar';
  return {
    situacao: pago ? 'pago' : semDia ? 'sem_vencimento' : atrasado ? 'atrasado' : 'a_receber',
    boleto,
    mandarEm,
    vence,
  };
}

export function folhaTotal(folha) {
  const salario = moneyAmount(folha?.salario) || 0;
  const extras = moneyAmount(folha?.extras) || 0;
  const desconto = Math.round((moneyAmount(folha?.desconto) || 0) * 100) / 100;
  return Math.round((salario + extras - desconto) * 100) / 100;
}

/** Pagamento bruto do mês antes do desconto (restante + extras). */
export function partePagamentoBruta(folha) {
  const split = splitSalario(folha?.salario, folha?.pct_vale);
  const extras = Math.round((moneyAmount(folha?.extras) || 0) * 100) / 100;
  return Math.round((split.pagamento + extras) * 100) / 100;
}

/** Confere desconto do mês: valor, motivo e teto do pagamento. */
export function validarDescontoFolha(folha, { pagamentoPago = false, descontoAnterior } = {}) {
  const desconto = Math.round((moneyAmount(folha?.desconto) || 0) * 100) / 100;
  const motivo = String(folha?.desconto_motivo || '').trim();
  const bruto = partePagamentoBruta(folha);
  const anterior =
    descontoAnterior === undefined
      ? null
      : Math.round((moneyAmount(descontoAnterior) || 0) * 100) / 100;

  if (desconto < 0) {
    return { ok: false, message: 'O desconto não pode ser negativo.' };
  }
  if (desconto > 0 && !motivo) {
    return { ok: false, message: 'Informe o motivo do desconto.' };
  }
  if (motivo.length > 120) {
    return { ok: false, message: 'O motivo do desconto é longo demais.' };
  }
  if (desconto > bruto) {
    return { ok: false, message: 'O desconto não pode ser maior que o pagamento do mês.' };
  }
  if (pagamentoPago && anterior !== null && desconto !== anterior) {
    return {
      ok: false,
      message: 'Pagamento já marcado como pago. Cancele o lançamento em Lançamentos para alterar o desconto.',
    };
  }
  return { ok: true, desconto, motivo, bruto };
}

/** Porcentagem inteira de 0 a 100. Vazio conta como zero. */
export function normalizePct(value) {
  if (value == null || value === '') return 0;
  const n = Number(String(value).replace(',', '.'));
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, Math.round(n)));
}

/** Divide o salário: o vale fica com a porcentagem e o pagamento com o resto. */
export function splitSalario(salario, pctVale) {
  const base = Math.round((moneyAmount(salario) || 0) * 100) / 100;
  const pct = normalizePct(pctVale);
  const cents = Math.round(base * 100);
  const valeCents = Math.round((cents * pct) / 100);
  return {
    salario: base,
    pctVale: pct,
    pctPagamento: 100 - pct,
    vale: valeCents / 100,
    pagamento: (cents - valeCents) / 100,
  };
}

/** Valor do pagamento: restante + extras − desconto do mês. */
export function partePagamento(folha) {
  const bruto = partePagamentoBruta(folha);
  const desconto = Math.round((moneyAmount(folha?.desconto) || 0) * 100) / 100;
  return Math.round(Math.max(0, bruto - desconto) * 100) / 100;
}

/** Salário ou vale a partir da descrição do lançamento de folha. */
export function folhaParteFromDescricao(descricao) {
  const raw = String(descricao || '').replace(/\s*—\s*Cancelado:.*$/i, '').trim();
  if (/^Vale\s*[—-]/i.test(raw)) return 'vale';
  if (/^Salário\s*[—-]/i.test(raw)) return 'pagamento';
  return null;
}

/** Vale ou pagamento da folha considerando o lançamento ligado (cancelado não conta como pago). */
export function folhaPagamentoLiquidado(folhaRow, lancMap) {
  const lanc = folhaRow?.lancamento_id && lancMap ? lancMap.get(folhaRow.lancamento_id) : null;
  if (lanc) return lanc.status === 'pago' || lanc.status === 'recebido';
  return folhaRow?.status === 'pago';
}

export function folhaValeLiquidado(folhaRow, lancMap) {
  const lanc = folhaRow?.vale_lancamento_id && lancMap ? lancMap.get(folhaRow.vale_lancamento_id) : null;
  if (lanc) return lanc.status === 'pago' || lanc.status === 'recebido';
  return folhaRow?.vale_status === 'pago';
}

export function folhaPagamentoPagoEm(folhaRow, lancMap) {
  const lanc = folhaRow?.lancamento_id && lancMap ? lancMap.get(folhaRow.lancamento_id) : null;
  if (lanc && (lanc.status === 'pago' || lanc.status === 'recebido')) return lanc.data_caixa || folhaRow?.pago_em || null;
  return folhaRow?.pago_em || null;
}

export function folhaValePagoEm(folhaRow, lancMap) {
  const lanc = folhaRow?.vale_lancamento_id && lancMap ? lancMap.get(folhaRow.vale_lancamento_id) : null;
  if (lanc && (lanc.status === 'pago' || lanc.status === 'recebido')) return lanc.data_caixa || folhaRow?.vale_pago_em || null;
  return folhaRow?.vale_pago_em || null;
}

/** Ajusta folha quando o lançamento ligado mudou (ex.: cancelado mas folha ainda pago). */
export function patchFolhaFromLancamentos(folhaRow, lancMap) {
  if (!folhaRow || !lancMap) return {};
  const patch = {};
  const pagLanc = folhaRow.lancamento_id ? lancMap.get(folhaRow.lancamento_id) : null;
  const valeLanc = folhaRow.vale_lancamento_id ? lancMap.get(folhaRow.vale_lancamento_id) : null;
  if (pagLanc) {
    const campos = folhaCamposFromLancamentoStatus('pagamento', pagLanc.status, pagLanc.data_caixa);
    if (folhaRow.status !== campos.status || folhaRow.pago_em !== campos.pago_em) {
      patch.status = campos.status;
      patch.pago_em = campos.pago_em;
    }
  }
  if (valeLanc) {
    const campos = folhaCamposFromLancamentoStatus('vale', valeLanc.status, valeLanc.data_caixa);
    if (folhaRow.vale_status !== campos.vale_status || folhaRow.vale_pago_em !== campos.vale_pago_em) {
      patch.vale_status = campos.vale_status;
      patch.vale_pago_em = campos.vale_pago_em;
    }
  }
  return patch;
}

export function folhaLancamentoCancelado(folhaRow, lancMap, parte) {
  const id = parte === 'vale' ? folhaRow?.vale_lancamento_id : folhaRow?.lancamento_id;
  if (!id || !lancMap) return false;
  return lancMap.get(id)?.status === 'cancelado';
}

/** Atualiza campos da folha quando o lançamento ligado muda de status. */
export function folhaCamposFromLancamentoStatus(parte, lancStatus, dataCaixa) {
  const liquidado = lancStatus === 'pago' || lancStatus === 'recebido';
  if (parte === 'vale') {
    return liquidado
      ? { vale_status: 'pago', vale_pago_em: dataCaixa || null }
      : { vale_status: 'previsto', vale_pago_em: null };
  }
  return liquidado
    ? { status: 'pago', pago_em: dataCaixa || null }
    : { status: 'previsto', pago_em: null };
}

/** Data prevista do pagamento (restante + extras) na competência do mês. */
export function dataPrevistaPagamentoFolha(folha, mesRef) {
  return cashDateForMensalidade(mesRef, folha?.dia_pagamento);
}

/** Vale é adiantamento do mês seguinte: previsto no caixa no próximo mês. */
export function dataPrevistaValeFolha(folha, mesRef) {
  return cashDateForMensalidade(shiftMonth(mesRef, 1), folha?.dia_vale);
}

/** Ordenação da equipe: pagamento pendente antes de vale; depois por data prevista. */
export function equipeChaveOrdenacao(folhaRow, mesRef) {
  if (!folhaRow) return { iso: '9999-12-31', prioridade: 9 };
  const partes = splitSalario(folhaRow.salario, folhaRow.pct_vale);
  const pagar = partePagamento(folhaRow);
  const pagPend = pagar > 0 && folhaRow.status !== 'pago';
  const valePend = partes.vale > 0 && folhaRow.vale_status !== 'pago';
  if (pagPend) {
    return {
      iso: dataPrevistaPagamentoFolha(folhaRow, mesRef) || `${monthStart(mesRef).slice(0, 8)}28`,
      prioridade: 0,
    };
  }
  if (valePend) {
    return {
      iso: dataPrevistaValeFolha(folhaRow, mesRef) || shiftMonth(mesRef, 1),
      prioridade: 1,
    };
  }
  return { iso: '9999-12-31', prioridade: 9 };
}

export function buildValeLancamento({ folha, mesRef, categoriaId, nome }) {
  const split = splitSalario(folha?.salario, folha?.pct_vale);
  const vale = split.pctVale > 0
    ? split.vale
    : Math.round((moneyAmount(folha?.vale) || 0) * 100) / 100;
  if (!categoriaId || !(vale > 0)) return null;
  const pessoa = String(nome || 'Colaborador').trim() || 'Colaborador';
  const pago = folha?.vale_status === 'pago';
  return {
    competencia: monthStart(mesRef),
    data_caixa: pago ? (folha?.vale_pago_em || null) : dataPrevistaValeFolha(folha, mesRef),
    grupo: 'despesa',
    categoria_id: categoriaId,
    cliente_id: null,
    profile_id: folha?.profile_id || null,
    descricao: `Vale — ${pessoa}`.slice(0, 200),
    valor: vale,
    origem: 'folha',
    status: pago ? 'pago' : 'previsto',
  };
}

export function buildFolhaLancamento({ folha, mesRef, categoriaId, nome }) {
  const total = partePagamento(folha);
  if (!categoriaId || !(total > 0)) return null;
  const pessoa = String(nome || 'Colaborador').trim() || 'Colaborador';
  const pago = folha?.status === 'pago';
  return {
    competencia: monthStart(mesRef),
    data_caixa: pago ? (folha?.pago_em || null) : cashDateForMensalidade(mesRef, folha?.dia_pagamento),
    grupo: 'despesa',
    categoria_id: categoriaId,
    cliente_id: null,
    profile_id: folha?.profile_id || null,
    descricao: `Salário — ${pessoa}`.slice(0, 200),
    valor: total,
    origem: 'folha',
    status: pago ? 'pago' : 'previsto',
  };
}

/** Folha do mês a partir dos contratos ativos que ainda não têm linha. */
export function folhasToCreate({ contratos, existingFolha, mesRef }) {
  const have = new Set((existingFolha || []).map((row) => row.profile_id).filter(Boolean));
  const rows = [];
  (contratos || []).forEach((contrato) => {
    if (contrato?.ativo === false || !contrato?.profile_id || have.has(contrato.profile_id)) return;
    const salario = Math.round((moneyAmount(contrato.salario) || 0) * 100) / 100;
    if (!(salario > 0)) return;
    const partes = splitSalario(salario, contrato.pct_vale);
    have.add(contrato.profile_id);
    rows.push({
      competencia: monthStart(mesRef),
      profile_id: contrato.profile_id,
      funcao: String(contrato.funcao || '').trim(),
      salario,
      extras: Math.round((moneyAmount(contrato.extras) || 0) * 100) / 100,
      forma: contrato.forma || 'pix',
      dia_pagamento: normalizeDiaCobranca(contrato.dia_pagamento),
      pct_vale: partes.pctVale,
      vale: partes.vale,
      dia_vale: normalizeDiaCobranca(contrato.dia_vale),
      vale_status: 'previsto',
      status: 'previsto',
      pago_em: null,
    });
  });
  return rows;
}

export function findCategoriaSalario(categorias) {
  const list = categorias || [];
  return (
    list.find((c) => c.ativa !== false && c.grupo === 'despesa' && String(c.nome || '').toLowerCase() === 'salário')
    || list.find((c) => c.ativa !== false && c.grupo === 'despesa' && String(c.nome || '').toLowerCase() === 'salario')
    || null
  );
}

/** Categoria Salário (pagamento e vale usam a mesma). */
export function isCategoriaSalario(categoria) {
  const nome = String(categoria?.nome || '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
  return Boolean(categoria) && categoria.grupo === 'despesa' && (nome === 'salario' || nome === 'vale');
}

export function descricaoFolhaParte(parte, nome) {
  const pessoa = String(nome || 'Colaborador').trim() || 'Colaborador';
  if (parte === 'vale') return `Vale — ${pessoa}`.slice(0, 200);
  return `Salário — ${pessoa}`.slice(0, 200);
}

/** Grupo do formulário que pede colaborador em vez de cliente. */
export function grupoUsaColaborador(grupo) {
  return grupo === 'custo' || grupo === 'despesa';
}

/** Salário/vale: fica na Equipe, não na fila A pagar nem na lista de Lançamentos. */
export function isOrigemFolha(lancamento) {
  return String(lancamento?.origem || '') === 'folha';
}

/** Grupo que aceita fornecedor e recorrência (custo/despesa fixos). */
export function grupoAceitaFixo(grupo) {
  return grupo === 'custo' || grupo === 'despesa';
}

/**
 * Meses a gerar a partir do mês inicial.
 * quantosMeses: 1–60 (padrão 1). terminaEm: último mês incluso (YYYY-MM-DD ou YYYY-MM).
 */
export function mesesDaRecorrencia({ inicioMes, quantosMeses, terminaEm } = {}) {
  const start = monthStart(inicioMes || new Date());
  const raw = Number(quantosMeses);
  const count = Number.isFinite(raw) && raw > 0 ? Math.min(60, Math.floor(raw)) : 1;
  const endLimit = terminaEm ? monthStart(terminaEm) : null;
  const out = [];
  let cur = start;
  for (let i = 0; i < count; i += 1) {
    if (endLimit && cur > endLimit) break;
    out.push(cur);
    cur = shiftMonth(cur, 1);
  }
  return out;
}

export function recorrenciaAtivaNoMes(recorrencia, mesRef) {
  if (!recorrencia || recorrencia.ativa === false) return false;
  const mes = monthStart(mesRef);
  if (recorrencia.termina_em && monthStart(recorrencia.termina_em) < mes) return false;
  return true;
}

export function buildRecorrenciaLancamento({ recorrencia, mesRef }) {
  if (!recorrencia?.id || !recorrencia.categoria_id) return null;
  const valor = moneyAmount(recorrencia.valor);
  if (!(valor > 0)) return null;
  const competencia = monthStart(mesRef);
  const dia = normalizeDiaCobranca(recorrencia.dia_vencimento) || 10;
  return {
    competencia,
    data_caixa: cashDateForMensalidade(competencia, dia),
    grupo: recorrencia.grupo === 'custo' ? 'custo' : 'despesa',
    categoria_id: recorrencia.categoria_id,
    cliente_id: null,
    profile_id: null,
    fornecedor_id: recorrencia.fornecedor_id || null,
    recorrencia_id: recorrencia.id,
    descricao: String(recorrencia.descricao || '').trim().slice(0, 200),
    valor: Math.round(valor * 100) / 100,
    origem: 'manual',
    status: 'previsto',
  };
}

/** Recorrências ativas sem lançamento (não cancelado) no mês. */
export function recorrenciasToCreate({ recorrencias, existingLancamentos, mesRef }) {
  const competencia = monthStart(mesRef);
  const jaTem = new Set(
    (existingLancamentos || [])
      .filter((l) => l.recorrencia_id && l.status !== 'cancelado' && monthStart(l.competencia) === competencia)
      .map((l) => l.recorrencia_id),
  );
  const out = [];
  for (const rec of recorrencias || []) {
    if (!recorrenciaAtivaNoMes(rec, competencia)) continue;
    if (jaTem.has(rec.id)) continue;
    const payload = buildRecorrenciaLancamento({ recorrencia: rec, mesRef: competencia });
    if (payload) out.push(payload);
  }
  return out;
}

export function categoriesByGrupo(categorias, grupo, { onlyActive = true } = {}) {
  return (categorias || [])
    .filter((c) => c.grupo === grupo && (!onlyActive || c.ativa !== false))
    .slice()
    .sort((a, b) => (a.ordem - b.ordem) || String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
}

export const ORG_TIMEZONE = 'America/Sao_Paulo';

/** Data civil YYYY-MM-DD no fuso da organização. Não usa o dia UTC. */
export function civilToday(now = new Date(), timeZone = ORG_TIMEZONE) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function lastCivilDay(year, month) {
  return new Date(year, month, 0).getDate();
}

/** Dia 1–31. Em mês menor, usa o último dia. Sem dia válido, null. */
export function civilDueDate(mesRef, dia) {
  const base = monthStart(mesRef);
  const [y, m] = base.split('-').map(Number);
  const n = Number(dia);
  if (!Number.isInteger(n) || n < 1 || n > 31) return null;
  return `${y}-${pad2(m)}-${pad2(Math.min(n, lastCivilDay(y, m)))}`;
}

export function toCents(value) {
  const amount = moneyAmount(value);
  if (amount == null) return null;
  return Math.round(amount * 100);
}

export function fromCents(cents) {
  return Math.round(Number(cents) || 0) / 100;
}

export function valorLiquidoCents({ bruto, desconto = 0, acrescimos = 0 } = {}) {
  return (toCents(bruto) || 0) - (toCents(desconto) || 0) + (toCents(acrescimos) || 0);
}

export function saldoPendenteCents(titulo, liquidacoes = []) {
  const abatido = (liquidacoes || [])
    .filter((item) => item && item.status !== 'estornado')
    .reduce((sum, item) => sum + (toCents(item.valor_obrigacao ?? item.valor) || 0), 0);
  return valorLiquidoCents(titulo) - abatido;
}

export function validarLiquidacao(titulo, liquidacoes, valor) {
  const saldo = saldoPendenteCents(titulo, liquidacoes);
  const cents = toCents(valor);
  if (!(cents > 0)) return { ok: false, motivo: 'Informe o valor.' };
  if (cents > saldo) return { ok: false, motivo: 'O valor passa do saldo.' };
  return { ok: true, saldoDepoisCents: saldo - cents, quita: cents === saldo };
}

/** Taxa retida não é desconto nem uma segunda saída. O título quita o bruto; o caixa recebe o líquido. */
export function efeitoCaixaLiquidacao({ valorObrigacao, taxaRetida = 0 } = {}) {
  const obrigacao = toCents(valorObrigacao) || 0;
  const taxa = toCents(taxaRetida) || 0;
  return {
    quitaCents: obrigacao,
    entraCaixaCents: obrigacao - taxa,
    taxaCents: taxa,
  };
}

export function prazoTitulo({ saldoCents, vencimento, today }) {
  if (!(saldoCents > 0)) return 'liquidado';
  if (!vencimento) return 'sem_vencimento';
  const dia = String(vencimento).slice(0, 10);
  const hoje = String(today).slice(0, 10);
  if (dia < hoje) return 'atrasado';
  if (dia === hoje) return 'vence_hoje';
  return 'a_vencer';
}

/** Resultado por competência / receita por competência. Sem receita, não há margem. */
export function margemResultado(dre) {
  const receita = toCents(dre?.receita) || 0;
  if (receita <= 0) return null;
  return Math.round(((toCents(dre?.resultado) || 0) * 10000) / receita) / 100;
}

export function naCompetencia(lancamentos, mesRef) {
  const mes = monthStart(mesRef);
  return (lancamentos || []).filter((row) => row?.competencia && monthStart(row.competencia) === mes);
}

export function resumoCaixaPeriodo({ saldoAbertura, movimentosAnteriores = 0, entradas = 0, saidas = 0 } = {}) {
  const entradasC = toCents(entradas) || 0;
  const saidasC = toCents(saidas) || 0;
  const liquido = fromCents(entradasC - saidasC);
  const informado = saldoAbertura != null && saldoAbertura !== '';
  if (!informado) {
    return { saldoInicialInformado: false, saldoInicialPeriodo: null, movimentoLiquido: liquido, saldoFinal: null };
  }
  const inicial = (toCents(saldoAbertura) || 0) + (toCents(movimentosAnteriores) || 0);
  return {
    saldoInicialInformado: true,
    saldoInicialPeriodo: fromCents(inicial),
    movimentoLiquido: liquido,
    saldoFinal: fromCents(inicial + entradasC - saidasC),
  };
}

export function movimentoConsolidado(movimentos = []) {
  const proprios = movimentos.filter((item) => item?.natureza !== 'transferencia');
  const entradas = proprios.filter((item) => item.direcao === 'entrada').reduce((sum, item) => sum + (toCents(item.valor) || 0), 0);
  const saidas = proprios.filter((item) => item.direcao === 'saida').reduce((sum, item) => sum + (toCents(item.valor) || 0), 0);
  return { entradas: fromCents(entradas), saidas: fromCents(saidas), liquido: fromCents(entradas - saidas) };
}

export function servicoProntoParaAtivar(servico) {
  const faltas = [];
  if (!servico?.cliente_id) faltas.push('cliente');
  if (!String(servico?.descricao || '').trim()) faltas.push('descricao');
  if (!((toCents(servico?.valor) || 0) > 0)) faltas.push('valor');
  if (!servico?.inicio) faltas.push('inicio');
  if (!servico?.periodicidade) faltas.push('periodicidade');
  return { ok: faltas.length === 0, faltas };
}

export function valorNaCompetencia(servico, mesRef) {
  const mes = monthStart(mesRef);
  const vigencia = servico?.vigencia_valor ? monthStart(servico.vigencia_valor) : null;
  if (vigencia && mes < vigencia && servico?.valor_anterior != null) return fromCents(toCents(servico.valor_anterior));
  return fromCents(toCents(servico?.valor));
}

/**
 * Recorrente: uma receita por competência.
 * Parcelado: uma receita na competência inicial; as demais linhas são só recebimento.
 */
export function ocorrenciasDoServico(servico, { ateMes } = {}) {
  if (servico?.estado !== 'ativo') return [];
  if (!servicoProntoParaAtivar(servico).ok || !servico?.id) return [];
  const inicio = monthStart(servico.competencia_inicial || servico.inicio);
  const limite = ateMes ? monthStart(ateMes) : inicio;
  const parcelas = servico.parcelas != null && servico.parcelas !== '' ? Number(servico.parcelas) : null;
  const termino = servico.termino ? monthStart(servico.termino) : null;
  const dia = servico.dia_cobranca;
  if (servico.modo === 'parcelado') {
    const total = toCents(valorNaCompetencia(servico, inicio)) || 0;
    const n = parcelas && parcelas > 0 ? parcelas : 1;
    const base = Math.floor(total / n);
    const resto = total - base * n;
    const linhas = [];
    for (let i = 0; i < n; i += 1) {
      const mes = shiftMonth(inicio, i);
      if (termino && mes > termino) break;
      const recebimento = base + (i === n - 1 ? resto : 0);
      linhas.push({
        chave: `${servico.id}:parcela:${i + 1}`,
        competencia: inicio,
        vencimento: civilDueDate(mes, dia),
        valor: i === 0 ? fromCents(total) : fromCents(recebimento),
        valorRecebimento: fromCents(recebimento),
        reconheceReceita: i === 0,
      });
    }
    return linhas;
  }
  const max = parcelas && parcelas > 0 ? parcelas : 36;
  const out = [];
  for (let i = 0; i < max; i += 1) {
    const mes = shiftMonth(inicio, i);
    if (termino && mes > termino) break;
    if (mes > limite) break;
    out.push({
      chave: `${servico.id}:${mes}`,
      competencia: mes,
      vencimento: civilDueDate(mes, dia),
      valor: valorNaCompetencia(servico, mes),
      reconheceReceita: true,
    });
  }
  return out;
}

/** Emite só a competência pedida. A mesma chave não nasce de novo. */
export function ocorrenciasAEmitir({ servicos, existentes, mesRef }) {
  const competencia = monthStart(mesRef);
  const have = new Set(
    (existentes || [])
      .filter((row) => row?.status !== 'cancelado' && row?.chave)
      .map((row) => row.chave),
  );
  const rows = [];
  (servicos || []).forEach((servico) => {
    ocorrenciasDoServico(servico, { ateMes: competencia }).forEach((item) => {
      if (!item.reconheceReceita) return;
      if (item.competencia !== competencia) return;
      if (have.has(item.chave)) return;
      have.add(item.chave);
      rows.push({
        ...item,
        servico_id: servico.id,
        cliente_id: servico.cliente_id,
        descricao: String(servico.descricao || 'Cobrança').trim(),
      });
    });
  });
  return rows;
}

const MONTH_SHORT_PT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export function parseClientDate(raw) {
  if (!raw) return null;
  const text = String(raw);
  const datePart = text.length >= 10 ? text.slice(0, 10) : text;
  if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
    const [y, m, d] = datePart.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }
  const dt = new Date(raw);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

/** Meses do ano até o mês corrente (se for o ano atual). */
export function mesesDoAnoParaGrafico(year, today = new Date()) {
  const y = Number(year);
  if (!Number.isFinite(y)) return [];
  const yNow = today.getFullYear();
  let mMax = 12;
  if (y > yNow) mMax = 0;
  else if (y === yNow) mMax = today.getMonth() + 1;
  const buckets = [];
  for (let m = 1; m <= mMax; m++) {
    buckets.push({
      key: `${y}-${pad2(m)}`,
      label: MONTH_SHORT_PT[m - 1],
    });
  }
  return buckets;
}

/** Faturamento e resultado por competência no ano (DRE; repasse fora). */
export function buildFaturamentoAno(lancamentos, year, today = new Date()) {
  const buckets = mesesDoAnoParaGrafico(year, today).map((b) => ({
    ...b,
    faturamento: 0,
    mensalidade: 0,
    custo: 0,
    despesa: 0,
    resultado: 0,
  }));
  const byKey = Object.fromEntries(buckets.map((b) => [b.key, b]));
  for (const row of lancamentos || []) {
    if (!isActiveLancamento(row)) continue;
    const key = monthStart(row.competencia).slice(0, 7);
    const bucket = byKey[key];
    if (!bucket) continue;
    const v = moneyAmount(row.valor) || 0;
    if (row.grupo === 'receita') {
      bucket.faturamento += v;
      if (row.origem === 'mensalidade') bucket.mensalidade += v;
    } else if (row.grupo === 'custo') bucket.custo += v;
    else if (row.grupo === 'despesa') bucket.despesa += v;
  }
  return buckets.map((b) => ({
    ...b,
    faturamento: Math.round(b.faturamento * 100) / 100,
    mensalidade: Math.round(b.mensalidade * 100) / 100,
    resultado: Math.round((b.faturamento - b.custo - b.despesa) * 100) / 100,
  }));
}

/** Data de entrada na base: início informado ou, se vazio, criação do cadastro. */
export function clientEntradaNaBase(client) {
  return parseClientDate(client?.inicio_na_base) || parseClientDate(client?.created_at);
}


/** Novos cadastros, contratos fechados no mês e carteira ativa no fim do mês. */
export function buildClientesNovosAno(clientes, year, today = new Date()) {
  const buckets = mesesDoAnoParaGrafico(year, today).map((b) => ({
    ...b,
    novos: 0,
    contratos: 0,
    carteira: 0,
  }));
  const byKey = Object.fromEntries(buckets.map((b) => [b.key, b]));
  for (const client of clientes || []) {
    const entrada = clientEntradaNaBase(client);
    if (!entrada || entrada.getFullYear() !== Number(year)) continue;
    const key = `${year}-${pad2(entrada.getMonth() + 1)}`;
    if (byKey[key]) {
      byKey[key].novos += 1;
      if (String(client.etapa || '') === 'closed') byKey[key].contratos += 1;
    }
  }
  for (const bucket of buckets) {
    const [y, m] = bucket.key.split('-').map(Number);
    const monthEnd = new Date(y, m, 0, 23, 59, 59, 999);
    bucket.carteira = (clientes || []).filter((client) => {
      if (String(client.etapa || '') !== 'closed') return false;
      const entrada = clientEntradaNaBase(client);
      return entrada && entrada <= monthEnd;
    }).length;
  }
  return buckets;
}

export function totalSerie(serie, valueKey) {
  return Math.round((serie || []).reduce((sum, row) => sum + (Number(row[valueKey]) || 0), 0) * 100) / 100;
}

/** Cobranças: clientes com cobrança parcelada viram um bloco com 1ª e 2ª parcela. */
export function agruparCobrancasParaTabela(rows, clienteCobranca) {
  const byCliente = new Map();
  for (const row of rows || []) {
    const id = row.cliente_id;
    if (!id) continue;
    if (!byCliente.has(id)) byCliente.set(id, []);
    byCliente.get(id).push(row);
  }
  const blocos = [];
  const vistos = new Set();
  for (const row of rows || []) {
    const id = row.cliente_id;
    if (!id || vistos.has(id)) continue;
    vistos.add(id);
    const client = clienteCobranca?.get?.(id);
    const grupo = byCliente.get(id) || [row];
    if (client?.cobranca_parcelada) {
      const p1 = grupo.find((r) => Number(r.parcela_mensalidade) !== 2) || grupo[0];
      const p2 = grupo.find((r) => Number(r.parcela_mensalidade) === 2) || null;
      blocos.push({ kind: 'dupla', clienteId: id, p1, p2 });
    } else {
      for (const r of grupo) blocos.push({ kind: 'single', row: r });
    }
  }
  return blocos;
}

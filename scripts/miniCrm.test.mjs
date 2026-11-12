import assert from 'node:assert/strict';
import {
  nomeDoLead,
  telefoneDoLead,
  normalizeLeadName,
  normalizeLeadPhone,
  withLeadIdentity,
  appointmentDateColumns,
  appointmentDay,
  appointmentStatusKeys,
  sumColumnMoney,
  columnKey,
  countBy,
  editableColumns,
  gridColumns,
  kanbanColumns,
  normalizeStatuses,
  origemDoContato,
  patchMiniCrm,
  phoneKey,
  presetForNicho,
  resolveMiniCrmSetup,
  ensureSystemColumns,
  fixedColumns,
  isSystemColumn,
  systemStatusKeys,
  rowFromContact,
  rowMatchesPhone,
  statusLabel,
  summarizeMiniCrm,
  weekStartKey,
  followUpDay,
  groupFollowUps,
  isFollowStatus,
  followStatusKey,
  returnOfRow,
  atendimentoStatusKey,
  applyStatusChange,
  ensureInicial,
  registerAttempt,
  attemptDestinationOptions,
  entryInPeriod,
  followColumn,
  openReturn,
  destinationStatusKey,
  normalizeCadence,
  noAnswerStatusKey,
  ensureRescueStatus,
  formatDayBr,
  maskDayBr,
  parseDayBr,
  applyTrackingToMini,
  applyCommercialPatchToMini,
  commercialPatchFromMiniChange,
  simNaoFromBool,
  boolFromSimNao,
  needsSaleConfirm,
  canConfirmSale,
  buildConfirmedSaleMini,
  isSoldMiniStatus,
  followCardColumn,
  formatMoneyBr,
  moneyAmount,
  withQualifiedColumn,
  syncQualifiedFromStatus,
  shouldSendQualified,
  isQualifiedMiniStatus,
  withNoAnswerColumn,
  withFollowUpStatus,
  applyNoAnswerMark,
  removedStatusKeys,
  keepSystemStatuses,
  clearRemovedStatus,
  defaultStatusKey,
  withDefaultStatus,
} from '../src/lib/miniCrm.js';

const brl = (value) => formatMoneyBr(value).replace(/\s/g, ' ');
assert.equal(brl(9300), 'R$ 9.300,00');
assert.equal(brl(13900), 'R$ 13.900,00');
assert.equal(brl('8400'), 'R$ 8.400,00');
assert.equal(brl('9300,5'), 'R$ 9.300,50');
assert.equal(brl('9.300,00'), 'R$ 9.300,00');
assert.equal(brl('9300.5'), 'R$ 9.300,50');
assert.equal(brl(0), 'R$ 0,00');
assert.equal(formatMoneyBr(''), '');
assert.equal(formatMoneyBr(null), '');
assert.equal(formatMoneyBr(undefined), '');
assert.equal(formatMoneyBr('abc'), '');
assert.equal(moneyAmount('R$ 9.300,00'), 9300);

assert.equal(presetForNicho('Loja de Carros').id, 'loja_carros');
assert.equal(presetForNicho('loja de carro usada').id, 'loja_carros');
assert.equal(presetForNicho('Loja de Noivas').id, 'loja_noivas');
assert.equal(presetForNicho('Vestidos de noiva').id, 'loja_noivas');
assert.equal(presetForNicho('').id, 'base');

const brideModel = presetForNicho('Loja de noivas');
assert.equal(brideModel.label, 'Loja de noivas');
assert.equal('match' in brideModel, false);
assert.equal(brideModel.sellers, undefined);
assert.deepEqual(gridColumns(brideModel, editableColumns(brideModel)).map((column) => column.label), [
  'Data', 'Origem', 'Nome', 'Telefone', 'Status',
  'Qualificado', 'Não respondeu', 'Consultora', 'Data Agendamento', 'Compareceu', 'Valor Venda', 'Próxima Ação', 'Observação',
]);
assert.deepEqual(editableColumns(brideModel).map(({ key, kind, onCard }) => [key, kind, onCard]), [
  ['qualificado', 'simnao', false],
  ['nao_respondeu', 'simnao', false],
  ['vendedor', 'text', false],
  ['data_agendamento', 'day', true],
  ['compareceu', 'simnao', false],
  ['valor', 'money', false],
  ['proxima_acao', 'text', false],
  ['observacao', 'text', false],
]);
const brideDraft = resolveMiniCrmSetup(brideModel, null, []);
assert.deepEqual(brideDraft.statuses.map((status) => status.label), [
  'Novo Lead', 'Em Atendimento', 'Lead Qualificado', 'Agendado', 'Em Negociação',
  'Venda Realizada', 'Venda Perdida', 'Follow Up', 'Não Respondeu', 'Não Compareceu', 'Reagendado', 'Lead Desqualificado',
]);
assert.deepEqual(brideDraft.cadence, normalizeCadence(null));
assert.equal(followCardColumn(brideDraft.columns)?.key, 'data_agendamento');
assert.equal(presetForNicho('Loja de Carros').id, 'loja_carros');
assert.equal(presetForNicho('Loja de Carros').columns.some((column) => column.key === 'crm_revenda'), true);
assert.equal(presetForNicho('Pizzaria').columns.some((column) => column.key === 'crm_revenda'), false);

const carModel = presetForNicho('Loja de Carros');
assert.equal(carModel.label, 'Loja de carro');
assert.equal('match' in carModel, false);
assert.deepEqual(gridColumns(carModel, editableColumns(carModel)).map((column) => column.key), [
  'data', 'origem', 'nome', 'telefone', 'status',
  'data_da_visita', 'qualificado', 'compareceu', 'carro', 'vendedor',
  'data_venda', 'valor', 'crm_revenda', 'observacao',
]);
assert.deepEqual(editableColumns(carModel).map(({ label, kind, onCard }) => [label, kind, onCard]), [
  ['Data da Visita', 'day', false],
  ['Qualificado', 'simnao', false],
  ['Compareceu', 'simnao', false],
  ['Carro', 'text', false],
  ['Vendedor', 'text', false],
  ['Data da venda', 'day', false],
  ['Valor venda', 'money', false],
  ['CRM Revenda +', 'simnao', false],
  ['Observação', 'text', false],
]);
const carDraft = resolveMiniCrmSetup(carModel, null, [{ vendedor: 'Mairon' }]);
assert.deepEqual(carDraft.statuses.map(({ key, label, color }) => [key, label, color]), [
  ['Novo Lead', 'Novo Lead', '#3b82f6'],
  ['Em Atendimento', 'Em Atendimento', '#0284c7'],
  ['Em Negociação', 'Em Negociação', '#ea580c'],
  ['Agendado', 'Visita Agendada', '#7c3aed'],
  ['Reagendado', 'Reagendado', '#4f46e5'],
  ['Venda Realizada', 'Venda Realizada', '#059669'],
  ['Follow Up', 'Follow Up', '#d97706'],
  ['Venda Perdida', 'Venda Perdida', '#e11d48'],
]);
assert.deepEqual(carDraft.cadence, { inicial: [1, 1, 2, 3, 5, 7], repescagem: [30, 5], sem_resposta: 'Venda Perdida' });
assert.deepEqual(carDraft.sellers, ['Mairon']);
assert.equal(carModel.sellers, undefined);
const carStored = resolveMiniCrmSetup(carModel, {
  statuses: [{ key: 'Novo Lead', label: 'Chegou', color: '#112233' }],
  columns: [{ key: 'placa', label: 'Placa', kind: 'text' }],
  sellers: ['Ana'],
  cadence: { inicial: [0, 2], repescagem: [10], sem_resposta: '' },
});
assert.deepEqual(carStored.statuses.map((status) => status.label), ['Chegou']);
assert.deepEqual(carStored.columns.map((column) => column.key), ['placa', 'data_venda']);
assert.deepEqual(carStored.cadence.inicial, [0, 2]);
assert.equal(resolveMiniCrmSetup(presetForNicho('Pizzaria'), null, []).statuses.length, 11);
assert.deepEqual(resolveMiniCrmSetup(presetForNicho('Pizzaria'), null, []).cadence.inicial, [0, 1, 2, 3, 5]);
assert.equal(presetForNicho('Loja de Carros').columns.some((column) => column.key === 'data_venda'), true);
assert.equal(presetForNicho('Pizzaria').columns.some((column) => column.key === 'data_venda'), false);
assert.equal(patchMiniCrm({}, 'data_venda', '2026-08-12').data_venda, '2026-08-12');
assert.equal('data_venda' in patchMiniCrm({ data_venda: '2026-08-12' }, 'data_venda', ''), false);
assert.equal(patchMiniCrm({}, 'data_venda', 'ontem').data_venda, undefined);

assert.equal(phoneKey('+55 (41) 99999-1234'), '99991234');
assert.equal(phoneKey(''), '');

assert.equal(origemDoContato({ origin_source: 'nao_identificado', tracking_data: { sheet_origem: 'Meta Ads via Campanha de Mensagem' } }), 'Meta Ads via Campanha de Mensagem');
assert.equal(origemDoContato({ origin_source: 'meta_ads', tracking_data: {} }), 'Meta Ads via Campanha de Mensagem');
assert.equal(origemDoContato({ origin_source: 'meta_ads', tracking_data: { trackable_link_id: 'abc' } }), 'Meta Ads via Link Rastreável');
assert.equal(origemDoContato({ origin_source: 'google_ads' }), 'Google Ads');
assert.equal(origemDoContato({ origin_source: 'nao_identificado' }), 'Não rastreada');

const patched = patchMiniCrm({ status: 'Follow Up' }, 'valor', '32.900,50');
assert.equal(patched.valor, 32900.5);
assert.equal(patched.status, 'Follow Up');
assert.equal('valor' in patchMiniCrm({ valor: 10 }, 'valor', ''), false);
assert.equal(patchMiniCrm({}, 'qualificado', 'Sim').qualificado, 'Sim');

const contact = {
  id: '1',
  sender_name: 'Ana',
  phone: '5541999991234',
  from_jid: '5541999991234@s.whatsapp.net',
  origin_source: 'meta_ads',
  tracking_data: {},
  first_seen_at: '2026-08-03T15:00:00.000Z',
  mini_crm: { status: 'Venda Realizada', vendedor: 'Mairon', qualificado: 'Sim', valor: 32900, revenda: 'SIM' },
};
const row = rowFromContact(contact);
assert.equal(row.nome, 'Ana');
assert.equal(row.foto, '');
assert.equal(row.anuncioId, '');
assert.equal(rowFromContact({ ...contact, tracking_data: { source_id: '120252058031040111' } }).anuncioId, '120252058031040111');
assert.equal(rowFromContact({ ...contact, profile_pic_url: 'https://example.com/ana.jpg' }).foto, 'https://example.com/ana.jpg');
assert.equal(row.status, 'Venda Realizada');
assert.equal(row.data_venda, '');
assert.equal(rowFromContact({ ...contact, mini_crm: { ...contact.mini_crm, data_venda: '2026-08-20' } }).data_venda, '2026-08-20');
assert.equal(rowMatchesPhone(row, '41999991234'), true);
assert.equal(weekStartKey('2026-08-03T15:00:00.000Z'), '2026-08-03');

const summary = summarizeMiniCrm([
  row,
  { nome: 'Bia', status: 'Lead Desqualificado', qualificado: 'Não', revenda: '', valor: '', data: '2026-08-04T12:00:00.000Z' },
  { nome: '', status: 'Novo Lead' },
], [{ key: 'revenda' }, { key: 'qualificado' }, { key: 'valor' }]);
assert.equal(summary.leads, 2);
assert.equal(summary.vendas, 1);
assert.equal(summary.qualificados, 1);
assert.equal(summary.noShow, 1);
assert.equal(summary.agendamentos, 1);
assert.equal(summary.valor, 32900);

const baseSummary = summarizeMiniCrm([
  { nome: 'Lia', status: 'Agendado', valor: 10 },
], presetForNicho('Pizzaria').columns);
assert.equal(baseSummary.qualificados, null);
assert.equal(baseSummary.valor, null);
assert.equal(baseSummary.agendamentos, 1);

const bySeller = countBy([row, { nome: 'Bia', status: 'Follow Up', vendedor: 'Mairon', valor: 0 }], 'vendedor');
assert.equal(bySeller[0].label, 'Mairon');
assert.equal(bySeller[0].leads, 2);
assert.equal(bySeller[0].vendas, 1);

const board = kanbanColumns([
  { id: '1', status: 'Follow Up' },
  { id: '2', status: '' },
  { id: '3', status: 'Fora da lista' },
], ['Novo Lead', 'Follow Up']);
assert.equal(board.some((column) => column.status === ''), false);
assert.deepEqual(board.map((column) => column.status), ['Novo Lead', 'Follow Up']);
assert.deepEqual(board[0].rows.map((row) => row.id), ['2', '3']);
assert.equal(board.find((column) => column.status === 'Follow Up').rows[0].id, '1');

{
  const lista = [{ key: 'entrada', label: 'Novo Lead' }, { key: 'Follow Up', label: 'Follow Up' }];
  assert.equal(defaultStatusKey(lista), 'entrada');
  assert.equal(defaultStatusKey([{ key: 'a', label: 'Primeiro' }, { key: 'b', label: 'Outro' }]), 'a');
  assert.equal(withDefaultStatus({ status: '', valor: 3 }, lista).status, 'entrada');
  assert.equal(withDefaultStatus({ status: '', valor: 3 }, lista).valor, 3);
  assert.equal(withDefaultStatus(null, lista).status, 'entrada');
  assert.equal(withDefaultStatus({ status: 'Sumiu' }, lista).status, 'entrada');
  const valido = { status: 'Follow Up' };
  assert.equal(withDefaultStatus(valido, lista), valido);
  const gravado = withDefaultStatus({ status: '' }, lista);
  assert.equal(withDefaultStatus(gravado, lista), gravado);
}

const car = presetForNicho('Loja de Carros');
const draft = resolveMiniCrmSetup(car, null, [{ vendedor: 'Mairon' }, { vendedor: 'Mairon' }]);
assert.equal(draft.saved, false);
assert.deepEqual(draft.sellers, ['Mairon']);
assert.equal(draft.statuses[0].key, 'Novo Lead');
assert.equal(draft.columns.some((column) => column.key === 'data_venda'), true);
const saved = resolveMiniCrmSetup(car, {
  statuses: [{ key: 'Venda Realizada', label: 'Vendido' }],
  columns: [{ key: 'comissao', label: 'Comissão', kind: 'money' }],
  sellers: ['Ana'],
});
assert.equal(saved.saved, true);
assert.equal(statusLabel(saved.statuses, 'Venda Realizada'), 'Vendido');
assert.equal(columnKey('Data da visita', ['data_venda']), 'data_da_visita');
assert.equal(gridColumns(car, saved.columns).some((column) => column.key === 'status'), true);
assert.equal(gridColumns(car, saved.columns).some((column) => column.locked), true);
assert.equal(patchMiniCrm({}, 'comissao', '1.250,00', 'money').comissao, 1250);
assert.equal(rowFromContact({ id: '1', mini_crm: { comissao: 10 } }).comissao, 10);

const ordered = gridColumns(car, [
  { key: 'qualificado', label: 'Qualificado', kind: 'simnao' },
  { key: 'vendedor', label: 'Vendedor', kind: 'text' },
  { key: 'valor', label: 'Valor', kind: 'money' },
]);
assert.deepEqual(ordered.map((column) => column.key), [
  'data', 'origem', 'nome', 'telefone', 'status', 'qualificado', 'vendedor', 'valor',
]);

assert.equal(normalizeStatuses(['Novo Lead'])[0].color, '#3b82f6');
assert.equal(normalizeStatuses([{ key: 'Agendado', label: 'Visita Agendada', color: '#112233' }])[0].color, '#112233');
assert.equal(normalizeStatuses([{ key: 'Fora', label: 'Fora', color: 'azul' }])[0].color, '#3b82f6');

const statuses = [
  { key: 'Follow Up', label: 'Follow Up' },
  { key: 'Em Atendimento', label: 'Em Atendimento' },
  { key: 'Venda Realizada', label: 'Venda Realizada' },
];
assert.equal(isFollowStatus('Follow Up', statuses), true);
assert.equal(isFollowStatus('Venda Realizada', statuses), false);

// Colunas manuais não assumem a cadência pelo nome nem pela chave de uma coluna renomeada.
{
  const manual = [
    { key: 'Novo Lead', label: 'Novo Lead' },
    { key: '1_follow_up', label: 'SEM INTERESSE' },
    { key: '1_follow_up_2', label: '1º FOLLOW UP' },
    ...[2, 3, 4, 5, 6].map((step) => ({ key: `${step}_follow_up`, label: `${step}º FOLLOW UP` })),
    { key: 'retorno_manual', label: 'Follow Up' },
  ];
  const before = { status: 'Novo Lead', observacao: 'Manter anotação', vendedor: 'Vendedora fictícia' };
  for (const target of manual.slice(1)) {
    const moved = applyStatusChange(before, target.key, manual, '2026-10-31');
    assert.equal(moved.status, target.key, `Mover para ${target.label} deve preservar o destino`);
    assert.equal(moved.retorno, undefined, `${target.label} não inicia cadência`);
    assert.equal(moved.observacao, before.observacao);
    assert.equal(moved.vendedor, before.vendedor);
    assert.equal(returnOfRow({ status: moved.status, mini: moved }, manual), null);
    assert.equal(isFollowStatus(target.key, manual), false);
  }
  assert.equal(before.status, 'Novo Lead');
  assert.equal(followStatusKey(manual), '');
  assert.equal(systemStatusKeys(manual).size, 0);
  assert.equal(applyNoAnswerMark(before, 'Sim', manual, '2026-10-31').retorno, undefined);

  const withSystem = [...manual, { key: 'Follow Up', label: 'Cadência da loja' }];
  assert.equal(followStatusKey(withSystem), 'Follow Up');
  assert.deepEqual([...systemStatusKeys(withSystem)], ['Follow Up']);
  assert.equal(withFollowUpStatus(manual).at(-1).key, 'Follow Up');
  assert.deepEqual(withFollowUpStatus(withSystem), withSystem);
  const started = applyStatusChange(before, 'Follow Up', withSystem, '2026-10-31');
  assert.equal(started.status, 'Follow Up');
  assert.equal(started.retorno.passo, 1);
  assert.equal(applyNoAnswerMark(before, 'Sim', withSystem, '2026-10-31').status, 'Follow Up');
  const movedOut = applyStatusChange(started, '2_follow_up', withSystem, '2026-10-31');
  assert.equal(movedOut.status, '2_follow_up');
  assert.equal(movedOut.retorno, undefined);
  assert.equal(movedOut.proxima_em, undefined);
  assert.equal(movedOut.proxima_acao, undefined);
  assert.equal(movedOut.retorno_historico.at(-1).resultado, '2_follow_up');
  assert.equal(started.retorno.passo, 1);

  const renamed = [{ key: 'Follow Up', label: 'Outro nome' }, ...manual];
  assert.equal(isFollowStatus('Follow Up', renamed), true);
  assert.equal(followStatusKey(renamed), 'Follow Up');
}
assert.equal(atendimentoStatusKey(statuses), 'Em Atendimento');
assert.equal(followUpDay({ proxima_em: '2026-09-24', proxima_acao: 'ligar' }), '2026-09-24');
assert.equal(followUpDay({ proxima_acao: '24/09/2026' }), '2026-09-24');
assert.equal(followUpDay({ proxima_acao: 'ligar amanhã' }), '');
assert.equal(rowFromContact({ id: '9', mini_crm: { proxima_em: '2026-09-20' } }).proxima_em, '2026-09-20');

const groups = groupFollowUps([
  { id: 'a', nome: 'Ana', status: 'Follow Up', proxima_em: '2026-09-20', mini: { status: 'Follow Up', proxima_em: '2026-09-20' } },
  { id: 'b', nome: 'Bia', status: 'Follow Up', proxima_em: '2026-09-24', mini: { status: 'Follow Up', proxima_em: '2026-09-24' } },
  { id: 'c', nome: 'Caio', status: 'Follow Up', mini: { status: 'Follow Up', retorno: { cadencia: 'inicial', passo: 2, acao: '2º contato', em: '2026-09-30', iniciada: true } } },
  { id: 'd', nome: 'Duda', status: 'Follow Up', mini: { status: 'Follow Up' } },
  { id: 'e', nome: '', telefone: '', status: 'Follow Up', mini: { status: 'Follow Up' } },
  { id: 'f', nome: 'Lia', status: 'Em Atendimento', proxima_acao: 'FOLLOW UP', mini: { status: 'Em Atendimento', proxima_acao: 'FOLLOW UP' } },
  { id: 'g', nome: 'Rui', status: 'Venda Perdida', mini: { status: 'Venda Perdida', retorno: { cadencia: 'repescagem', passo: 1, acao: 'Retomar contato', em: '2026-10-24', iniciada: false } } },
], '2026-09-24', statuses);
assert.deepEqual(groups.late.map((row) => row.id), ['a']);
assert.deepEqual(groups.today.map((row) => row.id), ['b']);
assert.deepEqual(groups.next.map((row) => row.id), ['c']);
assert.deepEqual(groups.open.map((row) => row.id), ['d']);
assert.deepEqual(groups.repescagem.map((row) => row.id), ['g']);
assert.equal(groups.counts.late, 1);

const first = ensureInicial({ status: 'Novo Lead' }, '2026-09-24', statuses);
assert.equal(first.status, 'Follow Up');
assert.equal(first.retorno.passo, 1);
assert.equal(first.retorno.em, '2026-09-24');
assert.equal(ensureInicial(first, '2026-09-24', statuses).retorno.passo, 1);
assert.equal(followColumn(openReturn(first), '2026-09-24'), 'today');

const second = registerAttempt(first, { resultado: 'sem_resposta', today: '2026-09-24', statuses });
assert.equal(second.retorno.passo, 2);
assert.equal(second.retorno.em, '2026-09-25');
assert.equal(second.retorno_historico.length, 1);

const parked = applyStatusChange(second, 'Agendado', [...statuses, { key: 'Agendado', label: 'Agendado' }], '2026-09-24');
assert.equal(parked.status, 'Agendado');
assert.equal(parked.retorno, undefined);
assert.equal(parked.retorno_historico.length, 2);

const lost = registerAttempt(first, { resultado: 'repescagem', em: '2026-10-24', today: '2026-09-24', statuses: [...statuses, { key: 'Venda Perdida', label: 'Venda Perdida' }] });
assert.equal(lost.status, 'Repescagem');
assert.equal(lost.motivo, 'Sem retorno');
assert.equal(lost.retorno.cadencia, 'repescagem');
assert.equal(lost.retorno.iniciada, false);
assert.equal(followColumn(openReturn(lost), '2026-09-24'), 'repescagem');

const ended = registerAttempt(
  { status: 'Follow Up', retorno: { cadencia: 'repescagem', passo: 2, acao: '2º contato da repescagem', em: '2026-10-01', iniciada: true } },
  { resultado: 'sem_resposta', today: '2026-10-01', statuses: [...statuses, { key: 'Venda Perdida', label: 'Venda Perdida' }] },
);
assert.equal(ended.retorno, undefined);
assert.equal(ended.status, 'Venda Perdida');
assert.equal(destinationStatusKey([
  { key: 'Visita Agendada', label: 'Visita Agendada' },
  { key: 'Reagendado', label: 'Reagendado' },
], 'Agendado'), 'Visita Agendada');

const short = normalizeCadence({ inicial: [2, 4], repescagem: [10] });
assert.deepEqual(short.inicial, [2, 4]);
const made = ensureInicial({ status: 'Novo Lead' }, '2026-09-24', statuses, short);
assert.equal(made.retorno.em, '2026-09-26');
assert.equal(made.retorno.total, 2);
const nxt = registerAttempt(made, { resultado: 'sem_resposta', today: '2026-09-26', statuses, cadence: short });
assert.equal(nxt.retorno.passo, 2);
assert.equal(nxt.retorno.em, '2026-09-30');
const done = registerAttempt(nxt, {
  resultado: 'sem_resposta',
  today: '2026-09-30',
  statuses: [...statuses, { key: 'Venda Perdida', label: 'Venda Perdida' }],
  cadence: short,
});
assert.equal(done.retorno, undefined);
assert.equal(done.status, 'Venda Perdida');

const chosen = normalizeCadence({ repescagem: [5], sem_resposta: 'Arquivado' });
assert.equal(noAnswerStatusKey([
  { key: 'Venda Perdida', label: 'Venda Perdida' },
  { key: 'Arquivado', label: 'Arquivado' },
], chosen), 'Arquivado');
const closedAs = registerAttempt(
  { status: 'Follow Up', retorno: { cadencia: 'repescagem', passo: 1, acao: 'Retomar contato', em: '2026-10-01', iniciada: true } },
  {
    resultado: 'sem_resposta',
    today: '2026-10-01',
    statuses: [
      { key: 'Follow Up', label: 'Follow Up' },
      { key: 'Venda Perdida', label: 'Venda Perdida' },
      { key: 'Arquivado', label: 'Arquivado' },
    ],
    cadence: chosen,
  },
);
assert.equal(closedAs.status, 'Arquivado');
assert.equal(closedAs.retorno, undefined);
assert.equal(ensureRescueStatus([{ key: 'Follow Up', label: 'Follow Up' }]).at(-1).key, 'Repescagem');
assert.equal(ensureRescueStatus([{ key: 'Repescagem', label: 'Repescagem' }]).length, 1);
assert.equal(formatDayBr('2026-09-24'), '24/09/2026');
assert.equal(maskDayBr('24092026'), '24/09/2026');
assert.equal(parseDayBr('24/09/2026'), '2026-09-24');
assert.equal(parseDayBr('31/02/2026'), '');

assert.equal(simNaoFromBool(true), 'Sim');
assert.equal(simNaoFromBool(false), 'Não');
assert.equal(boolFromSimNao('Sim'), true);
assert.equal(boolFromSimNao('Não'), false);
assert.equal(boolFromSimNao(''), null);

const fromTracking = applyTrackingToMini(
  { vendedor: 'Ana', status: 'Em Negociação' },
  { qualificado: true, comprou: true, valor_venda: 15000 },
);
assert.equal(fromTracking.qualificado, 'Sim');
assert.equal(fromTracking.status, 'Venda Realizada');
assert.equal(fromTracking.valor, 15000);
assert.equal(fromTracking.vendedor, 'Ana');

const trackedRow = rowFromContact({
  id: 't1',
  sender_name: 'Lia',
  phone: '5541999990001',
  qualificado: true,
  comprou: true,
  valor_venda: 9900,
  mini_crm: { vendedor: 'Bia' },
});
assert.equal(trackedRow.qualificado, 'Sim');
assert.equal(trackedRow.status, 'Venda Realizada');
assert.equal(trackedRow.valor, 9900);
assert.equal(trackedRow.mini.status, 'Venda Realizada');

const mirror = applyCommercialPatchToMini({ status: 'Follow Up' }, { qualificado: true, comprou: true, valor: 500 });
assert.equal(mirror.qualificado, 'Sim');
assert.equal(mirror.status, 'Venda Realizada');
assert.equal(mirror.valor, 500);

const clearSale = applyCommercialPatchToMini(
  { status: 'Venda Realizada', qualificado: 'Sim' },
  { comprou: false, qualificado: false },
);
assert.equal(clearSale.qualificado, 'Não');
assert.equal(clearSale.status, undefined);

const toTracking = commercialPatchFromMiniChange(
  { status: 'Follow Up' },
  { status: 'Venda Realizada', qualificado: 'Sim', valor: 1200 },
  { qualificado: null, comprou: null },
);
assert.equal(toTracking.qualificado, true);
assert.equal(toTracking.comprou, true);
assert.equal(toTracking.valor, 1200);

const backfill = commercialPatchFromMiniChange(
  { status: 'Venda Realizada', qualificado: 'Sim', valor: 32900 },
  { status: 'Venda Realizada', qualificado: 'Sim', valor: 32900, vendedor: 'Mairon' },
  { qualificado: null, comprou: null },
);
assert.equal(backfill.qualificado, true);
assert.equal(backfill.comprou, true);
assert.equal(backfill.valor, 32900);

const noOp = commercialPatchFromMiniChange(
  { status: 'Follow Up', vendedor: 'A' },
  { status: 'Follow Up', vendedor: 'B' },
  { qualificado: null, comprou: null },
);
assert.equal(noOp, null);

assert.equal(needsSaleConfirm('Follow Up', 'Venda Realizada'), true);
assert.equal(needsSaleConfirm('Venda Realizada', 'Venda Realizada'), false);
assert.equal(needsSaleConfirm('Venda Realizada', 'Follow Up'), false);
assert.equal(needsSaleConfirm('', 'Em Negociação'), false);
assert.equal(isSoldMiniStatus('Venda Realizada'), true);

assert.equal(canConfirmSale({ dataVenda: '2026-09-24', valor: 15000 }), true);
assert.equal(canConfirmSale({ dataVenda: '2026-09-24', valor: 0 }), false);
assert.equal(canConfirmSale({ dataVenda: '', valor: 100 }), false);
assert.equal(canConfirmSale({ dataVenda: '24/09/2026', valor: 100 }), false);
assert.equal(canConfirmSale({ dataVenda: '2026-02-31', valor: 100 }), false);

const saleMini = buildConfirmedSaleMini(
  { status: 'Follow Up', retorno: { cadencia: 'inicial', passo: 1, acao: '1º contato', em: '2026-09-24', iniciada: true } },
  { status: 'Venda Realizada', dataVenda: '2026-09-20', valor: 32900 },
  statuses,
  '2026-09-24',
);
assert.equal(saleMini.status, 'Venda Realizada');
assert.equal(saleMini.data_venda, '2026-09-20');
assert.equal(saleMini.valor, 32900);
assert.equal(saleMini.retorno, undefined);

const marboStored = resolveMiniCrmSetup(presetForNicho('Loja de noivas'), {
  statuses: [{ key: 'Lead Qualificado', label: 'Lead Qualificado' }],
  columns: [
    { key: 'vendedor', label: 'Consultora', kind: 'text' },
    { key: 'valor', label: 'Valor Venda', kind: 'money' },
    { key: 'observacao', label: 'Observação', kind: 'text' },
  ],
  sellers: [],
});
assert.deepEqual(marboStored.columns.map((column) => column.key), ['vendedor', 'data_venda', 'valor', 'observacao']);
assert.equal(marboStored.columns.find((column) => column.key === 'data_venda').system, true);
const carWithSale = ensureSystemColumns(editableColumns(presetForNicho('Loja de Carros')));
assert.equal(carWithSale.filter((column) => column.key === 'data_venda').length, 1);
assert.equal(ensureSystemColumns([{ key: 'data_venda', label: 'Vendido em', kind: 'text' }])[0].kind, 'day');
assert.equal(ensureSystemColumns([{ key: 'data_venda', label: 'Vendido em', kind: 'text' }])[0].label, 'Vendido em');
assert.equal(isSystemColumn('data_venda'), true);
assert.equal(isSystemColumn('valor'), false);
assert.deepEqual(fixedColumns().map((column) => column.key), ['data', 'origem', 'nome', 'telefone', 'status']);
assert.deepEqual(fixedColumns(presetForNicho('Loja de noivas')).map((column) => column.key), ['data', 'origem', 'nome', 'telefone', 'status']);
const brideLocked = systemStatusKeys(normalizeStatuses(presetForNicho('Loja de noivas').statuses));
assert.deepEqual([...brideLocked].sort(), ['Follow Up', 'Venda Perdida', 'Venda Realizada']);
const carLocked = systemStatusKeys(normalizeStatuses(presetForNicho('Loja de Carros').statuses));
assert.deepEqual([...carLocked].sort(), ['Follow Up', 'Venda Perdida', 'Venda Realizada']);
assert.equal(brideLocked.has('Lead Qualificado'), false);
assert.equal(brideLocked.has('Agendado'), false);

// Qualificado na noiva: mesma chave da loja de carro, status "Lead Qualificado" espelha, Marbô ganha a coluna.
const carQual = presetForNicho('Loja de Carros').columns.find((column) => column.key === 'qualificado');
const brideQual = presetForNicho('Loja de noivas').columns.find((column) => column.key === 'qualificado');
assert.deepEqual(brideQual, carQual);
assert.equal(presetForNicho('Loja de noivas').columns.filter((column) => column.key === 'qualificado').length, 1);
const marboSaved = [
  { key: 'vendedor', kind: 'text', label: 'Consultora', onCard: false },
  { key: 'data_agendamento', kind: 'day', label: 'Data Agendamento', onCard: true },
  { key: 'compareceu', kind: 'simnao', label: 'Compareceu', onCard: false },
  { key: 'data_venda', kind: 'day', label: 'Data da venda', onCard: false },
  { key: 'valor', kind: 'money', label: 'Valor Venda', onCard: false },
  { key: 'proxima_acao', kind: 'text', label: 'Próxima Ação', onCard: false },
  { key: 'observacao', kind: 'text', label: 'Observação', onCard: false },
];
const marboWithQual = withQualifiedColumn(marboSaved);
assert.deepEqual(marboWithQual.map((column) => column.key), [
  'qualificado', 'vendedor', 'data_agendamento', 'compareceu', 'data_venda', 'valor', 'proxima_acao', 'observacao',
]);
assert.equal(marboSaved.length, 7);
assert.deepEqual(withQualifiedColumn(marboWithQual), marboWithQual);
const jrSaved = presetForNicho('Loja de Carros').columns.filter((column) => !column.locked && column.kind !== 'status');
assert.deepEqual(withQualifiedColumn(jrSaved), jrSaved);
const marboSetup = resolveMiniCrmSetup(brideModel, { statuses: brideModel.statuses, columns: marboWithQual, sellers: [] }, []);
assert.deepEqual(gridColumns(brideModel, marboSetup.columns).map((column) => column.key).slice(4, 7), ['status', 'qualificado', 'vendedor']);
assert.equal(marboSetup.columns.find((column) => column.key === 'data_venda').system, true);
assert.equal(marboSetup.columns.find((column) => column.key === 'valor').kind, 'money');

assert.equal(isQualifiedMiniStatus('Lead Qualificado'), true);
assert.equal(syncQualifiedFromStatus({ status: 'Lead Qualificado' }).qualificado, 'Sim');
assert.equal(syncQualifiedFromStatus({ status: 'Agendado', qualificado: 'Não' }).qualificado, 'Não');
const brideStatuses = normalizeStatuses(brideModel.statuses);
const toQual = applyStatusChange({ status: 'Novo Lead' }, 'Lead Qualificado', brideStatuses, '2026-09-24', null);
assert.equal(toQual.status, 'Lead Qualificado');
assert.equal(toQual.qualificado, 'Sim');
const qualPatch = commercialPatchFromMiniChange({ status: 'Novo Lead' }, toQual, { qualificado: null });
assert.deepEqual(qualPatch, { qualificado: true });
assert.equal(shouldSendQualified(qualPatch), true);
assert.equal('comprou' in qualPatch, false);
// Coluna Sim manual: grava e pede QualifiedLead; Não não dispara; contato já qualificado não repete.
const simMini = patchMiniCrm({}, 'qualificado', 'Sim', 'simnao');
assert.equal(shouldSendQualified(commercialPatchFromMiniChange({}, simMini, { qualificado: null })), true);
const naoMini = patchMiniCrm({}, 'qualificado', 'Não', 'simnao');
const naoPatch = commercialPatchFromMiniChange({}, naoMini, { qualificado: null });
assert.deepEqual(naoPatch, { qualificado: false });
assert.equal(shouldSendQualified(naoPatch), false);
assert.equal(shouldSendQualified(commercialPatchFromMiniChange({ qualificado: 'Sim' }, { qualificado: 'Sim' }, { qualificado: true })), false);
assert.equal(shouldSendQualified(null), false);
const viaAttempt = registerAttempt(
  { status: 'Follow Up', retorno: { cadencia: 'inicial', passo: 1, em: '2026-09-24', acao: 'x', iniciada: true } },
  { resultado: 'respondeu', destino: 'Lead Qualificado', today: '2026-09-24', statuses: brideStatuses, cadence: null },
);
assert.equal(viaAttempt.status, 'Lead Qualificado');
assert.equal(viaAttempt.qualificado, 'Sim');

// Não respondeu na noiva: marca de análise, Sim leva ao Follow-up sem duplicar retorno, Não não desfaz.
assert.equal(presetForNicho('Loja de noivas').columns.filter((column) => column.key === 'nao_respondeu').length, 1);
assert.equal(presetForNicho('Loja de Carros').columns.some((column) => column.key === 'nao_respondeu'), false);
const brideStatusKeys = presetForNicho('Loja de noivas').statuses.map((status) => status.key);
assert.equal(brideStatusKeys.filter((key) => key === 'Follow Up').length, 1);
assert.equal(brideStatusKeys.indexOf('Follow Up') + 1, brideStatusKeys.indexOf('Não Respondeu'));
const marboBoth = withNoAnswerColumn(withQualifiedColumn(marboSaved));
assert.deepEqual(marboBoth.map((column) => column.key).slice(0, 3), ['qualificado', 'nao_respondeu', 'vendedor']);
assert.equal(marboBoth.length, 9);
assert.deepEqual(withNoAnswerColumn(marboBoth), marboBoth);
const marboStatuses = presetForNicho('Loja de noivas').statuses.filter((status) => status.key !== 'Follow Up');
const marboStatusesFixed = withFollowUpStatus(marboStatuses);
assert.equal(marboStatusesFixed.length, marboStatuses.length + 1);
assert.deepEqual(withFollowUpStatus(marboStatusesFixed), marboStatusesFixed);
assert.deepEqual(withFollowUpStatus(presetForNicho('Loja de Carros').statuses), presetForNicho('Loja de Carros').statuses);
const brideStatusesFU = normalizeStatuses(presetForNicho('Loja de noivas').statuses);
const noAnswer = applyNoAnswerMark({ status: 'Não Respondeu' }, 'Sim', brideStatusesFU, '2026-09-24', null);
assert.equal(noAnswer.nao_respondeu, 'Sim');
assert.equal(noAnswer.status, 'Follow Up');
assert.equal(openReturn(noAnswer).passo, 1);
assert.equal(commercialPatchFromMiniChange({ status: 'Não Respondeu' }, noAnswer, { qualificado: null }), null);
const again = applyNoAnswerMark(
  { ...noAnswer, retorno: { ...noAnswer.retorno, passo: 3, em: '2026-10-01' } },
  'Sim', brideStatusesFU, '2026-09-24', null,
);
assert.equal(openReturn(again).passo, 3);
assert.equal(openReturn(again).em, '2026-10-01');
const unmark = applyNoAnswerMark(noAnswer, 'Não', brideStatusesFU, '2026-09-25', null);
assert.equal(unmark.nao_respondeu, 'Não');
assert.equal(unmark.status, 'Follow Up');
assert.deepEqual(unmark.retorno, noAnswer.retorno);
const cleared = applyNoAnswerMark(noAnswer, '', brideStatusesFU, '2026-09-25', null);
assert.equal('nao_respondeu' in cleared, false);
assert.equal(cleared.status, 'Follow Up');
const legacy = rowFromContact({ id: 'x', phone: '5511999990000', mini_crm: { status: 'Não Respondeu' } });
assert.equal(legacy.status, 'Não Respondeu');
assert.equal(legacy.mini.nao_respondeu, undefined);

{
  const before = [
    { key: 'Novo Lead', label: 'Novo Lead', color: '#111111' },
    { key: 'Teste_Ficticio', label: 'Teste Fictício', color: '#222222' },
    { key: 'Follow Up', label: 'Follow Up', color: '#333333' },
    { key: 'Venda Realizada', label: 'Venda Realizada', color: '#444444' },
    { key: 'Venda Perdida', label: 'Venda Perdida', color: '#555555' },
  ];
  const asked = before.filter((status) => !['Teste_Ficticio', 'Venda Perdida', 'Follow Up'].includes(status.key));
  const after = keepSystemStatuses(before, asked);
  assert.deepEqual(after.map((status) => status.key), ['Novo Lead', 'Venda Realizada', 'Follow Up', 'Venda Perdida']);
  const removed = removedStatusKeys(before, after);
  assert.deepEqual(removed, ['Teste_Ficticio']);
  assert.deepEqual(removedStatusKeys(before, asked), ['Teste_Ficticio']);

  const mini = {
    status: 'Teste_Ficticio', qualificado: 'Sim', valor: 1200, vendedor: 'Fulana',
    retorno: { fase: 'inicial', tentativas: [{ em: '2026-09-20' }] }, historico: [{ status: 'Novo Lead' }], observacao: 'x',
  };
  const target = defaultStatusKey(after);
  assert.equal(target, 'Novo Lead');
  const cleared = clearRemovedStatus(mini, removed, target);
  assert.equal(cleared.status, 'Novo Lead');
  assert.deepEqual({ ...cleared, status: mini.status }, mini);
  assert.equal(mini.status, 'Teste_Ficticio');
  const untouched = { status: 'Novo Lead', valor: 5 };
  assert.equal(clearRemovedStatus(untouched, removed, target), untouched);

  const leads = [
    { id: 'a', status: 'Teste_Ficticio', mini },
    { id: 'b', status: 'Novo Lead', mini: untouched },
    { id: 'c', status: '' },
  ].map((row) => {
    const next = withDefaultStatus(clearRemovedStatus(row.mini, removed, target), after);
    return { ...row, status: next.status || '', mini: next };
  });
  assert.equal(leads.length, 3);
  const boardAfter = kanbanColumns(leads, after);
  assert.equal(boardAfter.some((column) => column.status === 'Teste_Ficticio'), false);
  assert.equal(boardAfter.some((column) => column.status === ''), false);
  assert.deepEqual(boardAfter.find((column) => column.status === 'Novo Lead').rows.map((row) => row.id), ['a', 'b', 'c']);
  assert.deepEqual(leads.map((row) => row.status), ['Novo Lead', 'Novo Lead', 'Novo Lead']);
}

{
  assert.equal(sumColumnMoney([]), null);
  assert.equal(sumColumnMoney([{ valor: '' }, { valor: null }, {}]), null);
  assert.equal(sumColumnMoney([{ valor: 9300 }, { valor: '1.250,50' }, { valor: '' }, { valor: 'R$ 100,00' }]), 10650.5);
  assert.equal(sumColumnMoney([{ valor: 0 }, { valor: '0,00' }]), null);
  assert.equal(sumColumnMoney([{ valor: '0.1' }, { valor: '0.2' }]), 0.3);
}

{
  const marbo = ['Novo Lead', 'Em Atendimento', 'Em Negociação', 'Agendado', 'Reagendado', 'Follow Up', 'Venda Realizada', 'Venda Perdida', 'Lead Desqualificado', 'Repescagem']
    .map((label) => ({ key: label === 'Em Atendimento' ? 'em_atendimento' : label, label }));
  assert.deepEqual(attemptDestinationOptions(marbo).map((item) => item.key), ['em_atendimento', 'Em Negociação', 'Agendado']);
  const semAtendimento = marbo.filter((status) => status.key !== 'em_atendimento');
  assert.deepEqual(attemptDestinationOptions(semAtendimento).map((item) => item.name), ['Em Negociação', 'Agendado']);
  const comQualificado = [...marbo.slice(0, 2), { key: 'Lead Qualificado', label: 'Lead Qualificado' }, ...marbo.slice(2)];
  assert.deepEqual(attemptDestinationOptions(comQualificado).map((item) => item.name), ['Em Atendimento', 'Lead Qualificado', 'Em Negociação', 'Agendado']);
  const soFixos = marbo.filter((status) => ['Novo Lead', 'Follow Up', 'Venda Realizada', 'Venda Perdida', 'Repescagem'].includes(status.key));
  assert.deepEqual(attemptDestinationOptions(soFixos).map((item) => item.key), ['Novo Lead']);
  attemptDestinationOptions(marbo).forEach((item) => {
    assert.equal(['Follow Up', 'Venda Perdida', 'Venda Realizada', 'Repescagem'].includes(item.key), false);
  });

  const aberto = { status: 'Follow Up', valor: 900, retorno: { cadencia: 'inicial', passo: 1, total: 5, acao: '1º contato', em: '2026-09-20', iniciada: true } };
  const foi = registerAttempt(aberto, { resultado: 'respondeu', destino: 'em_atendimento', today: '2026-09-25', statuses: marbo });
  assert.equal(foi.status, 'em_atendimento');
  assert.equal(foi.retorno, undefined);
  assert.equal(foi.valor, 900);
  assert.equal(groupFollowUps([{ id: 'x', nome: 'Lead', status: foi.status, mini: foi }], '2026-09-25', marbo).late.length, 0);
  assert.equal(kanbanColumns([{ id: 'x', status: foi.status, mini: foi }], marbo).find((column) => column.status === 'em_atendimento').rows.length, 1);
  const invalido = registerAttempt(aberto, { resultado: 'respondeu', destino: 'Em Atendimento', today: '2026-09-25', statuses: semAtendimento });
  assert.equal(invalido.status, 'Novo Lead');
  assert.equal(invalido.retorno, undefined);

  assert.equal(entryInPeriod('2026-07-15T12:00:00Z', '2026-09-01', '2026-09-25'), false);
  assert.equal(entryInPeriod('2026-09-01T03:30:00Z', '2026-09-01', '2026-09-25'), true);
  assert.equal(entryInPeriod('2026-07-15T12:00:00Z', '', ''), true);
  assert.equal(entryInPeriod('', '2026-09-01', '2026-09-25'), false);
}

{
  const noiva = [
    { key: 'Novo Lead', label: 'Novo Lead' }, { key: 'em_atendimento', label: 'Em Atendimento' },
    { key: 'Agendado', label: 'Agendado' }, { key: 'Reagendado', label: 'Reagendado' },
    { key: 'Follow Up', label: 'Follow Up' }, { key: 'Venda Realizada', label: 'Venda Realizada' },
    { key: 'Venda Perdida', label: 'Venda Perdida' },
  ];
  assert.deepEqual(appointmentStatusKeys(noiva), ['Agendado', 'Reagendado']);
  assert.deepEqual(appointmentStatusKeys([{ key: 'Agendado', label: 'Visita Agendada' }, { key: 'Follow Up', label: 'Follow Up' }]), ['Agendado']);
  const colsNoiva = [
    { key: 'data_agendamento', label: 'Data Agendamento', kind: 'day' },
    { key: 'data_venda', label: 'Data da venda', kind: 'day', system: true },
    { key: 'observacao', label: 'Observação', kind: 'text' },
  ];
  assert.deepEqual(appointmentDateColumns(colsNoiva).map((c) => c.key), ['data_agendamento']);
  assert.equal(appointmentDay({ data_agendamento: '2026-10-10', data_venda: '2026-09-01', proxima_em: '2026-09-30' }, colsNoiva), '2026-10-10');
  assert.equal(appointmentDay({ data_agendamento: '03/10/2026' }, colsNoiva), '2026-10-03');
  assert.equal(appointmentDay({ data_venda: '2026-09-01', proxima_em: '2026-09-30' }, colsNoiva), '');
  const colsCarro = [{ key: 'data_da_visita', label: 'Data da Visita', kind: 'day' }, { key: 'data_agendamento', label: 'Data Agendamento', kind: 'day' }];
  assert.equal(appointmentDay({ data_agendamento: '2026-10-05' }, colsCarro), '2026-10-05');
  assert.equal(appointmentDay({ data_da_visita: '2026-10-04', data_agendamento: '2026-10-05' }, colsCarro), '2026-10-04');
}

{
  assert.equal(normalizeLeadName('  Luciane   Souza '), 'Luciane Souza');
  assert.equal(normalizeLeadName('Ana '), 'Ana');
  assert.equal(normalizeLeadPhone('(41) 98186-6910'), '5541981866910');
  assert.equal(normalizeLeadPhone('(41) 9818-6910'), '554198186910');
  assert.equal(normalizeLeadPhone('554198186910'), '554198186910');
  assert.equal(normalizeLeadPhone('123'), '');
  const contact = { id: 'c1', sender_name: 'Push', phone: '554198186910', mini_crm: { status: 'novo', observacao: 'x' } };
  assert.equal(nomeDoLead(contact), 'Push');
  const mini = withLeadIdentity(contact.mini_crm, { nome: 'Luciane Souza' });
  assert.equal(mini.status, 'novo');
  assert.equal(mini.observacao, 'x');
  const edited = { ...contact, sender_name: 'Push de novo', mini_crm: withLeadIdentity(mini, { telefone: '5541999990000' }) };
  assert.equal(nomeDoLead(edited), 'Luciane Souza');
  assert.equal(telefoneDoLead(edited), '5541999990000');
  const row = rowFromContact(edited);
  assert.equal(row.nome, 'Luciane Souza');
  assert.equal(row.telefone, '5541999990000');
  assert.equal(row.status, 'novo');
  assert.equal(row.foneKey, phoneKey('5541999990000'));
}

console.log('miniCrm ok');

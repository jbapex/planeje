import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as routine from '../../src/lib/gestorIaRoutine.js';

const row = { id: 'row-a', platform: 'meta', account_id: 'act_700', campaign_id: '10001', campaign_name: 'Campanha sintética', adset_id: '20001', adset_name: 'Conjunto sintético', spend: '280' };
const options = { clientId: 'client-a', weekStart: '2026-11-09', rows: [row], mode: 'agendados_na_semana', niche: 'Loja de noivas' };
const ids = { account_id: '700', campaign_id: '10001', adset_id: '20001' };
const contact = (id, patch = {}) => ({ id, cliente_id: 'client-a', sender_name: 'Contato sintético',
  origin_source: 'meta_ads', first_seen_at: '2026-11-10T14:00:00Z', tracking_data: { ...ids }, mini_crm: {}, ...patch });
const event = (contactId, at = '2026-11-11T15:00:00Z', patch = {}) => ({ contact_id: contactId, cliente_id: 'client-a', at, source: 'automatico', ...patch });

test('eventos mostram 14 novos e seis antigos mesmo com apenas quatro atribuídos sem duplicar contatos', () => {
  const contacts = [
    ...Array.from({ length: 14 }, (_, index) => contact(`new-${index}`, { tracking_data: index < 4 ? { ...ids } : {} })),
    ...Array.from({ length: 6 }, (_, index) => contact(`old-${index}`, { first_seen_at: '2026-10-20T14:00:00Z', tracking_data: {} })),
    contact('no-event'),
  ];
  const appointmentEvents = contacts.filter((item) => item.id !== 'no-event').map((item) => event(item.id));
  const result = routine.selectRoutineLeads([...contacts, contacts[0]], { ...options,
    appointmentEvents: [...appointmentEvents, event('new-0'), event('old-0', '2026-11-12T15:00:00Z', { source: 'manual' })],
  });
  const visible = [...result.leads, ...result.unmatchedLeads];
  assert.equal(result.leads.length, 4);
  assert.equal(result.unmatchedLeads.length, 16);
  assert.deepEqual(result.originRows, []);
  assert.ok(result.unmatchedLeads.every((lead) => lead.routineOrigin.account_id === '' && lead.routineMatchMethod === null));
  assert.equal(new Set(visible.map((lead) => lead.id)).size, 20);
  assert.equal(visible.filter((lead) => lead.routineCohort === 'novo').length, 14);
  assert.equal(visible.filter((lead) => lead.routineCohort === 'antigo').length, 6);
  assert.ok(visible.every((lead) => lead.routineScheduled && lead.routineScheduledAt === '2026-11-11T15:00:00Z'));
  assert.equal(visible.find((lead) => lead.id === 'old-0').first_seen_at, '2026-10-20T14:00:00Z');
});

test('evento respeita limites de segunda e domingo em America/Sao_Paulo', () => {
  const contacts = ['before', 'start', 'end', 'after'].map((id) => contact(id, { first_seen_at: '2026-10-20T14:00:00Z' }));
  const result = routine.selectRoutineLeads(contacts, { ...options, appointmentEvents: [
    event('before', '2026-11-09T02:59:59.999Z'), event('start', '2026-11-09T03:00:00.000Z'),
    event('end', '2026-11-16T02:59:59.999Z'), event('after', '2026-11-16T03:00:00.000Z'),
  ] });
  assert.deepEqual(result.leads.map((lead) => lead.id), ['start', 'end']);
});

test('data futura do compromisso não substitui quando foi marcado e mantém evento manual', () => {
  const result = routine.selectRoutineLeads([contact('manual', { first_seen_at: '2026-10-20T14:00:00Z', mini_crm: { data_agendamento: '2026-12-02' } })], {
    ...options, appointmentEvents: [event('manual', '2026-11-12T15:00:00Z', { source: 'manual', appointment_day: '2026-12-02' })],
  });
  assert.deepEqual(result.leads.map((lead) => lead.id), ['manual']);
  assert.equal(result.leads[0].routineScheduledAt, '2026-11-12T15:00:00Z');
  assert.equal(result.leads[0].routineAppointment, '2026-12-02');
});

test('tag atual, data futura e updated_at não fabricam histórico de marcação', () => {
  const result = routine.selectRoutineLeads([
    contact('tag-only', { mini_crm: { status: 'agendado' }, updated_at: '2026-11-12T15:00:00Z' }),
    contact('date-only', { mini_crm: { data_agendamento: '2026-11-13' }, updated_at: '2026-11-12T15:00:00Z' }),
  ], { ...options, appointmentEvents: [], messages: [
    { contact_id: 'tag-only', direction: 'equipe', at: '2026-11-16T14:00:00Z', text: 'Agendamento confirmado para 20/11 às 14h.' },
  ] });
  assert.equal(result.leads.length, 0);
  assert.equal(result.unmatchedLeads.length, 0);
});

test('eventos inválidos, de outro cliente ou de contato ausente não entram na semana', () => {
  const result = routine.selectRoutineLeads([contact('foreign-event'), contact('invalid-time'), contact('good'), contact('foreign-contact', { cliente_id: 'client-b' })], {
    ...options, appointmentEvents: [event('foreign-event', undefined, { cliente_id: 'client-b' }), event('invalid-time', 'não é uma data'),
      event('good'), event('foreign-contact'), event('absent')],
  });
  assert.deepEqual(result.leads.map((lead) => lead.id), ['good']);
});

test('modo entrada mantém primeira coorte e agendamento posterior sem incluir antigos', () => {
  const contacts = [contact('new', { mini_crm: { data_agendamento: '2026-12-02' } }),
    contact('old', { first_seen_at: '2026-10-20T14:00:00Z', mini_crm: { data_agendamento: '2026-12-02' } })];
  const selected = routine.selectRoutineLeads(contacts, { ...options, mode: 'entrada', appointmentsOnly: true,
    appointmentEvents: [event('old')],
  });
  const legacy = routine.selectRoutineLeads(contacts, { ...options, mode: undefined, appointmentsOnly: true });
  assert.deepEqual(selected.leads.map((lead) => lead.id), ['new']);
  assert.deepEqual(legacy.leads.map((lead) => lead.id), ['new']);
  assert.equal(legacy.leads[0].routineCohort, 'novo');
});

test('resumo separa vínculos e CPA usa apenas agendamentos novos atribuídos', () => {
  const contacts = [contact('assigned-new'), contact('assigned-old', { first_seen_at: '2026-10-20T14:00:00Z' }),
    contact('unmatched-new', { tracking_data: {} }), contact('unmatched-old', { first_seen_at: '2026-10-20T14:00:00Z', origin_source: 'site', tracking_data: {} })];
  const result = routine.selectRoutineLeads(contacts, { ...options, appointmentEvents: contacts.map((item) => event(item.id)) });
  assert.equal(typeof routine.routineLeadSummary, 'function', 'o resumo precisa ser compartilhado pelos consumidores');
  assert.deepEqual(routine.routineLeadSummary(result, [row]), {
    total: 4, novos: 2, antigos: 2, agendamentos: 4, agendamentosNovos: 2, agendamentosAntigos: 2,
    atribuidos: { total: 2, novos: 1, antigos: 1, agendamentos: 2, agendamentosNovos: 1, agendamentosAntigos: 1, cpaNovos: 1, cpa: 280 },
    semVinculo: { total: 2, novos: 1, antigos: 1, agendamentos: 2, agendamentosNovos: 1, agendamentosAntigos: 1 },
  });
});

test('resumo de entrada não confunde novos contatos com novos agendamentos no CPA', () => {
  const result = routine.selectRoutineLeads([contact('scheduled', { mini_crm: { data_agendamento: '2026-12-02' } }), contact('not-scheduled')], {
    ...options, mode: 'entrada',
  });
  assert.equal(typeof routine.routineLeadSummary, 'function', 'o resumo precisa ser compartilhado pelos consumidores');
  const summary = routine.routineLeadSummary(result, [row]);
  assert.equal(summary.novos, 2);
  assert.equal(summary.agendamentosNovos, 1);
  assert.equal(summary.atribuidos.cpa, 280);
  assert.equal(routine.routineLeadSummary({ leads: [], unmatchedLeads: [] }, [row]).atribuidos.cpa, null);
});

test('CPA exclui novos agendados fora da revisão e não transforma gasto desconhecido em zero', () => {
  const historical = { account_id: '700', campaign_id: '10002', campaign_name: 'Campanha antiga', adset_id: '20002', adset_name: 'Conjunto antigo' };
  const contacts = [contact('in-review'), contact('outside-review', { tracking_data: historical })];
  const result = routine.selectRoutineLeads(contacts, { ...options, appointmentEvents: contacts.map((item) => event(item.id)), originCatalog: [historical] });
  assert.equal(typeof routine.routineLeadSummary, 'function', 'o resumo precisa ser compartilhado pelos consumidores');
  const summary = routine.routineLeadSummary(result, [row]);
  assert.equal(summary.atribuidos.agendamentosNovos, 2);
  assert.equal(summary.atribuidos.cpaNovos, 1);
  assert.equal(summary.atribuidos.cpa, 280);
  assert.equal(routine.routineLeadSummary(result, [{ ...row, spend: '' }]).atribuidos.cpa, null);
});

test('CPA atribuído soma somente gasto Meta finito de linhas com identidade válida e preserva zero', () => {
  const contacts = [contact('meta-new'), contact('google-new', { origin_source: 'google_ads', tracking_data: {} })];
  const result = routine.selectRoutineLeads(contacts, { ...options, appointmentEvents: contacts.map((item) => event(item.id)) });
  const unrelatedRows = [
    { ...row, id: 'google-spend', platform: 'google', spend: '900' },
    { id: 'manual-spend', platform: 'meta', campaign_name: 'Linha manual', spend: '600' },
    { ...row, id: 'invalid-spend', campaign_id: '10003', adset_id: '20003', spend: 'valor inválido' },
  ];
  const summary = routine.routineLeadSummary(result, [row, ...unrelatedRows]);
  assert.equal(summary.semVinculo.agendamentosNovos, 1);
  assert.equal(summary.atribuidos.cpaNovos, 1);
  assert.equal(summary.atribuidos.cpa, 280);
  assert.equal(routine.routineLeadSummary(result, [{ ...row, spend: '0' }, ...unrelatedRows]).atribuidos.cpa, 0);
});

test('campanha fora da revisão surge só para leitura com gasto zero e encerrada apenas pelo catálogo', () => {
  const historical = { account_id: '700', campaign_id: '10002', campaign_name: 'Campanha antiga', adset_id: '20002', adset_name: 'Conjunto antigo' };
  const contacts = [contact('old-paused', { first_seen_at: '2026-10-20T14:00:00Z', tracking_data: historical })];
  const before = structuredClone(contacts);
  const result = routine.selectRoutineLeads(contacts, { ...options, appointmentEvents: [event('old-paused')],
    originCatalog: [{ ...historical, campaign_status: 'PAUSED', status: 'ACTIVE', ad_id: '30002' }],
  });
  assert.deepEqual(result.leads.map((lead) => lead.id), ['old-paused']);
  assert.deepEqual(result.originRows, [{ ...historical, spend: 0, readOnly: true, status: 'campanha_encerrada',
    novos: 0, antigos: 1, agendamentos: 1, agendamentosNovos: 0, agendamentosAntigos: 1, cpa: null,
  }]);
  assert.deepEqual(contacts, before);
  assert.equal(row.spend, '280');
});

test('sem status de campanha confirmado a origem continua fora da revisão', () => {
  const historical = { account_id: '700', campaign_id: '10002', campaign_name: 'Campanha antiga', adset_id: '20002', adset_name: 'Conjunto antigo' };
  const lead = contact('old-unknown', { first_seen_at: '2026-10-20T14:00:00Z', tracking_data: historical });
  const result = routine.selectRoutineLeads([lead], { ...options, appointmentEvents: [event('old-unknown')], originCatalog: [historical] });
  assert.equal(result.originRows?.[0]?.status, 'fora_da_revisao');
  assert.equal(result.originRows?.[0]?.spend, 0);
  assert.equal(result.originRows?.[0]?.cpa, null);
});

test('nomes de campanha histórica só casam quando o catálogo salvo confirma par único', () => {
  const historical = { account_id: '700', campaign_id: '10002', campaign_name: 'Campanha antiga', adset_id: '20002', adset_name: 'Conjunto antigo' };
  const result = routine.selectRoutineLeads([contact('historical-by-name', { first_seen_at: '2026-10-20T14:00:00Z',
    tracking_data: { campaign_name: '  CAMPANHA   ANTIGA ', adset_name: 'CONJUNTO ANTIGO' },
  })], { ...options, appointmentEvents: [event('historical-by-name')], originCatalog: [{ ...historical, campaign_status: 'ARCHIVED' }] });
  assert.deepEqual(result.leads.map((lead) => lead.id), ['historical-by-name']);
  assert.equal(result.leads[0].routineMatchMethod, 'name');
  assert.equal(result.originRows?.[0]?.campaign_id, '10002');
  assert.equal(result.originRows?.[0]?.status, 'campanha_encerrada');
});

test('origem existente na revisão não reaparece como linha histórica após filtro parcial', () => {
  const otherRow = { ...row, id: 'row-b', campaign_id: '10002', adset_id: '20002' };
  const result = routine.selectRoutineLeads([contact('other-selected-out', { first_seen_at: '2026-10-20T14:00:00Z',
    tracking_data: { account_id: '700', campaign_id: '10002', adset_id: '20002' },
  })], { ...options, allRows: [row, otherRow], appointmentEvents: [event('other-selected-out')] });
  assert.equal(result.leads.length, 0);
  assert.deepEqual(result.originRows, []);
});

test('seleção parcial não inclui campanhas históricas e seleção completa ou sem recorte mantém essas origens', () => {
  const otherRow = { ...row, id: 'row-b', campaign_id: '10002', adset_id: '20002', campaign_name: 'Outra campanha', adset_name: 'Outro conjunto' };
  const historical = { account_id: '700', campaign_id: '10003', adset_id: '20003', campaign_name: 'Campanha encerrada', adset_name: 'Conjunto encerrado', campaign_status: 'PAUSED' };
  const contacts = [contact('selected'), contact('history', { first_seen_at: '2026-10-20T14:00:00Z', tracking_data: historical })];
  const input = { ...options, allRows: [row, otherRow], appointmentEvents: contacts.map((item) => event(item.id)), originCatalog: [historical] };
  const partial = routine.selectRoutineLeads(contacts, input);
  assert.deepEqual(partial.leads.map((lead) => lead.id), ['selected']);
  assert.deepEqual(partial.originRows, []);
  assert.equal(partial.unmatchedLeads.length, 0);
  for (const rows of [[otherRow, row], []]) {
    const full = routine.selectRoutineLeads(contacts, { ...input, rows });
    assert.deepEqual(full.leads.map((lead) => lead.id), ['selected', 'history']);
    assert.equal(full.originRows.length, 1);
  }
  const noReviewRows = routine.selectRoutineLeads(contacts, { ...input, rows: [], allRows: [] });
  assert.deepEqual(noReviewRows.leads.map((lead) => lead.id), ['selected', 'history']);
  assert.equal(noReviewRows.originRows.length, 2);
});

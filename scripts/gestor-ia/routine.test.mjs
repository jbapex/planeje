import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeRoutineWeek, selectRoutineLeads, routineSavedCatalog, routineSavedSpend } from '../../src/lib/gestorIaRoutine.js';
import { applyWeekSpendToRows, buildAdsetSpendIndex } from '../../src/lib/trafficSheetMetaSpend.js';

const row = { id: 'row-1', platform: 'meta', account_id: 'act_700', campaign_id: '10001', campaign_name: 'Campanha', adset_id: '20001', adset_name: 'Conjunto' };
const options = { clientId: 'client-a', weekStart: '2026-11-02', rows: [row], config: null, niche: 'Loja de noivas' };
const lead = (id, patch = {}) => ({ id, cliente_id: 'client-a', origin_source: 'meta_ads', first_seen_at: '2026-11-03T14:00:00Z',
  tracking_data: { meta_ad_details: { ad: { account_id: '700', campaign: { id: '10001' }, adset: { id: '20001' } } } },
  mini_crm: { data_agendamento: '2026-11-20' }, ...patch });

test('normaliza a semana civil e rejeita datas impossíveis', () => {
  assert.equal(normalizeRoutineWeek('2026-11-08'), '2026-11-02');
  assert.equal(normalizeRoutineWeek('2026-11-09'), '2026-11-09');
  assert.equal(normalizeRoutineWeek('2026-02-30'), '');
  assert.equal(normalizeRoutineWeek(''), '');
});

test('coorte é a primeira entrada na semana de Brasília, com agendamento posterior', () => {
  const contacts = [lead('later'), lead('monday', { first_seen_at: '2026-11-02T03:00:00Z' }),
    lead('sunday', { first_seen_at: '2026-11-09T02:59:59Z' }), lead('before', { first_seen_at: '2026-11-02T02:59:59Z' }),
    lead('after', { first_seen_at: '2026-11-09T03:00:00Z' }), lead('old', { first_seen_at: '2026-10-27T14:00:00Z', last_message_at: '2026-11-03T14:00:00Z' }),
    lead('no-schedule', { mini_crm: {} }), lead('foreign', { cliente_id: 'client-b' })];
  assert.deepEqual(selectRoutineLeads(contacts, { ...options, appointmentsOnly: true }).leads.map(l => l.id), ['later', 'monday', 'sunday']);
  assert.equal(selectRoutineLeads(contacts, options).leads.length, 4);
});

test('exige IDs exatos, preserva primeira origem, une seleção sem duplicar contatos', () => {
  const rows = [row, { ...row, id: 'row-2' }, { ...row, id: 'manual', campaign_id: '', adset_id: '' }];
  const result = selectRoutineLeads([lead('one'), lead('one'), lead('wrong-set', { tracking_data: { campaign_id: '10001', adset_id: '20002', account_id: '700' } }),
    lead('wrong-account', { tracking_data: { campaign_id: '10001', adset_id: '20001', account_id: '701' } }),
    lead('first-site', { origin_source: 'site' }), lead('missing', { tracking_data: { campaign_name: 'Campanha', adset_name: 'Conjunto' } })], { ...options, rows });
  assert.deepEqual(result.leads.map(l => l.id), ['one']);
  assert.equal(result.unresolvedRows, 1);
  assert.equal(result.unattributed, 1);
  assert.equal(selectRoutineLeads([lead('one')], { ...options, rows: [{ ...row, adset_id: '' }] }).leads.length, 0);
  assert.equal(selectRoutineLeads([lead('one')], { ...options, rows: [{ ...row, adset_id: '', adset_name: '' }] }).leads.length, 1);
});

test('agendamento usa colunas e status cadastrados, sem inferir pela qualificação', () => {
  const config = { statuses: [{ key: 'visita', label: 'Visita Agendada', color: '#333333' }], columns: [{ key: 'visita_em', label: 'Data da visita', kind: 'day' }] };
  const contacts = [lead('date', { mini_crm: { visita_em: '2026-12-01' } }), lead('status', { mini_crm: { status: 'visita' } }), lead('qualified', { mini_crm: {}, qualificado: true })];
  assert.deepEqual(selectRoutineLeads(contacts, { ...options, config, appointmentsOnly: true }).leads.map(l => l.id), ['date', 'status']);
});

const period = { since: '2026-11-02', until: '2026-11-08' };
const reading = { exact: true, period, partial: false, campaigns: [{ id: '10001', name: 'Campanha', adsets: { data: [
  { id: '20001', name: 'Conjunto', insights: { data: [{ spend: '123.45', account_currency: 'BRL' }] } },
] } }] };
test('catálogo usa a árvore salva; gasto exige recorte completo e moeda BRL', () => {
  assert.equal(routineSavedCatalog(reading).campaigns[0].adsets[0].id, '20001');
  assert.equal(routineSavedSpend(reading, period).byId.get('20001'), 123.45);
  for (const invalid of [{ ...reading, exact: false }, { ...reading, partial: true }, { ...reading, period: { ...period, until: '2026-11-07' } },
    { ...reading, campaigns: [{ ...reading.campaigns[0], adsets: { data: [{ id: '20001', insights: { data: [{ spend: '10', account_currency: 'USD' }] } }] } }] }]) {
    assert.throws(() => routineSavedSpend(invalid, period), /salv|complet|moeda/i);
  }
});

test('desdobramento por ID não importa outra campanha de mesmo nome', () => {
  const index = buildAdsetSpendIndex([
    { id: '201', name: 'A', campaign_id: '101', campaign_name: 'Remarketing', insights: { data: [{ spend: '25' }] } },
    { id: '202', name: 'B', campaign_id: '102', campaign_name: 'Remarketing', insights: { data: [{ spend: '900' }] } },
  ]);
  const result = applyWeekSpendToRows([{ platform: 'meta', campaign_id: '101', campaign_name: 'Remarketing' }], index, { matchById: true });
  assert.deepEqual(result.rows.map(({ campaign_id, adset_id, spend }) => ({ campaign_id, adset_id, spend })), [{ campaign_id: '101', adset_id: '201', spend: '25' }]);
});

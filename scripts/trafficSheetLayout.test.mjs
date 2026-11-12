import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyConversionLabel,
  buildSheetColumns,
  inferSheetMetrics,
  matchResultKpiPreset,
  normalizeSheetMetrics,
  reorderSheetMetrics,
  requiredCountFields,
  sheetMetricOptions,
} from '../src/lib/trafficSheetLayout.js';

test('agendamentos client keeps messages and appointment KPI, not a generic conversion column', () => {
  const metrics = inferSheetMetrics('Agendamentos');
  assert.deepEqual(metrics, ['spend', 'messages', 'appointments', 'daily_budget', 'target_message_cost']);
  const columns = buildSheetColumns(metrics, 'Agendamentos');
  assert.deepEqual(columns.map((column) => column.key), [
    'campaign_name', 'adset_name', 'spend', 'messages', 'cost:messages', 'appointments', 'cost:appointments', 'daily_budget', 'target_message_cost',
  ]);
  assert.ok(columns.some((column) => column.label === 'Meta R$ / agend.'));
  assert.ok(!columns.some((column) => column.key === 'conversions'));
});

test('purchase client uses the result label as the conversion column and revenue', () => {
  const columns = buildSheetColumns(inferSheetMetrics('Compras'), 'Compras');
  assert.ok(columns.some((column) => column.key === 'conversions' && column.label === 'Compras'));
  assert.ok(columns.some((column) => column.key === 'conversion_value'));
  assert.ok(!columns.some((column) => column.key === 'messages'));
});

test('website purchase preset infers spend, purchases and revenue', () => {
  assert.equal(matchResultKpiPreset('Compras no site'), 'compras');
  const metrics = inferSheetMetrics('Compras no site');
  assert.deepEqual(metrics, ['spend', 'conversions', 'conversion_value', 'daily_budget', 'target_message_cost']);
  const columns = buildSheetColumns(metrics, 'Compras no site');
  assert.ok(columns.some((column) => column.key === 'conversions' && column.label === 'Compras no site'));
  assert.ok(!columns.some((column) => column.key === 'compras'));
});

test('car dealership can keep simulations as the main KPI and still count CPF and purchases', () => {
  assert.equal(matchResultKpiPreset('Simulações'), 'simulacoes');
  const metrics = ['spend', 'conversions', 'cpf_bom', 'compras', 'daily_budget', 'target_message_cost'];
  const columns = buildSheetColumns(metrics, 'Simulações');
  assert.ok(columns.some((column) => column.key === 'conversions' && column.label === 'Simulações'));
  assert.ok(columns.some((column) => column.key === 'cpf_bom' && column.label === 'CPF bom'));
  assert.ok(columns.some((column) => column.key === 'compras' && column.label === 'Compras'));
  assert.ok(!sheetMetricOptions('Simulações').some((option) => option.id === 'simulacoes'));
  assert.deepEqual(normalizeSheetMetrics(['spend', 'conversions', 'simulacoes', 'cpf_bom'], 'Simulações'), ['spend', 'conversions', 'cpf_bom']);
});

test('construction materials can count quotes as the main KPI and still count qualified leads', () => {
  assert.equal(matchResultKpiPreset('Orçamentos'), 'orcamentos');
  assert.equal(matchResultKpiPreset('Lead qualificado'), 'lead_qualificado');
  const metrics = inferSheetMetrics('Orçamentos');
  assert.deepEqual(metrics, ['spend', 'conversions', 'daily_budget', 'target_message_cost']);
  const columns = buildSheetColumns(['spend', 'conversions', 'lead_qualificado', 'daily_budget', 'target_message_cost'], 'Orçamentos');
  assert.ok(columns.some((column) => column.key === 'conversions' && column.label === 'Orçamentos'));
  assert.ok(columns.some((column) => column.key === 'lead_qualificado' && column.label === 'Lead qualificado'));
  assert.ok(columns.some((column) => column.key === 'cost:lead_qualificado' && column.label === 'R$ / quali'));
  assert.ok(!sheetMetricOptions('Orçamentos').some((option) => option.id === 'orcamentos'));
  assert.ok(sheetMetricOptions('Orçamentos').some((option) => option.id === 'lead_qualificado'));
  assert.deepEqual(normalizeSheetMetrics(['spend', 'conversions', 'orcamentos', 'lead_qualificado'], 'Orçamentos'), ['spend', 'conversions', 'lead_qualificado']);
});

test('empty stored metrics infer from the client; saved metrics keep an explicit subset', () => {
  assert.deepEqual(normalizeSheetMetrics([], 'Mensagens WhatsApp'), ['spend', 'messages', 'daily_budget', 'target_message_cost']);
  assert.deepEqual(normalizeSheetMetrics(['spend', 'calls', 'hack'], 'Agendamentos'), ['spend', 'calls']);
  assert.deepEqual(requiredCountFields(['spend', 'messages', 'daily_budget'], 'Lead'), ['messages']);
});

test('rows without a conversion name inherit the client result label', () => {
  const rows = applyConversionLabel([{ campaign_name: 'A', conversion_label: '' }, { conversion_label: 'Lead' }], 'Agendamentos');
  assert.equal(rows[0].conversion_label, 'Agendamentos');
  assert.equal(rows[1].conversion_label, 'Lead');
});

test('dragging a column keeps its cost beside it and leaves campaign columns first', () => {
  const next = reorderSheetMetrics(
    ['spend', 'messages', 'appointments', 'daily_budget', 'target_message_cost'],
    'Agendamentos',
    'appointments',
    'spend',
  );
  assert.deepEqual(next, ['appointments', 'spend', 'messages', 'daily_budget', 'target_message_cost']);
  assert.deepEqual(buildSheetColumns(next, 'Agendamentos').map((column) => column.key), [
    'campaign_name', 'adset_name', 'appointments', 'cost:appointments', 'spend', 'messages', 'cost:messages', 'daily_budget', 'target_message_cost',
  ]);
  assert.deepEqual(reorderSheetMetrics(next, 'Agendamentos', 'spend', 'spend'), next);
  assert.deepEqual(reorderSheetMetrics(next, 'Agendamentos', 'campaign_name', 'spend'), next);
  assert.deepEqual(
    reorderSheetMetrics(['spend', 'messages', 'appointments'], 'Agendamentos', 'spend', 'appointments'),
    ['messages', 'appointments', 'spend'],
  );
});

test('appointment layout navigation skips calculated cost cells', () => {
  const columns = buildSheetColumns(inferSheetMetrics('Agendamentos'), 'Agendamentos');
  assert.equal(columns.at(-1).key, 'target_message_cost');
  assert.equal(columns.find((column) => column.key === 'messages').index, 3);
  assert.equal(columns.find((column) => column.key === 'appointments').index, 5);
});

test('optional conversions column does not reuse the appointment name', () => {
  const columns = buildSheetColumns(['spend', 'appointments', 'conversions'], 'Agendamentos');
  assert.equal(columns.find((column) => column.key === 'appointments').label, 'Agendamentos');
  assert.equal(columns.find((column) => column.key === 'conversions').label, 'Conversões');
  const options = sheetMetricOptions('Agendamentos');
  assert.equal(options.find((option) => option.id === 'appointments').label, 'Agendamentos');
  assert.equal(options.find((option) => option.id === 'conversions').label, 'Conversões');
  assert.equal(options.filter((option) => option.label === 'Agendamentos').length, 1);
});

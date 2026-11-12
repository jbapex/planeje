import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  COLUMN_WIDTH_MAX,
  COLUMN_WIDTH_MIN,
  applyColumnWidth,
  clampColumnWidth,
  columnWidth,
  defaultColumnWidth,
  resetColumnWidth,
  sheetTableWidth,
} from '../src/lib/trafficSheetColumnWidth.js';
import { buildSheetColumns, inferSheetMetrics } from '../src/lib/trafficSheetLayout.js';

test('campaign and adset start wider than metric columns', () => {
  assert.ok(defaultColumnWidth('campaign_name') > defaultColumnWidth('spend'));
  assert.ok(defaultColumnWidth('adset_name') > defaultColumnWidth('messages'));
  assert.equal(defaultColumnWidth('cost:messages'), 96);
});

test('resize clamps and can return to the default', () => {
  assert.equal(clampColumnWidth(10), COLUMN_WIDTH_MIN);
  assert.equal(clampColumnWidth(900), COLUMN_WIDTH_MAX);
  const wider = applyColumnWidth({}, 'campaign_name', 420);
  assert.equal(columnWidth(wider, 'campaign_name'), 420);
  assert.equal(columnWidth(resetColumnWidth(wider, 'campaign_name'), 'campaign_name'), defaultColumnWidth('campaign_name'));
});

test('table min width follows visible columns plus row and remove gutters', () => {
  const columns = buildSheetColumns(inferSheetMetrics('Agendamentos'), 'Agendamentos');
  const total = sheetTableWidth(columns, { campaign_name: 400 });
  assert.equal(total, 36 + 26 + 400 + columns.slice(1).reduce((sum, column) => sum + defaultColumnWidth(column.key), 0));
});

import assert from 'node:assert/strict';
import {
  DEFAULT_ANALYSIS_LABELS,
  catalogFromRows,
  countAnalysisLabel,
  isAnalysisLabel,
  mergeTrackingAnalysisLabels,
  normalizeAnalysisLabelName,
  resolveAnalysisLabels,
  rowHasAnalysisLabel,
  analysisLabelsForReportRow,
  reportRowHasAnalysisLabel,
  bumpAnalysisCounts,
  tallyAnalysisLabels,
  withoutAnalysisLabels,
} from '../src/lib/rastreamentoAnalysisLabels.js';
import { webhookConversionPlan } from '../src/lib/rastreamentoConversionRules.js';

assert.equal(normalizeAnalysisLabelName('  Não   responde '), 'Não responde');
assert.equal(isAnalysisLabel('nao responde'), true);
assert.equal(isAnalysisLabel('Desqualificado'), true);
assert.equal(isAnalysisLabel('quente'), false);
assert.equal(isAnalysisLabel('Frio', [{ name: 'Frio' }]), true);

const contact = { tracking_data: { ctwaClid: 'abc', planeje_labels: ['Não responde'] } };
const lead = { etiquetas: ['Quente', 'Desqualificado'], tracking_data: { planeje_labels: ['Não responde'] } };
assert.deepEqual(resolveAnalysisLabels({ contact, lead }), ['Não responde', 'Desqualificado']);
assert.equal(rowHasAnalysisLabel({ ...contact, _leadRef: lead }, 'não responde'), true);
assert.equal(rowHasAnalysisLabel({ _fromLead: true, _leadRef: lead, tracking_data: lead.tracking_data }, 'Desqualificado'), true);

const merged = mergeTrackingAnalysisLabels({ ctwaClid: 'x', wa_labels: ['a'] }, [' Não responde ', 'Não responde']);
assert.deepEqual(merged.planeje_labels, ['Não responde']);
assert.equal(merged.ctwaClid, 'x');
assert.deepEqual(merged.wa_labels, ['a']);

assert.deepEqual(withoutAnalysisLabels(['Quente', 'Não responde', 'Desqualificado']), ['Quente']);
assert.equal(DEFAULT_ANALYSIS_LABELS.map((item) => item.name).join(','), 'Não responde,Desqualificado');

const catalog = catalogFromRows([{ tracking_data: { planeje_labels: ['Sem orçamento'] } }]);
assert.equal(catalog.some((item) => item.name === 'Não responde'), true);
assert.equal(catalog.some((item) => item.name === 'Sem orçamento'), true);
assert.equal(countAnalysisLabel([{ tracking_data: { planeje_labels: ['Não responde'] } }], 'Não responde'), 1);

const reportRow = {
  tracking_data: { planeje_labels: ['Não responde'] },
  _contactRow: { tracking_data: { planeje_labels: ['Não responde'] } },
  _detailLead: { tracking_data: { planeje_labels: ['Não responde'] } },
};
assert.deepEqual(analysisLabelsForReportRow(reportRow), ['Não responde']);
assert.equal(reportRowHasAnalysisLabel(reportRow, 'Não responde'), true);
assert.equal(bumpAnalysisCounts({}, reportRow).naoResponde, 1);
assert.equal(tallyAnalysisLabels([reportRow]).find((item) => item.name === 'Não responde').count, 1);

assert.equal(
  webhookConversionPlan({
    ctwaClid: 'x',
    autoLeadAlreadySent: true,
    addedLabels: ['Não responde', 'Desqualificado'],
    rules: [{ trigger_type: 'etiqueta', trigger_value: 'Não responde', active: true, event_name: 'Lead', id: 'skip' }],
  }).length,
  0,
);
assert.equal(
  webhookConversionPlan({
    ctwaClid: 'x',
    autoLeadAlreadySent: true,
    addedLabels: ['Não responde', 'checkout'],
    rules: [{ trigger_type: 'etiqueta', trigger_value: 'checkout', active: true, event_name: 'InitiateCheckout', id: 'keep' }],
  }).map((item) => item.event_name).join(','),
  'InitiateCheckout',
);

console.log('PASS rastreamento analysis labels');

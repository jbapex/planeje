import assert from 'node:assert/strict';
import {
  CONVERSION_EVENT_NAMES,
  addedEtiquetas,
  conversionEventLabel,
  eventPatchForName,
  extractChatLabels,
  matchConversionRule,
  normalizeTriggerText,
  paidCtwaReady,
  rulesMatchingMessage,
  rulesMatchingNewEtiquetas,
  webhookConversionPlan,
  activeJourneyEvents,
} from '../src/lib/rastreamentoConversionRules.js';

assert.equal(normalizeTriggerText(' Qualificado '), 'qualificado');
assert.equal(matchConversionRule({ trigger_type: 'etiqueta', trigger_value: 'quente', active: true }, { etiquetas: ['Quente'] }), true);
assert.equal(matchConversionRule({ trigger_type: 'etiqueta', trigger_value: 'frio', active: true }, { etiquetas: ['Quente'] }), false);
assert.equal(matchConversionRule({ trigger_type: 'mensagem', trigger_value: 'fechou', match_mode: 'contains' }, { messageText: 'Cliente fechou hoje' }), true);
assert.equal(matchConversionRule({ trigger_type: 'mensagem', trigger_value: 'fechou', active: false }, { messageText: 'fechou' }), false);
assert.deepEqual(addedEtiquetas(['a'], ['a', 'b']), ['b']);
assert.equal(rulesMatchingNewEtiquetas([{ trigger_type: 'etiqueta', trigger_value: 'b', active: true }], ['b']).length, 1);
assert.deepEqual(eventPatchForName('Purchase', { valor: 10 }), { comprou: true, valor: 10 });
assert.deepEqual(eventPatchForName('Lead'), { qualificado: true });
assert.deepEqual(eventPatchForName('InitiateCheckout'), {});
assert.equal(eventPatchForName('UnknownEvent'), null);
assert.equal(CONVERSION_EVENT_NAMES.some((item) => item.value === 'InitiateCheckout'), true);
assert.equal(conversionEventLabel('InitiateCheckout'), 'Checkout iniciado');
assert.deepEqual(extractChatLabels({ labels: [{ name: 'Qualificado' }, 'comprou'] }), ['Qualificado', 'comprou']);
assert.equal(rulesMatchingMessage([{ trigger_type: 'mensagem', trigger_value: 'fechou', active: true }], 'Cliente fechou hoje').length, 1);
assert.equal(rulesMatchingMessage([{ trigger_type: 'etiqueta', trigger_value: 'fechou', active: true }], 'Cliente fechou hoje').length, 0);
assert.equal(paidCtwaReady({ isGroup: false, ctwaClid: 'abc' }), true);
assert.equal(paidCtwaReady({ isGroup: true, ctwaClid: 'abc' }), false);
assert.equal(paidCtwaReady({ ctwaClid: '' }), false);
assert.equal(webhookConversionPlan({ ctwaClid: 'x' })[0].event_name, 'LeadSubmitted');
assert.equal(webhookConversionPlan({ ctwaClid: 'x', fromMe: true }).length, 0);
assert.equal(webhookConversionPlan({ ctwaClid: 'x', autoLeadAlreadySent: true }).length, 0);
assert.equal(
  webhookConversionPlan({
    ctwaClid: 'x',
    fromMe: true,
    messageText: 'fechou',
    rules: [{ trigger_type: 'mensagem', trigger_value: 'fechou', active: true, event_name: 'Purchase', id: 'r1' }],
  }).map((item) => item.event_name).join(','),
  'Purchase',
);
assert.equal(
  webhookConversionPlan({
    ctwaClid: 'x',
    autoLeadAlreadySent: true,
    addedLabels: ['checkout'],
    rules: [{ trigger_type: 'etiqueta', trigger_value: 'checkout', active: true, event_name: 'InitiateCheckout', id: 'r2' }],
  }).map((item) => item.event_name).join(','),
  'InitiateCheckout',
);

const journey = activeJourneyEvents([
  { active: true, event_name: 'Purchase', name: 'Compra', trigger_type: 'etiqueta', trigger_value: 'comprou' },
  { active: true, event_name: 'Lead', name: 'Lead', trigger_type: 'etiqueta', trigger_value: 'lead' },
  { active: false, event_name: 'InitiateCheckout', name: 'Checkout', trigger_type: 'etiqueta', trigger_value: 'checkout' },
  { active: true, event_name: 'QualifiedLead', name: 'Qualificado', trigger_type: 'etiqueta', trigger_value: 'qualificado' },
  { active: true, event_name: 'Lead', name: 'Lead extra', trigger_type: 'etiqueta', trigger_value: 'novo-lead' },
]);
assert.equal(journey.map((item) => item.eventName).join(','), 'Lead,QualifiedLead,Purchase');
assert.equal(journey[0].hint.includes('lead'), true);
assert.equal(journey[0].hint.includes('novo-lead'), true);
assert.equal(journey.some((item) => item.eventName === 'InitiateCheckout'), false);

console.log('PASS rastreamento conversion rules');

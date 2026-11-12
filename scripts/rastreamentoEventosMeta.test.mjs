import assert from 'node:assert/strict';
import {
  campaignContextFromTracking,
  canRetryEvento,
  capiDeliveryDetail,
  capiDeliveryState,
  capiEventKeyForLeadRow,
  capiEventShortLabel,
  capiEventSource,
  indexCapiEventsByLeadKey,
  summarizeLeadCapiEvents,
  capiInspectSnapshots,
  capiMissingFields,
  defaultEventosPeriod,
  displayEventosPhone,
  filterEventosRows,
  paginateEventosRows,
  periodUtcBounds,
  formatEventosDateBr,
  summarizeEventos,
} from '../src/lib/rastreamentoEventosMeta.js';

const period = defaultEventosPeriod(new Date('2026-09-18T15:00:00.000Z'));
assert.equal(period.until, '2026-09-18');
assert.equal(period.since, '2026-09-12');
assert.equal(periodUtcBounds('2026-09-12', '2026-09-18').from, '2026-09-12T00:00:00.000-03:00');
assert.equal(formatEventosDateBr('2026-09-13'), '13/09/2026');

assert.equal(capiEventSource('LeadSubmitted').id, 'whatsapp_automation');
assert.equal(capiEventSource('Purchase').label, 'Regra automática');
assert.equal(capiEventSource('InitiateCheckout').id, 'system');
assert.equal(capiDeliveryState({ success: true }), 'sent');
assert.equal(capiDeliveryState({ success: false, error_message: 'not_configured' }), 'blocked');
assert.equal(capiDeliveryState({ success: false, error_message: 'Meta 2804117' }), 'failed');
assert.equal(capiDeliveryDetail({ success: true }), 'Recebido pela Meta');
assert.equal(canRetryEvento({ success: false, error_message: 'network timeout' }), true);
assert.equal(canRetryEvento({ success: false, error_message: '2804117' }), false);
assert.equal(
  canRetryEvento({ event_name: 'LeadSubmitted', success: false, error_message: 'not_configured', ctwa_clid: 'abc' }),
  true,
);
assert.equal(
  canRetryEvento({ event_name: 'LeadSubmitted', success: false, error_message: '2804117', ctwa_clid: '' }),
  false,
);
assert.equal(
  canRetryEvento({ event_name: 'Purchase', success: false, error_message: 'not_configured', ctwa_clid: 'abc' }),
  false,
);

const campaign = campaignContextFromTracking({
  utm_campaign: 'Impacto',
  tracking_data: { adset_name: 'Conjunto A', ad_name: 'Criativo 1' },
});
assert.equal(campaign.campaignName, 'Impacto');
assert.equal(campaign.adSetName, 'Conjunto A');
assert.equal(displayEventosPhone('5541999998888'), '+55 (41) 99999-8888');
assert.equal(displayEventosPhone('554195926220'), '+55 (41) 9592-6220');

const missing = capiMissingFields({ success: false, error_message: 'not_configured: falta page_id' });
assert.equal(missing.includes('page_id'), true);
assert.equal(capiInspectSnapshots({ event_name: 'LeadSubmitted', ctwa_clid: 'abc' }).source.payload.ctwa_clid, 'abc');
assert.equal(capiInspectSnapshots({ event_name: 'QualifiedLead', success: true, ctwa_clid: 'x' }).request.payload.event_name, 'QualifiedLead');
assert.equal(capiInspectSnapshots({ event_name: 'QualifiedLead', success: true, ctwa_clid: 'x' }).request.payload.tem_ctwa_clid, true);

const rows = [
  { event_name: 'LeadSubmitted', success: true },
  { event_name: 'QualifiedLead', success: false, error_message: 'not_configured' },
  { event_name: 'Purchase', success: false, error_message: 'network timeout' },
];
assert.deepEqual(summarizeEventos(rows), { total: 3, sent: 1, blocked: 1, failed: 1, startedConversations: 1 });
assert.equal(filterEventosRows(rows, { status: 'blocked' }).length, 1);
assert.equal(paginateEventosRows(rows, 1, 2).items.length, 2);
assert.equal(paginateEventosRows(rows, 2, 2).page, 2);

const startedRows = [
  { id: '1', event_name: 'LeadSubmitted', success: true, contact_id: 'c1' },
  { id: '2', event_name: 'LeadSubmitted', success: true, contact_id: 'c1' },
  { id: '3', event_name: 'LeadSubmitted', success: false, contact_id: 'c2', error_message: 'network timeout' },
  { id: '4', event_name: 'Purchase', success: true, contact_id: 'c1' },
];
assert.equal(summarizeEventos(startedRows).startedConversations, 2);
assert.equal(summarizeEventos(startedRows).total, 4);
assert.equal(summarizeEventos(startedRows).sent, 3);

const todayStarted = [
  {
    id: 'a',
    event_name: 'LeadSubmitted',
    success: true,
    contact_id: 'new-1',
    contact: { first_seen_at: '2026-09-19T01:29:00.000-03:00' },
  },
  {
    id: 'b',
    event_name: 'LeadSubmitted',
    success: true,
    contact_id: 'new-2',
    contact: { first_seen_at: '2026-09-19T08:25:00.000-03:00' },
  },
  {
    id: 'c',
    event_name: 'LeadSubmitted',
    success: true,
    contact_id: 'old-1',
    contact: { first_seen_at: '2026-03-17T11:39:00.000-03:00' },
  },
];
assert.equal(
  summarizeEventos(todayStarted, { since: '2026-09-19', until: '2026-09-19' }).startedConversations,
  2,
);
assert.equal(summarizeEventos(todayStarted, { since: '2026-09-19', until: '2026-09-19' }).sent, 3);
assert.equal(
  filterEventosRows(todayStarted, {
    startedOnly: true,
    since: '2026-09-19',
    until: '2026-09-19',
  }).length,
  2,
);

assert.equal(capiEventShortLabel('LeadSubmitted'), 'Iniciada');
assert.equal(capiEventShortLabel('QualifiedLead'), 'Qualificado');
assert.equal(capiEventShortLabel('InitiateCheckout'), 'Checkout');
assert.equal(capiEventShortLabel('Purchase'), 'Compra');
assert.equal(summarizeLeadCapiEvents([]), null);

const journey = summarizeLeadCapiEvents([
  { event_name: 'LeadSubmitted', success: true, created_at: '2026-09-19T12:00:00.000Z', contact_id: 'c1' },
  { event_name: 'Purchase', success: true, created_at: '2026-09-19T13:00:00.000Z', contact_id: 'c1' },
]);
assert.equal(journey.label, 'Compra');
assert.equal(journey.delivery, 'sent');
assert.equal(journey.count, 2);

const failOnly = summarizeLeadCapiEvents([
  { event_name: 'LeadSubmitted', success: false, created_at: '2026-09-19T12:00:00.000Z', error_message: 'network timeout' },
]);
assert.equal(failOnly.label, 'Iniciada');
assert.equal(failOnly.delivery, 'failed');

const preferSuccess = summarizeLeadCapiEvents([
  { event_name: 'LeadSubmitted', success: true, created_at: '2026-09-19T12:00:00.000Z' },
  { event_name: 'Purchase', success: false, created_at: '2026-09-19T13:00:00.000Z', error_message: '2804117' },
]);
assert.equal(preferSuccess.label, 'Iniciada');
assert.equal(preferSuccess.delivery, 'sent');

const indexed = indexCapiEventsByLeadKey([
  { contact_id: 'c1', event_name: 'LeadSubmitted', success: true, created_at: '2026-09-19T12:00:00.000Z' },
  { lead_id: 'l1', event_name: 'Lead', success: true, created_at: '2026-09-19T12:01:00.000Z' },
]);
assert.equal(indexed.get('c:c1').label, 'Iniciada');
assert.equal(indexed.get('l:l1').label, 'Lead');
assert.equal(capiEventKeyForLeadRow({ id: 'c1' }), 'c:c1');
assert.equal(capiEventKeyForLeadRow({ _fromLead: true, _leadRef: { id: 'l1' }, id: 'lead-l1' }), 'l:l1');

console.log('PASS rastreamento eventos meta');

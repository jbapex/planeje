import assert from 'node:assert/strict';
import * as googlePresentation from '../src/lib/rastreamentoEventosGoogle.js';
import {
  buildGoogleClickConversionPayload,
  extractGclid,
  shouldSkipGoogleComercialWithoutMapping,
} from '../src/lib/googleConversionsPayload.js';
import {
  canRetryGoogleEvento,
  googleDeliveryState,
  summarizeGoogleEventos,
} from '../src/lib/rastreamentoEventosGoogle.js';

assert.equal(extractGclid(null), null);
assert.equal(extractGclid({}), null);
assert.equal(extractGclid({ gclid: '  abc123  ' }), 'abc123');
assert.equal(extractGclid({ gClid: 'xyz' }), 'xyz');

const payload = buildGoogleClickConversionPayload({
  clienteId: 'c1',
  contactId: 'ct1',
  gclid: 'gclid-1',
  eventName: 'LeadSubmitted',
});
assert.equal(payload.action, 'upload-click-conversion');
assert.equal(payload.gclid, 'gclid-1');
assert.equal(payload.eventName, 'LeadSubmitted');
assert.equal(payload.value, undefined);

const purchase = buildGoogleClickConversionPayload({
  clienteId: 'c1',
  gclid: 'gclid-2',
  eventName: 'Purchase',
  value: 150,
});
assert.equal(purchase.value, 150);
assert.equal(purchase.currencyCode, 'BRL');

assert.equal(
  shouldSkipGoogleComercialWithoutMapping('QualifiedLead', {
    conversions_enabled: true,
    conv_action_qualified: null,
  }),
  true,
);
assert.equal(
  shouldSkipGoogleComercialWithoutMapping('QualifiedLead', {
    conversions_enabled: true,
    conv_action_qualified: 'customers/1/conversionActions/2',
  }),
  false,
);
assert.equal(
  shouldSkipGoogleComercialWithoutMapping('Purchase', {
    conversions_enabled: false,
    conv_action_purchase: 'customers/1/conversionActions/3',
  }),
  true,
);
assert.equal(
  shouldSkipGoogleComercialWithoutMapping('LeadSubmitted', {
    conversions_enabled: true,
    conv_action_lead: '',
  }),
  true,
);

assert.equal(googleDeliveryState({ success: true }), 'sent');
assert.equal(
  googleDeliveryState({ success: false, error_message: 'not_configured: conv_action_lead' }),
  'blocked',
);
assert.equal(
  googleDeliveryState({ success: false, error_message: 'network timeout' }),
  'failed',
);
assert.equal(canRetryGoogleEvento({ success: false, error_message: 'fetch failed' }), true);
assert.equal(canRetryGoogleEvento({ success: false, error_message: 'not_configured' }), false);
assert.equal(canRetryGoogleEvento({ success: true, error_message: '' }), false);
const pending = {success:false,google_response:{api:'data_manager_v1',phase:'processing',requestId:'fixture'}};
assert.equal(googleDeliveryState(pending),'pending');
assert.equal(canRetryGoogleEvento(pending),false);
assert.equal(googleDeliveryState({success:false,error_message:'DATAMANAGER_REAUTHORIZE: Autorize novamente'}),'blocked');
assert.equal(canRetryGoogleEvento({success:false,event_name:'LeadSubmitted',error_message:'New integrations must use Data Manager API'}),true);
assert.equal(canRetryGoogleEvento({success:false,event_name:'Purchase',error_message:'New integrations must use Data Manager API'}),false);
assert.equal(googleDeliveryState({success:false,google_response:{api:'data_manager_v1',phase:'uncertain'}}),'uncertain');
const missingSourceFailure={success:false,event_name:'LeadSubmitted',error_message:'HTTP 400: There was a problem with the request.',google_response:{api:'data_manager_v1',phase:'failed',response:{error:{details:[{
  fieldViolations:[{field:'events.events[0].event_source',reason:'REQUIRED_FIELD_MISSING'}],
}]}}}};
assert.equal(canRetryGoogleEvento(missingSourceFailure),true,'show retry for the specific event_source omission');
assert.equal(canRetryGoogleEvento({...missingSourceFailure,success:true}),false);
assert.equal(canRetryGoogleEvento({...missingSourceFailure,google_response:{...missingSourceFailure.google_response,phase:'processing'}}),false);
assert.equal(canRetryGoogleEvento({...missingSourceFailure,google_response:{...missingSourceFailure.google_response,response:{error:{details:[{
  fieldViolations:[{field:'events.events[0].event_timestamp',reason:'REQUIRED_FIELD_MISSING'}],
}]}}}}),false,'other invalid requests must not become retryable');

const summary = summarizeGoogleEventos([
  { success: true },
  { success: false, error_message: 'not_configured' },
  { success: false, error_message: 'timeout' },
  pending,
]);
assert.deepEqual(summary, { sent: 1, pending: 1, blocked: 1, failed: 1, total: 4 });

assert.equal(typeof googlePresentation.groupGoogleEventos, 'function', 'Google attempts need one presentation group per conversion');
const {groupGoogleEventos}=googlePresentation;
const eventBase={cliente_id:'client-a',gclid:'same-click',event_name:'LeadSubmitted',conversion_action:'customers/1234567890/conversionActions/321',success:false};
const first={...eventBase,id:'first',contact_id:'contact-a',created_at:'2026-10-27T10:00:00Z',error_message:'network timeout'};
const retry={...eventBase,id:'retry',created_at:'2026-10-27T11:00:00Z',google_response:{api:'data_manager_v1',phase:'processing',retryOf:'first',event:{eventTimestamp:'2026-10-27T10:00:00Z'}}};
const raw=[retry,first],unchanged=structuredClone(raw);
let groups=groupGoogleEventos(raw);
assert.equal(groups.length,1);assert.equal(groups[0].attempts.length,2);assert.equal(groups[0].current.id,'retry');
assert.equal(groups[0].contactId,'contact-a');assert.equal(groups[0].firstAt,first.created_at);assert.equal(groups[0].lastAt,retry.created_at);
assert.deepEqual(summarizeGoogleEventos(groups.map(group=>group.current)),{sent:0,pending:1,blocked:0,failed:0,total:1});
assert.deepEqual(raw,unchanged,'grouping must not mutate stored attempts');
const rejected={...eventBase,id:'rejected',created_at:'2026-10-27T12:00:00Z',error_message:'network timeout',google_response:{api:'data_manager_v1',phase:'failed',retryOf:'retry'}};
assert.equal(groupGoogleEventos([first,retry,rejected])[0].current.id,'rejected','superseded processing must not hide the new failure');
assert.equal(groupGoogleEventos([{...first,success:true},rejected])[0].current.id,'first','a confirmed conversion must not become retryable again');
assert.equal(groupGoogleEventos([first,{...retry,event_name:'Lead'}]).length,1,'legacy Lead and LeadSubmitted share the conversion identity');
assert.equal(groupGoogleEventos([first,{...retry,gclid:'same-click-other'}]).length,2,'full click identity is required');
assert.equal(groupGoogleEventos([first,{...retry,cliente_id:'client-b'}]).length,2,'clients must stay isolated');
assert.equal(groupGoogleEventos([first,{...retry,conversion_action:'customers/1234567890/conversionActions/322'}]).length,2,'different conversion actions remain separate');
assert.equal(groupGoogleEventos([first,{...retry,event_name:'Purchase'}]).length,2,'event types must stay separate');
assert.equal(groupGoogleEventos([{...first,conversion_action:null},{...retry,conversion_action:null}]).length,2,'incomplete identities cannot be guessed');
assert.equal(groupGoogleEventos([first,first,retry])[0].attempts.length,2,'one log row cannot count twice');
groups=groupGoogleEventos([first,{...retry,contact_id:'contact-b'}]);
assert.equal(groups[0].identityConflict,true);assert.equal(groups[0].contactId,null,'conflicting contacts must not be silently selected');
assert.equal(groupGoogleEventos([{...retry,id:'z'},retry])[0].current.id,'z','same timestamps have a stable tie-breaker');
assert.deepEqual(groupGoogleEventos([]),[]);
console.log('googleConversions.test.mjs ok: event grouping, identity, current result and retry guards');

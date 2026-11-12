import assert from 'node:assert/strict';
import {
  adIdFromTracking,
  buildLeadFicha,
  buildLeadJourney,
  buildLeadJourneyTrack,
  creativeFromTracking,
  ctwaClidFromLeadSources,
  leadSubmittedSendState,
  nameLooksLikePhone,
  shortenCtwaClid,
} from '../src/lib/rastreamentoLeadFicha.js';

assert.equal(ctwaClidFromLeadSources({ tracking_data: { ctwaClid: 'abc123' } }), 'abc123');
assert.equal(ctwaClidFromLeadSources({}, {}, { ctwa_clid: 'from-event' }), 'from-event');
assert.equal(adIdFromTracking({ source_id: '120123' }), '120123');
assert.equal(creativeFromTracking({ thumbnailURL: 'https://img/ad.jpg' }).thumbnailUrl, 'https://img/ad.jpg');
assert.equal(
  creativeFromTracking({
    thumbnailURL: 'https://pps.whatsapp.net/v/old.jpg',
    thumbnail_stored_url: 'https://planeje.jbapex.com.br/storage/v1/object/public/ad-thumbnails/ad_1.jpg',
  }).thumbnailUrl,
  'https://planeje.jbapex.com.br/storage/v1/object/public/ad-thumbnails/ad_1.jpg?v=q2'
);
assert.equal(nameLooksLikePhone('554195926220'), true);
assert.equal(nameLooksLikePhone('Maria'), false);
assert.equal(shortenCtwaClid('clid-curto'), 'clid-curto');
assert.equal(
  shortenCtwaClid('AfgyVuapD_4idj6B7IE9XPSHytXdh1YdDIUbu4KJo283sh2nSeRRqj7j6Y4FUixF'),
  'AfgyVuapD_4i…6Y4FUixF'
);

const journey = buildLeadJourney([
  { id: '2', event_name: 'Purchase', success: false, error_message: 'not_configured', created_at: '2026-09-19T12:00:00.000Z' },
  { id: '1', event_name: 'LeadSubmitted', success: true, created_at: '2026-09-19T11:00:00.000Z' },
]);
assert.equal(journey.map((item) => item.eventName).join(','), 'LeadSubmitted,Purchase');
assert.equal(journey[0].label, 'Conversa iniciada');
assert.equal(journey[1].statusLabel, 'Bloqueado');

const track = buildLeadJourneyTrack([
  { id: '1', event_name: 'LeadSubmitted', success: true, created_at: '2026-09-19T11:00:00.000Z' },
]);
assert.equal(track.steps.map((step) => `${step.shortLabel}:${step.reached ? '1' : '0'}`).join(','), 'Iniciada:1,Lead:0,Qualificado:0,Checkout:0,Compra:0');

const ficha = buildLeadFicha({
  contact: {
    sender_name: 'Maria',
    phone: '5541999998888',
    origin_source: 'meta_ads',
    tracking_data: {
      ctwaClid: 'clid-1',
      utm_campaign: 'Impacto',
      adset_name: 'Conjunto A',
      ad_name: 'Criativo 1',
      thumbnailURL: 'https://img/ad.jpg',
    },
  },
  events: [{ id: '1', event_name: 'LeadSubmitted', success: true, created_at: '2026-09-19T11:00:00.000Z' }],
});
assert.equal(ficha.name, 'Maria');
assert.equal(ficha.track.steps[0].reached, true);
const namedFromContact = buildLeadFicha({
  contact: { sender_name: 'Maria', phone: '554192707975', tracking_data: { ctwaClid: 'x' } },
  lead: { nome: '554192707975', whatsapp: '554192707975' },
});
assert.equal(namedFromContact.name, 'Maria');
const phoneNamed = buildLeadFicha({
  contact: { sender_name: '554195926220', phone: '554195926220', tracking_data: { ctwaClid: 'x' } },
});
assert.equal(phoneNamed.name, '+55 (41) 9592-6220');
assert.equal(ficha.origin, 'Meta Ads');
assert.equal(ficha.attribution.campaignName, 'Campanha não resolvida');
assert.equal(ficha.utm.fields.find((field) => field.key === 'utm_campaign').value, 'Impacto');
assert.equal(ficha.attribution.adSetName, 'Conjunto A');
assert.equal(ficha.creative.title, 'Criativo 1');
assert.equal(ficha.journey[0].label, 'Conversa iniciada');
assert.equal(ficha.leadSubmitted.canSend, false);
assert.equal(ficha.leadSubmitted.hasSuccess, true);

const messageLinked = buildLeadFicha({ contact: {
  origin_source: 'site', utm_source: 'Linktree', utm_medium: 'clique', utm_campaign: 'visitas_ao_perfil',
  tracking_data: { planeje_link_id: 'link-1', planeje_link_match_method: 'initial_message', owner_phone: '5511987654321' },
} });
assert.equal(messageLinked.origin, 'Linktree');
assert.equal(messageLinked.showCapiJourney, false);
assert.equal(messageLinked.showCreative, false);
assert.equal(messageLinked.showCampaignContext, false);
assert.equal(messageLinked.attribution.clickId, 'Não resolvido');
assert.equal(messageLinked.utm.fields.length, 5);
assert.deepEqual(messageLinked.utm.fields.map((field) => field.value), ['Linktree', 'clique', 'visitas_ao_perfil', '', '']);
assert.match(messageLinked.utm.note, /mensagem do link/);
const splitSources = buildLeadFicha({ contact: { utm_source: ' ', tracking_data: { utm_source: 'instagram' } },
  lead: { utm_term: 'noivas', tracking_data: { utm_content: 'video' } } });
assert.deepEqual(splitSources.utm.fields.map((field) => field.value), ['instagram', '', '', 'video', 'noivas']);
const realAd = buildLeadFicha({ contact: { utm_medium: 'cpc', tracking_data: { ctwaClid: 'real-click',
  meta_ad_details: { ad: { name: 'Anúncio oficial', campaign: { name: 'Campanha oficial' }, adset: { name: 'Conjunto oficial' } } } } } });
assert.equal(realAd.attribution.campaignName, 'Campanha oficial');
assert.equal(realAd.attribution.adSetName, 'Conjunto oficial');
assert.equal(realAd.utm.fields[1].value, 'cpc');
assert.equal(realAd.showCampaignContext, true);
assert.equal(buildLeadFicha({ contact: {} }).utm.hasValues, false);

const pending = leadSubmittedSendState({
  contact: { tracking_data: { ctwaClid: 'clid-1' } },
  events: [],
});
assert.equal(pending.canSend, true);
assert.equal(pending.label, 'Enviar conversa iniciada');
const failed = leadSubmittedSendState({
  contact: { tracking_data: { ctwaClid: 'clid-1' } },
  events: [{ event_name: 'LeadSubmitted', success: false }],
});
assert.equal(failed.canSend, true);
assert.equal(failed.label, 'Reenviar conversa iniciada');
assert.equal(leadSubmittedSendState({ contact: {}, events: [] }).canSend, false);

assert.equal(
  buildLeadFicha({ contact: { sender_name: 'Maria', profile_pic_url: 'https://img/lead.jpg' } }).photoUrl,
  'https://img/lead.jpg'
);

console.log('PASS rastreamento lead ficha');

// A custom source labels site traffic without replacing paid attribution or changing stored fields.
for (const contact of [
  { origin_source: 'site', utm_source: 'chatgpt.com' },
  { origin_source: 'site', tracking_data: { utm_source: 'chatgpt.com' } },
  { origin_source: 'site', utm_source: ' ', tracking_data: { utm_source: ' chatgpt.com ' } },
]) {
  const before = JSON.stringify(contact);
  const custom = buildLeadFicha({ contact });
  assert.equal(custom.origin, 'chatgpt.com');
  assert.equal(custom.originKind, 'site');
  assert.equal(custom.showCapiJourney, false);
  assert.equal(custom.showCreative, false);
  assert.equal(JSON.stringify(contact), before);
}
assert.equal(buildLeadFicha({ lead: { origin_source: 'site', utm_source: 'Newsletter' } }).origin, 'Newsletter');
assert.equal(buildLeadFicha({ contact: { origin_source: 'site', utm_source: { invalid: true } } }).origin, 'Site');
assert.equal(buildLeadFicha({ contact: { origin_source: 'site', utm_source: ' ' } }).origin, 'Site');
assert.equal(buildLeadFicha({ contact: { origin_source: 'google_ads', utm_source: 'chatgpt.com' } }).origin, 'Google Ads');
assert.equal(buildLeadFicha({ contact: { origin_source: 'meta_ads', utm_source: 'chatgpt.com' } }).origin, 'Meta Ads');
console.log('PASS custom UTM source labels for site traffic; paid origins and attribution unchanged');

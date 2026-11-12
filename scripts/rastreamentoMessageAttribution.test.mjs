import assert from 'node:assert/strict';
import { findInitialMessageLink, lookupInitialMessageLink, hasStoredContactAttribution,
  mergeContactAttributionMetadata, trackingFromInitialMessageLink } from '../supabase/functions/_shared/rastreamentoMessageAttribution.js';

const message = 'Olá! Vim do perfil e gostaria de agendar uma visita. [Não apagar]';
const link = { id: 'link-one', cliente_id: 'client-one', is_active: true, whatsapp_config_id: 'channel-one',
  initial_message: message, default_origin: 'site', default_utm_source: 'Linktree', default_utm_medium: 'clique',
  default_utm_campaign: 'visitas_ao_perfil', default_utm_content: null, default_utm_term: null };
const options = { message, clienteId: 'client-one', whatsappConfigId: 'channel-one' };
assert.equal(findInitialMessageLink([link], options), link);
assert.equal(findInitialMessageLink([link], { ...options, message: message.toUpperCase().replaceAll(' ', '\n') }), link);
assert.equal(findInitialMessageLink([link, { ...link, id: 'duplicate' }], options), null);
assert.equal(findInitialMessageLink([{ ...link, is_active: false }], options), null);
assert.equal(findInitialMessageLink([{ ...link, cliente_id: 'other-client' }], options), null);
assert.equal(findInitialMessageLink([link], { ...options, whatsappConfigId: 'other-channel' }), null);
assert.equal(findInitialMessageLink([link], { ...options, whatsappConfigId: null }), null);
assert.equal(findInitialMessageLink([link], { ...options, message: 'Vim do perfil' }), null);
assert.equal(findInitialMessageLink([link], { ...options, message: message + ' mais uma frase' }), null);
assert.equal(findInitialMessageLink([link], { ...options, message: message + ' Código PJ-ABC123' }), null);
assert.equal(findInitialMessageLink([link], { ...options, fromMe: true }), null);
assert.equal(findInitialMessageLink([link], { ...options, isGroup: true }), null);
const manual = { ...link, whatsapp_config_id: null, destination_phone: '5511987654321' };
assert.equal(findInitialMessageLink([manual], { ...options, ownerPhone: '5511987654321:15@s.whatsapp.net' }), manual);
assert.equal(findInitialMessageLink([manual], { ...options, ownerPhone: '5511999999999' }), null);
assert.equal(hasStoredContactAttribution({ origin_source: 'nao_identificado', tracking_data: { owner_phone: '5511', lead_name: 'Ana', analysis_labels: ['Teste'] } }), false);
for (const tracking_data of [{ ctwaClid: 'ctwa' }, { gclid: 'google' }, { fbclid: 'fb' }, { planeje_link_id: 'link' }, { utm_source: 'Linktree' }]) {
  assert.equal(hasStoredContactAttribution({ tracking_data }), true);
}
assert.equal(hasStoredContactAttribution({ utm_source: 'instagram' }), true);
const metadata = { tracking_data: { owner_phone: '5511', analysis_labels: ['Teste'] } };
const attributed = trackingFromInitialMessageLink(link, metadata.tracking_data, { messageId: 'msg-one', recordedAt: '2026-10-14T15:00:00Z' });
assert.equal(attributed.utm_source, 'Linktree');
assert.equal(attributed.planeje_link_match_method, 'initial_message');
assert.equal(attributed.planeje_link_matched_message_id, 'msg-one');
assert.equal(attributed.planeje_click_id, undefined);
assert.equal(attributed.planeje_match_code, undefined);
assert.equal(attributed.ctwaClid, undefined);
assert.deepEqual(mergeContactAttributionMetadata(metadata, attributed).analysis_labels, ['Teste']);
assert.equal(mergeContactAttributionMetadata(metadata, attributed).utm_campaign, 'visitas_ao_perfil');
const existingMeta = { origin_source: 'meta_ads', tracking_data: { ctwaClid: 'keep', ad_name: 'Anúncio' } };
assert.deepEqual(mergeContactAttributionMetadata(existingMeta, attributed), existingMeta.tracking_data);

function mockQuery(data, error = null) {
  const filters = [];
  return { filters, from(table) { assert.equal(table, 'cliente_rastreamento_links'); const q = {
    select() { return q; }, eq(key, value) { filters.push([key, value]); return q; },
    limit(size) { assert.equal(size, 201); return Promise.resolve({ data, error }); },
  }; return q; } };
}
const query = mockQuery([link]);
assert.equal(await lookupInitialMessageLink(query, options), link);
assert.deepEqual(query.filters, [['cliente_id', 'client-one'], ['is_active', true]]);
assert.equal(await lookupInitialMessageLink(mockQuery([link], { message: 'denied' }), options), null);
assert.equal(await lookupInitialMessageLink(mockQuery(Array(201).fill(link)), options), null);
assert.equal(await lookupInitialMessageLink(mockQuery([]), { ...options, fromMe: true }), null);
console.log('PASS rastreamento message attribution');

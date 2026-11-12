import assert from 'node:assert/strict';
import {
  buildWaMeRedirectUrl,
  buildWaMeMessageText,
  extractMatchCode,
  generateMatchCode,
  hasCtwaTrackingSignal,
  isCtwaStyleTracking,
  isGoogleAdsContactForStats,
  isSiteContactForStats,
  siteOriginLabel,
  publicTrackableLinkUrl,
  mergeClickUtmWithLinkDefaults,
  resolveOriginFromClickParams,
  siteWhatsappButtonHtml,
  siteWhatsappRewriteScript,
  trackingFromMatchedClick,
} from '../src/lib/rastreamentoTrackableLink.js';
import { buildLeadFicha, resolveLeadFichaOrigin } from '../src/lib/rastreamentoLeadFicha.js';

assert.equal(extractMatchCode('Olá! Código PJ-AB12CD'), 'PJ-AB12CD');
assert.equal(extractMatchCode('pj-ab12cd no meio'), 'PJ-AB12CD');
assert.equal(extractMatchCode('sem codigo'), null);

const code = generateMatchCode();
assert.match(code, /^PJ-[A-Z0-9]{6}$/);

assert.equal(resolveOriginFromClickParams({ gclid: 'g.1' }), 'google_ads');
assert.equal(resolveOriginFromClickParams({ fbclid: 'f.1' }), 'meta_ads');
assert.equal(resolveOriginFromClickParams({ utm_source: 'google' }), 'google_ads');
assert.equal(resolveOriginFromClickParams({ utm_source: 'facebook' }), 'meta_ads');
assert.equal(resolveOriginFromClickParams({ default_origin: 'site' }), 'site');
assert.equal(resolveOriginFromClickParams({}), 'site');

assert.equal(siteOriginLabel(' chatgpt.com '), 'chatgpt.com');
assert.equal(siteOriginLabel(' ', 'Newsletter'), 'Newsletter');
assert.equal(siteOriginLabel(null, { invalid: true }, 'Parceiro'), 'Parceiro');
assert.equal(siteOriginLabel('', null, 123), 'Site');

assert.equal(
  buildWaMeRedirectUrl('5541999998888', 'PJ-ABC123'),
  `https://wa.me/5541999998888?text=${encodeURIComponent('Olá! Código PJ-ABC123')}`
);
assert.equal(
  buildWaMeRedirectUrl('5541999998888', 'PJ-ABC123', {
    initialMessage: 'Olá, vim pelo anúncio.',
    appendMatchCode: true,
  }),
  `https://wa.me/5541999998888?text=${encodeURIComponent('Olá, vim pelo anúncio.\n\nCódigo PJ-ABC123')}`
);
assert.equal(buildWaMeMessageText('PJ-ZZZZZZ', { initialMessage: '', appendMatchCode: true }), 'Olá! Código PJ-ZZZZZZ');
assert.ok(buildWaMeRedirectUrl('5541999998888', 'PJ-ABC123', { openMode: 'app' }).startsWith('whatsapp://send?'));
assert.ok(buildWaMeRedirectUrl('5541999998888', 'PJ-ABC123', { openMode: 'web' }).startsWith('https://web.whatsapp.com/send?'));
assert.match(siteWhatsappButtonHtml('https://planeje.jbapex.com.br/r/abc'), /href="https:\/\/planeje\.jbapex\.com\.br\/r\/abc"/);
assert.match(siteWhatsappRewriteScript('https://planeje.jbapex.com.br/r/abc'), /planeje_trk/);
assert.match(siteWhatsappRewriteScript('https://planeje.jbapex.com.br/r/abc'), /gclid/);
assert.match(siteWhatsappRewriteScript('https://planeje.jbapex.com.br/r/abc'), /PLANEJE_LINK/);

assert.equal(publicTrackableLinkUrl('https://planeje.jbapex.com.br', 'abc12345'), 'https://planeje.jbapex.com.br/r/abc12345');
assert.equal(
  publicTrackableLinkUrl('https://planeje.jbapex.com.br', 'abc12345', {
    default_utm_source: 'facebook',
    default_utm_campaign: 'casas',
  }),
  'https://planeje.jbapex.com.br/r/abc12345?utm_source=facebook&utm_campaign=casas'
);
assert.deepEqual(
  mergeClickUtmWithLinkDefaults({ utm_source: null }, { default_utm_source: 'facebook', default_utm_campaign: 'x' }),
  { utm_source: 'facebook', utm_medium: null, utm_campaign: 'x', utm_content: null, utm_term: null }
);
assert.equal(
  mergeClickUtmWithLinkDefaults({ utm_source: 'instagram' }, { default_utm_source: 'facebook' }).utm_source,
  'instagram'
);

assert.equal(hasCtwaTrackingSignal({ ctwaClid: 'x' }), true);
assert.equal(hasCtwaTrackingSignal({ fbclid: 'y' }), false);
assert.equal(isCtwaStyleTracking({ source_id: '120' }), true);
assert.equal(isCtwaStyleTracking({ fbclid: 'y', planeje_match_code: 'PJ-AAAAAA' }), false);

const merged = trackingFromMatchedClick({
  id: 'click-1',
  link_id: 'link-1',
  match_code: 'PJ-AAAAAA',
  gclid: 'gclid-1',
  origin_resolved: 'google_ads',
});
assert.equal(merged.gclid, 'gclid-1');
assert.equal(merged.planeje_match_code, 'PJ-AAAAAA');

assert.equal(isGoogleAdsContactForStats({ origin_source: 'google_ads' }), true);
assert.equal(isSiteContactForStats({ origin_source: 'site' }), true);
assert.equal(isSiteContactForStats({ origin_source: 'google_ads' }), false);

const googleFicha = buildLeadFicha({
  contact: {
    sender_name: 'Ana',
    phone: '5541999998888',
    origin_source: 'google_ads',
    utm_campaign: 'Campanha G',
    utm_medium: 'cpc',
    utm_content: 'anuncio1',
    tracking_data: { gclid: 'gclid-xyz', utm_campaign: 'Campanha G', planeje_match_code: 'PJ-ZZZZZZ' },
  },
});
assert.equal(googleFicha.origin, 'Google Ads');
assert.equal(googleFicha.originKind, 'google');
assert.equal(googleFicha.showCapiJourney, false);
assert.equal(googleFicha.showCreative, false);
assert.equal(googleFicha.attribution.clickId, 'gclid-xyz');
assert.equal(googleFicha.attribution.campaignName, 'Campanha não resolvida');
assert.equal(googleFicha.utm.fields.find((field) => field.key === 'utm_campaign').value, 'Campanha G');

const siteFicha = buildLeadFicha({
  contact: {
    sender_name: 'Bia',
    origin_source: 'site',
    tracking_data: { planeje_match_code: 'PJ-SITE01', planeje_link_origin: 'site' },
  },
});
assert.equal(siteFicha.origin, 'Site');
assert.equal(siteFicha.showCapiJourney, false);

const ctwaFicha = buildLeadFicha({
  contact: {
    sender_name: 'Clara',
    origin_source: 'meta_ads',
    tracking_data: { ctwaClid: 'clid-1', source_id: '120', thumbnailURL: 'https://img/a.jpg' },
  },
});
assert.equal(ctwaFicha.origin, 'Meta Ads');
assert.equal(ctwaFicha.showCapiJourney, true);
assert.equal(ctwaFicha.showCreative, true);

const metaSite = resolveLeadFichaOrigin(
  { origin_source: 'meta_ads' },
  null,
  { fbclid: 'fb', planeje_match_code: 'PJ-META01', planeje_link_id: 'l1' },
  ''
);
assert.equal(metaSite.showCapi, false);
assert.equal(metaSite.showCreative, false);

console.log('PASS rastreamento trackable link');

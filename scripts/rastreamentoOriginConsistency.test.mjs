import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { isMetaAdsContactForStats, isMetaAdsLeadForStats } from '../src/lib/contactFromWebhookPayload.js';
import { isGoogleAdsContactForStats, isSiteContactForStats, recordedOriginSource, siteOriginLabel } from '../src/lib/rastreamentoTrackableLink.js';
import { buildLeadFicha } from '../src/lib/rastreamentoLeadFicha.js';
import { buildSiteReportRows, buildGoogleReportRows } from '../src/lib/crmRelatorioGoogle.js';
import { selectRelatorioTrackingContacts } from '../src/lib/crmRelatorioMetaTracking.js';

const linktree = {
  id: 'source-fixture', phone: '5511000000000', origin_source: 'meta_ads',
  utm_source: 'Linktree', utm_medium: 'cpc',
  first_seen_at: '2026-10-28T15:00:00Z', last_message_at: '2026-10-28T16:00:00Z',
  tracking_data: { planeje_link_id: 'example', planeje_link_origin: 'meta_ads',
    planeje_link_match_method: 'initial_message', utm_source: 'Linktree' },
};

const cases = [
  [linktree, 'meta_ads', 'Meta Ads'],
  [{ ...linktree, utm_source: ' ', tracking_data: { ...linktree.tracking_data, utm_source: ' Linktree ' } }, 'meta_ads', 'Meta Ads'],
  [{ origin_source: 'site', utm_source: 'chatgpt.com', utm_campaign: 'Instagram outubro', tracking_data: { fbclid: 'later-click' } }, 'site', 'chatgpt.com'],
  [{ ...linktree, tracking_data: { ...linktree.tracking_data, ctwa_clid: 'original-ad' } }, 'meta_ads', 'Meta Ads'],
  [{ ...linktree, origin_source: 'google_ads', tracking_data: { ...linktree.tracking_data, gclid: 'original-google' } }, 'google_ads', 'Google Ads'],
  [{ origin_source: 'meta_ads', utm_source: 'chatgpt.com' }, 'meta_ads', 'Meta Ads'],
];

for (const [row, origin, label] of cases) {
  const before = JSON.stringify(row);
  assert.equal(recordedOriginSource(row), origin, label);
  assert.equal(isMetaAdsContactForStats(row), origin === 'meta_ads', label);
  assert.equal(isGoogleAdsContactForStats(row), origin === 'google_ads', label);
  assert.equal(isSiteContactForStats(row), origin === 'site', label);
  assert.equal(buildLeadFicha({ contact: row }).origin, label);
  assert.equal(JSON.stringify(row), before, 'presentation must preserve stored attribution');
}

const lead = { ...linktree, origem: 'Meta Ads', whatsapp: linktree.phone };
const calendar = readFileSync(new URL('../src/components/pages/ClienteCalendarioPage.jsx', import.meta.url), 'utf8');
const isUntracked = vm.runInNewContext(`(${calendar.slice(calendar.indexOf('function isUntracked('), calendar.indexOf('function monthTitle('))})`, {
  isMetaAdsContactForStats, isSiteContactForStats,
});
assert.equal(isUntracked(linktree), false, 'tracked Linktree remains visible when untracked contacts are hidden');
assert.equal(isUntracked({ origin_source: 'nao_identificado' }), true);
const legacyGoogle = { origem: 'Google Ads', utm_source: 'Linktree', tracking_data: { planeje_link_id: 'example' } };
assert.equal(recordedOriginSource(legacyGoogle, true), 'google_ads', 'legacy Google origin precedes the Linktree compatibility rule');
assert.equal(buildLeadFicha({ lead: legacyGoogle }).origin, 'Google Ads');
assert.equal(isMetaAdsLeadForStats(lead), true);
assert.equal(isMetaAdsLeadForStats({ origem: 'Meta Ads', tracking_data: { planeje_link_origin: 'site' } }), false);
assert.equal(isMetaAdsContactForStats({ origin_source: 'nao_identificado', utm_source: 'facebook' }), true, 'legacy inference remains available');
assert.equal(isMetaAdsLeadForStats({ origem: 'Meta Ads' }), true);

// Execute the page's actual mappings so filters, displayed rows and CSV cannot diverge.
const page = readFileSync(new URL('../src/components/pages/ContatosPage.jsx', import.meta.url), 'utf8');
function section(start, end) {
  const from = page.indexOf(start), to = page.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, `page section: ${start}`);
  return page.slice(from, to);
}
const pageContext = {
  isMetaAdsContactForStats, isMetaAdsLeadForStats, isMetaAdsLead: isMetaAdsLeadForStats,
  isGoogleAdsContactForStats, isSiteContactForStats, recordedOriginSource, siteOriginLabel,
  ORIGIN_FILTER_ALL: 'todos', ORIGIN_FILTER_META: 'meta_ads', ORIGIN_FILTER_GOOGLE: 'google_ads',
  ORIGIN_FILTER_SITE: 'site', ORIGIN_FILTER_NAO_IDENT: 'nao_identificado',
};
const mappings = vm.runInNewContext(`
  ${section('function contactMatchesOriginFilter(', '/** Filtro de período:')}
  ${section('function leadFirstSeenIso(', 'function computeLeadsOnlyInFunnelFromContacts(')}
  ${section('function mapLeadsToExportDisplayRows(', '/**\n * Converte um valor de timestamp')}
  function displayRows(filteredLeadsOnlyInFunnel) {
    ${section('    const leadRows = filteredLeadsOnlyInFunnel.map(', '    return [\n      ...filteredContacts.map(')}
    return leadRows;
  }
  ({ displayRows, mapLeadsToExportDisplayRows, leadMatchesOriginFilter, contactMatchesOriginFilter, originBadgeForContact });
`, pageContext);
const legacySite = { id: 'legacy-site', origem: 'Site', utm_source: 'Newsletter', tracking_data: { gclid: 'later-google' } };
for (const [row, origin, label] of [[legacySite, 'site', 'Newsletter'], [legacyGoogle, 'google_ads', 'Google Ads'], [lead, 'meta_ads', 'Meta Ads']]) {
  const before = JSON.stringify(row);
  assert.equal(mappings.leadMatchesOriginFilter(row, origin, isMetaAdsLeadForStats), true);
  for (const mapped of [mappings.displayRows([row])[0], mappings.mapLeadsToExportDisplayRows([row])[0]]) {
    assert.equal(mapped.origin_source, origin, 'the first known origin survives live and CSV mapping');
    assert.equal(mappings.originBadgeForContact(mapped, isMetaAdsContactForStats(mapped)).label, label);
    assert.equal(mappings.contactMatchesOriginFilter(mapped, origin), true);
    assert.equal(buildLeadFicha({ contact: mapped }).origin, label);
  }
  assert.equal(JSON.stringify(row), before);
}

const period = { since: '2026-10-28', until: '2026-10-28' };
assert.equal(selectRelatorioTrackingContacts([linktree], () => true).length, 1);
assert.equal(buildGoogleReportRows([linktree], [], period).rows.length, 0);
assert.equal(buildSiteReportRows([linktree], [], period).rows.length, 0);
console.log('PASS origin consistency: Linktree, custom site sources, original paid attribution, legacy fallback and reports');

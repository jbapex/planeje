import assert from 'node:assert/strict';
import {
  addRelatorioTrackingToGroup,
  emptyRelatorioGroup,
  reportCampaignName,
  selectRelatorioTrackingContacts,
  summarizeRelatorioTracking,
} from '../src/lib/crmRelatorioMetaTracking.js';
import { bumpAnalysisCounts } from '../src/lib/rastreamentoAnalysisLabels.js';

assert.equal(
  reportCampaignName({ utm_campaign: '[27/08][WHATSAPP]' }),
  '[27/08][WHATSAPP]'
);
assert.equal(
  reportCampaignName({ tracking_data: { campaign_name: 'Editorial' } }),
  'Editorial'
);

const contacts = [
  {
    origin_source: 'meta_ads',
    first_seen_at: '2026-09-10T12:00:00.000Z',
    last_message_at: '2026-09-19T12:00:00.000Z',
    utm_campaign: 'Campanha A',
    qualificado: true,
  },
  {
    origin_source: 'meta_ads',
    first_seen_at: '2026-08-01T12:00:00.000Z',
    last_message_at: '2026-09-19T12:00:00.000Z',
    utm_campaign: 'Campanha A',
    qualificado: false,
  },
  {
    origin_source: 'organico',
    first_seen_at: '2026-09-10T12:00:00.000Z',
    utm_campaign: 'Orgânico',
    qualificado: true,
  },
];

const inSeptember = (row) => String(row.first_seen_at || '').startsWith('2026-09');
const tracking = selectRelatorioTrackingContacts(contacts, inSeptember);
assert.equal(tracking.length, 1);
assert.deepEqual(summarizeRelatorioTracking(tracking), { realConversations: 1, qualificados: 1 });

const group = addRelatorioTrackingToGroup(null, tracking[0]);
assert.equal(group.campaignName, 'Campanha A');
assert.equal(group.realConversations, 1);
assert.equal(group.qualificados, 1);
assert.equal(group.leads, 0);
assert.equal(group.naoResponde, 0);
assert.equal(group.desqualificado, 0);

const campaign = emptyRelatorioGroup('Campanha A');
bumpAnalysisCounts(campaign, {
  _contactRow: { tracking_data: { planeje_labels: ['Não responde'] } },
});
assert.equal(campaign.naoResponde, 1);
assert.equal(campaign.desqualificado, 0);

console.log('PASS crm relatorio meta tracking');

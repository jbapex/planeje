import assert from 'node:assert/strict';
import {
  buildRelatorioSpendIndex,
  campaignIdFromReportRow,
  fetchCrmRelatorioMetaSpend,
  normalizeCampaignName,
  spendForCampaign,
} from '../src/lib/crmRelatorioMetaSpend.js';

assert.equal(
  campaignIdFromReportRow({
    tracking_data: { meta_ad_details: { ad: { campaign: { id: '120123456789' } } } },
  }),
  '120123456789'
);
assert.equal(
  campaignIdFromReportRow({
    tracking_data: { meta_ad_details: { ad: { campaign_id: 'act_999888777' } } },
  }),
  '999888777'
);
assert.equal(campaignIdFromReportRow({ tracking_data: { campaign_id: '120111' } }), '120111');
assert.equal(campaignIdFromReportRow({ tracking_data: { utm_campaign: 'nome' } }), '');
assert.equal(normalizeCampaignName('  [27/08][WHATSAPP]  '), '[27/08][whatsapp]');

const index = buildRelatorioSpendIndex([
  { campaign_id: '120111', campaign_name: '[27/08][RMK INSTAGRAM][WHATSAPP][AGENDAMENTO]', spend: '100.4' },
  { campaign_id: '120111', campaign_name: '[27/08][RMK INSTAGRAM][WHATSAPP][AGENDAMENTO]', spend: '10' },
  { campaign_id: '120222', campaign_name: '[31/08][SMBRO DOURADO][WHATSAPP]', spend: 40 },
]);
assert.equal(index.total, 150.4);
assert.equal(spendForCampaign(index, { campaignId: '120111' }), 110.4);
assert.equal(
  spendForCampaign(index, {
    campaignName: '[31/08][SMBRO DOURADO][WHATSAPP]',
  }),
  40
);
assert.equal(spendForCampaign(index, { campaignName: 'campanha ausente' }), 0);

const namedOnly = buildRelatorioSpendIndex([{ spend: '7.5', campaign_name: 'Impacto' }]);
assert.equal(namedOnly.total, 7.5);
assert.equal(spendForCampaign(namedOnly, { campaignName: 'impacto' }), 7.5);

let calls = 0;
const fetched = await fetchCrmRelatorioMetaSpend(
  async (name, opts) => {
    calls += 1;
    assert.equal(name, 'meta-ads-api');
    assert.equal(opts.body.action, 'get-campaign-insights');
    assert.equal(opts.body.cliente_id, 'cli-impacto');
    assert.equal(opts.body.level, 'campaign');
    return {
      data: {
        campaigns: [
          { campaign_id: '1', campaign_name: 'A', spend: '12' },
          { campaign_id: '2', campaign_name: 'B', spend: 8 },
        ],
      },
      error: null,
    };
  },
  {
    clienteId: 'cli-impacto',
    adAccountIds: ['act_1'],
    since: '2026-09-01',
    until: '2026-09-30',
  },
);
assert.equal(calls, 1);
assert.equal(fetched.total, 20);
assert.equal(fetched.hasAdAccounts, true);
assert.equal(spendForCampaign(fetched, { campaignName: 'B' }), 8);

const emptyAccounts = await fetchCrmRelatorioMetaSpend(async () => ({ data: {} }), {
  clienteId: 'cli-impacto',
  adAccountIds: [],
  since: '2026-09-01',
  until: '2026-09-30',
});
assert.equal(emptyAccounts.hasAdAccounts, false);
assert.equal(emptyAccounts.total, 0);

let fallbackCalls = 0;
const fallback = await fetchCrmRelatorioMetaSpend(
  async (_name, opts) => {
    fallbackCalls += 1;
    const metrics = opts.body.metrics || [];
    if (opts.body.level === 'campaign' && metrics.includes('campaign_id')) {
      return { data: { error: { message: 'invalid field' }, campaigns: {} }, error: null };
    }
    if (opts.body.level === 'campaign') {
      return {
        data: { campaigns: [{ campaign_id: '9', campaign_name: 'X', spend: '33' }] },
        error: null,
      };
    }
    throw new Error('account fallback should not run');
  },
  {
    clienteId: 'cli-impacto',
    adAccountIds: ['act_1'],
    since: '2026-09-01',
    until: '2026-09-30',
  },
);
assert.equal(fallbackCalls, 2);
assert.equal(fallback.total, 33);
assert.equal(spendForCampaign(fallback, { campaignName: 'X' }), 33);
assert.deepEqual(fallback.errors, []);

console.log('PASS crm relatorio meta spend');

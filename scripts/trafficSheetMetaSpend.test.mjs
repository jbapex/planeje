import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyWeekSpendToRows,
  buildAdsetSpendIndex,
  formatSpendInput,
  insightSpend,
  lookupRowSpend,
  weekSpendRange,
  fetchMetaWeekAdsetSpend,
  spendPullMessage,
} from '../src/lib/trafficSheetMetaSpend.js';

test('week range is Monday–Sunday of the routine week', () => {
  assert.deepEqual(weekSpendRange('2026-09-28'), { since: '2026-09-28', until: '2026-10-04' });
  assert.equal(weekSpendRange(''), null);
});

test('insight spend reads nested Meta payload', () => {
  assert.equal(insightSpend({ insights: { data: [{ spend: '73.56' }] } }), 73.56);
  assert.equal(insightSpend({ insights: { data: [{ spend: '0' }] } }), 0);
  assert.equal(insightSpend({ insights: { data: [] } }), null);
  assert.equal(formatSpendInput(73.56), '73.56');
});

test('lookup requires conjunto — never campaign total', () => {
  const index = buildAdsetSpendIndex([
    { id: 'as1', name: 'CJ01', campaign_id: 'c1', campaign_name: 'Camp A', insights: { data: [{ spend: '73.56' }] } },
    { id: 'as2', name: 'CJ02', campaign_id: 'c1', campaign_name: 'Camp A', insights: { data: [{ spend: '10' }] } },
  ]);
  assert.equal(lookupRowSpend({
    campaign_id: 'c1', campaign_name: 'Camp A', adset_id: '', adset_name: '',
  }, index), null);
  assert.equal(lookupRowSpend({
    campaign_id: 'c1', campaign_name: 'Camp A', adset_id: 'as1', adset_name: 'CJ01',
  }, index), 73.56);
});

test('row with campaign+conjunto fills spend; campaign-only expands conjuntos', () => {
  const index = buildAdsetSpendIndex([
    { id: 'as1', name: 'CJ01', campaign_id: 'c1', insights: { data: [{ spend: '73.56' }] } },
    { id: 'as2', name: 'CJ02', campaign_id: 'c1', insights: { data: [{ spend: '10' }] } },
  ]);
  const withAdset = applyWeekSpendToRows([{
    id: '1', platform: 'meta', account_id: '123', campaign_id: 'c1', campaign_name: 'Camp A',
    adset_id: 'as1', adset_name: 'CJ01', spend: '',
  }], index);
  assert.equal(withAdset.filled, 1);
  assert.equal(withAdset.rows[0].spend, '73.56');

  const onlyCampaign = applyWeekSpendToRows([{
    id: '1', platform: 'meta', account_id: '123', campaign_id: 'c1', campaign_name: 'Camp A',
    adset_id: '', adset_name: '', spend: '',
  }], index);
  assert.equal(onlyCampaign.expanded, 2);
  assert.equal(onlyCampaign.rows.length, 2);
  assert.equal(onlyCampaign.rows[0].adset_name, 'CJ01');
  assert.equal(onlyCampaign.rows[0].spend, '73.56');
  assert.equal(onlyCampaign.rows[1].adset_name, 'CJ02');
  assert.equal(onlyCampaign.rows[1].spend, '10');
  assert.match(spendPullMessage(onlyCampaign, '28/09 a 04/10'), /conjunto/);
});

test('fetch loads adsets by campaign id', async () => {
  const calls = [];
  const invoke = async (_name, { body }) => {
    calls.push(body);
    return {
      data: {
        adsets: [{
          id: 'as9',
          name: 'CJ',
          campaign_id: body.campaignId,
          insights: { data: [{ spend: '12.5' }] },
        }],
      },
    };
  };
  const index = await fetchMetaWeekAdsetSpend(
    [{ platform: 'meta', account_id: 'act_999', campaign_id: 'camp1', campaign_name: 'Camp A', adset_id: 'as9', adset_name: 'CJ' }],
    { since: '2026-09-28', until: '2026-10-04', invoke },
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0].action, 'get-adsets');
  assert.equal(calls[0].campaignId, 'camp1');
  assert.equal(index.byId.get('as9'), 12.5);
});

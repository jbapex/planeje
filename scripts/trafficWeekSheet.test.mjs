import { test } from 'node:test';
import assert from 'node:assert/strict';
import { campaignDraft, campaignTotals, costFor, reviewPayload, validateReview } from '../src/lib/trafficWeeklyReview.js';
test('costs use each row and aggregate matching totals', () => {
 const rows = [{spend:400,messages:30,appointments:2},{spend:350,messages:12,appointments:3}];
 assert.equal(costFor(350,12),350/12);
 assert.equal(campaignTotals(rows).messageCost,750/42);
 assert.equal(campaignTotals(rows).appointmentCost,150);
 assert.equal(costFor(100,0),null);
 assert.equal(campaignTotals([{spend:100,messages:''}]).messages,null);
});
test('adsets permit distinct rows, reject duplicates, integer business events', () => {
 const row=campaignDraft({platform:'meta',account_id:'a',account_name:'Account',campaign_name:'Campaign',campaign_id:'c',conversion_label:'Lead',adset_name:'Set 1',spend:100,messages:12,conversions:1});
 const draft={kind:'review',metric_mode:'campaign',campaign_metrics:[row,{...row,id:crypto.randomUUID(),adset_name:'Set 2'}],analysis:'Checked',action_mode:'none'};
 assert.equal(validateReview(draft,true),'');
 assert.equal(reviewPayload(draft).campaign_metrics[0].messages,12);
 assert.ok(validateReview({...draft,campaign_metrics:[row,row]},true));
 assert.ok(validateReview({...draft,campaign_metrics:[{...row,messages:'1.5'}]},true));
});

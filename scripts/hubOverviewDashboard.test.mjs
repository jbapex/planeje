import assert from 'node:assert/strict';
import {
  aggregateInsightRows,
  buildDailyComparison,
  buildFunnelPaths,
  buildOverviewDashboard,
  buildOverviewFunnel,
  checkoutsFromActions,
  costPer,
  dailyDifferenceLabel,
  enumerateDays,
  fetchHubCapiEventCounts,
  fetchHubCheckoutCount,
  fetchHubDailyInsights,
  fetchHubOverviewContacts,
  formatOverviewMoney,
  formatRoasX,
  funnelBadgeInk,
  funnelStageCaption,
  funnelStageColor,
  localYmdFromTimestamp,
  metaConversationsFromActions,
  summarizeOverviewContacts,
  trackingRatePercent,
} from '../src/lib/hubOverviewDashboard.js';

assert.deepEqual(enumerateDays('2026-09-01', '2026-09-03'), [
  '2026-09-01',
  '2026-09-02',
  '2026-09-03',
]);
assert.equal(localYmdFromTimestamp('2026-09-19T22:10:00.000-03:00'), '2026-09-19');
assert.equal(localYmdFromTimestamp('2026-09-20T01:10:00.000Z'), '2026-09-19');
assert.deepEqual(enumerateDays('2026-09-03', '2026-09-01'), []);

assert.equal(
  metaConversationsFromActions([
    { action_type: 'link_click', value: '9' },
    { action_type: 'onsite_conversion.messaging_conversation_started_7d', value: '12' },
    { action_type: 'messaging_conversation_started', value: '40' },
  ]),
  12,
);
assert.equal(metaConversationsFromActions([]), 0);
assert.equal(
  checkoutsFromActions([
    { action_type: 'link_click', value: '9' },
    { action_type: 'offsite_conversion.fb_pixel_initiate_checkout', value: '4' },
    { action_type: 'omni_initiated_checkout', value: '4' },
  ]),
  4,
);
assert.equal(checkoutsFromActions([]), 0);
assert.match(formatOverviewMoney(19.34), /R\$.*19,34/);
assert.equal(formatOverviewMoney(null), '—');

const contacts = summarizeOverviewContacts([
  { origin_source: 'meta_ads', first_seen_at: '2026-09-02T15:00:00-03:00', qualificado: true, comprou: true, valor_venda: '80' },
  { origin_source: 'meta_ads', first_seen_at: '2026-09-02T18:00:00-03:00' },
  { origin_source: 'google_ads', first_seen_at: '2026-09-02T12:00:00-03:00', comprou: true, valor_venda: '999' },
]);
assert.equal(contacts.realConversations, 2);
assert.equal(contacts.qualificados, 1);
assert.equal(contacts.vendas, 1);
assert.equal(contacts.valorTotal, 80);
assert.equal(contacts.realByDay.get('2026-09-02'), 2);

const insights = aggregateInsightRows([
  { date_start: '2026-09-01', spend: '10', actions: [{ action_type: 'messaging_conversation_started', value: '4' }] },
  {
    date_start: '2026-09-02',
    spend: '20',
    actions: [
      { action_type: 'messaging_conversation_started', value: '6' },
      { action_type: 'initiate_checkout', value: '2' },
    ],
  },
]);
assert.equal(insights.spend, 30);
assert.equal(insights.metaConversations, 10);
assert.equal(insights.checkouts, 2);
assert.equal(insights.byDay.get('2026-09-02').metaConversations, 6);

const points = buildDailyComparison(
  ['2026-09-01', '2026-09-02', '2026-09-03'],
  insights.byDay,
  contacts.realByDay,
);
assert.equal(points[0].metaConversations, 4);
assert.equal(points[1].realConversations, 2);
assert.equal(points[2].metaConversations, 0);

assert.equal(costPer(100, 4), 25);
assert.equal(costPer(100, 0), null);
assert.equal(trackingRatePercent(2, 10), 20);
assert.equal(formatRoasX(1.5), '1.50x');
assert.equal(dailyDifferenceLabel(10, 8), '2 conversas a mais na Meta');
assert.equal(dailyDifferenceLabel(3, 5), '2 conversas reais a mais');

const funnel = buildOverviewFunnel({
  spend: 100,
  metaConversations: 10,
  realConversations: 5,
  journey: [
    { eventName: 'QualifiedLead', label: 'Qualificado', hint: 'Etiqueta “qualificado”', value: 1 },
    { eventName: 'InitiateCheckout', label: 'Checkout iniciado', value: 2 },
    { eventName: 'Purchase', label: 'Compra', value: 0 },
  ],
});
assert.equal(funnel.length, 5);
assert.equal(funnel[0].label, 'Conversas Meta');
assert.equal(funnel[1].label, 'Conversas reais iniciadas');
assert.equal(funnel[1].costLabel, 'Custo por lead');
assert.equal(funnel[1].cost, 20);
assert.equal(funnel[2].label, 'Qualificado');
assert.equal(funnel[2].hint, 'Etiqueta “qualificado”');
assert.equal(funnel[3].label, 'Checkout iniciado');
assert.equal(funnel[3].cost, 50);
assert.equal(funnel[4].label, 'Compra');
assert.equal(funnel[4].cost, null);
assert.equal(funnelStageCaption(0, funnel), 'Base do funil');
assert.equal(funnelStageCaption(1, funnel), '50% da etapa anterior');
assert.equal(funnelStageCaption(3, funnel), '200% da etapa anterior');
assert.equal(funnelStageCaption(4, funnel), '0% da etapa anterior');
assert.equal(funnelStageColor(5), '#f59e0b');
assert.equal(funnelBadgeInk('#5eead4'), '#04202a');
assert.equal(funnelBadgeInk('#0f766e'), '#fff');

const paths = buildFunnelPaths(funnel.map((stage) => stage.value));
assert.equal(paths.length, 5);
assert.match(paths[0].d, /^M 0 /);
assert.equal(paths[4].color, '#a78bfa');

const dash = buildOverviewDashboard({
  since: '2026-09-01',
  until: '2026-09-02',
  insightRows: [
    {
      date_start: '2026-09-01',
      spend: '50',
      actions: [
        { action_type: 'messaging_conversation_started', value: '8' },
        { action_type: 'omni_initiated_checkout', value: '1' },
      ],
    },
  ],
  contactRows: [
    { origin_source: 'meta_ads', first_seen_at: '2026-09-01T12:00:00-03:00', comprou: true, valor_venda: '100' },
  ],
  checkoutCount: 4,
  activeRules: [
    { active: true, event_name: 'QualifiedLead', name: 'Qualificado', trigger_type: 'etiqueta', trigger_value: 'qualificado' },
    { active: true, event_name: 'InitiateCheckout', name: 'Checkout iniciado', trigger_type: 'etiqueta', trigger_value: 'checkout' },
    { active: true, event_name: 'Purchase', name: 'Compra', trigger_type: 'etiqueta', trigger_value: 'comprou' },
  ],
});
assert.equal(dash.spend, 50);
assert.equal(dash.realConversations, 1);
assert.equal(dash.checkouts, 4);
assert.equal(dash.funnel.map((stage) => stage.label).join(','), 'Conversas Meta,Conversas reais iniciadas,Qualificado,Checkout iniciado,Compra');
assert.equal(dash.funnel[3].value, 4);
assert.equal(dash.funnel[3].label, 'Checkout iniciado');
assert.equal(dash.roas, 2);
assert.equal(dash.points.length, 2);

const dashActiveOnly = buildOverviewDashboard({
  since: '2026-09-01',
  until: '2026-09-01',
  insightRows: [
    {
      date_start: '2026-09-01',
      spend: '10',
      actions: [{ action_type: 'initiate_checkout', value: '2' }],
    },
  ],
  contactRows: [
    { origin_source: 'meta_ads', first_seen_at: '2026-09-01T12:00:00-03:00', qualificado: true, comprou: true, valor_venda: '50' },
  ],
  activeRules: [
    { active: true, event_name: 'Lead', name: 'Lead', trigger_type: 'etiqueta', trigger_value: 'lead' },
    { active: true, event_name: 'QualifiedLead', name: 'Qualificado', trigger_type: 'etiqueta', trigger_value: 'qualificado' },
    { active: true, event_name: 'Purchase', name: 'Compra', trigger_type: 'etiqueta', trigger_value: 'comprou' },
    { active: false, event_name: 'InitiateCheckout', name: 'Checkout', trigger_type: 'etiqueta', trigger_value: 'checkout' },
  ],
});
assert.equal(dashActiveOnly.funnel.map((stage) => stage.label).join(','), 'Conversas Meta,Conversas reais iniciadas,Lead,Qualificado,Compra');
assert.equal(dashActiveOnly.funnel[2].value, 0);
assert.equal(dashActiveOnly.funnel[3].value, 1);
assert.equal(dashActiveOnly.funnel[4].value, 1);
assert.equal(dashActiveOnly.checkouts, 0);

const dashInsightsCheckout = buildOverviewDashboard({
  since: '2026-09-01',
  until: '2026-09-01',
  insightRows: [
    {
      date_start: '2026-09-01',
      spend: '10',
      actions: [{ action_type: 'initiate_checkout', value: '2' }],
    },
  ],
  activeRules: [
    { active: true, event_name: 'InitiateCheckout', name: 'Checkout iniciado', trigger_type: 'etiqueta', trigger_value: 'checkout' },
  ],
});
assert.equal(dashInsightsCheckout.checkouts, 2);
assert.equal(dashInsightsCheckout.funnel[2].label, 'Checkout iniciado');
assert.equal(dashInsightsCheckout.funnel[2].value, 2);

const contactClient = {
  from(table) {
    assert.equal(table, 'cliente_whatsapp_contact');
    const query = {
      select() { return query; },
      eq() { return query; },
      gte() { return query; },
      lte() { return query; },
      range() {
        return Promise.resolve({
          data: [{ origin_source: 'meta_ads', first_seen_at: '2026-09-01T12:00:00Z' }],
          error: null,
        });
      },
    };
    return query;
  },
};
const fetched = await fetchHubOverviewContacts(contactClient, {
  clienteId: 'cli-1',
  sinceIso: '2026-09-01T03:00:00.000Z',
  untilIso: '2026-09-02T02:59:59.999Z',
});
assert.equal(fetched.rows.length, 1);

const checkoutClient = {
  from(table) {
    assert.equal(table, 'meta_conversion_event_log');
    const query = {
      select() { return query; },
      eq() { return query; },
      in(column, names) {
        assert.equal(column, 'event_name');
        assert.ok(names.includes('InitiateCheckout'));
        return query;
      },
      gte() { return query; },
      lte() { return query; },
      range() {
        return Promise.resolve({
          data: [
            { event_name: 'InitiateCheckout' },
            { event_name: 'initiate_checkout' },
          ],
          error: null,
        });
      },
    };
    return query;
  },
};
const checkoutFetched = await fetchHubCheckoutCount(checkoutClient, {
  clienteId: 'cli-1',
  sinceIso: '2026-09-01T03:00:00.000Z',
  untilIso: '2026-09-02T02:59:59.999Z',
});
assert.equal(checkoutFetched.count, 2);

const capiClient = {
  from(table) {
    assert.equal(table, 'meta_conversion_event_log');
    const query = {
      select() { return query; },
      eq() { return query; },
      in() { return query; },
      gte() { return query; },
      lte() { return query; },
      range() {
        return Promise.resolve({
          data: [{ event_name: 'QualifiedLead' }, { event_name: 'Purchase' }, { event_name: 'Purchase' }],
          error: null,
        });
      },
    };
    return query;
  },
};
const capiFetched = await fetchHubCapiEventCounts(capiClient, {
  clienteId: 'cli-1',
  sinceIso: '2026-09-01T03:00:00.000Z',
  untilIso: '2026-09-02T02:59:59.999Z',
  eventNames: ['QualifiedLead', 'Purchase'],
});
assert.equal(capiFetched.counts.QualifiedLead, 1);
assert.equal(capiFetched.counts.Purchase, 2);

let calls = 0;
const daily = await fetchHubDailyInsights(
  async (_name, opts) => {
    calls += 1;
    assert.equal(opts.body.time_increment, 1);
    assert.equal(opts.body.level, 'account');
    return {
      data: {
        campaigns: [{ date_start: '2026-09-01', spend: '7', actions: [] }],
      },
      error: null,
    };
  },
  { clienteId: 'cli-1', adAccountIds: ['act_1'], since: '2026-09-01', until: '2026-09-02' },
);
assert.equal(calls, 1);
assert.equal(daily.rows.length, 1);

console.log('PASS hub overview dashboard');

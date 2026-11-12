import assert from 'node:assert/strict';
import {
  collectAdAccountIds,
  emptyHubLeads,
  fetchHubAccountSpend,
  fetchHubContactSummary,
  mergeHubResults,
  periodBoundsIso,
  sumInsightSpend,
} from '../src/lib/hubResultsSummary.js';

const bounds = periodBoundsIso('2026-08-20', '2026-09-19');
assert.ok(bounds.sinceIso.includes('2026-08-2'));
assert.ok(bounds.untilIso.includes('2026-09-19') || bounds.untilIso.includes('2026-09-20'));

assert.deepEqual(
  collectAdAccountIds({
    adAccountIds: ['act_111', '111'],
    adAccounts: [{ id: 'act_222', name: 'x' }, { id: '333' }],
  }),
  ['act_111', 'act_222', 'act_333'],
);

assert.equal(sumInsightSpend([{ spend: '10.5' }, { spend: 2 }]), 12.5);
assert.equal(sumInsightSpend(null), 0);

const mergedContacts = mergeHubResults({
  functionResult: {
    spend: { meta: 0, google: 0, total: 0 },
    leads: emptyHubLeads(),
  },
  contactSummary: { unique: 40, qualificados: 3, vendas: 1, valorTotal: 500 },
  accountSpend: 200,
});
assert.equal(mergedContacts.leads.unique, 40);
assert.equal(mergedContacts.spend.meta, 200);
assert.equal(mergedContacts.spend.total, 200);
assert.equal(mergedContacts.cpl, 5);
assert.equal(mergedContacts.roas, 2.5);

const mergedFunilWins = mergeHubResults({
  functionResult: {
    spend: { meta: 80, google: 20, total: 100 },
    leads: { unique: 1, qualificados: 0, vendas: 0, valorTotal: 0 },
  },
  contactSummary: { unique: 9, qualificados: 2, vendas: 0, valorTotal: 0 },
  accountSpend: 999,
});
assert.equal(mergedFunilWins.leads.unique, 9);
assert.equal(mergedFunilWins.spend.meta, 80);
assert.equal(mergedFunilWins.spend.google, 20);
assert.equal(mergedFunilWins.spend.total, 100);

const calls = [];
const contactClient = {
  from(table) {
    assert.equal(table, 'cliente_whatsapp_contact');
    const state = { filters: [] };
    const query = {
      select() {
        return query;
      },
      eq(column, value) {
        state.filters.push([column, value]);
        return query;
      },
      gte() {
        return query;
      },
      lte() {
        return Promise.resolve(
          state.filters.some((row) => row[0] === 'comprou')
            ? { count: 2, data: [{ valor_venda: '10' }, { valor_venda: '5' }], error: null }
            : state.filters.some((row) => row[0] === 'qualificado')
              ? { count: 4, data: null, error: null }
              : { count: 12, data: null, error: null },
        );
      },
    };
    calls.push(state);
    return query;
  },
};

const summary = await fetchHubContactSummary(contactClient, {
  clienteId: 'cli-1',
  sinceIso: bounds.sinceIso,
  untilIso: bounds.untilIso,
});
assert.equal(summary.unique, 12);
assert.equal(summary.qualificados, 4);
assert.equal(summary.vendas, 2);
assert.equal(summary.valorTotal, 15);
assert.equal(summary.error, null);

const spend = await fetchHubAccountSpend(
  async (_name, opts) => {
    assert.equal(opts.body.action, 'get-campaign-insights');
    assert.equal(opts.body.cliente_id, 'cli-1');
    return { data: { campaigns: [{ spend: '3' }, { spend: 1 }] }, error: null };
  },
  {
    clienteId: 'cli-1',
    adAccountIds: ['act_1'],
    since: '2026-08-20',
    until: '2026-09-19',
  },
);
assert.equal(spend.total, 4);
assert.deepEqual(spend.errors, []);

console.log('PASS hub results summary');

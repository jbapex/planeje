import assert from 'node:assert/strict';
import { applyMiniCrmConfigCopy, planMiniCrmConfigCopy } from '../src/lib/miniCrmConfigCopy.js';
import { withDefaultStatus } from '../src/lib/miniCrm.js';

const source = { client: { id: 'source', empresa: 'Origem fictícia', nicho: 'Loja de noivas' }, config: {
  cliente_id: 'source', updated_at: '2026-10-16T10:00:00Z', statuses: [{ key: 'Novo Lead', label: 'Novo Lead', color: '#336699' }, { key: 'agendou', label: 'Visita marcada', color: '#ffcc00' }],
  columns: [{ key: 'vestido', label: 'Modelo escolhido', kind: 'text', onCard: true }, { key: 'valor', label: 'Valor', kind: 'money' }], sellers: ['Vendedora origem'], cadence: { days: [9] },
} };
const destination = { client: { id: 'destination', empresa: 'Destino fictício', nicho: 'Loja de noivas' }, config: {
  cliente_id: 'destination', updated_at: '2026-10-16T09:00:00Z', statuses: [{ key: 'Novo Lead', label: 'Entrada', color: '#000000' }, { key: 'local', label: 'Etapa exclusiva', color: '#123456' }, { key: 'Venda Realizada', label: 'Venda Realizada' }],
  columns: [{ key: 'valor', label: 'Valor local', kind: 'text' }, { key: 'exclusivo', label: 'Campo exclusivo', kind: 'text' }], sellers: ['Vendedora destino'], cadence: { days: [1, 2, 3] },
} };
const clone = (value) => structuredClone(value);
const before = JSON.stringify({ source, destination });
const plan = planMiniCrmConfigCopy({ source, destination });
assert.equal(JSON.stringify({ source, destination }), before);
assert.equal(plan.changes.statuses[0].label, 'Novo Lead');
assert.equal(plan.changes.statuses[0].color, '#336699');
assert.ok(plan.changes.statuses.some((s) => s.key === 'local'));
assert.ok(plan.changes.statuses.some((s) => s.key === 'Venda Realizada'));
assert.equal(new Set(plan.changes.statuses.map((s) => s.key)).size, plan.changes.statuses.length);
const lead = { status: 'local', vestido: 'Existente', exclusivo: 'Não apagar', valor: 'valor antigo' };
assert.equal(withDefaultStatus(lead, plan.changes.statuses), lead, 'existing lead cannot be reset to entry');
assert.equal(plan.changes.columns.find((c) => c.key === 'valor').kind, 'text', 'keep field type when source conflicts');
assert.equal(plan.keptColumnTypes, 1);
assert.ok(plan.changes.columns.some((c) => c.key === 'exclusivo'));
assert.ok(plan.changes.columns.some((c) => c.key === 'data_venda'));
assert.equal(plan.changes.columns[0].onCard, true);
assert.deepEqual(plan.insert.sellers, destination.config.sellers);
assert.equal('sellers' in plan.changes, false);
assert.equal('cadence' in plan.changes, false);
const statusOnly = planMiniCrmConfigCopy({ source, destination, columns: false });
assert.equal('columns' in statusOnly.changes, false);
const columnsOnly = planMiniCrmConfigCopy({ source, destination, statuses: false });
assert.equal('statuses' in columnsOnly.changes, false);
assert.throws(() => planMiniCrmConfigCopy({ source, destination: source }), /outro cliente/);
assert.throws(() => planMiniCrmConfigCopy({ source, destination, statuses: false, columns: false }), /Selecione/);
const noConfig = { ...destination, config: null };
const defaults = planMiniCrmConfigCopy({ source: { ...source, config: null }, destination: noConfig });
assert.ok(defaults.changes.statuses.length > 0 && defaults.changes.columns.length > 0);
const sameNames = clone(destination);
sameNames.config.statuses.push({ key: 'legacy-visit', label: '  VISITA  marcada ', color: '#000000' });
sameNames.config.columns.push({ key: 'legacy-model', label: 'Modelo escolhido', kind: 'text' });
const reused = planMiniCrmConfigCopy({ source, destination: sameNames });
assert.equal(reused.changes.statuses.filter((s) => s.label === 'Visita marcada').length, 1);
assert.equal(reused.changes.statuses.find((s) => s.label === 'Visita marcada').key, 'legacy-visit');
assert.equal(reused.changes.columns.find((c) => c.label === 'Modelo escolhido').key, 'legacy-model');
const oldLead = { status: 'legacy-visit', 'legacy-model': 'Modelo existente' };
assert.equal(withDefaultStatus(oldLead, reused.changes.statuses), oldLead);

function database({ changedSource = false, changedDestination = false, race = false, denied = false, existing = true, insertError = null } = {}) {
  const writes = [];
  const snapshots = { source: clone(source), destination: clone(existing ? destination : noConfig) };
  if (changedSource) snapshots.source.config.columns.push({ key: 'new', label: 'Nova' });
  if (changedDestination) snapshots.destination.config.sellers.push('Nova vendedora');
  return { writes, from(table) {
    assert.ok(['clientes', 'mini_crm_config'].includes(table), 'must never access leads or other settings');
    let id; let mutation = null; let timestamp;
    const q = { select() { return q; }, eq(key, value) { if (key === 'id' || key === 'cliente_id') id = value; if (key === 'updated_at') timestamp = value; return q; }, is() { return q; },
      maybeSingle() { return q; }, single() { return q; },
      update(payload) { mutation = { type: 'update', payload }; return q; },
      insert(payload) { mutation = { type: 'insert', payload }; id = payload.cliente_id; return q; },
      then(resolve, reject) {
        if (mutation) {
          writes.push({ table, id, timestamp, ...mutation });
          return Promise.resolve({ data: race || denied || insertError ? null : { cliente_id: id }, error: denied ? { message: 'RLS denied' } : insertError }).then(resolve, reject);
        }
        const snapshot = snapshots[id];
        return Promise.resolve({ data: clone(table === 'clientes' ? snapshot.client : snapshot.config), error: null }).then(resolve, reject);
      },
    }; return q;
  } };
}
const owner = { role: 'superadmin', status: 'active' };
for (const profile of [{ role: 'cliente', status: 'active' }, { role: 'admin', status: 'active' }, { role: 'superadmin', status: 'pending' }]) {
  const db = database(); await assert.rejects(applyMiniCrmConfigCopy(db, profile, plan), /Super Admin ativo/); assert.equal(db.writes.length, 0);
}
for (const options of [{ changedSource: true }, { changedDestination: true }]) {
  const db = database(options); await assert.rejects(applyMiniCrmConfigCopy(db, owner, plan), /mudou/); assert.equal(db.writes.length, 0);
}
const db = database(); await applyMiniCrmConfigCopy(db, owner, plan);
assert.equal(db.writes.length, 1); assert.equal(db.writes[0].id, 'destination');
assert.equal(db.writes[0].timestamp, destination.config.updated_at);
assert.deepEqual(Object.keys(db.writes[0].payload).sort(), ['columns', 'statuses', 'updated_at']);
const modifiedPlan = clone(plan); modifiedPlan.changes.statuses = [{ key: 'forged', label: 'Forged' }];
const guarded = database(); await applyMiniCrmConfigCopy(guarded, owner, modifiedPlan);
assert.deepEqual(guarded.writes[0].payload.statuses, plan.changes.statuses, 'rebuild selected config rather than trust mutable preview payload');
for (const options of [{ race: true }, { denied: true }]) await assert.rejects(applyMiniCrmConfigCopy(database(options), owner, plan));
const insertPlan = planMiniCrmConfigCopy({ source, destination: noConfig });
const emptyDb = database({ existing: false }); await applyMiniCrmConfigCopy(emptyDb, owner, insertPlan);
assert.equal(emptyDb.writes[0].type, 'insert');
await assert.rejects(applyMiniCrmConfigCopy(database({ existing: false, insertError: { code: '23505' } }), owner, insertPlan), /ganhou uma configuração/);
assert.equal(JSON.stringify({ source, destination }), before);
console.log('Mini CRM config copy: planning, selective writes, roles, stale previews, concurrency, defaults, existing leads and errors passed.');

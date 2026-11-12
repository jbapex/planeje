import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'vite';
import { createPreviewDatabase, CLIENT, ROOT, TODAY, WEEK } from './neuro-preview/db.mjs';
import { previewClient } from './neuro-preview/mcp.mjs';
import { runRoutineScenario } from './neuro-preview/scenario.mjs';
import { createPreviewFetch } from './neuro-preview/bridge.mjs';

test('real MCP + disposable PostgreSQL + actual routine readers preserve human validation', async () => {
  const db = createPreviewDatabase();
  let vite;
  try {
    assert.equal(db.sql("SHOW listen_addresses"), '', 'disposable PostgreSQL must not expose TCP');
    const localFetch = createPreviewFetch(db);
    await assert.rejects(() => localFetch('https://external.invalid/rest/v1/profiles'), /External network blocked/);
    const denied = await localFetch('http://127.0.0.1:4393/rest/v1/rpc/unknown_mutation', { method: 'POST', body: '{}' });
    assert.equal(denied.status, 403);
    const result = await runRoutineScenario(db);
    assert.equal(result.review.validation_state, 'rascunho_ia', 'leave preview in an AI draft');
    vite = await createServer({ configFile: `${ROOT}/scripts/gestor-ia/neuro-preview/vite.config.mjs`, server: { middlewareMode: true }, logLevel: 'error' });
    const readers = await vite.ssrLoadModule(`${ROOT}/src/components/gestor-ia/gestorIaRoutineData.js`);
    const human = previewClient(db);
    const profile = { id: '00000000-0000-0000-0000-000000000001', role: 'colaborador', status: 'active' };
    const modules = { paid_traffic: true, rastreamento: true };
    const clients = [{ id: CLIENT, empresa: 'Impacto Noivas sintético', etapa: 'closed' }];
    const board = await readers.loadRoutineBoard(human, { profile, modules, clients });
    assert.equal(board.today, TODAY);
    const summary = await readers.loadRoutineSummary(human, { profile, modules, clientIds: [CLIENT], weekStart: WEEK });
    assert.equal(summary.length, 1);
    assert.equal(summary[0].validation_state, 'rascunho_ia');
    const week = await readers.loadRoutineWeek(human, { board, profile, modules, clientId: CLIENT, weekStart: WEEK });
    assert.equal(week.review.id, result.review.id);
    assert.equal(week.review.can_edit, true);
    const leads = await readers.loadRoutineLeads(human, { profile, modules, clientId: CLIENT, weekStart: WEEK, rows: week.review.campaign_metrics });
    assert.equal(leads.leads.length, 3);
    assert.equal(leads.unmatchedLeads.length, 2);
    assert.ok(leads.leads.some((lead) => lead.routineCrmOutdated));
    const scheduled = leads.leads.filter((lead) => lead.routineScheduled);
    assert.equal(scheduled.length, 2);
  } finally { if (vite) await vite.close(); db.close(); }
});

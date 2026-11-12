import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'vite';
import { createPreviewDatabase, ACTOR, CLIENT, ROOT, WEEK, literal } from './neuro-preview/db.mjs';
import { createPreviewMcp, previewClient, toolPayload } from './neuro-preview/mcp.mjs';
import { attributionLines, attributionWriteState, runAttributionScenario } from './neuro-preview/attribution.mjs';

test('real MCP and UI readers reproduce synthetic attribution aggregates with human validation', async () => {
  const db = createPreviewDatabase({ attribution: true });
  let vite;
  try {
    assert.equal(db.sql('SHOW listen_addresses'), '');
    assert.equal(db.json(`SELECT count(*) FROM public.cliente_whatsapp_contact WHERE cliente_id='${CLIENT}' AND first_seen_at>='2026-11-09 03:00Z' AND first_seen_at<'2026-11-16 03:00Z'`), 70);
    const result = await runAttributionScenario(db);
    assert.equal(result.review.validation_state, 'rascunho_ia');
    assert.equal(result.entry.leads.length, 14);
    assert.equal(result.appointments.summary.total, 20);
    assert.equal(result.appointments.summary.novos, 14);
    assert.equal(result.appointments.summary.antigos, 6);
    assert.equal(result.appointments.leads.length, 4);
    assert.equal(result.appointments.unmatchedLeads.length, 16);
    vite = await createServer({ configFile: `${ROOT}/scripts/gestor-ia/neuro-preview/vite.config.mjs`, server: { middlewareMode: true }, logLevel: 'error' });
    const readers = await vite.ssrLoadModule(`${ROOT}/src/components/gestor-ia/gestorIaRoutineData.js`);
    const human = previewClient(db);
    const options = { profile: { id: '00000000-0000-0000-0000-000000000001', role: 'colaborador', status: 'active' },
      modules: { paid_traffic: true, rastreamento: true }, clientId: CLIENT, weekStart: WEEK,
      rows: result.review.campaign_metrics, allRows: result.review.campaign_metrics };
    const entry = await readers.loadRoutineLeads(human, options);
    const appointments = await readers.loadRoutineLeads(human, { ...options, mode: 'agendados_na_semana' });
    assert.equal(entry.leads.length, 14);
    assert.deepEqual(appointments.summary, result.appointments.summary, 'UI and real MCP consume the same SQL projection and model');
    assert.deepEqual(appointments.leads.map(({ id }) => id).sort(), result.appointments.leads.map(({ id }) => id).sort());
    assert.ok([...appointments.leads, ...appointments.unmatchedLeads].every(({ phone }) => phone.includes('•') || phone.includes('*')));
  } finally { if (vite) await vite.close(); db.close(); }
});

test('real MCP subset cannot turn a cross-account ambiguous name into attribution', async () => {
  const db = createPreviewDatabase({ attribution: true });
  let mcp;
  try {
    const baseline = await runAttributionScenario(db);
    mcp = await createPreviewMcp(db);
    const duplicate = { ...attributionLines[0], id: '00000000-0000-0000-0000-000000009999',
      account_id: 'act_900200', campaign_id: 'synthetic_ambiguous_campaign', adset_id: 'synthetic_ambiguous_set' };
    const scope = { cliente_id: CLIENT, semana: WEEK };
    toolPayload(await mcp.client.callTool({ name: 'gestor_ia_salvar_semana', arguments: {
      ...scope, linhas: [...attributionLines, duplicate], revision: baseline.review.revision } }));
    const before = attributionWriteState(db);
    const result = toolPayload(await mcp.client.callTool({ name: 'gestor_ia_ver_leads', arguments: {
      ...scope, conjunto_ids: [attributionLines[0].adset_id] } }));
    assert.equal(result.leads.length, 0, 'selection retains ambiguity from every saved review row');
    assert.ok(result.unmatchedLeads.some(({ routineMatchReason }) => /amb.gua|conflitante/i.test(routineMatchReason)));
    assert.deepEqual(attributionWriteState(db), before);
  } finally { if (mcp) await mcp.close(); db.close(); }
});

test('separate paused-origin scenario adds a historical zero-spend row without changing new-lead CPA', async () => {
  const db = createPreviewDatabase({ attribution: true });
  let mcp;
  try {
    const baseline = await runAttributionScenario(db);
    db.sql(`INSERT INTO public.cliente_whatsapp_contact(id,cliente_id,from_jid,phone,sender_name,whatsapp_config_id,first_seen_at,origin_source,tracking_data,mini_crm)
      VALUES('30000000-0000-0000-0000-000000000800',${literal(CLIENT)}::uuid,'5511988000800@s.whatsapp.net','5511988000800','Lead histórico sintético',
      '00000000-0000-0000-0000-000000000020','2026-10-01 12:00Z','meta_ads','{"account_id":"act_900100","campaign_id":"synthetic_paused","adset_id":"synthetic_paused_set"}','{"status":"agendado"}');
      INSERT INTO public.mini_crm_message_history(cliente_id,contact_id,channel_id,message_id,message_at,status,reason,appointment_day)
      VALUES(${literal(CLIENT)}::uuid,'30000000-0000-0000-0000-000000000800','synthetic-channel','synthetic-paused-event','2026-11-12 15:00Z','agendado','appointment','2026-11-20');
      UPDATE public.gestor_ia_meta_cache SET dados=jsonb_set(jsonb_set(dados,'{adDays}',dados->'adDays'||'[{"campaign_id":"synthetic_paused","campaign_name":"Campanha sintética pausada","adset_id":"synthetic_paused_set","adset_name":"Conjunto histórico sintético","date_start":"2026-10-01","spend":"900"}]'),
      '{campaignMeta,synthetic_paused}','{"status":"PAUSED"}') WHERE conta_id='act_900100';`);
    mcp = await createPreviewMcp(db);
    const before = attributionWriteState(db);
    const result = toolPayload(await mcp.client.callTool({ name: 'gestor_ia_ver_leads', arguments: {
      cliente_id: CLIENT, semana: WEEK, modo: 'agendados_na_semana' } }));
    assert.equal(result.summary.total, 21, 'extra synthetic case stays separate from the baseline twenty');
    assert.equal(result.summary.novos, 14);
    assert.equal(result.summary.antigos, 7);
    assert.equal(result.leads.length, 5);
    assert.equal(result.unmatchedLeads.length, 16);
    assert.equal(result.summary.atribuidos.cpaNovos, 4);
    assert.equal(result.summary.atribuidos.cpa, baseline.appointments.summary.atribuidos.cpa);
    assert.ok(result.originRows.some((row) => row.campaign_id === 'synthetic_paused' && row.status === 'campanha_encerrada'
      && row.spend === 0 && row.antigos === 1 && row.cpa === null));
    assert.deepEqual(attributionWriteState(db), before);
    assert.equal(db.json(`SELECT count(*) FROM public.mini_crm_status_history WHERE actor_id=${literal(ACTOR)}::uuid`, 'service_role'), 0);
  } finally { if (mcp) await mcp.close(); db.close(); }
});

test('current preview advances only the synthetic aggregate snapshot from 70/20 to 78/22', async () => {
  const db = createPreviewDatabase({ attribution: true });
  try {
    const result = await runAttributionScenario(db, { current: true });
    assert.equal(result.initialAggregates.entries, 70);
    assert.equal(result.initialAggregates.appointments, 20);
    assert.equal(result.syntheticAggregates.entries, 78);
    assert.equal(result.entry.leads.length, 14);
    assert.equal(result.entry.unmatchedLeads.length, 64);
    assert.equal(result.appointments.summary.total, 22);
    assert.equal(result.appointments.summary.novos, 15);
    assert.equal(result.appointments.summary.antigos, 7);
    assert.equal(result.appointments.leads.length, 4);
    assert.equal(result.appointments.unmatchedLeads.length, 18);
    assert.equal(result.review.validation_state, 'rascunho_ia');
  } finally { db.close(); }
});

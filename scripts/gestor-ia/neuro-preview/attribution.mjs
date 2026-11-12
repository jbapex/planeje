import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CLIENT, WEEK } from './db.mjs';
import { runRoutineScenario } from './scenario.mjs';
import { createPreviewFetch } from './bridge.mjs';
import { createPreviewMcp, toolPayload } from './mcp.mjs';

export const attributionLines = Array.from({ length: 9 }, (_, index) => {
  const slot = String(index + 1).padStart(2, '0');
  return { id: `00000000-0000-0000-0000-${String(index + 101).padStart(12, '0')}`, platform: 'meta',
    account_id: 'act_900100', account_name: 'Conta sintética da demonstração',
    campaign_id: `synthetic_campaign_${slot}`, campaign_name: `Campanha sintética ${slot}`,
    adset_id: `synthetic_set_${slot}`, adset_name: `Conjunto sintético ${slot}`,
    spend: 125 + index * 25, messages: index < 7 ? 8 : 7, appointments: index < 4 ? 1 : 0 };
});

export function attributionWriteState(db) {
  return db.json(`SELECT jsonb_build_object(
    'reviews',(SELECT md5(string_agg(to_jsonb(t)::text,'' ORDER BY id)) FROM public.traffic_weekly_reviews t),
    'tasks',(SELECT md5(string_agg(to_jsonb(t)::text,'' ORDER BY id)) FROM public.tarefas t),
    'history',(SELECT md5(string_agg(to_jsonb(t)::text,'' ORDER BY id)) FROM public.traffic_weekly_history t),
    'contacts',(SELECT md5(string_agg(to_jsonb(t)::text,'' ORDER BY id)) FROM public.cliente_whatsapp_contact t),
    'appointments',(SELECT count(*) FROM public.mini_crm_message_history),
    'status_history',(SELECT count(*) FROM public.mini_crm_status_history))`, 'service_role');
}

async function inspectAttribution(db, mcp, current = false) {
  const counts = current
    ? { entries: 78, entryUnmatched: 64, appointments: 22, newAppointments: 15, oldAppointments: 7, unmatchedAppointments: 18 }
    : { entries: 70, entryUnmatched: 56, appointments: 20, newAppointments: 14, oldAppointments: 6, unmatchedAppointments: 16 };
  const before = attributionWriteState(db);
  const fetch = createPreviewFetch(db);
  await assert.rejects(() => fetch('https://external.invalid/rest/v1/profiles'), /External network blocked/);
  const raw = await fetch('http://127.0.0.1:4395/rest/v1/rpc/gestor_ia_routine_leads_data', {
    method: 'POST', body: JSON.stringify({ p_client: CLIENT, p_week: WEEK, p_actor: null, p_mode: 'entrada' }),
  });
  const rawText = await raw.text();
  assert.equal(raw.status, 200, rawText);
  const dto = JSON.parse(rawText);
  assert.equal(dto.contacts.length, counts.entries);
  assert.equal(dto.contacts.filter(({ tracking_data: tracking }) => tracking.campaign_name && tracking.adset_name).length, 15);
  assert.equal(dto.contacts.filter(({ tracking_data: tracking }) => tracking.campaign_id && tracking.adset_id).length, 0, 'before: zero exact campaign/adset IDs');
  const scope = { cliente_id: CLIENT, semana: WEEK };
  const entryResult = await mcp.client.callTool({ name: 'gestor_ia_ver_leads', arguments: scope });
  const entry = toolPayload(entryResult);
  assert.equal(entry.leads.length, 14, 'after: fourteen unique name matches in nine review lines');
  assert.equal(entry.unmatchedLeads.length, counts.entryUnmatched);
  assert.ok(entry.leads.every(({ routineMatchMethod }) => routineMatchMethod === 'name'));
  assert.ok(entry.unmatchedLeads.some(({ routineMatchReason }) => /fora da revisão/i.test(routineMatchReason)));
  const appointmentsResult = await mcp.client.callTool({ name: 'gestor_ia_ver_leads', arguments: { ...scope, modo: 'agendados_na_semana' } });
  const appointments = toolPayload(appointmentsResult);
  assert.equal(appointments.summary.total, counts.appointments);
  assert.equal(appointments.summary.novos, counts.newAppointments);
  assert.equal(appointments.summary.antigos, counts.oldAppointments);
  assert.equal(appointments.leads.length, 4);
  assert.equal(appointments.unmatchedLeads.length, counts.unmatchedAppointments);
  assert.ok(appointments.leads.every(({ routineMatchMethod }) => routineMatchMethod === 'name'));
  assert.equal(appointments.summary.atribuidos.cpaNovos, 4);
  for (const result of [entryResult, appointmentsResult]) {
    const value = JSON.stringify(result);
    for (const forbidden of ['ATTRIBUTION_PRIVATE_CANARY', 'ClienteSecretoSintetico', '@s.whatsapp.net',
      ...Array.from({ length: 85 }, (_, index) => `5511988${String(index + 1).padStart(6, '0')}`)]) {
      assert.ok(!value.includes(forbidden), 'raw MCP protocol response must exclude personal fixture fields and payloads');
      assert.ok(!rawText.includes(forbidden), 'raw SQL HTTP projection must exclude personal fixture fields and payloads');
    }
  }
  for (const args of [{ ...scope, modo: 'invalido' }, { ...scope, conjunto_ids: ['unknown_synthetic_set'] }]) {
    const denied = await mcp.client.callTool({ name: 'gestor_ia_ver_leads', arguments: args });
    assert.equal(denied.isError, true);
  }
  assert.deepEqual(attributionWriteState(db), before, 'all successful, invalid and unknown leads reads leave data unchanged');
  return { entry, appointments, leads: entry, rawPrivacyChecked: true,
    syntheticAggregates: { entries: counts.entries, namedPairs: 15, linkedByName: 14, outsideReview: 1,
      appointments: counts.appointments, newAppointments: counts.newAppointments, oldAppointments: counts.oldAppointments,
      attributedAppointments: 4, unattributedAppointments: counts.unmatchedAppointments } };
}

export async function runAttributionScenario(db, { current = false } = {}) {
  assert.equal(db.json(`SELECT count(*) FROM public.cliente_whatsapp_contact WHERE cliente_id='${CLIENT}' AND first_seen_at>='2026-11-09 03:00Z' AND first_seen_at<'2026-11-16 03:00Z'`), 70);
  const initial = await runRoutineScenario(db, { lines: attributionLines,
    analysis: 'Snapshot inicial sintético de agregados: 70 entradas, 14 vínculos por nome; 20 agendados, sendo 14 novos e 6 antigos. Quatro agendados atribuídos e 16 sem vínculo. Nenhum dado real foi carregado.',
    inspectLeads: inspectAttribution });
  if (!current) return initial;
  db.sql(readFileSync(new URL('./attribution-current.sql', import.meta.url), 'utf8'));
  const mcp = await createPreviewMcp(db);
  try {
    return { ...initial, initialAggregates: initial.syntheticAggregates, ...await inspectAttribution(db, mcp, true) };
  } finally { await mcp.close(); }
}

import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const folder = await mkdtemp(join(tmpdir(), 'crm-calendar-runtime-'));
const output = join(folder, 'runtime.mjs');
await build({ entryPoints: ['supabase/functions/_shared/crmIaRuntime.ts'], outfile: output, bundle: true, format: 'esm', platform: 'node' });
const { runCrmIaAgent } = await import(pathToFileURL(output));
const clientId = '00000000-0000-4000-8000-000000000011', channelId = '00000000-0000-4000-8000-000000000021', contactId = '00000000-0000-4000-8000-000000000031';
const ownerId = '00000000-0000-4000-8000-000000000041', leadId = '00000000-0000-4000-8000-000000000051';
const slot = { start_at: '2026-11-12T15:00:00Z', end_at: '2026-11-12T15:30:00Z' };
function fixture({ text = 'Quero agendar 12/11/2026', claimed = true } = {}) {
  const calls = [];
  const agent = { id: 'agent', nome: 'Agenda sintética', modelo: 'openai/gpt-4o-mini', ativo: true, auto_responder: true, base_ids: [], funil: { crm_ia: { tipo: 'agendamento', pipeline_id: 'pipeline', stage_ids: ['stage'], agendamento: { owner_id: ownerId }, destino: { tipo: 'humano' } } } };
  const lead = { id: leadId, pipeline_id: 'pipeline', stage_id: 'stage', responsavel_id: ownerId, crm_ia_fields: {}, updated_at: '2026-11-11T10:00:00Z' };
  const contact = { id: contactId, from_jid: '5511000000000@s.whatsapp.net' };
  const conversation = { id: 'conversation', updated_at: lead.updated_at };
  const config = { revision: 'revision', data: { attendance: { auto_send: true }, availability: { timezone: 'America/Sao_Paulo' } } };
  let applied;
  const data = { cliente_atend_ia_agentes: [agent], crm_ia_config: [config], cliente_whatsapp_contact: [contact], cliente_whatsapp_config: [{ id: channelId }],
    cliente_whatsapp_inbox: [{ id: 'inbox', message_id: 'message', body: text, type: 'text', from_jid: contact.from_jid, chat_jid: contact.from_jid, created_at: lead.updated_at }], cliente_whatsapp_sent: [], clientes: [{ empresa: 'Conta sintética' }] };
  return { calls, agent, get applied() { return applied; }, db: { from(table) {
    let single = false;
    const query = { select() { return query; }, eq() { return query; }, is() { return query; }, or() { return query; }, order() { return query; }, limit() { return query; }, in() { return query; }, insert() { return query; },
      maybeSingle() { single = true; return query; }, then(resolve, reject) { const rows = data[table] || []; return Promise.resolve({ data: single ? rows[0] || null : rows }).then(resolve, reject); } };
    return query;
  }, async rpc(name, args) {
    calls.push(name);
    if (name === 'crm_ia_agent_intake') return { data: { lead, contact, conversation, config, actor_id: ownerId } };
    if (name === 'crm_ia_agent_begin') return { data: claimed ? { claimed: true, id: 'run' } : { claimed: false, skipped: 'snapshot_changed' } };
    if (name === 'crm_ia_agent_slots') return { data: { rows: [slot] } };
    if (name === 'crm_ia_apply_agent_action') { applied = args; return { data: { queued: true } }; }
    if (name === 'crm_ia_agent_fail') return { data: null };
    assert.fail(name);
  } } };
}
async function execute(f, options = {}) {
  return runCrmIaAgent({ db: f.db, clientId, channelId, contactId, messageId: 'message', mode: 'responder', now: '2026-11-11T15:00:00Z',
    refreshCalendar: async args => { f.calls.push('busy'); assert.equal(args.ownerId, ownerId); assert.equal(args.leadId, leadId); return { required: true, fresh: true }; },
    callModel: async () => { f.calls.push('model'); return { resposta: JSON.stringify({ text: 'Qual horário prefere?', action: { type: 'answer' } }) }; }, ...options });
}
test('reserva o processamento antes de consultar Google e oferece apenas slots conferidos', async () => {
  const f = fixture(); await execute(f);
  assert.ok(f.calls.indexOf('crm_ia_agent_begin') < f.calls.indexOf('busy'));
  assert.ok(f.calls.indexOf('busy') < f.calls.indexOf('crm_ia_agent_slots'));
  assert.ok(f.calls.indexOf('crm_ia_agent_slots') < f.calls.indexOf('model'));
  const changed = fixture({ claimed: false }); await execute(changed);
  assert.equal(changed.calls.includes('busy'), false); assert.equal(changed.calls.includes('model'), false);
});
test('falha de consulta do Google encaminha à equipe sem inventar indisponibilidade ou consumir modelo', async () => {
  for (const refreshCalendar of [async () => { throw new Error('calendar_unavailable'); }, async () => ({ required: true, fresh: false })]) {
    const f = fixture(); await execute(f, { refreshCalendar });
    assert.equal(f.calls.includes('model'), false); assert.equal(f.calls.includes('crm_ia_agent_slots'), false);
    assert.equal(f.applied.p_action.type, 'handoff'); assert.match(f.applied.p_reply, /conferir|equipe/);
  }
});
test('data solicitada pelo modelo também confere Google antes de enumerar horários', async () => {
  const f = fixture({ text: 'Olá' });
  await execute(f, { callModel: async () => { f.calls.push('model'); return { resposta: JSON.stringify({ text: '', action: { type: 'slots', date: '2026-11-12' } }) }; } });
  assert.ok(f.calls.indexOf('busy') > f.calls.indexOf('model'));
  assert.ok(f.calls.indexOf('crm_ia_agent_slots') > f.calls.indexOf('busy'));
});
test('teste textual do agente não consulta agenda nem cria reserva', async () => {
  const f = fixture(); await execute(f, { mode: 'testar', agentId: f.agent.id, previewMessages: [{ role: 'user', content: 'Quero agendar 12/11/2026' }] });
  assert.equal(f.calls.includes('busy'), false); assert.equal(f.calls.includes('crm_ia_apply_agent_action'), false);
});
test.after(() => rm(folder, { recursive: true, force: true }));

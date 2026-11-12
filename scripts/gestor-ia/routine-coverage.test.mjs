import assert from 'node:assert/strict';
import { test } from 'node:test';
import { selectRoutineLeads, routineValidationState } from '../../src/lib/gestorIaRoutine.js';

const row = { platform: 'meta', account_id: 'act_700', campaign_id: '10001', adset_id: '20001' };
const contact = (id, patch = {}) => ({ id, cliente_id: 'client-a', phone: '5518997941487', from_jid: '5518997941487@s.whatsapp.net', sender_name: 'Contato 5518997941487', origin_source: 'meta_ads', first_seen_at: '2026-11-10T14:00:00Z', tracking_data: { account_id: '700', campaign_id: '10001', adset_id: '20001', raw_phone: '5518997941487' }, mini_crm: {}, ...patch });
const options = { clientId: 'client-a', weekStart: '2026-11-09', rows: [row], config: null, niche: 'Loja de noivas' };
test('separa não atribuídos sem esconder Google, manual ou Meta incompleto', () => {
  const result = selectRoutineLeads([contact('meta'), contact('google', { origin_source: 'google_ads' }), contact('manual', { origin_source: 'site', tracking_data: {} }), contact('missing', { tracking_data: {} }), contact('other-set', { tracking_data: { account_id: '700', campaign_id: '10001', adset_id: '20002' } })], options);
  assert.deepEqual(result.leads.map(l => l.id), ['meta']);
  assert.deepEqual(result.unmatchedLeads.map(l => l.id), ['google', 'manual', 'missing']);
  assert.equal(result.unattributed, 1);
  assert.equal(JSON.stringify(result).includes('5518997941487'), false);
  assert.equal(result.leads[0].phone, '•••• 1487');
});
test('conversa confirmada gera alerta sem mudar o Mini CRM', () => {
  const lead = contact('one'); const before = structuredClone(lead);
  const result = selectRoutineLeads([lead], { ...options, appointmentsOnly: true, messages: [{ contact_id: 'one', text: 'Agendamento confirmado para 20/11 às 14h.', direction: 'equipe', at: '2026-11-16T14:00:00Z' }] });
  assert.equal(result.leads[0].routineScheduleSource, 'conversation');
  assert.equal(result.leads[0].routineCrmOutdated, true);
  assert.equal(result.leads[0].routineAppointment, '2026-11-20');
  assert.deepEqual(lead, before);
});
test('negação CRM não infla agendamento e vazamento não retorna em campos secundários', () => {
  const result = selectRoutineLeads([contact('no', { mini_crm: { status: 'Não agendado', data_agendamento: '2026-11-20' } })], { ...options, config: { statuses: [{ key: 'Não agendado', label: 'Não agendado' }] }, appointmentsOnly: true });
  assert.equal(result.leads.length, 0);
  const all = selectRoutineLeads([contact('one')], { ...options, rows: [] });
  assert.equal(all.leads.length, 1);
  assert.equal(all.leads[0].from_jid, undefined);
  assert.equal(all.leads[0].tracking_data, undefined);
});
test('estado distingue rascunho IA, revisão humana e validação legada', () => {
  assert.equal(routineValidationState(null), 'a_preencher');
  assert.equal(routineValidationState({ revision: 1 }), 'em_revisao');
  assert.equal(routineValidationState({ validation_state: 'rascunho_ia', fill_origin: 'ia' }), 'rascunho_ia');
  assert.equal(routineValidationState({ finalized_at: '2026-11-16' }), 'validado');
});

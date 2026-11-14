import assert from 'node:assert/strict';
import test from 'node:test';
const api = await import('../../supabase/functions/_shared/crmIaAgent.js').catch(() => null);
test('typed agent executor is available', () => assert.ok(api, 'typed executor missing'));
const now = '2026-11-11T15:00:00Z'; // Wednesday, 12:00 in São Paulo.
const lead = { id: 'lead', pipeline_id: 'pipeline', stage_id: 'stage', crm_ia_fields: {} };
const rules = { tipo: 'qualificacao', pipeline_id: 'pipeline', stage_ids: ['stage'], idiomas: ['pt'], audio: 'nunca', variaveis: [{ nome: 'cidade', pergunta: 'Qual cidade?' }], janelas: [], destino: { tipo: 'humano' } };
const agent = { id: 'agent', nome: 'Assistente Aurora', ativo: true, auto_responder: true, funil: { crm_ia: rules } };
const config = { attendance: { auto_send: true }, test_mode: { enabled: false }, availability: { timezone: 'America/Sao_Paulo' } };
if (api) {
  test('runtime diagnostics accept bounded internal codes without exposing arbitrary failures', () => {
    const code = failure => api.crmIaFailureCode?.(failure);
    assert.equal(code(new Error('crm_ia_booking_not_confirmed')), 'crm_ia_booking_not_confirmed');
    for (const failure of [null, { message: 'crm_ia_model_unavailable' }, new Error('fixture secret or provider payload'), new Error('crm_ia_' + 'x'.repeat(65)), new Error('crm_ia_booking_not_confirmed\nfixture secret'), ...['\n', '\r', '\u2028'].map(end => new Error('crm_ia_booking_not_confirmed' + end))]) {
      assert.equal(code(failure), 'unexpected');
    }
  });
  test('routing requires pipeline, assigned stage, autonomy and no human pause', () => {
    const select = patch => api.selectCrmIaAgent({ agents: [agent], lead, conversation: {}, config, now, ...patch });
    assert.equal(select().agent.id, 'agent');
    for (const patch of [{ lead: { ...lead, pipeline_id: 'other' } }, { lead: { ...lead, stage_id: 'other' } }, { conversation: { ia_pausada: true } }, { config: { attendance: { auto_send: false } } }]) assert.equal(select(patch).agent, null);
    assert.equal(select({ agents: [{ ...agent, auto_responder: false }], mode: 'testar', agentId: 'agent' }).agent.id, 'agent');
  });
  test('calendar windows use the configured timezone and exclusive closing time', () => {
    const a = { ...agent, funil: { crm_ia: { ...rules, janelas: [{ dias: [3], inicio: '12:00', fim: '13:00' }] } } };
    assert.equal(api.selectCrmIaAgent({ agents: [a], lead, conversation: {}, config, now }).agent.id, 'agent');
    assert.equal(api.selectCrmIaAgent({ agents: [a], lead, conversation: {}, config, now: '2026-11-11T16:00:00Z' }).reason, 'outside_hours');
  });
  test('followup is routed only in silence mode and never replaces qualification on an inbound reply', () => {
    const f = { ...agent, id: 'followup', funil: { crm_ia: { ...rules, tipo: 'followup' } } };
    assert.equal(api.selectCrmIaAgent({ agents: [f, agent], lead, conversation: {}, config, now }).agent.id, 'agent');
    assert.equal(api.selectCrmIaAgent({ agents: [agent, f], lead, conversation: {}, config, now, mode: 'followup' }).agent.id, 'followup');
  });
  test('handoff phrases and desinterest produce bounded configured actions', () => {
    assert.equal(api.crmIaDeterministicAction({ rules: { ...rules, gatilhos: ['falar com pessoa'] }, text: 'Quero falar com pessoa' }).type, 'handoff');
    assert.equal(api.crmIaDeterministicAction({ rules, text: 'Não tenho interesse' }).type, 'close');
    assert.equal(api.crmIaDeterministicAction({ rules: { ...rules, desinteresse: 'humano' }, text: 'Pode parar de enviar mensagens' }).type, 'handoff');
    assert.equal(api.crmIaDeterministicAction({ rules, text: 'Tenho interesse' }), null);
  });
  test('typed prompt uses client knowledge/catalog/languages and never adopts the legacy agency persona', () => {
    const prompt = api.buildCrmIaPrompt({ agent, lead, company: 'Oficina Aurora', bases: [{ nome: 'Base', conteudo: 'Horário: 9 às 18.' }], products: [{ name: 'Revisão', crm_ia_details: { description: 'Revisão completa', price: 120 } }], config, slots: [] });
    assert.match(prompt, /Oficina Aurora/); assert.match(prompt, /Revisão/); assert.match(prompt, /Qual cidade/);
    assert.ok(!prompt.includes('Ápice')); assert.match(prompt, /reserva|reservad/);
  });
  test('calendar and followup prompts do not request qualification values; calendar dates have their own action field', () => {
    for (const tipo of ['agendamento', 'followup']) {
      const current = { ...rules, tipo, variaveis: [] }, prompt = api.buildCrmIaPrompt({ agent: { ...agent, funil: { crm_ia: current } } });
      assert.doesNotMatch(prompt, /"type":"answer\|qualify|"values":\{\}/);
      assert.match(prompt, /Não inclua action\.values/);
      if (tipo === 'agendamento') assert.match(prompt, /"action":\{"type":"slots","date":"YYYY-MM-DD"\}/);
      assert.throws(() => api.validateCrmIaAction({ action: { type: 'answer', values: { data: '2026-11-12' } }, rules: current }), /invalid_variables/);
    }
  });
  test('qualification prompt preserves its published variable contract and completion action', () => {
    const prompt = api.buildCrmIaPrompt({ agent });
    assert.match(prompt, /action\.values/); assert.match(prompt, /"qualify"/); assert.match(prompt, /cidade/);
    assert.doesNotThrow(() => api.validateCrmIaAction({ action: { type: 'qualify', values: { cidade: 'Curitiba' } }, rules }));
  });
  test('booking instructions belong to the scheduling agent; Concierge receives its appointment tools', () => {
    const cfg = { concierge: { enabled: true, appointment_reschedule: true } };
    for (const tipo of ['qualificacao', 'followup', 'agendamento']) {
      const current = { ...agent, funil: { crm_ia: { ...rules, tipo } } }, prompt = api.buildCrmIaPrompt({ agent: current, config: cfg, concierge: true });
      assert.doesNotMatch(prompt, /Para reservar, use action\.type="book"|Para book inclua/);
      assert.match(prompt, /"type":"slots","date":"YYYY-MM-DD"/); assert.match(prompt, /appointment_propose/);
    }
    const prompt = api.buildCrmIaPrompt({ agent: { ...agent, funil: { crm_ia: { ...rules, tipo: 'agendamento' } } } });
    assert.match(prompt, /Para reservar, use action\.type="book"/);
  });
  test('malformed or invented actions never become a booking; booking needs a supplied slot and explicit request', () => {
    assert.equal(api.parseCrmIaModelResult('Olá').action.type, 'answer');
    assert.throws(() => api.parseCrmIaModelResult('{"text":"ok","action":{"type":"delete"}}'), /action/);
    const slot = { start_at: '2026-11-12T15:00:00Z', end_at: '2026-11-12T15:30:00Z' };
    assert.throws(() => api.validateCrmIaAction({ action: { type: 'book', ...slot }, rules, slots: [slot], text: 'Olá' }), /booking/);
    assert.equal(api.validateCrmIaAction({ action: { type: 'book', ...slot }, rules: { ...rules, tipo: 'agendamento' }, slots: [slot], text: 'Confirmo esse horário' }).type, 'book');
  });
  test('cadence deadlines remain anchored to the original silence, not the previous reminder', () => {
    const r = { ...rules, tipo: 'followup', cadencia: [{ valor: 1, unidade: 'horas' }, { valor: 1, unidade: 'dias' }] };
    assert.equal(api.crmIaCadenceDue(r, 0, now), '2026-11-11T16:00:00.000Z');
    assert.equal(api.crmIaCadenceDue(r, 1, now), '2026-11-12T15:00:00.000Z');
    assert.equal(api.crmIaCadenceDue(r, 2, now), null);
  });
  test('Concierge respects human pause and its own base/authorization', () => {
    const a = { ...agent, funil: { crm_ia: { ...rules, janelas: [{ dias: [1], inicio: '09:00', fim: '18:00' }] } } };
    const cfg = { ...config, concierge: { enabled: true, base_id: 'faq', mode: 'outside_hours' },
      availability: { timezone: 'America/Sao_Paulo', windows: [{ owner_id: 'team', days: [1], start: '09:00', end: '18:00' }] } };
    assert.equal(api.selectCrmIaAgent({ agents: [a], lead, conversation: {}, config: cfg, now }).concierge, true);
    assert.equal(api.selectCrmIaAgent({ agents: [a], lead, conversation: { ia_pausada: true }, config: cfg, now }).agent, null);
    assert.equal(api.selectCrmIaAgent({ agents: [a], lead, conversation: { crm_ia_runtime: { last_human_at: '2026-11-11T14:59:00Z' } }, config: { ...cfg, concierge: { ...cfg.concierge, human_wait_minutes: 10 } }, now }).agent, null);
  });
}

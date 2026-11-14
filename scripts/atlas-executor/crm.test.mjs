import assert from 'node:assert/strict';
import test from 'node:test';
import { createClient } from '@supabase/supabase-js';
import { EXECUTOR_CRM_CATALOG, readExecutorCrm, prepareExecutorCrm } from '../../supabase/functions/_shared/atlasExecutorCrm.js';

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const clientId = id(1), pipelineId = id(2), stageId = id(3), agentId = id(4), leadId = id(5), ownerId = id(6), contactId = id(7), channelId = id(8), baseId = id(9), appointmentId = id(10);
const stamp = '2026-11-12T10:00:00.123456+00:00', revision = id(11);
function workspace() {
  return { client: { id: clientId, empresa: 'Empresa fictícia' }, permissions: { manage: true }, provisioned: true,
    pipelines: [{ id: pipelineId, cliente_id: clientId, nome: 'Comercial', is_default: true, updated_at: stamp }],
    stages: [{ id: stageId, pipeline_id: pipelineId, nome: 'Entrada', tipo: 'intermediaria', color: '#6366f1', ordem: 0, crm_ia_icon: 'Inbox', updated_at: stamp }],
    agents: [{ id: agentId, cliente_id: clientId, nome: 'Qualificação', objetivo: 'Objetivo atual', instrucoes: 'Texto atual', tom: 'formal', modelo: 'openai/gpt-4o', ativo: true, auto_responder: false,
      base_ids: [baseId], setor_ids: [id(12)], funil: { legacy_rule: { enabled: true }, crm_ia: { tipo: 'qualificacao', pipeline_id: pipelineId, stage_ids: [stageId], audio: { enabled: false, input_enabled: false, voice: 'alloy', speed: 1 }, variaveis: [{ nome: 'Objetivo', pergunta: 'Qual objetivo?' }], profiles: [], destino: { tipo: 'humano' }, unknown_rule: { keep: true } } }, updated_at: stamp }],
    bases: [{ id: baseId, cliente_id: clientId, nome: 'Base', conteudo: 'Texto preservado', updated_at: stamp }],
    products: [{ id: id(13), cliente_id: clientId, name: 'Produto', code: 'P1', item_tipo: 'produto', crm_ia_details: { price: 100, description: 'Descrição atual', active: true, inventory_note: 'Preservar' }, updated_at: stamp }],
    config: { revision, data: { attendance: { auto_send: false, pause_on_human: true, restart_triage: true }, knowledge: { assignments: [{ pipeline_id: pipelineId, base_id: baseId }], concierge_base_id: baseId, preserved: true } } },
    channels: [{ id: channelId, can_send: true }], people: [{ id: ownerId, full_name: 'Pessoa' }], templates: [] };
}
function fixture(overrides = {}) {
  const calls = [], snapshot = workspace();
  const lead = { id: leadId, cliente_id: clientId, nome: 'Lead', whatsapp: '5511999999999', email: 'lead@example.test', valor: 10, origem: 'manual', observacoes: 'Preservar nota', pipeline_id: pipelineId, stage_id: stageId, responsavel_id: ownerId, crm_ia_fields: { curso: 'A' }, etiquetas: ['VIP'], updated_at: stamp, contact_id: contactId };
  const handlers = { workspace: () => snapshot, lead: () => ({ lead, events: [{ id: id(14), realizado_em: stamp }], appointments: [], conversations: [] }),
    messages: () => ({ rows: [{ id: id(15), body: 'Mensagem autorizada. token=secret-value', raw_payload: { ignore: 'segredo' }, created_at: stamp, from_me: false }], total: 1,
      state: { contact_id: contactId, channel_id: channelId, nome: 'Contato', attendance: 'human', assigned_to: ownerId, updated_at: stamp } }),
    agenda: () => ({ rows: [{ id: appointmentId, cliente_id: clientId, owner_id: ownerId, lead_id: leadId, contact_id: contactId, start_at: '2026-12-01T12:00:00Z', end_at: '2026-12-01T12:30:00Z', title: 'Atendimento', notes: 'Nota', request_id: id(16), status: 'scheduled', updated_at: stamp }], total: 1, timezone: 'America/Sao_Paulo' }),
    leads: () => ({ rows: [lead], total: 3, stage_totals: [], coverage: { conversations: 'available' } }),
    ...overrides };
  const caller = createClient('https://fixture.invalid', 'synthetic-public-key', { auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: 'Bearer synthetic-session' }, fetch: async (url, init) => {
      assert.equal(new URL(url).pathname, '/rest/v1/rpc/crm_ia_workspace');
      const body = JSON.parse(init.body); calls.push({ ...body, authorization: new Headers(init.headers).get('authorization') });
      assert.equal(body.p_client_id, clientId);
      assert.ok(handlers[body.p_action], `Preparação não pode chamar mutação: ${body.p_action}`);
      const result = handlers[body.p_action](body.p_payload);
      return new Response(JSON.stringify(result), { status: result?.code ? 403 : 200, headers: { 'content-type': 'application/json' } });
    } } });
  return { caller, calls, snapshot, lead };
}

test('conversa usa mensagens autorizadas do contato/canal exatos e remove segredos da fonte', async () => {
  const f = fixture();
  const source = await readExecutorCrm(f.caller, { clientId, view: 'conversation', input: { contact_id: contactId, channel_id: channelId, limit: 20, offset: 0 } });
  assert.equal(source.available, true);
  assert.equal(source.client_id, clientId);
  assert.equal(source.data.rows[0].body, 'Mensagem autorizada. [segredo removido]');
  assert.equal(source.data.rows[0].raw_payload, undefined);
  assert.equal(source.coverage.private_messages_read, true);
  assert.deepEqual(f.calls.map(({ authorization, ...body }) => body), [{ p_action: 'messages', p_client_id: clientId, p_payload: { contact_id: contactId, channel_id: channelId, limit: 20, offset: 0 } }]);
  assert.equal(f.calls[0].authorization, 'Bearer synthetic-session');
  assert.match(source.links[0].href, /contact_id=/);
});

test('leituras filtradas preservam página/cobertura; histórico vem da ficha oficial', async () => {
  const f = fixture();
  const leads = await readExecutorCrm(f.caller, { clientId, view: 'leads', input: { pipeline_id: pipelineId, limit: 1, offset: 1 } });
  assert.equal(leads.coverage.complete, false); assert.equal(leads.coverage.total, 3); assert.equal(leads.coverage.next_offset, 2);
  const history = await readExecutorCrm(f.caller, { clientId, view: 'history', input: { id: leadId } });
  assert.equal(history.data.events[0].id, id(14));
  assert.deepEqual(f.calls[1].p_payload, { id: leadId }); assert.equal(f.calls[1].p_action, 'lead');
});

test('fonte revogada e operação sem contrato não viram lista vazia nem fazem fallback', async () => {
  const f = fixture({ leads: () => ({ code: '42501', message: 'Sem acesso.' }) });
  const denied = await readExecutorCrm(f.caller, { clientId, view: 'leads' });
  assert.equal(denied.available, false); assert.equal(denied.data, null);
  const unsupported = await readExecutorCrm(f.caller, { clientId, view: 'agent_draft' });
  assert.equal(unsupported.available, false); assert.equal(f.calls.length, 1);
});

test('escopo, nomes e credenciais injetados são rejeitados antes de consultar', async () => {
  const f = fixture();
  for (const input of [{ client_id: id(100) }, { p_action: 'save_agent' }, { rpc: 'arbitrary' }, { search: 'Bearer secret-value' }, { token: 'secret-value' }]) {
    await assert.rejects(readExecutorCrm(f.caller, { clientId, view: 'leads', input }));
  }
  await assert.rejects(readExecutorCrm(f.caller, { clientId, view: 'conversation', input: { contact_id: contactId } }));
  await assert.rejects(prepareExecutorCrm(f.caller, { clientId, action: 'save_agent', input: { id: agentId, funil: { crm_ia: { secret: 'hidden' } } } }));
  assert.equal(f.calls.length, 0);
});

test('agente preserva modelo, funil legado e regras omitidas sem abrir rascunho', async () => {
  const f = fixture();
  const proposal = await prepareExecutorCrm(f.caller, { clientId, action: 'save_agent', input: { id: agentId, objetivo: 'Novo objetivo', funil: { crm_ia: { variaveis: [{ nome: 'Prazo', pergunta: 'Para quando?' }] } } } });
  assert.equal(proposal.payload.modelo, 'openai/gpt-4o');
  assert.equal(proposal.payload.expected_updated_at, stamp);
  assert.equal(proposal.payload.objetivo, 'Novo objetivo');
  assert.deepEqual(proposal.payload.funil.legacy_rule, { enabled: true });
  assert.deepEqual(proposal.payload.funil.crm_ia.unknown_rule, { keep: true });
  assert.deepEqual(proposal.payload.funil.crm_ia.variaveis, [{ nome: 'Prazo', pergunta: 'Para quando?' }]);
  assert.equal(proposal.payload.auto_responder, false);
  assert.equal(proposal.before.objetivo, 'Objetivo atual');
  assert.equal(proposal.preview.after.objetivo, 'Novo objetivo');
  assert.deepEqual(f.calls.map(call => call.p_action), ['workspace']);
  assert.equal(f.snapshot.agents[0].objetivo, 'Objetivo atual');
});

test('configuração mescla a seção atual e fixa revisão autoritativa e efeito de autonomia', async () => {
  const f = fixture();
  const proposal = await prepareExecutorCrm(f.caller, { clientId, action: 'save_config', input: { section: 'attendance', data: { auto_send: true }, revision: id(99) } });
  assert.deepEqual(proposal.payload, { section: 'attendance', revision, data: { auto_send: true, pause_on_human: true, restart_triage: true } });
  assert.equal(proposal.effect.enables_autonomy, true);
  assert.equal(proposal.preview.before.auto_send, false); assert.equal(proposal.preview.after.auto_send, true);
});

test('lead editado preserva campos omitidos e usa versão retornada pela ficha', async () => {
  const f = fixture();
  const proposal = await prepareExecutorCrm(f.caller, { clientId, action: 'save_lead', input: { id: leadId, nome: 'Novo nome', expected_updated_at: '2020-01-01T00:00Z' } });
  assert.equal(proposal.payload.whatsapp, '5511999999999'); assert.equal(proposal.payload.observacoes, 'Preservar nota');
  assert.deepEqual(proposal.payload.crm_ia_fields, { curso: 'A' }); assert.deepEqual(proposal.payload.etiquetas, ['VIP']);
  assert.equal(proposal.payload.expected_updated_at, stamp); assert.equal(proposal.payload.nome, 'Novo nome');
  assert.deepEqual(f.calls.map(call => call.p_action), ['workspace', 'lead']);
});

test('operações principais produzem payload canônico com fontes atuais, sem mutar', async () => {
  const cases = [
    ['save_pipeline', { id: pipelineId, nome: 'Novo funil' }, payload => { assert.equal(payload.expected_updated_at, stamp); assert.equal(payload.is_default, true); }],
    ['save_stage', { id: stageId, nome: 'Nova entrada' }, payload => { assert.equal(payload.pipeline_id, pipelineId); assert.equal(payload.color, '#6366f1'); assert.equal(payload.icon, 'Inbox'); }],
    ['reorder_stages', { pipeline_id: pipelineId, stage_ids: [stageId] }, payload => assert.equal(payload.expected_updated_at, stamp)],
    ['save_base', { id: baseId, nome: 'Nova base' }, payload => assert.equal(payload.conteudo, 'Texto preservado')],
    ['save_product', { id: id(13), crm_ia_details: { price: 150 } }, payload => { assert.equal(payload.name, 'Produto'); assert.equal(payload.crm_ia_details.inventory_note, 'Preservar'); }],
    ['move_lead', { id: leadId, stage_id: stageId }, payload => assert.equal(payload.expected_updated_at, stamp)],
    ['save_appointment', { id: appointmentId, source_date: '2026-12-01', title: 'Novo título' }, payload => { assert.equal(payload.expected_updated_at, stamp); assert.equal(payload.owner_id, ownerId); assert.equal(payload.request_id, id(16)); assert.equal(payload.source_date, undefined); }],
    ['cancel_appointment', { id: appointmentId, source_date: '2026-12-01' }, payload => assert.deepEqual(payload, { id: appointmentId, expected_updated_at: stamp })],
    ['save_conversation', { contact_id: contactId, channel_id: channelId, attendance: 'human' }, payload => assert.equal(payload.expected_updated_at, stamp)],
  ];
  for (const [action, input, check] of cases) {
    const f = fixture(), proposal = await prepareExecutorCrm(f.caller, { clientId, action, input });
    assert.equal(proposal.action, action); assert.equal(proposal.client_id, clientId); check(proposal.payload);
    assert.ok(f.calls.every(call => ['workspace', 'lead', 'agenda', 'messages'].includes(call.p_action)));
  }
});

test('preparação bloqueia alvo ausente, seleção parcial, acesso de gestão e dados inválidos', async () => {
  const cases = [
    ['save_pipeline', { id: id(100), nome: 'Ausente' }], ['save_stage', { id: stageId, pipeline_id: id(100), nome: 'Outra conta' }],
    ['reorder_stages', { pipeline_id: pipelineId, stage_ids: [] }], ['save_lead', { nome: 'Novo', whatsapp: '123' }],
    ['save_product', { name: 'Produto', crm_ia_details: { url: 'http://inseguro.test' } }],
    ['save_config', { section: 'unsupported', data: {} }], ['save_agent', { nome: 'Novo', modelo: 'outro-provedor', funil: { crm_ia: { tipo: 'qualificacao', pipeline_id: pipelineId } } }],
  ];
  for (const [action, input] of cases) await assert.rejects(prepareExecutorCrm(fixture().caller, { clientId, action, input }));
  const f = fixture(); f.snapshot.permissions.manage = false;
  await assert.rejects(prepareExecutorCrm(f.caller, { clientId, action: 'save_pipeline', input: { nome: 'Sem gestão' } }));
});

test('aborto propaga e falha de fonte impede preparar; publish sem leitura imutável é explícito', async () => {
  const controller = new AbortController(); controller.abort();
  const f = fixture();
  await assert.rejects(readExecutorCrm(f.caller, { clientId, view: 'workspace', signal: controller.signal }));
  assert.equal(f.calls.length, 0);
  const denied = fixture({ workspace: () => ({ code: '42501', message: 'Sem acesso.' }) });
  await assert.rejects(prepareExecutorCrm(denied.caller, { clientId, action: 'save_pipeline', input: { nome: 'Novo' } }));
  await assert.rejects(prepareExecutorCrm(f.caller, { clientId, action: 'publish_agent_draft', input: { agent_id: agentId, revision } }), /contrato|disponível/i);
});

test('agenda usa data original explícita ou ficha do lead e percorre somente páginas daquele dia', async () => {
  const f = fixture({ agenda: payload => {
    assert.equal(payload.since, '2026-12-01'); assert.equal(payload.until, '2026-12-01');
    return payload.offset === 0 ? { rows: [{ id: id(99) }], total: 2 } : { rows: [{ id: appointmentId, cliente_id: clientId, owner_id: ownerId, title: 'Anterior', request_id: id(16), notes: '', start_at: '2026-12-01T12:00:00Z', end_at: '2026-12-01T12:30:00Z', updated_at: stamp }], total: 2 };
  } });
  const proposal = await prepareExecutorCrm(f.caller, { clientId, action: 'cancel_appointment', input: { id: appointmentId, source_date: '2026-12-01' } });
  assert.equal(proposal.payload.expected_updated_at, stamp);
  assert.deepEqual(f.calls.filter(call => call.p_action === 'agenda').map(call => call.p_payload.offset), [0, 1]);
  const noDate = fixture();
  await assert.rejects(prepareExecutorCrm(noDate.caller, { clientId, action: 'cancel_appointment', input: { id: appointmentId } }), /data original|lead/i);
  assert.ok(noDate.calls.every(call => call.p_action === 'workspace'));
  const byLead = fixture({ lead: () => ({ lead: { id: leadId, cliente_id: clientId }, appointments: [{ id: appointmentId, cliente_id: clientId, owner_id: ownerId, title: 'Anterior', request_id: id(16), notes: '', start_at: '2026-12-01T12:00:00Z', end_at: '2026-12-01T12:30:00Z', lead_id: leadId, updated_at: stamp }] }) });
  const fromLead = await prepareExecutorCrm(byLead.caller, { clientId, action: 'save_appointment', input: { id: appointmentId, lead_id: leadId, title: 'Novo' } });
  assert.equal(fromLead.payload.title, 'Novo'); assert.deepEqual(byLead.calls.map(call => call.p_action), ['workspace', 'lead']);
});

test('troca de etapa na ficha usa o funil de destino; campos que o serviço ignora são recusados', async () => {
  const f = fixture();
  f.snapshot.pipelines.push({ id: id(20), cliente_id: clientId, nome: 'Outro', updated_at: stamp });
  f.snapshot.stages.push({ id: id(21), pipeline_id: id(20), nome: 'Outro', tipo: 'intermediaria', updated_at: stamp });
  const proposal = await prepareExecutorCrm(f.caller, { clientId, action: 'save_lead', input: { id: leadId, stage_id: id(21) } });
  assert.equal(proposal.payload.pipeline_id, id(20)); assert.equal(proposal.payload.stage_id, id(21));
  await assert.rejects(prepareExecutorCrm(f.caller, { clientId, action: 'save_lead', input: { id: leadId, pipeline_id: id(20) } }), /etapa|funil/i);
  await assert.rejects(prepareExecutorCrm(f.caller, { clientId, action: 'save_stage', input: { id: stageId, ordem: 7 } }), /reorder_stages|ordem/i);
  await assert.rejects(prepareExecutorCrm(f.caller, { clientId, action: 'save_agent', input: { id: agentId, setor_ids: [] } }), /setor/i);
  await assert.rejects(prepareExecutorCrm(f.caller, { clientId, action: 'save_product', input: { id: id(13), item_tipo: 'servico' } }), /tipo/i);
});

test('catálogo informa os campos reais, restrições de origem e somente capacidades implementadas', () => {
  const operation = EXECUTOR_CRM_CATALOG.find(item => item.mode === 'write' && item.name === 'save_appointment');
  assert.ok(operation.fields.includes('source_date')); assert.match(operation.description, /lead_id|source_date/);
  assert.ok(EXECUTOR_CRM_CATALOG.some(item => item.mode === 'read' && item.name === 'conversation'));
  assert.ok(EXECUTOR_CRM_CATALOG.every(item => item.app === 'crm' && !['agent_draft', 'publish_agent_draft', 'sql'].includes(item.name)));
});

test('criações recebem defaults efetivos e identificador de reserva sem habilitar autonomia implícita', async () => {
  const f = fixture();
  const agent = await prepareExecutorCrm(f.caller, { clientId, action: 'save_agent', input: { nome: 'Novo agente', funil: { crm_ia: { tipo: 'qualificacao', pipeline_id: pipelineId, stage_ids: [stageId] } } } });
  assert.equal(agent.payload.auto_responder, false); assert.equal(agent.payload.modelo, 'openai/gpt-4o-mini'); assert.equal(agent.effect.enables_autonomy, false);
  const appointment = await prepareExecutorCrm(f.caller, { clientId, action: 'save_appointment', input: { owner_id: ownerId, start_at: '2026-12-01T12:00:00Z', end_at: '2026-12-01T12:30:00Z', title: 'Novo' } });
  assert.match(appointment.payload.request_id, /^[a-f\d-]{36}$/i); assert.equal(appointment.payload.status, 'scheduled');
  const pipeline = await prepareExecutorCrm(f.caller, { clientId, action: 'save_pipeline', input: { nome: 'Novo funil' } });
  assert.equal(pipeline.payload.is_default, false);
});

test('retomar agente ativo e habilitar captura deixam efeito de autonomia explícito', async () => {
  const f = fixture(); f.snapshot.agents[0].auto_responder = true; f.snapshot.agents[0].ativo = false;
  const agent = await prepareExecutorCrm(f.caller, { clientId, action: 'save_agent', input: { id: agentId, ativo: true } });
  assert.equal(agent.effect.enables_autonomy, true); assert.ok(agent.preview.autonomy);
  const capture = await prepareExecutorCrm(f.caller, { clientId, action: 'save_config', input: { section: 'entry', data: { enabled: true, channels: [{ channel_id: channelId, enabled: true, mode: 'all', pipeline_id: pipelineId, stage_id: stageId, tags: [] }] } } });
  assert.equal(capture.effect.enables_autonomy, true);
});

test('referências e tipos inválidos são barrados antes de uma proposta publicável', async () => {
  for (const [action, input] of [
    ['save_config', { section: 'knowledge', data: { assignments: [{ pipeline_id: pipelineId, base_id: id(99) }] } }],
    ['save_config', { section: 'availability', data: { timezone: 'NãoExiste', windows: [] } }],
    ['save_config', { section: 'availability', data: { duration_minutes: -10 } }],
    ['save_config', { section: 'attendance', data: { auto_send: 'true' } }],
    ['save_pipeline', { nome: 'Novo', is_default: 'false' }],
    ['save_agent', { nome: 'Novo', setor_ids: [id(99)], funil: { crm_ia: { tipo: 'qualificacao', pipeline_id: pipelineId } } }],
    ['save_config', { id: id(99), section: 'attendance', data: { auto_send: false } }],
    ['save_appointment', { owner_id: ownerId, start_at: '2026-12-01T12:00:00', end_at: '2026-12-01T12:30:00', title: 'Fuso ausente' }],
  ]) await assert.rejects(prepareExecutorCrm(fixture().caller, { clientId, action, input }));
});

test('preparação não varre agenda sem limite; origem de outra conta é recusada', async () => {
  const f = fixture({ agenda: () => ({ rows: [{ id: id(99) }], total: 10000 }) });
  await assert.rejects(prepareExecutorCrm(f.caller, { clientId, action: 'cancel_appointment', input: { id: appointmentId, source_date: '2026-12-01' } }));
  assert.ok(f.calls.length <= 6);
  const other = fixture(); other.snapshot.products[0].cliente_id = id(99);
  await assert.rejects(prepareExecutorCrm(other.caller, { clientId, action: 'save_product', input: { id: id(13), name: 'Troca de conta' } }));
});

test('editar lead já ganho preserva a etapa sem exigir outro motivo de movimentação', async () => {
  const f = fixture(); f.snapshot.stages[0].tipo = 'ganho';
  const proposal = await prepareExecutorCrm(f.caller, { clientId, action: 'save_lead', input: { id: leadId, nome: 'Nome corrigido' } });
  assert.equal(proposal.payload.stage_id, stageId); assert.equal(proposal.payload.nome, 'Nome corrigido');
  const sameStage = await prepareExecutorCrm(f.caller, { clientId, action: 'move_lead', input: { id: leadId, stage_id: stageId } });
  assert.equal(sameStage.payload.stage_id, stageId);
});

test('páginas oficiais retornam dados e metadados tipados sem perder NULL nem uso de tokens', async () => {
  const f = fixture({ overview: () => ({ totals: { leads: 0, waiting: null }, daily: [], stages: [], origins: [], waiting: [], coverage: { conversations: 'unavailable' } }),
    conversations: () => ({ rows: [], total: 0 }), usage: () => ({ responses: 1, tokens: 340, by_agent: [{ id: agentId, tokens: 340 }], coverage: { complete: false, reason: 'channel_not_recorded' } }) });
  for (const view of ['workspace', 'pipelines', 'stages', 'agents', 'knowledge', 'products', 'templates', 'configurations', 'overview', 'conversations', 'agenda', 'usage']) {
    const source = await readExecutorCrm(f.caller, { clientId, view });
    assert.equal(source.available, true, view);
    if (view === 'overview') assert.equal(source.data.totals.waiting, null);
    if (view === 'usage') { assert.equal(source.data.tokens, 340); assert.equal(source.coverage.complete, false); }
  }
});

test('perfil do lead fixa a versão publicada atual, permite limpeza e rejeita instruções adicionais', async () => {
  const f = fixture();
  f.snapshot.lead_profiles = [{ agent_id: agentId, pipeline_id: pipelineId, id: id(30), nome: 'Prioritário', cor: '#123456', agent_updated_at: stamp }];
  const assigned = await prepareExecutorCrm(f.caller, { clientId, action: 'save_lead', input: { id: leadId, profile: { agent_id: agentId, id: id(30), agent_updated_at: '2020-01-01T00:00Z' } } });
  assert.deepEqual(assigned.payload.profile, { agent_id: agentId, id: id(30), agent_updated_at: stamp });
  const cleared = await prepareExecutorCrm(f.caller, { clientId, action: 'save_lead', input: { id: leadId, profile: null } });
  assert.equal(cleared.payload.profile, null);
  await assert.rejects(prepareExecutorCrm(f.caller, { clientId, action: 'save_lead', input: { id: leadId, profile: { agent_id: agentId, id: id(30), actions: { owner_id: ownerId } } } }));
});

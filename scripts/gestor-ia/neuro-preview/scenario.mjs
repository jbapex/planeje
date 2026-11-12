import assert from 'node:assert/strict';
import { ACTOR, CLIENT, WEEK, literal } from './db.mjs';
import { createPreviewMcp, previewClient, toolPayload } from './mcp.mjs';
import { createPreviewFetch } from './bridge.mjs';

export const lines = [
  { id: '00000000-0000-0000-0000-000000000031', platform: 'meta', account_id: 'act_preview_impacto', account_name: 'Impacto · conta sintética',
    campaign_id: 'preview_campanha', campaign_name: 'Prova de vestido · demonstração', adset_id: 'preview_conjunto_a', adset_name: 'Noivas · conjunto A', spend: 350, messages: 20, appointments: 2 },
  { id: '00000000-0000-0000-0000-000000000032', platform: 'meta', account_id: 'act_preview_impacto', account_name: 'Impacto · conta sintética',
    campaign_id: 'preview_campanha', campaign_name: 'Prova de vestido · demonstração', adset_id: 'preview_conjunto_b', adset_name: 'Noivas · conjunto B', spend: 210, messages: 12, appointments: 0 },
];
const analysis = 'Rascunho sintético pelo MCP: R$ 560 investidos e 32 mensagens. Dois agendamentos no conjunto A; conferir evidências e aprovar o próximo passo.';
const scope = { cliente_id: CLIENT, semana: WEEK };

export async function runRoutineScenario(db) {
  const mcp = await createPreviewMcp(db);
  const human = previewClient(db);
  const service = previewClient(db, 'service_role');
  const read = async () => toolPayload(await mcp.client.callTool({ name: 'gestor_ia_ler_semana', arguments: scope })).review;
  const state = () => db.json(`SELECT to_jsonb(r)||jsonb_build_object('task_status',t.status) FROM public.traffic_weekly_reviews r JOIN public.tarefas t ON t.id=r.task_id WHERE r.client_id=${literal(CLIENT)}::uuid AND r.week_start=${literal(WEEK)}::date`);
  try {
    const catalog = await mcp.client.listTools();
    assert.ok(catalog.tools.some(({ name }) => name === 'gestor_ia_salvar_semana'));
    assert.ok(!catalog.tools.some(({ name }) => /^gestor_ia_.*(?:validar|concluir|reabrir)/.test(name)));
    const saved = toolPayload(await mcp.client.callTool({ name: 'gestor_ia_salvar_semana', arguments: { ...scope, linhas: lines, analise: analysis } })).review;
    assert.equal(saved.fill_origin, 'ia');
    assert.equal(saved.validation_state, 'rascunho_ia');
    assert.equal(saved.finalized_at, null);
    assert.equal(state().task_status, 'pending');
    const suggestion = toolPayload(await mcp.client.callTool({ name: 'gestor_ia_sugerir_acao', arguments: { ...scope, revision: saved.revision, texto: 'Conferir a confirmação na conversa antes de validar. Avaliar o conjunto B na próxima revisão.' } })).review;
    assert.equal(suggestion.validation_state, 'rascunho_ia');
    assert.equal(state().task_status, 'pending');

    const forbidden = await mcp.client.callTool({ name: 'gestor_ia_salvar_semana', arguments: { ...scope, linhas: lines, revision: suggestion.revision, finalize: true } });
    assert.equal(forbidden.isError, true);
    assert.equal((await read()).revision, suggestion.revision);
    const attempt = await human.rpc('gestor_ia_routine_mcp', { p_actor: ACTOR, p_action: 'save', p_client: CLIENT, p_week: WEEK, p_payload: { linhas: lines } });
    assert.equal(attempt.error?.code, '42501');

    const review = state();
    const data = { ...review, action_mode: 'none' };
    const serviceValidation = await service.rpc('save_traffic_weekly_review', { p_review: review.id, p_revision: review.revision, p_data: data, p_finalize: true });
    assert.equal(serviceValidation.error?.code, '42501');
    assert.equal(state().task_status, 'pending');
    const humanValidation = await human.rpc('save_traffic_weekly_review', { p_review: review.id, p_revision: review.revision, p_data: data, p_finalize: true });
    assert.equal(humanValidation.error, null, humanValidation.error?.message);
    assert.equal(state().validation_state, 'validado');
    assert.equal(state().task_status, 'completed');
    assert.equal(state().finalized_by, ACTOR);
    const validated = await read();
    const blocked = await mcp.client.callTool({ name: 'gestor_ia_salvar_semana', arguments: { ...scope, linhas: lines, revision: validated.revision } });
    assert.equal(blocked.isError, true);
    assert.match(blocked.content[0].text, /validada|humana/i);
    assert.equal(state().revision, validated.revision);

    const reopened = await human.rpc('save_traffic_weekly_review', { p_review: review.id, p_revision: validated.revision,
      p_data: { ...data, analysis: `${analysis} Reaberta pela equipe sintética.` }, p_finalize: false });
    assert.equal(reopened.error, null, reopened.error?.message);
    assert.equal(state().validation_state, 'em_revisao');
    assert.equal(state().task_status, 'pending');
    const final = toolPayload(await mcp.client.callTool({ name: 'gestor_ia_salvar_semana', arguments: { ...scope, linhas: lines, analise: analysis, revision: state().revision } })).review;
    assert.equal(final.validation_state, 'rascunho_ia');
    assert.equal(state().task_status, 'pending');
    const rawResponse = await createPreviewFetch(db)('http://127.0.0.1:4393/rest/v1/rpc/gestor_ia_routine_leads_data', {
      method: 'POST', body: JSON.stringify({ p_client: CLIENT, p_week: WEEK }),
    });
    const rawText = await rawResponse.text();
    assert.equal(rawResponse.status, 200, rawText);
    for (const forbiddenText of ['NEURO_PRIVATE_CANARY', '@s.whatsapp.net', ...[1, 2, 3, 4, 5, 6].map((number) => `551190000100${number}`)]) {
      assert.ok(!rawText.includes(forbiddenText), 'Raw UI RPC must redact private data before the list receives it');
    }
    const rawLeads = JSON.parse(rawText);
    assert.equal(rawLeads.contacts.length, 5, 'raw RPC preserves only the requested first-entry cohort');
    assert.ok(rawLeads.messages.length > 0, 'safe conversation signals remain available');
    assert.ok(rawLeads.messages.every((message) => !message.text.includes('seu agendamento dia')), 'free conversation bodies must not reach the list');
    const leads = toolPayload(await mcp.client.callTool({ name: 'gestor_ia_ver_leads', arguments: { ...scope, conjunto_ids: ['preview_conjunto_a'] } }));
    assert.equal(leads.leads.length, 2);
    assert.equal(leads.unmatchedLeads.length, 2);
    assert.ok(leads.leads.every((lead) => !JSON.stringify(lead).includes('@s.whatsapp.net')));
    assert.ok(leads.leads.some((lead) => lead.routineCrmOutdated === true));
    assert.ok(leads.leads.every((lead) => lead.phone.includes('*') || lead.phone.includes('•')));
    const history = db.json(`SELECT jsonb_agg(jsonb_build_object('event',event,'actor_type',actor_type)) FROM public.traffic_weekly_history WHERE review_id=${literal(review.id)}::uuid`);
    assert.ok(history.some((event) => event.actor_type === 'ia'));
    assert.ok(history.some((event) => event.event === 'finalized' && event.actor_type === 'pessoa'));
    return { review: final, history, leads, rawPrivacyChecked: true };
  } finally { await mcp.close(); }
}

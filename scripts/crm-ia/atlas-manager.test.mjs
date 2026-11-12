import assert from 'node:assert/strict';
import test from 'node:test';
import { converseAtlas, MANAGER_AGENTS, runAtlasMission } from '../../supabase/functions/_shared/atlasManager.js';
import { createManagerReader } from '../../supabase/functions/_shared/atlasManagerContext.js';
import { ATLAS_AGENT_DETAILS } from '../../src/components/atlas/atlasPresentation.js';

const client = '00000000-0000-4000-8000-000000000011';
const other = '00000000-0000-4000-8000-000000000012';
const lead = '00000000-0000-4000-8000-000000000021';
const contact = '00000000-0000-4000-8000-000000000031';
const channel = '00000000-0000-4000-8000-000000000041';
const period = { since: '2026-11-10', until: '2026-11-11' };
const request = 'Consulte o especialista CRM IA.\nAnalise os leads e prepare um próximo passo.';
const answer = (content, tool_calls) => ({ message: { role: 'assistant', content, tool_calls }, model: 'fixture', usage: { prompt_tokens: 10, completion_tokens: 10 } });
const tool = (name, args) => ({ id: crypto.randomUUID(), type: 'function', function: { name, arguments: JSON.stringify(args) } });
const overview = { totals: { leads: 251, qualified: 7, conversations: 2, appointments: 1 }, daily: [], stages: [], origins: [],
  waiting: [{ contact_id: contact, channel_id: channel, nome: 'Contato autorizado', since: '2026-11-10T15:00Z', token: 'SEGREDO' }], coverage: period };

function source({ data = overview, error = null } = {}) {
  const calls = [];
  return { calls, from(table) { assert.fail(`CRM não deve ler catálogo ou tabela diretamente: ${table}`); },
    rpc(name, args) { calls.push({ name, args }); return Promise.resolve({ data, error }); } };
}

test('a fonte autenticada CRM usa a conta explícita antes do gate closed e preserva período e evidências', async () => {
  const caller = source();
  const result = await createManagerReader(caller, { ownerId: 'fixture' })('crm_ia', { clientId: client, ...period });
  assert.equal(result.available, true);
  assert.equal(caller.calls.length, 1);
  assert.equal(caller.calls[0].name, 'crm_ia_workspace');
  assert.deepEqual(caller.calls[0].args, { p_action: 'overview', p_client_id: client, p_payload: period });
  assert.equal(result.records.totals.leads, 251);
  assert.deepEqual(result.period, period);
  assert.ok(Number.isFinite(Date.parse(result.queried_at)));
  assert.equal(result.coverage.aggregates_complete, true);
  assert.match(result.records.waiting[0].href, new RegExp(`contact_id=${contact}.*channel_id=${channel}`));
  assert.ok(!JSON.stringify(result).includes('SEGREDO'));
});

test('referenceId lê somente a ficha comercial autorizada, sem conversa integral nem notas privadas', async () => {
  const caller = source({ data: { lead: { id: lead, cliente_id: client, nome: 'Lead <b>autorizado</b>', stage_id: other, valor: 120,
    observacoes: 'NOTA-PRIVADA', crm_ia_fields: { token: 'SEGREDO-CUSTOM' } },
  contact: { id: contact, phone: '551100000001', from_jid: 'JID-PRIVADO' },
  conversation: { contact_id: contact, channel_id: channel, attendance: 'human', last_message: 'MENSAGEM-PRIVADA' },
  events: [{ id: other, realizado_em: '2026-11-10T12:00Z', motivo_ganho_perdido: 'MOTIVO-PRIVADO' }],
  appointments: [{ id: other, title: 'Reunião registrada', start_at: '2026-11-11T12:00Z', status: 'scheduled', notes: 'NOTAS-PRIVADAS' }] } });
  const result = await createManagerReader(caller, { ownerId: 'fixture' })('crm_ia', { clientId: client, referenceId: lead, ...period });
  assert.equal(result.available, true);
  assert.deepEqual(caller.calls[0].args, { p_action: 'lead', p_client_id: client, p_payload: { ...period, id: lead } });
  assert.equal(result.records.lead.id, lead);
  assert.equal(result.records.lead.nome, 'Lead autorizado');
  assert.match(result.records.lead.href, new RegExp(`lead_id=${lead}`));
  assert.equal(result.records.appointments[0].status, 'scheduled');
  assert.doesNotMatch(JSON.stringify(result), /PRIVAD|SEGREDO|Google Agenda.*confirmad/);
});

test('a lista CRM é paginada por RPC e não envia textos das mensagens ao modelo', async () => {
  const caller = source({ data: { rows: [{ contact_id: contact, channel_id: channel, nome: 'Contato', lead_id: lead,
    attendance: 'human', last_message: 'TEXTO-PRIVADO', last_message_at: '2026-11-10T15:00Z' }], total: 45 } });
  const result = await createManagerReader(caller, { ownerId: 'fixture' })('crm_ia', { clientId: client, crmView: 'conversations', offset: 20, ...period });
  assert.equal(caller.calls[0].args.p_action, 'conversations');
  assert.deepEqual(caller.calls[0].args.p_payload, { ...period, offset: 20, limit: 20 });
  assert.equal(result.records.total, 45);
  assert.equal(result.coverage.complete, false);
  assert.equal(result.coverage.next_offset, 21);
  assert.equal(result.records.rows[0].channel_id, channel);
  assert.ok(!JSON.stringify(result).includes('TEXTO-PRIVADO'));
});

test('sem conta não busca todas; 403, falha e resposta inválida nunca viram dados vazios', async () => {
  const caller = source();
  const result = await createManagerReader(caller, { ownerId: 'fixture' })('crm_ia');
  assert.equal(result.selection_required, true);
  assert.equal(result.available, false);
  assert.equal(caller.calls.length, 0);
  await assert.rejects(createManagerReader(source({ error: { code: '42501', message: 'NAO-ECOAR-SEGREDO' } }), { ownerId: 'fixture' })('crm_ia', { clientId: client }), { status: 403 });
  for (const options of [{ error: { code: 'XX000', message: 'NAO-ECOAR-SEGREDO' } }, { data: null }, { data: {} }]) {
    const failed = await createManagerReader(source(options), { ownerId: 'fixture' })('crm_ia', { clientId: client });
    assert.equal(failed.available, false);
    assert.equal(failed.records, undefined);
    assert.doesNotMatch(JSON.stringify(failed), /NAO-ECOAR-SEGREDO/);
  }
  await assert.rejects(createManagerReader(source({ data: { lead: { id: lead, cliente_id: other } } }), { ownerId: 'fixture' })('crm_ia', { clientId: client, referenceId: lead }), { status: 403 });
});

test('CRM IA é especialista real selecionável e sua missão só recebe crm_ia sem envio ou delegação lateral', async () => {
  const agent = MANAGER_AGENTS.find(item => item.id === 'crm');
  assert.equal(agent?.name, 'CRM IA');
  assert.equal(ATLAS_AGENT_DETAILS.crm?.title, 'CRM IA');
  const caller = source();
  let calls = 0;
  const report = await runAtlasMission({ message: request, clientId: client, readContext: createManagerReader(caller, { ownerId: 'fixture' }),
    askInternal: async () => assert.fail('CRM não envia perguntas nem mensagens'), callModel: async ({ messages, tools }) => {
      calls++;
      assert.ok(!tools.some(item => /send|ask_internal/.test(item.function.name)));
      if (calls === 1) {
        assert.ok(tools.find(item => item.function.name === 'delegate_specialist').function.parameters.properties.agent.enum.includes('crm'));
        return answer(null, [tool('delegate_specialist', { agent: 'crm', task: request })]);
      }
      if (calls === 2) {
        assert.deepEqual(tools.map(item => item.function.name), ['read_context']);
        const properties = tools[0].function.parameters.properties;
        assert.deepEqual(properties.section.enum, ['crm_ia']);
        assert.deepEqual(properties.crm_view.enum, ['overview', 'conversations']);
        return answer(null, [tool('read_context', { section: 'crm_ia', client_id: client, ...period })]);
      }
      if (calls === 3) {
        const evidence = JSON.parse(messages.at(-1).content);
        assert.equal(evidence.records.totals.leads, 251);
        return answer('Há 251 leads registrados. Proponho revisar a fila humana.');
      }
      return answer('Revise a fila humana da conta selecionada.');
    } });
  assert.equal(calls, 4);
  assert.equal(caller.calls.length, 1);
  assert.equal(report.sources[0].section, 'crm_ia');
  assert.deepEqual(report.sources[0].period, period);
  assert.match(report.content, /CRM IA/);
});

test('CRM não consegue chamar fonte legada, outro especialista ou transporte', async () => {
  for (const invalid of [tool('read_context', { section: 'lead_conversation', client_id: client, reference_id: lead }),
    tool('delegate_specialist', { agent: 'financeiro', task: 'Veja a conta.' }), tool('send_message', { body: 'Não enviar' })]) {
    let calls = 0;
    await assert.rejects(runAtlasMission({ message: request, clientId: client,
      readContext: async () => assert.fail('fonte fora da allowlist'), askInternal: async () => assert.fail('envio fora da allowlist'),
      callModel: async () => ++calls === 1 ? answer(null, [tool('delegate_specialist', { agent: 'crm', task: request })]) : answer(null, [invalid]),
    }), { code: 'TOOL_DENIED' });
  }
});

test('pedido CRM sem conta pede seleção sem modelo, missão ou varredura de clientes', async () => {
  const result = await converseAtlas({ message: request, clientId: null, clients: [{ id: client }], jobs: [], memories: [], history: [],
    callModel: async () => assert.fail('não deve inferir conta pelo catálogo') });
  assert.equal(result.mission, null);
  assert.match(result.reply, /selecione|escolha/i);
  const mission = await runAtlasMission({ message: request, clientId: null,
    readContext: async () => assert.fail('não pode varrer a carteira'), callModel: async () => assert.fail('não pode escolher primeiro cliente') });
  assert.equal(mission.selection_required, true);
});

test('outra fonte não substitui CRM e política de equipe não ganha dados comerciais privados', async () => {
  let calls = 0;
  await assert.rejects(runAtlasMission({ message: request, clientId: client, readContext: async () => ({ available: true }),
    callModel: async () => ++calls === 1 ? answer(null, [tool('read_context', { section: 'portfolio' })]) : answer('Tudo em dia.') }), { code: 'SOURCES_REQUIRED' });
  await assert.rejects(runAtlasMission({ message: request, clientId: client,
    policy: { identity: 'team', allowedAgents: ['central', 'crm'], allowedSections: ['crm_ia'] },
    readContext: async () => assert.fail('não deve ler'), callModel: async () => assert.fail('não deve chamar modelo') }), { code: 'TOOL_DENIED' });
});

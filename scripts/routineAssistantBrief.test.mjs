import assert from 'node:assert/strict';
import test from 'node:test';
import { leadOutcome, leadConfirmedVisit, summarizeRoutineLeads, routineWeekRange, routineSearchRange, routineSearchMatchesSheet, routineBriefPrompt } from '../src/lib/routineAssistantBrief.js';

test('semana da rotina vai de segunda a domingo', () => {
  const range = routineWeekRange('2026-09-28');
  assert.equal(range.since, '2026-09-28');
  assert.equal(range.until, '2026-10-04');
  assert.match(range.label, /28\/09\/2026/);
});

test('agendado e venda saem do mini crm e do comprou', () => {
  const scheduled = leadOutcome({
    mini_crm: { status: 'agendado', data_agendamento: '02/10/2026' },
    comprou: false,
  });
  assert.equal(scheduled.scheduled, true);
  assert.equal(scheduled.appointmentDate, '2026-10-02');
  assert.equal(scheduled.sold, false);
  const sold = leadOutcome({ comprou: true, valor_venda: 1500, mini_crm: { data_venda: '2026-10-03' } });
  assert.equal(sold.sold, true);
  assert.equal(sold.saleDate, '2026-10-03');
});

test('resumo conta leads do período, mensagens e abre a ficha', () => {
  const range = routineWeekRange('2026-09-28');
  const brief = summarizeRoutineLeads({
    range,
    clientId: 'cli-1',
    clientName: 'Thalita',
    contacts: [
      {
        id: 'a',
        phone: '5516999990001',
        sender_name: 'Ana',
        first_seen_at: '2026-09-30T15:00:00.000Z',
        tracking_data: { campaign_name: 'FORMULARIO', adset_name: 'CJ01' },
        mini_crm: { status: 'Agendado', data_agendamento: '2026-10-01' },
        comprou: false,
      },
      {
        id: 'b',
        phone: '5516999990002',
        sender_name: 'Bia',
        first_seen_at: '2026-08-01T15:00:00.000Z',
        last_message_at: '2026-08-02T15:00:00.000Z',
        mini_crm: { status: 'Agendado' },
      },
      {
        id: 'c',
        phone: '5516999990003',
        sender_name: 'Caio',
        first_seen_at: '2026-10-02T15:00:00.000Z',
        tracking_data: { campaign_name: 'FORMULARIO', adset_name: 'CJ01' },
        comprou: true,
        mini_crm: { status: 'Venda Realizada', data_venda: '2026-10-03' },
      },
    ],
    inbox: [
      { phone: '16999990001', body: 'Quero visitar sábado', created_at: '2026-09-30T16:00:00.000Z' },
      { phone: '16999990001', body: 'Pode ser às 15h', created_at: '2026-09-30T16:05:00.000Z' },
    ],
    sent: [
      { to_jid: '5516999990001@s.whatsapp.net', body: 'Olá', created_at: '2026-09-30T16:01:00.000Z' },
    ],
  });
  assert.equal(brief.found, 2);
  assert.equal(brief.scheduled, 1);
  assert.equal(brief.sold, 1);
  assert.equal(brief.messages, 3);
  assert.equal(brief.sets[0].campaign, 'FORMULARIO');
  assert.equal(brief.sets[0].leads, 2);
  const ana = brief.leads.find((lead) => lead.name === 'Ana');
  assert.equal(ana.inbound, 2);
  assert.equal(ana.appointmentDate, '2026-10-01');
  assert.match(ana.href, /fone=5516999990001/);
  assert.match(ana.snippets[0], /15h|visitar/);
  assert.equal(leadConfirmedVisit('Pode ser.'), false);
  assert.equal(leadConfirmedVisit('Pode ser assim amiga'), false);
  assert.equal(leadConfirmedVisit('Olá, vim pelo Instagram e quero agendar meu atendimento.'), false);
  assert.equal(leadConfirmedVisit('Neste sábado já tenho compromisso'), false);
  assert.equal(leadConfirmedVisit('Vcs atendem no domingo?'), false);
  assert.equal(leadConfirmedVisit('Pode ser na segunda. Não tem problema'), true);
  assert.equal(leadConfirmedVisit('Às 10h'), true);
  assert.match(routineBriefPrompt(brief), /Marcados como Agendado no Mini CRM: 1/);
  assert.match(routineBriefPrompt(brief), /Pode ser às 15h/);
  assert.match(routineBriefPrompt(brief), /Leia as falas e interprete/);
  assert.match(routineBriefPrompt(brief), /Não diga que não tem acesso/);
  const vazio = summarizeRoutineLeads({
    contacts: [],
    inbox: [],
    sent: [],
    range: routineWeekRange('2026-09-28'),
    clientId: 'c1',
    sheetRows: [{ campaign: '[16/09][setembro editorial][WHATSAPP]', adset: '[CJ0][41KM+]', spend: '120' }],
  });
  assert.equal(vazio.groups[0].appointments, 0);
  assert.match(routineBriefPrompt(vazio), /Não teve agendamento/);
});

test('pesquisa do chat usa o período escolhido e pode sair da ficha', () => {
  const range = routineSearchRange('2026-08-01', '2026-08-15');
  assert.equal(range.since, '2026-08-01');
  assert.equal(range.until, '2026-08-15');
  assert.equal(routineSearchRange('2026-08-15', '2026-08-01'), null);
  assert.equal(routineSearchMatchesSheet({
    since: '2026-09-28', until: '2026-10-04', weekStart: '2026-09-28', scope: 'sheet',
  }), true);
  assert.equal(routineSearchMatchesSheet({
    since: '2026-08-01', until: '2026-08-15', weekStart: '2026-09-28', scope: 'sheet',
  }), false);
  assert.equal(routineSearchMatchesSheet({
    since: '2026-09-28', until: '2026-10-04', weekStart: '2026-09-28', scope: 'all',
  }), false);
  const contact = {
    id: 'z',
    phone: '5511999990002',
    sender_name: 'Bia',
    first_seen_at: '2026-09-29T15:00:00.000Z',
    tracking_data: { campaign_name: 'Outra campanha longa demais', adset_name: 'CJ99 publico amplo' },
    mini_crm: { status: 'Agendado' },
  };
  const sheet = [{ campaign: '[16/09][setembro editorial][WHATSAPP]', adset: '[CJ0][41KM+]', spend: '' }];
  const week = routineWeekRange('2026-09-28');
  const onlySheet = summarizeRoutineLeads({ range: week, contacts: [contact], sheetRows: sheet, clientId: 'c' });
  const all = summarizeRoutineLeads({ range: week, contacts: [contact], sheetRows: sheet, scope: 'all', clientId: 'c' });
  assert.equal(onlySheet.fillCount, 0);
  assert.equal(all.fillCount, 1);
  assert.match(routineBriefPrompt(all), /sem limitar às campanhas da tela/);
});

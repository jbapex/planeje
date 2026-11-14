import assert from 'node:assert/strict';
import test from 'node:test';
import { agendaCivilDate, agendaRange, agendaWeekLayout, shiftAgendaDate, shiftAgendaMonth, agendaSlotAt } from '../../src/components/crm-ia/crmIaAgendaLayout.js';

const zone = 'America/Sao_Paulo';
test('semana usa datas civis de domingo a sábado e atravessa ano sem depender do fuso do navegador', () => {
  assert.deepEqual(agendaRange('2026-11-11', 'week'), { since: '2026-11-08', until: '2026-11-14', days: ['2026-11-08','2026-11-09','2026-11-10','2026-11-11','2026-11-12','2026-11-13','2026-11-14'] });
  assert.equal(agendaRange('2027-01-01', 'week').since, '2026-12-27');
  assert.equal(shiftAgendaDate('2026-12-31', 1), '2027-01-01');
  assert.deepEqual(agendaRange('', 'week').days, []);
  assert.deepEqual(agendaRange('2026-02-30', 'week').days, []);
});
test('compromisso perto da meia-noite pertence ao dia do fuso da disponibilidade', () => {
  assert.equal(agendaCivilDate('2026-11-12T01:30:00Z', zone), '2026-11-11');
  assert.equal(agendaCivilDate('2026-12-31T12:00:00Z', 'Pacific/Kiritimati'), '2027-01-01');
});
test('sobreposição de responsáveis ganha colunas e não perde compromissos fora das células de 7h–20h', () => {
  const day = '2026-11-11';
  const item = (id, start, end) => ({ id, start_at: `${day}T${start}:00Z`, end_at: `${day}T${end}:00Z` });
  const rows = [item('a','13:00','14:00'),item('b','13:30','14:30'),item('c','14:30','15:00'),item('early','09:30','10:30'),{id:'late',start_at:'2026-11-12T00:30:00Z',end_at:'2026-11-12T01:30:00Z'}];
  const layout = agendaWeekLayout(rows, [day], zone);
  assert.equal(layout.days[0].events.length, 3);
  const [a,b,c] = layout.days[0].events;
  assert.deepEqual([a.top,a.height,a.lane,a.lanes],[180,60,0,2]);
  assert.deepEqual([b.top,b.height,b.lane,b.lanes],[210,60,1,2]);
  assert.equal(c.lanes,1);
  assert.deepEqual(layout.outside.map(entry => entry.id), ['early','late']);
  assert.deepEqual(rows.map(entry => entry.id), ['a','b','c','early','late']);
});
test('horários de cinco minutos continuam com área acionável e sem cobrir o próximo botão', () => {
  const date = '2026-11-11';
  const layout = agendaWeekLayout([{id:'a',start_at:`${date}T13:00:00Z`,end_at:`${date}T13:05:00Z`},{id:'b',start_at:`${date}T13:05:00Z`,end_at:`${date}T13:10:00Z`}],[date],zone);
  assert.ok(layout.days[0].events.every(entry => entry.height>=24 && entry.lanes===2));
  const last = agendaWeekLayout([{id:'last',start_at:`${date}T22:55:00Z`,end_at:`${date}T23:00:00Z`}],[date],zone).days[0].events[0];
  assert.ok(last.top+last.height<=14*60, 'último botão precisa caber na grade, cuja última célula começa às20h');
});

test('mês oferece seis semanas a partir do domingo, incluindo dias adjacentes', () => {
  const november = agendaRange('2026-11-12', 'month');
  assert.equal(november.since, '2026-11-01');assert.equal(november.until, '2026-12-12');assert.equal(november.days.length, 42);
  const february = agendaRange('2024-02-29', 'month');
  assert.equal(february.since, '2024-01-28');assert.equal(february.until, '2024-03-09');assert.ok(february.days.includes('2024-02-29'));
  assert.deepEqual(agendaRange('2026-02-30', 'month').days, []);
});

test('navegação mensal limita ao último dia válido e atravessa anos', () => {
  assert.equal(shiftAgendaMonth('2026-01-31', 1), '2026-02-28');
  assert.equal(shiftAgendaMonth('2024-01-31', 1), '2024-02-29');
  assert.equal(shiftAgendaMonth('2026-12-31', 1), '2027-01-31');
  assert.equal(shiftAgendaMonth('2026-01-31', -1), '2025-12-31');
  assert.equal(shiftAgendaMonth('invalid', 1), '');
});

test('a sugestão da grade só seleciona uma vaga exata no dia, fuso e responsável atuais', () => {
  const rows=[{start_at:'2026-11-13T00:00:00Z',end_at:'2026-11-13T00:30:00Z',owner_id:'owner-a'},
    {start_at:'2026-11-13T18:00:00Z',end_at:'2026-11-13T18:30:00Z',owner_id:'owner-a'}];
  assert.equal(agendaSlotAt(rows,{date:'2026-11-12',time:'21:00',owner_id:'owner-a'},zone), rows[0].start_at);
  assert.equal(agendaSlotAt(rows,{date:'2026-11-13',time:'15:00',owner_id:'owner-a'},zone), rows[1].start_at);
  for(const patch of [{date:'2026-11-13',time:'21:00'},{date:'2026-11-13',time:'15:30'},{date:'2026-11-13',time:'15:00',owner_id:'owner-b'}])
    assert.equal(agendaSlotAt(rows,{owner_id:'owner-a',...patch},zone),'');
});

test('hora civil repetida na mudança de fuso não escolhe uma das vagas silenciosamente', () => {
  const rows=['2026-10-25T00:30:00Z','2026-10-25T01:30:00Z'].map(start_at=>({start_at,owner_id:'owner-a'}));
  assert.equal(agendaSlotAt(rows,{date:'2026-10-25',time:'01:30',owner_id:'owner-a'},'Europe/Lisbon'),'');
});

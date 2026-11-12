import assert from 'node:assert/strict';
import test from 'node:test';
import { agendaCivilDate, agendaRange, agendaWeekLayout, shiftAgendaDate } from '../../src/components/crm-ia/crmIaAgendaLayout.js';

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
test('sobreposição de responsáveis ganha colunas e não perde compromissos fora de 7h–20h', () => {
  const day = '2026-11-11';
  const item = (id, start, end) => ({ id, start_at: `${day}T${start}:00Z`, end_at: `${day}T${end}:00Z` });
  const rows = [item('a','13:00','14:00'),item('b','13:30','14:30'),item('c','14:30','15:00'),item('early','09:30','10:30'),item('late','22:30','23:30')];
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
  assert.ok(last.top+last.height<=13*60, 'último botão precisa caber na grade até20h');
});

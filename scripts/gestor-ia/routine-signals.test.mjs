import assert from 'node:assert/strict';
import { test } from 'node:test';
import { appointmentStatusKeys, isAppointmentStatus } from '../../src/lib/miniCrm.js';
import { maskRoutinePhone, detectRoutineAppointment } from '../../src/lib/gestorIaRoutineSignals.js';

test('agendamento aceita status positivo e exclui negações/cancelamento', () => {
  for (const label of ['Agendado', 'Visita agendada', 'Reagendado']) assert.equal(isAppointmentStatus(label), true, label);
  for (const label of ['Não agendado', 'nao agendado', 'Ainda não está agendada', 'Desmarcou', 'Agendamento cancelado', 'Agendado não confirmado', 'Novo Lead']) assert.equal(isAppointmentStatus(label), false, label);
  assert.deepEqual(appointmentStatusKeys(['Agendado', 'Não agendado', 'Desmarcou'].map(key => ({ key, label: key }))), ['Agendado']);
});

test('telefone revela somente os quatro últimos dígitos, inclusive JID', () => {
  assert.equal(maskRoutinePhone('+55 (18) 99794-1487'), '•••• 1487');
  assert.equal(maskRoutinePhone('5518997941487@s.whatsapp.net'), '•••• 1487');
  assert.equal(maskRoutinePhone(''), 'Não informado');
  assert.equal(maskRoutinePhone('123'), '••••');
});

const message = (text, direction = 'equipe', at = '2026-11-10T15:00:00Z', id = '1') => ({ text, direction, at, id });
test('conversa exige data/hora confirmada, nunca proposta ou qualificação', () => {
  assert.equal(detectRoutineAppointment([message('Podemos agendar 13/11 às 14h?')]), null);
  assert.equal(detectRoutineAppointment([message('Seu atendimento foi ótimo, lead qualificado')]), null);
  assert.equal(detectRoutineAppointment([message('Agendamento confirmado para 31/02/2026 às 14h.')]), null);
  assert.equal(detectRoutineAppointment([message('Agendamento confirmado para 13/11/2026.')]), null);
  assert.equal(detectRoutineAppointment([message('Não está agendado para 13/11 às 14h')]), null);
  assert.equal(detectRoutineAppointment([message('Pagamento confirmado para 13/11 às 14h.')]), null);
  assert.equal(detectRoutineAppointment([message('Marcela, pagamento confirmado para 13/11 às 14h.')]), null);
  assert.equal(detectRoutineAppointment([message('Promoção até 13/11 às 14h.'), message('Sim!', 'lead', '2026-11-10T15:02:00Z')]), null);
  for (const pending of ['O agendamento ainda precisa ser confirmado para 13/11 às 14h.', 'Se confirmado o agendamento, será 13/11 às 14h.', 'Agendamento a confirmar para 13/11 às 14h.']) {
    assert.equal(detectRoutineAppointment([message(pending)]), null, pending);
    assert.equal(detectRoutineAppointment([message(pending), message('Sim!', 'lead', '2026-11-10T15:02:00Z')]), null, 'pendência não é proposta confirmável');
  }
  const result = detectRoutineAppointment([message('Agendamento confirmado para 13/11/2026 às 14:30.')]);
  assert.equal(result.date, '2026-11-13'); assert.equal(result.time, '14:30');
});

test('resposta confirma proposta do outro lado e cancelamento posterior a invalida', () => {
  const proposed = message('Temos horário dia 13/11 às 14h, pode ser?', 'equipe');
  const confirmed = message('Sim, confirmado!', 'lead', '2026-11-10T15:02:00Z', '2');
  assert.equal(detectRoutineAppointment([proposed, confirmed]).date, '2026-11-13');
  assert.equal(detectRoutineAppointment([proposed, message('Sim', 'equipe')]), null);
  assert.equal(detectRoutineAppointment([proposed, message('Sim', 'lead', '2026-11-14T15:02:00Z')]), null);
  assert.equal(detectRoutineAppointment([proposed, confirmed, message('Desmarcou, não poderá vir.', 'equipe', '2026-11-11T15:00:00Z', '3')]), null);
  assert.equal(detectRoutineAppointment([message('Agendamento confirmado para amanhã às 10h.', 'equipe', '2026-11-11T02:00:00Z')]).date, '2026-11-11');
});

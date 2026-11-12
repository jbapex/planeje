import assert from 'node:assert/strict';
import test from 'node:test';
import * as presentation from '../../src/components/crm-ia/crmIaPresentation.js';

test('estado visual do Google exige recibo verificado e não confunde reserva local com sincronização', () => {
  assert.equal(typeof presentation.calendarStatus, 'function');
  assert.equal(presentation.calendarStatus({ required: false }), null);
  assert.match(presentation.calendarStatus({ required: true, state: 'ready', verified: true }), /Sincronizado/);
  assert.match(presentation.calendarStatus({ required: true, state: 'ready', verified: false }), /Aguardando/);
  assert.match(presentation.calendarStatus({ required: true, state: 'failed' }), /conferência/);
});

test('data comercial sem horário conserva o dia em qualquer fuso', () => {
  assert.equal(presentation.dateTime('2026-11-10'), '10/11/2026');
  assert.equal(presentation.dateTime('2026-11-10', 'Pacific/Honolulu'), '10/11/2026');
  assert.match(presentation.dateTime('2026-11-10T15:00:00Z'), /10\/11\/2026.*12:00/);
});

test('CSV mantém delimitadores e quebras de linha dentro das aspas', () => {
  assert.equal(typeof presentation.parseCrmCsv, 'function', 'Importação precisa validar o arquivo antes de gravar.');
  assert.deepEqual(presentation.parseCrmCsv('\uFEFFnome;telefone;observacoes\r\n"Ana; Maria";5511000000000;"Linha 1\nDisse ""sim"""\r\n'), { headers: ['nome', 'telefone', 'observacoes'], rows: [['Ana; Maria', '5511000000000', 'Linha 1\nDisse "sim"']] });
});

test('CSV inválido ou acima do lote não vira importação parcial', () => {
  assert.equal(typeof presentation.parseCrmCsv, 'function');
  assert.throws(() => presentation.parseCrmCsv('nome,telefone\n"aspas abertas,123'), /aspas/i);
  assert.throws(() => presentation.parseCrmCsv('nome,telefone\n' + 'A,1\n'.repeat(1001)), /1.000/);
});

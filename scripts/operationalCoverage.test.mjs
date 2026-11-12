import test from 'node:test';
import assert from 'node:assert/strict';
import {
  aggregateOperationalCoverage,
  normalizeOperationalCoverageRow,
  OPERATIONAL_COVERAGE_TYPES,
  statusMeta,
} from '../src/lib/coberturaMensal.js';

test('one material remains one planned delivery when it has several channel publications', () => {
  const result = aggregateOperationalCoverage([{
    cliente_id: 'client-1',
    contratado: 1,
    planejado: 1,
    planejado_no_plano: 1,
    aguardando_tarefa: 0,
    em_execucao: 1,
    entregue: 0,
    publicacoes_total: 3,
    publicacoes_publicadas: 2,
    falta_planejar: 0,
    tem_plano_mes: true,
    status_cobertura: 'coberto',
  }], '2026-09-01');

  assert.equal(result.planejado_total, 1);
  assert.equal(result.publicacoes_total, 3);
  assert.equal(result.publicacoes_publicadas, 2);
  assert.equal(result.cobertura_geral, 1);
});

test('a second format is counted only when it exists as another material', () => {
  const result = aggregateOperationalCoverage([{
    cliente_id: 'client-1',
    contratado: 2,
    planejado: 2,
    planejado_no_plano: 2,
    aguardando_tarefa: 1,
    em_execucao: 1,
    entregue: 0,
    publicacoes_total: 3,
    publicacoes_publicadas: 0,
    falta_planejar: 0,
    tem_plano_mes: true,
    status_cobertura: 'coberto',
  }], '2026-09-01');

  assert.equal(result.planejado_total, 2);
  assert.equal(result.aguardando_tarefa_total, 1);
  assert.equal(result.em_execucao_total, 1);
});

test('an explicit zero in execution is preserved for material awaiting a task', () => {
  const row = normalizeOperationalCoverageRow({ contratado: 1, planejado: 1, entregue: 0, em_execucao: 0, aguardando_tarefa: 1 });
  assert.equal(row.em_execucao, 0);
  assert.equal(row.aguardando_tarefa, 1);
});

test('coverage exposes the five contract categories and an over-scope state', () => {
  assert.deepEqual(OPERATIONAL_COVERAGE_TYPES.map(([key]) => key), ['posts', 'carrosseis', 'videos', 'stories', 'anuncios']);
  assert.equal(statusMeta('acima').label, 'Acima do escopo');
});

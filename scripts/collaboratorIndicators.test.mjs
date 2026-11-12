import assert from 'node:assert/strict';
import {
  businessDays,
  computeCollaboratorIndicators,
  effectiveDeadline,
  spDay,
  spMinutes,
  stageRounds,
  templateOrder,
} from '../src/lib/collaboratorIndicators.js';

const VIDEO_TEMPLATE = {
  id: 'tpl-video',
  stages: ['backlog', 'briefing', 'script', 'script_review', 'recording', 'editing', 'review', 'validation', 'send_client', 'waiting_client', 'schedule', 'scheduled', 'published'].map((key) => ({ key })),
};
const ART_TEMPLATE = {
  id: 'tpl-art',
  stages: ['backlog', 'briefing', 'art_production', 'review', 'validation', 'send_client', 'waiting_client', 'schedule', 'scheduled', 'published'].map((key) => ({ key })),
};
const GABRIEL = 'gabriel';
const SAMUEL = 'samuel';
const RAY = 'ray';
const POLIANA = 'poliana';

const move = (at, from, to, fromPeople, toPeople, toStatus = null, fromStatus = null) => ({
  kind: 'status_change', at, from_workflow_stage_key: from, to_workflow_stage_key: to,
  from_assignee_ids: fromPeople, to_assignee_ids: toPeople, to_status: toStatus, from_status: fromStatus,
});

// Datas em Brasília.
assert.equal(spDay('2026-10-01T02:30:00Z'), '2026-09-30');
assert.equal(spMinutes('2026-10-01T15:59:00Z'), 12 * 60 + 59);
assert.equal(businessDays('2026-10-01', '2026-10-05').length, 3);
assert.equal(businessDays('2026-09-01').length, 22);

// Prazo: mudar antes de vencer vale; empurrar depois de vencido não vale; depois da entrega não conta.
{
  const task = { id: 't1', due_date: '2026-10-20' };
  const changes = [
    { task_id: 't1', field: 'due_date', new_value: '2026-10-10', source: 'insert', changed_at: '2026-10-01T12:00:00Z' },
    { task_id: 't1', field: 'due_date', old_value: '2026-10-10', new_value: '2026-10-12', source: 'update', changed_at: '2026-10-08T12:00:00Z' },
    { task_id: 't1', field: 'due_date', old_value: '2026-10-12', new_value: '2026-10-18', source: 'update', changed_at: '2026-10-14T12:00:00Z' },
    { task_id: 't1', field: 'due_date', old_value: '2026-10-18', new_value: '2026-10-20', source: 'update', changed_at: '2026-10-19T12:00:00Z' },
  ];
  const before = effectiveDeadline(task, 'due_date', changes, { until: '2026-10-15T12:00:00Z' });
  assert.equal(before.day, '2026-10-12');
  assert.equal(before.moved, 1);
  assert.equal(before.ignored.length, 1);
  const withoutLog = effectiveDeadline(task, 'due_date', []);
  assert.equal(withoutLog.day, '2026-10-20');

  const late = { id: 't2', created_at: '2026-10-01T13:00:00Z', due_date: '2026-09-28' };
  const lateResult = effectiveDeadline(late, 'due_date', []);
  assert.equal(lateResult.day, '2026-10-01');
  assert.equal(lateResult.bornLate, true);
  const lateMoved = effectiveDeadline(late, 'due_date', [
    { task_id: 't2', field: 'due_date', new_value: '2026-09-28', source: 'insert', changed_at: '2026-10-01T13:00:00Z' },
    { task_id: 't2', field: 'due_date', old_value: '2026-09-28', new_value: '2026-10-03', source: 'update', changed_at: '2026-10-01T14:00:00Z' },
  ]);
  assert.equal(lateMoved.day, '2026-10-03');
  assert.equal(lateMoved.ignored.length, 0);
  assert.equal(lateMoved.bornLate, false);
}

// Rodadas: voltas para ajuste depois da entrega, separando interna e cliente.
{
  const order = templateOrder(VIDEO_TEMPLATE);
  const task = {
    stage_execution_history: [
      move('2026-10-02T10:00:00Z', 'script', 'script_review', [GABRIEL], [POLIANA]),
      move('2026-10-02T11:00:00Z', 'script_review', null, [POLIANA], [GABRIEL], 'alteração'),
      move('2026-10-02T12:00:00Z', null, 'script_review', [GABRIEL], [POLIANA], 'aprovacao_roteiro', 'alteração'),
      move('2026-10-03T10:00:00Z', 'script_review', 'recording', [POLIANA], [GABRIEL]),
      move('2026-10-04T12:00:00Z', 'recording', 'editing', [GABRIEL], [SAMUEL]),
      move('2026-10-05T12:00:00Z', 'editing', 'review', [SAMUEL], [POLIANA]),
      move('2026-10-05T13:00:00Z', 'review', 'send_client', [POLIANA], [RAY]),
      move('2026-10-06T13:00:00Z', 'send_client', 'editing', [RAY], [SAMUEL]),
    ],
  };
  const rounds = stageRounds(task, order);
  assert.deepEqual(rounds.script, { rounds: 2, interna: 1, cliente: 0 });
  assert.deepEqual(rounds.recording, { rounds: 1, interna: 0, cliente: 0 });
  assert.deepEqual(rounds.editing, { rounds: 2, interna: 0, cliente: 1 });
}

const people = [
  { id: POLIANA, full_name: 'Poliana', indicator_profile: 'gestao' },
  { id: RAY, full_name: 'Ray', indicator_profile: 'design' },
  { id: GABRIEL, full_name: 'Gabriel', indicator_profile: 'roteiro_gravacao' },
  { id: SAMUEL, full_name: 'Samuel', indicator_profile: 'edicao' },
  { id: 'josias', full_name: 'Josias', indicator_profile: 'nenhum' },
];

// Editor entregou no prazo e voltou alteração: continua no prazo, a volta vira rodada.
const videoTask = {
  id: 'v1', title: 'Reels', type: 'video', client_id: 'c1', workflow_template_id: 'tpl-video', due_date: '2026-10-10',
  production_delivered_at: '2026-10-09T15:00:00Z', review_round: 0, assignee_ids: [],
  status_history: [{ status: 'review', user_id: SAMUEL, timestamp: '2026-10-09T15:00:00Z', assignee_ids: [POLIANA] }],
  stage_execution_history: [
    move('2026-10-09T15:00:00Z', 'editing', 'review', [SAMUEL], [POLIANA]),
    move('2026-10-11T12:00:00Z', 'review', null, [POLIANA], [SAMUEL], 'alteração'),
    move('2026-10-12T12:00:00Z', null, 'review', [SAMUEL], [POLIANA], 'review', 'alteração'),
  ],
};
// Bruto chegou na edição no dia do prazo: a entrega atrasada não conta contra o editor.
const lateRawTask = {
  id: 'v2', title: 'Reels 2', type: 'reels', client_id: 'c1', workflow_template_id: 'tpl-video', due_date: '2026-10-10',
  production_delivered_at: '2026-10-12T15:00:00Z', assignee_ids: [], status_history: [],
  stage_execution_history: [
    move('2026-10-10T13:00:00Z', 'recording', 'editing', [GABRIEL], [SAMUEL]),
    move('2026-10-12T15:00:00Z', 'editing', 'review', [SAMUEL], [POLIANA]),
  ],
};
// Arte entregue atrasada, sem atribuição a quem não estava na etapa.
const artTask = {
  id: 'a1', title: 'Arte', type: 'arte', client_id: 'c1', workflow_template_id: 'tpl-art', due_date: '2026-10-05',
  production_delivered_at: '2026-10-07T15:00:00Z', assignee_ids: [], status_history: [],
  stage_execution_history: [move('2026-10-07T15:00:00Z', 'art_production', 'review', [RAY], [POLIANA])],
};
// Fluxo antigo não entra no prazo.
const oldTask = {
  id: 'o1', title: 'Post antigo', type: 'social_media', client_id: 'c1', due_date: '2026-10-01',
  production_delivered_at: '2026-10-03T12:00:00Z', assignee_ids: [],
  status_history: [{ status: 'review', assignee_ids: [RAY], timestamp: '2026-10-03T12:00:00Z' }],
};

const result = computeCollaboratorIndicators({
  month: '2026-10-01',
  today: '2026-10-20',
  people,
  tasks: [videoTask, lateRawTask, artTask, oldTask],
  templates: [VIDEO_TEMPLATE, ART_TEMPLATE],
  clients: [{ id: 'c1', empresa: 'Loja', responsavel: POLIANA }],
  snapshots: {
    cobertura_dia1: { rows: [
      { cliente_id: 'c1', empresa: 'Loja', responsavel_id: POLIANA, tipo_servico_norm: 'execucao_completa', contratado: 10, planejado: 12, tem_plano_mes: true },
      { cliente_id: 'c2', empresa: 'Outra', responsavel_id: POLIANA, tipo_servico_norm: 'execucao_completa', contratado: 10, planejado: 5, tem_plano_mes: true },
      { cliente_id: 'c3', empresa: 'Só tráfego', responsavel_id: POLIANA, tipo_servico_norm: 'trafego_apenas', contratado: 0, planejado: 0 },
    ] },
  },
});

assert.equal(result.length, 4, 'perfil "nenhum" não aparece');
const find = (personId, key) => {
  const card = result.find((row) => row.person.id === personId);
  return Object.values(card.layers).flat().find((item) => item.key === key);
};

const samuelPrazo = find(SAMUEL, 'videos_prazo');
assert.equal(samuelPrazo.value, 1);
assert.equal(samuelPrazo.items.length, 2);
assert.equal(samuelPrazo.items.find((item) => item.taskId === 'v2').ok, null, 'bruto atrasado não pesa no editor');
const samuelRodadas = find(SAMUEL, 'videos_rodadas');
assert.equal(samuelRodadas.value, 1.5);

const rayPrazo = find(RAY, 'artes_prazo');
assert.equal(rayPrazo.value, 0);
assert.equal(rayPrazo.items.length, 1, 'post do fluxo antigo não entra');
assert.equal(result.find((row) => row.person.id === RAY).oldFlowDeliveries, 1);
assert.equal(find(SAMUEL, 'artes_prazo'), undefined);

const cobertura = find(POLIANA, 'cobertura_dia1');
assert.equal(cobertura.value, 15 / 20, 'excesso de um cliente não compensa outro');
assert.equal(cobertura.hit, false);

const vencidas = find(POLIANA, 'vencidas_fechamento');
assert.equal(vencidas.measured, false, 'sem foto do fechamento não vira zero');
assert.equal(find(GABRIEL, 'roteiros_dia28').measured, false);
assert.equal(find(GABRIEL, 'regravacao').value, 0);

// Hábitos novos não são cobrados antes de 01/10/2026.
const september = computeCollaboratorIndicators({ month: '2026-09-01', today: '2026-10-01', people, tasks: [], templates: [] });
const sepGabriel = Object.values(september.find((row) => row.person.id === GABRIEL).layers).flat();
assert.equal(sepGabriel.find((item) => item.key === 'gravacao_data').measured, false);
assert.equal(sepGabriel.find((item) => item.key === 'regravacao').measured, false);
assert.match(sepGabriel.find((item) => item.key === 'vencidas_fechamento').reason, /01\/10\/2026/);

console.log('collaboratorIndicators: ok');

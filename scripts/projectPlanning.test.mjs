import test from 'node:test';
import assert from 'node:assert/strict';
import { applyProjectPlanSuggestion, reuseProjectPlan, projectPlanPayload, parseSuggestedPlanMaterials, normalizeSuggestedDate, nextPlanMaterialNumber, normalizePlanMaterialNumber, planMaterialSequenceNumber, planMaterialTaskTitle, planMaterialTaskType, planMaterialPreparation } from '../src/lib/projectPlanning.js';

const source = { id: 'plan', project_id: 'source', objetivo: 'Objetivo', materiais: [{ id: 'linked-material', tipo: 'story', descricao: 'Material existente', detalhes: 'Briefing', canais: ['Instagram'], data_entrega: '2026-09-14', data_postagem: '2026-09-16', responsavel_id: 'person' }], conteudo_criativos: { fases: [{ id: 'action', nome: 'Campanha', data_entrega: '2026-09-14' }] }, cronograma: [{ id: 'manual', data: '2026-09-15' }] };
test('AI suggestions preserve existing material identity and only append or patch identified materials', () => {
  const result = applyProjectPlanSuggestion(source, { materiais: [{ descricao: 'Sugestão', tipo: 'video' }] });
  assert.equal(result.materiais[0].id, 'linked-material');
  assert.equal(result.materiais.length, 2);
  assert.ok(result.materiais[1].id);
  const patched = applyProjectPlanSuggestion(result, { materiais: [{ id: 'linked-material', descricao: 'Novo título' }] });
  assert.equal(patched.materiais.length, 2);
  assert.equal(patched.materiais[0].id, 'linked-material');
  assert.equal(patched.materiais[0].detalhes, 'Briefing');
  assert.equal(source.materiais[0].descricao, 'Material existente');
});
test('reuse gives new identities and clears execution dates and people without changing source', () => {
  const result = reuseProjectPlan(source, 'target');
  assert.equal(result.project_id, 'target');
  assert.equal(result.id, undefined);
  assert.notEqual(result.materiais[0].id, source.materiais[0].id);
  assert.equal(result.materiais[0].data_entrega, '');
  assert.equal(result.materiais[0].data_postagem, '');
  assert.equal(result.materiais[0].responsavel_id, null);
  assert.equal(result.materiais[0].briefing_status, 'needs_briefing');
  assert.equal(result.materiais[0].script_status, 'not_started');
  assert.deepEqual(result.materiais[0].canais, ['Instagram']);
  assert.deepEqual(result.cronograma, []);
  assert.equal(source.materiais[0].data_entrega, '2026-09-14');
});
test('reuse removes old publication evidence and briefing dates while retaining content and references', () => {
  const previous = structuredClone(source);
  Object.assign(previous.materiais[0], {
    task_id: 'old-task', tarefa_id: 'legacy-task', status_material: 'publicado',
    data_uso: '2026-09-16', data_gravacao: '2026-09-12',
    link_publicacao: 'https://example.com/old-post', url_publicacao: 'https://example.com/legacy-post',
    referencia_url: 'https://example.com/creative-reference', referencias: 'Referências para a criação',
    roteiro: 'Roteiro reutilizável', legenda: 'Legenda base', cta: 'Saiba mais', copy_final: 'Texto da peça',
  });
  const result = reuseProjectPlan(previous, 'next-month');
  const material = result.materiais[0];
  for (const key of ['task_id', 'tarefa_id', 'link_publicacao', 'url_publicacao', 'data_uso', 'data_gravacao']) {
    assert.equal(Object.hasOwn(material, key), false, `${key} must not be reused`);
  }
  assert.equal(material.status_material, 'rascunho');
  for (const key of ['referencia_url', 'referencias', 'roteiro', 'legenda', 'cta', 'copy_final', 'detalhes', 'canais']) {
    assert.deepEqual(material[key], previous.materiais[0][key], `${key} must remain available`);
  }
  material.canais.push('Facebook');
  assert.deepEqual(previous.materiais[0].canais, ['Instagram']);
  assert.equal(previous.materiais[0].link_publicacao, 'https://example.com/old-post');
  assert.equal(previous.materiais[0].data_uso, '2026-09-16');
  assert.deepEqual(projectPlanPayload(result).cronograma, []);
});
test('payload preserves material channels, identities and content but strips database ownership fields', () => {
  const payload = projectPlanPayload(source);
  assert.equal(payload.id, undefined);
  assert.equal(payload.project_id, undefined);
  assert.equal(payload.materiais[0].id, 'linked-material');
  assert.equal(payload.cronograma.find((c) => c.source === 'material').data, '2026-09-16');
});
test('AI material extraction accepts fenced JSON, normalizes fields and keeps only supported channels and dates', () => {
  const response = `Sugestão:\n\`\`\`json\n{"materiais":[{"tipo":"Vídeo","numero":"1","titulo":"Vídeo institucional","briefing":"Mostrar a loja","texto":"Cena 1","legenda":"Conheça","cta":"Visite","canais":["instagram","Tik Tok","Inexistente"],"data_postagem":"2026-09-20","data_entrega":"20/09/2026"}]}\n\`\`\``;
  const result = parseSuggestedPlanMaterials(response);
  assert.equal(result.length, 1);
  assert.equal(result[0].tipo, 'video');
  assert.equal(result[0].formato, 'Vídeo');
  assert.equal(result[0].numero, '01');
  assert.equal(result[0].descricao, 'Vídeo institucional');
  assert.equal(result[0].detalhes, 'Mostrar a loja');
  assert.equal(result[0].roteiro, 'Cena 1');
  assert.deepEqual(result[0].canais, ['Instagram', 'TikTok']);
  assert.equal(result[0].data_postagem, '2026-09-20');
  assert.equal(result[0].data_entrega, '2026-09-20');
  assert.equal(result[0].status_material, 'rascunho');
});
test('AI material extraction normalizes explicit Brazilian and written dates using the project period', () => {
  assert.equal(normalizeSuggestedDate('05/09/2026'), '2026-09-05');
  assert.equal(normalizeSuggestedDate('Postar em 5 de setembro', '2026-09-01'), '2026-09-05');
  assert.equal(normalizeSuggestedDate('31/02/2026'), '');
  assert.equal(normalizeSuggestedDate('5 de setembro'), '');
  const result = parseSuggestedPlanMaterials({ materiais: [{ tipo: 'reels', descricao: 'Aniversário', prazo_producao: '03/09', data_publicacao: '5 de setembro' }] }, [], { referencePeriod: '2026-09-01' });
  assert.equal(result[0].data_entrega, '2026-09-03');
  assert.equal(result[0].data_postagem, '2026-09-05');
});
test('AI material extraction ignores duplicate existing titles and invalid empty items', () => {
  const response = { materiais: [
    { tipo: 'arte', descricao: 'Oferta do mês' },
    { tipo: 'arte', descricao: '  oferta do mês  ' },
    { tipo: 'reel', descricao: 'Bastidores' },
    { tipo: 'video', descricao: '' },
  ] };
  const result = parseSuggestedPlanMaterials(response, [{ tipo: 'arte', descricao: 'OFERTA DO MÊS' }]);
  assert.equal(result.length, 1);
  assert.equal(result[0].tipo, 'reels');
  assert.equal(result[0].numero, '01');
  assert.equal(result[0].descricao, 'Bastidores');
});
test('AI material extraction keeps task numbering unique inside each material type', () => {
  const result = parseSuggestedPlanMaterials({ materiais: [
    { tipo: 'reels', numero: '01', descricao: 'Campanha A' },
    { tipo: 'reels', numero: '01', descricao: 'Campanha B' },
    { tipo: 'arte', numero: '01', descricao: 'Campanha C' },
  ] });
  assert.deepEqual(result.map((item) => [item.tipo, item.numero]), [['reels', '01'], ['reels', '02'], ['arte', '01']]);
});
test('AI material extraction rejects unstructured responses instead of altering the plan', () => {
  assert.throws(() => parseSuggestedPlanMaterials('Aqui estão algumas ideias sem JSON.'), /formato que não pôde ser conferido/);
});
test('material numbering keeps the standard sequence per type', () => {
  assert.equal(normalizePlanMaterialNumber('video 2'), '02');
  assert.equal(normalizePlanMaterialNumber('0'), '');
  assert.equal(nextPlanMaterialNumber([{ tipo: 'video', numero: '01' }, { tipo: 'video', descricao: 'Vídeo 04 - Oferta' }, { tipo: 'arte', numero: '09' }], 'video'), '05');
  assert.equal(nextPlanMaterialNumber([{ tipo: 'arte', numero: '09' }], 'arte'), '10');
  const legacy = [{ id: 'a', tipo: 'video', descricao: 'Primeiro' }, { id: 'b', tipo: 'video', descricao: 'Segundo' }, { id: 'c', tipo: 'story', descricao: 'Apoio' }];
  assert.equal(nextPlanMaterialNumber(legacy, 'video'), '03');
  assert.equal(planMaterialSequenceNumber(legacy, legacy[1]), '02');
  assert.equal(planMaterialTaskTitle('Toniolo', legacy[1], legacy), '[Toniolo] Video 02 - Segundo');
  assert.equal(planMaterialTaskTitle('Ápice Noivas', { tipo: 'video', numero: '12', descricao: 'Pinterest' }), '[Ápice Noivas] Video 12 - Pinterest');
  assert.equal(planMaterialTaskTitle('Ápice Noivas', { tipo: 'video', numero: '12', descricao: '[Ápice Noivas] Vídeo 12 - Pinterest' }), '[Ápice Noivas] Video 12 - Pinterest');
});
test('material type resolves the same workflow family used when the task is created', () => {
  assert.equal(planMaterialTaskType({ tipo: 'video' }), 'video');
  assert.equal(planMaterialTaskType({ tipo: 'reel' }), 'reels');
  assert.equal(planMaterialTaskType({ tipo: 'story' }), 'arte');
  assert.equal(planMaterialTaskType({ tipo: 'post' }), 'arte');
  assert.equal(planMaterialTaskType({ tipo: 'carrossel' }), 'carrossel');
});
test('material preparation skips only the work explicitly marked as ready', () => {
  const stages = [
    { key: 'backlog', label: 'A Fazer', kind: 'backlog' },
    { key: 'briefing', label: 'Briefing', kind: 'planning' },
    { key: 'script', label: 'Roteiro', kind: 'production' },
    { key: 'script_review', label: 'Aprovação interna do roteiro', kind: 'review' },
    { key: 'recording', label: 'Gravação', kind: 'production' },
  ];
  assert.equal(planMaterialPreparation({ tipo: 'video' }, stages).entryStageKey, 'briefing');
  assert.equal(planMaterialPreparation({ tipo: 'video', briefing_status: 'ready' }, stages).entryStageKey, 'script');
  assert.equal(planMaterialPreparation({ tipo: 'video', briefing_status: 'ready', script_status: 'ready_for_review' }, stages).entryStageKey, 'script_review');
  assert.equal(planMaterialPreparation({ tipo: 'video', briefing_status: 'ready', script_status: 'approved' }, stages).entryStageKey, 'recording');
  const artStages = [stages[0], stages[1], { key: 'art_production', label: 'Produção da arte', kind: 'production' }];
  assert.equal(planMaterialPreparation({ tipo: 'arte', briefing_status: 'ready' }, artStages).entryStageKey, 'art_production');
});

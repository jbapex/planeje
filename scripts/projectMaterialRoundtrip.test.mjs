import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PJ_STORY_MARKER,
  dbMateriaisToEditorShape,
  editorMateriaisShapeToDbRows,
  mergeCronogramaWithMaterials,
} from '../src/lib/campaignPlanMateriais.js';

const story = (id, descricao) => ({
  id, tipo: 'arte', formato: 'Story', descricao,
  detalhes: 'Roteiro já revisado', data_entrega: '2026-09-20', data_postagem: '2026-09-21',
  responsavel_id: 'editor-id', plataforma: 'Instagram', channels: ['Instagram', 'Facebook'],
  legenda: 'Legenda aprovada', cta: 'Saiba mais', task_id: `task-${id}`,
  publications: [{ id: 'publication-1', channel: 'Instagram', status: 'published', evidence_url: 'https://example.com/post' }],
  [PJ_STORY_MARKER]: true,
});

test('repeated database/editor saves preserve story IDs, links, dates and all metadata', () => {
  const originals = [story('story-a', 'Bastidores'), story(1720000000002, 'Produto')];
  let rows = structuredClone(originals);
  for (let i = 0; i < 6; i++) {
    const editor = dbMateriaisToEditorShape(rows);
    assert.deepEqual(editor.stories_ideias, ['Bastidores', 'Produto']);
    assert.ok(editor.stories_ideias.every(value => typeof value === 'string'));
    rows = editorMateriaisShapeToDbRows(JSON.parse(JSON.stringify(editor)));
    assert.deepEqual(rows, originals);
  }
  const calendar = mergeCronogramaWithMaterials({ materiais: rows, cronograma: [] });
  assert.deepEqual(calendar.map(item => item.id), ['material-story-a', 'material-1720000000002']);
});

test('editing story text keeps the same material and does not mutate loaded database rows', () => {
  const original = story('a', 'Tema inicial');
  const editor = dbMateriaisToEditorShape([original]);
  editor.stories_ideias = ['Tema revisado'];
  const rows = editorMateriaisShapeToDbRows(editor);
  assert.deepEqual(rows, [{ ...original, descricao: 'Tema revisado' }]);
  assert.equal(original.descricao, 'Tema inicial');
  assert.equal(rows[0].task_id, 'task-a');
});

test('deleting and reordering strings retain surviving IDs without reviving removed rows', () => {
  const a = story('a', 'Primeiro');
  const b = story('b', 'Segundo');
  const c = story('c', 'Terceiro');
  const editor = dbMateriaisToEditorShape([a, b, c]);
  editor.stories_ideias = ['Terceiro', 'Segundo'];
  assert.deepEqual(editorMateriaisShapeToDbRows(editor), [c, b]);
});

test('new strings get distinct IDs once and keep them over repeated saves and further edits', () => {
  const editor = dbMateriaisToEditorShape({ stories_ideias: ['Ideia um', 'Ideia dois', ''] });
  const first = editorMateriaisShapeToDbRows(editor);
  assert.equal(first.length, 2);
  assert.notEqual(first[0].id, first[1].id);
  assert.deepEqual(editorMateriaisShapeToDbRows(editor), first);
  editor.stories_ideias = ['Ideia um revisada', 'Ideia dois', 'Ideia três'];
  const second = editorMateriaisShapeToDbRows(editor);
  assert.equal(second[0].id, first[0].id);
  assert.equal(second[1].id, first[1].id);
  assert.equal(new Set(second.map(row => row.id)).size, 3);
  assert.deepEqual(editorMateriaisShapeToDbRows(editor), second);
});

test('removing the first story and appending a new one does not transfer the removed link', () => {
  const editor = dbMateriaisToEditorShape([story('a', 'Primeiro'), story('b', 'Segundo')]);
  editor.stories_ideias = ['Segundo', 'Novo'];
  const rows = editorMateriaisShapeToDbRows(editor);
  assert.equal(rows[0].id, 'b');
  assert.notEqual(rows[1].id, 'a');
  assert.notEqual(rows[1].id, 'b');
  assert.equal(rows[1].task_id, undefined);
});

test('duplicate story titles remain separate materials when one title changes', () => {
  const editor = dbMateriaisToEditorShape([story('a', 'Mesmo tema'), story('b', 'Mesmo tema')]);
  editor.stories_ideias = ['Mesmo tema', 'Outro tema'];
  const rows = editorMateriaisShapeToDbRows(editor);
  assert.deepEqual(rows.map(row => [row.id, row.descricao]), [['a', 'Mesmo tema'], ['b', 'Outro tema']]);
});

test('an existing blank story retains its link while a new blank input remains a draft', () => {
  const original = story('a', '');
  const editor = dbMateriaisToEditorShape([original]);
  editor.stories_ideias.push('');
  assert.deepEqual(editorMateriaisShapeToDbRows(editor), [original]);
});

test('legacy object shapes and raw arrays preserve other materials and object story metadata', () => {
  const post = { id: 'post', tipo: 'post', formato: 'Post', descricao: 'Arte', custom: { preserved: true } };
  const video = { id: 'video', tipo: 'video', descricao: 'Filme', task_id: 'video-task' };
  const s = story('s', 'Story');
  const editor = dbMateriaisToEditorShape({ posts: [post], videos: [video], stories_ideias: [s] });
  assert.deepEqual(editor.stories_ideias, ['Story']);
  assert.deepEqual(editorMateriaisShapeToDbRows(editor), [post, video, s]);
  assert.deepEqual(editorMateriaisShapeToDbRows([post, video, s]), [post, video, s]);
  const legacy = [{ id: 'legacy', descricao: 'Sem tipo', custom: 'unchanged' }];
  assert.deepEqual(editorMateriaisShapeToDbRows(dbMateriaisToEditorShape(legacy)), legacy);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { createCrmPreview, PREVIEW_IDS } from './preview/fixture.js';
import { emptyKnowledgeSections, compileKnowledgeSections } from '../../supabase/functions/_shared/crmIaKnowledge.js';

test('prévia responde com a mesma base e projeção textual após salvar as seções', async () => {
  const preview = createCrmPreview(), client = PREVIEW_IDS.clientA;
  const source = (await preview.request('workspace', client)).bases[0];
  const value = emptyKnowledgeSections();value.company.name = 'Empresa sintética';value.context = 'Contexto sintético.';
  const saved = await preview.request('save_base', client, { id: source.id, expected_updated_at: source.updated_at, nome: source.nome, crm_ia_sections: value });
  assert.equal(saved.id, source.id);assert.equal(saved.conteudo, compileKnowledgeSections(value));
  assert.deepEqual((await preview.request('workspace', client)).bases.find(row => row.id === source.id).crm_ia_sections, value);
});

test('prévia mantém estrutura ao renomear e invalida ao mudar o texto pelo contrato legado', async () => {
  const preview = createCrmPreview(), client = PREVIEW_IDS.clientA;
  const value = emptyKnowledgeSections();value.context = 'Texto original';
  let saved = await preview.request('save_base', client, { nome: 'Base sintética', crm_ia_sections: value });
  saved = await preview.request('save_base', client, { id: saved.id, expected_updated_at: saved.updated_at, nome: 'Renomeada', conteudo: saved.conteudo });
  assert.deepEqual(saved.crm_ia_sections, value);
  saved = await preview.request('save_base', client, { id: saved.id, expected_updated_at: saved.updated_at, nome: saved.nome, conteudo: 'Texto alterado' });
  assert.equal(saved.conteudo, 'Texto alterado');assert.equal(saved.crm_ia_sections, null);
});

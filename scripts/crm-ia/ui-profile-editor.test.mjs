import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { build } from 'esbuild';

const root = new URL('../../', import.meta.url).pathname;
const require = createRequire('/tmp/planeje-crm-ui-qa/package.json');
const React = require('react');
const { act, create } = require('react-test-renderer');
const scratch = await mkdtemp('/tmp/planeje-crm-ui-qa/profile-editor-');
await build({
  stdin: { contents: `export {default as Agents} from ${JSON.stringify(path.join(root, 'src/components/crm-ia/CrmIaAgents.jsx'))};export {MemoryRouter} from 'react-router-dom';`, resolveDir: root },
  bundle: true, platform: 'node', format: 'cjs', outfile: path.join(scratch, 'editor.cjs'), external: ['react'],
  plugins: [{ name: 'fixture-dialog', setup(builder) {
    builder.onResolve({ filter: /^@\/components\/ui\/dialog$/ }, () => ({ path: 'dialog', namespace: 'fixture' }));
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: `import React from 'react';export const Dialog=({children})=>React.createElement('div',null,children);export const DialogContent=({children,...props})=>React.createElement('section',props,children);export const DialogTitle=({children})=>React.createElement('h2',null,children);export const DialogDescription=({children})=>React.createElement('p',null,children);` }));
    builder.onResolve({ filter: /^@\// }, ({ path: name }) => { const file = path.join(root, 'src', name.slice(2)); return { path: [file, file + '.js', file + '.jsx'].find(existsSync) }; });
  } }],
});
const { Agents, MemoryRouter } = require(path.join(scratch, 'editor.cjs'));
const owner = '10000000-0000-4000-8000-000000000001';
const workspace = {
  client: { id: 'synthetic-account' }, agents: [], pipelines: [{ id: 'pipeline', nome: 'Funil sintético' }],
  stages: [], bases: [], products: [], people: [{ id: owner, full_name: 'Responsável sintético' }],
  config: { revision: 'cfg', data: {} },
};
const text = node => typeof node === 'string' ? node : Array.isArray(node) ? node.map(text).join(' ') : node ? text(node.children ?? node.props?.children) : '';
const button = (renderer, label) => renderer.root.findAllByType('button').find(node => (node.props['aria-label'] || text(node.props.children).trim()) === label);
async function click(renderer, label) {
  const target = button(renderer, label); assert.ok(target, `Botão ${label}`);
  await act(async () => target.props.onClick?.());
}
async function change(renderer, label, value) {
  await act(async () => renderer.root.findByProps({ 'aria-label': label }).props.onChange({ target: { value, checked: value } }));
}
async function submit(renderer) {
  await act(async () => renderer.root.findAllByType('form').at(-1).props.onSubmit({ preventDefault() {} }));
}
function fixture({ published, draft } = {}) {
  const calls = []; let revision = 'draft-0', saved = draft;
  return { calls, get saved() { return saved; }, async api(action, payload) {
    calls.push([action, payload]);
    if (action === 'usage') return {};
    if (action === 'capabilities') return { audio: { available: true, input_available: true } };
    if (action === 'agent_draft') return { revision, published, draft: saved && (!payload.tipo || saved.funil?.crm_ia?.tipo === payload.tipo) ? { payload: saved, revision } : null };
    if (action === 'save_agent_draft') { assert.equal(payload.revision, revision); saved = payload.data; revision += 'x'; return { revision }; }
    if (action === 'publish_agent_draft') {
      assert.equal(payload.revision, revision);
      if ((saved.funil.crm_ia.profiles || []).some(profile => !profile.nome.trim() || !profile.descricao.trim())) throw new Error('Preencha nome e descrição de cada perfil.');
      return { published: true, agent: { id: 'published-agent', ...saved } };
    }
    if (action === 'discard_agent_draft') { saved = null; revision += 'd'; return { discarded: true, revision }; }
    throw new Error(`Operação externa proibida no teste: ${action}`);
  } };
}
async function mount(fixture, extra = {}, rendererOptions = {}) {
  let renderer;
  await act(async () => { renderer = create(React.createElement(MemoryRouter, { future: { v7_startTransition: true, v7_relativeSplatPath: true } }, React.createElement(Agents, { api: fixture.api, mutate: fixture.api, workspace, canManage: true, ...extra })), rendererOptions); });
  return renderer;
}
const profileId = /^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i;

test('perfil incompleto fecha, salva e reabre com o mesmo UUID sem publicar ou escrever lead', async () => {
  const fixtureApi = fixture(), renderer = await mount(fixtureApi);
  try {
    await click(renderer, 'Configurar Qualificação'); await click(renderer, 'Adicionar perfil');
    await change(renderer, 'Nome do perfil 1', 'Em avaliação');
    await click(renderer, 'Cancelar');
    const profile = fixtureApi.saved.funil.crm_ia.profiles[0];
    assert.match(profile.id, profileId); assert.equal(profile.nome, 'Em avaliação'); assert.equal(profile.descricao, '');
    assert.deepEqual(profile.actions, { owner_id: null, tags: [] });
    assert.equal(fixtureApi.calls.some(([action]) => ['publish_agent_draft', 'save_lead', 'save_agent'].includes(action)), false);
    await click(renderer, 'Configurar Qualificação'); await click(renderer, 'Cancelar');
    assert.equal(fixtureApi.saved.funil.crm_ia.profiles[0].id, profile.id);
  } finally { await act(async () => renderer.unmount()); }
});

test('editar, reordenar e remover preservam identidade, cor, pistas, responsável e etiquetas de cada perfil', async () => {
  const fixtureApi = fixture(), renderer = await mount(fixtureApi);
  try {
    await click(renderer, 'Configurar Qualificação'); await click(renderer, 'Adicionar perfil');
    await change(renderer, 'Nome do perfil 1', 'Pronto para conversar');
    await change(renderer, 'Cor do perfil 1', '#29a38a');
    await change(renderer, 'Como reconhecer e tratar este perfil 1', 'Demonstra intenção de contratar. Aprofunde a necessidade com cuidado.');
    await change(renderer, 'Nova palavra-chave do perfil 1', 'quer avançar'); await click(renderer, 'Adicionar palavra-chave ao perfil 1');
    await change(renderer, 'Nova palavra-chave do perfil 1', 'quer avançar'); await click(renderer, 'Adicionar palavra-chave ao perfil 1');
    await change(renderer, 'Responsável ao identificar o perfil 1', owner);
    await change(renderer, 'Nova etiqueta do perfil 1', 'prioridade'); await click(renderer, 'Adicionar etiqueta ao perfil 1');
    await click(renderer, 'Adicionar perfil'); await change(renderer, 'Nome do perfil 2', 'Pesquisando');
    await change(renderer, 'Nova palavra-chave do perfil 2', 'texto ainda não adicionado');
    await click(renderer, 'Subir perfil 2');
    assert.equal(renderer.root.findByProps({ 'aria-label': 'Nome do perfil 1' }).props.value, 'Pesquisando');
    assert.equal(renderer.root.findByProps({ 'aria-label': 'Nova palavra-chave do perfil 1' }).props.value, 'texto ainda não adicionado');
    await click(renderer, 'Descer perfil 1');
    await click(renderer, 'Remover perfil 2'); await click(renderer, 'Cancelar');
    const [profile] = fixtureApi.saved.funil.crm_ia.profiles;
    assert.match(profile.id, profileId); assert.equal(profile.nome, 'Pronto para conversar'); assert.equal(profile.cor, '#29a38a');
    assert.match(profile.descricao, /Aprofunde a necessidade/); assert.deepEqual(profile.pistas, ['quer avançar']);
    assert.deepEqual(profile.actions, { owner_id: owner, tags: ['prioridade'] });
    await click(renderer, 'Configurar Qualificação');
    await click(renderer, 'Remover palavra-chave quer avançar do perfil 1');
    await click(renderer, 'Remover etiqueta prioridade do perfil 1');
    await change(renderer, 'Responsável ao identificar o perfil 1', ''); await click(renderer, 'Cancelar');
    assert.equal(fixtureApi.saved.funil.crm_ia.profiles[0].id, profile.id);
    assert.deepEqual(fixtureApi.saved.funil.crm_ia.profiles[0].pistas, []);
    assert.deepEqual(fixtureApi.saved.funil.crm_ia.profiles[0].actions, { owner_id: null, tags: [] });
  } finally { await act(async () => renderer.unmount()); }
});

test('publicação usa a revisão do perfil e exibe rejeição do servidor sem perder rascunho incompleto', async () => {
  const fixtureApi = fixture(), renderer = await mount(fixtureApi);
  try {
    await click(renderer, 'Configurar Qualificação'); await change(renderer, 'Nome do agente', 'Qualificação sintética');
    await click(renderer, 'Adicionar perfil'); await change(renderer, 'Nome do perfil 1', 'Interessado');
    await submit(renderer); assert.match(text(renderer.toJSON()), /Preencha nome e descrição/);
    const id = fixtureApi.saved.funil.crm_ia.profiles[0].id;
    await change(renderer, 'Como reconhecer e tratar este perfil 1', 'Reconheça a intenção pelas respostas e ofereça orientação.');
    await submit(renderer);
    assert.equal(fixtureApi.saved.funil.crm_ia.profiles[0].id, id);
    assert.equal(fixtureApi.calls.filter(([action]) => action === 'publish_agent_draft').length, 2);
    assert.equal(renderer.root.findAllByType('form').length, 0);
  } finally { await act(async () => renderer.unmount()); }
});

test('navegação reflete campos preenchidos, mantém seletores e restringe perfis à qualificação', async () => {
  const fixtureApi = fixture(), renderer = await mount(fixtureApi);
  try {
    await click(renderer, 'Configurar Qualificação');
    const nav = renderer.root.findByProps({ 'aria-label': 'Seções do agente' });
    assert.match(text(nav), /Perfis/); assert.match(text(nav), /Identidade/); assert.match(text(nav), /Áudio/);
    const before = renderer.root.findByProps({ 'aria-label': 'Preenchimento da configuração' }).props.value;
    await change(renderer, 'Nome do agente', 'Agente');
    assert.ok(renderer.root.findByProps({ 'aria-label': 'Preenchimento da configuração' }).props.value > before);
    for (const label of ['Tipo do agente', 'Modelo do agente', 'Objetivo', 'Instruções', 'Respostas em áudio', 'Próximo destino']) assert.equal(renderer.root.findAllByProps({ 'aria-label': label }).length, 1);
    assert.equal(renderer.root.findAll(node => node.type === 'textarea' && node.props['aria-label']?.startsWith('Como reconhecer')).length, 0);
    await click(renderer, 'Cancelar'); await click(renderer, 'Configurar Follow-up');
    assert.equal(Boolean(button(renderer, 'Adicionar perfil')), false);
    assert.doesNotMatch(text(renderer.root.findByProps({ 'aria-label': 'Seções do agente' })), /Perfis/);
    assert.match(text(renderer.toJSON()), /Cadência de follow-up/);
    await click(renderer, 'Cancelar'); await click(renderer, 'Configurar Agendamentos');
    assert.equal(Boolean(button(renderer, 'Adicionar perfil')), false);
    assert.match(text(renderer.toJSON()), /Agenda, duração e lembretes/);
  } finally { await act(async () => renderer.unmount()); }
});

test('perfil publicado mantém identidade ao mudar somente a descrição', async () => {
  const publishedProfile = { id: '20000000-0000-4000-8000-000000000002', nome: 'Anterior', cor: '#123456', descricao: 'Descrição anterior', pistas: ['pista anterior'], actions: { owner_id: null, tags: [] } };
  const published = { id: 'agent', nome: 'Publicado', funil: { crm_ia: { tipo: 'qualificacao', pipeline_id: 'pipeline', profiles: [publishedProfile] } } };
  const fixtureApi = fixture({ published }), renderer = await mount(fixtureApi, { workspace: { ...workspace, agents: [published] } });
  try {
    await click(renderer, 'Configurar Qualificação');
    await change(renderer, 'Como reconhecer e tratar este perfil 1', 'Descrição revisada'); await click(renderer, 'Cancelar');
    assert.deepEqual(fixtureApi.saved.funil.crm_ia.profiles[0], { ...publishedProfile, descricao: 'Descrição revisada' });
    assert.equal(publishedProfile.descricao, 'Descrição anterior');
  } finally { await act(async () => renderer.unmount()); }
});

test('trocar o tipo conserva perfis no rascunho e orienta revisão sem exclusão silenciosa', async () => {
  const profile = { id: '40000000-0000-4000-8000-000000000004', nome: 'Preservado', cor: '#abcdef', descricao: 'Descrição preservada', pistas: [], actions: { owner_id: null, tags: [] } };
  const published = { id: 'agent', nome: 'Publicado', funil: { crm_ia: { tipo: 'qualificacao', pipeline_id: 'pipeline', profiles: [profile] } } };
  const fixtureApi = fixture({ published }), renderer = await mount(fixtureApi, { workspace: { ...workspace, agents: [published] } });
  try {
    await click(renderer, 'Configurar Qualificação'); await change(renderer, 'Tipo do agente', 'followup');
    assert.match(text(renderer.toJSON()), /Volte a esse tipo para revisar ou remover os perfis/);
    assert.equal(Boolean(button(renderer, 'Adicionar perfil')), false);
    await click(renderer, 'Cancelar');
    assert.equal(fixtureApi.saved.funil.crm_ia.tipo, 'followup');
    assert.deepEqual(fixtureApi.saved.funil.crm_ia.profiles, [profile]);
    assert.equal(fixtureApi.calls.some(([action]) => action === 'publish_agent_draft'), false);
  } finally { await act(async () => renderer.unmount()); }
});

test('Enter acrescenta pista sem publicar e navegação abre a seção com foco no summary nativo', async () => {
  let focused = false, scrolled = false;
  const target = { tagName: 'DETAILS', open: false, querySelector: () => ({ focus() { focused = true; } }), scrollIntoView() { scrolled = true; } };
  const fixtureApi = fixture(), renderer = await mount(fixtureApi, {}, { createNodeMock: element => element.props.className === 'crm-ia-agent-sections' ? { querySelector: selector => selector === '#crm-ia-agent-profiles' ? target : null } : null });
  try {
    await click(renderer, 'Configurar Qualificação');
    await act(async () => renderer.root.findByProps({ 'aria-controls': 'crm-ia-agent-profiles' }).props.onClick());
    assert.equal(target.open, true); assert.equal(focused, true); assert.equal(scrolled, true);
    const details = renderer.root.findByProps({ id: 'crm-ia-agent-profiles' });
    assert.notEqual(details.findByType('summary').props.tabIndex, -1);
    await click(renderer, 'Adicionar perfil'); await change(renderer, 'Nova palavra-chave do perfil 1', ' intenção contextual ');
    let prevented = false;
    await act(async () => renderer.root.findByProps({ 'aria-label': 'Nova palavra-chave do perfil 1' }).props.onKeyDown({ key: 'Enter', preventDefault() { prevented = true; } }));
    assert.equal(prevented, true); await click(renderer, 'Cancelar');
    assert.deepEqual(fixtureApi.saved.funil.crm_ia.profiles[0].pistas, ['intenção contextual']);
    assert.equal(fixtureApi.calls.some(([action]) => action === 'publish_agent_draft'), false);
  } finally { await act(async () => renderer.unmount()); }
});

test('escolher áudio ou autonomia desligados continua sendo uma configuração preenchida', async () => {
  const fixtureApi = fixture(), renderer = await mount(fixtureApi);
  try {
    await click(renderer, 'Configurar Qualificação');
    const before = renderer.root.findByProps({ 'aria-label': 'Preenchimento da configuração' }).props.value;
    await change(renderer, 'Autorizar respostas automáticas deste agente', true);
    assert.equal(renderer.root.findByProps({ 'aria-label': 'Preenchimento da configuração' }).props.value, before);
    await change(renderer, 'Autorizar respostas automáticas deste agente', false);
    await change(renderer, 'Respostas em áudio', 'always');
    assert.equal(renderer.root.findByProps({ 'aria-label': 'Preenchimento da configuração' }).props.value, before);
  } finally { await act(async () => renderer.unmount()); }
});

test('limites do contrato desabilitam inclusões sem bloquear a edição e o rascunho', async () => {
  const profiles = Array.from({ length: 30 }, (_, index) => ({ id: `30000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`, nome: `Perfil ${index}`, cor: '#123456', descricao: 'Descrição completa', pistas: Array.from({ length: 30 }, (_, item) => `Pista ${item}`), actions: { owner_id: null, tags: Array.from({ length: 50 }, (_, item) => `Etiqueta ${item}`) } }));
  const fixtureApi = fixture({ draft: { nome: 'Agente', funil: { crm_ia: { tipo: 'qualificacao', pipeline_id: 'pipeline', profiles } } } });
  const renderer = await mount(fixtureApi);
  try {
    await click(renderer, 'Configurar Qualificação');
    assert.equal(button(renderer, 'Adicionar perfil').props.disabled, true);
    await change(renderer, 'Nova palavra-chave do perfil 1', 'Pista excedente');
    await change(renderer, 'Nova etiqueta do perfil 1', 'Etiqueta excedente');
    assert.equal(button(renderer, 'Adicionar palavra-chave ao perfil 1').props.disabled, true);
    assert.equal(button(renderer, 'Adicionar etiqueta ao perfil 1').props.disabled, true);
    assert.equal(renderer.root.findByProps({ 'aria-label': 'Nome do perfil 1' }).props.maxLength, 100);
    assert.equal(renderer.root.findByProps({ 'aria-label': 'Como reconhecer e tratar este perfil 1' }).props.maxLength, 4000);
    await change(renderer, 'Nome do perfil 1', ''); await click(renderer, 'Cancelar');
    assert.equal(fixtureApi.saved.funil.crm_ia.profiles[0].nome, '');
    assert.equal(fixtureApi.saved.funil.crm_ia.profiles.length, 30);
    assert.equal(fixtureApi.calls.some(([action]) => action === 'publish_agent_draft'), false);
  } finally { await act(async () => renderer.unmount()); }
});

test.after(async () => rm(scratch, { recursive: true, force: true }));

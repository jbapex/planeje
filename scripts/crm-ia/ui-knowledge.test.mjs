import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { build } from 'esbuild';
import { compileKnowledgeSections, emptyKnowledgeSections } from '../../supabase/functions/_shared/crmIaKnowledge.js';

const root = new URL('../../', import.meta.url).pathname, require = createRequire('/tmp/planeje-crm-ui-qa/package.json');
const React = require('react'), { act, create } = require('react-test-renderer'), scratch = await mkdtemp('/tmp/planeje-crm-ui-qa/knowledge-');
await build({ stdin: { contents: `export {default as Agents} from ${JSON.stringify(path.join(root, 'src/components/crm-ia/CrmIaAgents.jsx'))};export {MemoryRouter} from 'react-router-dom';`, resolveDir: root }, bundle: true, platform: 'node', format: 'cjs', outfile: path.join(scratch, 'knowledge.cjs'), external: ['react'], loader: { '.css': 'empty' }, plugins: [{ name: 'fixture-dialog', setup(b) {
  b.onResolve({ filter: /^@\/components\/ui\/dialog$/ }, () => ({ path: 'dialog', namespace: 'fixture' }));
  b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: `import React from 'react';export const Dialog=({children,open})=>open?React.createElement('div',null,children):null;export const DialogContent=({children})=>React.createElement('section',null,children);export const DialogTitle=({children})=>React.createElement('h2',null,children);export const DialogDescription=({children})=>React.createElement('p',null,children);` }));
  b.onResolve({ filter: /^@\// }, ({ path: name }) => { const target = path.join(root, 'src', name.slice(2));return { path: [target, target + '.js', target + '.jsx'].find(existsSync) }; });
} }] });
const { Agents, MemoryRouter } = require(path.join(scratch, 'knowledge.cjs'));
const text = value => typeof value === 'string' || typeof value === 'number' ? String(value) : Array.isArray(value) ? value.map(text).join(' ') : value ? text(value.children ?? value.props?.children) : '';
const buttons = (r, label) => r.root.findAllByType('button').filter(n => text(n.props.children).replace(/\s+/g, ' ').trim() === label);
const click = async (r, label) => { const node = buttons(r, label)[0];assert.ok(node, label);await act(async () => node.props.onClick?.()); };
const change = async (r, label, value) => act(async () => r.root.findByProps({ 'aria-label': label }).props.onChange({ target: { value } }));
const submit = async r => act(async () => r.root.findAllByType('form').at(-1).props.onSubmit({ preventDefault() {} }));
const timestamp = n => new Date(Date.UTC(2026, 10, 12, 10, 0, n)).toISOString();
const base = { id: 'base-a', nome: 'Base QA', conteudo: '  Conteúdo anterior 👩🏽‍💻.\n', updated_at: timestamp(0) };
const initial = () => ({ client: { id: 'account-a' }, bases: [structuredClone(base)], agents: [], products: [], pipelines: [], people: [], stages: [], config: { revision: 'config-0', data: {} } });

async function mount({ canManage = true, workspace = initial() } = {}) {
  const f = { calls: [], fail: false, sequence: 0, database: structuredClone(workspace.bases) };
  function Host() {
    const [current, setCurrent] = React.useState(workspace), [manage, setManage] = React.useState(canManage);
    f.setWorkspace = setCurrent;f.setManage = setManage;
    async function api(action, payload) {
      f.calls.push([action, payload]);
      if (action === 'usage') return {};
      if (action !== 'save_base') throw Error('Ação inesperada: ' + action);
      if (f.fail) throw Error('A base foi alterada. Confira os dados atuais.');
      if (f.hold) { f.hold = false;await new Promise((resolve, reject) => { f.releaseSave = resolve;f.rejectSave = reject; }); }
      const before = f.database.find(row => row.id === payload.id);
      if (before) assert.equal(payload.expected_updated_at, before.updated_at);
      const saved = { ...before, id: before?.id || 'new-base', nome: payload.nome, conteudo: compileKnowledgeSections(payload.crm_ia_sections), crm_ia_sections: structuredClone(payload.crm_ia_sections), updated_at: timestamp(++f.sequence) };
      f.database = [...f.database.filter(row => row.id !== saved.id), saved];
      if (!f.failRefresh) setCurrent(previous => previous.client.id !== current.client.id ? previous : { ...previous, bases: [...previous.bases.filter(row => row.id !== saved.id), saved] });
      return saved;
    }
    return React.createElement(Agents, { api, mutate: api, workspace: current, canManage: manage });
  }
  let r;
  await act(async () => { r = create(React.createElement(MemoryRouter, { future: { v7_startTransition: true, v7_relativeSplatPath: true } }, React.createElement(Host))); });
  await click(r, 'Base de conhecimento');
  return { r, f };
}

test('base abre cinco seções, cobertura e texto legado preservado', async () => {
  const { r } = await mount();
  assert.equal(r.root.findByProps({ 'aria-label': 'Contexto adicional' }).props.value, base.conteudo);
  assert.equal(r.root.findByProps({ 'aria-label': 'Nome da empresa' }).props.value, '');
  assert.equal(r.root.findByProps({ 'aria-label': 'Cobertura da base' }).props.value, 1);
  for (const id of ['company', 'hours', 'faq', 'policies', 'context']) assert.equal(r.root.findAllByProps({ id: `crm-ia-knowledge-${id}` }).length, 1);
  await act(async () => r.unmount());
});

test('edição das cinco seções salva JSON na mesma base com versão e retorno atualizados', async () => {
  const { r, f } = await mount();
  await change(r, 'Nome da empresa', 'Empresa QA');
  await click(r, 'Adicionar horário');await change(r, 'Dias do horário 1', 'Seg–Sex');
  await click(r, 'Nova pergunta');await change(r, 'Pergunta 1', 'Como?');await change(r, 'Resposta 1', 'Pela equipe.');
  await click(r, 'Nova política');await change(r, 'Título da política 1', 'Regra');await change(r, 'Conteúdo da política 1', 'Confirme.');
  assert.equal(r.root.findByProps({ 'aria-label': 'Cobertura da base' }).props.value, 5);
  await submit(r);
  const saved = f.calls.findLast(([action]) => action === 'save_base')[1];
  assert.equal(saved.id, base.id);assert.equal(saved.expected_updated_at, base.updated_at);assert.equal(saved.conteudo, undefined);
  assert.equal(saved.crm_ia_sections.company.name, 'Empresa QA');assert.equal(saved.crm_ia_sections.hours[0].days, 'Seg–Sex');
  assert.equal(saved.crm_ia_sections.context, base.conteudo);
  await change(r, 'Contexto adicional', 'Versão seguinte');await submit(r);
  assert.equal(f.calls.findLast(([action]) => action === 'save_base')[1].expected_updated_at, timestamp(1));
  await act(async () => r.unmount());
});

test('remover itens atualiza cobertura sem alterar dados ainda não salvos', async () => {
  const { r, f } = await mount();
  await click(r, 'Nova pergunta');await change(r, 'Pergunta 1', 'Dúvida');await change(r, 'Resposta 1', 'Resposta');
  assert.equal(r.root.findByProps({ 'aria-label': 'Cobertura da base' }).props.value, 2);
  await click(r, 'Remover pergunta 1');
  assert.equal(r.root.findByProps({ 'aria-label': 'Cobertura da base' }).props.value, 1);
  assert.equal(f.calls.some(([action]) => action === 'save_base'), false);
  await act(async () => r.unmount());
});

test('erro de versão preserva edição e não troca de base ou cria outra silenciosamente', async () => {
  const { r, f } = await mount();
  await change(r, 'Contexto adicional', 'Minha edição');f.fail = true;await submit(r);
  assert.match(text(r.toJSON()), /base foi alterada/i);
  assert.equal(r.root.findByProps({ 'aria-label': 'Contexto adicional' }).props.value, 'Minha edição');
  assert.equal(r.root.findByProps({ 'aria-label': 'Base de conhecimento' }).props.disabled, true);
  assert.equal(buttons(r, 'Nova base')[0].props.disabled, true);
  await click(r, 'Descartar alterações');
  assert.equal(r.root.findByProps({ 'aria-label': 'Contexto adicional' }).props.value, base.conteudo);
  assert.equal(f.calls.filter(([action]) => action === 'save_base').length, 1);
  await act(async () => r.unmount());
});

test('trocar abas preserva o formulário sem publicar; trocar conta remove o rascunho anterior', async () => {
  const { r, f } = await mount();
  await change(r, 'Contexto adicional', 'Edição local mantida');
  await click(r, 'Agentes');await click(r, 'Base de conhecimento');
  assert.equal(r.root.findByProps({ 'aria-label': 'Contexto adicional' }).props.value, 'Edição local mantida');
  await act(async () => f.setWorkspace({ ...initial(), client: { id: 'account-b' }, bases: [{ ...base, id: 'base-b', conteudo: 'Outra conta' }] }));
  assert.equal(r.root.findByProps({ 'aria-label': 'Contexto adicional' }).props.value, 'Outra conta');
  assert.equal(f.calls.some(([action]) => action === 'save_base'), false);
  await act(async () => r.unmount());
});

test('criar e renomear usam save_base preservando conteúdo e identidade', async () => {
  const { r, f } = await mount();
  await click(r, 'Nova base');await change(r, 'Nome da base', 'Nova QA');await submit(r);
  assert.equal(f.calls.findLast(([action]) => action === 'save_base')[1].id, undefined);
  assert.equal(r.root.findByProps({ 'aria-label': 'Cobertura da base' }).props.value, 0);
  await click(r, 'Renomear base');await change(r, 'Nome da base', 'Renomeada QA');await submit(r);
  const payload = f.calls.findLast(([action]) => action === 'save_base')[1];
  assert.equal(payload.id, 'new-base');assert.equal(payload.nome, 'Renomeada QA');assert.deepEqual(payload.crm_ia_sections, emptyKnowledgeSections());
  await act(async () => r.unmount());
});

test('perda de permissão mantém consulta e não permite salvar pela UI', async () => {
  const { r, f } = await mount();
  await change(r, 'Contexto adicional', 'Ainda não salva');
  await act(async () => f.setManage(false));await submit(r);
  assert.equal(f.calls.some(([action]) => action === 'save_base'), false);
  assert.equal(r.root.findAllByType('fieldset').some(node => node.props.disabled), true);
  await act(async () => r.unmount());
});

test('recibo da renomeação prevalece quando o refresh dos metadados falha', async () => {
  const { r, f } = await mount();f.failRefresh = true;
  await click(r, 'Renomear base');await change(r, 'Nome da base', 'Nome confirmado');await submit(r);
  assert.match(text(r.toJSON()), /Ensine a IA sobre Nome confirmado/);
  await change(r, 'Contexto adicional', 'Edição depois do recibo');await submit(r);
  const payload = f.calls.findLast(([action]) => action === 'save_base')[1];
  assert.equal(payload.expected_updated_at, timestamp(1));assert.equal(payload.nome, 'Nome confirmado');
  await act(async () => r.unmount());
});

test('atualização concorrente mantém a edição até descarte explícito e recarrega a versão atual', async () => {
  const { r, f } = await mount();await change(r, 'Contexto adicional', 'Minha edição');
  const newer = { ...base, updated_at: timestamp(50), conteudo: 'Conteúdo mais recente' };
  f.database = [newer];f.sequence = 50;
  await act(async () => f.setWorkspace({ ...initial(), bases: [newer] }));
  assert.equal(r.root.findByProps({ 'aria-label': 'Contexto adicional' }).props.value, 'Minha edição');
  await click(r, 'Descartar alterações');
  assert.equal(r.root.findByProps({ 'aria-label': 'Contexto adicional' }).props.value, newer.conteudo);
  await change(r, 'Contexto adicional', 'Depois da atualização');await submit(r);
  assert.equal(f.calls.findLast(([action]) => action === 'save_base')[1].expected_updated_at, newer.updated_at);
  await act(async () => r.unmount());
});

test('duplo submit reserva uma gravação e retorno atrasado não invade outra conta', async () => {
  const { r, f } = await mount();await change(r, 'Contexto adicional', 'Edição A');f.hold = true;
  let saving;
  await act(async () => { saving = r.root.findAllByType('form').at(-1).props.onSubmit({ preventDefault() {} }); });
  await submit(r);assert.equal(f.calls.filter(([action]) => action === 'save_base').length, 1);
  await act(async () => f.setWorkspace({ ...initial(), client: { id: 'account-b' }, bases: [{ ...base, id: 'base-b', conteudo: 'Conteúdo B' }] }));
  await act(async () => { f.releaseSave();await saving; });
  assert.equal(r.root.findByProps({ 'aria-label': 'Contexto adicional' }).props.value, 'Conteúdo B');
  assert.doesNotMatch(text(r.toJSON()), /Base salva\./);
  await act(async () => r.unmount());
});

test('revogação sem bases autorizadas encerra a exibição anterior', async () => {
  const { r, f } = await mount();
  await act(async () => { f.setManage(false);f.setWorkspace({ ...initial(), bases: [] }); });
  assert.equal(r.root.findAllByProps({ 'aria-label': 'Contexto adicional' }).length, 0);
  assert.equal(f.calls.some(([action]) => action === 'save_base'), false);
  await act(async () => r.unmount());
});

test('renomeação pendente continua bloqueada ao sair e voltar à aba', async () => {
  const { r, f } = await mount();await click(r, 'Renomear base');await change(r, 'Nome da base', 'Nome em confirmação');f.hold = true;
  let saving;
  await act(async () => { saving = r.root.findAllByType('form').at(-1).props.onSubmit({ preventDefault() {} }); });
  await click(r, 'Agentes');await click(r, 'Base de conhecimento');
  try {
    assert.equal(r.root.findAllByType('fieldset').every(node => node.props.disabled === true), true);
    assert.equal(buttons(r, 'Nova base')[0].props.disabled, true);
  } finally { await act(async () => { f.releaseSave();await saving; }); }
  assert.match(text(r.toJSON()), /Ensine a IA sobre Nome em confirmação/);
  assert.equal(r.root.findAllByProps({ 'aria-label': 'Nome da base' }).length, 0);
  assert.equal(f.calls.filter(([action]) => action === 'save_base').length, 1);
  await act(async () => r.unmount());
});

test('versões diferentes no mesmo milissegundo oferecem recarga sem sobrescrever os campos', async () => {
  const older = { ...base, updated_at: '2026-11-12T10:00:00.123100Z', conteudo: 'Anterior' };
  const newer = { ...base, updated_at: '2026-11-12T10:00:00.123900Z', conteudo: 'Mais recente' };
  const { r, f } = await mount({ workspace: { ...initial(), bases: [older] } });
  await act(async () => f.setWorkspace({ ...initial(), bases: [newer] }));
  assert.equal(r.root.findByProps({ 'aria-label': 'Contexto adicional' }).props.value, older.conteudo);
  assert.ok(buttons(r, 'Recarregar base')[0]);await click(r, 'Recarregar base');
  assert.equal(r.root.findByProps({ 'aria-label': 'Contexto adicional' }).props.value, newer.conteudo);
  assert.equal(f.calls.some(([action]) => action === 'save_base'), false);
  await act(async () => r.unmount());
});

test('falha de renomeação permanece visível depois de fechar e reabrir a aba', async () => {
  const { r, f } = await mount();await click(r, 'Renomear base');await change(r, 'Nome da base', 'Nome ainda não salvo');f.hold = true;
  let saving;
  await act(async () => { saving = r.root.findAllByType('form').at(-1).props.onSubmit({ preventDefault() {} }); });
  await click(r, 'Agentes');await click(r, 'Base de conhecimento');
  await act(async () => { f.rejectSave(Error('Falha de conexão de teste'));await saving; });
  assert.match(text(r.root.findByProps({ role: 'alert' })), /Falha de conexão de teste/);
  assert.equal(r.root.findByProps({ 'aria-label': 'Nome da base' }).props.value, 'Nome ainda não salvo');
  assert.equal(f.calls.filter(([action]) => action === 'save_base').length, 1);
  await act(async () => r.unmount());
});

test.after(async () => rm(scratch, { recursive: true, force: true }));

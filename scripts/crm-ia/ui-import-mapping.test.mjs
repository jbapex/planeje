import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import { build } from 'esbuild';

const root = new URL('../../', import.meta.url).pathname, require = createRequire('/tmp/planeje-crm-ui-qa/package.json');
const React = require('react'), { act, create } = require('react-test-renderer');
const scratch = await mkdtemp('/tmp/planeje-crm-ui-qa/import-mapping-');
await build({ entryPoints: [path.join(root, 'src/components/crm-ia/CrmIaImport.jsx')], outfile: path.join(scratch, 'ui.cjs'), bundle: true, platform: 'node', format: 'cjs', external: ['react'],
  plugins: [{ name: 'offline-dialog', setup(b) {
    b.onResolve({ filter: /^@\/components\/ui\/dialog$/ }, () => ({ path: 'dialog', namespace: 'fixture' }));
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: `import React from 'react';export const Dialog=({open,children})=>open?React.createElement('div',null,children):null;export const DialogContent=({children})=>React.createElement('section',{role:'dialog'},children);export const DialogTitle=({children})=>React.createElement('h2',null,children);export const DialogDescription=({children})=>React.createElement('p',null,children);` }));
    b.onResolve({ filter: /^@\// }, ({ path: name }) => { const file = path.join(root, 'src', name.slice(2)); return { path: [file, file + '.jsx', file + '.js'].find(existsSync) }; });
  } }],
});
const Import = require(path.join(scratch, 'ui.cjs')).default;
const workspace = { client: { id: 'client-a', empresa: 'Conta sintética' }, pipelines: [{ id: 'pipeline-a', nome: 'Principal' }], stages: [{ id: 'stage-a', pipeline_id: 'pipeline-a', nome: 'Entrada' }, { id: 'stage-b', pipeline_id: 'pipeline-a', nome: 'Análise' }, { id: 'other-stage', pipeline_id: 'other-pipeline', nome: 'Etapa de outro funil' }], people: [{ id: 'person-a', nome: 'Pessoa autorizada' }], lead_profiles: [{ agent_id: 'agent-a', id: 'profile-a', nome: 'Avaliação', pipeline_id: 'pipeline-a', agent_updated_at: 'agent-version' }, { agent_id: 'agent-a', id: 'removed-profile', nome: 'Removido', pipeline_id: 'pipeline-a', historical: true }], config: { data: { custom_fields: { fields: [{ key: 'medida', name: 'Medida', type: 'number' }, { key: 'prioridade', name: 'Prioridade', type: 'select', options: ['Alta', 'Baixa'] }, { key: 'removed', name: 'Desativado', type: 'text', active: false }] } } } };
const text = n => typeof n === 'string' ? n : Array.isArray(n) ? n.map(text).join(' ') : n ? text(n.children ?? n.props?.children) : '';
const field = (r, label) => r.root.findByProps({ 'aria-label': label });
const click = async (r, label) => { const n = r.root.findAllByType('button').find(item => text(item.props.children).trim().replace(/\s+/g, ' ') === label); assert.ok(n, label); await act(async () => n.props.onClick?.()); };
const change = async (r, label, value) => act(async () => field(r, label).props.onChange({ target: { value } }));
const submit = async r => act(async () => r.root.findAllByType('form').at(-1).props.onSubmit({ preventDefault() {} }));
async function mount(extra = {}) {
  const calls = []; let closeCount = 0, fail = false, r;
  const mutate = async (action, payload) => { calls.push([action, payload]); if (fail) throw new Error('Resposta perdida'); return { created: payload.rows.length, preserved: 0, ok: true }; };
  await act(async () => { r = create(React.createElement(Import, { workspace, mutate, onClose: () => { closeCount += 1; }, ...extra })); });
  return { r, calls, get closeCount() { return closeCount; }, set fail(value) { fail = value; } };
}
const open = async (r, source) => act(async () => field(r, 'Arquivo CSV').props.onChange({ target: { value: '', files: [{ size: Buffer.byteLength(source), text: async () => source }] } }));

test('CSV resolve etapa, responsável, perfil e campos por linha no escopo sem acionar IA ou envio', async () => {
  const f = await mount(), r = f.r;
  try {
    await open(r, 'nome;telefone;etapa;responsável;perfil;Medida;Prioridade;tags\nPessoa sintética;5511000000000;Análise;Pessoa autorizada;Avaliação;3,5;Alta;Quente|Retorno');
    assert.equal(field(r, 'Coluna para Etapa').props.value, '2');
    assert.equal(field(r, 'Coluna para Responsável').props.value, '3');
    assert.equal(field(r, 'Coluna para Medida').props.value, '5');
    assert.equal(r.root.findAllByProps({ 'aria-label': 'Coluna para Desativado' }).length, 0);
    await click(r, 'Revisar importação'); assert.equal(f.calls.length, 0); await submit(r);
    const [[action, payload]] = f.calls; assert.equal(action, 'import_leads'); assert.equal(payload.rows.length, 1);
    assert.equal(payload.rows[0].stage_id, 'stage-b'); assert.equal(payload.rows[0].responsavel_id, 'person-a');
    assert.deepEqual(payload.rows[0].profile, { agent_id: 'agent-a', id: 'profile-a', agent_updated_at: 'agent-version' });
    assert.deepEqual(payload.rows[0].crm_ia_fields, { medida: 3.5, prioridade: 'Alta' });
    assert.deepEqual(payload.rows[0].etiquetas, ['Quente', 'Retorno']); assert.equal(typeof payload.request_id, 'string');
  } finally { await act(async () => r.unmount()); }
});

test('CSV rejeita IDs estrangeiros, perfil removido e opção inválida com linha sem perder mapeamento', async () => {
  for (const [column, invalid, defaults] of [['etapa', 'other-stage'], ['responsável', 'foreign-person'], ['perfil', 'removed-profile'], ['Prioridade', 'Média']]) {
    const f = await mount(defaults), r = f.r;
    try {
      await open(r, `nome;telefone;${column}\nPrimeiro;5511000000000;\nSegundo;5511000000001;${invalid}`);
      await click(r, 'Revisar importação');
      assert.match(text(r.toJSON()), /Linha 3:/); assert.equal(f.calls.length, 0);
      assert.equal(field(r, 'Coluna para Nome').props.value, '0'); assert.equal(field(r, 'Coluna para Telefone').props.value, '1');
      assert.equal(r.root.findAllByType('form').length, 0);
    } finally { await act(async () => r.unmount()); }
  }
});

test('CSV usa defaults nas células vazias e rejeita nomes ambíguos em vez de escolher uma pessoa', async () => {
  const f = await mount({ workspace: { ...workspace, people: [...workspace.people, { id: 'person-b', nome: 'Pessoa autorizada' }] } }), r = f.r;
  try {
    await open(r, 'nome;telefone;responsável\nPessoa sintética;5511000000000;Pessoa autorizada');
    await click(r, 'Revisar importação'); assert.match(text(r.toJSON()), /Linha 2:.*ambíguo/i); assert.equal(f.calls.length, 0);
    await change(r, 'Coluna para Responsável', ''); await change(r, 'Responsável da importação', 'person-a');
    await change(r, 'Etapa da importação', 'stage-b'); await change(r, 'Perfil da importação', 'agent-a:profile-a');
    await click(r, 'Revisar importação'); await submit(r);
    const row = f.calls[0][1].rows[0]; assert.equal(row.responsavel_id, 'person-a'); assert.equal(row.stage_id, 'stage-b'); assert.equal(row.profile.id, 'profile-a');
  } finally { await act(async () => r.unmount()); }
});

test('tentativa com resposta perdida mantém conteúdo e request_id; nova revisão alterada ganha outra chave', async () => {
  const f = await mount(), r = f.r;
  try {
    await open(r, 'nome;telefone;etapa\nPessoa sintética;5511000000000;Entrada'); await click(r, 'Revisar importação');
    f.fail = true; await submit(r); await submit(r);
    assert.match(text(r.toJSON()), /Resposta perdida/); assert.deepEqual(f.calls[0][1], f.calls[1][1]); assert.equal(f.closeCount, 0);
    await click(r, 'Voltar às colunas'); await change(r, 'Coluna para Etapa', ''); await change(r, 'Etapa da importação', 'stage-b');
    await click(r, 'Revisar importação'); f.fail = false; await submit(r);
    assert.notEqual(f.calls[2][1].request_id, f.calls[0][1].request_id); assert.equal(f.closeCount, 1);
  } finally { await act(async () => r.unmount()); }
});

test('arquivo acima de 5 MB ou 1.000 linhas é recusado antes de qualquer mutação', async () => {
  const f = await mount(), r = f.r;
  try {
    await act(async () => field(r, 'Arquivo CSV').props.onChange({ target: { value: '', files: [{ size: 5 * 1024 * 1024 + 1, text: () => { throw new Error('Não ler'); } }] } }));
    assert.match(text(r.toJSON()), /5 MB/);
    await open(r, 'nome;telefone\n' + 'Pessoa;5511000000000\n'.repeat(1001)); assert.match(text(r.toJSON()), /1\.000/); assert.equal(f.calls.length, 0);
  } finally { await act(async () => r.unmount()); }
});
test.after(() => rm(scratch, { recursive: true, force: true }));

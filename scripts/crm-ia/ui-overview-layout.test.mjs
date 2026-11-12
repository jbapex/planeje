import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import { build } from 'esbuild';

const root = new URL('../../', import.meta.url).pathname;
const require = createRequire('/tmp/planeje-crm-ui-qa/package.json');
const React = require('react');
const { act, create } = require('react-test-renderer');
const scratch = await mkdtemp('/tmp/planeje-crm-ui-qa/overview-layout-');
const previousFetch = globalThis.fetch;
globalThis.fetch = () => { throw Error('Rede indisponível neste teste de interface.'); };
await build({
  stdin: { contents: `export {default as Overview} from ${JSON.stringify(path.join(root, 'src/components/crm-ia/CrmIaOverview.jsx'))};export {MemoryRouter} from 'react-router-dom';`, resolveDir: root },
  bundle: true, format: 'cjs', platform: 'node', external: ['react'], loader: { '.css': 'empty' }, outfile: path.join(scratch, 'ui.cjs'),
  plugins: [{ name: 'isolated-overview', setup(b) {
    b.onResolve({ filter: /^@\/components\/ui\/dialog$/ }, () => ({ path: 'dialog', namespace: 'fixture' }));
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: `import React from 'react';export const Dialog=({children})=>React.createElement('div',null,children);export const DialogContent=Dialog,DialogTitle=Dialog,DialogDescription=Dialog;` }));
    b.onResolve({ filter: /^@\// }, ({ path: name }) => { const file = path.join(root, 'src', name.slice(2)); return { path: [file, file + '.js', file + '.jsx'].find(existsSync) }; });
  } }],
});
const { Overview, MemoryRouter } = require(path.join(scratch, 'ui.cjs'));
const client = { id: 'account-overview' };
const workspace = { agents: [
  { id: 'q', ativo: true, auto_responder: false, funil: { crm_ia: { tipo: 'qualificacao' } } },
  { id: 'f', ativo: false, auto_responder: false, funil: { crm_ia: { tipo: 'followup' } } },
] };
const overview = {
  totals: { leads: 4, qualified: 1, conversations: 3, ai_conversations: 1, human_conversations: 2, appointments: 0, waiting: 2 },
  daily: [{ day: '2026-11-09', count: 0 }, { day: '2026-11-10', count: 4 }, { day: '2026-11-11', count: 0 }],
  waiting: [
    { contact_id: 'recent', channel_id: 'channel-b', nome: 'Contato recente', since: '2026-11-11T12:00:00Z' },
    { contact_id: 'old', channel_id: 'channel-a', nome: 'Contato mais antigo', since: '2026-11-10T12:00:00Z' },
  ],
  stages: [{ id: 'entry', nome: 'Entrada', count: 4, value: 800, color: '#527ae2' }, { id: 'empty', nome: 'Etapa vazia', count: 0, value: 0 }],
  origins: [{ name: 'WhatsApp', count: 3 }, { name: 'Indicação', count: 1 }],
  coverage: { conversations: 'available' },
};
const text = node => typeof node === 'string' ? node : Array.isArray(node) ? node.map(text).join(' ') : node ? text(node.children ?? node.props?.children) : '';
const button = (r, label) => r.root.findAllByType('button').find(node => (node.props['aria-label'] || text(node)).trim().replace(/\s+/g, ' ') === label);
const click = async (r, label) => { const node = button(r, label); assert.ok(node, label); await act(async () => node.props.onClick()); };
const change = async (r, label, value) => act(async () => r.root.findByProps({ 'aria-label': label }).props.onChange({ target: { value } }));
const classNodes = (r, name) => r.root.findAll(node => typeof node.type === 'string' && node.props.className?.split(' ').includes(name));
function fixture(overrides = {}) {
  const calls = [];
  const api = async (action, payload) => {
    calls.push([action, payload]);
    if (overrides[action]) return overrides[action](payload);
    if (action === 'overview') return overview;
    if (action === 'usage') return { responses: 8, tokens: 950, coverage: { ...payload, complete: true } };
    throw Error(`Ação inesperada: ${action}`);
  };
  return { api, calls };
}
async function mount(f, extra = {}) {
  let renderer;
  const render = properties => React.createElement(MemoryRouter, { future: { v7_startTransition: true, v7_relativeSplatPath: true } }, React.createElement(Overview, { api: f.api, client, workspace, revision: 0, ...properties }));
  await act(async () => { renderer = create(render(extra)); });
  renderer.updateScope = properties => act(async () => renderer.update(render({ ...extra, ...properties })));
  return renderer;
}

test('painel organiza quatro indicadores, quatro painéis e três resumos com fontes disponíveis', async () => {
  const f = fixture(), r = await mount(f);
  try {
    assert.equal(r.root.findByProps({ 'aria-label': 'Indicadores do período' }).findAllByType('a').length, 4);
    assert.equal(classNodes(r, 'crm-ia-overview-panel').length, 4);
    assert.equal(classNodes(r, 'crm-ia-overview-summary').length, 3);
    assert.equal(button(r, '30 dias').props['aria-pressed'], true);
    assert.equal(button(r, '7 dias').props['aria-pressed'], false);
    assert.equal(r.root.findAllByType('details').some(node => text(node).includes('Data inicial')), true);
    assert.match(text(r.toJSON()), /75%/);
    assert.match(text(r.toJSON()), /25%/);
    assert.doesNotMatch(text(r.toJSON()), /Ao vivo|vs\. semana|1ª resposta|até 5 min|parceiros/i);
  } finally { await act(async () => r.unmount()); }
});

test('atalhos preservam conta, período e filtros; a fila prioriza a espera mais antiga', async () => {
  const f = fixture(), r = await mount(f);
  try {
    const period = f.calls.find(([action]) => action === 'overview')[1];
    const links = r.root.findAllByType('a');
    for (const link of links) {
      const query = new URL(link.props.href, 'https://fixture.invalid').searchParams;
      assert.equal(query.get('cliente'), client.id);
      assert.equal(query.get('since'), period.since);
      assert.equal(query.get('until'), period.until);
    }
    const queryFor = label => { const link = links.find(node => text(node).trim().startsWith(label)); assert.ok(link, `Atalho ${label}`); return new URL(link.props.href, 'https://fixture.invalid').searchParams; };
    assert.equal(queryFor('Qualificados').get('qualified'), 'true');
    assert.equal(queryFor('Entrada').get('stage_id'), 'entry');
    assert.equal(queryFor('WhatsApp').get('origin'), 'WhatsApp');
    assert.equal(queryFor('Abrir fila humana').get('attendance'), 'waiting');
    const waiting = classNodes(r, 'crm-ia-overview-waiting')[0].findAllByType('a');
    assert.match(text(waiting[0]), /Contato mais antigo/);
    assert.equal(new URL(waiting[0].props.href, 'https://fixture.invalid').searchParams.get('channel_id'), 'channel-a');
    assert.equal(new URL(waiting[0].props.href, 'https://fixture.invalid').searchParams.get('contact_id'), 'old');
    assert.equal(overview.waiting[0].contact_id, 'recent', 'a ordenação não deve mutar a fonte');
  } finally { await act(async () => r.unmount()); }
});

test('presets e datas mantêm payload, recorte de uso e análise Atlas', async () => {
  let analysis;
  const f = fixture(), r = await mount(f, { onAnalyze: value => { analysis = value; } });
  try {
    await click(r, '7 dias');
    assert.equal(button(r, '7 dias').props['aria-pressed'], true);
    assert.equal(button(r, '30 dias').props['aria-pressed'], false);
    await click(r, 'Este mês');
    assert.equal(button(r, 'Este mês').props['aria-pressed'], true);
    assert.match(f.calls.filter(([action]) => action === 'overview').at(-1)[1].since, /-01$/);
    await change(r, 'Data inicial', '2026-10-01');
    await change(r, 'Data final', '2026-10-31');
    const payload = { since: '2026-10-01', until: '2026-10-31' };
    assert.deepEqual(f.calls.filter(([action]) => action === 'overview').at(-1)[1], payload);
    assert.deepEqual(f.calls.filter(([action]) => action === 'usage').at(-1)[1], payload);
    assert.equal(r.root.findAllByType('button').some(node => node.props['aria-pressed'] === true), false);
    await click(r, 'Analisar com Atlas');
    assert.match(analysis.question, /2026-10-01 a 2026-10-31/);
    const before = f.calls.length;
    await change(r, 'Data inicial', '2026-11-01');
    assert.equal(f.calls.length, before, 'período inválido não consulta fontes');
    assert.equal(button(r, 'Analisar com Atlas').props.disabled, true);
    assert.match(text(r.toJSON()), /Confira as datas/);
  } finally { await act(async () => r.unmount()); }
});

test('zero mantém barras em zero e o gráfico fornece título, datas e valores acessíveis', async () => {
  const zeros = { ...overview, daily: overview.daily.map(row => ({ ...row, count: 0 })), stages: [{ id: 'zero', nome: 'Sem leads', count: 0, value: 0 }], origins: [{ name: 'Origem vazia', count: 0 }] };
  const r = await mount(fixture({ overview: () => zeros }));
  try {
    for (const fill of classNodes(r, 'crm-ia-overview-bar-fill')) assert.equal(fill.props.style.width, '0%');
    assert.ok(classNodes(r, 'crm-ia-overview-bar-fill').length >= 2);
    const svg = r.root.findByProps({ role: 'img' });
    assert.match(text(svg.findByType('title')), /Leads por dia/);
    assert.match(text(svg.findByType('desc')), /09\/11\/2026: 0 leads/);
    const ids = svg.props['aria-labelledby'].split(' ');
    assert.equal(svg.findByType('title').props.id, ids[0]);
    assert.equal(svg.findByType('desc').props.id, ids[1]);
    assert.equal(classNodes(r, 'crm-ia-overview-chart-area').length, 0, 'zero não deve desenhar uma área positiva');
    assert.match(text(r.toJSON()), /0%/);
  } finally { await act(async () => r.unmount()); }
});

test('ausência de fontes é distinta de zero e uso parcial não afirma cobertura integral', async () => {
  const r = await mount(fixture({ overview: () => ({ totals: {}, coverage: { conversations: 'unavailable', message: 'Atendimento sem canal autorizado.' } }), usage: () => ({ responses: null, tokens: null, coverage: { complete: false, message: 'Registros sem canal: uso parcial.' } }) }), { workspace: {} });
  try {
    assert.match(text(r.toJSON()), /Sem dados/);
    assert.match(text(r.toJSON()), /Dados diários indisponíveis/);
    assert.match(text(r.toJSON()), /Etapas indisponíveis/);
    assert.match(text(r.toJSON()), /Origens indisponíveis/);
    assert.match(text(r.toJSON()), /Atendimento sem canal autorizado/);
    assert.match(text(r.toJSON()), /Registros sem canal: uso parcial/);
    assert.match(text(r.toJSON()), /Configuração de agentes indisponível/);
    assert.equal(classNodes(r, 'crm-ia-overview-bar-fill').length, 0);
    assert.doesNotMatch(text(r.toJSON()), /Nenhum contato na fila|Nenhum agente configurado/);
  } finally { await act(async () => r.unmount()); }
});

test('dias sem medição interrompem a linha e origem parcial não fabrica participação', async () => {
  const partial = { ...overview, daily: [{ day: '2026-11-09', count: 0 }, { day: '2026-11-10', count: null }, { day: '2026-11-11', count: 3 }], origins: [{ name: 'Conhecida', count: 3 }, { name: 'Sem contagem', count: null }] };
  const r = await mount(fixture({ overview: () => partial }));
  try {
    const line = classNodes(r, 'crm-ia-overview-chart-line')[0].props.d;
    assert.equal((line.match(/M/g) || []).length, 2);
    assert.doesNotMatch(line, /L|NaN/);
    assert.equal(classNodes(r, 'crm-ia-overview-chart-area').length, 0);
    assert.match(text(r.toJSON()), /Há dias sem dados/);
    assert.match(text(r.root.findByType('desc')), /10\/11\/2026: Sem dados/);
    const origins = classNodes(r, 'crm-ia-overview-origins')[0];
    assert.equal(origins.findAllByType('small').every(node => node.props['aria-label'] === 'Participação indisponível'), true);
    assert.equal(origins.findAllByType('i').length, 0);
  } finally { await act(async () => r.unmount()); }
});

test('falha no uso permite nova tentativa sem esconder o painel e atualização refaz as duas leituras', async () => {
  let failed = true;
  const f = fixture({ usage: () => { if (failed) throw Error('Uso indisponível nesta leitura.'); return { responses: 0, tokens: 0 }; } });
  const r = await mount(f);
  try {
    assert.match(text(r.toJSON()), /Uso indisponível nesta leitura/);
    assert.match(text(r.toJSON()), /Contato mais antigo/);
    failed = false;
    await click(r, 'Tentar novamente');
    assert.doesNotMatch(text(r.toJSON()), /Uso indisponível nesta leitura/);
    const before = f.calls.filter(([action]) => action === 'overview').length;
    await click(r, 'Atualizar painel');
    assert.equal(f.calls.filter(([action]) => action === 'overview').length, before + 1);
    assert.deepEqual(f.calls.filter(([action]) => action === 'usage').at(-1)[1], f.calls.filter(([action]) => action === 'overview').at(-1)[1]);
  } finally { await act(async () => r.unmount()); }
});

test.after(async () => { globalThis.fetch = previousFetch; await rm(scratch, { recursive: true, force: true }); });

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
const scratch = await mkdtemp('/tmp/planeje-crm-ui-qa/settings-layout-');
const previousFetch = globalThis.fetch;
globalThis.fetch = async () => { throw Error('Rede externa bloqueada no teste de Configurações.'); };
await build({ stdin: { contents: `export {default as Settings} from ${JSON.stringify(path.join(root, 'src/components/crm-ia/CrmIaSettings.jsx'))};export {MemoryRouter,useNavigate,useLocation} from 'react-router-dom';`, resolveDir: root },
  bundle: true, platform: 'node', format: 'cjs', outfile: path.join(scratch, 'ui.cjs'), external: ['react'], loader: { '.css': 'empty' },
  plugins: [{ name: 'settings-local-ui', setup(b) {
    b.onResolve({ filter: /^@\/components\/ui\/dialog$/ }, () => ({ path: 'dialog', namespace: 'fixture' }));
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: `import React from 'react';export const Dialog=({open,children})=>open?React.createElement('div',null,children):null;export const DialogContent=({children})=>React.createElement('section',{role:'dialog'},children);export const DialogTitle=({children})=>React.createElement('h2',null,children);export const DialogDescription=({children})=>React.createElement('p',null,children);` }));
    b.onResolve({ filter: /^@\// }, ({ path: name }) => { const file = path.join(root, 'src', name.slice(2)); return { path: [file, file + '.jsx', file + '.js'].find(existsSync) }; });
  } }],
});
const { Settings, MemoryRouter, useNavigate, useLocation } = require(path.join(scratch, 'ui.cjs'));
const text = node => typeof node === 'string' ? node : Array.isArray(node) ? node.map(text).join(' ') : node ? text(node.children ?? node.props?.children) : '';
const nodes = (r, type) => r.root.findAllByType(type);
const button = (r, name) => nodes(r, 'button').find(node => (node.props['aria-label'] || text(node.props.children)).trim() === name);
const field = (r, label) => r.root.findAll(node => ['input', 'textarea', 'select'].includes(node.type) && node.props['aria-label'] === label)[0];
const active = r => nodes(r, 'nav')[0].findAllByType('button').find(node => node.props['aria-current'] === 'page');
const click = async (r, label) => { const node = button(r, label); assert.ok(node, label); await act(async () => node.props.onClick?.({ preventDefault() {}, stopPropagation() {}, isPropagationStopped: () => false })); };
const change = async (r, label, value) => { const node = field(r, label); assert.ok(node, label); await act(async () => node.props.onChange({ target: { value, checked: value } })); };
const toggle = async (r, label) => {
  const node = nodes(r, 'button').find(item => item.props.role === 'switch' && item.props['aria-label'] === label);
  assert.ok(node, `Switch acessível: ${label}`);
  await act(async () => node.props.onClick({ stopPropagation() {}, isPropagationStopped: () => false }));
};
const submit = async r => { await act(async () => nodes(r, 'form')[0].props.onSubmit({ preventDefault() {} })); };
function workspace(data = {}) {
  return { client: { id: 'account-a', empresa: 'Conta sintética' }, provisioned: true,
    pipelines: [{ id: 'pipeline-a', nome: 'Funil sintético' }], stages: [{ id: 'stage-a', nome: 'Entrada', pipeline_id: 'pipeline-a' }],
    channels: [{ id: 'channel-a', nome: 'Canal sintético' }], people: [{ id: 'person-a', nome: 'Pessoa sintética' }], bases: [{ id: 'base-a', nome: 'Base sintética' }],
    config: { revision: 'config-v1', data } };
}
async function mount({ initialPath = '/crm-ia/configuracoes?cliente=account-a', workspace: initialWorkspace = workspace(), canManage = true, handlers = {} } = {}) {
  const calls = [];
  const api = async (action, payload = {}) => {
    calls.push([action, structuredClone(payload)]);
    if (handlers[action]) return handlers[action](payload);
    if (action === 'calendar_status') return { configured: true, connected: false, status: 'disconnected' };
    if (action === 'usage') return { responses: 0, tokens: 0, by_agent: [] };
    if (action === 'save_config') return { revision: 'config-v2' };
    if (action === 'calendar_connect') return { url: 'https://accounts.google.com/o/oauth2/v2/auth?state=synthetic' };
    throw Error('Ação inesperada: ' + action);
  };
  let location, navigate, renderer;
  let props = { api, mutate: api, workspace: initialWorkspace, canManage, revision: 0 };
  function Probe() { location = useLocation(); navigate = useNavigate(); return null; }
  const render = () => React.createElement(MemoryRouter, { initialEntries: [initialPath], future: { v7_startTransition: true, v7_relativeSplatPath: true } }, React.createElement(Probe), React.createElement(Settings, props));
  await act(async () => { renderer = create(render()); });
  renderer.calls = calls;
  renderer.location = () => location;
  renderer.navigate = async target => { await act(async () => navigate(target)); };
  renderer.updateScope = async patch => { props = { ...props, ...patch }; await act(async () => renderer.update(render())); };
  return renderer;
}

test('navegação agrupa destinos e apresenta regras como preferências sem gravar ao abrir', async () => {
  const r = await mount({ initialPath: '/crm-ia/configuracoes?cliente=account-a&aba=attendance' });
  try {
    assert.equal(text(active(r)).trim(), 'Atendimento e IA');
    for (const label of ['Equipe e atendimento', 'Leads e canais', 'Dados e controle']) assert.ok(r.root.findAllByProps({ 'aria-label': label }).length, label);
    for (const label of ['Atendimento e IA', 'Respostas rápidas', 'Disponibilidade', 'Google Agenda', 'Conhecimento']) assert.ok(button(r, label), label);
    const panel = r.root.findByProps({ className: 'crm-ia-settings-panel' });
    assert.equal(panel.type, 'section');
    assert.equal(nodes(r, 'button').filter(node => node.props.role === 'switch').length, 4);
    assert.equal(nodes(r, 'button').find(node => node.props['aria-label'] === 'Autorizar envios automáticos do CRM IA' && node.props.role === 'switch').props['aria-checked'], false);
    assert.equal(r.calls.length, 0);
  } finally { await act(async () => r.unmount()); }
});

test('escolher seção preserva conta e parâmetros; voltar e avançar atualizam conteúdo e seleção', async () => {
  const r = await mount({ initialPath: '/crm-ia/configuracoes?cliente=account-a&aba=availability&origin=overview' });
  try {
    assert.ok(field(r, 'Fuso da disponibilidade'));
    await click(r, 'Atendimento e IA');
    const params = new URLSearchParams(r.location().search);
    assert.equal(params.get('aba'), 'attendance'); assert.equal(params.get('cliente'), 'account-a'); assert.equal(params.get('origin'), 'overview');
    await r.navigate(-1); assert.equal(text(active(r)).trim(), 'Disponibilidade'); assert.ok(field(r, 'Fuso da disponibilidade'));
    await r.navigate(1); assert.equal(text(active(r)).trim(), 'Atendimento e IA');
    await r.navigate('?cliente=account-a&aba=google_calendar'); assert.match(text(r.toJSON()), /Conexão.*Desconectada/);
    await r.navigate('?cliente=account-a&aba=desconhecida'); assert.equal(text(active(r)).trim(), 'Configuração inicial');
  } finally { await act(async () => r.unmount()); }
});

test('respostas rápidas e atendimento salvam attendance completo com a revisão atual', async () => {
  const attendance = { auto_send: true, pause_on_human: true, show_attendant_name: true, restart_triage: true, quick_replies: [{ shortcut: 'ola', text: 'Texto anterior' }], preserved_rule: 'regra existente' };
  const r = await mount({ workspace: workspace({ attendance }), initialPath: '/crm-ia/configuracoes?aba=quick_replies' });
  try {
    assert.ok(field(r, 'Texto da resposta 1'));
    assert.equal(nodes(r, 'button').filter(node => node.props.role === 'switch').length, 0);
    await change(r, 'Texto da resposta 1', 'Texto revisado'); await submit(r);
    assert.deepEqual(r.calls[0], ['save_config', { section: 'attendance', revision: 'config-v1', data: { ...attendance, quick_replies: [{ shortcut: 'ola', text: 'Texto revisado' }] } }]);
    const nextWorkspace = workspace({ attendance: r.calls[0][1].data }); nextWorkspace.config.revision = 'config-v2';
    await r.updateScope({ workspace: nextWorkspace }); await click(r, 'Atendimento e IA');
    await toggle(r, 'Incluir nome do atendente na mensagem'); await submit(r);
    const saved = r.calls[1][1];
    assert.equal(saved.section, 'attendance'); assert.equal(saved.revision, 'config-v2');
    assert.deepEqual(saved.data.quick_replies, [{ shortcut: 'ola', text: 'Texto revisado' }]);
    assert.equal(saved.data.auto_send, true); assert.equal(saved.data.pause_on_human, true); assert.equal(saved.data.restart_triage, true);
    assert.equal(saved.data.show_attendant_name, false); assert.equal(saved.data.preserved_rule, 'regra existente');
  } finally { await act(async () => r.unmount()); }
});

test('configuração nova mantém autonomia desligada ao salvar respostas rápidas', async () => {
  const r = await mount({ initialPath: '/crm-ia/configuracoes?aba=quick_replies' });
  try {
    await click(r, 'Adicionar resposta rápida'); await change(r, 'Atalho 1', 'oi'); await change(r, 'Texto da resposta 1', 'Olá, texto sintético.'); await submit(r);
    assert.deepEqual(r.calls[0][1].data, { auto_send: false, pause_on_human: true, show_attendant_name: false, restart_triage: false, quick_replies: [{ shortcut: 'oi', text: 'Olá, texto sintético.' }] });
  } finally { await act(async () => r.unmount()); }
});

test('salvar respostas rápidas não grava autonomia alterada e não salva em outra tela', async () => {
  const attendance = { auto_send: false, pause_on_human: true, show_attendant_name: false, restart_triage: false, quick_replies: [{ shortcut: 'ola', text: 'Texto persistido.' }] };
  const r = await mount({ workspace: workspace({ attendance }), initialPath: '/crm-ia/configuracoes?aba=attendance' });
  try {
    await toggle(r, 'Autorizar envios automáticos do CRM IA');
    assert.equal(nodes(r, 'button').find(node => node.props.role === 'switch' && node.props['aria-label'] === 'Autorizar envios automáticos do CRM IA').props['aria-checked'], true);
    await click(r, 'Respostas rápidas'); await change(r, 'Texto da resposta 1', 'Resposta revisada.'); await submit(r);
    assert.deepEqual(r.calls[0][1], { section: 'attendance', revision: 'config-v1', data: { ...attendance, quick_replies: [{ shortcut: 'ola', text: 'Resposta revisada.' }] } });
  } finally { await act(async () => r.unmount()); }
});

test('gravação pendente bloqueia navegação e duplicatas; mudança pela URL aguarda a conclusão', async () => {
  let finish;
  const gate = new Promise(resolve => { finish = resolve; });
  const r = await mount({ initialPath: '/crm-ia/configuracoes?aba=attendance', handlers: { save_config: () => gate } });
  let saving;
  try {
    await act(async () => { saving = nodes(r, 'form')[0].props.onSubmit({ preventDefault() {} }); });
    assert.ok(button(r, 'Respostas rápidas'), 'Destino próprio de respostas rápidas');
    assert.equal(button(r, 'Respostas rápidas').props.disabled, true);
    await click(r, 'Respostas rápidas'); assert.equal(text(active(r)).trim(), 'Atendimento e IA');
    await submit(r); assert.equal(r.calls.length, 1);
    await r.navigate('?aba=test_mode'); assert.equal(text(active(r)).trim(), 'Atendimento e IA');
    await act(async () => { finish({ revision: 'config-v2' }); await saving; });
    assert.equal(text(active(r)).trim(), 'Modo de teste'); assert.equal(r.calls[0][1].section, 'attendance');
  } finally { finish({}); await act(async () => { await saving; r.unmount(); }); }
});

test('revogar gerenciamento impede nova gravação e conexão Google mesmo com callback antigo', async () => {
  const r = await mount({ initialPath: '/crm-ia/configuracoes?aba=attendance' });
  try {
    const staleSubmit = nodes(r, 'form')[0].props.onSubmit;
    await toggle(r, 'Incluir nome do atendente na mensagem'); await r.updateScope({ canManage: false });
    assert.equal(nodes(r, 'fieldset')[0].props.disabled, true); assert.equal(button(r, 'Salvar configuração'), undefined);
    await act(async () => staleSubmit({ preventDefault() {} })); await submit(r);
    assert.equal(r.calls.length, 0);
    await click(r, 'Google Agenda'); await click(r, 'Conectar Google Agenda');
    assert.deepEqual(r.calls.map(([action]) => action), ['calendar_status']);
    assert.equal(nodes(r, 'fieldset')[0].props.disabled, true);
  } finally { await act(async () => r.unmount()); }
});

test('revogar gerenciamento remove consentimento Google já preparado e bloqueia o callback antigo', async () => {
  const r = await mount({ initialPath: '/crm-ia/configuracoes?aba=google_calendar' });
  try {
    const staleConnect = button(r, 'Conectar Google Agenda').props.onClick;
    await click(r, 'Conectar Google Agenda');
    assert.ok(nodes(r, 'a').some(node => text(node) === 'Continuar no Google'));
    await r.updateScope({ canManage: false });
    assert.equal(nodes(r, 'a').some(node => text(node) === 'Continuar no Google'), false);
    await act(async () => staleConnect());
    assert.equal(r.calls.filter(([action]) => action === 'calendar_connect').length, 1);
    assert.match(text(r.toJSON()), /Conexão.*Desconectada/);
  } finally { await act(async () => r.unmount()); }
});

test('erro de gravação mantém rascunho e revisão para corrigir e tentar novamente', async () => {
  let reject = true;
  const r = await mount({ initialPath: '/crm-ia/configuracoes?aba=quick_replies', handlers: { save_config: () => { if (reject) throw Error('Versão alterada por outra pessoa.'); return { revision: 'config-v2' }; } } });
  try {
    await click(r, 'Adicionar resposta rápida'); await change(r, 'Atalho 1', 'ajuda'); await change(r, 'Texto da resposta 1', 'Resposta preservada.'); await submit(r);
    assert.match(text(r.root.findByProps({ role: 'alert' })), /Versão alterada por outra pessoa/);
    assert.equal(field(r, 'Texto da resposta 1').props.value, 'Resposta preservada.');
    assert.equal(r.root.findAllByProps({ role: 'status' }).length, 0);
    reject = false; await submit(r); assert.match(text(r.root.findByProps({ role: 'status' })), /Configuração salva/);
    assert.equal(r.calls[0][1].revision, 'config-v1'); assert.equal(r.calls[1][1].revision, 'config-v1');
  } finally { await act(async () => r.unmount()); }
});

test('consulta de uso permite recuperar erro sem escrita e mantém controles em consulta', async () => {
  let unavailable = true;
  const r = await mount({ canManage: false, initialPath: '/crm-ia/configuracoes?aba=usage', handlers: { usage: () => { if (unavailable) throw Error('Uso indisponível nesta leitura.'); return { responses: 12, tokens: 321, by_agent: [] }; } } });
  try {
    assert.match(text(r.root.findByProps({ role: 'alert' })), /Uso indisponível/);
    unavailable = false; await click(r, 'Tentar novamente'); assert.match(text(r.toJSON()), /Respostas registradas.*12.*Tokens registrados.*321/);
    await click(r, 'Atendimento e IA'); const next = workspace(); next.client.id = 'account-b'; await r.updateScope({ workspace: next });
    assert.equal(nodes(r, 'button').find(node => node.props['aria-label'] === 'Autorizar envios automáticos do CRM IA' && node.props.role === 'switch').props['aria-checked'], false);
    assert.deepEqual(r.calls.map(([action]) => action), ['usage', 'usage']);
  } finally { await act(async () => r.unmount()); }
});

test('formulários mantêm campos e validações existentes nos destinos antigos', async () => {
  const r = await mount({ initialPath: '/crm-ia/configuracoes?aba=availability' });
  try {
    for (const label of ['Fuso da disponibilidade', 'Duração do compromisso, em minutos', 'Intervalo dos horários, em minutos', 'Folga antes, em minutos', 'Folga depois, em minutos', 'Antecedência mínima, em horas', 'Janela futura, em dias', 'Máximo por dia']) assert.ok(field(r, label), label);
    await click(r, 'Adicionar disponibilidade'); await submit(r);
    assert.match(text(r.root.findByProps({ role: 'alert' })), /Confira o responsável, os dias e os horários/); assert.equal(r.calls.length, 0);
    await click(r, 'Campos personalizados'); await click(r, 'Adicionar campo'); await submit(r);
    assert.match(text(r.root.findByProps({ role: 'alert' })), /Informe nome e chave válida/); assert.equal(r.calls.length, 0);
    await click(r, 'Modo de teste'); await toggle(r, 'Responder somente a telefones de teste autorizados'); await submit(r);
    assert.match(text(r.root.findByProps({ role: 'alert' })), /Adicione ao menos um telefone autorizado/); assert.equal(r.calls.length, 0);
    await click(r, 'Conhecimento'); assert.ok(field(r, 'Base do funil Funil sintético')); assert.ok(field(r, 'Base padrão do Concierge'));
    await click(r, 'Entrada de leads'); assert.ok(field(r, 'Funil de entrada Canal sintético')); assert.ok(field(r, 'Etapa de entrada Canal sintético'));
    await click(r, 'Distribuição'); assert.ok(field(r, 'Estratégia de distribuição')); assert.ok(field(r, 'Responsável de fallback'));
    await change(r, 'Seção de configuração', 'attendance'); assert.equal(text(active(r)).trim(), 'Atendimento e IA');
  } finally { await act(async () => r.unmount()); }
});

test.after(async () => { globalThis.fetch = previousFetch; await rm(scratch, { recursive: true, force: true }); });

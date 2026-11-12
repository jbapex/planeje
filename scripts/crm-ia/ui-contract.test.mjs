import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import { build } from 'esbuild';

const root = new URL('../../', import.meta.url).pathname;
const source = path.join(root, 'src/components/crm-ia/CrmIaContent.jsx');
assert.ok(existsSync(source), 'O CRM IA deve renderizar os fluxos comerciais reais.');
const require = createRequire('/tmp/planeje-crm-ui-qa/package.json');
const React = require('react');
const { act, create } = require('react-test-renderer');
const renderErrors = [];
const previousError = console.error;
console.error = (...args) => { renderErrors.push(args.map(String).join(' ')); previousError(...args); };
const scratch = await mkdtemp('/tmp/planeje-crm-ui-qa/crm-ui-');
await build({ stdin: { contents: `export {default as Content} from ${JSON.stringify(source)};export {MemoryRouter,useNavigate} from 'react-router-dom';export {captureCrmIaCalendarCallback as captureCallback} from ${JSON.stringify(path.join(root, 'src/components/crm-ia/crmIaCalendarCallback.js'))};`, resolveDir: root },
  bundle: true, platform: 'node', format: 'cjs', outfile: path.join(scratch, 'ui.cjs'), external: ['react'], loader: { '.css': 'empty', '.png': 'dataurl' },
  plugins: [{ name: 'isolated-ui', setup(b) {
    b.onResolve({ filter: /^@\/components\/ui\/dialog$/ }, () => ({ path: 'dialog', namespace: 'fixture' }));
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: `import React from 'react';export const Dialog=({open,children})=>open?React.createElement('div',null,children):null;export const DialogContent=({children})=>React.createElement('section',{role:'dialog'},children);export const DialogTitle=({children})=>React.createElement('h2',null,children);export const DialogDescription=({children})=>React.createElement('p',null,children);` }));
    b.onResolve({ filter: /^@\// }, ({ path: name }) => { const file = path.join(root, 'src', name.slice(2)); return { path: [file, file + '.jsx', file + '.js'].find(existsSync) }; });
  } }],
});
const { Content, MemoryRouter, useNavigate, captureCallback } = require(path.join(scratch, 'ui.cjs'));
const client = { id: 'account-a', empresa: 'Conta de teste' };
const lead = { id: 'lead-a', nome: 'Contato sintético', whatsapp: '5511000000000', valor: 180, pipeline_id: 'pipeline-a', stage_id: 'stage-a', responsavel_id: 'person-a', updated_at: '2026-11-11T10:00:00Z', contact_id: 'contact-a' };
const workspace = { client, provisioned: true, permissions: { manage: true, conversations: true, tracking: true }, capabilities: { audio: false, google_calendar: false },
  pipelines: [{ id: 'pipeline-a', nome: 'Principal' }], stages: [{ id: 'stage-a', pipeline_id: 'pipeline-a', nome: 'Entrada', ordem: 1, color: '#286fc9' }, { id: 'won', pipeline_id: 'pipeline-a', nome: 'Ganho', ordem: 2, tipo: 'ganho' }],
  agents: [], bases: [], products: [], templates: [], people: [{ id: 'person-a', nome: 'Atendente de teste' }], channels: [{ id: 'channel-a', nome: 'Canal de teste' }], config: { revision: '11111111-1111-4111-8111-111111111111', data: {} } };
const text = n => typeof n === 'string' ? n : Array.isArray(n) ? n.map(text).join(' ') : n ? text(n.children ?? n.props?.children) : '';
const rows = (r, type) => r.root.findAllByType(type);
const field = (r, label) => r.root.findByProps({ 'aria-label': label });
const button = (r, name) => rows(r, 'button').find(n => (n.props['aria-label'] || text(n.props.children).trim()).replace(/\s+/g, ' ') === name);
const click = async (r, name) => { const node = button(r, name); assert.ok(node, name); await act(async () => node.props.onClick?.()); };
const change = async (r, label, value) => { await act(async () => { const control = field(r, label); if (control.props.onCheckedChange) control.props.onCheckedChange(value); else control.props.onChange({ target: { value, checked: value, type: typeof value === 'boolean' ? 'checkbox' : 'text' } }); }); };
const submit = async r => { const forms = rows(r, 'form'); await act(async () => forms.at(-1).props.onSubmit({ preventDefault() {} })); };
function apiFixture(overrides = {}) {
  const calls = [];
  const drafts = new Map();
  let workspaceState = workspace;
  const api = async (action, payload = {}) => {
    calls.push([action, payload]);
    if (overrides[action]) return overrides[action](payload);
    if (action === 'workspace') return workspaceState;
    if (['agent_draft', 'save_agent_draft', 'publish_agent_draft', 'discard_agent_draft'].includes(action)) {
      const key = payload.agent_id || `${payload.tipo}:${payload.pipeline_id}`;
      const prior = drafts.get(key) || { revision: 'draft-0', draft: null };
      if (action === 'agent_draft') return prior;
      assert.equal(payload.revision, prior.revision);
      const next = { revision: prior.revision + 'x', draft: action === 'save_agent_draft' ? { payload: payload.data } : null };
      drafts.set(key, next);
      if (action === 'publish_agent_draft') {
        const agent = { id: payload.agent_id || 'new-agent', ...prior.draft.payload, updated_at: '2026-11-11T12:00:00Z' };
        workspaceState = { ...workspaceState, agents: [...workspaceState.agents.filter(row => row.id !== agent.id), agent] };
        return { ...next, agent, published: true };
      }
      return next;
    }
    if (action === 'overview') return { totals: { leads: 1, qualified: 0, conversations: 0, appointments: 0, waiting: 0 }, daily: [], stages: [], origins: [], waiting: [], coverage: {} };
    if (action === 'lead') return { lead, contact: { id: 'contact-a' }, events: [], appointments: [] };
    if (action === 'leads') return { rows: [lead], total: 1 };
    if (action === 'usage') return { responses: 0, tokens: 0, by_agent: [], limits: null };
    if (action === 'capabilities') return { audio: { available: false, input_available: false } };
    if (action === 'calendar_status') return { connected: false, configured: false, status: 'disconnected' };
    if (['conversations', 'messages', 'agenda', 'slots', 'queue'].includes(action)) return { rows: [], total: 0 };
    if (action.startsWith('save_') || action.startsWith('cancel_') || ['move_lead', 'schedule_message', 'apply_template', 'archive_lead', 'restore_lead', 'bulk_assign', 'import_leads', 'delete_stage', 'delete_pipeline'].includes(action)) return { id: 'saved', data: payload.data, revision: 5 };
    throw new Error('Ação inesperada: ' + action);
  };
  return { api, calls };
}
async function mount(section, fixture, extra = {}) {
  let renderer;
  let navigate;
  function NavigationProbe() { navigate = useNavigate(); return null; }
  const { initialPath = '/', ...props } = extra;
  await act(async () => { renderer = create(React.createElement(MemoryRouter, { initialEntries: [initialPath], future: { v7_startTransition: true, v7_relativeSplatPath: true } }, React.createElement(NavigationProbe), React.createElement(Content, { section, client, workspace, api: fixture.api, profile: { id: 'person-a' }, onAnalyze() {}, trackingUrl: '/rastreamento?cliente_id=account-a', ...props }))); });
  renderer.navigate = async to => act(async () => navigate(to));
  return renderer;
}

test('as dez áreas mostram dados, indisponibilidade e ações sem transporte externo', async () => {
  for (const section of ['painel', 'funil', 'leads', 'conversas', 'agentes', 'agenda', 'disparos', 'rastreabilidade', 'modelos', 'configuracoes']) {
    const fixture = apiFixture(); const r = await mount(section, fixture);
    assert.ok(text(r.toJSON()).length > 60, section);
    if (section === 'disparos') assert.match(text(r.toJSON()), /Em breve/);
    await act(async () => r.unmount());
  }
});

test('casca pode apresentar o título sem duplicação no conteúdo e o uso isolado preserva o cabeçalho', async () => {
  const r = await mount('painel', apiFixture(), { showHeader: false });
  try {
    assert.equal(r.root.findAllByType('h1').length, 0);
    assert.equal(r.root.findAllByProps({ className: 'crm-ia-page-header' }).length, 0);
  } finally { await act(async () => r.unmount()); }
  const standalone = await mount('painel', apiFixture());
  try { assert.equal(standalone.root.findByProps({ className: 'crm-ia-page-header' }).findAllByType('h1').length, 1); }
  finally { await act(async () => standalone.unmount()); }
});

test('uma busca nova oculta a leitura antiga e ignora a resposta atrasada', async () => {
  let first, second;
  const fixture = apiFixture({ leads: payload => new Promise(resolve => { if (!payload.search) first = resolve; else second = resolve; }) });
  const r = await mount('leads', fixture);
  await change(r, 'Buscar leads', 'Atual');
  await act(async () => { second({ rows: [{ ...lead, id: 'new', nome: 'Atual autorizado' }], total: 1 }); });
  await act(async () => { first({ rows: [{ ...lead, nome: 'Resultado antigo' }], total: 1 }); });
  assert.match(text(r.toJSON()), /Atual autorizado/);
  assert.doesNotMatch(text(r.toJSON()), /Resultado antigo/);
  await act(async () => r.unmount());
});

test('edição envia campos nativos e versão; ganho pede motivo antes da gravação', async () => {
  const fixture = apiFixture(); const r = await mount('leads', fixture);
  await click(r, 'Abrir Contato sintético');
  await click(r, 'Editar lead');
  await change(r, 'Nome', 'Nome revisado');
  await submit(r);
  const saved = fixture.calls.find(([action]) => action === 'save_lead');
  assert.equal(saved[1].nome, 'Nome revisado'); assert.equal(saved[1].expected_updated_at, lead.updated_at);
  await click(r, 'Mover etapa'); await change(r, 'Etapa de destino', 'won'); await submit(r);
  assert.equal(fixture.calls.some(([action]) => action === 'move_lead'), false);
  await change(r, 'Motivo', 'Venda confirmada na revisão'); await submit(r);
  assert.equal(fixture.calls.find(([action]) => action === 'move_lead')[1].reason, 'Venda confirmada na revisão');
  await act(async () => r.unmount());
});

test('consulta recusada oferece nova tentativa; usuário de consulta não recebe ação de criação', async () => {
  let failed = true;
  const fixture = apiFixture({ leads: () => { if (failed) throw new Error('Acesso à fonte recusado'); return { rows: [], total: 0 }; } });
  const r = await mount('leads', fixture, { workspace: { ...workspace, permissions: { manage: false } } });
  assert.match(text(r.toJSON()), /Acesso à fonte recusado/); assert.equal(button(r, 'Novo lead'), undefined);
  failed = false; await click(r, 'Tentar novamente'); assert.match(text(r.toJSON()), /Nenhum lead/);
  await act(async () => r.unmount());
});
test('primeira conversa exige canal e abre o contato devolvido sem enviar mensagem', async () => {
  const fixture = apiFixture({ open_conversation: () => ({ contact_id: 'new-contact', channel_id: 'channel-a' }) });
  const r = await mount('leads', fixture); await click(r, 'Abrir Contato sintético'); await click(r, 'Iniciar conversa');
  await submit(r); assert.equal(fixture.calls.some(([action]) => action === 'open_conversation'), false);
  await change(r, 'Canal para iniciar conversa', 'channel-a'); await submit(r);
  const opened = fixture.calls.find(([action]) => action === 'open_conversation')[1];
  assert.equal(opened.id, 'lead-a'); assert.equal(opened.channel_id, 'channel-a'); assert.equal(opened.chat_jid, '5511000000000@s.whatsapp.net');
  assert.equal(fixture.calls.some(([action]) => action === 'send_message'), false);
  await act(async () => r.unmount());
});

test('configuração salva a seção e a revisão sem ativar autonomia por padrão', async () => {
  const fixture = apiFixture(); const r = await mount('configuracoes', fixture);
  await click(r, 'Atendimento e IA'); await change(r, 'Pausar IA quando uma pessoa responder', true); await submit(r);
  const saved = fixture.calls.find(([action]) => action === 'save_config');
  assert.equal(saved[1].section, 'attendance'); assert.equal(saved[1].revision, workspace.config.revision); assert.equal(saved[1].data.pause_on_human, true);
  assert.equal(saved[1].data.auto_send, false);
  assert.notEqual(saved[1].data.enabled, true);
  await act(async () => r.unmount());
});

test('agente novo mantém autonomia desligada e envia identidade nativa', async () => {
  const fixture = apiFixture(); const r = await mount('agentes', fixture);
  await click(r, 'Configurar Qualificação'); await change(r, 'Nome do agente', 'Qualificador de teste'); await submit(r);
  const saved = fixture.calls.find(([action]) => action === 'save_agent_draft')[1].data;
  assert.equal(saved.nome, 'Qualificador de teste'); assert.equal(saved.auto_responder, false);
  assert.equal(saved.funil.crm_ia.tipo, 'qualificacao'); assert.equal(saved.funil.crm_ia.pipeline_id, 'pipeline-a');
  assert.equal(fixture.calls.filter(([action]) => action === 'publish_agent_draft').length, 1);
  await act(async () => r.unmount());
});
test('teste do agente mostra identidade tipada e modelo salvo sem enviar WhatsApp', async () => {
  const agent = { id: 'agent-a', nome: 'Qualificador salvo', modelo: 'openai/gpt-4o-mini', funil: { crm_ia: { tipo: 'qualificacao', pipeline_id: 'pipeline-a' } } };
  const fixture = apiFixture({ test_agent: () => ({ resposta: 'Resposta de teste', agente: { id: agent.id, nome: agent.nome }, preview: true }) });
  const r = await mount('agentes', fixture, { workspace: { ...workspace, agents: [agent] } });
  await click(r, 'Configurar Qualificação'); await change(r, 'Mensagem de teste', 'Qual o próximo passo?'); await click(r, 'Testar agente');
  assert.match(text(r.toJSON()), /Resposta de teste/); assert.match(text(r.toJSON()), /Qualificador salvo/);
  assert.match(text(r.toJSON()), /openai\/gpt-4o-mini/); assert.equal(fixture.calls.some(([action]) => action === 'send_message'), false);
  await act(async () => r.unmount());
});
test('voz e compreensão de áudio têm escolhas explícitas e não acionam geração ao salvar', async () => {
  const fixture = apiFixture({ capabilities: () => ({ audio: { available: true, input_available: true, model: 'gpt-4o-mini-tts' } }) });
  const r = await mount('agentes', fixture); await click(r, 'Configurar Qualificação');
  await change(r, 'Nome do agente', 'Agente de áudio'); await change(r, 'Respostas em áudio', 'always');
  await change(r, 'Voz do agente', 'nova'); await change(r, 'Velocidade da voz', '1.25'); await change(r, 'Entender áudios recebidos', true); await submit(r);
  assert.deepEqual(fixture.calls.findLast(([action]) => action === 'save_agent_draft')[1].data.funil.crm_ia.audio, { enabled: true, input_enabled: true, voice: 'nova', speed: 1.25, mode: 'always' });
  assert.equal(fixture.calls.some(([action]) => ['test_agent', 'send_media', 'send_message'].includes(action)), false);
  await act(async () => r.unmount());
});
test('sem provedor de voz a UI recusa habilitação e permite continuar em texto', async () => {
  const fixture = apiFixture(); const r = await mount('agentes', fixture); await click(r, 'Configurar Qualificação');
  assert.equal(field(r, 'Respostas em áudio').props.disabled, true);
  assert.equal(field(r, 'Entender áudios recebidos').props.disabled, true);
  assert.match(text(r.toJSON()), /indisponível neste servidor/); await act(async () => r.unmount());
});

test('agente de agenda recusa intervalo zero sem apagar o formulário ou salvar', async () => {
  const fixture = apiFixture(); const r = await mount('agentes', fixture, { workspace: { ...workspace, config: { ...workspace.config, data: { availability: { duration_minutes: 45, interval_minutes: 15, horizon_days: 90 } } } } });
  await click(r, 'Configurar Agendamentos'); await change(r, 'Nome do agente', 'Agenda revisada');
  assert.equal(field(r, 'Duração em minutos').props.value, 45);
  assert.equal(field(r, 'Intervalo entre horários').props.value, 15);
  assert.equal(field(r, 'Janela futura, em dias').props.value, 90);
  assert.equal(Number(field(r, 'Intervalo entre horários').props.min), 5);
  await change(r, 'Intervalo entre horários', '0'); await submit(r);
  assert.equal(fixture.calls.some(([action]) => action === 'publish_agent_draft'), false);
  assert.match(text(r.toJSON()), /disponibilidade|intervalo/i);
  assert.equal(field(r, 'Nome do agente').props.value, 'Agenda revisada');
  await act(async () => r.unmount());
});
test('editar a velocidade não apaga a escolha de voz e valor inválido não salva', async () => {
  const fixture = apiFixture({ capabilities: () => ({ audio: { available: true } }) });
  const r = await mount('agentes', fixture); await click(r, 'Configurar Qualificação'); await change(r, 'Nome do agente', 'Voz revisada');
  await change(r, 'Respostas em áudio', 'always'); await change(r, 'Velocidade da voz', '');
  assert.equal(field(r, 'Respostas em áudio').props.value, 'always'); assert.equal(field(r, 'Velocidade da voz').props.value, '');
  await submit(r); assert.equal(fixture.calls.some(([action]) => action === 'publish_agent_draft'), false); assert.match(text(r.toJSON()), /Configuração de voz inválida/);
  await change(r, 'Velocidade da voz', '1.5'); await submit(r); assert.equal(fixture.calls.findLast(([action]) => action === 'save_agent_draft')[1].data.funil.crm_ia.audio.speed, 1.5);
  await act(async () => r.unmount());
});
test('fila distingue voz pronta, entrega confirmada e fallback para texto', async () => {
  const fixture = apiFixture({ queue: () => ({ rows: [
    { id: 'audio-ready', body: 'Resposta de áudio', status: 'uncertain', voice_status: 'ready', contact: { nome: 'Destino sintético' }, channel_name: 'Canal escolhido' },
    { id: 'audio-fallback', body: 'Resposta em texto', status: 'sent', voice_status: 'text_fallback', contact_id: 'known-contact' },
  ], total: 2 }) });
  const r = await mount('agenda', fixture);
  assert.match(text(r.toJSON()), /Áudio preparado; envio ainda não confirmado/);
  assert.match(text(r.toJSON()), /Enviada em texto: o áudio ficou indisponível/);
  assert.match(text(r.toJSON()), /Destino sintético.*Canal escolhido/); assert.doesNotMatch(text(r.toJSON()), /Voz sintética enviada/);
  await act(async () => r.unmount());
});
test('Google Agenda só prepara o consentimento após clique e seleciona calendário com revisão', async () => {
  let connected = false, consented = false;
  const fixture = apiFixture({ calendar_status: () => ({ configured: true, connected, status: connected ? 'connected' : consented ? 'awaiting_calendar' : 'disconnected', revision: 'connection-version', calendar_name: connected ? 'Agenda escolhida' : null }),
    calendar_connect: () => ({ url: 'https://accounts.google.com/o/oauth2/v2/auth?state=synthetic', expires_in: 600 }),
    calendar_list: payload => ({ rows: [{ id: payload.pageToken ? 'calendar-b' : 'calendar-a', name: payload.pageToken ? 'Outra agenda' : 'Agenda escolhida' }], revision: 'connection-version', next_page_token: payload.pageToken ? null : 'next-calendar-page' }),
    calendar_select: () => { connected = true; return { connected: true }; }, calendar_disconnect: () => { connected = false; consented = false; return { connected: false }; } });
  const r = await mount('configuracoes', fixture, { initialPath: '/crm-ia/configuracoes?aba=google_calendar' });
  assert.equal(fixture.calls.some(([action]) => action === 'calendar_connect'), false);
  await click(r, 'Conectar Google Agenda');
  assert.equal(r.root.findAllByType('a').find(node => text(node.props.children) === 'Continuar no Google').props.href, 'https://accounts.google.com/o/oauth2/v2/auth?state=synthetic');
  consented = true; await click(r, 'Atualizar conexão'); await click(r, 'Escolher calendário');
  await click(r, 'Carregar mais calendários');
  assert.deepEqual(fixture.calls.filter(([action]) => action === 'calendar_list').at(-1)[1], { pageToken: 'next-calendar-page' });
  assert.equal(field(r, 'Calendário Google').findAllByType('option').length, 3);
  await change(r, 'Calendário Google', 'calendar-a'); await submit(r);
  assert.deepEqual(fixture.calls.find(([action]) => action === 'calendar_select')[1], { calendar_id: 'calendar-a', revision: 'connection-version' });
  assert.match(text(r.toJSON()), /Agenda escolhida/);
  await click(r, 'Desconectar Google Agenda');
  assert.equal(fixture.calls.find(([action]) => action === 'calendar_disconnect')[1].revokeGoogle, undefined);
  await act(async () => r.unmount());
});

test('retorno do Google finaliza uma vez na conta correta e não deixa o código na URL', async () => {
  const clientId = '11111111-1111-4111-8111-111111111111', state = 'crmcal1.synthetic.signature';
  let cleanUrl;
  captureCallback({ pathname: '/', search: '', hash: `#/crm-ia/configuracoes?cliente=${clientId}&aba=google_calendar&google_calendar=finalize&calendar_state=${state}&calendar_code=synthetic-code` },
    { state: null, replaceState(_state, _title, url) { cleanUrl = url; } });
  const fixture = apiFixture({ calendar_finalize: () => ({ status: 'awaiting_calendar' }) });
  const r = await mount('configuracoes', fixture, { workspace: { ...workspace, client: { ...client, id: clientId } }, initialPath: '/crm-ia/configuracoes?aba=google_calendar' });
  assert.doesNotMatch(cleanUrl, /synthetic-code|calendar_state|finalize/);
  assert.deepEqual(fixture.calls.filter(([action]) => action === 'calendar_finalize'), [['calendar_finalize', { state, code: 'synthetic-code' }]]);
  await click(r, 'Atualizar conexão');
  assert.equal(fixture.calls.filter(([action]) => action === 'calendar_finalize').length, 1);
  await act(async () => r.unmount());
});

test('atalho do Painel mantém o período ao abrir Conversas', async () => {
  const fixture = apiFixture();
  const dashboard = await mount('painel', fixture);
  let destination, period;
  try {
    period = fixture.calls.find(([action]) => action === 'overview')[1];
    destination = dashboard.root.findAllByType('a').find(node => text(node).includes('Conversas abertas')).props.href;
    const query = new URL(destination, 'https://fixture.invalid').searchParams;
    assert.equal(query.get('since'), period.since); assert.equal(query.get('until'), period.until);
  } finally { await act(async () => dashboard.unmount()); }
  const conversations = await mount('conversas', fixture, { initialPath: destination });
  try {
    const payload = fixture.calls.find(([action]) => action === 'conversations')[1];
    assert.equal(payload.since, period.since); assert.equal(payload.until, period.until);
    assert.equal(field(conversations, 'Última mensagem desde').props.value, period.since);
    assert.equal(field(conversations, 'Última mensagem até').props.value, period.until);
  } finally { await act(async () => conversations.unmount()); }
});

test('Conversas conserva o recorte ao paginar e selecionar, e editar data reinicia a página', async () => {
  const conversation = { contact_id: 'contact-a', channel_id: 'channel-a', nome: 'Contato sintético', attendance: 'human' };
  const fixture = apiFixture({ conversations: () => ({ rows: [conversation], total: 90 }) });
  const r = await mount('conversas', fixture, { initialPath: '/crm-ia/conversas?cliente=account-a&since=2026-10-01&until=2026-10-31&pipeline_id=pipeline-a&stage_id=stage-a&origin=Site&sort=oldest&owner_id=person-a&offset=30' });
  const listCalls = () => fixture.calls.filter(([action, payload]) => action === 'conversations' && !payload.contact_id);
  try {
    const filters = { since: '2026-10-01', until: '2026-10-31', pipeline_id: 'pipeline-a', stage_id: 'stage-a', origin: 'Site', sort: 'oldest', owner_id: 'person-a' };
    for (const [key, value] of Object.entries(filters)) assert.equal(listCalls().at(-1)[1][key], value, key);
    await click(r, 'Próxima'); assert.equal(listCalls().at(-1)[1].offset, 60);
    await click(r, 'Abrir conversa de Contato sintético');
    for (const [key, value] of Object.entries(filters)) assert.equal(listCalls().at(-1)[1][key], value, key);
    assert.equal(listCalls().at(-1)[1].channel_id, 'channel-a');
    await click(r, 'Próxima'); assert.equal(listCalls().at(-1)[1].offset, 30);
    await change(r, 'Última mensagem desde', '2026-10-05');
    const payload = listCalls().at(-1)[1];
    assert.equal(payload.since, '2026-10-05'); assert.equal(payload.until, '2026-10-31'); assert.equal(payload.offset, 0);
    assert.equal(payload.stage_id, 'stage-a'); assert.equal(payload.channel_id, 'channel-a');
    assert.equal(fixture.calls.some(([action]) => ['save_conversation', 'send_message', 'schedule_message'].includes(action)), false);
  } finally { await act(async () => r.unmount()); }
});

test('Conversas sem datas exibe os sete dias usados na leitura e mantém a recusa de período do servidor', async () => {
  const fixture = apiFixture({ conversations: payload => {
    if (payload.until < payload.since) throw Error('Período inválido.');
    return { rows: [], total: 0 };
  } });
  const r = await mount('conversas', fixture);
  try {
    const payload = fixture.calls.find(([action]) => action === 'conversations')[1];
    assert.equal(Date.parse(payload.until) - Date.parse(payload.since), 6 * 86400000);
    assert.equal(field(r, 'Última mensagem desde').props.value, payload.since);
    assert.equal(field(r, 'Última mensagem até').props.value, payload.until);
    await change(r, 'Última mensagem até', '2000-01-01');
    assert.match(text(r.toJSON()), /Período inválido/);
    assert.equal(field(r, 'Última mensagem até').props.value, '2000-01-01');
  } finally { await act(async () => r.unmount()); }
});

test('transcrição já autorizada aparece no histórico sem baixar ou gerar áudio ao abrir', async () => {
  const fixture = apiFixture({ conversations: () => ({ rows: [{ contact_id: 'contact-a', channel_id: 'channel-a', nome: 'Contato sintético', attendance: 'ai' }], total: 1 }),
    messages: () => ({ rows: [{ id: 'incoming', media_type: 'audio', transcription: { status: 'ready', text: 'Texto sintético do áudio recebido.' } },
      { id: 'failed', media_type: 'audio', transcription: { status: 'failed' } }, { id: 'voice', from_me: true, media_type: 'audio', voice_synthetic: true }], total: 3 }) });
  const r = await mount('conversas', fixture, { initialPath: '/crm-ia/conversas?contact_id=contact-a&channel_id=channel-a' });
  assert.match(text(r.toJSON()), /Transcrição automática.*Texto sintético do áudio recebido/);
  assert.match(text(r.toJSON()), /Não foi possível transcrever este áudio/);
  assert.match(text(r.toJSON()), /Voz gerada por IA/);
  assert.equal(fixture.calls.some(([action]) => ['load_media', 'send_media', 'send_message'].includes(action)), false);
  await act(async () => r.unmount());
});

test('seleção atribui somente os leads marcados e exclusão pede arquivamento explícito', async () => {
  const fixture = apiFixture(); const r = await mount('leads', fixture);
  await change(r, 'Selecionar Contato sintético', true); await click(r, 'Atribuir responsável');
  await change(r, 'Novo responsável da seleção', 'person-a'); await submit(r);
  assert.deepEqual(fixture.calls.find(([action]) => action === 'bulk_assign')[1], { ids: ['lead-a'], owner_id: 'person-a', items: [{ id: 'lead-a', expected_updated_at: lead.updated_at }] });
  await click(r, 'Abrir Contato sintético'); await click(r, 'Arquivar lead');
  assert.equal(fixture.calls.some(([action]) => action === 'archive_lead'), false);
  await submit(r); assert.equal(fixture.calls.find(([action]) => action === 'archive_lead')[1].id, lead.id);
  await act(async () => r.unmount());
});

test('importação mostra revisão antes de criar e conserva a chave da tentativa', async () => {
  const fixture = apiFixture(); const r = await mount('leads', fixture);
  await click(r, 'Importar CSV');
  await act(async () => field(r, 'Arquivo CSV').props.onChange({ target: { value: '', files: [{ size: 100, text: async () => 'nome;telefone\nPessoa de exemplo;5511000000000' }] } }));
  await click(r, 'Revisar importação');
  assert.equal(fixture.calls.some(([action]) => action === 'import_leads'), false);
  await submit(r); const imported = fixture.calls.find(([action]) => action === 'import_leads')[1];
  assert.equal(imported.rows.length, 1); assert.equal(imported.rows[0].nome, 'Pessoa de exemplo'); assert.equal(typeof imported.request_id, 'string');
  await act(async () => r.unmount());
});

test('exclusão da etapa é confirmada e usa sua versão sem remover oportunidades', async () => {
  const fixture = apiFixture(); const r = await mount('funil', fixture);
  await click(r, 'Configurar funil'); await click(r, 'Excluir Entrada');
  assert.equal(fixture.calls.some(([action]) => action === 'delete_stage'), false);
  await submit(r); assert.equal(fixture.calls.find(([action]) => action === 'delete_stage')[1].id, 'stage-a');
  await act(async () => r.unmount());
});

test('envio mantém o canal e repete a mesma tentativa após resposta perdida', async () => {
  let failed = true;
  const conversation = { contact_id: 'contact-a', channel_id: 'channel-b', nome: 'Conversa de teste', attendance: 'human', updated_at: '2026-11-11T10:00:00Z' };
  const fixture = apiFixture({ conversations: () => ({ rows: [conversation], total: 1 }), messages: payload => { assert.equal(payload.channel_id, 'channel-b'); assert.equal(payload.contact_id, 'contact-a'); return { rows: [], total: 0 }; }, send_message: () => { if (failed) throw new Error('Resposta do transporte perdida'); return { id: 'receipt-a', status: 'sent' }; } });
  const r = await mount('conversas', fixture, { workspace: { ...workspace, channels: [...workspace.channels, { id: 'channel-b', nome: 'Segundo canal' }] } });
  await click(r, 'Abrir conversa de Conversa de teste'); await change(r, 'Mensagem ao contato', 'Mensagem de teste'); await submit(r);
  assert.match(text(r.toJSON()), /Resposta do transporte perdida/); assert.equal(field(r, 'Mensagem ao contato').props.value, 'Mensagem de teste');
  failed = false; await submit(r);
  const sent = fixture.calls.filter(([action]) => action === 'send_message');
  assert.equal(sent[0][1].channel_id, 'channel-b'); assert.equal(sent[0][1].request_id, sent[1][1].request_id);
  assert.equal(field(r, 'Mensagem ao contato').props.value, ''); assert.match(text(r.toJSON()), /Envio confirmado/);
  await act(async () => r.unmount());
});

test('atalho insere a resposta rápida salva sem enviar ao contato', async () => {
  const fixture = apiFixture({ conversations: () => ({ rows: [{ contact_id: 'contact-a', channel_id: 'channel-a', nome: 'Conversa de teste' }], total: 1 }) });
  const r = await mount('conversas', fixture, { workspace: { ...workspace, config: { ...workspace.config, data: { attendance: { quick_replies: [{ shortcut: 'oi', text: 'Texto revisável da equipe' }] } } } } });
  await click(r, 'Abrir conversa de Conversa de teste'); await change(r, 'Mensagem ao contato', '/oi'); await click(r, 'Inserir /oi');
  assert.equal(field(r, 'Mensagem ao contato').props.value, 'Texto revisável da equipe'); assert.equal(fixture.calls.some(([action]) => action === 'send_message'), false);
  await act(async () => r.unmount());
});
test('atualização automática lê novas mensagens sem perder o rascunho e encerra os timers ao sair', async () => {
  const originalSet = globalThis.setInterval, originalClear = globalThis.clearInterval;
  const timers = new Map(); let timerId = 0, incoming = 'Primeiro trecho';
  globalThis.setInterval = (callback, ms) => { timers.set(++timerId, { callback, ms }); return timerId; };
  globalThis.clearInterval = id => timers.delete(id);
  try {
    const fixture = apiFixture({ conversations: () => ({ rows: [{ contact_id: 'contact-a', channel_id: 'channel-a', nome: 'Conversa de teste' }], total: 1 }),
      messages: payload => { assert.equal(payload.channel_id, 'channel-a'); return { rows: [{ id: 'new', body: incoming }], total: 1 }; } });
    const r = await mount('conversas', fixture); await click(r, 'Abrir conversa de Conversa de teste');
    await change(r, 'Mensagem ao contato', 'Rascunho preservado'); incoming = 'Mensagem nova do contato';
    await act(async () => [...timers.values()].find(timer => timer.ms === 5000).callback());
    assert.match(text(r.toJSON()), /Mensagem nova do contato/); assert.equal(field(r, 'Mensagem ao contato').props.value, 'Rascunho preservado');
    await act(async () => r.unmount()); assert.equal(timers.size, 0);
  } finally { globalThis.setInterval = originalSet; globalThis.clearInterval = originalClear; }
});
test('falha, cancelamento e envio em processamento preservam o rascunho sem confirmação falsa', async () => {
  for (const status of ['failed', 'cancelled', 'sending', 'uncertain']) {
    const fixture = apiFixture({ conversations: () => ({ rows: [{ contact_id: 'contact-a', channel_id: 'channel-a', nome: 'Conversa de teste' }], total: 1 }), send_message: () => ({ id: 'delivery', status }) });
    const r = await mount('conversas', fixture); await click(r, 'Abrir conversa de Conversa de teste');
    await change(r, 'Mensagem ao contato', 'Conservar rascunho'); await submit(r);
    assert.equal(field(r, 'Mensagem ao contato').props.value, 'Conservar rascunho');
    assert.doesNotMatch(text(r.toJSON()), /Envio confirmado/);
    await act(async () => r.unmount());
  }
});
test('conversa reutiliza anexos e gravador, limita 4 MB e só baixa mídia por pedido no canal exato', async () => {
  const fixture = apiFixture({ conversations: () => ({ rows: [{ contact_id: 'contact-a', channel_id: 'channel-a', nome: 'Conversa de teste' }], total: 1 }),
    messages: () => ({ rows: [{ id: 'audio-a', download_id: 'known-audio', body: '[Áudio]', media_type: 'ptt', created_at: '2026-11-11T10:00:00Z' }], total: 1 }),
    load_media: () => ({ url: 'data:audio/mpeg;base64,YXVkaW8=', mimetype: 'audio/mpeg' }) });
  const r = await mount('conversas', fixture); await click(r, 'Abrir conversa de Conversa de teste');
  assert.ok(button(r, 'Anexar arquivo até 4 MB')); assert.ok(button(r, 'Gravar áudio')); assert.equal(button(r, 'Notas'), undefined);
  assert.equal(fixture.calls.some(([action]) => action === 'load_media'), false);
  const input = rows(r, 'input').find(node => node.props.type === 'file');
  await act(async () => input.props.onChange({ target: { files: [{ name: 'grande.pdf', size: 4194305, type: 'application/pdf' }], value: '' } }));
  assert.match(text(r.toJSON()), /Máximo 4 MB/); assert.equal(fixture.calls.some(([action]) => action === 'send_media'), false);
  await click(r, 'Carregar áudio');
  assert.deepEqual(fixture.calls.find(([action]) => action === 'load_media')[1], { contact_id: 'contact-a', channel_id: 'channel-a', message_id: 'known-audio', media_kind: 'audio' });
  assert.equal(rows(r, 'audio').length, 1); await act(async () => r.unmount());
});

test('compromisso usa o slot gravável e preserva o formulário quando há conflito', async () => {
  let conflict = true;
  const fixture = apiFixture({ slots: () => ({ rows: [{ owner_id: 'person-a', start_at: '2030-11-11T12:00:00Z', end_at: '2030-11-11T12:30:00Z' }], total: 1 }), save_appointment: () => { if (conflict) throw new Error('O horário foi reservado por outra pessoa'); return { id: 'appointment-a' }; } });
  const r = await mount('agenda', fixture);
  await click(r, 'Novo compromisso'); await change(r, 'Título do compromisso', 'Reunião de teste'); await change(r, 'Lead do compromisso', lead.id); await change(r, 'Atendente do compromisso', 'person-a'); await change(r, 'Horário disponível', '2030-11-11T12:00:00Z'); await submit(r);
  assert.match(text(r.toJSON()), /reservado por outra pessoa/); assert.equal(field(r, 'Título do compromisso').props.value, 'Reunião de teste');
  conflict = false; await submit(r); const saved = fixture.calls.filter(([action]) => action === 'save_appointment').at(-1)[1];
  assert.equal(saved.start_at, '2030-11-11T12:00:00Z'); assert.equal(saved.end_at, '2030-11-11T12:30:00Z'); assert.equal(saved.owner_id, 'person-a');
  await act(async () => r.unmount());
});

test('campos personalizados usam o objeto do lead e conservam campos de outras definições', async () => {
  const customLead = { ...lead, crm_ia_fields: { tamanho: 40, legado: 'preservado' } };
  const fixture = apiFixture({ lead: () => ({ lead: customLead, events: [], appointments: [] }) });
  const r = await mount('leads', fixture, { workspace: { ...workspace, config: { ...workspace.config, data: { custom_fields: { fields: [{ key: 'tamanho', name: 'Tamanho', type: 'number', active: true }] } } } } });
  await click(r, 'Abrir Contato sintético'); await click(r, 'Editar lead'); await change(r, 'Tamanho', '42'); await submit(r);
  assert.deepEqual(fixture.calls.find(([action]) => action === 'save_lead')[1].crm_ia_fields, { tamanho: 42, legado: 'preservado' });
  await act(async () => r.unmount());
});

test('reagendamento consulta os slots com a reserva original e grava a mesma identidade', async () => {
  const appointment = { id: 'appointment-a', lead_id: lead.id, owner_id: 'person-a', title: 'Reunião original', notes: '', start_at: '2030-11-11T12:00:00Z', end_at: '2030-11-11T12:30:00Z', updated_at: '2026-11-11T10:00:00Z', status: 'confirmed' };
  const fixture = apiFixture({ agenda: () => ({ rows: [appointment], total: 1 }), slots: payload => { assert.equal(payload.appointment_id, 'appointment-a'); return { rows: [{ owner_id: 'person-a', start_at: '2030-11-11T13:00:00Z', end_at: '2030-11-11T13:30:00Z' }], total: 1 }; } });
  const r = await mount('agenda', fixture); await click(r, 'Reagendar compromisso'); await change(r, 'Horário disponível', '2030-11-11T13:00:00Z'); await submit(r);
  const saved = fixture.calls.find(([action]) => action === 'save_appointment')[1]; assert.equal(saved.id, 'appointment-a'); assert.equal(saved.expected_updated_at, appointment.updated_at); assert.equal(saved.start_at, '2030-11-11T13:00:00Z');
  await act(async () => r.unmount());
});

test('preparação do atendimento exige a permissão específica de provisionamento', async () => {
  const fixture = apiFixture(); const r = await mount('painel', fixture, { workspace: { ...workspace, provisioned: false, permissions: { manage: true, provision: false } } });
  assert.equal(button(r, 'Preparar CRM desta conta'), undefined); assert.match(text(r.toJSON()), /ainda não tem CRM preparado/);
  await act(async () => r.unmount());
});

test('link do Atlas carrega a ficha pelo serviço mesmo fora da página e recusa fonte indisponível', async () => {
  const fixture = apiFixture({ lead: payload => { assert.equal(payload.id, 'lead-fora-da-pagina'); throw new Error('Lead indisponível para esta conta'); } });
  const r = await mount('leads', fixture, { initialPath: '/crm-ia/leads?cliente=account-a&lead_id=lead-fora-da-pagina' });
  assert.equal(fixture.calls.some(([action]) => action === 'lead'), true); assert.match(text(r.toJSON()), /Lead indisponível para esta conta/); assert.equal(button(r, 'Editar lead'), undefined);
  await act(async () => r.unmount());
});

test('Conversas filtra por quem atende e abre a fila sem perder o rascunho do canal', async () => {
  const conversation = { contact_id: 'contact-a', channel_id: 'channel-a', nome: 'Conversa de teste', attendance: 'human' };
  const fixture = apiFixture({ conversations: () => ({ rows: [conversation], total: 1 }) });
  const r = await mount('conversas', fixture, { initialPath: '/crm-ia/conversas?since=2026-10-01&until=2026-10-31' });
  try {
    assert.equal(fixture.calls.some(([action]) => action === 'queue'), false);
    await click(r, 'IA');
    const filtered = fixture.calls.findLast(([action]) => action === 'conversations')[1];
    assert.equal(filtered.attendance, 'ai'); assert.equal(filtered.since, '2026-10-01');
    await click(r, 'Abrir conversa de Conversa de teste');
    await change(r, 'Mensagem ao contato', 'Rascunho preservado no mesmo canal');
    await click(r, 'Mensagens agendadas');
    const queue = fixture.calls.find(([action]) => action === 'queue')[1];
    assert.equal(queue.contact_id, 'contact-a'); assert.equal(queue.channel_id, 'channel-a');
    await click(r, 'Concluir');
    assert.equal(field(r, 'Mensagem ao contato').props.value, 'Rascunho preservado no mesmo canal');
    await click(r, 'Voltar às conversas');
    assert.equal(r.root.findByProps({ 'aria-label': 'Detalhe da conversa' }).props.hidden, true);
    await click(r, 'Abrir conversa de Conversa de teste');
    assert.equal(field(r, 'Mensagem ao contato').props.value, 'Rascunho preservado no mesmo canal');
    assert.equal(fixture.calls.some(([action]) => ['send_message', 'schedule_message', 'save_conversation'].includes(action)), false);
  } finally { await act(async () => r.unmount()); }
});

test('detalhe com erro ou canal indisponível mantém o retorno à lista', async () => {
  for (const channel of ['channel-a', 'unknown-channel']) {
    const fixture = apiFixture({ messages: () => { throw Error('Histórico temporariamente indisponível.'); } });
    const r = await mount('conversas', fixture, { initialPath: `/crm-ia/conversas?contact_id=contact-a&channel_id=${channel}` });
    try {
      assert.ok(button(r, 'Voltar às conversas'));
      await click(r, 'Voltar às conversas');
      assert.equal(r.root.findByProps({ 'aria-label': 'Detalhe da conversa' }).props.hidden, true);
      assert.equal(fixture.calls.some(([action]) => ['send_message', 'save_conversation'].includes(action)), false);
    } finally { await act(async () => r.unmount()); }
  }
});

test('agendamento e cancelamento usam a fila do contato e canal escolhidos', async () => {
  let queued = null;
  const fixture = apiFixture({ conversations: () => ({ rows: [{ contact_id: 'contact-a', channel_id: 'channel-a', nome: 'Conversa de teste' }], total: 1 }),
    queue: payload => { if (queued) { assert.equal(payload.contact_id, 'contact-a'); assert.equal(payload.channel_id, 'channel-a'); } return { rows: queued ? [queued] : [], total: queued ? 1 : 0 }; },
    schedule_message: payload => { assert.equal(payload.channel_id, 'channel-a'); assert.equal(payload.contact_id, 'contact-a'); queued = { ...payload, id: 'queue-a', status: 'pending' }; return queued; },
    cancel_message: payload => { assert.equal(payload.id, 'queue-a'); queued = { ...queued, status: 'cancelled' }; return queued; } });
  const r = await mount('conversas', fixture);
  try {
  await click(r, 'Abrir conversa de Conversa de teste'); await change(r, 'Mensagem ao contato', 'Mensagem futura de teste'); await click(r, 'Programar mensagem');
  assert.equal(fixture.calls.some(([action]) => action === 'schedule_message'), false);
  await change(r, 'Data e hora do envio', '2030-11-11T09:00'); await submit(r);
  await click(r, 'Mensagens agendadas'); assert.match(text(r.toJSON()), /Mensagem futura de teste/);
  await click(r, 'Cancelar mensagem'); assert.equal(fixture.calls.filter(([action]) => action === 'cancel_message').length, 1); assert.match(text(r.toJSON()), /Cancelada/);
  } finally { await act(async () => r.unmount()); }
});

test('modelo só é aplicado depois da confirmação na conta atual com sua revisão', async () => {
  const template = { id: 'template-a', nome: 'Funil base', tipo: 'pipeline', nicho: 'Teste', data: { stages: [] }, revision: '22222222-2222-4222-8222-222222222222' };
  const fixture = apiFixture(); const r = await mount('modelos', fixture, { workspace: { ...workspace, templates: [template] } });
  await click(r, 'Aplicar Funil base'); assert.equal(fixture.calls.some(([action]) => action === 'apply_template'), false); await submit(r);
  assert.deepEqual(fixture.calls.find(([action]) => action === 'apply_template')[1], { id: 'template-a', revision: template.revision });
  await act(async () => r.unmount());
});

test('navegação entre canais pela URL descarta rascunho e consulta o novo par exato', async () => {
  const fixture = apiFixture(); const base = '/crm-ia/conversas?cliente=account-a&contact_id=contact-a&channel_id=';
  const r = await mount('conversas', fixture, { initialPath: base + 'channel-a', workspace: { ...workspace, channels: [...workspace.channels, { id: 'channel-b', nome: 'Segundo canal' }] } });
  try {
    await change(r, 'Mensagem ao contato', 'Rascunho do canal anterior');
    await r.navigate(base + 'channel-b');
    assert.equal(field(r, 'Mensagem ao contato').props.value, ''); assert.equal(fixture.calls.filter(([action]) => action === 'messages').at(-1)[1].channel_id, 'channel-b');
  } finally { await act(async () => r.unmount()); }
});

test.after(async () => { console.error = previousError; await rm(scratch, { recursive: true, force: true }); assert.deepEqual(renderErrors, [], 'Nenhum fluxo pode gerar erro de renderização React.'); });

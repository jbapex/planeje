import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import { build } from 'esbuild';

const qa = '/tmp/planeje-crm-ui-qa';
const require = createRequire(path.join(qa, 'package.json'));
const React = require('react');
const { act, create } = require('react-test-renderer');
const root = new URL('../../', import.meta.url).pathname;
const resolveSrc = (file) => path.join(root, 'src', file);
const fixtureImports = {
  '@/contexts/SupabaseAuthContext': 'export const useAuth=()=>globalThis.csFixture.auth;',
  '@/contexts/ModuleSettingsContext': 'export const useModuleSettings=()=>globalThis.csFixture.modules;',
  '@/lib/customSupabaseClient': 'export const supabase=globalThis.csFixture.db; export const supabaseUrl="https://fixture.invalid"; export const supabaseAnonKey="fixture";',
};

test('read gate and client subsection revalidate the actual CS workspace', async () => {
  const directory = await mkdtemp(path.join(qa, 'cs-workspace-'));
  let renderer;
  globalThis.document = new EventTarget();
  try {
    const file = path.join(directory, 'bundle.cjs');
    await build({
      stdin: { contents: `export {default as Workspace} from ${JSON.stringify(resolveSrc('components/cs-ia/CsIaWorkspace.jsx'))}; export {MemoryRouter,Route,Routes,useLocation} from 'react-router-dom';`, resolveDir: root },
      outfile: file, bundle: true, format: 'cjs', platform: 'node', external: ['react'],
      loader: { '.css': 'empty', '.png': 'dataurl', '.jpg': 'dataurl' }, define: { 'import.meta.env.VITE_ATLAS_DEMANDS_ENABLED': '"true"', 'import.meta.env': '{}' },
      plugins: [{ name: 'fixture', setup(bundler) {
        bundler.onResolve({ filter: /^@\// }, ({ path: importPath }) => {
          if (fixtureImports[importPath]) return { path: importPath, namespace: 'fixture' };
          const target = resolveSrc(importPath.slice(2));
          return { path: [target, `${target}.jsx`, `${target}.js`].find(existsSync) };
        });
        bundler.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path: importPath }) => ({ contents: fixtureImports[importPath] }));
      } }],
    });

    const actor = { id: 'staff', role: 'colaborador', status: 'active', full_name: 'Pessoa fictícia' };
    const fixture = { auth: { profile: actor, user: actor }, modules: { moduleSettings: { clients: true, atendimento: false } } };
    let reads = 0;
    let visible = true;
    let atlasEnabled = false;
    let readingComplaint = false;
    let taskReads = 0;
    let taskBoardEnabled = true;
    let historyAvailable = true;
    let crmAvailable = true;
    let sourceCalls = 0;
    const row = { client_id: 'permitido', client_name: 'Cliente fictício', group_status: 'linked', conversation_id: 'g1',
      wa_client_id: 'agency', last_activity_at: new Date(Date.now() - 3600000).toISOString(),
      health: 'atencao', score: 50, signal: 'resposta_pendente', factors: [] };
    const query = (reply) => new Proxy({}, { get: (_, method, self) => method === 'then'
      ? (resolve, reject) => Promise.resolve().then(reply).then(resolve, reject)
      : () => self });
    fixture.db = {
      rpc: (name, args) => {
        if (name === 'cs_ia_task_origins') return query(() => ({ data: [] }));
        if (name === 'cs_ia_client_sources') {
          assert.equal(args.p_client_id, row.client_id);
          sourceCalls++;
          if (args.p_source === 'arquivos') return query(() => ({ data: { items: [{ id: 'doc', title: 'Relatório de teste', kind: 'report', state: 'approved', created_at: row.last_activity_at }] } }));
          assert.equal(args.p_source, 'crm');
          return query(() => crmAvailable ? { data: { totals: { leads: 1, qualified: 1, won: 0 }, items: [{ id: 'move', lead_id: 'lead', label: 'Proposta fictícia', stage: 'Negociação', at: row.last_activity_at }] } } : { data: null });
        }
        if (name === 'cs_ia_reading_signals') return query(() => ({ data: readingComplaint ? [{ client_id: row.client_id, conversation_id: 'g1', complaint: true }] : [] }));
        if (name === 'cs_ia_get_reading') {
          assert.equal(args.p_client_id, row.client_id);
          return query(() => ({ data: readingComplaint ? { status: 'completed', conversation_id: 'g1', complaint: true } : { status: 'waiting' } }));
        }
        assert.ok(['cs_ia_radar', 'cs_ia_radar_snapshot'].includes(name));
        reads++;
        return query(() => ({ data: visible ? [row] : [] }));
      },
      from: (name) => {
        if (name === 'cs_ia_settings') return query(() => ({ data: { id: 1, score_drop: 15, quiet_days: 3, task_board_enabled: taskBoardEnabled } }));
        if (name === 'atlas_settings') return query(() => ({ data: atlasEnabled ? { owner_id: actor.id, enabled: true } : null }));
        if (name === 'clientes') return query(() => ({ data: visible && historyAvailable ? { id: row.client_id, created_at: '2026-10-01T12:00:00Z' } : null }));
        if (name === 'tarefas') {
          taskReads++;
          return query(() => ({ data: [{ id: 't1', client_id: row.client_id, title: 'Retorno de teste', status: 'todo', assignee_ids: [actor.id] }] }));
        }
        if (name === 'task_statuses') return query(() => ({ data: [{ value: 'todo', label: 'A fazer' }] }));
        if (name === 'profiles') return query(() => ({ data: [actor] }));
        assert.equal(name, 'cs_ia_daily');
        return query(() => ({ data: visible ? [{ operational_date: new Date().toISOString().slice(0, 10), captured_at: row.last_activity_at, score: 47,
          health: 'atencao', signal: 'resposta_pendente', factors: [] }] : [] }));
      },
    };
    globalThis.csFixture = fixture;
    const { Workspace, MemoryRouter, Route, Routes, useLocation } = require(file);
    const Atlas = () => React.createElement('p', null, useLocation().state?.csDraft?.message);
    const tree = (key, path = '/cs-ia/clientes/permitido?aba=historico') => React.createElement(MemoryRouter, { key, initialEntries: [path] },
      React.createElement(Routes, null, React.createElement(Route, { path: '/cs-ia/*', element: React.createElement(Workspace) }),
        React.createElement(Route, { path: '/assistant/atlas', element: React.createElement(Atlas) })));
    await act(async () => { renderer = create(tree('negado')); });
    const text = () => JSON.stringify(renderer.toJSON());
    assert.match(text(), /Acesso ao CS IA indisponível/);
    assert.equal(reads, 0);

    fixture.modules.moduleSettings.atendimento = true;
    await act(async () => renderer.update(tree('permitido')));
    assert.match(text(), /Consultar diário de saúde por período/);
    assert.match(text(), /Cliente fictício/);
    const timeline = () => renderer.root.findByProps({ 'aria-labelledby': 'cs-timeline-title' });
    const timelineText = () => timeline().findAllByType('h3').map(({ children }) => children.join('')).join('\n');
    const chooseSource = async (source) => act(async () => timeline().findAllByType('button')
      .find(({ props }) => props.children === source).props.onClick());
    assert.match(timelineText(), /Avaliação diária/);
    await chooseSource('WhatsApp');
    assert.match(timelineText(), /Última atividade do grupo/);
    assert.doesNotMatch(timelineText(), /Avaliação diária|Cliente cadastrado/);
    await chooseSource('Cadastro');
    assert.match(timelineText(), /Cliente cadastrado/);
    assert.doesNotMatch(timelineText(), /Avaliação diária|Última atividade do grupo/);
    await chooseSource('Todos');
    historyAvailable = false;
    await act(async () => renderer.update(tree('histórico-revogado')));
    assert.match(text(), /Não foi possível consultar o histórico deste cliente/);
    assert.doesNotMatch(text(), /Avaliação diária|Cliente cadastrado|Última atividade do grupo/);
    historyAvailable = true;
    await act(async () => timeline().findAllByType('button').find(({ props }) => props.children === 'Tentar novamente').props.onClick());
    assert.match(timelineText(), /Cliente cadastrado/);
    await act(async () => renderer.update(tree('ficha-fontes', '/cs-ia/clientes/permitido?aba=crm')));
    assert.match(text(), /CRM está indisponível/);
    assert.equal(sourceCalls, 0);
    fixture.modules.moduleSettings.crm = true;
    await act(async () => renderer.update(tree('ficha-fontes', '/cs-ia/clientes/permitido?aba=crm')));
    assert.match(text(), /Proposta fictícia/);
    assert.match(text(), /crm\/leads\/lead/);
    crmAvailable = false;
    await act(async () => { renderer.root.findByProps({ 'aria-label': 'Atualizar CRM' }).props.onClick(); });
    assert.match(text(), /Não foi possível consultar o CRM deste cliente/);
    assert.doesNotMatch(text(), /Proposta fictícia/);
    crmAvailable = true;
    await act(async () => { renderer.root.findAllByType('button').find(({ props }) => props.children === 'Tentar novamente').props.onClick(); });
    assert.match(text(), /Proposta fictícia/);
    await act(async () => renderer.update(tree('ficha-arquivos', '/cs-ia/clientes/permitido?aba=arquivos')));
    assert.match(text(), /Relatório de teste/);
    assert.match(text(), /Aprovado/);
    assert.doesNotMatch(text(), /Proposta fictícia/);
    const historyLink = () => renderer.root.findAllByType('a').find((node) => node.props.children === 'Histórico');
    const overviewLink = () => renderer.root.findAllByType('a').find((node) => node.props.children === 'Visão geral');
    const click = (link) => link.props.onClick({ button: 0, preventDefault() {} });
    await act(async () => click(overviewLink()));
    const before = reads;
    visible = false;
    await act(async () => click(historyLink()));
    assert.ok(reads > before);
    assert.match(text(), /Cliente indisponível/);
    assert.doesNotMatch(text(), /Cliente fictício|Consultar diário de saúde por período/);

    visible = true;
    const roomPath = '/cs-ia/tarefas?cliente=permitido&situacao=todo';
    const previousRadarReads = reads;
    await act(async () => renderer.update(tree('tarefas-indisponivel', roomPath)));
    assert.match(text(), /Tarefas está indisponível para esta sessão/);
    assert.equal(reads, previousRadarReads);
    assert.equal(taskReads, 0);
    assert.equal(renderer.root.findAllByType('a').some(link => link.props.href === '/cs-ia/tarefas'), false);

    fixture.modules.moduleSettings.tasks = true;
    taskBoardEnabled = false;
    await act(async () => renderer.update(tree('sala-desligada', roomPath)));
    assert.match(text(), /A sala de Tarefas está desligada/);
    assert.equal(reads, previousRadarReads);
    assert.equal(taskReads, 0);
    assert.equal(renderer.root.findAllByType('a').some(link => link.props.href === '/cs-ia/tarefas'), false);
    await act(async () => renderer.update(tree('ficha-com-sala-desligada', '/cs-ia/clientes/permitido?aba=tarefas')));
    assert.match(text(), /Retorno de teste/, 'a ficha preserva a tarefa oficial com a sala desligada');

    taskBoardEnabled = true;
    await act(async () => renderer.update(tree('sala', roomPath)));
    assert.match(text(), /Retorno de teste/);
    assert.ok(taskReads > 0);
    const previousTaskReads = taskReads;
    visible = false;
    const refreshTasks = renderer.root.findAllByType('button').find(button => React.Children.toArray(button.props.children)
      .some(child => typeof child === 'string' && child.trim() === 'Atualizar tarefas'));
    await act(async () => refreshTasks.props.onClick());
    assert.match(text(), /Cliente indisponível para esta sessão/);
    assert.doesNotMatch(text(), /Retorno de teste/);
    assert.equal(taskReads, previousTaskReads, 'a sala confere a carteira antes de consultar tarefas na atualização');

    fixture.modules.moduleSettings.assistant = true;
    atlasEnabled = true;
    visible = true;
    const triage = () => renderer.root.findAllByType('button').find(({ props }) => React.Children.toArray(props.children).includes('Perguntar ao CS IA'));
    await act(async () => renderer.update(tree('triagem', '/cs-ia/hoje')));
    await act(async () => triage().props.onClick());
    assert.match(text(), /Carteira autorizada · 1 cliente.*Resposta pendente \(1\)/);
    assert.doesNotMatch(text(), /Cliente fictício/);

    row.signal = 'atencao';
    readingComplaint = true;
    await act(async () => renderer.update(tree('abordagem', '/cs-ia/hoje')));
    const approach = renderer.root.findAllByType('button').find(({ props }) => props['aria-label'] === 'Preparar abordagem para Cliente fictício');
    await act(async () => approach.props.onClick());
    assert.match(text(), /Cliente fictício.*Reclamação na conversa/);
    await act(async () => renderer.update(tree('alerta-ficha', '/cs-ia/clientes/permitido')));
    assert.equal(renderer.root.findByProps({ id: 'cs-current-signal' }).children.join(''), 'Reclamação na conversa');
    readingComplaint = false;
    await act(async () => renderer.update(tree('janela-nova', '/cs-ia/clientes/permitido')));
    assert.equal(renderer.root.findByProps({ id: 'cs-current-signal' }).children.join(''), 'Acompanhar saúde');

    await act(async () => renderer.update(tree('triagem-revogada', '/cs-ia/hoje')));
    atlasEnabled = false;
    await act(async () => triage().props.onClick());
    assert.match(text(), /Não foi possível preparar o rascunho no Atlas/);
    assert.equal(triage(), undefined);
  } finally {
    if (renderer) await act(async () => renderer.unmount());
    delete globalThis.csFixture;
    delete globalThis.document;
    await rm(directory, { force: true, recursive: true });
  }
});

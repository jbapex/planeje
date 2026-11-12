import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';
import { createClient } from '@supabase/supabase-js';
import { createRoutineFixture } from './fixtures/routine.mjs';

const qa = '/tmp/planeje-crm-ui-qa';
const require = createRequire(path.join(qa, 'package.json'));
const React = require('react');
const { act, create } = require('react-test-renderer');
const scratch = await mkdtemp(path.join(qa, 'routine-'));
const files = {
  '@/lib/customSupabaseClient': 'export const supabase = new Proxy({}, {get: (_, key) => globalThis.__routine.db[key]}); export const supabaseUrl="https://fixture.invalid"; export const supabaseAnonKey="fixture-key";',
  '@/contexts/SupabaseAuthContext': 'export const useAuth=()=>({profile:globalThis.__routine.profile,user:{id:globalThis.__routine.profile.id}});',
  '@/components/ui/use-toast': 'export const useToast=()=>({toast:()=>{}});',
  '@/components/ui/dialog': 'export const Dialog=({children})=><div>{children}</div>; export const DialogContent=({children})=><div>{children}</div>; export const DialogTitle=({children})=><h2>{children}</h2>; export const DialogDescription=({children})=><p>{children}</p>; export const DialogHeader=DialogContent; export const DialogFooter=DialogContent;',
  './gestorIaData': 'export const loadGestorMetrics=(_db,opts)=>globalThis.__routine.metrics(opts);',
  '@/components/crm/RastreamentoLeadFicha': 'export default function Ficha({contact,onOpenChange}) {return <div><p>Ficha {contact.sender_name}</p><button onClick={()=>onOpenChange(false)}>Fechar ficha</button></div>}',
};
await build({ stdin: { contents: "export {default as Page} from './src/components/gestor-ia/GestorIaRoutine.jsx'; export {MemoryRouter} from 'react-router-dom'; export {createGestorReads} from './src/components/gestor-ia/gestorIaReads.js';", resolveDir: process.cwd() },
  outfile: path.join(scratch, 'ui.cjs'), bundle: true, format: 'cjs', platform: 'node', jsx: 'automatic',
  external: ['react', 'react/jsx-runtime'], nodePaths: [path.join(qa, 'node_modules')], loader: { '.css': 'empty' },
  plugins: [{ name: 'isolated', setup(builder) {
    builder.onResolve({ filter: /.*/ }, (args) => files[args.path] ? { path: args.path, namespace: 'fixture' } : null);
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, (args) => ({ contents: files[args.path], loader: 'jsx' }));
    builder.onResolve({ filter: /customSupabaseClient/ }, () => ({ path: '@/lib/customSupabaseClient', namespace: 'fixture' }));
    builder.onResolve({ filter: /^@\// }, ({ path: file }) => { const target = path.resolve('src', file.slice(2)); return { path: existsSync(target) ? target : existsSync(target + '.jsx') ? target + '.jsx' : target + '.js' }; });
  } }],
});
const { Page, MemoryRouter, createGestorReads } = require(path.join(scratch, 'ui.cjs'));
const profile = { id: 'person', role: 'colaborador', status: 'active' };
const clients = [{ id: 'client-a', empresa: 'Ateliê fictício', etapa: 'closed', nicho: 'Loja de noivas', metaAccounts: [{ meta_account_id: 'act_fixture_0', meta_account_name: 'Conta fictícia' }], googleAccounts: [] },
  { id: 'client-b', empresa: 'Outro cliente', etapa: 'closed', metaAccounts: [], googleAccounts: [] }];
let fixture;
function reset() {
  const routine = createRoutineFixture(profile, clients);
  const calls = [];
  const data = { ...routine.tables, mini_crm_config: [] };
  const db = createClient('https://fixture.invalid', 'fixture-key', { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: async (input, init = {}) => {
    const url = new URL(input), resource = url.pathname.split('/').at(-1), body = init.body ? JSON.parse(init.body) : null;
    assert.equal(url.hostname, 'fixture.invalid'); calls.push({ url, body });
    if (url.pathname.includes('/rpc/')) {
      if (resource === 'central_trafego_can_access_client') return Response.json(body.p_cliente_id === clients[0].id);
      const result = routine.rpc(resource, body);
      assert.ok(result, resource);
      return Response.json(result.error || result.data, { status: result.error ? 409 : 200 });
    }
    assert.equal(init.method || 'GET', 'GET');
    const matches = (data[resource] || []).filter((row) => [...url.searchParams].every(([key, filter]) => {
      if (filter.startsWith('eq.')) return String(row[key]) === filter.slice(3);
      if (filter.startsWith('in.')) return filter.slice(4, -1).split(',').includes(row[key]);
      return true;
    }));
    const offset = Number(url.searchParams.get('offset') || 0), limit = Number(url.searchParams.get('limit') || 500);
    return Response.json(new Headers(init.headers).get('accept')?.includes('vnd.pgrst.object') ? matches[0] || null : matches.slice(offset, offset + limit));
  } } });
  db.auth.getSession = async () => ({ data: { session: null } });
  db.auth.onAuthStateChange = () => ({ data: { subscription: { unsubscribe() {} } } });
  fixture = globalThis.__routine = { ...routine, profile, db, calls, metricsCalls: [], metrics: async (opts) => {
    fixture.metricsCalls.push(opts);
    return { campaigns: routine.state.reviews[0].campaign_metrics.map((row) => ({ id: row.campaign_id, name: row.campaign_name + ' atualizada', adsets: { data: [{ id: row.adset_id, name: row.adset_name + ' atualizado' }] } })) };
  } };
  data.cliente_whatsapp_contact = routine.contacts;
  return createGestorReads();
}

globalThis.window = new EventTarget();
globalThis.document = new EventTarget();
document.body = { classList: { remove() {} } };
document.querySelectorAll = () => [];
globalThis.localStorage = { getItem: () => null, setItem() {} };
let renderer, checks = 0;
const text = (node) => typeof node === 'string' || typeof node === 'number' ? String(node) : Array.isArray(node) ? node.map(text).join(' ') : node ? text(node.children ?? node.props?.children) : '';
const shown = () => text(renderer.toJSON());
const check = (value, label) => { assert.ok(value, label); checks++; };
const button = (label) => renderer.root.findAllByType('button').find((node) => (node.props['aria-label'] || text(node.props.children).trim().replace(/\s+/g, ' ')) === label);
const press = async (label) => { check(button(label), label); await act(async () => button(label).props.onClick()); };
const change = async (label, value) => { const node = renderer.root.findByProps({ 'aria-label': label }); await act(async () => node.props.onChange({ target: { value } })); };
const tree = (url, store, modules = { paid_traffic: true, rastreamento: true }) => React.createElement(MemoryRouter, { initialEntries: [url] }, React.createElement(Page, { clients, loading: false, profile, modules, canViewField: () => true, readStore: store }));
const open = async (url, store = reset(), modules) => act(async () => { renderer = create(tree(url, store, modules)); });
const unmount = async () => act(async () => renderer.unmount());

try {
  await open('/gestor-ia/rotina?semana=2026-11-02');
  check(shown().includes('Ateliê fictício') && shown().includes('Outro cliente'), 'entrada por cliente');
  await press('Abrir semana de Ateliê fictício');
  check(renderer.root.findByProps({ 'aria-label': 'Campanha, linha 1' }), 'grade original aberta');
  check(!shown().includes('Próximo passo') && !button('Concluir revisão'), 'somente planilha, sem concluir tarefas');
  check(fixture.state.saves.length === 0 && !fixture.state.calls.some(({ name }) => name === 'start_traffic_week_record'), 'abrir não cria nem grava');
  await act(async () => new Promise((resolve) => setTimeout(resolve, 650)));
  check(fixture.state.saves.length === 0, 'catálogo salvo não reescreve nomes nem dispara autosave ao abrir');
  await press('Adicionar linha');
  check(renderer.root.findByProps({ 'aria-label': 'Campanha, linha 7' }), 'adicionar linha mantém a grade editável');
  await change('Gasto R$, linha 1', '250.15');
  await press('Salvar');
  check(fixture.state.saves.at(-1).args === undefined && fixture.state.saves.at(-1).p_review === 'fixture-week-review', 'salva no mesmo registro');
  check(fixture.state.reviews[0].analysis === 'Análise da rotina original preservada.' && fixture.state.reviews[0].data_note === 'Registro da planilha oficial.', 'preserva análise e observações originais');
  check(fixture.state.reviews[0].campaign_metrics[0].spend === 250.15, 'número normalizado no salvamento');
  const all = renderer.root.findByProps({ 'aria-label': 'Selecionar todas as linhas' });
  await act(async () => all.props.onChange());
  await press('Ver agendamentos');
  check(shown().includes('Ana Martins') && !shown().includes('Helena Santos'), 'agendamentos da coorte com data posterior');
  await press('Todos 8');
  check(shown().includes('Helena Santos'), 'todos os leads sem refazer a consulta');
  const callsBefore = fixture.calls.length;
  await press('Agendaram 5');
  check(fixture.calls.length === callsBefore, 'filtro de agendamento usa o resultado carregado');
  await press('Fechar leads da semana');
  check(renderer.root.findByProps({ 'aria-label': 'Gasto R$, linha 1' }).props.value === '250.15', 'painel fecha sem perder a planilha');
  await press('Voltar aos clientes');
  check(shown().includes('516,65'), 'entrada atualiza o total salvo');
  check(fixture.metricsCalls.every((call) => call.refresh !== true) && fixture.calls.every(({ url }) => !url.pathname.includes('/functions/')), 'nenhuma coleta da Meta ao navegar');
  await unmount();

  await open('/gestor-ia/rotina?semana=2026-11-02');
  await press('Abrir semana de Ateliê fictício');
  await change('Gasto R$, linha 1', '333');
  await press('Salvar');
  await press('Semana anterior');
  await change('Campanha, linha 1', 'Semana anterior');
  await change('Gasto R$, linha 1', '77');
  await press('Salvar');
  await press('Voltar aos clientes');
  check(shown().includes('77,00'), 'resumo reflete a semana anterior salva');
  await change('Escolher data da semana', '2026-11-02');
  check(shown().includes('599,50'), 'voltar à semana original não usa resumo anterior ao salvamento');
  fixture.state.reviews[0].campaign_metrics[0].spend = 444;
  await press('Abrir semana de Ateliê fictício');
  await press('Voltar aos clientes');
  check(shown().includes('710,50'), 'alteração na rotina original aparece ao retornar à entrada');
  const settledCalls = fixture.calls.length;
  await act(async () => new Promise((resolve) => setTimeout(resolve, 35)));
  check(fixture.calls.length === settledCalls, 'resumo não mantém um loop de consultas');
  await unmount();

  let store = reset(); fixture.state.readonly = true;
  await open('/gestor-ia/rotina?cliente=client-a&semana=2026-11-02', store);
  check(shown().includes('Somente leitura') && !button('Salvar'), 'can_edit oficial bloqueia edição');
  check(renderer.root.findAllByProps({ 'aria-label': 'Campanha, linha 1' }).length === 0, 'campos não são editáveis');
  check(renderer.root.findByProps({ 'aria-label': 'Selecionar todas as linhas' }), 'consulta ainda seleciona linhas');
  await unmount();

  await open('/gestor-ia/rotina?cliente=client-a&semana=2026-10-26');
  check(!fixture.state.calls.some(({ name }) => name === 'start_traffic_week_record'), 'semana vazia não cria por abrir');
  await change('Campanha, linha 1', 'Campanha nova');
  await change('Gasto R$, linha 1', '45');
  await press('Salvar');
  check(fixture.state.calls.filter(({ name }) => name === 'start_traffic_week_record').length === 1 && fixture.state.saves.length === 1, 'cria somente ao editar e salva uma vez');
  check(fixture.state.saves[0].p_revision === 0 && fixture.state.saves[0].p_finalize === false, 'nova semana usa revisão canônica');
  await unmount();

  await open('/gestor-ia/rotina?cliente=client-a&semana=2026-11-02');
  await change('Gasto R$, linha 1', 'inválido');
  await press('Próxima semana');
  check(shown().includes('Continuar editando') && fixture.state.saves.length === 0, 'número inválido impede saída silenciosa');
  await press('Continuar editando');
  await change('Gasto R$, linha 1', '888');
  fixture.state.reviews[0].revision += 1;
  await press('Salvar');
  check(shown().includes('Outra pessoa') && renderer.root.findByProps({ 'aria-label': 'Gasto R$, linha 1' }).props.value === '888', 'conflito preserva edição local e não sobrescreve');
  fixture.state.fail = 'Teste encerrado';
  await unmount();

  store = reset();
  const sameUrl = '/gestor-ia/rotina?cliente=client-a&semana=2026-11-02';
  await open(sameUrl, store);
  await act(async () => renderer.root.findByProps({ 'aria-label': 'Selecionar todas as linhas' }).props.onChange());
  await press('Ver leads');
  check(shown().includes('Ana Martins'), 'dados carregados antes da revogação');
  await act(async () => renderer.update(tree(sameUrl, store, { paid_traffic: true, rastreamento: false })));
  check(!shown().includes('Ana Martins') && !shown().includes('Leads da semana'), 'revogação desmonta o painel e remove dados pessoais');
  await act(async () => renderer.update(tree(sameUrl, store)));
  check(!shown().includes('Ana Martins'), 'reconcessão não reabre a seleção antiga');
  await unmount();

  store = reset();
  fixture.state.reviews[0].campaign_metrics[0].adset_id = '';
  fixture.state.reviews[0].campaign_metrics[0].adset_name = '';
  await open(sameUrl, store);
  await press('Usar gasto salvo');
  check(shown().includes('números preenchidos') && fixture.state.saves.length === 0, 'gasto manual agregado bloqueia desdobramento e duplicação de indicadores');
  await unmount();

  store = reset();
  fixture.state.reviews[0].campaign_metrics.push({ id: 'google-manual', platform: 'google', account_id: '123', account_name: 'Google', campaign_name: 'Pesquisa manual', spend: '17', messages: '2' });
  await open(sameUrl, store);
  await press('Usar gasto salvo');
  check(!shown().includes('Escolha campanha e conjunto') && shown().includes('leitura salva completa'), 'linha Google manual não bloqueia a leitura salva da Meta');
  check(fixture.state.reviews[0].campaign_metrics.at(-1).spend === '17', 'linha Google preservada');
  await unmount();

  await open('/gestor-ia/rotina?cliente=client-a&semana=2026-11-02', reset(), { paid_traffic: true, rastreamento: false });
  check(!button('Ver leads') && shown().includes('requer acesso ao Rastreamento'), 'sem módulo não oferece consulta dos contatos');
  await unmount();

  store = reset();
  Object.assign(fixture.state.reviews[0], { fill_origin: 'ia', validation_state: 'rascunho_ia', ai_suggestion: 'Conferir os criativos antes de alterar a verba.' });
  fixture.state.history.push({ id: 1, review_id: 'fixture-week-review', event: 'draft', occurred_at: '2026-11-10T12:00:00Z', actor_id: profile.id, actor_type: 'ia', snapshot: { after: structuredClone(fixture.state.reviews[0]) } });
  await open('/gestor-ia/rotina?semana=2026-11-02', store);
  await press('Rascunho da IA');
  check(shown().includes('Ateliê fictício') && !shown().includes('Outro cliente'), 'filtro de rascunho IA no painel');
  await press('Abrir semana de Ateliê fictício');
  check(shown().includes('Preenchido pela IA, aguardando validação') && shown().includes('Conferir os criativos'), 'selo e sugestão visíveis no mesmo editor');
  check(shown().includes('IA (Neuro)'), 'histórico identifica IA e pessoa da sessão');
  const aiAudit = renderer.root.findAllByProps({ className: 'tw-audit' })[0];
  check(text(aiAudit).includes('IA (Neuro)') && text(aiAudit).includes('sugestão da IA'), 'histórico expandido identifica autoria IA e campos alterados');
  check(renderer.root.findByProps({ 'aria-label': 'Análise da revisão' }), 'gestor confere análise sem trocar de tela');
  await press('Validar');
  check(fixture.state.saves.at(-1).p_finalize === true && fixture.state.reviews[0].finalized_by === profile.id, 'Validar usa o salvamento oficial e ator humano');
  check(shown().includes('Validado'), 'painel mostra estado validado');
  await unmount();

  store = reset();
  Object.assign(fixture.state.reviews[0], { fill_origin: 'ia', validation_state: 'rascunho_ia' });
  fixture.state.readonly = true;
  await open(sameUrl, store);
  check(shown().includes('Preenchido pela IA') && !button('Validar'), 'pessoa sem can_edit não valida o rascunho');
  await unmount();

  store = reset();
  fixture.contacts.push({ ...structuredClone(fixture.contacts[0]), id: 'google-lead', sender_name: 'Contato Google', origin_source: 'google_ads' });
  fixture.state.messages.push({ id: 'confirmation', contact_id: fixture.contacts[7].id, text: 'Agendamento confirmado para 20/11 às 14h.', direction: 'equipe', at: '2026-11-10T12:00:00Z' });
  await open(sameUrl, store);
  await act(async () => renderer.root.findByProps({ 'aria-label': 'Selecionar todas as linhas' }).props.onChange());
  await press('Ver leads');
  check(shown().includes('CRM desatualizado') && shown().includes('sem tag no CRM'), 'conversa confirmada gera alerta separado');
  check(shown().includes('•••• 0000') && !shown().includes(fixture.contacts[0].phone), 'lista mascara telefones');
  check(!fixture.calls.some(({ url }) => url.pathname.endsWith('/cliente_whatsapp_contact')), 'lista não abre contato completo');
  await press('Sem vínculo Meta 1');
  check(shown().includes('Contato Google') && !shown().includes('Ana Martins'), 'Google separado sem esconder cobertura');
  await press('Vinculados 8');
  const ana = renderer.root.findAllByType('button').find(node => text(node.props.children).includes('Ana Martins'));
  await act(async () => ana.props.onClick());
  check(/Ficha\s+Ana Martins/.test(shown()), 'ficha autorizada abre só ao escolher contato');
  check(fixture.calls.some(({ url }) => url.pathname.endsWith('/cliente_whatsapp_contact') && url.searchParams.get('id') === 'eq.fixture-routine-lead-0'), 'número completo consultado só na abertura da ficha');
  await unmount();
  console.log(`${checks} verificações React da rotina passaram.`);
} finally {
  if (renderer) await act(async () => renderer.unmount());
  await rm(scratch, { recursive: true, force: true });
}

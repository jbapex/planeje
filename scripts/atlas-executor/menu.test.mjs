import assert from 'node:assert/strict';
import { after, afterEach, beforeEach, test } from 'node:test';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';

const qa = '/tmp/planeje-crm-ui-qa';
const require = createRequire(path.join(qa, 'package.json'));
const React = require('react');
const { act, create } = require('react-test-renderer');
const scratch = await mkdtemp(path.join(qa, 'atlas-menu-'));
const root = process.cwd();
const box = "import React from 'react';const Box=({children})=>React.createElement('div',null,children);";
const fixtures = {
  '@/contexts/SupabaseAuthContext': 'export const useAuth=()=>globalThis.__atlasMenu.auth;',
  '@/contexts/ModuleSettingsContext': 'export const useModuleSettings=()=>({moduleSettings:globalThis.__atlasMenu.modules,loading:false});',
  '@/lib/customSupabaseClient': `export const supabase={from(table){if(table!=='atlas_settings')throw new Error('Unexpected database read: '+table);const query={select(){return query},eq(){return query},maybeSingle(){return Promise.resolve({data:{owner_id:globalThis.__atlasMenu.auth.user?.id,enabled:globalThis.__atlasMenu.atlasEnabled}})}};return query}};`,
  '@/components/atlas/useAtlasInbox': 'export default ()=>({unread:0});',
  '@/hooks/useAtendimentoSidebarBadge': 'export const useAtendimentoSidebarBadge=()=>({badgeTotal:0});',
  '@/hooks/useCaixaPendencias': 'export const useCaixaPendenciasBadge=()=>({badgeTotal:0});',
  '@/hooks/useAtendimentoLembreteNotifications': 'export const useAtendimentoLembreteNotifications=()=>({items:[]});',
  '@/hooks/usePlanejeTheme': "export default ()=>({theme:'light',toggleTheme(){}});",
  '@/contexts/AtendimentoFavoritosContext': box + 'export const AtendimentoFavoritosProvider=Box;export const AtendimentoFavoritosGlobalRail=()=>null;',
  '@/components/ui/tooltip-custom': box + 'export const TooltipCustom=Box;',
  '@/components/ui/accordion': box + 'export const Accordion=Box,AccordionContent=Box,AccordionItem=Box,AccordionTrigger=Box;',
  '@/components/ui/dropdown-menu': box + 'export const DropdownMenu=Box,DropdownMenuContent=Box,DropdownMenuItem=Box,DropdownMenuLabel=Box,DropdownMenuSeparator=Box,DropdownMenuTrigger=Box;',
  '@/components/ui/avatar': box + 'export const Avatar=Box,AvatarFallback=Box,AvatarImage=()=>null;',
  '@/components/ui/dialog': box + 'export const Dialog=Box,DialogContent=Box,DialogDescription=Box,DialogTitle=Box,DialogTrigger=Box;',
};
for (const component of [
  'layout/Header', 'layout/BottomNav', 'layout/CommandPalette', 'layout/SidebarNotificationsMenu',
  'atlas/AtlasTeamAssistant', 'tasks/TaskStatusAlertsBridge', 'caixa/CaixaPendenciasAlertsBridge',
  'atendimento/AtendimentoLembreteToastStack', 'atendimento/AtendimentoMessageAlertsBridge',
  'atendimento/AtendimentoCanalDesconectadoBanner', 'atendimento/AtendimentoEsperaPopup',
]) fixtures['@/components/' + component] = 'export default ()=>null;';

await build({
  stdin: { contents: `export {default as MainLayout} from './src/components/layout/MainLayout.jsx';
export {default as Sidebar} from './src/components/layout/Sidebar.jsx';
export {default as BottomNav} from './src/components/layout/BottomNav.jsx';
export {default as GestorIaSidebar} from './src/components/gestor-ia/GestorIaSidebar.jsx';
export {default as AtlasAgentMark} from './src/components/atlas/AtlasAgentMark.jsx';
export {default as AtlasConversationNav} from './src/components/atlas/AtlasConversationNav.jsx';
export {MemoryRouter} from 'react-router-dom';`, resolveDir: root },
  outfile: path.join(scratch, 'menu.cjs'), bundle: true, format: 'cjs', platform: 'node',
  external: ['react'], loader: { '.png': 'file', '.jpg': 'file', '.css': 'empty' },
  define: { 'import.meta.env': '{}' },
  plugins: [{ name: 'offline-menu', setup(builder) {
    builder.onResolve({ filter: /.*/ }, args => fixtures[args.path] ? { path: args.path, namespace: 'fixture' } : null);
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: fixtures[args.path], loader: 'jsx' }));
    builder.onResolve({ filter: /^@\// }, args => {
      const file = path.join(root, 'src', args.path.slice(2));
      return { path: existsSync(file) ? file : existsSync(file + '.jsx') ? file + '.jsx' : file + '.js' };
    });
  } }],
});
const { MainLayout, Sidebar, BottomNav, GestorIaSidebar, AtlasAgentMark, AtlasConversationNav, MemoryRouter } = require(path.join(scratch, 'menu.cjs'));
let mounted = [];
let storage;
beforeEach(() => {
  storage = new Map();
  globalThis.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
  globalThis.window = { localStorage, matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }), addEventListener() {}, removeEventListener() {} };
  globalThis.document = { hidden: false, addEventListener() {}, removeEventListener() {} };
  globalThis.__atlasMenu = {
    auth: { user: { id: 'owner-fixture' }, profile: { id: 'owner-fixture', status: 'active', role: 'admin', full_name: 'Operador fictício' }, signOut() {} },
    modules: { assistant: true, crm: true, clients: true, atendimento: true, paid_traffic: true }, atlasEnabled: true,
  };
});
afterEach(async () => { for (const renderer of mounted) await act(async () => renderer.unmount()); mounted = []; });
after(async () => { delete globalThis.__atlasMenu; delete globalThis.window; delete globalThis.document; delete globalThis.localStorage; await rm(scratch, { recursive: true, force: true }); });
const text = value => typeof value === 'string' ? value : Array.isArray(value) ? value.map(text).join('') : value ? text(value.children) : '';
async function mount(Component, props = {}, route = '/assistant/atlas?view=conversation') {
  let renderer;
  await act(async () => { renderer = create(React.createElement(MemoryRouter, { initialEntries: [route], future: { v7_startTransition: true, v7_relativeSplatPath: true } }, React.createElement(Component, props))); });
  mounted.push(renderer);
  return renderer;
}
const links = renderer => renderer.root.findAllByType('a');
const conversationLink = renderer => links(renderer).find(link => link.props.href === '/assistant/atlas?view=conversation');

test('mobile Squad keeps the gated Conversar avatar and highlights the active chat route', async () => {
  const renderer = await mount(BottomNav);
  const link = conversationLink(renderer);
  assert.ok(link);
  assert.equal(link.props['aria-current'], 'page');
  assert.ok(link.findAllByType('img').some(img => img.props.src.includes('atlas-avatar-3d-v1')));
  globalThis.__atlasMenu.atlasEnabled = false;
  const denied = await mount(BottomNav);
  assert.equal(conversationLink(denied), undefined);
});
const click = async node => { assert.ok(node, 'Expected an available control'); await act(async () => node.props.onClick()); };

test('Conversar preserves the standard Planeje menu in the workspace layout', async () => {
  const renderer = await mount(MainLayout);
  assert.ok(renderer.root.findAllByProps({ 'aria-label': 'Menu principal' }).length, 'Planeje menu is missing on Conversar');
  assert.ok(links(renderer).some(link => link.props.href === '/caixa'));
});

test('root Squad exposes Conversar with Atlas avatar only for an enabled owner', async () => {
  const renderer = await mount(Sidebar);
  const link = conversationLink(renderer);
  assert.ok(link, 'Conversar entry is missing from root Squad');
  assert.match(link.findByType('img').props.src, /atlas-avatar-3d-v1/);
  assert.equal(link.props['aria-current'], 'page');
  for (const denied of ['module', 'owner', 'session']) {
    if (denied === 'module') __atlasMenu.modules.assistant = false;
    if (denied === 'owner') { __atlasMenu.modules.assistant = true; __atlasMenu.atlasEnabled = false; }
    if (denied === 'session') { __atlasMenu.atlasEnabled = true; __atlasMenu.auth.user = null; }
    assert.equal(conversationLink(await mount(Sidebar)), undefined, denied);
  }
});

test('Squad preserves each module access gate and uses Atlas avatar in shared module menus', async () => {
  const props = { tabs: [], activeTab: 'metricas', profileName: 'Operador fictício' };
  for (const Component of [Sidebar, GestorIaSidebar]) {
    const renderer = await mount(Component, props);
    const link = conversationLink(renderer);
    assert.ok(link, 'Conversar must be available in both Squad menus');
    assert.match(link.findByType('img').props.src, /atlas-avatar-3d-v1/);
    for (const route of ['/crm-ia/painel', '/cs-ia/hoje', '/gestor-ia/metricas']) assert.ok(links(renderer).some(link => link.props.href === route));
    for (const [module, deniedRoute] of [['crm', '/crm-ia/painel'], ['clients', '/cs-ia/hoje'], ['paid_traffic', '/gestor-ia/metricas']]) {
      __atlasMenu.modules[module] = false;
      const limited = await mount(Component, props);
      for (const route of ['/crm-ia/painel', '/cs-ia/hoje', '/gestor-ia/metricas']) {
        assert.equal(links(limited).some(item => item.props.href === route), route !== deniedRoute, `${module}: ${route}`);
      }
      __atlasMenu.modules[module] = true;
    }
    __atlasMenu.modules = { assistant: false };
    const denied = await mount(Component, props);
    assert.equal(conversationLink(denied), undefined);
    for (const route of ['/crm-ia/painel', '/cs-ia/hoje', '/gestor-ia/metricas']) assert.ok(!links(denied).some(link => link.props.href === route));
    __atlasMenu.modules = { assistant: true, crm: true, clients: true, atendimento: true, paid_traffic: true };
  }
});

test('delegation marks use native CRM, CS and Gestor avatars while preserving legacy specialists', async () => {
  for (const [agentId, expected] of [['crm', 'crm-ia-avatar-v1'], ['cs', 'cs-ia-avatar-v1'], ['gestor', 'gestor-ia-avatar']]) {
    const renderer = await mount(AtlasAgentMark, { agentId, avatar: '/atlas-fallback.png' });
    assert.ok(renderer.root.findByType('img').props.src.includes(expected), `${agentId} must use its native avatar`);
  }
  const legacy = await mount(AtlasAgentMark, { agentId: 'clientes', avatar: '/atlas-fallback.png' });
  assert.ok(legacy.root.findAllByType('svg').length);
  const atlas = await mount(AtlasAgentMark, { agentId: 'central', avatar: '/atlas-fallback.png' });
  assert.equal(atlas.root.findByType('img').props.src, '/atlas-fallback.png');
});

const historyProps = () => ({
  atlas: { conversationId: 'one', base: { conversations: [{ id: 'one', title: 'Revisão fictícia', updated_at: '2026-11-12T12:00:00Z' }], agents: [] } },
  avatar: '/atlas-fallback.png', ownerId: 'owner-fixture', tab: 'conversation',
  onTab() {}, onNew() {}, onOpen() {}, onAgent() {}, inboxCount: 1,
  squadLinks: [['/crm-ia/painel', 'CRM IA', () => null]],
});
test('history rail keeps Atlas sections without duplicating product navigation', async () => {
  const renderer = await mount(AtlasConversationNav, historyProps());
  assert.equal(renderer.root.findByType('aside').props['aria-label'], 'Histórico do Atlas');
  assert.ok(!links(renderer).some(link => ['/caixa', '/crm-ia/painel', '/assistant'].includes(link.props.href)));
  for (const label of ['Conversa', 'Missões', 'Memória']) assert.ok(renderer.root.findByProps({ 'aria-label': label }));
  assert.ok(links(renderer).some(link => link.props.href === '/assistant/atlas'));
});

test('history favorites, archive, search, opening and new conversation survive the menu change', async () => {
  const props = historyProps();
  const opened = []; let created = 0;
  props.onOpen = id => opened.push(id); props.onNew = () => created++;
  const renderer = await mount(AtlasConversationNav, props);
  const button = label => renderer.root.findAllByType('button').find(node => text(node.props.children) === label);
  await click(renderer.root.findByProps({ 'aria-label': 'Favoritar Revisão fictícia' }));
  await click(button('Favoritas'));
  assert.ok(renderer.root.findByProps({ 'aria-label': 'Revisão fictícia' }));
  await click(renderer.root.findByProps({ 'aria-label': 'Arquivar Revisão fictícia' }));
  assert.ok(text(renderer.toJSON()).includes('Nenhuma conversa favorita.'));
  await click(button('Arquivadas'));
  await act(async () => renderer.root.findByType('input').props.onChange({ target: { value: 'revisao' } }));
  await click(renderer.root.findByProps({ 'aria-label': 'Revisão fictícia' }));
  assert.deepEqual(opened, ['one']);
  const restored = await mount(AtlasConversationNav, props);
  await click(restored.root.findAllByType('button').find(node => text(node.props.children) === 'Arquivadas'));
  assert.ok(restored.root.findByProps({ 'aria-label': 'Restaurar Revisão fictícia' }));
  await click(renderer.root.findByProps({ 'aria-label': 'Nova conversa' }));
  assert.equal(created, 1);
});

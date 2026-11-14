import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test, { after } from 'node:test';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire('/tmp/planeje-crm-ui-qa/package.json');
const React = require('react');
const { act, create } = require('react-test-renderer');
const scratch = await mkdtemp(path.join(tmpdir(), 'planeje-menu-history-'));
const outfile = path.join(scratch, 'menu.cjs');
const fixture = `
export function useAuth() { return { profile: { id: 'fixture-user', role: 'admin', status: 'active', full_name: 'Equipe fictícia' }, signOut() {} }; }
export function useModuleSettings() { return { loading: false, moduleSettings: Object.fromEntries(['atendimento','dashboard','clients','financeiro','projects','tasks','assistant','onboarding','automacoes','requests','social_media','paid_traffic','rastreamento','mini_crm','crm','reports','client_area'].map(id => [id, true])) }; }
export function useAtendimentoSidebarBadge() { return { badgeTotal: 0 }; }
export function useCaixaPendenciasBadge() { return { badgeTotal: 0 }; }
`;
await build({
  stdin: { contents: `export {default as Sidebar} from './src/components/layout/Sidebar.jsx'; export {default as BottomNav} from './src/components/layout/BottomNav.jsx'; export {MemoryRouter, useNavigate} from 'react-router-dom';`, resolveDir: root },
  bundle: true, platform: 'node', format: 'cjs', outfile,
  loader: { '.css': 'empty', '.png': 'dataurl', '.jpg': 'dataurl' },
  plugins: [{ name: 'isolated-menu-history', setup(b) {
    b.onResolve({ filter: /^react$/ }, () => ({ path: require.resolve('react'), external: true }));
    b.onResolve({ filter: /^@\// }, async ({ path: name }) => {
      if (['@/contexts/SupabaseAuthContext', '@/contexts/ModuleSettingsContext', '@/lib/customSupabaseClient', '@/hooks/useAtendimentoSidebarBadge', '@/hooks/useCaixaPendencias', '@/components/atlas/useAtlasInbox', '@/components/layout/SidebarNotificationsMenu', '@/hooks/usePlanejeTheme', '@/components/ui/dialog', '@/components/ui/dropdown-menu'].includes(name)) return { path: name, namespace: 'fixture' };
      const file = path.join(root, 'src', name.slice(2));
      for (const ext of ['', '.jsx', '.js']) { try { await access(file + ext); return { path: file + ext }; } catch {} }
      throw new Error('Alias indisponível: ' + name);
    });
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path: name }) => {
      if (name === '@/lib/customSupabaseClient') return { contents: 'export const supabase={from(){throw new Error("Consulta inesperada no teste de histórico do menu.")}};' };
      if (name === '@/components/atlas/useAtlasInbox') return { contents: 'export default function useAtlasInbox() { return { unread: 0 }; }' };
      if (name === '@/components/layout/SidebarNotificationsMenu') return { contents: 'export default function Notifications() { return null; }' };
      if (name === '@/hooks/usePlanejeTheme') return { contents: "export default function useTheme() { return { theme: 'light', toggleTheme() {} }; }" };
      // O renderer não monta portais; o teste cobre o estado de navegação, não o foco do Dialog.
      if (name === '@/components/ui/dialog') return { contents: "export const Dialog = ({children}) => children; export const DialogContent = Dialog, DialogDescription = Dialog, DialogTitle = Dialog, DialogTrigger = Dialog;" };
      if (name === '@/components/ui/dropdown-menu') return { contents: "export const DropdownMenu = ({children}) => children; export const DropdownMenuTrigger = DropdownMenu, DropdownMenuLabel = DropdownMenu, DropdownMenuItem = DropdownMenu, DropdownMenuSeparator = () => null, DropdownMenuContent = () => null;" };
      return { contents: fixture };
    });
  } }],
});
const app = require(outfile);
const previous = { window: globalThis.window, localStorage: globalThis.localStorage, fetch: globalThis.fetch, requestAnimationFrame: globalThis.requestAnimationFrame, cancelAnimationFrame: globalThis.cancelAnimationFrame };
globalThis.localStorage = { getItem: () => 'true', setItem() {} };
globalThis.window = { addEventListener() {}, removeEventListener() {}, Image: class { addEventListener() {} removeEventListener() {} } };
globalThis.requestAnimationFrame = callback => setTimeout(callback, 0);
globalThis.cancelAnimationFrame = clearTimeout;
globalThis.fetch = async () => { throw new Error('Rede externa negada no teste de navegação.'); };
after(async () => {
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete globalThis[key];
    else globalThis[key] = value;
  }
  await rm(scratch, { recursive: true, force: true });
});
const text = node => typeof node === 'string' ? node : Array.isArray(node) ? node.map(text).join('') : node ? text(node.children) : '';
const trigger = (renderer, label) => renderer.root.findAllByType('button').find(node => (node.props['aria-label'] || text(node)) === label);

for (const surface of ['Sidebar', 'BottomNav']) {
  test(`${surface}: Voltar e Avançar abrem a categoria atual após seleção manual em outra página`, async () => {
    let navigate, renderer;
    function Harness() { navigate = app.useNavigate(); return React.createElement(app[surface]); }
    await act(async () => {
      renderer = create(React.createElement(app.MemoryRouter, { initialEntries: ['/projects'], future: { v7_startTransition: true, v7_relativeSplatPath: true } }, React.createElement(Harness)));
    });
    try {
      assert.equal(trigger(renderer, 'Operação').props['aria-expanded'], true);
      await act(async () => trigger(renderer, 'Marketing').props.onClick({ defaultPrevented: false }));
      assert.equal(trigger(renderer, 'Marketing').props['aria-expanded'], true);
      await act(async () => navigate('/paid-traffic/dashboard'));
      await act(async () => navigate(-1));
      assert.equal(trigger(renderer, 'Operação').props['aria-expanded'], true, 'Voltar deve abrir a categoria de Projetos, não reutilizar Marketing.');
      assert.equal(trigger(renderer, 'Marketing').props['aria-expanded'], false);
      await act(async () => navigate(1));
      assert.equal(trigger(renderer, 'Marketing').props['aria-expanded'], true);
      await act(async () => navigate(-1));
      await act(async () => trigger(renderer, 'Operação').props.onClick({ defaultPrevented: false }));
      assert.equal(trigger(renderer, 'Operação').props['aria-expanded'], false);
      await act(async () => navigate('/clients'));
      await act(async () => navigate(-1));
      assert.equal(trigger(renderer, 'Operação').props['aria-expanded'], true, 'Uma categoria fechada manualmente reabre ao voltar para sua página.');
      await act(async () => trigger(renderer, 'Marketing').props.onClick({ defaultPrevented: false }));
      const traffic = renderer.root.findAllByType('a').find(node => node.props.href === '/paid-traffic/dashboard');
      await act(async () => {
        traffic.props.onClick({ button: 0, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } });
        navigate(-1);
      });
      assert.equal(trigger(renderer, 'Operação').props['aria-expanded'], true, 'Um retorno imediato antes do próximo render também descarta a seleção manual.');
    } finally { await act(async () => renderer.unmount()); }
  });
}

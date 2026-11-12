import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs/promises';
import test, { after } from 'node:test';
import { build } from 'esbuild';

const root = new URL('../../', import.meta.url).pathname;
const require = createRequire('/tmp/planeje-crm-ui-qa/package.json');
const React = require('react'), { act, create } = require('react-test-renderer');
const session = path.join(root, 'scripts/crm-ia/preview/session.js');
const scratch = await fs.mkdtemp('/tmp/planeje-crm-ui-qa/crm-shell-');
const outfile = path.join(scratch, 'shell.cjs');
await build({ stdin: { contents: `export {default as Workspace} from ${JSON.stringify(path.join(root, 'src/components/crm-ia/CrmIaWorkspace.jsx'))};export {MemoryRouter} from 'react-router-dom';export {supabase} from ${JSON.stringify(session)};`, resolveDir: root },
  bundle: true, platform: 'node', format: 'cjs', outfile, loader: { '.css': 'empty', '.png': 'dataurl', '.jpg': 'dataurl' }, define: { 'import.meta.env': '{}' },
  plugins: [{ name: 'isolated-workspace', setup(b) {
    b.onResolve({ filter: /^react$/ }, () => ({ path: require.resolve('react'), external: true }));
    b.onResolve({ filter: /^@\// }, async ({ path: name }) => {
      if (['@/contexts/SupabaseAuthContext', '@/contexts/ModuleSettingsContext', '@/lib/customSupabaseClient', '@/lib/supabaseFunctions', '@/components/AtlasEntry'].includes(name)) return { path: session };
      const file = path.join(root, 'src', name.slice(2));
      for (const ext of ['', '.jsx', '.js']) { try { await fs.access(file + ext); return { path: file + ext }; } catch {} }
      throw new Error('Alias indisponível: ' + name);
    });
  } }],
});
const previousFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error('Rede externa negada na interface sintética.'); };
after(async () => { globalThis.fetch = previousFetch; await fs.rm(scratch, { recursive: true, force: true }); });
const bundle = await fs.realpath(outfile);
const A = '11111111-1111-4111-8111-111111111111', B = '22222222-2222-4222-8222-222222222222';
const text = n => typeof n === 'string' ? n : Array.isArray(n) ? n.map(text).join(' ') : n ? text(n.children ?? n.props?.children) : '';
function fresh() { delete require.cache[bundle]; return require(bundle); }
async function mount(app, client = A) {
  let r;
  await act(async () => { r = create(React.createElement(app.MemoryRouter, { initialEntries: [`/crm-ia/painel${client ? '?cliente=' + client : ''}`], future: { v7_startTransition: true, v7_relativeSplatPath: true } }, React.createElement(app.Workspace))); });
  return r;
}
const picker = r => r.root.findAllByType('select').find(n => n.parent?.props.className === 'crm-ia-account-picker');
function assertHeader(r, id, disabled = false) {
  const headers = r.root.findAllByType('header').filter(n => n.props.className?.split(' ').includes('crm-ia-workspace-header'));
  assert.equal(headers.length, 1); assert.equal(headers[0].findAllByType('h1').length, 1);
  assert.equal(headers[0].findAllByType('select').length, 1);
  assert.equal(picker(r).props.value, id); assert.equal(picker(r).props.disabled, disabled);
}
const choose = (r, id) => act(async () => picker(r).props.onChange({ target: { value: id } }));
const unmount = r => act(async () => r.unmount());

test('conta carregada tem um título e um seletor no cabeçalho persistente', async () => {
  const r = await mount(fresh());
  try { assertHeader(r, A); assert.equal(r.root.findAllByType('h1').length, 1); }
  finally { await unmount(r); }
});
test('carga do bootstrap preserva o mesmo seletor e só o habilita após conhecer as contas', async () => {
  const app = fresh(), original = app.supabase.rpc; let complete;
  app.supabase.rpc = (name, args) => args?.p_action === 'bootstrap' ? new Promise(resolve => { complete = () => original(name, args).then(resolve); }) : original(name, args);
  const r = await mount(app);
  try {
    assertHeader(r, '', true); const initial = picker(r); assert.match(text(r.toJSON()), /Carregando suas contas/);
    await act(async () => complete()); assertHeader(r, A); assert.equal(picker(r), initial);
  } finally { await unmount(r); }
});
test('falha da conta A permite escolher B sem conteúdo ou erro antigos', async () => {
  const app = fresh(), original = app.supabase.rpc;
  app.supabase.rpc = (name, args) => args?.p_action === 'workspace' && args.p_client_id === A ? Promise.resolve({ data: null, error: { message: 'Falha sintética A' } }) : original(name, args);
  const r = await mount(app);
  try { assertHeader(r, A); assert.match(text(r.toJSON()), /Falha sintética A/); await choose(r, B); assertHeader(r, B); assert.doesNotMatch(text(r.toJSON()), /Falha sintética A/); }
  finally { await unmount(r); }
});
test('resposta atrasada de A não substitui a conta B atual', async () => {
  const app = fresh(), original = app.supabase.rpc; let complete;
  app.supabase.rpc = (name, args) => args?.p_action === 'workspace' && args.p_client_id === A ? new Promise(resolve => { complete = () => original(name, args).then(resolve); }) : original(name, args);
  const r = await mount(app);
  try { assertHeader(r, A); await choose(r, B); assertHeader(r, B); await act(async () => complete()); assertHeader(r, B); }
  finally { await unmount(r); }
});
test('conta ausente da lista não aparece selecionada e permite recuperação', async () => {
  const r = await mount(fresh(), '99999999-9999-4999-8999-999999999999');
  try { assertHeader(r, ''); assert.match(text(r.toJSON()), /Esta conta não está disponível/); await choose(r, B); assertHeader(r, B); }
  finally { await unmount(r); }
});
test('escolha inicial abre a conta no mesmo cabeçalho', async () => {
  const r = await mount(fresh(), '');
  try { assertHeader(r, ''); assert.match(text(r.toJSON()), /Suas contas/); await choose(r, A); assertHeader(r, A); }
  finally { await unmount(r); }
});
test('troca de conta mantém a identidade do seletor durante carga e confirmação', async () => {
  const app = fresh(), r = await mount(app), initial = picker(r), original = app.supabase.rpc; let complete;
  app.supabase.rpc = (name, args) => args?.p_action === 'workspace' && args.p_client_id === B ? new Promise(resolve => { complete = () => original(name, args).then(resolve); }) : original(name, args);
  try {
    await choose(r, B); assert.ok(picker(r) === initial, 'O seletor precisa permanecer montado durante a troca de conta.'); assertHeader(r, B);
    assert.equal(r.root.findAllByProps({ className: 'crm-ia-content' }).length, 0);
    await act(async () => complete()); assertHeader(r, B); assert.equal(picker(r), initial);
    assert.equal(r.root.findAllByProps({ className: 'crm-ia-content' }).length, 1);
  } finally { await unmount(r); }
});

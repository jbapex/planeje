import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createRequire } from 'node:module';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';
import { createClient } from '@supabase/supabase-js';

const qa = '/tmp/planeje-crm-ui-qa', require = createRequire(path.join(qa, 'package.json'));
const React = require('react'), { act, create } = require('react-test-renderer');
const scratch = await mkdtemp(path.join(qa, 'link-attribution-'));
const source = await readFile('src/components/crm/RastreamentoTrackableLinks.jsx', 'utf8');
const stubs = {
  '@/lib/customSupabaseClient': 'export const supabase={from:(...args)=>globalThis.__links.db.from(...args)};',
  '@/components/ui/use-toast': 'export const useToast=()=>({toast:globalThis.__links.toast});',
  '@/components/ui/dialog': 'export const Dialog=({open,children})=>open?<section>{children}</section>:null; export const DialogContent=({children})=><div>{children}</div>; export const DialogTitle=({children})=><h2>{children}</h2>; export const DialogDescription=({children})=><p>{children}</p>; export const DialogHeader=DialogContent;',
  '@/components/crm/RastreamentoUi': 'export const RastreamentoHelp=({children})=><span>{children}</span>;',
};
await build({ stdin: { contents: source + '\nexport { LinkFormModal };', resolveDir: path.resolve('src/components/crm'), sourcefile: 'RastreamentoTrackableLinks.jsx', loader: 'jsx' },
  outfile: path.join(scratch, 'ui.cjs'), bundle: true, format: 'cjs', platform: 'node', jsx: 'automatic', external: ['react', 'react/jsx-runtime'], nodePaths: [path.join(qa, 'node_modules')], loader: { '.css': 'empty' },
  plugins: [{ name: 'fixture', setup(builder) {
    builder.onResolve({ filter: /.*/ }, ({ path }) => stubs[path] ? { path, namespace: 'fixture' } : null);
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({ contents: stubs[path], loader: 'jsx' }));
    builder.onResolve({ filter: /^@\// }, ({ path: file }) => { const target = path.resolve('src', file.slice(2)); return { path: existsSync(target) ? target : existsSync(target + '.jsx') ? target + '.jsx' : target + '.js' }; });
  } }], logLevel: 'silent',
});
const { default: Links, LinkFormModal } = require(path.join(scratch, 'ui.cjs'));
const client = '00000000-0000-4000-8000-000000000001';
const link = { id: '00000000-0000-4000-8000-000000000002', cliente_id: client, slug: 'fixture', label: 'Link fictício', destination_phone: '5511000000001', default_origin: 'meta_ads',
  is_active: true, is_default: true, whatsapp_config_id: null, initial_message: 'Mensagem fictícia de teste', campaign_id: '10001', campaign_name: 'Campanha fictícia', adset_id: '20001', adset_name: 'Conjunto fictício' };
const fields = ['campaign_id', 'campaign_name', 'adset_id', 'adset_name'];
let renderer;
globalThis.window = { location: { origin: 'https://fixture.invalid' }, confirm: () => true, setTimeout };
after(async () => { if (renderer) await act(async () => renderer.unmount()); await rm(scratch, { recursive: true, force: true }); delete globalThis.__links; });

function reset(rows = []) {
  const calls = [], writes = [], state = structuredClone(rows);
  globalThis.__links = { toast() {}, db: createClient('https://fixture.invalid', 'fixture-key', { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: async (input, init = {}) => {
    const url = new URL(input), table = url.pathname.split('/').at(-1), method = init.method || 'GET';
    assert.equal(url.hostname, 'fixture.invalid'); calls.push({ url, method });
    if (table !== 'cliente_rastreamento_links') return Response.json([]);
    assert.equal(url.searchParams.get('cliente_id') || method, method === 'POST' ? 'POST' : `eq.${client}`);
    if (method === 'GET') {
      const columns = url.searchParams.get('select').replaceAll(' ', '').split(',');
      return Response.json(state.filter((row) => row.cliente_id === client).map((row) => Object.fromEntries(columns.map((key) => [key, row[key]]))));
    }
    const body = JSON.parse(init.body); writes.push({ method, body, url });
    if (method === 'POST') state.push({ ...body, id: '00000000-0000-4000-8000-000000000003' });
    if (method === 'PATCH') state.filter((row) => `eq.${row.id}` === url.searchParams.get('id') && row.cliente_id === client).forEach((row) => Object.assign(row, body));
    return Response.json(null, { status: 201 });
  } } }) };
  return { calls, writes, state };
}
const text = (node) => typeof node === 'string' ? node : Array.isArray(node) ? node.map(text).join(' ') : node ? text(node.children ?? node.props?.children) : '';
const input = (name) => renderer.root.findByProps({ name });
const change = async (name, value) => act(async () => input(name).props.onChange({ target: { value } }));
const submit = async () => act(async () => { renderer.root.findByType('form').props.onSubmit({ preventDefault() {} }); await new Promise(setImmediate); });
const close = async () => { await act(async () => renderer.unmount()); renderer = null; };

test('formulário real expõe quatro campos opcionais acessíveis, valida e reseta ao trocar link', async () => {
  reset(); const saved = [];
  const props = { mode: 'edit', link, destinations: [], pending: '', probing: false, onSubmit: (payload) => saved.push(payload), onCancel() {} };
  await act(async () => { renderer = create(React.createElement(LinkFormModal, props)); });
  assert.equal(text(renderer.root.findByType('summary')), 'Campanha e conjunto (opcional)');
  for (const field of fields) { assert.equal(input(field).props.value, link[field]); assert.ok(input(field).props['aria-label']); }
  assert.equal(input('campaign_id').props.inputMode, 'numeric');
  assert.equal(input('campaign_name').props.maxLength, 500);
  for (const field of fields) await change(field, '');
  await submit();
  for (const field of fields) assert.equal(saved[0][field], null);
  await change('campaign_id', 'not-an-id'); await submit(); assert.equal(saved.length, 1);
  await act(async () => renderer.update(React.createElement(LinkFormModal, { ...props, link: { ...link, campaign_id: '10002' } })));
  assert.equal(input('campaign_id').props.value, '10002');
  await act(async () => renderer.update(React.createElement(LinkFormModal, { ...props, mode: 'create', link: null })));
  for (const field of fields) assert.equal(input(field).props.value, '');
  await close();
});

test('criar usa formulário existente e grava quatro campos; novo modal começa vazio', async () => {
  const fixture = reset();
  await act(async () => { renderer = create(React.createElement(Links, { clienteId: client })); });
  const newButton = () => renderer.root.findAllByType('button').find((node) => text(node).trim() === 'Novo link');
  await act(async () => newButton().props.onClick());
  const phone = renderer.root.findByProps({ placeholder: '5541999998888' });
  await act(async () => phone.props.onChange({ target: { value: '5511000000001' } }));
  for (const field of fields) await change(field, link[field]);
  await submit();
  const inserted = fixture.writes.find(({ method }) => method === 'POST');
  assert.equal(inserted.body.cliente_id, client);
  for (const field of fields) assert.equal(inserted.body[field], link[field]);
  await act(async () => newButton().props.onClick());
  for (const field of fields) assert.equal(input(field).props.value, '');
  await close();
});

test('editar carrega valores do SELECT, limpa com null e restringe update por id e cliente', async () => {
  const fixture = reset([link, { ...link, id: 'foreign', cliente_id: 'other-client', campaign_id: '99999' }]);
  await act(async () => { renderer = create(React.createElement(Links, { clienteId: client })); });
  await act(async () => renderer.root.findByProps({ title: 'Editar' }).props.onClick());
  for (const field of fields) { assert.equal(input(field).props.value, link[field]); await change(field, ''); }
  await submit();
  const updated = fixture.writes.find(({ method }) => method === 'PATCH');
  assert.equal(updated.url.searchParams.get('id'), `eq.${link.id}`);
  assert.equal(updated.url.searchParams.get('cliente_id'), `eq.${client}`);
  for (const field of fields) assert.equal(updated.body[field], null);
  assert.equal(fixture.state.find((row) => row.id === 'foreign').campaign_id, '99999');
  await close();
});

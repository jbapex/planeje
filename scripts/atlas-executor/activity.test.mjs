import assert from 'node:assert/strict';
import { after, afterEach, test } from 'node:test';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';

const qa = '/tmp/planeje-crm-ui-qa';
const require = createRequire(path.join(qa, 'package.json'));
const React = require('react'); const { act, create } = require('react-test-renderer');
const scratch = await mkdtemp(path.join(qa, 'atlas-activity-'));
const root = process.cwd();
await build({ entryPoints: ['src/components/atlas/AtlasExecutorActivity.jsx'], outfile: path.join(scratch, 'activity.cjs'),
  bundle: true, format: 'cjs', platform: 'node', external: ['react'], loader: { '.css': 'empty', '.png': 'file', '.jpg': 'file' },
  plugins: [{ name: 'source-alias', setup(builder) {
    builder.onResolve({ filter: /^@\// }, args => {
      const file = path.join(root, 'src', args.path.slice(2));
      return { path: existsSync(file) ? file : existsSync(file + '.jsx') ? file + '.jsx' : file + '.js' };
    });
  } }],
});
const Activity = require(path.join(scratch, 'activity.cjs')).default;
let mounted = [];
afterEach(async () => { for (const renderer of mounted) await act(async () => renderer.unmount()); mounted = []; });
after(async () => { await rm(scratch, { recursive: true, force: true }); });
const text = value => typeof value === 'string' ? value : Array.isArray(value) ? value.map(text).join('') : value ? text(value.children) : '';
async function mount(props) { let renderer; await act(async () => { renderer = create(React.createElement(Activity, props)); }); mounted.push(renderer); return renderer; }
const event = (status, extra = {}) => ({ agent: 'crm', app: 'crm', parent: 'central', kind: 'read', status, summary: 'Consulta fictícia do CRM', at: '2026-11-12T14:00:00Z', ...extra });

test('live activity names the actual specialist and uses its native avatar', async () => {
  const renderer = await mount({ steps: [event('running')], active: true });
  const live = renderer.root.findByProps({ role: 'status' });
  assert.ok(text(live.toJSON?.() || { children: live.children }).includes('Consulta fictícia do CRM'));
  assert.ok(text(renderer.toJSON()).includes('CRM IA'));
  assert.ok(renderer.root.findAllByType('img').some(img => img.props.src.includes('crm-ia-avatar-v1')));
  assert.equal(renderer.root.findByType('details').props.open, true);
  assert.equal(renderer.root.findByType('section').props['data-active'], true);
});

test('a completed read or specialist answer cannot resurrect its earlier running event', async () => {
  const steps = [event('running', { kind: 'delegation', summary: 'CRM chamado' }), event('running'), event('completed'), event('completed', { kind: 'answer', summary: 'Análise concluída de verdade' })];
  const renderer = await mount({ steps, active: true });
  const live = renderer.root.findByProps({ role: 'status' });
  assert.ok(text({ children: live.children }).includes('Análise concluída de verdade'));
  assert.equal(renderer.root.findByType('section').props['data-active'], false);
  assert.equal(renderer.root.findAllByType('li').length, 4);
  await act(async () => renderer.update(React.createElement(Activity, { steps, active: false })));
  assert.equal(renderer.root.findByType('details').props.open, false);
});

test('waiting and failed events retain partial coverage and never imply a successful plan', async () => {
  const renderer = await mount({ steps: [event('partial', { source: { available: false }, summary: 'Histórico incompleto' }), event('waiting', { kind: 'question', item_id: 'item-fixture', summary: 'Aguardando resposta' })], active: true });
  assert.equal(renderer.root.findByType('section').props['data-active'], false);
  let target;
  const previous = globalThis.document;
  globalThis.document = { getElementById: id => ({ scrollIntoView: () => { target = id; } }) };
  try {
    const jump = renderer.root.findAllByType('button').find(button => text({ children: button.children }).includes('Ver pergunta'));
    assert.ok(jump);
    await act(async () => jump.props.onClick());
    assert.equal(target, 'atlas-executor-item-item-fixture');
    assert.equal(renderer.root.findAllByType('a').length, 0);
  } finally { globalThis.document = previous; }
  assert.match(text(renderer.toJSON()), /parcial|indisponível/i);
  await act(async () => renderer.update(React.createElement(Activity, { steps: [event('failed', { agent: 'central', kind: 'error', summary: 'Serviço indisponível' })], active: false })));
  assert.ok(text(renderer.toJSON()).includes('Serviço indisponível'));
  assert.ok(!text(renderer.toJSON()).includes('Concluído'));
});

test('a terminal Atlas failure stops unfinished specialist indicators', async () => {
  const renderer = await mount({ active: true, steps: [event('running', { agent: 'central', kind: 'coordination' }), event('running'), event('failed', { agent: 'central', kind: 'error', summary: 'A execução foi interrompida' })] });
  assert.equal(renderer.root.findByType('section').props['data-active'], false);
  const live = renderer.root.findByProps({ role: 'status' });
  assert.ok(text({ children: live.children }).includes('A execução foi interrompida'));
});

test('empty progress does not invent steps and recorded agent names and dates remain visible', async () => {
  const idle = await mount({ steps: [], active: false });
  assert.equal(idle.toJSON(), null);
  const empty = await mount({ steps: [], active: true });
  assert.equal(empty.root.findAllByType('li').length, 0);
  assert.equal(empty.root.findByType('section').props['data-active'], false);
  const renderer = await mount({ agents: [{ id: 'cs', name: 'CS da equipe' }], steps: [event('completed', { agent: 'cs' }), event('failed', { agent: 'gestor', at: 'invalid' })] });
  assert.ok(text(renderer.toJSON()).includes('CS da equipe'));
  assert.ok(renderer.root.findAllByType('img').some(img => img.props.src.includes('cs-ia-avatar-v1')));
  assert.ok(renderer.root.findAllByType('img').some(img => img.props.src.includes('gestor-ia-avatar')));
  assert.equal(renderer.root.findAllByType('time').length, 1);
});

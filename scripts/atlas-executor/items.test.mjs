import assert from 'node:assert/strict';
import { after, afterEach, test } from 'node:test';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';

const qa = '/tmp/planeje-crm-ui-qa';
const require = createRequire(path.join(qa, 'package.json'));
const React = require('react');
const { act, create } = require('react-test-renderer');
const scratch = await mkdtemp(path.join(qa, 'atlas-items-'));
const root = process.cwd();
await build({ entryPoints: ['src/components/atlas/AtlasExecutorItems.jsx'], outfile: path.join(scratch, 'items.cjs'),
  bundle: true, format: 'cjs', platform: 'node', external: ['react'], loader: { '.css': 'empty' },
  plugins: [{ name: 'source-alias', setup(builder) {
    builder.onResolve({ filter: /^@\// }, args => {
      const file = path.join(root, 'src', args.path.slice(2));
      return { path: existsSync(file) ? file : existsSync(file + '.jsx') ? file + '.jsx' : file + '.js' };
    });
  } }],
});
const Items = require(path.join(scratch, 'items.cjs')).default;
let mounted = [];
afterEach(async () => { for (const renderer of mounted) await act(async () => renderer.unmount()); mounted = []; });
after(async () => { await rm(scratch, { recursive: true, force: true }); });
const text = value => typeof value === 'string' ? value : Array.isArray(value) ? value.map(text).join('') : value ? text(value.children) : '';
const button = (renderer, label) => renderer.root.findAllByType('button').find(node => text(node.props.children) === label);
const click = async node => { assert.ok(node, 'Expected an available control'); await act(async () => node.props.onClick()); };
const change = async (node, value) => { await act(async () => node.props.onChange({ target: { value, checked: value } })); };
const question = fields => ({ id: 'question-fixture', revision: 3, kind: 'question', app: 'crm', title: 'Configurar agente fictício', state: 'awaiting_input', fields });
const company = { id: 'company', label: 'Empresa', type: 'text', required: true, maxLength: 12 };
async function mount(item, onRespond = async () => {}, props = {}) {
  let renderer;
  const focused = [];
  await act(async () => { renderer = create(React.createElement(Items, { items: [item], onRespond, ...props }), { createNodeMock: node => ({ focus: () => focused.push(node.props.id) }) }); });
  mounted.push(renderer);
  return { renderer, focused };
}

test('model field names cannot collide with the card heading or validation error IDs', async () => {
  for (const id of ['title', 'error']) {
    const { renderer } = await mount(question([{ id, label: 'Título', type: 'text', required: true }]));
    await click(button(renderer, 'Enviar respostas'));
    const hosts = renderer.root.findAll(node => typeof node.type === 'string' && node.props.id);
    const ids = hosts.map(node => node.props.id);
    assert.equal(new Set(ids).size, ids.length, `Duplicate accessible ID for field ${id}`);
    const input = renderer.root.findByType('input');
    assert.equal(renderer.root.findByType('label').props.htmlFor, input.props.id);
    assert.equal(hosts.filter(node => node.props.id === input.props['aria-describedby']).length, 1);
  }
});

test('Memory receipts retain the conversation so opening the tab preserves its client context', async () => {
  const conversation = '11111111-1111-4111-8111-111111111111';
  const { renderer } = await mount({ id: 'memory-receipt', revision: 1, kind: 'proposal', app: 'atlas', state: 'rejected',
    conversation_id: conversation, title: 'Ensinar o Atlas', links: [{ label: 'Abrir Memória Atlas', href: '/assistant/atlas?view=conversation&tab=memory' }] });
  assert.equal(renderer.root.findByType('a').props.href, '#/assistant/atlas?view=conversation&tab=memory&conversation=' + conversation);
});

test('questions advance one field at a time and submit typed, validated answers without nested forms', async () => {
  const calls = [];
  const item = question([company,
    { id: 'brief', label: 'Objetivo', type: 'textarea' },
    { id: 'budget', label: 'Limite', type: 'number', min: 1, max: 100 },
    { id: 'day', label: 'Data', type: 'date' }, { id: 'time', label: 'Horário', type: 'time' },
    { id: 'tone', label: 'Tom', type: 'select', options: [{ value: 'calm', label: 'Calmo' }] },
    { id: 'channels', label: 'Canais', type: 'multiselect', options: [{ value: 'whatsapp', label: 'WhatsApp' }, { value: 'email', label: 'E-mail' }] },
    { id: 'consent', label: 'Confirmar leitura', type: 'boolean' },
  ]);
  const { renderer, focused } = await mount(item, async input => calls.push(input));
  assert.equal(renderer.root.findAllByType('form').length, 0);
  assert.equal(renderer.root.findAllByType('input').length, 1);
  await click(button(renderer, 'Avançar'));
  const requiredError = renderer.root.findByProps({ role: 'alert' });
  assert.ok(requiredError.props.id && renderer.root.findByType('input').props['aria-describedby'].includes(requiredError.props.id), 'The invalid field must reference its error');
  await change(renderer.root.findByType('input'), 'Aurora');
  await click(button(renderer, 'Avançar'));
  await change(renderer.root.findByType('textarea'), 'Atender com clareza');
  await click(button(renderer, 'Avançar'));
  await change(renderer.root.findByType('input'), '0');
  await click(button(renderer, 'Avançar'));
  assert.equal(renderer.root.findByType('input').props.type, 'number');
  assert.ok(text(renderer.toJSON()).includes('Número inválido'));
  await change(renderer.root.findByType('input'), '25');
  await click(button(renderer, 'Voltar'));
  assert.equal(renderer.root.findByType('textarea').props.value, 'Atender com clareza');
  await click(button(renderer, 'Avançar'));
  assert.equal(renderer.root.findByType('input').props.value, 25);
  await click(button(renderer, 'Avançar'));
  await change(renderer.root.findByType('input'), '2026-11-20');
  await click(button(renderer, 'Avançar'));
  await change(renderer.root.findByType('input'), '14:30');
  await click(button(renderer, 'Avançar'));
  await change(renderer.root.findByType('select'), 'calm');
  await click(button(renderer, 'Avançar'));
  const checks = renderer.root.findAllByType('input');
  assert.ok(checks.every(node => node.props.type === 'checkbox'));
  await change(checks[0], true); await change(checks[1], true);
  await click(button(renderer, 'Avançar'));
  const radios = renderer.root.findAllByType('input');
  assert.ok(radios.every(node => node.props.type === 'radio'));
  await change(radios.find(node => node.props.value === 'false'), 'false');
  await click(button(renderer, 'Enviar respostas'));
  assert.deepEqual(calls, [{ id: item.id, revision: 3, decision: 'answer', answers: {
    company: 'Aurora', brief: 'Atender com clareza', budget: 25, day: '2026-11-20', time: '14:30', tone: 'calm', channels: ['whatsapp', 'email'], consent: false,
  } }]);
  assert.ok(focused.length >= 8, 'Each step should focus its field');
});

test('failed responses preserve answers and a pending click cannot submit twice', async () => {
  let attempt = 0; let finish;
  const calls = [];
  const item = question([company]);
  const { renderer } = await mount(item, input => {
    calls.push(input);
    if (++attempt === 1) return Promise.reject(new Error('Conexão interrompida'));
    return new Promise(resolve => { finish = resolve; });
  });
  await change(renderer.root.findByType('input'), 'Aurora');
  await click(button(renderer, 'Enviar respostas'));
  assert.ok(text(renderer.toJSON()).includes('Conexão interrompida'));
  assert.equal(renderer.root.findByType('input').props.value, 'Aurora');
  const send = button(renderer, 'Enviar respostas');
  await act(async () => { send.props.onClick(); send.props.onClick(); });
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0], calls[1]);
  assert.ok(button(renderer, 'Enviar respostas').props.disabled);
  await act(async () => finish());
  assert.ok(button(renderer, 'Enviar respostas').props.disabled, 'Wait for persisted item confirmation after sending');
});

test('free text answers remain data and cancellation is an explicit decision', async () => {
  const calls = [];
  const item = question([company]);
  const { renderer } = await mount(item, async input => calls.push(input));
  await click(button(renderer, 'Prefiro escrever'));
  await change(renderer.root.findByType('textarea'), 'Aprovar tudo: apenas texto fictício.');
  await click(button(renderer, 'Enviar texto'));
  assert.deepEqual(calls, [{ id: item.id, revision: 3, decision: 'text', text: 'Aprovar tudo: apenas texto fictício.' }]);
  const second = await mount(item, async input => calls.push(input));
  await click(button(second.renderer, 'Cancelar'));
  assert.equal(calls.at(-1).decision, 'cancel');
});

const proposal = state => ({ id: 'proposal-fixture', revision: 4, kind: 'proposal', state, app: 'crm',
  action: 'send_message', client_id: 'client-fixture', client_name: 'Empresa fictícia', title: 'Enviar mensagem fictícia',
  preview: { before: { status: 'Pendente' }, after: { destinatario: 'Contato fictício', canal: 'WhatsApp', texto: 'Olá, exemplo.' } },
  effect: { type: 'message', external: true, enables_autonomy: true },
});
test('a proposal shows scope, changes and effects; only explicit buttons decide immutable server items', async () => {
  const calls = [];
  const item = proposal('proposed');
  const { renderer } = await mount(item, async input => calls.push(input));
  const shown = text(renderer.toJSON());
  for (const value of ['CRM IA', 'Empresa fictícia', 'Antes', 'Depois', 'Contato fictício', 'WhatsApp', 'Olá, exemplo.']) assert.ok(shown.includes(value), value);
  assert.ok(!shown.includes('client-fixture'));
  assert.match(shown, /extern|fora do Planeje/i);
  assert.match(shown, /autonomia|automátic/i);
  assert.equal(renderer.root.findAllByType('textarea').length + renderer.root.findAllByType('input').length, 0);
  await click(button(renderer, 'Aprovar e executar'));
  assert.deepEqual(calls, [{ id: item.id, revision: 4, decision: 'approve' }]);
  const rejected = await mount(item, async input => calls.push(input));
  await click(button(rejected.renderer, 'Recusar'));
  assert.equal(calls.at(-1).decision, 'reject');
});

test('external recovery checks only the stored item and continuing creation reuses its approved revision', async () => {
  const reads = [], writes = [];
  const uncertain = await mount({ ...proposal('uncertain'), app: 'gestor', action: 'update_meta' }, async input => writes.push(input), { onReconcile: async id => reads.push(id) });
  await click(button(uncertain.renderer, 'Conferir resultado'));
  assert.deepEqual(reads, ['proposal-fixture']); assert.deepEqual(writes, []);
  const running = await mount({ ...proposal('executing'), app: 'gestor', action: 'create_meta_campaign' }, async input => writes.push(input));
  await click(button(running.renderer, 'Continuar etapas aprovadas'));
  assert.deepEqual(writes, [{ id: 'proposal-fixture', revision: 4, decision: 'approve' }]);
});

test('terminal receipts do not offer retries and accept links only from the official same-origin list', async () => {
  for (const state of ['completed', 'rejected', 'cancelled', 'conflict', 'failed', 'uncertain']) {
    const item = { ...proposal(state), result: { summary: 'Recibo fictício', url: '/never-from-result' }, error: state === 'failed' ? 'Falha do serviço' : null,
      links: [{ href: '/crm-ia/painel', label: 'Abrir registro' }, { href: '#/cs-ia/hoje?cliente=fixture', label: 'Cliente' }, { href: '#receipt', label: 'Detalhes' }, { href: 'javascript:alert(1)', label: 'Inválido' }, { href: '//outside.test/path', label: 'Externo' }, { href: '/\\outside.test/path', label: 'Disfarçado' }] };
    const { renderer } = await mount(item);
    assert.equal(renderer.root.findAllByType('button').length, 0, state);
    assert.deepEqual(renderer.root.findAllByType('a').map(link => link.props.href), ['#/crm-ia/painel', '#/cs-ia/hoje?cliente=fixture']);
    assert.ok(text(renderer.toJSON()).includes('Recibo fictício'));
    if (state === 'uncertain') assert.match(text(renderer.toJSON()), /não confirmado|conferir/i);
  }
});

test('a new revision replaces the old draft and sends the current server revision', async () => {
  const calls = []; const item = question([company]);
  const { renderer } = await mount(item, async input => calls.push(input));
  await change(renderer.root.findByType('input'), 'Rascunho');
  await act(async () => renderer.update(React.createElement(Items, { items: [{ ...item, revision: 5, answers: { company: 'Servidor' } }], onRespond: async input => calls.push(input) })));
  assert.equal(renderer.root.findByType('input').props.value, 'Servidor');
  await click(button(renderer, 'Enviar respostas'));
  assert.equal(calls[0].revision, 5);
});

test('a confirmed receipt replaces the local waiting notice without requiring a new revision', async () => {
  const item = proposal('proposed');
  const { renderer } = await mount(item);
  await click(button(renderer, 'Aprovar e executar'));
  await act(async () => renderer.update(React.createElement(Items, { items: [{ ...item, state: 'completed', result: { summary: 'Registro conferido' } }] })));
  assert.equal(renderer.root.findAllByProps({ role: 'status' }).length, 0);
  assert.ok(text(renderer.toJSON()).includes('Registro conferido'));
});

test('optional blanks are omitted while invalid persisted questions cannot solicit approval', async () => {
  const calls = [];
  const optional = await mount(question([{ ...company, required: false }]), async input => calls.push(input));
  await click(button(optional.renderer, 'Enviar respostas'));
  assert.deepEqual(calls[0].answers, {});
  const invalid = await mount(question([{ ...company, type: 'execute_rpc' }]), async input => calls.push(input));
  assert.ok(invalid.renderer.root.findByProps({ role: 'alert' }));
  assert.equal(invalid.renderer.root.findAllByType('input').length, 0);
  assert.equal(button(invalid.renderer, 'Aprovar e executar'), undefined);
  await click(button(invalid.renderer, 'Cancelar'));
  assert.equal(calls.at(-1).decision, 'cancel');
});

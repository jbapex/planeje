import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import { build } from 'esbuild';

const root = new URL('../../', import.meta.url).pathname;
const require = createRequire('/tmp/planeje-crm-ui-qa/package.json');
const React = require('react'), { act, create } = require('react-test-renderer');
const scratch = await mkdtemp('/tmp/planeje-crm-ui-qa/lead-controls-');
await build({ stdin: { contents: `export {default as Leads} from ${JSON.stringify(path.join(root, 'src/components/crm-ia/CrmIaLeads.jsx'))};export {MemoryRouter} from 'react-router-dom';`, resolveDir: root },
  bundle: true, loader: { '.png': 'dataurl' }, platform: 'node', format: 'cjs', outfile: path.join(scratch, 'ui.cjs'), external: ['react'],
  plugins: [{ name: 'offline-dialog', setup(b) {
    b.onResolve({ filter: /^@\/components\/ui\/dialog$/ }, () => ({ path: 'dialog', namespace: 'fixture' }));
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: `import React from 'react';export const Dialog=({open,children})=>open?React.createElement('div',null,children):null;export const DialogContent=({children})=>React.createElement('section',{role:'dialog'},children);export const DialogTitle=({children})=>React.createElement('h2',null,children);export const DialogDescription=({children})=>React.createElement('p',null,children);` }));
    b.onResolve({ filter: /^@\// }, ({ path: name }) => { const file = path.join(root, 'src', name.slice(2)); return { path: [file, file + '.jsx', file + '.js'].find(existsSync) }; });
  } }],
});
const { Leads, MemoryRouter } = require(path.join(scratch, 'ui.cjs'));
const client = { id: 'client-a', empresa: 'Conta sintética' };
const lead = { id: 'lead-a', nome: 'Contato sintético', whatsapp: '5511000000000', email: 'contato@example.invalid', valor: 180, pipeline_id: 'pipeline-a', stage_id: 'stage-a', responsavel_id: 'person-a', updated_at: '2026-11-11T10:00:00Z', etiquetas: ['Quente'], crm_ia_profile: { agent_id: 'agent-a', id: 'profile-a', nome: 'Avaliação', cor: '#123456', agent_updated_at: 'agent-version' } };
const workspace = { client, provisioned: true, permissions: { manage: true, conversations: true },
  pipelines: [{ id: 'pipeline-a', nome: 'Principal', updated_at: 'pipeline-version' }],
  stages: [{ id: 'stage-a', pipeline_id: 'pipeline-a', nome: 'Entrada', ordem: 1, color: '#286fc9', updated_at: 'stage-version' }, { id: 'won', pipeline_id: 'pipeline-a', nome: 'Ganho', ordem: 2, tipo: 'ganho' }],
  people: [{ id: 'person-a', nome: 'Atendente sintético' }], channels: [{ id: 'channel-a', nome: 'Canal autorizado' }],
  lead_profiles: [{ ...lead.crm_ia_profile, pipeline_id: 'pipeline-a' }, { agent_id: 'agent-a', id: 'old-profile', nome: 'Antigo', pipeline_id: 'pipeline-a', historical: true }],
  config: { revision: 'config-version', data: { custom_fields: { fields: [{ key: 'medida', name: 'Medida', type: 'number' }] } } } };
const text = n => typeof n === 'string' ? n : Array.isArray(n) ? n.map(text).join(' ') : n ? text(n.children ?? n.props?.children) : '';
const field = (r, label) => r.root.findByProps({ 'aria-label': label });
const button = (r, label) => r.root.findAllByType('button').find(n => (n.props['aria-label'] || text(n.props.children)).trim().replace(/\s+/g, ' ') === label);
const click = async (r, label) => { const n = button(r, label); assert.ok(n, label); await act(async () => n.props.onClick?.()); };
const change = async (r, label, value) => act(async () => field(r, label).props.onChange({ target: { value, checked: value } }));
const submit = async r => act(async () => r.root.findAllByType('form').at(-1).props.onSubmit({ preventDefault() {} }));
function fixture(overrides = {}) {
  const calls = [];
  const api = async (action, payload = {}) => {
    calls.push([action, payload]);
    if (overrides[action]) return overrides[action](payload);
    if (action === 'leads') return { rows: [lead], total: 83, summary: { value: 9800, ai: 61, waiting: null }, stage_totals: [{ stage_id: 'stage-a', count: 60, value: 8000 }, { stage_id: 'won', count: 23, value: 1800 }] };
    if (action === 'lead') return { lead, events: [], appointments: [], profile_history: [{ id: 'change-a', to_profile: lead.crm_ia_profile, created_at: lead.updated_at }] };
    if (['move_lead', 'bulk_assign', 'bulk_archive', 'save_lead', 'save_stage', 'reorder_stages', 'import_leads'].includes(action)) return { ok: true };
    if (['messages', 'conversations'].includes(action)) return { rows: [], total: 0 };
    throw new Error('Ação não autorizada no teste: ' + action);
  };
  return { api, calls };
}
async function mount(f, extra = {}) {
  let renderer;
  const render = props => React.createElement(MemoryRouter, { future: { v7_startTransition: true, v7_relativeSplatPath: true } }, React.createElement(Leads, { api: f.api, mutate: f.api, workspace, client, profile: { id: 'person-a' }, revision: 0, canManage: true, ...props }));
  await act(async () => { renderer = create(render(extra)); });
  renderer.updateScope = async props => act(async () => renderer.update(render({ ...extra, ...props })));
  return renderer;
}

test('filtros enviam etiqueta exata e o par de perfil; as doze colunas e os totais usam fontes do servidor', async () => {
  const f = fixture(), r = await mount(f);
  try {
    await change(r, 'Etiqueta', 'Quente'); await change(r, 'Perfil do lead', 'agent-a:profile-a');
    const payload = f.calls.filter(([a]) => a === 'leads').at(-1)[1];
    assert.equal(payload.tag, 'Quente'); assert.equal(payload.profile_agent_id, 'agent-a'); assert.equal(payload.profile_id, 'profile-a');
    assert.deepEqual(r.root.findAllByType('th').map(n => text(n).trim()).filter(Boolean), ['Lead', 'Situação', 'Etapa', 'Funil', 'Origem', 'Entrada', 'Email', 'Tags', 'Perfil', 'Valor', 'Responsável', 'ID']);
    const summary = field(r, 'Resumo dos leads');
    assert.match(text(summary), /83/); assert.match(text(summary), /9\.800,00/); assert.match(text(summary), /61/); assert.match(text(summary), /Sem dados/);
  } finally { await act(async () => r.unmount()); }
});

test('preferência guarda só chaves de coluna por pessoa e cliente, restaura padrão e suporta storage negado', async () => {
  const before = globalThis.localStorage, storage = new Map();
  globalThis.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
  let r;
  try {
    const f = fixture(); r = await mount(f);
    await change(r, 'Mostrar coluna Email', false);
    assert.equal(r.root.findAllByType('th').some(n => text(n) === 'Email'), false);
    const [[key, value]] = storage;
    assert.match(key, /person-a/); assert.match(key, /client-a/);
    assert.equal(JSON.parse(value).includes('email'), false);
    assert.ok(JSON.parse(value).every(item => typeof item === 'string'));
    assert.doesNotMatch(value, /Contato|551100|profile-a|config-version/);
    await r.updateScope({ client: { ...client, id: 'client-b' }, workspace: { ...workspace, client: { ...client, id: 'client-b' } } });
    assert.equal(field(r, 'Mostrar coluna Email').props.checked, true);
    await r.updateScope({}); assert.equal(field(r, 'Mostrar coluna Email').props.checked, false);
    await click(r, 'Restaurar colunas padrão'); assert.equal(field(r, 'Mostrar coluna Email').props.checked, true);
    assert.equal(f.calls.some(([a]) => a === 'save_config'), false);
    globalThis.localStorage = { getItem() { throw new Error('negado'); }, setItem() { throw new Error('negado'); } };
    await change(r, 'Mostrar coluna ID', false); assert.equal(field(r, 'Mostrar coluna ID').props.checked, false);
  } finally { if (r) await act(async () => r.unmount()); if (before === undefined) delete globalThis.localStorage; else globalThis.localStorage = before; }
});

test('seleção congela a versão vista e arquivamento em lote preserva a confirmação em conflito', async () => {
  let row = lead, conflict = true;
  const f = fixture({ leads: () => ({ rows: [row], total: 1 }), bulk_archive: () => { if (conflict) throw new Error('Lead alterado por outra pessoa'); return { ok: true }; } }), r = await mount(f);
  try {
    await change(r, 'Selecionar Contato sintético', true);
    row = { ...lead, updated_at: 'newer-version' }; await click(r, 'Atualizar leads');
    await click(r, 'Atribuir responsável'); await change(r, 'Novo responsável da seleção', 'person-a'); await submit(r);
    assert.deepEqual(f.calls.find(([a]) => a === 'bulk_assign')[1], { ids: ['lead-a'], owner_id: 'person-a', items: [{ id: 'lead-a', expected_updated_at: lead.updated_at }] });
    await change(r, 'Selecionar Contato sintético', true); await click(r, 'Arquivar seleção');
    assert.equal(f.calls.some(([a]) => a === 'bulk_archive'), false);
    await submit(r); assert.match(text(r.toJSON()), /Lead alterado/);
    assert.deepEqual(f.calls.find(([a]) => a === 'bulk_archive')[1], { items: [{ id: 'lead-a', expected_updated_at: 'newer-version' }] });
    conflict = false; await submit(r); assert.equal(r.root.findAllByProps({ role: 'dialog' }).length, 0);
  } finally { await act(async () => r.unmount()); }
});

test('completar a seleção da página não atualiza versões já escolhidas após refresh', async () => {
  let updated = false;
  const other = { ...lead, id: 'lead-b', nome: 'Segundo contato' };
  const f = fixture({ leads: () => ({ rows: [updated ? { ...lead, updated_at: 'new-version' } : lead, other], total: 2 }) }), r = await mount(f);
  try {
    await change(r, 'Selecionar Contato sintético', true); updated = true; await click(r, 'Atualizar leads');
    await change(r, 'Selecionar página', true); await click(r, 'Atribuir responsável'); await change(r, 'Novo responsável da seleção', 'person-a'); await submit(r);
    const items = f.calls.find(([a]) => a === 'bulk_assign')[1].items;
    assert.equal(items.find(item => item.id === 'lead-a').expected_updated_at, lead.updated_at);
    assert.equal(items.find(item => item.id === 'lead-b').expected_updated_at, other.updated_at);
  } finally { await act(async () => r.unmount()); }
});

test('perda da permissão de gestão descarta confirmações ainda abertas', async () => {
  const f = fixture(), r = await mount(f, { kanban: true });
  try {
    await click(r, 'Mover Contato sintético'); await r.updateScope({ canManage: false });
    assert.equal(r.root.findAllByProps({ role: 'dialog' }).length, 0);
    assert.equal(button(r, 'Mover Contato sintético'), undefined);
    assert.equal(f.calls.some(([a]) => a === 'move_lead'), false);
  } finally { await act(async () => r.unmount()); }
});

test('etapa sem grupo em totais completos mostra zero; totais ausentes continuam indisponíveis', async () => {
  const f = fixture({ leads: () => ({ rows: [lead], total: 1, stage_totals: [{ stage_id: 'stage-a', count: 1, value: 180 }] }) }), r = await mount(f, { kanban: true });
  try {
    assert.match(text(field(r, 'Etapa Ganho')), /Ganho\s+0\s+R\$\s*0,00/);
    const unavailable = fixture({ leads: () => ({ rows: [lead], total: 1 }) });
    await r.updateScope({ api: unavailable.api, mutate: unavailable.api });
    assert.match(text(field(r, 'Etapa Ganho')), /Sem dados/);
  } finally { await act(async () => r.unmount()); }
});

test('Kanban conserva contagens globais entre páginas e inclui Sem etapa', async () => {
  const f = fixture({ leads: p => ({ rows: [{ ...lead, id: p.offset ? 'lead-b' : 'lead-a', stage_id: null }], total: 83, stage_totals: [{ stage_id: 'stage-a', count: 60, value: 8000 }, { stage_id: 'won', count: 20, value: 1800 }, { stage_id: null, count: 3, value: 0 }] }) }), r = await mount(f, { kanban: true });
  try {
    assert.match(text(field(r, 'Etapa Entrada')), /60/); assert.match(text(field(r, 'Etapa Entrada')), /8\.000,00/);
    assert.match(text(field(r, 'Etapa Sem etapa')), /3/);
    await click(r, 'Próxima'); assert.equal(f.calls.filter(([a]) => a === 'leads').at(-1)[1].offset, 20);
    assert.match(text(field(r, 'Etapa Entrada')), /60/); assert.match(text(r.toJSON()), /1\s+de\s+83/);
    assert.doesNotMatch(text(r.toJSON()), /correspondem à página carregada/);
  } finally { await act(async () => r.unmount()); }
});

test('arrasto e botão de teclado abrem o mesmo movimento versionado e não avançam antes do servidor', async () => {
  let reject = true;
  const f = fixture({ move_lead: () => { if (reject) throw new Error('Conflito de versão'); return { ok: true }; } }), r = await mount(f, { kanban: true });
  try {
    const transfer = { setData() {}, effectAllowed: '' };
    await act(async () => field(r, 'Oportunidade Contato sintético').props.onDragStart({ dataTransfer: transfer }));
    await act(async () => field(r, 'Etapa Ganho').props.onDrop({ preventDefault() {} }));
    assert.equal(f.calls.some(([a]) => a === 'move_lead'), false);
    await submit(r); assert.equal(f.calls.some(([a]) => a === 'move_lead'), false);
    await change(r, 'Motivo', 'Venda confirmada'); await submit(r);
    assert.match(text(r.toJSON()), /Conflito de versão/); assert.equal(field(r, 'Motivo').props.value, 'Venda confirmada');
    const move = f.calls.find(([a]) => a === 'move_lead')[1];
    assert.equal(move.expected_updated_at, lead.updated_at); assert.equal(move.stage_id, 'won'); assert.equal(move.from_stage_id, 'stage-a');
    assert.equal(field(r, 'Oportunidade Contato sintético').parent.props['aria-label'], 'Etapa Entrada');
    await click(r, 'Cancelar'); await click(r, 'Mover Contato sintético'); await change(r, 'Etapa de destino', 'won'); await change(r, 'Motivo', 'Venda confirmada');
    reject = false; await submit(r); assert.deepEqual(f.calls.filter(([a]) => a === 'move_lead').at(-1)[1], move);
  } finally { await act(async () => r.unmount()); }
});

test('troca de conta descarta seleção e editores sem aceitar arrasto externo', async () => {
  const f = fixture(), r = await mount(f, { kanban: true });
  try {
    await act(async () => field(r, 'Etapa Ganho').props.onDrop({ preventDefault() {}, dataTransfer: { getData: () => 'lead-a' } }));
    assert.equal(r.root.findAllByProps({ role: 'dialog' }).length, 0);
    await click(r, 'Mover Contato sintético');
    await r.updateScope({ client: { ...client, id: 'client-b' }, workspace: { ...workspace, client: { ...client, id: 'client-b' } } });
    assert.equal(r.root.findAllByProps({ role: 'dialog' }).length, 0);
    assert.equal(f.calls.some(([a]) => a === 'move_lead'), false);
  } finally { await act(async () => r.unmount()); }
});

test('ficha divide resumo, campos e jornada, mantém perfil histórico e reutiliza só conversa autorizada', async () => {
  const f = fixture({ lead: () => ({ lead: { ...lead, crm_ia_fields: { medida: 42 } }, events: [], appointments: [], conversations: [{ contact_id: 'contact-a', channel_id: 'channel-a' }, { contact_id: 'foreign', channel_id: 'foreign-channel' }], profile_history: [{ id: 'history-a', from_profile: null, to_profile: { nome: 'Perfil removido' }, created_at: lead.updated_at }] }) }), r = await mount(f);
  try {
    await click(r, 'Abrir Contato sintético');
    assert.match(text(r.toJSON()), /Avaliação/);
    assert.equal(f.calls.filter(([a]) => a === 'messages').at(-1)[1].channel_id, 'channel-a');
    assert.equal(f.calls.some(([, p]) => p.channel_id === 'foreign-channel'), false);
    await click(r, 'Campos'); assert.match(text(r.toJSON()), /Medida\s+42/);
    await click(r, 'Jornada'); assert.match(text(r.toJSON()), /Perfil removido/);
    await click(r, 'Editar lead');
    const options = field(r, 'Perfil atribuído').findAllByType('option'); assert.ok(options.every(n => n.props.value !== 'agent-a:old-profile'));
    await change(r, 'Perfil atribuído', ''); await submit(r);
    assert.equal(f.calls.find(([a]) => a === 'save_lead')[1].profile, null);
  } finally { await act(async () => r.unmount()); }
});

test('perfil removido continua filtrável em qualquer funil e edição comum preserva seu snapshot', async () => {
  const snapshot = { ...lead.crm_ia_profile, id: 'old-profile', nome: 'Perfil removido', agent_updated_at: 'old-agent-version' };
  const historicalWorkspace = { ...workspace, lead_profiles: [{ ...snapshot, pipeline_id: null, historical: true }, { ...snapshot, nome: 'Nome anterior', pipeline_id: null, historical: true }] };
  const f = fixture({ lead: () => ({ lead: { ...lead, crm_ia_profile: snapshot }, events: [], appointments: [] }) }), r = await mount(f, { kanban: true, workspace: historicalWorkspace });
  try {
    const options = field(r, 'Perfil do lead').findAllByType('option');
    assert.equal(options.filter(item => item.props.value === 'agent-a:old-profile').length, 1);
    await change(r, 'Perfil do lead', 'agent-a:old-profile');
    assert.equal(f.calls.filter(([a]) => a === 'leads').at(-1)[1].profile_id, 'old-profile');
    await click(r, 'Abrir Contato sintético'); await click(r, 'Editar lead');
    const historicalOption = field(r, 'Perfil atribuído').findAllByType('option').find(item => item.props.value === 'agent-a:old-profile');
    assert.equal(historicalOption.props.disabled, true);
    await change(r, 'Nome', 'Nome corrigido'); await submit(r);
    assert.equal(Object.hasOwn(f.calls.find(([a]) => a === 'save_lead')[1], 'profile'), false);
  } finally { await act(async () => r.unmount()); }
});

test('ícone usa allowlist; setas e arrasto reordenam com a versão capturada do funil', async () => {
  const f = fixture(), r = await mount(f, { kanban: true });
  try {
    await click(r, 'Configurar funil'); await click(r, 'Editar Entrada');
    await change(r, 'Ícone da etapa', 'phone'); await submit(r);
    assert.equal(f.calls.find(([a]) => a === 'save_stage')[1].icon, 'phone');
    await click(r, 'Descer Entrada'); await submit(r);
    assert.deepEqual(f.calls.find(([a]) => a === 'reorder_stages')[1], { pipeline_id: 'pipeline-a', stage_ids: ['won', 'stage-a'], expected_updated_at: 'pipeline-version' });
    await act(async () => field(r, 'Ordem da etapa Ganho').props.onDragStart({ dataTransfer: { setData() {} } }));
    await act(async () => field(r, 'Ordem da etapa Entrada').props.onDrop({ preventDefault() {} }));
    await submit(r); assert.deepEqual(f.calls.filter(([a]) => a === 'reorder_stages').at(-1)[1].stage_ids, ['won', 'stage-a']);
  } finally { await act(async () => r.unmount()); }
});

test('configuração abre o funil escolhido; troca de funil do lead exige etapa de destino', async () => {
  const nextWorkspace = { ...workspace, pipelines: [...workspace.pipelines, { id: 'pipeline-b', nome: 'Segundo funil', updated_at: 'version-b' }], stages: [...workspace.stages, { id: 'stage-b', nome: 'Nova entrada', pipeline_id: 'pipeline-b', ordem: 1 }] };
  const f = fixture(), r = await mount(f, { kanban: true, workspace: nextWorkspace });
  try {
    await change(r, 'Funil', 'pipeline-b'); await click(r, 'Configurar funil');
    assert.equal(field(r, 'Funil em configuração').props.value, 'pipeline-b');
    await click(r, 'Concluir'); await change(r, 'Funil', 'pipeline-a'); await click(r, 'Abrir Contato sintético'); await click(r, 'Editar lead');
    await change(r, 'Funil do lead', 'pipeline-b'); await submit(r);
    assert.equal(f.calls.some(([a]) => a === 'save_lead'), false);
    assert.match(text(r.toJSON()), /Escolha uma etapa do funil de destino/);
    await change(r, 'Etapa do lead', 'stage-b'); await submit(r);
    assert.equal(f.calls.find(([a]) => a === 'save_lead')[1].stage_id, 'stage-b');
    assert.equal(f.calls.find(([a]) => a === 'save_lead')[1].expected_updated_at, lead.updated_at);
  } finally { await act(async () => r.unmount()); }
});

test('criação pela lista sem funil não herda etapa de outro funil', async () => {
  const f = fixture(), r = await mount(f);
  try {
    await click(r, 'Novo lead');
    assert.equal(field(r, 'Funil do lead').props.value, '');
    assert.equal(field(r, 'Etapa do lead').props.value, '');
    await change(r, 'Nome', 'Novo contato'); await change(r, 'Telefone', '5511000000001'); await submit(r);
    const payload = f.calls.find(([a]) => a === 'save_lead')[1]; assert.equal(payload.pipeline_id, null); assert.equal(payload.stage_id, null);
  } finally { await act(async () => r.unmount()); }
});

test.after(() => rm(scratch, { recursive: true, force: true }));

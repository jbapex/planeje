import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import { build } from 'esbuild';
const root = new URL('../../', import.meta.url).pathname, require = createRequire('/tmp/planeje-crm-ui-qa/package.json');
const previousFetch = globalThis.fetch;
globalThis.fetch = () => { throw Error('Rede indisponível neste teste de interface.'); };
const React = require('react'), { act, create } = require('react-test-renderer'), scratch = await mkdtemp('/tmp/planeje-crm-ui-qa/crm-controls-');
await build({ stdin: { contents: `export {default as Conversations,CrmIaConversation as Conversation} from ${JSON.stringify(path.join(root, 'src/components/crm-ia/CrmIaConversations.jsx'))};export {default as Leads} from ${JSON.stringify(path.join(root, 'src/components/crm-ia/CrmIaLeads.jsx'))};export {MemoryRouter} from 'react-router-dom';`, resolveDir: root }, bundle: true, loader: { '.png': 'dataurl' }, format: 'cjs', platform: 'node', external: ['react'], outfile: path.join(scratch, 'ui.cjs'), plugins: [{ name: 'isolated-controls', setup(b) {
  b.onResolve({ filter: /^@\/components\/ui\/dialog$/ }, () => ({ path: 'dialog', namespace: 'fixture' }));
  b.onResolve({ filter: /AtendimentoComposer$/ }, () => ({ path: 'composer', namespace: 'fixture' }));
  b.onResolve({ filter: /CrmIaMessageMedia$/ }, () => ({ path: 'media', namespace: 'fixture' }));
  b.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path: name }) => ({ contents: name === 'dialog' ? `import React from 'react';export const Dialog=({open,children})=>open?React.createElement('div',null,children):null;export const DialogContent=({children,...props})=>React.createElement('section',{role:'dialog',...props},children);export const DialogTitle=({children})=>React.createElement('h2',null,children);export const DialogDescription=({children})=>React.createElement('p',null,children);` : name === 'composer' ? `import React from 'react';export default function Composer(p){return React.createElement('textarea',{'aria-label':p.messageLabel,value:p.value,onChange:e=>p.onChange(e.target.value)});}` : `export default function Media(){return null;}` }));
  b.onResolve({ filter: /^@\// }, ({ path: name }) => { const f = path.join(root, 'src', name.slice(2)); return { path: [f, f + '.js', f + '.jsx'].find(existsSync) }; });
} }] });
const { Conversation, Conversations, Leads, MemoryRouter } = require(path.join(scratch, 'ui.cjs'));
const workspace = { client: { id: 'client-a' }, permissions: { conversations: true }, channels: [{ id: 'channel-a', nome: 'Canal A', can_send: true }], people: [{ id: 'actor', full_name: 'Pessoa atual' }], pipelines: [{ id: 'pipeline-a', nome: 'Comercial' }], stages: [{ id: 'stage-a', pipeline_id: 'pipeline-a', nome: 'Entrada' }, { id: 'won', pipeline_id: 'pipeline-a', nome: 'Ganho', tipo: 'ganho' }], config: { data: {} } };
const lead = { id: 'lead-a', nome: 'Lead sintético', whatsapp: '5511000000000', pipeline_id: 'pipeline-a', stage_id: 'stage-a', updated_at: 'lead-v1' };
const text = n => typeof n === 'string' ? n : Array.isArray(n) ? n.map(text).join(' ') : n ? text(n.children ?? n.props?.children) : '';
const button = (r, label) => r.root.findAllByType('button').find(n => (n.props['aria-label'] || text(n.props.children)).trim().replace(/\s+/g, ' ') === label);
async function click(r, label) { const n = button(r, label); assert.ok(n, label); await act(async () => n.props.onClick?.()); }
const change = async (r, label, value) => act(async () => r.root.findByProps({ 'aria-label': label }).props.onChange({ target: { value } }));
const submit = async r => act(async () => r.root.findAllByProps({ role: 'dialog' }).at(-1).findByType('form').props.onSubmit({ preventDefault() {} }));
function fixture(overrides = {}) {
  const calls = [];
  async function api(action, payload) {
    calls.push([action, payload]); if (overrides[action]) return overrides[action](payload);
    if (action === 'conversations') return { rows: [{ contact_id: 'contact-a', channel_id: 'channel-a', attendance: 'human', nome: 'Contato sintético', updated_at: 'state-v1', assigned_to: 'actor' }], total: 1 };
    if (action === 'messages') return { rows: [{ id: 'sent-a', body: 'Resposta IA comprovada', from_me: true, can_flag: true, my_flag: null }, { id: 'manual', body: 'Manual', from_me: true, sender_kind: 'automation', can_flag: false }], total: 2 };
    if (action === 'conversation_context') return { status: 'linked', lead };
    if (action === 'notifications') return { rows: [{ id: 'lead_created:lead-a', type: 'lead_created', lead_id: 'lead-a', created_at: '2026-11-11T12:00:00Z', read: false }], total: 31, unread_count: 30, snapshot: { id: 'snapshot-fixture', watermark: { created_at: '2026-11-11T12:00:00Z', lead_id: 'lead-a' } } };
    if (action === 'queue') return { rows: [], total: 0 };
    if (action === 'schedule_message') return { status: 'pending', id: 'queue-a' };
    if (['mark_notifications_read', 'flag_ai_message', 'save_lead', 'move_lead'].includes(action)) return { ok: true };
    throw Error(action);
  }
  return { calls, api };
}
async function mount(f, page = false, extra = {}) {
  let renderer; const render = properties => React.createElement(MemoryRouter, { future: { v7_startTransition: true, v7_relativeSplatPath: true } }, React.createElement(page ? Conversations : Conversation, { api: f.api, mutate: f.api, workspace, revision: 0, canManage: true, profile: { id: 'actor' }, conversation: { contact_id: 'contact-a', channel_id: 'channel-a' }, ...properties }));
  await act(async () => { renderer = create(render(extra)); }); renderer.updateScope = async properties => act(async () => renderer.update(render({ ...extra, ...properties }))); return renderer;
}
test('feed interno usa cursor integral do snapshot e não pede permissão OS', async () => {
  const f = fixture(), r = await mount(f, true);
  try {
    await click(r, 'Notificações'); assert.match(text(r.toJSON()), /30/); assert.match(text(r.toJSON()), /Novo lead/);
    await click(r, 'Marcar todas como lidas');
    assert.deepEqual(f.calls.find(([action]) => action === 'mark_notifications_read')[1], { snapshot_id: 'snapshot-fixture' });
    assert.equal(f.calls.filter(([action]) => action === 'save_conversation').length, 0);
    assert.equal(r.root.findAllByType('a').some(n => /lead_id=lead-a/.test(n.props.href)), true);
  } finally { await act(async () => r.unmount()); }
});
test('sinalização oferece sete categorias, cancela sem gravar e envia ator somente pela sessão', async () => {
  const f = fixture(), r = await mount(f);
  try {
    assert.equal(r.root.findAllByType('button').filter(n => text(n.props.children) === 'Sinalizar IA').length, 1);
    await click(r, 'Sinalizar IA'); const select = r.root.findByProps({ 'aria-label': 'Motivo da sinalização' });
    assert.equal(select.findAllByType('option').length, 8);
    await change(r, 'Motivo da sinalização', 'too_long'); await change(r, 'Observação da sinalização', 'Somente esta pessoa vê esta revisão.');
    await click(r, 'Cancelar'); assert.equal(f.calls.filter(([action]) => action === 'flag_ai_message').length, 0);
    await click(r, 'Sinalizar IA'); await change(r, 'Motivo da sinalização', 'off_topic'); await submit(r);
    const payload = f.calls.find(([action]) => action === 'flag_ai_message')[1];
    assert.equal(payload.sent_id, 'sent-a'); assert.equal(payload.category, 'off_topic'); assert.equal(payload.contact_id, 'contact-a'); assert.equal(payload.channel_id, 'channel-a'); assert.equal(payload.actor_id, undefined);
  } finally { await act(async () => r.unmount()); }
});
test('automação legada sem prova de run mantém identidade distinta de equipe e não oferece avaliação', async () => {
  const f = fixture(), r = await mount(f);
  try {
    const legacy = r.root.findAllByType('li').find(item => item.findAllByType('p').some(p => text(p) === 'Manual'));
    assert.equal(legacy.findByType('strong').props.children, 'Automação');
    assert.equal(legacy.findAllByType('button').length, 0);
  } finally { await act(async () => r.unmount()); }
});
test('contexto separa responsável comercial e reutiliza gates de mudança da oportunidade', async () => {
  const f = fixture(), r = await mount(f);
  try {
    assert.ok(button(r, 'Alterar responsável comercial')); assert.match(text(r.toJSON()), /Comercial/);
    assert.match(text(r.toJSON()), /Atendente da conversa:.*Pessoa atual/);
    await click(r, 'Pegar para si'); await submit(r);
    assert.deepEqual(f.calls.find(([action]) => action === 'save_lead')[1], { id: 'lead-a', expected_updated_at: 'lead-v1', responsavel_id: 'actor' });
    await click(r, 'Alterar etapa'); await change(r, 'Etapa de destino', 'won'); await submit(r);
    assert.match(text(r.toJSON()), /motivo/i); assert.equal(f.calls.filter(([action]) => action === 'move_lead').length, 0);
    await change(r, 'Motivo', 'Oportunidade ganha em fixture'); await submit(r);
    assert.equal(f.calls.find(([action]) => action === 'move_lead')[1].reason, 'Oportunidade ganha em fixture');
  } finally { await act(async () => r.unmount()); }
});
test('nome e ícone da conversa abrem a mesma ficha autorizada, sem editor ou envio', async () => {
  const f = fixture(), r = await mount(f);
  try {
    const name = r.root.findAllByType('a').find(n => text(n.props.children) === 'Contato sintético');
    const icon = r.root.findAllByType('a').find(n => n.props['aria-label'] === 'Ver ficha do lead');
    assert.ok(name); assert.ok(icon); assert.equal(name.props.href, icon.props.href);
    assert.equal(name.props.href, '/crm-ia/leads?cliente=client-a&lead_id=lead-a');
    assert.equal(r.root.findAllByProps({ role: 'dialog' }).length, 0);
    assert.equal(f.calls.some(([action]) => /^(save_|send_|move_)/.test(action)), false);
    await r.updateScope({ workspace: { ...workspace, channels: [] } });
    assert.equal(r.root.findAllByType('a').length, 0);
  } finally { await act(async () => r.unmount()); }
});
test('troca de responsável comercial envia só o vínculo e a versão da oportunidade', async () => {
  const f = fixture(), r = await mount(f);
  try {
    await click(r, 'Alterar responsável comercial'); await change(r, 'Responsável comercial', 'actor'); await submit(r);
    assert.deepEqual(f.calls.find(([action]) => action === 'save_lead')[1], { id: 'lead-a', expected_updated_at: 'lead-v1', responsavel_id: 'actor' });
    assert.equal(f.calls.some(([action]) => action === 'save_conversation'), false);
  } finally { await act(async () => r.unmount()); }
});
test('contexto ambíguo não oferece um link ou edição para oportunidade inferida', async () => {
  const f = fixture({ conversation_context: () => ({ status: 'ambiguous', lead: null }) }), r = await mount(f);
  try {
    assert.equal(r.root.findAllByType('a').length, 0);
    assert.equal(button(r, 'Alterar etapa'), undefined);
    assert.match(text(r.toJSON()), /Mais de uma oportunidade/);
  } finally { await act(async () => r.unmount()); }
});
test('atendimento e resolver ficam visíveis no cabeçalho e usam a versão da conversa', async () => {
  const f = fixture({ save_conversation: () => ({ ok: true }) }), r = await mount(f);
  try {
    const toggle = button(r, 'Humano atende. Devolver para a IA'); assert.ok(toggle);
    for (let n = toggle.parent; n; n = n.parent) assert.notEqual(n.type, 'details');
    const resolve = button(r, 'Resolver conversa'); assert.ok(resolve);
    for (let n = resolve.parent; n; n = n.parent) assert.notEqual(n.type, 'details');
    assert.match(text(r.toJSON()), /\+55 11 00000-0000/);
    await click(r, 'Humano atende. Devolver para a IA');
    assert.deepEqual(f.calls.find(([action]) => action === 'save_conversation')[1], { contact_id: 'contact-a', channel_id: 'channel-a', attendance: 'ai', expected_updated_at: 'state-v1' });
  } finally { await act(async () => r.unmount()); }
});
test('carregar mensagens antigas acrescenta histórico sem trocar conversa ou apagar o rascunho', async () => {
  const f = fixture({ messages: p => ({ rows: p.offset ? [{ id: 'old', body: 'Mensagem antiga', created_at: '2026-11-10T10:00Z' }, { id: 'middle', body: 'Mensagem do meio', created_at: '2026-11-11T10:00Z' }] : [{ id: 'middle', body: 'Mensagem do meio', created_at: '2026-11-11T10:00Z' }, { id: 'new', body: 'Mensagem recente', created_at: '2026-11-11T11:00Z' }], total: 3 }) }), r = await mount(f);
  try {
    await change(r, 'Mensagem ao contato', 'Rascunho preservado'); await click(r, 'Carregar mensagens antigas');
    const bodies = r.root.findAllByType('p').map(text).filter(t => /^Mensagem (antiga|do meio|recente)$/.test(t));
    assert.deepEqual(bodies, ['Mensagem antiga', 'Mensagem do meio', 'Mensagem recente']);
    assert.equal(r.root.findByProps({ 'aria-label': 'Mensagem ao contato' }).props.value, 'Rascunho preservado');
    assert.deepEqual(f.calls.filter(([action]) => action === 'messages').at(-1)[1], { contact_id: 'contact-a', channel_id: 'channel-a', offset: 2, limit: 50 });
    assert.equal(button(r, 'Anterior'), undefined); assert.equal(button(r, 'Próxima'), undefined);
  } finally { await act(async () => r.unmount()); }
});
test('autoria comprovada aparece sob a mensagem e legado não usa o atendente atual como remetente', async () => {
  const f = fixture({ messages: () => ({ rows: [{ id: 'human', body: 'Envio humano', from_me: true, sender_kind: 'human', sender_name: 'Bia de demonstração' }, { id: 'unknown', body: 'Envio legado', from_me: true, sender_kind: 'unknown', sender_name: 'Nome sem prova' }], total: 2 }) }), r = await mount(f);
  try {
    const labels = r.root.findAllByType('li').map(item => text(item.findByType('strong')));
    assert.deepEqual(labels, ['Bia de demonstração', 'Equipe · autor não identificado']);
    assert.doesNotMatch(text(r.toJSON()), /Nome sem prova/);
  } finally { await act(async () => r.unmount()); }
});
test('resposta antiga de carregar histórico não volta a exibir um canal revogado', async () => {
  let finish;
  const f = fixture({ messages: p => p.offset ? new Promise(resolve => { finish = resolve; }) : ({ rows: [{ id: 'recent', body: 'Mensagem autorizada', created_at: '2026-11-11T11:00Z' }], total: 2 }) }), r = await mount(f);
  let pending;
  try {
    await act(async () => { pending = button(r, 'Carregar mensagens antigas').props.onClick(); });
    await r.updateScope({ workspace: { ...workspace, channels: [] } });
    await act(async () => { finish({ rows: [{ id: 'late', body: 'Histórico fora do acesso atual' }], total: 2 }); await pending; });
    assert.doesNotMatch(text(r.toJSON()), /Mensagem autorizada|Histórico fora do acesso atual/);
    assert.equal(r.root.findAllByType('textarea').length, 0);
  } finally { await act(async () => r.unmount()); }
});
test('retomar após sessenta mensagens novas permite carregar todo o intervalo sem repetir a mesma página', async () => {
  const originalInterval = globalThis.setInterval;
  let poll, background = false, r;
  globalThis.setInterval = (callback, ms, ...args) => ms === 5000 ? (poll = callback, 0) : originalInterval(callback, ms, ...args);
  const f = fixture({ messages: p => {
    const total = background ? 110 : 50;
    const rows = Array.from({ length: total }, (_, i) => ({ id: String(i + 1).padStart(3, '0'), body: `Registro ${i + 1}`, created_at: new Date(Date.UTC(2026, 10, 11, 10, i)).toISOString() })).reverse();
    return { rows: rows.slice(p.offset, p.offset + p.limit).reverse(), total };
  } });
  try {
    r = await mount(f); await change(r, 'Mensagem ao contato', 'Continua aqui');
    background = true; await act(async () => poll());
    assert.equal(r.root.findAllByType('li').length, 50);
    await click(r, 'Carregar mensagens antigas'); assert.equal(r.root.findAllByType('li').length, 100);
    await click(r, 'Carregar mensagens antigas'); assert.equal(r.root.findAllByType('li').length, 110);
    assert.equal(button(r, 'Carregar mensagens antigas'), undefined);
    assert.equal(r.root.findByProps({ 'aria-label': 'Mensagem ao contato' }).props.value, 'Continua aqui');
    assert.deepEqual(f.calls.filter(([action, p]) => action === 'messages' && p.offset > 0).map(([, p]) => p.offset), [50, 100]);
  } finally { globalThis.setInterval = originalInterval; if (r) await act(async () => r.unmount()); }
});
test('página sem mensagens novas atualiza a janela antes de tentar carregar de novo', async () => {
  let reads = 0;
  const all = [1, 2, 3, 4].map(n => ({ id: String(n), body: `Mensagem ${n}`, created_at: `2026-11-11T10:0${n}:00Z` }));
  const f = fixture({ messages: p => ({ rows: p.offset ? all.slice(2) : ++reads > 1 ? all : all.slice(2), total: 4 }) }), r = await mount(f);
  try {
    await change(r, 'Mensagem ao contato', 'Rascunho durante atualização'); await click(r, 'Carregar mensagens antigas');
    assert.equal(r.root.findAllByType('li').length, 4);
    assert.deepEqual(f.calls.filter(([action]) => action === 'messages').map(([, p]) => p.offset), [0, 2, 0]);
    assert.equal(r.root.findByProps({ 'aria-label': 'Mensagem ao contato' }).props.value, 'Rascunho durante atualização');
  } finally { await act(async () => r.unmount()); }
});
test('ficha selecionada usa colunas próprias e abre a mudança pela etapa do funil', async () => {
  const f = fixture({ lead: () => ({ lead, conversations: [{ contact_id: 'contact-a', channel_id: 'channel-a' }] }), leads: () => ({ rows: [lead], total: 1 }) });
  let r;
  await act(async () => { r = create(React.createElement(MemoryRouter, { initialEntries: ['/?lead_id=lead-a'], future: { v7_startTransition: true, v7_relativeSplatPath: true } }, React.createElement(Leads, { api: f.api, mutate: f.api, workspace, client: workspace.client, profile: { id: 'actor' }, canManage: true, revision: 0 }))); });
  try {
    assert.equal(r.root.findAllByType('table').length, 0);
    assert.equal(f.calls.filter(([action]) => action === 'leads').length, 0);
    assert.equal(r.root.findAllByProps({ 'aria-label': 'Conversa do lead' }).length, 1);
    assert.equal(r.root.findAllByProps({ 'aria-label': 'Ver ficha do lead' }).length, 0);
    await click(r, 'Mover para Ganho');
    assert.equal(r.root.findByProps({ 'aria-label': 'Etapa de destino' }).props.value, 'won');
    await submit(r); assert.match(text(r.toJSON()), /motivo/i);
    assert.equal(f.calls.filter(([action]) => action === 'move_lead').length, 0);
    await click(r, 'Cancelar'); await click(r, 'Fechar ficha');
    assert.equal(r.root.findAllByType('table').length, 1);
  } finally { await act(async () => r.unmount()); }
});
test('sinalização própria aparece em badge e revisão envia a versão existente', async () => {
  const own = { id: 'flag-a', category: 'too_long', note: 'Minha observação', updated_at: 'flag-v1' };
  const f = fixture({ messages: () => ({ rows: [{ id: 'sent-a', body: 'Resposta IA comprovada', from_me: true, can_flag: true, my_flag: own }], total: 1 }) }), r = await mount(f);
  try {
    assert.match(text(r.toJSON()), /Longa demais/); await click(r, 'Editar sinalização IA');
    assert.equal(r.root.findByProps({ 'aria-label': 'Observação da sinalização' }).props.value, 'Minha observação');
    await change(r, 'Motivo da sinalização', 'wrong_tool'); await submit(r);
    assert.equal(f.calls.find(([action]) => action === 'flag_ai_message')[1].expected_updated_at, 'flag-v1');
  } finally { await act(async () => r.unmount()); }
});
test('preset agenda uma vez direto pela fila e data customizada pode cancelar sem gravação', async () => {
  const f = fixture(), r = await mount(f);
  try {
    await change(r, 'Mensagem ao contato', 'Rascunho sintético'); await click(r, 'Agendar para');
    const preset = r.root.findAllByType('button').find(n => /^Amanhã às 9h/.test(text(n.props.children))); assert.ok(preset);
    await act(async () => { const result = preset.props.onClick(); preset.props.onClick(); await result; });
    const calls = f.calls.filter(([action]) => action === 'schedule_message'); assert.equal(calls.length, 1); assert.match(calls[0][1].scheduled_at, /^\d{4}-/); assert.equal(calls[0][1].channel_id, 'channel-a');
    assert.equal(f.calls.filter(([action]) => action === 'send_message').length, 0);
    await change(r, 'Mensagem ao contato', 'Outra mensagem'); await click(r, 'Programar mensagem'); await click(r, 'Cancelar');
    assert.equal(f.calls.filter(([action]) => action === 'schedule_message').length, 1); assert.equal(r.root.findByProps({ 'aria-label': 'Mensagem ao contato' }).props.value, 'Outra mensagem');
  } finally { await act(async () => r.unmount()); }
});
test('revogar canal remove contexto e qualquer editor aberto imediatamente', async () => {
  const f = fixture(), r = await mount(f);
  try {
    await click(r, 'Sinalizar IA'); assert.equal(r.root.findAllByProps({ role: 'dialog' }).length, 1);
    await r.updateScope({ workspace: { ...workspace, channels: [] } });
    assert.equal(r.root.findAllByProps({ role: 'dialog' }).length, 0); assert.doesNotMatch(text(r.toJSON()), /Lead sintético|Resposta IA comprovada/);
  } finally { await act(async () => r.unmount()); }
});
test('perder acesso à ficha remove conversa e editor que continham dados do lead', async () => {
  let denied = false;
  const f = fixture({ lead: () => { if (denied) throw Error('Lead indisponível ou sem acesso.'); return { lead, conversations: [{ contact_id: 'contact-a', channel_id: 'channel-a' }] }; }, leads: () => ({ rows: [lead], total: 1 }) });
  let r; const render = revision => React.createElement(MemoryRouter, { initialEntries: ['/?lead_id=lead-a'], future: { v7_startTransition: true, v7_relativeSplatPath: true } }, React.createElement(Leads, { api: f.api, mutate: f.api, workspace, client: workspace.client, profile: { id: 'actor' }, canManage: true, revision }));
  await act(async () => { r = create(render(0)); });
  try {
    await click(r, 'Editar lead'); assert.ok(r.root.findAllByProps({ role: 'dialog' }).length); assert.match(text(r.toJSON()), /Resposta IA comprovada/);
    denied = true; await act(async () => r.update(render(1)));
    assert.equal(r.root.findAllByProps({ role: 'dialog' }).length, 0); assert.doesNotMatch(text(r.toJSON()), /Resposta IA comprovada/);
  } finally { await act(async () => r.unmount()); }
});
test('rejeição atual do servidor oculta nome, histórico e sinalização já aberta', async () => {
  let denied = false;
  const f = fixture({ messages: () => { if (denied) throw Error('Sem acesso ao contato ou canal.'); return { rows: [{ id: 'sent-a', body: 'Conteúdo protegido', from_me: true, can_flag: true }], total: 1 }; } });
  const r = await mount(f, false, { conversation: { contact_id: 'contact-a', channel_id: 'channel-a', nome: 'Nome protegido' } });
  try {
    await click(r, 'Sinalizar IA'); denied = true; await r.updateScope({ revision: 1 });
    assert.equal(r.root.findAllByProps({ role: 'dialog' }).length, 0); assert.doesNotMatch(text(r.toJSON()), /Nome protegido|Contato sintético|Conteúdo protegido|Lead sintético/);
    assert.equal(r.root.findAllByType('textarea').length, 0);
  } finally { await act(async () => r.unmount()); }
});
test.after(async () => { globalThis.fetch = previousFetch; await rm(scratch, { recursive: true, force: true }); });

import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import { build } from 'esbuild';

const root = new URL('../../', import.meta.url).pathname;
const fixturePath = path.join(root, 'scripts/crm-ia/preview/fixture.js');
assert.ok(existsSync(fixturePath), 'A prévia precisa de um transporte isolado com o contrato real do CRM.');
const { createCrmPreview, PREVIEW_IDS, rejectPreviewNetwork } = await import('./preview/fixture.js');
const A = PREVIEW_IDS.clientA;

test('a prévia mantém nomes nativos, UUIDs e as duas contas separadas', async () => {
  const preview = createCrmPreview();
  const bootstrap = await preview.request('bootstrap'); assert.equal(bootstrap.clients.length, 2);
  const workspace = await preview.request('workspace', A);
  assert.equal(workspace.client.id, A); assert.ok(workspace.pipelines[0].nome); assert.ok(workspace.stages[0].color);
  assert.equal(workspace.config.data.attendance.auto_send, false); assert.equal(workspace.agents.length, 3);
  assert.ok(workspace.channels[0].instance_name); assert.equal(workspace.channels[0].nome, undefined);
  assert.equal(workspace.products[0].name, 'Serviço de demonstração'); assert.equal(workspace.products[0].item_tipo, 'servico');
  await assert.rejects(preview.request('messages', A, { contact_id: PREVIEW_IDS.contactB, channel_id: PREVIEW_IDS.channelA }), /contato/i);
  await assert.rejects(preview.request('messages', A, { contact_id: PREVIEW_IDS.contactA, channel_id: PREVIEW_IDS.channelB }), /canal/i);
});

test('edição tem conflito de versão, ganho exige motivo e importação é idempotente', async () => {
  const preview = createCrmPreview(); const original = (await preview.request('leads', A)).rows[0];
  const edited = await preview.request('save_lead', A, { id: original.id, nome: 'Pessoa revisada', expected_updated_at: original.updated_at }); assert.equal(edited.nome, 'Pessoa revisada');
  await assert.rejects(preview.request('save_lead', A, { id: original.id, nome: 'Concorrente', expected_updated_at: original.updated_at }), /versão/i);
  await assert.rejects(preview.request('move_lead', A, { id: edited.id, stage_id: PREVIEW_IDS.wonA, expected_updated_at: edited.updated_at }), /motivo/i);
  const moved = await preview.request('move_lead', A, { id: edited.id, stage_id: PREVIEW_IDS.wonA, reason: 'Confirmação fictícia', expected_updated_at: edited.updated_at }); assert.equal(moved.stage_id, PREVIEW_IDS.wonA);
  const payload = { request_id: '99999999-9999-4999-8999-999999999999', rows: [{ nome: 'Importação fictícia', whatsapp: '5511000000099', pipeline_id: PREVIEW_IDS.pipelineA, stage_id: PREVIEW_IDS.stageA }] };
  assert.deepEqual(await preview.request('import_leads', A, payload), { created: 1, preserved: 0, ok: true });
  assert.deepEqual(await preview.request('import_leads', A, payload), { created: 1, preserved: 0, ok: true });
});

test('fila agenda sem enviar e compromisso recusa reserva duplicada e chave ausente', async () => {
  const preview = createCrmPreview({ now: '2026-11-11T03:00:00Z' });
  const request = { contact_id: PREVIEW_IDS.contactA, channel_id: PREVIEW_IDS.channelA, body: 'Texto sintético', scheduled_at: '2026-11-12T15:00:00Z', request_id: '88888888-8888-4888-8888-888888888888' };
  const before = (await preview.request('messages', A, request)).total;
  const queued = await preview.request('schedule_message', A, request); assert.equal(queued.status, 'pending');
  assert.equal((await preview.request('messages', A, request)).total, before); await preview.request('cancel_message', A, { id: queued.id });
  assert.equal((await preview.request('queue', A)).rows.find(row => row.id === queued.id).status, 'cancelled');
  const slots = await preview.request('slots', A, { owner_id: PREVIEW_IDS.person, date: '2026-11-12' }); const slot = slots.rows[0]; assert.ok(slot);
  const appointment = { ...slot, lead_id: PREVIEW_IDS.leadA, contact_id: PREVIEW_IDS.contactA, title: 'Reserva de teste' };
  await assert.rejects(preview.request('save_appointment', A, appointment), /identificador/i);
  await preview.request('save_appointment', A, { ...appointment, request_id: '77777777-7777-4777-8777-777777777777' });
  await assert.rejects(preview.request('save_appointment', A, { ...appointment, request_id: '66666666-6666-4666-8666-666666666666' }), /horário/i);
});

test('cenários de erro, vazio e acesso recusado não caem em transporte real', async () => {
  const denied = createCrmPreview({ state: 'forbidden' }); await assert.rejects(denied.request('bootstrap'), /acesso/i);
  const empty = createCrmPreview({ state: 'vazio' }); assert.equal((await empty.request('leads', A)).total, 0);
  const broken = createCrmPreview({ state: 'erro' }); await assert.rejects(broken.request('leads', A), /simulada/i); assert.ok((await broken.request('leads', A)).total > 0);
  await assert.rejects(rejectPreviewNetwork('https://example.invalid/private'), /bloqueada/i);
});

test('prévia separa rascunho e publicação, rejeita revisão antiga e permite descarte', async () => {
  const preview = createCrmPreview();
  const workspace = await preview.request('workspace', A), agent = workspace.agents[0], scope = { agent_id: agent.id };
  const opened = await preview.request('agent_draft', A, scope);
  const saved = await preview.request('save_agent_draft', A, { ...scope, revision: opened.revision, data: { ...agent, nome: 'Nome em rascunho', expected_updated_at: agent.updated_at } });
  assert.equal((await preview.request('workspace', A)).agents[0].nome, agent.nome);
  await assert.rejects(preview.request('save_agent_draft', A, { ...scope, revision: opened.revision, data: {} }), /versão|rascunho/i);
  const published = await preview.request('publish_agent_draft', A, { ...scope, revision: saved.revision });
  assert.equal(published.agent.nome, 'Nome em rascunho');
  await assert.rejects(preview.request('save_agent_draft', A, { ...scope, revision: saved.revision, data: {} }), /versão|rascunho/i);
  const reopened = await preview.request('agent_draft', A, scope);
  const pending = await preview.request('save_agent_draft', A, { ...scope, revision: reopened.revision, data: { nome: '' } });
  await preview.request('discard_agent_draft', A, { ...scope, revision: pending.revision });
  assert.equal((await preview.request('agent_draft', A, scope)).draft, null);
  assert.equal((await preview.request('workspace', A)).agents[0].nome, 'Nome em rascunho');
});

test('prévia da agenda devolve resumo completo e marca ausência sem programar recuperação desligada', async () => {
  const preview = createCrmPreview({ now: '2026-11-11T20:00:00Z' });
  const result = await preview.request('agenda', A, { since: '2026-11-11', until: '2026-11-11', limit: 1 });
  assert.deepEqual(result.summary, { scheduled: 1, confirmed: 0, cancelled: 0, no_show: 0 });
  const item = result.rows[0];
  const changed = await preview.request('mark_appointment_no_show', A, { id: item.id, expected_updated_at: item.updated_at });
  assert.equal(changed.status, 'no_show'); assert.equal(changed.recovery.armed, false);
  assert.equal((await preview.request('agenda', A)).summary.no_show, 1);
  assert.equal((await preview.request('queue', A)).total, 1);
});

test('workspace real monta as dez telas com os aliases da prévia e rede bloqueada', async () => {
  const require = createRequire('/tmp/planeje-crm-ui-qa/package.json'); const React = require('react'); const { act, create } = require('react-test-renderer');
  const directory = await mkdtemp('/tmp/planeje-crm-ui-qa/crm-preview-'); const previousFetch = globalThis.fetch;
  globalThis.fetch = rejectPreviewNetwork;
  try {
    const config = (await import('./preview/vite.config.mjs')).default;
    await build({ stdin: { contents: `export {default as Workspace} from ${JSON.stringify(path.join(root, 'src/components/crm-ia/CrmIaWorkspace.jsx'))};export {MemoryRouter} from 'react-router-dom';`, resolveDir: root }, outfile: path.join(directory, 'bundle.cjs'), bundle: true, platform: 'node', format: 'cjs', external: ['react'], loader: { '.css': 'empty', '.jpg': 'dataurl', '.png': 'dataurl' }, define: { 'import.meta.env': '{}' }, plugins: [{ name: 'preview-aliases', setup(b) {
      b.onResolve({ filter: /^@\// }, ({ path: name }) => {
        const alias = config.resolve.alias.find(item => name === item.find || name.startsWith(item.find + '/'));
        const file = alias ? name.replace(alias.find, alias.replacement) : path.join(root, 'src', name.slice(2));
        return { path: [file, file + '.jsx', file + '.js'].find(existsSync) };
      });
    } }] });
    const { Workspace, MemoryRouter } = require(path.join(directory, 'bundle.cjs'));
    for (const section of ['painel', 'funil', 'leads', 'conversas', 'agentes', 'agenda', 'disparos', 'rastreabilidade', 'modelos', 'configuracoes']) {
      let renderer; await act(async () => { renderer = create(React.createElement(MemoryRouter, { initialEntries: [`/crm-ia/${section}?cliente=${A}`], future: { v7_startTransition: true, v7_relativeSplatPath: true } }, React.createElement(Workspace))); });
      const shown = JSON.stringify(renderer.toJSON()); assert.match(shown, /CRM IA/); assert.doesNotMatch(shown, /Não foi possível|Sem acesso a esta conta/); await act(async () => renderer.unmount());
    }
  } finally { globalThis.fetch = previousFetch; await rm(directory, { recursive: true, force: true }); }
});

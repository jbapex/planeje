import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { build } from 'esbuild';

const root = new URL('../../', import.meta.url).pathname;
const require = createRequire('/tmp/planeje-crm-ui-qa/package.json');
const React = require('react');
const { act, create } = require('react-test-renderer');
const scratch = await mkdtemp('/tmp/planeje-crm-ui-qa/notification-editor-');
await build({
  stdin: { contents: `export {default as Agents} from ${JSON.stringify(path.join(root, 'src/components/crm-ia/CrmIaAgents.jsx'))};export {CrmIaQueue as Queue} from ${JSON.stringify(path.join(root, 'src/components/crm-ia/CrmIaPrimitives.jsx'))};export {MemoryRouter} from 'react-router-dom';`, resolveDir: root },
  bundle: true, platform: 'node', format: 'cjs', outfile: path.join(scratch, 'editor.cjs'), external: ['react'],
  plugins: [{ name: 'fixture-dialog', setup(builder) {
    builder.onResolve({ filter: /^@\/components\/ui\/dialog$/ }, () => ({ path: 'dialog', namespace: 'fixture' }));
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: `import React from 'react';export const Dialog=({children})=>React.createElement('div',null,children);export const DialogContent=({children,...props})=>React.createElement('section',props,children);export const DialogTitle=({children})=>React.createElement('h2',null,children);export const DialogDescription=({children})=>React.createElement('p',null,children);` }));
    builder.onResolve({ filter: /^@\// }, ({ path: name }) => { const file = path.join(root, 'src', name.slice(2)); return { path: [file, file + '.js', file + '.jsx'].find(existsSync) }; });
  } }],
});
const { Agents, MemoryRouter, Queue } = require(path.join(scratch, 'editor.cjs'));
const owner = '10000000-0000-4000-8000-000000000001';
const workspace = {
  client: { id: 'synthetic-account' }, agents: [], pipelines: [{ id: 'pipeline', nome: 'Funil sintético' }],
  stages: [], bases: [], products: [], people: [{ id: owner, full_name: 'Responsável sintético' }],
  config: { revision: 'cfg', data: {} },
};
const text = node => typeof node === 'string' ? node : Array.isArray(node) ? node.map(text).join(' ') : node ? text(node.children ?? node.props?.children) : '';
const button = (renderer, label) => renderer.root.findAllByType('button').find(node => (node.props['aria-label'] || text(node.props.children).trim()) === label);
async function click(renderer, label) {
  const target = button(renderer, label); assert.ok(target, `Botão ${label}`);
  await act(async () => target.props.onClick?.());
}
async function change(renderer, label, value) {
  await act(async () => renderer.root.findByProps({ 'aria-label': label }).props.onChange({ target: { value, checked: value } }));
}
async function submit(renderer) {
  await act(async () => renderer.root.findAllByType('form').at(-1).props.onSubmit({ preventDefault() {} }));
}
function fixture({ published, draft } = {}) {
  const calls = []; let revision = 'draft-0', saved = draft;
  return { calls, get saved() { return saved; }, async api(action, payload) {
    calls.push([action, payload]);
    if (action === 'usage') return {};
    if (action === 'capabilities') return { audio: { available: true, input_available: true } };
    if (action === 'agent_draft') return { revision, published, draft: saved && (!payload.tipo || saved.funil?.crm_ia?.tipo === payload.tipo) ? { payload: saved, revision } : null };
    if (action === 'save_agent_draft') { assert.equal(payload.revision, revision); saved = payload.data; revision += 'x'; return { revision }; }
    if (action === 'publish_agent_draft') {
      assert.equal(payload.revision, revision);
      if ((saved.funil.crm_ia.profiles || []).some(profile => !profile.nome.trim() || !profile.descricao.trim())) throw new Error('Preencha nome e descrição de cada perfil.');
      return { published: true, agent: { id: 'published-agent', ...saved } };
    }
    if (action === 'discard_agent_draft') { saved = null; revision += 'd'; return { discarded: true, revision }; }
    throw new Error(`Operação externa proibida no teste: ${action}`);
  } };
}
async function mount(fixture, extra = {}, rendererOptions = {}) {
  let renderer;
  await act(async () => { renderer = create(React.createElement(MemoryRouter, { future: { v7_startTransition: true, v7_relativeSplatPath: true } }, React.createElement(Agents, { api: fixture.api, mutate: fixture.api, workspace, canManage: true, ...extra })), rendererOptions); });
  return renderer;
}
test('avisos desligados por padrão, rascunho incompleto e destinatário explícito persistem', async () => {
 const api=fixture(), renderer=await mount(api);
 try {
  await click(renderer,'Configurar Qualificação');
  assert.equal(renderer.root.findByProps({'aria-label':'Enviar resumo por WhatsApp ao concluir'}).props.checked,false);
  await change(renderer,'Enviar resumo por WhatsApp ao concluir',true);
  await change(renderer,'Destinatário do resumo','person');
  await click(renderer,'Cancelar');
  assert.equal(api.saved.funil.crm_ia.notification.enabled,true);
  assert.equal(api.saved.funil.crm_ia.notification.recipient.type,'person');
  assert.equal(api.saved.funil.crm_ia.notification.recipient.person_id,null);
  await click(renderer,'Configurar Qualificação');await change(renderer,'Pessoa destinatária do resumo',owner);await click(renderer,'Cancelar');
  assert.equal(api.saved.funil.crm_ia.notification.recipient.person_id,owner);
  assert.equal(api.calls.some(([action])=>action==='publish_agent_draft'),false);
 }finally{await act(async()=>renderer.unmount());}
});
test('outro número remove pessoa e agenda oferece aviso ao titular sem voz adicional', async () => {
 const api=fixture(), renderer=await mount(api);
 try {
  await click(renderer,'Configurar Qualificação');await change(renderer,'Enviar resumo por WhatsApp ao concluir',true);await change(renderer,'Destinatário do resumo','phone');
  await change(renderer,'WhatsApp destinatário do resumo','(11) 00000-0003');await click(renderer,'Cancelar');
  assert.deepEqual(api.saved.funil.crm_ia.notification.recipient,{type:'phone',person_id:null,phone:'(11) 00000-0003'});
  await click(renderer,'Configurar Agendamentos');assert.equal(renderer.root.findByProps({'aria-label':'Avisar titular do compromisso por WhatsApp'}).props.checked,false);
  await change(renderer,'Avisar titular do compromisso por WhatsApp',true);await click(renderer,'Cancelar');assert.equal(api.saved.funil.crm_ia.agendamento.notify_owner,true);
 }finally{await act(async()=>renderer.unmount());}
});
test('fila mostra destinatário e lead fonte como identidades distintas',async()=>{
 let renderer;
 await act(async()=>{renderer=create(React.createElement(Queue,{api:async()=>({total:1,rows:[{id:'notice',kind:'notification',status:'pending',body:'Resumo',recipient_label:'Equipe QA',recipient_phone:'5511000000000',source_lead:{id:'lead',nome:'Lead fonte'},contact:{id:'source',nome:'Contato fonte'}}]}),mutate:async()=>{},canManage:true}));});
 try{const value=text(renderer.toJSON());assert.match(value,/Destinatário: Equipe QA/);assert.match(value,/Lead fonte: Lead fonte/);assert.match(value,/Aviso interno/);}finally{await act(async()=>renderer.unmount());}
});
test.after(async()=>rm(scratch,{recursive:true,force:true}));

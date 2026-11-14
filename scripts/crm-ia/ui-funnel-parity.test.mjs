import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import { build } from 'esbuild';
import { createCrmPreview, PREVIEW_IDS } from './preview/fixture.js';

const root = new URL('../../', import.meta.url).pathname;
const require = createRequire('/tmp/planeje-crm-ui-qa/package.json');
const React = require('react'), { act, create } = require('react-test-renderer');
const scratch = await mkdtemp('/tmp/planeje-crm-ui-qa/funnel-parity-');
await build({ stdin: { contents: `export {default as Leads} from ${JSON.stringify(path.join(root, 'src/components/crm-ia/CrmIaLeads.jsx'))};export {MemoryRouter,useLocation} from 'react-router-dom';`, resolveDir: root },
  bundle: true, loader: { '.png': 'dataurl' }, platform: 'node', format: 'cjs', outfile: path.join(scratch, 'ui.cjs'), external: ['react'],
  plugins: [{ name: 'offline-layers', setup(b) {
    b.onResolve({ filter: /^@\/components\/ui\/(dialog|popover)$/ }, ({ path: name }) => ({ path: name.endsWith('dialog') ? 'dialog' : 'popover', namespace: 'fixture' }));
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path: name }) => ({ contents: name === 'dialog'
      ? `import React from 'react';export const Dialog=({open,children})=>open?React.createElement('div',null,children):null;export const DialogContent=({children,...props})=>React.createElement('section',{...props,role:'dialog'},children);export const DialogTitle=({children})=>React.createElement('h2',null,children);export const DialogDescription=({children})=>React.createElement('p',null,children);`
      : `import React from 'react';const C=React.createContext();export const Popover=({open,onOpenChange,children})=>React.createElement(C.Provider,{value:{open,onOpenChange}},children);export const PopoverTrigger=({children})=>{const c=React.useContext(C);return React.cloneElement(children,{onClick:()=>c.onOpenChange(!c.open)});};export const PopoverContent=({children,...props})=>React.useContext(C).open?React.createElement('aside',{...props,role:'dialog'},children):null;` }));
    b.onResolve({ filter: /^@\// }, ({ path: name }) => { const file = path.join(root, 'src', name.slice(2)); return { path: [file, file + '.jsx', file + '.js'].find(existsSync) }; });
  } }],
});
const { Leads, MemoryRouter, useLocation } = require(path.join(scratch, 'ui.cjs'));
const client = { id: 'client-a', empresa: 'Conta sintética' };
const base = { client, provisioned: true, permissions: { manage: true, conversations: false },
  pipelines: [{ id: 'pipeline-a', nome: 'Principal', crm_ia_default: true, updated_at: 'pipeline-version' }],
  stages: [{ id: 'stage-a', pipeline_id: 'pipeline-a', nome: 'Entrada', ordem: 0, color: '#286fc9', tipo: 'intermediaria', crm_ia_icon: 'inbox', updated_at: 'stage-version' }],
  people: [], channels: [], config: { revision: 'config-version', data: {} } };
const text = n => typeof n === 'string' ? n : Array.isArray(n) ? n.map(text).join(' ') : n ? text(n.children ?? n.props?.children) : '';
const button = (r, label) => r.root.findAllByType('button').find(n => (n.props['aria-label'] || text(n.props.children)).trim().replace(/\s+/g, ' ') === label);
const click = async (r, label) => { const n = button(r, label); assert.ok(n, `Botão disponível: ${label}`); await act(async () => n.props.onClick?.()); };
const change = async (r, label, value) => act(async () => r.root.findByProps({ 'aria-label': label }).props.onChange({ target: { value, checked: value } }));
const submit = async r => act(async () => r.root.findAllByType('form').at(-1).props.onSubmit({ preventDefault() {} }));
function RouteReceipt() { return React.createElement('output', { 'aria-label':'URL do Funil' }, useLocation().search); }
const route = r => text(r.root.findByProps({'aria-label':'URL do Funil'}));
async function openConfig(r, name = 'Principal') { await click(r,'Configuração'); await click(r,`Editar funil ${name}`); }
async function mount(workspace = base, overrides = {}, initialEntry = '/crm-ia/funil?cliente=client-a') {
  const calls = [];
  const api = async (action, payload = {}) => {
    calls.push([action, payload]);
    if (overrides[action]) return overrides[action](payload);
    if (action === 'leads') return { rows: [], total: 0, stage_totals: [] };
    if (['save_stage', 'save_pipeline', 'reorder_stages', 'delete_stage', 'delete_pipeline'].includes(action)) return { ok: true };
    throw new Error('Ação fora da fixture: ' + action);
  };
  let r;
  const render = props => React.createElement(MemoryRouter, { initialEntries: [initialEntry], future: { v7_startTransition: true, v7_relativeSplatPath: true } }, React.createElement(React.Fragment,null,React.createElement(Leads, { api, mutate: api, workspace, client, profile: { id: 'person-a' }, revision: 0, canManage: true, kanban: true, ...props }),React.createElement(RouteReceipt)));
  await act(async () => { r = create(render({})); });
  r.calls = calls;
  r.updateScope = props => act(async () => r.update(render(props)));
  return r;
}

test('ícones agrupados oferecem os29 nomes observados e selecionar não grava antes de confirmar', async () => {
  const r = await mount();
  try {
    await openConfig(r); await click(r, 'Editar Entrada'); await click(r, 'Escolher ícone da etapa');
    for (const label of ['Caixa de entrada','Novo contato','Site','Conversa','Ligação','WhatsApp','E-mail','Alvo','Lista','Funil','Estrela','Calendário','Relógio','Ampulheta','Local','Empresa','Documento','Contrato','Recibo','Prancheta','Pagamento','Etiqueta','Loja','Retomada','Pausa','Concluído','Aprovado','Perdido','Arquivado']) assert.ok(button(r,label),label);
    await click(r, 'Documento');
    assert.equal(r.calls.some(([action]) => action === 'save_stage'), false);
    await submit(r);
    assert.deepEqual(r.calls.find(([action]) => action === 'save_stage')[1], { id:'stage-a', expected_updated_at:'stage-version', nome:'Entrada', pipeline_id:'pipeline-a', color:'#286fc9', tipo:'intermediaria', ordem:0, icon:'file-text' });
  } finally { await act(async () => r.unmount()); }
});

for (const icon of ['legacy-vendor-icon','phone']) test(`renomear conserva o ícone ${icon} sem substituição silenciosa`, async () => {
  const r = await mount({ ...base, stages: [{ ...base.stages[0], crm_ia_icon: icon }] });
  try {
    await openConfig(r); await click(r,'Editar Entrada'); await change(r,'Nome','Entrada atualizada'); await submit(r);
    const payload = r.calls.find(([action]) => action === 'save_stage')?.[1];
    assert.ok(payload); assert.equal(payload.nome,'Entrada atualizada'); assert.equal(Object.hasOwn(payload,'icon'),false);
  } finally { await act(async () => r.unmount()); }
});

test('etapa sem ícone conserva Círculo no editor, sem sugerir outro ícone antes de alterar', async () => {
  const r=await mount({...base,stages:[{...base.stages[0],crm_ia_icon:null}]});
  try {
    await openConfig(r);await click(r,'Editar Entrada');
    assert.equal(button(r,'Escolher ícone da etapa').props.title,'Círculo');
  } finally { await act(async()=>r.unmount()); }
});

test('Configuração usa índice/detalhe na página e URL própria sem substituir filtros Kanban', async () => {
  const r = await mount(base,{},'/crm-ia/funil?cliente=client-a&pipeline_id=other&search=quente&offset=20');
  try {
    await click(r,'Configuração');
    assert.equal(r.root.findAllByProps({role:'dialog'}).length,0);
    assert.match(route(r),/funil_tab=configuracao/); assert.match(route(r),/pipeline_id=other/); assert.match(route(r),/search=quente/);
    await click(r,'Editar funil Principal');
    assert.match(route(r),/pipeline_config_id=pipeline-a/); assert.match(text(r.toJSON()),/Visão do fluxo/); assert.match(text(r.toJSON()),/Etapas do funil/);
    await click(r,'Todos os funis'); assert.doesNotMatch(route(r),/pipeline_config_id/); assert.match(route(r),/offset=20/);
    assert.equal(r.calls.some(([a])=>a.startsWith('save_')),false);
  } finally { await act(async()=>r.unmount()); }
});

test('renomear mantém padrão e versão capturada depois de refresh; conflito conserva rascunho', async () => {
  let conflict=true;
  const r=await mount(base,{save_pipeline:()=>{if(conflict)throw new Error('Funil alterado por outra pessoa');return {ok:true};}});
  try {
    await openConfig(r); await click(r,'Renomear funil'); await change(r,'Nome','Novo nome');
    await r.updateScope({workspace:{...base,pipelines:[{...base.pipelines[0],updated_at:'newer-pipeline-version',crm_ia_default:false}]}});
    await submit(r); assert.match(text(r.toJSON()),/Funil alterado/); assert.equal(r.root.findByProps({'aria-label':'Nome'}).props.value,'Novo nome');
    const expected={id:'pipeline-a',expected_updated_at:'pipeline-version',nome:'Novo nome',is_default:true};
    assert.deepEqual(r.calls.find(([a])=>a==='save_pipeline')[1],expected);
    conflict=false; await submit(r); assert.deepEqual(r.calls.filter(([a])=>a==='save_pipeline').at(-1)[1],expected);
    assert.equal(r.root.findAllByType('form').length,0);
  } finally { await act(async()=>r.unmount()); }
});

test('nova etapa usa funil do detalhe e confirmação única bloqueia navegação enquanto salva', async () => {
  let finish;
  const r=await mount(base,{save_stage:()=>new Promise(resolve=>{finish=resolve;})});
  try {
    await openConfig(r); await click(r,'Adicionar etapa'); await change(r,'Nome','Proposta'); await change(r,'Cor','#123456');
    const form=r.root.findAllByType('form').at(-1); let saving;
    await act(async()=>{saving=form.props.onSubmit({preventDefault(){}});await Promise.resolve();});
    assert.equal(button(r,'Kanban').props.disabled,true); assert.equal(button(r,'Todos os funis').props.disabled,true);
    await act(async()=>{form.props.onSubmit({preventDefault(){}});await Promise.resolve();});
    assert.equal(r.calls.filter(([a])=>a==='save_stage').length,1);
    assert.deepEqual(r.calls.find(([a])=>a==='save_stage')[1],{nome:'Proposta',pipeline_id:'pipeline-a',color:'#123456',tipo:'intermediaria',ordem:1,icon:'inbox'});
    await act(async()=>finish({ok:true}));await saving;
    assert.equal(button(r,'Kanban').props.disabled,false); assert.equal(r.root.findAllByType('form').length,0);
  } finally { await act(async()=>r.unmount()); }
});

test('configuração inválida não escolhe outro funil para editar e permissão revogada descarta draft', async () => {
  const r=await mount(base,{},'/crm-ia/funil?cliente=client-a&funil_tab=configuracao&pipeline_config_id=missing');
  try {
    assert.match(text(r.toJSON()),/Funil indisponível/); assert.equal(button(r,'Renomear funil'),undefined);
    await click(r,'Todos os funis'); await click(r,'Editar funil Principal'); await click(r,'Renomear funil'); await change(r,'Nome','Rascunho privado');
    await r.updateScope({canManage:false});
    assert.equal(r.root.findAllByType('form').length,0); assert.equal(button(r,'Configuração').props.disabled,true);
    assert.equal(r.calls.some(([a])=>a==='save_pipeline'),false);
  } finally { await act(async()=>r.unmount()); }
});

test('arrasto confirma ordem pelo snapshot anterior ao refresh e exclusão mantém a recusa do servidor', async () => {
  const ws={...base,stages:[...base.stages,{...base.stages[0],id:'stage-b',nome:'Ganho',ordem:1}]};
  const r=await mount(ws,{delete_stage:()=>{throw new Error('Etapa possui oportunidades');}});
  try {
    await openConfig(r);
    await act(async()=>r.root.findByProps({'aria-label':'Ordem da etapa Entrada'}).props.onDragStart({dataTransfer:{setData(){}}}));
    await r.updateScope({workspace:{...ws,pipelines:[{...ws.pipelines[0],updated_at:'newer-version'}]}});
    await act(async()=>r.root.findByProps({'aria-label':'Ordem da etapa Ganho'}).props.onDrop({preventDefault(){}}));
    assert.equal(r.calls.some(([a])=>a==='reorder_stages'),false); await submit(r);
    assert.deepEqual(r.calls.find(([a])=>a==='reorder_stages')[1],{pipeline_id:'pipeline-a',stage_ids:['stage-b','stage-a'],expected_updated_at:'pipeline-version'});
    await click(r,'Excluir Entrada'); await submit(r);
    assert.match(text(r.toJSON()),/Etapa possui oportunidades/);
    assert.deepEqual(r.calls.find(([a])=>a==='delete_stage')[1],{id:'stage-a',expected_updated_at:'stage-version'});
    assert.ok(r.root.findAllByProps({role:'dialog'}).length);
  } finally { await act(async()=>r.unmount()); }
});

test('criação de funil é inline e excluir o último volta ao índice só após recibo', async () => {
  let finish;
  const r=await mount(base,{delete_pipeline:()=>new Promise(resolve=>{finish=resolve;})});
  try {
    await click(r,'Configuração'); await click(r,'Novo funil');
    assert.equal(r.root.findAllByProps({role:'dialog'}).length,0);
    await change(r,'Nome','Pós-venda'); await change(r,'Funil padrão',true); await submit(r);
    assert.deepEqual(r.calls.find(([a])=>a==='save_pipeline')[1],{nome:'Pós-venda',is_default:true});
    await click(r,'Editar funil Principal'); await click(r,'Excluir funil');
    let saving; await act(async()=>{saving=r.root.findAllByType('form').at(-1).props.onSubmit({preventDefault(){}});await Promise.resolve();});
    assert.match(route(r),/pipeline_config_id=pipeline-a/);
    await r.updateScope({workspace:{...base,pipelines:[],stages:[]}});
    await act(async()=>finish({ok:true})); await saving;
    assert.doesNotMatch(route(r),/pipeline_config_id/); assert.match(text(r.toJSON()),/Nenhum funil disponível/);
  } finally { await act(async()=>r.unmount()); }
});

test('troca de conta durante gravação descarta o editor e ignora recibo tardio na nova tela', async () => {
  let finish;
  const r=await mount(base,{save_pipeline:()=>new Promise(resolve=>{finish=resolve;})});
  try {
    await openConfig(r); await click(r,'Renomear funil'); await change(r,'Nome','Rascunho da conta anterior');
    let saving; await act(async()=>{saving=r.root.findAllByType('form').at(-1).props.onSubmit({preventDefault(){}});await Promise.resolve();});
    const next={id:'client-b',empresa:'Outra conta sintética'};
    await r.updateScope({client:next,workspace:{...base,client:next,pipelines:[],stages:[]}});
    await act(async()=>finish({ok:true})); await saving;
    assert.equal(r.root.findAllByType('form').length,0); assert.doesNotMatch(text(r.toJSON()),/Rascunho da conta anterior/);
    assert.equal(r.calls.filter(([a])=>a==='save_pipeline').length,1);
  } finally { await act(async()=>r.unmount()); }
});

const modalLead={id:'lead-a',nome:'Pessoa Alfa',whatsapp:'5511000000000',pipeline_id:'pipeline-a',stage_id:'stage-a',updated_at:'lead-version',etiquetas:[]};
const leadFixture={leads:()=>({rows:[modalLead],total:83,stage_totals:[{stage_id:'stage-a',count:83,value:0}]}),lead:()=>({lead:modalLead,events:[],appointments:[]})};

test('ficha abre em Dialog sobre o mesmo cartão e conserva filtro/página ao fechar sem gravar', async () => {
  const r=await mount(base,leadFixture,'/crm-ia/funil?cliente=client-a&search=quente&offset=20');
  try {
    const card=r.root.findByProps({'aria-label':'Oportunidade Pessoa Alfa'});
    await click(r,'Abrir Pessoa Alfa');
    assert.equal(r.root.findAllByProps({role:'dialog'}).length,1);
    assert.equal(r.root.findByProps({'aria-label':'Oportunidade Pessoa Alfa'}),card);
    assert.equal(r.root.findByProps({'aria-label':'Buscar leads'}).props.value,'quente');
    assert.match(route(r),/offset=20/); assert.match(route(r),/lead_id=lead-a/);
    await click(r,'Fechar ficha');
    assert.equal(r.root.findAllByProps({role:'dialog'}).length,0); assert.doesNotMatch(route(r),/lead_id/);
    assert.match(route(r),/search=quente/); assert.match(route(r),/offset=20/);
    assert.equal(r.calls.some(([a])=>a.startsWith('save_')||a==='move_lead'),false);
  } finally { await act(async()=>r.unmount()); }
});

test('edição e confirmação continuam filhas da ficha; revogar gestão descarta só a confirmação', async () => {
  const r=await mount(base,leadFixture);
  try {
    await click(r,'Abrir Pessoa Alfa'); await click(r,'Editar lead');
    assert.equal(r.root.findAllByProps({role:'dialog'}).length,2);
    await change(r,'Nome','Rascunho não salvo'); await click(r,'Cancelar');
    assert.equal(r.root.findAllByProps({role:'dialog'}).length,1);
    await click(r,'Pegar para mim'); assert.equal(r.root.findAllByProps({role:'dialog'}).length,2);
    await r.updateScope({canManage:false});
    assert.equal(r.root.findAllByProps({role:'dialog'}).length,1); assert.equal(r.root.findAllByType('form').length,0);
    assert.equal(button(r,'Pegar para mim'),undefined); assert.equal(r.calls.some(([a])=>a==='save_lead'),false);
  } finally { await act(async()=>r.unmount()); }
});

test('link direto da ficha também carrega o quadro autorizado e erro de outro cliente não conserva nome anterior', async () => {
  let foreign=false;
  const r=await mount(base,{...leadFixture,lead:()=>{if(foreign)throw new Error('Lead indisponível');return {lead:modalLead,events:[],appointments:[]};}},'/crm-ia/funil?cliente=client-a&lead_id=lead-a&offset=20');
  try {
    assert.equal(r.root.findAllByProps({role:'dialog'}).length,1); assert.ok(r.calls.some(([a])=>a==='leads'));
    const next={id:'client-b',empresa:'Outra conta'};foreign=true;
    await r.updateScope({client:next,workspace:{...base,client:next}});
    const dialogs=r.root.findAllByProps({role:'dialog'});
    assert.equal(dialogs.length,1); assert.match(text(dialogs[0]),/Lead indisponível/); assert.doesNotMatch(text(dialogs[0]),/Pessoa Alfa/);
    assert.equal(r.root.findAllByType('form').length,0);
  } finally { await act(async()=>r.unmount()); }
});

test('prévia relê o ícone e o padrão pelos mesmos campos canônicos da produção', async () => {
  const preview=createCrmPreview(),client=PREVIEW_IDS.clientA,ws=await preview.request('workspace',client);
  const stage=ws.stages[0],pipeline=ws.pipelines[0];
  const saved=await preview.request('save_stage',client,{id:stage.id,expected_updated_at:stage.updated_at,pipeline_id:pipeline.id,nome:stage.nome,icon:'file-text'});
  assert.equal(saved.crm_ia_icon,'file-text'); assert.equal(Object.hasOwn(saved,'icon'),false);
  const renamed=await preview.request('save_stage',client,{id:saved.id,expected_updated_at:saved.updated_at,pipeline_id:pipeline.id,nome:'Renomeada'});
  assert.equal(renamed.crm_ia_icon,'file-text');
  await preview.request('save_pipeline',client,{id:pipeline.id,expected_updated_at:pipeline.updated_at,nome:pipeline.nome,is_default:false});
  const current=(await preview.request('workspace',client)).pipelines[0];
  assert.equal(current.crm_ia_default,false); assert.equal(current.is_default,false);
});

test('consulta atualizada oculta o editor durante leitura sem perder rascunho ou trocar sua versão', async () => {
  let hold=false,finishRead;
  const r=await mount(base,{...leadFixture,lead:()=>hold?new Promise(resolve=>{finishRead=resolve;}):leadFixture.lead()});
  try {
    await click(r,'Abrir Pessoa Alfa');await click(r,'Editar lead');await change(r,'Nome','Rascunho preservado');
    hold=true;await r.updateScope({revision:1});assert.equal(r.root.findAllByType('form').length,0);
    hold=false;await act(async()=>finishRead({lead:{...modalLead,updated_at:'newer-version'},events:[],appointments:[]}));
    assert.equal(r.root.findByProps({'aria-label':'Nome'}).props.value,'Rascunho preservado');
  } finally { await act(async()=>r.unmount()); }
});

test('recibo de edição durante atualização encerra confirmação e ela não reaparece na nova leitura', async () => {
  let hold=false,finishRead,finishSave;
  const r=await mount(base,{...leadFixture,lead:()=>hold?new Promise(resolve=>{finishRead=resolve;}):leadFixture.lead(),save_lead:()=>new Promise(resolve=>{finishSave=resolve;})});
  try {
    await click(r,'Abrir Pessoa Alfa');await click(r,'Editar lead');await change(r,'Nome','Nome confirmado');
    let saving;await act(async()=>{saving=r.root.findAllByType('form').at(-1).props.onSubmit({preventDefault(){}});await Promise.resolve();});
    hold=true;await r.updateScope({revision:1});
    await act(async()=>finishSave({ok:true}));await saving;
    hold=false;await act(async()=>finishRead({lead:{...modalLead,nome:'Nome confirmado',updated_at:'newer-version'},events:[],appointments:[]}));
    assert.equal(r.root.findAllByType('form').length,0);assert.equal(r.root.findAllByProps({role:'dialog'}).length,1);
    assert.equal(r.calls.filter(([a])=>a==='save_lead').length,1);
    assert.equal(r.calls.find(([a])=>a==='save_lead')[1].expected_updated_at,'lead-version');
  } finally { await act(async()=>r.unmount()); }
});

test.after(async () => { await rm(scratch,{recursive:true,force:true}); });

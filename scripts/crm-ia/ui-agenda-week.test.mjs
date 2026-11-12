import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import { build } from 'esbuild';

const root = new URL('../../',import.meta.url).pathname;
const require = createRequire('/tmp/planeje-crm-ui-qa/package.json'), React = require('react'), {act,create} = require('react-test-renderer');
const folder = await mkdtemp('/tmp/planeje-crm-ui-qa/agenda-');
await build({stdin:{contents:`export {default as Agenda} from ${JSON.stringify(path.join(root,'src/components/crm-ia/CrmIaAgenda.jsx'))};export {MemoryRouter} from 'react-router-dom';`,resolveDir:root},
  outfile:path.join(folder,'ui.cjs'),bundle:true,format:'cjs',platform:'node',external:['react'],plugins:[{name:'fixture-dialog',setup(builder){
    builder.onResolve({filter:/^@\/components\/ui\/dialog$/},()=>({path:'dialog',namespace:'fixture'}));
    builder.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`import React from 'react';export const Dialog=({open,children})=>open?React.createElement('div',null,children):null;export const DialogContent=({children})=>React.createElement('section',{role:'dialog'},children);export const DialogTitle=({children})=>React.createElement('h2',null,children);export const DialogDescription=({children})=>React.createElement('p',null,children);`}));
    builder.onResolve({filter:/^@\//},({path:name})=>{const file=path.join(root,'src',name.slice(2));return {path:[file,file+'.js',file+'.jsx'].find(existsSync)};});
  }}]});
const {Agenda,MemoryRouter}=require(path.join(folder,'ui.cjs'));
const workspace={client:{id:'client'},people:[{id:'owner-a',nome:'Pessoa A'},{id:'owner-b',nome:'Pessoa B'}],channels:[{id:'channel-a',nome:'Canal de teste'}],config:{data:{availability:{timezone:'America/Sao_Paulo'},concierge:{no_show_recovery:true}}}};
const appointment={id:'appointment-a',title:'Reunião de exemplo',start_at:'2026-11-11T13:00:00Z',end_at:'2026-11-11T14:00:00Z',owner_id:'owner-a',status:'scheduled',notes:'Nota sintética',updated_at:'2026-11-10T10:00:00Z'};
const text=node=>typeof node==='string'?node:Array.isArray(node)?node.map(text).join(' '):node?text(node.children??node.props?.children):'';
const field=(renderer,label)=>renderer.root.findByProps({'aria-label':label});
const button=(renderer,label)=>renderer.root.findAllByType('button').find(node=>(node.props['aria-label']||text(node.props.children)).trim()===label);
const click=async(renderer,label)=>{const node=button(renderer,label);assert.ok(node,label);await act(async()=>node.props.onClick?.());};
const change=async(renderer,label,value)=>act(async()=>field(renderer,label).props.onChange({target:{value}}));
const submit=async renderer=>act(async()=>renderer.root.findAllByType('form').at(-1).props.onSubmit({preventDefault(){}}));
function fixture(rows=[appointment],timezone='America/Sao_Paulo'){
  const calls=[];let fail=false;
  const api=async(action,payload={})=>{
    calls.push([action,payload]);
    if(action==='agenda')return {rows,total:57,timezone,summary:{scheduled:40,confirmed:15,cancelled:1,no_show:1}};
    if(action==='queue')return {rows:[],total:0};
    if(action==='mark_appointment_no_show'){if(fail)throw new Error('O compromisso foi alterado. Atualize a agenda.');return {recovery:{armed:false,reason:'human_paused'}};}
    throw new Error('Ação inesperada: '+action);
  };
  return {api,calls,set fail(value){fail=value;}};
}
async function mount(fixture,canManage=true){let renderer;await act(async()=>{renderer=create(React.createElement(MemoryRouter,{future:{v7_startTransition:true,v7_relativeSplatPath:true}},React.createElement(Agenda,{api:fixture.api,mutate:fixture.api,workspace,revision:0,canManage})));});return renderer;}

test('semana consulta sete datas, navega por semana e mantém o responsável no mesmo recorte',async()=>{
  const f=fixture(),r=await mount(f);
  try{
    await change(r,'Dia da agenda','2026-11-11');await click(r,'Semana');
    assert.deepEqual(f.calls.filter(([action])=>action==='agenda').at(-1)[1],{since:'2026-11-08',until:'2026-11-14',owner_id:'',offset:0,limit:30});
    assert.equal(button(r,'Semana').props['aria-pressed'],true);
    assert.ok(r.root.findByProps({'aria-label':'Agenda semanal'}));
    await click(r,'Próxima semana');await change(r,'Responsável da agenda','owner-b');
    const payload=f.calls.filter(([action])=>action==='agenda').at(-1)[1];
    assert.equal(payload.since,'2026-11-15');assert.equal(payload.until,'2026-11-21');assert.equal(payload.owner_id,'owner-b');
  }finally{await act(async()=>r.unmount());}
});
test('insights usam o total do servidor, e a grade permite consultar detalhes sem permissão de escrita',async()=>{
  const f=fixture(),r=await mount(f,false);
  try{
    await change(r,'Dia da agenda','2026-11-11');await click(r,'Semana');await click(r,'Insights');
    const labels=r.root.findAllByType('dt');const scheduled=labels.find(node=>text(node)==='Reservados no Planeje');assert.ok(scheduled);
    assert.equal(text(scheduled.parent.findByType('dd')),'40');
    const open=r.root.findAllByType('button').find(node=>node.props['aria-label']?.startsWith('Abrir compromisso Reunião de exemplo'));
    assert.ok(open);await act(async()=>open.props.onClick());
    assert.match(text(r.toJSON()),/Nota sintética/);assert.equal(button(r,'Reagendar compromisso'),undefined);
    assert.equal(button(r,'Cancelar compromisso'),undefined);assert.equal(button(r,'Não compareceu'),undefined);
  }finally{await act(async()=>r.unmount());}
});
test('semana sem compromissos conserva grade e navegação',async()=>{
  const f=fixture([]),r=await mount(f,false);
  try{await click(r,'Semana');assert.ok(r.root.findByProps({'aria-label':'Agenda semanal'}));assert.ok(button(r,'Próxima semana'));}
  finally{await act(async()=>r.unmount());}
});
test('fuso retornado pela agenda prevalece sobre configuração antiga da aba',async()=>{
  const f=fixture([appointment],'Europe/Lisbon'),r=await mount(f,false);
  try{
    await change(r,'Dia da agenda','2026-11-11');await click(r,'Semana');
    assert.match(text(r.toJSON()),/Horários em\s+Europe\/Lisbon/);
    assert.ok(r.root.findAllByType('button').some(node=>/^Abrir compromisso.*13:00 até 14:00/.test(node.props['aria-label']||'')));
  }finally{await act(async()=>r.unmount());}
});
test('marcação humana de ausência pede confirmação, conserva versão/canal e preserva formulário em conflito',async()=>{
  const f=fixture([{...appointment,start_at:'2000-11-11T13:00:00Z',end_at:'2000-11-11T14:00:00Z'}]),r=await mount(f);
  try{
    await click(r,'Não compareceu');
    assert.equal(f.calls.some(([action])=>action==='mark_appointment_no_show'),false);
    await change(r,'Canal para eventual recuperação','channel-a');f.fail=true;await submit(r);
    assert.match(text(r.toJSON()),/foi alterado/);assert.equal(field(r,'Canal para eventual recuperação').props.value,'channel-a');
    f.fail=false;await submit(r);
    assert.deepEqual(f.calls.filter(([action])=>action==='mark_appointment_no_show').at(-1)[1],{id:'appointment-a',expected_updated_at:appointment.updated_at,channel_id:'channel-a'});
    assert.match(text(r.toJSON()),/Não comparecimento registrado/);
    assert.doesNotMatch(text(r.toJSON()),/Recuperação programada/);
  }finally{await act(async()=>r.unmount());}
});
test.after(()=>rm(folder,{recursive:true,force:true}));

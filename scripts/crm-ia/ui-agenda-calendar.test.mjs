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
  outfile:path.join(folder,'ui.cjs'),bundle:true,format:'cjs',platform:'node',external:['react'],loader:{'.css':'empty'},plugins:[{name:'fixture-dialog',setup(builder){
    builder.onResolve({filter:/^@\/components\/ui\/dialog$/},()=>({path:'dialog',namespace:'fixture'}));
    builder.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`import React from 'react';export const Dialog=({open,children})=>open?React.createElement('div',null,children):null;export const DialogContent=({children})=>React.createElement('section',{role:'dialog'},children);export const DialogTitle=({children})=>React.createElement('h2',null,children);export const DialogDescription=({children})=>React.createElement('p',null,children);`}));
    builder.onResolve({filter:/^@\//},({path:name})=>{const file=path.join(root,'src',name.slice(2));return {path:[file,file+'.js',file+'.jsx'].find(existsSync)};});
  }}]});
const {Agenda,MemoryRouter}=require(path.join(folder,'ui.cjs'));
const workspace=()=>({client:{id:'account-a'},people:[{id:'owner-a',nome:'Pessoa A'},{id:'owner-b',nome:'Pessoa B'}],channels:[],config:{revision:'z-opened',data:{availability:{timezone:'America/Sao_Paulo',windows:[],exceptions:[],unknown:'preserve'}}}});
const appointment={id:'appointment-a',title:'Compromisso existente',start_at:'2026-11-13T18:00:00Z',end_at:'2026-11-13T18:30:00Z',owner_id:'owner-a',status:'scheduled',updated_at:'2026-11-12T10:00:00Z'};
const text=n=>typeof n==='string'?n:Array.isArray(n)?n.map(text).join(' '):n?text(n.children??n.props?.children):'';
const button=(r,label)=>r.root.findAllByType('button').find(n=>(n.props['aria-label']||text(n.props.children)).trim()===label);
const field=(r,label)=>r.root.findByProps({'aria-label':label});
const click=async(r,label)=>{assert.ok(button(r,label),label);await act(async()=>button(r,label).props.onClick?.());};
const change=async(r,label,value)=>act(async()=>field(r,label).props.onChange({target:{value,checked:value}}));
const submit=async r=>act(async()=>r.root.findAllByType('form').at(-1).props.onSubmit({preventDefault(){}}));
function fixture(all=[]){
 const f={calls:[],rows:all,slots:[{owner_id:'owner-a',start_at:'2026-11-13T18:00:00Z',end_at:'2026-11-13T18:30:00Z'}],current:workspace()};
 f.api=async(action,p={})=>{
  f.calls.push([action,structuredClone(p)]);
  if(action==='agenda'){
   if(f.holdAgenda){f.holdAgenda=false;await new Promise(resolve=>{f.releaseAgenda=resolve;});}
   const rows=f.rows.filter(row=>row.start_at.slice(0,10)>=p.since && row.start_at.slice(0,10)<=p.until && (!p.owner_id||row.owner_id===p.owner_id));
   const summary=Object.fromEntries(['scheduled','confirmed','cancelled','no_show'].map(status=>[status,rows.filter(row=>row.status===status).length]));
   return{rows:rows.slice(p.offset,p.offset+p.limit),total:rows.length,timezone:'America/Sao_Paulo',summary};
  }
  if(action==='queue')return{rows:[],total:0};
  if(action==='leads')return{rows:[{id:'lead-a',nome:'Lead autorizado',contact_id:'contact-a'}],total:1};
  if(action==='slots')return{rows:f.slots.filter(s=>s.owner_id===p.owner_id),timezone:'America/Sao_Paulo'};
  if(action==='save_appointment')return{id:'new-appointment',...p};
  if(action==='save_config'){
   if(f.holdSave){f.holdSave=false;await new Promise(resolve=>{f.releaseSave=resolve;});}
   if(f.fail)throw Error('A configuração foi alterada. Seu rascunho foi preservado.');
   f.current={...f.current,config:{revision:'a-receipt',data:{...f.current.config.data,availability:p.data}}};f.setWorkspace(f.current);
   return f.current.config;
  }
  throw Error('Unexpected '+action);
 };
 return f;
}
async function mount(f,canManage=true,initialPath='/'){
 function Host(){const [current,setCurrent]=React.useState(f.current),[manage,setManage]=React.useState(canManage);f.setWorkspace=setCurrent;f.setManage=setManage;
  return React.createElement(Agenda,{api:f.api,mutate:f.api,workspace:current,canManage:manage,revision:0});}
 let r;await act(async()=>{r=create(React.createElement(MemoryRouter,{initialEntries:[initialPath],future:{v7_startTransition:true,v7_relativeSplatPath:true}},React.createElement(Host)));});return r;
}
const gridButton=(r,needle)=>r.root.findAllByType('button').find(n=>(n.props['aria-label']||'').startsWith('Novo compromisso em ') && n.props['aria-label'].includes(needle));

test('agenda inicia na semana e oferece mês com42células, dia em grade e lista preservada',async()=>{
 const f=fixture(),r=await mount(f);
 try{
  assert.equal(button(r,'Semana').props['aria-pressed'],true);await change(r,'Dia da agenda','2026-11-12');await click(r,'Mês');
  assert.equal(r.root.findAllByType('button').filter(n=>/^Novo compromisso em /.test(n.props['aria-label']||'')).length,42);
  assert.deepEqual(f.calls.filter(([a])=>a==='agenda').at(-1)[1],{since:'2026-11-01',until:'2026-12-12',owner_id:'',offset:0,limit:200});
  await click(r,'Próximo mês');assert.equal(field(r,'Dia da agenda').props.value,'2026-12-12');
  await click(r,'Dia');assert.ok(r.root.findByProps({'aria-label':'Agenda do dia'}));
  await click(r,'Lista');assert.equal(button(r,'Lista').props['aria-pressed'],true);assert.equal(f.calls.filter(([a])=>a==='agenda').at(-1)[1].limit,30);
 }finally{await act(async()=>r.unmount());}
});
test('grade reúne mais de200compromissos sem esconder outra página',async()=>{
 const f=fixture(Array.from({length:201},(_,i)=>({...appointment,id:`event-${i}`,title:`Evento ${i}`}))),r=await mount(f);
 try{
  await change(r,'Dia da agenda','2026-11-12');
  assert.equal(r.root.findAllByType('button').filter(n=>/^Abrir compromisso Evento /.test(n.props['aria-label']||'')).length,201);
  assert.ok(f.calls.some(([a,p])=>a==='agenda'&&p.offset===200));
 }finally{await act(async()=>r.unmount());}
});
test('somente consulta abre detalhes sem oferecer criação ou disponibilidade editável',async()=>{
 const f=fixture([appointment]),r=await mount(f,false);
 try{await change(r,'Dia da agenda','2026-11-12');assert.equal(gridButton(r,'15:00'),undefined);assert.equal(button(r,'Disponibilidade'),undefined);
  const open=r.root.findAllByType('button').find(n=>/^Abrir compromisso Compromisso existente/.test(n.props['aria-label']||''));assert.ok(open);await act(async()=>open.props.onClick());assert.equal(button(r,'Reagendar compromisso'),undefined);
 }finally{await act(async()=>r.unmount());}
});
test('clicar horário usa data civil e slot exato, mantendo reserva e contato canônicos',async()=>{
 const f=fixture(),r=await mount(f);
 try{await change(r,'Dia da agenda','2026-11-12');await change(r,'Responsável da agenda','owner-a');const target=gridButton(r,'13/11/2026 às 15:00');assert.ok(target);await act(async()=>target.props.onClick());
  assert.equal(field(r,'Data do compromisso').props.value,'2026-11-13');assert.equal(field(r,'Atendente do compromisso').props.value,'owner-a');assert.equal(field(r,'Horário disponível').props.value,'2026-11-13T18:00:00Z');
  await change(r,'Título do compromisso','Consulta sintética');await change(r,'Lead do compromisso','lead-a');assert.equal(field(r,'Horário disponível').props.value,'');
  await change(r,'Horário disponível','2026-11-13T18:00:00Z');await submit(r);
  const saved=f.calls.filter(([a])=>a==='save_appointment');assert.equal(saved.length,1);const p=saved[0][1];
  assert.equal(p.start_at,'2026-11-13T18:00:00Z');assert.equal(p.end_at,'2026-11-13T18:30:00Z');assert.equal(p.contact_id,'contact-a');assert.match(p.request_id,/^[0-9a-f-]{36}$/);assert.equal(p.preferred_time,undefined);
 }finally{await act(async()=>r.unmount());}
});
test('horário sem vaga não escolhe outro automaticamente e pode abrir disponibilidade sem perder o formulário',async()=>{
 const f=fixture();f.slots=[{...f.slots[0],start_at:'2026-11-13T18:30:00Z',end_at:'2026-11-13T19:00:00Z'}];const r=await mount(f);
 try{await change(r,'Dia da agenda','2026-11-12');await change(r,'Responsável da agenda','owner-a');await act(async()=>gridButton(r,'13/11/2026 às 15:00').props.onClick());
  assert.equal(field(r,'Horário disponível').props.value,'');assert.match(text(r.toJSON()),/15:00.*indisponível/);
  await change(r,'Título do compromisso','Preservar ao configurar');await click(r,'Conferir disponibilidade');assert.ok(r.root.findAllByProps({role:'dialog'}).some(n=>/Disponibilidade da equipe/.test(text(n))));
  const dialog=r.root.findAllByProps({role:'dialog'}).at(-1);const cancel=dialog.findAllByType('button').find(n=>text(n.props.children)==='Cancelar');await act(async()=>cancel.props.onClick());assert.equal(field(r,'Título do compromisso').props.value,'Preservar ao configurar');assert.equal(f.calls.some(([a])=>a==='save_appointment'),false);
 }finally{await act(async()=>r.unmount());}
});
test('mês abre compromisso pela data sem fingir que um horário foi escolhido',async()=>{
 const f=fixture(),r=await mount(f);
 try{await change(r,'Dia da agenda','2026-11-12');await click(r,'Mês');await act(async()=>gridButton(r,'13/11/2026').props.onClick());
  assert.equal(field(r,'Data do compromisso').props.value,'2026-11-13');assert.equal(field(r,'Atendente do compromisso').props.value,'');assert.equal(f.calls.some(([a])=>a==='save_appointment'),false);
 }finally{await act(async()=>r.unmount());}
});
test('disponibilidade usa a revisão da abertura, mantém erro/draft e não apaga campos desconhecidos',async()=>{
 const f=fixture(),r=await mount(f);
 try{await click(r,'Disponibilidade');assert.equal(f.calls.some(([a])=>a==='save_config'),false);await change(r,'Duração do compromisso, em minutos','45');
  await act(async()=>f.setWorkspace({...f.current,config:{revision:'external',data:{availability:{timezone:'Europe/Lisbon',duration_minutes:90}}}}));
  assert.equal(field(r,'Duração do compromisso, em minutos').props.value,45);f.fail=true;await submit(r);assert.match(text(r.toJSON()),/rascunho foi preservado/);assert.equal(field(r,'Duração do compromisso, em minutos').props.value,45);
  const call=f.calls.filter(([a])=>a==='save_config').at(-1)[1];assert.equal(call.section,'availability');assert.equal(call.revision,'z-opened');assert.equal(call.data.unknown,'preserve');assert.equal(call.data.timezone,'America/Sao_Paulo');
 }finally{await act(async()=>r.unmount());}
});
test('revogação ou troca de conta impede salvar a disponibilidade aberta',async()=>{
 for(const changeContext of ['permission','account']){const f=fixture(),r=await mount(f);
  try{await click(r,'Disponibilidade');await act(async()=>{if(changeContext==='permission')f.setManage(false);else f.setWorkspace({...f.current,client:{id:'account-b'}});});await submit(r);assert.equal(f.calls.some(([a])=>a==='save_config'),false);}
  finally{await act(async()=>r.unmount());}}
});
test('salvar disponibilidade tem uma chamada e recibo, sem ativar atendimento nem perder escopo',async()=>{
 const f=fixture(),r=await mount(f);
 let pending;
 try{await click(r,'Disponibilidade');f.holdSave=true;await act(async()=>{pending=r.root.findAllByType('form').at(-1).props.onSubmit({preventDefault(){}});});await submit(r);assert.equal(f.calls.filter(([a])=>a==='save_config').length,1);
  await act(async()=>{f.releaseSave();await pending;});assert.match(text(r.toJSON()),/Disponibilidade atualizada/);assert.equal(f.calls.some(([a,p])=>a==='save_config'&&p.section!=='availability'),false);
 }finally{await act(async()=>r.unmount());}
});
test('resposta antiga de outro responsável não reaparece depois de trocar o filtro',async()=>{
 const f=fixture([appointment,{...appointment,id:'appointment-b',owner_id:'owner-b',title:'Pessoa B atual'}]);f.holdAgenda=true;const r=await mount(f);
 try{await change(r,'Dia da agenda','2026-11-12');await change(r,'Responsável da agenda','owner-b');await act(async()=>f.releaseAgenda());
  const names=r.root.findAllByType('button').map(n=>n.props['aria-label']||'').filter(label=>label.startsWith('Abrir compromisso '));
  assert.equal(names.length,1);assert.match(names[0],/Pessoa B atual/);assert.doesNotMatch(names[0],/Compromisso existente/);
 }finally{await act(async()=>r.unmount());}
});
test('limite de leitura informa cobertura e não oferece criação sobre uma grade incompleta',async()=>{
 const f=fixture(Array.from({length:4001},(_,i)=>({...appointment,id:`dense-${i}`}))),r=await mount(f);
 try{await change(r,'Dia da agenda','2026-11-12');assert.match(text(r.toJSON()),/4\.000.*4\.001.*período menor/);assert.equal(gridButton(r,'15:00'),undefined);assert.ok(button(r,'Novo compromisso'));}
 finally{await act(async()=>r.unmount());}
});
test('evento da grade abre o reagendamento canônico e mantém a identidade, versão e request_id',async()=>{
 const original={...appointment,lead_id:'lead-a',contact_id:'contact-a',request_id:'00000000-0000-4000-8000-000000000001'};
 const f=fixture([original]);f.slots=[{owner_id:'owner-a',start_at:'2026-11-13T19:00:00Z',end_at:'2026-11-13T19:30:00Z'}];const r=await mount(f);
 try{await change(r,'Dia da agenda','2026-11-12');const open=r.root.findAllByType('button').find(n=>(n.props['aria-label']||'').startsWith('Abrir compromisso Compromisso existente'));assert.ok(open);await act(async()=>open.props.onClick());await click(r,'Reagendar compromisso');
  assert.equal(f.calls.filter(([a])=>a==='slots').at(-1)[1].appointment_id,original.id);await change(r,'Horário disponível',f.slots[0].start_at);await submit(r);
  const p=f.calls.filter(([a])=>a==='save_appointment').at(-1)[1];for(const key of ['id','lead_id','contact_id','request_id'])assert.equal(p[key],original[key]);assert.equal(p.expected_updated_at,original.updated_at);
 }finally{await act(async()=>r.unmount());}
});
test('link da agenda reabre visão, data e responsável e conserva o lead ao trocar a visão',async()=>{
 const f=fixture(),r=await mount(f,true,'/crm-ia/agenda?cliente=account-a&lead_id=lead-a&agenda_view=month&agenda_date=2026-11-13&agenda_owner=owner-a');
 try{assert.equal(button(r,'Mês').props['aria-pressed'],true);assert.equal(field(r,'Dia da agenda').props.value,'2026-11-13');assert.equal(field(r,'Responsável da agenda').props.value,'owner-a');
  await click(r,'Dia');await click(r,'Novo compromisso');assert.equal(field(r,'Lead do compromisso').props.value,'lead-a');assert.equal(field(r,'Atendente do compromisso').props.value,'owner-a');assert.equal(field(r,'Data do compromisso').props.value,'2026-11-13');
 }finally{await act(async()=>r.unmount());}
});
test('compromisso legado sem lead pode ser reagendado preservando seus vínculos nulos',async()=>{
 const original={...appointment,lead_id:null,contact_id:null,request_id:'00000000-0000-4000-8000-000000000002'};
 const f=fixture([original]);f.slots=[{owner_id:'owner-a',start_at:'2026-11-13T19:00:00Z',end_at:'2026-11-13T19:30:00Z'}];const r=await mount(f);
 try{await change(r,'Dia da agenda','2026-11-13');await click(r,'Lista');await click(r,'Reagendar compromisso');await change(r,'Horário disponível',f.slots[0].start_at);await submit(r);
  const calls=f.calls.filter(([a])=>a==='save_appointment');assert.equal(calls.length,1);const saved=calls[0][1];assert.equal(saved.id,original.id);assert.equal(saved.lead_id,null);assert.equal(saved.contact_id,null);assert.equal(saved.request_id,original.request_id);
 }finally{await act(async()=>r.unmount());}
});
test('hora clicada não é chamada de indisponível antes de consultar o atendente',async()=>{
 const f=fixture(),r=await mount(f);
 try{await change(r,'Dia da agenda','2026-11-12');await act(async()=>gridButton(r,'13/11/2026 às 15:00').props.onClick());
  assert.equal(f.calls.some(([a])=>a==='slots'),false);assert.doesNotMatch(text(r.toJSON()),/15:00.*indisponível/);
  await change(r,'Atendente do compromisso','owner-a');assert.equal(field(r,'Horário disponível').props.value,'2026-11-13T18:00:00Z');
 }finally{await act(async()=>r.unmount());}
});
test('disponibilidade prioriza janelas e exceções e recolhe as regras avançadas',async()=>{
 const f=fixture(),r=await mount(f);
 try{await click(r,'Disponibilidade');const dialog=r.root.findAllByProps({role:'dialog'}).at(-1);const details=dialog.findByType('details');assert.equal(text(details.findByType('summary')),'Duração e regras de agenda');assert.notEqual(details.props.open,true);
  assert.ok(text(dialog).indexOf('Janelas semanais')<text(dialog).indexOf('Duração e regras de agenda'));assert.ok(details.findAllByProps({'aria-label':'Duração do compromisso, em minutos'}).length);
 }finally{await act(async()=>r.unmount());}
});
test.after(()=>rm(folder,{recursive:true,force:true}));

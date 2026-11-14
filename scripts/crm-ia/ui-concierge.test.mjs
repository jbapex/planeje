import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { build } from 'esbuild';
const root=new URL('../../',import.meta.url).pathname,require=createRequire('/tmp/planeje-crm-ui-qa/package.json');
const React=require('react'),{act,create}=require('react-test-renderer'),scratch=await mkdtemp('/tmp/planeje-crm-ui-qa/concierge-');
await build({stdin:{contents:`export {default as Agents} from ${JSON.stringify(path.join(root,'src/components/crm-ia/CrmIaAgents.jsx'))};export {MemoryRouter} from 'react-router-dom';`,resolveDir:root},bundle:true,platform:'node',format:'cjs',outfile:path.join(scratch,'ui.cjs'),external:['react'],loader:{'.css':'empty','.png':'dataurl'},plugins:[{name:'isolated-ui',setup(b){
 b.onResolve({filter:/^@\/components\/ui\/dialog$/},()=>({path:'dialog',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`import React from 'react';export const Dialog=({children})=>React.createElement('div',null,children);export const DialogContent=({children})=>React.createElement('section',{role:'dialog'},children);export const DialogTitle=({children})=>React.createElement('h2',null,children);export const DialogDescription=({children})=>React.createElement('p',null,children);`}));
 b.onResolve({filter:/^@\//},({path:name})=>{const file=path.join(root,'src',name.slice(2));return{path:[file,file+'.js',file+'.jsx'].find(existsSync)};});
}}]});
const {Agents,MemoryRouter}=require(path.join(scratch,'ui.cjs'));
const initial=()=>({client:{id:'account-a',empresa:'Empresa sintética'},agents:[],pipelines:[],stages:[],bases:[{id:'base-a',nome:'Base autorizada'}],people:[],products:[],config:{revision:'z-origin',data:{knowledge:{concierge_base_id:'base-a'},concierge:{appointment_confirm:true,unknown_preserved:'keep'}}}});
const text=n=>typeof n==='string'?n:Array.isArray(n)?n.map(text).join(' '):n?text(n.children??n.props?.children):'';
const button=(r,label)=>r.root.findAllByType('button').find(n=>(n.props['aria-label']||text(n.props.children)).trim()===label);
const click=async(r,label)=>{assert.ok(button(r,label),label);await act(async()=>button(r,label).props.onClick?.());};
const field=(r,label)=>r.root.findByProps({'aria-label':label});
const change=async(r,label,value)=>act(async()=>field(r,label).props.onChange({target:{value,checked:value}}));
const submit=async r=>act(async()=>r.root.findAllByType('form').find(n=>n.props.className==='crm-ia-concierge-form').props.onSubmit({preventDefault(){}}));
async function mount({workspace=initial(),canManage=true,onAnalyze}={}){
 const f={calls:[],current:structuredClone(workspace),sequence:0};
 function Host(){const [current,setCurrent]=React.useState(workspace),[manage,setManage]=React.useState(canManage);f.setWorkspace=setCurrent;f.setManage=setManage;
  async function api(action,payload){if(action==='usage')return{};f.calls.push([action,payload]);assert.equal(action,'save_config');
   if(f.hold){f.hold=false;await new Promise((resolve,reject)=>{f.release=resolve;f.reject=reject;});}
   if(f.fail)throw Error('Versão alterada. Seu rascunho foi preservado.');
   assert.equal(payload.revision,f.current.config.revision);
   const config={revision:`a-receipt-${++f.sequence}`,data:{...f.current.config.data,concierge:structuredClone(payload.data)}};
   f.current={...f.current,config};if(!f.staleRefresh)setCurrent(f.current);return config;
  }
  return React.createElement(Agents,{api,mutate:api,workspace:current,canManage:manage,onAnalyze});
 }
 let r;await act(async()=>{r=create(React.createElement(MemoryRouter,{future:{v7_startTransition:true,v7_relativeSplatPath:true}},React.createElement(Host)));});await click(r,'Concierge');return{r,f};
}
test('Concierge inline mostra três capacidades, defaults e agenda parcial sem modal',async()=>{
 const {r}=await mount();assert.equal(r.root.findAllByProps({role:'dialog'}).length,0);
 for(const label of ['Autorizar Concierge','Responder dúvidas frequentes','Cuidar da agenda','Recuperar não comparecimento','Permitir repasse humano'])assert.ok(field(r,label));
 assert.equal(field(r,'Responder dúvidas frequentes').props.checked,true);assert.equal(field(r,'Permitir repasse humano').props.checked,true);assert.equal(field(r,'Autorizar Concierge').props.checked,false);
 assert.match(text(r.toJSON()),/2\s+de 3/);assert.match(text(r.toJSON()),/Parcial/);assert.equal(field(r,'Permitir remarcação').props.checked,false);await act(async()=>r.unmount());
});
test('salva origem e recibo mesmo com refresh antigo, preservando campos existentes',async()=>{
 const {r,f}=await mount();f.staleRefresh=true;await change(r,'Autorizar Concierge',true);await submit(r);
 assert.equal(f.calls[0][1].revision,'z-origin');assert.equal(f.calls[0][1].data.unknown_preserved,'keep');
 await change(r,'Instruções extras','Segunda edição');await submit(r);assert.equal(f.calls[1][1].revision,'a-receipt-1');assert.match(text(r.toJSON()),/Salvo/);await act(async()=>r.unmount());
});
test('rascunho e erro permanecem ao trocar de aba, sem usar revisão de refresh',async()=>{
 const {r,f}=await mount();await change(r,'Instruções extras','Meu texto');f.fail=true;await submit(r);
 await click(r,'Agentes');await click(r,'Concierge');assert.equal(field(r,'Instruções extras').props.value,'Meu texto');assert.match(text(r.toJSON()),/rascunho foi preservado/);
 await act(async()=>f.setWorkspace({...initial(),config:{...initial().config,revision:'external'}}));await submit(r);assert.equal(f.calls[1][1].revision,'z-origin');await act(async()=>r.unmount());
});
test('troca externa exige recarregar explicitamente e descarte não é automático',async()=>{
 const {r,f}=await mount();await change(r,'Instruções extras','Preservar');
 const newer={...initial(),config:{revision:'external',data:{...initial().config.data,concierge:{instructions:'Nova origem'}}}};
 await act(async()=>f.setWorkspace(newer));assert.equal(field(r,'Instruções extras').props.value,'Preservar');
 await click(r,'Descartar alterações');assert.equal(field(r,'Instruções extras').props.value,'Preservar');await click(r,'Continuar editando');
 await click(r,'Descartar alterações');await click(r,'Descartar e recarregar');assert.equal(field(r,'Instruções extras').props.value,'Nova origem');await act(async()=>r.unmount());
});
test('leitura e revogação impedem mutate mesmo acionando handler diretamente',async()=>{
 for(const canManage of [false,true]){
  const {r,f}=await mount({canManage});if(canManage){await change(r,'Instruções extras','Antes');await act(async()=>f.setManage(false));}
  await change(r,'Autorizar Concierge',true);await submit(r);assert.equal(f.calls.length,0);assert.equal(field(r,'Autorizar Concierge').props.checked,false);await act(async()=>r.unmount());
 }
});
test('FAQ sem base bloqueia salvar, mas agenda com FAQ desligada é válida',async()=>{
 const workspace=initial();workspace.bases=[];const {r,f}=await mount({workspace});await change(r,'Autorizar Concierge',true);await submit(r);assert.equal(f.calls.length,0);assert.match(text(r.toJSON()),/base de conhecimento/i);
 await change(r,'Responder dúvidas frequentes',false);await submit(r);assert.equal(f.calls.length,1);assert.equal(f.calls[0][1].data.appointment_confirm,true);await act(async()=>r.unmount());
});
test('salvar duplicado e resposta tardia da conta A não alteram a conta B',async()=>{
 const {r,f}=await mount();await change(r,'Instruções extras','Texto A');f.hold=true;let pending;
 await act(async()=>{pending=r.root.findAllByType('form').find(n=>n.props.className==='crm-ia-concierge-form').props.onSubmit({preventDefault(){}});});await submit(r);assert.equal(f.calls.length,1);
 const next={...initial(),client:{id:'account-b',empresa:'Outra conta'},config:{revision:'account-b',data:{concierge:{instructions:'Texto B'}}}};
 await act(async()=>f.setWorkspace(next));await act(async()=>{f.staleRefresh=true;f.release();await pending;});
 assert.equal(field(r,'Instruções extras').props.value,'Texto B');assert.equal(f.calls.length,1);await act(async()=>r.unmount());
});
test('frases por Enter, remoção e agenda agregada conservam a mecânica',async()=>{
 const {r,f}=await mount();await change(r,'Nova frase de repasse','Falar com alguém');await act(async()=>field(r,'Nova frase de repasse').props.onKeyDown({key:'Enter',preventDefault(){}}));
 assert.match(text(r.toJSON()),/Falar com alguém/);await click(r,'Remover frase Falar com alguém');
 await change(r,'Cuidar da agenda',true);for(const label of ['Permitir confirmação de presença','Permitir remarcação','Permitir cancelamento'])assert.equal(field(r,label).props.checked,true);
 await change(r,'Espera depois de atendimento humano, em minutos',0);await change(r,'Instruções extras','Alterado');await submit(r);assert.equal(f.calls[0][1].data.human_wait_minutes,0);await act(async()=>r.unmount());
});
test('configuração guiada chama Atlas com pedido e conta atuais, sem gravação ou modelo',async()=>{
 const asked=[],{r,f}=await mount({onAnalyze:value=>asked.push(value)});await click(r,'Agentes');await click(r,'Configurar com Atlas');assert.equal(asked.length,1);assert.match(asked[0].question,/etapa|pergunta/);assert.match(asked[0].question,/Empresa sintética/);assert.equal(f.calls.length,0);await act(async()=>r.unmount());
});
test.after(()=>rm(scratch,{recursive:true,force:true}));

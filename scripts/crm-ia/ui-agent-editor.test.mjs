import assert from 'node:assert/strict';
import test from 'node:test';
import {existsSync} from 'node:fs';
import {mkdtemp,rm} from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
import {build} from 'esbuild';
const root=new URL('../../',import.meta.url).pathname,require=createRequire('/tmp/planeje-crm-ui-qa/package.json');
const React=require('react'),{act,create}=require('react-test-renderer'),scratch=await mkdtemp('/tmp/planeje-crm-ui-qa/agent-editor-');
await build({stdin:{contents:`export {default as Agents} from ${JSON.stringify(path.join(root,'src/components/crm-ia/CrmIaAgents.jsx'))};export {MemoryRouter} from 'react-router-dom';`,resolveDir:root},bundle:true,platform:'node',format:'cjs',outfile:path.join(scratch,'editor.cjs'),external:['react'],plugins:[{name:'fixture-dialog',setup(b){
 b.onResolve({filter:/^@\/components\/ui\/dialog$/},()=>({path:'dialog',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`import React from 'react';export const Dialog=({children})=>React.createElement('div',null,children);export const DialogContent=({children})=>React.createElement('section',null,children);export const DialogTitle=({children})=>React.createElement('h2',null,children);export const DialogDescription=({children})=>React.createElement('p',null,children);`}));
 b.onResolve({filter:/^@\//},({path:name})=>{const f=path.join(root,'src',name.slice(2));return {path:[f,f+'.js',f+'.jsx'].find(existsSync)};});
}}]});
const {Agents,MemoryRouter}=require(path.join(scratch,'editor.cjs'));
const workspace={client:{id:'account-a'},agents:[],pipelines:[{id:'p',nome:'Principal'}],stages:[],bases:[],people:[],products:[],config:{revision:'cfg',data:{}}};
const text=n=>typeof n==='string'?n:Array.isArray(n)?n.map(text).join(' '):n?text(n.children??n.props?.children):'';
const button=(r,label)=>r.root.findAllByType('button').find(n=>text(n.props.children).trim()===label);
const click=async(r,label)=>{assert.ok(button(r,label),label);await act(async()=>button(r,label).props.onClick?.());};
const change=async(r,label,value)=>act(async()=>r.root.findByProps({'aria-label':label}).props.onChange({target:{value,checked:value}}));
const submit=async r=>act(async()=>r.root.findAllByType('form').at(-1).props.onSubmit({preventDefault(){}}));
function fixture({draft=null,sourceConflict=false,read}={}){const calls=[];let revision='r0',saved=draft;return {calls,async api(action,payload){calls.push([action,payload]);
 if(action==='usage')return {};if(action==='capabilities')return {audio:{available:true,input_available:true}};
 if(action==='agent_draft')return read?read():{revision,draft:saved?{payload:saved,revision}:null,source_conflict:sourceConflict};
 if(action==='save_agent_draft'){assert.equal(payload.revision,revision);saved=payload.data;revision+='x';return {revision};}
 if(action==='publish_agent_draft'){assert.equal(payload.revision,revision);return {published:true,agent:{id:'published',...saved}};}
 if(action==='discard_agent_draft'){saved=null;revision+='d';return {discarded:true,revision};}
 if(action==='test_agent')return {resposta:'Resposta publicada',agente:{id:'a',nome:'Agente publicado'}};
 if(action==='save_config')return {};throw new Error(action);
 }};}
async function mount(f,extra={}){let r;await act(async()=>{r=create(React.createElement(MemoryRouter,{future:{v7_startTransition:true,v7_relativeSplatPath:true}},React.createElement(Agents,{api:f.api,mutate:f.api,workspace,canManage:true,...extra})));});return r;}
test('fechar salva rascunho incompleto e reabrir retoma sem publicar nem autorizar custo',async()=>{
 const f=fixture(),r=await mount(f);await click(r,'Configurar Qualificação');assert.match(text(r.toJSON()),/Rascunho privado/);
 await change(r,'Instruções','Edição incompleta');await click(r,'Cancelar');
 assert.equal(f.calls.some(([action])=>['save_agent','publish_agent_draft'].includes(action)),false);assert.equal(f.calls.find(([action])=>action==='save_agent_draft')[1].data.nome,'');
 await click(r,'Configurar Qualificação');assert.equal(r.root.findByProps({'aria-label':'Instruções'}).props.value,'Edição incompleta');await act(async()=>r.unmount());
});
test('publicação explícita usa revisão salva, modo Espelhar e tom Entusiasmado',async()=>{
 const f=fixture(),r=await mount(f);await click(r,'Configurar Qualificação');await change(r,'Nome do agente','Publicado');await change(r,'Tom de voz','entusiasmado');await change(r,'Respostas em áudio','mirror');await submit(r);
 const saved=f.calls.findLast(([action])=>action==='save_agent_draft')[1].data;
 assert.equal(saved.tom,'entusiasmado');assert.equal(saved.funil.crm_ia.audio.mode,'mirror');assert.equal(saved.funil.crm_ia.audio.enabled,true);assert.equal(saved.funil.crm_ia.audio.input_enabled,false);
 assert.equal(f.calls.filter(([action])=>action==='publish_agent_draft').length,1);assert.equal(f.calls.some(([action])=>action==='save_agent'),false);await act(async()=>r.unmount());
});
test('a última tecla é persistida mesmo quando o editor sai antes do próximo efeito',async()=>{
 const f=fixture(),r=await mount(f);await click(r,'Configurar Qualificação');
 await act(async()=>{r.root.findByProps({'aria-label':'Instruções'}).props.onChange({target:{value:'Última tecla'}});r.unmount();});
 assert.equal(f.calls.findLast(([action])=>action==='save_agent_draft')[1].data.instrucoes,'Última tecla');
});
test('agente legado com áudio nunca publica nome sem espalhar a string no JSON',async()=>{
 const row={id:'legacy',nome:'Anterior',funil:{crm_ia:{tipo:'qualificacao',pipeline_id:'p',audio:'nunca'}}},f=fixture(),r=await mount(f,{workspace:{...workspace,agents:[row]}});
 await click(r,'Configurar Qualificação');await change(r,'Nome do agente','Nome publicado');await submit(r);
 const audio=f.calls.findLast(([action])=>action==='save_agent_draft')[1].data.funil.crm_ia.audio;
 assert.deepEqual(audio,{enabled:false,input_enabled:false,voice:'alloy',speed:1});assert.equal(f.calls.some(([action])=>action==='publish_agent_draft'),true);await act(async()=>r.unmount());
});
test('retomar áudio incompleto preserva velocidade em edição e exige revisão para publicar',async()=>{
 const f=fixture({draft:{nome:'Rascunho',funil:{crm_ia:{tipo:'qualificacao',pipeline_id:'p',audio:{enabled:true,speed:''}}}}}),r=await mount(f);
 await click(r,'Configurar Qualificação');assert.equal(r.root.findByProps({'aria-label':'Velocidade da voz'}).props.value,'');await submit(r);
 assert.equal(f.calls.some(([action])=>action==='publish_agent_draft'),false);assert.match(text(r.toJSON()),/Configuração de voz inválida/);await act(async()=>r.unmount());
});
test('leitura atrasada mantém o formulário desabilitado até hidratar o rascunho',async()=>{
 let finish;const f=fixture({read:()=>new Promise(resolve=>{finish=resolve;})}),r=await mount(f);await click(r,'Configurar Qualificação');
 assert.equal(r.root.findAllByType('fieldset').some(node=>node.props.disabled===true),true);
 await act(async()=>finish({revision:'r0',draft:null}));assert.equal(r.root.findAllByType('fieldset').some(node=>node.props.disabled===true),false);await act(async()=>r.unmount());
});
test('teste identifica a versão publicada e descartar deixa o agente publicado intacto',async()=>{
 const row={id:'a',nome:'Agente publicado',updated_at:'2026-11-11T10:00Z',funil:{crm_ia:{tipo:'qualificacao',pipeline_id:'p'}}};
 const f=fixture({draft:{nome:'Meu rascunho',funil:row.funil}}),r=await mount(f,{workspace:{...workspace,agents:[row]}});
 await click(r,'Configurar Qualificação');assert.match(text(r.toJSON()),/versão publicada/i);await change(r,'Mensagem de teste','Pergunta');await click(r,'Testar agente');
 assert.equal(f.calls.find(([action])=>action==='test_agent')[1].agent_id,'a');assert.match(text(r.toJSON()),/Resposta publicada/);
 await click(r,'Descartar rascunho');assert.equal(f.calls.some(([action])=>action==='discard_agent_draft'),true);assert.equal(row.nome,'Agente publicado');await act(async()=>r.unmount());
});
test('troca de conta ignora hidratação antiga e abre editor com novo escopo',async()=>{
 let oldRead;const old=fixture({read:()=>new Promise(resolve=>{oldRead=resolve;})}),next=fixture();const r=await mount(old);
 await click(r,'Configurar Qualificação');
 await act(async()=>r.update(React.createElement(MemoryRouter,{future:{v7_startTransition:true,v7_relativeSplatPath:true}},React.createElement(Agents,{api:next.api,mutate:next.api,workspace:{...workspace,client:{id:'account-b'}},canManage:true}))));
 await click(r,'Configurar Qualificação');await act(async()=>oldRead({revision:'old',draft:{payload:{nome:'Dado da conta antiga'}}}));
 assert.notEqual(r.root.findByProps({'aria-label':'Nome do agente'}).props.value,'Dado da conta antiga');await act(async()=>r.unmount());
});
test('Concierge começa sem opt-ins, valida prazo e não mistura espera humana com recuperação',async()=>{
 const f=fixture(),r=await mount(f);await click(r,'Concierge');await click(r,'Configurar Concierge');
 for(const label of ['Permitir confirmação de presença','Permitir remarcação','Permitir cancelamento','Recuperar não comparecimento'])assert.equal(r.root.findByProps({'aria-label':label}).props.checked,false);
 await change(r,'Prazo da recuperação, em horas','0');await submit(r);assert.equal(f.calls.some(([action])=>action==='save_config'),false);
 await change(r,'Prazo da recuperação, em horas','168');await change(r,'Atraso após marcar ausência, em minutos','90');await change(r,'Permitir cancelamento',true);await submit(r);
 const saved=f.calls.find(([action])=>action==='save_config')[1].data;
 assert.equal(saved.enabled,false);assert.equal(saved.appointment_cancel,true);assert.equal(saved.appointment_confirm,false);assert.equal(saved.no_show_recovery,false);
 assert.equal(saved.no_show_delay_minutes,90);assert.equal(saved.no_show_expire_hours,168);assert.equal(saved.human_wait_minutes,10);await act(async()=>r.unmount());
});
test.after(async()=>rm(scratch,{recursive:true,force:true}));

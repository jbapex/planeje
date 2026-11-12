import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {mkdtemp,rm} from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
import test from 'node:test';
import {build} from 'esbuild';
const root=new URL('../../',import.meta.url).pathname,require=createRequire('/tmp/planeje-crm-ui-qa/package.json');
const previousFetch=globalThis.fetch;globalThis.fetch=()=>{throw Error('Rede indisponível neste teste de interface.');};
const React=require('react'),{act,create}=require('react-test-renderer'),scratch=await mkdtemp('/tmp/planeje-crm-ui-qa/crm-embedded-');
await build({stdin:{contents:`export {CrmIaConversation as Conversation} from ${JSON.stringify(path.join(root,'src/components/crm-ia/CrmIaConversations.jsx'))};export {CrmIaEditor as Editor} from ${JSON.stringify(path.join(root,'src/components/crm-ia/CrmIaPrimitives.jsx'))};`,resolveDir:root},bundle:true,loader:{'.png':'dataurl'},format:'cjs',platform:'node',external:['react'],outfile:path.join(scratch,'ui.cjs'),plugins:[{name:'isolated-conversation',setup(b){
 b.onResolve({filter:/^@\/components\/ui\/dialog$/},()=>({path:'dialog',namespace:'fixture'}));
 b.onResolve({filter:/AtendimentoComposer$/},()=>({path:'composer',namespace:'fixture'}));
 b.onResolve({filter:/CrmIaMessageMedia$/},()=>({path:'media',namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},({path:name})=>({contents:name==='dialog'?`import React from 'react';export const Dialog=({open,children})=>open?React.createElement('div',null,children):null;export const DialogContent=({children,...props})=>React.createElement('section',{role:'dialog',...props},children);export const DialogTitle=({children})=>React.createElement('h2',null,children);export const DialogDescription=({children})=>React.createElement('p',null,children);`:name==='composer'?`import React from 'react';export default function Composer(p){return React.createElement('div',null,React.createElement('textarea',{'aria-label':p.messageLabel,value:p.value,onChange:e=>p.onChange(e.target.value)}),React.createElement('button',{type:'button',disabled:p.disabled||p.sending,onClick:p.onSend},'Enviar'));}`:`export default function Media(){return null;}`}));
 b.onResolve({filter:/^@\//},({path:name})=>{const f=path.join(root,'src',name.slice(2));return {path:[f,f+'.js',f+'.jsx'].find(existsSync)};});
}}]});
const {Conversation,Editor}=require(path.join(scratch,'ui.cjs'));
const workspace={client:{id:'account-a'},permissions:{conversations:true},channels:[{id:'a',nome:'Canal A',can_send:true},{id:'b',nome:'Canal B',can_send:true}],config:{data:{}}};
const text=n=>typeof n==='string'?n:Array.isArray(n)?n.map(text).join(' '):n?text(n.children??n.props?.children):'';
const button=(r,label)=>r.root.findAllByType('button').find(n=>text(n.props.children)===label);
const props=(api,channel='a',extra={})=>({api,mutate:api,workspace,canManage:true,profile:{id:'actor'},conversation:{contact_id:'contact',channel_id:channel},...extra});
function fixture(){const calls=[];return {calls,async api(action,payload){calls.push([action,payload]);if(action==='conversations')return {rows:[{...payload,nome:'Contato sintético',attendance:'human',updated_at:'v1'}]};if(action==='messages')return {rows:[{id:'message-'+payload.channel_id,body:'Histórico '+payload.channel_id,created_at:'2026-11-11T10:00Z'}],total:1};if(action==='conversation_context')return {status:'unlinked',lead:null};if(action==='send_message')return {status:'sent'};throw new Error(action);}};}
async function mount(properties){let r;await act(async()=>{r=create(React.createElement(Conversation,{key:properties.conversation.channel_id,...properties}));});return r;}
test('painel reaproveitado envia pelo contato/canal exatos e só limpa após recibo',async()=>{
 const f=fixture(),r=await mount(props(f.api));
 try{
  await act(async()=>r.root.findByProps({'aria-label':'Mensagem ao contato'}).props.onChange({target:{value:'Texto sintético'}}));
  await act(async()=>button(r,'Enviar').props.onClick());
  const payload=f.calls.find(([action])=>action==='send_message')[1];
  assert.equal(payload.contact_id,'contact');assert.equal(payload.channel_id,'a');assert.equal(payload.body,'Texto sintético');assert.match(payload.request_id,/^[\da-f-]{36}$/i);
  assert.equal(r.root.findByProps({'aria-label':'Mensagem ao contato'}).props.value,'');assert.match(text(r.toJSON()),/Envio confirmado/);
 }finally{await act(async()=>r.unmount());}
});
test('painel sem permissão não consulta mensagens/estado nem monta o compositor',async()=>{
 const f=fixture(),r=await mount(props(f.api,'a',{workspace:{...workspace,permissions:{conversations:false}}}));
 try{assert.equal(f.calls.length,0);assert.match(text(r.toJSON()),/indisponív/i);assert.equal(r.root.findAllByType('textarea').length,0);}
 finally{await act(async()=>r.unmount());}
});
test('canal ausente ou sem leitura não consulta nem oferece composição por link direto',async()=>{
 for(const [channel,channels] of [['unknown',workspace.channels],['a',[]],['a',[{id:'a',can_read:false,can_send:true}]]]){
  const f=fixture(),r=await mount(props(f.api,channel,{workspace:{...workspace,channels}}));
  try{assert.equal(f.calls.length,0);assert.equal(r.root.findAllByType('textarea').length,0);assert.match(text(r.toJSON()),/indisponív/i);}
  finally{await act(async()=>r.unmount());}
 }
});
test('revogar o canal oculta histórico e compositor já abertos',async()=>{
 const f=fixture(),r=await mount(props(f.api));
 try{
  assert.match(text(r.toJSON()),/Histórico a/);
  const before=f.calls.length;
  await act(async()=>r.update(React.createElement(Conversation,{key:'a',...props(f.api,'a',{workspace:{...workspace,channels:[]}})})));
  assert.equal(f.calls.length,before);assert.doesNotMatch(text(r.toJSON()),/Histórico a/);assert.equal(r.root.findAllByType('textarea').length,0);
 }finally{await act(async()=>r.unmount());}
});
test('resposta antiga de outro canal não volta para o painel escolhido',async()=>{
 const f=fixture();let finish;
 const api=(action,payload)=>action==='messages'&&payload.channel_id==='a'?new Promise(resolve=>{finish=resolve;}):f.api(action,payload);
 const r=await mount(props(api));
 try{
  await act(async()=>r.update(React.createElement(Conversation,{key:'b',...props(api,'b')})));
  await act(async()=>finish({rows:[{id:'old',body:'CONTEUDO ANTIGO',created_at:'2026-11-11T10:00Z'}],total:1}));
  assert.match(text(r.toJSON()),/Histórico b/);assert.doesNotMatch(text(r.toJSON()),/CONTEUDO ANTIGO/);
 }finally{await act(async()=>r.unmount());}
});
test('editor mantém classe canônica e desabilita ação de rodapé durante gravação',async()=>{
 let finish,submission;let r;
 await act(async()=>{r=create(React.createElement(Editor,{title:'Agente',className:'crm-ia-agent-editor',onClose(){},onSave:()=>new Promise(resolve=>{finish=resolve;}),footerActions:({pending,disabled})=>React.createElement('button',{type:'button',disabled:pending||disabled},'Descartar')},'Campos'));});
 try{
  const dialog=r.root.findByProps({role:'dialog'});assert.match(dialog.props.className,/crm-ia-dialog/);assert.match(dialog.props.className,/crm-ia-agent-editor/);
  await act(async()=>{submission=r.root.findByType('form').props.onSubmit({preventDefault(){}});});
  assert.equal(button(r,'Descartar').props.disabled,true);
  await act(async()=>{finish();await submission;});
 }finally{await act(async()=>r.unmount());}
});
test.after(async()=>{globalThis.fetch=previousFetch;await rm(scratch,{recursive:true,force:true});});

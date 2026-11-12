import React,{useEffect,useRef,useState} from 'react';
import {ImagePlus,Link2,X} from 'lucide-react';
import {supabase} from '@/lib/customSupabaseClient';
import {ATLAS_CHAT_IMAGE_BUCKET,validateChatImage} from '@/lib/atlasChatImages';

function LocalImage({item,onRemove}){
 const [url,setUrl]=useState('');
 useEffect(()=>{const value=URL.createObjectURL(item.file);setUrl(value);return()=>URL.revokeObjectURL(value);},[item.file]);
 return <div className="atlas-chat-image"><img src={url} alt={item.file.name||'Imagem anexada'}/><span>{item.file.name}</span>{onRemove&&<button type="button" aria-label={`Remover imagem ${item.file.name}`} onClick={()=>onRemove(item.id)}><X size={14}/></button>}</div>;
}
export function AtlasMessageImages({images=[],files=[]}){
 const [loaded,setLoaded]=useState([]),[failed,setFailed]=useState(false);
 const imageKey=JSON.stringify(images);
 useEffect(()=>{
  let alive=true;const urls=[];setLoaded([]);setFailed(false);
  const sources=JSON.parse(imageKey);
  if(sources.length)Promise.all(sources.map(async item=>{const {data,error}=await supabase.storage.from(ATLAS_CHAT_IMAGE_BUCKET).download(item.path);if(error||!data)throw new Error('Imagem indisponível');if(!alive)return null;const url=URL.createObjectURL(data);urls.push(url);return {...item,url};})).then(items=>{if(alive)setLoaded(items.filter(Boolean));}).catch(()=>{if(alive)setFailed(true);});
  return()=>{alive=false;urls.forEach(url=>URL.revokeObjectURL(url));};
 },[imageKey]);
 return <>{(files.length>0||images.length>0)&&<div className="atlas-chat-images">{files.map(item=><LocalImage key={item.id} item={item}/>)}{loaded.map(item=><a key={item.path} href={item.url} target="_blank" rel="noopener noreferrer" aria-label={`Abrir imagem ${item.name}`}><img src={item.url} alt={item.name}/></a>)}</div>}{failed&&<small role="status">Não consegui carregar a imagem nesta sessão.</small>}</>;
}
export default function AtlasChatContext({tasks=[],task,sources=[],files=[],onFiles,onLink,busy,onError,compact=false}){
 const input=useRef(null),alive=useRef(true),adding=useRef(false),[validating,setValidating]=useState(false),[pick,setPick]=useState(false),[query,setQuery]=useState(''),[chosen,setChosen]=useState(null),[sourceId,setSourceId]=useState('');
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 const sourceKey=JSON.stringify(sources.map(source=>source.id));
 useEffect(()=>{setSourceId('');setChosen(null);},[sourceKey]);
 const add=async event=>{
  const selected=Array.from(event.target.files||[]);event.target.value='';
  if(adding.current||busy||!selected.length)return;
  adding.current=true;setValidating(true);
  try{if(files.length+selected.length>2)throw new Error('Envie até duas imagens por mensagem.');for(const file of selected)await validateChatImage(file);if(alive.current){onError('');onFiles([...files,...selected.map(file=>({id:crypto.randomUUID(),file}))]);}}catch(error){if(alive.current)onError(error.message);}finally{adding.current=false;if(alive.current)setValidating(false);}
 };
 const options=tasks.filter(t=>!query||t.title.toLocaleLowerCase('pt-BR').includes(query.toLocaleLowerCase('pt-BR')));
 return <div className={'atlas-chat-context'+(compact?' is-compact':'')}>
  <div className="atlas-chat-images">{files.map(item=><LocalImage key={item.id} item={item} onRemove={id=>onFiles(files.filter(value=>value.id!==id))}/>)}</div>
  <div className="atlas-chat-tools"><button type="button" disabled={busy||validating} aria-label={validating?'Conferindo imagem…':'Imagem'} title={validating?'Conferindo imagem…':'Anexar imagem'} onClick={()=>input.current?.click()}><ImagePlus size={18} aria-hidden="true"/>{!compact&&(validating?'Conferindo imagem…':'Imagem')}</button><input ref={input} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden aria-label="Anexar imagens ao Atlas" onChange={add}/>{!task&&tasks.length>0&&<button type="button" disabled={busy} aria-expanded={pick} aria-label="Indicar tarefa existente" title="Indicar tarefa existente" onClick={()=>setPick(!pick)}><Link2 size={18} aria-hidden="true"/>{!compact&&'Indicar tarefa existente'}</button>}</div>
  {pick&&!task&&<div className="atlas-chat-task-picker">{sources.length>1&&<label>Qual pedido pertence a esta tarefa?<select value={sourceId} onChange={e=>setSourceId(e.target.value)}><option value="">Escolha o pedido</option>{sources.map(source=><option key={source.id} value={source.id}>{source.title}</option>)}</select></label>}<label>Buscar tarefa deste cliente<input value={query} onKeyDown={e=>{if(e.key==='Enter')e.preventDefault();}} onChange={e=>setQuery(e.target.value)} placeholder="Nome da tarefa"/></label><div role="group" aria-label="Tarefas deste cliente">{options.map(t=><button type="button" aria-pressed={chosen?.id===t.id} key={t.id} onClick={()=>setChosen(t)}><strong>{t.title}</strong><small>{t.terminal?'Concluída':t.status||'Em aberto'}{t.due_date?` · Entrega: ${String(t.due_date).slice(0,10).split('-').reverse().join('/')}`:''}{t.post_date?` · Postagem: ${String(t.post_date).slice(0,10).split('-').reverse().join('/')}`:''}</small></button>)}{options.length===0&&<p>Nenhuma tarefa encontrada neste cliente.</p>}</div>{chosen&&<button type="button" className="is-primary" disabled={busy||(sources.length>1&&!sourceId)} onClick={()=>onLink(chosen,sourceId||sources[0]?.id||null)}>Usar esta tarefa</button>}</div>}
 </div>;
}

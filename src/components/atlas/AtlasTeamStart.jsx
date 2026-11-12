import React,{useEffect,useState} from 'react';
import {teamLaunchOptions,teamLaunchTasks} from '@/lib/atlasTeam';

export default function AtlasTeamStart({value,onChange,onSubmit,busy}){
 const [options,setOptions]=useState(null),[tasks,setTasks]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState('');
 useEffect(()=>{let active=true;teamLaunchOptions().then(data=>active&&setOptions(data)).catch(e=>active&&setError(e.message));return()=>{active=false;};},[]);
 useEffect(()=>{let active=true;setTasks([]);setError('');if(!value.client){setLoading(false);return;}setLoading(true);teamLaunchTasks(value.client).then(rows=>active&&setTasks(rows)).catch(e=>active&&setError(e.message)).finally(()=>active&&setLoading(false));return()=>{active=false;};},[value.client]);
 const set=(key,next)=>onChange({...value,[key]:next,confirmed:key==='confirmed'?next:false,...(key==='client'?{task:''}:{})});
 const available=tasks.filter(t=>!options?.statuses.some(s=>s.value===t.status&&s.is_terminal));
 return <form className="atlas-team-start" onSubmit={e=>{e.preventDefault();onSubmit();}}>
  <strong>Novo acompanhamento</strong><p>Escolha uma tarefa existente e quem responde internamente pela conta. O Atlas vai conversar com essa pessoa no Planeje.</p>
  {error&&<p role="alert" className="atlas-team-start-error">{error}</p>}
  <label>Cliente<select aria-label="Cliente do acompanhamento" value={value.client} disabled={busy||!options} onChange={e=>set('client',e.target.value)} required><option value="">Selecione o cliente</option>{options?.clients.map(c=><option key={c.id} value={c.id}>{c.empresa}</option>)}</select></label>
  <label>Tarefa em aberto<select aria-label="Tarefa do acompanhamento" value={value.task} disabled={busy||loading||!value.client} onChange={e=>set('task',e.target.value)} required><option value="">{loading?'Conferindo tarefas…':'Selecione a tarefa'}</option>{available.map(t=><option key={t.id} value={t.id}>{t.title}</option>)}</select></label>
  {value.client&&!loading&&!error&&!available.length&&<small>Nenhuma tarefa em aberto neste cliente.</small>}
  <label>Responsável interno pela conta<select aria-label="Responsável interno pela conta" value={value.account} disabled={busy||!options} onChange={e=>set('account',e.target.value)} required><option value="">Selecione a pessoa</option>{options?.people.map(p=><option key={p.id} value={p.id}>{p.full_name}</option>)}</select></label>
  <label>O que o Atlas precisa alinhar?<textarea aria-label="Orientação do acompanhamento" value={value.text} maxLength={2000} disabled={busy} onChange={e=>set('text',e.target.value)} placeholder="Ex.: confirme o andamento e combine o próximo retorno."/></label>
  <label className="atlas-team-start-consent"><input type="checkbox" checked={value.confirmed} disabled={busy} onChange={e=>set('confirmed',e.target.checked)}/>Autorizo o Atlas a chamar esta pessoa no Planeje sobre a tarefa.</label>
  <small>Prazo, etapa e responsáveis da tarefa permanecem iguais. Novas tarefas e transferências continuam exigindo sua aprovação.</small>
  <button type="submit" disabled={busy||loading||!options||Boolean(error)||!value.client||!available.some(t=>t.id===value.task)||!value.account||!value.confirmed}>{busy?'Iniciando…':'Iniciar conversa de acompanhamento'}</button>
 </form>;
}

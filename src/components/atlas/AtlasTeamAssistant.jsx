import React,{useCallback,useEffect,useRef,useState} from 'react';
import {ChevronLeft,ChevronRight,Send,X,Clock3,ExternalLink,Check,Loader2,Maximize2,Minimize2} from 'lucide-react';
import {Link,useLocation} from 'react-router-dom';
import {useAuth} from '@/contexts/SupabaseAuthContext';
import {ATLAS_TEAM_ENABLED,ATLAS_TEAM_PILOT,TEAM_STATES,teamStamp,teamRpc,teamReply,teamNeedsAnswer,teamNeedsCall,safeEvidenceUrl,teamDictation} from '@/lib/atlasTeam';
import AtlasReplyText from './AtlasReplyText';
import AtlasTeamActivity from './AtlasTeamActivity';
import AtlasDictationButton from './AtlasDictationButton';
import AtlasTeamStart from './AtlasTeamStart';
import AtlasChatContext,{AtlasMessageImages} from './AtlasChatContext';
import useAtlasFloatingPosition from './useAtlasFloatingPosition';
import atlasAvatar from '@/assets/atlas/atlas-avatar-3d-v1.png';
import './AtlasTeamAssistant.css';

export default function AtlasTeamAssistant(){
 const {user,profile}=useAuth();
 const location=useLocation();
 const [threads,setThreads]=useState([]),[open,setOpen]=useState(false),[selected,setSelected]=useState(null),[context,setContext]=useState(null),[drafts,setDrafts]=useState({}),[busy,setBusy]=useState(false),[error,setError]=useState(''),[recording,setRecording]=useState(false),[review,setReview]=useState(''),[note,setNote]=useState('');
 const [manager,setManager]=useState(false),[starting,setStarting]=useState(false),[launch,setLaunch]=useState({client:'',task:'',account:'',text:'',confirmed:false,nonce:null}),[accountChoice,setAccountChoice]=useState('');
 const [outbox,setOutbox]=useState({}),[imageDrafts,setImageDrafts]=useState({});
 const [expanded,setExpanded]=useState(true);
 const [responsible,setResponsible]=useState('');
 const [arrivingMessage,setArrivingMessage]=useState(null);
 const seenMessages=useRef({thread:null,actor:null,ids:new Set()});
 const linkRequest=useRef(null);
 const actorEpoch=useRef(0);
 const [view,setView]=useState('answer'),[groupAnswer,setGroupAnswer]=useState({id:'',note:'',confirmed:false});
 const [callNotice,setCallNotice]=useState(null),[callFocused,setCallFocused]=useState(false);
 const announced=useRef({userId:null,keys:new Set()});
 const epoch=useRef(0),busyRef=useRef(false),abort=useRef(null),request=useRef(null),end=useRef(null),reviewKey=useRef('');
 const refresh=useCallback(async()=>{const generation=epoch.current;const rows=await teamRpc('atlas_team_list');const available=rows.some(t=>t.id===selected);const value=selected&&available?await teamRpc('atlas_team_context',{p_thread:selected}):null;if(generation===epoch.current){setThreads(rows);if(value){const seen=seenMessages.current;const incoming=seen.thread===selected&&seen.actor===user.id?[...value.messages].reverse().find(m=>m.role==='atlas'&&!seen.ids.has(m.id)):null;setArrivingMessage(incoming?.id||null);seenMessages.current={thread:selected,actor:user.id,ids:new Set(value.messages.map(m=>m.id))};}setContext(value);if(selected&&!available){setSelected(null);setError('Este assunto seguiu para outra pessoa ou foi encerrado.');}}return value;},[selected,user?.id]);
 const refreshLatest=useRef(refresh);refreshLatest.current=refresh;
 useEffect(()=>{epoch.current++;setContext(null);if(!ATLAS_TEAM_ENABLED||!user?.id)return;let active=true;refresh().catch(e=>active&&setError(e.message));const timer=setInterval(()=>{if(!document.hidden&&!busyRef.current)refresh().catch(e=>active&&setError(e.message));},15000);return()=>{active=false;epoch.current++;clearInterval(timer);};},[refresh]);
 useEffect(()=>{actorEpoch.current++;setExpanded(true);setResponsible('');setView('answer');setDrafts({});setOutbox({});setImageDrafts({});linkRequest.current=null;setError('');setSelected(null);setOpen(false);request.current=null;busyRef.current=false;setBusy(false);return()=>{actorEpoch.current++;abort.current?.abort();};},[user?.id]);
 useEffect(()=>{let active=true;setManager(false);setStarting(false);setLaunch({client:'',task:'',account:'',text:'',confirmed:false,nonce:null});if(ATLAS_TEAM_ENABLED&&user?.id)teamRpc('atlas_demand_access').then(value=>active&&setManager(value===true)).catch(()=>{});return()=>{active=false;};},[user?.id]);
 useEffect(()=>{if(open)end.current?.scrollIntoView({block:'end'});},[context?.messages?.length,outbox[selected]?.id,outbox[selected]?.state,open]);
 useEffect(()=>{const local=outbox[selected];if(!local||!context)return;const messageId=local.message_id||(context.last_request?.id===local.id?context.last_request.message_id:null);if(messageId&&context.messages.some(m=>m.id===messageId&&m.role==='human'&&m.actor_id===user?.id))setOutbox(old=>{const next={...old};delete next[selected];return next;});},[context,outbox,selected,user?.id]);
 useEffect(()=>{const keydown=e=>{if(e.key==='Escape')setOpen(false);};window.addEventListener('keydown',keydown);return()=>window.removeEventListener('keydown',keydown);},[]);
 const run=async fn=>{if(busyRef.current)return;const generation=epoch.current;busyRef.current=true;setBusy(true);setError('');try{await fn();if(generation===epoch.current)await refresh();}catch(e){if(generation===epoch.current&&e.name!=='AbortError'){setError(e.message);try{await refresh();}catch{/* Keep the original error and draft when refresh is unavailable. */}}}finally{busyRef.current=false;setBusy(false);}};
 const choose=id=>{setError('');setGroupAnswer({id:'',note:'',confirmed:false});setSelected(id);setStarting(false);setOpen(true);setNote('');setReview('');setAccountChoice('');reviewKey.current='';};
 useEffect(()=>{if(!ATLAS_TEAM_ENABLED||!user?.id)return;const show=()=>{if(busyRef.current)return;setSelected(null);setContext(null);setStarting(false);setOpen(true);};window.addEventListener('atlas-team:list',show);return()=>window.removeEventListener('atlas-team:list',show);},[user?.id]);
 useEffect(()=>{if(!ATLAS_TEAM_ENABLED||!user?.id)return;const show=event=>{const id=event.detail?.threadId;if(typeof id==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)){if(busyRef.current)return;setError('');setContext(null);choose(id);}};window.addEventListener('atlas-team:open',show);return()=>window.removeEventListener('atlas-team:open',show);},[user?.id]);
 const start=()=>run(async()=>{if(!manager||!launch.confirmed)throw new Error('Confira e autorize quem o Atlas deve chamar.');const id=await teamRpc('atlas_team_create',{p_client:launch.client,p_task:launch.task,p_account:launch.account,p_source:'manual-task:'+launch.task+':'+launch.nonce,p_context:{text:launch.text.trim(),label:'Acompanhamento iniciado pelo dono',at:new Date().toISOString()}});choose(id);setLaunch({client:'',task:'',account:'',text:'',confirmed:false,nonce:null});});
 useEffect(()=>{if(open&&context?.thread?.id)teamRpc('atlas_team_action',{p_thread:context.thread.id,p_action:'read',p_revision:context.thread.revision,p_data:{}}).then(()=>setThreads(rows=>rows.map(t=>t.id===context.thread.id?{...t,read_at:new Date().toISOString()}:t))).catch(()=>{});},[open,context?.thread?.id,context?.messages?.length]);
 const supervise=manager&&profile?.role==='superadmin';
 const responsibleOptions=supervise?[...new Map(threads.filter(t=>t.current_person_id).map(t=>[t.current_person_id,t.person_name||'Pessoa indisponível'])).entries()].sort((a,b)=>a[1].localeCompare(b[1],'pt-BR')):[];
 const displayed=threads.filter(t=>view==='all'&&supervise&&(!responsible||t.current_person_id===responsible)||view==='answer'&&teamNeedsAnswer(t,user?.id)||view==='unread'&&t.current_person_id===user?.id&&t.last_atlas_at&&(!t.read_at||t.last_atlas_at>t.read_at)||view==='following'&&t.current_person_id===user?.id&&!teamNeedsAnswer(t,user?.id));
 const calls=threads.filter(t=>teamNeedsCall(t,user?.id));
 const userId=user?.id,callKey=JSON.stringify(calls.map(t=>[t.id,t.last_atlas_at]));
 useEffect(()=>{
  if(announced.current.userId!==userId)announced.current={userId,keys:new Set()};
  if(open||!userId){setCallNotice(null);setCallFocused(false);return;}
  const pending=JSON.parse(callKey),fresh=pending.find(item=>!announced.current.keys.has(JSON.stringify(item)));
  pending.forEach(item=>announced.current.keys.add(JSON.stringify(item)));
  if(fresh){setCallNotice({userId,id:fresh[0],at:fresh[1]});setCallFocused(document.activeElement?.classList.contains('atlas-team-call')===true);}
 },[userId,callKey,open]);
 useEffect(()=>{
  if(!callNotice||callFocused)return;
  const timer=setTimeout(()=>setCallNotice(null),5000);
  return()=>clearTimeout(timer);
 },[callNotice,callFocused]);
 const noticeCall=callNotice&&callNotice.userId===userId?calls.find(t=>t.id===callNotice.id):null;
 const visible=ATLAS_TEAM_ENABLED&&!!user?.id&&(manager||threads.length>0||open);
 const personalEntry=manager&&location.pathname==='/assistant/atlas';
 const floating=useAtlasFloatingPosition({userId:user?.id,visible,open,expanded,callCount:noticeCall?calls.length:0});
 const thread=context?.thread,last=context?.messages?.at(-1),previous=context?.messages?.at(-2);
 const proposal=last?.role==='atlas'&&last.proposal&&previous?.actor_id===user?.id&&last.proposal.update_kind!=='clarify'?last.proposal:null;
 useEffect(()=>{if(proposal&&reviewKey.current!==proposal.request_id){reviewKey.current=proposal.request_id;setReview(proposal.review_at?proposal.review_at.slice(0,16):'');}},[proposal?.request_id]);
 const action=(kind,data)=>run(()=>kind==='review_delivery'&&thread.management_kind?teamRpc('atlas_manager_review',{p_thread:thread.id,p_revision:thread.revision,p_accepted:data.accepted,p_note:data.note}):teamRpc('atlas_team_action',{p_thread:thread.id,p_action:kind,p_revision:thread.revision,p_data:data}));
 const submitReply=async(message,id,files=outbox[selected]?.files||[])=>{
  if(busyRef.current||!thread||recording)return;
  if(message.length>4000){setError('Escreva uma mensagem de até 4.000 caracteres. O texto permanece no campo para ajustar.');return;}
  const target=thread,generation=actorEpoch.current,controller=new AbortController();
  busyRef.current=true;abort.current=controller;request.current={fingerprint:JSON.stringify([target.id,message]),id};
  setError('');setOutbox(old=>({...old,[target.id]:{id,message,files,actor_id:user.id,created_at:new Date().toISOString(),state:'sending'}}));
  setImageDrafts(old=>({...old,[target.id]:[]}));
  setDrafts(old=>({...old,[target.id]:(old[target.id]||'').trim()===message?'':old[target.id]}));
  const timer=setTimeout(()=>controller.abort(),15000);
  try{
   const receipt=await teamReply({thread:target,message,requestId:id,signal:controller.signal,files});
   if(generation!==actorEpoch.current)return;
   request.current=null;
   setOutbox(old=>old[target.id]?.id===id?{...old,[target.id]:{...old[target.id],message_id:receipt.message_id,state:'saved'}}:old);
  }catch(e){
   if(generation!==actorEpoch.current)return;
   setOutbox(old=>old[target.id]?.id===id?{...old,[target.id]:{...old[target.id],state:'failed',error:e.name==='AbortError'?'A confirmação demorou mais que o esperado.':e.message?.slice(0,500)}}:old);
  }finally{
   clearTimeout(timer);
   if(generation===actorEpoch.current){busyRef.current=false;abort.current=null;refreshLatest.current().catch(e=>{if(generation===actorEpoch.current)setError(e.message);});}
  }
 };
 const send=e=>{e.preventDefault();const files=imageDrafts[selected]||[],text=(drafts[selected]||'').trim(),message=text||(files.length?'Enviei imagens para você analisar.':'');if(!message||!thread||recording||pendingReply||unconfirmedReply)return;const fingerprint=JSON.stringify([thread.id,message]);submitReply(message,request.current?.fingerprint===fingerprint?request.current.id:crypto.randomUUID(),files);};
 const composerKeyDown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing&&e.nativeEvent.keyCode!==229){e.preventDefault();if(!e.repeat)send(e);}};
 const canReply=thread&&[thread.owner_id,thread.current_person_id].includes(user?.id)&&!['delivery_review','closed'].includes(thread.state);
 const failedReply=context?.last_request?.state==='failed'?context.last_request:null;
 const waitingBudget=context?.last_request?.error_code==='MANAGER_BUDGET_WAIT';
 const localReply=outbox[selected]?.actor_id===user?.id?outbox[selected]:null;
 const localMessageId=localReply?.message_id||(context?.last_request?.id===localReply?.id?context?.last_request?.message_id:null);
 const visibleLocalReply=localReply&&!context?.messages?.some(m=>m.id===localMessageId&&m.role==='human'&&m.actor_id===user?.id);
 const unconfirmedReply=localReply?.state==='failed';
 const pendingReply=['sending','saved'].includes(localReply?.state)||context?.reply_pending===true||['queued','processing'].includes(context?.last_request?.state);
 const sending=Object.values(outbox).some(item=>item.state==='sending');
 const sendLabel=busy?'Salvando…':localReply?.state==='sending'?'Enviando…':pendingReply?'Aguardando Atlas':'Enviar';
 const waiting=thread?.management_data?.dialogue?.waiting_on;
 const linkTask=(task,sourceId)=>run(async()=>{
  if(!thread)return;
  const key=thread.id+':'+task.id+':'+(sourceId||'');
  if(linkRequest.current?.key!==key)linkRequest.current={key,id:crypto.randomUUID()};
  await teamRpc('atlas_team_link_task',{p_thread:thread.id,p_task:task.id,p_revision:thread.revision,p_id:linkRequest.current.id,p_source:sourceId||null});
  linkRequest.current=null;
 });
 if(!visible)return null;
 return <div className={'atlas-team-assistant is-draggable'+(open&&expanded?' is-expanded':'')+(floating.dragging?' is-dragging':'')} style={floating.style}>
  {!open&&noticeCall&&<button ref={floating.callRef} style={floating.callStyle} className="atlas-team-call" onFocus={()=>setCallFocused(true)} onBlur={()=>setCallFocused(false)} onClick={()=>choose(noticeCall.id)}><span>Oi, preciso de você</span><small>{noticeCall.client_name} · {calls.length} assunto{calls.length>1?'s':''}</small></button>}
  <button {...floating.robotProps} className="atlas-team-robot" aria-label={open?'Recolher conversa com Atlas':`Conversar com Atlas${calls.length?` · ${calls.length} chamado(s)`:''}`} aria-expanded={personalEntry&&!open?undefined:open} onClick={()=>{if(personalEntry&&!open){window.dispatchEvent(new CustomEvent('atlas-personal:open'));return;}if(!open&&calls.length===1)choose(calls[0].id);else setOpen(value=>!value);}}><img className="atlas-team-avatar" src={atlasAvatar} alt="" aria-hidden="true" width="60" height="60" draggable="false"/>{calls.length>0&&<b>{calls.length}</b>}</button>
  {open&&<section className="atlas-team-box" style={floating.boxStyle} role="dialog" aria-label="Conversa com Atlas sobre demandas">
   <header><button aria-label="Ver assuntos do Atlas" onClick={()=>{setSelected(null);setContext(null);setStarting(false);}} disabled={busy}><ChevronLeft size={17}/></button><img className="atlas-team-avatar atlas-team-header-avatar" src={atlasAvatar} alt="" aria-hidden="true" width="38" height="38" draggable="false"/><span><strong>Atlas</strong><small>{starting?'Novo acompanhamento':context?.client_name||'Acompanhamento da equipe'}{ATLAS_TEAM_PILOT?' · TESTE PRIVADO':''}</small></span><button aria-label={expanded?'Reduzir conversa':'Ampliar conversa'} title={expanded?'Reduzir conversa':'Ampliar conversa'} aria-pressed={expanded} onClick={()=>setExpanded(value=>!value)}>{expanded?<Minimize2 size={16}/>:<Maximize2 size={16}/>}</button><button aria-label="Fechar conversa com Atlas" onClick={()=>setOpen(false)}><X size={18}/></button></header>
   {error&&<p className="atlas-team-error" role="alert">{error}</p>}
   {starting?<AtlasTeamStart value={launch} onChange={setLaunch} onSubmit={start} busy={busy}/>:!selected?<div className="atlas-team-list">{manager&&<button className="atlas-team-new" onClick={()=>{setStarting(true);setLaunch(value=>({...value,nonce:value.nonce||crypto.randomUUID()}));}}>Novo acompanhamento</button>}<nav className="atlas-team-filters" aria-label="Filtrar assuntos">{[['answer','Precisa responder'],['unread','Não lidas'],['following','Atlas acompanhando'],...(supervise?[['all','Equipe']]:[])].map(([key,label])=><button key={key} aria-pressed={view===key} onClick={()=>setView(key)}>{label}</button>)}</nav>{supervise&&view==='all'&&<label className="atlas-team-responsible">Responsável<select aria-label="Responsável" value={responsible} onChange={e=>setResponsible(e.target.value)}><option value="">Todos os responsáveis</option>{responsibleOptions.map(([id,name])=><option key={id} value={id}>{name}</option>)}{responsible&&!responsibleOptions.some(([id])=>id===responsible)&&<option value={responsible}>Responsável sem assuntos</option>}</select><small role="status">{displayed.length} assunto{displayed.length===1?'':'s'}</small></label>}{!displayed.length&&<p className="atlas-team-loading">{view==='answer'?'Nenhuma resposta sua pendente. Veja o que o Atlas está acompanhando.':'Nenhum assunto neste filtro.'}</p>}{displayed.map(t=><button key={t.id} onClick={()=>choose(t.id)}><span><strong>{t.client_name}</strong><small>{t.title}</small>{t.management_data?.attention_since&&<small>Sem retorno desde {teamStamp(t.management_data.attention_since)}</small>}<small>{t.management_data?.dispatch_pending?'Agendado':t.management_data?.dialogue?.waiting_on==='client'?'Aguardando cliente':TEAM_STATES[t.state]} · {t.person_name}</small></span><ChevronRight size={15}/></button>)}</div>:!context?<p className="atlas-team-loading">Conferindo o acompanhamento…</p>:<>
    <details key={selected} className="atlas-team-subject"><summary><strong>{thread.title}</strong><small>{thread.management_data?.dispatch_pending?'Agendado':waiting==='client'?'Aguardando cliente':TEAM_STATES[thread.state]} · {threads.find(t=>t.id===selected)?.person_name||context.people.find(p=>p.id===thread.current_person_id)?.name||'Pessoa indisponível'}</small></summary><div className="atlas-team-subject-details"><span><Clock3 size={12}/> Próxima revisão: {teamStamp(thread.next_review_at)}</span>{thread.management_kind&&<small>{thread.management_kind==='intake'?'Esclarecendo o pedido antes de organizar a execução':thread.management_kind==='owner_context'?'Informação que falta ao Atlas':thread.management_kind==='consultation'?'Buscando a resposta para a consulta do dono':'Acompanhando a execução'} · respostas ficam registradas nesta conversa.</small>}{(thread.task_id||thread.management_data?.linked_task_id)&&<><small>Prazo oficial da tarefa: {context.task?.due_date?.split('-').reverse().join('/')||'Não disponível'}</small><Link to={'/tasks/list/'+(thread.task_id||thread.management_data?.linked_task_id)}>Abrir tarefa <ExternalLink size={12}/></Link></>}</div></details>
    <div className="atlas-team-messages">
     <details className="atlas-team-source"><summary>Pedido e contexto de origem</summary><p>{thread.shared_context?.text||'Consulte o registro vinculado.'}</p><p>{thread.summary}</p><p>{thread.management_data?.dialogue?.next_action}</p>{thread.management_data?.owner_direction?.summary&&<p>Orientação do dono: {thread.management_data.owner_direction.summary}</p>}<small>{thread.shared_context?.label} · {teamStamp(thread.shared_context?.at)}</small></details>
     {context.task&&<details className="atlas-team-source"><summary>O que o Atlas consultou na tarefa</summary><p>{context.task.description}</p><p>Etapa: {context.task.status} · {context.task.assignees?.map(p=>p.name).join(', ')||'Sem responsável registrado'}</p>{context.task.comments?.map(c=><p key={c.id}>Comentário · {c.author} · {teamStamp(c.at||c.created_at)}<br/>{c.body}</p>)}{context.task.justifications?.map(j=><p key={j.id}>Justificativa · {j.author} · {teamStamp(j.created_at)}<br/>{j.details}</p>)}{[...(context.task.attachments||[]).map(a=>({...a,label:a.name,url:a.url})),...(context.task.publications||[]).map(a=>({...a,label:`${a.channel} · ${a.status}`,url:a.evidence_url}))].map((a,i)=><p key={a.id||i}>{safeEvidenceUrl(a.url)?<a href={safeEvidenceUrl(a.url)} target="_blank" rel="noopener noreferrer">{a.label||'Abrir registro'}</a>:a.label}{a.after_last_rework===false?' · Registro anterior à alteração':''}</p>)}<small>Links consultados como registros. Conteúdo e publicação externa não foram verificados automaticamente.</small></details>}
     {(context.analysis_status?.waiting_budget&&!waitingBudget)&&<p className="atlas-team-analysis-status" role="status">As novas análises deste cliente estão aguardando o limite diário. Os registros abaixo continuam disponíveis.</p>}{context.messages.map(m=><article className={'atlas-team-message '+(m.role==='human'?'from-person':'from-atlas')} key={m.id}><span>{m.role==='atlas'?'Atlas':context.people.find(p=>p.id===m.actor_id)?.name||'Equipe'} · {teamStamp(m.created_at)}</span><>{m.images?.length>0&&<AtlasMessageImages key={m.id+':'+user.id} images={m.images}/>} {m.proposal?.selected_task_id&&<small>Referência indicada nesta conversa</small>}{m.role==='atlas'&&m.content.length>450&&arrivingMessage!==m.id?<details><summary>{m.content.slice(0,160)}… · Ler mensagem completa</summary><p>{m.content}</p></details>:m.role==='atlas'?<AtlasReplyText key={m.id} text={m.content} animate={arrivingMessage===m.id}/>:<p>{m.content}</p>}</></article>)}
     {visibleLocalReply&&<article className="atlas-team-message from-person" aria-label="Sua mensagem"><span>Você · {teamStamp(localReply.created_at)}</span><p>{localReply.message}</p><AtlasMessageImages files={localReply.files||[]}/><small role="status">{localReply.state==='sending'?'Enviando…':localReply.state==='failed'?'Não consegui confirmar o envio. Sua mensagem continua aqui.':'Recebida pelo Planeje'}</small>{localReply.state==='failed'&&localReply.error&&<small>{localReply.error}</small>}{localReply.state==='failed'&&<button type="button" className="atlas-team-retry-send" disabled={busy||sending||recording} onClick={()=>submitReply(localReply.message,localReply.id)}>Tentar enviar novamente</button>}</article>}
     {!!context.group_alerts?.length&&<details className="atlas-team-proposal"><summary>Atendimento do WhatsApp · separado desta tarefa</summary><p>Este aviso é do grupo do cliente. Registrar o atendimento não conclui nem cancela a tarefa desta conversa.</p><label>Grupo<select aria-label="Grupo respondido" value={groupAnswer.id} disabled={busy||pendingReply} onChange={e=>setGroupAnswer({id:e.target.value,note:'',confirmed:false})}><option value="">Escolha o grupo</option>{context.group_alerts.map(g=><option key={g.id} value={g.id}>{g.name||'Grupo do cliente'} · desde {teamStamp(g.since)}</option>)}</select></label><label>Como o cliente foi respondido?<textarea aria-label="Justificativa do atendimento" maxLength={2000} value={groupAnswer.note} onChange={e=>setGroupAnswer(v=>({...v,note:e.target.value}))}/></label><label><span><input type="checkbox" checked={groupAnswer.confirmed} onChange={e=>setGroupAnswer(v=>({...v,confirmed:e.target.checked}))}/> Confirmo o atendimento. Resolver somente o aviso, preservando mensagens e tarefas.</span></label><button disabled={busy||pendingReply||!groupAnswer.id||groupAnswer.note.trim().length<10||!groupAnswer.confirmed} onClick={()=>run(async()=>{const group=context.group_alerts.find(g=>g.id===groupAnswer.id);await teamRpc('atlas_team_answered_group',{p_thread:thread.id,p_revision:thread.revision,p_conversation:group.id,p_version:group.version,p_note:groupAnswer.note.trim()});setGroupAnswer({id:'',note:'',confirmed:false});})}>Registrar atendimento e resolver aviso</button></details>}
     <AtlasTeamActivity key={selected+':'+user.id} threadId={selected} actorId={user.id} requestId={localReply?.id||context.last_request?.id} pending={pendingReply} taskId={context.task?.id} onSettled={()=>{if(!busyRef.current)refreshLatest.current().catch(()=>{});}}/>
     {failedReply&&<div className="atlas-team-proposal" role="status"><strong>Sua resposta está guardada</strong><p>{failedReply.error_code==='MANAGER_BUDGET_WAIT'?'O teto diário de análises foi atingido. Sua mensagem está guardada; tente novamente quando houver orçamento disponível.':'O Atlas não conseguiu concluir a análise dessa resposta.'}</p>{canReply&&(failedReply.attempt||1)<3?<button disabled={busy||sending||recording} onClick={()=>submitReply(failedReply.message,failedReply.id)}>Tentar novamente</button>:<small>{(failedReply.attempt||1)>=3?'As três tentativas falharam. O texto e o histórico foram preservados.':'O assunto seguiu para outra pessoa. Sua resposta permanece no histórico.'}</small>}</div>}
     {context.is_owner&&thread.management_kind==='owner_context'&&thread.management_data?.needs_account&&<div className="atlas-team-proposal"><label>Quem cuida desta conta?<select aria-label="Responsável interno da conta" value={accountChoice} onChange={e=>setAccountChoice(e.target.value)} disabled={busy||sending}><option value="">Selecione uma pessoa</option>{context.people.filter(p=>p.id!==user.id).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><button disabled={busy||sending||!accountChoice} onClick={()=>run(()=>teamRpc('atlas_manager_set_account',{p_thread:thread.id,p_person:accountChoice,p_revision:thread.revision}))}>{thread.state==='closed'?'Atualizar responsável':'Guardar responsável e seguir com a equipe'}</button><small>O Atlas vai usar esta definição nos próximos pedidos deste cliente.</small></div>}
     {proposal&&<div className="atlas-team-proposal"><strong>Confira o combinado</strong><p>{proposal.summary}</p>{proposal.next_person_id&&proposal.next_person_id!==thread.current_person_id&&<p>Atlas vai perguntar a <b>{context.people.find(p=>p.id===proposal.next_person_id)?.name}</b>. O responsável da tarefa permanece igual.</p>}{proposal.expected_at&&<p>Previsão informada: {teamStamp(proposal.expected_at)}</p>}{proposal.evidence_url&&safeEvidenceUrl(proposal.evidence_url)&&<a href={safeEvidenceUrl(proposal.evidence_url)} target="_blank" rel="noopener noreferrer">Abrir evidência informada <ExternalLink size={12}/></a>}{!['delivered','needs_owner'].includes(proposal.update_kind)&&<label>Revisar andamento em <input type="datetime-local" aria-label="Data e horário da revisão" value={review} onChange={e=>setReview(e.target.value)} disabled={busy||sending}/></label>}{proposal.review_note&&<small>{proposal.review_note}</small>}<small>Horários de São Paulo. Revisão não altera o prazo oficial.</small><button disabled={busy||sending||(!review&&!['delivered','needs_owner'].includes(proposal.update_kind))} onClick={()=>action('confirm',{request_id:proposal.request_id,review_at:review?review+':00-03:00':null})}><Check size={14}/>Registrar combinado</button></div>}
     {thread.state==='delivery_review'&&<div className="atlas-team-proposal"><strong>Entrega informada, aguardando conferência</strong>{safeEvidenceUrl(thread.evidence_url)&&<a href={safeEvidenceUrl(thread.evidence_url)} target="_blank" rel="noopener noreferrer">Conferir evidência <ExternalLink size={12}/></a>}{(context.is_owner||thread.management_kind&&user.id===thread.account_person_id)&&<><label>O que você conferiu?<textarea aria-label="Registro da revisão da entrega" value={note} onChange={e=>setNote(e.target.value)} maxLength={2000}/></label><button disabled={busy||sending||!note.trim()} onClick={()=>action('review_delivery',{confirmed:true,accepted:true,note})}>Conferi a entrega</button><button className="is-secondary" disabled={busy||sending||!note.trim()} onClick={()=>action('review_delivery',{confirmed:true,accepted:false,note})}>Pedir ajuste à conta</button></>}</div>}
     <div ref={end}/>
    </div>
    {canReply&&<form className="atlas-team-composer" onSubmit={send}>
     <div className="atlas-team-input">
      <textarea aria-label="Mensagem para o Atlas" placeholder="Conte o andamento ou combine um retorno…" value={drafts[selected]||''} onChange={e=>setDrafts(old=>({...old,[selected]:e.target.value}))} maxLength={4000} disabled={busy} onKeyDown={composerKeyDown} aria-describedby="atlas-team-send-help"/>
      <AtlasChatContext compact key={selected+':'+user.id} tasks={context.tasks||[]} sources={context.link_sources||[]} task={context.task} files={imageDrafts[selected]||[]} onFiles={files=>setImageDrafts(old=>({...old,[selected]:files}))} onLink={linkTask} busy={busy||sending||pendingReply||unconfirmedReply||recording} onError={setError}/>
      <div className="atlas-team-input-actions">
       <AtlasDictationButton compact key={selected} disabled={busy||sending} onActiveChange={setRecording} transcribe={audio=>teamDictation({...audio,threadId:selected})} onText={text=>setDrafts(old=>({...old,[selected]:(old[selected]?old[selected]+'\n':'')+text}))}/>
       <button type="submit" className="atlas-team-send" aria-label={sendLabel} title={sendLabel} disabled={busy||sending||pendingReply||unconfirmedReply||recording||(!(drafts[selected]||'').trim()&&!(imageDrafts[selected]||[]).length)}>{busy||sending?<Loader2 size={18} className="atlas-spin" aria-hidden="true"/>:pendingReply?<Clock3 size={18} aria-hidden="true"/>:<Send size={18} aria-hidden="true"/>}</button>
      </div>
     </div>
     <div className="atlas-team-composer-footer"><small id="atlas-team-send-help" className="atlas-team-send-help">Enter envia · Shift+Enter quebra linha</small><button type="button" className="atlas-team-snooze" aria-label="Lembrar em 30 min" title="Lembrar em 30 min" disabled={busy||pendingReply||recording} onClick={()=>action('snooze',{review_at:new Date(Date.now()+30*60000).toISOString()})}><Clock3 size={13} aria-hidden="true"/>30 min</button></div>
    </form>}
   </>}
  </section>}
 </div>;
}

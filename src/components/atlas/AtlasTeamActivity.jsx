import React,{useEffect,useRef,useState} from 'react';
import {Link} from 'react-router-dom';
import {teamRpc,teamStamp} from '@/lib/atlasTeam';

const sources={portfolio:'Carteira',client:'Cadastro do cliente',tasks:'Tarefas',task_detail:'Detalhes da tarefa',publications:'Publicações registradas',plans:'Planejamento do mês',conversations:'Grupos vinculados',conversation:'Mensagens do grupo',audio_transcript:'Transcrição do áudio',team:'Equipe',traffic:'Campanhas registradas',results:'Resultados registrados'};
const agents={central:'Atlas central',clientes:'Clientes',operacao:'Operação',estrategia:'Estratégia',trafego:'Tráfego',resultados:'Resultados'};
const phases={context:['Lendo os dados atuais da conversa','Dados da conversa consultados'],knowledge:['Consultando o contexto autorizado','Contexto autorizado consultado'],compose:['Preparando a resposta','Resposta preparada'],validate:['Validando a resposta','Resposta validada'],revalidate:['Reconferindo se os registros mudaram','Atualidade dos registros reconferida'],save:['Registrando o resultado','Resultado registrado'],image:['Consultando a imagem enviada','Imagem consultada'],budget:['Aguardando orçamento de IA','Aguardando orçamento de IA'],error:['A análise foi interrompida','A análise foi interrompida']};
function label(event){
 const state=event.status;
 const text=event.code==='source'?`${sources[event.section]||'Fonte autorizada'} · ${state==='running'?'consultando':state==='unavailable'?'indisponível':state==='partial'?'consulta com cobertura parcial ou não informada':'consulta retornada'}`:event.code==='agent'?`${agents[event.agent]||'Especialista'} · ${state==='running'?'iniciou a análise':state==='partial'?'retornou parecer limitado':state==='failed'?'análise interrompida':'parecer recebido'}`:phases[event.code]?.[state==='completed'?1:0];
 return text||'Etapa operacional registrada';
}
const outcomes={ask:'Pergunta registrada nesta conversa',progress:'Andamento registrado',ready:'Organização da tarefa registrada',delivered:'Entrega informada; conferência pendente',resolved:'Acompanhamento encerrado; tarefa preservada',queued:'Contato agendado',owner_needed:'Solicitação de decisão registrada',owner_answered:'Orientação do dono registrada',consultation_answer:'Relato da equipe registrado'};
function status(request,current){
 if(request?.state==='queued')return request.error_code==='MANAGER_BUDGET_WAIT'?'Aguardando orçamento de IA. Sua mensagem está salva.':'Mensagem na fila do Atlas';
 if(request?.state==='processing'){if(!request.active)return 'Processamento interrompido; aguardando retomada';const last=request.events?.at(-1);return last?(last.status==='running'?'':'Última etapa: ')+label(last):'Análise em andamento · aguardando detalhes da atividade';}
 if(request?.state==='failed')return 'A análise foi interrompida. Sua mensagem está preservada.';
 if(current?.dispatch_pending)return `Contato agendado com ${current.person_name||'a pessoa responsável'}`;
 if(current?.state==='awaiting_reply')return `Aguardando resposta de ${current.person_name||'quem está com o assunto'}`;
 if(current?.state==='delivery_review')return 'Entrega informada, aguardando conferência';
 if(request?.state==='completed')return 'Resposta registrada na conversa';
 return 'Atividade do Atlas';
}

export default function AtlasTeamActivity({threadId,actorId,requestId,pending,taskId,onSettled}){
 const settled=useRef(null),notify=useRef(onSettled);notify.current=onSettled;
 const [snapshot,setSnapshot]=useState(null),[failed,setFailed]=useState(false);
 useEffect(()=>{
  let active=true,timer,inFlight=false;
  const refresh=async()=>{
   if(!active||inFlight||document.hidden)return;
   clearTimeout(timer);inFlight=true;
   try{const value=await teamRpc('atlas_team_activity',{p_thread:threadId});if(active){setSnapshot({threadId,actorId,value});setFailed(false);const latest=value.requests?.[0];const key=actorId+':'+threadId+':'+latest?.id+':'+latest?.state;if(pending&&latest?.id===requestId&&['completed','failed'].includes(latest.state)&&settled.current!==key){settled.current=key;notify.current?.();}}}
   catch{if(active){setSnapshot(null);setFailed(true);}}
   finally{inFlight=false;if(active)timer=setTimeout(refresh,pending?3000:15000);}
  };
  const visible=()=>{if(!document.hidden)refresh();};
  setSnapshot(null);setFailed(false);refresh();document.addEventListener('visibilitychange',visible);
  return()=>{active=false;clearTimeout(timer);document.removeEventListener('visibilitychange',visible);};
 },[threadId,actorId,requestId,pending]);
 const value=snapshot?.threadId===threadId&&snapshot?.actorId===actorId?snapshot.value:null;
 const requests=value?.requests||[],latest=requests[0],running=latest?.state==='processing'&&latest.active===true,waiting=latest?.state==='queued'&&latest.error_code==='MANAGER_BUDGET_WAIT';
 const summary=failed?'Atividade indisponível. A conversa continua disponível.':value?status(latest,value.current):'Conferindo atividade do Atlas…';
 return <section className="atlas-team-activity" aria-label="Atividade do Atlas">
  <details>
   <summary><span className={'atlas-team-activity-indicator'+(running?' is-working':'')} aria-hidden="true">{running?<><i/><i/><i/></>:waiting?'◷':failed?'!':'•'}</span><span role="status">{summary}</span></summary>
   <div className="atlas-team-activity-history" tabIndex={0} aria-label="Histórico de atividade">
    <p>Etapas confirmadas pelo sistema. Consultar um registro ou receber um relato não comprova a entrega.</p>
    {failed&&<p>Não consegui carregar o histórico agora. Vou tentar novamente.</p>}
    {value&&!requests.length&&<p>Nenhuma análise desta conversa possui atividade registrada.</p>}
    {requests.map(request=><article key={request.id}>
     <strong>Mensagem recebida{request.actor_name?' de '+request.actor_name:''} · <time dateTime={request.created_at}>{teamStamp(request.created_at)}</time></strong>
     {!request.events?.length&&<p>Sem trilha detalhada para esta análise.</p>}
     <ol>{request.events?.map((event,index)=><li key={index} data-state={event.status}><time dateTime={event.at}>{teamStamp(event.at)}</time><span>{label(event)}{event.section==='task_detail'&&event.reference&&event.reference===taskId&&<Link to={'/tasks/list/'+taskId}>Abrir tarefa</Link>}</span></li>)}</ol>
     <p>{request.state==='completed'?(outcomes[request.outcome]||status(request,null)):status(request,null)}{request.applied&&request.state==='completed'?' · Atualização confirmada pelo servidor.':''}</p>
     {request.state==='completed'&&request.contact_name&&<p>{request.outcome==='queued'?'Contato agendado com':'Contato interno registrado com'} {request.contact_name}.</p>}
     {request.state==='completed'&&request.task_id&&<Link to={'/tasks/list/'+request.task_id}>Abrir tarefa registrada nesta etapa</Link>}
     {request.consultation&&<div className="atlas-team-activity-consultation"><p>{request.consultation.sent_at?`Pergunta registrada para ${request.consultation.recipient_name||'a pessoa responsável'} · ${teamStamp(request.consultation.sent_at)}`:request.consultation.scheduled?`Contato agendado com ${request.consultation.recipient_name||'a pessoa responsável'}; pergunta ainda não registrada.`:'Consulta aberta sem confirmação de pergunta registrada.'}</p>{request.consultation.answers?.map((answer,index)=><p key={index}>Mensagem recebida de {answer.actor_name||'pessoa autenticada'} · {teamStamp(answer.created_at)}</p>)}{request.consultation.sent_at&&!request.consultation.answers?.length&&<p>Ainda não há resposta registrada nesta consulta.</p>}{request.consultation.returned_at&&<p>Relato trazido à conversa do dono · {teamStamp(request.consultation.returned_at)}</p>}</div>}
     {request.state==='queued'&&request.ready_at&&<small>Nova tentativa não antes de {teamStamp(request.ready_at)}; depende de orçamento e disponibilidade.</small>}
     {request.limited&&<small>Limite de 96 etapas atingido. Esta trilha está incompleta.</small>}
    </article>)}
    {!!value?.messages?.length&&<details className="atlas-team-activity-receipts"><summary>Mensagens recentes desta conversa</summary><p>Registro interno; não indica envio por WhatsApp ou leitura pela pessoa.</p><ol>{value.messages.map(message=><li key={message.id}><time dateTime={message.created_at}>{teamStamp(message.created_at)}</time><span>{message.role==='atlas'?'Atlas registrou uma mensagem':`Mensagem recebida de ${message.actor_name||'pessoa autenticada'}`}</span></li>)}</ol></details>}
    {value?.complete===false&&<p>Mostrando os 10 pedidos mais recentes. O histórico de mensagens permanece na conversa.</p>}
   </div>
  </details>
 </section>;
}

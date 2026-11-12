import {officeClock} from './atlasOfficeClock.js';

const active=p=>p?.status==='active'&&['admin','superadmin','colaborador'].includes(p.role);
const first=p=>p?.full_name?.split(' ')[0]||'responsável interno';
/** Hide only duplicate projections in the manual list; keep original records and explicit manual work. */
export function managedDemandIds(events,demands,ownerId){
 if(events?.config?.owner_id!==ownerId||!events?.manager?.enabled||!events.config.enabled||events.config.mode!=='assist')return new Set();
 return new Set((events.findings||[]).filter(f=>events.config.client_ids?.includes(f.client_id)&&demands.some(d=>d.id===f.demand_id&&d.client_id===f.client_id&&!d.task_id&&d.state!=='archived'&&d.proposal?.source!=='owner_manual')).map(f=>f.demand_id));
}
export function eventAccount(data,clientId){
 const owner=data.config?.owner_id,people=(data.people||[]).filter(p=>active(p)&&p.id!==owner);
 const explicit=data.accounts?.find(a=>a.client_id===clientId);
 if(explicit){const person=people.find(p=>p.id===explicit.person_id);if(person)return person;}
 const value=String(data.clients?.find(c=>c.id===clientId)?.responsavel||'').trim().toLocaleLowerCase('pt-BR');
 const matches=people.filter(p=>p.id===value||p.full_name?.trim().toLocaleLowerCase('pt-BR')===value);
 return matches.length===1?matches[0]:null;
}
/** Presentation of recorded facts; never opens a thread, approves work or schedules an action. */
export function eventProgress(data,finding,now=Date.now()){
 const cfg=data.config||{},managed=cfg.enabled&&cfg.mode==='assist'&&data.manager?.enabled;
 const owner=data.people?.find(p=>p.id===cfg.owner_id),account=eventAccount(data,finding.client_id);
 const thread=finding.followup,person=data.people?.find(p=>p.id===thread?.current_person_id);
 const base={requires_owner:false,managed:Boolean(managed),account_name:account?.full_name||null,recipient:person?.full_name||null,thread_id:thread?.id||null,review_at:thread?.next_review_at||null,task_id:thread?.task_id||null,recorded_call:Boolean(thread?.last_atlas?.length)};
 if(['closed','no_action'].includes(finding.state)||thread?.state==='closed')return{...base,group:'closed',label:'Acompanhamento encerrado',next:'O histórico permanece disponível. Confira a etapa oficial da tarefa para saber se o trabalho foi concluído.'};
 if(thread){
  if(!base.recorded_call)return{...base,group:'atlas',label:'Conversa a conferir',next:'Há um registro de conversa, mas a última mensagem do Atlas não foi confirmada nesta consulta. Abra o assunto para conferir.'};
  const needsOwner=thread.current_person_id===cfg.owner_id||thread.state==='needs_owner';
  if(needsOwner)return{...base,group:'owner',requires_owner:true,label:'Precisa de '+first(owner),next:'O Atlas abriu um assunto para você. Responda na conversa do robô; não é preciso preparar outro repasse.'};
  if(thread.state==='delivery_review')return{...base,group:'team',label:'Entrega com '+first(person),next:'A pessoa responsável precisa conferir a entrega e responder ao Atlas. O relato de entrega não conclui a tarefa.'};
  if(thread.state==='waiting_review')return{...base,group:'team',label:'Revisão combinada',next:'O Atlas acompanha a revisão registrada nesta conversa, respeitando o expediente da equipe.'};
  return{...base,group:'team',label:'Aguardando '+first(person),next:'Há uma conversa interna aberta. A pessoa indicada responde pelo robô, e o Atlas segue com o alinhamento ou acompanhamento.'};
 }
 if(!cfg.enabled)return{...base,group:'atlas',label:'Leitura pausada',next:'Os registros foram preservados. Confira as configurações para retomar a leitura.'};
 if(managed){
  if(!cfg.client_ids?.includes(finding.client_id))return{...base,group:'atlas',label:'Fora da seleção atual',next:'Este registro é anterior à seleção atual. Confira os clientes acompanhados nas configurações.'};
  if(/contexto mudou|fontes atuais|vínculo, a tarefa e o responsável atuais/i.test(finding.question||''))return{...base,group:'atlas',label:'Contexto a reconferir',next:'O Atlas precisa atualizar as fontes antes de abrir uma conversa. Você pode pedir uma nova análise deste cliente agora.'};
  if(finding.intent==='cancellation')return{...base,group:'atlas',label:'Decisão a esclarecer',next:'O Atlas precisa conferir o contexto do cancelamento e se há uma decisão sua antes de seguir. Ainda não há conversa aberta para este pedido.'};
  if(!account)return{...base,group:'atlas',label:'Conta a confirmar',next:'O Atlas ainda precisa confirmar quem cuida desta conta antes de chamar a equipe. Quando abrir a pergunta, responda pelo robô.'};
  return{...base,group:'atlas',label:officeClock(now).businessTime?'Na fila do Atlas':'Aguardando expediente da equipe',next:`O Atlas precisa reconferir o contexto e, se o pedido continuar pendente, alinhar com ${first(account)}. Você pode pedir a análise agora; o chamado automático segue o expediente.`};
 }
 return{...base,group:'owner',requires_owner:true,label:'Sugestão para sua revisão',next:'Este registro está no fluxo de revisão manual. Confira as fontes antes de preparar o repasse.'};
}

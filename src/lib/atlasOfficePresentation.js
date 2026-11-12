/** Office presentation only: ownership/status remain on the original task records. */
import {officeOwnerItems,ownerName} from './atlasOfficeActivity.js';
import {liveOfficeMissions} from './atlasOfficeMissions.js';
export function officePeople(office) {
  const departments=[
    {id:'traffic',name:'Tráfego',mark:'↗',color:'#8b5cf6',brief:'Tarefas de tráfego'},
    {id:'design',name:'Design',mark:'✦',color:'#9333ea',brief:'Função de Design'},
    {id:'editing',name:'Edição',mark:'▶',color:'#7c3aed',brief:'Função de Edição'},
    {id:'production',name:'Produção',mark:'◉',color:'#a84882',brief:'Roteiro e gravação'},
    {id:'operation',name:'Operação',mark:'▦',color:'#76696d',brief:'Planejamento e gestão'},
  ];
  const people=office.profiles.map(p=>{
    const functions=office.functions.filter(f=>(f.assignee_ids||[]).includes(p.id));
    const names=functions.map(f=>f.name).join(' · '),normalized=names.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
    const ownsTraffic=office.tasks.some(t=>!t.done&&t.type==='paid_traffic'&&t.assignee_ids.includes(p.id));
    const department=/design/.test(normalized)?'design':/edicao|editor/.test(normalized)?'editing':/roteiro|gravacao/.test(normalized)?'production':ownsTraffic?'traffic':'operation';
    return {...p,name:p.full_name||'Pessoa da equipe',first_name:(p.full_name||'Equipe').split(' ')[0],department,
      role:names||'Equipe da agência',initials:(p.full_name||'Equipe').split(' ').filter(Boolean).slice(0,2).map(x=>x[0]).join('').toUpperCase()};
  });
  return {people,departments:departments.filter(d=>['traffic','design','editing'].includes(d.id)||people.some(p=>p.department===d.id))};
}
export const OFFICE_AGENT_STATES=[
 {id:'working',label:'Trabalhando',hint:'Filas que o Atlas está analisando agora.'},
 {id:'waiting',label:'Aguardando dono',hint:'Abra as perguntas e sugestões que dependem do dono.'},
 {id:'team',label:'Aguardando equipe',hint:'Há conversa interna do robô esperando esta pessoa.'},
 {id:'approval',label:'Aguardando aprovação',hint:'Há proposta de tarefa esperando sua decisão.'},
 {id:'queued',label:'Na fila',hint:'Análise solicitada e ainda não iniciada.'},
 {id:'idle',label:'Disponíveis',hint:'Agentes sem análise nem decisão pendente neste momento.'},
 {id:'paused',label:'Pausados',hint:'Fora do expediente ou acompanhamento pausado.'},
 {id:'attention',label:'Atenção',hint:'A conferência desta fila precisa ser retomada.'},
];
export function officeAgentStates(data,{now=Date.now(),businessTime=data.business_time}={}){
 const {office,client_states=[],questions=[],proposals=[]}=data,{people,departments}=officePeople(office);
 const fresh=!!data.state?.heartbeat_at&&now-Date.parse(data.state.heartbeat_at)<90000;
 const ownerItems=officeOwnerItems(data);
 const states=people.map(person=>{
  const ids=new Set(office.tasks.filter(t=>!t.done&&t.assignee_ids.includes(person.id)).map(t=>t.client_id));
  proposals.filter(p=>p.state==='pending'&&(p.assignee_ids||[]).includes(person.id)).forEach(p=>ids.add(p.client_id));
  const related=client_states.filter(c=>ids.has(c.client_id)),analyzing=related.filter(c=>c.status==='analyzing');
  const working=fresh&&analyzing.some(c=>!c.retry_after||Date.parse(c.retry_after)>now);
  const waiting=ownerItems.some(i=>i.kind!=='proposal'&&ids.has(i.client_id))||(!data.activity?.complete&&related.some(c=>c.status==='waiting_context'));
  const team=data.activity?.complete&&(data.activity.threads||[]).some(t=>(t.state==='awaiting_reply'||t.state==='delivery_review'&&t.management_kind)&&t.current_person_id===person.id&&t.current_person_id!==data.activity.owner_id);
  const approval=proposals.some(p=>p.state==='pending'&&ids.has(p.client_id));
  const attention=analyzing.length&&!working||related.some(c=>['error','budget_wait'].includes(c.status));
  const queued=related.some(c=>c.status==='queued');
  const status=working?'working':waiting?'waiting':approval?'approval':team?'team':attention?'attention':queued?'queued':!data.config?.enabled||!businessTime?'paused':!fresh?'attention':'idle';
  const resting=!working&&(!data.config?.enabled||!businessTime);
  const active_states=Object.entries({working,waiting,approval,team,attention,queued}).filter(([,value])=>value).map(([key])=>key);
  if(!active_states.length)active_states.push(status);
  return {...person,agent_status:status,active_states,agent_label:officeStateLabel(status,data),resting};
 });
 return {people:states,departments,counts:Object.fromEntries(OFFICE_AGENT_STATES.map(s=>[s.id,states.filter(p=>p.active_states.includes(s.id)).length])),total:states.length,fresh};
}
export const officeStateLabel=(id,data)=>id==='waiting'?'Aguardando '+ownerName(data):OFFICE_AGENT_STATES.find(s=>s.id===id)?.label||'A conferir';
export function liveOfficeSnapshot(data,{now=Date.now(),businessTime=data.business_time}={}) {
  const {office}=data,{people,departments}=officeAgentStates(data,{now,businessTime});
  const seed=id=>[...id].reduce((n,c)=>(n*31+c.charCodeAt(0))>>>0,0);
  const specialists=liveOfficeMissions(data.manager_activity,{now}).workers.filter(w=>w.agent!=='central');
  return {rev:now,serverTime:now,
    rooms:departments.map((d,i)=>({id:d.id,name:d.name,path:'planeje/'+d.id,slot:i,seed:31+i*47,createdAt:now-600000})),
    agents:[...people.map(p=>{
      const tasks=office.tasks.filter(t=>!t.done&&t.assignee_ids.includes(p.id));
      const working=p.agent_status==='working',waiting=!p.resting&&['waiting','approval','team'].includes(p.agent_status);
      const text=p.resting?'Em descanso · pendências preservadas':working?'Atlas está analisando esta fila':p.agent_label;
      return {id:p.id,kind:'main',roomId:p.department,name:'Atlas / '+p.first_name,look:seed(p.id)%2?'f':'m',role:'Agente de acompanhamento',title:p.role,sessionId:'planeje:'+p.id,account:'planeje',status:working?'working':waiting?'waiting':'idle',resting:p.resting,waitingFor:waiting?(p.agent_status==='team'?'Atlas aguarda resposta de '+p.first_name:p.agent_status==='approval'?'Atlas aguarda aprovação de tarefa':'Atlas aguarda '+ownerName(data)+' sobre um cliente'):undefined,
        activity:{id:p.id+':'+(p.resting?'rest':p.agent_status),kind:working?'think':'plan',icon:working?'🔎':p.resting?'💤':'📋',text,at:now},recent:[],tasks:tasks.slice(0,12).map(t=>({id:t.id,title:t.title,status:'pending'})),
        startedAt:now-600000,lastEventAt:now,statusSince:now-(p.resting?660000:60000),stats:{toolCalls:0,tokensIn:0,tokensOut:0,subagents:0},seed:seed(p.id)};
    }),...specialists.map(w=>({id:w.id,kind:'main',roomId:departments.some(d=>d.id===w.room)?w.room:departments[0]?.id,name:w.name+' · IA',look:'m',role:'Especialista de IA',title:w.text,sessionId:w.id,account:'planeje',status:w.phase==='waiting'?'waiting':'working',waitingFor:w.phase==='waiting'?w.text:undefined,resting:false,activity:{id:w.job_id+':'+w.at,kind:'think',icon:'🔎',text:w.text,at:Date.parse(w.at)||now},recent:[],tasks:[],startedAt:Date.parse(w.at)||now,lastEventAt:now,statusSince:Date.parse(w.at)||now,stats:{toolCalls:0,tokensIn:0,tokensOut:0,subagents:0},seed:seed(w.id)}))],
    accounts:[{id:'planeje',short:'IA',name:'Atlas',color:'#9333ea',configDir:'',sessions:0,usageStatus:'disabled'}],
    meta:{demo:false,sources:[],startedAt:now,version:'atlas-office-live-1',terminal:false,messages:false,updates:{state:'off',available:false}},
  };
}

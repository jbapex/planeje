import {ATLAS_AGENT_DETAILS,atlasAgentRunStatus} from '../components/atlas/atlasPresentation.js';

const rooms={central:'operation',clientes:'operation',operacao:'operation',estrategia:'design',trafego:'traffic',resultados:'operation',financeiro:'operation'};
const sources={portfolio:'carteira',overview:'operação',client:'cadastro',tasks:'tarefas',publications:'publicações',documents:'documentos',meetings:'reuniões',plans:'planejamento',conversations:'grupos',conversation:'conversa',audio_transcript:'transcrição',traffic:'tráfego',results:'resultados',lead_conversation:'conversa do lead',finance:'financeiro',team:'equipe',memories:'memória'};

/** Only identifiers and fixed labels cross the map bridge, never private prompts or tool records. */
export function officeMissionActivity(jobs=[],{heartbeatAt=null}={}){
 const running=jobs.filter(j=>j.status==='running').sort((a,b)=>String(b.created_at||'').localeCompare(String(a.created_at||'')));
 const workers=Object.keys(rooms).flatMap(agent=>{
  const job=running.find(j=>atlasAgentRunStatus(j,agent)==='processing');
  if(!job)return[];
  const step=[...(job.steps||[])].reverse().find(s=>s.agent===agent);
  const child=Object.keys(rooms).find(id=>atlasAgentRunStatus(job,id)==='processing'&&[...(job.steps||[])].reverse().find(s=>s.agent===id&&s.kind==='delegation')?.parent===agent);
  const source=step?.kind==='read'&&step.source?.available!==false?sources[step.source?.section]:null;
  return[{id:'atlas-ia:'+agent,agent,name:agent==='central'?'Atlas':ATLAS_AGENT_DETAILS[agent].title,room:rooms[agent],job_id:job.id,conversation_id:job.conversation_id,client_id:job.client_id||null,at:step?.at||job.started_at||job.created_at,phase:child?'waiting':'working',text:child?'Aguardando '+ATLAS_AGENT_DETAILS[child].title:source?'Conferindo '+source:agent==='central'?'Coordenando a consulta':'Analisando os registros'}];
 });
 return{heartbeat_at:heartbeatAt,running:running.length,queued:jobs.filter(j=>j.status==='queued').length,waiting_team:jobs.filter(j=>j.status==='waiting_team').length,workers};
}

export function liveOfficeMissions(activity,{now=Date.now()}={}){
 const age=now-Date.parse(activity?.heartbeat_at);
 const fresh=Number.isFinite(age)&&age>=-30000&&age<90000;
 return{...activity,fresh,workers:fresh?(activity?.workers||[]):[]};
}

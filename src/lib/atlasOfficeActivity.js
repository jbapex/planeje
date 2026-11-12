/** Read-only office view of existing conversations and decisions. No messages are manufactured here. */
import {eventProgress} from './atlasEventProgress.js';
const THREAD_FIELDS='id,owner_id,client_id,task_id,account_person_id,current_person_id,title,state,management_kind,next_review_at,updated_at,created_at,last_atlas:atlas_team_messages(id,role,content,proposal,created_at),last_human:atlas_team_messages(id,role,actor_id,content,created_at)';
const FINDING_FIELDS='id,client_id,title,summary,question,intent,route,state,thread_id,demand_id,task_id,updated_at';
async function pages(factory){
 const result=[];
 for(let start=0;start<10000;start+=250){const{data,error}=await factory().range(start,start+249);if(error||!Array.isArray(data))throw Error('Não foi possível conferir os chamados. Atualize para tentar novamente.');result.push(...data);if(data.length<250)return result;}
 throw Error('A consulta de chamados está incompleta. Atualize antes de usar os contadores.');
}
export async function loadOfficeActivity(db,{ownerId,eventsEnabled=false}={}){
 if(!ownerId)throw Error('Proprietário do acompanhamento indisponível.');
 const threads=()=>{let q=db.from('atlas_team_threads').select(THREAD_FIELDS).eq('owner_id',ownerId).order('updated_at',{ascending:false}).order('id');
  for(const alias of ['last_atlas','last_human'])q=q.eq(alias+'.role',alias==='last_atlas'?'atlas':'human').order('created_at',{referencedTable:alias,ascending:false}).order('id',{referencedTable:alias,ascending:false}).limit(1,{referencedTable:alias});return q;};
 const[active,closedResult,findings,accounts,clientAccounts]=await Promise.all([
  pages(()=>threads().neq('state','closed')),
  Promise.resolve().then(()=>threads().eq('state','closed').limit(20)),
  eventsEnabled?pages(()=>db.from('atlas_event_findings').select(FINDING_FIELDS).eq('owner_id',ownerId).order('id')):[],
  eventsEnabled?pages(()=>db.from('atlas_manager_accounts').select('client_id,person_id').eq('owner_id',ownerId).order('client_id')):[],
  eventsEnabled?pages(()=>db.from('clientes').select('id,responsavel').eq('etapa','closed').order('id')):[],
 ]);
 if(closedResult.error||!Array.isArray(closedResult.data))throw Error('Histórico de chamados indisponível.');
 const ids=[...new Set(findings.map(f=>f.demand_id).filter(Boolean))],demands=[];
 for(let i=0;i<ids.length;i+=80)demands.push(...await pages(()=>db.from('atlas_demands').select('id,state').in('id',ids.slice(i,i+80)).order('id')));
 return{complete:true,owner_id:ownerId,threads:[...active,...closedResult.data],findings,demands,accounts,client_accounts:clientAccounts,closed_limit:20,queried_at:new Date().toISOString()};
}
export const officeFindingProgress=(data,finding)=>eventProgress({config:data.events_config,manager:data.events_config?.manager_policy,people:data.office?.profiles,clients:data.activity?.client_accounts,accounts:data.activity?.accounts},finding);
export function officeOwnerItems(data){
 const a=data.activity||{},items=[],seen=new Set(),add=item=>{if(!seen.has(item.id)){items.push(item);seen.add(item.id);}};
 for(const q of data.questions||[])if(q.state==='open')add({id:'question:'+q.id,kind:'question',source_id:q.id,client_id:q.client_id,title:'Orientação do cliente',text:q.question,at:q.created_at});
 for(const p of data.proposals||[])if(p.state==='pending')add({id:'proposal:'+p.id,kind:'proposal',source_id:p.id,client_id:p.client_id,task_id:p.task_id,title:p.title,text:p.description,at:p.created_at});
 if(a.complete){
  for(const f of a.findings||[]){const demand=a.demands?.find(d=>d.id===f.demand_id);if(!['owner','review'].includes(f.route)||f.state==='closed'||f.thread_id||['linked','archived'].includes(demand?.state))continue;
   if(officeFindingProgress(data,f).managed)continue;
   add({id:'finding:'+(f.demand_id||f.id),kind:'finding',source_id:f.id,client_id:f.client_id,demand_id:f.demand_id,task_id:f.task_id,title:f.title,text:f.question||f.summary,summary:f.summary,at:f.updated_at});}
  for(const t of a.threads||[])if(t.state!=='closed'&&(t.current_person_id===a.owner_id||t.state==='needs_owner'||t.state==='delivery_review'&&!t.management_kind))add({id:'thread:'+t.id,kind:'thread',source_id:t.id,client_id:t.client_id,task_id:t.task_id,title:t.title,text:t.last_atlas?.[0]?.content||'Conferir o acompanhamento interno.',at:t.updated_at});
 }
 return items.sort((x,y)=>String(y.at||'').localeCompare(String(x.at||''))||x.id.localeCompare(y.id));
}
export const ownerName=data=>data.office?.profiles?.find(p=>p.id===(data.activity?.owner_id||data.events_config?.owner_id||data.config?.owner_id))?.full_name?.split(' ')[0]||'dono';
export function officeThreadGroup(thread,ownerId){
 if(thread.state==='closed')return'closed';
 if(thread.state==='needs_owner'||thread.state==='delivery_review'&&!thread.management_kind||thread.current_person_id===ownerId)return'owner';
 if(thread.state==='waiting_review')return'review';
 return'team';
}
export function officeActivityEntries(data,{filter='all',person=null,department=null}={}){
 const a=data.activity||{},profileIds=new Set(department||[]);
 const scope=person?new Set([person]):profileIds.size?profileIds:null;
 const clientIds=scope?new Set(data.office.tasks.filter(t=>!t.done&&t.assignee_ids.some(id=>scope.has(id))).map(t=>t.client_id)):null;
 const relevant=item=>!scope||item.person_id&&scope.has(item.person_id)||clientIds.has(item.client_id);
 const owner=officeOwnerItems(data).filter(i=>i.kind!=='thread').map(i=>({...i,group:'owner'}));
 const seen=new Set(),managed=[];
 if(a.complete)for(const f of a.findings||[]){const demand=a.demands?.find(d=>d.id===f.demand_id),progress=officeFindingProgress(data,f),id='finding:'+(f.demand_id||f.id);
  if(!progress.managed||f.route==='none'||f.thread_id||progress.group==='closed'||['linked','archived'].includes(demand?.state)||seen.has(id))continue;
  seen.add(id);managed.push({id,kind:'finding',source_id:f.id,client_id:f.client_id,demand_id:f.demand_id,title:f.title,text:f.summary,at:f.updated_at,group:'atlas',progress});
 }
 const conversations=(a.complete?a.threads||[]:[]).map(t=>({id:'thread:'+t.id,kind:'thread',source_id:t.id,client_id:t.client_id,person_id:t.current_person_id,title:t.title,at:t.updated_at,group:officeThreadGroup(t,a.owner_id),thread:t}));
 return [...owner,...managed,...conversations].filter(relevant).filter(i=>filter==='all'?i.group!=='closed':i.group===filter).sort((x,y)=>String(y.at||'').localeCompare(String(x.at||''))||x.id.localeCompare(y.id));
}

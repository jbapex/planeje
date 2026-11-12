/** Read tracked execution and surface owner exceptions. Never writes tasks/comments. */
import { createHash } from 'node:crypto';
import { followupState, hydrateTaskUpdates } from '../src/lib/atlasTaskFollowup.js';
import { officeBusinessTime, officeDay } from '../supabase/functions/_shared/atlasOffice.js';

export function planDemandFollowups({ownerId,demands,tasks,statuses,updates,comments,people,inbox,now=new Date()}) {
  const upserts=[],resolves=[];
  if(!officeBusinessTime(now))return {upserts,resolves,after_hours:true,tracked:0};
  const watched=new Map(demands.filter(d=>d.owner_id===ownerId&&d.state==='linked').sort((a,b)=>String(a.id).localeCompare(String(b.id))).map(d=>[d.task_id,d]));
  const live=new Set();
  for(const [id,demand] of watched) {
    const task=tasks.find(t=>t.id===id),status=statuses.find(s=>s.value===task?.status);
    const taskComments=comments.filter(c=>c.task_id===id);
    const taskUpdates=hydrateTaskUpdates(updates.filter(u=>u.task_id===id),taskComments,people);
    const state=followupState(task,taskUpdates,status,officeDay(now),taskComments,ownerId);
    const key='demand:followup:'+id,previous=inbox.find(i=>i.source_key===key);
    if(state.key==='done'||(!state.ownerAttention&&!state.overdue))continue;
    live.add(key);
    const responsible=(task?.assignee_ids||[]).map(id=>people.find(p=>p.id===id)?.full_name||'Responsável a conferir').join(', ')||'Sem responsável';
    const title=(state.ownerAttention?state.label:'Prazo vencido')+' · '+(task?.title||demand.title);
    const details=state.pending.map(u=>(u.author||'Equipe')+': '+u.content).join('\n');
    const body=[state.next+'.',`Responsável: ${responsible}.`,task?.due_date?`Prazo registrado: ${task.due_date.split('-').reverse().join('/')}.`:null,state.overdue?'O prazo registrado venceu; isso não comprova falta de execução.':null,details].filter(Boolean).join('\n').slice(0,6000);
    const fingerprint=createHash('sha256').update(JSON.stringify({title,body,status:task?.status,pending:state.pending.map(u=>u.id),latest:state.latest.map(u=>u.id),comment:state.lastComment?.id})).digest('hex');
    if(previous?.evidence?.fingerprint===fingerprint)continue; // Reading/archiving is respected until source changes.
    upserts.push({owner_id:ownerId,source_key:key,client_id:demand.client_id,kind:'sistema',title,body,severity:state.overdue?'critical':'attention',state:'open',read_at:null,evidence:{atlas_demand_id:demand.id,task_id:id,followup_kind:state.key,fingerprint,checked_at:now.toISOString()}});
  }
  for(const item of inbox)if(item.owner_id===ownerId&&item.source_key?.startsWith('demand:followup:')&&item.state==='open'&&!live.has(item.source_key))resolves.push(item.id);
  return {upserts,resolves,after_hours:false,tracked:watched.size};
}
async function rows(query) {
  const result=[];
  for(let offset=0;offset<30000;offset+=500){const {data,error}=await query.range(offset,offset+499);if(error)throw new Error('Follow-up source unavailable.');result.push(...data);if(data.length<500)return result;}
  throw new Error('Follow-up source incomplete.');
}
async function forTasks(admin,table,fields,ids) {
  const result=[];
  for(let offset=0;offset<ids.length;offset+=100)result.push(...await rows(admin.from(table).select(fields).in(table==='tarefas'?'id':'task_id',ids.slice(offset,offset+100)).order('id')));
  return result;
}
export async function scanDemandFollowups({admin,ownerId,now=new Date()}) {
  if(!officeBusinessTime(now))return {after_hours:true,tracked:0,opened:0,resolved:0};
  const demands=await rows(admin.from('atlas_demands').select('id,owner_id,client_id,task_id,title,state').eq('owner_id',ownerId).eq('state','linked').order('id'));
  const ids=[...new Set(demands.map(d=>d.task_id))];
  const [tasks,updates,comments,statuses,people,inbox]=await Promise.all([
    forTasks(admin,'tarefas','id,title,status,due_date,assignee_ids',ids),forTasks(admin,'atlas_task_updates','*',ids),forTasks(admin,'task_comments','id,task_id,user_id,content,created_at',ids),
    rows(admin.from('task_statuses').select('id,value,label,is_terminal').order('id')),rows(admin.from('profiles').select('id,full_name').order('id')),
    rows(admin.from('atlas_inbox').select('id,owner_id,source_key,state,evidence').eq('owner_id',ownerId).like('source_key','demand:followup:%').order('id')),
  ]);
  const plan=planDemandFollowups({ownerId,demands,tasks,statuses,updates,comments,people,inbox,now});
  for(const item of plan.upserts){const {error}=await admin.from('atlas_inbox').upsert(item,{onConflict:'owner_id,source_key'});if(error)throw new Error('Follow-up notice unavailable.');}
  for(const id of plan.resolves){const {error}=await admin.from('atlas_inbox').update({state:'resolved'}).eq('owner_id',ownerId).eq('id',id).eq('state','open');if(error)throw new Error('Follow-up resolution unavailable.');}
  return {after_hours:false,tracked:plan.tracked,opened:plan.upserts.length,resolved:plan.resolves.length};
}

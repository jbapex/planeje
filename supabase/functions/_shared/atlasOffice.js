/** Authenticated, complete office inventory. No privileged operational reads or writes. */
import { AtlasError } from './atlasCore.js';

export const OFFICE_FIELDS = Object.freeze({
  profiles: 'id,full_name,avatar_url,role,status',
  tarefas: 'id,created_at,title,description,status,due_date,post_date,client_id,project_id,type,priority,assignee_ids,operational_function_id,production_delivered_at,stage_due_at,workflow_stage_key',
  clientes: 'id,empresa,etapa,tipo_servico,tipo_contrato,objetivo_meta,sobre_empresa,produtos_servicos,publico_alvo,meta_resumo,limite_meta',
  task_operational_functions: 'id,name,assignee_ids,is_active',
  task_statuses: 'id,value,label,color,is_initial,is_terminal,sort_order',
  projetos: 'id,name,client_id,status,mes_referencia,created_at',
  paid_campaigns: 'id,name,client_id,status',
  atendimento_conversas: 'id,cliente_id,display_name,status,assigned_to,is_group,archived_at,bloqueada,last_message_at,last_message_preview,awaiting_response_since',
  atlas_memories: 'id,client_id,content,state,source,version,created_at,learning_kind,evidence,source_quote',
});
const terminal = new Set(['completed','published','done','concluido','concluído','concluida','concluída']);
const PRIVATE_FIELDS={
  atlas_office_questions:'id,client_id,source_key,question,state,answer,memory_id,created_at,answered_at',
  atlas_office_proposals:'id,client_id,source_key,source_hash,title,description,task_type,assignee_ids,due_date,state,created_task_id,created_at,decided_at',
};
const clean = (value, max = 1600) => String(value ?? '').replace(/<[^>]*>/g, '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').slice(0,max);
export function officeDay(now = new Date()) { return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(now); }
export function officeBusinessTime(now = new Date()) {
  const p=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/Sao_Paulo',weekday:'short',hour:'2-digit',hourCycle:'h23'}).formatToParts(now).map(x=>[x.type,x.value]));
  return !['Sat','Sun'].includes(p.weekday)&&Number(p.hour)>=8&&Number(p.hour)<17;
}
export function officeTask(task, statuses, now = new Date()) {
  const meta=statuses.find(s=>s.value===task.status);
  const done=meta?.is_terminal===true||terminal.has(String(task.status).toLowerCase());
  const today=officeDay(now), due=String(task.due_date||'').slice(0,10), post=String(task.post_date||'').slice(0,10);
  const deadlines=[];
  if(!done&&!task.production_delivered_at&&due&&due<today)deadlines.push('Produção com prazo vencido');
  if(!done&&task.production_delivered_at&&task.stage_due_at&&new Date(task.stage_due_at).getTime()<now.getTime())deadlines.push('Etapa com prazo vencido');
  if(!done&&post&&post<today)deadlines.push('Data de postagem vencida');
  return {...task,title:clean(task.title,300),description:clean(task.description,2000),status_label:clean(meta?.label||task.status,100),done,deadline_flags:deadlines,assignee_ids:Array.isArray(task.assignee_ids)?task.assignee_ids:[]};
}
export async function officeRows(caller, table, { ownerId, signal } = {}) {
  const fields=OFFICE_FIELDS[table]||PRIVATE_FIELDS[table]; if(!fields)throw new AtlasError('OFFICE_SOURCE_DENIED','Fonte do escritório não permitida.',403);
  const rows=[],seen=new Set(); let after=null;
  for(let page=0;page<60;page++) {
    let q=caller.from(table).select(fields).order('id',{ascending:true}).limit(500);
    if(after)q=q.gt('id',after);
    if(table==='atlas_memories')q=q.eq('owner_id',ownerId).eq('state','active');
    if(PRIVATE_FIELDS[table])q=q.eq('owner_id',ownerId);
    if(signal)q=q.abortSignal(signal);
    const {data,error}=await q;
    if(error||!Array.isArray(data))throw new AtlasError('OFFICE_SOURCE_UNAVAILABLE',`Não foi possível conferir ${table}; a fonte não foi considerada vazia.`,502);
    for(const row of data){if(seen.has(row.id))throw new AtlasError('OFFICE_INCOMPLETE','Inventário mudou durante a leitura. Atualize o escritório.',409);seen.add(row.id);rows.push(row);}
    if(data.length<500)return rows;
    after=data.at(-1).id;
  }
  throw new AtlasError('OFFICE_INCOMPLETE','Inventário acima do limite de leitura. Nenhuma lista parcial foi considerada completa.',413);
}
export async function readAtlasOffice(caller, { ownerId, now = new Date(), signal } = {}) {
  const tables=Object.keys(OFFICE_FIELDS);
  const values=await Promise.all(tables.map(table=>officeRows(caller,table,{ownerId,signal})));
  const raw=Object.fromEntries(tables.map((t,i)=>[t,values[i]]));
  const profiles=raw.profiles.filter(p=>p.status==='active'&&['superadmin','admin','colaborador'].includes(p.role)).map(p=>({...p,full_name:clean(p.full_name,160)}));
  const tasks=raw.tarefas.map(t=>officeTask(t,raw.task_statuses,now));
  const clients=raw.clientes.filter(c=>c.etapa==='closed').map(c=>({...c,empresa:clean(c.empresa,220)}));
  return {queried_at:now.toISOString(),complete:true,profiles,tasks,clients,
    client_names:raw.clientes.map(c=>({id:c.id,empresa:clean(c.empresa,220),etapa:c.etapa})),
    functions:raw.task_operational_functions.filter(f=>f.is_active).map(f=>({...f,name:clean(f.name,120)})),
    statuses:raw.task_statuses,projects:raw.projetos,campaigns:raw.paid_campaigns,
    conversations:raw.atendimento_conversas.filter(c=>!c.archived_at&&!c.bloqueada),memories:raw.atlas_memories,
    totals:{people:profiles.length,tasks:tasks.length,active_tasks:tasks.filter(t=>!t.done).length,closed_clients:clients.length},
  };
}
export function clientOfficeContext(office, clientId) {
  const client=office.clients.find(c=>c.id===clientId); if(!client)return null;
  const memories=office.memories.filter(m=>m.client_id===clientId).map(m=>({id:m.id,content:clean(m.content,3200),source:m.source,learning_kind:m.learning_kind,evidence:m.evidence,source_quote:m.source_quote,version:m.version,created_at:m.created_at})).sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)));
  const tasks=office.tasks.filter(t=>t.client_id===clientId&&!t.done);
  const conversations=office.conversations.filter(c=>c.cliente_id===clientId);
  const snapshot=client.meta_resumo||{};
  const traffic=Object.fromEntries(['period','spend','activeCount','messages','leads','purchases','purchaseValue','permError','rateLimited','errorMessage'].filter(k=>snapshot[k]!==undefined).map(k=>[k,snapshot[k]]));
  return {client:{id:client.id,name:client.empresa,objective:clean(client.objetivo_meta,1600),service:clean(client.tipo_servico,500),about:clean(client.sobre_empresa,1600),budget:client.limite_meta},
    memories,tasks:tasks.map(({id,title,status,status_label,due_date,post_date,deadline_flags,assignee_ids,operational_function_id})=>({id,title,status,status_label,due_date,post_date,deadline_flags,assignee_ids,operational_function_id})),
    people:office.profiles.map(({id,full_name})=>({id,name:full_name})),functions:office.functions,
    projects:office.projects.filter(p=>p.client_id===clientId),campaigns:office.campaigns.filter(p=>p.client_id===clientId),
    conversations:conversations.map(({id,display_name,status,last_message_at,last_message_preview,awaiting_response_since})=>({id,name:display_name,status,last_message_at,preview:clean(last_message_preview,500),awaiting_response_since})),
    traffic,traffic_source_updated_at:snapshot.syncedAt||null,
    direction_known:Boolean(clean(client.objetivo_meta).trim()||memories.some(m=>m.content.startsWith('[Direção do cliente — confirmada por Josias]'))),
  };
}
export function fingerprintContext(context) {
  if(!context)return '';
  // Refresh timestamps alone are not a change worth paying a model to inspect.
  const {traffic_source_updated_at,...meaningful}=context;
  return JSON.stringify(meaningful);
}
export function officeClientQuestion(client) {
  return `Para ${clean(client.empresa,220)}, qual é o objetivo atual, o que a agência combinou entregar e qual deve ser a próxima prioridade? Vou guardar sua resposta neste cliente antes de propor o trabalho.`;
}
export function validateOfficeAnalysis(value, context) {
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Resposta da análise inválida.');
  const summary=clean(value.summary,2600).trim(); if(!summary)throw new Error('Resumo da análise ausente.');
  const question=typeof value.question==='string'?clean(value.question,1200).trim():'';
  // Missing direction always requires Josias; the model cannot waive this requirement.
  if(!context.direction_known)return {summary,question:question||officeClientQuestion({empresa:context.client.name}),proposals:[]};
  const validPeople=new Set(context.people.map(p=>p.id));
  const proposals=(Array.isArray(value.task_proposals)?value.task_proposals:[]).slice(0,2).map(p=>{
    const title=clean(p.title,180).trim(),description=clean(p.description,3500).trim();
    if(!title||!description)throw new Error('Proposta sem título ou descrição.');
    const ids=Array.isArray(p.assignee_ids)?[...new Set(p.assignee_ids)]:[];
    if(ids.some(id=>!validPeople.has(id)))throw new Error('Proposta cita pessoa não disponível.');
    const due=p.due_date||null;
    if(due&&(!/^\d{4}-\d{2}-\d{2}$/.test(due)||Number.isNaN(new Date(due+'T12:00:00Z').getTime())||new Date(due+'T12:00:00Z').toISOString().slice(0,10)!==due))throw new Error('Prazo proposto inválido.');
    if(!['video','arte','carrossel','social_media','paid_traffic','onboarding','post'].includes(p.type))throw new Error('Tipo de tarefa proposto inválido.');
    const type=p.type;
    return {client_id:context.client.id,title,description,assignee_ids:ids,due_date:due,type};
  });
  return {summary,question,proposals:question?[]:proposals};
}

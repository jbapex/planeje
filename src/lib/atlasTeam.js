import {supabase,supabaseAnonKey} from '@/lib/customSupabaseClient';
import {uploadChatImages} from './atlasChatImages';
import {getSupabaseFunctionsBaseUrl} from '@/lib/supabaseFunctions';
export const ATLAS_TEAM_PILOT=import.meta.env.VITE_ATLAS_TEAM_PILOT==='true';
export const ATLAS_TEAM_ENABLED=ATLAS_TEAM_PILOT||import.meta.env.VITE_ATLAS_TEAM_ENABLED==='true';
export const TEAM_STATES={awaiting_reply:'Precisa de resposta',waiting_review:'Revisão combinada',needs_owner:'Decisão do dono',delivery_review:'Entrega para revisão',closed:'Revisado'};
export const teamStamp=value=>value?new Date(value).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'A combinar';
export async function teamRpc(name,args={}){
 if(name==='atlas_team_list'){
  const rows=new Map();let cursor=null;
  for(let page=0;page<1000;page++){
   const {data,error}=await supabase.rpc('atlas_team_list_page',{p_before_at:cursor?.at||null,p_before_id:cursor?.id||null,p_limit:50});
   if(error)throw new Error(error.message||'Não foi possível carregar todos os assuntos.');
   if(!Array.isArray(data?.items))throw new Error('A lista de assuntos ficou incompleta. Atualize antes de continuar.');
   data.items.forEach(row=>rows.set(row.id,row));
   if(data.complete===true)return [...rows.values()];
   if(!data.next?.at||!data.next?.id||JSON.stringify(data.next)===JSON.stringify(cursor))break;
   cursor=data.next;
  }
  throw new Error('A lista de assuntos ficou incompleta. Atualize antes de continuar.');
 }
 const {data,error}=await supabase.rpc(name,args);if(error)throw new Error(error.message||'Não foi possível conferir o acompanhamento.');if(name==='atlas_team_context'&&data?.thread?.management_kind){const result=await supabase.rpc('atlas_manager_context',args);if(result.error)throw new Error('Não foi possível conferir o alinhamento da demanda.');return result.data;}return data;
}
export async function teamReply({thread,message,requestId,signal,files=[]}){
 const {data}=await supabase.auth.getSession();if(!data?.session)throw new Error('Entre novamente no Planeje.');
 if(files.length&&!data.session.user?.id)throw new Error('Entre novamente antes de anexar imagens.');
 const images=await uploadChatImages(supabase.storage,{threadId:thread.id,actorId:data.session.user?.id,requestId,files,signal});
 const response=await fetch(getSupabaseFunctionsBaseUrl()+'/atlas-team-chat',{method:'POST',signal,headers:{apikey:supabaseAnonKey,Authorization:'Bearer '+data.session.access_token,'Content-Type':'application/json'},body:JSON.stringify({action:'enqueue',thread_id:thread.id,revision:thread.revision,message,request_id:requestId,...(images.length?{images}:{})})});
 const value=await response.json();if(!response.ok||!value.ok||!['queued','processing','completed'].includes(value.state))throw new Error(value.error||'Resposta em andamento. Atualize a conversa antes de repetir.');return value;
}
export function teamNeedsAnswer(thread,actorId){return thread.current_person_id===actorId&&['awaiting_reply','needs_owner','delivery_review'].includes(thread.state)&&!thread.management_data?.dispatch_pending&&(['needs_owner','delivery_review'].includes(thread.state)||!['client','team','none'].includes(thread.management_data?.dialogue?.waiting_on));}
export function teamNeedsCall(thread,actorId){return teamNeedsAnswer(thread,actorId)&&!!thread.last_atlas_at&&(!thread.read_at||thread.last_atlas_at>thread.read_at);}
export function safeEvidenceUrl(value){try{const u=new URL(value);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password?u.href:null;}catch{return null;}}
async function teamRows(query){const rows=[];for(let offset=0;offset<30000;offset+=500){const {data,error}=await query.range(offset,offset+499);if(error)throw new Error('Não foi possível conferir os vínculos. Atualize antes de continuar.');rows.push(...data);if(data.length<500)return rows;}throw new Error('Consulta incompleta. Reduza a seleção.');}
export async function teamLaunchOptions(){
 if(!await teamRpc('atlas_demand_access'))throw new Error('Apenas o dono pode iniciar um acompanhamento.');
 const [clients,people,statuses]=await Promise.all([
  teamRows(supabase.from('clientes').select('id,empresa').eq('etapa','closed').order('empresa').order('id')),
  teamRows(supabase.from('profiles').select('id,full_name').eq('status','active').in('role',['superadmin','admin','colaborador']).order('full_name').order('id')),
  teamRows(supabase.from('task_statuses').select('value,is_terminal').order('id')),
 ]);return {clients,people,statuses};
}
export async function teamLaunchTasks(clientId){return teamRows(supabase.from('tarefas').select('id,title,status,due_date,assignee_ids').eq('client_id',clientId).order('created_at',{ascending:false}).order('id'));}
export async function teamDictation({threadId,blob,seconds,requestId,signal}){
 const {data}=await supabase.auth.getSession();if(!data?.session)throw new Error('Entre novamente no Planeje.');
 const form=new FormData();form.set('thread_id',threadId);form.set('audio',blob,'gravacao');form.set('seconds',String(seconds));form.set('request_id',requestId);
 const response=await fetch(getSupabaseFunctionsBaseUrl()+'/atlas-team-chat',{method:'POST',signal,headers:{apikey:supabaseAnonKey,Authorization:'Bearer '+data.session.access_token},body:form});
 const value=await response.json();if(!response.ok||!value.ok||value.state!=='completed'||!value.transcript)throw new Error(value.error||'Transcrição ainda não disponível. Tente novamente.');return value.transcript;
}

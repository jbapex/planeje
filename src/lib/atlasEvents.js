import {supabase,supabaseAnonKey} from '@/lib/customSupabaseClient';
import {getSupabaseFunctionsBaseUrl} from '@/lib/supabaseFunctions';
export const ATLAS_EVENTS_PILOT=import.meta.env.VITE_ATLAS_EVENTS_PILOT==='true'||import.meta.env.VITE_ATLAS_EVENTS_ENABLED==='true';
async function rows(table,configure=q=>q,fields='*'){const result=[];for(let start=0;start<10000;start+=250){const{data,error}=await configure(supabase.from(table).select(fields)).range(start,start+249);if(error)throw Error('Não foi possível conferir a fila de acontecimentos.');result.push(...data);if(data.length<250)return result;}throw Error('Fila extensa; a leitura não foi considerada completa.');}
export async function eventOverview(clientId){
 const{data:owner,error}=await supabase.rpc('atlas_demand_access');if(error||owner!==true)return null;
 const scoped=q=>clientId?q.eq('client_id',clientId):q;
 const[configs,groups,jobResult,findings]=await Promise.all([rows('atlas_event_config'),rows('atlas_event_groups',q=>scoped(q).neq('state','out_of_scope').order('checked_at',{ascending:false})),scoped(supabase.from('atlas_event_jobs').select('id,client_id,state,coverage,usage,error,created_at,finished_at,attempt')).order('created_at',{ascending:false}).limit(100),rows('atlas_event_findings',q=>scoped(q).order('updated_at',{ascending:false}))]);
 if(jobResult.error)throw Error('Não foi possível conferir os lotes de mensagens.');const jobs=jobResult.data;
 if(!configs[0])return{config:null,groups,jobs,findings:[],clients:[],manager:null,accounts:[],people:[]};
 const[clientResult,policy,accounts,people]=await Promise.all([
  supabase.from('clientes').select('id,empresa,etiquetas,responsavel').eq('etapa','closed'),
  supabase.from('atlas_manager_policy').select('enabled,create_after_clarification').maybeSingle(),
  rows('atlas_manager_accounts',q=>q.eq('owner_id',configs[0]?.owner_id),'client_id,person_id'),
  rows('profiles',q=>q.eq('status','active').in('role',['admin','superadmin','colaborador']),'id,full_name,role,status')
 ]);
 if(clientResult.error||policy.error)throw Error('Responsáveis e autonomia indisponíveis nesta consulta.');
 const clients=clientResult.data;
 const ids=[...new Set(findings.map(f=>f.thread_id).filter(Boolean))];let threads=[];
 for(let i=0;i<ids.length;i+=80){const{data,error}=await supabase.from('atlas_team_threads').select('id,state,next_review_at,current_person_id,account_person_id,management_kind,task_id,last_atlas:atlas_team_messages(id,role,created_at)').in('id',ids.slice(i,i+80)).eq('last_atlas.role','atlas').order('created_at',{referencedTable:'last_atlas',ascending:false}).limit(1,{referencedTable:'last_atlas'});if(error)throw Error('Acompanhamento interno indisponível.');threads.push(...data);}
 return{config:configs[0],manager:policy.data,accounts,people,groups,jobs,findings:findings.map(f=>({...f,followup:threads.find(t=>t.id===f.thread_id)})),clients};
}
export async function eventContext(id){const{data,error}=await supabase.from('atlas_event_jobs').select('id,input,coverage').eq('id',id).single();if(error)throw Error('Contexto indisponível para esta conta.');return data;}
export async function eventScan(clientId=null){const{data}=await supabase.auth.getSession();const token=data?.session?.access_token;if(!token)throw Error('Entre novamente na conta.');const res=await fetch(getSupabaseFunctionsBaseUrl()+'/atlas-events',{method:'POST',headers:{apikey:supabaseAnonKey,Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({action:'scan',client_id:clientId})});const value=await res.json();if(!res.ok||!value.ok)throw Error(value.error||'A análise não foi concluída.');return value;}
export async function eventSettings(value,confirmed=false){const{data,error}=await supabase.rpc('atlas_event_settings',{p_value:value,p_confirmed:confirmed});if(error)throw Error(error.message);return data;}

export async function eventBudgetOverview(){
 if(!ATLAS_EVENTS_PILOT)return null;
 const[{data,error},manager]=await Promise.all([supabase.from('atlas_event_config').select('*').maybeSingle(),supabase.from('atlas_manager_policy').select('enabled,create_after_clarification').maybeSingle()]);
 if(error||manager.error)throw Error('Consumo e autonomia do Atlas indisponíveis.');return data?{...data,manager_policy:manager.data}:null;
}
export async function eventSettingsOverview(){
 const{data:owner,error}=await supabase.rpc('atlas_demand_access');if(error)throw Error('Não foi possível conferir seu acesso.');if(owner!==true)return null;
 const[config,result]=await Promise.all([eventBudgetOverview(),supabase.from('clientes').select('id,empresa,etiquetas').eq('etapa','closed').order('empresa')]);
 if(result.error)throw Error('Cadastro de clientes indisponível.');return{config,clients:result.data,groups:[],jobs:[],findings:[]};
}

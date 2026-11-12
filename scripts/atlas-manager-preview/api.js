import {owner,account,executor,role} from './auth.js';
export * from '../../src/lib/atlasTeam.js';
export const ATLAS_TEAM_ENABLED=true,ATLAS_TEAM_PILOT=true;
let enabled=false,auto=false;
const at=new Date().toISOString(),threadId='00000000-0000-4000-8000-000000000021';
const thread={id:threadId,owner_id:owner,client_id:'00000000-0000-4000-8000-000000000004',task_id:null,current_person_id:role==='owner'?owner:account,account_person_id:role==='owner'?owner:account,title:'[Aurora fictícia] Alinhar pedidos recebidos',state:'awaiting_reply',management_kind:role==='owner'?'owner_context':'intake',management_data:{needs_account:role==='owner'},revision:1,next_review_at:'2026-10-19T14:00:00-03:00',shared_context:{text:'O cliente pediu um relatório de leads e agendamentos dos últimos sete dias.',label:'Pedido fictício do grupo',at}};
const messages=[{id:'m1',role:'atlas',content:role==='owner'?'Recebi pedidos de Aurora. Quem é o responsável interno desta conta? Vou guardar essa definição e tirar as dúvidas operacionais com essa pessoa.':'Oi, Bia! O cliente pediu um relatório de leads e agendamentos. O que precisa ser feito e quem da equipe pode apurar? Se já existe uma tarefa, me indique para não duplicarmos.',created_at:at}];
const people=[{id:owner,name:'Ana Exemplo'},{id:account,name:'Bia Exemplo'},{id:executor,name:'Samuel Exemplo'}];
export async function teamRpc(name,args={}){
 if(name==='atlas_demand_access')return role==='owner';
 if(name==='atlas_team_list')return thread.state==='closed'?[]:[{...thread,client_name:'Aurora fictícia',person_name:people.find(p=>p.id===thread.current_person_id).name,last_atlas_at:at}];
 if(name==='atlas_team_context')return {thread:{...thread},client_name:'Aurora fictícia',messages:[...messages],people,is_owner:role==='owner',management:true,task:thread.task_id?{due_date:'2026-10-20'}:null};
 if(name==='atlas_team_action'&&args.p_action==='read')return {};
 if(name==='atlas_manager_set_account'){thread.state='closed';thread.revision++;messages.push({id:'m2',role:'atlas',content:'Responsável guardado para este cliente. Vou alinhar os pedidos com essa pessoa no expediente.',created_at:at});return{ok:true};}
 throw Error('Demonstração fictícia sem envio externo.');
}
export async function teamReply({message}){messages.push({id:'human',role:'human',actor_id:account,content:message,created_at:at});thread.task_id='00000000-0000-4000-8000-000000000025';thread.management_kind='followup';thread.title='[Aurora fictícia] Apurar leads e agendamentos';thread.current_person_id=executor;thread.revision++;messages.push({id:'reply',role:'atlas',content:'Tarefa fictícia criada: [Aurora fictícia] Apurar leads e agendamentos. Samuel Exemplo, preciso de você para levantar os dados dos últimos sete dias e anexar o relatório. Consegue confirmar o recebimento e me informar o andamento?',created_at:at});return {ok:true,state:'completed'};}
export const supabaseAnonKey='fictitious';
export const supabaseUrl='http://127.0.0.1:4336';
export const supabase={from(){return{select(){return{async maybeSingle(){return{data:{enabled,create_after_clarification:auto},error:null}}}}}},async rpc(name,args){if(name==='atlas_manager_settings'){enabled=args.p_enabled;auto=args.p_create;return{data:{enabled,create_after_clarification:auto}}}throw Error('Sem API real na prévia.');}};

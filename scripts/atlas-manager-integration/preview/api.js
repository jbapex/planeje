import {owner} from './auth.js';
export * from '../../../src/lib/atlasTeam.js';
export const ATLAS_TEAM_ENABLED=true,ATLAS_TEAM_PILOT=true;
export const supabaseUrl='http://127.0.0.1:4341',supabaseAnonKey='fixture';
export const supabase={rpc(){throw Error('Nenhum transporte real autorizado nesta fixture.');},auth:{getSession:async()=>({data:{session:null}})}};
const client='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',conversation='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',threadId='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const at='2026-10-19T11:00:00Z';
const clients=[{id:client,empresa:'Aurora FICTÍCIO'}];
const memories=[{id:'mem-client',client_id:client,content:'Vídeos verticais legendados.',team_shared:false,created_at:at},{id:'mem-global',client_id:null,content:'Memória privada geral.',created_at:at}];
const job={id:'job',conversation_id:conversation,client_id:client,title:'Conferir publicação',status:'waiting_team',result:'Pergunta agendada para Conta Exemplo em 19/10 08:00.',created_at:at,steps:[{agent:'central',kind:'internal_question',status:'pending',thread_id:threadId,summary:'Pergunta interna registrada.'}]};
const conv={id:conversation,client_id:client,title:'Consulta FICTÍCIA',updated_at:at};
const thread={id:threadId,owner_id:owner,client_id:client,current_person_id:'22222222-2222-4222-8222-222222222222',account_person_id:'22222222-2222-4222-8222-222222222222',title:'[Aurora FICTÍCIO] Confirmar publicação',management_kind:'consultation',management_data:{dispatch_pending:true,scheduled_at:at},state:'scheduled',revision:1,shared_context:{text:'Consegue confirmar se o vídeo foi publicado e mandar o link?'}};
const calls=[];
window.__atlasFixture={calls,complete(){job.status='completed';job.result='Conta Exemplo informou em 19/10 09:00: ainda está em edição. Publicação não verificada automaticamente.';job.finished_at=at;},failShare:false};
const clone=value=>structuredClone(value);
export const createAtlasRequestId=()=>crypto.randomUUID();
export async function bootstrapAtlas(){return clone({enabled:true,clients,memories,jobs:[job],agents:[],conversations:[conv],preferences:{},inbox:[],worker:{heartbeat_at:new Date().toISOString()}});}
export async function loadAtlasHistory(id){return clone({conversation:conv,messages:[{id:'message',role:'user',content:'O vídeo foi publicado?',created_at:at}],runs:[],jobs:id===conversation?[job]:[]});}
export async function loadAtlasProgress(){return {run:null};}
export async function sendAtlasMessage(){throw Error('Envio simulado não configurado.');}
export async function setAtlasMemoryTeamScope(id,shared){calls.push({name:'share',id,shared});if(window.__atlasFixture.failShare)throw Error('Falha de rede fictícia.');const memory=memories.find(m=>m.id===id);memory.team_shared=shared;return {memory:clone(memory)};}
export async function saveAtlasMemory(){throw Error('Fora desta fixture.');}
export async function revokeAtlasMemory(){throw Error('Fora desta fixture.');}
export async function cancelAtlasJob(){job.status='cancelled';return {cancelled:true};}
export async function markAtlasInbox(){return {};}
export async function setAtlasPreferences(){return {};}
export async function connectAtlasVoice(){throw Error('Sem voz/provedor real nesta fixture.');}
export async function teamRpc(name,args={}){
 calls.push({name,...args});
 if(name==='atlas_demand_access')return true;
 if(name==='atlas_team_list')return clone([{...thread,person_name:'Conta Exemplo',client_name:'Aurora FICTÍCIO'}]);
 if(name==='atlas_team_context'){if(args.p_thread!==threadId)throw Error('Conversa incorreta.');return clone({thread,client_name:'Aurora FICTÍCIO',messages:[],people:[],is_owner:true,management:true});}
 if(name==='atlas_team_action'&&args.p_action==='read')return {};
 throw Error('Operação fora desta fixture.');
}
export async function teamReply(){throw Error('Sem envio nesta fixture.');}
export async function teamDictation(){throw Error('Sem provedor nesta fixture.');}

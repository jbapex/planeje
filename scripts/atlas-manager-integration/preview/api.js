import {owner} from './auth.js';
export {invokeAtlasOffice} from '../../atlas-office-live/preview/api-fixture.js';
export * from '../../../src/lib/atlasTeam.js';
export const ATLAS_TEAM_ENABLED=true,ATLAS_TEAM_PILOT=true;
export const supabaseUrl='http://127.0.0.1:4341',supabaseAnonKey='fixture';
export const supabase={rpc(){throw Error('Nenhum transporte real autorizado nesta fixture.');},auth:{getSession:async()=>({data:{session:null}})}};
const client='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',conversation='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',threadId='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const at='2026-10-19T11:00:00Z';
const clients=[{id:client,empresa:'Aurora FICTÍCIO'},{id:'dddddddd-dddd-4ddd-8ddd-dddddddddddd',empresa:'Estúdio Pérola FICTÍCIO'},{id:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',empresa:'Aurora Moda FICTÍCIO'}];
const memories=[{id:'mem-client',client_id:client,content:'Vídeos verticais legendados.',team_shared:false,created_at:at},{id:'mem-global',client_id:null,content:'Memória privada geral.',created_at:at}];
const job={id:'ffffffff-ffff-4fff-8fff-ffffffffffff',origin_run_id:'initial-run',conversation_id:conversation,client_id:client,task:'PRIVATE_OWNER_PROMPT',title:'Conferir publicação',status:'waiting_team',result:'Pergunta agendada para Conta Exemplo em 19/10 08:00.',created_at:at,steps:[{agent:'central',kind:'internal_question',status:'pending',thread_id:threadId,summary:'Pergunta interna registrada.'}]};
const conv={id:conversation,client_id:client,title:'Consulta FICTÍCIA',updated_at:at};
if(new URLSearchParams(location.search).has('otherjob'))job.status='running';
const thread={id:threadId,owner_id:owner,client_id:client,current_person_id:'22222222-2222-4222-8222-222222222222',account_person_id:'22222222-2222-4222-8222-222222222222',title:'[Aurora FICTÍCIO] Confirmar publicação',management_kind:'consultation',management_data:{dispatch_pending:true,scheduled_at:at},state:'scheduled',revision:1,shared_context:{text:'Consegue confirmar se o vídeo foi publicado e mandar o link?'}};
const calls=[];
const histories=new Map([[conversation,{conversation:conv,messages:[{id:'message',run_id:'initial-run',role:'user',content:'O vídeo foi publicado?',created_at:at}],runs:[]}]]);
const requests=new Map();
window.__atlasFixture={calls,startMission(){const stamp=new Date().toISOString();job.status='running';job.started_at=stamp;job.finished_at=null;job.steps=[{agent:'central',kind:'coordination',status:'running',at:stamp},{agent:'operacao',parent:'central',kind:'delegation',status:'running',at:stamp},{agent:'operacao',parent:'central',kind:'read',status:'completed',at:stamp,source:{section:'tasks',available:true}}];},complete(){job.status='completed';job.result='Conta Exemplo informou em 19/10 09:00: ainda está em edição. Publicação não verificada automaticamente.';job.finished_at=at;},failJob(){job.status='failed';job.error='Sessão fictícia indisponível.';job.result=null;},failShare:false,uncertainNext:false};
const clone=value=>structuredClone(value);
export const createAtlasRequestId=()=>crypto.randomUUID();
export async function respondAtlasInteraction(){throw Error('Esta prévia legada não executa decisões do Squad.');}
export const reconcileAtlasInteraction=respondAtlasInteraction;
export async function bootstrapAtlas(){if(new URLSearchParams(location.search).has('forbidden'))throw Object.assign(Error('Este espaço é pessoal.'),{code:'ATLAS_FORBIDDEN'});return clone({enabled:true,clients,memories,jobs:[job],agents:[],conversations:[...histories.values()].map(h=>h.conversation),preferences:{},inbox:[],worker:{heartbeat_at:new Date().toISOString()}});}
export async function loadAtlasHistory(id){return clone({...histories.get(id),jobs:id===conversation?[job]:[]});}
export async function loadAtlasProgress(){return {run:null};}
export async function sendAtlasMessage(payload){
 calls.push({name:'send',...clone(payload)});
 if(window.__atlasFixture.holdNextSend){window.__atlasFixture.holdNextSend=false;await new Promise(resolve=>{window.__atlasFixture.releaseSend=resolve;});}
 let response=requests.get(payload.request_id);
 if(!response){
  const id=payload.conversation_id||crypto.randomUUID(),runId=crypto.randomUUID(),now=new Date().toISOString();
  const history=histories.get(id)||{conversation:{id,client_id:payload.client_id,title:payload.message.slice(0,60),updated_at:now},messages:[],runs:[]};
  const answer={id:crypto.randomUUID(),role:'assistant',content:'Consulta FICTÍCIA registrada com o contexto selecionado.',created_at:now,run_id:runId};
  history.messages.push({id:crypto.randomUUID(),run_id:runId,role:'user',content:payload.message,created_at:now},answer);histories.set(id,history);
  response={conversation_id:id,run_id:runId,status:'completed',message:answer};requests.set(payload.request_id,response);
 }
 if(window.__atlasFixture.uncertainNext){window.__atlasFixture.uncertainNext=false;throw Error('Falha de rede FICTÍCIA; resposta ainda não confirmada.');}
 return clone(response);
}
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

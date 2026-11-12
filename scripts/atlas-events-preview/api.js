const owner='owner',account='account',client='client';let scans=0;
const now=()=>new Date().toISOString();
const state={config:{owner_id:owner,enabled:true,mode:'assist',client_ids:[client],history_messages:100,quiet_seconds:90,review_seconds:3600,max_tokens_per_day:1000000,used_tokens:0,model_calls:0,last_scan_at:now()},manager:{enabled:true},accounts:[{client_id:client,person_id:account}],people:[{id:owner,full_name:'Gestor Exemplo',role:'superadmin',status:'active'},{id:account,full_name:'Ana Exemplo',role:'colaborador',status:'active'}],clients:[{id:client,empresa:'Aurora fictícia',responsavel:owner,etiquetas:['Ápice Noivas']}],groups:[],jobs:[{id:'job',client_id:client,state:'queued',created_at:now()}],findings:['Conferir qualidade dos contatos','Relatório da campanha'].map((title,i)=>({id:'finding-'+i,client_id:client,route:'owner',state:'observed',intent:'question',title,summary:'O cliente pediu uma conferência dos resultados da campanha.',question:'Qual o próximo passo?',demand_id:'demand-'+i,job_id:'job',sources:['in:fictitious'],versions:[{}],updated_at:now()}))};
if(new URLSearchParams(location.search).get('scenario')==='team')state.findings[0].followup={id:'thread-fictitious',state:'awaiting_reply',current_person_id:account,management_kind:'intake',last_atlas:[{id:'message'}]};
if(new URLSearchParams(location.search).get('scenario')==='owner')state.findings[0].followup={id:'thread-owner',state:'needs_owner',current_person_id:owner,last_atlas:[{id:'message'}]};
if(new URLSearchParams(location.search).get('scenario')==='failure')state.config.last_error='A conferência ficou incompleta; os pedidos existentes e a fila foram preservados.';
export const ATLAS_EVENTS_PILOT=true;
export async function eventOverview(){return structuredClone(state);}
export async function eventScan(){if(new URLSearchParams(location.search).get('scenario')==='failure')throw Error('A análise não foi concluída. Confira a fila.');scans++;state.config.last_scan_at=now();state.findings.forEach(f=>f.updated_at=now());return{ok:true,fixture_scans:scans};}
export async function eventContext(){return{id:'job',coverage:{messages_included:1,new_messages:1,previous_included:0,partial:false},input:{new_ids:['in:fictitious'],messages:[{id:'in:fictitious',sender_name:'Cliente fictício',body:'Precisamos conferir a qualidade dos contatos da campanha.',created_at:now()}]}};}
export async function eventSettings(){throw Error('Configurações não são alteradas nesta prévia.');}
export async function eventSettingsOverview(){return structuredClone(state);}
export const supabase={};
export const supabaseAnonKey='fixture-public-key';
export const supabaseUrl='http://127.0.0.1:4337';
export const ATLAS_DEMAND_PILOT=false,ATLAS_DEMANDS_ENABLED=true;
export const useAuth=()=>({user:{id:owner}});
export async function loadDemands(){return{manager:true,clients:structuredClone(state.clients),people:structuredClone(state.people),tasks:[],statuses:[{value:'todo',label:'A fazer',is_initial:true}],projects:[],comments:[],events:[],updates:[],demands:[...state.findings.map((f,i)=>({id:f.demand_id,client_id:client,owner_id:owner,title:f.title,state:i?'draft':'proposed',updated_at:now(),proposal:{source:'atlas_event'}})),{id:'manual',client_id:client,owner_id:owner,title:'Nova arte manual',state:'proposed',updated_at:now(),proposal:{source:'owner_manual'}}]};}
export async function demandRpc(){throw Error('Sem escrita nesta prévia.');}
export async function analyzeDemand(){throw Error('Sem IA nesta prévia.');}
export async function executeAutomation(){throw Error('Sem automação nesta prévia.');}
export const getAutomationErrorMessages=()=>[];

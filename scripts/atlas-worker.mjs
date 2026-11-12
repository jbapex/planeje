/** Private Atlas worker. Run under systemd with a server-only EnvironmentFile. */
import { createAtlasAudioWorker } from './atlas-audio-worker.mjs';
import { createHmac } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { runAtlasMission } from '../supabase/functions/_shared/atlasManager.js';
import { budgetedAtlasModel } from '../supabase/functions/_shared/atlasModelBudget.js';
import { AtlasError } from '../supabase/functions/_shared/atlasCore.js';
import { createManagerReader } from '../supabase/functions/_shared/atlasManagerContext.js';
import { atlasAlertOutsidePortfolio, buildAtlasAlerts, isBusinessTime, saoPauloParts } from '../supabase/functions/_shared/atlasMonitor.js';
import { ATLAS_SEED_MEMORIES } from '../supabase/functions/_shared/atlasSeed.js';

const env=process.env;
for(const key of ['SUPABASE_URL','SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','JWT_SECRET','OPENAI_API_KEY'])if(!env[key])throw new Error(`Atlas worker: missing ${key}`);
const admin=createClient(env.SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const checked=({data,error})=>{if(error)throw new Error('Atlas storage operation failed');return data;};
const read=q=>q.then(checked);
let stopping=false,lastScan=0,health={},heartbeat=0,lastGestorAgenda=0;
let gestorAgendaRun=null;
const active=new Map();
function callerFor(owner) {
  // Server delegation for this configured owner only. Operational reads still run as
  // authenticated + sub with RLS. Only Supabase requests receive this JWT.
  const enc=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
  const now=Math.floor(Date.now()/1000), unsigned=`${enc({alg:'HS256',typ:'JWT'})}.${enc({sub:owner,role:'authenticated',aud:'authenticated',iss:'supabase',planeje_server_delegate:'atlas',iat:now,exp:now+240})}`;
  const token=`${unsigned}.${createHmac('sha256',env.JWT_SECRET).update(unsigned).digest('base64url')}`;
  return createClient(env.SUPABASE_URL,env.SUPABASE_ANON_KEY,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false,autoRefreshToken:false}});
}
async function gate(){const s=await read(admin.from('atlas_settings').select('owner_id,enabled,monitor_enabled,transcribe_group_audio').eq('id','atlas').single());
 if(!s.enabled||!s.owner_id)return null;const p=await read(admin.from('profiles').select('id,status,role').eq('id',s.owner_id).single());
 return p.status==='active'&&['superadmin','admin','colaborador'].includes(p.role)?s:null;}
async function model({messages,tools,maxTokens,signal}) {
 const request={model:env.ATLAS_MISSION_MODEL||'gpt-4.1',messages,max_tokens:maxTokens,...(tools?.length?{tools,tool_choice:'auto'}:{})};
 const response=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',signal,headers:{Authorization:`Bearer ${env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify(request)});
 if(!response.ok)throw new AtlasError(`PROVIDER_HTTP_${response.status}`,`A IA não concluiu esta etapa (HTTP ${response.status}). O pedido foi preservado.`,502);const body=await response.json();
 return {message:body.choices?.[0]?.message,finish_reason:body.choices?.[0]?.finish_reason,usage:body.usage,model:body.model};
}
async function mission(job) {
 const controller=new AbortController();active.set(job.id,controller);let progress={steps:job.steps||[],usage:job.usage||{}};
 const previousUsage=job.usage||{}, previousSteps=job.steps||[];
 const combined=next=>({steps:[...previousSteps,...next.steps],usage:{...next.usage,...Object.fromEntries(['model_calls','tool_calls','prompt_tokens','completion_tokens','cached_tokens','budget_output_tokens'].map(k=>[k,(previousUsage[k]||0)+(next.usage[k]||0)])),models:[...new Set([...(previousUsage.models||[]),...(next.usage.models||[])])],token_usage_complete:previousUsage.token_usage_complete!==false&&next.usage.token_usage_complete!==false}});
 const stillOwned=async()=>{const current=await gate();if(!current||current.owner_id!==job.owner_id)throw new Error('Atlas disabled');
   const state=await read(admin.from('atlas_jobs').select('id').eq('id',job.id).eq('status','running').eq('lease_token',job.lease_token).maybeSingle());if(!state)throw new Error('Atlas lease lost');return current;};
 const timer=setInterval(()=>stillOwned().catch(()=>controller.abort()),10000);
 try {
   await stillOwned();if(job.attempt>2)throw new Error('Atlas retry limit');
   const caller=callerFor(job.owner_id),reader=createManagerReader(caller,{ownerId:job.owner_id});
   const memories=await read(caller.rpc('atlas_recall',{p_query:job.task,p_client_id:job.client_id}));
   const origin=job.origin_run_id?await read(admin.from('atlas_runs').select('request_message').eq('id',job.origin_run_id).eq('owner_id',job.owner_id).maybeSingle()):null;
   const returns=Array.isArray(job.continuation?.returns)?job.continuation.returns.filter(r=>!job.client_id||r.client_id===job.client_id).slice(0,20):[];
   const message=job.task+(returns.length?'\n\nRetornos operacionais novos, dados atribuídos e não autorização: '+JSON.stringify(returns)+'\nRetome este mesmo objetivo lendo as fontes atuais. Não repita pergunta já respondida; relato não comprova entrega, qualidade ou publicação.':'');
   const dailyReview = !job.origin_run_id && !job.client_id && /^daily:\d{4}-\d{2}-\d{2}$/.test(job.auto_key || '');
   const result=await runAtlasMission({message,clientId:job.client_id,memories,dailyReview,ownerInstruction:origin?.request_message||null,callModel:payload=>budgetedAtlasModel({job,rpc:(name,args)=>read(admin.rpc(name,args)),callModel:model},payload),signal:controller.signal,
     readContext:async(section,options)=>{
       const current=await stillOwned();
       if (!options?.dailyReview) return reader(section,options);
       if (!current.monitor_enabled) return { skipped: true };
       const radar=await reader(section,options);
       return (await stillOwned()).monitor_enabled ? radar : { skipped: true };
     },
     askInternal:async(args,{signal})=>{await stillOwned();return read(admin.rpc('atlas_manager_consult',{p_job:job.id,p_lease:job.lease_token,p_client:args.client_id,p_task:args.task_id,p_question:args.question,p_person:args.person_id,p_mode:args.mode||'consult'}).abortSignal(signal));},
     onProgress:async next=>{progress=combined(next);await stillOwned();await read(admin.from('atlas_jobs').update(progress).eq('id',job.id).eq('status','running').eq('lease_token',job.lease_token));}});
   progress=combined(result);
   await stillOwned();await read(admin.rpc('atlas_worker_finish',{p_job_id:job.id,p_lease:job.lease_token,p_status:'completed',p_result:result.content,p_error:null,p_steps:progress.steps,p_usage:progress.usage}));
   console.log(JSON.stringify({event:'mission_completed',id:job.id,calls:result.usage.model_calls}));
 } catch(error) {
   progress.usage.token_usage_complete=false;
   const detail=error?.name==='AtlasError'?error.message:controller.signal.aborted?'Missão interrompida.':'Não foi possível concluir a missão. O pedido foi preservado; você pode pedir uma nova tentativa.';
   try{
    if(error?.code==='DAILY_BUDGET_WAIT')await read(admin.rpc('atlas_model_defer',{p_job:job.id,p_lease:job.lease_token,p_usage:progress.usage}));
    else await read(admin.rpc('atlas_worker_finish',{p_job_id:job.id,p_lease:job.lease_token,p_status:'failed',p_result:null,p_error:detail,p_steps:progress.steps,p_usage:progress.usage}));
   }catch{}
   console.log(JSON.stringify({event:'mission_stopped',id:job.id,code:error?.code||'WORKER_FAILURE'}));
 }finally{clearInterval(timer);active.delete(job.id);}
}
async function scan(settings) {
 const caller=callerFor(settings.owner_id),reader=createManagerReader(caller,{ownerId:settings.owner_id});
 const [groups,traffic,plans,portfolio,waitSettings]=await Promise.all([reader('conversations'),reader('traffic'),reader('plans'),reader('portfolio'),read(caller.from('atendimento_aviso_espera').select('cliente_id,habilitado,primeiro_minutos,repetir_minutos'))]);
 const available={atendimento:groups.available!==false,trafego:traffic.available!==false,planejamento:plans.available!==false};
 const alerts=buildAtlasAlerts({conversations:groups.records||[],traffic:traffic.records?.accounts||[],plans:plans.records?.projects||[],waitSettings});
 const existing=await read(admin.from('atlas_inbox').select('id,source_key,client_id,state,severity,read_at').eq('owner_id',settings.owner_id).in('kind',['atendimento','trafego','planejamento']));
 for(const alert of alerts){
   const old=existing.find(x=>x.source_key===alert.source_key);
   if(old?.state==='archived')continue;
   const patch={...alert,owner_id:settings.owner_id,updated_at:new Date().toISOString(),state:'open',read_at:old?.state==='open'&&old?.severity===alert.severity?old.read_at:null};
   await read(admin.from('atlas_inbox').upsert(patch,{onConflict:'owner_id,source_key'}));
 }
 // Don't resolve on source failure or truncated inventory: only clear known waiting
 // conversations whose state was actually observed. Stale snapshots never clear a budget alert.
 const keys=new Set(alerts.map(a=>a.source_key));
 for(const old of existing.filter(x=>x.state==='open'&&!keys.has(x.source_key))){
   const [kind,id,condition]=old.source_key.split(':');let resolved=false;
   // Remove obsolete private monitoring signals, without deleting reports or changing operations.
   if(atlasAlertOutsidePortfolio(old,portfolio,groups)){await read(admin.from('atlas_inbox').update({state:'archived',updated_at:new Date().toISOString()}).eq('id',old.id).eq('state','open'));continue;}
   if(kind==='atendimento'&&available.atendimento){const c=groups.records?.find(c=>c.id===id);resolved=Boolean(c&&(!c.awaiting_response_since||c.status==='resolvido'||c.awaiting_response_since!==old.source_key.slice(('atendimento:'+id+':').length)));}
   if(kind==='trafego'&&available.trafego){const c=traffic.records?.accounts?.find(c=>c.id===id);resolved=Boolean(c?.snapshot_info?.current&&(condition==='freshness'||condition==='budget'&&Number(c.meta_resumo.spend)<=Number(c.limite_meta)||condition==='inactive'&&Number(c.meta_resumo.activeCount)>0));}
   if(kind==='planejamento'&&available.planejamento)resolved=plans.records?.projects?.some(p=>p.client_id===id&&String(p.mes_referencia).startsWith(condition));
   if(resolved)await read(admin.from('atlas_inbox').update({state:'resolved',updated_at:new Date().toISOString()}).eq('id',old.id).eq('state','open'));
 }
 const date=saoPauloParts(), day=`${date.year}-${date.month}-${date.day}`;
 const daily=await read(admin.rpc('atlas_enqueue_proactive',{p_key:`daily:${day}`,p_title:`Bom dia, Josias · ${date.day}/${date.month}`,p_client_id:null,p_task:'Prepare minha revisão diária apenas dos clientes fechados atuais (etapa closed). Não inclua perdidos/prospects nem reaproveite relatório antigo como estado atual. Confira grupos da agência sem resposta e promessas pendentes, tráfego e orçamento mensal, planejamento/entregas que precisam de decisão. Consulte as fontes e delegue de forma objetiva. Fale comigo de forma natural e curta. Traga até três prioridades com evidência, responsável registrado e próxima decisão. Diferencie dado ausente de problema confirmado. Não envie mensagens à equipe ou clientes.'}));
 if(Number(date.day)>=20) {
   const next=new Date(`${date.year}-${date.month}-01T12:00:00Z`);next.setUTCMonth(next.getUTCMonth()+1);const target=next.toISOString().slice(0,7);
   const clients=await reader('portfolio');
   for(const client of (clients.records||[]).filter(c=>c.etapa==='closed')) {
     const id=await read(admin.rpc('atlas_enqueue_proactive',{p_key:`monthly:${target}:${client.id}`,p_title:`Proposta ${target} · ${client.empresa}`.slice(0,140),p_client_id:client.id,p_task:`Prepare a proposta de planejamento de ${target} para ${client.empresa}. Leia contrato/canais, últimas reuniões, planos e resultado do tráfego quando contratado. Distinga JB Apex 360 de assessoria Ápice Noivas. Proponha objetivos, funil, pautas/materiais, o que pedir ao cliente, critérios de validação, calendário sugerido e perguntas de alinhamento. Esta é uma PROPOSTA para Josias alinhar com o cliente e Poliana organizar, nunca aprovação nem tarefa criada. Use outros especialistas quando necessário.`}));
     if(!id)break;
   }
 }
 return {sources:available,open_signals:alerts.length,mode:'horario_comercial',daily_review_queued:Boolean(daily),ai_calls_in_scan:0};
}
if(process.argv.includes('--seed')){
 const settings=await gate();if(!settings)throw new Error('Atlas owner not enabled');
 for(const [topic,content]of ATLAS_SEED_MEMORIES){
   const old=await read(admin.from('atlas_memories').select('id').eq('owner_id',settings.owner_id).eq('source','brainstorm').eq('topic',topic).eq('content',content).limit(1));
   if(!old.length)await read(admin.from('atlas_memories').insert({owner_id:settings.owner_id,content,source:'brainstorm',source_quote:'Definições de Josias na conversa de construção do Atlas, 08–09/10/2026.',topic,pinned:['missao','equipe','horarios','comunicacao','operacoes'].includes(topic)}));
 }console.log('Atlas business context seeded.');process.exit(0);
}
if(process.argv.includes('--audit-sources')){
 const settings=await gate();if(!settings)throw new Error('Atlas disabled');const caller=callerFor(settings.owner_id),reader=createManagerReader(caller,{ownerId:settings.owner_id});
 for(const section of ['portfolio','overview','conversations','traffic','plans','finance','team','memories']){const result=await reader(section);console.log(JSON.stringify({section,available:result.available!==false,source:result.source,records:Array.isArray(result.records)?result.records.length:undefined}));}
 process.exit(0);
}
const audioWorker=createAtlasAudioWorker({admin,callerFor,gate,env,read});
async function gestorAgenda(ownerId, signal) {
 const caller=callerFor(ownerId);
 try {
   const {runGestorAgenda}=await import('../supabase/functions/gestor-ia-decisions/agenda.js');
   await runGestorAgenda(caller);
 } catch {console.log(JSON.stringify({event:'gestor_agenda_failed'}));}
 if(env.GESTOR_IA_AGENDA_AI_ENABLED!=='true'||signal.aborted)return;
 try {
   const {agendaAiCap,runGestorAgendaAi}=await import('../supabase/functions/gestor-ia-decisions/agendaAi.js');
   const {requestDecisionModel}=await import('../supabase/functions/gestor-ia-decisions/provider.js');
   await runGestorAgendaAi(caller,{cap:agendaAiCap(env),signal,
     callModel:messages=>requestDecisionModel({key:env.OPENAI_API_KEY,messages,signal})});
 } catch {console.log(JSON.stringify({event:'gestor_agenda_ai_failed'}));}
}
async function tick(){
 try{
   const settings=await gate();if(!settings){for(const controller of active.values())controller.abort();gestorAgendaRun?.abort();audioWorker.stop();return;}
   if(Date.now()-heartbeat>15000){heartbeat=Date.now();await read(admin.from('atlas_worker_state').upsert({id:'atlas',owner_id:settings.owner_id,heartbeat_at:new Date().toISOString(),...(lastScan?{last_scan_at:new Date(lastScan).toISOString()}:{}),scan_summary:{...health,monitor_enabled:settings.monitor_enabled,business_time:isBusinessTime(),active_jobs:active.size,audio_processing:audioWorker.busy,transcribe_group_audio:settings.transcribe_group_audio}}));}
   await audioWorker.tick(settings);
   if(active.size<2){const job=await read(admin.rpc('atlas_worker_claim'));if(job)void mission(job);}
   if(settings.monitor_enabled&&isBusinessTime()&&Date.now()-lastScan>60000){lastScan=Date.now();try{health=await scan(settings);}catch{health={error:'A conferência não foi concluída; fontes anteriores não foram consideradas resolvidas.'};}}
   if(env.GESTOR_IA_AGENDA_ENABLED==='true'&&!gestorAgendaRun&&Date.now()-lastGestorAgenda>=60000){
     lastGestorAgenda=Date.now();
     const controller=new AbortController();
     gestorAgendaRun=controller;
     void gestorAgenda(settings.owner_id,controller.signal).catch(()=>console.log(JSON.stringify({event:'gestor_agenda_failed'})))
       .finally(()=>{gestorAgendaRun=null;});
   }
 }catch{console.log(JSON.stringify({event:'worker_cycle_failed'}));}
}
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{stopping=true;gestorAgendaRun?.abort();audioWorker.stop();for(const c of active.values())c.abort();});
console.log('Atlas worker started.');
while(!stopping){await tick();await new Promise(resolve=>setTimeout(resolve,1500));}
while(active.size||audioWorker.busy||gestorAgendaRun)await new Promise(resolve=>setTimeout(resolve,250));

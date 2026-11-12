import React,{useCallback,useEffect,useRef,useState} from 'react';
import {useLocation,useNavigate} from 'react-router-dom';
import {RefreshCw,MessageSquare,AlertCircle,Loader2} from 'lucide-react';
import {supabase} from '@/lib/customSupabaseClient';
import {useAuth} from '@/contexts/SupabaseAuthContext';
import {loadOfficeActivity} from '@/lib/atlasOfficeActivity';
import {loadOfficeClientHouse,officeClientDestination} from '@/lib/atlasOfficeClients';
import {ATLAS_EVENTS_PILOT,eventBudgetOverview} from '@/lib/atlasEvents';
import {invokeAtlasOffice} from '@/lib/atlasApi';
import {transcribeAtlasDictation} from '@/lib/atlasDictationClient';
import {executeAutomation,getAutomationErrorMessages} from '@/lib/workflow';
import './AtlasOffice.css';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export default function AtlasOffice({onOpenConversation,managerActivity}) {
  const {user}=useAuth();
  const [data,setData]=useState(null),[error,setError]=useState(''),[loading,setLoading]=useState(true);
  const frame=useRef(null),dataRef=useRef(null),mounted=useRef(true),busy=useRef(false),refreshing=useRef(false);
  const audioAbort=useRef(null);
  const [expanded,setExpanded]=useState(false);
  const navigate=useNavigate(),location=useLocation();
  const clientId=new URLSearchParams(location.search).get('office_client');
  const post=useCallback(message=>frame.current?.contentWindow?.postMessage(message,window.location.origin),[]);
  const postSnapshot=useCallback(()=>{if(dataRef.current)post({type:'atlas-office:snapshot',value:{...dataRef.current,manager_activity:managerActivity},client_id:clientId,expanded});},[post,clientId,expanded,managerActivity]);
  const refresh=useCallback(async(statusOnly=false)=>{
    if(refreshing.current)return;
    refreshing.current=true;
    try {
      const next=await invokeAtlasOffice(statusOnly&&dataRef.current?'status':'snapshot');
      if(!mounted.current)return;
      const value=statusOnly&&dataRef.current?{...dataRef.current,...next}:next;
      value.events_enabled=ATLAS_EVENTS_PILOT;
      if(ATLAS_EVENTS_PILOT){try{value.events_config=await eventBudgetOverview();}catch{value.events_config=null;}if(!mounted.current)return;}
      if(!statusOnly||!dataRef.current){
        try{value.client_house=await loadOfficeClientHouse(supabase,value.office.clients.map(c=>c.id));}
        catch{value.client_house={complete:false,error:'Carteiras e demandas não conferidas. Atualize para tentar novamente.'};}
        if(!mounted.current)return;
      }
      try{value.activity=await loadOfficeActivity(supabase,{ownerId:user?.id,eventsEnabled:ATLAS_EVENTS_PILOT});}
      catch(e){value.activity={complete:false,error:e.message,owner_id:user?.id,threads:[],findings:[]};}
      if(!mounted.current)return;
      dataRef.current=value;setData(value);setError('');
    } catch(e) {
      if(!mounted.current)return;
      setError(e.message||'Não foi possível abrir o escritório.');
      if(e.status===401||e.status===403||['ATLAS_FORBIDDEN','UNAUTHENTICATED','ATLAS_UNAUTHENTICATED','ATLAS_DISABLED'].includes(e.code)){dataRef.current=null;setData(null);}
    } finally {refreshing.current=false;if(mounted.current)setLoading(false);}
  },[user?.id]);
  useEffect(()=>{mounted.current=true;refresh();let ticks=0;const timer=setInterval(()=>{if(!document.hidden&&!busy.current)refresh(++ticks%4!==0);},15000);return()=>{mounted.current=false;clearInterval(timer);audioAbort.current?.abort();dataRef.current=null;};},[refresh]);
  useEffect(()=>{postSnapshot();},[data,postSnapshot]);
  useEffect(()=>{if(!expanded)return;const escape=event=>{if(event.key==='Escape')setExpanded(false);};window.addEventListener('keydown',escape);return()=>window.removeEventListener('keydown',escape);},[expanded]);
  useEffect(()=>{
    const receive=async event=>{
      if(event.origin!==window.location.origin||event.source!==frame.current?.contentWindow||!event.data||typeof event.data!=='object')return;
      const message=event.data;
      if(message.type==='atlas-office:toggle-expand'){setExpanded(value=>!value);return;}
      if(message.type==='atlas-office:collapse'){setExpanded(false);return;}
      if(message.type==='atlas-office:cancel-dictation'){audioAbort.current?.abort();return;}
      if(message.type==='atlas-office:ready'){postSnapshot();return;}
      if(message.type!=='atlas-office:action'||!UUID.test(message.request_id||''))return;
      const reply=(value)=>post({type:'atlas-office:result',request_id:message.request_id,...value});
      if(busy.current){reply({error:'Aguarde a confirmação da ação anterior.'});return;}
      busy.current=true;
      try {
        const current=dataRef.current;if(!current)throw new Error('Atualize a sessão do escritório.');
        let response;
        switch(message.action){
          case 'transcribe_audio': {
            if(!UUID.test(message.question_id||'')||!current.questions.some(q=>q.id===message.question_id&&q.state==='open')||!(message.audio instanceof Blob)||message.audio.size>6*1024*1024||!Number.isInteger(message.seconds)||message.seconds<1||message.seconds>120)throw new Error('Gravação inválida ou pergunta já respondida.');
            const controller=new AbortController();audioAbort.current=controller;
            const transcript=await transcribeAtlasDictation({blob:message.audio,seconds:message.seconds,requestId:message.request_id,questionId:message.question_id,signal:controller.signal});
            if(mounted.current&&!controller.signal.aborted)reply({transcript,question_id:message.question_id,message:'Áudio transcrito. Confira o texto antes de guardar a resposta.'});
            return;
          }
          case 'open_settings':navigate('/assistant/atlas/configuracoes');return;
          case 'open_team_thread':
            if(!UUID.test(message.thread_id||'')||!current.activity?.complete||!current.activity.threads.some(t=>t.id===message.thread_id))throw new Error('Conversa indisponível. Atualize os chamados.');
            setExpanded(false);window.dispatchEvent(new CustomEvent('atlas-team:open',{detail:{threadId:message.thread_id}}));
            reply({message:'Conversa interna aberta no robô.'});return;
          case 'open_demand': {
            const finding=current.activity?.complete&&current.activity.findings.find(f=>f.demand_id===message.demand_id&&f.client_id===message.client_id);
            if(!finding||!UUID.test(message.demand_id||''))throw new Error('Demanda indisponível. Atualize os chamados.');
            navigate(officeClientDestination(current,message.client_id,'demandas')+'&demanda='+encodeURIComponent(message.demand_id));reply({message:'Abrindo a demanda para revisão.'});return;
          }
          case 'open_conversation':onOpenConversation();reply({});return;
          case 'open_mission': {
            const mission=managerActivity?.workers.find(w=>w.job_id===message.job_id);
            if(!UUID.test(message.job_id||'')||!mission||!UUID.test(mission.conversation_id||''))throw new Error('Consulta indisponível. Atualize o escritório.');
            if(onOpenConversation({conversationId:mission.conversation_id,showMission:true})===false)throw new Error('Aguarde o envio atual terminar antes de abrir outra consulta.');
            setExpanded(false);reply({});return;
          }
          case 'refresh':await refresh(false);reply({message:'Fontes atualizadas.'});return;
          case 'open_client':
            if(!UUID.test(message.client_id||''))throw new Error('Cliente indisponível.');
            navigate(officeClientDestination(current,message.client_id,message.tab));reply({message:'Abrindo ficha do cliente.'});return;
          case 'open_task':
            if(!UUID.test(message.task_id||'')||!current.office.tasks.some(t=>t.id===message.task_id))throw new Error('Tarefa indisponível.');
            navigate('/tasks/list/'+message.task_id);reply({message:'Abrindo tarefa.'});return;
          case 'request_analysis':
            if(!UUID.test(message.client_id||'')||!current.office.clients.some(c=>c.id===message.client_id))throw new Error('Cliente indisponível.');
            response=await invokeAtlasOffice('request_analysis',{client_id:message.client_id});break;
          case 'answer_question':
            if(!UUID.test(message.question_id||'')||!current.questions.some(q=>q.id===message.question_id)||typeof message.answer!=='string'||message.answer.length>3000)throw new Error('Pergunta ou resposta inválida.');
            response=await invokeAtlasOffice('answer_question',{question_id:message.question_id,answer:message.answer});break;
          case 'decide_proposal': {
            if(!UUID.test(message.proposal_id||'')||!current.proposals.some(p=>p.id===message.proposal_id)||typeof message.approve!=='boolean'||message.confirmed!==true)throw new Error('Confira e confirme a proposta.');
            response=await invokeAtlasOffice('decide_proposal',{proposal_id:message.proposal_id,approve:message.approve,confirmed:true});
            if(response.task&&!response.replayed){
              // Same executor used after human creation in Tasks. Never re-run on an approval replay.
              try {const result=await executeAutomation(response.task.id,'task_created',{task:response.task});const messages=getAutomationErrorMessages(result);if(messages.length)response.automation_warning=true;}
              catch {response.automation_warning=true;}
            }
            break;
          }
          default:throw new Error('Ação não permitida.');
        }
        await refresh(false);
        reply({message:response?.task_id?`Tarefa criada no Planeje.${response.automation_warning?' A automação precisa de conferência em Tarefas.':''}`:message.action==='answer_question'?'Resposta guardada neste cliente. O Atlas vai conferir o próximo passo.':message.action==='decide_proposal'?'Proposta recusada. Nenhuma tarefa criada.':'Análise solicitada. Se faltar contexto, o Atlas vai perguntar.'});
      } catch(e){reply({error:e.message||'Não foi possível confirmar a ação.',retry_new_request:!!e.retryNewRequest});if(message.action!=='transcribe_audio')await refresh(false);}
      finally {busy.current=false;}
    };
    window.addEventListener('message',receive);return()=>window.removeEventListener('message',receive);
  },[navigate,post,postSnapshot,refresh,onOpenConversation,managerActivity]);
  return <section className={`atlas-office-page ${expanded?'atlas-office-page--expanded':''}`} aria-label="Escritório Atlas da agência">
    {!data&&<div className="atlas-office-toolbar"><span>Atlas · gerente da agência</span><div><button type="button" onClick={()=>refresh(false)} aria-label="Atualizar escritório"><RefreshCw size={14}/>Atualizar</button><button type="button" onClick={onOpenConversation}><MessageSquare size={14}/>Conversa e voz</button></div></div>}
    {error&&<div className="atlas-office-error" role="alert"><AlertCircle size={16}/>{error}</div>}
    {!data?<div className="atlas-office-loading">{loading?<><Loader2 size={24}/>Conferindo sua sessão e as fontes do Planeje…</>:<button type="button" onClick={()=>{setLoading(true);refresh();}}>Tentar novamente</button>}</div>:<iframe ref={frame} title="Escritório Atlas — equipe, clientes e tarefas reais" src="/atlas-office/index.html?v=conversa-atividade-20261018-01" onLoad={postSnapshot} referrerPolicy="same-origin" allow="microphone 'self'"/>}
  </section>;
}

export * from '../../atlas-preview/api-fixture.js';
const A='00000000-0000-4000-8000-000000000001',B='00000000-0000-4000-8000-000000000002',C='00000000-0000-4000-8000-000000000003',T='00000000-0000-4000-8000-000000000004',Q='00000000-0000-4000-8000-000000000005',P='00000000-0000-4000-8000-000000000006';
const now=new Date().toISOString();
const value={ok:true,test_fixture:true,business_time:true,config:{enabled:true,max_analyses_per_day:12,max_tokens_per_day:60000},state:{calls_today:0,tokens_today:0,last_scan_at:now},
  office:{queried_at:now,complete:true,profiles:[{id:A,full_name:'Ana Exemplo',role:'colaborador',status:'active'},{id:B,full_name:'Bia Exemplo',role:'colaborador',status:'active'}],functions:[{id:Q,name:'Design',assignee_ids:[B],is_active:true}],
  clients:[{id:C,empresa:'Aurora fictícia',objetivo_meta:''}],client_names:[{id:C,empresa:'Aurora fictícia'}],
  statuses:[{value:'todo',label:'A Fazer',is_initial:true}],tasks:[{id:T,title:'Conferir criativo & teste <script>alert(1)</script>',description:'Exemplo',status:'todo',status_label:'A Fazer',due_date:'2026-10-10',done:false,deadline_flags:['Produção com prazo vencido'],client_id:C,assignee_ids:[B],type:'arte'}],memories:[],totals:{people:2,active_tasks:1,tasks:1,closed_clients:1}},
  client_states:[{client_id:C,status:'waiting_context'}],questions:[{id:Q,client_id:C,question:'Qual é a prioridade da Aurora fictícia?',state:'open',created_at:now}],proposals:[]};
value.office.clients.push({id:'00000000-0000-4000-8000-000000000007',empresa:'Estúdio Horizonte fictício',objetivo_meta:'Atender novos clientes'},{id:'00000000-0000-4000-8000-000000000008',empresa:'Casa Lírio fictícia',objetivo_meta:'Organizar a entrega'});
value.office.client_names.push(...value.office.clients.filter(c=>!value.office.client_names.some(n=>n.id===c.id)).map(c=>({id:c.id,empresa:c.empresa})));
value.office.projects=[];
if(new URLSearchParams(location.search).get('scenario')==='analyzing'){value.questions=[];value.client_states=[{client_id:C,status:'analyzing',retry_after:new Date(Date.now()+120000).toISOString()}];}
if(new URLSearchParams(location.search).get('scenario')==='managed'){value.questions=[];value.client_states=[{client_id:C,status:'queued'}];}
export async function invokeAtlasOffice(action,payload={}) {
  if(action==='snapshot'||action==='status'){value.state.heartbeat_at=new Date().toISOString();return structuredClone(value);}
  if(action==='request_analysis')return {ok:true,queued:true};
  if(action==='answer_question'){
    const q=value.questions.find(q=>q.id===payload.question_id);q.state='answered';
    value.office.memories.push({id:P,client_id:C,content:'[Direção do cliente — confirmada por Josias] '+payload.answer,version:1,created_at:now});
    value.client_states[0]={client_id:C,status:'ready',summary:'O contexto foi confirmado no cenário fictício.',analyzed_at:now};
    value.proposals.push({id:P,client_id:C,title:'Preparar proposta de criativo',description:'Revisar o material conforme a direção informada. Esta proposta é fictícia.',task_type:'arte',assignee_ids:[B],due_date:null,state:'pending'});
    return {ok:true,memory_id:P};
  }
  if(action==='decide_proposal'){
    const p=value.proposals.find(p=>p.id===payload.proposal_id);
    if(p.state==='approved')return {ok:true,task_id:p.created_task_id,replayed:true};
    if(!payload.approve){p.state='rejected';return {ok:true};}
    p.state='approved';p.created_task_id=P;
    const task={id:P,title:p.title,client_id:C,status:'todo',status_label:'A Fazer',assignee_ids:[B],due_date:null,deadline_flags:[],done:false};
    value.office.tasks.push(task);value.office.totals.tasks++;value.office.totals.active_tasks++;
    return {ok:true,task_id:P,task,replayed:false};
  }
  throw new Error('Ação fictícia não implementada');
}

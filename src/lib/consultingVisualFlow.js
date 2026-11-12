import { consultingExecution } from './consultingPlan.js';

export const FLOW_KINDS = { campaign:'Campanha', adset:'Conjunto', ad:'Anúncio', destination:'Destino', appointment:'Agendamento', sale:'Venda', task:'Trabalho da equipe', note:'Anotação' };
export const FLOW_FUNNEL_STAGES = {
  top:{label:'Topo do funil',intent:'Atrair'},
  middle:{label:'Meio do funil',intent:'Despertar interesse'},
  bottom:{label:'Fundo do funil',intent:'Gerar agendamento'},
};
export const emptyVisualFlow = (projectId, clientId) => ({version:1,project_id:projectId,client_id:clientId,nodes:[],edges:[]});
export function flowNode(kind, position, id = crypto.randomUUID()) {
  if (!FLOW_KINDS[kind]) throw new Error('Tipo de bloco inválido.');
  return {id,type:'consultingFlow',position:{x:position.x,y:position.y},data:{kind,title:FLOW_KINDS[kind],note:'',action_ids:[]}};
}
export function connectVisualFlow(flow, connection) {
  if (connection.source === connection.target || !flow.nodes.some(n=>n.id===connection.source) || !flow.nodes.some(n=>n.id===connection.target)) return flow;
  if (flow.edges.some(e=>e.source===connection.source&&e.target===connection.target)) return flow;
  return {...flow,edges:[...flow.edges,{id:connection.id || crypto.randomUUID(),source:connection.source,target:connection.target,sourceHandle:connection.sourceHandle || 'out',targetHandle:connection.targetHandle || 'in',label:connection.label || ''}]};
}
export function removeVisualElements(flow, nodeIds = [], edgeIds = []) {
  return {...flow,nodes:flow.nodes.filter(n=>!nodeIds.includes(n.id)),edges:flow.edges.filter(e=>!edgeIds.includes(e.id)&&!nodeIds.includes(e.source)&&!nodeIds.includes(e.target))};
}
export function patchVisualNode(flow, id, patch) {
  return {...flow,nodes:flow.nodes.map(n=>n.id===id?{...n,data:{...n.data,...patch}}:n)};
}
export function pruneVisualActionReferences(flow, actions) {
  const ids=new Set(actions.map(action=>action.id));
  return {...flow,nodes:flow.nodes.map(node=>({...node,data:{...node.data,action_ids:(node.data.action_ids||[]).filter(id=>ids.has(id))}}))};
}
export function legacyToVisualFlow(funnel, projectId, clientId) {
  const names={top:'Descoberta',middle:'Consideração',bottom:'Conversão',result:'Agendamento'};
  const keys=Object.keys(names).filter(key=>Object.values(funnel?.[key]||{}).some(Boolean)||(funnel?.routes||[]).some(e=>e.source===key||e.target===key));
  const flow=emptyVisualFlow(projectId,clientId);
  flow.nodes=keys.map((key,index)=>({...flowNode(key==='result'?'appointment':'note',{x:(index%3)*310,y:Math.floor(index/3)*260},`legacy-${key}`),data:{kind:key==='result'?'appointment':'note',title:funnel[key]?.title||names[key],note:[funnel[key]?.campaign_objective,funnel[key]?.content].filter(Boolean).join('\n\n'),destination:funnel[key]?.destination||'',metric:funnel[key]?.kpis||'',legacy_stage:key,action_ids:[]}}));
  flow.edges=(funnel?.routes||[]).filter(e=>keys.includes(e.source)&&keys.includes(e.target)).map(e=>({id:`legacy-${e.id}`,source:`legacy-${e.source}`,target:`legacy-${e.target}`,sourceHandle:'out',targetHandle:'in',label:e.label}));
  return flow;
}
export function appointmentFlow(projectId,clientId) {
  let flow=emptyVisualFlow(projectId,clientId);
  const specs=[['campaign','Campanha de agendamento',0,0],['adset','Público da campanha',310,0],['ad','Anúncio de convite',620,0],['destination','WhatsApp da loja',620,270],['appointment','Agendamento na loja',310,270]];
  flow.nodes=specs.map(([kind,title,x,y])=>{const n=flowNode(kind,{x,y});n.data.title=title;return n;});
  for(let i=0;i<flow.nodes.length-1;i++) flow=connectVisualFlow(flow,{source:flow.nodes[i].id,target:flow.nodes[i+1].id,sourceHandle:i>1?'out-bottom':'out',targetHandle:i>1?'in-top':'in'});
  return flow;
}
export function summarizeVisualFlow(plan,tasks=[],statuses=[],{complete=true}={}) {
  const flow=plan.sales_funnel?.visual_flow;
  if (!flow) return null;
  const execution=consultingExecution(plan,tasks,statuses,{complete});
  return {project_id:plan.project_id,revision:plan.consulting_revision,task_coverage_complete:complete,nodes_coverage_complete:flow.nodes.length<=80,edges_coverage_complete:flow.edges.length<=80,
    nodes:flow.nodes.slice(0,80).map(n=>({id:n.id,kind:n.data.kind,title:n.data.title,funnel_stage:n.data.funnel_stage||null,destination:n.data.destination||null,metric:n.data.metric||null,binding:n.data.binding||null,state:n.data.binding?'saved_ad_reference':'planned',tasks:execution.steps.filter(s=>(n.data.action_ids||[]).includes(s.id))})),
    paths:flow.edges.slice(0,80).map(e=>({id:e.id,source:e.source,target:e.target,label:e.label||null})),
    note:'Fluxo estratégico. Setas não comprovam conversões nem configuram campanhas. Vínculos são referências consultadas, não estado ao vivo da Meta. Tarefas são a execução; posição dos blocos não define prioridade.'};
}

/** Read-only client house presentation. Execution remains on the existing client/task records. */
export const OFFICE_OPERATIONS=[{id:'all',name:'Todos'},{id:'jb',name:'JB Apex'},{id:'apice',name:'Ápice Noivas'},{id:'unclassified',name:'A confirmar'}];
const normalize=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[-_]+/g,' ').replace(/\s+/g,' ').trim();
export function clientLogoUrl(client) {
 const value=Array.isArray(client?.logo_urls)?client.logo_urls.find(url=>typeof url==='string'&&url.trim()):null;
 if(!value)return null;
 try{const url=new URL(value,'https://planeje.jbapex.com.br');return ['https:','http:'].includes(url.protocol)&&!url.username&&!url.password?value.trim():null;}catch{return null;}
}
export function clientOperation(client,catalog=[]) {
 const labels=(Array.isArray(client?.etiquetas)?client.etiquetas:[]).map(t=>normalize(typeof t==='object'?t?.nome||t?.chave:catalog.find(c=>c.chave===t)?.nome||t));
 const jb=labels.includes('jb apex'),apice=labels.includes('apice noivas');
 return jb===apice?'unclassified':apice?'apice':'jb';
}
export function officeClientCards(data,{operation='all',search=''}={}) {
 const office=data.office,extra=data.client_house||{},labels=new Map((extra.clients||[]).map(c=>[c.id,c])),needle=normalize(search);
 return office.clients.map(c=>{
  const source=labels.get(c.id),operation=source?clientOperation(source,extra.labels):'unclassified';
  const tasks=office.tasks.filter(t=>t.client_id===c.id&&!t.done),ids=new Set(tasks.flatMap(t=>t.assignee_ids||[]));
  const questions=(data.questions||[]).filter(q=>q.client_id===c.id&&q.state==='open');
  const proposals=(data.proposals||[]).filter(p=>p.client_id===c.id&&p.state==='pending');
  const state=(data.client_states||[]).find(s=>s.client_id===c.id);
  return {...c,logo_url:clientLogoUrl(source),operation,operation_name:OFFICE_OPERATIONS.find(o=>o.id===operation).name,tasks,late:tasks.filter(t=>t.deadline_flags?.length).length,
   people:[...ids].map(id=>({id,name:office.profiles.find(p=>p.id===id)?.full_name||'Responsável indisponível'})),
   demands:extra.complete?(extra.demands||[]).filter(d=>d.client_id===c.id&&d.state!=='archived'):null,questions,proposals,
   projects:(office.projects||[]).filter(p=>p.client_id===c.id),
   state:questions.length?'Aguarda sua orientação':proposals.length?'Repasse para aprovar':state?.status==='analyzing'?'Atlas analisando':state?.status==='error'?'Análise precisa de atenção':tasks.length?'Equipe com tarefas em aberto':'Sem tarefas em aberto',
  };
 }).filter(c=>(operation==='all'||c.operation===operation)&&(!needle||normalize(c.empresa).includes(needle)))
 .sort((a,b)=>a.empresa.localeCompare(b.empresa,'pt-BR'));
}
export async function loadOfficeClientHouse(caller,clientIds) {
 const ids=[...new Set(clientIds)];if(!ids.length)return {complete:true,clients:[],labels:[],demands:[]};
 const read=async(table,fields,filter=q=>q)=>{
  const rows=[];
  for(let offset=0;offset<30000;offset+=500){
   const {data,error}=await filter(caller.from(table).select(fields)).order(table==='cliente_etiquetas'?'chave':'id').range(offset,offset+499);
   if(error||!Array.isArray(data))throw new Error('Não foi possível conferir as carteiras e demandas. Atualize antes de usar os contadores.');
   rows.push(...data);if(data.length<500)return rows;
  }
  throw new Error('Consulta das carteiras incompleta. Atualize antes de continuar.');
 };
 const [clients,labels,demands]=await Promise.all([
  read('clientes','id,etiquetas,logo_urls',q=>q.in('id',ids).eq('etapa','closed')),
  read('cliente_etiquetas','chave,nome'),
  read('atlas_demands','id,client_id,state,task_id',q=>q.in('client_id',ids)),
 ]);
 if(clients.length!==ids.length)throw new Error('A carteira mudou durante a consulta. Atualize o escritório.');
 return {complete:true,clients,labels,demands,queried_at:new Date().toISOString()};
}
export const OFFICE_CLIENT_TABS=['resumo','demandas','arquivos','reunioes','projetos'];
export function officeClientDestination(data,id,tab) {
 if(!OFFICE_CLIENT_TABS.includes(tab)||!data?.office?.clients?.some(c=>c.id===id))throw new Error('Cliente ou aba indisponível. Atualize o escritório.');
 return '/clients/'+encodeURIComponent(id)+'?aba='+tab;
}

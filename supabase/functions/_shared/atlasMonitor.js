import { atlasSnapshotInfo } from './atlasManagerContext.js';
import { normalizarAvisoEspera, dedupeAguardandoAviso } from '../../../src/lib/atendimentoAvisoEspera.js';
import { projectCoversMonth } from '../../../src/lib/projectPeriod.js';

export function saoPauloParts(now=new Date()) {
  return Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
}
export function isBusinessTime(now=new Date()){const p=saoPauloParts(now);return !['Sat','Sun'].includes(p.weekday)&&Number(p.hour)>=8&&Number(p.hour)<17;}
// Calendar arithmetic is bounded; São Paulo has UTC-3 throughout the deployment period.
export function businessWaitMinutes(since,now=new Date()) {
  const start=new Date(since);if(!Number.isFinite(start.getTime())||start>now)return 0;
  let total=0;const p=saoPauloParts(start);let day=new Date(`${p.year}-${p.month}-${p.day}T08:00:00-03:00`);
  for(let i=0;i<3660&&day<=now;i++,day=new Date(day.getTime()+86400000)){
    if(['Sat','Sun'].includes(saoPauloParts(day).weekday))continue;
    total+=Math.max(0,Math.min(now.getTime(),day.getTime()+9*3600000)-Math.max(start.getTime(),day.getTime()));
  }return Math.floor(total/60000);
}
export function buildAtlasAlerts({conversations=[],waitSettings=[],traffic=[],plans=[],now=new Date()}) {
  const p=saoPauloParts(now),month=`${p.year}-${p.month}`, alerts=[];
  if(!isBusinessTime(now))return alerts;
  for(const c of dedupeAguardandoAviso(conversations.filter(c=>!c.bloqueada&&!c.archived_at&&c.status!=='resolvido'))) {
    if(c.bloqueada||c.archived_at||['resolvido','resolved','resolvida','finalizada','closed'].includes(c.status))continue;
    const conf=normalizarAvisoEspera(waitSettings.find(s=>s.cliente_id===c.cliente_id));
    const minutes=businessWaitMinutes(c.awaiting_response_since,now);
    if(!conf.habilitado||minutes<conf.primeiroMinutos)continue;
    alerts.push({source_key:`atendimento:${c.id}:${c.awaiting_response_since}`,kind:'atendimento',title:`${c.display_name||'Grupo'} aguarda resposta`,body:`Há ${minutes} minutos úteis sem resposta registrada. ${Number(p.hour)>=16?'Jhemisson é a referência de cobertura até as 17h.':'Confira quem assumiu e o pedido do cliente.'} Resposta e entrega da promessa precisam ser acompanhadas separadamente.`,severity:minutes>=conf.primeiroMinutos+conf.repetirMinutos?'critical':'attention',evidence:{conversation_id:c.id,since:c.awaiting_response_since,minutes,threshold:conf.primeiroMinutos,observed_at:now.toISOString()}});
  }
  for(const c of traffic) {
    if(c.etapa!=='closed'||['closed','temporarily_paused'].includes(c.operations?.situation))continue;
    const info=atlasSnapshotInfo(c.meta_resumo,now), settings=c.checkup_settings;
    if(!info.current) {
      alerts.push({source_key:`trafego:${c.id}:freshness:${month}`,kind:'trafego',client_id:c.id,title:`${c.empresa}: conferir atualização do tráfego`,body:'O Planeje não tem snapshot recente deste mês para confirmar campanhas e orçamento. Abra Gestão de tráfego para atualizar a leitura antes de decidir.',severity:'attention',evidence:{source:'clientes.meta_resumo',...info}});continue;
    }
    const s=c.meta_resumo;
    if(Number(c.limite_meta)>0 && Number.isFinite(Number(s.spend)) && Number(s.spend)>Number(c.limite_meta))alerts.push({source_key:`trafego:${c.id}:budget:${month}`,kind:'trafego',client_id:c.id,title:`${c.empresa}: Meta acima do orçamento mensal`,body:`O snapshot registra R$ ${Number(s.spend).toFixed(2)} investidos para R$ ${Number(c.limite_meta).toFixed(2)} de limite mensal da Meta. Conferir a verba e a decisão de campanha.`,severity:'critical',evidence:{source:'clientes.meta_resumo',period:s.period,synced_at:s.syncedAt,spend:s.spend,budget:c.limite_meta}});
    if(settings?.enabled&&settings.require_active_campaign===true&&Number(s.activeCount)===0)alerts.push({source_key:`trafego:${c.id}:inactive:${month}`,kind:'trafego',client_id:c.id,title:`${c.empresa}: campanha esperada sem atividade`,body:'O check-up exige campanha ativa e o snapshot recente registra zero. Conferir campanha e pendências de material antes de cobrar uma publicação.',severity:'attention',evidence:{source:'traffic_checkup_settings + clientes.meta_resumo',synced_at:s.syncedAt}});
  }
  // Readiness and approval are separate from client alignment. These are prompts for a review, never invented defaults.
  const clients=new Map(plans.map(project=>[project.client_id,project]));
  for(const [clientId,project]of clients){
    const hasCurrent=plans.some(x=>x.client_id===clientId&&projectCoversMonth(x,month));
    if(!hasCurrent)alerts.push({source_key:`planejamento:${clientId}:${month}`,kind:'planejamento',client_id:clientId,title:'Planejamento do mês precisa de conferência',body:`Não encontrei projeto de ${month} na amostra recente deste cliente. Vamos conferir o alinhamento e preparar uma proposta de entregas?`,severity:'attention',evidence:{source:'projetos',last_project_id:project.id,month,limited_sample:true}});
  }
  return alerts;
}

export function atlasAlertOutsidePortfolio(alert,portfolio,groups) {
  if(portfolio.available!==false&&portfolio.portfolio_complete&&alert.client_id&&!portfolio.active_client_ids.includes(alert.client_id))return true;
  const [kind,id]=alert.source_key.split(':');
  return groups.available!==false&&kind==='atendimento'&&Boolean(groups.excluded_conversation_ids?.includes(id));
}

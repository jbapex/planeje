import '../atlas-office-preview/style.css';
import '../atlas-office-preview/brand.css';
import './office.css';
import {createWorld} from '../atlas-office-preview/vendor/habblaud/client/src/world';
import {setLocale} from '../atlas-office-preview/vendor/habblaud/shared/i18n';
import {officePeople,officeAgentStates,OFFICE_AGENT_STATES,liveOfficeSnapshot,officeStateLabel} from '../../src/lib/atlasOfficePresentation.js';

import {officeOwnerItems,officeActivityEntries,ownerName} from '../../src/lib/atlasOfficeActivity.js';
import {liveOfficeMissions} from '../../src/lib/atlasOfficeMissions.js';
import {OFFICE_OPERATIONS,officeClientCards} from '../../src/lib/atlasOfficeClients.js';
import {clientHouse} from './client-house';
import {atlasRobot} from './atlas-robot';
import {officeClock} from '../../src/lib/atlasOfficeClock.js';
import {AtlasDictationRecorder,audioClock} from '../../src/lib/atlasDictationRecorder.js';
setLocale('pt-BR');
const app=document.querySelector<HTMLDivElement>('#app')!,canvas=document.querySelector<HTMLCanvasElement>('#world')!;
const asset=import.meta.env.BASE_URL+'assets/';
let data:any=null,person:string|null=null,department:string|null=null,client:string|null=null,tab='summary',mobilePanel=false,showDone=false,limit=50,confirmation:string|null=null,pending:string|null=null,notice='';
const drafts:Record<string,string>={},listeners=new Set<()=>void>();
let leftCollapsed=false,rightCollapsed=false,activityFilter='all';
let expanded=false,operation='all',clientSearch='',clientMotionPaused=false,workClient='';
let savedPanelScroll=0,lastPanelKey='',agentFilter:string|null=null,audioQuestion:string|null=null,audioRequest:string|null=null;
let audioState:any={phase:'idle',seconds:0,error:''};
const audioBusy=()=>['permission','recording','transcribing'].includes(audioState.phase);
const recorder=new AtlasDictationRecorder({onChange:(state:any)=>{const tick=state.phase==='recording'&&audioState.phase==='recording';audioState={...state};if(tick){const button=app.querySelector('[data-audio-stop]');if(button)button.textContent='■ Parar e transcrever · '+audioClock(state.seconds);}else render();},onAudio:(audio:any)=>{if(pending){recorder.fail(new Error('Aguarde a ação anterior e tente transcrever novamente.'));return;}audioRequest=audio.requestId;send('transcribe_audio',{question_id:audioQuestion,audio:audio.blob,seconds:audio.seconds},audio.requestId);}});
function cancelDictation(){if(audioRequest&&pending===audioRequest){window.parent.postMessage({type:'atlas-office:cancel-dictation'},location.origin);pending=null;}audioQuestion=null;audioRequest=null;recorder.cancel();}
const store={snapshot:null as any,on:(_event:string,cb:()=>void)=>{listeners.add(cb);return()=>listeners.delete(cb);}};
const world=createWorld(canvas,store as Parameters<typeof createWorld>[1]);
let visualClock=officeClock();
const managerRobot=atlasRobot(()=>data,()=>visualClock.businessTime);
world.setOptions({theme:'none',daylight:'auto',dayNight:true,daylightHour:visualClock.hour,liveliness:'calm',showNames:true,bubbles:'important',followSelected:false});
const e=(s:any)=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const stamp=(s:any)=>s?new Date(s).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'Ainda não conferido';
const date=(s:any)=>s?String(s).slice(0,10).split('-').reverse().join('/'):'Sem data combinada';
const usageToday=()=>data.state?.usage_day===new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const agentStates=()=>officeAgentStates(data,{businessTime:visualClock.businessTime});
const people=()=>agentStates().people;
function syncWorld(){
 visualClock=officeClock();
 world.setOptions({daylightHour:visualClock.hour});
 if(!data?.office?.complete)return;
 canvas.setAttribute('aria-label',`Escritório Atlas e Casa dos clientes · ${visualClock.phase} em São Paulo. As animações não representam presença humana.`);
 canvas.dataset.dayPhase=visualClock.phase;
 const cards=officeClientCards(data);
 world.setOptions({landmarks:[clientHouse(officePeople(data.office).departments.length,{total:cards.length,jb:cards.filter(c=>c.operation==='jb').length,apice:cards.filter(c=>c.operation==='apice').length,unclassified:cards.filter(c=>c.operation==='unclassified').length},cards,()=>client,()=>clientMotionPaused),managerRobot]});
 store.snapshot=liveOfficeSnapshot(data,{businessTime:visualClock.businessTime});listeners.forEach(cb=>cb());
}
const areas=()=>officePeople(data.office).departments;
const clients=()=>data.office.clients;
const clientCards=()=>officeClientCards(data);
const clientName=(id:string)=>data.office.client_names.find((c:any)=>c.id===id)?.empresa||'Sem cliente';
function send(action:string,params:any={},requestId=crypto.randomUUID()) {
  if(pending)return;
  pending=requestId;notice='';
  window.parent.postMessage({type:'atlas-office:action',request_id:pending,action,...params},location.origin);render();
}
function filteredTasks() {
  let tasks=data.office.tasks.filter((t:any)=>showDone||!t.done);
  if(agentFilter){const ids=new Set(people().filter((p:any)=>p.active_states?.includes(agentFilter)).map((p:any)=>p.id));tasks=tasks.filter((t:any)=>t.assignee_ids.some((id:string)=>ids.has(id)));}
  if(client)tasks=tasks.filter((t:any)=>t.client_id===client);
  if(person)tasks=tasks.filter((t:any)=>t.assignee_ids.includes(person));
  else if(department){const ids=new Set(people().filter((p:any)=>p.department===department).map((p:any)=>p.id));tasks=tasks.filter((t:any)=>t.assignee_ids.some((id:string)=>ids.has(id)));}
  return tasks.sort((a:any,b:any)=>Number(b.deadline_flags.length>0)-Number(a.deadline_flags.length>0)||String(a.due_date||'9999').localeCompare(String(b.due_date||'9999'))||a.id.localeCompare(b.id));
}
function taskCard(t:any) {
  const owners=t.assignee_ids.map((id:string)=>people().find((p:any)=>p.id===id)?.name||'Responsável indisponível');
  return `<article class="task-card ${t.deadline_flags.length?'blocked':''}"><div class="task-meta"><span>${e(clientName(t.client_id))}</span><span class="task-due">${t.due_date?'Produção: '+date(t.due_date):'Produção sem prazo'}</span></div><h4>${e(t.title)}</h4><p>${t.deadline_flags.length?e(t.deadline_flags.join(' · ')):t.post_date?'Postagem: '+date(t.post_date):'Sem sinalização de prazo vencido'}</p><div class="task-bottom"><span class="task-owner">${e(owners.join(', ')||'Sem responsável')}</span><span class="status ${t.done?'done':t.deadline_flags.length?'blocked':''}"><i></i>${e(t.status_label)}</span></div><button class="text-button" data-task="${e(t.id)}">Abrir tarefa no Planeje ↗</button></article>`;
}
const microphone='<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8"/></svg>';
function questionAudio(q:any){
 const selected=audioQuestion===q.id,phase=selected?audioState.phase:'idle';
 return `<div class="question-audio" aria-label="Responder por áudio">${phase==='recording'?`<button type="button" data-audio-stop="${e(q.id)}">■ Parar e transcrever · ${audioClock(audioState.seconds)}</button>`:['permission','transcribing'].includes(phase)?`<span role="status">${phase==='permission'?'Abrindo microfone…':'Transcrevendo…'}</span>`:`<button type="button" data-record="${e(q.id)}" ${pending||audioBusy()?'disabled':''}>${microphone} Gravar áudio</button>`}${phase==='error'&&recorder.lastAudio?`<button type="button" data-audio-retry="${e(q.id)}">Tentar transcrição novamente</button>`:''}${selected&&phase!=='idle'?'<button type="button" data-action="cancel-audio" aria-label="Cancelar áudio">×</button>':''}<small>Até 2 min · confira o texto antes de guardar</small>${selected&&audioState.error?`<p role="alert">${e(audioState.error)}</p>`:''}</div>`;
}
function questionCard(q:any) {
 const busy=pending||audioBusy(),tooLong=(drafts[q.id]||'').length>3000;
 return `<article class="insight question-card"><div class="insight-kicker">Atlas precisa de você · ${e(clientName(q.client_id))}</div><h3>${e(q.question)}</h3><form data-question="${e(q.id)}"><label for="answer-${e(q.id)}">Sua orientação para este cliente</label><textarea id="answer-${e(q.id)}" name="answer" rows="4" maxlength="3000" required ${busy?'disabled':''}>${e(drafts[q.id]||'')}</textarea>${questionAudio(q)}${tooLong?'<p class="office-warning">Resuma para até 3.000 caracteres antes de guardar.</p>':''}<button class="primary-button" type="submit" ${busy||tooLong?'disabled':''}>${pending&&!audioRequest?'Guardando…':'Guardar resposta e planejar'} →</button></form><p class="rule-note">Sua resposta fica na memória deste cliente. ${e(taskRule())}.</p></article>`;
}

function proposalCard(p:any) {
  const owners=p.assignee_ids.map((id:string)=>people().find((x:any)=>x.id===id)?.name||'Pessoa indisponível').join(', ')||'Sem responsável';
  return `<article class="proposal-card"><span class="eyebrow">PROPOSTA · AGUARDA SUA APROVAÇÃO</span><h3>${e(p.title)}</h3><p>${e(p.description)}</p><dl><dt>Cliente</dt><dd>${e(clientName(p.client_id))}</dd><dt>Responsável</dt><dd>${e(owners)}</dd><dt>Prazo</dt><dd>${date(p.due_date)}</dd><dt>Tipo</dt><dd>${e(p.task_type)}</dd><dt>Entrada</dt><dd>${e(data.office.statuses.find((s:any)=>s.is_initial)?.label||'A Fazer')}</dd></dl><p class="rule-note">As automações já configuradas em Tarefas continuam valendo após a criação.</p>${confirmation===p.id?`<div class="approval-confirm"><p>Criar esta tarefa no Planeje com os dados acima?</p><button class="primary-button" data-approve="${e(p.id)}" ${pending?'disabled':''}>${pending?'Confirmando…':'Confirmar criação'}</button><button class="subtle-button" data-action="cancel-confirm">Voltar à revisão</button></div>`:`<div class="proposal-actions"><button class="primary-button" data-confirm="${e(p.id)}" ${pending?'disabled':''}>Aprovar e criar tarefa</button><button data-reject="${e(p.id)}" ${pending?'disabled':''}>Recusar</button></div>`}</article>`;
}
function clientPanel() {
  if(!client){
    const cards=clientCards(),visible=officeClientCards(data,{operation,search:clientSearch});
    return `<div class="house-intro"><span class="eyebrow">CASA DOS CLIENTES</span><h3>Carteiras da agência</h3><p>Abra um cliente para acompanhar o trabalho e acessar sua ficha.</p><button type="button" class="text-button" data-action="client-motion" aria-pressed="${clientMotionPaused}">${clientMotionPaused?'Retomar movimento':'Pausar movimento'}</button></div>
      ${!data.client_house?.complete?`<p class="office-warning" role="alert">${e(data.client_house?.error||'Carteiras ainda não conferidas. Atualize o escritório.')}</p>`:''}
      <div class="house-portfolios" aria-label="Carteiras de clientes">${OFFICE_OPERATIONS.map(o=>`<button type="button" data-operation="${o.id}" aria-pressed="${operation===o.id}"><span>${o.name}</span><strong>${o.id==='all'?cards.length:cards.filter(c=>c.operation===o.id).length}</strong></button>`).join('')}</div>
      <label class="house-search" for="office-client-search">Buscar cliente<input id="office-client-search" type="search" value="${e(clientSearch)}" placeholder="Nome do cliente" autocomplete="off"></label>
      ${operation==='unclassified'?'<p class="rule-note">Sem etiqueta de operação ou com etiquetas conflitantes. A classificação pode ser conferida no cadastro do cliente.</p>':''}
      <div class="client-directory house-directory">${visible.map(c=>`<button class="client-tile house-client" data-client="${e(c.id)}"><span class="client-initial">${e(c.empresa.slice(0,2).toUpperCase())}</span><span><strong>${e(c.empresa)}</strong><small class="house-operation">${c.operation_name}</small><small>${e(c.state)}</small><small>${c.tasks.length} tarefa(s) em aberto${c.late?' · '+c.late+' com prazo vencido':''}${c.demands===null?'':' · '+c.demands.length+' demanda(s)'}</small><small>${c.people.length?'Nas tarefas: '+e(c.people.map(p=>p.name.split(' ')[0]).join(', ')):'Sem equipe em tarefas abertas'}</small></span><span>›</span></button>`).join('')||'<p class="office-copy">Nenhum cliente nesta seleção. Confira as outras carteiras ou ajuste a busca.</p>'}</div>`;
  }
  const c=clients().find((c:any)=>c.id===client),s=data.client_states.find((s:any)=>s.client_id===client);
  const questions=data.questions.filter((q:any)=>q.client_id===client&&q.state==='open'),proposals=data.proposals.filter((p:any)=>p.client_id===client&&p.state==='pending');
  const memories=data.office.memories.filter((m:any)=>m.client_id===client);
  const card=clientCards().find(c=>c.id===client);
  return `<button class="text-button back-clients" data-action="clients">← Casa dos clientes</button><h3 class="client-title">${e(c?.empresa)}</h3><span class="house-client-operation">${card?.operation_name||'A confirmar'}</span><div class="house-client-links" aria-label="Ficha do cliente">${[['resumo','Ficha'],['demandas','Demandas e histórico'],['arquivos','Arquivos e memória'],['reunioes','Reuniões'],['projetos','Projetos']].map(([tab,label])=>`<button type="button" data-client-hub="${e(client)}" data-client-tab="${tab}">${label} ↗</button>`).join('')}</div><div class="house-client-work"><strong>${card?.tasks.length||0} tarefas em aberto · ${card?.late||0} com prazo vencido</strong><p>${card?.people.length?'Equipe nas tarefas: '+e(card.people.map(p=>p.name).join(', ')):'Nenhum responsável em tarefas abertas.'}</p></div>${c?.objetivo_meta?`<article class="direction-card"><span class="eyebrow">OBJETIVO CADASTRADO</span><p>${e(c.objetivo_meta)}</p></article>`:''}${questions.map(questionCard).join('')}
    ${s?.status==='queued'||s?.status==='analyzing'?`<p class="office-working" role="status">${s.status==='analyzing'?'Atlas está analisando os registros deste cliente…':'Análise solicitada. O gerente vai conferir os dados…'}</p>`:''}
    ${s?.last_error?`<p class="office-warning">${e(s.last_error)}</p>`:''}${s?.status==='budget_wait'?'<p class="office-warning">Limite de análises de hoje reservado ou atingido. As leituras continuam disponíveis.</p>':''}
    ${s?.summary?`<article class="insight ${questions.length?'':'resolved'}"><div class="insight-kicker">ANÁLISE DO ATLAS · ${stamp(s.analyzed_at)}</div><p class="analysis-text">${e(s.summary)}</p></article>`:''}
    ${!questions.length?`<button class="primary-button analysis-button" data-analyze="${e(client)}" ${pending||['queued','analyzing'].includes(s?.status)?'disabled':''}>Pedir análise agora →</button><p class="rule-note">Se faltar contexto, o Atlas pergunta antes de propor. Fora do horário, só analisa quando você pedir.</p>`:''}
    ${proposals.length?`<div class="content-title">Aprovar tarefas <span>${proposals.length}</span></div>${proposals.map(proposalCard).join('')}`:''}
    <div class="content-title">Memória deste cliente <span>${memories.length}</span></div>${memories.length?memories.map((m:any)=>`<article class="memory-card"><p>${e(m.content)}</p><small>Versão ${e(m.version)} · ${stamp(m.created_at)}</small></article>`).join(''):'<p class="office-copy">As suas orientações vão aparecer aqui, vinculadas a este cliente.</p>'}
    <div class="content-title">Tarefas do cliente</div>${filteredTasks().slice(0,8).map(taskCard).join('')||'<p class="office-copy">Sem tarefas em aberto nesta consulta.</p>'}<button class="text-button" data-tab="tasks">Ver a fila deste cliente →</button>`;
}
function taskRule(){const c=data?.events_config;return c?.enabled&&c?.mode==='assist'&&c?.manager_policy?.enabled&&c?.manager_policy?.create_after_clarification?'Atlas organiza tarefas após alinhar com o responsável da conta':'Novas tarefas passam pela sua aprovação';}
function workPanel(){
 const available=clients().filter((c:any)=>!data.events_enabled||data.events_config?.client_ids?.includes(c.id));
 const selected=available.find((c:any)=>c.id===workClient),state=data.client_states.find((s:any)=>s.client_id===selected?.id);
 const paused=!data.config?.enabled||data.events_enabled&&!data.events_config?.enabled;
 const queued=state?.requested_at||state?.status==='analyzing';
 return `<div class="office-work"><div class="office-work-intro"><strong>Atlas disponível para você</strong><p>Você pode conversar, responder e pedir análises à noite ou no fim de semana.</p></div><button class="primary-button" data-action="conversation" ${pending||audioBusy()?'disabled':''}>Conversar com Atlas →</button><label for="office-work-client">Qual cliente vamos analisar?</label><select id="office-work-client" ${pending?'disabled':''}><option value="">Escolha um cliente</option>${available.map((c:any)=>`<option value="${e(c.id)}" ${c.id===selected?.id?'selected':''}>${e(c.empresa)}</option>`).join('')}</select><button class="office-work-analysis" data-work-analyze="${e(selected?.id||'')}" ${!selected||pending||queued||paused?'disabled':''}>${queued?'Análise solicitada':pending?'Solicitando…':'Analisar cliente agora'}</button>${paused?'<p class="office-warning">As análises estão pausadas. A conversa continua disponível; confira as configurações para retomar a leitura.</p>':''}${selected?`<button class="text-button" data-client="${e(selected.id)}">Ver contexto e respostas deste cliente →</button>`:''}<p class="rule-note">A análise usa o limite de tokens configurado e aparece no acompanhamento do cliente.</p><div class="office-work-schedule"><strong>Agenda da equipe preservada</strong><p>Chamados e cobranças automáticas seguem o expediente, de segunda a sexta, das 8h às 17h. Os prazos que o Atlas calcula usam dias úteis; uma data no sábado ou domingo passa para a segunda-feira.</p></div></div>`;
}
function activityScope(){return{person,department:!person&&department?people().filter((p:any)=>p.department===department).map((p:any)=>p.id):null};}
function activityPanel(){
 const a=data.activity,own=ownerName(data),scope=activityScope();
 const list=officeActivityEntries(data,{filter:activityFilter,...scope});
 const tabs=[['all','Em aberto'],['owner','Aguardando '+own],['atlas','Fila do Atlas'],['team','Aguardando equipe'],['review','Revisões'],['closed','Encerrados']];
 const name=(id:string)=>data.office.profiles.find((p:any)=>p.id===id)?.full_name||'Pessoa indisponível';
 const message=(label:string,m:any)=>m?`<div class="call-message"><small>${e(label)} · ${stamp(m.created_at)}</small><p>${e(m.content.slice(0,320))}</p>${m.content.length>320?`<details><summary>Ver mensagem completa</summary><p>${e(m.content)}</p></details>`:''}</div>`:'';
 return `<div class="calls-intro"><strong>Chamados e decisões</strong><p>Veja quem precisa agir, o que o Atlas escreveu e os retornos registrados. Sugestões aguardando sua revisão ainda não são mensagens à equipe.</p><small>Atualizado: ${stamp(a?.queried_at)} · conversas internas do robô no Planeje</small></div>
 ${!a?.complete?`<p class="office-warning" role="alert">${e(a?.error||'Chamados ainda não conferidos. Atualize o escritório.')}</p>`:''}
 <div class="calls-filters" aria-label="Filtrar chamados">${tabs.map(([id,label])=>`<button data-call-filter="${id}" aria-pressed="${activityFilter===id}">${e(label)} <b>${!a?.complete&&id!=='owner'?'—':officeActivityEntries(data,{filter:id,...scope}).length}</b></button>`).join('')}</div>
 ${agentFilter?`<p class="rule-note">O topo conta agentes; os cartões abaixo mostram os assuntos sem repetir uma sugestão por funcionário.</p>`:''}
 ${list.map((i:any)=>{if(i.kind==='thread'){
  const t=i.thread,atlas=t.last_atlas?.[0],human=t.last_human?.[0],personName=name(t.current_person_id),label=i.group==='owner'?'Aguardando '+own:i.group==='review'?'Revisão combinada':i.group==='closed'?'Encerrado':'Aguardando '+personName;
  return `<article class="office-call-card" data-call-id="${e(t.id)}"><div class="call-card-meta"><span>${e(clientName(t.client_id))}</span><span>${e(label)}</span></div><h4>${e(t.title)}</h4><p class="call-recipient">${atlas?'Atlas chamou':'Conversa interna com'} <strong>${e(personName)}</strong></p>${message('Atlas',atlas)}${human?message('Último retorno de '+name(human.actor_id),human):'<p class="rule-note">Nenhuma resposta registrada nesta conversa.</p>'}<p class="call-review">Próxima revisão: <strong>${t.next_review_at?stamp(t.next_review_at):'Sem revisão agendada'}</strong></p><button class="primary-button" data-thread="${e(t.id)}">Abrir conversa no robô ↗</button>${data.office.tasks.some((x:any)=>x.id===t.task_id)?`<button class="text-button" data-task="${e(t.task_id)}">Abrir tarefa ↗</button>`:''}</article>`;
 }
 if(i.group==='atlas')return `<article class="office-call-card"><div class="call-card-meta"><span>${e(clientName(i.client_id))}</span><span>${e(i.progress.label)}</span></div><h4>${e(i.title)}</h4><p>${e(i.text||'Pedido identificado no grupo.')}</p>${i.progress.account_name?`<small>Conta cadastrada: ${e(i.progress.account_name)}</small>`:''}<p>${e(i.progress.next)}</p><small>Ainda sem conversa aberta para este pedido.</small><button class="primary-button" data-client-hub="${e(i.client_id)}" data-client-tab="demandas">Ver andamento do pedido →</button></article>`;
 const label=i.kind==='proposal'?'Repasse para aprovar':i.kind==='question'?'Pergunta para '+own:'Sugestão para '+own;
 return `<article class="office-call-card is-owner"><div class="call-card-meta"><span>${e(clientName(i.client_id))}</span><span>${e(label)}</span></div><h4>${e(i.title)}</h4><p>${e(i.text||'Confira o contexto antes de encaminhar.')}</p><small>A equipe ainda não foi chamada por este registro.</small><button class="primary-button" data-owner-item="${e(i.id)}">${i.kind==='proposal'?'Revisar repasse':i.kind==='question'?'Responder à pergunta':'Revisar sugestão'} →</button></article>`;
 }).join('')||`<p class="office-copy">${!a?.complete?'A lista de conversas está indisponível nesta consulta.':activityFilter==='team'?'Nenhum chamado está aguardando a equipe nesta seleção.':activityFilter==='owner'?'Nenhum assunto depende de '+e(own)+' nesta seleção.':'Nenhum registro nesta seleção.'}</p>`}
 ${activityFilter==='closed'?'<p class="rule-note">Mostrando até os 20 acompanhamentos encerrados mais recentes. O histórico completo permanece em cada conversa.</p>':''}`;
}
function summaryPanel(list:any[]) {
  const late=list.filter(t=>t.deadline_flags.length).length;
  const questions=data.questions.filter((q:any)=>q.state==='open');
  const proposals=data.proposals.filter((p:any)=>p.state==='pending');
  const scoped=!!(person||department||agentFilter),visible=scoped?questions.filter((q:any)=>list.some(t=>t.client_id===q.client_id)):questions;
  return `${!person?`<div class="panel-roster"><div class="section-label">ESCOLHA QUEM ACOMPANHAR</div><div>${people().filter((p:any)=>(!department||p.department===department)&&(!agentFilter||p.active_states?.includes(agentFilter))).map((p:any)=>`<button data-person="${e(p.id)}"><span class="mini-avatar" style="--accent:${areas().find((d:any)=>d.id===p.department).color}">${e(p.initials)}</span>${e(p.first_name)}</button>`).join('')}</div></div>`:''}<div class="section-label">CONFERÊNCIA DA FILA</div><article class="insight ${late?'':'resolved'}"><div class="insight-kicker">Leitura dos registros · ${stamp(data.office.queried_at)}</div><h3>${late?`${late} tarefa(s) com prazo registrado vencido`:'Fila consultada no Planeje'}</h3><p>${person?'Este agente acompanha as tarefas atribuídas a essa pessoa.':'O Atlas relaciona equipe, clientes e tarefas no mesmo escritório.'} Alterações de tarefas continuam sob seu controle.</p></article>
    ${visible.length?`<div class="content-title">Atlas precisa de você <span>${visible.length}</span></div>${visible.slice(0,3).map((q:any)=>`<button class="question-shortcut" data-client="${e(q.client_id)}"><strong>${e(clientName(q.client_id))}</strong><span>${e(q.question)}</span><small>Responder e guardar no cliente →</small></button>`).join('')}`:''}
    ${proposals.length?`<button class="pending-shortcut" data-action="proposals">${proposals.length} proposta(s) para você aprovar →</button>`:''}
    <button class="pending-shortcut" data-action="calls">Chamados do Atlas · ${officeActivityEntries(data).length} assunto(s) em aberto →</button><div class="content-title">Tarefas em foco <button class="subtle-button" data-tab="tasks">Ver ${list.length} tarefas →</button></div>${list.slice(0,4).map(taskCard).join('')||'<p class="office-copy">Sem tarefas em aberto para esta seleção.</p>'}
    ${data.events_enabled?`<div class="content-title">Leitura por acontecimentos</div><p class="office-copy">Mensagens e mudanças entram na fila; análises automáticas no expediente, com contexto e fontes. ${data.events_config?.mode==='assist'?'Perguntas internas habilitadas nos clientes selecionados.':'Sugestões para sua revisão, sem chamados automáticos.'}</p>${data.events_config?`<div class="usage-card"><span>${Number(data.events_config.used_tokens+(data.events_config.legacy_tokens||0)).toLocaleString('pt-BR')} / ${Number(data.events_config.max_tokens_per_day).toLocaleString('pt-BR')} tokens no dia</span><span>${Number(data.events_config.model_calls)} tentativa(s) de análise hoje · sem limite de 12 análises</span></div>`:'<p class="office-warning">Consumo indisponível nesta consulta. Abra as configurações para conferir.</p>'}<button class="text-button" data-action="settings">Configurar consumo e leitura →</button><p class="rule-note">Grupos + escritório. Conversa, ditado e transcrição têm registros próprios. Personagens não representam presença humana.</p>`:`<div class="content-title">Acompanhamento econômico</div><p class="office-copy">Conferência dos registros a cada 10 minutos, seg–sex, 8h–17h. IA só para mudanças relevantes e pedidos seus.</p>`}`;
}
function render() {
  const mission=liveOfficeMissions(data?.manager_activity);
  const missionStrip=data?.manager_activity?`<div class="mission-stream" aria-label="Consultas de IA no escritório"><span class="mission-stream-label">Atlas e especialistas de IA</span>${!mission.fresh?'<span>Conferindo conexão das consultas…</span>':mission.workers.length?mission.workers.map((w:any)=>`<button type="button" data-mission="${e(w.job_id)}" title="Abrir passos desta consulta"><i></i><strong>${e(w.name)}</strong><span>${e(w.text)}</span></button>`).join(''):`<span>${mission.running?'Iniciando consulta…':mission.waiting_team?'Aguardando retorno da equipe':mission.queued?'Consultas na fila':'Nenhuma consulta em execução agora'}</span>`}<button type="button" class="mission-stream-talk" data-action="conversation">Falar com Atlas ↗</button></div>`:'';
  if(!data)return;
  const panelKey=[tab,client,person,department,agentFilter,activityFilter].join('/');
  const scroll=panelKey===lastPanelKey?(app.querySelector<HTMLElement>('#office-detail')?.hidden?savedPanelScroll:app.querySelector('.panel-content')?.scrollTop||0):0;
  savedPanelScroll=scroll;
  const focused=document.activeElement instanceof HTMLTextAreaElement||document.activeElement instanceof HTMLInputElement?{id:document.activeElement.id,start:document.activeElement.selectionStart,end:document.activeElement.selectionEnd}:null;
  const ps=people(),ds=areas(),current=ps.find((p:any)=>p.id===person),area=ds.find((d:any)=>d.id===department),c=clients().find((c:any)=>c.id===client);
  const list=filteredTasks(),active=list.filter((t:any)=>!t.done),q=data.questions.filter((q:any)=>q.state==='open'),props=data.proposals.filter((p:any)=>p.state==='pending');
  const houseView=tab==='clients'&&!client,houseList=houseView?officeClientCards(data,{operation,search:clientSearch}):[];
  const agents=agentStates(),selectedState=OFFICE_AGENT_STATES.find(s=>s.id===agentFilter);
  const visible=ps.filter((p:any)=>(!department||p.department===department)&&(!agentFilter||p.active_states?.includes(agentFilter)));
  const resting=ps.filter((p:any)=>p.resting).length;
  const service=data.config?.enabled?'Atlas disponível':'Análises pausadas';
  const clockHint=`${visualClock.phase} · São Paulo · ${visualClock.businessTime?'Equipe no expediente':'Equipe fora do expediente'}. Seu atendimento manual está disponível em qualquer horário.`;
  app.classList.toggle('left-collapsed',leftCollapsed);app.classList.toggle('right-collapsed',rightCollapsed);
  app.innerHTML=`<header class="topbar"><button class="brand" data-action="overview" aria-label="Atlas, visão geral"><picture class="planeje-logo"><source media="(max-width:1000px)" srcset="${asset}brand/simbolo.png"><img src="${asset}brand/logo-horizontal.png" alt="Planeje"></picture><span class="brand-module">Atlas<small>ESCRITÓRIO DA AGÊNCIA</small></span></button><nav class="main-nav"><button class="nav-item ${tab==='summary'?'active':''}" data-action="overview">▦ Escritório</button><button class="nav-item ${tab==='clients'?'active':''}" data-action="clients">Clientes <b>${clients().length}</b></button><button class="nav-item ${tab==='tasks'?'active':''}" data-action="all-tasks">Tarefas <b>${data.office.tasks.length}</b></button><button class="nav-item office-calls-nav" data-action="calls">Chamados <b>${officeActivityEntries(data).length}</b></button></nav><div class="office-header-actions"><div class="preview-label owner-available" title="${e(clockHint)}"><span></span>${service}</div><button class="office-header-button office-refresh" data-action="refresh" aria-label="Atualizar escritório" title="Atualizar escritório" ${pending||audioBusy()?'disabled':''}>↻</button><button class="office-header-button office-settings" data-action="settings" aria-label="Configurações do Atlas" title="Configurações do Atlas">⚙ <span>Configurar</span></button><button class="office-header-button office-conversation" data-action="conversation" aria-label="Conversar com Atlas">Conversa</button><button class="office-header-button office-work-open" data-action="work" aria-pressed="${tab==='work'}"><span class="work-label-wide">Trabalhar agora</span><span class="work-label-short">Trabalhar</span></button><button class="office-header-button office-expand" data-action="expand" aria-pressed="${expanded}" title="${expanded?'Voltar ao tamanho normal (Esc)':'Usar toda a tela'}"><span aria-hidden="true">${expanded?'↙':'⛶'}</span>${expanded?'Reduzir':'Ampliar'}</button></div></header>
    <div class="demo-ribbon">${data.test_fixture?'Teste isolado · dados fictícios':'Dados reais do Planeje'} · ${stamp(data.office.queried_at)}<span>${e(taskRule())}</span><button class="office-mobile-refresh" data-action="refresh" ${pending||audioBusy()?'disabled':''}>Atualizar ↻</button></div>
    <section class="agent-overview" aria-label="Resumo dos agentes">${missionStrip}<div class="agent-roster-caption"><strong>${agents.total} acompanhamentos da equipe</strong><span>${resting?`${resting} fora do expediente · filas por pessoa`:'Filas por pessoa · selecione para ver os assuntos'}</span></div><div class="agent-status-grid">${OFFICE_AGENT_STATES.map(s=>`<button data-agent-state="${s.id}" data-state="${s.id}" aria-pressed="${agentFilter===s.id}" title="${e(s.hint)}"><i></i><strong>${s.id==='team'&&!data.activity?.complete?'—':agents.counts[s.id]}</strong><span>${e(officeStateLabel(s.id,data))}</span></button>`).join('')}</div></section>
    <button class="panel-toggle panel-toggle-left" data-action="toggle-left" aria-controls="office-sidebar" aria-expanded="${!leftCollapsed}" aria-label="${leftCollapsed?'Abrir menu da equipe':'Recolher menu da equipe'}" title="${leftCollapsed?'Abrir menu da equipe':'Recolher menu da equipe'}"><span aria-hidden="true">${leftCollapsed?'›':'‹'}</span></button><button class="panel-toggle panel-toggle-right" data-action="toggle-right" aria-controls="office-detail" aria-expanded="${!rightCollapsed}" aria-label="${rightCollapsed?'Abrir acompanhamento':'Recolher acompanhamento'}" title="${rightCollapsed?'Abrir acompanhamento':'Recolher acompanhamento'}"><span aria-hidden="true">${rightCollapsed?'‹':'›'}</span></button>
    <aside id="office-sidebar" class="sidebar" ${leftCollapsed?'hidden':''}><div class="section-label">ESCRITÓRIO <span>${ds.length}</span></div><button class="department all ${!department?'selected':''}" data-action="overview">▦ <span>Visão geral<small>Equipe e operação</small></span></button>${ds.map((d:any)=>`<button class="department ${department===d.id?'selected':''}" data-department="${d.id}" style="--accent:${d.color}"><span class="area-icon">${d.mark}</span><span>${d.name}<small>${d.brief}</small></span><span class="count">${ps.filter((p:any)=>p.department===d.id).length}</span></button>`).join('')}<button class="department client-house-link ${tab==='clients'?'selected':''}" data-action="house"><span class="area-icon">⌂</span><span>Casa dos clientes<small>JB Apex · Ápice Noivas</small></span><span class="count">${clients().length}</span></button><div class="sidebar-divider"></div><div class="section-label">AGENTES POR PESSOA <span>${visible.length}</span></div><div class="people-list">${visible.map((p:any)=>`<button class="person ${person===p.id?'selected':''}" data-person="${e(p.id)}"><span class="avatar" style="--accent:${ds.find((d:any)=>d.id===p.department).color}">${e(p.initials)}</span><span>${e(p.first_name)}<small>${e(p.role)}</small><small class="person-agent-state" data-state="${p.agent_status}">${p.resting?'☾ Em descanso'+(p.agent_status==='paused'?'':' · '+e(p.agent_label)):'● '+e(p.agent_label)}</small></span><span class="person-chevron">›</span></button>`).join('')}</div><div class="sidebar-note"><p>Um agente por pessoa.<br><strong>O Atlas conecta os clientes.</strong></p></div><div class="source-credit">Salas agrupadas pelas funções<br>e tarefas registradas no Planeje.<br>Visual Habblaud · <a href="${import.meta.env.BASE_URL}LICENSE.txt" target="_blank">MIT</a></div></aside>

    <div class="map-tools"><button data-action="zoom-in" aria-label="Aproximar">+</button><button data-action="zoom-out" aria-label="Afastar">−</button><button data-action="frame" aria-label="Enquadrar escritório">⊡</button><button data-action="find-atlas" aria-label="Encontrar Atlas no mapa" title="Encontrar Atlas no mapa">✦</button></div><div class="map-hint" ${tab==='clients'?'style="display:none"':''}>Equipe e clientes · movimento ilustrativo · arraste para explorar</div>
    <button class="mobile-open" data-action="toggle-panel">${client?'Ver cliente':current?'Ver agente de '+e(current.first_name):'Ver acompanhamento'} →</button>
    <aside id="office-detail" class="detail-panel ${mobilePanel?'mobile-expanded':''}" ${rightCollapsed?'hidden':''} aria-label="Acompanhamento do Atlas"><button class="mobile-close" data-action="toggle-panel" aria-label="Fechar acompanhamento">×</button><div class="panel-heading"><span class="atlas-symbol"><img src="${asset}brand/simbolo.png" alt=""></span><div><h2>${e(tab==='work'?'Trabalhar com Atlas':tab==='calls'?'Chamados do Atlas':c?.empresa||(current?'Atlas / '+current.first_name:tab==='clients'?'Casa dos clientes':'Atlas · Operação'))}</h2><p>${tab==='work'?'Seu atendimento em qualquer horário':client?'Memória e decisões deste cliente':current?e(current.role):houseView?'JB Apex · Ápice Noivas':`${ps.length} agentes · ${clients().length} clientes`}</p></div><span class="simulation-tag ${data.test_fixture?'':'real-tag'}">${data.test_fixture?'TESTE':'REAL'}</span></div>${tab==='work'?'':tab==='calls'?`<div class="metrics">${[['owner','Para '+ownerName(data)],['team','Equipe'],['review','Revisões']].map(([id,label])=>`<div><strong>${!data.activity?.complete&&id!=='owner'?'—':officeActivityEntries(data,{filter:id,...activityScope()}).length}</strong><span>${e(label)}</span></div>`).join('')}</div>`:`<div class="metrics"><div><strong>${houseView?houseList.length:active.length}</strong><span>${houseView?'Clientes':'Em aberto'}</span></div><div><strong>${houseView?(data.client_house?.complete?houseList.reduce((n,c)=>n+(c.demands?.length||0),0):'—'):active.filter((t:any)=>t.deadline_flags.length).length}</strong><span>${houseView?'Demandas':'Prazos vencidos'}</span></div><div><strong>${houseView?houseList.reduce((n,c)=>n+c.questions.length,0):client?data.proposals.filter((p:any)=>p.client_id===client&&p.state==='pending').length:current?1:visible.length}</strong><span>${houseView?'Perguntas':client?'Propostas':current?'Agente':'Agentes'}</span></div></div>`}<div class="panel-tabs"><button data-tab="calls" aria-selected="${tab==='calls'}">Chamados</button><button data-tab="summary" aria-selected="${tab==='summary'}">Acompanhamento</button><button data-action="clients" aria-selected="${tab==='clients'}">Clientes ${q.length?`· ${q.length} dúvida(s)`:''}</button><button data-tab="tasks" aria-selected="${tab==='tasks'}">Fila</button></div><div class="panel-content" tabindex="0" aria-label="Conteúdo do acompanhamento">${notice?`<p class="office-notice" role="status">${e(notice)}</p>`:''}${data.state?.last_error?`<p class="office-warning">${e(data.state.last_error)}</p>`:''}
    ${tab==='work'?workPanel():tab==='calls'?activityPanel():tab==='clients'?clientPanel():tab==='proposals'?`<div class="content-title">Propostas para sua aprovação</div>${props.map(proposalCard).join('')||'<p class="office-copy">Nenhuma proposta pendente.</p>'}`:tab==='tasks'?`<label class="completed-toggle"><input type="checkbox" data-action="done" ${showDone?'checked':''}>Incluir concluídas e publicadas</label><div class="content-title">${list.length} tarefas nesta seleção</div>${list.slice(0,limit).map(taskCard).join('')}${list.length>limit?`<button class="primary-button" data-action="more">Mostrar mais (${limit}/${list.length})</button>`:''}`:summaryPanel(active)}
    </div><div class="panel-footer">Última conferência do gerente: ${stamp(data.state?.last_scan_at)}</div></aside><div class="event-toast" role="status">${e(data.state?.last_error?'Conferência com pendência; consulte as datas das fontes.':q.length?`${q.length} orientação(ões) aguardando você · ${props.length} proposta(s) para aprovar`:taskRule())}</div>`;
  lastPanelKey=panelKey;
  const panel=app.querySelector('.panel-content');if(panel)panel.scrollTop=scroll;
  if(focused&&!rightCollapsed){const field=document.getElementById(focused.id);if((field instanceof HTMLTextAreaElement||field instanceof HTMLInputElement)&&!field.disabled){field.focus({preventScroll:true});field.setSelectionRange(focused.start,focused.end);}}
  insets();
}
function reframe(){const selection=world.getSelection();if(selection)world.select(selection,{focus:true});else world.overview();}
function insets(){
 const narrow=innerWidth<=1000,header=app.querySelector('.agent-overview')?.getBoundingClientRect(),side=app.querySelector('.sidebar')?.getBoundingClientRect(),panel=app.querySelector('.detail-panel')?.getBoundingClientRect();
 world.setViewInsets?.(narrow?{top:(!leftCollapsed&&side?.bottom?side.bottom:header?.bottom||200)+48,bottom:150,left:10,right:10}:{top:(header?.bottom||152)+16,bottom:92,left:(leftCollapsed?0:side?.width||220)+52,right:(rightCollapsed?0:panel?.width||380)+68});
}
function openHouse(focus=false){cancelDictation();agentFilter=null;client=null;person=null;department=null;tab='clients';mobilePanel=true;rightCollapsed=false;confirmation=null;render();world.select({type:'landmark',id:'clients-house'});if(focus)world.focusLandmark?.('clients-house');}
function choosePerson(id:string,focus=true){cancelDictation();agentFilter=null;const p=people().find((p:any)=>p.id===id);if(!p)return;person=id;department=p.department;client=null;tab=['waiting','team','approval'].includes(p.agent_status)?'calls':'summary';activityFilter=p.agent_status==='team'?'team':'owner';rightCollapsed=false;mobilePanel=true;confirmation=null;render();if(focus)world.select({type:'agent',id},{focus:true});}
app.addEventListener('input',event=>{const el=event.target as HTMLTextAreaElement;if(el.id==='office-client-search'){clientSearch=el.value;render();return;}if(el.name==='answer'){const form=el.closest('form');if(form?.dataset.question){drafts[form.dataset.question]=el.value;const save=form.querySelector<HTMLButtonElement>('button[type=submit]');if(save)save.disabled=!!pending||audioBusy()||el.value.length>3000;}}});
app.addEventListener('submit',event=>{const form=(event.target as HTMLElement).closest('form');if(!form?.dataset.question)return;event.preventDefault();send('answer_question',{question_id:form.dataset.question,answer:drafts[form.dataset.question]||''});});
app.addEventListener('click',event=>{
  const b=(event.target as HTMLElement).closest<HTMLButtonElement>('button');if(!b||b.disabled)return;
  if(b.dataset.mission){send('open_mission',{job_id:b.dataset.mission});return;}
  if(b.dataset.action==='toggle-left'||b.dataset.action==='toggle-right'){const left=b.dataset.action==='toggle-left';if(left)leftCollapsed=!leftCollapsed;else rightCollapsed=!rightCollapsed;render();reframe();app.querySelector<HTMLButtonElement>(left?'[data-action=toggle-left]':'[data-action=toggle-right]')?.focus({preventScroll:true});return;}
  if(b.dataset.action==='expand'){window.parent.postMessage({type:'atlas-office:toggle-expand'},location.origin);return;}
  if(b.dataset.action==='settings'){cancelDictation();send('open_settings');return;}
  if(b.dataset.action==='conversation'){cancelDictation();send('open_conversation');return;}
  if(b.dataset.record){audioQuestion=b.dataset.record;recorder.start();return;}
  if(b.dataset.audioStop){recorder.stop();return;}
  if(b.dataset.audioRetry){recorder.retry();return;}
  if(b.dataset.action==='cancel-audio'){cancelDictation();render();return;}
  if(b.dataset.operation){operation=b.dataset.operation;render();return;}
  if(b.dataset.clientHub){send('open_client',{client_id:b.dataset.clientHub,tab:b.dataset.clientTab});return;}
  if(b.dataset.callFilter){activityFilter=b.dataset.callFilter;render();return;}
  if(b.dataset.thread){send('open_team_thread',{thread_id:b.dataset.thread});return;}
  if(b.dataset.ownerItem){const item=officeOwnerItems(data).find(i=>i.id===b.dataset.ownerItem);if(!item)return;if(item.demand_id){send('open_demand',{client_id:item.client_id,demand_id:item.demand_id});return;}if(item.kind==='thread'){send('open_team_thread',{thread_id:item.source_id});return;}cancelDictation();agentFilter=null;person=null;department=null;client=item.client_id;tab='clients';render();return;}
  if(b.dataset.agentState){rightCollapsed=false;cancelDictation();agentFilter=agentFilter===b.dataset.agentState?null:b.dataset.agentState;department=null;person=null;client=null;tab=['waiting','team','approval'].includes(b.dataset.agentState)?'calls':'summary';activityFilter=b.dataset.agentState==='team'?'team':'owner';mobilePanel=true;render();return;}
  if(b.dataset.person||b.dataset.department||b.dataset.client||b.dataset.tab||['overview','clients','all-tasks','proposals'].includes(b.dataset.action||'')){rightCollapsed=false;cancelDictation();agentFilter=null;}
  if(b.dataset.person){choosePerson(b.dataset.person);return;}
  if(b.dataset.department){department=b.dataset.department;person=null;client=null;tab='summary';render();world.select({type:'room',id:department},{focus:true});return;}
  if(b.dataset.client){client=b.dataset.client;person=null;department=null;tab='clients';mobilePanel=true;confirmation=null;render();return;}
  if(b.dataset.task){send('open_task',{task_id:b.dataset.task});return;}
  if(b.dataset.workAnalyze){send('request_analysis',{client_id:b.dataset.workAnalyze});return;}
  if(b.dataset.analyze){send('request_analysis',{client_id:b.dataset.analyze});return;}
  if(b.dataset.confirm){confirmation=b.dataset.confirm;render();return;}
  if(b.dataset.approve||b.dataset.reject){send('decide_proposal',{proposal_id:b.dataset.approve||b.dataset.reject,approve:!!b.dataset.approve,confirmed:true});return;}
  if(b.dataset.tab){tab=b.dataset.tab;limit=50;render();return;}
  switch(b.dataset.action){
    case 'work':cancelDictation();workClient=client||workClient;person=null;department=null;client=null;agentFilter=null;tab='work';mobilePanel=true;rightCollapsed=false;render();break;
    case 'calls':cancelDictation();person=null;client=null;department=null;agentFilter=null;activityFilter='all';tab='calls';mobilePanel=true;rightCollapsed=false;render();break;
    case 'overview':person=null;client=null;department=null;tab='summary';mobilePanel=false;render();world.select(null);world.overview();break;
    case 'client-motion':clientMotionPaused=!clientMotionPaused;render();break;
    case 'house':openHouse(true);break;
    case 'clients':openHouse(false);break;
    case 'proposals':tab='proposals';mobilePanel=true;render();break;
    case 'all-tasks':client=null;person=null;department=null;tab='tasks';limit=50;mobilePanel=true;render();break;
    case 'refresh':send('refresh');break;
    case 'toggle-panel':rightCollapsed=false;mobilePanel=b.classList.contains('mobile-open');render();break;
    case 'cancel-confirm':confirmation=null;render();break;
    case 'more':limit+=50;render();break;
    case 'find-atlas':world.select({type:'landmark',id:'atlas-manager'},{focus:true});break;
    case 'zoom-in':world.zoomBy(1.25);break;case 'zoom-out':world.zoomBy(.8);break;case 'frame':world.overview();break;
  }
});
app.addEventListener('change',event=>{const el=event.target as HTMLInputElement;if(el.id==='office-work-client'){workClient=el.value;render();document.getElementById('office-work-client')?.focus({preventScroll:true});return;}if(el.dataset.action==='done'){showDone=el.checked;limit=50;render();}});
world.onSelect(s=>{if(!data)return;if(s?.type==='landmark'&&s.id==='atlas-manager'){if(s.target==='conversation'){send('open_conversation');world.select(null);}else if(s.target?.startsWith('mission:')){send('open_mission',{job_id:s.target.slice(8)});world.select(null);}else if(s.target&&s.target!=='calls'){send('open_team_thread',{thread_id:s.target});world.select(null);}else if(s.target==='calls'){cancelDictation();person=null;client=null;department=null;agentFilter=null;activityFilter='all';tab='calls';mobilePanel=true;rightCollapsed=false;render();world.select(null);}return;}if(s?.type==='landmark'&&s.id==='clients-house'){if(s.target&&clients().some((c:any)=>c.id===s.target)){cancelDictation();agentFilter=null;person=null;department=null;client=s.target;tab='clients';mobilePanel=true;rightCollapsed=false;confirmation=null;render();}else if(tab!=='clients'||client)openHouse(false);return;}if(s?.type==='agent'&&s.id.startsWith('atlas-ia:')){const worker=liveOfficeMissions(data.manager_activity).workers.find((w:any)=>w.id===s.id);if(worker)send('open_mission',{job_id:worker.job_id});return;}if(s?.type==='agent'&&s.id!==person)choosePerson(s.id,false);if(s?.type==='room'&&areas().some((d:any)=>d.id===s.id)&&s.id!==department){cancelDictation();rightCollapsed=false;mobilePanel=true;agentFilter=null;department=s.id;person=null;client=null;tab='summary';render();}});
window.addEventListener('message',event=>{
  if(event.origin!==location.origin||event.source!==window.parent||!event.data||typeof event.data!=='object')return;
  if(event.data.type==='atlas-office:snapshot'){
    if(audioQuestion&&!event.data.value?.questions?.some((q:any)=>q.id===audioQuestion&&q.state==='open'))cancelDictation();
    expanded=event.data.expanded===true;
    data=event.data.value;if(!data?.office?.complete||!Array.isArray(data.office.profiles)||!Array.isArray(data.office.tasks))return;
    if(!client&&event.data.client_id&&data.office.clients.some((c:any)=>c.id===event.data.client_id)){client=event.data.client_id;tab='clients';mobilePanel=true;}
    syncWorld();render();
  }
  if(event.data.type==='atlas-office:result'&&event.data.request_id===pending){
    pending=null;confirmation=null;
    if(audioRequest===event.data.request_id){audioRequest=null;if(typeof event.data.transcript==='string'&&event.data.question_id===audioQuestion){const id=audioQuestion!;drafts[id]=(drafts[id]?.trim()?drafts[id]+'\n':'')+event.data.transcript;audioQuestion=null;notice=event.data.message;recorder.complete();}else{const error:any=new Error(event.data.error||'Não foi possível transcrever.');error.retryNewRequest=!!event.data.retry_new_request;recorder.fail(error);}}
    else notice=event.data.error||event.data.message||'Concluído.';render();
  }
});
window.addEventListener('keydown',event=>{if(event.key==='Escape'&&expanded)window.parent.postMessage({type:'atlas-office:collapse'},location.origin);});
const visualTimer=setInterval(()=>{if(!document.hidden){syncWorld();if(data)render();}},15000);
window.addEventListener('visibilitychange',()=>{if(!document.hidden){syncWorld();if(data)render();}});
window.addEventListener('resize',insets);window.addEventListener('pagehide',()=>{clearInterval(visualTimer);cancelDictation();recorder.destroy();world.destroy();},{once:true});
window.parent.postMessage({type:'atlas-office:ready'},location.origin);
if(window.parent===window)app.innerHTML='<div class="opening">Abra este escritório pelo Atlas dentro do Planeje. O acesso aos dados exige sua sessão autorizada.</div>';
